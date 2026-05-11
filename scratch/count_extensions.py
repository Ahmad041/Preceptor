import json
import os
from pathlib import Path

index_path = r"c:\Users\ahamd\OneDrive\Dokumen\Coding\Project\ai-desktop-app\data\notes_index.json"

if os.path.exists(index_path):
    with open(index_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    extensions = {}
    for note_id, note in data.get('notes', {}).items():
        ext = Path(note['path']).suffix.lower()
        if not ext:
            ext = "no extension"
        extensions[ext] = extensions.get(ext, 0) + 1
        
    print("File Extensions in Graph Nodes:")
    for ext, count in sorted(extensions.items(), key=lambda x: x[1], reverse=True):
        print(f"- {ext}: {count} files")
else:
    print(f"Index file not found at {index_path}")
