const { exec } = require('child_process');
const readline = require('readline');
const fs = require('fs/promises');
const path = require('path');
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL_NAME = 'qwen3.5:4b';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// ==========================================
// FUNGSI KEAMANAN & ENKAPSULASI (OS PROTECTOR)
// ==========================================
async function mintaIzin(pesan) {
    return new Promise((resolve) => {
        rl.question(`\n\x1b[33m[IZIN DIBUTUHKAN]\x1b[0m ${pesan} (y/n): `, (jawaban) => {
            resolve(jawaban.toLowerCase() === 'y');
        });
    });
}

async function isSafePath(targetPath) {
    if (!targetPath) return true;
    const absPath = path.resolve(targetPath).toLowerCase();
    
    // Daftar path krusial OS
    const osFolders = ['c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'c:\\programdata'];
    
    // Jika path menunjuk ke root C:\ secara langsung, itu juga sensitif
    if (absPath === 'c:\\') {
        return await mintaIzin(`AI mencoba mengakses Root Disk C:\\. Izinkan?`);
    }

    const isSystemPath = osFolders.some(folder => absPath.startsWith(folder));
    if (isSystemPath) {
        return await mintaIzin(`AI mencoba mengakses file sistem OS di: ${absPath}. Izinkan?`);
    }
    return true; // Path di luar OS folder dianggap aman
}

// ==========================================
// 1. DAFTAR WHITELIST (Fungsi yang Aman)
// ==========================================
const safeTools = {
    buat_folder: (namaFolder) => {
        return new Promise((resolve) => {
            // Kita yang mengontrol sintaks CMD-nya, bukan AI
            exec(`mkdir "${namaFolder}"`, (error) => {
                if (error) resolve(`Gagal membuat folder: ${error.message}`);
                else resolve(`Folder '${namaFolder}' berhasil dibuat.`);
            });
        });
    },

    cek_waktu: () => {
        return new Promise((resolve) => {
            exec('echo %date% %time%', (error, stdout) => {
                resolve(`Waktu sistem saat ini: ${stdout.trim()}`);
            });
        });
    },

    baca_sistem_info: () => {
        return new Promise((resolve) => {
            exec('systeminfo | findstr /C:"OS Name" /C:"Total Physical Memory"', (error, stdout) => {
                resolve(`Info Sistem:\n${stdout.trim()}`);
            });
        });
    },

    baca_file: async (targetPath) => {
        if (!targetPath) return "Parameter path diperlukan.";
        const aman = await isSafePath(targetPath);
        if (!aman) return "Akses ditolak oleh pengguna (Area Sistem Operasi).";
        try {
            const isi = await fs.readFile(targetPath, 'utf8');
            return `Isi file ${targetPath}:\n${isi}`;
        } catch (e) {
            return `Gagal membaca file: ${e.message}`;
        }
    },

    tulis_file: async (params) => {
        if (!params) return "Parameter diperlukan.";
        const parts = params.split('|||');
        if (parts.length < 2) return "Format parameter salah. Gunakan 'path|||konten'";
        const targetPath = parts[0].trim();
        const konten = parts.slice(1).join('|||');
        
        const aman = await isSafePath(targetPath);
        if (!aman) return "Akses ditolak oleh pengguna (Area Sistem Operasi).";
        try {
            // Pastikan folder parentnya ada
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, konten, 'utf8');
            return `File berhasil ditulis di ${targetPath}`;
        } catch (e) {
            return `Gagal menulis file: ${e.message}`;
        }
    },

    lihat_isi_folder: async (targetPath) => {
        const target = targetPath || '.';
        const aman = await isSafePath(target);
        if (!aman) return "Akses ditolak oleh pengguna (Area Sistem Operasi).";
        try {
            const files = await fs.readdir(target);
            return `Isi folder ${target}:\n${files.join('\n')}`;
        } catch (e) {
            return `Gagal membaca folder: ${e.message}`;
        }
    },

    buka_aplikasi: (namaApp) => {
        return new Promise((resolve) => {
            if (!namaApp) {
                resolve("Nama aplikasi tidak diberikan.");
                return;
            }
            
            const whitelist = {
                'chrome': 'start chrome',
                'edge': 'start msedge',
                'vscode': 'code',
                'word': 'start winword',
                'excel': 'start excel',
                'powerpoint': 'start powerpnt',
                'notepad': 'notepad'
            };
            
            const appCmd = whitelist[namaApp.toLowerCase().trim()];
            if (!appCmd) {
                resolve(`Aplikasi '${namaApp}' tidak diizinkan. Whitelist: chrome, edge, vscode, word, excel, powerpoint, notepad.`);
                return;
            }

            exec(appCmd, (error) => {
                if (error) resolve(`Gagal membuka aplikasi: ${error.message}`);
                else resolve(`Aplikasi '${namaApp}' berhasil dibuka.`);
            });
        });
    }
};

