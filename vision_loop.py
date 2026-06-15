"""
Vision Loop — Periodic screenshot capture + LOCAL AI Vision analysis via Ollama.
Memberikan "mata" ke BOCCHI-JARVIS: mengambil screenshot layar secara berkala
dan mengirimnya ke Ollama lokal (qwen2.5vl:7b) untuk analisis konteks.

Strategy: Ollama lokal (primary) → Gemini (fallback) → OpenRouter (fallback)
Rate limiting: Min 15s interval.

Usage:
    from vision_loop import vision_engine
    vision_engine.start()  # Mulai loop di background thread
    vision_engine.get_current_analysis()  # Ambil analisis terbaru
    vision_engine.stop()  # Hentikan loop
"""

import threading
import time
import os
import io
import base64
import json
import requests
from datetime import datetime
from PIL import ImageGrab

# ============================================================
# VISION ENGINE — Background Screenshot Analysis (Ollama Local)
# ============================================================

_VISION_PROMPT = """Analyze this desktop screenshot. Follow a strict Verification/Review Loop before drawing conclusions. Respond in JSON format only:
{
    "hypothesis": "Initial thought on what is happening on the screen",
    "verification": "Critical review of your hypothesis based on actual UI elements and text visible",
    "description": "Validated 1-2 sentence description of the main activity",
    "active_window": "Name of the active/focused application window",
    "elements": ["list", "of", "key", "UI", "elements", "visible"],
    "text_content": "Any readable text visible on screen (OCR)",
    "actionable": ["suggested actions based on validated context"]
}
Be concise but rigorous in your verification. Focus on the main activity happening on screen."""

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

def get_ollama_vision_model() -> str:
    """Detect available local vision models dynamically.
    
    Supports variations: qwen2.5vl:7b (no dash), qwen2.5-vl:7b (with dash),
    llava, bakllava, and other vision-capable models.
    """
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        if resp.status_code == 200:
            models = [m.get("name", "") for m in resp.json().get("models", [])]
            
            # Pass 1: exact 7b match (highest priority)
            for m in models:
                if m in ("qwen2.5vl:7b", "qwen2.5-vl:7b"):
                    print(f"[VISION] [OK] Detected exact vision model: {m}")
                    return m
            
            # Pass 2: any qwen2.5 vision variant
            for m in models:
                if "qwen2.5vl" in m or "qwen2.5-vl" in m:
                    print(f"[VISION] [OK] Detected qwen2.5 vision variant: {m}")
                    return m
            
            # Pass 3: other known vision models
            for m in models:
                if "llava" in m.lower() or "bakllava" in m.lower() or "minicpm-v" in m.lower():
                    print(f"[VISION] [OK] Detected alternative vision model: {m}")
                    return m
            
            print(f"[VISION] [WARN] Tidak ada model vision ditemukan di Ollama. Models tersedia: {models}")
    except Exception as e:
        print(f"[VISION] Tidak bisa koneksi ke Ollama: {e}")
    
    # Fallback ke tag yang paling umum
    return "qwen2.5vl:7b"



