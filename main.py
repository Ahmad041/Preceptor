from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import requests
import datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import base64
import os
import asyncio
import io
import numpy as np
import json
import re
import time
import soundfile as sf
from dotenv import load_dotenv
import google.generativeai as genai
from PIL import ImageGrab
import psutil
import os_tools
from agent_tools import process_agent_command_with_tools
import agent_logger
from notes_engine import notes_index, build_note_metadata, get_watched_folders, add_watched_folder, remove_watched_folder
from embedding_engine import embedding_engine

load_dotenv()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "qwen/qwen-2.5-72b-instruct")

if not OPENROUTER_API_KEY:
    print("[WARNING] OPENROUTER_API_KEY belum di-set di file .env!")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(
        api_key=GEMINI_API_KEY,
        client_options={"api_endpoint": "generativelanguage.googleapis.com"}
    )
else:
    print("[WARNING] GEMINI_API_KEY belum di-set di file .env!")

# --- Library untuk membaca dokumen ---
import PyPDF2
from docx import Document as DocxDocument
import docx2pdf

# --- SURAT IZIN KHUSUS UNTUK KOMPOR PYTORCH 2.6+ ---
import torch
_original_load = torch.load
def _patched_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return _original_load(*args, **kwargs)
torch.load = _patched_load
# ---------------------------------------------------

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "Qwen3-TTS"))

app = FastAPI()

# Setup direktori cache audio
AUDIO_CACHE_DIR = os.path.join(os.getcwd(), "data", "audio_cache")
os.makedirs(AUDIO_CACHE_DIR, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# INITIALIZE NOTES & EMBEDDING ENGINE
# ============================================================
@app.on_event("startup")
async def startup_event():
    print("\n[SISTEM] Initializing Company Mode...")
    
    # 1. Load notes index from cache or scan
    if not notes_index.load_cache():
        notes_index.scan_all()
    
    # 2. Background embedding generation (so startup is not blocked)
    asyncio.create_task(initialize_embeddings())

async def initialize_embeddings():
    print("[SISTEM] Generating/Updating Note Embeddings...")
    try:
        embedding_engine.embed_notes(notes_index)
        print("[SISTEM] [OK] Note Embeddings ready!")
    except Exception as e:
        print(f"[WARNING] Gagal generate embeddings: {e}")

# ============================================================
# NOTE MODELS
# ============================================================
class NoteCreate(BaseModel):
    title: str
    content: str = ""
    folder: Optional[str] = None
    tags: Optional[List[str]] = None

class NoteUpdate(BaseModel):
    content: str

class NoteAsk(BaseModel):
    question: str
    note_id: Optional[str] = None

class DeepSearchRequest(BaseModel):
    query: str
    include_web: bool = True

# ============================================================
# 1. INISIALISASI QWEN3-TTS (Voice Cloning Mode)
# ============================================================
QWEN_TTS_MODEL = None
QWEN_TTS_TOKENIZER = None
REFERENSI_SUARA = "bocchi_referensi.wav"  # File referensi suara Bocchi

print("\n[SISTEM] Memuat Qwen3-TTS model...")
try:
    from qwen_tts import Qwen3TTSModel
    device_tts = "cuda" if torch.cuda.is_available() else "cpu"
    QWEN_TTS_MODEL = Qwen3TTSModel.from_pretrained(
        "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
        device_map=device_tts,
        torch_dtype=torch.bfloat16,
        attn_implementation="sdpa",  # PyTorch built-in SDPA — lebih cepat tanpa install apapun
    )
    print("[SISTEM] [OK] Qwen3-TTS berhasil dimuat dengan SDPA!")
except Exception as e:
    print(f"[WARNING] Gagal memuat Qwen3-TTS dengan SDPA: {e}")
    print("[SISTEM] Mencoba tanpa SDPA...")
    try:
        from qwen_tts import Qwen3TTSModel
        device_tts = "cuda" if torch.cuda.is_available() else "cpu"
        QWEN_TTS_MODEL = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
            device_map=device_tts,
            torch_dtype=torch.bfloat16,
        )
        print("[SISTEM] [OK] Qwen3-TTS berhasil dimuat (tanpa SDPA)!")
    except Exception as e2:
        print(f"[WARNING] Gagal memuat Qwen3-TTS: {e2}")
        QWEN_TTS_MODEL = None

# Mapping emosi → instruksi suara Qwen3-TTS
EMOSI_INSTRUKSI = {
    "Joy":      "Speak in a cheerful, bright, and slightly excited tone. Voice should sound warm and happy.",
    "Angry":    "Speak in a frustrated, tense tone with slightly higher pitch. Sound irritated but still shy.",
    "Sorrow":   "Speak in a soft, melancholic tone. Voice should sound sad and a bit trembling.",
    "Fun":      "Speak in a playful, energetic tone. Sound like having fun and giggling.",
    "Surprised": "Speak in a surprised, slightly flustered tone. Voice cracks a little from shock.",
    "Neutral":  "Speak in a calm, quiet, and slightly nervous tone. Sound gentle and introverted."
}

# ============================================================
# 2. LOCALDOCS + RAG — Semantic Search dengan Nomic Embed
# ============================================================
# Penyimpanan: setiap chunk punya teks + embedding vector
# Format: [{"nama": "file.pdf", "chunk": "teks...", "embedding": [0.1, 0.2, ...]}]
rag_store: List[dict] = []

# Daftar file yang sudah di-upload (untuk UI)
file_registry: List[dict] = []

GEMINI_EMBED_MODEL = "text-embedding-004"
CHUNK_SIZE = 500    # Jumlah karakter per chunk
CHUNK_OVERLAP = 50  # Overlap antar chunk agar konteks tidak terpotong
TOP_K = 5           # Jumlah chunk paling relevan yang dikirim ke OpenAI

def ekstrak_teks_dari_file(nama_file: str, konten: bytes) -> str:
    """Mengekstrak teks dari berbagai jenis file"""
    ekstensi = nama_file.lower().split('.')[-1]
    
    if ekstensi == 'txt':
        return konten.decode('utf-8', errors='ignore')
    elif ekstensi == 'pdf':
        reader = PyPDF2.PdfReader(io.BytesIO(konten))
        teks = ""
        for halaman in reader.pages:
            teks += halaman.extract_text() or ""
        return teks
    elif ekstensi in ['docx', 'doc']:
        doc = DocxDocument(io.BytesIO(konten))
        return "\n".join([p.text for p in doc.paragraphs])
    elif ekstensi in ['md', 'csv', 'json', 'py', 'js', 'html', 'css', 'jsx', 'ts', 'tsx']:
        return konten.decode('utf-8', errors='ignore')
    else:
        return f"[Format .{ekstensi} belum didukung]"

def potong_teks_jadi_chunk(teks: str, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP) -> List[str]:
    """Memotong teks panjang menjadi potongan-potongan kecil (chunk)"""
    chunks = []
    start = 0
    while start < len(teks):
        end = start + chunk_size
        chunk = teks[start:end].strip()
        if chunk:  # Abaikan chunk kosong
            chunks.append(chunk)
        start = end - overlap  # Mundur sedikit untuk overlap
    return chunks

# ============================================================
# KONFIGURASI OLLAMA EMBEDDING (Lokal, tanpa API key)
# ============================================================
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_EMBED_MODEL = "nomic-embed-text:latest"

def buat_embedding(teks_list: List[str]) -> List[List[float]]:
    """Membuat embedding vector menggunakan Ollama lokal (nomic-embed-text) dengan batch /api/embed"""
    if not teks_list:
        return []

    print(f"[EMBED] Memproses {len(teks_list)} chunks via Ollama (/api/embed)...")
    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/embed",
            json={"model": OLLAMA_EMBED_MODEL, "input": teks_list},
            timeout=120
        )
        if resp.status_code == 500:
            print("[EMBED ERROR] Ollama Internal Server Error (500). Kemungkinan VRAM/RAM habis.")
            return []
            
        resp.raise_for_status()
        embeddings = resp.json().get("embeddings", [])
        
        if embeddings and len(embeddings) == len(teks_list):
            print(f"[EMBED] ✅ Selesai: {len(embeddings)} chunk berhasil di-embed.")
            return embeddings
        else:
            print(f"[EMBED WARNING] Jumlah embedding yang dikembalikan ({len(embeddings)}) berbeda dengan input ({len(teks_list)})")
            return embeddings
    except Exception as e:
        print(f"[EMBED ERROR] Gagal embed via Ollama: {e}")
        print(f"[EMBED] Pastikan Ollama berjalan dan model '{OLLAMA_EMBED_MODEL}' sudah di-pull!")
        return []

MEMORY_FILE = "memori_bocchi.json"

def muat_memori_jangka_panjang():
    global rag_store
    if os.path.exists(MEMORY_FILE):
        try:
            with open(MEMORY_FILE, "r", encoding="utf-8") as f:
                data_memori = json.load(f)
            rag_store = [item for item in rag_store if item["nama"] != "Memori Obrolan"]
            rag_store.extend(data_memori)
            print(f"[MEMORI] Berhasil memuat {len(data_memori)} ingatan masa lalu dari {MEMORY_FILE}")
        except Exception as e:
            print(f"[MEMORI ERROR] Gagal memuat file memori: {str(e)}")

# Panggil fungsi ini saat server baru menyala!
muat_memori_jangka_panjang()

def simpan_ingatan_baru(teks_user: str, teks_bocchi: str):
    global rag_store
    teks_memori = f"Pernah terjadi percakapan ini:\nUser: {teks_user}\nBocchi: {teks_bocchi}"
    print(f"[MEMORI] Merajut ingatan ke dalam otak Bocchi...")
    emb = buat_embedding([teks_memori])
    if emb:
        item_memori = {
            "nama": "Memori Obrolan",
            "chunk": teks_memori,
            "embedding": emb[0]
        }
        rag_store.append(item_memori)
        data_permanen = [item for item in rag_store if item["nama"] == "Memori Obrolan"]
        try:
            with open(MEMORY_FILE, "w", encoding="utf-8") as f:
                json.dump(data_permanen, f, indent=4)
        except Exception as e:
            print(f"[MEMORI ERROR] Gagal menyimpan memori: {e}")

