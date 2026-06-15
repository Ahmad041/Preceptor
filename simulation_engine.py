"""
Simulation Engine — Multi-Agent Sandbox untuk Discuss Agent
Membuat simulasi digital di mana AI agent berinteraksi dan memprediksi outcome.

Fitur utama:
- HardwareDetector: Deteksi GPU/RAM untuk menentukan kapasitas agent
- ScenarioParser: Parse dokumen untuk ekstraksi karakter/entitas
- AgentFactory: Membuat agent records di SQLite
- SimulationLoop: Turn-based simulation engine dengan asyncio
- GodIntervention: Injeksi event ke simulasi
- ReportGenerator: Generate laporan markdown dari hasil simulasi
- AgentChat: Private 1-on-1 chat dengan agent tertentu
"""

import os
import uuid
import json
import sqlite3
import asyncio
import random
import requests
from datetime import datetime
from typing import Optional

# ============================================================
# CONFIG
# ============================================================

OLLAMA_API_URL = "http://localhost:11434/api/generate"
DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DB_PATH = os.path.join(DB_DIR, "simulations.db")

AVATAR_PALETTE = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
    "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
    "#BB8FCE", "#85C1E9", "#F0B27A", "#82E0AA",
    "#F1948A", "#AED6F1", "#D5DBDB", "#FAD7A0",
]

# ============================================================
# DATABASE INITIALIZATION
# ============================================================

def _get_db_connection() -> sqlite3.Connection:
    """Buat koneksi SQLite dengan row_factory."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _init_database():
    """Inisialisasi schema database simulasi."""
    conn = _get_db_connection()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS simulations (
                id TEXT PRIMARY KEY,
                title TEXT,
                scenario TEXT,
                status TEXT DEFAULT 'setup',
                created_at TIMESTAMP,
                updated_at TIMESTAMP,
                max_turns INT DEFAULT 20,
                current_turn INT DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                sim_id TEXT,
                name TEXT,
                persona TEXT,
                goals TEXT,
                mood TEXT DEFAULT 'neutral',
                memory TEXT DEFAULT '[]',
                avatar_color TEXT,
                FOREIGN KEY (sim_id) REFERENCES simulations(id)
            );

            CREATE TABLE IF NOT EXISTS interaction_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sim_id TEXT,
                turn INT,
                agent_id TEXT,
                agent_name TEXT,
                action_type TEXT,
                content TEXT,
                timestamp TIMESTAMP,
                target_agent_id TEXT NULL,
                FOREIGN KEY (sim_id) REFERENCES simulations(id)
            );

            CREATE TABLE IF NOT EXISTS interventions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sim_id TEXT,
                turn INT,
                content TEXT,
                injected_by TEXT DEFAULT 'user',
                timestamp TIMESTAMP,
                FOREIGN KEY (sim_id) REFERENCES simulations(id)
            );
        """)
        conn.commit()
        print("[SimEngine] Database initialized successfully")
    except Exception as e:
        print(f"[SimEngine] Error initializing database: {e}")
    finally:
        conn.close()


# Jalankan inisialisasi saat module di-import
_init_database()

# ============================================================
# LLM HELPER
# ============================================================

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODELS = [
    "openai/gpt-oss-120b:free",
    "poolside/laguna-m.1:free",
    "nvidia/nemotron-3-nano-30b-a3b:free"
]

async def _call_llm(prompt: str, fallback_ollama_model: str, system_prompt: str = "") -> str:
    """
    Panggil LLM via OpenRouter. Jika gagal semua, fallback ke Ollama.
    Return string kosong jika gagal semua.
    """
    if OPENROUTER_API_KEY:
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": "AI Desktop App Simulation"
        }
        
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                for model in OPENROUTER_MODELS:
                    messages = []
                    if system_prompt:
                        messages.append({"role": "system", "content": system_prompt})
                    messages.append({"role": "user", "content": prompt})
                    
                    payload = {
                        "model": model,
                        "messages": messages,
                    }
                    
                    try:
                        async with session.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=30) as resp:
                            resp.raise_for_status()
                            data = await resp.json()
                            if "choices" in data and len(data["choices"]) > 0:
                                return data["choices"][0]["message"]["content"].strip()
                    except Exception as e:
                        print(f"[SimEngine] OpenRouter {model} failed: {e}")
                        continue
        except ImportError:
            print("[SimEngine] aiohttp tidak terinstal, lewati OpenRouter")
            pass

    print(f"[SimEngine] Falling back to Ollama model: {fallback_ollama_model}")
    payload = {
        "model": fallback_ollama_model,
        "prompt": prompt,
        "stream": False,
    }
    if system_prompt:
        payload["system"] = system_prompt

    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.post(OLLAMA_API_URL, json=payload, timeout=120) as resp:
                resp.raise_for_status()
                data = await resp.json()
                return data.get("response", "").strip()
    except ImportError:
        print("[SimEngine] aiohttp tidak terinstal, gunakan fallback dummy")
        return ""
    except aiohttp.ClientError as e:
        print(f"[SimEngine] Ollama connection error: {e}")
        return ""
    except asyncio.TimeoutError:
        print("[SimEngine] Ollama request timeout (120s)")
        return ""
    except Exception as e:
        print(f"[SimEngine] Error calling Ollama: {e}")
        return ""


# ============================================================
# 1. HARDWARE DETECTOR
# ============================================================

