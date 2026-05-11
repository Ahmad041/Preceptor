"""
Bocchi Notes Engine — Core Note System
Multi-folder watcher, CRUD, wikilinks, tags, backlinks, daily notes.
Semua note disimpan sebagai file .md di disk.
"""

import os
import re
import json
import hashlib
import time
from pathlib import Path
from datetime import datetime, date
from typing import Optional
import io
import PyPDF2

# ============================================================
# CONFIG
# ============================================================

# Folder untuk note baru yang dibuat dari app
DEFAULT_NOTES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "notes")

# Config file untuk watched folders (dynamic)
WATCHED_FOLDERS_CONFIG = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "watched_folders.json"
)

# Default folders (used only if config doesn't exist yet)
_DEFAULT_WATCHED = [
    DEFAULT_NOTES_DIR,
    r"C:\Users\ahamd\OneDrive\Dokumen\Obsidian"
]

def _load_watched_folders() -> list:
    """Load watched folders dari config file."""
    if os.path.exists(WATCHED_FOLDERS_CONFIG):
        try:
            with open(WATCHED_FOLDERS_CONFIG, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return list(_DEFAULT_WATCHED)

def _save_watched_folders(folders: list):
    """Save watched folders ke config file."""
    os.makedirs(os.path.dirname(WATCHED_FOLDERS_CONFIG), exist_ok=True)
    with open(WATCHED_FOLDERS_CONFIG, "w", encoding="utf-8") as f:
        json.dump(folders, f, indent=2, ensure_ascii=False)

def get_watched_folders() -> list:
    """Get current watched folders list."""
    return _load_watched_folders()

def add_watched_folder(folder_path: str) -> bool:
    """Add a folder to watched list. Returns True if added."""
    folders = _load_watched_folders()
    normalized = os.path.normpath(folder_path)
    # Check duplicate
    for existing in folders:
        if os.path.normpath(existing).lower() == normalized.lower():
            return False
    if not os.path.isdir(normalized):
        return False
    folders.append(normalized)
    _save_watched_folders(folders)
    return True

def remove_watched_folder(folder_path: str) -> bool:
    """Remove a folder from watched list. Returns True if removed."""
    folders = _load_watched_folders()
    normalized = os.path.normpath(folder_path).lower()
    new_folders = [f for f in folders if os.path.normpath(f).lower() != normalized]
    if len(new_folders) == len(folders):
        return False
    _save_watched_folders(new_folders)
    return True

# Active list — lazily loaded
WATCHED_FOLDERS = _load_watched_folders()

# Daily notes folder
DAILY_NOTES_DIR = os.path.join(DEFAULT_NOTES_DIR, "Daily Notes")

# Index cache
INDEX_CACHE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "notes_index.json"
)

# File extensions yang di-index
SUPPORTED_EXTENSIONS = {
    ".md", ".pdf", ".markdown", ".json"
}

# Folders to skip
SKIP_FOLDERS = {
    ".git", ".github", "node_modules", "__pycache__", ".obsidian", ".vscode",
    "venv", ".venv", ".env", "dist", "build", ".next", ".cache", ".idea",
    "target", "vendor", "out", ".gradle", ".svn", ".trash"
}

# File names to skip during indexing
SKIP_FILES = {
    "desktop.ini", "thumbs.db", ".DS_Store", "memori_bocchi.json"
}

# Max file size to index (500 KB)
MAX_FILE_SIZE = 500 * 1024

# ============================================================
# WIKILINK & TAG PARSER
# ============================================================

# Regex: [[link]] atau [[link|display text]]
WIKILINK_PATTERN = re.compile(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]')

# Regex: #tag (tapi bukan #heading dan bukan hex color)
TAG_PATTERN = re.compile(r'(?<!\w)#([a-zA-Z\u00C0-\u024F\u0400-\u04FF][\w\-/]*)', re.UNICODE)


def extract_wikilinks(content: str) -> list[str]:
    """Ekstrak semua [[wikilink]] dari markdown content."""
    return [match.group(1).strip() for match in WIKILINK_PATTERN.finditer(content)]


