"""
docx_generator.py — AI Academic Writing Assistant untuk BOCCHI-JARVIS
Mengimplementasikan alur percakapan Asisten Penulis Akademik step-by-step.

Flow:
  1. start_session()    → Pilih jenis dokumen
  2. answer_question()  → Q&A hingga semua info terkumpul
  3. generate()         → Generate DOCX (Gemini API → fallback qwen3:8b)

Referensi: dari folder references/ (pdf, docx, txt) + Semantic Scholar API
"""

import os
import json
import time
import uuid
import asyncio
import hashlib
import requests
import traceback
from typing import Optional

# ============================================================
# KONSTANTA
# ============================================================

REFERENCES_DIR = "references"
OUTPUT_DIR = "output_docs"
OLLAMA_BASE = "http://localhost:11434"
SEMANTIC_SCHOLAR_BASE = "https://api.semanticscholar.org/graph/v1"

JENIS_DOKUMEN = ["Jurnal Ilmiah / Artikel", "Proposal Bisnis / Proyek", "Makalah", "Laporan Penelitian", "Laporan Bisnis"]
JENIS_KEY = ["jurnal", "proposal", "makalah", "laporan_penelitian", "laporan_bisnis"]

PRESET_MAP = {
    "jurnal": "modern",
    "proposal": "proposal",
    "makalah": "makalah",
    "laporan_penelitian": "laporan",
    "laporan_bisnis": "laporan",
}

# System prompt AI Penulis Akademik
SYSTEM_PROMPT = """Kamu adalah Asisten Penulis Akademik dan Profesional yang ahli dalam menyusun dokumen formal.
Tugas utamamu adalah membantu pengguna membuat berbagai jenis dokumen terstruktur.

Gaya penulisan:
- Formal, akademis, dan terstruktur rapi
- Gunakan bahasa Indonesia yang baik dan benar
- Setiap bab harus memiliki minimal 3 paragraf panjang
- Kutip referensi yang diberikan secara implisit dalam teks
- Daftar pustaka dalam format APA 7th edition

Untuk konten dokumen:
- Bab Pendahuluan: latar belakang masalah, rumusan masalah, tujuan, manfaat, ruang lingkup
- Bab Tinjauan Pustaka: teori-teori relevan berdasarkan referensi yang diberikan
- Bab Metodologi: pendekatan penelitian, teknik pengumpulan data, analisis
- Bab Pembahasan/Hasil: analisis mendalam sesuai topik
- Bab Kesimpulan: simpulan dan saran"""

# ============================================================
# SESSION MANAGER
# ============================================================

# sessions[session_id] = {
#   "mode": "standard" | "custom",
#   "jenis": "jurnal" | "proposal" | "makalah" | "laporan_penelitian" | "laporan_bisnis",
#   "step": int,
#   "data": {...},
#   "status": "collecting" | "ready" | "generating" | "done" | "error",
#   "error": str | None
# }
_sessions: dict = {}

# jobs[job_id] = {"progress": 0-100, "step": str, "done": bool, "filename": str, "error": str}
_jobs: dict = {}

# ============================================================
# PERTANYAAN PER MODE
# ============================================================

QUESTIONS_STANDARD = [
    {"key": "jenis_dok", "question": "Dokumen apa yang ingin dibuat?", "options": JENIS_DOKUMEN},
    {"key": "mode", "question": "Apakah ingin menggunakan Format Standar atau Kustomisasi?", "options": ["Format Standar", "Kustomisasi"]},
    {"key": "judul", "question": "Apa judul dokumen yang akan digunakan?", "options": []},
    {"key": "penulis", "question": "Siapa nama penulis?", "options": []},
    {"key": "nim", "question": "Apa NIM / Nomor Identitas penulis? (kosongkan jika tidak ada)", "options": []},
    {"key": "institusi", "question": "Apa nama Universitas / Instansi?", "options": []},
    {"key": "fakultas", "question": "Apa nama Fakultas / Departemen? (kosongkan jika tidak ada)", "options": []},
    {"key": "logo", "question": "Apakah ada logo yang ingin disisipkan? Sebutkan nama instansi, atau ketik 'tidak' jika tidak ada.", "options": []},
    {"key": "year_from", "question": "Batas tahun awal Daftar Pustaka? (contoh: 2019)", "options": []},
    {"key": "year_to", "question": "Batas tahun akhir Daftar Pustaka? (contoh: 2025)", "options": []},
    {"key": "max_refs", "question": "Berapa maksimal referensi yang dicari? (5-30, default: 15)", "options": []},
    {"key": "referensi_tambahan", "question": "Apakah ada referensi khusus dari file yang sudah diupload? (ketik 'ya' untuk menyertakan semua file di folder references/, atau 'tidak')", "options": ["Ya, sertakan", "Tidak perlu"]},
]

