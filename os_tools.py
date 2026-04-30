import os
import subprocess
import datetime
import requests
import json
from ddgs import DDGS
from bs4 import BeautifulSoup
import webbrowser
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/calendar']

def get_calendar_service():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists('credentials.json'):
                return None
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    return build('calendar', 'v3', credentials=creds)

def baca_jadwal_google_calendar(params="") -> str:
    """Mengambil jadwal dari Google Calendar untuk hari ini."""
    try:
        service = get_calendar_service()
        if not service:
            return "Gagal mengakses kalender. Pastikan file credentials.json sudah ada di folder aplikasi."
        
        now = datetime.datetime.utcnow().isoformat() + 'Z'
        end_of_day = (datetime.datetime.utcnow().replace(hour=23, minute=59, second=59)).isoformat() + 'Z'
        
        events_result = service.events().list(calendarId='primary', timeMin=now, timeMax=end_of_day,
                                              maxResults=10, singleEvents=True,
                                              orderBy='startTime').execute()
        events = events_result.get('items', [])

        if not events:
            return "Tidak ada jadwal untuk hari ini."
        
        jadwal = []
        for event in events:
            start = event['start'].get('dateTime', event['start'].get('date'))
            jadwal.append(f"- {event['summary']} pada {start}")
        
        return "Jadwal hari ini:\n" + "\n".join(jadwal)
    except Exception as e:
        return f"Gagal membaca jadwal: {str(e)}"

def tambah_jadwal_google_calendar(params: str) -> str:
    """Menambahkan acara baru ke Google Calendar."""
    try:
        if "|||" not in params:
            return "Format salah. Gunakan: nama_acara|||YYYY-MM-DDTHH:MM:SS"
        
        parts = params.split("|||")
        nama_acara = parts[0].strip()
        waktu_mulai = parts[1].strip()
        durasi_menit = 60

        service = get_calendar_service()
        if not service:
            return "Gagal mengakses kalender. Pastikan file credentials.json sudah ada di folder aplikasi."
        
        start_time = datetime.datetime.fromisoformat(waktu_mulai)
        end_time = start_time + datetime.timedelta(minutes=durasi_menit)
        
        event = {
          'summary': nama_acara,
          'start': {
            'dateTime': start_time.isoformat() + '+07:00',
            'timeZone': 'Asia/Jakarta',
          },
          'end': {
            'dateTime': end_time.isoformat() + '+07:00',
            'timeZone': 'Asia/Jakarta',
          },
        }

        event_result = service.events().insert(calendarId='primary', body=event).execute()
        return f"Berhasil menambahkan acara: {event_result.get('summary')} (Link: {event_result.get('htmlLink')})"
    except Exception as e:
        return f"Gagal menambahkan acara: {str(e)}"

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_HEALTH_URL = "http://localhost:11434/api/tags"
MODEL_NAME = "qwen3.5:4b"

