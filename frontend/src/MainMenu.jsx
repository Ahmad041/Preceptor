import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import * as THREE from 'three';
import SettingsMenu from './SettingsMenu';

function VRMModel({ url, animUrl, hoveredIndex }) {
  const [vrm, setVrm] = useState(null);
  const [scene, setScene] = useState(null);
  const mixerRef = useRef(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(url, (gltf) => {
      const vrmInstance = gltf.userData.vrm;
      // Rotate model to face camera
      vrmInstance.scene.rotation.y = Math.PI;
      setVrm(vrmInstance);
      setScene(gltf.scene);
    });
  }, [url]);

  useEffect(() => {
    if (!vrm || !animUrl) return;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    loader.load(animUrl, (gltf) => {
      const vrmAnimations = gltf.userData.vrmAnimations;
      if (vrmAnimations && vrmAnimations.length > 0) {
        const vrmAnimation = vrmAnimations[0];
        const clip = createVRMAnimationClip(vrmAnimation, vrm);
        const mixer = new THREE.AnimationMixer(vrm.scene);
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
        mixerRef.current = mixer;
      }
    });

    return () => {
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
      }
    };
  }, [vrm, animUrl]);

  const [lookAtTarget] = useState(() => new THREE.Object3D());

  useEffect(() => {
    if (vrm && vrm.lookAt) {
      vrm.lookAt.target = lookAtTarget;
    }
  }, [vrm, lookAtTarget]);

  useFrame((state, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
    if (vrm) {
      // Expression handling
      if (vrm.expressionManager) {
        const targetHappy = hoveredIndex === 0 ? 1.0 : 0.0;
        const targetConfused = hoveredIndex === 1 ? 1.0 : 0.0;
        const targetSad = hoveredIndex === 2 ? 1.0 : 0.0;
        
        const currentHappy = vrm.expressionManager.getValue('happy') || vrm.expressionManager.getValue('joy') || 0;
        const currentConfused = vrm.expressionManager.getValue('surprised') || 0;
        const currentSad = vrm.expressionManager.getValue('sad') || vrm.expressionManager.getValue('sorrow') || 0;

        const nextHappy = THREE.MathUtils.lerp(currentHappy, targetHappy, delta * 5.0);
        const nextConfused = THREE.MathUtils.lerp(currentConfused, targetConfused, delta * 5.0);
        const nextSad = THREE.MathUtils.lerp(currentSad, targetSad, delta * 5.0);

        vrm.expressionManager.setValue('happy', nextHappy);
        vrm.expressionManager.setValue('joy', nextHappy); // VRM 0.0 fallback
        vrm.expressionManager.setValue('surprised', nextConfused);
        vrm.expressionManager.setValue('sad', nextSad);
        vrm.expressionManager.setValue('sorrow', nextSad); // VRM 0.0 fallback
      }

      lookAtTarget.position.x = state.pointer.x * 2;
      lookAtTarget.position.y = state.pointer.y * 0.5 + 0.2;
      lookAtTarget.position.z = 1.0;
      vrm.update(delta);
    }
  });

  if (!scene) return null;
  return <primitive object={scene} position={[0, -1.2, 0]} />;
}

