"""
Research Loop — Background autonomous research for BOCCHI-JARVIS.
Allowing the AI to proactively research topics in the background and store
the knowledge in ChromaDB for future reference.

Usage:
    from research_loop import research_engine
    research_engine.start()
    research_engine.add_task("Masa depan LLM tahun 2025")
"""

import threading
import time
import os
import json
import requests
from datetime import datetime
from memory_system import memory
from agent_tools import cari_di_internet, baca_halaman_web

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

class ResearchEngine:
    def __init__(self):
        self._running = False
        self._thread = None
        self._queue = []
        self._lock = threading.Lock()
        self._current_task = None
        self._on_research_completed_callback = None

    def set_callback(self, callback):
        self._on_research_completed_callback = callback

    def start(self):
        if self._running:
            return {"status": "already_running"}
        
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print("[RESEARCH] Engine started.")
        return {"status": "started"}

    def stop(self):
        self._running = False
        print("[RESEARCH] Engine stopped.")
        return {"status": "stopped"}

    def add_task(self, topic: str):
        with self._lock:
            self._queue.append({"topic": topic, "added_at": datetime.now().isoformat()})
            print(f"[RESEARCH] Task added: {topic}")
        return {"status": "queued", "topic": topic}

    def get_status(self):
        with self._lock:
            return {
                "running": self._running,
                "current_task": self._current_task,
                "queue_length": len(self._queue),
                "queue": self._queue.copy()
            }

    def _loop(self):
        while self._running:
            task = None
            with self._lock:
                if self._queue:
                    task = self._queue.pop(0)
                    self._current_task = task
            
            if task:
                try:
                    self._process_research(task["topic"])
                except Exception as e:
                    print(f"[RESEARCH] Error during research on '{task['topic']}': {e}")
                finally:
                    with self._lock:
                        self._current_task = None
            
            # Sleep briefly to prevent high CPU usage when queue is empty
            for _ in range(10):
                if not self._running:
                    break
                time.sleep(1)

    def _process_research(self, topic: str):
        print(f"[RESEARCH] Memulai riset mendalam untuk: {topic}")
        
        # 1. Formulation & Search
        search_query = f"{topic} (terbaru OR inovasi OR analisis)"
        try:
            search_results = cari_di_internet(search_query)
        except Exception as e:
            print(f"[RESEARCH] Gagal mencari di internet: {e}")
            return
        
        # Extract top 3 URLs from duckduckgo search result string (simple heuristic parsing)
        urls = []
        for line in search_results.split('\n'):
            if line.startswith("URL:"):
                url = line.replace("URL:", "").strip()
                if url.startswith("http"):
                    urls.append(url)
                    if len(urls) >= 3:
                        break
                        
        # 2. Data Gathering (Scraping)
        gathered_text = ""
        for url in urls:
            print(f"[RESEARCH] Scraping URL: {url}")
            try:
                page_content = baca_halaman_web(url)
                gathered_text += f"\n\nSource: {url}\n{page_content[:2000]}" # Limit 2000 chars per page
            except Exception as e:
                print(f"[RESEARCH] Gagal scrape {url}: {e}")
                
        if not gathered_text:
            print(f"[RESEARCH] Tidak ada data yang bisa di-scrape untuk '{topic}'")
            return
            
        # 3. Analysis & Synthesis via LLM
        prompt = f"""Kamu adalah AI Research Assistant. Buat laporan riset mendalam berbahasa Indonesia mengenai topik: '{topic}'.
Gunakan data mentah berikut sebagai referensi utama:
{gathered_text[:6000]}

Format laporan:
1. Kesimpulan Singkat
2. Fakta-fakta Utama
3. Analisis Mendalam
"""
        report = self._synthesize_report(prompt)
        if not report:
            return
            
        print(f"[RESEARCH] Laporan selesai untuk '{topic}'")
        
        # 4. Save to Long-Term Memory (ChromaDB)
        chunk = f"Laporan Riset Topik: {topic}\n\n{report}"
        emb = memory.create_embedding([chunk])
        if emb:
            memory.add_to_long_term_memory(f"Riset: {topic}", chunk, emb[0])
            print(f"[RESEARCH] Berhasil menyimpan hasil riset '{topic}' ke ChromaDB.")
        
        # 5. Notify
        if self._on_research_completed_callback:
            try:
                self._on_research_completed_callback(topic, report)
            except Exception as e:
                print(f"[RESEARCH] Callback error: {e}")

    def _synthesize_report(self, prompt: str) -> str:
        """Panggil LLM (Ollama) untuk merangkum riset."""
        try:
            # We use qwen3:8b or whatever is configured. Fallback to qwen2.5:7b or llama3
            model_name = "qwen3:8b" # default
            
            # Check installed models
            resp_tags = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
            if resp_tags.status_code == 200:
                installed = [m["name"] for m in resp_tags.json().get("models", [])]
                if "qwen3:8b" not in installed and "qwen3:8b:latest" not in installed:
                    # pick first available
                    if installed:
                        model_name = installed[0]
            
            resp = requests.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": model_name,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.3, "num_predict": 1024}
                },
                timeout=180
            )
            resp.raise_for_status()
            return resp.json().get("response", "")
        except Exception as e:
            print(f"[RESEARCH] Gagal sintesis laporan: {e}")
            return ""

# Singleton
research_engine = ResearchEngine()
