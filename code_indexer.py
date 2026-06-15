"""
Code Indexer — Semantic Code Search Engine untuk BOCCHI-JARVIS.

Scan folder project, chunk file kode per fungsi/class, embed ke ChromaDB,
dan sediakan semantic search agar Bocchi bisa menjawab pertanyaan tentang kode.

Storage: ChromaDB collection 'bocchi_code' (terpisah dari 'bocchi_ltm')
Embedding: nomic-embed-text via Ollama (sama dengan memory_system)
"""

import os
import re
import time
import hashlib
from typing import List, Dict, Any, Optional
from datetime import datetime

# ============================================================
# CONFIG
# ============================================================

# File extensions yang di-index
CODE_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go",
    ".rs", ".cpp", ".c", ".h", ".cs", ".rb", ".php",
    ".html", ".css", ".json", ".yaml", ".yml", ".toml",
    ".md", ".txt", ".sh", ".bat", ".ps1"
}

# Folder yang di-skip
SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv",
    "env", ".env", "dist", "build", ".next", ".nuxt",
    "Qwen3-TTS", "data", "chromadb", ".gemini", ".system_generated"
}

# Max file size (500KB)
MAX_FILE_SIZE = 500_000

# ChromaDB collection name
COLLECTION_NAME = "bocchi_code"

# ============================================================
# CODE CHUNKER
# ============================================================

def _chunk_python(content: str, filepath: str) -> List[Dict[str, str]]:
    """Chunk Python file per fungsi/class definition."""
    chunks = []
    lines = content.split("\n")
    
    current_chunk = []
    current_name = os.path.basename(filepath)
    
    for line in lines:
        # Detect function/class definitions
        match = re.match(r'^(class |def |async def )(\w+)', line)
        if match:
            # Save previous chunk
            if current_chunk:
                text = "\n".join(current_chunk)
                if text.strip():
                    chunks.append({
                        "name": current_name,
                        "content": text[:2000],
                        "filepath": filepath
                    })
            current_name = f"{os.path.basename(filepath)}::{match.group(2)}"
            current_chunk = [line]
        else:
            current_chunk.append(line)
    
    # Don't forget last chunk
    if current_chunk:
        text = "\n".join(current_chunk)
        if text.strip():
            chunks.append({
                "name": current_name,
                "content": text[:2000],
                "filepath": filepath
            })
    
    return chunks


def _chunk_generic(content: str, filepath: str, chunk_size: int = 1500) -> List[Dict[str, str]]:
    """Chunk file generik per N karakter dengan overlap."""
    chunks = []
    basename = os.path.basename(filepath)
    
    if len(content) <= chunk_size:
        chunks.append({
            "name": basename,
            "content": content,
            "filepath": filepath
        })
    else:
        overlap = 200
        start = 0
        part = 1
        while start < len(content):
            end = start + chunk_size
            chunk_text = content[start:end]
            chunks.append({
                "name": f"{basename}::part{part}",
                "content": chunk_text,
                "filepath": filepath
            })
            start = end - overlap
            part += 1
    
    return chunks