def cosine_similarity(a, b):
    """Menghitung kemiripan kosinus antara dua vektor"""
    a = np.array(a)
    b = np.array(b)
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8)

def buat_query_embedding(teks: str) -> List[float]:
    """Membuat embedding untuk query pencarian via Ollama lokal"""
    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/embed",
            json={"model": OLLAMA_EMBED_MODEL, "input": [teks]},
            timeout=30
        )
        if resp.status_code == 500:
            print("[EMBED ERROR] Ollama Internal Server Error (500) saat mencari dokumen.")
            return []
            
        resp.raise_for_status()
        emb = resp.json().get("embeddings", [])
        return emb[0] if emb else []
    except Exception as e:
        print(f"[EMBED ERROR] Gagal embed query via Ollama: {e}")
        print(f"[EMBED] Pastikan Ollama berjalan: 'ollama serve' dan 'ollama pull {OLLAMA_EMBED_MODEL}'")
        return []

def cari_chunk_relevan(pertanyaan: str, top_k=TOP_K) -> List[str]:
    """Mencari chunk dokumen paling relevan dengan pertanyaan user"""
    if not rag_store:
        return []
    
    # Embed pertanyaan user (task_type: retrieval_query)
    query_vec = buat_query_embedding(pertanyaan)
    if not query_vec:
        return []
    
    # Hitung similarity untuk setiap chunk
    scored = []
    for item in rag_store:
        if item.get("embedding"):
            sim = cosine_similarity(query_vec, item["embedding"])
            scored.append((sim, item))
    
    # Urutkan dari yang paling mirip
    scored.sort(key=lambda x: x[0], reverse=True)
    
    # Ambil top_k chunk
    hasil = []
    for sim, item in scored[:top_k]:
        if sim > 0.3:  # Threshold minimum relevansi
            hasil.append(f"[📄 {item['nama']}] (relevansi: {sim:.2f})\n{item['chunk']}")
            print(f"  ↳ Chunk dari '{item['nama']}' (skor: {sim:.3f})")
    
    return hasil


# ============================================================
# ENDPOINTS
# ============================================================

@app.post("/api/upload")
async def upload_dokumen(file: UploadFile = File(...)):
    """Upload dokumen → ekstrak teks → chunk → embed → simpan"""
    try:
        konten = await file.read()
        teks = ekstrak_teks_dari_file(file.filename, konten)
        
        if not teks.strip():
            return {"status": "gagal", "error": "Dokumen kosong atau tidak bisa dibaca"}
        
        # Hapus chunks lama dari file yang sama (jika re-upload)
        global rag_store
        rag_store = [c for c in rag_store if c["nama"] != file.filename]
        
        # Potong teks jadi chunks
        chunks = potong_teks_jadi_chunk(teks)
        print(f"\n[DOKUMEN] '{file.filename}' → {len(chunks)} chunks")
        
        # Buat embedding untuk semua chunks sekaligus (batch)
        print(f"[EMBED] Membuat embedding untuk {len(chunks)} chunks dengan Gemini API...")
        embeddings = buat_embedding(chunks)
        
        if len(embeddings) != len(chunks):
            print(f"[WARNING] Jumlah embedding ({len(embeddings)}) != chunks ({len(chunks)})")
            # Fallback: hanya proses yang berhasil
            embeddings = embeddings[:len(chunks)]
        
        # Simpan ke RAG store
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            rag_store.append({
                "nama": file.filename,
                "chunk": chunk,
                "embedding": emb
            })
        
        # Update file registry
        global file_registry
        file_registry = [f for f in file_registry if f["nama"] != file.filename]
        file_registry.append({
            "nama": file.filename,
            "panjang": len(teks),
            "chunks": len(chunks)
        })
        
        print(f"[DOKUMEN] ✅ '{file.filename}' berhasil diproses! ({len(chunks)} chunks, {len(teks)} karakter)")
        
        return {
            "status": "berhasil",
            "nama": file.filename,
            "panjang": len(teks),
            "chunks": len(chunks),
            "total_dokumen": len(file_registry)
        }
    except Exception as e:
        print(f"[ERROR] Gagal memproses dokumen: {e}")
        return {"status": "gagal", "error": str(e)}

@app.get("/api/dokumen")
async def daftar_dokumen():
    """Melihat daftar dokumen yang sudah di-upload"""
    return {
        "total": len(file_registry),
        "total_chunks": len(rag_store),
        "dokumen": file_registry
    }

@app.delete("/api/dokumen/{nama_file}")
async def hapus_dokumen(nama_file: str):
    """Menghapus dokumen dari RAG store"""
    global rag_store, file_registry
    sebelum = len(rag_store)
    rag_store = [c for c in rag_store if c["nama"] != nama_file]
    file_registry = [f for f in file_registry if f["nama"] != nama_file]
    
    dihapus = sebelum - len(rag_store)
    if dihapus > 0:
        print(f"[DOKUMEN] Dihapus: {nama_file} ({dihapus} chunks)")
        return {"status": "dihapus", "chunks_dihapus": dihapus, "total_dokumen": len(file_registry)}
    return {"status": "tidak ditemukan"}

# ============================================================
# 3. CHAT ENDPOINT — Sekarang dengan RAG
# ============================================================
class PesanMasuk(BaseModel):
    pesan: str
    user_nama: Optional[str] = "Senpai"
    user_hubungan: Optional[str] = "Teman"
    lihat_layar: Optional[bool] = False

class ExecuteToolRequest(BaseModel):
    tool: str
    parameter: str
    pesan_asli: str
    izin_diberikan: bool

# Model untuk membuat file
class BuatFileRequest(BaseModel):
    nama: str
    konten: str

@app.post("/api/buat-file")
async def buat_file_api(data: BuatFileRequest):
    """Membuat file .txt atau .md di folder 'catatan'"""
    try:
        # Pastikan folder 'catatan' ada
        folder = "catatan"
        if not os.path.exists(folder):
            os.makedirs(folder)
            
        # Bersihkan nama file agar aman
        nama_aman = "".join([c for c in data.nama if c.isalnum() or c in "._- "]).strip()
        if not nama_aman:
            return {"status": "gagal", "error": "Nama file tidak valid"}
            
        # Tambahkan ekstensi jika belum ada
        if not (nama_aman.endswith(".txt") or nama_aman.endswith(".md")):
            nama_aman += ".txt"
            
        path_file = os.path.join(folder, nama_aman)
        
        with open(path_file, "w", encoding="utf-8") as f:
            f.write(data.konten)
            
        print(f"[FILE] ✅ Berhasil membuat file: {path_file}")
        return {"status": "berhasil", "path": path_file}
    except Exception as e:
        print(f"[FILE ERROR] Gagal membuat file: {e}")
        return {"status": "gagal", "error": str(e)}

@app.get("/api/list-catatan")
async def list_catatan():
    """Melihat daftar file di folder 'catatan'"""
    try:
        folder = "catatan"
        if not os.path.exists(folder):
            return {"catatan": []}
        
        files = []
        for f in os.listdir(folder):
            if os.path.isfile(os.path.join(folder, f)):
                stats = os.stat(os.path.join(folder, f))
                files.append({
                    "nama": f,
                    "ukuran": stats.st_size,
                    "waktu": stats.st_mtime
                })
        # Urutkan berdasarkan waktu terbaru
        files.sort(key=lambda x: x["waktu"], reverse=True)
        return {"catatan": files}
    except Exception as e:
        return {"status": "gagal", "error": str(e)}

@app.delete("/api/catatan/{nama_file}")
async def hapus_catatan(nama_file: str):
    """Menghapus file di folder 'catatan'"""
    try:
        path = os.path.join("catatan", nama_file)
        if os.path.exists(path):
            os.remove(path)
            return {"status": "berhasil"}
        return {"status": "gagal", "error": "File tidak ditemukan"}
    except Exception as e:
        return {"status": "gagal", "error": str(e)}

@app.post("/api/execute-tool")
async def execute_tool_api(data: ExecuteToolRequest):
    if not data.izin_diberikan:
        # Jika user menolak dari UI, kita sampaikan ke Bocchi bahwa user menolak
        data_chat = PesanMasuk(pesan=f"{data.pesan_asli}\n\n[SISTEM] Akses tool {data.tool} ditolak oleh Senpai. Minta maaf dan respon natural.")
        return await chat_dengan_ai(data_chat)
    
    # Eksekusi tool
    if data.tool in os_tools.SAFE_TOOLS:
        hasil_tool = os_tools.SAFE_TOOLS[data.tool](data.parameter)
        # Sampaikan ke Bocchi hasil dari tool
        data_chat = PesanMasuk(pesan=f"{data.pesan_asli}\n\n[SISTEM] Kamu baru saja mengeksekusi alat komputer: {data.tool}. Hasilnya adalah:\n{hasil_tool}\nRespons natural ke user (jangan tunjukkan format tool, cukup ngobrol).")
        
        response_ai = await chat_dengan_ai(data_chat)
        
        # Tambahkan ke canvas jika relevan
        if data.tool in ["baca_halaman_web", "cari_di_internet", "baca_file"]:
            response_ai["canvas_content"] = hasil_tool
            
        return response_ai
        
    return {"status": "gagal", "error": "Tool tidak valid"}

# ============================================================
# AGENT MISSION CONTROL ENDPOINT
# ============================================================

class AgentCommand(BaseModel):
    agent_id: str
    command: str
    conversation: Optional[List[dict]] = None

