import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import BocchiAvatar from './BocchiAvatar';

export default function StoryPlayer({ scenes, userProfile, storyMeta, onBack }) {
  const [currentScene, setCurrentScene] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [audioBase64, setAudioBase64] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [showNotes, setShowNotes] = useState(false);
  const [showAskInput, setShowAskInput] = useState(false);
  const [askText, setAskText] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askAnswer, setAskAnswer] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [emosi, setEmosi] = useState('idle');
  const typingRef = useRef(null);

  const scene = scenes[currentScene] || {};
  const totalScenes = scenes.length;

  // Auto-save progress
  useEffect(() => {
    if (storyMeta?.filename) {
      const saveData = { currentScene, filename: storyMeta.filename, timestamp: Date.now() };
      localStorage.setItem(`story_progress_${storyMeta.filename}`, JSON.stringify(saveData));
    }
  }, [currentScene, storyMeta]);

  // Load saved progress on mount
  useEffect(() => {
    if (storyMeta?.filename) {
      const saved = localStorage.getItem(`story_progress_${storyMeta.filename}`);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data.currentScene > 0 && data.currentScene < totalScenes) {
            setCurrentScene(data.currentScene);
          }
        } catch (e) {}
      }
    }
  }, []);

  // Typewriter effect
  useEffect(() => {
    if (typingRef.current) clearTimeout(typingRef.current);
    if (!scene.dialog) return;
    setIsTyping(true);
    setDisplayedText('');
    setAskAnswer(null);
    setShowAskInput(false);
    setRetryCount(0);
    let i = 0;
    const tick = () => {
      i++;
      setDisplayedText(scene.dialog.slice(0, i));
      if (i < scene.dialog.length) {
        typingRef.current = setTimeout(tick, 22);
      } else {
        setIsTyping(false);
      }
    };
    typingRef.current = setTimeout(tick, 22);
    return () => clearTimeout(typingRef.current);
  }, [currentScene, scene.dialog]);

  // Map emosi
  useEffect(() => {
    const e = (scene.emosi || 'Neutral').toLowerCase();
    if (['joy', 'fun'].includes(e)) setEmosi('senang');
    else if (e === 'angry') setEmosi('marah');
    else if (e === 'sorrow') setEmosi('takut');
    else if (e === 'surprised') setEmosi('gugup');
    else setEmosi('idle');
  }, [currentScene, scene.emosi]);

  // Generate TTS for current scene
  useEffect(() => {
    if (!scene.dialog) return;
    
    // Jika sudah pre-generated, gunakan URL langsung
    if (scene.audio_url) {
      setAudioUrl(scene.audio_url);
      setAudioBase64(null);
      return;
    }
    
    const generateTTS = async () => {
      try {
        const res = await axios.post('http://localhost:8000/api/story/tts', {
          dialog: scene.dialog, emosi: scene.emosi || 'Neutral'
        });
        if (res.data.audio_base64) {
          setAudioBase64(res.data.audio_base64);
          setAudioUrl(null);
        }
      } catch (e) { console.error('TTS error:', e); }
    };
    generateTTS();
  }, [currentScene, scene.dialog, scene.audio_url]);

  const goNext = () => { if (currentScene < totalScenes - 1) setCurrentScene(c => c + 1); };
  const goPrev = () => { if (currentScene > 0) setCurrentScene(c => c - 1); };

  const skipTyping = () => {
    if (isTyping) {
      clearTimeout(typingRef.current);
      setDisplayedText(scene.dialog);
      setIsTyping(false);
    }
  };

  const handleAsk = async (overrideRetry = null, overrideText = null) => {
    const currentText = overrideText !== null ? overrideText : askText;
    const currentRetry = overrideRetry !== null ? overrideRetry : retryCount;

    if (!currentText.trim() || askLoading) return;
    setAskLoading(true);
    
    if (overrideText !== null) setAskText(overrideText);

    try {
      const res = await axios.post('http://localhost:8000/api/story/ask', {
        pertanyaan: currentText.trim(),
        konteks_scene: scene.dialog + '\n' + (scene.catatan || []).join('\n'),
        user_nama: userProfile.nama,
        retry_count: currentRetry,
      });
      setAskAnswer(res.data);
      if (res.data.status === 'anger_mode') {
        setEmosi('marah');
      } else {
        const e = (res.data.emosi || 'Neutral').toLowerCase();
        if (['joy', 'fun'].includes(e)) setEmosi('senang');
        else if (e === 'angry') setEmosi('marah');
        else if (e === 'sorrow') setEmosi('takut');
        else if (e === 'surprised') setEmosi('gugup');
        else setEmosi('idle');
      }
    } catch (e) {
      setAskAnswer({ dialog: 'G-gomen... ada error...', emosi: 'Sorrow' });
    } finally {
      setAskLoading(false);
    }
  };

  const handleClarityResponse = (clear) => {
    if (clear) {
      setAskAnswer(null);
      setShowAskInput(false);
      setAskText('');
      setRetryCount(0);
    } else {
      const nextRetry = retryCount + 1;
      setRetryCount(nextRetry);
      setAskAnswer(null);
      handleAsk(nextRetry, askText);
    }
  };

  const progressPercent = totalScenes > 1 ? ((currentScene) / (totalScenes - 1)) * 100 : 0;

  return (
    <>
      <div style={{
        width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative',
        background: '#1a0a2e', fontFamily: "'Segoe UI', sans-serif", cursor: 'default', userSelect: 'none',
      }} onClick={skipTyping}>

        {/* Background */}
        <img src="/bg-room.png" alt="bg" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7,
        }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />

        {/* Progress Bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', zIndex: 30, background: 'rgba(255,255,255,0.1)' }}>
          <div style={{ width: `${progressPercent}%`, height: '100%', background: 'linear-gradient(90deg, #f472b6, #e11d48)', transition: 'width 0.5s ease' }} />
        </div>

        {/* Top Bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)', zIndex: 20,
        }}>
          <button onClick={(e) => { e.stopPropagation(); onBack(); }} style={{
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
            color: 'white', padding: '5px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
          }}>← Menu</button>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: 600 }}>
              {scene.judul}
            </span>
            <span style={{
              background: 'rgba(244,114,182,0.2)', border: '1px solid rgba(244,114,182,0.4)',
              color: '#f9a8d4', padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
            }}>
              {currentScene + 1} / {totalScenes}
            </span>
            <button onClick={(e) => { e.stopPropagation(); setShowNotes(!showNotes); }} style={{
              background: showNotes ? 'rgba(244,114,182,0.3)' : 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '5px 10px',
              borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
            }}>📝</button>
          </div>
        </div>

        {/* Notes Panel */}
        {showNotes && scene.catatan && scene.catatan.length > 0 && (
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', top: '52px', right: '12px', width: '280px',
            background: 'rgba(15,5,30,0.92)', border: '1px solid rgba(244,114,182,0.3)',
            borderRadius: '16px', padding: '16px', zIndex: 30, color: 'white',
          }}>
            <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '10px', color: '#f9a8d4' }}>📝 Catatan Penting</div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', lineHeight: 1.8, color: 'rgba(255,255,255,0.8)' }}>
              {scene.catatan.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

        {/* Character Sprite */}
        <div style={{
          position: 'absolute', bottom: '160px', left: '50%',
          transform: showNotes ? 'translateX(-80%)' : 'translateX(-50%)',
          transition: 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
          height: '70vh', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 10, pointerEvents: 'none',
        }}>
          <BocchiAvatar 
            audioBase64={audioBase64} 
            audioUrl={audioUrl}
            emosi={emosi} 
            onFinishedPlaying={() => {
              setAudioBase64(null);
              setAudioUrl(null);
            }} 
          />
        </div>

        {/* Dialogue Box — same as App.jsx */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20 }}>
          {/* Name Tag */}
          <div style={{
            marginLeft: '40px', marginBottom: '-2px', display: 'inline-block',
            background: 'rgba(20, 5, 40, 0.92)', border: '1px solid rgba(244,114,182,0.5)',
            borderBottom: 'none', padding: '6px 22px 8px', borderRadius: '10px 10px 0 0',
            color: '#f9a8d4', fontWeight: 800, fontSize: '15px', letterSpacing: '1px',
          }}>Bocchi</div>

          {/* Dialog Area */}
          <div style={{
            background: 'rgba(10, 3, 25, 0.88)', borderTop: '1px solid rgba(244,114,182,0.4)',
            padding: '20px 40px 12px', minHeight: '120px', position: 'relative',
          }}>
            {/* Dialog text or Q&A answer */}
            <p style={{ color: 'white', fontSize: '16px', lineHeight: 1.8, margin: 0, minHeight: '56px', letterSpacing: '0.3px' }}>
              {askAnswer ? (
                <span>{askAnswer.dialog}</span>
              ) : (
                displayedText || <span style={{ color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>Loading...</span>
              )}
              {isTyping && <span style={{ animation: 'blink 0.8s infinite', color: '#f9a8d4' }}>▌</span>}
            </p>

            {/* Ask Answer — clarity buttons */}
            {askAnswer && !askLoading && askAnswer.status !== 'anger_mode' && (
              <div onClick={e => e.stopPropagation()} style={{
                display: 'flex', gap: '10px', marginTop: '12px',
                borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px',
              }}>
                <button onClick={() => handleClarityResponse(true)} style={{
                  flex: 1, padding: '10px', borderRadius: '12px', border: 'none',
                  background: '#22c55e', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                }}>✅ Sudah Jelas</button>
                <button onClick={() => handleClarityResponse(false)} style={{
                  flex: 1, padding: '10px', borderRadius: '12px', border: 'none',
                  background: '#ef4444', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                }}>❌ Belum Jelas</button>
              </div>
            )}

            {/* Anger Mode - Analogy Input */}
            {askAnswer && !askLoading && askAnswer.status === 'anger_mode' && (
              <div onClick={e => e.stopPropagation()} style={{
                display: 'flex', gap: '10px', marginTop: '12px',
                borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px',
              }}>
                <input autoFocus type="text"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      const analogy = e.target.value.trim();
                      const newText = askText + " (Tolong jelaskan pakai analogi: " + analogy + ")";
                      setRetryCount(0);
                      setAskAnswer(null);
                      handleAsk(0, newText);
                    }
                  }}
                  placeholder="Ketik analogi yang kamu inginkan (misal: game RPG, masak, dll) lalu tekan Enter..."
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(239,68,68,0.5)',
                    borderRadius: '12px', padding: '10px 16px', color: 'white', fontSize: '14px', outline: 'none',
                  }}
                />
              </div>
            )}

            {/* Ask Input */}
            {showAskInput && !askAnswer && (
              <div onClick={e => e.stopPropagation()} style={{
                display: 'flex', gap: '10px', marginTop: '12px',
                borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px',
              }}>
                <input autoFocus type="text" value={askText}
                  onChange={e => setAskText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAsk()}
                  placeholder="Tanya Bocchi tentang materi ini..."
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(244,114,182,0.4)',
                    borderRadius: '12px', padding: '10px 16px', color: 'white', fontSize: '14px', outline: 'none',
                  }}
                />
                <button onClick={() => handleAsk()} disabled={!askText.trim() || askLoading} style={{
                  background: askText.trim() ? '#e11d48' : 'rgba(255,255,255,0.1)',
                  color: 'white', border: 'none', borderRadius: '12px', padding: '10px 18px',
                  fontWeight: 700, fontSize: '14px', cursor: askText.trim() ? 'pointer' : 'not-allowed',
                }}>{askLoading ? '...' : 'Tanya'}</button>
              </div>
            )}

            {/* Navigation buttons */}
            {!isTyping && !showAskInput && !askAnswer && (
              <div style={{
                display: 'flex', gap: '10px', marginTop: '14px',
                borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px',
              }} onClick={e => e.stopPropagation()}>
                <button onClick={goPrev} disabled={currentScene === 0} style={{
                  flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)',
                  background: currentScene > 0 ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: currentScene > 0 ? 'white' : 'rgba(255,255,255,0.2)', fontWeight: 700, fontSize: '13px',
                  cursor: currentScene > 0 ? 'pointer' : 'not-allowed',
                }}>◀ Prev</button>
                <button onClick={() => { setShowAskInput(true); }} style={{
                  flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid rgba(244,114,182,0.3)',
                  background: 'rgba(244,114,182,0.15)', color: '#f9a8d4', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                }}>❓ Tanya</button>
                <button onClick={goNext} disabled={currentScene >= totalScenes - 1} style={{
                  flex: 1, padding: '10px', borderRadius: '12px', border: 'none',
                  background: currentScene < totalScenes - 1 ? '#e11d48' : 'rgba(255,255,255,0.05)',
                  color: currentScene < totalScenes - 1 ? 'white' : 'rgba(255,255,255,0.2)', fontWeight: 700, fontSize: '13px',
                  cursor: currentScene < totalScenes - 1 ? 'pointer' : 'not-allowed',
                }}>Next ▶</button>
              </div>
            )}
          </div>

          {/* Bottom Bar */}
          <div style={{
            background: 'rgba(5, 1, 15, 0.95)', borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', justifyContent: 'center', gap: '2px', padding: '6px 0',
          }}>
            {['AUTO', 'NOTES', 'SCENE', 'QUIT'].map(label => (
              <button key={label} onClick={(e) => {
                e.stopPropagation();
                if (label === 'QUIT') onBack();
                if (label === 'NOTES') setShowNotes(n => !n);
              }} style={{
                background: 'none', border: 'none',
                color: label === 'QUIT' ? '#f87171' : 'rgba(255,255,255,0.55)',
                fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', padding: '4px 18px', cursor: 'pointer',
                borderRight: label !== 'QUIT' ? '1px solid rgba(255,255,255,0.1)' : 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#f9a8d4'}
              onMouseLeave={e => e.currentTarget.style.color = label === 'QUIT' ? '#f87171' : 'rgba(255,255,255,0.55)'}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0 } }
      `}</style>
    </>
  );
}
