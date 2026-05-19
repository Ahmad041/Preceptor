# Preceptor (Bocchi AI Desktop Assistant) 🎸

> **Asisten Desktop AI Bertema Bocchi the Rock yang Interaktif & Mandiri.** Menghadirkan simulasi spasial multi-agent 2D/3D, integrasi kontrol desktop fisik yang aman (*Override Mode*), pemahaman konteks layar waktu nyata (*Vision Loop*), serta kemampuan optimasi mandiri agen (*AlphaEvolve*). Menggabungkan pengalaman roleplay imersif dengan asisten produktivitas tangguh langsung di desktop kamu.

---

## 🗺️ Gambaran Sistem (System Architecture)

Preceptor dirancang menggunakan sistem multi-agen cerdas (*PentAGI-style*) di mana tugas-tugas dibagi secara dinamis ke berbagai spesialisasi agen yang terinspirasi oleh karakter **Kessoku Band** dan anime **Bocchi the Rock**:

```mermaid
graph TD
    User([Permintaan Pengguna]) --> Planner[Orchestrator PentAGI Planner]
    
    subgraph Kessoku Band Agents
        Planner --> Scout[Kikuri Hiroi <br/>🔍 Scout Agent: Web Research & Tools]
        Planner --> Evolve[Hitori 'Alpha' Gotoh <br/>🧬 Evolve Agent: Self-Evolution & Code Optimization]
        Planner --> Docs[Ryo Yamada <br/>📄 Docs Agent: Styled Document Builder]
        Planner --> Soft[Hitori Gotoh <br/>💬 Soft Agent: Interaction & Persona]
        Planner --> Analyst[Nijika Ichiji <br/>📊 Analyst Agent: Finance & Strategy]
    end
    
    Scout --> OS[OS Tools & Web Search]
    Evolve --> Executor[Python Sandbox & Hot-Reload Module]
    Docs --> DocBuilder[docx_tools & output_docs]
```

---

## ✨ Fitur Utama

### 🏢 1. Agent Office (Simulasi Spasial 2D Cozy House & 3D Interactive Room)
*   **WASD Map Grid Navigation (2D)**: Berjalanlah di sekitar kantor band menggunakan keyboard `W`, `A`, `S`, `D` pada rendering map 2D grid RPG yang responsif dengan dialog proximity visual novel.
*   **Interactive 3D Space (React Three Fiber)**: Pengalaman visual 3D menggunakan Three.js dan React Three Fiber (R3F) lengkap dengan pathfinding otonom (`three-pathfinding`) bagi para agen untuk berpatroli, bersantai, dan berinteraksi secara spasial.
*   **Dynamic Dialogues & VRM Support**: Dilengkapi dengan balon percakapan di atas kepala karakter, avatar 3D interaktif (`@pixiv/three-vrm`), serta terminal konsol khusus yang dapat dibuka langsung dengan mengeklik NPC agen.

### 🛡️ 2. Desktop Pilot & Override Mode (Safety-Gated Physical Control)
*   **Tangan Fisik AI (PyAutoGUI)**: Agen dapat mengetik, mengeklik koordinat, mengirim hotkey global (seperti pintasan keyboard), melakukan *scroll*, dan menangkap cuplikan gambar layar di desktop nyata.
*   **Override Mode (Gerbang Keamanan Utama)**: Untuk mencegah tindakan tidak diinginkan, setiap instruksi kontrol desktop dari agen akan masuk ke antrean pending (`_pending_actions`) di frontend. Tindakan **HANYA** akan dieksekusi setelah mendapatkan persetujuan manual (Approve) dari Anda.

### 👁️ 3. Vision Loop (Real-Time Cognitive Eyes)
*   **Mata Pintar AI**: Thread latar belakang berjalan (`vision_loop.py`) secara berkala mengambil tangkapan layar desktop untuk melacak aktivitas aktif dan menganalisis layout UI aplikasi yang sedang Anda buka.
*   **Smart Provider Rotation & Cooldown**: Menghindari batas limit API (429) dengan rotasi otomatis antara direktori API resmi Gemini dan API fallback gratis OpenRouter, dilengkapi dengan deteksi cooldown waktu nyata.

