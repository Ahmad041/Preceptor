"""
tech_doc_generator.py — Fitur AI untuk membuat dokumen teknis (ERD, PDM, Probis, Flowchart, dll)
Menerapkan sistem Q&A interaktif, generate Mermaid, dan perakitan DOCX.
"""

import os
import json
import time
import uuid
import zlib
import base64
import requests
import traceback
from typing import Optional

from docx_generator import generate_content

# ============================================================
# KONSTANTA
# ============================================================
OUTPUT_DIR = "output_docs"
DIAGRAM_CACHE_DIR = os.path.join(OUTPUT_DIR, "diagram_cache")
os.makedirs(DIAGRAM_CACHE_DIR, exist_ok=True)

JENIS_DOKUMEN = ["ERD (Conceptual)", "PDM (Physical)", "Proses Bisnis (BPMN)", "Flowchart", "Use Case Diagram", "Arsitektur Sistem", "Semua Diagram Lengkap"]
JENIS_KEY = ["erd", "pdm", "probis", "flowchart", "use_case", "arsitektur", "semua"]

# ============================================================
# SESSION MANAGER
# ============================================================
_tech_sessions: dict = {}
_tech_jobs: dict = {}

# Pertanyaan Utama
QUESTIONS_BASE = [
    {"key": "nama_proyek", "question": "Apa nama proyek atau aplikasi yang sedang kamu kerjakan?", "options": []},
    {"key": "tujuan_proyek", "question": "Jelaskan secara singkat fungsi utama atau tujuan dari aplikasi ini.", "options": []},
    {"key": "entitas", "question": "Sebutkan objek/entitas utama dalam sistem ini (misal: User, Produk, Pesanan, dsb)?", "options": []},
    {"key": "aktor", "question": "Siapa saja aktor yang berinteraksi dengan sistem ini? (misal: Admin, Customer, Sistem Internal)", "options": []},
    {"key": "proses_bisnis", "question": "Jelaskan secara singkat alur proses bisnis utamanya (misal: User daftar -> pilih barang -> checkout -> admin konfirmasi).", "options": []},
    {"key": "tech_stack", "question": "Apa saja tech stack yang digunakan? (misal: React, FastAPI, PostgreSQL) - Kosongkan jika belum tahu.", "options": []},
]

# ============================================================
# KROKI.IO MERMAID RENDERER
# ============================================================
def render_mermaid_to_png(mermaid_code: str, output_filename: str) -> str:
    """Merender kode Mermaid menjadi gambar PNG menggunakan Kroki.io API (gratis)."""
    # Bersihkan markdown formatting
    code = mermaid_code.replace("```mermaid", "").replace("```", "").strip()
    
    # Kroki encoding: deflate + base64 (urlsafe)
    compressed = zlib.compress(code.encode('utf-8'), 9)
    encoded = base64.urlsafe_b64encode(compressed).decode('ascii')
    
    url = f"https://kroki.io/mermaid/png/{encoded}"
    output_path = os.path.join(DIAGRAM_CACHE_DIR, output_filename)
    
    try:
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
        with open(output_path, 'wb') as f:
            f.write(resp.content)
        return output_path
    except Exception as e:
        print(f"[TECHDOC] Kroki Render Error: {e}")
        # Jika gagal, kembalikan teks error (nanti tidak usah masuk docx)
        return ""

# ============================================================
# PROMPT GENERATORS
# ============================================================
def extract_mermaid_code(text: str) -> str:
    """Ekstrak blok kode mermaid dari respon AI."""
    if "```mermaid" in text:
        start = text.find("```mermaid") + len("```mermaid")
        end = text.find("```", start)
        return text[start:end].strip()
    return text.strip()

def prompt_erd(info: dict) -> str:
    prompt = f"""
Buatkan Entity Relationship Diagram (ERD) konseptual dalam format sintaks `mermaid`.
Nama Proyek: {info.get('nama_proyek')}
Tujuan: {info.get('tujuan_proyek')}
Entitas: {info.get('entitas')}

ATURAN WAJIB ERD KONSEPTUAL:
1. HANYA tampilkan entitas dan relasinya.
2. TIDAK BOLEH ADA tipe data (seperti int, varchar).
3. TIDAK BOLEH ADA Foreign Key (FK).
4. WAJIB menggunakan kardinalitas yang benar (||--o{{, ||--||, }}o--o{{).
5. Beri label pada garis relasi (contoh: : "melakukan").

Hanya berikan sintaks mermaid di dalam blok ```mermaid.
"""
    return extract_mermaid_code(generate_content(prompt))