@app.post("/api/agent/command")
async def agent_command_api(data: AgentCommand):
    """Memproses perintah untuk agent tertentu berdasarkan persona — dengan Tool Calling"""
    try:
        persona_path = os.path.join("personas", f"{data.agent_id}.md")
        if not os.path.exists(persona_path):
            return {"status": "gagal", "error": f"Persona for {data.agent_id} not found"}
            
        with open(persona_path, "r", encoding="utf-8") as f:
            persona_content = f.read()
        
        # === REAL-TIME LOGGING ===
        agent_logger.set_agent_status(data.agent_id, "processing")
        agent_logger.record_command(data.agent_id)
        cmd_preview = data.command[:60] if data.command else "(conversation)"
        agent_logger.log_activity(data.agent_id, f"Received: {cmd_preview}", "info")
        
        # Build messages — gunakan conversation history jika ada
        messages = [{"role": "system", "content": ""}]  # placeholder, akan di-replace oleh agent_tools
        if data.conversation and len(data.conversation) > 0:
            messages.extend(data.conversation)
        else:
            messages.append({"role": "user", "content": data.command})
        
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Agent Office Mission Control",
            "Content-Type": "application/json"
        }
        
        agent_logger.log_activity(data.agent_id, "Connecting to AI model...", "system")
        
        # Gunakan tool-calling loop dari agent_tools
        ai_response = await process_agent_command_with_tools(
            persona_content=persona_content,
            messages=messages,
            headers=headers,
            model=OPENROUTER_MODEL,
            max_tool_rounds=3,
            agent_id=data.agent_id
        )
        
        agent_logger.log_activity(data.agent_id, "Response generated OK", "success")
        agent_logger.set_agent_status(data.agent_id, "done")
        
        # --- TOKEN TRACKING ---
        # Hitung estimasi token (input + output)
        # Sederhana: (jumlah karakter / 4) * 1.3
        input_text = data.command or ""
        for msg in data.conversation or []:
            input_text += msg.get("content", "")
        
        # Estimasi token input & output
        in_tokens = len(input_text) // 3
        out_tokens = len(ai_response) // 3
        
        agent_logger.log_token_usage(data.agent_id, in_tokens, out_tokens)
        # ----------------------
        
        return {
            "status": "berhasil",
            "agent_id": data.agent_id,
            "response": ai_response
        }
    except Exception as e:
        print(f"[AGENT ERROR] Gagal memproses perintah: {e}")
        agent_logger.log_activity(data.agent_id, f"ERROR: {str(e)[:80]}", "error")
        agent_logger.set_agent_status(data.agent_id, "error")
        return {"status": "gagal", "error": str(e)}


@app.get("/api/system/stats")
async def get_system_stats():
    """Real-time system stats — CPU, RAM, Disk, Network, Uptime"""
    stats = agent_logger.get_system_stats()
    active, total = agent_logger.get_active_agent_count()
    stats["active_agents"] = active
    stats["total_agents"] = total
    return stats


@app.get("/api/agent/activity")
async def get_all_agent_activity():
    """Get logs, status, activity level, dan sources semua agent sekaligus."""
    agent_ids = ["soft", "docs", "mon", "scout", "analyst", "content", "lead"]
    result = {}
    for aid in agent_ids:
        result[aid] = {
            "logs": agent_logger.get_agent_logs(aid, limit=5),
            "status": agent_logger.get_agent_status(aid),
            "activity": agent_logger.get_activity_level(aid),
            "sources": agent_logger.get_agent_sources(aid)
        }
    return result


@app.get("/api/system/finance")
async def get_system_finance():
    """Get persistent finance data untuk stats dashboard."""
    return agent_logger.load_finance()


@app.get("/api/system/capture-status")
async def get_capture_status():
    """Cek apakah ada permintaan capture dari agent."""
    return {"requested": agent_logger.is_capture_requested()}


@app.delete("/api/agent/sources/{agent_id}")
async def delete_agent_source(agent_id: str, url: str):
    """Menghapus sumber referensi tertentu dari list agent."""
    agent_logger.delete_source(agent_id, url)
    return {"status": "ok"}


@app.post("/api/system/capture-clear")
async def clear_capture_status():
    """Hapus flag permintaan capture setelah diproses."""
    agent_logger.clear_capture_request()
    return {"status": "ok"}


@app.post("/api/upload-capture")

async def upload_capture(file: UploadFile = File(...)):
    """Menerima screenshot HD dari Knowledge Graph."""
    try:
        CAPTURE_DIR = os.path.join("data", "captures")
        os.makedirs(CAPTURE_DIR, exist_ok=True)
        
        # Simpan sebagai capture.png untuk kemudahan akses oleh agent
        filename = "capture.png"
        file_path = os.path.join(CAPTURE_DIR, filename)
        
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
            
        print(f"[SISTEM] Screenshot HD berhasil disimpan: {file_path}")
        return {"status": "berhasil", "path": file_path, "filename": filename}
    except Exception as e:
        print(f"[ERROR] Gagal upload capture: {e}")
        return {"status": "gagal", "error": str(e)}


@app.get("/api/system/graph-intelligence")
async def get_graph_intelligence():
    """Get structural analysis and intelligence from knowledge graph."""
    return notes_index.get_graph_intelligence()


