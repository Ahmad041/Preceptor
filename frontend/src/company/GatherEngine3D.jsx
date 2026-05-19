import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Sky, Environment, ContactShadows, useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

// ─── UTILS ─────────────────────────────────────────────────────────────────
const usePlayerControls = () => {
  const [movement, setMovement] = useState({
    forward: false,
    backward: false,
    left: false,
    right: false,
    interact: false,
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': setMovement((m) => ({ ...m, forward: true })); break;
        case 'KeyS': case 'ArrowDown': setMovement((m) => ({ ...m, backward: true })); break;
        case 'KeyA': case 'ArrowLeft': setMovement((m) => ({ ...m, left: true })); break;
        case 'KeyD': case 'ArrowRight': setMovement((m) => ({ ...m, right: true })); break;
        case 'KeyE': setMovement((m) => ({ ...m, interact: true })); break;
      }
    };
    const handleKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': setMovement((m) => ({ ...m, forward: false })); break;
        case 'KeyS': case 'ArrowDown': setMovement((m) => ({ ...m, backward: false })); break;
        case 'KeyA': case 'ArrowLeft': setMovement((m) => ({ ...m, left: false })); break;
        case 'KeyD': case 'ArrowRight': setMovement((m) => ({ ...m, right: false })); break;
        case 'KeyE': setMovement((m) => ({ ...m, interact: false })); break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return movement;
};

// ─── CHARACTER COMPONENT USING THE DELEGATION GLB ──────────────────────────
const ModelAvatar = ({ color, animationName }) => {
  const group = useRef();
  const { scene, animations } = useGLTF('/character.glb');
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    // Traverse and colorize
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Preserve eyes and mouth, change body color
        if (child.material) {
          const matName = child.material.name.toLowerCase();
          if (!matName.includes('eye') && !matName.includes('mouth')) {
            child.material = child.material.clone();
            child.material.color.set(color || '#cccccc');
          }
        }
      }
    });
  }, [clone, color]);

  useEffect(() => {
    // Crossfade animations
    const action = actions[animationName];
    if (action) {
      action.reset().fadeIn(0.2).play();
      return () => action.fadeOut(0.2);
    }
  }, [animationName, actions]);

  return (
    <group ref={group} dispose={null}>
      <primitive object={clone} />
    </group>
  );
};

// ─── PLAYER AVATAR COMPONENT ───────────────────────────────────────────────
const PlayerAvatar = ({ position, onPositionUpdate, controlsRef }) => {
  const playerRef = useRef(null);
  const movement = usePlayerControls();
  const { camera } = useThree();
  const [animation, setAnimation] = useState('Idle');

  useFrame((state, delta) => {
    let moving = false;
    
    if (playerRef.current) {
      const speed = 4.0;
      const velocity = new THREE.Vector3(0, 0, 0);

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      
      const right = new THREE.Vector3();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      if (movement.forward) velocity.add(forward.clone().multiplyScalar(speed * delta));
      if (movement.backward) velocity.add(forward.clone().multiplyScalar(-speed * delta));
      if (movement.left) velocity.add(right.clone().multiplyScalar(-speed * delta));
      if (movement.right) velocity.add(right.clone().multiplyScalar(speed * delta));

      moving = velocity.lengthSq() > 0;

      if (moving) {
        const nextPosition = playerRef.current.position.clone().add(velocity);
        
        // Boundaries approx for the office
        nextPosition.x = Math.max(-9.5, Math.min(9.5, nextPosition.x));
        nextPosition.z = Math.max(-9.5, Math.min(9.5, nextPosition.z));

        playerRef.current.position.copy(nextPosition);
        
        const targetAngle = Math.atan2(velocity.x, velocity.z);
        let diff = targetAngle - playerRef.current.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        playerRef.current.rotation.y += diff * 10 * delta;

        if (controlsRef.current) {
          controlsRef.current.target.copy(playerRef.current.position).add(new THREE.Vector3(0, 1, 0));
        }

        if (onPositionUpdate) {
          onPositionUpdate(playerRef.current.position.clone());
        }
      }
    }
    
    const newAnim = moving ? 'Walk' : 'Idle';
    if (newAnim !== animation) setAnimation(newAnim);
  });

  return (
    <group ref={playerRef} position={position}>
      <ModelAvatar color="#ffffff" animationName={animation} />
    </group>
  );
};

