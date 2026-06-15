import React, { useState, useEffect } from 'react';

export default function SettingsMenu({ onClose }) {
  const [activeTab, setActiveTab] = useState('visual');
  const [settings, setSettings] = useState({
    user_nama: '',
    user_hubungan: '',
    system_prompt: '',
    llm_engine: '',
    llm_model: '',
    tts_model_chat: '',
    tts_model_story: '',
    visual_mode: '2D',
    volume: 1.0,
    is_muted: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');
  const [updateProvider, setUpdateProvider] = useState('Ollama');
  const [ollamaModels, setOllamaModels] = useState([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState('');
  const [githubSearchQuery, setGithubSearchQuery] = useState('topic:ai language:python');
  const [terminalLogs, setTerminalLogs] = useState([
    "> SYSTEM BOOT SEQUENCE INITIATED",
    "> LOADING KERNEL MODULES... OK",
    "> ESTABLISHING SECURE CONNECTION... OK",
    "> AWAITING COMMAND..."
  ]);

  // Fetch initial settings from backend
  useEffect(() => {
    fetch('http://localhost:8000/api/settings')
      .then(res => res.json())
      .then(data => {
        setSettings(prev => ({ ...prev, ...data }));
      })
      .catch(err => console.error("Gagal load settings", err));

    fetch('http://localhost:8000/api/system/ollama-models')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success' && data.models.length > 0) {
          setOllamaModels(data.models);
          setSelectedOllamaModel(data.models[0]);
        }
      })
      .catch(err => console.error("Gagal load ollama models", err));
  }, []);

  const handleSave = async () => {
    setIsLoading(true);
    setSaveStatus('INITIALIZING SAVE PROTOCOL...');
    try {
      const res = await fetch('http://localhost:8000/api/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setSaveStatus('PROTOCOL SAVED.');
        setTimeout(() => {
          setSaveStatus('');
          onClose(); // Auto close after save
        }, 1000);
      } else {
        setSaveStatus('ERR: FAILED TO SAVE.');
      }
    } catch (err) {
      console.error(err);
      setSaveStatus('ERR: SYSTEM EXCEPTION.');
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
      setSaveStatus(`UPLOADING ${emotion.toUpperCase()} ASSET...`);
      const res = await fetch('http://localhost:8000/api/settings/upload-visual', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        setSaveStatus(`ASSET ${emotion.toUpperCase()} SECURED.`);
        setTimeout(() => setSaveStatus(''), 2000);
      }
    } catch (err) {
      console.error(err);
      setSaveStatus('ERR: UPLOAD FAILED.');
    }
  };

  const tabs = [
    { id: 'visual', label: 'VISUAL & AUDIO' },
    { id: 'ai', label: 'AI CORES' },
    { id: 'persona', label: 'IDENTITY PROFILES' },
    { id: 'update', label: 'SYSTEM UPDATE' }
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(5, 7, 10, 0.85)', backdropFilter: 'blur(16px)',
      fontFamily: '"Outfit", sans-serif',
      color: '#e2e8f0'
    }}>
      {/* Glitch/Scanline effect overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))',
        backgroundSize: '100% 4px, 3px 100%',
        zIndex: 0, opacity: 0.3
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        width: '1000px', height: '75vh',
        background: 'rgba(10, 15, 22, 0.7)',
        border: '1px solid rgba(66, 108, 145, 0.4)',
        boxShadow: '0 0 60px rgba(0,0,0,0.8), inset 0 0 20px rgba(66, 108, 145, 0.1)',
        display: 'flex', flexDirection: 'row'
      }}>
        {/* Decorative corner markers */}
        <div style={{ position: 'absolute', top: -1, left: -1, width: '16px', height: '16px', borderTop: '2px solid #426c91', borderLeft: '2px solid #426c91' }} />
        <div style={{ position: 'absolute', top: -1, right: -1, width: '16px', height: '16px', borderTop: '2px solid #426c91', borderRight: '2px solid #426c91' }} />
        <div style={{ position: 'absolute', bottom: -1, left: -1, width: '16px', height: '16px', borderBottom: '2px solid #426c91', borderLeft: '2px solid #426c91' }} />
        <div style={{ position: 'absolute', bottom: -1, right: -1, width: '16px', height: '16px', borderBottom: '2px solid #426c91', borderRight: '2px solid #426c91' }} />

        {/* Sidebar */}
        <div style={{
          width: '280px', borderRight: '1px solid rgba(66, 108, 145, 0.2)',
          display: 'flex', flexDirection: 'column', background: 'rgba(5, 7, 10, 0.6)'
        }}>
          <div style={{ padding: '40px 24px', borderBottom: '1px solid rgba(66, 108, 145, 0.2)' }}>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 800, letterSpacing: '0.2em', color: '#83afd4', textShadow: '0 0 10px rgba(131,175,212,0.5)' }}>SETTINGS</h2>
            <div style={{ fontSize: '10px', color: '#4a5568', letterSpacing: '0.1em', marginTop: '8px' }}>NEO-NOIR PROTOCOL</div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '24px 0' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: activeTab === tab.id ? 'linear-gradient(90deg, rgba(66,108,145,0.4) 0%, rgba(0,0,0,0) 100%)' : 'transparent',
                  border: 'none', padding: '16px 32px', textAlign: 'left',
                  color: activeTab === tab.id ? '#ffffff' : '#4a5568',
                  borderLeft: activeTab === tab.id ? '4px solid #83afd4' : '4px solid transparent',
                  cursor: 'pointer', transition: 'all 0.3s ease',
                  fontFamily: 'Outfit', fontSize: '14px', fontWeight: 600, letterSpacing: '0.15em'
                }}
                onMouseEnter={e => {
                  if (activeTab !== tab.id) e.currentTarget.style.color = '#83afd4';
                }}
                onMouseLeave={e => {
                  if (activeTab !== tab.id) e.currentTarget.style.color = '#4a5568';
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ padding: '24px', borderTop: '1px solid rgba(66, 108, 145, 0.2)' }}>
            <button 
              onClick={onClose}
              style={{
                width: '100%', background: 'none', border: '1px solid rgba(66, 108, 145, 0.4)',
                color: '#83afd4', padding: '12px', cursor: 'pointer', fontFamily: 'Outfit',
                fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', transition: 'all 0.3s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(66, 108, 145, 0.2)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#83afd4'; }}
            >
              RETURN
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, padding: '48px', overflowY: 'auto', position: 'relative' }}>
          
          <style>{`
            .neo-input {
              width: 100%; padding: 14px 16px; background: rgba(0,0,0,0.4);
              border: 1px solid rgba(66, 108, 145, 0.3); border-radius: 4px;
              color: #e2e8f0; font-family: 'Outfit', monospace; font-size: 14px;
              transition: all 0.3s ease; box-sizing: border-box;
            }
            .neo-input:focus {
              outline: none; border-color: #83afd4; box-shadow: 0 0 15px rgba(131,175,212,0.2);
            }
            .neo-label {
              font-weight: 600; font-size: 12px; color: #83afd4; display: block;
              margin-bottom: 10px; letter-spacing: 0.1em; text-transform: uppercase;
            }
            .neo-panel {
              background: rgba(5, 7, 10, 0.5); border: 1px solid rgba(66, 108, 145, 0.2);
              padding: 24px; border-radius: 4px; position: relative;
            }
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes blink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0; }
            }
          `}</style>

          {/* TAB: VISUAL & AUDIO */}
          {activeTab === 'visual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', animation: 'fadeIn 0.4s ease-out' }}>
              <div>
                <label className="neo-label">Visual Mode Directive</label>
                <select 
                  className="neo-input"
                  value={settings.visual_mode} 
                  onChange={e => setSettings({...settings, visual_mode: e.target.value})}
                >
                  <option value="2D" style={{background: '#0a0f16'}}>2D (Static Intel)</option>
                  <option value="3D" style={{background: '#0a0f16'}}>3D (VRM Protocol)</option>
                </select>
              </div>

              {settings.visual_mode === '2D' ? (
                <div className="neo-panel">
                  <p className="neo-label" style={{color: '#4a5568'}}>2D Expression Assets (PNG/JPG)</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {['Neutral', 'Joy', 'Sorrow', 'Angry', 'Fun', 'Surprised'].map(emo => (
                      <div key={emo} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '12px', width: '70px', color: '#a0aec0' }}>{emo.toUpperCase()}:</span>
                        <input type="file" accept="image/*" onChange={(e) => handleVisualUpload(e, emo)} 
                          style={{ fontSize: '11px', color: '#718096', cursor: 'pointer' }} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="neo-panel">
                  <p className="neo-label" style={{color: '#4a5568'}}>3D Avatar Asset (.VRM)</p>
                  <input type="file" accept=".vrm,.gltf,.glb" onChange={(e) => handleVisualUpload(e, '3d')} 
                    style={{ fontSize: '12px', color: '#718096', cursor: 'pointer' }} />
                </div>
              )}

              <div>
                <label className="neo-label">Master Audio Output</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(0,0,0,0.4)', padding: '16px', border: '1px solid rgba(66, 108, 145, 0.3)', borderRadius: '4px' }}>
                  <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={settings.volume} 
                    onChange={e => setSettings({...settings, volume: parseFloat(e.target.value)})}
                    style={{ flex: 1, accentColor: '#83afd4' }}
                  />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#83afd4', width: '40px' }}>{Math.round(settings.volume * 100)}%</span>
                  <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#a0aec0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={settings.is_muted} onChange={e => setSettings({...settings, is_muted: e.target.checked})} style={{ accentColor: '#e53e3e' }} />
                    MUTE SIGNAL
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB: AI MODELS */}
          {activeTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', animation: 'fadeIn 0.4s ease-out' }}>
              <div>
                <label className="neo-label">Core LLM Engine</label>
                <input 
                  type="text" value={settings.llm_engine || ''} 
                  onChange={e => setSettings({...settings, llm_engine: e.target.value})}
                  className="neo-input" placeholder="e.g., Ollama"
                />
              </div>
              <div>
                <label className="neo-label">Active Neural Model</label>
                <input 
                  type="text" value={settings.llm_model || ''} 
                  onChange={e => setSettings({...settings, llm_model: e.target.value})}
                  className="neo-input" placeholder="e.g., llama3"
                />
                <p style={{ fontSize: '10px', color: '#4a5568', margin: '8px 0 0 0', letterSpacing: '0.05em' }}>* WARNING: REPLACING CORE REQUIRES PRELOAD TIME.</p>
              </div>
              <div className="neo-panel">
                <label className="neo-label">Vocal Synthesis (Chat Protocol)</label>
                <select 
                  value={settings.tts_model_chat || ''} 
                  onChange={e => setSettings({...settings, tts_model_chat: e.target.value})}
                  className="neo-input"
                >
                  <option value="Qwen/Qwen3-TTS-12Hz-0.6B-Base" style={{background: '#0a0f16'}}>Qwen3 0.6B (Fast Response)</option>
                  <option value="Qwen/Qwen3-TTS-12Hz-1.7B-Base" style={{background: '#0a0f16'}}>Qwen3 1.7B (High Fidelity)</option>
                </select>
              </div>
              <div className="neo-panel">
                <label className="neo-label">Vocal Synthesis (Narrative Protocol)</label>
                <select 
                  value={settings.tts_model_story || ''} 
                  onChange={e => setSettings({...settings, tts_model_story: e.target.value})}
                  className="neo-input"
                >
                  <option value="Qwen/Qwen3-TTS-12Hz-0.6B-Base" style={{background: '#0a0f16'}}>Qwen3 0.6B (Fast Response)</option>
                  <option value="Qwen/Qwen3-TTS-12Hz-1.7B-Base" style={{background: '#0a0f16'}}>Qwen3 1.7B (High Fidelity)</option>
                </select>
                <p style={{ fontSize: '10px', color: '#4a5568', margin: '8px 0 0 0', letterSpacing: '0.05em' }}>* DYNAMIC HOT-SWAPPING ENABLED BETWEEN MODES.</p>
              </div>
            </div>
          )}

          {/* TAB: PERSONA & PROFIL */}
          {activeTab === 'persona' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', animation: 'fadeIn 0.4s ease-out' }}>
              <div style={{ display: 'flex', gap: '24px' }}>
                <div style={{ flex: 1 }}>
                  <label className="neo-label">User Designation (Name)</label>
                  <input 
                    type="text" value={settings.user_nama || ''} 
                    onChange={e => setSettings({...settings, user_nama: e.target.value})}
                    className="neo-input" placeholder="Enter your name"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="neo-label">Relational Parameter</label>
                  <input 
                    type="text" value={settings.user_hubungan || ''} 
                    onChange={e => setSettings({...settings, user_hubungan: e.target.value})}
                    className="neo-input" placeholder="e.g., Boss, Friend"
                  />
                </div>
              </div>
              
              <div>
                <label className="neo-label">Base Identity Directives (System Prompt)</label>
                <textarea 
                  rows="8"
                  value={settings.system_prompt || ''} 
                  onChange={e => setSettings({...settings, system_prompt: e.target.value})}
                  className="neo-input"
                  style={{ resize: 'vertical', lineHeight: '1.5' }}
                  placeholder="Define AI persona..."
                />
                <p style={{ fontSize: '10px', color: '#4a5568', margin: '8px 0 0 0', letterSpacing: '0.05em' }}>* OVERRIDING DIRECTIVES TAKES EFFECT UPON NEXT COMMUNICATION CYCLE.</p>
              </div>
            </div>
          )}

          {/* TAB: SYSTEM UPDATE */}
          {activeTab === 'update' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', animation: 'fadeIn 0.4s ease-out' }}>
              <div className="neo-panel">
                <h3 style={{ margin: '0 0 16px 0', color: '#83afd4', fontSize: '18px', letterSpacing: '0.1em' }}>CORE PROTOCOL VERSION: 1.0.0-ALPHA</h3>
                <p style={{ color: '#a0aec0', fontSize: '12px', lineHeight: '1.6', marginBottom: '24px' }}>
                  Ensure your system is running the latest Neo-Noir Protocol for optimal stability and new features. Updates are fetched securely from the central repository.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <select 
                      value={updateProvider} 
                      onChange={e => setUpdateProvider(e.target.value)}
                      className="neo-input"
                      style={{ width: '200px', padding: '8px 12px' }}
                    >
                      <option value="Ollama" style={{background: '#0a0f16'}}>Ollama (Local)</option>
                      <option value="OpenRouter" style={{background: '#0a0f16'}}>OpenRouter (Cloud)</option>
                    </select>
                    
                    {updateProvider === 'Ollama' && (
                      <select 
                        value={selectedOllamaModel} 
                        onChange={e => setSelectedOllamaModel(e.target.value)}
                        className="neo-input"
                        style={{ width: '200px', padding: '8px 12px' }}
                      >
                        {ollamaModels.map(m => (
                          <option key={m} value={m} style={{background: '#0a0f16'}}>{m}</option>
                        ))}
                      </select>
                    )}
                    
                    <input
                      type="text"
                      value={githubSearchQuery}
                      onChange={e => setGithubSearchQuery(e.target.value)}
                      className="neo-input"
                      placeholder="GitHub Search Query (e.g. topic:ai)"
                      style={{ width: '200px', padding: '8px 12px' }}
                    />
                    
                    <button 
                      onClick={() => {
                        if (isCheckingUpdate) return;
                        setIsCheckingUpdate(true);
                        setUpdateMsg('');
                        setTerminalLogs(prev => [...prev, `> EXECUTING PROTOCOL WITH ${updateProvider.toUpperCase()}...`]);
                        
                        let streamUrl = `http://localhost:8000/api/system/update/stream?provider=${updateProvider}`;
                        if (updateProvider === 'Ollama' && selectedOllamaModel) {
                          streamUrl += `&model=${selectedOllamaModel}`;
                        }
                        if (githubSearchQuery) {
                          streamUrl += `&query=${encodeURIComponent(githubSearchQuery)}`;
                        }
                        const eventSource = new EventSource(streamUrl);
                        
                        eventSource.onmessage = (e) => {
                          setTerminalLogs(prev => [...prev, e.data]);
                          
                          if (e.data.includes("PROTOCOL SAVED TO") || e.data.includes("ERR:")) {
                            setIsCheckingUpdate(false);
                            eventSource.close();
                          }
                        };
                        
                        eventSource.onerror = (e) => {
                          setTerminalLogs(prev => [...prev, "> ERR: CONNECTION LOST OR STREAM ENDED UNEXPECTEDLY."]);
                          setIsCheckingUpdate(false);
                          eventSource.close();
                        };
                      }}
                      disabled={isCheckingUpdate}
                      style={{ 
                        background: isCheckingUpdate ? 'rgba(66, 108, 145, 0.4)' : 'transparent', 
                        border: '1px solid #83afd4', color: '#83afd4',
                        padding: '12px 24px', fontFamily: 'Outfit', fontSize: '12px', fontWeight: 700,
                        letterSpacing: '0.1em', cursor: isCheckingUpdate ? 'wait' : 'pointer',
                        transition: 'all 0.3s ease',
                        boxShadow: isCheckingUpdate ? '0 0 15px rgba(66,108,145,0.4)' : 'none'
                      }}
                      onMouseEnter={e => { if(!isCheckingUpdate) { e.currentTarget.style.background = 'rgba(66, 108, 145, 0.2)'; e.currentTarget.style.boxShadow = '0 0 15px rgba(131,175,212,0.3)'; } }}
                      onMouseLeave={e => { if(!isCheckingUpdate) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; } }}
                    >
                      {isCheckingUpdate ? 'EVOLVING...' : 'CHECK FOR UPDATES'}
                    </button>
                    <span style={{ fontSize: '11px', color: '#48bb78', fontWeight: 600, letterSpacing: '0.05em' }}>{updateMsg}</span>
                  </div>
                </div>
              </div>

              {/* Terminal UI */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.8)',
                border: '1px solid rgba(66, 108, 145, 0.4)',
                borderLeft: '4px solid #83afd4',
                borderRadius: '4px',
                padding: '16px',
                height: '180px',
                overflowY: 'auto',
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: '12px',
                color: '#48bb78',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
              }}>
                {terminalLogs.map((log, i) => (
                  <div key={i} style={{ opacity: 0.9, textShadow: '0 0 5px rgba(72,187,120,0.5)' }}>{log}</div>
                ))}
                <div style={{ display: 'flex' }}>
                  <span style={{ opacity: 0.9, textShadow: '0 0 5px rgba(72,187,120,0.5)' }}>{">"}</span>
                  <span style={{ animation: 'blink 1s infinite', marginLeft: '4px', width: '8px', background: '#48bb78' }}></span>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Action Bar */}
          <div style={{ position: 'absolute', bottom: '40px', right: '40px', display: 'flex', alignItems: 'center', gap: '20px' }}>
             <span style={{ 
               fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em',
               color: saveStatus.includes('ERR') ? '#e53e3e' : '#48bb78',
               textShadow: saveStatus.includes('ERR') ? '0 0 8px rgba(229,62,62,0.4)' : '0 0 8px rgba(72,187,120,0.4)',
               opacity: saveStatus ? 1 : 0, transition: 'opacity 0.3s'
             }}>
               {saveStatus}
             </span>
             <button 
               onClick={handleSave}
               disabled={isLoading}
               style={{ 
                 background: isLoading ? 'rgba(66, 108, 145, 0.4)' : 'rgba(66, 108, 145, 0.2)', 
                 border: '1px solid #83afd4', color: '#fff',
                 padding: '14px 32px', fontFamily: 'Outfit', fontSize: '12px', fontWeight: 700,
                 letterSpacing: '0.2em', cursor: isLoading ? 'wait' : 'pointer',
                 transition: 'all 0.3s ease',
                 boxShadow: '0 0 15px rgba(66,108,145,0.2)'
               }}
               onMouseEnter={e => { if(!isLoading) { e.currentTarget.style.background = 'rgba(66, 108, 145, 0.4)'; e.currentTarget.style.boxShadow = '0 0 25px rgba(131,175,212,0.4)'; } }}
               onMouseLeave={e => { if(!isLoading) { e.currentTarget.style.background = 'rgba(66, 108, 145, 0.2)'; e.currentTarget.style.boxShadow = '0 0 15px rgba(66,108,145,0.2)'; } }}
             >
               {isLoading ? 'EXECUTING...' : 'APPLY PROTOCOL'}
             </button>
          </div>

        </div>
      </div>
    </div>
  );
}
