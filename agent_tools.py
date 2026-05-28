"""
Agent Tools — Function Calling untuk Agent Office
Memberikan "tangan" dan "mata" ke setiap agent agar bisa berinteraksi dengan sistem.

Flow:
1. User kirim perintah ke agent
2. AI merespon — jika ingin pakai tool, respon dalam format [TOOL_CALL]
3. Backend parse, eksekusi tool, kirim hasilnya balik ke AI
4. AI merespon lagi dengan hasil tool sebagai konteks
"""

import json
import re
import os
import sys
import subprocess
import importlib
import requests
import asyncio
import time as _time
import httpx
import agent_logger
from dotenv import load_dotenv

# --- MCP CLIENT ---
from mcp_client import mcp_registry

load_dotenv()

# ============================================================
# MULTI-MODEL FALLBACK — AlphaEvolve Model Chain
# ============================================================
# Urutan prioritas model untuk agen Evolve:
#   1. GPT-OSS-120B (OpenRouter, gratis)
#   2. Qwen 2.5 72B (OpenRouter)
#   3. Gemini 2.0 Flash (Google Generative AI langsung)
#   4. Ollama qwen3.5:latest (Lokal)

EVOLVE_MODEL_CHAIN = [
    {
        "provider": "openrouter",
        "model": "openai/gpt-oss-120b:free",
        "label": "GPT-OSS-120B (OpenRouter)"
    },
    {
        "provider": "openrouter",
        "model": "qwen/qwen-2.5-72b-instruct",
        "label": "Qwen 2.5 72B (OpenRouter)"
    },
    {
        "provider": "gemini",
        "model": "gemini-2.0-flash",
        "label": "Gemini 2.0 Flash (Google)"
    },
    {
        "provider": "ollama",
        "model": "qwen3.5:latest",
        "label": "Qwen 3.5 (Ollama Lokal)"
    }
]

OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"

# ============================================================
# MCP CLIENT INTEGRATION
# ============================================================
def call_mcp_tool(server_name: str, tool_name: str, args_dict: dict) -> str:
    """
    Memanggil tool dari eksternal MCP Server via registry.
    Jika gagal, otomatis fallback menggunakan search_web.
    """
    try:
        loop = asyncio.get_event_loop()
        future = asyncio.run_coroutine_threadsafe(
            mcp_registry.call_tool(server_name, tool_name, args_dict),
            loop
        )
        return future.result(timeout=30)
    except Exception as e:
        print(f"[Error MCP Call] {e}. Fallback menggunakan search_web...")
        # Fallback ke web_search biasa
        query = str(args_dict)
        try:
            from os_tools import cari_di_internet
            hasil_fallback = cari_di_internet(query)
            return f"[Error MCP Call] MCP Server '{server_name}' gagal ({e}).\n\nMenggunakan fallback pencarian web biasa:\n{hasil_fallback}"
        except Exception as e_fallback:
            return f"[Error MCP Call] {e}. Dan fallback web_search juga gagal: {e_fallback}"

def get_mcp_tools_system_prompt() -> str:
    """Mengembalikan daftar tool MCP dalam format string untuk disuntikkan ke prompt."""
    try:
        loop = asyncio.get_event_loop()
        future = asyncio.run_coroutine_threadsafe(mcp_registry.get_all_tools(), loop)
        tools = future.result(timeout=5)
        
        if not tools:
            return ""
            
        prompt = "\n# EKSTERNAL MCP TOOLS (Bisa dipanggil dengan format [TOOL_CALL: mcp_servername_toolname(arg=...)])\n"
        for t in tools:
            desc = t.get("description", "")
            name = t.get("_full_name", t.get("name"))
            prompt += f"- {name}: {desc}\n"
        return prompt
    except Exception as e:
        return f"<!-- Gagal memuat MCP tools: {e} -->"

def _call_openrouter(messages: list, model: str, headers: dict, timeout: int = 90) -> dict:
    """Panggil OpenRouter API. Return dict {content: str} atau raise Exception."""
    payload = {"model": model, "messages": messages}
    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers=headers,
        json=payload,
        timeout=timeout
    )
    resp.raise_for_status()
    data = resp.json()
    content = data['choices'][0]['message']['content']
    if not content or not content.strip():
        raise ValueError("OpenRouter returned empty response")
    return {"content": content}


def _call_gemini(messages: list, model: str, timeout: int = 90) -> dict:
    """Panggil Google Gemini langsung via google.generativeai. Return dict {content: str}."""
    import google.generativeai as genai

    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY tidak tersedia di .env")

    genai.configure(
        api_key=api_key,
        client_options={"api_endpoint": "generativelanguage.googleapis.com"}
    )

    # Konversi messages format OpenAI -> Gemini
    system_instruction = ""
    gemini_contents = []
    for msg in messages:
        role = msg["role"]
        text = msg["content"]
        if role == "system":
            system_instruction = text
        elif role == "user":
            gemini_contents.append({"role": "user", "parts": [{"text": text}]})
        elif role == "assistant":
            gemini_contents.append({"role": "model", "parts": [{"text": text}]})

    gen_model = genai.GenerativeModel(
        model_name=model,
        system_instruction=system_instruction if system_instruction else None
    )

    response = gen_model.generate_content(
        gemini_contents,
        request_options={"timeout": timeout}
    )
    content = response.text
    if not content or not content.strip():
        raise ValueError("Gemini returned empty response")
    return {"content": content}