def extract_tags(content: str) -> list[str]:
    """Ekstrak semua #tags dari markdown content. Support nested: #coding/python"""
    # Jangan ambil tags dari code blocks
    # Hapus code blocks dulu
    clean = re.sub(r'```[\s\S]*?```', '', content)
    clean = re.sub(r'`[^`]+`', '', clean)
    # Hapus headings (# Heading)
    clean = re.sub(r'^#{1,6}\s', '', clean, flags=re.MULTILINE)
    
    tags = list(set(match.group(1) for match in TAG_PATTERN.finditer(clean)))
    return sorted(tags)


def extract_title(content: str, filepath: str) -> str:
    """Ambil judul dari H1 pertama atau nama file."""
    match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return Path(filepath).stem


# ============================================================
# NOTE METADATA
# ============================================================

def compute_note_id(filepath: str) -> str:
    """Generate unique ID dari absolute path."""
    normalized = os.path.normpath(filepath).lower()
    return hashlib.md5(normalized.encode('utf-8')).hexdigest()[:12]


def get_root_folder_name(filepath: str) -> str:
    """Tentukan note ini berasal dari watched folder mana."""
    normalized = os.path.normpath(filepath).lower()
    for folder in WATCHED_FOLDERS:
        folder_norm = os.path.normpath(folder).lower()
        if normalized.startswith(folder_norm):
            return Path(folder).name
    return "unknown"


def get_relative_path(filepath: str) -> str:
    """Get path relatif terhadap watched folder root."""
    normalized = os.path.normpath(filepath)
    for folder in WATCHED_FOLDERS:
        folder_norm = os.path.normpath(folder)
        if normalized.lower().startswith(folder_norm.lower()):
            rel = os.path.relpath(normalized, folder_norm)
            return rel
    return os.path.basename(filepath)