class VisionEngine:
    def __init__(self):
        self._running = False
        self._thread = None
        self._interval = 30  # Default 30 detik
        self._current_analysis = {
            "timestamp": None,
            "hypothesis": "",
            "verification": "",
            "description": "Vision engine belum aktif.",
            "elements": [],
            "active_window": None,
            "text_content": "",
            "actionable": [],
            "screenshot_path": None,
            "status": "idle",
            "provider": None
        }
        self._lock = threading.Lock()
        self._capture_dir = os.path.join(os.getcwd(), "data", "vision_captures")
        os.makedirs(self._capture_dir, exist_ok=True)
        self._history = []  # Last N analyses
        self._max_history = 10
        self._cooldown_until = 0
        self._provider = "auto"  # 'auto', 'ollama', 'gemini', 'openrouter'
        self._on_analysis_callback = None  # Callback to notify jarvis orchestrator
    
    def set_analysis_callback(self, callback):
        """Set callback yang dipanggil setiap analisis selesai."""
        self._on_analysis_callback = callback

    def start(self, interval: int = 30):
        """Mulai vision loop di background thread."""
        if self._running:
            return {"status": "already_running"}
        
        self._interval = max(15, interval)
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        
        with self._lock:
            self._current_analysis["status"] = "running"
        
        return {"status": "started", "interval": self._interval}
    
    def stop(self):
        """Hentikan vision loop."""
        self._running = False
        with self._lock:
            self._current_analysis["status"] = "stopped"
        return {"status": "stopped"}
    
    def is_running(self) -> bool:
        return self._running
    
    def get_current_analysis(self) -> dict:
        """Ambil analisis terbaru."""
        with self._lock:
            return dict(self._current_analysis)
    
    def get_history(self) -> list:
        """Ambil riwayat analisis."""
        with self._lock:
            return list(self._history)
    
    def set_interval(self, seconds: int):
        """Ubah interval capture."""
        self._interval = max(15, seconds)
        return {"interval": self._interval}
    
    def set_provider(self, provider: str):
        """Set vision provider: auto, ollama, gemini, openrouter."""
        valid = ["auto", "ollama", "gemini", "openrouter"]
        if provider not in valid:
            return {"error": f"Provider tidak valid. Pilih: {valid}"}
        self._provider = provider
        return {"provider": self._provider}

    def capture_now(self) -> dict:
        """Force capture sekarang juga (tanpa menunggu interval)."""
        return self._do_capture()
    
    def _loop(self):
        """Background loop: capture → analyze → sleep → repeat."""
        while self._running:
            try:
                self._do_capture()
            except Exception as e:
                print(f"[VISION LOOP] Error: {e}")
                with self._lock:
                    self._current_analysis["status"] = "error"
                    self._current_analysis["description"] = f"Error: {e}"
            
            # Sleep in small increments so we can stop quickly
            for _ in range(self._interval * 2):
                if not self._running:
                    break
                time.sleep(0.5)
    
    def _do_capture(self) -> dict:
        """Ambil screenshot dan analisis."""
        try:
            # Capture screenshot
            screenshot = ImageGrab.grab()
            
            # Save to file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"vision_{timestamp}.png"
            filepath = os.path.join(self._capture_dir, filename)
            
            # Resize for faster processing (max 1024px wide)
            max_width = 1024
            if screenshot.width > max_width:
                ratio = max_width / screenshot.width
                new_size = (max_width, int(screenshot.height * ratio))
                screenshot = screenshot.resize(new_size)
            
            screenshot.save(filepath, "PNG", optimize=True)
            
            # Convert to base64 for API
            buffer = io.BytesIO()
            screenshot.save(buffer, format="PNG")
            img_bytes = buffer.getvalue()
            b64_image = base64.b64encode(img_bytes).decode()
            
            # Check cooldown (rate limit protection)
            if time.time() < self._cooldown_until:
                remaining = int(self._cooldown_until - time.time())
                analysis = {
                    "hypothesis": "",
                    "verification": "",
                    "description": f"⏳ Rate limit cooldown — menunggu {remaining}s.",
                    "elements": [],
                    "active_window": "Cooldown",
                    "text_content": "",
                    "actionable": []
                }
                provider_used = "cooldown"
            else:
                # Analyze with AI Vision
                analysis, provider_used = self._analyze_vision(b64_image, filepath)
            
            # Update current state
            with self._lock:
                self._current_analysis = {
                    "timestamp": datetime.now().isoformat(),
                    "hypothesis": analysis.get("hypothesis", ""),
                    "verification": analysis.get("verification", ""),
                    "description": analysis.get("description", "Analisis gagal"),
                    "elements": analysis.get("elements", []),
                    "active_window": analysis.get("active_window", "Unknown"),
                    "text_content": analysis.get("text_content", ""),
                    "actionable": analysis.get("actionable", []),
                    "screenshot_path": filepath,
                    "status": "running" if self._running else "stopped",
                    "provider": provider_used
                }
                
                # Add to history
                self._history.append(dict(self._current_analysis))
                if len(self._history) > self._max_history:
                    self._history.pop(0)
                    self._cleanup_old_captures()
            
            # Notify orchestrator
            if self._on_analysis_callback:
                try:
                    self._on_analysis_callback(self._current_analysis)
                except Exception:
                    pass
            
            return self._current_analysis
            
        except Exception as e:
            error_result = {
                "timestamp": datetime.now().isoformat(),
                "description": f"Capture error: {e}",
                "elements": [],
                "screenshot_path": None,
                "status": "error",
                "provider": None
            }
            with self._lock:
                self._current_analysis = error_result
            return error_result
    
    def _analyze_vision(self, b64_image: str, filepath: str = None) -> tuple:
        """Try providers in order: Ollama → Gemini → OpenRouter.
        Returns: (analysis_dict, provider_name)
        """
        
        # 1. Try Ollama local (primary — no internet needed)
        if self._provider in ("auto", "ollama"):
            result = self._try_ollama(b64_image, filepath)
            if result:
                return result, "ollama"
        
        # 2. Fallback: Gemini API
        if self._provider in ("auto", "gemini"):
            result = self._try_gemini(b64_image)
            if result:
                return result, "gemini"
        
        # 3. Fallback: OpenRouter
        if self._provider in ("auto", "openrouter"):
            result = self._try_openrouter(b64_image)
            if result:
                return result, "openrouter"
        
        return {
            "hypothesis": "",
            "verification": "",
            "description": "❌ Semua provider vision gagal.",
            "elements": [],
            "active_window": "Unknown",
            "text_content": "",
            "actionable": []
        }, "none"

    def _try_ollama(self, b64_image: str, filepath: str = None) -> dict | None:
        """Analisis via Ollama lokal."""
        try:
            model_name = get_ollama_vision_model()
            # Use /api/chat with images
            messages = [
                {
                    "role": "user",
                    "content": _VISION_PROMPT,
                    "images": [b64_image]
                }
            ]
            
            resp = requests.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": model_name,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 500
                    }
                },
                timeout=60
            )
            
            if resp.status_code == 404:
                print(f"[VISION] Model {model_name} belum di-pull. Jalankan: ollama pull {model_name}")
                return None
            
            resp.raise_for_status()
            data = resp.json()
            text = data.get("message", {}).get("content", "")
            
            if not text:
                return None
            
            result = self._parse_json_response(text)
            print(f"[VISION] ✅ Ollama lokal berhasil analisis")
            return result
            
        except requests.exceptions.ConnectionError:
            print("[VISION] Ollama tidak berjalan — skip ke fallback")
            return None
        except Exception as e:
            print(f"[VISION] Ollama error: {str(e)[:80]}")
            return None

    def _try_gemini(self, b64_image: str) -> dict | None:
        """Coba analisis via Gemini API (free tier) — fallback."""
        try:
            from google import genai
            from google.genai import types
            
            gemini_key = os.getenv("GEMINI_API_KEY", "")
            if not gemini_key:
                return None
            
            client = genai.Client(api_key=gemini_key)
            image_bytes = base64.b64decode(b64_image)
            
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[
                    _VISION_PROMPT,
                    types.Part.from_bytes(data=image_bytes, mime_type="image/png")
                ]
            )
            
            return self._parse_json_response(response.text)
            
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                print(f"[VISION] Gemini 429 — cooldown 60s")
                self._cooldown_until = time.time() + 60
                return None
            print(f"[VISION] Gemini error: {error_str[:80]}")
            return None
    
    def _try_openrouter(self, b64_image: str) -> dict | None:
        """Coba analisis via OpenRouter free vision model — fallback."""
        try:
            api_key = os.getenv("OPENROUTER_API_KEY", "")
            if not api_key:
                return None
            
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": "google/gemini-2.0-flash-exp:free",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": _VISION_PROMPT},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{b64_image}"
                                }
                            }
                        ]
                    }
                ],
                "max_tokens": 500
            }
            
            resp = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=30
            )
            
            if resp.status_code == 429:
                print("[VISION] OpenRouter 429 — cooldown 120s")
                self._cooldown_until = time.time() + 120
                return None
            
            resp.raise_for_status()
            data = resp.json()
            
            text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if not text:
                return None
            
            return self._parse_json_response(text)
            
        except Exception as e:
            error_str = str(e)
            if "429" in error_str:
                self._cooldown_until = time.time() + 120
            print(f"[VISION] OpenRouter error: {error_str[:80]}")
            return None
    
    def _parse_json_response(self, text: str) -> dict | None:
        """Parse JSON response dari model, handle markdown code blocks."""
        try:
            text = text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                text = text.rsplit("```", 1)[0]
            return json.loads(text)
        except Exception:
            # If JSON parsing fails, return text as description
            return {
                "hypothesis": "",
                "verification": "",
                "description": text[:300] if text else "Parsing gagal",
                "elements": [],
                "active_window": "Unknown",
                "text_content": "",
                "actionable": []
            }
    
    def _cleanup_old_captures(self):
        """Hapus file capture lama (simpan 20 terakhir)."""
        try:
            files = sorted([
                os.path.join(self._capture_dir, f) 
                for f in os.listdir(self._capture_dir) 
                if f.startswith("vision_")
            ])
            while len(files) > 20:
                os.remove(files.pop(0))
        except Exception:
            pass


# Singleton instance
vision_engine = VisionEngine()