// ─── DORM ENVIRONMENT (OFFICE GLB) ─────────────────────────────────────────
const DelegationOffice = () => {
  const { scene } = useGLTF('/office.glb');
  
  // Ensure shadows
  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = true;
        child.castShadow = true;
      }
    });
  }, [scene]);

  return <primitive object={scene} />;
};

// ─── AGENT NPC COMPONENT ───────────────────────────────────────────────────
const AgentNPC = ({ agent, initialPosition, playerPosition, onInteract, activityLog, isFullscreen }) => {
  const npcRef = useRef(null);
  const movement = usePlayerControls();
  const interactTriggeredRef = useRef(false);

  useEffect(() => {
    if (npcRef.current && playerPosition) {
      const dist = playerPosition.distanceTo(npcRef.current.position);
      if (dist < 2.5 && movement.interact && !interactTriggeredRef.current) {
        interactTriggeredRef.current = true;
        onInteract(agent);
      }
    }
    if (!movement.interact) {
      interactTriggeredRef.current = false;
    }
  }, [movement.interact, playerPosition, agent, onInteract]);

  const [currentChat, setCurrentChat] = useState("");
  const chatTimeoutRef = useRef(null);
  const [targetPos, setTargetPos] = useState(new THREE.Vector3(...initialPosition));
  const [animation, setAnimation] = useState('Idle');

  // Activity Log Sync
  useEffect(() => {
    if (activityLog && activityLog.length > 0) {
      setCurrentChat(activityLog);
      if (chatTimeoutRef.current) clearTimeout(chatTimeoutRef.current);
      chatTimeoutRef.current = setTimeout(() => {
        setCurrentChat("");
      }, 5000);
    }
  }, [activityLog]);

  // Random chatter loop
  useEffect(() => {
    const randomChats = [
      "Processing...",
      "Analyzing data...",
      "Just another task.",
      "Optimizing...",
      "Reviewing logic.",
      "Need more compute.",
      "Waiting for input...",
      "System green.",
      "Deploying...",
      "Compiling..."
    ];

    const chatterInterval = setInterval(() => {
      if (!currentChat && Math.random() < 0.1) {
        setCurrentChat(randomChats[Math.floor(Math.random() * randomChats.length)]);
        if (chatTimeoutRef.current) clearTimeout(chatTimeoutRef.current);
        chatTimeoutRef.current = setTimeout(() => {
          setCurrentChat("");
        }, 4000);
      }
    }, 6000);
    return () => clearInterval(chatterInterval);
  }, [currentChat]);

  // Movement Logic
  useFrame((state, delta) => {
    let moving = false;
    
    if (npcRef.current) {
      const currentPos = npcRef.current.position;
      
      if (currentPos.distanceTo(targetPos) < 0.1) {
        if (Math.random() < 0.005) { 
           // Random roam within office bounds
           const newX = (Math.random() - 0.5) * 16;
           const newZ = (Math.random() - 0.5) * 16;
           setTargetPos(new THREE.Vector3(newX, 0, newZ));
        }
      } else {
        const speed = 1.2;
        const direction = new THREE.Vector3().subVectors(targetPos, currentPos).normalize();
        const velocity = direction.multiplyScalar(speed * delta);
        
        if (velocity.lengthSq() > currentPos.distanceToSquared(targetPos)) {
           npcRef.current.position.copy(targetPos);
        } else {
           npcRef.current.position.add(velocity);
        }
        
        moving = true;
        
        const targetAngle = Math.atan2(velocity.x, velocity.z);
        let diff = targetAngle - npcRef.current.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        npcRef.current.rotation.y += diff * 5 * delta;
      }
    }

    const newAnim = moving ? 'Walk' : 'Idle';
    if (newAnim !== animation) setAnimation(newAnim);
  });

  return (
    <group ref={npcRef} position={initialPosition}>
      <ModelAvatar color={agent.color || "#cccccc"} animationName={animation} />
      
      {/* Name tag overlay — hidden in fullscreen */}
      {!isFullscreen && (
        <Html position={[0, 1.8, 0]} center zIndexRange={[100, 0]}>
          <div style={{
            background: 'rgba(20,20,25,0.9)',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
            fontWeight: '600',
            letterSpacing: '0.5px',
            borderLeft: `3px solid ${agent.color || '#888'}`,
          }}>
            {agent.name}
            {playerPosition && playerPosition.distanceTo(npcRef.current?.position || new THREE.Vector3()) < 2.5 && 
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: '2px' }}>[E] Interact</div>
            }
          </div>
        </Html>
      )}

      {/* Chat Bubble Overlay — hidden in fullscreen */}
      {currentChat && !isFullscreen && (
        <Html position={[0, 2.3, 0]} center zIndexRange={[100, 0]}>
          <div style={{
            background: 'rgba(20,20,25,0.9)',
            color: '#e2e8f0',
            padding: '8px 12px',
            borderRadius: '12px',
            fontSize: '13px',
            pointerEvents: 'none',
            maxWidth: '180px',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            position: 'relative',
            fontWeight: '500',
            border: `1px solid ${agent.color}33`,
          }}>
            {currentChat}
            <div style={{
              position: 'absolute',
              bottom: '-6px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid rgba(20,20,25,0.9)'
            }} />
          </div>
        </Html>
      )}
    </group>
  );
};