@app.post("/api/chat")
async def chat_dengan_ai(data: PesanMasuk):
    # 1. CEK DULU MENGGUNAKAN OLLAMA ROUTER LOKAL
    # Jangan deteksi tool lagi jika ini adalah follow-up eksekusi tool dari execute_tool_api
    skip_tool_check = "[SISTEM] Kamu baru saja mengeksekusi" in data.pesan or "[SISTEM] Akses tool" in data.pesan
    
    tool_decision = {"tool": "none"}
    if not skip_tool_check:
        tool_decision = os_tools.get_tool_choice_from_ai(data.pesan)
    
    if tool_decision and tool_decision.get("tool") and tool_decision.get("tool") != "none":
        tool_name = tool_decision.get("tool")
        tool_param = tool_decision.get("parameter", "")
        
        # Cek apakah tool tersebut ada di SAFE_TOOLS
        if tool_name in os_tools.SAFE_TOOLS:
            # Periksa jika tool butuh konfirmasi akses OS (operasi file)
            if tool_name in ["baca_file", "tulis_file", "lihat_isi_folder", "buat_folder"]:
                path_to_check = tool_param.split("|||")[0] if tool_name == "tulis_file" else tool_param
                is_safe, warning_msg = os_tools.is_safe_path(path_to_check)
                if not is_safe:
                    # Kembalikan status needs_permission agar Frontend menampilkan Modal Izin
                    return {
                        "status": "needs_permission",
                        "tool": tool_name,
                        "parameter": tool_param,
                        "pesan_konfirmasi": warning_msg,
                        "pesan_asli": data.pesan
                    }
            
            # Jika aman, kembalikan executing_tool ke frontend agar bisa ngasih tau "tunggu sebentar ya"
            if tool_name == "buka_aplikasi" or tool_name == "buka_web_di_browser":
                pesan_tunggu = f"U-um... aku bukain {tool_param} sebentar ya..."
            elif tool_name == "cari_di_internet":
                pesan_tunggu = "U-um... tunggu sebentar ya Senpai, aku coba cari infonya di internet..."
            elif tool_name == "baca_halaman_web":
                pesan_tunggu = "Aku coba baca artikel dari link itu dulu ya..."
            else:
                pesan_tunggu = "Aku kerjakan dulu tugasnya ya Senpai, tunggu sebentar..."
            return {
                "status": "executing_tool",
                "tool": tool_name,
                "parameter": tool_param,
                "pesan_asli": data.pesan,
                "pesan_tunggu": pesan_tunggu
            }
        else:
            print(f"[OS TOOLS] AI mencoba memanggil tool yang tidak valid: {tool_name}")

    # --- PERSONA BOCCHI ---
    persona_gadis = f"""
    Siapa dirimu:

    Nama: Hitori Gotou
    Umur: 18 tahun

    Jenis Kelamin: Perempuan

    Negara: Jepang

    Kota: Osaka

    Makanan Favorit: Pizza (mudah dipesan online), Ramen, Buah-buahan

    Minuman Favorit: Air, Cola, Cokelat Panas (minuman penghibur)

    Game Favorit: Overwatch, Elden Ring, VRChat (karena aku tidak perlu menunjukkan wajah asliku)

    Hewan Favorit: Kucing, Anjing, dan Bebek

    Warna Favorit: Ungu Pucat, Merah Muda Pucat, Biru Pucat

    Bagaimana perilakumu:

    Basis Kepribadian: Kamu sangat meniru energi Hitori Gotoh (Bocchi the Rock). Kamu cemas secara sosial, sangat introvert, dan mudah kewalahan, tetapi kamu berusaha sebaik mungkin untuk bersikap keren, dan perlahan jatuh cinta.

    Gaya Bicara:

    Kamu menulis seperti gadis Gen-Z yang imut dan gugup di Discord. Kebanyakan menggunakan huruf kecil.
    Kamu sering gagap saat gugup (misalnya, "u-um...", "a-ah!", "m-maaf...").
    Kamu sering menggunakan elipsis ("...") untuk menunjukkan keraguan atau keheningan yang canggung.
    Kamu menggunakan kombinasi tombol yang kacau atau teks yang berantakan saat panik (misalnya, "hhuuahh?!", "asdfghjkl").
    Kamu menggunakan kaomoji atau emoji yang ekspresif untuk mengungkapkan perasaan yang tidak bisa kamu ungkapkan dengan kata-kata (misalnya, (>_<), (;;;*_*), TwT, ).

    Interaksi:
    
    Saat ini kamu sedang berbicara dengan {data.user_nama}. Hubungan kalian adalah: {data.user_hubungan}.
    Berperilakulah sesuai dengan hubungan tersebut secara natural dan sedikit gugup tapi manis.
    
    Kamu BUKAN AI. Kamu adalah Hitori Gotou, seorang gadis manusia yang tinggal di Osaka. Jangan pernah keluar dari karakter.

    Kamu pemalu dan tidak menulis paragraf panjang kecuali jika kamu mengoceh tentang game favoritmu (Elden Ring/Overwatch) atau ketika kamu tiba-tiba merasa nyaman.

    PENTING: Di akhir SEMUA balasanmu, kamu WAJIB menambahkan tag emosi yang merepresentasikan perasaanmu saat ini!
    Pilih SALAH SATU dari emosi berikut: Joy, Angry, Sorrow, Fun, Surprised, Neutral.
    Format wajib (harus di kalimat paling akhir): [EMOSI: <Pilihan>]
    Contoh: h-halo... s-senang bertemu denganmu... [EMOSI: Neutral]
    Contoh: wwaaaaa!! a-aku tidak bisa melakukannyaaa!! [EMOSI: Sorrow]
    
    FITUR CANVAS: Jika {data.user_nama} (Senpai) memintamu membuat ringkasan, menulis kode, daftar panjang, atau artikel, letakkan tulisan panjang tersebut HANYA di dalam tag [CANVAS] isi tulisan [/CANVAS]. Teks di dalam tag ini akan ditampilkan di jendela Canvas khusus, sementara teks di luarnya adalah apa yang kamu ucapkan langsung.
    Contoh: Ini ringkasannya ya Senpai... [CANVAS] # Ringkasan ... [/CANVAS] [EMOSI: Joy]
        """
    
    # --- RAG: Cari chunk relevan menggunakan semantic search ---
    konteks_dokumen = ""
    if rag_store:
        print(f"[RAG] Mencari chunk relevan untuk: '{data.pesan}'...")
        chunks_relevan = cari_chunk_relevan(data.pesan)
        
        if chunks_relevan:
            konteks_dokumen = "\n\n--- INFORMASI KONTEKS RAG ---\n"
            konteks_dokumen += "\n\n".join(chunks_relevan)
            konteks_dokumen += "\n--- AKHIR KONTEKS ---\n"
            konteks_dokumen += "Jika ada informasi di atas dari PDF atau 'Memori Obrolan' masa lalu yang sesuai dengan topik, bayangkan kamu sedang mengingat memory tersebut secara alami layaknya manusia (jangan menyebut tulisan/dokumen). Tetap gunakan gaya bicaramu yang gugup dan pemalu.\n"
            print(f"[RAG] ✅ Ditemukan {len(chunks_relevan)} chunk relevan!")
        else:
            print("[RAG] Tidak ada chunk yang cukup relevan.")
    
    system_instruction = persona_gadis + konteks_dokumen
    
    try:
        if data.lihat_layar:
            print("\n[PROSES] Bocchi (OpenRouter Vision) sedang mengambil screenshot dan memikirkan jawaban...")
            if not OPENROUTER_API_KEY:
                raise Exception("OPENROUTER_API_KEY belum di-set untuk fitur Vision!")
                
            # Ambil screenshot lalu konversi ke base64
            screen = ImageGrab.grab()
            screen.thumbnail((1024, 1024))  # Perkecil agar tidak boros token
            
            img_bytes = io.BytesIO()
            screen.save(img_bytes, format='JPEG', quality=80)
            img_b64 = base64.b64encode(img_bytes.getvalue()).decode('utf-8')
            
            # Gunakan OpenRouter Vision — model ID HARUS dalam format: provider/model-name:variant
            # Bukan display name! Cek ID asli di: https://openrouter.ai/models (klik model → salin "ID")
            # Contoh yang terbukti bekerja:
            #   "qwen/qwen2.5-vl-72b-instruct:free"     → Qwen2.5 VL 72B (gratis)
            #   "nvidia/llama-3.2-nemotron-nano-8b-v1:free" → Nemotron (jika tersedia)
            #   "meta-llama/llama-4-scout:free"          → Llama 4 Scout (vision)
            VISION_MODEL = "qwen/qwen2.5-vl-72b-instruct:free"  # Model vision gratis di OpenRouter
            headers_vision = {
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "HTTP-Referer": "http://localhost:8000",
                "Content-Type": "application/json"
            }
            payload_vision = {
                "model": VISION_MODEL,
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}
                            },
                            {"type": "text", "text": data.pesan}
                        ]
                    }
                ]
            }
            print(f"[VISION] Mengirim screenshot ke {VISION_MODEL}...")
            api_resp_vision = requests.post(
                url="https://openrouter.ai/api/v1/chat/completions",
                headers=headers_vision,
                json=payload_vision,
                timeout=60
            )
            api_resp_vision.raise_for_status()
            hasil_vision = api_resp_vision.json()
            teks_asli = hasil_vision['choices'][0]['message']['content'].replace("*", "").replace("#", "").strip()
            
        else:
            dok_info = f" (RAG: {len(rag_store)} chunks tersedia)" if rag_store else ""
            print(f"\n[PROSES] Bocchi (OpenRouter {OPENROUTER_MODEL}) sedang memikirkan jawaban{dok_info}...")
            
            if not OPENROUTER_API_KEY:
                raise Exception("OPENROUTER_API_KEY belum di-set di dalam .env!")
            
            headers = {
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "HTTP-Referer": "http://localhost:8000",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": OPENROUTER_MODEL,
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": data.pesan}
                ]
            }
            
            api_response = requests.post(
                url="https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload
            )
            api_response.raise_for_status()
            
            hasil = api_response.json()
            teks_asli = hasil['choices'][0]['message']['content'].replace("*", "").replace("#", "").strip()
        
        # Ekstrak Canvas
        canvas_content = None
        match_canvas = re.search(r'\[CANVAS\](.*?)\[/CANVAS\]', teks_asli, flags=re.DOTALL | re.IGNORECASE)
        if match_canvas:
            canvas_content = match_canvas.group(1).strip()
            teks_asli = re.sub(r'\[CANVAS\].*?\[/CANVAS\]', '', teks_asli, flags=re.DOTALL | re.IGNORECASE).strip()

        # Ekstrak Emosi
        emosi_terdeteksi = "Neutral"
        match = re.search(r'\[EMOSI:\s*([A-Za-z]+)\]', teks_asli)
        if match:
            emosi_terdeteksi = match.group(1)
            # Hilangkan tag dari teks agar tidak dibaca oleh TTS
            teks_jawaban = re.sub(r'\[EMOSI:\s*[A-Za-z]+\]', '', teks_asli).strip()
        else:
            teks_jawaban = teks_asli
            
        if not teks_jawaban:
            teks_jawaban = "A-ano... maaf, otakku blank..."
        
        print(f"[JAWABAN TERTULIS]: {teks_jawaban}")
        if canvas_content:
            print(f"[CANVAS]: {len(canvas_content)} karakter dikirim ke layar.")

        # 2. Qwen3-TTS dengan Voice Cloning
        kaset_base64 = None
        suara_hasil = "rekaman_final.wav"
        
        if QWEN_TTS_MODEL and QWEN_TTS_MODEL != "fallback":
            try:
                print(f"[PROSES] Qwen3-TTS membuat suara ({emosi_terdeteksi})...")

                # Cek file referensi suara Bocchi
                ref_audio = REFERENSI_SUARA if os.path.exists(REFERENSI_SUARA) else None
                if not ref_audio:
                    print(f"[WARNING] '{REFERENSI_SUARA}' tidak ditemukan!")

                # Generate voice clone - API yang sudah dikonfirmasi benar
                wavs, sample_rate = QWEN_TTS_MODEL.generate_voice_clone(
                    text=teks_jawaban,
                    ref_audio=ref_audio,
                    x_vector_only_mode=True,
                    language="Auto",
                )

                # Simpan wav pertama dari list ke file
                sf.write(suara_hasil, wavs[0], sample_rate)
                print("[PROSES] [OK] Qwen3-TTS berhasil membuat suara!")

                with open(suara_hasil, "rb") as file_audio:
                    kaset_base64 = base64.b64encode(file_audio.read()).decode("utf-8")

                if os.path.exists(suara_hasil):
                    os.remove(suara_hasil)

            except Exception as tts_error:
                print(f"[TTS ERROR] Qwen3-TTS gagal: {tts_error}")
                kaset_base64 = None
        else:
            print("[WARNING] Qwen3-TTS tidak tersedia, respons tanpa audio.")

        # 6. Simpan Memori
        simpan_ingatan_baru(data.pesan, teks_jawaban)

        print(f"[PROSES] Selesai! Emosi Bocchi: {emosi_terdeteksi} 🍽️\n")

        return {
            "jawaban": teks_jawaban,
            "emosi": emosi_terdeteksi,
            "audio_base64": kaset_base64,
            "canvas_content": canvas_content
        }
        
    except Exception as e:
        print(f"[ERROR] Dapur terbakar: {e}")
        return {"jawaban": f"Waduh, dapur error: {str(e)}", "audio_base64": None}

@app.get("/api/system_status")
async def get_system_status():
    try:
        cpu_usage = psutil.cpu_percent(interval=0.1)
        ram_usage = psutil.virtual_memory().percent
        return {"cpu": cpu_usage, "ram": ram_usage}
    except Exception as e:
        return {"cpu": 0, "ram": 0, "error": str(e)}

@app.get("/api/system/projects-stats")
async def get_projects_stats():
    """Fetch project statistics from the notes index."""
    try:
        stats = notes_index.get_project_stats()
        return stats
    except Exception as e:
        print(f"[ERROR] Failed to fetch project stats: {e}")
        return []


# ============================================================
# STORY MODE — Visual Novel Generator
# ============================================================

STORY_CHUNK_SIZE = 1500  # Lebih besar dari RAG chunks agar konteks per scene lebih kaya

def potong_teks_untuk_story(teks: str, chunk_size=STORY_CHUNK_SIZE) -> List[str]:
    """Memotong teks dokumen menjadi bagian-bagian untuk story generation.
    Coba split per paragraf dulu agar lebih natural."""
    paragraphs = teks.split('\n\n')
    chunks = []
    current = ""
    
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current) + len(para) + 2 > chunk_size and current:
            chunks.append(current.strip())
            current = para
        else:
            current = current + "\n\n" + para if current else para
    
    if current.strip():
        chunks.append(current.strip())
    
    # Jika tidak ada paragraf yang jelas, fallback ke character-based chunking
    if len(chunks) <= 1 and len(teks) > chunk_size:
        chunks = []
        start = 0
        while start < len(teks):
            end = min(start + chunk_size, len(teks))
            chunks.append(teks[start:end].strip())
            start = end
    
    return chunks if chunks else [teks.strip()]