def chunk_file(filepath: str) -> List[Dict[str, str]]:
    """Chunk satu file berdasarkan tipe."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception:
        return []
    
    if not content.strip():
        return []
    
    ext = os.path.splitext(filepath)[1].lower()
    
    if ext == ".py":
        return _chunk_python(content, filepath)
    else:
        return _chunk_generic(content, filepath)


# ============================================================
# CODE INDEXER
# ============================================================

class CodeIndexer:
    """Semantic code search engine menggunakan ChromaDB."""
    
    def __init__(self):
        self._chroma_client = None
        self._collection = None
        self._available = False
        self._indexed_files: Dict[str, str] = {}  # filepath -> content_hash
        self._last_index_time: Optional[str] = None
        self._init_chromadb()
    
    def _init_chromadb(self):
        """Init ChromaDB collection untuk code."""
        try:
            import chromadb
            from memory_system import _make_ollama_embedding_function
            
            chroma_dir = os.path.join("data", "chromadb")
            os.makedirs(chroma_dir, exist_ok=True)
            
            self._chroma_client = chromadb.PersistentClient(path=chroma_dir)
            embed_fn = _make_ollama_embedding_function()
            
            if embed_fn is None:
                raise RuntimeError("Gagal membuat embedding function")
            
            self._collection = self._chroma_client.get_or_create_collection(
                name=COLLECTION_NAME,
                embedding_function=embed_fn,
                metadata={"hnsw:space": "cosine"}
            )
            
            self._available = True
            count = self._collection.count()
            print(f"[CODE_INDEX] ChromaDB siap — {count} code chunks di collection '{COLLECTION_NAME}'")
            
        except Exception as e:
            self._available = False
            print(f"[CODE_INDEX] ChromaDB tidak tersedia: {e}")
    
    def _content_hash(self, content: str) -> str:
        """Hash konten file untuk deteksi perubahan."""
        return hashlib.md5(content.encode()).hexdigest()[:12]
    
    def index_directory(self, directory: str, force: bool = False) -> Dict[str, Any]:
        """
        Scan dan index semua file kode di directory.
        
        Returns: { files_scanned, chunks_indexed, elapsed_seconds }
        """
        if not self._available:
            return {"error": "ChromaDB tidak tersedia", "files_scanned": 0, "chunks_indexed": 0}
        
        start = time.time()
        files_scanned = 0
        chunks_indexed = 0
        skipped = 0
        
        print(f"[CODE_INDEX] Scanning directory: {directory}")
        
        for root, dirs, files in os.walk(directory):
            # Skip excluded directories
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            
            for fname in files:
                ext = os.path.splitext(fname)[1].lower()
                if ext not in CODE_EXTENSIONS:
                    continue
                
                filepath = os.path.join(root, fname)
                
                # Skip files too large
                try:
                    if os.path.getsize(filepath) > MAX_FILE_SIZE:
                        continue
                except OSError:
                    continue
                
                # Read content and check hash
                try:
                    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()
                except Exception:
                    continue
                
                content_hash = self._content_hash(content)
                
                # Skip if already indexed with same hash (unless force)
                if not force and self._indexed_files.get(filepath) == content_hash:
                    skipped += 1
                    continue
                
                files_scanned += 1
                
                # Chunk the file
                chunks = chunk_file(filepath)
                
                for chunk in chunks:
                    try:
                        chunk_id = f"code_{self._content_hash(chunk['content'] + chunk['filepath'])}"
                        
                        # Prefix for better embedding quality
                        doc_text = f"File: {chunk['filepath']}\nName: {chunk['name']}\n\n{chunk['content']}"
                        
                        self._collection.upsert(
                            ids=[chunk_id],
                            documents=[doc_text],
                            metadatas=[{
                                "filepath": chunk["filepath"],
                                "name": chunk["name"],
                                "type": "code"
                            }]
                        )
                        chunks_indexed += 1
                    except Exception as e:
                        print(f"[CODE_INDEX] Error indexing chunk {chunk['name']}: {e}")
                
                self._indexed_files[filepath] = content_hash
        
        elapsed = time.time() - start
        self._last_index_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        result = {
            "files_scanned": files_scanned,
            "chunks_indexed": chunks_indexed,
            "skipped_unchanged": skipped,
            "elapsed_seconds": round(elapsed, 2),
            "total_in_collection": self._collection.count() if self._collection else 0,
            "indexed_at": self._last_index_time
        }
        
        print(f"[CODE_INDEX] Done: {files_scanned} files, {chunks_indexed} chunks in {elapsed:.1f}s")
        return result
    
    def search_code(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Semantic search pada indexed code."""
        if not self._available or not self._collection:
            return []
        
        try:
            count = self._collection.count()
            if count == 0:
                return []
            
            results = self._collection.query(
                query_texts=[f"code: {query}"],
                n_results=min(top_k, count),
                include=["documents", "metadatas", "distances"]
            )
            
            output = []
            docs = results.get("documents", [[]])[0]
            metas = results.get("metadatas", [[]])[0]
            distances = results.get("distances", [[]])[0]
            
            for doc, meta, dist in zip(docs, metas, distances):
                similarity = max(0.0, 1.0 - (dist / 2.0))
                if similarity > 0.25:  # Lower threshold for code
                    output.append({
                        "content": doc[:1500],
                        "filepath": meta.get("filepath", ""),
                        "name": meta.get("name", ""),
                        "similarity": round(similarity, 3),
                        "type": "code"
                    })
            
            return output
            
        except Exception as e:
            print(f"[CODE_INDEX] Search error: {e}")
            return []
    
    def get_stats(self) -> Dict[str, Any]:
        """Get indexer stats."""
        return {
            "available": self._available,
            "indexed_files": len(self._indexed_files),
            "total_chunks": self._collection.count() if self._available and self._collection else 0,
            "last_index_time": self._last_index_time
        }


# ============================================================
# SINGLETON
# ============================================================

code_indexer = CodeIndexer()
