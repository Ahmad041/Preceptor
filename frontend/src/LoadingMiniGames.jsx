import { useState, useEffect, useRef } from 'react';
import GuitarTap from './games/GuitarTap';
import MemoryCard from './games/MemoryCard';
import SocialRunner from './games/SocialRunner';
import SFX from './games/SoundFX';

const GAMES = [
  { id: 'guitar', label: '🎸 Guitar Tap', icon: '🎸' },
  { id: 'memory', label: '🃏 Memory', icon: '🃏' },
  { id: 'runner', label: '😰 Runner', icon: '😰' },
];

export default function LoadingMiniGames({ progress, useAudio }) {
  const [currentGame, setCurrentGame] = useState(() => GAMES[Math.floor(Math.random() * 3)].id);
  const [totalScore, setTotalScore] = useState(0);
  const [gameScores, setGameScores] = useState({ guitar: 0, memory: 0, runner: 0 });
  const [musicPlaying, setMusicPlaying] = useState(false);
  const videoRef = useRef(null);

  // Background music from user's MP4 files
  useEffect(() => {
    const musicFiles = [
      '/Music/一秒の永遠.mp4',
      '/Music/Petals_on_the_Sill.mp4',
      '/Music/離さないこの手.mp4',
    ];
    const randomTrack = musicFiles[Math.floor(Math.random() * musicFiles.length)];

    const video = document.createElement('video');
    video.src = randomTrack;
    video.volume = 0.3;
    video.loop = true;
    video.muted = false;
    videoRef.current = video;

    // Auto-play after user interaction (browsers require it)
    const tryPlay = () => {
      video.play().then(() => setMusicPlaying(true)).catch(() => {});
    };
    tryPlay();

    // Also try on next user interaction
    const onClick = () => { tryPlay(); window.removeEventListener('click', onClick); };
    window.addEventListener('click', onClick);

    return () => {
      video.pause();
      video.src = '';
      window.removeEventListener('click', onClick);
    };
  }, []);

  const handleScoreUpdate = (gameId, newScore) => {
    setGameScores(prev => {
      const updated = { ...prev, [gameId]: newScore };
      const total = updated.guitar + updated.memory + updated.runner;
      setTotalScore(total);
      return updated;
    });
  };

  const switchGame = (gameId) => {
    if (gameId !== currentGame) {
      SFX.gameSwitch();
      setCurrentGame(gameId);
    }
  };

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#0f0520',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      fontFamily: "'Segoe UI', sans-serif",
      overflow: 'hidden',
    }}>
      {/* Background */}
      <img src="/bg-room.png" alt="bg" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', opacity: 0.15, pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', width: '100%',
        maxWidth: '560px', padding: '16px 20px',
        height: '100vh', boxSizing: 'border-box',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          width: '100%', marginBottom: '8px',
        }}>
          <div>
            <div style={{ color: '#f9a8d4', fontSize: '14px', fontWeight: 700 }}>
              ⏳ Generating Story...
            </div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '2px' }}>
              {progress}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#facc15', fontSize: '18px', fontWeight: 800 }}>
              ⭐ {totalScore}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px' }}>
              Total Score
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          width: '100%', height: '3px', background: 'rgba(255,255,255,0.08)',
          borderRadius: '2px', marginBottom: '12px', overflow: 'hidden',
        }}>
          <div style={{
            width: '40%', height: '100%',
            background: 'linear-gradient(90deg, #f472b6, #e11d48, #f472b6)',
            borderRadius: '2px',
            animation: 'loadSlide 1.5s ease-in-out infinite',
          }} />
        </div>

        {/* Audio mode badge */}
        <div style={{
          display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px',
        }}>
          {!useAudio && (
            <span style={{
              padding: '3px 10px', borderRadius: '6px', fontSize: '10px',
              background: 'rgba(255,255,255,0.06)', color: '#fda4af',
            }}>
              🔇 Tanpa audio
            </span>
          )}
          <span style={{
            padding: '3px 10px', borderRadius: '6px', fontSize: '10px',
            background: 'rgba(255,255,255,0.06)',
            color: musicPlaying ? '#4ade80' : 'rgba(255,255,255,0.3)',
          }}>
            {musicPlaying ? '🎵 Music playing' : '🔇 Click to play music'}
          </span>
        </div>

        {/* Game Selector Tabs */}
        <div style={{
          display: 'flex', gap: '6px', marginBottom: '12px',
        }}>
          {GAMES.map(g => (
            <button
              key={g.id}
              onClick={() => switchGame(g.id)}
              style={{
                padding: '8px 16px', borderRadius: '12px', border: 'none',
                background: currentGame === g.id
                  ? 'linear-gradient(135deg, #e11d48, #7c3aed)'
                  : 'rgba(255,255,255,0.06)',
                color: currentGame === g.id ? '#fff' : 'rgba(255,255,255,0.5)',
                fontWeight: 700, fontSize: '12px',
                cursor: 'pointer', transition: 'all 0.3s',
                fontFamily: "'Segoe UI', sans-serif",
                transform: currentGame === g.id ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              {g.label}
              {gameScores[g.id] > 0 && (
                <span style={{
                  marginLeft: '6px', fontSize: '10px',
                  opacity: 0.7,
                }}>
                  ({gameScores[g.id]})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Game Area */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', minHeight: 0,
        }}>
          {currentGame === 'guitar' && (
            <GuitarTap onScore={(s) => handleScoreUpdate('guitar', s)} />
          )}
          {currentGame === 'memory' && (
            <MemoryCard onScore={(s) => handleScoreUpdate('memory', s)} />
          )}
          {currentGame === 'runner' && (
            <SocialRunner onScore={(s) => handleScoreUpdate('runner', s)} />
          )}
        </div>

        {/* Footer tip */}
        <div style={{
          color: 'rgba(255,255,255,0.2)', fontSize: '10px', textAlign: 'center',
          paddingBottom: '8px',
        }}>
          Mainkan mini-games sambil menunggu! Story akan muncul otomatis saat selesai 🎮
        </div>
      </div>

      <style>{`
        @keyframes loadSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}
