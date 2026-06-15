"""
simulation_routes.py — Router API untuk fitur 'Discuss Agent' (Multi-Agent Simulation)

Menyediakan endpoint untuk:
  - Memulai simulasi multi-agent dari dokumen yang di-upload
  - Melihat status dan log simulasi secara real-time
  - Meng-inject event ke simulasi yang sedang berjalan (God Intervention)
  - Chat langsung dengan agent tertentu
  - Menghentikan simulasi
  - Men-generate laporan hasil simulasi
  - Melihat info hardware
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio
import io
import uuid
from datetime import datetime

# --- Library untuk membaca dokumen ---
import PyPDF2
from docx import Document as DocxDocument

# --- Import dari simulation engine ---
from simulation_engine import (
    hardware_detector,
    scenario_parser,
    agent_factory,
    simulation_loop,
    god_intervention,
    report_generator,
    agent_chat,
    _get_db_connection,
)


# ============================================================
# PYDANTIC REQUEST MODELS
# ============================================================

class InjectEventRequest(BaseModel):
    """Body untuk endpoint inject event ke simulasi."""
    event: str


class ChatRequest(BaseModel):
    """Body untuk endpoint chat langsung dengan agent."""
    message: str


# ============================================================
# ROUTER SETUP
# ============================================================

simulation_router = APIRouter(prefix="/api/simulation", tags=["Simulation"])

# Registry untuk menyimpan asyncio task simulasi yang sedang berjalan
# Format: { sim_id: asyncio.Task }
_simulasi_aktif: Dict[str, asyncio.Task] = {}


# ============================================================
# UTILITY: Ekstrak teks dari file
# ============================================================

def ekstrak_teks_dari_file(nama_file: str, konten: bytes) -> str:
    """Mengekstrak teks dari berbagai jenis file (txt, pdf, docx, md, json)."""
    ekstensi = nama_file.lower().rsplit(".", 1)[-1] if "." in nama_file else ""

    if ekstensi == "txt":
        return konten.decode("utf-8", errors="ignore")

    elif ekstensi == "pdf":
        reader = PyPDF2.PdfReader(io.BytesIO(konten))
        teks = ""
        for halaman in reader.pages:
            teks += halaman.extract_text() or ""
        return teks

    elif ekstensi in ("docx", "doc"):
        doc = DocxDocument(io.BytesIO(konten))
        return "\n".join([p.text for p in doc.paragraphs])

    elif ekstensi in ("md", "json"):
        return konten.decode("utf-8", errors="ignore")

    else:
        return f"[Format .{ekstensi} belum didukung]"


# ============================================================
# 1. POST /start — Memulai simulasi baru
# ============================================================

@simulation_router.post("/start")
async def mulai_simulasi(
    files: List[UploadFile] = File(...),
    scenario: str = Form(...),
    max_turns: Optional[str] = Form(None),
    max_agents: Optional[str] = Form(None),
):
    """
    Memulai simulasi multi-agent baru.

    Proses:
      1. Ekstrak teks dari semua file yang di-upload
      2. Deteksi hardware untuk menentukan max_agents
      3. Parse skenario menjadi entitas / persona agent
      4. Buat agent di database
      5. Jalankan simulation loop di background
    """
    try:
        # --- 1. Ekstrak teks gabungan dari semua file ---
        daftar_teks: List[str] = []
        for berkas in files:
            konten = await berkas.read()
            teks = ekstrak_teks_dari_file(berkas.filename or "unknown.txt", konten)
            if teks.strip():
                daftar_teks.append(teks)

        teks_gabungan = "\n\n".join(daftar_teks)

        if not teks_gabungan.strip():
            return {
                "status": "error",
                "message": "Semua file kosong atau tidak bisa dibaca",
            }

        # --- 2. Deteksi hardware ---
        info_hardware = hardware_detector.detect()
        if max_agents and max_agents.isdigit():
            max_agents_val = int(max_agents)
        else:
            max_agents_val = info_hardware.get("max_agents", 4)

        # --- 3. Parse skenario -> entitas ---
        entities = await scenario_parser.parse(teks_gabungan, max_agents_val)

        # --- 4. Simpan metadata simulasi ke DB ---
        sim_id = str(uuid.uuid4())
        
        # Baca max_turns dari form jika ada
        if max_turns and max_turns.isdigit():
            max_turns_val = int(max_turns)
        else:
            max_turns_val = info_hardware.get("max_turns", 20)

        koneksi = _get_db_connection()
        cursor = koneksi.cursor()
        cursor.execute(
            """
            INSERT INTO simulations (id, scenario, status, current_turn, max_turns, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (sim_id, scenario, "running", 0, max_turns_val, datetime.utcnow().isoformat()),
        )
        koneksi.commit()
        koneksi.close()

        # --- 5. Buat agent di database ---
        daftar_agent = agent_factory.create_agents(sim_id, entities)

        # --- 6. Jalankan loop simulasi di background ---
        task = asyncio.create_task(
            simulation_loop.run_simulation(sim_id, max_turns_val)
        )
        _simulasi_aktif[sim_id] = task

        return {
            "status": "started",
            "sim_id": sim_id,
            "agents": daftar_agent,
            "max_turns": max_turns,
            "hardware_info": info_hardware,
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ============================================================
# 2. GET /{sim_id}/status — Status simulasi
# ============================================================

@simulation_router.get("/{sim_id}/status")
async def status_simulasi(sim_id: str):
    """Mengembalikan status simulasi, turn saat ini, dan daftar agent."""
    try:
        koneksi = _get_db_connection()
        cursor = koneksi.cursor()

        # Ambil metadata simulasi
        cursor.execute(
            "SELECT status, current_turn, max_turns FROM simulations WHERE id = ?",
            (sim_id,),
        )
        baris = cursor.fetchone()

        if not baris:
            koneksi.close()
            return {"status": "error", "message": f"Simulasi {sim_id} tidak ditemukan"}

        status_sim, turn_saat_ini, max_turns = baris

        # Ambil daftar agent beserta mood
        cursor.execute(
            "SELECT id, name, persona, goals, mood, avatar_color FROM agents WHERE sim_id = ?",
            (sim_id,),
        )
        kolom_agent = [desc[0] for desc in cursor.description]
        daftar_agent = [dict(zip(kolom_agent, row)) for row in cursor.fetchall()]

        koneksi.close()

        return {
            "status": status_sim,
            "sim_id": sim_id,
            "current_turn": turn_saat_ini,
            "max_turns": max_turns,
            "agents": daftar_agent,
            "is_running": sim_id in _simulasi_aktif and not _simulasi_aktif[sim_id].done(),
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ============================================================
# 3. GET /{sim_id}/logs — Log interaksi (paginasi)
# ============================================================

@simulation_router.get("/{sim_id}/logs")
async def log_simulasi(sim_id: str, page: int = 1, per_page: int = 50):
    """
    Mengembalikan log interaksi simulasi secara paginated.

    Setiap entry: turn, agent_id, agent_name, action_type, content,
    timestamp, target_agent_id.
    """
    try:
        if page < 1:
            page = 1
        if per_page < 1:
            per_page = 50

        offset = (page - 1) * per_page

        koneksi = _get_db_connection()
        cursor = koneksi.cursor()

        # Hitung total log
        cursor.execute(
            "SELECT COUNT(*) FROM interaction_logs WHERE sim_id = ?",
            (sim_id,),
        )
        total = cursor.fetchone()[0]

        # Ambil log untuk halaman ini
        cursor.execute(
            """
            SELECT turn, agent_id, agent_name, action_type, content,
                   timestamp, target_agent_id
            FROM interaction_logs
            WHERE sim_id = ?
            ORDER BY turn ASC, timestamp ASC
            LIMIT ? OFFSET ?
            """,
            (sim_id, per_page, offset),
        )
        kolom = [desc[0] for desc in cursor.description]
        logs = [dict(zip(kolom, row)) for row in cursor.fetchall()]

        koneksi.close()

        total_halaman = max(1, (total + per_page - 1) // per_page)

        return {
            "status": "success",
            "sim_id": sim_id,
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_halaman,
            "logs": logs,
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ============================================================
# 4. POST /{sim_id}/inject — Inject event (God Intervention)
# ============================================================

@simulation_router.post("/{sim_id}/inject")
async def inject_event(sim_id: str, body: InjectEventRequest):
    """
    Meng-inject event ke simulasi yang sedang berjalan.
    Contoh: bencana alam, krisis ekonomi, dsb.
    """
    try:
        # Pastikan simulasi masih berjalan
        if sim_id not in _simulasi_aktif or _simulasi_aktif[sim_id].done():
            return {
                "status": "error",
                "message": "Simulasi tidak sedang berjalan",
            }

        # Ambil turn saat ini
        koneksi = _get_db_connection()
        cursor = koneksi.cursor()
        cursor.execute(
            "SELECT current_turn FROM simulations WHERE id = ?",
            (sim_id,),
        )
        baris = cursor.fetchone()
        koneksi.close()

        if not baris:
            return {"status": "error", "message": f"Simulasi {sim_id} tidak ditemukan"}

        turn_saat_ini = baris[0]

        # Inject event via god_intervention module
        god_intervention.inject_event(sim_id, body.event)

        return {
            "status": "injected",
            "turn": turn_saat_ini,
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ============================================================
# 5. POST /{sim_id}/chat/{agent_id} — Chat dengan agent tertentu
# ============================================================

@simulation_router.post("/{sim_id}/chat/{agent_id}")
async def chat_dengan_agent(sim_id: str, agent_id: str, body: ChatRequest):
    """Chat langsung dengan salah satu agent di simulasi."""
    try:
        hasil = await agent_chat.chat_with_agent(sim_id, agent_id, body.message)

        return {
            "agent_id": hasil.get("agent_id", agent_id),
            "agent_name": hasil.get("agent_name", "Unknown"),
            "response": hasil.get("response", ""),
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ============================================================
# 6. POST /{sim_id}/stop — Hentikan simulasi
# ============================================================

@simulation_router.post("/{sim_id}/stop")
async def hentikan_simulasi(sim_id: str):
    """
    Menghentikan simulasi yang sedang berjalan.
    Membatalkan asyncio task dan mengubah status di DB.
    """
    try:
        # Cancel asyncio task jika masih berjalan
        if sim_id in _simulasi_aktif:
            task = _simulasi_aktif[sim_id]
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            del _simulasi_aktif[sim_id]

        # Update status di database
        koneksi = _get_db_connection()
        cursor = koneksi.cursor()
        cursor.execute(
            "UPDATE simulations SET status = ? WHERE id = ?",
            ("stopped", sim_id),
        )
        koneksi.commit()
        koneksi.close()

        return {"status": "stopped"}

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ============================================================
# 7. GET /{sim_id}/report — Generate laporan simulasi
# ============================================================

@simulation_router.get("/{sim_id}/report")
async def laporan_simulasi(sim_id: str):
    """Men-generate laporan hasil simulasi dalam format Markdown."""
    try:
        laporan = await report_generator.generate_report(sim_id)

        return {"report": laporan}

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ============================================================
# 8. GET /hardware-info — Info hardware untuk frontend
# ============================================================

@simulation_router.get("/hardware-info")
async def info_hardware():
    """Mengembalikan hasil deteksi hardware untuk ditampilkan di frontend."""
    try:
        info = hardware_detector.detect()

        return {
            "status": "success",
            "hardware": info,
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}
