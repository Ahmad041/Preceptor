import { useState, useRef } from 'react';
import axios from 'axios';

export default function StoryUpload({ onGenerated, onBack }) {
  const [file, setFile] = useState(null);
  const [nama, setNama] = useState('');
  const [hubungan, setHubungan] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  };

  const handleGenerate = async () => {
    if (!file || !nama.trim() || !hubungan.trim() || loading) return;
    setLoading(true);
    setProgress('Bocchi sedang membaca dokumenmu...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_nama', nama.trim());
      formData.append('user_hubungan', hubungan.trim());

      setProgress('Mengekstrak teks dari dokumen...');
      
      // Simulate progress updates (actual generation is one long request)
      const progressTimer = setInterval(() => {
        setProgress(prev => {
          const msgs = [
            'Bocchi sedang membaca dokumenmu...',
            'Memotong teks menjadi bagian-bagian...',
            'Bocchi sedang menulis dialog... (>_<)',
            'Masih nulis... sabar ya Senpai...',
            'Hampir selesai... mungkin...',
            'Bocchi berusaha keras! ᕦ(ò_óˇ)ᕤ',
          ];
          const idx = msgs.indexOf(prev);
          return msgs[Math.min(idx + 1, msgs.length - 1)];
        });
      }, 8000);

      const res = await axios.post('http://localhost:8000/api/story/generate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000, // 10 menit karena generate bisa lama
      });

      clearInterval(progressTimer);

      if (res.data.status === 'berhasil') {
        onGenerated(res.data, { nama: nama.trim(), hubungan: hubungan.trim() });
      } else {
        alert('Gagal generate story: ' + (res.data.error || 'Unknown error'));
        setLoading(false);
      }
    } catch (err) {
      console.error('[StoryUpload] Error:', err);
      alert('Error: ' + (err.response?.data?.error || err.message));
      setLoading(false);
    }
  };

  // Loading screen
  if (loading) {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        background: '#1a0a2e',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Segoe UI', sans-serif",
      }}>
        <img src="/bg-room.png" alt="bg" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', opacity: 0.3,
        }} />
        <div style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}>
          {/* Spinning book */}
          <div style={{
            fontSize: '64px',
            animation: 'spin 2s linear infinite',
            marginBottom: '24px',
          }}>📖</div>
          
          <h2 style={{ color: '#f9a8d4', fontSize: '22px', fontWeight: 700, marginBottom: '12px' }}>
            Generating Story...
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', maxWidth: '400px' }}>
            {progress}
          </p>
          
          {/* Progress bar animation */}
          <div style={{
            width: '300px', height: '4px', background: 'rgba(255,255,255,0.1)',
            borderRadius: '2px', marginTop: '24px', overflow: 'hidden',
          }}>
            <div style={{
              width: '40%', height: '100%',
              background: 'linear-gradient(90deg, #f472b6, #e11d48, #f472b6)',
              borderRadius: '2px',
              animation: 'loadSlide 1.5s ease-in-out infinite',
            }} />
          </div>
          
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', marginTop: '16px' }}>
            Ini bisa memakan waktu 1-5 menit tergantung panjang dokumen
          </p>
        </div>
        
        <style>{`
          @keyframes spin { 0% { transform: rotateY(0deg); } 100% { transform: rotateY(360deg); } }
          @keyframes loadSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      position: 'relative', background: '#fdf2f8',
      fontFamily: "'Segoe UI', sans-serif",
    }}>
      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <img style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }}
          alt="Background" src="/bg-room.png" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(253,242,248,0.9), rgba(253,242,248,0.5), transparent)' }} />
      </div>

      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', padding: '24px',
      }}>
        <div style={{
          background: 'white', borderRadius: '32px', padding: '40px',
          width: '520px', maxWidth: '95vw',
          boxShadow: '0 30px 70px rgba(0,0,0,0.15)',
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎬</div>
            <h2 style={{ color: '#e11d48', fontSize: '24px', fontWeight: 800, margin: '0 0 4px' }}>
              Story Mode
            </h2>
            <p style={{ color: '#71717a', fontSize: '13px' }}>
              Upload dokumen dan Bocchi akan menjelaskannya untukmu!
            </p>
          </div>

          {/* File Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#e11d48' : file ? '#22c55e' : '#e4e4e7'}`,
              borderRadius: '20px',
              padding: '32px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s',
              background: dragOver ? '#fff0f5' : file ? '#f0fdf4' : '#fafafa',
              marginBottom: '20px',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.docx,.doc,.md"
              onChange={(e) => setFile(e.target.files[0])}
              style={{ display: 'none' }}
            />
            {file ? (
              <>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
                <div style={{ fontWeight: 700, color: '#18181b', fontSize: '14px' }}>{file.name}</div>
                <div style={{ color: '#71717a', fontSize: '12px', marginTop: '4px' }}>
                  {(file.size / 1024).toFixed(1)} KB — Klik untuk ganti file
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                <div style={{ fontWeight: 700, color: '#18181b', fontSize: '14px' }}>
                  Drag & drop file di sini
                </div>
                <div style={{ color: '#a1a1aa', fontSize: '12px', marginTop: '4px' }}>
                  Format: PDF, TXT, DOCX, MD
                </div>
              </>
            )}
          </div>

          {/* Profile Fields */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#71717a', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
                Nama Panggilan
              </label>
              <input
                type="text"
                placeholder="Senpai"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: '12px',
                  border: '2px solid #e4e4e7', fontSize: '14px', outline: 'none',
                  boxSizing: 'border-box', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#f43f5e'}
                onBlur={e => e.target.style.borderColor = '#e4e4e7'}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#71717a', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
                Hubungan
              </label>
              <input
                type="text"
                placeholder="Teman dekat"
                value={hubungan}
                onChange={(e) => setHubungan(e.target.value)}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: '12px',
                  border: '2px solid #e4e4e7', fontSize: '14px', outline: 'none',
                  boxSizing: 'border-box', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#f43f5e'}
                onBlur={e => e.target.style.borderColor = '#e4e4e7'}
              />
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button
              onClick={onBack}
              style={{
                flex: 1, padding: '13px', borderRadius: '100px', border: 'none',
                background: '#f4f4f5', color: '#52525b', fontWeight: 700, fontSize: '14px',
                cursor: 'pointer', transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#e4e4e7'}
              onMouseLeave={e => e.currentTarget.style.background = '#f4f4f5'}
            >
              ← Kembali
            </button>
            <button
              onClick={handleGenerate}
              disabled={!file || !nama.trim() || !hubungan.trim()}
              style={{
                flex: 1, padding: '13px', borderRadius: '100px', border: 'none',
                background: (file && nama.trim() && hubungan.trim()) ? '#e11d48' : '#fda4af',
                color: 'white', fontWeight: 700, fontSize: '14px',
                cursor: (file && nama.trim() && hubungan.trim()) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
            >
              Mulai Story ✨
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
