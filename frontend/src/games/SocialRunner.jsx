import { useState, useEffect, useRef, useCallback } from 'react';
import SFX from './SoundFX';

const GAME_W = 480;
const GAME_H = 280;
const GROUND_Y = GAME_H - 50;
const PLAYER_SIZE = 36;
const GRAVITY = 0.6;
const JUMP_FORCE = -11;
const HIGH_JUMP_FORCE = -14;

const OBSTACLES = ['👥', '🎤', '📱', '🤝', '💬', '🏫'];
const COLLECTIBLES = ['🎸', '📦'];

export default function SocialRunner({ onScore }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const playerRef = useRef({ x: 60, y: GROUND_Y - PLAYER_SIZE, vy: 0, onGround: true, shielded: false });
  const entitiesRef = useRef([]);
  const scoreRef = useRef(0);
  const speedRef = useRef(3);
  const lastSpawnRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const groundOffsetRef = useRef(0);
  const bgOffsetRef = useRef(0);
  const flashRef = useRef(null); // { type: 'hit'|'collect', timer: 0 }
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState(''); // 'shield', 'hit', etc
  const [bocchiEmoji, setBocchiEmoji] = useState('🏃‍♀️');
  const jumpPressedRef = useRef(false);
  const gameOverRef = useRef(false);
  const livesRef = useRef(3);
  const [lives, setLives] = useState(3);

  const jump = useCallback(() => {
    const p = playerRef.current;
    if (gameOverRef.current) return;
    if (p.onGround) {
      p.vy = JUMP_FORCE;
      p.onGround = false;
      SFX.jump();
      setBocchiEmoji('🦘');
    }
  }, []);

  // Keyboard + touch
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space' || e.key === 'ArrowUp') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [jump]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = (timestamp) => {
      if (gameOverRef.current) {
        frameRef.current = requestAnimationFrame(loop);
        return;
      }

      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      speedRef.current = 3 + elapsed * 0.04;
      const speed = speedRef.current;

      // Spawn entities
      const spawnInterval = Math.max(800, 2000 - elapsed * 8);
      if (timestamp - lastSpawnRef.current > spawnInterval) {
        const isCollectible = Math.random() < 0.25;
        if (isCollectible) {
          const emoji = COLLECTIBLES[Math.floor(Math.random() * COLLECTIBLES.length)];
          const floatY = GROUND_Y - PLAYER_SIZE - 30 - Math.random() * 40;
          entitiesRef.current.push({
            type: 'collectible', emoji, x: GAME_W + 30, y: floatY,
            w: 28, h: 28, collected: false,
          });
        } else {
          const emoji = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
          entitiesRef.current.push({
            type: 'obstacle', emoji, x: GAME_W + 30, y: GROUND_Y - 34,
            w: 30, h: 34, hit: false,
          });
        }
        lastSpawnRef.current = timestamp;
      }

      // Update player
      const p = playerRef.current;
      p.vy += GRAVITY;
      p.y += p.vy;
      if (p.y >= GROUND_Y - PLAYER_SIZE) {
        p.y = GROUND_Y - PLAYER_SIZE;
        p.vy = 0;
        p.onGround = true;
        if (bocchiEmoji === '🦘') setBocchiEmoji(p.shielded ? '📦' : '🏃‍♀️');
      }

      // Update entities
      entitiesRef.current.forEach(ent => {
        ent.x -= speed;

        // Collision
        if (ent.x < p.x + PLAYER_SIZE && ent.x + ent.w > p.x &&
            ent.y < p.y + PLAYER_SIZE && ent.y + ent.h > p.y) {

          if (ent.type === 'collectible' && !ent.collected) {
            ent.collected = true;
            if (ent.emoji === '📦') {
              p.shielded = true;
              setStatus('shield');
              setBocchiEmoji('📦');
              SFX.shield();
              setTimeout(() => {
                p.shielded = false;
                setStatus('');
                setBocchiEmoji('🏃‍♀️');
              }, 5000);
            } else {
              SFX.collect();
            }
            scoreRef.current += 50;
            flashRef.current = { type: 'collect', timer: 15 };
          } else if (ent.type === 'obstacle' && !ent.hit) {
            ent.hit = true;
            if (p.shielded) {
              p.shielded = false;
              setStatus('');
              setBocchiEmoji('🏃‍♀️');
              SFX.collect();
              flashRef.current = { type: 'shield_break', timer: 10 };
            } else {
              SFX.crash();
              setBocchiEmoji('😱');
              livesRef.current -= 1;
              setLives(livesRef.current);
              flashRef.current = { type: 'hit', timer: 15 };
              setTimeout(() => setBocchiEmoji('🏃‍♀️'), 600);
              if (livesRef.current <= 0) {
                gameOverRef.current = true;
                setTimeout(() => {
                  // Auto restart
                  gameOverRef.current = false;
                  livesRef.current = 3;
                  setLives(3);
                  entitiesRef.current = [];
                  startTimeRef.current = Date.now();
                  speedRef.current = 3;
                  setBocchiEmoji('🏃‍♀️');
                }, 2000);
              }
            }
          }
        }

        // Score for passing obstacles
        if (ent.type === 'obstacle' && !ent.hit && ent.x + ent.w < p.x && !ent.scored) {
          ent.scored = true;
          scoreRef.current += 10;
        }
      });

      // Clean off-screen
      entitiesRef.current = entitiesRef.current.filter(e => e.x > -60);

      setScore(scoreRef.current);
      if (onScore) onScore(scoreRef.current);

      // Flash decay
      if (flashRef.current) {
        flashRef.current.timer -= 1;
        if (flashRef.current.timer <= 0) flashRef.current = null;
      }

      // Scroll offsets
      groundOffsetRef.current = (groundOffsetRef.current + speed) % 40;
      bgOffsetRef.current = (bgOffsetRef.current + speed * 0.3) % 200;

      // === DRAW ===
      ctx.clearRect(0, 0, GAME_W, GAME_H);

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, GAME_H);
      skyGrad.addColorStop(0, '#0f0520');
      skyGrad.addColorStop(0.7, '#1a0a30');
      skyGrad.addColorStop(1, '#2d1050');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, GAME_W, GAME_H);

      // Background buildings (parallax)
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let i = 0; i < 8; i++) {
        const bx = ((i * 70 - bgOffsetRef.current) % (GAME_W + 100)) + 50;
        const bh = 40 + (i * 37) % 60;
        ctx.fillRect(bx, GROUND_Y - bh, 35, bh);
      }

      // Stars
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      for (let i = 0; i < 15; i++) {
        const sx = (i * 41 + bgOffsetRef.current * 0.5) % GAME_W;
        const sy = (i * 23) % (GROUND_Y - 30);
        ctx.fillRect(sx, sy, 2, 2);
      }

      // Ground
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, GROUND_Y, GAME_W, 2);

      // Ground pattern
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let i = 0; i < GAME_W / 40 + 2; i++) {
        const gx = i * 40 - groundOffsetRef.current;
        ctx.beginPath();
        ctx.moveTo(gx, GROUND_Y + 8);
        ctx.lineTo(gx + 20, GROUND_Y + 20);
        ctx.stroke();
      }

      // Flash effect
      if (flashRef.current) {
        const f = flashRef.current;
        ctx.fillStyle = f.type === 'hit' ? `rgba(239,68,68,${f.timer * 0.02})`
          : f.type === 'collect' ? `rgba(74,222,128,${f.timer * 0.015})`
          : `rgba(168,85,247,${f.timer * 0.015})`;
        ctx.fillRect(0, 0, GAME_W, GAME_H);
      }

      // Draw entities
      ctx.font = '28px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      entitiesRef.current.forEach(ent => {
        if (ent.collected) return;
        if (ent.hit && ent.type === 'obstacle') return;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(ent.x + ent.w / 2, GROUND_Y + 4, ent.w / 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillText(ent.emoji, ent.x + ent.w / 2, ent.y + ent.h / 2);
      });

      // Draw player
      const playerCenterX = p.x + PLAYER_SIZE / 2;
      const playerCenterY = p.y + PLAYER_SIZE / 2;

      // Player shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(playerCenterX, GROUND_Y + 4, PLAYER_SIZE / 2, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Shield glow
      if (p.shielded) {
        ctx.strokeStyle = 'rgba(168,85,247,0.4)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(playerCenterX, playerCenterY, PLAYER_SIZE / 2 + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.font = '32px serif';
      ctx.fillText(bocchiEmoji, playerCenterX, playerCenterY);

      // Game over overlay
      if (gameOverRef.current) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);
        ctx.font = 'bold 24px "Segoe UI", sans-serif';
        ctx.fillStyle = '#f472b6';
        ctx.textAlign = 'center';
        ctx.fillText('😱 Bocchi pingsan!', GAME_W / 2, GAME_H / 2 - 10);
        ctx.font = '13px "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('Auto restart...', GAME_W / 2, GAME_H / 2 + 20);
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [onScore, jump, bocchiEmoji]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      {/* Score bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', width: GAME_W, fontSize: '13px',
      }}>
        <span style={{ color: '#f9a8d4' }}>😰 Score: <b>{score}</b></span>
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>
          {'❤️'.repeat(lives)}{'🖤'.repeat(3 - lives)}
        </span>
        <span style={{ color: status === 'shield' ? '#a78bfa' : 'rgba(255,255,255,0.3)', fontWeight: status === 'shield' ? 700 : 400 }}>
          {status === 'shield' ? '📦 Shield!' : `Speed: ${speedRef.current.toFixed(1)}x`}
        </span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={GAME_W}
        height={GAME_H}
        onClick={jump}
        onTouchStart={(e) => { e.preventDefault(); jump(); }}
        style={{
          borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)',
          cursor: 'pointer',
        }}
      />

      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: 0 }}>
        Tekan <b>Space</b> atau klik untuk lompat — hindari interaksi sosial! 😱
      </p>
    </div>
  );
}
