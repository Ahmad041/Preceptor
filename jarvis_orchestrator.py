"""
JARVIS Orchestrator — Otak utama BOCCHI-JARVIS.
Mengelola hot-swap model Ollama, routing tools, planning tasks, dan profil user.

Architecture:
  GPU (hot-swap, 1 at a time): qwen3:8b (Brain) | qwen2.5-vl:7b (Vision) | qwen2.5-coder:7b (Coder)
  CPU (parallel): Qwen3-TTS-0.6B (TTS) + faster-whisper (STT)

Usage:
    from jarvis_orchestrator import jarvis
    jarvis.set_user_profile({"nama": "Ahmad", "hubungan": "teman"})
    result = jarvis.process("Bocchi, buka Chrome dan cari berita AI")
"""

import json
import time
import os
import threading
import requests
from datetime import datetime
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv
from memory_system import memory
from omniscient import omniscient

load_dotenv()

# ============================================================
# CONFIG
# ============================================================
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# Model registry — semua model yang tersedia
MODELS = {
    "brain": {
        "name": "qwen3:8b",
        "role": "Reasoning, planning, dan tool-calling umum",
        "vram": "~8.5GB",
        "type": "text"
    },
    "vision": {
        "name": "qwen2.5vl:7b",
        "role": "Analisis screenshot, webcam, OCR",
        "vram": "~5GB",
        "type": "vision"
    },
    "coder": {
        "name": "qwen2.5-coder:7b",
        "role": "Code generation, debugging, refactoring",
        "vram": "~8GB",
        "type": "text"
    }
}

# System prompts per model role
SYSTEM_PROMPTS = {
    "brain": """Kamu adalah BOCCHI, asisten AI pribadi yang cerdas dan membantu.
Kamu berjalan secara lokal di komputer user. Kamu bisa mengontrol desktop, membuka aplikasi,
menjalankan perintah, dan membantu tugas sehari-hari.

Sifat kamu:
- Ramah, sopan, dan sedikit pemalu (seperti Bocchi dari anime)
- Sangat kompeten dan efisien dalam menjalankan tugas
- Selalu bertanya konfirmasi sebelum melakukan aksi desktop yang berbahaya
- Menjawab dalam bahasa yang sama dengan user (Indonesia/English)

Tools yang tersedia:
- desktop_click(x,y) — Klik posisi di layar
- desktop_type(text) — Mengetik teks
- desktop_hotkey(keys) — Shortcut keyboard (ctrl,c dll)
- desktop_scroll(amount) — Scroll layar
- desktop_screenshot() — Ambil screenshot
- web_search(query) — Cari di internet
- file_read(path) — Baca file
- shell_exec(command) — Jalankan perintah terminal
- generate_techdoc — Generate dokumen teknis (ERD, PDM, Probis, Flowchart, Use Case, Arsitektur). JANGAN panggil tool ini sebelum mengumpulkan info: nama_proyek, tujuan, entitas, aktor, proses_bisnis, dan existing_docs via Q&A dengan user.
- moodle_get_tasks(username, password) — Ambil daftar tugas dari Moodle
- moodle_download_task(username, password, task_url) — Download lampiran tugas Moodle
- moodle_upload_draft(username, password, task_url, file_path) — Upload file ke Moodle
- start_research(topic) — Mulai riset mendalam secara otomatis di background (AI Co-Scientist). Gunakan ini jika ditanya informasi kompleks yang butuh analisis literatur panjang.

Jawab dengan format JSON jika perlu menggunakan tool:
{"action": "tool_name", "params": {...}, "explanation": "..."}

Jika tidak perlu tool, jawab biasa saja.""",

    "vision": """Kamu adalah modul VISION dari BOCCHI. Tugasmu adalah menganalisis gambar layar/webcam.
Berikan analisis terstruktur dalam JSON:
{
    "description": "Deskripsi singkat isi layar",
    "active_window": "Nama aplikasi aktif",
    "elements": ["elemen UI yang terlihat"],
    "text_content": "Teks yang bisa dibaca (OCR)",
    "actionable": ["saran aksi berdasarkan konteks"]
}""",

    "coder": """Kamu adalah modul CODER dari BOCCHI. Tugasmu adalah menulis dan menganalisis kode.
- Tulis kode yang bersih dan efisien
- Berikan penjelasan singkat
- Gunakan best practices
- Support Python, JavaScript, dan bahasa umum lainnya"""
}


