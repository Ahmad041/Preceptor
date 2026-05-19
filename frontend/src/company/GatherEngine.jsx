import React, { useRef, useEffect, useState, useCallback } from 'react';
import './GatherEngine.css';

// ─── ASSETS ─────────────────────────────────────────
const MAP_SOURCES = {
  1: '/office/floor1.png',
  2: '/office/floor2.png',
  3: '/office/rooftop.png',
};

const USER_SPRITES = {
  front: '/office/user_front-removebg-preview.png',
  back: '/office/user_backpng-removebg-preview.png',
  left: '/office/user_left-removebg-preview.png',
  right: '/office/user_rightpng-removebg-preview.png',
};

const AVATARS_IMG = '/office/avatars.png';

// ─── AGENT NPC CONFIGURATION ─────────────────────────
// Positions are in PIXEL coordinates on the map image
// Floor1=580x1024, Floor2=480x1024, Rooftop=476x1024
const AGENT_POSITIONS = {
  1: [
    { id: 'lead', x: 280, y: 340, label: 'Meeting Room', room: 'Meeting Room' },
    { id: 'soft', x: 130, y: 680, label: 'Music Studio', room: 'Studio Musik' },
    { id: 'content', x: 400, y: 280, label: 'Kitchen', room: 'Dapur' },
    { id: 'scout', x: 350, y: 550, label: 'Lobby', room: 'Lobby' },
  ],
  2: [
    { id: 'docs', x: 140, y: 300, label: 'Kamar 1', room: 'Kamar 1' },
    { id: 'analyst', x: 240, y: 500, label: 'Kamar 3', room: 'Kamar 3' },
    { id: 'mon', x: 360, y: 300, label: 'Kamar R', room: 'Kamar R' },
  ],
  3: [
    // Rooftop — no fixed agents, hangout area
  ],
};

const AGENT_SPRITE_INDEX = {
  lead: 0,
  soft: 1,
  docs: 2,
  mon: 3,
  scout: 4,
  analyst: 5,
  content: 6,
};

const AGENT_COLORS = {
  lead: '#ff4444',
  soft: '#00ffff',
  docs: '#4488ff',
  mon: '#aa66ff',
  scout: '#ff8800',
  analyst: '#ff66aa',
  content: '#ffcc00',
};

// ─── VN DIALOG DATA ──────────────────────────────────
const AGENT_GREETINGS = {
  lead: [
    "Selamat datang, Commander. Aku sudah siapkan briefing untuk hari ini.",
    "Ada misi baru yang perlu kita diskusikan...",
    "Status tim sudah aku periksa. Semuanya operasional.",
  ],
  soft: [
    "H-halo... Aku sedang debug kode yang cukup rumit...",
    "A-aku akan coba selesaikan secepatnya...",
    "Jangan khawatir, sistemnya sudah stabil kok... mungkin.",
  ],
  docs: [
    "Dokumentasi untuk sprint ini sudah 78% selesai.",
    "Ada beberapa standar baru yang perlu kita terapkan.",
    "Aku sudah compile semua laporan minggu ini.",
  ],
  mon: [
    "Sistem monitoring: semua hijau. Tidak ada anomali.",
    "Performa server dalam batas normal.",
    "Aku terus memantau resource usage 24/7.",
  ],
  scout: [
    "Hei! Aku baru saja temukan beberapa intel menarik~",
    "Web crawling selesai. Ada 15 sumber baru.",
    "Trennya berubah lagi... aku akan update briefing-nya.",
  ],
  analyst: [
    "Data analysis untuk quarter ini sudah siap!",
    "P-pattern yang menarik muncul dari data terakhir...",
    "Rekomendasi strategis sudah aku rangkum.",
  ],
  content: [
    "Content calendar sudah aku update! ✨",
    "Draft baru sudah siap direview~",
    "Engagement metrics minggu ini meningkat 12%!",
  ],
};

// ─── GAME CONSTANTS ──────────────────────────────────
const PLAYER_SPEED = 2.5;
const SPRITE_SIZE = 32; // rendered sprite size on canvas (player height)
const AGENT_SPRITE_SIZE = 30;
const PROXIMITY_RADIUS = 60;
const CAMERA_LERP = 0.1; // smooth camera follow factor
// SCALE is now computed dynamically to fit the map