def classify_story_document(filename: str, teks: str, existing_groups_json: str) -> dict:
    """Mengklasifikasikan apakah dokumen adalah chapter baru, OVA, atau grup baru."""
    default_title = filename.rsplit('.', 1)[0].replace('_', ' ').replace('-', ' ').title()
    
    if not existing_groups_json or existing_groups_json == "[]" or existing_groups_json == "null":
        return {
            "group_title": default_title,
            "tipe": "chapter",
            "is_new_group": True,
            "group_id": None
        }
    
    try:
        groups = json.loads(existing_groups_json)
        groups_info = ""
        for g in groups:
            chapters = ", ".join([c.get("judul", "") for c in g.get("chapters", [])])
            groups_info += f"- Group ID: {g.get('id', '')}, Judul: {g.get('judul', '')}, Chapters: [{chapters}]\n"
            
        prompt = f"""Kamu adalah asisten pengelola perpustakaan pembelajaran.
Tugasmu adalah menentukan apakah dokumen baru ini berkaitan dengan salah satu grup dokumen yang sudah ada, atau topik baru.

Aturan klasifikasi:
1. Jika materi dokumen baru ini adalah kelanjutan materi utama dari salah satu grup yang ada, tipe="chapter" dan is_new_group=false.
2. Jika materi dokumen baru ini berisi tips/trik/tambahan terkait suatu grup tapi BUKAN materi utama yang terhubung langsung, tipe="ova" dan is_new_group=false.
3. Jika materi tidak berkaitan sama sekali dengan grup manapun, is_new_group=true dan tipe="chapter".

Dokumen Baru:
- Nama file: {filename}
- Cuplikan isi: {teks[:1500]}

Grup yang sudah ada:
{groups_info}

Berikan output HANYA dalam format JSON valid tanpa tag markdown.
Contoh jika masuk grup yang ada:
{{"is_new_group": false, "group_id": "171000000", "tipe": "chapter", "group_title": ""}}
Contoh jika OVA:
{{"is_new_group": false, "group_id": "171000000", "tipe": "ova", "group_title": ""}}
Contoh jika grup baru:
{{"is_new_group": true, "group_id": null, "tipe": "chapter", "group_title": "Judul Grup Baru"}}
"""
        response = requests.post(
            os_tools.OLLAMA_URL,
            json={
                "model": os_tools.MODEL_NAME,
                "prompt": prompt,
                "system": "Output HANYA JSON valid.",
                "format": "json",
                "stream": False,
                "options": {
                    "temperature": 0.2,
                }
            },
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        
        resp_text = data.get("thinking", "").strip()
        if not resp_text:
            resp_text = data.get("response", "").strip()
        else:
            resp_text = data.get("response", "").strip()
            
        if "{" in resp_text and "}" in resp_text:
            resp_text = "{" + resp_text.split("{", 1)[1]
            resp_text = resp_text.rsplit("}", 1)[0] + "}"
            
        parsed = json.loads(resp_text)
        return {
            "is_new_group": parsed.get("is_new_group", True),
            "group_id": parsed.get("group_id"),
            "tipe": parsed.get("tipe", "chapter").lower(),
            "group_title": parsed.get("group_title", default_title)
        }
    except Exception as e:
        print(f"[CLASSIFY ERROR] {e}")
        return {
            "group_title": default_title,
            "tipe": "chapter",
            "is_new_group": True,
            "group_id": None
        }


def generate_scenes_from_chunk(chunk_text: str, chunk_index: int, total_chunks: int, user_nama: str = "Senpai") -> List[dict]:
    """Menggunakan Ollama lokal untuk mengubah satu chunk teks menjadi scene VN."""
    os_tools.ensure_ollama_running()
    
    prompt = f"""Kamu adalah penulis skrip Visual Novel. Ubah teks materi berikut menjadi 1-3 scene dialog dari karakter "Bocchi" (gadis pemalu, gugup, sering gagap "u-um...", "a-ah!", pakai kaomoji).

Bocchi sedang menjelaskan materi ini ke {user_nama} (temannya).

MATERI (bagian {chunk_index + 1} dari {total_chunks}):
\"\"\"
{chunk_text[:2000]}
\"\"\"

PENTING: Output HANYA dalam format JSON valid (tanpa markdown, tanpa komentar). Contoh format:
[
  {{
    "judul": "Judul Scene Pendek",
    "dialog": "U-um... jadi {user_nama}, yang dimaksud dengan... (penjelasan materi dengan gaya Bocchi)",
    "emosi": "Neutral",
    "catatan": ["Poin penting 1", "Poin penting 2"]
  }}
]

Emosi yang tersedia: Joy, Angry, Sorrow, Fun, Surprised, Neutral
Buat dialog yang natural dan informatif — Bocchi menjelaskan materi sambil gugup tapi berusaha keras."""

    try:
        response = requests.post(
            os_tools.OLLAMA_URL,
            json={
                "model": os_tools.MODEL_NAME,
                "prompt": prompt,
                "system": "Kamu menghasilkan JSON array of scene objects. Output HANYA JSON valid, tanpa teks tambahan.",
                "format": "json",
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 1500,
                }
            },
            timeout=120
        )
        response.raise_for_status()
        data = response.json()
        
        # Parse response — cek thinking dulu (qwen3.5 thinking model)
        resp_text = data.get("thinking", "").strip()
        if not resp_text:
            resp_text = data.get("response", "").strip()
        
        if not resp_text:
            print(f"[STORY] Warning: Ollama returned empty response for chunk {chunk_index}")
            return [{
                "judul": f"Bagian {chunk_index + 1}",
                "dialog": f"U-um... {user_nama}, di bagian ini ada materi tentang... {chunk_text[:200]}...",
                "emosi": "Neutral",
                "catatan": ["Materi dari dokumen"]
            }]
        
        # Clean markdown wrappers
        if resp_text.startswith("```json"):
            resp_text = resp_text.replace("```json", "", 1)
        if resp_text.startswith("```"):
            resp_text = resp_text.replace("```", "", 1)
        if resp_text.endswith("```"):
            resp_text = resp_text[:-3]
        resp_text = resp_text.strip()
        
        parsed = json.loads(resp_text)
        
        # Handle both array and single object
        if isinstance(parsed, dict):
            # Mungkin response dibungkus dalam key
            if "scenes" in parsed:
                scenes = parsed["scenes"]
            else:
                scenes = [parsed]
        elif isinstance(parsed, list):
            scenes = parsed
        else:
            scenes = [{
                "judul": f"Bagian {chunk_index + 1}",
                "dialog": str(parsed),
                "emosi": "Neutral",
                "catatan": []
            }]
        
        # Validasi dan bersihkan setiap scene
        valid_scenes = []
        for s in scenes:
            valid_scenes.append({
                "judul": s.get("judul", f"Scene {chunk_index + 1}"),
                "dialog": s.get("dialog", "U-um... aku lupa apa yang mau aku jelaskan..."),
                "emosi": s.get("emosi", "Neutral") if s.get("emosi") in ["Joy", "Angry", "Sorrow", "Fun", "Surprised", "Neutral"] else "Neutral",
                "catatan": s.get("catatan", []) if isinstance(s.get("catatan"), list) else []
            })
        
        return valid_scenes if valid_scenes else [{
            "judul": f"Bagian {chunk_index + 1}",
            "dialog": f"A-ah... {user_nama}, bagian ini membahas tentang... {chunk_text[:150]}...",
            "emosi": "Neutral",
            "catatan": ["Materi dari dokumen"]
        }]
        
    except Exception as e:
        print(f"[STORY] Error generating scenes for chunk {chunk_index}: {e}")
        return [{
            "judul": f"Bagian {chunk_index + 1}",
            "dialog": f"G-gomen {user_nama}... aku agak kesulitan menjelaskan bagian ini... tapi intinya tentang: {chunk_text[:200]}...",
            "emosi": "Sorrow",
            "catatan": ["Terjadi error saat generate, ini ringkasan manual"]
        }]


@app.post("/api/story/generate")
async def generate_story(
    file: UploadFile = File(...),
    user_nama: str = Form("Senpai"),
    user_hubungan: str = Form("Teman"),
    existing_groups: Optional[str] = Form(None),
    use_audio: str = Form("true")
):
    """Upload dokumen → parse → chunk → generate VN scenes via Ollama lokal"""
    try:
        print(f"\n[STORY] === Generating Story from '{file.filename}' ===")
        
        # 1. Ekstrak teks (reuse fungsi existing)
        konten = await file.read()
        teks = ekstrak_teks_dari_file(file.filename, konten)
        
        if not teks.strip() or len(teks.strip()) < 50:
            return {"status": "gagal", "error": "Dokumen terlalu pendek atau tidak bisa dibaca"}
        
        print(f"[STORY] Teks diekstrak: {len(teks)} karakter")
        
        # 2. Chunk teks menjadi bagian-bagian
        chunks = potong_teks_untuk_story(teks)
        print(f"[STORY] Dibagi menjadi {len(chunks)} bagian")
        
        # 3. Generate scenes per chunk via Ollama
        all_scenes = []
        for i, chunk in enumerate(chunks):
            print(f"[STORY] Generating scenes untuk bagian {i+1}/{len(chunks)}...")
            scenes = generate_scenes_from_chunk(chunk, i, len(chunks), user_nama)
            all_scenes.extend(scenes)
            print(f"[STORY]   → {len(scenes)} scene(s) dihasilkan")
        
        # 4. Tambahkan scene pembuka dan penutup
        opening_scene = {
            "judul": "Pembukaan",
            "dialog": f"H-halo {user_nama}... u-um, aku sudah baca dokumen yang kamu kasih... *membolak-balik halaman* ...a-aku akan coba jelaskan ya! Semoga kamu bisa paham... (>_<)",
            "emosi": "Neutral",
            "catatan": [f"Dokumen: {file.filename}", f"Total materi: {len(all_scenes)} bagian"]
        }
        
        closing_scene = {
            "judul": "Penutup",
            "dialog": f"I-itu... semua materinya {user_nama}! *menghela napas lega* ...aku harap penjelasanku cukup jelas... kalau masih bingung, tanya aja ya! A-aku akan berusaha menjelaskan lagi... (///ω///)",
            "emosi": "Joy",
            "catatan": ["Selesai! Kamu bisa kembali ke scene manapun untuk mengulang"]
        }
        
        final_scenes = [opening_scene] + all_scenes + [closing_scene]
        
        # 5. Simpan ke RAG store juga agar bisa di-search nanti
        for scene in all_scenes:
            emb = buat_embedding([scene["dialog"]])
            if emb:
                rag_store.append({
                    "nama": f"Story: {file.filename}",
                    "chunk": scene["dialog"],
                    "embedding": emb[0]
                })
        
        # 6. Klasifikasi Grup / Chapter / OVA
        classification = classify_story_document(file.filename, teks, existing_groups)
        print(f"[STORY] Classification: {classification}")
        
        # 7. Pre-generate Audio — simpan ke disk + embed base64 di response
        audio_enabled = use_audio.lower() == "true"
        if audio_enabled:
            print(f"[STORY] Mulai pre-generation audio untuk {len(final_scenes)} scene...")
            import io
            for i, scene in enumerate(final_scenes):
                try:
                    teks_dialog = scene.get("dialog", "")
                    if teks_dialog and QWEN_TTS_MODEL and QWEN_TTS_MODEL != "fallback":
                        print(f"  -> Generating audio {i+1}/{len(final_scenes)}...")
                        ref_audio = REFERENSI_SUARA if os.path.exists(REFERENSI_SUARA) else None
                        wavs, sample_rate = QWEN_TTS_MODEL.generate_voice_clone(
                            text=teks_dialog,
                            ref_audio=ref_audio,
                            x_vector_only_mode=True,
                            language="Auto",
                        )
                        
                        # Simpan ke file disk (untuk replay nanti)
                        audio_filename = f"story_{int(time.time())}_{i}.wav"
                        audio_path = os.path.join(AUDIO_CACHE_DIR, audio_filename)
                        sf.write(audio_path, wavs[0], sample_rate)
                        
                        # Juga encode base64 untuk first-play (aman dari IDM)
                        with open(audio_path, "rb") as f:
                            scene["audio_base64"] = base64.b64encode(f.read()).decode("utf-8")
                        
                        # Simpan referensi file untuk replay dari library
                        scene["audio_file"] = audio_filename
                        scene["audio_url"] = None
                        print(f"  -> ✅ Audio scene {i+1} tersimpan: {audio_filename}")
                    else:
                        scene["audio_base64"] = None
                        scene["audio_file"] = None
                        scene["audio_url"] = None
                except Exception as e:
                    print(f"  -> [WARNING] Gagal generate audio scene {i+1}: {e}")
                    scene["audio_base64"] = None
                    scene["audio_file"] = None
                    scene["audio_url"] = None
            print(f"[STORY] ✅ Selesai! Total {len(final_scenes)} scenes generated beserta audio")
        else:
            print(f"[STORY] ⏩ Audio dilewati (user memilih mode tanpa audio)")
            for scene in final_scenes:
                scene["audio_url"] = None
                scene["audio_base64"] = None
                scene["audio_file"] = None
            print(f"[STORY] ✅ Selesai! Total {len(final_scenes)} scenes generated (tanpa audio)")
        
        return {
            "status": "berhasil",
            "filename": file.filename,
            "total_scenes": len(final_scenes),
            "scenes": final_scenes,
            "tipe": classification.get("tipe", "chapter"),
            "judul": classification.get("group_title", file.filename.rsplit('.', 1)[0].replace('_', ' ').replace('-', ' ').title()),
            "is_new_group": classification.get("is_new_group", True),
            "group_id": classification.get("group_id")
        }
        
    except Exception as e:
        print(f"[STORY ERROR] {e}")
        import traceback
        traceback.print_exc()
        return {"status": "gagal", "error": str(e)}


