import os
import json
import time
from typing import List, Dict, Any, Optional

MEMORY_FILE = "data/episodic_memory.json"
LONG_TERM_FILE = "memori_bocchi.json"

class MemorySystem:
    def __init__(self):
        self.working_memory: Dict[str, Dict[str, Any]] = {}  # agent_id -> memory_dict
        self.episodic_memory: List[Dict[str, Any]] = []
        self.long_term_memory: List[Dict[str, Any]] = []
        
        # Ensure data dir exists
        os.makedirs("data", exist_ok=True)
        
        self._load_episodic_memory()
        self._load_long_term_memory()

    def _load_episodic_memory(self):
        if os.path.exists(MEMORY_FILE):
            try:
                with open(MEMORY_FILE, 'r', encoding='utf-8') as f:
                    self.episodic_memory = json.load(f)
            except Exception as e:
                print(f"[MEMORY] Error loading episodic memory: {e}")

    def _save_episodic_memory(self):
        try:
            with open(MEMORY_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.episodic_memory, f, indent=4)
        except Exception as e:
            print(f"[MEMORY] Error saving episodic memory: {e}")

    def _load_long_term_memory(self):
        if os.path.exists(LONG_TERM_FILE):
            try:
                with open(LONG_TERM_FILE, 'r', encoding='utf-8') as f:
                    self.long_term_memory = json.load(f)
            except Exception as e:
                print(f"[MEMORY] Error loading long-term memory: {e}")

    # --- WORKING MEMORY ---
    def get_working_memory(self, agent_id: str, key: str = None) -> Any:
        if agent_id not in self.working_memory:
            self.working_memory[agent_id] = {}
        if key:
            return self.working_memory[agent_id].get(key)
        return self.working_memory[agent_id]

    def set_working_memory(self, agent_id: str, key: str, value: Any):
        if agent_id not in self.working_memory:
            self.working_memory[agent_id] = {}
        self.working_memory[agent_id][key] = value

    def clear_working_memory(self, agent_id: str):
        if agent_id in self.working_memory:
            self.working_memory[agent_id] = {}

    # --- EPISODIC MEMORY ---
    def record_episode(self, agent_id: str, task: str, action: str, result: str, success: bool):
        """Records an episode of an agent's action and its result."""
        episode = {
            "timestamp": time.time(),
            "agent_id": agent_id,
            "task": task,
            "action": action,
            "result": result,
            "success": success
        }
        self.episodic_memory.append(episode)
        self._save_episodic_memory()

    def get_recent_episodes(self, agent_id: str, limit: int = 5) -> List[Dict[str, Any]]:
        agent_episodes = [ep for ep in self.episodic_memory if ep.get("agent_id") == agent_id]
        return agent_episodes[-limit:]

    # --- LONG TERM MEMORY ---
    def add_to_long_term_memory(self, name: str, chunk: str, embedding: List[float]):
        item = {
            "nama": name,
            "chunk": chunk,
            "embedding": embedding
        }
        self.long_term_memory.append(item)
        
        # Save back to file (only 'Memori Obrolan' for backward compatibility based on existing logic)
        try:
            data_permanen = [item for item in self.long_term_memory if item.get("nama") == "Memori Obrolan"]
            with open(LONG_TERM_FILE, 'w', encoding='utf-8') as f:
                json.dump(data_permanen, f, indent=4)
        except Exception as e:
            print(f"[MEMORY ERROR] Gagal menyimpan memori jangka panjang: {e}")

    def save_chat_memory(self, user_text: str, agent_text: str):
        """Simpan percakapan sebagai memori jangka panjang"""
        mem_text = f"Pernah terjadi percakapan ini:\nUser: {user_text}\nBocchi: {agent_text}"
        print(f"[MEMORI] Merajut ingatan ke dalam otak...")
        emb = self.create_embedding([mem_text])
        if emb:
            self.add_to_long_term_memory("Memori Obrolan", mem_text, emb[0])

    def create_embedding(self, texts: List[str]) -> List[List[float]]:
        """Membuat embedding vector menggunakan Ollama lokal (nomic-embed-text)"""
        if not texts:
            return []
            
        import requests
        OLLAMA_BASE_URL = "http://localhost:11434"
        OLLAMA_EMBED_MODEL = "nomic-embed-text:latest"
        
        print(f"[EMBED] Memproses {len(texts)} chunks via Ollama (/api/embed)...")
        try:
            resp = requests.post(
                f"{OLLAMA_BASE_URL}/api/embed",
                json={"model": OLLAMA_EMBED_MODEL, "input": texts},
                timeout=120
            )
            if resp.status_code == 500:
                print("[EMBED ERROR] Ollama Internal Server Error (500). Kemungkinan VRAM/RAM habis.")
                return []
                
            resp.raise_for_status()
            embeddings = resp.json().get("embeddings", [])
            
            if embeddings and len(embeddings) == len(texts):
                return embeddings
            else:
                return embeddings
        except Exception as e:
            print(f"[EMBED ERROR] Gagal embed via Ollama: {e}")
            return []

    def create_query_embedding(self, text: str) -> List[float]:
        emb = self.create_embedding([text])
        return emb[0] if emb else []

    def cosine_similarity(self, a, b):
        import numpy as np
        a = np.array(a)
        b = np.array(b)
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8)

    def search_relevant_chunks(self, query: str, top_k: int = 5) -> List[str]:
        if not self.long_term_memory:
            return []
            
        query_vec = self.create_query_embedding(query)
        if not query_vec:
            return []
            
        scored = []
        for item in self.long_term_memory:
            if item.get("embedding"):
                sim = self.cosine_similarity(query_vec, item["embedding"])
                scored.append((sim, item))
                
        scored.sort(key=lambda x: x[0], reverse=True)
        
        hasil = []
        for sim, item in scored[:top_k]:
            if sim > 0.3:
                hasil.append(f"[📄 {item['nama']}] (relevansi: {sim:.2f})\n{item['chunk']}")
                
        return hasil

# Global instance
memory = MemorySystem()