def build_note_metadata(filepath: str) -> dict:
    """Build metadata object untuk satu note."""
    ext = Path(filepath).suffix.lower()
    stat = os.stat(filepath)
    
    # Skip if too large
    if stat.st_size > MAX_FILE_SIZE:
        try:
            print(f"[Notes] Skipping large file: {filepath} ({stat.st_size} bytes)")
        except UnicodeEncodeError:
            print(f"[Notes] Skipping large file: {filepath.encode('ascii', 'replace').decode()} ({stat.st_size} bytes)")
        return None

    content = ""
    is_markdown = ext in {'.md', '.markdown'}
    
    try:
        if ext == '.pdf':
            with open(filepath, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                pages_text = []
                # Ambil 5 halaman pertama saja untuk metadata/title extraction agar hemat
                for i in range(min(5, len(reader.pages))):
                    text = reader.pages[i].extract_text()
                    if text: pages_text.append(text)
                content = " ".join(pages_text)
        elif is_markdown:
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        else:
            # Untuk source code/json, kita tidak perlu baca content secara mendalam
            # untuk performa. Kecuali file kecil banget.
            if stat.st_size < 5000: # 5KB
                with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
    except Exception as e:
        try:
            print(f"[Notes] Error reading {filepath}: {e}")
        except UnicodeEncodeError:
            print(f"[Notes] Error reading {filepath.encode('ascii', 'replace').decode()}: {e}")
        return None

    note_id = compute_note_id(filepath)

    return {
        "id": note_id,
        "title": extract_title(content, filepath) if content else Path(filepath).stem,
        "path": os.path.normpath(filepath),
        "relative_path": get_relative_path(filepath),
        "root_folder": get_root_folder_name(filepath),
        "folder": str(Path(filepath).parent.name),
        "tags": extract_tags(content) if is_markdown or (not is_markdown and len(content) < 5000) else [],
        "wikilinks": extract_wikilinks(content) if is_markdown else [],
        "size_bytes": stat.st_size,
        "modified": stat.st_mtime,
        "modified_human": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "created": stat.st_ctime,
        "word_count": len(content.split()) if content else 0,
    }


# ============================================================
# NOTES INDEX — Scan & Cache
# ============================================================

class NotesIndex:
    """In-memory index dari semua notes di watched folders."""

    def __init__(self):
        self.notes: dict[str, dict] = {}  # id -> metadata
        self.path_to_id: dict[str, str] = {}  # normalized path -> id
        self.title_to_id: dict[str, str] = {}  # lowercase title -> id
        self._last_scan = 0

    def scan_all(self):
        """Full scan semua watched folders."""
        print("[Notes] Scanning all watched folders...")
        start = time.time()
        self.notes.clear()
        self.path_to_id.clear()
        self.title_to_id.clear()

        total = 0
        for folder in WATCHED_FOLDERS:
            if not os.path.isdir(folder):
                print(f"[Notes] Folder not found, skipping: {folder}")
                continue
            count = self._scan_folder(folder)
            total += count
            print(f"[Notes]   {folder} -> {count} notes")

        self._last_scan = time.time()
        elapsed = time.time() - start
        print(f"[Notes] Scan complete: {total} notes in {elapsed:.1f}s")

        # Build backlinks setelah semua note ter-index
        self._build_backlinks()
        
        # Save cache
        self._save_cache()

        return total

    def full_reindex(self):
        """Reload watched folders from config, then do a full scan."""
        global WATCHED_FOLDERS
        WATCHED_FOLDERS = _load_watched_folders()
        return self.scan_all()

    def _scan_folder(self, root: str) -> int:
        """Recursively scan satu folder."""
        count = 0
        for dirpath, dirnames, filenames in os.walk(root):
            # Skip unwanted folders
            dirnames[:] = [d for d in dirnames if d not in SKIP_FOLDERS]

            for filename in filenames:
                # Skip unwanted files
                if filename in SKIP_FILES:
                    continue
                    
                ext = Path(filename).suffix.lower()
                if ext not in SUPPORTED_EXTENSIONS:
                    continue

                filepath = os.path.join(dirpath, filename)
                meta = build_note_metadata(filepath)
                if meta:
                    self.notes[meta["id"]] = meta
                    self.path_to_id[os.path.normpath(filepath).lower()] = meta["id"]
                    self.title_to_id[meta["title"].lower()] = meta["id"]
                    count += 1

        return count

    def _build_backlinks(self):
        """Hitung backlinks: note mana saja yang link ke note tertentu."""
        # Reset backlinks
        for note in self.notes.values():
            note["backlinks"] = []

        for note_id, note in self.notes.items():
            for link_text in note.get("wikilinks", []):
                # Cari target note berdasarkan title
                target_id = self.title_to_id.get(link_text.lower())
                if target_id and target_id != note_id:
                    target = self.notes.get(target_id)
                    if target and note_id not in target.get("backlinks", []):
                        target.setdefault("backlinks", []).append(note_id)

    def _save_cache(self):
        """Save index ke disk untuk faster startup."""
        os.makedirs(os.path.dirname(INDEX_CACHE_PATH), exist_ok=True)
        try:
            cache = {
                "timestamp": time.time(),
                "count": len(self.notes),
                "notes": self.notes,
            }
            with open(INDEX_CACHE_PATH, 'w', encoding='utf-8') as f:
                json.dump(cache, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[Notes] Error saving cache: {e}")

    def load_cache(self) -> bool:
        """Load index dari cache jika ada."""
        if not os.path.exists(INDEX_CACHE_PATH):
            return False
        try:
            with open(INDEX_CACHE_PATH, 'r', encoding='utf-8') as f:
                cache = json.load(f)
            self.notes = cache.get("notes", {})
            # Rebuild lookup maps
            for nid, note in self.notes.items():
                path_key = os.path.normpath(note["path"]).lower()
                self.path_to_id[path_key] = nid
                self.title_to_id[note["title"].lower()] = nid
            self._last_scan = cache.get("timestamp", 0)
            print(f"[Notes] Loaded {len(self.notes)} notes from cache")
            return True
        except Exception as e:
            print(f"[Notes] Error loading cache: {e}")
            return False

    # ─── CRUD Operations ───

    def get_note(self, note_id: str) -> Optional[dict]:
        """Get note metadata + full content."""
        meta = self.notes.get(note_id)
        if not meta:
            return None
        try:
            ext = Path(meta["path"]).suffix.lower()
            if ext == '.pdf':
                with open(meta["path"], 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    content = " ".join([p.extract_text() for p in reader.pages if p.extract_text()])
            else:
                with open(meta["path"], 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
            return {**meta, "content": content}
        except Exception as e:
            print(f"[Notes] Error reading note {note_id}: {e}")
            return None

    def create_note(self, title: str, content: str = "", folder: str = None, tags: list = None) -> dict:
        """Buat note baru sebagai file .md."""
        if folder is None:
            folder = DEFAULT_NOTES_DIR

        # Sanitize title untuk filename
        safe_title = re.sub(r'[<>:"/\\|?*]', '', title).strip()
        if not safe_title:
            safe_title = f"Note_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        filepath = os.path.join(folder, f"{safe_title}.md")

        # Cek duplikat
        counter = 1
        while os.path.exists(filepath):
            filepath = os.path.join(folder, f"{safe_title}_{counter}.md")
            counter += 1

        # Tambah tags ke content jika ada
        if tags:
            tag_line = " ".join(f"#{t}" for t in tags)
            content = f"# {title}\n\n{tag_line}\n\n{content}"
        elif not content:
            content = f"# {title}\n\n"

        # Tulis file
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

        # Update index
        meta = build_note_metadata(filepath)
        if meta:
            self.notes[meta["id"]] = meta
            self.path_to_id[os.path.normpath(filepath).lower()] = meta["id"]
            self.title_to_id[meta["title"].lower()] = meta["id"]

        return meta

    def update_note(self, note_id: str, content: str) -> Optional[dict]:
        """Update content note yang sudah ada."""
        meta = self.notes.get(note_id)
        if not meta:
            return None

        try:
            with open(meta["path"], 'w', encoding='utf-8') as f:
                f.write(content)

            # Re-index
            new_meta = build_note_metadata(meta["path"])
            if new_meta:
                self.notes[note_id] = new_meta
                self.title_to_id[new_meta["title"].lower()] = note_id
                self._build_backlinks()
            return new_meta

        except Exception as e:
            print(f"[Notes] Error updating note {note_id}: {e}")
            return None

    def delete_note(self, note_id: str) -> bool:
        """Hapus note dari disk dan index."""
        meta = self.notes.get(note_id)
        if not meta:
            return False

        try:
            if os.path.exists(meta["path"]):
                os.remove(meta["path"])

            # Remove from index
            path_key = os.path.normpath(meta["path"]).lower()
            self.path_to_id.pop(path_key, None)
            self.title_to_id.pop(meta["title"].lower(), None)
            del self.notes[note_id]
            self._build_backlinks()

            return True
        except Exception as e:
            print(f"[Notes] Error deleting note {note_id}: {e}")
            return False

    # ─── Query Operations ───

    def list_notes(self, root_folder: str = None, tag: str = None) -> list[dict]:
        """List semua notes, optional filter by folder/tag."""
        result = []
        for note in self.notes.values():
            if root_folder and note["root_folder"] != root_folder:
                continue
            if tag and tag not in note.get("tags", []):
                continue
            # Return metadata saja (tanpa content)
            result.append({k: v for k, v in note.items() if k != "content"})
        
        result.sort(key=lambda n: n.get("modified", 0), reverse=True)
        return result

    def get_folder_tree(self) -> list[dict]:
        """Build folder tree dari semua watched folders."""
        tree = []
        for folder in WATCHED_FOLDERS:
            if not os.path.isdir(folder):
                continue
            node = self._build_tree_node(folder, is_root=True)
            tree.append(node)
        return tree

    def _build_tree_node(self, path: str, is_root: bool = False) -> dict:
        """Recursively build tree node."""
        name = Path(path).name
        node = {
            "name": name,
            "path": path,
            "type": "folder",
            "is_root": is_root,
            "children": [],
        }

        try:
            entries = sorted(os.listdir(path))
        except PermissionError:
            return node

        for entry in entries:
            full = os.path.join(path, entry)
            if os.path.isdir(full):
                if entry in SKIP_FOLDERS:
                    continue
                child = self._build_tree_node(full)
                # Hanya tambah folder yang ada isinya atau subfolder
                if child["children"]:
                    node["children"].append(child)
            else:
                ext = Path(entry).suffix.lower()
                if ext in SUPPORTED_EXTENSIONS:
                    note_id = compute_note_id(full)
                    note_meta = self.notes.get(note_id, {})
                    node["children"].append({
                        "name": entry,
                        "path": full,
                        "type": "file",
                        "id": note_id,
                        "title": note_meta.get("title", Path(entry).stem),
                    })

        return node

    def get_all_tags(self) -> dict[str, int]:
        """Get semua tags dan jumlah note per tag."""
        tag_counts = {}
        for note in self.notes.values():
            for tag in note.get("tags", []):
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        return dict(sorted(tag_counts.items(), key=lambda x: x[1], reverse=True))

    def get_backlinks(self, note_id: str) -> list[dict]:
        """Get semua note yang link ke note ini."""
        meta = self.notes.get(note_id)
        if not meta:
            return []
        
        backlink_ids = meta.get("backlinks", [])
        result = []
        for bid in backlink_ids:
            bl_note = self.notes.get(bid)
            if bl_note:
                result.append({
                    "id": bl_note["id"],
                    "title": bl_note["title"],
                    "root_folder": bl_note["root_folder"],
                    "relative_path": bl_note["relative_path"],
                })
        return result

    def get_outgoing_links(self, note_id: str) -> list[dict]:
        """Get semua note yang di-link dari note ini."""
        meta = self.notes.get(note_id)
        if not meta:
            return []

        result = []
        for link_text in meta.get("wikilinks", []):
            target_id = self.title_to_id.get(link_text.lower())
            if target_id:
                target = self.notes.get(target_id)
                if target:
                    result.append({
                        "id": target["id"],
                        "title": target["title"],
                        "root_folder": target["root_folder"],
                    })
        return result

    def get_graph_intelligence(self) -> dict:
        """Analyze graph structure and metadata for AI insights."""
        total_notes = len(self.notes)
        if total_notes == 0:
            return {"status": "empty", "message": "No notes indexed yet."}

        # 1. Tags Analysis
        tags_dist = self.get_all_tags()
        top_tags = list(tags_dist.items())[:10]

        # 2. Connections Analysis
        total_wikilinks = 0
        hubs = [] # Most outgoing
        authorities = [] # Most incoming (backlinks)
        orphans = [] # No links in or out

        for nid, meta in self.notes.items():
            outgoing = len(meta.get("wikilinks", []))
            incoming = len(meta.get("backlinks", []))
            total_wikilinks += outgoing
            
            if outgoing > 0:
                hubs.append({"title": meta["title"], "count": outgoing})
            if incoming > 0:
                authorities.append({"title": meta["title"], "count": incoming})
            if outgoing == 0 and incoming == 0:
                orphans.append(meta["title"])

        hubs.sort(key=lambda x: x["count"], reverse=True)
        authorities.sort(key=lambda x: x["count"], reverse=True)

        # 3. Content Metrics
        total_words = sum(n.get("word_count", 0) for n in self.notes.values())
        avg_words = total_words / total_notes
        
        # 4. Folder Distribution
        folder_dist = {}
        for n in self.notes.values():
            rf = n.get("root_folder", "unknown")
            folder_dist[rf] = folder_dist.get(rf, 0) + 1

        return {
            "summary": {
                "total_nodes": total_notes,
                "total_edges": total_wikilinks,
                "density": total_wikilinks / (total_notes * (total_notes - 1)) if total_notes > 1 else 0,
                "avg_words": round(avg_words, 1),
                "total_words": total_words,
            },
            "topology": {
                "top_hubs": hubs[:5],
                "top_authorities": authorities[:5],
                "orphan_count": len(orphans),
                "orphans_sample": orphans[:10]
            },
            "classification": {
                "top_tags": top_tags,
                "folder_distribution": folder_dist
            },
            "timestamp": datetime.now().isoformat()
        }

    def get_graph_data(self) -> dict:
        """Get data untuk 3D knowledge graph: nodes + edges."""
        nodes = []
        links = []
        edge_set = set()  # Avoid duplicate edges

        # 1. Inject Matahari (Sun) System Node first
        sun_id = "memori_bocchi.json"
        nodes.append({
            "id": sun_id,
            "title": "Matahari (Memori Bocchi)",
            "root_folder": "System",
            "folder": "Core",
            "tags": ["system", "core"],
            "link_count": 0, # Will be updated or used for sizing
            "word_count": 1000, # Large size for the sun
            "is_system": True
        })

        for note_id, note in self.notes.items():
            # Skip if it's somehow already there
            if note_id == sun_id:
                continue

            nodes.append({
                "id": note_id,
                "title": note["title"],
                "root_folder": note["root_folder"],
                "folder": note["folder"],
                "tags": note.get("tags", []),
                "link_count": len(note.get("wikilinks", [])) + len(note.get("backlinks", [])),
                "word_count": note.get("word_count", 0),
            })

            # Edges dari wikilinks
            for link_text in note.get("wikilinks", []):
                target_id = self.title_to_id.get(link_text.lower())
                if target_id and target_id != note_id:
                    edge_key = tuple(sorted([note_id, target_id]))
                    if edge_key not in edge_set:
                        edge_set.add(edge_key)
                        links.append({
                            "source": note_id,
                            "target": target_id,
                            "type": "wikilink",
                        })

        return {"nodes": nodes, "links": links}

    # ─── Daily Notes ───

    def get_daily_note(self, target_date: date = None) -> dict:
        """Get atau buat daily note untuk tanggal tertentu."""
        if target_date is None:
            target_date = date.today()

        filename = f"{target_date.isoformat()}.md"
        filepath = os.path.join(DAILY_NOTES_DIR, filename)

        # Cek apakah sudah ada
        note_id = compute_note_id(filepath)
        if note_id in self.notes:
            return self.get_note(note_id)

        # Cek file di disk tapi belum di-index
        if os.path.exists(filepath):
            meta = build_note_metadata(filepath)
            if meta:
                self.notes[meta["id"]] = meta
                return self.get_note(meta["id"])

        return None

    def create_daily_note(self, target_date: date = None) -> dict:
        """Buat daily note baru dengan template."""
        if target_date is None:
            target_date = date.today()

        os.makedirs(DAILY_NOTES_DIR, exist_ok=True)

        filename = f"{target_date.isoformat()}.md"
        filepath = os.path.join(DAILY_NOTES_DIR, filename)

        if os.path.exists(filepath):
            # Sudah ada, return yang existing
            return self.get_daily_note(target_date)

        # Template daily note
        day_name = target_date.strftime("%A")
        content = f"""# 📅 {target_date.isoformat()} ({day_name})

## 📝 Notes


## ✅ Tasks
- [ ] 

## 💡 Ideas


## 🔗 Links

"""
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

        # Index
        meta = build_note_metadata(filepath)
        if meta:
            self.notes[meta["id"]] = meta
            self.path_to_id[os.path.normpath(filepath).lower()] = meta["id"]
            self.title_to_id[meta["title"].lower()] = meta["id"]

        return self.get_note(meta["id"]) if meta else None

    def search_text(self, query: str, max_results: int = 20) -> list[dict]:
        """Simple text search di title dan content."""
        query_lower = query.lower()
        results = []

        for note_id, note in self.notes.items():
            score = 0
            # Title match
            if query_lower in note["title"].lower():
                score += 10

            # Tag match
            for tag in note.get("tags", []):
                if query_lower in tag.lower():
                    score += 5

            # Content match (perlu baca file)
            if score == 0:
                try:
                    with open(note["path"], 'r', encoding='utf-8', errors='replace') as f:
                        content = f.read().lower()
                    if query_lower in content:
                        score += 1
                except:
                    pass

            if score > 0:
                results.append({**note, "search_score": score})

        results.sort(key=lambda x: x["search_score"], reverse=True)
        return results[:max_results]

    def get_project_stats(self):
        """Menghitung statistik per folder utama (pesanan)."""
        stats = {}
        obsidian_dir = os.getenv("OBSIDIAN_DIR")
        if not obsidian_dir:
            return []

        for note_id, note in self.notes.items():
            try:
                # Tentukan project name dari folder pertama setelah OBSIDIAN_DIR
                rel_path = os.path.relpath(note["path"], obsidian_dir)
                parts = rel_path.split(os.sep)
                
                # Filter folder yang tidak relevan (misal hidden folders)
                if parts[0].startswith('.') or parts[0] == "templates":
                    continue
                    
                project_name = parts[0]
                
                if project_name not in stats:
                    stats[project_name] = {"notes_count": 0, "sentence_count": 0, "tokens": 0}
                
                stats[project_name]["notes_count"] += 1
                
                # Hitung kalimat
                with open(note["path"], 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
                    # Hitung kalimat (kasar: split by . ! ?)
                    sentences = len([s for s in re.split(r'[.!?]+', content) if s.strip()])
                    stats[project_name]["sentence_count"] += sentences
                    # Perhitungan token kustom: 1 kalimat = ~150 KP (Kessoku Points)
                    stats[project_name]["tokens"] += sentences * 150
            except Exception as e:
                print(f"Error calculating stats for {note.get('path')}: {e}")
                pass
        
        # Sort by tokens descending
        sorted_stats = sorted(stats.items(), key=lambda x: x[1]["tokens"], reverse=True)
        
        return [{"name": name, **data} for name, data in sorted_stats if data["notes_count"] > 0]


# ============================================================
# SINGLETON INSTANCE
# ============================================================

notes_index = NotesIndex()