// ─── TRANSLATION UTILS ───────────────────────────────────────────────────────
const getIndonesianStatus = (rawStatus) => {
  if (!rawStatus) return "";
  const lower = String(rawStatus).toLowerCase();
  if (lower.includes("research") || lower.includes("search") || lower.includes("web") || lower.includes("brows") || lower.includes("crawler")) return "sedang melakukan research web...";
  if (lower.includes("doc") || lower.includes("write")) return "membuat dokumen...";
  if (lower.includes("code") || lower.includes("program")) return "menulis kode...";
  if (lower.includes("monitor") || lower.includes("watch") || lower.includes("check")) return "memantau sistem...";
  if (lower.includes("analy")) return "menganalisis data...";
  if (lower.includes("content") || lower.includes("creat")) return "membuat konten...";
  if (lower.includes("lead") || lower.includes("plan") || lower.includes("strat")) return "merencanakan strategi...";
  if (lower.includes("sleep") || lower.includes("idle")) return "sedang beristirahat...";
  return rawStatus; 
};

// ─── MAIN 3D ENGINE COMPONENT ──────────────────────────────────────────────
const GatherEngine3D = ({ agents, onSelectAgent, agentActivity, financeData, isFullscreen }) => {
  const [playerPosition, setPlayerPosition] = useState(new THREE.Vector3(0, 0, 0));
  const controlsRef = useRef(null);
  
  const [vnDialog, setVnDialog] = useState(null);

  // Expanded layout for The Delegation style
  const agentPositions3D = {
    'lead': [-4, 0, -2],
    'soft': [4, 0, -2],
    'docs': [-4, 0, 2],
    'mon': [4, 0, 2],
    'scout': [-6, 0, 5],
    'analyst': [6, 0, 5],
    'content': [0, 0, -6],
  };

  const handleInteract = (agent) => {
    const greetings = [
      "Task in progress. How can I assist?",
      "System operating at optimal levels.",
      "Just reviewing the latest logs."
    ];
    setVnDialog({
      agent,
      text: greetings[Math.floor(Math.random() * greetings.length)],
    });
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas shadows camera={{ position: [0, 8, 10], fov: 45 }}>
        {/* Soft lighting setup for minimalist look */}
        <ambientLight intensity={0.7} />
        <directionalLight 
          position={[10, 15, 10]} 
          intensity={1.2} 
          castShadow 
          shadow-mapSize-width={2048} 
          shadow-mapSize-height={2048} 
          shadow-bias={-0.0001}
        />
        <Environment preset="city" blur={0.8} />

        {/* OrbitControls configured for isometric-like top-down feel */}
        <OrbitControls 
          ref={controlsRef} 
          makeDefault 
          minDistance={5} 
          maxDistance={15} 
          maxPolarAngle={Math.PI / 2 - 0.1} 
        />

        {/* The Player */}
        <PlayerAvatar 
          position={[0, 0, 0]} 
          onPositionUpdate={setPlayerPosition} 
          controlsRef={controlsRef}
        />

        {/* The Environment / Room */}
        <DelegationOffice />

        {/* Agents */}
        {agents && agents.map((agent) => {
          let actLog = "";
          if (agentActivity && agentActivity[agent.id]) {
            actLog = typeof agentActivity[agent.id] === 'string' ? agentActivity[agent.id] : (agentActivity[agent.id].task || agentActivity[agent.id].message || "");
          }
          actLog = getIndonesianStatus(actLog);
          return (
            <AgentNPC 
              key={agent.id}
              agent={agent}
              initialPosition={agentPositions3D[agent.id] || [0, 0, 0]}
              playerPosition={playerPosition}
              onInteract={handleInteract}
              activityLog={actLog}
              isFullscreen={isFullscreen}
            />
          );
        })}

      </Canvas>

      {/* VN DIALOG OVERLAY — inline styles to avoid backdrop-filter on WebGL */}
      {vnDialog && !isFullscreen && (
        <div 
          onClick={() => setVnDialog(null)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '40px',
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '700px',
              background: '#1a1a1e',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px',
              padding: '32px',
              display: 'flex',
              gap: '32px',
              color: '#e2e8f0',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)',
            }}
          >
            {/* Portrait */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '120px' }}>
              <div style={{
                width: '100px', height: '100px', borderRadius: '16px',
                background: vnDialog.agent.color || '#333',
                overflow: 'hidden', marginBottom: '16px',
                border: `2px solid ${vnDialog.agent.color || '#555'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '40px'
              }}>
                🤖
              </div>
              <span style={{ fontWeight: 600, fontSize: '1.1rem', color: '#fff', textAlign: 'center' }}>{vnDialog.agent.name}</span>
              <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '4px', textAlign: 'center' }}>{vnDialog.agent.role}</span>
            </div>

            {/* Text + Actions */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <p style={{ fontSize: '1.1rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.9)', margin: '0 0 24px 0' }}>{vnDialog.text}</p>
              
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: 'auto' }}>
                <button 
                  onClick={() => { setVnDialog(null); onSelectAgent(vnDialog.agent); }}
                  style={{
                    background: vnDialog.agent.color || '#fff',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                  }}
                >
                  💻 Open Console
                </button>
                <button 
                  onClick={() => setVnDialog(null)}
                  style={{
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.7)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: '0.9rem',
                  }}
                >
                  ✕ Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Basic instructions overlay */}
      {!isFullscreen && (
        <div style={{ position: 'absolute', bottom: '24px', left: '24px', pointerEvents: 'none', background: 'rgba(255,255,255,0.8)', color: '#111', padding: '12px 16px', borderRadius: '8px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontWeight: '500' }}>
          <div><b>WASD / Arrows:</b> Move Character</div>
          <div><b>Mouse Drag:</b> Rotate Camera</div>
          <div><b>Scroll:</b> Zoom</div>
          <div><b>[E]:</b> Interact with Agents</div>
        </div>
      )}
    </div>
  );
};

// Preload models
useGLTF.preload('/character.glb');
useGLTF.preload('/office.glb');

export default GatherEngine3D;