QUESTIONS_CUSTOM_EXTRA = [
    {"key": "struktur_bab", "question": "Tuliskan struktur bab dokumen kamu. Contoh:\nBab 1: Pendahuluan\n  1.1 Latar Belakang\nBab 2: Pembahasan\n  2.1 Analisis\n\nSilakan ketikkan struktur babmu:", "options": []},
    {"key": "daftar_pustaka_sendiri", "question": "Apakah kamu sudah memiliki Daftar Pustaka sendiri yang ingin digunakan, atau ingin AI yang mencarikan?", "options": ["Saya punya sendiri (upload di references/)", "AI carikan otomatis"]},
]

# ============================================================
# SESSION FUNCTIONS
# ============================================================

def start_session(session_id: str = None) -> dict:
    """Mulai sesi baru Q&A AI Penulis Akademik."""
    if not session_id:
        session_id = str(uuid.uuid4())
    
    _sessions[session_id] = {
        "step": 0,
        "mode": None,
        "jenis": None,
        "data": {},
        "questions": QUESTIONS_STANDARD.copy(),
        "status": "collecting",
        "error": None
    }
    
    first_q = _sessions[session_id]["questions"][0]
    return {
        "session_id": session_id,
        "question": first_q["question"],
        "options": first_q.get("options", []),
        "done": False,
        "progress": 0
    }

def start_custom_session(custom_data: dict, session_id: str = None) -> dict:
    """Mulai sesi kustom dengan data dari form, langsung ke tahap siap generate."""
    if not session_id:
        session_id = str(uuid.uuid4())
    
    # Mapping jenis_dok to key
    jenis_key = "laporan_penelitian"
    for i, label in enumerate(JENIS_DOKUMEN):
        if custom_data.get("jenis_dok_label", "").lower() in label.lower():
            jenis_key = JENIS_KEY[i]
            break
            
    _sessions[session_id] = {
        "step": 999,
        "mode": "custom",
        "jenis": jenis_key,
        "data": custom_data,
        "questions": [],
        "status": "ready",
        "error": None
    }
    
    return {
        "session_id": session_id,
        "done": True,
        "ready_to_generate": True,
        "message": "Semua informasi dari form kustomisasi sudah terkumpul! Klik 'Generate Dokumen' untuk memulai.",
        "summary": custom_data,
        "progress": 100
    }


