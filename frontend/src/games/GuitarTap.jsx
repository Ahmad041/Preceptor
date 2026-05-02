import { useState, useEffect, useRef, useCallback } from 'react';
import SFX from './SoundFX';

const LANES = [
  { key: 'd', color: '#f472b6', label: 'D' },
  { key: 'f', color: '#e11d48', label: 'F' },
  { key: 'j', color: '#a855f7', label: 'J' },
  { key: 'k', color: '#6366f1', label: 'K' },
];

const GAME_W = 360;
const GAME_H = 460;
const LANE_W = GAME_W / 4;
const NOTE_R = 18;
const HIT_Y = GAME_H - 60;
const PERFECT_RANGE = 25;
const GOOD_RANGE = 50;

export default function GuitarTap({ onScore }) {
  const canvasRef = useRef(null);
  const notesRef = useRef([]);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const feedbackRef = useRef([]); // { text, x, y, opacity, color }
  const frameRef = useRef(null);
  const lastSpawnRef = useRef(0);
  const speedRef = useRef(2.5);
  const startTimeRef = useRef(Date.now());
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lastHit, setLastHit] = useState('');
  const laneFlashRef = useRef([0, 0, 0, 0]);

  const spawnNote = useCallback(() => {
    const lane = Math.floor(Math.random() * 4);
    notesRef.current.push({ lane, y: -NOTE_R, hit: false, missed: false });
  }, []);

  const handleHit = useCallback((laneIdx) => {
    laneFlashRef.current[laneIdx] = 1;
    const notes = notesRef.current;
    let bestNote = null;
    let bestDist = Infinity;

    for (const note of notes) {
      if (note.lane === laneIdx && !note.hit && !note.missed) {
        const dist = Math.abs(note.y - HIT_Y);
        if (dist < bestDist) {
          bestDist = dist;
          bestNote = note;
        }
      }
    }

    const x = laneIdx * LANE_W + LANE_W / 2;

    if (bestNote && bestDist <= GOOD_RANGE) {
      bestNote.hit = true;
      let pts, label, color;
      if (bestDist <= PERFECT_RANGE) {
        pts = 100;
        label = 'PERFECT!';
        color = '#facc15';
        SFX.hitPerfect();
      } else {
        pts = 50;
        label = 'GOOD';
        color = '#4ade80';
        SFX.hitGood();
      }
      comboRef.current += 1;
      if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current;
      const mult = comboRef.current >= 10 ? 3 : comboRef.current >= 5 ? 2 : 1;
      const finalPts = pts * mult;
      scoreRef.current += finalPts;
      setScore(scoreRef.current);
      setCombo(comboRef.current);
      setLastHit(label);
      if (comboRef.current === 5 || comboRef.current === 10 || comboRef.current === 20) {
        SFX.combo();
      }
      feedbackRef.current.push({ text: `+${finalPts}`, x, y: HIT_Y - 20, opacity: 1, color });
    } else {
      // Miss
      comboRef.current = 0;
      setCombo(0);
      setLastHit('MISS');
      SFX.miss();
      feedbackRef.current.push({ text: 'MISS', x, y: HIT_Y - 20, opacity: 1, color: '#ef4444' });
    }
    if (onScore) onScore(scoreRef.current);
  }, [onScore]);

  // Keyboard listener
  useEffect(() => {
    const onKey = (e) => {
      const idx = LANES.findIndex(l => l.key === e.key.toLowerCase());
      if (idx !== -1) {
        e.preventDefault();
        handleHit(idx);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleHit]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = (timestamp) => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      speedRef.current = 2.5 + elapsed * 0.02; // Gradually speed up

      // Spawn notes
      const spawnInterval = Math.max(500, 1200 - elapsed * 5);
      if (timestamp - lastSpawnRef.current > spawnInterval) {
        spawnNote();
        lastSpawnRef.current = timestamp;
      }

      // Update notes
      notesRef.current.forEach(note => {
        if (!note.hit) {
          note.y += speedRef.current;
          if (note.y > GAME_H + NOTE_R && !note.missed) {
            note.missed = true;
            comboRef.current = 0;
            setCombo(0);
          }
        }
      });
      // Clean old notes
      notesRef.current = notesRef.current.filter(n => !(n.hit || (n.missed && n.y > GAME_H + 50)));

      // Update feedbacks
      feedbackRef.current.forEach(f => {
        f.y -= 1.5;
        f.opacity -= 0.025;
      });
      feedbackRef.current = feedbackRef.current.filter(f => f.opacity > 0);

      // Lane flash decay
      laneFlashRef.current = laneFlashRef.current.map(v => Math.max(0, v - 0.05));

      // === DRAW ===
      ctx.clearRect(0, 0, GAME_W, GAME_H);

      // Background
      ctx.fillStyle = 'rgba(15, 5, 30, 0.95)';
      ctx.fillRect(0, 0, GAME_W, GAME_H);

      // Lane lines + flash
      LANES.forEach((lane, i) => {
        const x = i * LANE_W;
        const flash = laneFlashRef.current[i];

        // Lane flash glow
        if (flash > 0) {
          ctx.fillStyle = `rgba(${lane.color === '#f472b6' ? '244,114,182' : lane.color === '#e11d48' ? '225,29,72' : lane.color === '#a855f7' ? '168,85,247' : '99,102,241'}, ${flash * 0.15})`;
          ctx.fillRect(x, 0, LANE_W, GAME_H);
        }

        // Lane dividers
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + LANE_W, 0);
        ctx.lineTo(x + LANE_W, GAME_H);
        ctx.stroke();
      });

      // Hit zone line
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(0, HIT_Y);
      ctx.lineTo(GAME_W, HIT_Y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Hit zone buttons
      LANES.forEach((lane, i) => {
        const cx = i * LANE_W + LANE_W / 2;
        const flash = laneFlashRef.current[i];
        const r = 22 + flash * 8;

        // Glow
        if (flash > 0) {
          ctx.shadowColor = lane.color;
          ctx.shadowBlur = 20 * flash;
        }
        ctx.beginPath();
        ctx.arc(cx, HIT_Y, r, 0, Math.PI * 2);
        ctx.fillStyle = flash > 0.3 ? lane.color : 'rgba(255,255,255,0.1)';
        ctx.fill();
        ctx.strokeStyle = lane.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Key label
        ctx.fillStyle = flash > 0.3 ? '#fff' : 'rgba(255,255,255,0.5)';
        ctx.font = 'bold 14px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lane.label, cx, HIT_Y);
      });

      // Draw notes
      notesRef.current.forEach(note => {
        if (note.hit) return;
        const lane = LANES[note.lane];
        const cx = note.lane * LANE_W + LANE_W / 2;

        // Note glow
        ctx.shadowColor = lane.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(cx, note.y, NOTE_R, 0, Math.PI * 2);
        ctx.fillStyle = lane.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Inner highlight
        ctx.beginPath();
        ctx.arc(cx, note.y - 4, NOTE_R * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
      });

      // Draw feedbacks
      feedbackRef.current.forEach(f => {
        ctx.globalAlpha = f.opacity;
        ctx.font = 'bold 16px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      });
      ctx.globalAlpha = 1;

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [spawnNote]);

  const multiplier = combo >= 10 ? '3x' : combo >= 5 ? '2x' : '1x';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      {/* Score bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', width: GAME_W, fontSize: '13px',
      }}>
        <span style={{ color: '#f9a8d4' }}>🎵 Score: <b>{score}</b></span>
        <span style={{
          color: combo >= 10 ? '#facc15' : combo >= 5 ? '#4ade80' : 'rgba(255,255,255,0.5)',
          fontWeight: 700, transition: 'color 0.3s',
        }}>
          {combo > 0 ? `🔥 ${combo} Combo (${multiplier})` : ''}
        </span>
        <span style={{ color: lastHit === 'MISS' ? '#ef4444' : lastHit === 'PERFECT!' ? '#facc15' : '#4ade80', fontWeight: 700, fontSize: '12px' }}>
          {lastHit}
        </span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={GAME_W}
        height={GAME_H}
        style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}
      />

      {/* Click buttons for mobile/non-keyboard */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {LANES.map((lane, i) => (
          <button
            key={lane.key}
            onMouseDown={() => handleHit(i)}
            onTouchStart={(e) => { e.preventDefault(); handleHit(i); }}
            style={{
              width: '60px', height: '44px', borderRadius: '12px',
              border: `2px solid ${lane.color}`, background: 'rgba(255,255,255,0.05)',
              color: lane.color, fontWeight: 800, fontSize: '16px',
              cursor: 'pointer', transition: 'all 0.1s',
              fontFamily: "'Segoe UI', sans-serif",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = lane.color; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = lane.color; }}
          >
            {lane.label}
          </button>
        ))}
      </div>

      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: 0 }}>
        Tekan <b>D F J K</b> atau klik tombol saat note sampai garis
      </p>
    </div>
  );
}
