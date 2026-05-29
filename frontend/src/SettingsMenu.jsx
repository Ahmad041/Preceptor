import React, { useState, useEffect } from 'react';

export default function SettingsMenu({ onClose }) {
  const [activeTab, setActiveTab] = useState('visual');
  const [settings, setSettings] = useState({
    user_nama: '',
    user_hubungan: '',
    system_prompt: '',
    llm_model: '',
    tts_model_chat: '',
    tts_model_story: '',
    visual_mode: '2D',
    volume: 1.0,
    is_muted: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Fetch initial settings from backend
  useEffect(() => {
    fetch('http://localhost:8000/api/settings')
      .then(res => res.json())
      .then(data => {
        setSettings(prev => ({ ...prev, ...data }));
      })
      .catch(err => console.error("Gagal load settings", err));
  }, []);

  const handleSave = async () => {
    setIsLoading(true);
    setSaveStatus('Saving...');
    try {
      const res = await fetch('http://localhost:8000/api/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setSaveStatus('Saved!');
        setTimeout(() => {
          setSaveStatus('');
          onClose(); // Auto close after save
        }, 1000);
      } else {
        setSaveStatus('Failed to save');
      }
    } catch (err) {
      console.error(err);
      setSaveStatus('Error saving');
    }
    setIsLoading(false);
  };

  const handleVisualUpload = async (e, emotion = 'Neutral') => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('emotion', emotion);

    try {
      setSaveStatus(`Uploading ${emotion} visual...`);
      const res = await fetch('http://localhost:8000/api/settings/upload-visual', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        setSaveStatus(`Visual ${emotion} uploaded!`);
        setTimeout(() => setSaveStatus(''), 2000);
      }
    } catch (err) {
      console.error(err);
      setSaveStatus('Upload failed');
    }
  };

  const tabs = [
    { id: 'visual', label: '🎨 Visual & Audio' },
    { id: 'ai', label: '🤖 AI Models' },
    { id: 'persona', label: '🎭 Persona & Profil' }
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)'
    }}>
      <div style={{
        background: 'white', borderRadius: '24px', width: '600px',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 30px 70px rgba(0,0,0,0.3)', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ padding: '24px 32px', borderBottom: '1px solid #f4f4f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: '#e11d48', fontSize: '24px', fontWeight: 800 }}>Settings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#a1a1aa' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: '#fdf2f8', padding: '0 24px' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '16px 24px', border: 'none', background: 'none',
                fontWeight: activeTab === tab.id ? 800 : 600,
                color: activeTab === tab.id ? '#e11d48' : '#71717a',
                borderBottom: activeTab === tab.id ? '3px solid #e11d48' : '3px solid transparent',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '32px', overflowY: 'auto', flex: 1 }}>
          
          {/* TAB: VISUAL & AUDIO */}
          {activeTab === 'visual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontWeight: 700, fontSize: '14px', color: '#3f3f46', display: 'block', marginBottom: '8px' }}>Visual Mode</label>
                <select 
                  value={settings.visual_mode} 
                  onChange={e => setSettings({...settings, visual_mode: e.target.value})}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e4e4e7' }}
                >
                  <option value="2D">2D (Images)</option>
                  <option value="3D">3D (VRM/GLTF)</option>
                </select>
              </div>

              {settings.visual_mode === '2D' ? (
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px' }}>
                  <p style={{ margin: '0 0 12px 0', fontSize: '12px', fontWeight: 700, color: '#64748b' }}>UPLOAD 2D EXPRESSIONS (PNG/JPG)</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {['Neutral', 'Joy', 'Sorrow', 'Angry', 'Fun', 'Surprised'].map(emo => (
                      <div key={emo} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', width: '60px' }}>{emo}:</span>
                        <input type="file" accept="image/*" onChange={(e) => handleVisualUpload(e, emo)} style={{ fontSize: '10px' }} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px' }}>
                  <p style={{ margin: '0 0 12px 0', fontSize: '12px', fontWeight: 700, color: '#64748b' }}>UPLOAD 3D AVATAR (.VRM / .GLTF)</p>
                  <input type="file" accept=".vrm,.gltf,.glb" onChange={(e) => handleVisualUpload(e, '3d')} style={{ fontSize: '12px' }} />
                </div>
              )}

              <div>
                <label style={{ fontWeight: 700, fontSize: '14px', color: '#3f3f46', display: 'block', marginBottom: '8px' }}>Audio Volume</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={settings.volume} 
                    onChange={e => setSettings({...settings, volume: parseFloat(e.target.value)})}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{Math.round(settings.volume * 100)}%</span>
                  <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="checkbox" checked={settings.is_muted} onChange={e => setSettings({...settings, is_muted: e.target.checked})} />
                    Mute
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB: AI MODELS */}
          {activeTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontWeight: 700, fontSize: '14px', color: '#3f3f46', display: 'block', marginBottom: '8px' }}>LLM Engine</label>
                <input 
                  type="text" value={settings.llm_engine} 
                  onChange={e => setSettings({...settings, llm_engine: e.target.value})}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e4e4e7', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontWeight: 700, fontSize: '14px', color: '#3f3f46', display: 'block', marginBottom: '8px' }}>LLM Model</label>
                <input 
                  type="text" value={settings.llm_model} 
                  onChange={e => setSettings({...settings, llm_model: e.target.value})}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e4e4e7', boxSizing: 'border-box' }}
                />
                <p style={{ fontSize: '10px', color: '#a1a1aa', margin: '4px 0 0 0' }}>Warning: Changing LLM may cause a slight pause while Ollama preloads it.</p>
              </div>
              <div>
                <label style={{ fontWeight: 700, fontSize: '14px', color: '#3f3f46', display: 'block', marginBottom: '8px' }}>TTS Model (Chatting)</label>
                <select 
                  value={settings.tts_model_chat} 
                  onChange={e => setSettings({...settings, tts_model_chat: e.target.value})}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e4e4e7' }}
                >
                  <option value="Qwen/Qwen3-TTS-12Hz-0.6B-Base">Qwen3 0.6B (Fast, Low VRAM)</option>
                  <option value="Qwen/Qwen3-TTS-12Hz-1.7B-Base">Qwen3 1.7B (High Quality, Needs 4GB+ VRAM)</option>
                </select>
              </div>
              <div style={{ marginTop: '16px' }}>
                <label style={{ fontWeight: 700, fontSize: '14px', color: '#3f3f46', display: 'block', marginBottom: '8px' }}>TTS Model (Story Mode)</label>
                <select 
                  value={settings.tts_model_story} 
                  onChange={e => setSettings({...settings, tts_model_story: e.target.value})}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e4e4e7' }}
                >
                  <option value="Qwen/Qwen3-TTS-12Hz-0.6B-Base">Qwen3 0.6B (Fast, Low VRAM)</option>
                  <option value="Qwen/Qwen3-TTS-12Hz-1.7B-Base">Qwen3 1.7B (High Quality, Needs 4GB+ VRAM)</option>
                </select>
                <p style={{ fontSize: '10px', color: '#a1a1aa', margin: '4px 0 0 0' }}>Models are automatically hot-swapped dynamically when you switch mode.</p>
              </div>
            </div>
          )}

          {/* TAB: PERSONA & PROFIL */}
          {activeTab === 'persona' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 700, fontSize: '14px', color: '#3f3f46', display: 'block', marginBottom: '8px' }}>Panggilan (Namamu)</label>
                  <input 
                    type="text" value={settings.user_nama} 
                    onChange={e => setSettings({...settings, user_nama: e.target.value})}
                    style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e4e4e7', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 700, fontSize: '14px', color: '#3f3f46', display: 'block', marginBottom: '8px' }}>Hubungan dengan AI</label>
                  <input 
                    type="text" value={settings.user_hubungan} 
                    onChange={e => setSettings({...settings, user_hubungan: e.target.value})}
                    style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e4e4e7', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              
              <div>
                <label style={{ fontWeight: 700, fontSize: '14px', color: '#3f3f46', display: 'block', marginBottom: '8px' }}>System Prompt (Persona AI)</label>
                <textarea 
                  rows="6"
                  value={settings.system_prompt} 
                  onChange={e => setSettings({...settings, system_prompt: e.target.value})}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e4e4e7', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '12px' }}
                />
                <p style={{ fontSize: '10px', color: '#a1a1aa', margin: '4px 0 0 0' }}>Tip: You can change the AI's identity here. Changes apply immediately to the next chat.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '20px 32px', background: '#fafafa', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '12px', color: saveStatus === 'Failed to save' || saveStatus.includes('Error') ? 'red' : 'green', fontWeight: 'bold' }}>{saveStatus}</span>
          <button 
            onClick={onClose}
            style={{ padding: '10px 20px', borderRadius: '100px', border: 'none', background: '#e4e4e7', color: '#52525b', fontWeight: 700, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={isLoading}
            style={{ padding: '10px 24px', borderRadius: '100px', border: 'none', background: '#e11d48', color: 'white', fontWeight: 700, cursor: isLoading ? 'wait' : 'pointer' }}
          >
            {isLoading ? 'Saving...' : 'Save & Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
