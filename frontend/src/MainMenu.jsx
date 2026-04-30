import { useState } from 'react';

export default function MainMenu({ onStart }) {
  const [showModes, setShowModes] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedMode, setSelectedMode] = useState('sandbox');
  const [nama, setNama] = useState('');
  const [hubungan, setHubungan] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (nama.trim() && hubungan.trim()) {
      onStart({ nama, hubungan }, selectedMode);
    }
  };

  return (
    <div style={{ width: '100%', height: '100vh', overflow: 'hidden', position: 'relative', background: '#fdf2f8' }}>
      
      {/* Background Image */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <img
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }}
          alt="Background"
          src="/bg-room.png"
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(253,242,248,0.85), rgba(253,242,248,0.4), transparent)' }} />
      </div>

      {/* Main Layout */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', height: '100vh', width: '100%' }}>
        
        {/* Sidebar */}
        <nav style={{
          width: '280px',
          flexShrink: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '32px 24px',
          background: 'rgba(255,255,255,0.92)',
          borderRight: '1px solid rgba(244,114,182,0.15)',
          boxShadow: '4px 0 24px rgba(244,114,182,0.08)',
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '40px', marginTop: '8px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#e11d48', margin: 0, lineHeight: 1.2, letterSpacing: '-1px' }}>
              Bocchi's<br />Desktop
            </h1>
            <p style={{ fontSize: '10px', color: '#a1a1aa', marginTop: '8px', letterSpacing: '3px', textTransform: 'uppercase', fontWeight: 600 }}>
              v1.0.0 Alpha
            </p>
          </div>

          {/* Nav Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexGrow: 1 }}>
            <button
              onClick={() => setShowModes(true)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '14px 20px',
                borderRadius: '12px',
                border: 'none',
                background: '#fff0f5',
                color: '#e11d48',
                fontWeight: 800,
                fontSize: '12px',
                letterSpacing: '3px',
                textTransform: 'uppercase',
                cursor: 'pointer',
                borderLeft: '4px solid #e11d48',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#ffe4ef'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff0f5'}
            >
              ▶ Start
            </button>

            {['Load', 'Options', 'Settings'].map(label => (
              <button
                key={label}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '14px 20px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'transparent',
                  color: '#71717a',
                  fontWeight: 600,
                  fontSize: '12px',
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#fdf2f8'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {label}
              </button>
            ))}

            <div style={{ marginTop: 'auto' }}>
              <button
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '14px 20px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'transparent',
                  color: '#a1a1aa',
                  fontWeight: 600,
                  fontSize: '12px',
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Quit
              </button>
            </div>
          </div>
        </nav>

        {/* Character Area */}
        <div style={{ flexGrow: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', overflow: 'hidden', padding: '0 0 0 0' }}>
          <img
            style={{
              height: '88%',
              objectFit: 'contain',
              userSelect: 'none',
              pointerEvents: 'none',
              filter: 'drop-shadow(0 20px 50px rgba(171,44,93,0.25))',
              transform: 'translateX(60px)',
            }}
            alt="Bocchi Character"
            src="/bocchi.png"
          />
        </div>
      </div>

      {/* Mode Selection Modal */}
      {showModes && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowModes(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)'
          }}
        >
          <div style={{
            background: 'white', borderRadius: '32px', padding: '40px',
            width: '450px', boxShadow: '0 30px 70px rgba(0,0,0,0.3)',
            display: 'flex', flexDirection: 'column', gap: '20px'
          }}>
            <h2 style={{ textAlign: 'center', color: '#e11d48', fontSize: '24px', fontWeight: 800, margin: 0 }}>
              Pilih Mode Bermain
            </h2>
            <p style={{ textAlign: 'center', color: '#71717a', fontSize: '14px', marginBottom: '10px' }}>
              Bagaimana kamu ingin berinteraksi dengan Bocchi hari ini?
            </p>

            {[
              { id: 'story', title: 'Story Mode', desc: 'Ubah PDF/Paper menjadi Visual Novel Interaktif', icon: '🎬', status: 'Aktif' },
              { id: 'sandbox', title: 'Sandbox Mode', desc: 'Mode bebas, chatting, dan kontrol sistem laptop', icon: '🛠️', status: 'Aktif' },
              { id: 'company', title: 'Company Mode', desc: 'Manajemen tim dan kolaborasi bisnis terintegrasi', icon: '🏢', status: 'Coming Soon' }
            ].map(mode => (
              <button
                key={mode.id}
                onClick={() => {
                  if (mode.id === 'sandbox' || mode.id === 'story') {
                    setSelectedMode(mode.id);
                    setShowModes(false);
                    setShowForm(mode.id === 'sandbox');
                    if (mode.id === 'story') {
                      onStart({ nama: '', hubungan: '' }, 'story');
                    }
                  } else {
                    alert(`${mode.title} sedang dalam pengembangan!`);
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '20px',
                  padding: '20px', borderRadius: '20px', border: '2px solid #f4f4f5',
                  background: 'white', cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#f43f5e';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(225,29,72,0.1)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#f4f4f5';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '32px' }}>{mode.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '16px', color: '#18181b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {mode.title}
                    {mode.status !== 'Aktif' && (
                      <span style={{ fontSize: '9px', background: '#f4f4f5', color: '#71717a', padding: '2px 8px', borderRadius: '10px' }}>
                        {mode.status}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>{mode.desc}</div>
                </div>
              </button>
            ))}

            <button
              onClick={() => setShowModes(false)}
              style={{
                marginTop: '10px', background: 'none', border: 'none',
                color: '#a1a1aa', fontSize: '14px', cursor: 'pointer', fontWeight: 600
              }}
            >
              Kembali ke Menu Utama
            </button>
          </div>
        </div>
      )}

      {/* Modal Profile Form */}
      {showForm && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
          }}
        >
          <div style={{
            background: 'white',
            borderRadius: '24px',
            padding: '36px',
            width: '400px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ textAlign: 'center', color: '#e11d48', fontSize: '22px', fontWeight: 800, margin: '0 0 8px' }}>
              Buat Profilmu
            </h2>
            <p style={{ textAlign: 'center', color: '#71717a', fontSize: '13px', marginBottom: '28px' }}>
              Ketahui bagaimana Bocchi akan mengenalmu.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#71717a', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Nama Panggilan
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="Misal: Senpai"
                  value={nama}
                  onChange={e => setNama(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '2px solid #e4e4e7',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = '#f43f5e'}
                  onBlur={e => e.target.style.borderColor = '#e4e4e7'}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#71717a', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Hubungan Karakter
                </label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Teman dekat yang baik"
                  value={hubungan}
                  onChange={e => setHubungan(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '2px solid #e4e4e7',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = '#f43f5e'}
                  onBlur={e => e.target.style.borderColor = '#e4e4e7'}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{
                    flex: 1,
                    padding: '13px',
                    borderRadius: '100px',
                    border: 'none',
                    background: '#f4f4f5',
                    color: '#52525b',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e4e4e7'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f4f4f5'}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!nama.trim() || !hubungan.trim()}
                  style={{
                    flex: 1,
                    padding: '13px',
                    borderRadius: '100px',
                    border: 'none',
                    background: nama.trim() && hubungan.trim() ? '#e11d48' : '#fda4af',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: nama.trim() && hubungan.trim() ? 'pointer' : 'not-allowed',
                    transition: 'background 0.2s',
                  }}
                >
                  Mulai ✨
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
