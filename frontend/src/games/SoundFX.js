// SoundFX.js — Web Audio API synthesized sound effects
// No external files needed, all sounds generated programmatically

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', volume = 0.3, fadeOut = true) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    if (fadeOut) {
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    }
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Silent fail — audio not critical
  }
}

function playNoise(duration, volume = 0.15) {
  try {
    const ctx = getCtx();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufferSize);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch (e) {}
}

const SFX = {
  // === Guitar Tap ===
  hitPerfect() {
    playTone(880, 0.15, 'sine', 0.25);
    setTimeout(() => playTone(1320, 0.12, 'sine', 0.2), 50);
  },
  hitGood() {
    playTone(660, 0.12, 'triangle', 0.2);
  },
  miss() {
    playTone(150, 0.2, 'sawtooth', 0.15);
    playTone(120, 0.25, 'sawtooth', 0.1);
  },
  combo() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.12, 'sine', 0.2), i * 60);
    });
  },

  // === Memory Card ===
  cardFlip() {
    playTone(400, 0.06, 'sine', 0.15);
    setTimeout(() => playTone(600, 0.06, 'sine', 0.15), 40);
  },
  cardMatch() {
    playTone(523, 0.1, 'sine', 0.25);
    setTimeout(() => playTone(784, 0.15, 'sine', 0.25), 80);
    setTimeout(() => playTone(1047, 0.2, 'sine', 0.2), 160);
  },
  cardWrong() {
    playTone(300, 0.15, 'square', 0.1);
    setTimeout(() => playTone(250, 0.2, 'square', 0.1), 100);
  },

  // === Social Runner ===
  jump() {
    const ctx = getCtx();
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {}
  },
  collect() {
    [1047, 1319, 1568].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.08, 'sine', 0.2), i * 50);
    });
  },
  crash() {
    playNoise(0.3, 0.2);
    playTone(100, 0.3, 'sawtooth', 0.15);
  },
  shield() {
    playTone(440, 0.1, 'triangle', 0.15);
    setTimeout(() => playTone(554, 0.1, 'triangle', 0.15), 80);
    setTimeout(() => playTone(659, 0.15, 'triangle', 0.2), 160);
  },

  // === General ===
  gameSwitch() {
    playTone(500, 0.08, 'sine', 0.15);
    setTimeout(() => playTone(700, 0.1, 'sine', 0.15), 60);
  },
  scoreTick() {
    playTone(1200, 0.04, 'sine', 0.1);
  },
};

export default SFX;