def answer_question(session_id: str, answer: str) -> dict:
    """Proses jawaban user dan return pertanyaan berikutnya (atau done=True)."""
    if session_id not in _sessions:
        return {"error": "Session tidak ditemukan. Mulai sesi baru."}
    
    sess = _sessions[session_id]
    questions = sess["questions"]
    step = sess["step"]
    
    if step >= len(questions):
        return {"done": True, "session_id": session_id, "message": "Semua informasi sudah terkumpul!"}
    
    # Simpan jawaban
    current_q = questions[step]
    key = current_q["key"]
    sess["data"][key] = answer.strip()
    
    # Handle logika khusus
    if key == "jenis_dok":
        # Mapping pilihan ke key
        for i, label in enumerate(JENIS_DOKUMEN):
            if answer.strip().lower() in label.lower() or str(i+1) == answer.strip():
                sess["jenis"] = JENIS_KEY[i]
                sess["data"]["jenis_dok_label"] = label
                break
        if not sess["jenis"]:
            sess["jenis"] = "laporan_penelitian"
    
    elif key == "mode":
        if "custom" in answer.lower() or "kustom" in answer.lower() or answer.strip() == "2":
            sess["mode"] = "custom"
            # Sisipkan pertanyaan kustomisasi sebelum akhir
            sess["questions"] = QUESTIONS_STANDARD.copy() + QUESTIONS_CUSTOM_EXTRA.copy()
        else:
            sess["mode"] = "standard"
    
    elif key == "nim" and not answer.strip():
        sess["data"]["nim"] = "-"
    
    elif key == "fakultas" and not answer.strip():
        sess["data"]["fakultas"] = "-"
    
    elif key == "max_refs":
        try:
            sess["data"]["max_refs"] = max(5, min(30, int(answer.strip())))
        except ValueError:
            sess["data"]["max_refs"] = 15
    
    # Maju ke pertanyaan berikutnya
    sess["step"] = step + 1
    total = len(questions)
    
    if sess["step"] >= total:
        sess["status"] = "ready"
        return {
            "session_id": session_id,
            "done": True,
            "ready_to_generate": True,
            "message": "Semua informasi sudah terkumpul! Klik 'Generate Dokumen' untuk memulai.",
            "summary": sess["data"],
            "progress": 100
        }
    
    next_q = questions[sess["step"]]
    progress = int((sess["step"] / total) * 100)
    
    return {
        "session_id": session_id,
        "question": next_q["question"],
        "options": next_q.get("options", []),
        "done": False,
        "progress": progress
    }


def get_session(session_id: str) -> Optional[dict]:
    return _sessions.get(session_id)

# ============================================================
# REFERENCE FILE READER
# ============================================================

def read_reference_files() -> str:
    """Baca semua file referensi dari folder references/ dan return teks gabungan."""
    ref_texts = []
    
    if not os.path.exists(REFERENCES_DIR):
        return ""
    
    for subfolder in ["pdf", "docx", "txt"]:
        folder_path = os.path.join(REFERENCES_DIR, subfolder)
        if not os.path.exists(folder_path):
            continue
        
        for filename in os.listdir(folder_path):
            filepath = os.path.join(folder_path, filename)
            
            try:
                if subfolder == "txt":
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        text = f.read()
                    ref_texts.append(f"[Referensi: {filename}]\n{text[:3000]}")
                
                elif subfolder == "pdf":
                    try:
                        import pdfplumber
                        with pdfplumber.open(filepath) as pdf:
                            text = "\n".join(p.extract_text() or "" for p in pdf.pages[:5])
                        ref_texts.append(f"[Referensi PDF: {filename}]\n{text[:3000]}")
                    except ImportError:
                        try:
                            import PyPDF2
                            with open(filepath, 'rb') as f:
                                reader = PyPDF2.PdfReader(f)
                                text = " ".join(page.extract_text() or "" for page in reader.pages[:5])
                            ref_texts.append(f"[Referensi PDF: {filename}]\n{text[:3000]}")
                        except Exception:
                            ref_texts.append(f"[Referensi PDF: {filename}] (tidak dapat dibaca)")
                
                elif subfolder == "docx":
                    try:
                        from docx import Document as DocxDoc
                        doc = DocxDoc(filepath)
                        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
                        ref_texts.append(f"[Referensi DOCX: {filename}]\n{text[:3000]}")
                    except Exception:
                        ref_texts.append(f"[Referensi DOCX: {filename}] (tidak dapat dibaca)")
            
            except Exception as e:
                ref_texts.append(f"[Referensi: {filename}] Error: {e}")
    
    return "\n\n---\n\n".join(ref_texts)


def list_reference_files() -> list:
    """List semua file referensi yang sudah diupload."""
    files = []
    if not os.path.exists(REFERENCES_DIR):
        return files
    
    for subfolder in ["pdf", "docx", "txt", "images"]:
        folder_path = os.path.join(REFERENCES_DIR, subfolder)
        if not os.path.exists(folder_path):
            continue
        for filename in os.listdir(folder_path):
            filepath = os.path.join(folder_path, filename)
            files.append({
                "name": filename,
                "type": subfolder,
                "path": filepath.replace("\\", "/"),
                "size": os.path.getsize(filepath)
            })
    
    return files

