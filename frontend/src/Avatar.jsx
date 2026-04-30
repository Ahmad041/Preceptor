import React, { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const BocchiModel = ({ audioUrl }) => {
  const { scene } = useGLTF('/bocchi_gotoh.vrm', (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });
  
  const vrmRef = useRef();
  const analyserRef = useRef();

  useEffect(() => {
    if (scene) {
      const vrm = scene.userData.vrm;
      vrmRef.current = vrm;
      VRMUtils.rotateVRM0(vrm); // Putar jika arahnya salah
    }
  }, [scene]);

  // Logika Lip-Sync
  useFrame(() => {
    if (vrmRef.current && analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Ambil rata-rata volume suara
      const volume = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const mouthOpen = Math.min(volume / 50, 1); // Sensitivitas mulut

      // Gerakkan BlendShape mulut 'A' (MouthOpen)
      vrmRef.current.expressionManager.setValue('aa', mouthOpen);
      vrmRef.current.update(0.016); // Update animasi tiap frame
    }
  });

  return <primitive object={scene} />;
};

export default function AvatarScene({ audioBase64 }) {
  // Fungsi untuk memutar audio dan menghubungkannya ke Analyser (Lip-sync)
  return (
    <div style={{ height: '500px', width: '100%' }}>
      <Canvas camera={{ position: [0, 1.5, 2] }}>
        <ambientLight intensity={1} />
        <BocchiModel />
      </Canvas>
    </div>
  );
}