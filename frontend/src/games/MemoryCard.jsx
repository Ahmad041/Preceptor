import { useState, useEffect, useCallback, useRef } from 'react';
import SFX from './SoundFX';

const EMOJIS = ['😊', '😢', '😠', '😨', '😐', '🤩'];
const EMOJI_LABELS = ['Joy', 'Sorrow', 'Angry', 'Fear', 'Neutral', 'Surprise'];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createDeck() {
  const pairs = EMOJIS.flatMap((e, i) => [
    { id: i * 2, emoji: e, label: EMOJI_LABELS[i], pairId: i },
    { id: i * 2 + 1, emoji: e, label: EMOJI_LABELS[i], pairId: i },
  ]);
  return shuffle(pairs);
}

export default function MemoryCard({ onScore }) {
  const [cards, setCards] = useState(() => createDeck());
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState(new Set());
  const [moves, setMoves] = useState(0);
  const [score, setScore] = useState(0);
  const [particles, setParticles] = useState([]);
  const [shakeCard, setShakeCard] = useState(null);
  const lockRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const roundRef = useRef(0);

  const handleFlip = useCallback((index) => {
    if (lockRef.current) return;
    if (flipped.includes(index)) return;
    if (matched.has(cards[index].pairId)) return;

    SFX.cardFlip();
    const newFlipped = [...flipped, index];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      lockRef.current = true;
      setMoves(m => m + 1);

      const [a, b] = newFlipped;
      if (cards[a].pairId === cards[b].pairId) {
        // Match!
        setTimeout(() => {
          SFX.cardMatch();
          const newMatched = new Set(matched);
          newMatched.add(cards[a].pairId);
          setMatched(newMatched);
          setFlipped([]);

          const pts = 150;
          setScore(prev => {
            const ns = prev + pts;
            if (onScore) onScore(ns);
            return ns;
          });

          // Particle burst at both card positions
          const aEl = document.getElementById(`memcard-${a}`);
          const bEl = document.getElementById(`memcard-${b}`);
          const newParticles = [];
          [aEl, bEl].forEach(el => {
            if (el) {
              const rect = el.getBoundingClientRect();
              const parent = el.closest('[data-game-area]')?.getBoundingClientRect() || { left: 0, top: 0 };
              for (let i = 0; i < 6; i++) {
                newParticles.push({
                  id: Math.random(),
                  x: rect.left - parent.left + rect.width / 2,
                  y: rect.top - parent.top + rect.height / 2,
                  dx: (Math.random() - 0.5) * 4,
                  dy: (Math.random() - 0.5) * 4,
                  emoji: cards[a].emoji,
                  life: 1,
                });
              }
            }
          });
          setParticles(prev => [...prev, ...newParticles]);

          // Check if all matched → reset for new round
          if (newMatched.size === EMOJIS.length) {
            setTimeout(() => {
              const elapsed = (Date.now() - startTimeRef.current) / 1000;
              let timeBonus = 0;
              if (elapsed < 30) timeBonus = 500;
              else if (elapsed < 45) timeBonus = 250;
              if (timeBonus > 0) {
                setScore(prev => {
                  const ns = prev + timeBonus;
                  if (onScore) onScore(ns);
                  return ns;
                });
              }
              roundRef.current += 1;
              startTimeRef.current = Date.now();
              setCards(createDeck());
              setMatched(new Set());
              setMoves(0);
            }, 1000);
          }

          lockRef.current = false;
        }, 400);
      } else {
        // No match
        setTimeout(() => {
          SFX.cardWrong();
          setShakeCard(a);
          setTimeout(() => setShakeCard(b), 50);
          setTimeout(() => {
            setShakeCard(null);
            setFlipped([]);
            lockRef.current = false;
          }, 500);
        }, 600);
      }
    }
  }, [flipped, matched, cards, onScore]);

  // Particle animation
  useEffect(() => {
    if (particles.length === 0) return;
    const timer = setInterval(() => {
      setParticles(prev => {
        const next = prev.map(p => ({
          ...p,
          x: p.x + p.dx,
          y: p.y + p.dy,
          life: p.life - 0.04,
        })).filter(p => p.life > 0);
        return next;
      });
    }, 30);
    return () => clearInterval(timer);
  }, [particles.length > 0]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      {/* Score bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', width: '340px', fontSize: '13px',
      }}>
        <span style={{ color: '#f9a8d4' }}>🃏 Score: <b>{score}</b></span>
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>Moves: {moves}</span>
        <span style={{ color: '#a78bfa' }}>Round {roundRef.current + 1}</span>
      </div>

      {/* Card Grid */}
      <div
        data-game-area
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '10px', position: 'relative', padding: '8px',
        }}
      >
        {cards.map((card, i) => {
          const isFlipped = flipped.includes(i) || matched.has(card.pairId);
          const isMatched = matched.has(card.pairId);
          const isShaking = shakeCard === i;

          return (
            <div
              key={`${roundRef.current}-${card.id}-${i}`}
              id={`memcard-${i}`}
              onClick={() => handleFlip(i)}
              style={{
                width: '72px', height: '88px', borderRadius: '14px',
                perspective: '600px', cursor: 'pointer',
                animation: isShaking ? 'memShake 0.3s ease' : undefined,
              }}
            >
              <div style={{
                width: '100%', height: '100%', position: 'relative',
                transformStyle: 'preserve-3d',
                transition: 'transform 0.4s ease',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              }}>
                {/* Card Back */}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '14px',
                  backfaceVisibility: 'hidden',
                  background: 'linear-gradient(135deg, #7c3aed, #e11d48)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid rgba(255,255,255,0.15)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}>
                  <span style={{ fontSize: '28px', opacity: 0.8 }}>🎸</span>
                </div>

                {/* Card Front */}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '14px',
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                  background: isMatched
                    ? 'linear-gradient(135deg, #065f46, #047857)'
                    : 'linear-gradient(135deg, #1e1b4b, #312e81)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${isMatched ? '#34d399' : 'rgba(255,255,255,0.2)'}`,
                  boxShadow: isMatched ? '0 0 15px rgba(52,211,153,0.4)' : '0 4px 12px rgba(0,0,0,0.3)',
                }}>
                  <span style={{ fontSize: '32px' }}>{card.emoji}</span>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
                    {card.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Particles */}
        {particles.map(p => (
          <div key={p.id} style={{
            position: 'absolute',
            left: p.x, top: p.y,
            fontSize: '16px',
            opacity: p.life,
            pointerEvents: 'none',
            transform: `scale(${p.life})`,
            transition: 'none',
          }}>
            {p.emoji}
          </div>
        ))}
      </div>

      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: 0 }}>
        Cocokkan pasangan emosi Bocchi! Auto-reset setelah semua match ✨
      </p>

      <style>{`
        @keyframes memShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          50% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
        }
      `}</style>
    </div>
  );
}