class HardwareDetector:
    """Deteksi GPU VRAM dan system RAM untuk menentukan kapasitas simulasi."""

    def __init__(self):
        self._cached_config: Optional[dict] = None

    def detect(self) -> dict:
        """
        Deteksi hardware dan return konfigurasi yang direkomendasikan.
        Return: {vram_gb, ram_gb, max_agents, recommended_model}
        """
        if self._cached_config is not None:
            return self._cached_config

        vram_gb = 0.0
        ram_gb = 0.0

        # Deteksi RAM sistem
        try:
            import psutil
            ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)
        except ImportError:
            print("[HardwareDetector] psutil tidak terinstal, RAM tidak terdeteksi")
        except Exception as e:
            print(f"[HardwareDetector] Error deteksi RAM: {e}")

        # Deteksi VRAM GPU via PyTorch
        try:
            import torch
            if torch.cuda.is_available():
                vram_bytes = torch.cuda.get_device_properties(0).total_mem
                vram_gb = round(vram_bytes / (1024 ** 3), 1)
                print(f"[HardwareDetector] GPU: {torch.cuda.get_device_name(0)}, VRAM: {vram_gb}GB")
            else:
                print("[HardwareDetector] CUDA tidak tersedia, mode CPU-only")
        except ImportError:
            print("[HardwareDetector] PyTorch tidak terinstal, asumsi CPU-only")
        except Exception as e:
            print(f"[HardwareDetector] Error deteksi GPU: {e}")

        # Tentukan kapasitas berdasarkan VRAM
        if vram_gb >= 8:
            max_agents = 8
            recommended_model = "qwen2.5:7b"
        elif vram_gb >= 4:
            max_agents = 5
            recommended_model = "qwen2.5:3b"
        else:
            max_agents = 3
            recommended_model = "gemma2:2b"

        result = {
            "vram_gb": vram_gb,
            "ram_gb": ram_gb,
            "max_agents": max_agents,
            "recommended_model": recommended_model,
        }

        print(f"[HardwareDetector] Config: {result}")
        self._cached_config = result
        return result


# ============================================================
# 2. SCENARIO PARSER
# ============================================================

class ScenarioParser:
    """Parse dokumen untuk mengekstrak karakter/entitas sebagai seed agent."""

    def __init__(self):
        self._hw_config: Optional[dict] = None

    def _get_hw_config(self) -> dict:
        """Lazy-load hardware config."""
        if self._hw_config is None:
            self._hw_config = hardware_detector.detect()
        return self._hw_config

    async def parse(self, document_text: str, max_agents: Optional[int] = None) -> list[dict]:
        """
        Parse dokumen dan ekstrak entitas untuk jadi agent.
        Return list of dicts: [{name, personality, goals, relationships}, ...]
        """
        hw = self._get_hw_config()
        if max_agents is None:
            max_agents = hw["max_agents"]
        model = hw["recommended_model"]

        # Batasi teks dokumen agar tidak terlalu panjang untuk prompt
        truncated_text = document_text[:3000]

        prompt = f"""Analisis dokumen/skenario berikut dan ekstrak antara 2 hingga {max_agents} karakter atau entitas kunci yang dapat disimulasikan sebagai agen AI.

Untuk setiap karakter/entitas, berikan:
- name: Nama yang jelas
- personality: Sifat kepribadian utama (2-3 kalimat)
- goals: Apa yang ingin mereka capai (1-2 kalimat)
- relationships: Bagaimana hubungan mereka dengan karakter lain (1 kalimat)

PENTING: Gunakan Bahasa Indonesia.
PENTING: Balas HANYA dengan array JSON yang valid. Tanpa penjelasan, tanpa markdown, hanya JSON.

Format contoh:
[
  {{"name": "Budi", "personality": "Kritis dan hati-hati. Lebih suka keputusan berbasis data.", "goals": "Meningkatkan efisiensi sekaligus menekan risiko.", "relationships": "Bekerja sama dengan Andi tapi sering berdebat dengan Citra tentang strategi."}},
  {{"name": "Andi", "personality": "Optimis dan kreatif. Suka mencari ide baru.", "goals": "Membawa solusi inovatif ke dalam tim.", "relationships": "Sekutu dekat Budi, namun sangat menghargai pengalaman Citra."}}
]

Dokumen/Skenario:
---
{truncated_text}
---

Respons JSON:"""

        # Panggil LLM secara async
        raw_response = await _call_llm(prompt, model)
        if raw_response:
            parsed = self._extract_json_array(raw_response)
            if parsed and len(parsed) >= 2:
                # Pastikan tidak melebihi max_agents
                return parsed[:max_agents]
            print("[ScenarioParser] Gagal parse JSON dari Ollama, pakai fallback")

        # Fallback: buat generic agents dari skenario
        print("[ScenarioParser] Menggunakan fallback parser (tanpa Ollama)")
        return self._fallback_parse(document_text, max_agents)

    def _extract_json_array(self, text: str) -> list[dict]:
        """Ekstrak JSON array dari response teks (kadang ada noise di luar JSON)."""
        # Cari JSON array pattern
        text = text.strip()

        # Coba langsung parse
        try:
            result = json.loads(text)
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

        # Cari bracket pattern [ ... ]
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1 and end > start:
            try:
                result = json.loads(text[start:end + 1])
                if isinstance(result, list):
                    return result
            except json.JSONDecodeError:
                pass

        return []

    def _fallback_parse(self, document_text: str, max_agents: int) -> list[dict]:
        """Fallback: buat agent generik dari kata kunci dalam skenario."""
        # Daftar template persona generik
        templates = [
            {
                "name": "Analis",
                "personality": "Berpikir analitis dan kritis. Selalu mempertanyakan asumsi dan mencari data pendukung.",
                "goals": "Memahami situasi secara mendalam dan membuat keputusan berdasarkan fakta.",
                "relationships": "Sering berdebat dengan Optimis tapi menghargai perspektif Mediator.",
            },
            {
                "name": "Optimis",
                "personality": "Bersemangat dan penuh ide kreatif. Melihat peluang di setiap tantangan.",
                "goals": "Mendorong inovasi dan solusi baru yang belum pernah dicoba.",
                "relationships": "Bertentangan dengan Analis soal risiko, tapi dekat dengan Eksekutor.",
            },
            {
                "name": "Mediator",
                "personality": "Diplomatis dan empatis. Selalu berusaha mencari jalan tengah dan memahami semua pihak.",
                "goals": "Menjaga harmoni kelompok dan memastikan semua suara didengar.",
                "relationships": "Dihormati oleh semua pihak sebagai penengah yang adil.",
            },
            {
                "name": "Eksekutor",
                "personality": "Pragmatis dan berorientasi aksi. Tidak sabar dengan diskusi panjang tanpa hasil.",
                "goals": "Mengubah rencana menjadi tindakan nyata secepat mungkin.",
                "relationships": "Sering mendukung ide Optimis dan meminta Analis untuk lebih cepat.",
            },
            {
                "name": "Skeptis",
                "personality": "Berhati-hati dan selalu mempertimbangkan worst-case scenario.",
                "goals": "Melindungi kelompok dari keputusan gegabah dan risiko tersembunyi.",
                "relationships": "Sering bertentangan dengan Optimis, tapi diam-diam setuju dengan Analis.",
            },
            {
                "name": "Visioner",
                "personality": "Berpikir jangka panjang dan strategis. Melihat gambaran besar yang sering terlewat.",
                "goals": "Mengarahkan kelompok menuju visi masa depan yang ambisius.",
                "relationships": "Mengagumi kreativitas Optimis, tapi khawatir dengan impulsifnya Eksekutor.",
            },
            {
                "name": "Praktisi",
                "personality": "Berpengalaman dan realistis. Memiliki pengetahuan teknis yang dalam.",
                "goals": "Memastikan solusi yang dipilih benar-benar bisa diimplementasikan.",
                "relationships": "Menghargai ketelitian Analis dan ketegasan Eksekutor.",
            },
            {
                "name": "Advokat",
                "personality": "Vokal dan penuh semangat. Selalu membela kepentingan pihak yang kurang terdengar.",
                "goals": "Memastikan keadilan dan keseimbangan dalam setiap keputusan.",
                "relationships": "Sangat dekat dengan Mediator, sering menantang Skeptis.",
            },
        ]

        # Ambil sejumlah max_agents dari template, minimum 2
        count = max(2, min(max_agents, len(templates)))
        selected = templates[:count]

        # Tambahkan konteks skenario ke persona
        scenario_snippet = document_text[:200].strip()
        for agent in selected:
            agent["personality"] += f" Beroperasi dalam konteks: {scenario_snippet}"

        return selected


