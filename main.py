from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import requests
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    print("[SISTEM] \u2705 Qwen3-TTS berhasil dimuat dengan SDPA! \U0001f3a4")
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
        print("[SISTEM] \u2705 Qwen3-TTS berhasil dimuat (tanpa SDPA)! \U0001f3a4")
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
            print(f"[MEMORI] ✅ Berhasil memuat {len(data_memori)} ingatan masa lalu dari {MEMORY_FILE}")
        except Exception as e:
            print(f"[MEMORI ERROR] Gagal memuat file memori: {e}")

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
                print("[PROSES] \u2705 Qwen3-TTS berhasil membuat suara!")

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
        
        print(f"[STORY] ✅ Selesai! Total {len(final_scenes)} scenes generated")
        
        return {
            "status": "berhasil",
            "filename": file.filename,
            "total_scenes": len(final_scenes),
            "scenes": final_scenes,
            "tipe": "chapter",
            "judul": file.filename.rsplit('.', 1)[0].replace('_', ' ').replace('-', ' ').title()
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
                timeout=60
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
            timeout=60
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
        print(f"[STORY ASK ERROR] {e}")
        return {
            "status": "gagal",
            "dialog": f"G-gomen... ada error: {str(e)[:100]}",
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