def prompt_pdm(info: dict) -> str:
    prompt = f"""
Buatkan Physical Data Model (PDM) dalam format sintaks `mermaid` (erDiagram).
Nama Proyek: {info.get('nama_proyek')}
Entitas: {info.get('entitas')}

ATURAN WAJIB PDM:
1. Lengkapi setiap entitas dengan atribut (kolom).
2. Tentukan Primary Key (PK) dan Foreign Key (FK).
3. Tentukan tipe data untuk masing-masing kolom (INT, VARCHAR, DATE, dll).
4. Tunjukkan relasi fisik antar tabel dengan kardinalitas yang benar.

Hanya berikan sintaks mermaid di dalam blok ```mermaid.
"""
    return extract_mermaid_code(generate_content(prompt))

def prompt_probis(info: dict) -> str:
    prompt = f"""
Buatkan Diagram Proses Bisnis (BPMN atau flowchart mendatar) menggunakan sintaks `mermaid` flowchart LR atau TD.
Nama Proyek: {info.get('nama_proyek')}
Aktor: {info.get('aktor')}
Alur: {info.get('proses_bisnis')}

ATURAN:
1. Gunakan subgraph untuk setiap aktor (Swimlane).
2. Tunjukkan urutan aktivitas antar aktor dengan jelas.
3. Hindari sintaks yang rumit agar tidak error saat dirender.

Hanya berikan sintaks mermaid di dalam blok ```mermaid.
"""
    return extract_mermaid_code(generate_content(prompt))

def prompt_flowchart(info: dict) -> str:
    prompt = f"""
Buatkan Flowchart Sistem menggunakan sintaks `mermaid` flowchart TD.
Proyek: {info.get('nama_proyek')}
Alur Sistem: {info.get('proses_bisnis')}

ATURAN:
1. Gunakan bentuk wajik {{}} untuk kondisional (If/Else).
2. Mulai dengan (Start) dan akhiri dengan (End).
3. Buat serinci mungkin bagaimana logika sistem berjalan.

Hanya berikan sintaks mermaid di dalam blok ```mermaid.
"""
    return extract_mermaid_code(generate_content(prompt))

def prompt_usecase(info: dict) -> str:
    prompt = f"""
Buatkan Use Case Diagram menggunakan sintaks `mermaid` usecase (atau flowchart dengan style).
Proyek: {info.get('nama_proyek')}
Aktor: {info.get('aktor')}
Fungsi: {info.get('tujuan_proyek')} dan {info.get('proses_bisnis')}

ATURAN:
Karena mermaid tidak mendukung usecase diagram secara native (kecuali versi sangat baru), gunakan flowchart LR.
Aktor sebagai node kotak tebal, Use case sebagai node oval ().
Contoh: Aktor --> (Melakukan Login)
Bisa gunakan subraph "Sistem" untuk membungkus use case.

Hanya berikan sintaks mermaid di dalam blok ```mermaid.
"""
    return extract_mermaid_code(generate_content(prompt))

def prompt_arsitektur(info: dict) -> str:
    prompt = f"""
Buatkan Diagram Arsitektur Sistem menggunakan sintaks `mermaid` flowchart TD atau LR.
Proyek: {info.get('nama_proyek')}
Tech Stack: {info.get('tech_stack')}

ATURAN:
Tunjukkan pembagian Layer (misal: Presentation Layer, Application Layer, Database Layer).
Gunakan subgraph untuk mengelompokkan komponen.
Beri tanda panah bagaimana aliran datanya.

Hanya berikan sintaks mermaid di dalam blok ```mermaid.
"""
    return extract_mermaid_code(generate_content(prompt))


# ============================================================
# SESSION FUNCTIONS
# ============================================================
def start_techdoc_session(session_id: str = None) -> dict:
    if not session_id:
        session_id = str(uuid.uuid4())
    
    _tech_sessions[session_id] = {
        "step": 0,
        "jenis": "semua", # Default ke semua
        "data": {},
        "questions": QUESTIONS_BASE.copy(),
        "status": "collecting",
        "error": None
    }
    
    # Tambahkan pertanyaan awal tentang jenis dokumen
    q_jenis = {"key": "jenis_dok", "question": "Dokumen teknis apa yang ingin dibuat?", "options": JENIS_DOKUMEN}
    _tech_sessions[session_id]["questions"].insert(0, q_jenis)
    
    first_q = _tech_sessions[session_id]["questions"][0]
    return {
        "session_id": session_id,
        "question": first_q["question"],
        "options": first_q.get("options", []),
        "done": False,
        "progress": 0
    }

