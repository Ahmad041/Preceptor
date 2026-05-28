# Migrasi Animasi Unity + Electron Desktop

## Goal
Mengekstrak kurva animasi dari file Unity `.anim` ke dalam `BocchiAvatar.jsx`, lalu membungkus seluruh aplikasi dengan Electron agar bisa jalan sebagai desktop app — tanpa mengubah backend Python atau arsitektur frontend yang sudah ada.

## Tasks

- [ ] **1. Buat script parser Unity `.anim` → JSON** → Buat `scripts/parse_unity_anim.py` yang membaca semua file `.anim` di `frontend/public/animations/FACE_LAYER/` dan menghasilkan `frontend/src/data/animation_curves.json` berisi keyframe curves (`time`, `value`, `inSlope`, `outSlope`) per atribut (`Blink`, `Joy`, `Angry`, `A`, `E`, `Sorrow`, dll). → Verify: File JSON tercipta, bisa di-`console.log` di browser.

- [ ] **2. Buat fungsi keyframe curve sampler** → Tambah `frontend/src/utils/curveSampler.js` — fungsi `sampleCurve(keyframes, time)` yang interpolasi Hermite antar keyframe, persis seperti Unity `AnimationCurve.Evaluate()`. → Verify: `sampleCurve([{time:0,value:0},{time:0.5,value:1},{time:1,value:0}], 0.25)` menghasilkan ~0.5.

- [ ] **3. Upgrade `BocchiAvatar.jsx`** → Ganti blok `EMOTION_ANIMATIONS` (rumus `Math.sin`) dengan pembacaan kurva dari `animation_curves.json` menggunakan `sampleCurve()`. Pertahankan semua props (`audioBase64`, `audioUrl`, `emosi`, `onFinishedPlaying`) dan sistem lip-sync AudioContext. → Verify: `npm run dev`, avatar menampilkan animasi kedip dan ekspresi yang lebih halus dibanding sebelumnya.

- [ ] **4. Tambah mapping emosi → animasi Unity** → Buat pemetaan: `idle→FACE_IDLE_1`, `senang→PET_HAPPY`, `gugup→FACE_DRAG`, `takut→FACE_HAIR_STROKE`, `marah→FACE_INTIME`. State machine sederhana di dalam `useFrame` yang blend antar clip saat emosi berubah. → Verify: Ganti prop `emosi` dari `idle` ke `senang`, wajah avatar berubah halus.

- [ ] **5. Setup Electron wrapper** → Buat `frontend/electron/main.js` (main process: buat `BrowserWindow`, load `http://localhost:5173` saat dev atau `dist/index.html` saat production). Buat `frontend/electron/preload.js` (expose `ipcRenderer` untuk nanti). Tambah script `"electron:dev"` dan `"electron:build"` ke `frontend/package.json`. Install `electron` dan `electron-builder` sebagai devDependencies. → Verify: `npm run electron:dev` membuka jendela desktop yang menampilkan UI yang sama persis dengan browser.

- [ ] **6. Konfigurasi auto-launch backend Python** → Di `electron/main.js`, tambah `child_process.spawn('python', ['../../main.py'])` yang otomatis menjalankan FastAPI backend saat Electron dibuka, dan `kill` prosesnya saat Electron ditutup. → Verify: Buka Electron → backend otomatis jalan → chat berfungsi → tutup Electron → proses Python ikut mati.

- [ ] **7. Buat `start_desktop.bat`** → Script 1-klik: aktifkan venv, jalankan `npm run electron:dev` dari folder frontend. → Verify: Double-click `start_desktop.bat` → aplikasi desktop terbuka lengkap.

## Done When
- [ ] Avatar menampilkan animasi wajah dari data Unity (bukan `Math.sin` manual)
- [ ] Aplikasi bisa dibuka sebagai jendela desktop via Electron
- [ ] Backend Python auto-start saat Electron dibuka
- [ ] Semua fitur yang ada (chat, Company Mode, lip-sync) tetap berfungsi normal

## Notes
- Backend Python (`main.py` + FastAPI) **tidak berubah sama sekali** — Electron cuma membungkus frontend
- File `BocchiAvatar.jsx` lama akan di-backup sebagai `BocchiAvatar_Backup.jsx`
- File Unity `.anim` dan `.controller` asli tetap utuh di `frontend/public/animations/`
- Electron hanya digunakan sebagai wrapper, bukan pengganti Vite — saat development Anda masih bisa pakai browser biasa