class JarvisOrchestrator:
    """Orchestrator utama BOCCHI-JARVIS."""

    def __init__(self):
        self._active_model: str = "brain"  # Default: brain mode
        self._lock = threading.Lock()
        self._user_profile: Dict[str, Any] = {
            "nama": "",
            "hubungan": "",
            "preferred_language": "id",
            "projects": [],
            "preferences": {},
        }
        self._conversation_history: List[Dict[str, str]] = []
        self._max_history = 20  # STM: 20 messages
        self._status = "idle"  # idle, processing, switching_model
        self._model_status = {
            "brain": "ready",
            "vision": "ready",
            "coder": "ready"
        }
        self._last_vision_context: Dict[str, Any] = {}
        self._profile_path = os.path.join(os.getcwd(), "data", "bocchi_memory", "profile.json")
        os.makedirs(os.path.dirname(self._profile_path), exist_ok=True)
        self._load_profile()
        
        # Setup research loop callback
        try:
            from research_loop import research_engine
            research_engine.set_callback(self._on_research_completed)
        except ImportError:
            pass

    def _on_research_completed(self, topic: str, report: str):
        """Callback ketika background research selesai."""
        msg = f"[SISTEM] Riset mendalam tentang '{topic}' telah selesai. Hasilnya sudah disimpan di memorimu. Kamu bisa mengingatkan user tentang hal ini."
        self._update_history(f"User Notification: Research {topic} completed.", msg)
        print(f"[JARVIS] Notified about completed research: {topic}")

    # ============================================================
    # USER PROFILE — dari MainMenu {nama, hubungan}
    # ============================================================

    def set_user_profile(self, profile: Dict[str, Any]):
        """Set user profile dari MainMenu input."""
        with self._lock:
            self._user_profile.update(profile)
            self._save_profile()
        print(f"[JARVIS] Profile updated: {profile.get('nama', '?')} ({profile.get('hubungan', '?')})")

    def get_user_profile(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._user_profile)

    def _save_profile(self):
        try:
            with open(self._profile_path, 'w', encoding='utf-8') as f:
                json.dump(self._user_profile, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[JARVIS] Error saving profile: {e}")

    def _load_profile(self):
        try:
            if os.path.exists(self._profile_path):
                with open(self._profile_path, 'r', encoding='utf-8') as f:
                    saved = json.load(f)
                    self._user_profile.update(saved)
                    print(f"[JARVIS] Profile loaded: {saved.get('nama', '?')}")
        except Exception as e:
            print(f"[JARVIS] Error loading profile: {e}")

    # ============================================================
    # MODEL MANAGEMENT — Hot-Swap via Ollama
    # ============================================================

    def get_active_model(self) -> str:
        return self._active_model

    def get_active_model_info(self) -> Dict[str, Any]:
        model_key = self._active_model
        return {
            "active": model_key,
            "model_name": MODELS[model_key]["name"],
            "role": MODELS[model_key]["role"],
            "status": self._status,
            "model_statuses": dict(self._model_status)
        }

    def switch_model(self, model_key: str) -> Dict[str, Any]:
        """Hot-swap ke model lain. Ollama handles unloading otomatis."""
        if model_key not in MODELS:
            return {"error": f"Model '{model_key}' tidak dikenal. Pilih: {list(MODELS.keys())}"}

        if model_key == self._active_model:
            return {"status": "already_active", "model": model_key}

        with self._lock:
            old_model = self._active_model
            self._status = "switching_model"
            self._active_model = model_key

        print(f"[JARVIS] Switching model: {old_model} → {model_key} ({MODELS[model_key]['name']})")

        # Pre-warm model by loading it (Ollama lazy-loads on first request)
        try:
            self._preload_model(MODELS[model_key]["name"])
            with self._lock:
                self._status = "idle"
                self._model_status[model_key] = "loaded"
        except Exception as e:
            with self._lock:
                self._status = "error"
            return {"error": f"Gagal switch ke {model_key}: {e}"}

        return {
            "status": "switched",
            "from": old_model,
            "to": model_key,
            "model_name": MODELS[model_key]["name"]
        }

    def _preload_model(self, model_name: str):
        """Pre-load model ke memory Ollama."""
        try:
            resp = requests.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={"model": model_name, "prompt": "hello", "stream": False},
                timeout=120
            )
            if resp.status_code == 200:
                print(f"[JARVIS] Model {model_name} loaded successfully")
            else:
                print(f"[JARVIS] Warning: Model preload returned {resp.status_code}")
        except Exception as e:
            print(f"[JARVIS] Error preloading {model_name}: {e}")

    def check_ollama_models(self) -> Dict[str, Any]:
        """Cek model mana yang sudah ter-install di Ollama."""
        try:
            resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=10)
            resp.raise_for_status()
            installed = [m["name"] for m in resp.json().get("models", [])]

            status = {}
            for key, info in MODELS.items():
                model_name = info["name"]
                # Check both exact and partial match (qwen3:8b matches qwen3:8b-q6_K etc.)
                is_installed = any(
                    model_name.split(":")[0] in m for m in installed
                )
                status[key] = {
                    "model": model_name,
                    "installed": is_installed,
                    "role": info["role"]
                }

            return {"models": status, "installed_list": installed}
        except Exception as e:
            return {"error": f"Ollama tidak aktif: {e}"}

    # ============================================================
    # CORE PROCESSING — Kirim prompt ke model aktif
    # ============================================================

    def process(self, user_input: str, context: Optional[Dict] = None) -> Dict[str, Any]:
        """Process user input melalui model aktif."""
        with self._lock:
            self._status = "processing"

        start_time = time.time()
        max_rounds = 3

        try:
            # 1. Determine best model for this input
            model_key = self._route_to_model(user_input)
            if model_key != self._active_model:
                self.switch_model(model_key)

            model_name = MODELS[self._active_model]["name"]

            # 2. Build system prompt with user profile + context + relevant memory
            system_prompt = self._build_system_prompt(context, user_input)

            # 3. Initialize message list with conversation history
            messages = self._build_messages(system_prompt, user_input)

            current_response = ""
            last_tool_call = None

            for round_num in range(max_rounds + 1):
                # Call Ollama
                response = self._call_ollama(model_name, messages)
                current_response = response

                # Try to parse tool call
                tool_call = self._extract_tool_call(response)
                if not tool_call:
                    # No tool call, we are done!
                    break

                last_tool_call = tool_call
                action = tool_call.get("action")
                params = tool_call.get("params", {})
                explanation = tool_call.get("explanation", "")

                print(f"[JARVIS] Round {round_num + 1}: Tool call parsed: {action}({params}) - Reason: {explanation}")

                # If it's a desktop pilot action requiring user confirmation:
                desktop_actions = ["desktop_click", "desktop_type", "desktop_press", "desktop_hotkey", "desktop_scroll", "desktop_screenshot"]
                if action in desktop_actions:
                    # Import desktop_pilot dynamically
                    import desktop_pilot
                    pilot_action_map = {
                        "desktop_click": "click",
                        "desktop_type": "type",
                        "desktop_press": "press",
                        "desktop_hotkey": "hotkey",
                        "desktop_scroll": "scroll",
                        "desktop_screenshot": "screenshot_full"
                    }
                    pilot_action = pilot_action_map.get(action, action)
                    
                    # Call request_desktop_action
                    pilot_res = desktop_pilot.request_desktop_action(pilot_action, params, agent_id="jarvis")
                    
                    # Update conversation history with the tool call
                    self._update_history(user_input, response)
                    
                    elapsed = time.time() - start_time
                    
                    # Append an assistant status message
                    bocchi_msg = f"Aku sudah menyiapkan aksi `{action}` ({explanation}). Silakan klik 'Approve' di tab Desktop Pilot untuk mengizinkan aku melakukannya!"
                    
                    result = {
                        "response": bocchi_msg,
                        "model_used": model_name,
                        "model_key": self._active_model,
                        "elapsed_seconds": round(elapsed, 2),
                        "status": "success",
                        "tool_call": tool_call
                    }
                    return result

                # If it's a read-only or helper tool that can be executed immediately:
                else:
                    if action == "start_research":
                        try:
                            from research_loop import research_engine
                            topic = params.get("topic", "") if isinstance(params, dict) else str(params)
                            res = research_engine.add_task(topic)
                            tool_result = f"Berhasil menambahkan topik '{topic}' ke antrean riset. Aku akan memberitahumu saat selesai."
                        except Exception as e:
                            tool_result = f"Gagal memulai riset: {e}"
                    else:
                        tool_map = {
                            "web_search": "search_web",
                            "file_read": "read_file",
                            "shell_exec": "run_terminal",
                            "get_screen_info": "get_screen_info"
                        }
                        agent_tool_name = tool_map.get(action, action)
                        
                        param_str = ""
                        if isinstance(params, dict):
                            if action == "web_search":
                                param_str = params.get("query", "")
                            elif action == "file_read":
                                param_str = params.get("path", "")
                            elif action == "shell_exec":
                                param_str = params.get("command", "")
                            else:
                                param_str = json.dumps(params)
                        else:
                            param_str = str(params)
    
                        import agent_tools
                        tool_result = agent_tools.execute_tool(agent_tool_name, param_str, agent_id="jarvis")
                        
                    # Feed the result back into the message history for the next round
                    messages.append({"role": "assistant", "content": response})
                    messages.append({
                        "role": "user",
                        "content": f"[TOOL_RESULT dari {action}]:\n{tool_result}\n\nGunakan hasil di atas untuk menjawab user atau melanjutkan tugas."
                    })

            # Update conversation history with final response
            self._update_history(user_input, current_response)

            # Save to long term memory (LTM)
            try:
                memory.save_chat_memory(user_input, current_response)
            except Exception as e:
                print(f"[JARVIS] Gagal menyimpan percakapan ke memori jangka panjang: {e}")

            elapsed = time.time() - start_time

            result = {
                "response": current_response,
                "model_used": model_name,
                "model_key": self._active_model,
                "elapsed_seconds": round(elapsed, 2),
                "status": "success"
            }

            if last_tool_call:
                result["tool_call"] = last_tool_call

            return result

        except Exception as e:
            return {
                "response": f"❌ Error: {e}",
                "model_used": MODELS[self._active_model]["name"],
                "model_key": self._active_model,
                "status": "error",
                "error": str(e)
            }
        finally:
            with self._lock:
                self._status = "idle"

    def _route_to_model(self, user_input: str) -> str:
        """Auto-detect model terbaik berdasarkan intent user."""
        lower = user_input.lower()

        # Vision triggers
        vision_keywords = ["lihat layar", "screenshot", "apa yang ada di layar",
                           "baca layar", "screen", "webcam", "what's on screen",
                           "analisis layar", "ocr"]
        if any(kw in lower for kw in vision_keywords):
            return "vision"

        # Coding triggers
        code_keywords = ["buat kode", "code", "script", "debug", "program",
                         "function", "class", "refactor", "fix bug", "tulis program",
                         "coding", "python", "javascript"]
        if any(kw in lower for kw in code_keywords):
            return "coder"

        # Default: brain
        return "brain"

    def _build_system_prompt(self, context: Optional[Dict] = None, query: Optional[str] = None) -> str:
        """Build system prompt with user profile + vision context + long term memory."""
        base_prompt = SYSTEM_PROMPTS.get(self._active_model, SYSTEM_PROMPTS["brain"])

        # Inject user profile
        profile = self._user_profile
        if profile.get("nama"):
            base_prompt += f"\n\nUser Profile:\n- Nama: {profile['nama']}"
            if profile.get("hubungan"):
                base_prompt += f"\n- Hubungan: {profile['hubungan']}"
            base_prompt += f"\n- Panggil user dengan nama mereka secara natural."

        # Inject relevant memories from Omniscient if query is provided
        if query:
            try:
                omni_results = omniscient.unified_search(query)
                results_data = omni_results.get("results", {})
                
                # Format memory
                mems = results_data.get("memory", [])
                if mems:
                    base_prompt += f"\n\n[MEMORI JANGKA PANJANG (RELEVAN)]\n"
                    for mem in mems:
                        base_prompt += f"- {mem}\n"
                
                # Format code
                codes = results_data.get("code", [])
                if codes:
                    base_prompt += f"\n\n[GITNEXUS CODE CONTEXT]\n"
                    for code in codes:
                        base_prompt += f"- {code}\n"
                        
            except Exception as e:
                print(f"[JARVIS] Gagal mengambil Omniscient context: {e}")

        # Inject vision context if available
        if self._last_vision_context and self._active_model == "brain":
            vc = self._last_vision_context
            base_prompt += f"\n\n[KONTEKS LAYAR]\n"
            base_prompt += f"- Aktif: {vc.get('active_window', '?')}\n"
            base_prompt += f"- Deskripsi: {vc.get('description', '?')}\n"

        # Inject additional context
        if context:
            base_prompt += f"\n\n[KONTEKS TAMBAHAN]\n{json.dumps(context, ensure_ascii=False)}"

        return base_prompt

    def _build_messages(self, system_prompt: str, user_input: str) -> List[Dict[str, str]]:
        """Build message array with history (STM)."""
        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history (last N messages)
        for msg in self._conversation_history[-self._max_history:]:
            messages.append(msg)

        # Add current user input
        messages.append({"role": "user", "content": user_input})

        return messages

    def _call_ollama(self, model_name: str, messages: List[Dict[str, str]]) -> str:
        """Call Ollama chat API."""
        try:
            resp = requests.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": model_name,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "num_predict": 2048
                    }
                },
                timeout=180
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("message", {}).get("content", "")
        except requests.exceptions.Timeout:
            raise Exception(f"Ollama timeout (180s) — model {model_name} mungkin terlalu besar")
        except requests.exceptions.ConnectionError:
            raise Exception("Ollama tidak berjalan. Jalankan `ollama serve` terlebih dahulu.")
        except Exception as e:
            raise Exception(f"Ollama error: {e}")

    def _update_history(self, user_input: str, response: str):
        """Update STM (conversation history)."""
        with self._lock:
            self._conversation_history.append({"role": "user", "content": user_input})
            self._conversation_history.append({"role": "assistant", "content": response})
            # Trim to max history
            if len(self._conversation_history) > self._max_history * 2:
                self._conversation_history = self._conversation_history[-(self._max_history * 2):]

    def _extract_tool_call(self, response: str) -> Optional[Dict]:
        """Try to extract tool call JSON from response."""
        import re
        try:
            # Try to find anything between ```json and ```
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group(1).strip())
                if isinstance(parsed, dict) and "action" in parsed:
                    return parsed

            # Try to find any raw JSON block { ... } in the text
            start = response.find('{')
            end = response.rfind('}')
            if start != -1 and end != -1 and end > start:
                parsed = json.loads(response[start:end+1].strip())
                if isinstance(parsed, dict) and "action" in parsed:
                    return parsed
        except Exception:
            pass
        return None

    # ============================================================
    # VISION CONTEXT — Terima update dari vision_loop
    # ============================================================

    def update_vision_context(self, analysis: Dict[str, Any]):
        """Update vision context dari vision_loop."""
        with self._lock:
            self._last_vision_context = analysis

    def get_vision_context(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._last_vision_context)

    # ============================================================
    # CONVERSATION MANAGEMENT
    # ============================================================

    def get_conversation_history(self) -> List[Dict[str, str]]:
        with self._lock:
            return list(self._conversation_history)

    def clear_conversation(self):
        with self._lock:
            self._conversation_history.clear()
        return {"status": "cleared"}

    def get_status(self) -> Dict[str, Any]:
        """Get full status Jarvis."""
        return {
            "active_model": self._active_model,
            "model_name": MODELS[self._active_model]["name"],
            "status": self._status,
            "user_profile": self.get_user_profile(),
            "conversation_length": len(self._conversation_history),
            "vision_context": bool(self._last_vision_context),
            "models": {k: {"name": v["name"], "role": v["role"]} for k, v in MODELS.items()}
        }


# ============================================================
# SINGLETON
# ============================================================
jarvis = JarvisOrchestrator()
