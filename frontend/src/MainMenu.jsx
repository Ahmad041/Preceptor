import { useState } from 'react';
import SettingsMenu from './SettingsMenu';

export default function MainMenu({ onStart }) {
  const [showModes, setShowModes] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedMode, setSelectedMode] = useState('override');

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
                onClick={() => {
                  if (label === 'Settings') setShowSettings(true);
                }}
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
              { id: 'override', title: 'Override Mode', desc: 'Mode kontrol desktop, vision, dan chatting bebas', icon: '🛠️', status: 'Aktif' },
              { id: 'company', title: 'Company Mode', desc: 'Obsidian-like Note System with 3D AI Knowledge Graph', icon: '🧠', status: 'Aktif' }
            ].map(mode => (
              <button
                key={mode.id}
                onClick={() => {
                  if (mode.id === 'override' || mode.id === 'story' || mode.id === 'company') {
                    setSelectedMode(mode.id);
                    setShowModes(false);
                    onStart({ nama: '', hubungan: '' }, mode.id);
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

      {/* Modal Profile Form removed since Settings handles profile globally */}

      {/* Settings Modal */}
      {showSettings && <SettingsMenu onClose={() => setShowSettings(false)} />}
    </div>
  );
}
