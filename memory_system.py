import os
import json
import time
import hashlib
from typing import List, Dict, Any, Optional

MEMORY_FILE = "data/episodic_memory.json"
LONG_TERM_FILE = "memori_bocchi.json"
CHROMA_DIR = "data/chromadb"

# ============================================================
# CUSTOM EMBEDDING FUNCTION — Ollama nomic-embed-text
# ============================================================

def _make_ollama_embedding_function():
    """Factory yang membuat OllamaEmbeddingFunction dengan mewarisi dari chromadb.EmbeddingFunction."""
    try:
        import chromadb as _chromadb
        
        class OllamaEmbeddingFunction(_chromadb.EmbeddingFunction):
            """ChromaDB-compatible embedding function menggunakan Ollama lokal."""
            
            def __init__(self, model: str = "nomic-embed-text:latest", base_url: str = "http://localhost:11434"):
                self.model = model
                self.base_url = base_url
            
            def __call__(self, input):
                import requests as _req
                try:
                    resp = _req.post(
                        f"{self.base_url}/api/embed",
                        json={"model": self.model, "input": list(input)},
                        timeout=120
                    )
                    resp.raise_for_status()
                    return resp.json().get("embeddings", [])
                except Exception as e:
                    print(f"[EMBED] OllamaEmbeddingFunction error: {e}")
                    return [[0.0] * 768 for _ in input]
        
        return OllamaEmbeddingFunction()
    except Exception as e:
        print(f"[EMBED] Gagal buat OllamaEmbeddingFunction: {e}")
        return None


# ============================================================
# MEMORY SYSTEM
# ============================================================

