import { useState, useRef } from 'react';
import axios from 'axios';
import LoadingMiniGames from './LoadingMiniGames';

export default function StoryUpload({ onGenerated, onBack }) {
  const [file, setFile] = useState(null);
  const [nama, setNama] = useState('');
  const [hubungan, setHubungan] = useState('');
  const [useAudio, setUseAudio] = useState(true);
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
      formData.append('use_audio', useAudio ? 'true' : 'false');
      
      const savedGroups = localStorage.getItem('story_groups');
      if (savedGroups) {
        formData.append('existing_groups', savedGroups);
      }

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
        timeout: 0, // Tidak ada timeout agar generasi lokal yang lama tidak gagal
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

  // Loading screen → Mini Games!
  if (loading) {
    return <LoadingMiniGames progress={progress} useAudio={useAudio} />;
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

          {/* Audio Toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderRadius: '16px',
            background: useAudio ? '#fff0f5' : '#f4f4f5',
            border: `2px solid ${useAudio ? '#fda4af' : '#e4e4e7'}`,
            marginBottom: '16px', transition: 'all 0.3s',
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#18181b' }}>
                🔊 Suara Bocchi
              </div>
              <div style={{ fontSize: '11px', color: '#71717a', marginTop: '2px' }}>
                {useAudio
                  ? 'Audio aktif — Bocchi akan bicara (loading lebih lama)'
                  : 'Audio mati — Teks saja, loading lebih cepat'
                }
              </div>
            </div>
            <div
              onClick={() => setUseAudio(!useAudio)}
              style={{
                width: '48px', height: '26px', borderRadius: '13px',
                background: useAudio ? '#e11d48' : '#d4d4d8',
                position: 'relative', cursor: 'pointer',
                transition: 'background 0.3s',
                flexShrink: 0,
              }}
            >
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%',
                background: 'white',
                position: 'absolute', top: '2px',
                left: useAudio ? '24px' : '2px',
                transition: 'left 0.3s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
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
