export function createAudioEngine() {
  let ctx = null;
  let masterGain = null;
  let staticGain = null;
  let staticFilter = null;
  let carrierGain = null;
  let carrierOsc = null;
  let harmonicOsc = null;
  let harmonicGain = null;
  let muted = false;
  let initialized = false;

  function ensureContext() {
    if (initialized) return true;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;

    try {
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.65;
      masterGain.connect(ctx.destination);

      // Build looping noise buffer for static
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Slightly warm pink-ish blend so static is textured rather than harsh
        lastOut = (lastOut + 0.08 * white) / 1.08;
        data[i] = white * 0.45 + lastOut * 1.1;
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      staticFilter = ctx.createBiquadFilter();
      staticFilter.type = 'bandpass';
      staticFilter.frequency.value = 1600;
      staticFilter.Q.value = 1.0;

      staticGain = ctx.createGain();
      staticGain.gain.value = 0;

      noiseSource.connect(staticFilter);
      staticFilter.connect(staticGain);
      staticGain.connect(masterGain);
      noiseSource.start();

      // Carrier tone + harmonic
      carrierOsc = ctx.createOscillator();
      carrierOsc.type = 'sine';
      carrierOsc.frequency.value = 261.63;

      harmonicOsc = ctx.createOscillator();
      harmonicOsc.type = 'triangle';
      harmonicOsc.frequency.value = 523.26;

      harmonicGain = ctx.createGain();
      harmonicGain.gain.value = 0.15;

      carrierGain = ctx.createGain();
      carrierGain.gain.value = 0;

      carrierOsc.connect(carrierGain);
      harmonicOsc.connect(harmonicGain);
      harmonicGain.connect(carrierGain);
      carrierGain.connect(masterGain);

      carrierOsc.start();
      harmonicOsc.start();

      initialized = true;
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (!ensureContext()) return;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  function toggleMute() {
    muted = !muted;
    if (initialized && masterGain && ctx) {
      masterGain.gain.setTargetAtTime(muted ? 0 : 0.65, ctx.currentTime, 0.03);
    }
    return muted;
  }

  function isMuted() {
    return muted;
  }

  function updateContinuous(scene, dialFrequency, signal, tuning, station) {
    if (!initialized || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;

    if (scene !== 'play') {
      staticGain.gain.setTargetAtTime(0, now, 0.08);
      carrierGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }

    const params = station.noiseParams;
    staticFilter.type = params.filterType;
    const dialShift = ((dialFrequency - 50) / 50) * 320;
    staticFilter.frequency.setTargetAtTime(Math.max(300, params.filterFreq + dialShift), now, 0.05);
    staticFilter.Q.setTargetAtTime(params.filterQ, now, 0.05);

    if (!signal) {
      staticGain.gain.setTargetAtTime(0.16, now, 0.05);
      carrierGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    const targetStatic = 0.22 * (1 - tuning.clarity * 0.72);
    const targetCarrier = Math.pow(tuning.clarity, 1.35) * 0.24 * (0.5 + 0.5 * signal.strength);

    staticGain.gain.setTargetAtTime(targetStatic, now, 0.04);
    carrierGain.gain.setTargetAtTime(targetCarrier, now, 0.04);
    carrierOsc.frequency.setTargetAtTime(signal.carrierHz, now, 0.04);
    harmonicOsc.frequency.setTargetAtTime(signal.carrierHz * 2, now, 0.04);
    harmonicGain.gain.setTargetAtTime(signal.harmonicMix * 0.5, now, 0.04);
  }

  function playTone(freq, startOffset, duration, type = 'sine', peakGain = 0.2, endFreq = null) {
    if (!initialized || !ctx || ctx.state !== 'running' || muted) return;
    const t0 = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t0 + duration);
    }

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function playCue(cueName) {
    if (!initialized || !ctx || ctx.state !== 'running' || muted) return;

    switch (cueName) {
      case 'clean':
        playTone(523.25, 0, 0.12, 'triangle', 0.22);
        playTone(783.99, 0.07, 0.18, 'sine', 0.24);
        break;
      case 'sloppy':
        playTone(330, 0, 0.12, 'triangle', 0.16, 260);
        break;
      case 'burn':
        playTone(190, 0, 0.28, 'sawtooth', 0.22, 65);
        playTone(130, 0.04, 0.26, 'square', 0.12, 52);
        break;
      case 'fade':
        playTone(380, 0, 0.26, 'sine', 0.14, 140);
        break;
      case 'station_up':
        playTone(440, 0, 0.12, 'triangle', 0.2);
        playTone(554.37, 0.09, 0.12, 'triangle', 0.2);
        playTone(659.25, 0.18, 0.24, 'sine', 0.24);
        break;
      case 'win':
        playTone(392.0, 0, 0.18, 'triangle', 0.2);
        playTone(493.88, 0.1, 0.18, 'triangle', 0.2);
        playTone(587.33, 0.2, 0.22, 'triangle', 0.2);
        playTone(783.99, 0.3, 0.42, 'sine', 0.26);
        break;
      case 'lose':
        playTone(220, 0, 0.35, 'sawtooth', 0.18, 82);
        playTone(164.81, 0.16, 0.45, 'sawtooth', 0.16, 55);
        break;
      default:
        break;
    }
  }

  return {
    unlock,
    toggleMute,
    isMuted,
    updateContinuous,
    playCue,
  };
}