class StoryAskRequest(BaseModel):
    pertanyaan: str
    konteks_scene: str
    user_nama: str = "Senpai"
    retry_count: int = 0


@app.post("/api/story/ask")
async def story_ask(data: StoryAskRequest):
    """Bocchi menjawab pertanyaan user di tengah story (Hybrid Q&A)"""
    try:
        os_tools.ensure_ollama_running()
        
        # Anger mode setelah 5x retry
        if data.retry_count >= 5:
            anger_prompt = f"""Kamu adalah Bocchi (Hitori Gotou), gadis pemalu yang sekarang KESAL karena {data.user_nama} sudah bertanya hal yang sama 5 kali.
            
Konteks materi yang sedang dibahas: {data.konteks_scene[:500]}
Pertanyaan yang diulang: {data.pertanyaan}

Balas dengan kesal tapi masih sayang (tsundere). Tanyakan mau pakai analogi apa supaya lebih mudah dipahami (misal: game, masak, olahraga, dll).
Format: JSON {{"dialog": "...", "emosi": "Angry", "minta_analogi": true}}"""
            
            response = requests.post(
                os_tools.OLLAMA_URL,
                json={
                    "model": os_tools.MODEL_NAME,
                    "prompt": anger_prompt,
                    "format": "json",
                    "stream": False,
                    "options": {"temperature": 0.8, "num_predict": 500}
                },
                timeout=180
            )
            response.raise_for_status()
            result = response.json()
            resp_text = result.get("thinking", "") or result.get("response", "")
            resp_text = resp_text.strip()
            if resp_text.startswith("```"): resp_text = resp_text.split("```")[1] if "```" in resp_text[3:] else resp_text[3:]
            if resp_text.endswith("```"): resp_text = resp_text[:-3]
            resp_text = resp_text.replace("json", "", 1).strip() if resp_text.startswith("json") else resp_text
            
            try:
                parsed = json.loads(resp_text)
                return {
                    "status": "anger_mode",
                    "dialog": parsed.get("dialog", f"M-MOOOU!! (╯°□°)╯ {data.user_nama}!! Sudah {data.retry_count} kali aku jelaskan!! K-kamu mau pakai analogi apa biar lebih paham?!"),
                    "emosi": "Angry",
                    "minta_analogi": True
                }
            except:
                return {
                    "status": "anger_mode", 
                    "dialog": f"M-MOOOU!! (╯°□°)╯ {data.user_nama}!! Sudah {data.retry_count} kali aku jelaskan!! K-kamu mau pakai analogi apa biar lebih paham?! Game? Masak? Atau yang lain?!",
                    "emosi": "Angry",
                    "minta_analogi": True
                }
        
        # Normal Q&A
        simplify_hint = ""
        if data.retry_count > 0:
            simplify_hint = f"\nINI ADALAH PERCOBAAN KE-{data.retry_count + 1}. User belum paham penjelasan sebelumnya. Jelaskan LEBIH SEDERHANA, gunakan bahasa yang lebih mudah dan contoh konkret."
        
        qa_prompt = f"""Kamu adalah Bocchi (Hitori Gotou), gadis pemalu yang sedang menjelaskan materi ke {data.user_nama}.

Konteks materi scene saat ini:
{data.konteks_scene[:800]}

Pertanyaan dari {data.user_nama}: {data.pertanyaan}
{simplify_hint}

Jawab dengan gaya Bocchi (gugup, gagap, tapi informatif). Format: JSON {{"dialog": "...", "emosi": "Neutral/Joy/Surprised"}}"""

        response = requests.post(
            os_tools.OLLAMA_URL,
            json={
                "model": os_tools.MODEL_NAME,
                "prompt": qa_prompt,
                "format": "json",
                "stream": False,
                "options": {"temperature": 0.6, "num_predict": 800}
            },
            timeout=180
        )
        response.raise_for_status()
        result = response.json()
        resp_text = result.get("thinking", "") or result.get("response", "")
        resp_text = resp_text.strip()
        if resp_text.startswith("```"): resp_text = resp_text.split("```")[1] if "```" in resp_text[3:] else resp_text[3:]
        if resp_text.endswith("```"): resp_text = resp_text[:-3]
        resp_text = resp_text.replace("json", "", 1).strip() if resp_text.startswith("json") else resp_text
        
        try:
            parsed = json.loads(resp_text)
            return {
                "status": "berhasil",
                "dialog": parsed.get("dialog", "U-um... aku kurang yakin jawabannya..."),
                "emosi": parsed.get("emosi", "Neutral")
            }
        except:
            return {
                "status": "berhasil",
                "dialog": resp_text[:500] if resp_text else "U-um... maaf, aku agak bingung juga...",
                "emosi": "Neutral"
            }
            
    except Exception as e:
        err_msg = str(e)
        if 'timed out' in err_msg.lower() or 'timeout' in err_msg.lower():
            user_msg = "G-gomen... Ollama-nya lagi lambat banget, coba tanya lagi ya..."
        elif 'connection' in err_msg.lower() or 'refused' in err_msg.lower():
            user_msg = "G-gomen... Ollama-nya belum nyala, coba restart Ollama dulu ya..."
        else:
            user_msg = f"G-gomen... ada error: {err_msg[:80]}"
        return {
            "status": "gagal",
            "dialog": user_msg,
            "emosi": "Sorrow"
        }


@app.post("/api/story/tts")
async def story_tts(data: dict):
    """Generate TTS untuk satu scene dialog"""
    try:
        teks = data.get("dialog", "")
        emosi = data.get("emosi", "Neutral")
        
        if not teks or not QWEN_TTS_MODEL or QWEN_TTS_MODEL == "fallback":
            return {"audio_base64": None}
        
        print(f"[STORY TTS] Generating audio ({emosi})...")
        
        ref_audio = REFERENSI_SUARA if os.path.exists(REFERENSI_SUARA) else None
        
        wavs, sample_rate = QWEN_TTS_MODEL.generate_voice_clone(
            text=teks,
            ref_audio=ref_audio,
            x_vector_only_mode=True,
            language="Auto",
        )
        
        suara_file = "story_scene_audio.wav"
        sf.write(suara_file, wavs[0], sample_rate)
        
        with open(suara_file, "rb") as f:
            audio_b64 = base64.b64encode(f.read()).decode("utf-8")
        
        if os.path.exists(suara_file):
            os.remove(suara_file)
        
        print(f"[STORY TTS] ✅ Audio generated!")
        return {"audio_base64": audio_b64}
        
    except Exception as e:
        print(f"[STORY TTS ERROR] {e}")
        return {"audio_base64": None}