def ensure_ollama_running():
    """Cek apakah Ollama aktif, jika tidak — coba hidupkan otomatis."""
    import time
    try:
        requests.get(OLLAMA_HEALTH_URL, timeout=3)
        return True  # Ollama sudah jalan
    except requests.exceptions.ConnectionError:
        print("[OS TOOLS] Ollama tidak aktif. Mencoba menghidupkan otomatis...")
        try:
            subprocess.Popen(
                ["ollama", "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
            )
            # Tunggu Ollama siap (maks 15 detik)
            for _ in range(15):
                time.sleep(1)
                try:
                    requests.get(OLLAMA_HEALTH_URL, timeout=2)
                    print("[OS TOOLS] Ollama berhasil dihidupkan!")
                    return True
                except:
                    continue
            print("[OS TOOLS] Ollama timeout saat startup.")
            return False
        except Exception as e:
            print(f"[OS TOOLS] Gagal menghidupkan Ollama: {e}")
            return False
    except Exception:
        return False  # Error lain, biarkan request utama handle

def is_safe_path(target_path: str):
    """
    Mengecek apakah path berisiko (area OS Windows).
    Return: (is_safe, pesan_peringatan)
    """
    if not target_path:
        return True, ""
    
    abs_path = os.path.abspath(target_path).lower()
    
    # Daftar path krusial OS
    os_folders = ['c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'c:\\programdata']
    
    # Jika path menunjuk ke root C:\ secara langsung, itu juga sensitif
    if abs_path == 'c:\\':
        return False, "AI mencoba mengakses Root Disk C:\\. Izinkan?"

    for folder in os_folders:
        if abs_path.startswith(folder):
            return False, f"AI mencoba mengakses file sistem OS di: {abs_path}. Izinkan?"
            
    return True, ""

def buat_folder(nama_folder: str) -> str:
    try:
        os.makedirs(nama_folder, exist_ok=True)
        return f"Folder '{nama_folder}' berhasil dibuat atau sudah ada."
    except Exception as e:
        return f"Gagal membuat folder: {str(e)}"

def cek_waktu(params="") -> str:
    now = datetime.datetime.now()
    return f"Waktu sistem saat ini: {now.strftime('%Y-%m-%d %H:%M:%S')}"

def baca_sistem_info(params="") -> str:
    try:
        result = subprocess.run('systeminfo | findstr /C:"OS Name" /C:"Total Physical Memory"', shell=True, capture_output=True, text=True)
        return f"Info Sistem:\n{result.stdout.strip()}"
    except Exception as e:
        return f"Gagal membaca info sistem: {str(e)}"

def baca_file(target_path: str) -> str:
    if not target_path:
        return "Parameter path diperlukan."
    try:
        with open(target_path, 'r', encoding='utf-8') as f:
            isi = f.read()
        return f"Isi file {target_path}:\n{isi}"
    except Exception as e:
        return f"Gagal membaca file: {str(e)}"

def tulis_file(params: str) -> str:
    if not params:
        return "Parameter diperlukan."
    
    parts = params.split('|||')
    if len(parts) < 2:
        return "Format parameter salah. Gunakan 'path|||konten'"
    
    target_path = parts[0].strip()
    konten = "|||".join(parts[1:])
    
    try:
        os.makedirs(os.path.dirname(os.path.abspath(target_path)), exist_ok=True)
        with open(target_path, 'w', encoding='utf-8') as f:
            f.write(konten)
        return f"File berhasil ditulis di {target_path}"
    except Exception as e:
        return f"Gagal menulis file: {str(e)}"

def lihat_isi_folder(target_path: str) -> str:
    target = target_path if target_path else '.'
    try:
        files = os.listdir(target)
        return f"Isi folder {target}:\n" + "\n".join(files)
    except Exception as e:
        return f"Gagal membaca folder: {str(e)}"

def buka_aplikasi(nama_app: str) -> str:
    if not nama_app:
        return "Nama aplikasi tidak diberikan."
    
    whitelist = {
        'chrome': 'start chrome',
        'edge': 'start msedge',
        'vscode': 'code',
        'word': 'start winword',
        'excel': 'start excel',
        'powerpoint': 'start powerpnt',
        'notepad': 'notepad',
        'cmd': 'start cmd',
        'command prompt': 'start cmd'
    }
    
    app_cmd = whitelist.get(nama_app.lower().strip())
    if not app_cmd:
        return f"Aplikasi '{nama_app}' tidak diizinkan. Whitelist: chrome, edge, vscode, word, excel, powerpoint, notepad, cmd."
        
    try:
        subprocess.Popen(app_cmd, shell=True)
        return f"Aplikasi '{nama_app}' berhasil dibuka."
    except Exception as e:
        return f"Gagal membuka aplikasi: {str(e)}"

def cari_di_internet(query: str) -> str:
    """Mencari informasi di internet menggunakan DuckDuckGo."""
    try:
        results = DDGS().text(query, max_results=5)
        if not results:
            return "Tidak ada hasil ditemukan."
        
        output = "Hasil Pencarian Internet:\n\n"
        for i, res in enumerate(results):
            output += f"{i+1}. Judul: {res.get('title', '')}\n"
            output += f"   URL: {res.get('href', '')}\n"
            output += f"   Cuplikan: {res.get('body', '')}\n\n"
        return output
    except Exception as e:
        return f"Gagal mencari di internet: {str(e)}"

import io
import PyPDF2

def baca_halaman_web(url: str) -> str:
    """Membaca teks dari sebuah URL web atau file PDF online."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        # Cek apakah konten berupa PDF
        content_type = response.headers.get('Content-Type', '').lower()
        if 'application/pdf' in content_type or url.lower().split('?')[0].endswith('.pdf'):
            try:
                reader = PyPDF2.PdfReader(io.BytesIO(response.content))
                teks = ""
                for halaman in reader.pages:
                    teks += halaman.extract_text() or ""
                return f"Isi dokumen PDF dari {url}:\n\n{teks}"
            except Exception as pdf_err:
                return f"Berhasil mengunduh PDF, tapi gagal membaca teksnya: {pdf_err}"
        
        # Jika bukan PDF, baca sebagai HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Hapus script dan style
        for script in soup(["script", "style", "nav", "footer", "header", "aside"]):
            script.extract()
            
        teks = soup.get_text(separator='\n')
        lines = (line.strip() for line in teks.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        teks_bersih = '\n'.join(chunk for chunk in chunks if chunk)
        
        return f"Isi dari {url}:\n\n{teks_bersih}"
    except Exception as e:
        return f"Gagal membaca halaman web/PDF: {str(e)}"

def buka_web_di_browser(url: str) -> str:
    """Membuka url spesifik di browser default pengguna."""
    try:
        webbrowser.open(url)
        return f"Berhasil membuka {url} di browser."
    except Exception as e:
        return f"Gagal membuka browser: {str(e)}"

SAFE_TOOLS = {
    "buat_folder": buat_folder,
    "cek_waktu": cek_waktu,
    "baca_sistem_info": baca_sistem_info,
    "baca_file": baca_file,
    "tulis_file": tulis_file,
    "lihat_isi_folder": lihat_isi_folder,
    "buka_aplikasi": buka_aplikasi,
    "cari_di_internet": cari_di_internet,
    "baca_halaman_web": baca_halaman_web,
    "buka_web_di_browser": buka_web_di_browser,
    "baca_jadwal_google_calendar": baca_jadwal_google_calendar,
    "tambah_jadwal_google_calendar": tambah_jadwal_google_calendar
}

def get_tool_choice_from_ai(user_prompt: str) -> dict:
    # Inject tanggal real agar model tidak pakai tanggal asal
    today = datetime.datetime.now()
    tomorrow = today + datetime.timedelta(days=1)
    hari_ini_str = today.strftime('%Y-%m-%d')       # e.g. 2026-04-29
    besok_str    = tomorrow.strftime('%Y-%m-%d')    # e.g. 2026-04-30
    hari_ini_label = today.strftime('%A, %d %B %Y') # e.g. Tuesday, 29 April 2026

    deskripsi_alat = '''
    1. "buat_folder": Membuat direktori. Param: "nama_folder" (string).
    2. "baca_file": Membaca isi file teks di laptop. Param: "path_file" (string absolute/relative).
    3. "tulis_file": Membuat/mengubah file. Param: "path_file|||isi_konten_file". Wajib gunakan ||| sebagai pemisah antara path dan konten.
    4. "lihat_isi_folder": Melihat daftar file dalam folder. Param: "path_folder" (string).
    5. "buka_aplikasi": Membuka aplikasi GUI. Param: "chrome", "edge", "vscode", "word", "excel", "powerpoint", atau "notepad".
    6. "cek_waktu": Melihat jam dan tanggal laptop. Param: "".
    7. "baca_sistem_info": Melihat info OS dan RAM. Param: "".
    8. "cari_di_internet": Mencari info di internet (Google/DuckDuckGo) untuk AI baca. Param: "query_pencarian" (string).
    9. "baca_halaman_web": Membaca isi dari sebuah URL web (Scraping). Param: "url" (string, harus link http/https).
    10. "buka_web_di_browser": Membuka URL web agar bisa langsung dilihat oleh pengguna di layar (bukan untuk AI). Param: "url" (string, harus link http/https).
    11. "baca_jadwal_google_calendar": Mengambil jadwal hari ini dari Google Calendar. Param: "".
    12. "tambah_jadwal_google_calendar": Menambahkan acara ke Google Calendar. Param: "nama_acara|||YYYY-MM-DDTHH:MM:SS" (cth: "Meeting|||2023-10-25T14:30:00").
    13. "none": Jika tidak memerlukan tindakan komputer sama sekali (hanya ngobrol).
    '''
    
    system_prompt = f"""Anda adalah asisten pengontrol komputer yang cerdas. Tentukan apakah pesan pengguna memerlukan aksi pada komputer atau tidak.
INFORMASI WAKTU SAAT INI (WAJIB DIGUNAKAN): Hari ini adalah {hari_ini_label} ({hari_ini_str}). Besok adalah {besok_str}.
Jika butuh aksi komputer, pilih HANYA SATU dari daftar fungsi berikut:
{deskripsi_alat}

Jika pengguna hanya mengajak ngobrol, bertanya hal umum, atau tidak butuh aksi komputer, balas dengan tool 'none'.

PENTING: Balas HANYA dengan format JSON yang valid. Jangan tambahkan teks apa pun selain JSON.
PENTING: Untuk tanggal kalender, SELALU gunakan tahun {today.year} dan tanggal yang benar berdasarkan informasi waktu di atas.

Contoh 1:
Pesan: "tolong buka chrome dong"
Balasan: {{"tool": "buka_aplikasi", "parameter": "chrome"}}

Contoh 2:
Pesan: "halo bocchi, apa kabar?"
Balasan: {{"tool": "none", "parameter": ""}}

Contoh 3:
Pesan: "tolong buat folder project baru"
Balasan: {{"tool": "buat_folder", "parameter": "project baru"}}

Contoh 4:
Pesan: "coba cari berita ai terbaru di internet"
Balasan: {{"tool": "cari_di_internet", "parameter": "berita ai terbaru"}}

Contoh 5:
Pesan: "tolong bukain youtube dong di chrome"
Balasan: {{"tool": "buka_web_di_browser", "parameter": "https://youtube.com"}}

Contoh 6:
Pesan: "baca artikel di https://example.com/berita"
Balasan: {{"tool": "baca_halaman_web", "parameter": "https://example.com/berita"}}

Contoh 7:
Pesan: "apakah aku ada jadwal hari ini?"
Balasan: {{"tool": "baca_jadwal_google_calendar", "parameter": ""}}

Contoh 8:
Pesan: "tambah jadwal meeting jam 2 siang besok ya" (hari ini adalah {hari_ini_str}, besok adalah {besok_str})
Balasan: {{"tool": "tambah_jadwal_google_calendar", "parameter": "Meeting|||{besok_str}T14:00:00"}}
"""
    
    try:
        # Pastikan Ollama aktif sebelum request
        ensure_ollama_running()

        # Retry hingga 2x jika Ollama return 500 (biasanya karena VRAM penuh sesaat)
        import time
        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                response = requests.post(
                    OLLAMA_URL,
                    json={
                        "model": MODEL_NAME,
                        "prompt": user_prompt,
                        "system": system_prompt,
                        "format": "json",
                        "stream": False,
                        "options": {
                            "temperature": 0.1,
                            "num_predict": 100,
                        }
                    },
                    timeout=45
                )
                response.raise_for_status()
                break  # sukses, keluar dari retry loop
            except requests.exceptions.HTTPError as http_err:
                if response.status_code == 500 and attempt < max_retries:
                    print(f"[OS TOOLS] Ollama 500 error, retry {attempt+1}/{max_retries}...")
                    time.sleep(2)
                    continue
                raise http_err

        data = response.json()

        # qwen3.5:4b adalah thinking model — JSON output ada di field 'thinking', bukan 'response'
        # Cek 'thinking' dulu, baru fallback ke 'response'
        resp_text = data.get("thinking", "").strip()
        if not resp_text:
            resp_text = data.get("response", "").strip()

        if not resp_text:
            print(f"[OS TOOLS] Warning: Respons dari Ollama kosong. Raw: {json.dumps(data)[:300]}")
            return {"tool": "none"}

        # Bersihkan blok markdown jika ada
        if resp_text.startswith("```json"):
            resp_text = resp_text.replace("```json", "", 1)
        if resp_text.endswith("```"):
            resp_text = resp_text[:-3]
        resp_text = resp_text.strip()

        if not resp_text:
            print("[OS TOOLS] Warning: Respons kosong setelah strip markdown.")
            return {"tool": "none"}

        parsed = json.loads(resp_text)
        print(f"[OS TOOLS] Tool dipilih: {parsed.get('tool')} | Param: {parsed.get('parameter', '')[:50]}")
        return parsed
    except Exception as e:
        raw = data.get("thinking") or data.get("response", "N/A") if 'data' in locals() else "N/A"
        print(f"[OS TOOLS] Gagal memproses JSON dari AI lokal: {e}\n[RAW RESP] {str(raw)[:200]}")
        return {"tool": "none"}
