# Preceptor (Bocchi AI Desktop Assistant) 🎸

> Asisten desktop AI bertema Bocchi the Rock yang interaktif. Menghadirkan komunikasi hidup dengan integrasi suara RVC, fitur Story Mode ala Visual Novel yang digerakkan oleh LLM lokal (Ollama), serta sistem Multi-Agent cerdas untuk produktivitas. Dirancang untuk pengalaman roleplay yang mendalam sekaligus asisten kerja yang powerful langsung dari desktop Windows kamu.

## ✨ Fitur Utama

- **🗣️ AI Karakter Interaktif**: Ngobrol dan bermain peran (roleplay) secara natural dengan asisten bertema Bocchi.
- **🎙️ Sintesis Suara (RVC & Qwen3-TTS)**: Respons suara yang terasa nyata menggunakan *Retrieval-based Voice Conversion* (RVC) dan integrasi terbaru Qwen3-TTS untuk kloning suara yang lebih presisi.
- **🏢 Agent Office (Multi-Agent System)**: Tim agen AI spesialis (Analyst, Content, Docs, Scout, dll) yang dilengkapi dengan "tangan" (Tools) untuk mencari web, membaca file, mengambil screenshot, dan mendelegasikan tugas.
- **🕸️ Neural Knowledge Graph**: Visualisasi 3D dari semua catatan dan pengetahuanmu menggunakan *semantic embedding* (multilingual-e5-small) untuk pencarian dan pemetaan ide yang cerdas.
- **💼 Company Mode**: Dashboard profesional terintegrasi dengan Google Calendar, monitoring anggaran, dan manajemen sumber daya riset.
- **📄 Advanced Doc Automation**: Pembuatan dokumen profesional (.docx & .pdf) secara otomatis dengan berbagai preset (Laporan, Skripsi, Surat) langsung dari percakapan dengan agen.
- **📖 Story Mode & Library**: Unggah dokumen, dan AI akan otomatis membuat cerita interaktif bergaya visual novel.
- **🎮 Loading Mini-Games**: Mainkan mini-game (seperti *Social Runner*) sambil menunggu proses AI selesai.

## 🛠️ Teknologi yang Digunakan

- **Backend**: Python 3.10+, FastAPI
- **Frontend**: React, Vite, Three.js (3D Graph), Tailwind CSS, Framer Motion
- **AI & ML**: 
  - **LLM**: Ollama (Qwen 2.5/3.5), OpenRouter (Gemini/Claude)
  - **Embedding**: `intfloat/multilingual-e5-small` (Neural Network)
  - **TTS**: Qwen3-TTS, RVC (Retrieval-based Voice Conversion)
- **Utilities**: `sentence-transformers`, `numpy`, `python-docx`, `requests`

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
   # Tambahan untuk fitur Neural:
   pip install sentence-transformers numpy scikit-learn
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

- **File Model**: Karena batasan ukuran GitHub, file model RVC (`.pth`, `.index`) dan model embedding harus disiapkan secara manual atau akan terunduh otomatis pada saat pertama kali dijalankan.
- **API Keys**: Gunakan file `.env` untuk menyimpan API Key (OpenRouter/Google Calendar). Jangan pernah membagikan file `.env` kamu.
- **Animasi**: File animasi disimpan di `frontend/public/animations/`.

## 🗺️ Roadmap / Rencana Mendatang
- [x] Implementasi 3D Knowledge Graph & Semantic Search.
- [x] Multi-Agent System dengan delegasi tugas.
- [x] Integrasi Google Calendar.
- [ ] Migrasi ke Aplikasi Desktop Native menggunakan **Electron**.
- [ ] Fitur *Lazy Download* untuk model AI agar installer tetap ringan.
- [ ] Fitur Screen Interaction (AI bisa melihat layar secara real-time).

## 📄 Lisensi
Proyek ini dibuat untuk tujuan edukasi, hobi, dan penggunaan pribadi.
