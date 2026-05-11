"""
Bocchi Notes — Embedding Engine (Neural Network)
Model: intfloat/multilingual-e5-small
Untuk semantic search, auto-link suggestion, dan 3D graph positioning.
"""

import os
import time
import numpy as np
from typing import Optional
from pathlib import Path

# ============================================================
# CONFIG
# ============================================================

MODEL_NAME = "intfloat/multilingual-e5-small"
EMBEDDING_DIM = 384
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
EMBEDDINGS_CACHE = os.path.join(CACHE_DIR, "note_embeddings.npz")
PCA_CACHE = os.path.join(CACHE_DIR, "note_positions_2d.npz")

# ============================================================
# EMBEDDING ENGINE
# ============================================================

class EmbeddingEngine:
    """Neural network engine untuk semantic search dan similarity."""

    def __init__(self):
        self.model = None
        self.embeddings: dict[str, np.ndarray] = {}  # note_id -> vector
        self.positions_2d: dict[str, list] = {}  # note_id -> [x, y]
        self._model_loaded = False

    def load_model(self):
        """Load multilingual-e5-small model. ~450MB first download."""
        if self._model_loaded:
            return

        print(f"[Embedding] Loading model: {MODEL_NAME}...")
        start = time.time()

        try:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(MODEL_NAME)
            self._model_loaded = True
            elapsed = time.time() - start
            print(f"[Embedding] Model loaded in {elapsed:.1f}s")
        except ImportError:
            print("[Embedding] ERROR: sentence-transformers not installed!")
            print("[Embedding] Run: pip install sentence-transformers")
            self._model_loaded = False
        except Exception as e:
            print(f"[Embedding] ERROR loading model: {e}")
            self._model_loaded = False

    def is_ready(self) -> bool:
        """Cek apakah model sudah loaded."""
        return self._model_loaded and self.model is not None

    def embed_text(self, text: str) -> Optional[np.ndarray]:
        """Embed satu teks menjadi vector 384D."""
        if not self.is_ready():
            self.load_model()
        if not self.is_ready():
            return None

        # E5 model butuh prefix "query: " atau "passage: "
        prefixed = f"passage: {text}"
        try:
            embedding = self.model.encode(prefixed, normalize_embeddings=True)
            return embedding
        except Exception as e:
            print(f"[Embedding] Error encoding text: {e}")
            return None

    def embed_query(self, query: str) -> Optional[np.ndarray]:
        """Embed search query (pakai prefix 'query:')."""
        if not self.is_ready():
            self.load_model()
        if not self.is_ready():
            return None

        prefixed = f"query: {query}"
        try:
            return self.model.encode(prefixed, normalize_embeddings=True)
        except Exception as e:
            print(f"[Embedding] Error encoding query: {e}")
            return None

    def embed_notes(self, notes_index):
        """Batch embed semua notes yang belum punya embedding."""
        if not self.is_ready():
            self.load_model()
        if not self.is_ready():
            print("[Embedding] Model not ready, skipping batch embed")
            return

        # Load existing cache
        self._load_cache()

        # Cari notes yang perlu di-embed (baru atau berubah)
        to_embed = []
        for note_id, note in notes_index.notes.items():
            if note_id not in self.embeddings:
                to_embed.append((note_id, note))

        if not to_embed:
            print("[Embedding] All notes already embedded")
            self._compute_2d_positions(notes_index)
            return

        print(f"[Embedding] Embedding {len(to_embed)} notes...")
        start = time.time()

        # Batch encode untuk efisiensi
        texts = []
        ids = []
        for note_id, note in to_embed:
            try:
                with open(note["path"], 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
                # Gabungkan title + content untuk embedding yang lebih kaya
                text = f"{note['title']}. {content[:2000]}"  # Limit 2000 chars
                texts.append(f"passage: {text}")
                ids.append(note_id)
            except Exception as e:
                print(f"[Embedding] Error reading {note['path']}: {e}")

        if texts:
            try:
                vectors = self.model.encode(
                    texts,
                    normalize_embeddings=True,
                    show_progress_bar=True,
                    batch_size=32,
                )
                for i, note_id in enumerate(ids):
                    self.embeddings[note_id] = vectors[i]
            except Exception as e:
                print(f"[Embedding] Batch encode error: {e}")

        elapsed = time.time() - start
        print(f"[Embedding] Embedded {len(ids)} notes in {elapsed:.1f}s")

        # Compute 2D positions
        self._compute_2d_positions(notes_index)

        # Save cache
        self._save_cache()

    def _compute_2d_positions(self, notes_index=None):
        """PCA: Reduksi 384D → 2D untuk knowledge graph positioning dengan clustering per kategori."""
        if len(self.embeddings) < 1:
            return

        # 1. Identify all unique categories (root folders)
        categories = set()
        if notes_index:
            for note in notes_index.notes.values():
                categories.add(note.get("root_folder", "default"))
        else:
            categories.add("default")
        
        categories = sorted(list(categories))
        num_cats = len(categories)

        # 2. Distribute Category Centers (Territories) in a circle (2D)
        CATEGORY_CENTERS = {}
        radius = 180 # Spread categories far enough in 2D
        
        for i in range(num_cats):
            angle = (2 * np.pi * i) / num_cats
            x = np.cos(angle) * radius
            y = np.sin(angle) * radius
            CATEGORY_CENTERS[categories[i]] = [x, y]

        if len(self.embeddings) < 2:
            # Terlalu sedikit untuk PCA, gunakan territory + random noise
            for note_id in self.embeddings:
                root = "default"
                if notes_index and note_id in notes_index.notes:
                    root = notes_index.notes[note_id].get("root_folder", "default")
                center = CATEGORY_CENTERS.get(root, CATEGORY_CENTERS.get('default', [0,0]))
                noise = np.random.randn(2).tolist()
                self.positions_2d[note_id] = [c + n * 15 for c, n in zip(center, noise)]
            return

        # 3. PCA Projection (2D)
        ids = list(self.embeddings.keys())
        matrix = np.stack([self.embeddings[nid] for nid in ids])

        # PCA manually for 2 components
        mean = matrix.mean(axis=0)
        centered = matrix - mean
        cov = np.cov(centered.T)
        eigenvalues, eigenvectors = np.linalg.eigh(cov)
        top2_idx = np.argsort(eigenvalues)[-2:][::-1]
        components = eigenvectors[:, top2_idx]
        projected = centered @ components

        # 4. Normalize PCA projection to a local cluster area [-40, 40]
        p_min = projected.min(axis=0)
        p_max = projected.max(axis=0)
        p_range = p_max - p_min
        p_range[p_range == 0] = 1 # Avoid division by zero
        
        # Scale to [-40, 40]
        projected = (projected - p_min) / p_range * 80 - 40

        # 5. Save positions with category offsets (Territory Logic)
        for i, note_id in enumerate(ids):
            root = "default"
            if notes_index and note_id in notes_index.notes:
                root = notes_index.notes[note_id].get("root_folder", "default")
            
            center = CATEGORY_CENTERS.get(root, CATEGORY_CENTERS.get('default', [0,0]))
            local_pos = projected[i].tolist()
            
            # Combine: Territory center + local semantic structure (local cluster)
            self.positions_2d[note_id] = [c + p for c, p in zip(center, local_pos)]

    def find_similar(self, note_id: str, top_k: int = 5) -> list[dict]:
        """Cari notes yang paling mirip secara semantik."""
        if note_id not in self.embeddings:
            return []

        query_vec = self.embeddings[note_id]
        scores = []

        for other_id, other_vec in self.embeddings.items():
            if other_id == note_id:
                continue
            # Cosine similarity (vectors sudah normalized)
            similarity = float(np.dot(query_vec, other_vec))
            scores.append({"id": other_id, "similarity": round(similarity, 4)})

        scores.sort(key=lambda x: x["similarity"], reverse=True)
        return scores[:top_k]

    def semantic_search(self, query: str, top_k: int = 10) -> list[dict]:
        """Semantic search: cari notes berdasarkan makna query."""
        query_vec = self.embed_query(query)
        if query_vec is None:
            return []

        scores = []
        for note_id, note_vec in self.embeddings.items():
            similarity = float(np.dot(query_vec, note_vec))
            scores.append({"id": note_id, "similarity": round(similarity, 4)})

        scores.sort(key=lambda x: x["similarity"], reverse=True)
        return scores[:top_k]

    def get_graph_positions(self) -> dict:
        """Get 2D positions untuk semua notes."""
        return self.positions_2d

    # ─── Cache Management ───

    def _save_cache(self):
        """Save embeddings ke disk."""
        os.makedirs(CACHE_DIR, exist_ok=True)

        if not self.embeddings:
            return

        try:
            ids = list(self.embeddings.keys())
            vectors = np.stack([self.embeddings[nid] for nid in ids])
            np.savez_compressed(
                EMBEDDINGS_CACHE,
                ids=np.array(ids),
                vectors=vectors,
            )
            print(f"[Embedding] Saved {len(ids)} embeddings to cache")
        except Exception as e:
            print(f"[Embedding] Error saving cache: {e}")

        # Save 2D positions
        if self.positions_2d:
            try:
                pos_ids = list(self.positions_2d.keys())
                pos_vectors = np.array([self.positions_2d[nid] for nid in pos_ids])
                np.savez_compressed(
                    PCA_CACHE,
                    ids=np.array(pos_ids),
                    positions=pos_vectors,
                )
            except Exception as e:
                print(f"[Embedding] Error saving positions cache: {e}")

    def _load_cache(self):
        """Load embeddings dari cache."""
        if not os.path.exists(EMBEDDINGS_CACHE):
            return

        try:
            data = np.load(EMBEDDINGS_CACHE, allow_pickle=True)
            ids = data["ids"]
            vectors = data["vectors"]
            for i, note_id in enumerate(ids):
                self.embeddings[str(note_id)] = vectors[i]
            print(f"[Embedding] Loaded {len(ids)} embeddings from cache")
        except Exception as e:
            print(f"[Embedding] Error loading cache: {e}")

        # Load 2D positions
        if os.path.exists(PCA_CACHE):
            try:
                data = np.load(PCA_CACHE, allow_pickle=True)
                ids = data["ids"]
                positions = data["positions"]
                for i, note_id in enumerate(ids):
                    self.positions_2d[str(note_id)] = positions[i].tolist()
            except Exception as e:
                print(f"[Embedding] Error loading positions cache: {e}")

    def remove_note(self, note_id: str):
        """Hapus embedding saat note dihapus."""
        self.embeddings.pop(note_id, None)
        self.positions_2d.pop(note_id, None)

    def get_stats(self) -> dict:
        """Get embedding engine stats."""
        return {
            "model": MODEL_NAME,
            "model_loaded": self._model_loaded,
            "total_embeddings": len(self.embeddings),
            "total_positions": len(self.positions_2d),
            "embedding_dim": EMBEDDING_DIM,
        }


# ============================================================
# SINGLETON INSTANCE
# ============================================================

embedding_engine = EmbeddingEngine()
