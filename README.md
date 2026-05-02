# Preceptor (Bocchi AI Desktop Assistant) 🎸

> Asisten desktop AI bertema Bocchi the Rock yang interaktif. Menghadirkan komunikasi hidup dengan integrasi suara RVC, fitur Story Mode ala Visual Novel yang digerakkan oleh LLM lokal (Ollama), serta sistem Hybrid Q&A cerdas. Dirancang untuk pengalaman roleplay yang mendalam, responsif, dan personal langsung dari desktop Windows kamu.

## ✨ Fitur Utama

- **🗣️ AI Karakter Interaktif**: Ngobrol dan bermain peran (roleplay) secara natural dengan asisten bertema Bocchi.
- **🎙️ Sintesis Suara (RVC & Qwen3-TTS)**: Respons suara yang terasa nyata menggunakan *Retrieval-based Voice Conversion* (RVC) dan integrasi terbaru Qwen3-TTS untuk kloning suara yang lebih presisi.
- **📖 Story Mode & Library**: Unggah dokumen, dan AI akan otomatis membuat cerita interaktif bergaya visual novel. Kelola semua ceritamu di dalam **Story Library**.
- **🧠 Quiz Mode**: Tantang dirimu dengan kuis interaktif yang dihasilkan secara otomatis dari cerita yang kamu buat.
- **🎮 Loading Mini-Games**: Bosan menunggu AI berpikir? Mainkan mini-game (seperti *Social Runner*) sambil menunggu proses generasi teks atau suara selesai.
- **🎬 Animasi Smooth**: Integrasi animasi berkualitas tinggi (berbasis Mate-Engine) untuk ekspresi Bocchi yang lebih dinamis.
- **🎵 Background Music**: Dukungan musik latar untuk membangun suasana saat berinteraksi atau bermain game.
- **💻 Local First**: Berjalan sepenuhnya secara lokal menggunakan **Ollama (Qwen)** untuk pemrosesan AI yang cepat, privat, dan offline-friendly.

## 🛠️ Teknologi yang Digunakan

- **Backend**: Python 3.10+, FastAPI
- **Frontend**: React, Vite, Tailwind CSS, Framer Motion
- **AI & ML**: 
  - **LLM**: Ollama (Qwen 2.5/3.5)
  - **TTS**: Qwen3-TTS, RVC (Retrieval-based Voice Conversion)
- **Utilities**: PyPDF2, python-docx (untuk pemrosesan dokumen)

## 🚀 Cara Menjalankan

### Prasyarat
- Python 3.10+
- Node.js & npm
- [Ollama](https://ollama.com/) sudah terinstal dan berjalan secara lokal.
- GPU NVIDIA (Direkomendasikan untuk performa AI optimal).

### Instalasi

1. **Clone repository ini:**
   ```bash
   git clone https://github.com/Ahmad041/Preceptor.git
   cd Preceptor
   ```

2. **Setup Backend:**
   ```bash
   # Buat dan aktifkan virtual environment
   python -m venv venv
   venv\Scripts\activate  # Untuk Windows

   # Instal dependensi utama
   pip install -r requirements.txt 
   # Catatan: Jika requirements.txt belum ada, instal manual:
   # pip install fastapi uvicorn python-multipart torch numpy soundfile requests python-dotenv PyPDF2 python-docx
   ```

3. **Setup Frontend:**
   ```bash
   cd frontend
   npm install
   ```

### Menjalankan Aplikasi

1. **Jalankan Server Backend:**
   ```bash
   # Dari direktori utama (root)
   uvicorn main:app --reload
   ```

2. **Jalankan Server Frontend:**
   ```bash
   # Dari direktori frontend
   npm run dev
   ```

## 📝 Catatan Penting

- **File Model**: Karena batasan ukuran GitHub, file model RVC (`.pth`, `.index`) dan model Qwen3-TTS harus disiapkan secara manual di folder root atau folder model yang ditentukan.
- **API Keys**: Gunakan file `.env` untuk menyimpan API Key (seperti Gemini atau OpenRouter jika ingin menggunakan mode cloud). Jangan pernah membagikan file `.env` kamu.
- **Animasi**: File animasi disimpan di `frontend/public/animations/`.

## 🗺️ Roadmap / Rencana Mendatang
- [ ] Migrasi ke Aplikasi Desktop Native menggunakan **Electron**.
- [ ] Fitur *Lazy Download* untuk model AI agar installer tetap ringan.
- [ ] Penambahan lebih banyak mini-game saat loading.

## 📄 Lisensi
Proyek ini dibuat untuk tujuan edukasi, hobi, dan penggunaan pribadi.