// ==========================================
// 2. LOGIKA AI (Memaksa Output JSON)
// ==========================================
async function getToolChoiceFromAI(userPrompt) {
    // Memberitahu AI daftar fungsi yang tersedia
    const deskripsiAlat = `
    1. "buat_folder": Membuat direktori. Param: "nama_folder" (string).
    2. "baca_file": Membaca isi file teks di laptop. Param: "path_file" (string absolute/relative).
    3. "tulis_file": Membuat/mengubah file. Param: "path_file|||isi_konten_file". Wajib gunakan ||| sebagai pemisah antara path dan konten.
    4. "lihat_isi_folder": Melihat daftar file dalam folder. Param: "path_folder" (string).
    5. "buka_aplikasi": Membuka aplikasi GUI. Param: "chrome", "edge", "vscode", "word", "excel", "powerpoint", atau "notepad".
    6. "cek_waktu": Melihat jam dan tanggal laptop. Param: "".
    7. "baca_sistem_info": Melihat info OS dan RAM. Param: "".
    `;

    const systemPrompt = `Anda adalah asisten pengontrol komputer yang cerdas. Pilih fungsi yang tepat dari daftar berikut:\n${deskripsiAlat}\n\nBalas HANYA dengan format JSON yang valid seperti ini: {"tool": "nama_fungsi", "parameter": "nilai_parameter_jika_ada"}. Jangan tambahkan teks lain.`;

    try {
        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                prompt: userPrompt,
                system: systemPrompt,
                format: "json", // Memaksa Ollama mengeluarkan JSON yang valid
                stream: false
            })
        });
        const data = await response.json();
        return JSON.parse(data.response); // Ubah teks JSON menjadi Object JavaScript
    } catch (error) {
        console.error("Gagal memproses JSON dari AI:", error);
        return null;
    }
}

// ==========================================
// 3. ALUR PROGRAM (Router Eksekusi)
// ==========================================
rl.question('Apa yang ingin Anda lakukan? ', async (userInput) => {
    console.log("Menganalisis permintaan...");

    const aiDecision = await getToolChoiceFromAI(userInput);

    if (!aiDecision) {
        console.log("Terjadi kesalahan pada respon AI.");
        rl.close();
        return;
    }

    console.log(`\nAI Memilih Alat: \x1b[36m${aiDecision.tool}\x1b[0m`);
    if (aiDecision.parameter) console.log(`Parameter: \x1b[36m${aiDecision.parameter}\x1b[0m`);

    // Pengecekan Keamanan (Whitelisting)
    if (safeTools[aiDecision.tool]) {
        console.log("Alat terdaftar! Mengeksekusi secara aman...\n");

        // Memanggil fungsi yang dipilih AI
        const hasil = await safeTools[aiDecision.tool](aiDecision.parameter);
        console.log(`\x1b[32mHasil:\x1b[0m\n${hasil}`);

    } else {
        // Jika AI mengarang nama alat yang tidak ada di safeTools
        console.log(`\x1b[31mBLOKIR KEAMANAN:\x1b[0m AI mencoba menggunakan alat tidak dikenal ('${aiDecision.tool}'). Operasi digagalkan.`);
    }

    rl.close();
});