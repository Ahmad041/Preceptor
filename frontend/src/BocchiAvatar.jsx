import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import * as THREE from 'three';

// ============================================================
// KONFIGURASI POSE UNTUK SETIAP EMOSI
// ============================================================
const POSE_CONFIG = {
  idle: {
    leftUpperArm:  { z: 70 },
    rightUpperArm: { z: -70 },
    leftLowerArm:  { z: 15 },
    rightLowerArm: { z: -15 },
    head:          { x: 5, z: 0 },
    spine:         { x: 0 },
    expression: { happy: 0, angry: 0, sad: 0, surprised: 0 },
  },
  gugup: {
    leftUpperArm:  { z: 50 },
    rightUpperArm: { z: -50 },
    leftLowerArm:  { z: 40 },
    rightLowerArm: { z: -40 },
    head:          { x: 15, z: 5 },
    spine:         { x: 5 },
    expression: { happy: 0, angry: 0, sad: 0.3, surprised: 0 },
  },
  takut: {
    leftUpperArm:  { z: 30 },
    rightUpperArm: { z: -30 },
    leftLowerArm:  { z: 60 },
    rightLowerArm: { z: -60 },
    head:          { x: -5, z: 0 },
    spine:         { x: -3 },
    expression: { happy: 0, angry: 0, sad: 0, surprised: 0.8 },
  },
  marah: {
    leftUpperArm:  { z: 80 },
    rightUpperArm: { z: -80 },
    leftLowerArm:  { z: 5 },
    rightLowerArm: { z: -5 },
    head:          { x: -5, z: 0 },
    spine:         { x: -2 },
    expression: { happy: 0, angry: 0.8, sad: 0, surprised: 0 },
  },
  senang: {
    leftUpperArm:  { z: 60 },
    rightUpperArm: { z: -60 },
    leftLowerArm:  { z: 20 },
    rightLowerArm: { z: -20 },
    head:          { x: 8, z: -3 },
    spine:         { x: 0 },
    expression: { happy: 0.6, angry: 0, sad: 0, surprised: 0 },
  },
  panik: {
    leftUpperArm:  { z: 45 },
    rightUpperArm: { z: -45 },
    leftLowerArm:  { z: 50 },
    rightLowerArm: { z: -50 },
    head:          { x: -5, z: 0 },
    spine:         { x: 3 },
    expression: { happy: 0, angry: 0, sad: 0.4, surprised: 0.8 },
  },
};

// ============================================================
// ANIMASI KHUSUS UNTUK SETIAP EMOSI
// ============================================================
const EMOTION_ANIMATIONS = {
  idle: (t) => ({
    spine: { x: Math.sin(t * 1.5) * 1.5 },
    head:  { x: Math.sin(t * 0.8) * 1, z: Math.sin(t * 0.6) * 2 },
  }),
  gugup: (t) => {
    const gemetar = Math.sin(t * 12) * 1.5;
    return {
      spine:         { x: Math.sin(t * 2) * 2 },
      head:          { x: Math.sin(t * 3) * 2, z: gemetar },
      leftLowerArm:  { z: Math.sin(t * 4) * 5 },
      rightLowerArm: { z: Math.sin(t * 4.2) * -5 },
    };
  },
  takut: (t) => {
    const gemetarKeras = Math.sin(t * 18) * 2;
    return {
      spine:         { x: Math.sin(t * 3) * 3 },
      head:          { x: Math.sin(t * 5) * 3, z: gemetarKeras },
      leftUpperArm:  { z: Math.sin(t * 6) * 5 },
      rightUpperArm: { z: Math.sin(t * 6.2) * -5 },
      leftLowerArm:  { z: Math.sin(t * 8) * 8 },
      rightLowerArm: { z: Math.sin(t * 8.2) * -8 },
    };
  },
  marah: (t) => {
    const tegang = Math.sin(t * 15) * 0.8;
    return {
      spine: { x: Math.sin(t * 2) * 1 },
      head:  { x: tegang, z: Math.sin(t * 1) * 1 },
    };
  },
  senang: (t) => ({
    spine:         { x: Math.sin(t * 2) * 2 },
    head:          { x: Math.sin(t * 1.5) * 2, z: Math.sin(t * 1) * 3 },
    leftUpperArm:  { z: Math.sin(t * 2) * 3 },
    rightUpperArm: { z: Math.sin(t * 2) * -3 },
  }),
  panik: (t) => {
    const gemetar = Math.sin(t * 20) * 1.5;
    return {
      spine:         { x: Math.sin(t * 4) * 2.5 },
      head:          { x: Math.sin(t * 6) * 2, z: gemetar },
      leftUpperArm:  { z: Math.sin(t * 8) * 4 },
      rightUpperArm: { z: Math.sin(t * 8.2) * -4 },
      leftLowerArm:  { z: Math.sin(t * 10) * 6 },
      rightLowerArm: { z: Math.sin(t * 10.2) * -6 },
    };
  },
};