# ============================================================
# 3. AGENT FACTORY
# ============================================================

class AgentFactory:
    """Membuat dan menyimpan agent records ke database SQLite."""

    def create_agents(self, sim_id: str, entities: list[dict]) -> list[dict]:
        """
        Buat agent dari parsed entities dan simpan ke database.
        Return list of agent dicts yang sudah tersimpan.
        """
        conn = _get_db_connection()
        created_agents = []
        used_colors = set()

        try:
            for entity in entities:
                agent_id = str(uuid.uuid4())

                # Pilih warna avatar unik
                available_colors = [c for c in AVATAR_PALETTE if c not in used_colors]
                if not available_colors:
                    available_colors = AVATAR_PALETTE.copy()
                avatar_color = random.choice(available_colors)
                used_colors.add(avatar_color)

                name = entity.get("name", f"Agent-{agent_id[:6]}")
                persona = entity.get("personality", "Seorang agent yang netral dan objektif.")
                goals = entity.get("goals", "Berpartisipasi dalam diskusi dan mencari solusi.")
                relationships = entity.get("relationships", "")

                # Gabungkan persona dengan relationships untuk konteks lebih kaya
                full_persona = persona
                if relationships:
                    full_persona += f"\nRelasi: {relationships}"

                conn.execute(
                    """INSERT INTO agents (id, sim_id, name, persona, goals, mood, memory, avatar_color)
                       VALUES (?, ?, ?, ?, ?, 'neutral', '[]', ?)""",
                    (agent_id, sim_id, name, full_persona, goals, avatar_color)
                )

                agent_dict = {
                    "id": agent_id,
                    "sim_id": sim_id,
                    "name": name,
                    "persona": full_persona,
                    "goals": goals,
                    "mood": "neutral",
                    "memory": [],
                    "avatar_color": avatar_color,
                }
                created_agents.append(agent_dict)
                print(f"[AgentFactory] Created agent: {name} ({agent_id[:8]}...) [{avatar_color}]")

            conn.commit()
        except Exception as e:
            print(f"[AgentFactory] Error creating agents: {e}")
            conn.rollback()
        finally:
            conn.close()

        return created_agents


# ============================================================
# 4. SIMULATION LOOP
# ============================================================