class MemorySystem:
    def __init__(self):
        self.working_memory: Dict[str, Dict[str, Any]] = {}
        self.episodic_memory: List[Dict[str, Any]] = []
        self.long_term_memory: List[Dict[str, Any]] = []
        
        # ChromaDB state
        self._chroma_client = None
        self._chroma_collection = None
        self._chroma_available = False
        
        # Ensure data dir exists
        os.makedirs("data", exist_ok=True)
        os.makedirs(CHROMA_DIR, exist_ok=True)
        
        self._load_episodic_memory()
        self._load_long_term_memory()
        self._init_chromadb()

    # ============================================================
    # CHROMADB INIT
    # ============================================================

    def _init_chromadb(self):
        """Inisialisasi ChromaDB PersistentClient. Fallback ke JSON jika gagal."""
        try:
            import chromadb
            
            self._chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
            embed_fn = _make_ollama_embedding_function()
            
            if embed_fn is None:
                raise RuntimeError("Gagal membuat OllamaEmbeddingFunction")
            
            self._chroma_collection = self._chroma_client.get_or_create_collection(
                name="bocchi_ltm",
                embedding_function=embed_fn,
                metadata={"hnsw:space": "cosine"}
            )
            
            self._chroma_available = True
            count = self._chroma_collection.count()
            print(f"[MEMORY] ChromaDB siap -- {count} entri di koleksi bocchi_ltm")
            
            # Migrate JSON entries ke ChromaDB jika ChromaDB masih kosong
            if count == 0 and self.long_term_memory:
                self._migrate_json_to_chroma()
                
        except Exception as e:
            self._chroma_available = False
            print(f"[MEMORY] ChromaDB tidak tersedia -- pakai JSON fallback: {e}")


    def _migrate_json_to_chroma(self):
        """Migrasi entri JSON yang sudah ada ke ChromaDB (one-time)."""
        try:
            print(f"[MEMORY] Migrasi {len(self.long_term_memory)} entri JSON ke ChromaDB...")
            for i, item in enumerate(self.long_term_memory):
                chroma_id = self._make_chroma_id(item.get("chunk", str(i)))
                try:
                    self._chroma_collection.add(
                        ids=[chroma_id],
                        documents=[item.get("chunk", "")],
                        metadatas=[{"nama": item.get("nama", "Memori Obrolan")}]
                    )
                except Exception:
                    pass  # Skip duplikat
            print(f"[MEMORY] Migrasi selesai!")
        except Exception as e:
            print(f"[MEMORY] Gagal migrasi: {e}")

    def _make_chroma_id(self, text: str) -> str:
        """Buat ID unik untuk ChromaDB dari teks + timestamp."""
        ts = str(int(time.time() * 1000))
        h = hashlib.sha1(text.encode()).hexdigest()[:6]
        return f"mem_{ts}_{h}"

    # ============================================================
    # EPISODIC MEMORY
    # ============================================================

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

    # ============================================================
    # WORKING MEMORY
    # ============================================================

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

    # ============================================================
    # LONG TERM MEMORY
    # ============================================================

    def _load_long_term_memory(self):
        if os.path.exists(LONG_TERM_FILE):
            try:
                with open(LONG_TERM_FILE, 'r', encoding='utf-8') as f:
                    self.long_term_memory = json.load(f)
            except Exception as e:
                print(f"[MEMORY] Error loading long-term memory: {e}")

    def _save_long_term_json(self):
        """Simpan long_term_memory ke JSON backup."""
        try:
            data_permanen = [
                entry for entry in self.long_term_memory
                if entry.get("nama") == "Memori Obrolan"
            ]
            with open(LONG_TERM_FILE, 'w', encoding='utf-8') as f:
                json.dump(data_permanen, f, indent=4)
        except Exception as e:
            print(f"[MEMORY ERROR] Gagal menyimpan JSON backup: {e}")

    def add_to_long_term_memory(self, name: str, chunk: str, embedding: List[float]):
        """Simpan memori ke ChromaDB + backup JSON."""
        item = {
            "nama": name,
            "chunk": chunk,
            "embedding": embedding
        }
        self.long_term_memory.append(item)
        
        # Simpan ke ChromaDB
        if self._chroma_available and self._chroma_collection:
            try:
                chroma_id = self._make_chroma_id(chunk)
                item["chroma_id"] = chroma_id
                self._chroma_collection.add(
                    ids=[chroma_id],
                    documents=[chunk],
                    metadatas=[{"nama": name}]
                )
            except Exception as e:
                print(f"[MEMORY] ChromaDB add error: {e}")
        
        # Backup ke JSON
        self._save_long_term_json()

    def get_all_memories_with_ids(self) -> List[Dict[str, Any]]:
        """Return semua memori beserta chroma_id untuk operasi delete di UI."""
        result = []
        for i, item in enumerate(self.long_term_memory):
            result.append({
                "index": i,
                "nama": item.get("nama", "Memori Obrolan"),
                "chunk": item.get("chunk", ""),
                "chroma_id": item.get("chroma_id", None)
            })
        return result

    def delete_memory_by_id(self, chroma_id: str) -> bool:
        """Hapus memori berdasarkan chroma_id dari ChromaDB + long_term_memory list."""
        deleted = False
        
        # Hapus dari ChromaDB
        if self._chroma_available and self._chroma_collection and chroma_id:
            try:
                self._chroma_collection.delete(ids=[chroma_id])
                deleted = True
            except Exception as e:
                print(f"[MEMORY] ChromaDB delete error: {e}")
        
        # Hapus dari in-memory list
        before_len = len(self.long_term_memory)
        self.long_term_memory = [
            m for m in self.long_term_memory
            if m.get("chroma_id") != chroma_id
        ]
        if len(self.long_term_memory) < before_len:
            deleted = True
        
        self._save_long_term_json()
        return deleted

    def delete_memory_by_index(self, index: int) -> bool:
        """Hapus memori berdasarkan index (fallback jika tidak ada chroma_id)."""
        if 0 <= index < len(self.long_term_memory):
            item = self.long_term_memory[index]
            chroma_id = item.get("chroma_id")
            
            # Hapus dari ChromaDB jika ada ID
            if self._chroma_available and self._chroma_collection and chroma_id:
                try:
                    self._chroma_collection.delete(ids=[chroma_id])
                except Exception as e:
                    print(f"[MEMORY] ChromaDB delete by index error: {e}")
            
            self.long_term_memory.pop(index)
            self._save_long_term_json()
            return True
        return False

    def clear_all_memories(self):
        """Hapus semua memori dari ChromaDB + JSON."""
        # Hapus koleksi ChromaDB
        if self._chroma_available and self._chroma_client:
            try:
                self._chroma_client.delete_collection("bocchi_ltm")
                embed_fn = _make_ollama_embedding_function()
                self._chroma_collection = self._chroma_client.get_or_create_collection(
                    name="bocchi_ltm",
                    embedding_function=embed_fn,
                    metadata={"hnsw:space": "cosine"}
                )
                print("[MEMORY] ChromaDB collection direset.")
            except Exception as e:
                print(f"[MEMORY] Gagal reset ChromaDB collection: {e}")
        
        # Kosongkan in-memory list + JSON
        self.long_term_memory.clear()
        try:
            with open(LONG_TERM_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f)
        except Exception as e:
            print(f"[MEMORY] Gagal kosongkan JSON: {e}")

    def save_chat_memory(self, user_text: str, agent_text: str):
        """Simpan percakapan sebagai memori jangka panjang + update topic graph."""
        mem_text = f"Pernah terjadi percakapan ini:\nUser: {user_text}\nBocchi: {agent_text}"
        print(f"[MEMORI] Merajut ingatan ke dalam otak...")
        emb = self.create_embedding([mem_text])
        if emb:
            self.add_to_long_term_memory("Memori Obrolan", mem_text, emb[0])
        
        # Update topic graph
        self._update_topic_graph(user_text, agent_text)

    # ============================================================
    # TOPIC GRAPH MEMORY
    # ============================================================

    TOPIC_GRAPH_FILE = os.path.join("data", "topic_graph.json")

    def _load_topic_graph(self) -> Dict[str, List[str]]:
        """Load topic graph dari disk."""
        try:
            if os.path.exists(self.TOPIC_GRAPH_FILE):
                with open(self.TOPIC_GRAPH_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            print(f"[GRAPH] Error loading topic graph: {e}")
        return {}

    def _save_topic_graph(self, graph: Dict[str, List[str]]):
        """Simpan topic graph ke disk."""
        try:
            os.makedirs(os.path.dirname(self.TOPIC_GRAPH_FILE), exist_ok=True)
            with open(self.TOPIC_GRAPH_FILE, "w", encoding="utf-8") as f:
                json.dump(graph, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[GRAPH] Error saving topic graph: {e}")

    def _extract_topics(self, text: str) -> List[str]:
        """Extract keyword topics dari teks percakapan (lightweight, no LLM)."""
        import re
        # Lowercase dan bersihkan
        text = text.lower()
        
        # Stop words Indonesia + English
        stop_words = {
            "yang", "dan", "di", "ke", "dari", "untuk", "dengan", "ini",
            "itu", "ada", "tidak", "bisa", "akan", "sudah", "juga", "saya",
            "aku", "kamu", "apa", "bagaimana", "adalah", "atau", "pada",
            "the", "a", "an", "is", "are", "was", "were", "be", "been",
            "to", "of", "in", "for", "on", "with", "at", "by", "from",
            "this", "that", "it", "you", "we", "they", "he", "she",
            "bocchi", "senpai", "hitori", "gotoh", "maaf", "terima", "kasih",
        }
        
        # Tokenize — ambil kata 3+ huruf
        words = re.findall(r'\b[a-z]{3,}\b', text)
        
        # Filter stop words & ambil yang unik
        topics = list(set(w for w in words if w not in stop_words))
        
        # Limit to top 8 keywords per chat
        return topics[:8]

    def _update_topic_graph(self, user_text: str, agent_text: str):
        """Update topic graph: hubungkan semua topik yang muncul bersamaan."""
        combined = f"{user_text} {agent_text}"
        topics = self._extract_topics(combined)
        
        if len(topics) < 2:
            return  # Perlu minimal 2 topik untuk membuat relasi
        
        graph = self._load_topic_graph()
        
        # Hubungkan setiap topik satu sama lain (co-occurrence)
        for i, topic_a in enumerate(topics):
            if topic_a not in graph:
                graph[topic_a] = []
            for topic_b in topics[i+1:]:
                if topic_b not in graph:
                    graph[topic_b] = []
                # Tambah relasi bidirectional (tanpa duplikat)
                if topic_b not in graph[topic_a]:
                    graph[topic_a].append(topic_b)
                if topic_a not in graph[topic_b]:
                    graph[topic_b].append(topic_a)
        
        self._save_topic_graph(graph)

    def get_related_topics(self, query: str, depth: int = 2) -> List[str]:
        """Cari topik terkait dari graph hingga kedalaman tertentu (BFS)."""
        graph = self._load_topic_graph()
        topics = self._extract_topics(query)
        
        visited = set()
        queue = list(topics)
        
        for _ in range(depth):
            next_queue = []
            for topic in queue:
                if topic in visited:
                    continue
                visited.add(topic)
                neighbors = graph.get(topic, [])
                next_queue.extend(n for n in neighbors if n not in visited)
            queue = next_queue
        
        # Return semua visited minus input topics
        return list(visited - set(topics))

    # ============================================================
    # EMBEDDING + SEARCH
    # ============================================================

    def create_embedding(self, texts: List[str]) -> List[List[float]]:
        """Membuat embedding vector menggunakan Ollama lokal (nomic-embed-text)."""
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
                print("[EMBED ERROR] Ollama Internal Server Error (500).")
                return []
                
            resp.raise_for_status()
            embeddings = resp.json().get("embeddings", [])
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
        """Cari memori relevan — ChromaDB primary, NumPy fallback."""
        if not self.long_term_memory:
            return []

        # --- ChromaDB search (primary) ---
        if self._chroma_available and self._chroma_collection:
            try:
                count = self._chroma_collection.count()
                if count > 0:
                    results = self._chroma_collection.query(
                        query_texts=[query],
                        n_results=min(top_k, count),
                        include=["documents", "metadatas", "distances"]
                    )
                    
                    hasil = []
                    docs = results.get("documents", [[]])[0]
                    metas = results.get("metadatas", [[]])[0]
                    distances = results.get("distances", [[]])[0]
                    
                    for doc, meta, dist in zip(docs, metas, distances):
                        # ChromaDB cosine distance: 0 = identical, 2 = opposite
                        # Konversi ke similarity: 1 - (dist/2)
                        similarity = max(0.0, 1.0 - (dist / 2.0))
                        if similarity > 0.3:
                            nama = meta.get("nama", "Memori Obrolan")
                            hasil.append(f"[{nama}] (relevansi: {similarity:.2f})\n{doc}")
                    
                    return hasil
            except Exception as e:
                print(f"[MEMORY] ChromaDB search error, fallback ke NumPy: {e}")

        # --- NumPy cosine fallback ---
        if not self.long_term_memory:
            return []
            
        query_vec = self.create_query_embedding(query)
        if not query_vec:
            return []
            
        scored = []
        query_dim = len(query_vec)
        for item in self.long_term_memory:
            emb = item.get("embedding")
            if emb and len(emb) == query_dim:  # Skip entri dengan dimensi berbeda
                sim = self.cosine_similarity(query_vec, emb)
                scored.append((sim, item))
                
        scored.sort(key=lambda x: x[0], reverse=True)
        
        hasil = []
        for sim, item in scored[:top_k]:
            if sim > 0.3:
                hasil.append(f"[{item['nama']}] (relevansi: {sim:.2f})\n{item['chunk']}")
                
        return hasil


# Global instance
memory = MemorySystem()