export default function MainMenu({ onStart }) {
  const [showModes, setShowModes] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedMode, setSelectedMode] = useState('override');
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Detroit style menu items
  const menuItems = [
    { id: 'start', label: 'START', action: () => setShowModes(true) },
    { id: 'options', label: 'OPTIONS', action: () => setShowSettings(true) },
    { id: 'exit', label: 'EXIT', action: () => window.close && window.close() }
  ];

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: '#05070a', // Dark Miside background
      color: '#e2e8f0',
      fontFamily: '"Outfit", sans-serif'
    }}>
      {/* CSS for animations and UI */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');
        
        .detroit-menu-btn {
          position: relative;
          background: transparent;
          border: none;
          outline: none;
          cursor: pointer;
          padding: 8px 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          min-width: 140px;
        }

        .detroit-menu-text {
          font-family: 'Outfit', sans-serif;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.15em;
          color: #4a5568;
          z-index: 2;
          transition: color 0.3s ease;
        }

        .detroit-menu-btn:hover .detroit-menu-text {
          color: #ffffff;
        }

        /* The blue gradient background for active/hover */
        .detroit-active-bg {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(66,108,145,1) 0%, rgba(93,141,180,1) 50%, rgba(131,175,212,0) 100%);
          opacity: 0;
          transition: opacity 0.3s ease;
          z-index: 1;
        }

        .detroit-menu-btn:hover .detroit-active-bg {
          opacity: 1;
        }

        /* Corner Brackets */
        .bracket {
          position: absolute;
          width: 8px;
          height: 8px;
          border: 2px solid #426c91;
          opacity: 0;
          transition: opacity 0.3s ease, transform 0.3s ease;
          z-index: 3;
        }

        .bracket-tl { top: -4px; left: -4px; border-right: none; border-bottom: none; transform: translate(4px, 4px); }
        .bracket-tr { top: -4px; right: -4px; border-left: none; border-bottom: none; transform: translate(-4px, 4px); }
        .bracket-bl { bottom: -4px; left: -4px; border-right: none; border-top: none; transform: translate(4px, -4px); }
        .bracket-br { bottom: -4px; right: -4px; border-left: none; border-top: none; transform: translate(-4px, -4px); }

        .detroit-menu-btn:hover .bracket {
          opacity: 1;
          transform: translate(0, 0);
        }

        /* Little square decorations */
        .decor-square {
          position: absolute;
          width: 4px;
          height: 4px;
          background-color: #426c91;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .ds-left { left: -16px; top: 50%; transform: translateY(-50%); }
        .ds-right { right: -16px; top: 50%; transform: translateY(-50%); }

        .detroit-menu-btn:hover .decor-square {
          opacity: 0.5;
        }

        /* Loading circle top right */
        .loading-circle {
          position: absolute;
          top: 32px;
          right: 32px;
          width: 24px;
          height: 24px;
          border: 2px solid rgba(66,108,145,0.2);
          border-top: 2px solid #426c91;
          border-radius: 50%;
          animation: spin 2s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Full Screen Character Area / Background */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, backgroundColor: '#05070a' }}>
        <Canvas camera={{ position: [0, 0.2, 1.2], fov: 35 }}>
          <ambientLight intensity={0.05} color="#2d3748" />
          <spotLight position={[0, 3, 2]} angle={0.5} penumbra={1} intensity={2} color="#426c91" />
          <directionalLight position={[-2, 1, 1]} intensity={0.1} color="#ffffff" />
          <React.Suspense fallback={null}>
            <VRMModel url="/Hitori Gotou.vrm" animUrl="/animations/idle_loop.vrma" hoveredIndex={hoveredIndex} />
          </React.Suspense>
        </Canvas>
        {/* Soft vignette/glow for the dark Miside aesthetic */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle, transparent 30%, rgba(5,7,10,0.9) 100%)', pointerEvents: 'none' }}></div>
      </div>

      {/* Loading Indicator */}
      <div className="loading-circle" style={{ zIndex: 10 }}></div>

      {/* Horizontal Bottom Menu */}
      <div style={{ 
        position: 'absolute', 
        bottom: '15%', 
        left: '5%', 
        right: '5%',
        display: 'flex', 
        flexDirection: 'row', 
        alignItems: 'center',
        gap: '8px',
        zIndex: 20 
      }}>
        {menuItems.map((item, index) => (
          <button 
            key={item.id} 
            className="detroit-menu-btn" 
            onClick={item.action}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div className="detroit-active-bg"></div>
            
            {/* Brackets */}
            <div className="bracket bracket-tl"></div>
            <div className="bracket bracket-tr"></div>
            <div className="bracket bracket-bl"></div>
            <div className="bracket bracket-br"></div>
            
            {/* Decor squares */}
            <div className="decor-square ds-left"></div>
            <div className="decor-square ds-right"></div>

            <span className="detroit-menu-text">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Subtle version info */}
      <div style={{ position: 'absolute', bottom: '32px', left: '5%', zIndex: 20, opacity: 0.4 }}>
        <p style={{ fontFamily: 'Outfit', fontSize: '10px', fontWeight: 600, letterSpacing: '0.2em', color: '#4a5568', margin: 0 }}>
          NEO-NOIR PROTOCOL // VER_1.0.0_ALPHA
        </p>
      </div>

      {/* Mode Selection Modal (Adapted for light theme) */}
      {showModes && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowModes(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(12px)'
          }}
        >
          <div style={{
            background: 'rgba(240, 244, 248, 0.9)', 
            border: '1px solid rgba(66,108,145,0.3)',
            padding: '48px',
            width: '500px', 
            boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
            display: 'flex', flexDirection: 'column', gap: '24px',
            position: 'relative'
          }}>
            <h2 style={{ textAlign: 'center', color: '#2d3748', fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '0.1em', fontFamily: 'Outfit' }}>
              SELECT DIRECTIVE
            </h2>

            {[
              { id: 'story', title: 'STORY MODE', desc: 'Convert PDF/Paper to Interactive Visual Novel', icon: 'M', status: 'ONLINE' },
              { id: 'override', title: 'OVERRIDE MODE', desc: 'Full desktop control, vision, and free chat', icon: 'O', status: 'ONLINE' },
              { id: 'company', title: 'COMPANY MODE', desc: 'Obsidian-like Note System with 3D AI Knowledge Graph', icon: 'C', status: 'ONLINE' }
            ].map((mode, index) => (
              <button
                key={mode.id}
                onClick={() => {
                  setSelectedMode(mode.id);
                  setShowModes(false);
                  onStart({ nama: '', hubungan: '' }, mode.id);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '20px',
                  padding: '20px', 
                  border: '1px solid rgba(66,108,145,0.2)',
                  background: 'white', 
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#426c91';
                  e.currentTarget.style.transform = 'translateX(8px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(66,108,145,0.1)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(66,108,145,0.2)';
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '24px', color: '#426c91', fontFamily: 'Outfit', fontWeight: 800 }}>
                  [{mode.icon}]
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#2d3748', display: 'flex', alignItems: 'center', gap: '12px', fontFamily: 'Outfit', letterSpacing: '0.05em' }}>
                    {mode.title}
                  </div>
                  <div style={{ fontSize: '11px', color: '#718096', marginTop: '6px', fontFamily: 'Outfit' }}>{mode.desc}</div>
                </div>
              </button>
            ))}

            <button
              onClick={() => setShowModes(false)}
              style={{
                marginTop: '10px', background: 'none', border: 'none',
                color: '#718096', fontSize: '12px', cursor: 'pointer', fontWeight: 600, fontFamily: 'Outfit', letterSpacing: '0.1em'
              }}
            >
              [ ABORT ]
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && <SettingsMenu onClose={() => setShowSettings(false)} />}
    </div>
  );
}