function lerp(current, target, speed) {
  return current + (target - current) * speed;
}

// ============================================================
// KOMPONEN 3D MODEL (dengan lip-sync terintegrasi)
// ============================================================
const Model = ({ analyzerNode, emosi = 'idle' }) => {
  const { camera } = useThree();
  
  const gltf = useLoader(GLTFLoader, '/Hitori Gotou.vrm', (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });

  const vrmRef = useRef();
  const idleTimeRef = useRef(0);
  const currentRotations = useRef({
    leftUpperArm: { z: 70 }, rightUpperArm: { z: -70 },
    leftLowerArm: { z: 15 }, rightLowerArm: { z: -15 },
    head: { x: 5, z: 0 }, spine: { x: 0 },
  });
  const currentExpressions = useRef({ happy: 0, angry: 0, sad: 0, surprised: 0 });
  // Smooth lip-sync value
  const currentMouth = useRef(0);

  useEffect(() => {
    if (gltf) {
      const vrm = gltf.userData.vrm;
      if (vrm) {
        vrmRef.current = vrm;
        vrm.scene.rotation.y = Math.PI;
        camera.position.set(0, 1.4, 0.8);
        camera.lookAt(0, 1.4, 0);
        console.log('[Avatar] Bocchi berhasil dimuat! 🎸');
      }
    }
  }, [gltf, camera]);

  useFrame((state, delta) => {
    if (!vrmRef.current) return;
    
    idleTimeRef.current += delta;
    const t = idleTimeRef.current;
    const humanoid = vrmRef.current.humanoid;
    const expr = vrmRef.current.expressionManager;
    const lerpSpeed = 0.08;

    // --- 1. POSE + ANIMASI EMOSI ---
    const targetPose = POSE_CONFIG[emosi] || POSE_CONFIG.idle;
    const emotionAnim = (EMOTION_ANIMATIONS[emosi] || EMOTION_ANIMATIONS.idle)(t);
    const cur = currentRotations.current;
    const bones = ['leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'head', 'spine'];
    
    bones.forEach(boneName => {
      const bone = humanoid.getNormalizedBoneNode(boneName);
      if (!bone || !targetPose[boneName]) return;
      const animOffset = emotionAnim[boneName] || {};
      
      ['x', 'z'].forEach(axis => {
        if (targetPose[boneName][axis] !== undefined) {
          const finalTarget = targetPose[boneName][axis] + (animOffset[axis] || 0);
          if (!cur[boneName]) cur[boneName] = {};
          if (cur[boneName][axis] === undefined) cur[boneName][axis] = targetPose[boneName][axis];
          cur[boneName][axis] = lerp(cur[boneName][axis], finalTarget, lerpSpeed);
          bone.rotation[axis] = THREE.MathUtils.degToRad(cur[boneName][axis]);
        }
      });
    });

    // --- 2. EKSPRESI WAJAH ---
    const targetExpr = targetPose.expression || {};
    const curExpr = currentExpressions.current;
    ['happy', 'angry', 'sad', 'surprised'].forEach(e => {
      curExpr[e] = lerp(curExpr[e], targetExpr[e] || 0, lerpSpeed);
      expr?.setValue(e, curExpr[e]);
    });

    // --- 3. LIP-SYNC (dari AnalyserNode) ---
    if (analyzerNode) {
      const dataArray = new Uint8Array(analyzerNode.frequencyBinCount);
      analyzerNode.getByteFrequencyData(dataArray);
      
      // Ambil frekuensi suara manusia (200Hz-4000Hz) saja, bukan seluruh spektrum
      // Ini membuat lip-sync lebih akurat untuk suara bicara
      const sampleRate = 44100;
      const binSize = sampleRate / analyzerNode.fftSize;
      const lowBin = Math.floor(200 / binSize);
      const highBin = Math.min(Math.floor(4000 / binSize), dataArray.length);
      
      let sum = 0;
      for (let i = lowBin; i < highBin; i++) {
        sum += dataArray[i];
      }
      const average = sum / (highBin - lowBin);
      
      // Target bukaan mulut (0-1)
      const targetMouth = Math.min(average / 80, 1.0);
      
      // Smooth lip-sync agar tidak "kaku" / kedap-kedip
      currentMouth.current = lerp(currentMouth.current, targetMouth, 0.25);
      
      // Variasi bentuk mulut: 'aa' (buka lebar), 'oh' (bulat), 'ih' (lebar)
      const mouth = currentMouth.current;
      expr?.setValue('aa', mouth * 0.7);          // Buka mulut utama
      expr?.setValue('oh', mouth * 0.3);          // Sedikit bentuk O
      expr?.setValue('ih', mouth * 0.15);         // Sedikit bentuk I
    } else {
      // Kalau tidak ada audio, tutup mulut pelan-pelan
      currentMouth.current = lerp(currentMouth.current, 0, 0.1);
      expr?.setValue('aa', currentMouth.current);
      expr?.setValue('oh', 0);
      expr?.setValue('ih', 0);
    }

    // --- 4. KEDIP OTOMATIS ---
    const blinkInterval = emosi === 'gugup' ? 2 : emosi === 'takut' ? 8 : 4;
    const blinkCycle = t % blinkInterval;
    if (blinkCycle > (blinkInterval - 0.3) && blinkCycle < (blinkInterval - 0.1)) {
      expr?.setValue('blink', 1);
    } else {
      expr?.setValue('blink', 0);
    }

    vrmRef.current.update(delta);
  });

  return <primitive object={gltf.scene} />;
};

// ============================================================
// KOMPONEN WRAPPER — Handle Audio Playback + AnalyserNode
// ============================================================
export default function BocchiAvatar({ audioBase64, emosi = 'idle' }) {
  const [analyzerNode, setAnalyzerNode] = useState(null);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const analyzerRef = useRef(null);

  // Inisialisasi AudioContext sekali saja
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      
      // Buat AnalyserNode permanen
      const analyzer = audioContextRef.current.createAnalyser();
      analyzer.fftSize = 2048;          // Resolusi frekuensi tinggi untuk lip-sync akurat
      analyzer.smoothingTimeConstant = 0.6; // Smoothing agar tidak terlalu 'kaku'
      analyzer.connect(audioContextRef.current.destination); // Tetap keluarkan ke speaker
      analyzerRef.current = analyzer;
      setAnalyzerNode(analyzer);
      
      console.log('[LipSync] AudioContext & Analyzer siap! 🎤');
    }
    return audioContextRef.current;
  }, []);

  // Setiap kali ada audio baru dari backend, decode & putar
  useEffect(() => {
    if (!audioBase64) return;
    
    const playAudio = async () => {
      try {
        const ctx = getAudioContext();
        
        // Resume AudioContext jika di-suspend oleh browser (autoplay policy)
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        
        // Stop audio sebelumnya jika masih playing
        if (sourceNodeRef.current) {
          try { sourceNodeRef.current.stop(); } catch(e) {}
        }
        
        // 1. Decode base64 → ArrayBuffer
        const binaryString = atob(audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // 2. Decode audio data
        const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
        
        // 3. Buat source node baru
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        
        // 4. Sambungkan: Source → Analyzer → Speaker
        //    Analyzer akan membaca frekuensi untuk lip-sync
        source.connect(analyzerRef.current);
        
        // 5. PUTAR!
        source.start(0);
        sourceNodeRef.current = source;
        
        console.log('[LipSync] Audio sedang diputar dengan lip-sync! 👄');
        
        // Cleanup saat audio selesai
        source.onended = () => {
          console.log('[LipSync] Audio selesai.');
          sourceNodeRef.current = null;
        };
        
      } catch (err) {
        console.error('[LipSync] Gagal memutar audio:', err);
      }
    };
    
    playAudio();
  }, [audioBase64, getAudioContext]);

  return (
    <div style={{ height: '100%', width: '100%', background: 'transparent' }}>
      <Canvas>
        <ambientLight intensity={1.5} />
        <directionalLight position={[1, 1, 1]} />
        <React.Suspense fallback={null}>
          <Model analyzerNode={analyzerNode} emosi={emosi} />
        </React.Suspense>
      </Canvas>
    </div>
  );
}