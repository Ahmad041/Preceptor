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
import requests
import asyncio
import agent_logger
from os_tools import (
    cari_di_internet,
    baca_file,
    tulis_file,
    lihat_isi_folder,
    buat_folder,
    baca_halaman_web,
    cek_waktu,
    baca_sistem_info,
    is_safe_path
)
from docx_tools import create_docx, list_presets, convert_to_pdf
from PIL import ImageGrab
import io
import base64

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
    "read_file": {
        "function": baca_file,
        "description": "Membaca isi file di sistem lokal",
        "param": "path file (string, absolut atau relatif)",
        "example": 'read_file("./main.py")'
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
    }
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
    
    return desc


def parse_tool_call(ai_response: str) -> dict | None:
    """Parse apakah respons AI mengandung [TOOL_CALL] block."""
    pattern = r'\[TOOL_CALL\]\s*(\{.*?\})\s*\[/TOOL_CALL\]'
    match = re.search(pattern, ai_response, re.DOTALL)
    
    if not match:
        return None
    
    try:
        tool_data = json.loads(match.group(1))
        tool_name = tool_data.get("tool", "")
        param = tool_data.get("param", "")
        
        if tool_name not in AGENT_TOOLS:
            return None
        
        return {"tool": tool_name, "param": param, "raw_match": match.group(0)}
    except (json.JSONDecodeError, AttributeError):
        return None


def execute_tool(tool_name: str, param: str, agent_id: str = "unknown") -> str:
    """Eksekusi tool dan return hasilnya sebagai string."""
    if tool_name not in AGENT_TOOLS:
        return f"[ERROR] Tool '{tool_name}' tidak ditemukan."
    
    # Safety check untuk file operations
    if tool_name in ("read_file", "write_file", "list_folder", "create_folder"):
        check_path = param.split("|||")[0] if "|||" in param else param
        is_safe, warning = is_safe_path(check_path)
        if not is_safe:
            return f"[BLOCKED] Akses ditolak — {warning}"
    
    # Special handler: analyze_graph_intelligence
    elif tool_name == "analyze_graph_intelligence":
        try:
            res = requests.get("http://localhost:8000/api/system/graph-intelligence", timeout=10)
            return json.dumps(res.json(), indent=2)
        except Exception as e:
            return f"Error fetching graph intelligence: {e}"

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


async def process_agent_command_with_tools(
    persona_content: str,
    messages: list,
    headers: dict,
    model: str,
    max_tool_rounds: int = 3,
    agent_id: str = "unknown"
) -> str:
    """
    Main loop: kirim pesan ke AI → cek tool call → execute → kirim balik.
    Maks 3 putaran tool call untuk mencegah infinite loop.
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
    
    for round_num in range(max_tool_rounds + 1):
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
                        import time
                        time.sleep(2) # Wait 2 seconds before retry
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
        
        # Execute tool
        print(f"[AGENT TOOLS] Round {round_num+1}: Executing {tool_call['tool']}({tool_call['param'][:80]}...)")
        agent_logger.log_activity(agent_id, f"Using tool: {tool_call['tool']}", "tool")
        tool_result = execute_tool(tool_call["tool"], tool_call["param"], agent_id=agent_id)
        
        # Log tool result status
        if tool_result.startswith("[ERROR]") or tool_result.startswith("[BLOCKED]"):
            agent_logger.log_activity(agent_id, f"Tool failed: {tool_result[:60]}", "error")
        else:
            agent_logger.log_activity(agent_id, f"Tool OK: {tool_call['tool']} completed", "success")
        
        # Tambahkan AI response + tool result ke conversation
        # Hapus TOOL_CALL block dari response yang ditampilkan
        clean_response = ai_response.replace(tool_call["raw_match"], "").strip()
        
        working_messages.append({"role": "assistant", "content": ai_response})
        working_messages.append({
            "role": "user", 
            "content": f"[TOOL_RESULT dari {tool_call['tool']}]:\n{tool_result}\n\nGunakan hasil di atas untuk merespon user. Jangan ulangi tool call yang sama."
        })
    
    return ai_response