// ═══════════════════════════════════════════════════════
// GATHER ENGINE COMPONENT
// ═══════════════════════════════════════════════════════
const GatherEngine = ({ agents, onSelectAgent, agentActivity }) => {
  const canvasRef = useRef(null);
  const keysRef = useRef(new Set());
  const playerRef = useRef({ x: 290, y: 500, dir: 'front' });
  const cameraRef = useRef({ x: 0, y: 0 });
  const imagesRef = useRef({});
  const avatarSheetRef = useRef(null);
  const mapSizeRef = useRef({ w: 580, h: 1024 });
  const scaleRef = useRef(1);
  const animFrameRef = useRef(null);
  const [floor, setFloor] = useState(1);
  const [nearAgent, setNearAgent] = useState(null);
  const [vnDialog, setVnDialog] = useState(null); // { agent, lines, currentLine }
  const [currentRoom, setCurrentRoom] = useState('');
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const floorRef = useRef(1);

  // ─── PRELOAD ALL IMAGES ──────────────────────────
  useEffect(() => {
    let isMounted = true;
    const loadedImages = {};
    const imagesToLoad = [];

    // Map images
    Object.entries(MAP_SOURCES).forEach(([floorNum, src]) => {
      imagesToLoad.push(
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            loadedImages[`map_${floorNum}`] = img;
            resolve();
          };
          img.onerror = () => resolve(); // graceful fail
          img.src = src;
        })
      );
    });

    // User direction sprites
    Object.entries(USER_SPRITES).forEach(([dir, src]) => {
      imagesToLoad.push(
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            loadedImages[`user_${dir}`] = img;
            resolve();
          };
          img.onerror = () => resolve();
          img.src = src;
        })
      );
    });

    // Avatar sprite sheet
    imagesToLoad.push(
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          avatarSheetRef.current = img;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = AVATARS_IMG;
      })
    );

    Promise.all(imagesToLoad).then(() => {
      if (isMounted) {
        imagesRef.current = loadedImages;
        // Set initial map size based on floor 1
        const mapImg = loadedImages['map_1'];
        if (mapImg) {
          mapSizeRef.current = { w: mapImg.width, h: mapImg.height };
        }
        setImagesLoaded(true);
      }
    });

    return () => { isMounted = false; };
  }, []);

  // ─── KEYBOARD INPUT ────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'e'].includes(key)) {
        e.preventDefault();
        keysRef.current.add(key);
      }

      // E key — interact with nearby agent
      if (key === 'e' && nearAgent) {
        openVNDialog(nearAgent);
      }

      // Escape — close VN dialog
      if (key === 'escape' && vnDialog) {
        setVnDialog(null);
      }
    };

    const handleKeyUp = (e) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [nearAgent, vnDialog]);

  // ─── VN DIALOG SYSTEM ─────────────────────────────
  const openVNDialog = useCallback((agentPos) => {
    const agent = agents.find(a => a.id === agentPos.id);
    if (!agent) return;

    const greetings = AGENT_GREETINGS[agent.id] || ["..."];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

    setVnDialog({
      agent,
      agentPos,
      text: randomGreeting,
      showConsoleBtn: true,
    });
  }, [agents]);

  // ─── FLOOR SWITCHING ──────────────────────────────
  const switchFloor = useCallback((newFloor) => {
    setFloor(newFloor);
    floorRef.current = newFloor;

    // Reset player position to spawn point of new floor
    const spawnPoints = {
      1: { x: 290, y: 500 },
      2: { x: 240, y: 500 },
      3: { x: 240, y: 400 },
    };
    playerRef.current = { ...spawnPoints[newFloor], dir: 'front' };

    // Update map size
    const mapImg = imagesRef.current[`map_${newFloor}`];
    if (mapImg) {
      mapSizeRef.current = { w: mapImg.width, h: mapImg.height };
    }

    setNearAgent(null);
    setVnDialog(null);
  }, []);

  // ─── GAME LOOP ────────────────────────────────────
  useEffect(() => {
    if (!imagesLoaded) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Configure canvas
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        // Compute scale to fit map height into canvas with some breathing room
        const map = mapSizeRef.current;
        const scaleX = canvas.width / map.w;
        const scaleY = canvas.height / map.h;
        scaleRef.current = Math.max(scaleX, scaleY, 1.2); // minimum 1.2x zoom
      }
    };
    resize();
    window.addEventListener('resize', resize);

    // ── UPDATE ──
    const update = () => {
      if (vnDialog) return; // pause movement during dialog

      const keys = keysRef.current;
      const player = playerRef.current;
      const map = mapSizeRef.current;
      let moved = false;

      // Movement
      if (keys.has('w') || keys.has('arrowup')) {
        player.y -= PLAYER_SPEED;
        player.dir = 'back';
        moved = true;
      }
      if (keys.has('s') || keys.has('arrowdown')) {
        player.y += PLAYER_SPEED;
        player.dir = 'front';
        moved = true;
      }
      if (keys.has('a') || keys.has('arrowleft')) {
        player.x -= PLAYER_SPEED;
        player.dir = 'left';
        moved = true;
      }
      if (keys.has('d') || keys.has('arrowright')) {
        player.x += PLAYER_SPEED;
        player.dir = 'right';
        moved = true;
      }

      // Clamp to map bounds
      const margin = SPRITE_SIZE / 2;
      player.x = Math.max(margin, Math.min(map.w - margin, player.x));
      player.y = Math.max(margin, Math.min(map.h - margin, player.y));

      // Camera follow (smooth lerp)
      const scale = scaleRef.current;
      const targetCamX = player.x * scale - canvas.width / 2;
      const targetCamY = player.y * scale - canvas.height / 2;
      cameraRef.current.x += (targetCamX - cameraRef.current.x) * CAMERA_LERP;
      cameraRef.current.y += (targetCamY - cameraRef.current.y) * CAMERA_LERP;

      // Clamp camera
      const maxCamX = map.w * scale - canvas.width;
      const maxCamY = map.h * scale - canvas.height;
      cameraRef.current.x = Math.max(0, Math.min(maxCamX, cameraRef.current.x));
      cameraRef.current.y = Math.max(0, Math.min(maxCamY, cameraRef.current.y));

      // Proximity check
      const currentAgents = AGENT_POSITIONS[floorRef.current] || [];
      let closest = null;
      let closestDist = Infinity;

      for (const agentPos of currentAgents) {
        const dx = player.x - agentPos.x;
        const dy = player.y - agentPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < PROXIMITY_RADIUS && dist < closestDist) {
          closest = agentPos;
          closestDist = dist;
        }
      }

      setNearAgent(closest);

      // Room detection
      if (closest) {
        setCurrentRoom(closest.room);
      } else if (moved) {
        setCurrentRoom('');
      }
    };

    // ── RENDER ──
    const render = () => {
      const { width, height } = canvas;
      const cam = cameraRef.current;
      const player = playerRef.current;
      const currentFloor = floorRef.current;

      ctx.clearRect(0, 0, width, height);

      // Dark background
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);

      const scale = scaleRef.current;
      ctx.save();
      ctx.translate(-cam.x, -cam.y);
      ctx.scale(scale, scale);

      // ── Draw Map ──
      const mapImg = imagesRef.current[`map_${currentFloor}`];
      if (mapImg) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(mapImg, 0, 0);
      }

      // ── Collect entities to sort by Y (for depth) ──
      const entities = [];

      // Add agents
      const currentAgents = AGENT_POSITIONS[currentFloor] || [];
      for (const agentPos of currentAgents) {
        const agent = agents.find(a => a.id === agentPos.id);
        if (!agent) continue;
        entities.push({
          type: 'agent',
          x: agentPos.x,
          y: agentPos.y,
          agent,
          agentPos,
        });
      }

      // Add player
      entities.push({
        type: 'player',
        x: player.x,
        y: player.y,
      });

      // Sort by Y position (higher Y = drawn later = in front)
      entities.sort((a, b) => a.y - b.y);

      // ── Draw entities ──
      for (const entity of entities) {
        if (entity.type === 'player') {
          drawPlayer(ctx, player);
        } else if (entity.type === 'agent') {
          drawAgent(ctx, entity.agent, entity.agentPos, player);
        }
      }

      ctx.restore();

      // ── HUD overlay (not affected by camera) ──
      drawHUD(ctx, width, height);
    };

    // ── Draw Player ──
    const drawPlayer = (ctx, player) => {
      const sprite = imagesRef.current[`user_${player.dir}`];
      if (!sprite) return;

      const aspectRatio = sprite.width / sprite.height;
      const drawH = SPRITE_SIZE;
      const drawW = drawH * aspectRatio;

      ctx.drawImage(
        sprite,
        player.x - drawW / 2,
        player.y - drawH,
        drawW,
        drawH
      );

      // Player name tag
      ctx.save();
      ctx.font = 'bold 7px "Press Start 2P", monospace';
      ctx.textAlign = 'center';

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const tagW = 36;
      const tagH = 12;
      const tagX = player.x - tagW / 2;
      const tagY = player.y + 3;
      ctx.fillRect(tagX, tagY, tagW, tagH);

      // Border
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(tagX, tagY, tagW, tagH);

      // Text
      ctx.fillStyle = '#00ffff';
      ctx.fillText('YOU', player.x, tagY + 9);

      // Glow effect around player
      ctx.shadowColor = 'rgba(0, 255, 255, 0.3)';
      ctx.shadowBlur = 15;
      ctx.restore();
    };

    // ── Draw Agent NPC ──
    const drawAgent = (ctx, agent, agentPos, player) => {
      const spriteIdx = AGENT_SPRITE_INDEX[agent.id] ?? 0;
      const sheet = avatarSheetRef.current;

      if (sheet) {
        // Avatar sheet is 1024x1024 with 7 chars in a horizontal row
        // Characters occupy roughly the center portion of the image
        // Content area: x varies per char, y from ~250 to ~900
        const spriteW = sheet.width / 7; // ~146px each
        const contentTop = 250;
        const contentH = 650;

        // Draw with correct aspect ratio (taller than wide)
        const charAspect = spriteW / contentH; // ~0.22
        const drawH = AGENT_SPRITE_SIZE * 1.6;
        const drawW = drawH * charAspect;

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          sheet,
          spriteIdx * spriteW, contentTop, spriteW, contentH,
          agentPos.x - drawW / 2,
          agentPos.y - drawH,
          drawW,
          drawH
        );
        ctx.restore();
      } else {
        // Fallback: draw colored circle
        ctx.fillStyle = AGENT_COLORS[agent.id] || '#ffffff';
        ctx.beginPath();
        ctx.arc(agentPos.x, agentPos.y - 15, 12, 0, Math.PI * 2);
        ctx.fill();
      }

      // Status indicator
      const status = agentActivity?.[agent.id]?.status || 'standby';
      const statusColor = status === 'active' ? '#00ff00' : status === 'busy' ? '#ffaa00' : '#666666';

      ctx.beginPath();
      ctx.arc(agentPos.x + AGENT_SPRITE_SIZE / 2 - 5, agentPos.y - AGENT_SPRITE_SIZE + 5, 4, 0, Math.PI * 2);
      ctx.fillStyle = statusColor;
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Name tag
      ctx.save();
      ctx.font = '6px monospace';
      ctx.textAlign = 'center';

      const name = agent.name.split(' ')[0];
      const textW = ctx.measureText(name).width + 8;
      const tagH = 10;
      const tagX = agentPos.x - textW / 2;
      const tagY = agentPos.y + 2;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(tagX, tagY, textW, tagH);

      ctx.strokeStyle = AGENT_COLORS[agent.id] || '#fff';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(tagX, tagY, textW, tagH);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(name, agentPos.x, tagY + 8);
      ctx.restore();

      // Proximity indicator
      const dx = player.x - agentPos.x;
      const dy = player.y - agentPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < PROXIMITY_RADIUS) {
        // Pulsing ring around agent
        const pulsePhase = (Date.now() % 1500) / 1500;
        const pulseRadius = AGENT_SPRITE_SIZE / 2 + 5 + Math.sin(pulsePhase * Math.PI * 2) * 3;

        ctx.save();
        ctx.strokeStyle = `rgba(0, 255, 255, ${0.3 + Math.sin(pulsePhase * Math.PI * 2) * 0.2})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(agentPos.x, agentPos.y - AGENT_SPRITE_SIZE / 2, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    };

    // ── HUD (Heads-Up Display) ──
    const drawHUD = (ctx, width, height) => {
      // Interaction prompt
      if (nearAgent && !vnDialog) {
        const promptText = `Press [E] to talk — ${nearAgent.label}`;
        ctx.save();
        ctx.font = '14px "Inter", sans-serif';
        ctx.textAlign = 'center';

        const textW = ctx.measureText(promptText).width + 30;
        const promptX = width / 2 - textW / 2;
        const promptY = height - 60;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(promptX, promptY, textW, 32);

        // Border
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(promptX, promptY, textW, 32);

        // Text
        ctx.fillStyle = '#00ffff';
        ctx.fillText(promptText, width / 2, promptY + 21);
        ctx.restore();
      }

      // Room label
      if (currentRoom) {
        ctx.save();
        ctx.font = 'bold 11px "Inter", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(10, 10, ctx.measureText(currentRoom).width + 20, 24);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(currentRoom, 20, 27);
        ctx.restore();
      }
    };

    // ── GAME LOOP ──
    const gameLoop = () => {
      update();
      render();
      animFrameRef.current = requestAnimationFrame(gameLoop);
    };

    // Warm up camera
    const player = playerRef.current;
    const initScale = scaleRef.current;
    cameraRef.current.x = player.x * initScale - canvas.width / 2;
    cameraRef.current.y = player.y * initScale - canvas.height / 2;

    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [imagesLoaded, agents, agentActivity, nearAgent, vnDialog, currentRoom]);

  // ─── RENDER JSX ────────────────────────────────────
  return (
    <div className="gather-engine">
      {/* Floor switching controls */}
      <div className="ge-floor-controls">
        {[
          { num: 1, label: '1F Activity', icon: '🏢' },
          { num: 2, label: '2F Private', icon: '🛏️' },
          { num: 3, label: 'Rooftop', icon: '🌙' },
        ].map(f => (
          <button
            key={f.num}
            className={`ge-floor-btn ${floor === f.num ? 'active' : ''}`}
            onClick={() => switchFloor(f.num)}
          >
            <span className="floor-icon">{f.icon}</span>
            <span className="floor-label">{f.label}</span>
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className="ge-canvas-wrapper">
        {!imagesLoaded ? (
          <div className="ge-loading">
            <div className="ge-loading-spinner" />
            <span>Loading Cozy House...</span>
          </div>
        ) : (
          <canvas ref={canvasRef} className="ge-canvas" tabIndex={0} />
        )}
      </div>

      {/* VN Dialog Overlay */}
      {vnDialog && (
        <div className="vn-dialog-overlay" onClick={() => setVnDialog(null)}>
          <div className="vn-dialog-box" onClick={e => e.stopPropagation()}>
            {/* Character portrait area */}
            <div className="vn-portrait-area">
              <div
                className="vn-portrait"
                style={{ borderColor: AGENT_COLORS[vnDialog.agent.id] }}
              >
                {avatarSheetRef.current && (
                  <canvas
                    ref={(c) => {
                      if (!c || !avatarSheetRef.current) return;
                      const actx = c.getContext('2d');
                      const sheet = avatarSheetRef.current;
                      const spriteW = sheet.width / 7;
                      const idx = AGENT_SPRITE_INDEX[vnDialog.agent.id] ?? 0;
                      const contentTop = 250;
                      const contentH = 650;
                      c.width = 80;
                      c.height = 80;
                      actx.imageSmoothingEnabled = false;
                      actx.drawImage(
                        sheet,
                        idx * spriteW, contentTop, spriteW, contentH,
                        5, 0, 70, 80
                      );
                    }}
                    className="vn-portrait-canvas"
                  />
                )}
              </div>
              <div className="vn-agent-info">
                <span
                  className="vn-agent-name"
                  style={{ color: AGENT_COLORS[vnDialog.agent.id] }}
                >
                  {vnDialog.agent.name}
                </span>
                <span className="vn-agent-role">{vnDialog.agent.role}</span>
              </div>
            </div>

            {/* Dialog text */}
            <div className="vn-text-area">
              <p className="vn-text">{vnDialog.text}</p>
            </div>

            {/* Action buttons */}
            <div className="vn-actions">
              <button
                className="vn-btn vn-btn-console"
                onClick={() => {
                  setVnDialog(null);
                  onSelectAgent(vnDialog.agent);
                }}
              >
                💻 Open Console
              </button>
              <button
                className="vn-btn vn-btn-close"
                onClick={() => setVnDialog(null)}
              >
                ✕ Close
              </button>
            </div>

            {/* Click to continue hint */}
            <div className="vn-hint">Press ESC or click outside to close</div>
          </div>
        </div>
      )}

      {/* Controls legend */}
      <div className="ge-legend">
        <span>WASD / ←↑↓→ Move</span>
        <span>•</span>
        <span>[E] Interact</span>
        <span>•</span>
        <span>Floor: {floor === 1 ? 'Activity' : floor === 2 ? 'Private' : 'Rooftop'}</span>
      </div>
    </div>
  );
};

export default GatherEngine;