### 🧬 4. AlphaEvolve System (Self-Evolution Loop)
*   **Autonomous Algorithm Optimization**: Karakter *Hitori "Alpha" Gotoh* beroperasi sebagai agen riset mandiri yang dapat menganalisis kelemahan sistem, menulis modifikasi kode, mengeksekusi pengujian di sandbox, membandingkan performa benchmark, dan menerapkan evolusi secara mandiri.
*   **Hot-Reload Modul**: Setelah kode diperbaiki, modul akan disegarkan seketika di memori menggunakan tool `reload_module` tanpa memerlukan proses restart server backend secara keseluruhan.

```mermaid
graph LR
    Hypothesize[1. HYPOTHESIZE<br/>Analisis bottleneck/kode] --> Generate[2. GENERATE<br/>Tulis alternatif optimasi]
    Generate --> Execute[3. EXECUTE<br/>Jalankan benchmark di sandbox]
    Execute --> Evaluate[4. EVALUATE<br/>Bandingkan performa waktu nyata]
    Evaluate --> Evolve[5. EVOLVE<br/>Ganti kode & panggil reload_module]
    Evolve -->|Gagal / Refine| Hypothesize
```

### 💼 5. Advanced Corporate Tools & Automation
*   **Timeline Google Calendar Sync**: Tab `Jadwal` di UI terintegrasi dengan Google Calendar menggunakan alur OAuth penuh (`token.json`), menyajikan timeline agenda yang dikemas dengan desain cyberpunk gelap yang sangat premium.
*   **Advanced Doc Automation**: Membuat draf berkas `.docx` (Laporan, Proposal, Skripsi, Surat resmi) dengan tata letak profesional siap cetak langsung dari hasil percakapan dengan agen spesialis.
*   **Stock Strategy & Finance Monitor**: Pantau pengeluaran anggaran proyek Kessoku Band dan analisis portofolio saham secara langsung menggunakan integrasi `yfinance` dan evaluasi portofolio otomatis.

---

## 🛠️ Teknologi yang Digunakan

### 🖥️ Backend (Python Stack)
*   **Core**: Python 3.10+, FastAPI (Asynchronous API endpoints)
*   **Automation & Desktop**: `pyautogui`, `pillow` (PIL) untuk menangkap dan memproses gambar layar.
*   **Document Generation**: `python-docx` untuk templat dokumen profesional otomatis.
*   **Finance Integration**: `yfinance` untuk penarikan data bursa efek real-time.
*   **AI Engines**: Google GenAI SDK, OpenRouter Integration, Ollama (Local AI support)

### 🎨 Frontend (React & 3D Interactive Stack)
*   **Framework**: React 18+, Vite
*   **3D Spatial Engine**: Three.js, `@react-three/fiber` (R3F), `@react-three/drei` (helpers & visual controls)
*   **Character Rendering**: `@pixiv/three-vrm` untuk memuat dan menganimasikan avatar virtual model VRM.
*   **Pathfinding**: `three-pathfinding` untuk navigasi AI di map 3D.
*   **Knowledge Representation**: `react-force-graph-3d` & `d3-force-3d` untuk pemetaan Neural Graph.
*   **Styling & FX**: Tailwind CSS, Framer Motion (micro-animations), custom glassmorphism, dan efek CRT retro cyberpunk.

---

## 🚀 Cara Menjalankan