# ============================================================
# SEMANTIC SCHOLAR SEARCH
# ============================================================

def search_semantic_scholar(topic: str, year_from: int = 2019, year_to: int = 2025, max_results: int = 15) -> list:
    """Cari paper akademis via Semantic Scholar API (gratis, tanpa API key)."""
    try:
        params = {
            "query": topic,
            "fields": "title,authors,year,venue,externalIds,abstract",
            "limit": min(max_results * 2, 50),  # Ambil lebih banyak untuk difilter
            "year": f"{year_from}-{year_to}"
        }
        resp = requests.get(
            f"{SEMANTIC_SCHOLAR_BASE}/paper/search",
            params=params,
            timeout=15,
            headers={"User-Agent": "BOCCHI-JARVIS/1.0 (Academic Writing Assistant)"}
        )
        resp.raise_for_status()
        data = resp.json()
        
        results = []
        for paper in data.get("data", []):
            if not paper.get("title"):
                continue
            
            authors = paper.get("authors", [])
            author_str = ", ".join(a.get("name", "") for a in authors[:3])
            if len(authors) > 3:
                author_str += " et al."
            
            doi = paper.get("externalIds", {}).get("DOI", "")
            
            results.append({
                "title": paper.get("title", ""),
                "authors": author_str,
                "year": paper.get("year", ""),
                "venue": paper.get("venue", ""),
                "abstract": (paper.get("abstract", "") or "")[:300],
                "doi": doi
            })
            
            if len(results) >= max_results:
                break
        
        return results
    
    except Exception as e:
        print(f"[DOCX] Semantic Scholar error: {e}")
        return []

# ============================================================
# AI CONTENT GENERATION
# ============================================================

def _get_gemini_api_key() -> str:
    """Ambil Gemini API key dari env atau file config."""
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        # Coba baca dari file .env
        env_path = ".env"
        if os.path.exists(env_path):
            with open(env_path, 'r') as f:
                for line in f:
                    if line.startswith("GEMINI_API_KEY="):
                        key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
    return key


def _generate_with_gemini(prompt: str, system_prompt: str = "") -> str:
    """Generate teks dengan Gemini API (gemini-2.0-flash)."""
    api_key = _get_gemini_api_key()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY tidak ditemukan")
    
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            "gemini-2.0-flash",
            system_instruction=system_prompt if system_prompt else None
        )
        response = model.generate_content(prompt)
        return response.text
    except ImportError:
        # Fallback ke REST API langsung
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "systemInstruction": {"parts": [{"text": system_prompt}]} if system_prompt else None
        }
        resp = requests.post(url, json=payload, timeout=60)
        resp.raise_for_status()
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"]


def _generate_with_qwen(prompt: str, system_prompt: str = "") -> str:
    """Generate teks dengan qwen3:8b via Ollama (fallback lokal)."""
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    
    resp = requests.post(
        f"{OLLAMA_BASE}/api/chat",
        json={
            "model": "qwen3:8b",
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0.7, "num_predict": 2000}
        },
        timeout=300
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"]


def generate_content(prompt: str, system_prompt: str = "") -> str:
    """
    Generate teks menggunakan AI:
    1. Coba Gemini API dulu
    2. Fallback ke qwen3:8b Ollama jika Gemini gagal
    """
    # Coba Gemini API
    try:
        result = _generate_with_gemini(prompt, system_prompt)
        if result and len(result.strip()) > 10:
            return result
    except Exception as e:
        print(f"[DOCX] Gemini gagal: {e} -- Switching ke qwen3:8b...")
    
    # Fallback: qwen3:8b
    try:
        result = _generate_with_qwen(prompt, system_prompt)
        return result
    except Exception as e:
        raise RuntimeError(f"Semua model AI gagal: {e}")

# ============================================================
# DOCUMENT STRUCTURE GENERATION
# ============================================================

