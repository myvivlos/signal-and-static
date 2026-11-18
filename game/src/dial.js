import { clamp, lerp } from './theme.js';

export const MIN_FREQ = 0.0;
export const MAX_FREQ = 100.0;

export const CLEAN_LOCK_TOLERANCE = 2.0;
export const SLOPPY_LOCK_TOLERANCE = 8.0;

export const DIAL_TRACK_RECT = {
  x: 84,
  y: 518,
  width: 830,
  height: 112,
};

export const LOCK_BUTTON_RECT = {
  x: 944,
  y: 582,
  width: 262,
  height: 62,
};

export function createDialState(initialFrequency = 50.0) {
  return {
    frequency: clamp(initialFrequency, MIN_FREQ, MAX_FREQ),
    needleFrequency: clamp(initialFrequency, MIN_FREQ, MAX_FREQ),
    holdTime: 0,
    lastDirection: 0,
    isDragging: false,
    isHoveringTrack: false,
  };
}

export function frequencyToX(frequency, trackRect = DIAL_TRACK_RECT) {
  const ratio = (clamp(frequency, MIN_FREQ, MAX_FREQ) - MIN_FREQ) / (MAX_FREQ - MIN_FREQ);
  return trackRect.x + ratio * trackRect.width;
}

export function xToFrequency(stageX, trackRect = DIAL_TRACK_RECT) {
  const ratio = (stageX - trackRect.x) / trackRect.width;
  return clamp(MIN_FREQ + ratio * (MAX_FREQ - MIN_FREQ), MIN_FREQ, MAX_FREQ);
}

export function isPointInRect(px, py, rect, pad = 0) {
  return (
    px >= rect.x - pad &&
    px <= rect.x + rect.width + pad &&
    py >= rect.y - pad &&
    py <= rect.y + rect.height + pad
  );
}

export function setDialFrequency(dial, frequency, immediate = false) {
  dial.frequency = clamp(frequency, MIN_FREQ, MAX_FREQ);
  if (immediate) {
    dial.needleFrequency = dial.frequency;
  }
}

export function nudgeDial(dial, deltaMhz) {
  dial.frequency = clamp(dial.frequency + deltaMhz, MIN_FREQ, MAX_FREQ);
}

export function updateDial(dial, dt, keyboardInput) {
  const dir = (keyboardInput.right ? 1 : 0) - (keyboardInput.left ? 1 : 0);

  if (dir !== 0) {
    if (dir !== dial.lastDirection) {
      dial.holdTime = 0;
    } else {
      dial.holdTime += dt;
    }
    const ramp = clamp(dial.holdTime / 0.45, 0, 1);
    const baseSpeed = keyboardInput.fine ? 7.5 : lerp(14.0, 44.0, ramp);
    dial.frequency = clamp(dial.frequency + dir * baseSpeed * dt, MIN_FREQ, MAX_FREQ);
  } else {
    dial.holdTime = 0;
  }
  dial.lastDirection = dir;

  // Smooth mechanical needle follow without introducing sluggish lag
  const follow = 1 - Math.exp(-32 * dt);
  dial.needleFrequency = lerp(dial.needleFrequency, dial.frequency, follow);
}

export function computeTuningMetrics(dialFrequency, signal) {
  if (!signal) {
    return {
      distance: MAX_FREQ,
      clarity: 0,
      carrierAmplitude: 0,
      noiseLevel: 1,
      lockZone: 'miss',
    };
  }

  const distance = Math.abs(dialFrequency - signal.frequency);
  const ratio = distance / Math.max(0.5, signal.bandwidth);
  const rawClarity = Math.exp(-1.6 * ratio * ratio);
  const integrityRatio = signal.maxDecay > 0 ? clamp(signal.decayRemaining / signal.maxDecay, 0, 1) : 1;

  // As a signal gets fainter and decays, its readable amplitude shrinks relative to static
  const carrierAmplitude = rawClarity * (0.36 + 0.64 * signal.strength) * (0.42 + 0.58 * integrityRatio);
  const clarity = clamp(rawClarity * (0.62 + 0.38 * signal.strength), 0, 1);
  const noiseLevel = clamp(1 - clarity * 0.88, 0.08, 1.0);

  let lockZone = 'miss';
  if (distance <= CLEAN_LOCK_TOLERANCE) {
    lockZone = 'clean';
  } else if (distance <= SLOPPY_LOCK_TOLERANCE) {
    lockZone = 'sloppy';
  }

  return {
    distance,
    clarity,
    carrierAmplitude,
    noiseLevel,
    lockZone,
  };
}
