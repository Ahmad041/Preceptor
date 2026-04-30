# Preceptor (Bocchi AI Desktop Assistant) 🎸

> Asisten desktop AI bertema Bocchi the Rock yang interaktif. Menghadirkan komunikasi hidup dengan integrasi suara RVC, fitur Story Mode ala Visual Novel yang digerakkan oleh LLM lokal (Ollama), serta sistem Hybrid Q&A cerdas. Dirancang untuk pengalaman roleplay yang mendalam, responsif, dan personal langsung dari desktop Windows kamu.

## ✨ Fitur Utama

- **🗣️ AI Karakter Interaktif**: Ngobrol dan bermain peran (roleplay) secara natural dengan asisten bertema Bocchi.
- **🎙️ Sintesis Suara (RVC)**: Respons suara yang terasa nyata menggunakan *Retrieval-based Voice Conversion* (RVC) untuk pengalaman yang lebih hidup.
- **📖 Story Mode (Visual Novel)**: Unggah dokumen apa saja, dan AI akan otomatis membuat cerita interaktif bergaya visual novel berdasarkan konten dokumen tersebut.
- **🧠 Digerakkan oleh LLM Lokal**: Berjalan sepenuhnya secara lokal menggunakan **Ollama (Qwen)** untuk pemrosesan AI yang cepat, privat, dan bisa digunakan tanpa internet (offline).
- **🔍 Logika Hybrid Q&A**: Logika kontekstual pintar untuk menjawab pertanyaan secara responsif dan efisien.

## 🛠️ Teknologi yang Digunakan

- **Backend**: Python, FastAPI
- **Frontend**: React, Vite, Tailwind CSS
- **AI & ML**: Ollama (Qwen 3.5), RVC (Retrieval-based Voice Conversion)

## 🚀 Cara Menjalankan

### Prasyarat
- Python 3.10+
- Node.js & npm
- [Ollama](https://ollama.com/) sudah terinstal dan berjalan secara lokal.

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
   venv\Scripts\activate  # Untuk pengguna Windows

   # Instal dependensi (pastikan menginstal library yang dibutuhkan seperti FastAPI, Uvicorn, dll)
   pip install fastapi uvicorn python-multipart
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

## 📝 Catatan Tentang File Berukuran Besar
Karena batasan ukuran file di GitHub, file model AI yang besar (`.pth`, `.index` untuk RVC) dan file audio tidak disertakan dalam repository ini. Kamu perlu menyiapkan model RVC kamu sendiri dan menempatkannya di direktori yang sesuai agar fitur suara dapat berfungsi.

## 📄 Lisensi
Proyek ini dibuat untuk tujuan edukasi dan penggunaan pribadi.