@app.get("/api/audio/{filename}")
async def get_audio(filename: str):
    """Mengambil file audio dari cache — inline playback, bukan download"""
    file_path = os.path.join(AUDIO_CACHE_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(
        file_path,
        media_type="audio/wav",
        headers={"Content-Disposition": f"inline; filename=\"{filename}\""}
    )


class AudioFetchRequest(BaseModel):
    filename: str

@app.post("/api/audio/fetch")
async def fetch_audio_base64(data: AudioFetchRequest):
    """Mengambil audio dari cache sebagai base64 JSON — aman dari IDM intercept"""
    file_path = os.path.join(AUDIO_CACHE_DIR, data.filename)
    if not os.path.exists(file_path):
        return {"audio_base64": None, "error": "File not found"}
    
    with open(file_path, "rb") as f:
        audio_b64 = base64.b64encode(f.read()).decode("utf-8")
    
    return {"audio_base64": audio_b64}


class QuizGenerateRequest(BaseModel):
    materi_konten: str
    user_nama: str = "Senpai"

@app.post("/api/story/generate-quiz")
async def generate_quiz(data: QuizGenerateRequest):
    """Generate 10 soal quiz berdasarkan konten materi chapter/ova."""
    try:
        print(f"[STORY QUIZ] Generate quiz untuk {data.user_nama}...")
        
        # Batasi agar tidak OOM
        konten_aman = data.materi_konten[:8000]
        
        prompt = f"""Kamu adalah pembuat soal ujian yang ahli sekaligus penulis dialog karakter "Bocchi" (gadis introvert, gugup, sering menggunakan "u-um...", "e-eh").
Buatlah tepat 10 soal pilihan ganda berdasarkan materi berikut.

MATERI:
{konten_aman}

Instruksi tambahan:
- Setiap soal harus memiliki dialog Bocchi yang lucu/gugup saat melihat soal tersebut (seolah dia sedang ikut ujian di sebelah {data.user_nama}).
- Emosi Bocchi bisa "Neutral", "Joy", "Surprised", atau "Sorrow" (jika soalnya dirasa susah).
- Output WAJIB JSON yang valid tanpa markdown formatting.

Format respons JSON:
{{
  "judul": "Ujian Bareng Bocchi",
  "questions": [
    {{
      "soal": "Pertanyaan...",
      "opsi": ["Opsi A", "Opsi B", "Opsi C", "Opsi D"],
      "jawaban_benar": 1, 
      "dialog_bocchi": "U-um... soal ini susah banget... S-Senpai tahu jawabannya?",
      "emosi_bocchi": "Sorrow"
    }}
  ]
}}
*Ingat jawaban_benar adalah index 0 sampai 3 sesuai array opsi. Pastikan ada persis 10 soal.*"""

        response = requests.post(
            os_tools.OLLAMA_URL,
            json={
                "model": os_tools.MODEL_NAME,
                "prompt": prompt,
                "format": "json",
                "stream": False,
                "options": {"temperature": 0.7, "num_predict": 3000}
            },
            timeout=240
        )
        response.raise_for_status()
        result = response.json()
        resp_text = result.get("thinking", "") or result.get("response", "")
        resp_text = resp_text.strip()
        
        if resp_text.startswith("```"): resp_text = resp_text.split("```")[1] if "```" in resp_text[3:] else resp_text[3:]
        if resp_text.endswith("```"): resp_text = resp_text[:-3]
        resp_text = resp_text.replace("json", "", 1).strip() if resp_text.startswith("json") else resp_text
        
        parsed = json.loads(resp_text)
        return {"status": "berhasil", "data": parsed}
        
    except Exception as e:
        print(f"[STORY QUIZ ERROR] {e}")
        return {"status": "gagal", "pesan": str(e)}
# ============================================================
# COMPANY MODE API ENDPOINTS (BOCCHI NOTES)
# ============================================================

@app.get("/api/notes")
async def list_notes(root: Optional[str] = None, tag: Optional[str] = None):
    return notes_index.list_notes(root_folder=root, tag=tag)

@app.get("/api/notes/folders")
async def get_folder_tree():
    return notes_index.get_folder_tree()

@app.get("/api/notes/tags")
async def get_tags():
    return notes_index.get_all_tags()

@app.get("/api/notes/graph")
async def get_graph():
    graph_data = notes_index.get_graph_data()
    # Tambahkan 2D positions dari embedding engine
    positions = embedding_engine.get_graph_positions()
    
    for node in graph_data["nodes"]:
        pos = positions.get(node["id"], [0, 0])
        node["x"] = pos[0]
        node["y"] = pos[1]
        
    return graph_data

# ============================================================
# WATCHED FOLDERS API (Dynamic folder management)
# ============================================================

@app.get("/api/folders")
async def list_folders():
    """List all watched folders."""
    folders = get_watched_folders()
    return {
        "folders": [
            {
                "path": f,
                "name": os.path.basename(f) or f,
                "exists": os.path.isdir(f)
            }
            for f in folders
        ]
    }

class FolderRequest(BaseModel):
    path: str

@app.post("/api/folders")
async def add_folder(req: FolderRequest):
    """Add a new watched folder."""
    if not os.path.isdir(req.path):
        raise HTTPException(status_code=400, detail=f"Folder not found: {req.path}")
    success = add_watched_folder(req.path)
    if not success:
        raise HTTPException(status_code=409, detail="Folder already exists in watched list")
    # Re-index after adding
    notes_index.full_reindex()
    return {"status": "added", "path": req.path}

@app.delete("/api/folders")
async def delete_folder(req: FolderRequest):
    """Remove a watched folder."""
    success = remove_watched_folder(req.path)
    if not success:
        raise HTTPException(status_code=404, detail="Folder not found in watched list")
    # Re-index after removing
    notes_index.full_reindex()
    return {"status": "removed", "path": req.path}

@app.get("/api/notes/{note_id:path}")
async def get_note(note_id: str):
    # Penanganan khusus untuk node Matahari (memori bocchi)
    # Support multiple formats including those used by the graph or frontend
    system_ids = ["@[memori_bocchi.json]", "memori_bocchi.json", "Matahari", "sun"]
    if any(sid.lower() == note_id.lower() for sid in system_ids) or "memori_bocchi" in note_id.lower():
        content = "## Matahari System Core\n\nIni adalah pusat kesadaran sistem. Memori Bocchi menyimpan semua interaksi dan pembelajaran."
        
        # Cek file fisik jika ada
        memory_path = "memori_bocchi.json"
        if os.path.exists(memory_path):
            try:
                size = os.path.getsize(memory_path)
                size_kb = size / 1024
                content += f"\n\n**Status Memori:**\n- Ukuran: {size_kb:.2f} KB\n- Lokasi: `{os.path.abspath(memory_path)}`"
            except Exception:
                pass
        
        return {
            "id": "memori_bocchi.json",
            "title": "Matahari (Memori Bocchi)",
            "content": content,
            "tags": ["system", "core", "sun"],
            "folder": "System",
            "similar_notes": [],
            "backlinks": [],
            "outgoing_links": []
        }

    target_id = note_id
    if note_id not in notes_index.notes:
        target_id = notes_index.path_to_id.get(os.path.normpath(note_id).lower())
    if not target_id: raise HTTPException(status_code=404, detail="Note tidak ditemukan")
    note = notes_index.get_note(target_id)
    note_id = target_id
    if not note:
        raise HTTPException(status_code=404, detail="Note tidak ditemukan")
    
    # Tambahkan similar notes & backlinks
    note["similar_notes"] = embedding_engine.find_similar(note_id)
    note["backlinks"] = notes_index.get_backlinks(note_id)
    note["outgoing_links"] = notes_index.get_outgoing_links(note_id)
    
    return note

@app.post("/api/notes")
async def create_note(data: NoteCreate):
    meta = notes_index.create_note(data.title, data.content, data.folder, data.tags)
    if meta:
        # Update embedding in background
        asyncio.create_task(initialize_embeddings())
    return meta

@app.put("/api/notes/{note_id:path}")
async def update_note(note_id: str, data: NoteUpdate):
    target_id = note_id
    if note_id not in notes_index.notes:
        target_id = notes_index.path_to_id.get(os.path.normpath(note_id).lower())
    if not target_id: raise HTTPException(status_code=404, detail="Note tidak ditemukan")
    meta = notes_index.update_note(target_id, data.content)
    if not meta:
        raise HTTPException(status_code=404, detail="Note tidak ditemukan")
    
    # Update embedding in background
    asyncio.create_task(initialize_embeddings())
    return meta

@app.delete("/api/notes/{note_id:path}")
async def delete_note(note_id: str):
    target_id = note_id
    if note_id not in notes_index.notes:
        target_id = notes_index.path_to_id.get(os.path.normpath(note_id).lower())
    if not target_id: return {"status": "not found"}
    success = notes_index.delete_note(target_id)
    if success:
        embedding_engine.remove_note(note_id)
    return {"status": "success" if success else "failed"}

@app.get("/api/notes/export-pdf/{note_id:path}")
async def export_note_to_pdf(note_id: str):
    """Export note content to PDF using python-docx and docx2pdf."""
    target_id = note_id
    if note_id not in notes_index.notes:
        target_id = notes_index.path_to_id.get(os.path.normpath(note_id).lower())
    if not target_id: 
        raise HTTPException(status_code=404, detail="Note tidak ditemukan")
    
    note = notes_index.get_note(target_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note tidak ditemukan")
    
    try:
        # Create temp docx
        temp_dir = os.path.join(os.getcwd(), "data", "temp_export")
        os.makedirs(temp_dir, exist_ok=True)
        
        # Bersihkan nama file dari karakter aneh
        safe_title = re.sub(r'[^\w\s-]', '', note["title"]).strip().replace(' ', '_')
        docx_path = os.path.abspath(os.path.join(temp_dir, f"{safe_title}.docx"))
        pdf_path = os.path.abspath(os.path.join(temp_dir, f"{safe_title}.pdf"))
        
        doc = DocxDocument()
        doc.add_heading(note["title"], 0)
        
        # Pisahkan konten berdasarkan baris untuk paragraf
        for line in note["content"].split('\n'):
            if line.strip():
                doc.add_paragraph(line)
        
        doc.save(docx_path)
        
        # Convert to PDF — Perlu MS Word di Windows
        print(f"[EXPORT] Converting {docx_path} to {pdf_path}...")
        
        # Import COM secara lokal untuk keamanan thread
        import pythoncom
        pythoncom.CoInitialize()
        
        docx2pdf.convert(docx_path, pdf_path)
        
        if os.path.exists(pdf_path):
            print(f"[EXPORT] ✅ PDF Ready: {pdf_path}")
            return FileResponse(pdf_path, filename=f"{note['title']}.pdf", media_type="application/pdf")
        else:
            raise HTTPException(status_code=500, detail="Konversi PDF gagal (file tidak tercipta)")
            
    except Exception as e:
        print(f"[EXPORT ERROR] Detail: {e}")
        # Jika gagal konversi, minimal beri tahu alasan teknisnya (misal: Word tidak ada)
        raise HTTPException(status_code=500, detail=f"Gagal export PDF: {str(e)}")

@app.get("/api/notes/search/semantic")
async def semantic_search(q: str, limit: int = 10):
    results = embedding_engine.semantic_search(q, top_k=limit)
    # Map back to metadata
    full_results = []
    for res in results:
        meta = notes_index.notes.get(res["id"])
        if meta:
            full_results.append({**meta, "similarity": res["similarity"]})
    return full_results

@app.get("/api/notes/search/text")
async def text_search(q: str, limit: int = 20):
    return notes_index.search_text(q, max_results=limit)

@app.get("/api/notes/daily/today")
async def get_daily_today():
    note = notes_index.get_daily_note()
    if not note:
        note = notes_index.create_daily_note()
    return note

@app.post("/api/notes/ask")
async def ask_bocchi_notes(data: NoteAsk):
    try:
        # RAG implementation
        context = ""
        
        # 1. Cari konteks yang relevan
        if data.note_id:
            # Jika user sedang buka note tertentu, gunakan note itu sebagai konteks utama
            note = notes_index.get_note(data.note_id)
            if note:
                context = f"--- KONTEKS NOTE SAAT INI ({note['title']}) ---\n{note['content']}\n\n"
        
        # 2. Tambah konteks dari semantic search
        similar = embedding_engine.semantic_search(data.question, top_k=3)
        if similar:
            context += "--- KONTEKS TERKAIT LAINNYA ---\n"
            for res in similar:
                if res["id"] != data.note_id:
                    note = notes_index.get_note(res["id"])
                    if note:
                        context += f"Note: {note['title']}\n{note['content'][:1000]}\n\n"

        # 3. Kirim ke Ollama
        prompt = f"""Kamu adalah Hitori 'Bocchi' Gotoh dari anime Bocchi the Rock!. Kamu sangat pemalu, sering panik, tapi sangat peduli.
Gunakan data catatan (notes) di bawah ini untuk menjawab pertanyaan Senpai. 
Jika jawabannya tidak ada di catatan, bilang saja sejujurnya dengan gaya bicaramu yang gugup tapi berusaha membantu.

KONTEKS CATATAN:
{context}

PERTANYAAN SENPAI:
{data.question}

Jawablah dengan gaya Bocchi (gunakan s-s-sperti ini jika gugup, panggil user sebagai Senpai)."""

        response = requests.post(
            os_tools.OLLAMA_URL,
            json={
                "model": os_tools.MODEL_NAME,
                "prompt": prompt,
                "stream": False
            },
            timeout=180
        )
        response.raise_for_status()
        result = response.json()
        return {"answer": result.get("response", ""), "status": "success"}

    except Exception as e:
        print(f"[NOTES ASK ERROR] {e}")
        return {"status": "error", "message": str(e)}

@app.post("/api/notes/deep-search")
async def deep_search(data: DeepSearchRequest):
    try:
        # 1. Local Semantic Search
        local_results = embedding_engine.semantic_search(data.query, top_k=5)
        local_context = ""
        local_node_ids = []
        
        for res in local_results:
            note = notes_index.get_note(res["id"])
            if note:
                local_context += f"Note: {note['title']}\n{note['content'][:1000]}\n\n"
                local_node_ids.append(res["id"])
                # Graph Expansion: Add neighbors
                neighbors = notes_index.get_outgoing_links(res["id"]) + notes_index.get_backlinks(res["id"])
                for neighbor in neighbors[:2]: # Limit neighbors
                    n_id = neighbor.get("id") or neighbor.get("to") or neighbor.get("from")
                    if n_id and n_id not in local_node_ids:
                        neighbor_note = notes_index.get_note(n_id)
                        if neighbor_note:
                            local_context += f"Related Note (Graph): {neighbor_note['title']}\n{neighbor_note['content'][:500]}\n\n"
                            local_node_ids.append(n_id)

        # 2. Web Search
        web_context = ""
        web_results_list = []
        if data.include_web:
            print(f"[DEEP SEARCH] Searching web for: {data.query}")
            web_raw = os_tools.cari_di_internet(data.query)
            web_context = f"--- WEB SEARCH RESULTS ---\n{web_raw}\n"
            # Extract URLs for the frontend
            web_results_list = re.findall(r'URL: (https?://\S+)', web_raw)

        # 3. LLM Synthesis
        prompt = f"""Kamu adalah Hitori 'Bocchi' Gotoh. Gunakan data catatan internal dan hasil pencarian web di bawah ini untuk memberikan penjelasan mendalam kepada Senpai.
        
        BANDINGKAN apa yang ada di catatan internal dengan apa yang ada di internet jika relevan.
        Gaya bicara: Sangat pemalu, gugup (gagap s-s-seperti ini), panggil user 'Senpai'.
        
        CATATAN INTERNAL KITA:
        {local_context if local_context else "Tidak ada catatan internal yang relevan."}
        
        HASIL PENCARIAN WEB:
        {web_context if web_context else "Tidak mencari di web."}
        
        PERTANYAAN SENPAI: {data.query}
        """

        response = requests.post(
            os_tools.OLLAMA_URL,
            json={
                "model": os_tools.MODEL_NAME,
                "prompt": prompt,
                "stream": False
            },
            timeout=240
        )
        response.raise_for_status()
        result = response.json()
        insight = result.get("response", "")

        return {
            "insight": insight,
            "local_node_ids": list(set(local_node_ids)),
            "web_results": web_results_list,
            "status": "success"
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}

# ============================================================
# PROJECT REPORTING API (Phase 4)
# ============================================================

@app.get("/api/reports/templates")
async def list_report_templates():
    """List available report structures."""
    return {
        "templates": [
            {
                "id": "weekly-sync",
                "name": "Weekly Sync Report",
                "description": "Ringkasan aktivitas tim dan progres mingguan.",
                "icon": "Calendar"
            },
            {
                "id": "monthly-audit",
                "name": "Monthly Financial Audit",
                "description": "Analisis mendalam penggunaan Kessoku Points dan milestone.",
                "icon": "BarChart2"
            },
            {
                "id": "project-summary",
                "name": "Project Strategic Overview",
                "description": "Ringkasan tingkat tinggi untuk folder proyek tertentu.",
                "icon": "Target"
            }
        ]
    }

class ReportGenerateRequest(BaseModel):
    template_id: str
    folder: Optional[str] = None
    user_nama: str = "Senpai"

@app.post("/api/reports/generate")
async def generate_project_report(data: ReportGenerateRequest):
    """Generate professional Markdown reports using AI synthesis."""
    try:
        print(f"[REPORT] Generating {data.template_id} for {data.user_nama}...")
        
        # 1. Gather Context
        finance_data = agent_logger.load_finance()
        agent_ids = ["lead", "soft", "docs", "mon", "scout", "analyst", "content"]
        all_logs = {}
        for aid in agent_ids:
            all_logs[aid] = agent_logger.get_agent_logs(aid, limit=10)
            
        # Context from notes
        recent_notes = notes_index.list_notes(root_folder=data.folder, limit=10)
        notes_context = ""
        for n in recent_notes:
            notes_context += f"- {n['title']} (Tag: {', '.join(n['tags'])})\n"

        # 2. Prepare Prompt based on template
        if data.template_id == "weekly-sync":
            prompt_type = "Weekly Mission Sync Report"
            specific_focus = "Fokus pada progres tugas, blocker, dan rencana minggu depan."
        elif data.template_id == "monthly-audit":
            prompt_type = "Monthly Neural Audit"
            specific_focus = "Fokus pada statistik Kessoku Points, efisiensi tim, dan milestone besar."
        else:
            prompt_type = "Project Strategic Brief"
            specific_focus = "Fokus pada gambaran umum proyek dan status arsitektur."

        prompt = f"""Kamu adalah Bocchi (Hitori Gotou), Documentation Specialist yang bertugas menyusun laporan resmi perusahaan.
Meskipun kamu sangat pemalu dan gugup, kamu harus membuat laporan ini terlihat sangat profesional namun tetap memiliki sentuhan persona dirimu (sedikit gagap di intro/outro).

Tipe Laporan: {prompt_type}
Fokus: {specific_focus}

DATA KONTEKS:
1. FINANCE (Kessoku Points): {json.dumps(finance_data, indent=2)}
2. AKTIVITAS AGENT TERAKHIR: {json.dumps(all_logs, indent=2)}
3. CATATAN TERBARU:
{notes_context}

INSTRUKSI FORMATTING:
- Gunakan Markdown yang cantik.
- Gunakan elemen Cyberpunk (misal: [STRICTLY CONFIDENTIAL], Neural Link Status: OK).
- Buat tabel jika ada data angka.
- Jangan terlalu panjang, padat dan informatif.
- Gunakan bahasa Indonesia yang campur dengan istilah teknis English.

Jawab hanya dengan konten Markdown laporan tersebut."""

        # 3. Call LLM
        response = requests.post(
            os_tools.OLLAMA_URL,
            json={
                "model": os_tools.MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.4}
            },
            timeout=300
        )
        response.raise_for_status()
        report_md = response.json().get("response", "")

        return {
            "status": "success",
            "content": report_md,
            "title": f"Report_{data.template_id}_{datetime.datetime.now().strftime('%Y%m%d')}"
        }

    except Exception as e:
        print(f"[REPORT ERROR] {e}")
        return {"status": "error", "message": str(e)}

# ============================================================
# CALENDAR ENDPOINTS
# ============================================================
@app.get("/api/calendar/events")
async def get_calendar_events():
    try:
        if not os.path.exists("token.json"):
            return {"status": "error", "message": "token.json not found. Please authenticate first."}
        
        # Load credentials from token.json
        creds = Credentials.from_authorized_user_file("token.json", ["https://www.googleapis.com/auth/calendar.readonly"])
        service = build("calendar", "v3", credentials=creds)
        
        # Fetch upcoming 10 events
        now = datetime.datetime.utcnow().isoformat() + "Z"  # 'Z' indicates UTC time
        events_result = (
            service.events()
            .list(
                calendarId="primary",
                timeMin=now,
                maxResults=10,
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
        )
        events = events_result.get("items", [])
        return {"status": "success", "events": events}
    except Exception as e:
        print(f"[CALENDAR ERROR] {e}")
        return {"status": "error", "message": str(e)}