def _format_references_list(papers: list) -> str:
    """Format daftar paper menjadi teks referensi."""
    if not papers:
        return "Tidak ada referensi ditemukan."
    
    lines = []
    for p in papers:
        authors = p.get("authors", "Unknown Author")
        year = p.get("year", "n.d.")
        title = p.get("title", "Untitled")
        venue = p.get("venue", "")
        doi = p.get("doi", "")
        
        ref = f"{authors} ({year}). {title}."
        if venue:
            ref += f" {venue}."
        if doi:
            ref += f" https://doi.org/{doi}"
        lines.append(ref)
    
    return "\n".join(f"{i+1}. {line}" for i, line in enumerate(lines))


def generate_outline(sess_data: dict, ref_titles: str) -> list:
    """Generate outline bab dari data sesi + referensi."""
    judul = sess_data.get("judul", "")
    jenis = sess_data.get("jenis_dok_label", "Laporan")
    
    # Kalau custom dan punya struktur_bab, parse manual
    if sess_data.get("struktur_bab"):
        return _parse_custom_structure(sess_data["struktur_bab"])
    
    # Generate outline otomatis
    prompt = f"""Buat outline dokumen {jenis} dengan judul: "{judul}"

Referensi yang tersedia:
{ref_titles[:500]}

Buat outline dalam format JSON list seperti ini (tanpa markdown, hanya JSON):
[
  {{"judul_bab": "BAB I PENDAHULUAN", "subbab": ["1.1 Latar Belakang", "1.2 Rumusan Masalah", "1.3 Tujuan", "1.4 Manfaat"]}},
  {{"judul_bab": "BAB II TINJAUAN PUSTAKA", "subbab": ["2.1 Teori A", "2.2 Teori B"]}},
  ...
]

Buat 5 bab yang sesuai dengan jenis dokumen {jenis}. Hanya JSON, tanpa penjelasan lain."""
    
    try:
        raw = generate_content(prompt)
        # Ekstrak JSON dari response
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start != -1 and end > start:
            outline = json.loads(raw[start:end])
            return outline
    except Exception as e:
        print(f"[DOCX] Gagal generate outline: {e}")
    
    # Fallback outline standar
    return [
        {"judul_bab": "BAB I PENDAHULUAN", "subbab": ["1.1 Latar Belakang", "1.2 Rumusan Masalah", "1.3 Tujuan Penelitian", "1.4 Manfaat Penelitian"]},
        {"judul_bab": "BAB II TINJAUAN PUSTAKA", "subbab": ["2.1 Landasan Teori", "2.2 Kajian Literatur", "2.3 Kerangka Pemikiran"]},
        {"judul_bab": "BAB III METODOLOGI", "subbab": ["3.1 Pendekatan Penelitian", "3.2 Teknik Pengumpulan Data", "3.3 Analisis Data"]},
        {"judul_bab": "BAB IV PEMBAHASAN", "subbab": ["4.1 Hasil Temuan", "4.2 Analisis", "4.3 Diskusi"]},
        {"judul_bab": "BAB V PENUTUP", "subbab": ["5.1 Kesimpulan", "5.2 Saran"]},
    ]


def _parse_custom_structure(struktur_text: str) -> list:
    """Parse teks struktur bab dari user menjadi list outline."""
    lines = [l.strip() for l in struktur_text.strip().split("\n") if l.strip()]
    bab_list = []
    current_bab = None
    
    for line in lines:
        lower = line.lower()
        if lower.startswith("bab ") or (line[0].isdigit() and "." not in line[:3]):
            if current_bab:
                bab_list.append(current_bab)
            current_bab = {"judul_bab": line.upper(), "subbab": []}
        elif current_bab and (line[0].isdigit() or line.startswith("-") or line.startswith("*")):
            subbab = line.lstrip("-* \t")
            current_bab["subbab"].append(subbab)
    
    if current_bab:
        bab_list.append(current_bab)
    
    return bab_list if bab_list else generate_outline({}, "")


