"""
Vision Loop — Periodic screenshot capture + AI Vision analysis.
Memberikan "mata" ke agen: mengambil screenshot layar secara berkala
dan mengirimnya ke AI Vision API untuk analisis konteks.

Strategy: Gemini (free tier) → OpenRouter (free tier) fallback.
Rate limiting: Min 30s interval + cooldown on 429.

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
# VISION ENGINE — Background Screenshot Analysis
# ============================================================

_VISION_PROMPT = """Analyze this desktop screenshot. Respond in JSON format only:
{
    "description": "Brief 1-2 sentence description of what's visible on screen",
    "active_window": "Name of the active/focused application window",
    "elements": ["list", "of", "key", "UI", "elements", "visible"]
}
Be concise. Focus on the main activity happening on screen."""


class VisionEngine:
    def __init__(self):
        self._running = False
        self._thread = None
        self._interval = 30  # Default 30 detik (hemat quota free tier)
        self._current_analysis = {
            "timestamp": None,
            "description": "Vision engine belum aktif.",
            "elements": [],
            "screenshot_path": None,
            "status": "idle"
        }
        self._lock = threading.Lock()
        self._capture_dir = os.path.join(os.getcwd(), "data", "vision_captures")
        os.makedirs(self._capture_dir, exist_ok=True)
        self._history = []  # Last N analyses
        self._max_history = 10
        self._cooldown_until = 0  # Unix timestamp — skip analysis until this time
        self._provider = "auto"  # 'auto', 'gemini', 'openrouter'
    
    def start(self, interval: int = 30):
        """Mulai vision loop di background thread."""
        if self._running:
            return {"status": "already_running"}
        
        self._interval = max(15, interval)  # Minimum 15 detik (free tier safe)
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
            b64_image = base64.b64encode(buffer.getvalue()).decode()
            
            # Check cooldown (rate limit protection)
            if time.time() < self._cooldown_until:
                remaining = int(self._cooldown_until - time.time())
                analysis = {
                    "description": f"⏳ Rate limit cooldown — menunggu {remaining}s sebelum analisis berikutnya.",
                    "elements": [],
                    "active_window": "Cooldown"
                }
            else:
                # Analyze with AI Vision (Gemini → OpenRouter fallback)
                analysis = self._analyze_vision(b64_image)
            
            # Update current state
            with self._lock:
                self._current_analysis = {
                    "timestamp": datetime.now().isoformat(),
                    "description": analysis.get("description", "Analisis gagal"),
                    "elements": analysis.get("elements", []),
                    "active_window": analysis.get("active_window", "Unknown"),
                    "screenshot_path": filepath,
                    "status": "running" if self._running else "stopped"
                }
                
                # Add to history
                self._history.append(dict(self._current_analysis))
                if len(self._history) > self._max_history:
                    self._history.pop(0)
                    self._cleanup_old_captures()
            
            return self._current_analysis
            
        except Exception as e:
            error_result = {
                "timestamp": datetime.now().isoformat(),
                "description": f"Capture error: {e}",
                "elements": [],
                "screenshot_path": None,
                "status": "error"
            }
            with self._lock:
                self._current_analysis = error_result
            return error_result
    
    def _analyze_vision(self, b64_image: str) -> dict:
        """Try Gemini first, fallback to OpenRouter on failure/429."""
        
        if self._provider in ("auto", "gemini"):
            result = self._try_gemini(b64_image)
            if result:
                return result
        
        # Fallback: OpenRouter (free vision models)
        if self._provider in ("auto", "openrouter"):
            result = self._try_openrouter(b64_image)
            if result:
                return result
        
        return {
            "description": "❌ Semua provider vision gagal. Cek API keys di .env",
            "elements": [],
            "active_window": "Unknown"
        }
    
    def _try_gemini(self, b64_image: str) -> dict | None:
        """Coba analisis via Gemini API (free tier)."""
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
                # Rate limited — activate cooldown (60s) + switch to OpenRouter
                print(f"[VISION] Gemini 429 rate limit — cooldown 60s, switching to OpenRouter")
                self._cooldown_until = time.time() + 60
                self._provider = "openrouter"
                return None
            print(f"[VISION] Gemini error: {error_str[:80]}")
            return None
    
    def _try_openrouter(self, b64_image: str) -> dict | None:
        """Coba analisis via OpenRouter free vision model."""
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
        except:
            # If JSON parsing fails, return text as description
            return {
                "description": text[:200] if text else "Parsing gagal",
                "elements": [],
                "active_window": "Unknown"
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
        except:
            pass


# Singleton instance
vision_engine = VisionEngine()
