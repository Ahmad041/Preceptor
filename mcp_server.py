import asyncio
from typing import Dict, Any, List

from mcp.server import Server
from mcp.server.sse import SseServerTransport
import mcp.types as types

# Kita buat instance server global
bocchi_mcp_server = Server("bocchi-jarvis")

@bocchi_mcp_server.list_tools()
async def list_tools() -> list[types.Tool]:
    """Expose tools BOCCHI ke AI eksternal."""
    return [
        types.Tool(
            name="generate_docx",
            description="Buat dokumen DOCX akademik/profesional berdasarkan sesi Q&A.",
            inputSchema={
                "type": "object",
                "properties": {
                    "session_id": {"type": "string", "description": "ID dari sesi Q&A DOCX"}
                },
                "required": ["session_id"]
            }
        ),
        types.Tool(
            name="search_memory",
            description="Cari informasi di memori jangka panjang BOCCHI (ChromaDB).",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Kata kunci pencarian memori"},
                    "n_results": {"type": "integer", "description": "Jumlah hasil (default 3)"}
                },
                "required": ["query"]
            }
        ),
        types.Tool(
            name="run_os_command",
            description="Jalankan perintah shell lokal di mesin pengguna.",
            inputSchema={
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Perintah shell/CMD/PowerShell"}
                },
                "required": ["command"]
            }
        ),
        types.Tool(
            name="generate_techdoc",
            description="Generate dokumen teknis (ERD, PDM, Probis, Flowchart, Use Case, Arsitektur) via Q&A project info.",
            inputSchema={
                "type": "object",
                "properties": {
                    "jenis": {"type": "string", "description": "semua, erd, pdm, probis, flowchart, use_case, arsitektur"},
                    "nama_proyek": {"type": "string", "description": "Nama proyek/aplikasi"},
                    "tujuan_proyek": {"type": "string", "description": "Deskripsi/tujuan proyek"},
                    "entitas": {"type": "string", "description": "Entitas utama (User, Transaksi, dll)"},
                    "aktor": {"type": "string", "description": "Aktor sistem"},
                    "proses_bisnis": {"type": "string", "description": "Alur proses bisnis utamanya"},
                    "tech_stack": {"type": "string", "description": "Tech stack yang dipakai"},
                    "existing_docs": {"type": "string", "description": "Dokumen apa saja yang sudah ada dan tidak perlu di-generate. Isi 'tidak' jika ingin semua dibuat."}
                },
                "required": ["jenis", "nama_proyek", "entitas", "aktor", "proses_bisnis"]
            }
        ),
        types.Tool(
            name="moodle_get_tasks",
            description="Login ke e-learning Moodle dan dapatkan daftar tugas.",
            inputSchema={
                "type": "object",
                "properties": {
                    "username": {"type": "string", "description": "NIM / Username Moodle"},
                    "password": {"type": "string", "description": "Password Moodle"}
                },
                "required": ["username", "password"]
            }
        ),
        types.Tool(
            name="moodle_download_task",
            description="Download lampiran dari halaman tugas Moodle.",
            inputSchema={
                "type": "object",
                "properties": {
                    "username": {"type": "string", "description": "NIM / Username Moodle"},
                    "password": {"type": "string", "description": "Password Moodle"},
                    "task_url": {"type": "string", "description": "URL halaman tugas atau URL file"},
                    "download_dir": {"type": "string", "description": "Folder untuk menyimpan file, default: downloads"}
                },
                "required": ["username", "password", "task_url"]
            }
        ),
        types.Tool(
            name="moodle_upload_draft",
            description="Upload file draft (docx/pdf) ke halaman submission tugas Moodle.",
            inputSchema={
                "type": "object",
                "properties": {
                    "username": {"type": "string", "description": "NIM / Username Moodle"},
                    "password": {"type": "string", "description": "Password Moodle"},
                    "task_url": {"type": "string", "description": "URL halaman tugas"},
                    "file_path": {"type": "string", "description": "Path absolut file draft yang akan diupload"}
                },
                "required": ["username", "password", "task_url", "file_path"]
            }
        )
    ]

