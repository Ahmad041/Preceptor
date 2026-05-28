import logging
from memory_system import memory
from embedding_engine import embedding_engine
from notes_engine import notes_index
import requests

logger = logging.getLogger("Omniscient")

class OmniscientHub:
    def __init__(self, gitnexus_port=4747):
        self.gitnexus_port = gitnexus_port
        
    def search_memory(self, query: str, top_k=5):
        """Searches Chat History (ChromaDB)"""
        try:
            results = memory.search_relevant_chunks(query, top_k=top_k)
            return results
        except Exception as e:
            logger.error(f"Memory search error: {e}")
            return []
            
    def search_docs(self, query: str, top_k=3):
        """Searches Local Documents/Notes (Nomic Embed + FAISS)"""
        try:
            results = []
            scores = embedding_engine.semantic_search(query, top_k=top_k)
            for item in scores:
                note_id = item["id"]
                score = item["similarity"]
                note = notes_index.get_note(note_id)
                if note:
                    results.append({
                        "content": note.get("content", ""),
                        "metadata": {
                            "title": note.get("title", ""),
                            "path": note.get("path", ""),
                            "id": note_id
                        },
                        "score": score
                    })
            return results
        except Exception as e:
            logger.error(f"Docs search error: {e}")
            return []
            
    def search_code(self, query: str):
        """Searches Code via GitNexus API (if available)"""
        # We will attempt to use the GitNexus local API.
        # This will be refined once we have the exact API endpoint.
        try:
            # Placeholder for GitNexus Code Search.
            # Depending on how we integrate it, we might just return a URL to the GitNexus UI or use an API.
            url = f"http://localhost:{self.gitnexus_port}/api/repo"
            res = requests.get(url, timeout=2)
            if res.status_code == 200:
                return [{"type": "code", "content": "GitNexus server is running. Deep code search available via GitNexus UI.", "source": "GitNexus"}]
            return []
        except Exception:
            return [{"type": "error", "content": "GitNexus server unreachable.", "source": "GitNexus"}]
            
    def unified_search(self, query: str):
        """Performs search across Memory, Docs, and Code"""
        logger.info(f"[Omniscient] Searching for: {query}")
        
        mem_res = self.search_memory(query)
        doc_res = self.search_docs(query)
        code_res = self.search_code(query)
        
        return {
            "query": query,
            "results": {
                "memory": mem_res,
                "docs": doc_res,
                "code": code_res
            }
        }

omniscient = OmniscientHub()