def answer_techdoc_question(session_id: str, answer: str) -> dict:
    if session_id not in _tech_sessions:
        return {"error": "Session tidak ditemukan. Mulai sesi baru."}
    
    sess = _tech_sessions[session_id]
    questions = sess["questions"]
    step = sess["step"]
    
    if step >= len(questions):
        return {"done": True, "session_id": session_id, "message": "Siap generate!"}
    
    current_q = questions[step]
    key = current_q["key"]
    
    if key == "jenis_dok":
        for i, label in enumerate(JENIS_DOKUMEN):
            if answer.strip().lower() in label.lower() or str(i+1) == answer.strip():
                sess["jenis"] = JENIS_KEY[i]
                sess["data"]["jenis_dok_label"] = label
                break
        if not sess.get("jenis"):
            sess["jenis"] = "semua"
            sess["data"]["jenis_dok_label"] = "Semua Diagram Lengkap"
            
        # Tanya apakah ada dokumen existing yang mau di-skip
        q_existing = {"key": "existing_docs", "question": "Apakah kamu sudah punya salah satu dokumen di atas sebelumnya? Jika ya, sebutkan agar saya skip, atau ketik 'Tidak' untuk membuat semuanya dari awal.", "options": []}
        questions.insert(1, q_existing)
    
    elif key == "existing_docs":
        sess["data"]["existing_docs"] = answer.strip()
    
    else:
        sess["data"][key] = answer.strip()
    
    sess["step"] = step + 1
    total = len(questions)
    
    if sess["step"] == total:
        # Superpowers Workflow: Propose Implementation Plan / Spec before execution
        plan_text = f"**[SUPERPOWERS - Implementation Plan]**\nSaya telah menyusun spesifikasi dokumen berdasarkan sesi brainstorming kita:\n- Proyek: {sess['data'].get('nama_proyek')}\n- Tujuan: {sess['data'].get('tujuan_proyek')}\n- Entitas: {sess['data'].get('entitas')}\n- Aktor: {sess['data'].get('aktor')}\n- Dokumen: {sess['data'].get('jenis_dok_label')}\n\nApakah Anda menyetujui spesifikasi dan rencana implementasi ini? (Ketik 'Ya' untuk lanjut atau berikan revisi)"
        return {
            "session_id": session_id,
            "question": plan_text,
            "options": ["Ya, Lanjutkan Eksekusi"],
            "done": False,
            "progress": 95
        }
        
    if sess["step"] > total:
        # Approval answer received
        sess["status"] = "ready"
        if "ya" not in answer.lower() and "lanjut" not in answer.lower() and "yes" not in answer.lower():
            sess["data"]["revisi_plan"] = answer.strip()
            msg = "Revisi spesifikasi diterima. Mengeksekusi generasi dokumen berdasarkan rencana yang diperbarui..."
        else:
            msg = "Spesifikasi disetujui! Mengeksekusi generasi dokumen..."
            
        return {
            "session_id": session_id,
            "done": True,
            "ready_to_generate": True,
            "message": msg,
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


# ============================================================
# DOCX ASSEMBLY
# ============================================================
def generate_techdoc(session_id: str, job_id: str):
    from docx_tools import create_docx
    
    sess = _tech_sessions.get(session_id)
    if not sess:
        _tech_jobs[job_id] = {"progress": 0, "step": "Error", "done": True, "error": "Session not found"}
        return
        
    data = sess["data"]
    jenis = sess["jenis"]
    
    try:
        diagrams_to_make = []
        if jenis == "semua":
            diagrams_to_make = ["erd", "pdm", "probis", "flowchart", "use_case", "arsitektur"]
        else:
            diagrams_to_make = [jenis]
            
        # Parse existing docs (very simplified parsing)
        existing = data.get("existing_docs", "").lower()
        if "tidak" not in existing and "belum" not in existing:
            for diag in diagrams_to_make.copy():
                if diag in existing:
                    diagrams_to_make.remove(diag)
        
        _tech_jobs[job_id] = {"progress": 10, "step": f"Mempersiapkan pembuatan {len(diagrams_to_make)} diagram...", "done": False, "error": None}
        
        results = {}
        total = len(diagrams_to_make)
        
        for idx, diag in enumerate(diagrams_to_make):
            progress = 10 + int((idx / total) * 70)
            _tech_jobs[job_id]["progress"] = progress
            _tech_jobs[job_id]["step"] = f"Generating {diag.upper()}..."
            
            code = ""
            if diag == "erd": code = prompt_erd(data)
            elif diag == "pdm": code = prompt_pdm(data)
            elif diag == "probis": code = prompt_probis(data)
            elif diag == "flowchart": code = prompt_flowchart(data)
            elif diag == "use_case": code = prompt_usecase(data)
            elif diag == "arsitektur": code = prompt_arsitektur(data)
            
            # Render to PNG
            if code:
                filename = f"{session_id}_{diag}.png"
                img_path = render_mermaid_to_png(code, filename)
                results[diag] = {
                    "code": code,
                    "img": img_path
                }
        
        # Assemble DOCX
        _tech_jobs[job_id]["progress"] = 85
        _tech_jobs[job_id]["step"] = "Merakit dokumen Word..."
        
        content_items = []
        
        titles = {
            "erd": "1. Entity Relationship Diagram (ERD)",
            "pdm": "2. Physical Data Model (PDM)",
            "probis": "3. Proses Bisnis (BPMN)",
            "flowchart": "4. Flowchart Alur Sistem",
            "use_case": "5. Use Case Diagram",
            "arsitektur": "6. Arsitektur Sistem"
        }
        
        desc = {
            "erd": "Diagram berikut menunjukkan entitas konseptual dan relasi logis antar data dalam sistem.",
            "pdm": "Diagram berikut menjabarkan struktur fisik tabel database beserta tipe data dan key constraints.",
            "probis": "Diagram berikut menguraikan alur proses bisnis utama sistem dan interaksi aktor.",
            "flowchart": "Diagram berikut menampilkan alur logika sistem dari awal hingga akhir.",
            "use_case": "Diagram berikut merangkum aktor sistem dan interaksi kasus penggunaan (use case) yang tersedia.",
            "arsitektur": "Diagram berikut menggambarkan topologi arsitektur dan aliran komponen teknis sistem."
        }
        
        for diag in ["erd", "pdm", "probis", "flowchart", "use_case", "arsitektur"]:
            if diag in results and results[diag]["img"]:
                content_items.append({"type": "heading1", "text": titles[diag]})
                content_items.append({"type": "paragraph", "text": desc[diag]})
                content_items.append({"type": "empty_line"})
                content_items.append({"type": "image", "path": results[diag]["img"], "width_cm": 16, "caption": titles[diag]})
                content_items.append({"type": "page_break"})
                
        nama_proyek = data.get("nama_proyek", "Proyek AI").upper()
        
        cover_data = {
            "doc_type": "DOKUMEN TEKNIS & PERANCANGAN SISTEM",
            "title": nama_proyek,
            "subtitle": data.get("tujuan_proyek", ""),
            "author": "BOCCHI Agent Office (Tech Doc Generator)",
            "year": str(time.localtime().tm_year)
        }
        
        docx_param = {
            "filename": f"Dokumen_Teknis_{nama_proyek.replace(' ', '_')}.docx",
            "preset": "makalah",
            "cover": cover_data,
            "content": content_items
        }
        
        result_path = create_docx(json.dumps(docx_param, ensure_ascii=False))
        
        _tech_jobs[job_id] = {
            "progress": 100,
            "step": "Selesai!",
            "done": True,
            "filename": docx_param["filename"],
            "filepath": result_path,
            "error": None
        }
        
    except Exception as e:
        err = traceback.format_exc()
        print(f"[TECHDOC] Error: {err}")
        _tech_jobs[job_id] = {"progress": 0, "step": "Error", "done": True, "error": str(e)}

def generate_techdoc_direct(data: dict, jenis: str, job_id: str):
    """Fungsi pembantu untuk trigger langsung via MCP tanpa session."""
    session_id = str(uuid.uuid4())
    _tech_sessions[session_id] = {
        "step": 99,
        "jenis": jenis,
        "data": data,
        "questions": [],
        "status": "ready",
        "error": None
    }
    generate_techdoc(session_id, job_id)

def get_techdoc_status(job_id: str) -> dict:
    return _tech_jobs.get(job_id, {"error": "Job tidak ditemukan", "done": True})

