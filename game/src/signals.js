import {
  CLEAN_LOCK_TOLERANCE,
  SLOPPY_LOCK_TOLERANCE,
} from './dial.js';
import {
  TOTAL_TRANSMISSIONS,
  TRANSMISSIONS_PER_STATION,
  computeTransmissionTuning,
  getStationForIndex,
} from './levels.js';
import { clamp } from './theme.js';

export const INITIAL_CLOCK_SECONDS = 120.0;
export const MAX_RELAYS = 3;
const REACQUIRE_DELAY_SECONDS = 0.65;

export function createSignalRunState(rng) {
  const state = {
    rng,
    status: 'playing', // 'playing' | 'win' | 'lose'
    loseReason: null,  // 'relays' | 'clock' | null
    score: 0,
    relays: MAX_RELAYS,
    streak: 0,
    bestStreak: 0,
    clock: INITIAL_CLOCK_SECONDS,
    stationIndex: 0,
    slotInStation: 0,
    completedTransmissions: 0,
    decodedCount: 0,
    sloppyCount: 0,
    burnCount: 0,
    fadeCount: 0,
    totalAttempts: 0,
    totalErrorMhz: 0,
    elapsedTime: 0,
    reacquireTimer: 0,
    activeSignal: null,
    lastFrequency: 50.0,
    feedback: {
      title: 'SCAN THE BAND',
      detail: 'TUNE DIAL UNTIL NOISE SHARPENS INTO A CLEAN SINE',
      tone: 'amber',
      timer: 3.5,
      maxTimer: 3.5,
    },
    flashEffect: {
      tone: 'amber',
      strength: 0,
    },
  };

  spawnNextSignal(state);
  return state;
}

function pickSignalFrequency(rng, previousFrequency) {
  // Keep targets inside 7.0..93.0 MHz and at least 16 MHz away from the previous signal
  for (let attempt = 0; attempt < 16; attempt++) {
    const candidate = Math.round((7.0 + rng() * 86.0) * 10) / 10;
    if (Math.abs(candidate - previousFrequency) >= 16.0) {
      return candidate;
    }
  }
  return previousFrequency > 50 ? 22.5 : 77.5;
}

export function spawnNextSignal(state) {
  const tuning = computeTransmissionTuning(
    state.stationIndex,
    state.slotInStation,
    state.decodedCount,
  );
  const frequency = pickSignalFrequency(state.rng, state.lastFrequency);
  state.lastFrequency = frequency;

  state.activeSignal = {
    frequency,
    bandwidth: tuning.bandwidth,
    strength: tuning.strength,
    decayRemaining: tuning.decaySeconds,
    maxDecay: tuning.decaySeconds,
    carrierHz: tuning.carrierHz,
    harmonicMix: tuning.station.harmonicMix,
    callsign: tuning.callsign,
    station: tuning.station,
    age: 0,
  };
}

function setFeedback(state, title, detail, tone, duration = 2.0, flashStrength = 0.85) {
  state.feedback = {
    title,
    detail,
    tone,
    timer: duration,
    maxTimer: duration,
  };
  state.flashEffect = {
    tone,
    strength: flashStrength,
  };
}

export function updateSignalRun(state, dt) {
  if (state.status !== 'playing') {
    return null;
  }

  state.elapsedTime += dt;
  state.clock = Math.max(0, state.clock - dt);

  if (state.feedback.timer > 0) {
    state.feedback.timer = Math.max(0, state.feedback.timer - dt);
  }
  if (state.flashEffect.strength > 0) {
    state.flashEffect.strength = Math.max(0, state.flashEffect.strength - dt * 2.4);
  }

  if (state.clock <= 0) {
    state.status = 'lose';
    state.loseReason = 'clock';
    setFeedback(state, 'TOWER POWER DEPLETED', 'CLOCK REACHED 00:00', 'magenta', 4.0, 1.0);
    return { event: 'lose', reason: 'clock' };
  }

  if (state.reacquireTimer > 0) {
    state.reacquireTimer = Math.max(0, state.reacquireTimer - dt);
    if (state.reacquireTimer === 0) {
      spawnNextSignal(state);
    }
    return null;
  }

  if (state.activeSignal) {
    state.activeSignal.age += dt;
    state.activeSignal.decayRemaining = Math.max(0, state.activeSignal.decayRemaining - dt);

    if (state.activeSignal.decayRemaining <= 0) {
      state.streak = 0;
      state.fadeCount += 1;
      state.activeSignal = null;
      state.reacquireTimer = REACQUIRE_DELAY_SECONDS;
      setFeedback(
        state,
        'SIGNAL FADED',
        'STREAK LOST — RE-ACQUIRING NEW CARRIER',
        'magenta',
        1.7,
        0.55,
      );
      return { event: 'faded' };
    }
  }

  return null;
}