def generate_chapter_content(judul_bab: str, subbab_list: list, judul_dok: str, ref_context: str) -> str:
    """Generate isi satu bab menggunakan AI."""
    subbab_str = "\n".join(f"- {s}" for s in subbab_list)
    
    prompt = f"""Tulis isi {judul_bab} untuk dokumen berjudul: "{judul_dok}"

Subbab yang harus ada:
{subbab_str}

Referensi yang tersedia untuk dikutip:
{ref_context[:1500]}

Instruksi:
- Tulis setiap subbab dengan heading dan minimal 3 paragraf
- Gunakan bahasa Indonesia formal dan akademis
- Setiap paragraf minimal 100 kata
- Integrasikan referensi secara natural dalam teks
- Jangan gunakan bullet point, tulis dalam bentuk paragraf
- Format: heading subbab lalu paragraf, langsung tulis konten"""
    
    return generate_content(prompt, SYSTEM_PROMPT)

# ============================================================
# DOCX ASSEMBLY
# ============================================================

def assemble_docx(session_id: str, job_id: str):
    """
    Fungsi utama: Generate dan rakit DOCX berdasarkan sesi.
    Update _jobs[job_id] untuk tracking progress.
    """
    from docx_tools import create_docx
    
    sess = _sessions.get(session_id)
    if not sess:
        _jobs[job_id] = {"progress": 0, "step": "Session tidak ditemukan", "done": True, "error": "Session tidak ditemukan"}
        return
    
    data = sess["data"]
    
    try:
        _update_job(job_id, 5, "Membaca referensi dari folder references/...")
        
        # 1. Baca referensi lokal
        use_local_refs = data.get("referensi_tambahan", "").lower() in ["ya", "ya, sertakan", "y"]
        ref_context = read_reference_files() if use_local_refs else ""
        
        _update_job(job_id, 10, "Mencari referensi akademis dari Semantic Scholar...")
        
        # 2. Cari referensi online
        try:
            year_from = int(data.get("year_from", 2019))
            year_to = int(data.get("year_to", 2025))
        except ValueError:
            year_from, year_to = 2019, 2025
        
        max_refs = int(data.get("max_refs", 15))
        papers = search_semantic_scholar(
            topic=data.get("judul", ""),
            year_from=year_from,
            year_to=year_to,
            max_results=max_refs
        )
        
        refs_text = _format_references_list(papers)
        ref_titles = "\n".join(f"- {p['title']} ({p['year']})" for p in papers)
        
        _update_job(job_id, 20, "Membuat outline dokumen...")
        
        # 3. Generate outline
        outline = generate_outline(data, ref_titles)
        
        _update_job(job_id, 25, "Mulai menulis konten bab...")
        
        # 4. Generate konten tiap bab
        chapters_content = {}
        total_bab = len(outline)
        for i, bab in enumerate(outline):
            judul_bab = bab.get("judul_bab", f"BAB {i+1}")
            subbab_list = bab.get("subbab", [])
            
            progress = 25 + int((i / total_bab) * 50)
            _update_job(job_id, progress, f"Menulis {judul_bab}...")
            
            try:
                content = generate_chapter_content(
                    judul_bab=judul_bab,
                    subbab_list=subbab_list,
                    judul_dok=data.get("judul", ""),
                    ref_context=ref_context + "\n\n" + ref_titles
                )
                chapters_content[judul_bab] = {"subbab": subbab_list, "content": content}
            except Exception as e:
                chapters_content[judul_bab] = {"subbab": subbab_list, "content": f"[Konten {judul_bab} tidak dapat di-generate: {e}]"}
        
        _update_job(job_id, 78, "Merakit dokumen DOCX...")
        
        # 5. Susun struktur JSON untuk docx_tools.create_docx()
        jenis = sess.get("jenis", "laporan_penelitian")
        preset = PRESET_MAP.get(jenis, "laporan")
        
        # Buat nama file yang aman
        safe_judul = "".join(c for c in data.get("judul", "dokumen") if c.isalnum() or c in " _-")[:40]
        safe_judul = safe_judul.strip().replace(" ", "_")
        timestamp = int(time.time())
        filename = f"{safe_judul}_{timestamp}.docx"
        
        # Susun content array untuk docx_tools
        content_items = []
        
        for bab in outline:
            judul_bab = bab.get("judul_bab", "")
            subbab_list = bab.get("subbab", [])
            bab_content = chapters_content.get(judul_bab, {})
            bab_text = bab_content.get("content", "")
            
            # Heading bab
            content_items.append({"type": "page_break"})
            content_items.append({"type": "heading1", "text": judul_bab})
            
            # Split konten ke subbab
            if subbab_list and bab_text:
                remaining_text = bab_text
                for subbab in subbab_list:
                    content_items.append({"type": "heading2", "text": subbab})
                    # Ambil porsi teks — bagi rata
                    portion = len(remaining_text) // max(len(subbab_list), 1)
                    chunk = remaining_text[:portion].strip()
                    remaining_text = remaining_text[portion:]
                    if chunk:
                        content_items.append({"type": "paragraph", "text": chunk})
                # Sisa teks
                if remaining_text.strip():
                    content_items.append({"type": "paragraph", "text": remaining_text.strip()})
            elif bab_text:
                content_items.append({"type": "paragraph", "text": bab_text})
        
        # Daftar Pustaka
        content_items.append({"type": "page_break"})
        content_items.append({"type": "heading1", "text": "DAFTAR PUSTAKA"})
        for i, paper in enumerate(papers):
            authors = paper.get("authors", "Unknown")
            year = paper.get("year", "n.d.")
            title = paper.get("title", "")
            venue = paper.get("venue", "")
            doi = paper.get("doi", "")
            apa = f"{authors} ({year}). {title}."
            if venue:
                apa += f" {venue}."
            if doi:
                apa += f" https://doi.org/{doi}"
            content_items.append({"type": "paragraph", "text": apa})
        
        # Susun cover data
        cover_data = {
            "institution": data.get("institusi", ""),
            "faculty": data.get("fakultas", ""),
            "doc_type": data.get("jenis_dok_label", "LAPORAN").upper(),
            "title": data.get("judul", ""),
            "author": data.get("penulis", ""),
            "nim": data.get("nim", ""),
            "year": str(time.localtime().tm_year)
        }
        
        docx_param = {
            "filename": filename,
            "preset": preset,
            "cover": cover_data,
            "content": content_items
        }
        
        _update_job(job_id, 90, "Menyimpan file DOCX...")
        
        result_path = create_docx(json.dumps(docx_param, ensure_ascii=False))
        
        if result_path.startswith("[ERROR]"):
            raise RuntimeError(result_path)
        
        sess["status"] = "done"
        _jobs[job_id] = {
            "progress": 100,
            "step": "Dokumen berhasil dibuat!",
            "done": True,
            "filename": filename,
            "filepath": result_path,
            "error": None
        }
        
        print(f"[DOCX] Dokumen selesai: {result_path}")
    
    except Exception as e:
        err = traceback.format_exc()
        print(f"[DOCX] Error saat generate: {err}")
        sess["status"] = "error"
        sess["error"] = str(e)
        _jobs[job_id] = {
            "progress": 0,
            "step": f"Error: {str(e)}",
            "done": True,
            "filename": None,
            "error": str(e)
        }


def _update_job(job_id: str, progress: int, step: str):
    """Update job progress."""
    _jobs[job_id] = {
        "progress": progress,
        "step": step,
        "done": False,
        "filename": None,
        "error": None
    }
    print(f"[DOCX] {progress}% -- {step}")


def get_job_status(job_id: str) -> dict:
    return _jobs.get(job_id, {"error": "Job tidak ditemukan", "done": True})


def list_output_docs() -> list:
    """List semua file DOCX yang sudah di-generate."""
    docs = []
    if not os.path.exists(OUTPUT_DIR):
        return docs
    
    for filename in sorted(os.listdir(OUTPUT_DIR), reverse=True):
        if filename.endswith(".docx"):
            filepath = os.path.join(OUTPUT_DIR, filename)
            docs.append({
                "filename": filename,
                "size": os.path.getsize(filepath),
                "created": os.path.getmtime(filepath)
            })
    
    return docs