def _call_ollama(messages: list, model: str, timeout: int = 120) -> dict:
    """Panggil Ollama lokal via /api/chat. Return dict {content: str}."""
    from os_tools import ensure_ollama_running
    ensure_ollama_running()

    payload = {
        "model": model,
        "messages": messages,
        "stream": False
    }
    resp = requests.post(OLLAMA_CHAT_URL, json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    content = data.get("message", {}).get("content", "")
    if not content or not content.strip():
        raise ValueError("Ollama returned empty response")
    return {"content": content}


def _call_llm_with_fallback(
    messages: list,
    model_chain: list,
    headers: dict,
    agent_id: str = "unknown"
) -> str:
    """
    Coba panggil LLM sesuai urutan model_chain.
    Jika model pertama gagal, otomatis fallback ke model berikutnya.
    Return: content string dari model yang berhasil.
    """
    last_error = None

    for i, candidate in enumerate(model_chain):
        provider = candidate["provider"]
        model = candidate["model"]
        label = candidate["label"]

        try:
            print(f"[EVOLVE FALLBACK] [{i+1}/{len(model_chain)}] Mencoba: {label}...")
            agent_logger.log_activity(
                agent_id,
                f"Trying model: {label} ({i+1}/{len(model_chain)})",
                "system"
            )

            if provider == "openrouter":
                result = _call_openrouter(messages, model, headers)
            elif provider == "gemini":
                result = _call_gemini(messages, model)
            elif provider == "ollama":
                result = _call_ollama(messages, model)
            else:
                raise ValueError(f"Unknown provider: {provider}")

            # Berhasil!
            print(f"[EVOLVE FALLBACK] ✅ Berhasil dengan: {label}")
            agent_logger.log_activity(
                agent_id,
                f"✅ Model OK: {label}",
                "success"
            )
            return result["content"]

        except Exception as e:
            last_error = e
            print(f"[EVOLVE FALLBACK] ❌ Gagal ({label}): {e}")
            agent_logger.log_activity(
                agent_id,
                f"❌ Model gagal: {label} — {str(e)[:60]}",
                "error"
            )
            _time.sleep(1)  # Jeda sejenak sebelum coba model berikutnya
            continue

    # Semua model gagal
    raise RuntimeError(
        f"Semua {len(model_chain)} model gagal. Error terakhir: {last_error}"
    )
from os_tools import (
    cari_di_internet,
    baca_file,
    tulis_file,
    lihat_isi_folder,
    buat_folder,
    baca_halaman_web,
    cek_waktu,
    baca_sistem_info,
    is_safe_path,
    jalankan_python,
    jalankan_perintah_terminal,
    analisa_saham_otomatis
)
from docx_tools import create_docx, list_presets, convert_to_pdf
from PIL import ImageGrab
import io
import base64

# Desktop Pilot — Override Mode tools
from desktop_pilot import (
    desktop_click,
    desktop_type,
    desktop_press,
    desktop_hotkey,
    desktop_scroll,
    desktop_screenshot,
    get_screen_info
)
from vision_loop import vision_engine

# ============================================================
# TOOL REGISTRY — Daftar tool yang bisa dipakai agent
# ============================================================

AGENT_TOOLS = {
    "search_web": {
        "function": cari_di_internet,
        "description": "Mencari informasi di internet via DuckDuckGo",
        "param": "query pencarian (string)",
        "example": 'search_web("React vs Vue 2025")'
    },
    "web_search": {
        "function": cari_di_internet,
        "description": "Mencari informasi di internet via DuckDuckGo (Alias)",
        "param": "query pencarian (string)",
        "example": 'web_search("React vs Vue 2025")'
    },
    "read_file": {
        "function": baca_file,
        "description": "Membaca isi file di sistem lokal",
        "param": "path file (string, absolut atau relatif)",
        "example": 'read_file("./main.py")'
    },
    "file_read": {
        "function": baca_file,
        "description": "Membaca isi file di sistem lokal (Alias)",
        "param": "path file (string, absolut atau relatif)",
        "example": 'file_read("./main.py")'
    },
    "write_file": {
        "function": tulis_file,
        "description": "Menulis/membuat file baru",
        "param": "path_file|||isi_konten — pisahkan path dan konten dengan |||",
        "example": 'write_file("./hello.txt|||Hello World!")'
    },
    "list_folder": {
        "function": lihat_isi_folder,
        "description": "Melihat daftar file dan subfolder dalam sebuah folder",
        "param": "path folder (string)",
        "example": 'list_folder("./frontend/src")'
    },
    "create_folder": {
        "function": buat_folder,
        "description": "Membuat folder baru",
        "param": "nama folder (string)",
        "example": 'create_folder("./new_module")'
    },
    "read_webpage": {
        "function": baca_halaman_web,
        "description": "Scraping/membaca konten teks dari URL website atau PDF online",
        "param": "URL lengkap (string, harus http/https)",
        "example": 'read_webpage("https://docs.python.org/3/tutorial/")'
    },
    "check_time": {
        "function": cek_waktu,
        "description": "Mengecek waktu dan tanggal sistem saat ini",
        "param": "kosong",
        "example": 'check_time("")'
    },
    "system_info": {
        "function": baca_sistem_info,
        "description": "Mengecek info OS dan RAM komputer",
        "param": "kosong",
        "example": 'system_info("")'
    },
    "analyze_stock": {
        "function": analisa_saham_otomatis,
        "description": "Mengambil data saham (harga, P/E, PEG, dll) lalu memberikan analisis scorecard otomatis untuk prediksi beli/jual.",
        "param": "Simbol/ticker saham (string). Contoh: AAPL",
        "example": 'analyze_stock("AAPL")'
    },
    "screenshot": {
        "function": None,  # Special handler
        "description": "Mengambil screenshot layar pengguna saat ini",
        "param": "kosong",
        "example": 'screenshot("")'
    },
    "create_docx": {
        "function": create_docx,
        "description": "Membuat file .docx terformat (laporan, skripsi, proposal, surat, makalah). Mendukung cover page, heading, tabel, list, nomor halaman, custom font/spasi/margin.",
        "param": 'JSON string dengan struktur: {"filename": "nama.docx", "preset": "skripsi|laporan|proposal|surat|makalah|modern", "cover": {...}, "content": [...]}. Lihat contoh di bawah.',
        "example": 'create_docx(\'{"filename": "laporan.docx", "preset": "laporan", "cover": {"title": "Judul", "author": "Nama"}, "content": [{"type": "heading1", "text": "BAB I"}, {"type": "paragraph", "text": "Isi..."}]}\')',
    },
    "list_docx_presets": {
        "function": list_presets,
        "description": "Melihat daftar preset format dokumen yang tersedia (skripsi, laporan, dll) beserta detail settingnya.",
        "param": "kosong",
        "example": 'list_docx_presets("")'
    },
    "request_graph_capture": {
        "function": agent_logger.request_capture,
        "description": "Meminta sistem untuk mengambil screenshot HD dari Knowledge Graph. Gambar akan disimpan di ./data/captures/capture.png dan bisa dimasukkan ke DOCX menggunakan type: 'image' dengan text: './data/captures/capture.png'.",
        "param": "kosong",
        "example": 'request_graph_capture("")'
    },
    "analyze_graph_intelligence": {
        "function": None, # Special handler to call local API
        "description": "Mendapatkan analisis intelijen dari struktur Knowledge Graph (statistik node, hub, otoritas, top tags, dll). Sangat berguna untuk ringkasan laporan strategis.",
        "param": "kosong",
        "example": 'analyze_graph_intelligence("")'
    },
    "export_pdf": {
        "function": convert_to_pdf,
        "description": "Mengonversi file .docx yang sudah ada menjadi format .pdf. Berguna untuk laporan final yang siap dipublikasikan/dikirim.",
        "param": "path file .docx (string)",
        "example": 'export_pdf("./laporan_final.docx")'
    },
    "delegate_to_agent": {
        "function": None, # Special handler
        "description": "Memberikan tugas ke agent spesifik (soft, docs, mon, scout, analyst, content). Kamu bisa memberikan instruksi detail untuk mereka kerjakan dan mendapatkan hasilnya.",
        "param": "agent_id|||instruksi — pisahkan agent_id dan instruksi dengan |||",
        "example": 'delegate_to_agent("soft|||Buatkan arsitektur database untuk aplikasi e-commerce.")'
    },
    "run_python": {
        "function": jalankan_python,
        "description": "Menjalankan kode Python atau file .py. Sangat berguna untuk menguji kode yang baru ditulis atau melakukan perhitungan kompleks. Gunakan ini untuk mode 'Self-Evolving' (Tulis -> Jalankan -> Evaluasi).",
        "param": "konten kode python atau path file .py (string)",
        "example": 'run_python("print(1+1)")'
    },
    "run_terminal": {
        "function": jalankan_perintah_terminal,
        "description": "Menjalankan perintah terminal/shell (CMD/PowerShell). Gunakan untuk menginstal library (pip install), mengecek status git, atau menjalankan skrip sistem.",
        "param": "perintah terminal (string)",
        "example": 'run_terminal("pip install requests")'
    },
    "shell_exec": {
        "function": jalankan_perintah_terminal,
        "description": "Menjalankan perintah terminal/shell (Alias)",
        "param": "perintah terminal (string)",
        "example": 'shell_exec("pip install requests")'
    },
    "reload_module": {
        "function": None,  # Special handler
        "description": "Hot-reload modul Python yang baru saja diubah agar perubahan langsung aktif TANPA restart server. Gunakan SETELAH kamu menulis perubahan ke file .py menggunakan write_file.",
        "param": "nama modul tanpa .py (string). Modul yang bisa di-reload: os_tools, agent_tools, agent_logger, notes_engine, embedding_engine",
        "example": 'reload_module("os_tools")'
    },
    # === OVERRIDE MODE: Desktop Pilot Tools ===
    "desktop_click": {
        "function": desktop_click,
        "description": "Klik mouse di posisi layar. MEMERLUKAN KONFIRMASI USER sebelum eksekusi.",
        "param": "x,y[,button][,clicks] — koordinat, tombol (left/right/middle), jumlah klik",
        "example": 'desktop_click("500,300,left,2")'
    },
    "desktop_type": {
        "function": desktop_type,
        "description": "Mengetik teks di posisi kursor saat ini. MEMERLUKAN KONFIRMASI USER.",
        "param": "teks yang ingin diketik (string)",
        "example": 'desktop_type("Hello World")'
    },
    "desktop_press": {
        "function": desktop_press,
        "description": "Menekan tombol keyboard (enter, tab, escape, space, backspace, dll). MEMERLUKAN KONFIRMASI USER.",
        "param": "nama tombol (string)",
        "example": 'desktop_press("enter")'
    },
    "desktop_hotkey": {
        "function": desktop_hotkey,
        "description": "Menekan kombinasi tombol keyboard. MEMERLUKAN KONFIRMASI USER.",
        "param": "tombol dipisah koma. Contoh: ctrl,c atau alt,tab atau ctrl,shift,s",
        "example": 'desktop_hotkey("ctrl,c")'
    },
    "desktop_scroll": {
        "function": desktop_scroll,
        "description": "Scroll layar. Positif = atas, negatif = bawah. MEMERLUKAN KONFIRMASI USER.",
        "param": "jumlah[,x,y] — jumlah scroll dan posisi opsional",
        "example": 'desktop_scroll("-5")'
    },
    "desktop_screenshot": {
        "function": desktop_screenshot,
        "description": "Mengambil screenshot layar (penuh atau region tertentu). MEMERLUKAN KONFIRMASI USER.",
        "param": "kosong untuk full, atau x,y,w,h untuk region",
        "example": 'desktop_screenshot("") atau desktop_screenshot("100,100,800,600")'
    },
    "get_screen_info": {
        "function": get_screen_info,
        "description": "Mendapatkan info layar: resolusi dan posisi mouse saat ini. TIDAK memerlukan konfirmasi.",
        "param": "kosong",
        "example": 'get_screen_info("")'
    },
}


def get_tools_description() -> str:
    """Generate deskripsi tools untuk dimasukkan ke system prompt agent."""
    desc = "## 🔧 Available Tools\n\n"
    desc += "Kamu memiliki akses ke tools berikut. Untuk menggunakan tool, respon PERSIS dengan format:\n\n"
    desc += "```\n[TOOL_CALL]\n{\"tool\": \"nama_tool\", \"param\": \"parameter\"}\n[/TOOL_CALL]\n```\n\n"
    desc += "**PENTING:**\n"
    desc += "- Hanya gunakan tool jika memang DIBUTUHKAN untuk menjawab perintah user.\n"
    desc += "- Jika tidak perlu tool (hanya ngobrol/diskusi), jawab langsung tanpa tool call.\n"
    desc += "- Kamu boleh memanggil SATU tool per respons.\n"
    desc += "- Setelah tool selesai, kamu akan menerima hasilnya dan bisa merespon user.\n\n"
    desc += "### Daftar Tools:\n\n"
    
    for name, info in AGENT_TOOLS.items():
        desc += f"**`{name}`** — {info['description']}\n"
        desc += f"  - Parameter: {info['param']}\n"
        desc += f"  - Contoh: `{info['example']}`\n\n"
    
    desc += get_mcp_tools_system_prompt()
    
    return desc


def parse_tool_call(ai_response: str) -> dict | None:
    """Parse apakah respons AI mengandung [TOOL_CALL] block."""
    pattern = r'\[TOOL_CALL\]\s*(\{.*?\})\s*\[/TOOL_CALL\]'
    match = re.search(pattern, ai_response, re.DOTALL)
    
    if not match:
        # Check for MCP format [TOOL_CALL: name(args)]
        mcp_pattern = r'\[TOOL_CALL:\s*([a-zA-Z0-9_]+)\((.*?)\)\s*\]'
        mcp_match = re.search(mcp_pattern, ai_response)
        if mcp_match:
            return {"tool": mcp_match.group(1), "param": mcp_match.group(2), "raw_match": mcp_match.group(0), "is_mcp": True}
        return None
    
    try:
        tool_data = json.loads(match.group(1))
        tool_name = tool_data.get("tool", "")
        param = tool_data.get("param", "")
        
        if tool_name not in AGENT_TOOLS:
            return None
        
        return {"tool": tool_name, "param": param, "raw_match": match.group(0), "is_mcp": False}
    except (json.JSONDecodeError, AttributeError):
        return None


def execute_tool(tool_name: str, param: str, agent_id: str = "unknown") -> str:
    """Eksekusi tool dan return hasilnya sebagai string."""
    
    # Handle MCP Tools
    if tool_name.startswith("mcp_"):
        parts = tool_name.split("_", 2)
        if len(parts) >= 3:
            server_name = parts[1]
            t_name = parts[2]
            return call_mcp_tool(server_name, t_name, {"args": param})
        return f"[ERROR] Format tool MCP salah."

    special_tools = [
        "reload_module", "analyze_graph_intelligence", "screenshot", "generate_techdoc",
        "moodle_get_tasks", "moodle_download_task", "moodle_upload_draft"
    ]
    
    if tool_name not in AGENT_TOOLS and tool_name not in special_tools:
        return f"[ERROR] Tool '{tool_name}' tidak ditemukan."
    
    # Safety check untuk file operations
    if tool_name in ("read_file", "file_read", "write_file", "list_folder", "create_folder", "run_python"):
        check_path = param.split("|||")[0] if "|||" in param else param
        # Hanya cek path jika param terlihat seperti path
        if "/" in check_path or "\\" in check_path or check_path.endswith(".py"):
            is_safe, warning = is_safe_path(check_path)
            if not is_safe:
                return f"[BLOCKED] Akses ditolak — {warning}"
    
    # Tambahan: run_terminal butuh pengawasan ketat
    elif tool_name in ("run_terminal", "shell_exec"):
        # Perintah terminal bisa sangat berbahaya
        print(f"[SECURITY] Agent {agent_id} mencoba menjalankan perintah: {param}")
    
    # Special handler: reload_module (Hot-Reload)
    elif tool_name == "reload_module":
        allowed_modules = ["os_tools", "agent_tools", "agent_logger", "notes_engine", "embedding_engine"]
        module_name = param.strip()
        if module_name not in allowed_modules:
            return f"[BLOCKED] Modul '{module_name}' tidak diizinkan untuk di-reload. Hanya: {', '.join(allowed_modules)}"
        try:
            if module_name in sys.modules:
                mod = importlib.reload(sys.modules[module_name])
                # Update referensi di AGENT_TOOLS jika os_tools yang di-reload
                if module_name == "os_tools":
                    import os_tools as _fresh_os
                    AGENT_TOOLS["search_web"]["function"] = _fresh_os.cari_di_internet
                    AGENT_TOOLS["read_file"]["function"] = _fresh_os.baca_file
                    AGENT_TOOLS["write_file"]["function"] = _fresh_os.tulis_file
                    AGENT_TOOLS["list_folder"]["function"] = _fresh_os.lihat_isi_folder
                    AGENT_TOOLS["create_folder"]["function"] = _fresh_os.buat_folder
                    AGENT_TOOLS["read_webpage"]["function"] = _fresh_os.baca_halaman_web
                    AGENT_TOOLS["check_time"]["function"] = _fresh_os.cek_waktu
                    AGENT_TOOLS["system_info"]["function"] = _fresh_os.baca_sistem_info
                    AGENT_TOOLS["run_python"]["function"] = _fresh_os.jalankan_python
                    AGENT_TOOLS["run_terminal"]["function"] = _fresh_os.jalankan_perintah_terminal
                    AGENT_TOOLS["analyze_stock"]["function"] = _fresh_os.analisa_saham_otomatis
                print(f"[HOT-RELOAD] Modul '{module_name}' berhasil di-reload oleh agent {agent_id}!")
                return f"[SUCCESS] Modul '{module_name}' berhasil di-reload! Semua fungsi terbaru sudah aktif."
            else:
                return f"[ERROR] Modul '{module_name}' tidak ditemukan di memori. Pastikan modul sudah pernah di-import."
        except Exception as e:
            return f"[ERROR] Gagal reload modul '{module_name}': {e}"
    
    # Special handler: analyze_graph_intelligence
    elif tool_name == "analyze_graph_intelligence":
        try:
            res = requests.get("http://localhost:8000/api/system/graph-intelligence", timeout=10)
            return json.dumps(res.json(), indent=2)
        except Exception as e:
            return f"Error fetching graph intelligence: {e}"
            
    # Special handler: generate_techdoc
    elif tool_name == "generate_techdoc":
        import tech_doc_generator as tech_gen
        import uuid
        import threading
        import json
        
        try:
            # param bisa berupa JSON string dari Orchestrator
            if isinstance(param, str):
                try:
                    data = json.loads(param)
                except:
                    data = {"nama_proyek": param}
            else:
                data = param if isinstance(param, dict) else {}
                
            jenis = data.get("jenis", "semua")
            job_id = str(uuid.uuid4())
            
            t = threading.Thread(target=tech_gen.generate_techdoc_direct, args=(data, jenis, job_id))
            t.start()
            
            return f"Proses pembuatan dokumen teknis ({jenis}) sedang berjalan. Job ID: {job_id}. Pantau progress via API /api/techdoc/status/{job_id}"
        except Exception as e:
            return f"[ERROR] Gagal trigger generate_techdoc: {e}"

    # Special handlers: Moodle Automation
    elif tool_name in ["moodle_get_tasks", "moodle_download_task", "moodle_upload_draft"]:
        import moodle_automation as moodle
        import json
        import asyncio
        import threading
        
        try:
            args = json.loads(param) if isinstance(param, str) else param
            username = args.get("username", "")
            password = args.get("password", "")
            
            # Helper to run async in thread
            def run_async(coro):
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                return loop.run_until_complete(coro)

            if tool_name == "moodle_get_tasks":
                tasks = run_async(moodle.run_moodle_login_and_get_tasks(username, password))
                return f"Tasks found: {json.dumps(tasks, indent=2)}"
                
            elif tool_name == "moodle_download_task":
                task_url = args.get("task_url", "")
                path = run_async(moodle.run_moodle_download_task(username, password, task_url, "downloads"))
                return f"File downloaded to: {path}" if path else "No file downloaded."
                
            elif tool_name == "moodle_upload_draft":
                task_url = args.get("task_url", "")
                file_path = args.get("file_path", "")
                success = run_async(moodle.run_moodle_upload_draft(username, password, task_url, file_path))
                return f"Upload success: {success}"
                
        except Exception as e:
            return f"[ERROR] Moodle tool {tool_name} gagal: {e}"

    # Special handler: screenshot
    elif tool_name == "screenshot":
        try:
            img = ImageGrab.grab()
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            b64 = base64.b64encode(buffer.getvalue()).decode()
            return f"[SCREENSHOT OK] Screenshot berhasil diambil. Ukuran: {img.size[0]}x{img.size[1]} piksel. (Data gambar tersimpan di memori — deskripsikan apa yang kamu lihat jika menggunakan vision model.)"
        except Exception as e:
            return f"[ERROR] Gagal mengambil screenshot: {e}"
    
    # Special handler: delegate_to_agent
    elif tool_name == "delegate_to_agent":
        try:
            parts = param.split("|||")
            if len(parts) < 2:
                return "[ERROR] Parameter harus 'agent_id|||instruksi'"
            
            target_agent = parts[0].strip()
            instruction = parts[1].strip()
            
            print(f"[DELEGATION] {agent_id} delegating to {target_agent}: {instruction[:50]}...")
            
            # Call local API to execute command for target agent
            # Use requests.post to hit our own endpoint
            res = requests.post(
                "http://localhost:8000/api/agent/command",
                json={
                    "agent_id": target_agent,
                    "command": instruction,
                    "conversation": []
                },
                timeout=180 # Sub-tasks can take time
            )
            data = res.json()
            if data.get("status") == "berhasil":
                return f"[HASIL DELEGASI DARI {target_agent}]:\n{data.get('response')}"
            else:
                return f"[DELEGASI GAGAL]: {data.get('error')}"
        except Exception as e:
            return f"[DELEGASI ERROR]: {e}"
    
    # Execute normal tool
    tool_func = AGENT_TOOLS[tool_name]["function"]
    try:
        # Pass agent_id to search_web for focus-mode-aware searching
        if tool_name == "search_web":
            result = tool_func(param, agent_id=agent_id)
        else:
            result = tool_func(param)
        
        # --- PERPLEXITY FEATURE: SOURCE TRACKING ---
        if tool_name == "search_web":
            # Extract URLs and titles from the output
            urls = re.findall(r'URL: (https?://\S+)', str(result))
            titles = re.findall(r'Judul: ([^\n]+)', str(result))
            
            for i in range(min(len(urls), len(titles))):
                agent_logger.log_source(agent_id, titles[i].strip(), urls[i].strip())
        
        elif tool_name == "read_webpage":
            # Matching: "Isi dari https://..." or "Isi dokumen PDF dari https://..."
            url_match = re.search(r'dari (https?://\S+):', str(result))
            if url_match:
                url = url_match.group(1)
                title = url.split('/')[-1] or url # Fallback title
                agent_logger.log_source(agent_id, title, url)
        # -------------------------------------------

        # Safety check: convert to string if not already
        if result is None:
            result = f"[SUCCESS] Tool '{tool_name}' executed."
        else:
            result = str(result)

        # Truncate jika hasil terlalu panjang (max 4000 chars)
        if len(result) > 4000:
            result = result[:4000] + "\n\n... [TRUNCATED — hasil terlalu panjang, hanya 4000 karakter pertama ditampilkan]"
        return result
    except Exception as e:
        return f"[ERROR] Gagal menjalankan tool '{tool_name}': {e}"


async def validate_evolve_models(agent_id: str):
    """Melakukan tes koneksi singkat ke semua model dalam rantai fallback."""
    if agent_id != "evolve":
        return
    
    # Import genai di sini jika belum ada secara global
    import google.generativeai as genai
    
    agent_logger.info(agent_id, "🔍 Memulai validasi sistem multi-model...")
    
    for model_info in EVOLVE_MODEL_CHAIN:
        provider = model_info["provider"]
        model_name = model_info["model"]
        label = model_info["label"]
        
        status = "❌"
        detail = "Unknown error"
        
        try:
            if provider == "openrouter":
                api_key = os.getenv("OPENROUTER_API_KEY")
                if not api_key:
                    detail = "API Key tidak ditemukan"
                else:
                    async with httpx.AsyncClient() as client:
                        resp = await client.get("https://openrouter.ai/api/v1/models", 
                                              headers={"Authorization": f"Bearer {api_key}"}, 
                                              timeout=5.0)
                        if resp.status_code == 200:
                            status = "✅"
                            detail = "API Terhubung"
                        else:
                            detail = f"HTTP {resp.status_code}"
            
            elif provider == "gemini":
                api_key = os.getenv("GEMINI_API_KEY")
                if not api_key:
                    detail = "API Key tidak ditemukan"
                else:
                    genai.configure(api_key=api_key)
                    _ = genai.GenerativeModel(model_name)
                    status = "✅"
                    detail = "SDK Terkonfigurasi"
                    
            elif provider == "ollama":
                async with httpx.AsyncClient() as client:
                    try:
                        resp = await client.get("http://localhost:11434/api/tags", timeout=2.0)
                        if resp.status_code == 200:
                            models_data = resp.json().get("models", [])
                            found = any(model_name in m["name"] for m in models_data)
                            if found:
                                status = "✅"
                                detail = "Model lokal tersedia"
                            else:
                                detail = f"Model '{model_name}' belum di-pull"
                        else:
                            detail = f"Ollama HTTP {resp.status_code}"
                    except Exception:
                        # Mencoba menyalakan otomatis jika tidak berjalan
                        agent_logger.info(agent_id, "⚠️ Ollama mati. Mencoba menyalakan otomatis...")
                        try:
                            # Gunakan flag CREATE_NEW_CONSOLE agar tidak memblokir process utama di Windows
                            subprocess.Popen(["ollama", "serve"], 
                                           creationflags=subprocess.CREATE_NEW_CONSOLE if os.name == 'nt' else 0,
                                           stdout=subprocess.DEVNULL, 
                                           stderr=subprocess.DEVNULL)
                            
                            # Tunggu sebentar dan cek lagi
                            await asyncio.sleep(5)
                            try:
                                resp = await client.get("http://localhost:11434/api/tags", timeout=3.0)
                                if resp.status_code == 200:
                                    status = "✅"
                                    detail = "Model lokal (Auto-Started)"
                                else:
                                    detail = "Ollama berhasil dinyalakan tapi model belum siap"
                            except:
                                detail = "Ollama sedang booting (Silakan coba lagi sebentar lagi)"
                        except Exception as e:
                            detail = f"Ollama mati & gagal dinyalakan: {str(e)[:40]}"
                        
        except Exception as e:
            detail = f"Error: {str(e)[:50]}"
            
        agent_logger.info(agent_id, f"{status} {label}: {detail}")

    agent_logger.info(agent_id, "🚀 Validasi selesai. Memulai eksekusi...")


async def process_agent_command_with_tools(
    persona_content: str,
    messages: list,
    headers: dict,
    model: str,
    max_tool_rounds: int = 3,
    agent_id: str = "unknown",
    model_chain: list = None
) -> str:
    """
    Main loop: kirim pesan ke AI → cek tool call → execute → kirim balik.
    Maks 3 putaran tool call untuk mencegah infinite loop.
    
    Jika model_chain diberikan (khusus agen Evolve), gunakan sistem fallback
    multi-model. Jika tidak, pakai OpenRouter standar.
    """
    tools_desc = get_tools_description()
    
    # Inject tool instructions ke system prompt
    enhanced_system = (
        f"{persona_content}\n\n"
        f"Kamu sedang berada di mode 'Agent Office'. Responlah sebagai agent tersebut. "
        f"Gunakan format terminal/markdown yang bersih.\n\n"
        f"{tools_desc}"
    )
    
    # Replace system message
    working_messages = messages.copy()
    if working_messages and working_messages[0]["role"] == "system":
        working_messages[0]["content"] = enhanced_system
    else:
        working_messages.insert(0, {"role": "system", "content": enhanced_system})
    
    use_fallback = model_chain is not None and len(model_chain) > 0
    
    # Jalankan validasi jika ini adalah perintah awal untuk AlphaEvolve
    if agent_id == "evolve" and len(messages) <= 2:
        await validate_evolve_models(agent_id)
    
    for round_num in range(max_tool_rounds + 1):
        
        if use_fallback:
            # ─── EVOLVE MODE: Multi-Model Fallback ───
            ai_response = await asyncio.to_thread(
                _call_llm_with_fallback,
                working_messages,
                model_chain,
                headers,
                agent_id
            )
        else:
            # ─── STANDARD MODE: Single OpenRouter Model ───
            payload = {
                "model": model,
                "messages": working_messages
            }
            
            def _do_request():
                max_retries = 3
                last_err = None
                for i in range(max_retries):
                    try:
                        return requests.post(
                            "https://openrouter.ai/api/v1/chat/completions",
                            headers=headers,
                            json=payload,
                            timeout=90
                        )
                    except (requests.exceptions.RequestException, Exception) as e:
                        last_err = e
                        print(f"[AGENT TOOLS] API Timeout/Error (Attempt {i+1}/{max_retries}): {e}")
                        if i < max_retries - 1:
                            _time.sleep(2)  # Wait 2 seconds before retry
                # If all retries fail
                raise last_err
            
            resp = await asyncio.to_thread(_do_request)
            resp.raise_for_status()
            result = resp.json()
            ai_response = result['choices'][0]['message']['content']
        
        # Cek apakah AI ingin pakai tool
        tool_call = parse_tool_call(ai_response)
        
        if tool_call is None:
            # Tidak ada tool call — ini adalah final response
            return ai_response
        
        if round_num >= max_tool_rounds:
            # Sudah melebihi batas tool rounds
            return ai_response.replace(tool_call["raw_match"], "") + "\n\n*[Batas tool call tercapai]*"
        
        # Tentukan status yang ramah pengguna
        tool_status_map = {
            "search_web": "Sedang melakukan research web...",
            "read_file": "Sedang membaca dokumen...",
            "write_file": "Sedang menulis file...",
            "list_folder": "Sedang mengecek isi folder...",
            "create_folder": "Sedang membuat folder...",
            "read_webpage": "Sedang membaca halaman web...",
            "check_time": "Sedang mengecek waktu...",
            "system_info": "Sedang mengecek info sistem...",
            "analyze_stock": "Sedang menganalisa saham...",
            "screenshot": "Sedang mengambil tangkapan layar...",
            "create_docx": "Sedang membuat dokumen...",
            "list_docx_presets": "Sedang mengecek preset dokumen...",
            "request_graph_capture": "Sedang mengambil gambar graph...",
            "analyze_graph_intelligence": "Sedang menganalisa intelijen graph...",
            "export_pdf": "Sedang mengekspor ke PDF...",
            "delegate_to_agent": "Sedang mendelegasikan tugas ke agent lain...",
            "run_python": "Sedang menjalankan kode Python...",
            "run_terminal": "Sedang menjalankan perintah terminal...",
            "reload_module": "Sedang me-reload modul..."
        }
        status_msg = tool_status_map.get(tool_call['tool'], f"Sedang mengeksekusi {tool_call['tool']}...")
        agent_logger.set_agent_status(agent_id, status_msg)
        
        # Execute tool
        print(f"[AGENT TOOLS] Round {round_num+1}: Executing {tool_call['tool']}({tool_call['param'][:80]}...)")
        agent_logger.log_activity(agent_id, f"Using tool: {tool_call['tool']}", "tool")
        tool_result = execute_tool(tool_call["tool"], tool_call["param"], agent_id=agent_id)
        
        # Log tool result status
        if tool_result.startswith("[ERROR]") or tool_result.startswith("[BLOCKED]"):
            agent_logger.log_activity(agent_id, f"Tool failed: {tool_result[:60]}", "error")
        else:
            agent_logger.log_activity(agent_id, f"Tool OK: {tool_call['tool']} completed", "success")
        
        agent_logger.set_agent_status(agent_id, "Sedang memproses hasil...")
        
        # Tambahkan AI response + tool result ke conversation
        # Hapus TOOL_CALL block dari response yang ditampilkan
        clean_response = ai_response.replace(tool_call["raw_match"], "").strip()
        
        working_messages.append({"role": "assistant", "content": ai_response})
        working_messages.append({
            "role": "user", 
            "content": f"[TOOL_RESULT dari {tool_call['tool']}]:\n{tool_result}\n\nGunakan hasil di atas untuk merespon user. Jangan ulangi tool call yang sama."
        })
    
    return ai_response