@bocchi_mcp_server.call_tool()
async def call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
    if arguments is None:
        arguments = {}

    if name == "generate_docx":
        session_id = arguments.get("session_id")
        if not session_id:
            raise ValueError("session_id required")
            
        import docx_generator as docx_gen
        import uuid
        import threading
        
        sess = docx_gen.get_session(session_id)
        if not sess:
            return [types.TextContent(type="text", text=f"Error: Session {session_id} not found")]
            
        job_id = str(uuid.uuid4())
        
        # Fire and forget
        t = threading.Thread(target=docx_gen.assemble_docx, args=(session_id, job_id))
        t.start()
        
        return [types.TextContent(
            type="text", 
            text=f"Proses generate DOCX dimulai. Job ID: {job_id}. Gunakan API status untuk memantau."
        )]

    elif name == "generate_techdoc":
        import tech_doc_generator as tech_gen
        import uuid
        import threading
        
        jenis = arguments.get("jenis", "semua")
        data = {
            "nama_proyek": arguments.get("nama_proyek", ""),
            "tujuan_proyek": arguments.get("tujuan_proyek", ""),
            "entitas": arguments.get("entitas", ""),
            "aktor": arguments.get("aktor", ""),
            "proses_bisnis": arguments.get("proses_bisnis", ""),
            "tech_stack": arguments.get("tech_stack", ""),
            "existing_docs": arguments.get("existing_docs", "")
        }
        
        job_id = str(uuid.uuid4())
        
        t = threading.Thread(target=tech_gen.generate_techdoc_direct, args=(data, jenis, job_id))
        t.start()
        
        return [types.TextContent(
            type="text",
            text=f"Proses pembuatan dokumen teknis ({jenis}) sedang berjalan. Job ID: {job_id}."
        )]

    elif name == "search_memory":
        query = arguments.get("query", "")
        n_results = arguments.get("n_results", 3)
        import memory_system
        
        results = memory_system.search_memory(query, n_results=n_results)
        if not results:
            return [types.TextContent(type="text", text="Tidak ditemukan di memori.")]
            
        docs = results.get("documents", [[]])[0]
        return [types.TextContent(type="text", text="\n---\n".join(docs))]

    elif name == "run_os_command":
        command = arguments.get("command", "")
        import os_tools
        result = os_tools.execute_shell(command)
        return [types.TextContent(type="text", text=result)]

    elif name == "moodle_get_tasks":
        import moodle_automation as moodle
        username = arguments.get("username", "")
        password = arguments.get("password", "")
        try:
            tasks = await moodle.run_moodle_login_and_get_tasks(username, password)
            return [types.TextContent(type="text", text=f"Tasks found: {tasks}")]
        except Exception as e:
            return [types.TextContent(type="text", text=f"Error: {e}")]

    elif name == "moodle_download_task":
        import moodle_automation as moodle
        username = arguments.get("username", "")
        password = arguments.get("password", "")
        task_url = arguments.get("task_url", "")
        download_dir = arguments.get("download_dir", "downloads")
        try:
            path = await moodle.run_moodle_download_task(username, password, task_url, download_dir)
            if path:
                return [types.TextContent(type="text", text=f"File successfully downloaded to: {path}")]
            else:
                return [types.TextContent(type="text", text="No file downloaded.")]
        except Exception as e:
            return [types.TextContent(type="text", text=f"Error: {e}")]

    elif name == "moodle_upload_draft":
        import moodle_automation as moodle
        username = arguments.get("username", "")
        password = arguments.get("password", "")
        task_url = arguments.get("task_url", "")
        file_path = arguments.get("file_path", "")
        try:
            success = await moodle.run_moodle_upload_draft(username, password, task_url, file_path)
            return [types.TextContent(type="text", text=f"Upload success: {success}")]
        except Exception as e:
            return [types.TextContent(type="text", text=f"Error: {e}")]

    else:
        raise ValueError(f"Unknown tool: {name}")

# Sse transport global untuk di-bind ke FastAPI
# Tapi mcp server butuh 1 transport per connection.
# Di main.py kita akan handle request scope secara manual jika diperlukan.