function advanceProgression(state) {
  state.completedTransmissions += 1;
  state.slotInStation += 1;

  if (state.completedTransmissions >= TOTAL_TRANSMISSIONS) {
    state.activeSignal = null;
    state.status = 'win';
    return { finished: true, stationChanged: false };
  }

  let stationChanged = false;
  if (state.slotInStation >= TRANSMISSIONS_PER_STATION) {
    state.slotInStation = 0;
    state.stationIndex += 1;
    stationChanged = true;
  }

  spawnNextSignal(state);
  return { finished: false, stationChanged };
}

export function attemptSignalLock(state, dialFrequency) {
  if (state.status !== 'playing' || !state.activeSignal || state.reacquireTimer > 0) {
    return { outcome: 'ignored' };
  }

  const signal = state.activeSignal;
  const distance = Math.abs(dialFrequency - signal.frequency);
  state.totalAttempts += 1;
  state.totalErrorMhz += distance;

  if (distance <= CLEAN_LOCK_TOLERANCE) {
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.decodedCount += 1;

    const accuracyFactor = 1 - distance / CLEAN_LOCK_TOLERANCE;
    const decayFactor = signal.maxDecay > 0 ? clamp(signal.decayRemaining / signal.maxDecay, 0, 1) : 0;
    const basePoints = 250 + state.stationIndex * 100;
    const accuracyBonus = Math.round(accuracyFactor * 160);
    const speedBonus = Math.round(decayFactor * 120);
    const multiplier = 1 + (state.streak - 1) * 0.25;
    const points = Math.round((basePoints + accuracyBonus + speedBonus) * multiplier);

    state.score += points;
    const callsign = signal.callsign;
    const progress = advanceProgression(state);

    if (progress.finished) {
      setFeedback(
        state,
        `DECODED ${callsign} // +${points}`,
        'ALL STATIONS CLEARED',
        'teal',
        3.0,
        1.0,
      );
      return { outcome: 'win', points, distance, callsign };
    }

    if (progress.stationChanged) {
      const nextStation = getStationForIndex(state.stationIndex);
      setFeedback(
        state,
        `DECODED ${callsign} // +${points}`,
        `SHIFTING TO ${nextStation.code}: ${nextStation.name}`,
        'teal',
        2.6,
        1.0,
      );
      return { outcome: 'station_up', points, distance, callsign };
    }

    setFeedback(
      state,
      `DECODED ${callsign} // +${points}`,
      `±${distance.toFixed(1)} MHz • STREAK x${state.streak}`,
      'teal',
      2.0,
      0.9,
    );
    return { outcome: 'clean', points, distance, callsign };
  }

  if (distance <= SLOPPY_LOCK_TOLERANCE) {
    state.streak = 0;
    state.sloppyCount += 1;
    const points = 60 + Math.round((1 - (distance - CLEAN_LOCK_TOLERANCE) / (SLOPPY_LOCK_TOLERANCE - CLEAN_LOCK_TOLERANCE)) * 45);
    state.score += points;
    const callsign = signal.callsign;
    const progress = advanceProgression(state);

    if (progress.finished) {
      setFeedback(
        state,
        `SLOPPY LOCK // +${points}`,
        'ALL STATIONS CLEARED',
        'amber',
        3.0,
        0.65,
      );
      return { outcome: 'win', points, distance, callsign };
    }

    if (progress.stationChanged) {
      const nextStation = getStationForIndex(state.stationIndex);
      setFeedback(
        state,
        `SLOPPY LOCK (${distance.toFixed(1)} MHz OFF) // +${points}`,
        `STREAK RESET • NEXT: ${nextStation.code} ${nextStation.name}`,
        'amber',
        2.5,
        0.6,
      );
      return { outcome: 'sloppy_station_up', points, distance, callsign };
    }

    setFeedback(
      state,
      `SLOPPY LOCK // +${points}`,
      `OFF BY ${distance.toFixed(1)} MHz — STREAK RESET`,
      'amber',
      2.0,
      0.55,
    );
    return { outcome: 'sloppy', points, distance, callsign };
  }

  // Outside ±8.0 MHz: burn a relay
  state.streak = 0;
  state.burnCount += 1;
  state.relays = Math.max(0, state.relays - 1);

  if (state.relays <= 0) {
    state.status = 'lose';
    state.loseReason = 'relays';
    setFeedback(
      state,
      'FINAL RELAY BURNED',
      `OFF BY ${distance.toFixed(1)} MHz — TOWER OFFLINE`,
      'magenta',
      4.0,
      1.0,
    );
    return { outcome: 'lose', distance };
  }

  setFeedback(
    state,
    `RELAY BURNED (${state.relays} LEFT)`,
    `OFF BAND BY ${distance.toFixed(1)} MHz (> ±8.0 MHz)`,
    'magenta',
    2.2,
    1.0,
  );
  return { outcome: 'burn', distance, relaysLeft: state.relays };
}

export function getAccuracyPercent(state) {
  if (state.totalAttempts === 0) return 100;
  return Math.round((state.decodedCount / state.totalAttempts) * 100);
}

export function getAverageErrorMhz(state) {
  if (state.totalAttempts === 0) return 0;
  return state.totalErrorMhz / state.totalAttempts;
}