class SimulationLoop:
    """Core turn-based simulation engine menggunakan asyncio."""

    def __init__(self):
        self._running_simulations: dict[str, asyncio.Task] = {}
        self._stop_flags: dict[str, bool] = {}

    def _get_model(self) -> str:
        """Ambil model yang direkomendasikan dari hardware detector."""
        hw = hardware_detector.detect()
        return hw["recommended_model"]

    def _get_agents(self, sim_id: str) -> list[dict]:
        """Ambil semua agent untuk simulasi tertentu."""
        conn = _get_db_connection()
        try:
            rows = conn.execute(
                "SELECT * FROM agents WHERE sim_id = ?", (sim_id,)
            ).fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def _get_recent_logs(self, sim_id: str, limit: int = 10) -> list[dict]:
        """Ambil interaction logs terbaru."""
        conn = _get_db_connection()
        try:
            rows = conn.execute(
                """SELECT * FROM interaction_logs
                   WHERE sim_id = ?
                   ORDER BY timestamp DESC
                   LIMIT ?""",
                (sim_id, limit)
            ).fetchall()
            # Balik urutannya agar kronologis
            return [dict(row) for row in reversed(rows)]
        finally:
            conn.close()

    def _get_turn_interventions(self, sim_id: str, turn: int) -> list[dict]:
        """Ambil semua intervensi untuk turn tertentu."""
        conn = _get_db_connection()
        try:
            rows = conn.execute(
                """SELECT * FROM interventions
                   WHERE sim_id = ? AND turn = ?
                   ORDER BY timestamp ASC""",
                (sim_id, turn)
            ).fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def _build_agent_context(
        self,
        agent: dict,
        recent_logs: list[dict],
        interventions: list[dict],
        all_agents: list[dict],
        current_turn: int,
    ) -> str:
        """Bangun konteks lengkap untuk satu agent."""
        # Header persona
        context = f"""Anda adalah agen AI yang berpartisipasi dalam sebuah diskusi simulasi.
Nama Anda: {agent['name']}
Kepribadian/Karakter Anda: {agent.get('persona', '')}
Tujuan Anda: {agent.get('goals', '')}
Suasana Hati Saat Ini: {agent.get('mood', 'neutral')}

Agen lain dalam simulasi ini:
"""
        for other in all_agents:
            if other["id"] != agent["id"]:
                context += f"- {other['name']}: mood={other['mood']}\n"

        # Riwayat interaksi terbaru
        if recent_logs:
            context += "\nRIWAYAT PERCAKAPAN TERBARU:\n"
            for log in recent_logs:
                prefix = f"[Giliran {log['turn']}] {log['agent_name']}"
                if log.get("target_agent_id"):
                    # Cari nama target
                    target_name = "seseorang"
                    for a in all_agents:
                        if a["id"] == log["target_agent_id"]:
                            target_name = a["name"]
                            break
                    prefix += f" (kepada {target_name})"
                context += f"{prefix}: {log['content']}\n"

        # Intervensi (God Events)
        if interventions:
            context += "\n🌟 PERISTIWA PENTING PADA GILIRAN INI:\n"
            for intervention in interventions:
                context += f"- {intervention['content']}\n"

        # Instruksi aksi
        context += f"""
GILIRAN SAAT INI: {current_turn}

Berdasarkan kepribadian, tujuan, suasana hati Anda, dan percakapan sejauh ini, tentukan aksi Anda selanjutnya.
PENTING: Anda DIWAJIBKAN untuk berkomunikasi sepenuhnya dalam Bahasa Indonesia.

Anda HARUS merespons dengan format JSON yang valid seperti ini:
{{
  "action_type": "speak_group" | "speak_to" | "take_action" | "search_web",
  "target_agent": "nama agen target (hanya jika action_type adalah speak_to, jika tidak null)",
  "url": "URL yang ingin diambil (hanya jika action_type adalah search_web)",
  "content": "apa yang Anda katakan atau lakukan (HARUS DALAM BAHASA INDONESIA)",
  "mood_update": "suasana hati Anda yang baru (satu kata: senang, marah, sedih, cemas, antusias, netral, frustrasi, berharap, curiga, percaya diri)"
}}

Balas HANYA dengan JSON tersebut. Tetaplah dalam karakter. Singkat namun bermakna.
"""
        return context

    def _parse_agent_response(self, raw: str, agent: dict, all_agents: list[dict]) -> dict:
        """Parse response JSON dari agent. Fallback jika gagal parse."""
        # Coba parse JSON langsung
        try:
            result = json.loads(raw.strip())
            if isinstance(result, dict) and "content" in result:
                return result
        except json.JSONDecodeError:
            pass

        # Cari JSON object pattern { ... }
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                result = json.loads(raw[start:end + 1])
                if isinstance(result, dict) and "content" in result:
                    return result
            except json.JSONDecodeError:
                pass

        # Fallback: gunakan raw text sebagai speech
        return {
            "action_type": "speak_group",
            "target_agent": None,
            "content": raw.strip()[:500] if raw.strip() else f"{agent['name']} sedang berpikir...",
            "mood_update": agent.get("mood", "neutral"),
        }

    def _resolve_target_agent_id(self, target_name: Optional[str], all_agents: list[dict]) -> Optional[str]:
        """Cari agent ID berdasarkan nama target."""
        if not target_name:
            return None
        target_lower = target_name.lower().strip()
        for agent in all_agents:
            if agent["name"].lower().strip() == target_lower:
                return agent["id"]
        return None

    async def run_turn(self, sim_id: str):
        """
        Jalankan satu turn simulasi:
        Setiap agent melihat konteks lalu membuat aksi.
        """
        conn = _get_db_connection()
        try:
            sim_row = conn.execute(
                "SELECT * FROM simulations WHERE id = ?", (sim_id,)
            ).fetchone()
            if not sim_row:
                print(f"[SimLoop] Simulation {sim_id} not found")
                return
            current_turn = sim_row["current_turn"] + 1
        finally:
            conn.close()

        model = self._get_model()
        all_agents = self._get_agents(sim_id)
        recent_logs = self._get_recent_logs(sim_id, limit=10)
        interventions = self._get_turn_interventions(sim_id, current_turn)

        print(f"[SimLoop] === Turn {current_turn} === ({len(all_agents)} agents)")

        for agent in all_agents:
            # Cek stop flag
            if self._stop_flags.get(sim_id, False):
                print(f"[SimLoop] Simulation {sim_id} stopped by user")
                return

            # Bangun konteks
            context = self._build_agent_context(
                agent, recent_logs, interventions, all_agents, current_turn
            )

            # Panggil LLM secara async
            raw_response = await _call_llm(context, model)

            if not raw_response:
                # Fallback jika LLM tidak tersedia
                raw_response = json.dumps({
                    "action_type": "speak_group",
                    "target_agent": None,
                    "content": f"*{agent['name']} mengamati situasi dengan seksama*",
                    "mood_update": agent.get("mood", "neutral"),
                })

            # Parse response
            parsed = self._parse_agent_response(raw_response, agent, all_agents)

            action_type = parsed.get("action_type", "speak_group")
            content = parsed.get("content", "...")
            mood_update = parsed.get("mood_update", agent.get("mood", "neutral"))
            target_name = parsed.get("target_agent")
            target_agent_id = self._resolve_target_agent_id(target_name, all_agents)

            if action_type == "search_web":
                url = parsed.get("url", "")
                if url:
                    try:
                        import requests
                        from bs4 import BeautifulSoup
                        print(f"[SimLoop] {agent['name']} is searching web: {url}")
                        # Berikan header browser agar tidak diblokir beberapa web
                        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
                        resp = requests.get(url, headers=headers, timeout=10)
                        soup = BeautifulSoup(resp.content, "html.parser")
                        text = soup.get_text(separator=" ", strip=True)
                        snippet = text[:1500] + "..." if len(text) > 1500 else text
                        
                        content = f"Saya telah mengakses website {url} dan menemukan informasi ini:\\n{snippet}"
                        action_type = "take_action"
                    except Exception as e:
                        content = f"Saya mencoba mengakses website {url} namun gagal: {e}"
                        action_type = "take_action"
                else:
                    content = "Saya bermaksud mengakses internet namun lupa menentukan URL yang dituju."
                    action_type = "take_action"

            # Simpan ke interaction_logs
            now = datetime.now().isoformat()
            conn = _get_db_connection()
            try:
                conn.execute(
                    """INSERT INTO interaction_logs
                       (sim_id, turn, agent_id, agent_name, action_type, content, timestamp, target_agent_id)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (sim_id, current_turn, agent["id"], agent["name"],
                     action_type, content, now, target_agent_id)
                )

                # Update mood agent
                conn.execute(
                    "UPDATE agents SET mood = ? WHERE id = ?",
                    (mood_update, agent["id"])
                )

                # Update memory agent (append log singkat, max 20 entries)
                try:
                    current_memory = json.loads(agent.get("memory", "[]"))
                except (json.JSONDecodeError, TypeError):
                    current_memory = []
                current_memory.append({
                    "turn": current_turn,
                    "action": action_type,
                    "content": content[:200],
                })
                # Batasi memory agar tidak membengkak
                if len(current_memory) > 20:
                    current_memory = current_memory[-20:]
                conn.execute(
                    "UPDATE agents SET memory = ? WHERE id = ?",
                    (json.dumps(current_memory), agent["id"])
                )

                conn.commit()
            except Exception as e:
                print(f"[SimLoop] Error saving turn data: {e}")
                conn.rollback()
            finally:
                conn.close()

            # Update recent_logs agar agent berikutnya melihat aksi ini
            recent_logs.append({
                "turn": current_turn,
                "agent_id": agent["id"],
                "agent_name": agent["name"],
                "action_type": action_type,
                "content": content,
                "target_agent_id": target_agent_id,
            })
            # Batasi hanya 10 terakhir
            if len(recent_logs) > 10:
                recent_logs = recent_logs[-10:]

            print(f"  [{agent['name']}] ({action_type}) {content[:80]}...")

        # Update turn counter dan timestamp
        conn = _get_db_connection()
        try:
            conn.execute(
                """UPDATE simulations
                   SET current_turn = ?, updated_at = ?
                   WHERE id = ?""",
                (current_turn, datetime.now().isoformat(), sim_id)
            )
            conn.commit()
        finally:
            conn.close()

    async def run_simulation(self, sim_id: str, max_turns: Optional[int] = None):
        """
        Jalankan simulasi penuh dari turn saat ini sampai max_turns.
        Bisa dihentikan via stop_simulation().
        """
        self._stop_flags[sim_id] = False

        conn = _get_db_connection()
        try:
            sim_row = conn.execute(
                "SELECT * FROM simulations WHERE id = ?", (sim_id,)
            ).fetchone()
            if not sim_row:
                print(f"[SimLoop] Simulation {sim_id} not found")
                return

            if max_turns is None:
                max_turns = sim_row["max_turns"]

            current = sim_row["current_turn"]

            # Update status ke running
            conn.execute(
                "UPDATE simulations SET status = 'running', updated_at = ? WHERE id = ?",
                (datetime.now().isoformat(), sim_id)
            )
            conn.commit()
        finally:
            conn.close()

        print(f"[SimLoop] Starting simulation {sim_id}: turn {current} -> {max_turns}")

        try:
            while current < max_turns:
                if self._stop_flags.get(sim_id, False):
                    print(f"[SimLoop] Simulation {sim_id} stopped at turn {current}")
                    break

                await self.run_turn(sim_id)
                current += 1

                # Jeda kecil antar turn agar tidak membebani Ollama
                await asyncio.sleep(0.5)

            # Update status selesai
            final_status = "stopped" if self._stop_flags.get(sim_id, False) else "completed"
            conn = _get_db_connection()
            try:
                conn.execute(
                    "UPDATE simulations SET status = ?, updated_at = ? WHERE id = ?",
                    (final_status, datetime.now().isoformat(), sim_id)
                )
                conn.commit()
            finally:
                conn.close()

            print(f"[SimLoop] Simulation {sim_id} ended: {final_status}")

        except asyncio.CancelledError:
            # Task di-cancel dari luar
            conn = _get_db_connection()
            try:
                conn.execute(
                    "UPDATE simulations SET status = 'cancelled', updated_at = ? WHERE id = ?",
                    (datetime.now().isoformat(), sim_id)
                )
                conn.commit()
            finally:
                conn.close()
            print(f"[SimLoop] Simulation {sim_id} cancelled")

        except Exception as e:
            print(f"[SimLoop] Simulation {sim_id} error: {e}")
            conn = _get_db_connection()
            try:
                conn.execute(
                    "UPDATE simulations SET status = 'error', updated_at = ? WHERE id = ?",
                    (datetime.now().isoformat(), sim_id)
                )
                conn.commit()
            finally:
                conn.close()

        finally:
            # Bersihkan tracking
            self._running_simulations.pop(sim_id, None)
            self._stop_flags.pop(sim_id, None)

    def start_simulation(self, sim_id: str, max_turns: Optional[int] = None) -> bool:
        """
        Mulai simulasi sebagai background asyncio.Task.
        Return True jika berhasil dimulai, False jika sudah berjalan.
        """
        if sim_id in self._running_simulations:
            task = self._running_simulations[sim_id]
            if not task.done():
                print(f"[SimLoop] Simulation {sim_id} already running")
                return False

        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        task = loop.create_task(self.run_simulation(sim_id, max_turns))
        self._running_simulations[sim_id] = task
        print(f"[SimLoop] Simulation {sim_id} started as background task")
        return True

    def stop_simulation(self, sim_id: str) -> bool:
        """Hentikan simulasi yang sedang berjalan."""
        if sim_id in self._running_simulations:
            self._stop_flags[sim_id] = True
            task = self._running_simulations[sim_id]
            if not task.done():
                task.cancel()
            print(f"[SimLoop] Stop signal sent to simulation {sim_id}")
            return True
        print(f"[SimLoop] No running simulation found: {sim_id}")
        return False

    def is_running(self, sim_id: str) -> bool:
        """Cek apakah simulasi sedang berjalan."""
        if sim_id in self._running_simulations:
            return not self._running_simulations[sim_id].done()
        return False


# ============================================================
# 5. GOD INTERVENTION
# ============================================================

class GodIntervention:
    """Injeksi event ke simulasi. User bisa jadi 'dewa' yang mengubah kondisi."""

    def inject_event(self, sim_id: str, event_text: str) -> dict:
        """
        Masukkan event ke simulasi. Event akan muncul di konteks semua agent
        pada turn berikutnya.
        """
        conn = _get_db_connection()
        try:
            # Ambil current turn
            sim_row = conn.execute(
                "SELECT current_turn FROM simulations WHERE id = ?", (sim_id,)
            ).fetchone()

            if not sim_row:
                return {"success": False, "error": f"Simulation {sim_id} not found"}

            # Inject di turn berikutnya agar semua agent melihatnya
            target_turn = sim_row["current_turn"] + 1
            now = datetime.now().isoformat()

            conn.execute(
                """INSERT INTO interventions (sim_id, turn, content, injected_by, timestamp)
                   VALUES (?, ?, ?, 'user', ?)""",
                (sim_id, target_turn, event_text, now)
            )
            conn.commit()

            print(f"[GodIntervention] Event injected at turn {target_turn}: {event_text[:60]}...")
            return {
                "success": True,
                "turn": target_turn,
                "content": event_text,
                "timestamp": now,
            }
        except Exception as e:
            print(f"[GodIntervention] Error: {e}")
            return {"success": False, "error": str(e)}
        finally:
            conn.close()


# ============================================================
# 6. REPORT GENERATOR
# ============================================================

class ReportGenerator:
    """Generate laporan markdown dari hasil simulasi."""

    async def generate_report(self, sim_id: str) -> str:
        """
        Kumpulkan semua interaction logs lalu generate laporan via Ollama.
        Return formatted markdown report.
        """
        conn = _get_db_connection()
        try:
            # Ambil data simulasi
            sim_row = conn.execute(
                "SELECT * FROM simulations WHERE id = ?", (sim_id,)
            ).fetchone()
            if not sim_row:
                return "# Error\nSimulasi tidak ditemukan."

            sim = dict(sim_row)

            # Ambil semua agents
            agent_rows = conn.execute(
                "SELECT * FROM agents WHERE sim_id = ?", (sim_id,)
            ).fetchall()
            agents = [dict(r) for r in agent_rows]

            # Ambil semua interaction logs
            log_rows = conn.execute(
                """SELECT * FROM interaction_logs
                   WHERE sim_id = ?
                   ORDER BY turn ASC, timestamp ASC""",
                (sim_id,)
            ).fetchall()
            logs = [dict(r) for r in log_rows]

            # Ambil semua interventions
            intervention_rows = conn.execute(
                "SELECT * FROM interventions WHERE sim_id = ? ORDER BY turn ASC",
                (sim_id,)
            ).fetchall()
            interventions = [dict(r) for r in intervention_rows]
        finally:
            conn.close()

        # Bangun ringkasan untuk prompt
        logs_summary = self._build_logs_summary(logs, interventions)

        agents_info = "\n".join([
            f"- {a['name']}: {a['persona'][:100]}... | Final mood: {a['mood']}"
            for a in agents
        ])

        prompt = f"""Anda adalah analis simulasi AI. Analisis simulasi multi-agen berikut dan hasilkan laporan komprehensif dalam format Markdown menggunakan Bahasa Indonesia.

INFO SIMULASI:
- Judul: {sim.get('title', 'Tanpa Judul')}
- Skenario: {sim.get('scenario', 'Tidak ada')[:500]}
- Total Giliran: {sim.get('current_turn', 0)}
- Status: {sim.get('status', 'tidak diketahui')}

PARTISIPAN:
{agents_info}

LOG INTERAKSI LENGKAP:
{logs_summary}

Buatlah laporan dengan bagian-bagian berikut:
1. ## Ringkasan - Apa yang terjadi secara keseluruhan (2-3 paragraf)
2. ## Prediksi & Hasil Utama - Apa yang diprediksi simulasi tentang skenario ini
3. ## Analisis Perilaku Agen - Bagaimana setiap agen berperilaku, berkembang, dan mempengaruhi agen lain
4. ## Momen Penting - Titik balik utama atau interaksi yang menarik
5. ## Kesimpulan - Penilaian akhir dan pelajaran yang dapat diambil

Tulis dengan gaya yang profesional dan menarik. Gunakan contoh spesifik dari log. PENTING: Anda HARUS menggunakan Bahasa Indonesia sepenuhnya.
Balas HANYA dengan laporan Markdown.
"""

        # Coba generate via LLM
        hw = hardware_detector.detect()
        model = hw["recommended_model"]

        report = await _call_llm(prompt, model)
        if report and len(report) > 100:
            # Tambahkan header
            header = f"# Simulation Report: {sim.get('title', 'Untitled')}\n"
            header += f"*Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')} | "
            header += f"Turns: {sim.get('current_turn', 0)} | "
            header += f"Agents: {len(agents)}*\n\n---\n\n"
            return header + report

        # Fallback: buat report manual tanpa LLM
        return self._fallback_report(sim, agents, logs, interventions)

    def _build_logs_summary(self, logs: list[dict], interventions: list[dict]) -> str:
        """Bangun ringkasan logs yang readable untuk prompt."""
        summary_parts = []
        current_turn = -1

        # Index interventions by turn
        interventions_by_turn: dict[int, list[dict]] = {}
        for itv in interventions:
            t = itv["turn"]
            if t not in interventions_by_turn:
                interventions_by_turn[t] = []
            interventions_by_turn[t].append(itv)

        for log in logs:
            turn = log["turn"]
            if turn != current_turn:
                current_turn = turn
                summary_parts.append(f"\n--- Turn {turn} ---")
                # Tampilkan intervensi di awal turn
                if turn in interventions_by_turn:
                    for itv in interventions_by_turn[turn]:
                        summary_parts.append(f"⚡ [EVENT] {itv['content']}")

            action = log.get("action_type", "speak")
            name = log.get("agent_name", "Unknown")
            content = log.get("content", "")

            # Batasi panjang konten per log
            if len(content) > 300:
                content = content[:300] + "..."

            summary_parts.append(f"[{name}] ({action}): {content}")

        # Batasi total agar tidak melebihi context window
        full_summary = "\n".join(summary_parts)
        if len(full_summary) > 6000:
            full_summary = full_summary[:6000] + "\n\n... [LOG TRUNCATED]"

        return full_summary

    def _fallback_report(
        self,
        sim: dict,
        agents: list[dict],
        logs: list[dict],
        interventions: list[dict],
    ) -> str:
        """Fallback report generator tanpa LLM."""
        report = f"# Simulation Report: {sim.get('title', 'Untitled')}\n\n"
        report += f"*Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}*\n\n"
        report += "---\n\n"

        # Summary
        report += "## Summary\n\n"
        report += f"Simulasi **{sim.get('title', 'Untitled')}** berlangsung selama "
        report += f"**{sim.get('current_turn', 0)} turns** dengan "
        report += f"**{len(agents)} agents** berpartisipasi. "
        report += f"Status akhir: **{sim.get('status', 'unknown')}**.\n\n"

        if sim.get("scenario"):
            report += f"**Skenario:** {sim['scenario'][:300]}\n\n"

        # Agent Analysis
        report += "## Agent Behavior Analysis\n\n"
        for agent in agents:
            # Hitung jumlah interaksi per agent
            agent_logs = [l for l in logs if l.get("agent_id") == agent["id"]]
            action_counts: dict[str, int] = {}
            for l in agent_logs:
                at = l.get("action_type", "unknown")
                action_counts[at] = action_counts.get(at, 0) + 1

            report += f"### {agent['name']}\n"
            report += f"- **Persona:** {agent['persona'][:150]}...\n"
            report += f"- **Final Mood:** {agent['mood']}\n"
            report += f"- **Total Actions:** {len(agent_logs)}\n"
            if action_counts:
                actions_str = ", ".join([f"{k}: {v}" for k, v in action_counts.items()])
                report += f"- **Action Breakdown:** {actions_str}\n"
            report += "\n"

        # Interventions
        if interventions:
            report += "## God Interventions\n\n"
            for itv in interventions:
                report += f"- **Turn {itv['turn']}:** {itv['content']}\n"
            report += "\n"

        # Timeline highlights (first and last 3 logs)
        report += "## Notable Moments\n\n"
        if logs:
            report += "**Opening moves:**\n"
            for log in logs[:3]:
                report += f"- Turn {log['turn']} — {log['agent_name']}: {log['content'][:120]}\n"

            if len(logs) > 6:
                report += "\n**Final exchanges:**\n"
                for log in logs[-3:]:
                    report += f"- Turn {log['turn']} — {log['agent_name']}: {log['content'][:120]}\n"

        report += "\n## Conclusion\n\n"
        report += f"Simulasi telah berakhir dengan status **{sim.get('status', 'unknown')}**. "
        report += "Untuk analisis mendalam, jalankan ulang report generator dengan Ollama yang aktif.\n"

        return report


# ============================================================
# 7. AGENT CHAT
# ============================================================

class AgentChat:
    """Private 1-on-1 chat antara user dan agent tertentu."""

    async def chat_with_agent(
        self, sim_id: str, agent_id: str, user_message: str
    ) -> dict:
        """
        Kirim pesan private ke agent. Agent akan merespon sesuai persona dan memory-nya.
        Return: {agent_name, response, mood}
        """
        conn = _get_db_connection()
        try:
            agent_row = conn.execute(
                "SELECT * FROM agents WHERE id = ? AND sim_id = ?",
                (agent_id, sim_id)
            ).fetchone()

            if not agent_row:
                return {
                    "agent_name": "Unknown",
                    "response": "Agent tidak ditemukan dalam simulasi ini.",
                    "mood": "neutral",
                }

            agent = dict(agent_row)
        finally:
            conn.close()

        # Parse memory
        try:
            memory = json.loads(agent.get("memory", "[]"))
        except (json.JSONDecodeError, TypeError):
            memory = []

        # Bangun context untuk private chat
        memory_context = ""
        if memory:
            memory_context = "\nYOUR RECENT MEMORIES FROM THE SIMULATION:\n"
            for mem in memory[-10:]:
                memory_context += f"- Turn {mem.get('turn', '?')}: {mem.get('content', '...')}\n"

        prompt = f"""You are "{agent['name']}" having a private conversation with a human observer.

YOUR PERSONA:
{agent['persona']}

YOUR GOALS:
{agent['goals']}

YOUR CURRENT MOOD: {agent['mood']}
{memory_context}

The human sends you this private message:
"{user_message}"

Respond naturally and in-character. You can share your thoughts, feelings, and opinions about the simulation.
Be conversational but stay true to your persona. Keep your response concise (2-4 sentences).
"""

        hw = hardware_detector.detect()
        model = hw["recommended_model"]

        response_text = await _call_llm(prompt, model)

        if not response_text:
            # Fallback tanpa LLM
            response_text = (
                f"*{agent['name']} mengangguk* "
                f"Terima kasih sudah menghubungi saya secara privat. "
                f"Saat ini mood saya {agent['mood']}. "
                f"Saya akan mempertimbangkan apa yang kamu sampaikan."
            )

        return {
            "agent_name": agent["name"],
            "response": response_text,
            "mood": agent["mood"],
        }


# ============================================================
# SIMULATION MANAGER — Helper functions
# ============================================================

async def create_simulation(
    title: str,
    scenario: str,
    document_text: str = "",
    max_turns: int = 20,
) -> dict:
    """
    Buat simulasi baru lengkap: create record, parse skenario, buat agents.
    Return dict dengan info simulasi.
    """
    sim_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    conn = _get_db_connection()
    try:
        conn.execute(
            """INSERT INTO simulations (id, title, scenario, status, created_at, updated_at, max_turns, current_turn)
               VALUES (?, ?, ?, 'setup', ?, ?, ?, 0)""",
            (sim_id, title, scenario, now, now, max_turns)
        )
        conn.commit()
    except Exception as e:
        print(f"[SimManager] Error creating simulation: {e}")
        conn.rollback()
        conn.close()
        return {"error": str(e)}
    finally:
        conn.close()

    # Parse skenario untuk ekstrak entitas
    source_text = document_text if document_text else scenario
    entities = await scenario_parser.parse(source_text)

    # Buat agents
    agents = agent_factory.create_agents(sim_id, entities)

    # Update status ke ready
    conn = _get_db_connection()
    try:
        conn.execute(
            "UPDATE simulations SET status = 'ready', updated_at = ? WHERE id = ?",
            (datetime.now().isoformat(), sim_id)
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "id": sim_id,
        "title": title,
        "scenario": scenario,
        "status": "ready",
        "max_turns": max_turns,
        "agents": agents,
        "created_at": now,
    }


def get_simulation(sim_id: str) -> Optional[dict]:
    """Ambil data lengkap simulasi termasuk agents dan logs."""
    conn = _get_db_connection()
    try:
        sim_row = conn.execute(
            "SELECT * FROM simulations WHERE id = ?", (sim_id,)
        ).fetchone()
        if not sim_row:
            return None

        sim = dict(sim_row)

        # Ambil agents
        agent_rows = conn.execute(
            "SELECT * FROM agents WHERE sim_id = ?", (sim_id,)
        ).fetchall()
        sim["agents"] = [dict(r) for r in agent_rows]

        # Parse memory JSON di setiap agent
        for agent in sim["agents"]:
            try:
                agent["memory"] = json.loads(agent.get("memory", "[]"))
            except (json.JSONDecodeError, TypeError):
                agent["memory"] = []

        # Ambil recent logs (last 50)
        log_rows = conn.execute(
            """SELECT * FROM interaction_logs
               WHERE sim_id = ?
               ORDER BY timestamp DESC
               LIMIT 50""",
            (sim_id,)
        ).fetchall()
        sim["recent_logs"] = [dict(r) for r in reversed(log_rows)]

        # Ambil interventions
        intervention_rows = conn.execute(
            "SELECT * FROM interventions WHERE sim_id = ? ORDER BY turn ASC",
            (sim_id,)
        ).fetchall()
        sim["interventions"] = [dict(r) for r in intervention_rows]

        # Status running?
        sim["is_running"] = simulation_loop.is_running(sim_id)

        return sim
    finally:
        conn.close()


def list_simulations() -> list[dict]:
    """Ambil daftar semua simulasi."""
    conn = _get_db_connection()
    try:
        rows = conn.execute(
            "SELECT id, title, status, created_at, updated_at, max_turns, current_turn FROM simulations ORDER BY created_at DESC"
        ).fetchall()
        result = []
        for row in rows:
            sim = dict(row)
            # Hitung jumlah agents
            count = conn.execute(
                "SELECT COUNT(*) as cnt FROM agents WHERE sim_id = ?", (sim["id"],)
            ).fetchone()
            sim["agent_count"] = count["cnt"] if count else 0
            sim["is_running"] = simulation_loop.is_running(sim["id"])
            result.append(sim)
        return result
    finally:
        conn.close()


def delete_simulation(sim_id: str) -> bool:
    """Hapus simulasi beserta semua data terkait."""
    # Stop dulu kalau masih berjalan
    simulation_loop.stop_simulation(sim_id)

    conn = _get_db_connection()
    try:
        conn.execute("DELETE FROM interaction_logs WHERE sim_id = ?", (sim_id,))
        conn.execute("DELETE FROM interventions WHERE sim_id = ?", (sim_id,))
        conn.execute("DELETE FROM agents WHERE sim_id = ?", (sim_id,))
        conn.execute("DELETE FROM simulations WHERE id = ?", (sim_id,))
        conn.commit()
        print(f"[SimManager] Deleted simulation {sim_id}")
        return True
    except Exception as e:
        print(f"[SimManager] Error deleting simulation: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()


# ============================================================
# SINGLETON INSTANCES
# ============================================================

hardware_detector = HardwareDetector()
scenario_parser = ScenarioParser()
agent_factory = AgentFactory()
simulation_loop = SimulationLoop()
god_intervention = GodIntervention()
report_generator = ReportGenerator()
agent_chat = AgentChat()