### Prasyarat
- Python 3.10+
- Node.js (v18 ke atas) & npm
- [Ollama](https://ollama.com/) sudah terinstal dan berjalan di latar belakang (untuk model lokal).
- GPU NVIDIA (sangat direkomendasikan untuk akselerasi kloning suara TTS & RVC lokal).

### Instalasi Langkah Demi Langkah

1.  **Clone Repository:**
    ```bash
    git clone https://github.com/Ahmad041/Preceptor.git
    cd Preceptor
    ```

2.  **Konfigurasi Backend:**
    ```bash
    # Buat virtual environment
    python -m venv venv
    venv\Scripts\activate  # Windows
    
    # Instal paket utama
    pip install -r requirements.txt
    
    # Tambahan paket sistem neural, dokumen, & finansial
    pip install sentence-transformers numpy scikit-learn python-docx yfinance pyautogui pillow
    ```

3.  **Konfigurasi Frontend:**
    ```bash
    cd frontend
    npm install
    ```

4.  **Konfigurasi Kunci API (.env):**
    Buat file `.env` di root folder proyek:
    ```env
    OPENROUTER_API_KEY=your_key_here
    GEMINI_API_KEY=your_key_here
    ```

### Menjalankan Sistem

1.  **Mulai Server Backend (Uvicorn):**
    ```bash
    # Dari direktori root proyek
    uvicorn main:app --reload --port 8000
    ```

2.  **Mulai Aplikasi Frontend (Vite):**
    ```bash
    # Dari direktori /frontend
    npm run dev
    ```

Akses aplikasi langsung dari browser di alamat `http://localhost:5173`.

---

## 📝 Catatan Tambahan Terkait Aset
- **File Model RVC & Embedding**: Karena ukuran yang sangat besar, file bobot model TTS/RVC (`.pth`, `.index`) tidak dibungkus dalam repositori. File akan diunduh secara cerdas (*lazy download*) ketika aplikasi pertama kali membutuhkan konversi suara.
- **Fail-Safe Desktop Pilot**: Jika gerakan mouse mendadak bermasalah, gerakkan kursor mouse ke pojok kiri atas monitor Anda secara cepat untuk memicu fitur fail-safe bawaan PyAutoGUI guna membatalkan kontrol secara paksa.

---

## 🗺️ Roadmap & Rencana Pengembangan Masa Depan

- [x] **Neural 3D Knowledge Graph** dengan pencarian semantik cerdas.
- [x] **Multi-Agent Spatial Grid Office (2D RPG / 3D Three.js)** dengan roam & interaksi proximity.
- [x] **Desktop Pilot & Override Mode Panel** kontrol desktop aman dengan gerbang konfirmasi user.
- [x] **Background Vision Loop** pemahaman konteks layar waktu nyata menggunakan Gemini & OpenRouter.
- [x] **AlphaEvolve System** siklus optimasi mandiri kode Python secara otonom dengan fitur *hot-module reload*.
- [ ] **Migrasi ke Aplikasi Desktop Native** penuh menggunakan pembungkus **Electron + PyInstaller** (Lihat [Rencana Implementasi Electron](file:///C:/Users/ahamd/.gemini/antigravity/brain/647951e5-8939-4a7c-987a-6933958a79f7/implementation_plan.md) untuk detailnya).
- [ ] **Unified Installer Ringan** yang dibekali manager unduhan model otomatis (*Lazy Download Model UI*).

---

## 🔗 Referensi & Inspirasi

Proyek ini dikembangkan dengan terinspirasi serta mengadopsi konsep dari berbagai proyek open-source luar biasa berikut:
- 🧬 [G0DM0D3](https://github.com/elder-plinius/G0DM0D3) - Acuan konsep asisten mandiri "God Mode" dengan tingkat optimasi mendalam.
- 🎙️ [Mark-XXXIX](https://github.com/FatihMakes/Mark-XXXIX) - Inspirasi sistem asisten desktop interaktif dengan transisi animasi yang halus dan responsif.
- 🏢 [the-delegation](https://github.com/arturitu/the-delegation) - Referensi utama arsitektur delegasi dinamis multi-agen dan simulasi visual visualisasi tugas.
- 🔍 [Perplexica (Fork)](https://github.com/adi-dhulipala/Perplexica-Fork) - Pondasi pengembangan mesin pencari semantik cerdas untuk agen pelacak informasi (*Scout Agent*).

---

## 📄 Lisensi
Proyek ini dibuat untuk tujuan edukasi, hobi, dan penggunaan personal. Lisensi karakter Bocchi the Rock sepenuhnya dipegang oleh pencipta asli dan studio produksi terkait.

🎸 *S-senpai... mari buat asisten desktop ini menjadi jauh lebih pintar bersama-sama!*
