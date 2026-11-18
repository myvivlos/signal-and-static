import { createAudioEngine } from './audio.js';
import {
  DIAL_TRACK_RECT,
  LOCK_BUTTON_RECT,
  computeTuningMetrics,
  createDialState,
  isPointInRect,
  nudgeDial,
  setDialFrequency,
  updateDial,
  xToFrequency,
} from './dial.js';
import { MUTE_BUTTON_RECT, drawDialPanel, drawTopHud } from './hud.js';
import { createInputController } from './input.js';
import { getStationForIndex } from './levels.js';
import {
  RESTART_BUTTON_RECT,
  TITLE_START_RECT,
  drawLoseScreen,
  drawTitleScreen,
  drawWinScreen,
} from './screens.js';
import {
  attemptSignalLock,
  createSignalRunState,
  updateSignalRun,
} from './signals.js';
import {
  PALETTE,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  createRng,
  drawStageOverlay,
} from './theme.js';
import { drawOscilloscope } from './waves.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const audio = createAudioEngine();

function parseBootParams() {
  const params = new URLSearchParams(window.location.search);
  const rawScene = params.get('scene');
  const rawShot = params.get('shot');

  let scene = 'title';
  if (rawScene === 'title' || rawScene === 'play' || rawScene === 'win' || rawScene === 'lose') {
    scene = rawScene;
  } else if (rawShot === 'start') {
    scene = 'title';
  } else if (rawShot === 'play') {
    scene = 'play';
  } else if (rawShot === 'end') {
    scene = 'win';
  }

  const seedParam = params.get('seed');
  const parsedSeed = seedParam !== null ? Number.parseInt(seedParam, 10) : Number.NaN;
  const seed = Number.isFinite(parsedSeed) ? (parsedSeed >>> 0) : ((Date.now() ^ 0x5a17c3) >>> 0);

  const tParam = params.get('t');
  const parsedT = tParam !== null ? Number.parseFloat(tParam) : Number.NaN;
  const fastForwardSeconds = Number.isFinite(parsedT) && parsedT > 0 ? parsedT : 0;

  return { scene, seed, fastForwardSeconds };
}

const bootConfig = parseBootParams();

let currentScene = 'title';
let runSeed = bootConfig.seed;
let runState = null;
let dial = createDialState(50.0);
let simTime = 0;
let lockFlashTimer = 0;
let currentDpr = 1;

function resizeCanvasForDpr() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (dpr !== currentDpr || canvas.width !== STAGE_WIDTH * dpr) {
    currentDpr = dpr;
    canvas.width = Math.round(STAGE_WIDTH * dpr);
    canvas.height = Math.round(STAGE_HEIGHT * dpr);
  }
}

function startNewGame(seedOverride = null) {
  if (seedOverride !== null) {
    runSeed = seedOverride >>> 0;
  }
  const rng = createRng(runSeed);
  runState = createSignalRunState(rng);
  dial = createDialState(50.0);
  simTime = 0;
  lockFlashTimer = 0;
  currentScene = 'play';
}

function triggerLock() {
  if (currentScene !== 'play' || !runState) return;
  lockFlashTimer = 0.25;
  const result = attemptSignalLock(runState, dial.frequency);

  if (result.outcome === 'clean') {
    audio.playCue('clean');
  } else if (result.outcome === 'station_up' || result.outcome === 'sloppy_station_up') {
    audio.playCue('station_up');
  } else if (result.outcome === 'sloppy') {
    audio.playCue('sloppy');
  } else if (result.outcome === 'burn') {
    audio.playCue('burn');
  } else if (result.outcome === 'win') {
    audio.playCue('win');
    currentScene = 'win';
  } else if (result.outcome === 'lose') {
    audio.playCue('lose');
    currentScene = 'lose';
  }
}

function stepPlaySimulation(dt, keyboardInput) {
  simTime += dt;
  if (lockFlashTimer > 0) {
    lockFlashTimer = Math.max(0, lockFlashTimer - dt);
  }

  updateDial(dial, dt, keyboardInput);
  const simEvent = updateSignalRun(runState, dt);

  if (simEvent?.event === 'faded') {
    audio.playCue('fade');
  } else if (simEvent?.event === 'lose') {
    audio.playCue('lose');
    currentScene = 'lose';
  }
}

/**
 * Advances the real simulation deterministically for `?t=<seconds>` before first paint,
 * driving the real dial and lock functions so mid-game captures reflect authentic score,
 * streak, clock, and a partly-tuned dial.
 */
function fastForwardPlay(totalSeconds) {
  const stepDt = 1 / 60;
  const totalSteps = Math.round(totalSeconds / stepDt);
  const partialTailSeconds = Math.min(2.6, totalSeconds * 0.35);
  const settleSteps = Math.max(0, totalSteps - Math.round(partialTailSeconds / stepDt));
  let dwellTimer = 0;

  for (let i = 0; i < totalSteps; i++) {
    if (currentScene !== 'play' || runState.status !== 'playing') break;

    const signal = runState.activeSignal;
    let keyboardSim = { left: false, right: false, fine: false };

    if (signal) {
      const canLock = i < settleSteps && runState.completedTransmissions < 9;
      const targetOffset = canLock ? 0 : 2.3;
      const desiredFreq = Math.min(
        96,
        Math.max(4, signal.frequency + (signal.frequency > 50 ? -targetOffset : targetOffset)),
      );
      const diff = desiredFreq - dial.frequency;

      if (Math.abs(diff) > 0.45) {
        dwellTimer = 0;
        keyboardSim = {
          left: diff < 0,
          right: diff > 0,
          fine: Math.abs(diff) < 5.5 || !canLock,
        };
      } else if (canLock && runState.reacquireTimer <= 0) {
        dwellTimer += stepDt;
        if (dwellTimer >= 0.85) {
          dwellTimer = 0;
          triggerLock();
        }
      }
    }

    stepPlaySimulation(stepDt, keyboardSim);
  }
}

function fastForwardToWin() {
  const stepDt = 1 / 60;
  let guard = 0;
  while (currentScene === 'play' && guard < 18000) {
    guard += 1;
    const signal = runState.activeSignal;
    let keyboardSim = { left: false, right: false, fine: false };
    if (signal && runState.reacquireTimer <= 0) {
      const diff = signal.frequency - dial.frequency;
      if (Math.abs(diff) > 0.45) {
        keyboardSim = { left: diff < 0, right: diff > 0, fine: Math.abs(diff) < 3.0 };
      } else {
        triggerLock();
      }
    }
    stepPlaySimulation(stepDt, keyboardSim);
  }
}

function fastForwardToLose() {
  const stepDt = 1 / 60;
  let guard = 0;
  let phase = 0;
  while (currentScene === 'play' && guard < 18000) {
    guard += 1;
    // Play 2 clean locks first, then burn relays to reach a realistic lose state
    const signal = runState.activeSignal;
    let keyboardSim = { left: false, right: false, fine: false };
    if (signal && runState.reacquireTimer <= 0) {
      if (runState.decodedCount < 2 && phase === 0) {
        const diff = signal.frequency - dial.frequency;
        if (Math.abs(diff) > 0.45) {
          keyboardSim = { left: diff < 0, right: diff > 0, fine: false };
        } else {
          triggerLock();
        }
      } else {
        phase = 1;
        const offBandTarget = signal.frequency > 50 ? 18.0 : 82.0;
        const diff = offBandTarget - dial.frequency;
        if (Math.abs(diff) > 1.0) {
          keyboardSim = { left: diff < 0, right: diff > 0, fine: false };
        } else if (guard % 25 === 0) {
          triggerLock();
        }
      }
    }
    stepPlaySimulation(stepDt, keyboardSim);
  }
}

function restartFromEndScreen() {
  runSeed = (runSeed + 1) >>> 0;
  startNewGame(runSeed);
}

const input = createInputController(canvas, STAGE_WIDTH, STAGE_HEIGHT, {
  onUserGesture() {
    audio.unlock();
  },
  onStart() {
    if (currentScene === 'title') {
      startNewGame(runSeed);
    }
  },
  onRestart() {
    if (currentScene === 'win' || currentScene === 'lose') {
      restartFromEndScreen();
    }
  },
  onLock() {
    if (currentScene === 'play') {
      triggerLock();
    }
  },
  onToggleMute() {
    audio.toggleMute();
  },
  onPointerDown(sx, sy) {
    if (currentScene === 'title') {
      if (isPointInRect(sx, sy, TITLE_START_RECT, 8)) {
        startNewGame(runSeed);
      }
      return;
    }

    if (currentScene === 'win' || currentScene === 'lose') {
      if (isPointInRect(sx, sy, RESTART_BUTTON_RECT, 8)) {
        restartFromEndScreen();
      }
      return;
    }

    if (currentScene === 'play') {
      if (isPointInRect(sx, sy, MUTE_BUTTON_RECT, 4)) {
        audio.toggleMute();
        return;
      }
      if (isPointInRect(sx, sy, LOCK_BUTTON_RECT, 4)) {
        triggerLock();
        return;
      }
      if (isPointInRect(sx, sy, DIAL_TRACK_RECT, 18)) {
        dial.isDragging = true;
        setDialFrequency(dial, xToFrequency(sx));
      }
    }
  },
  onPointerMove(sx, sy) {
    if (currentScene !== 'play') return;
    const overTrack = isPointInRect(sx, sy, DIAL_TRACK_RECT, 14);
    dial.isHoveringTrack = overTrack;
    if (dial.isDragging || overTrack) {
      setDialFrequency(dial, xToFrequency(sx));
    }
  },
  onPointerUp() {
    dial.isDragging = false;
  },
  onWheel(direction) {
    if (currentScene === 'play') {
      nudgeDial(dial, direction * 0.5);
    }
  },
});

function render() {
  resizeCanvasForDpr();
  ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);

  if (currentScene === 'title') {
    drawTitleScreen(ctx, simTime, audio.isMuted());
  } else if (currentScene === 'play') {
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

    const station = getStationForIndex(runState.stationIndex);
    const tuning = computeTuningMetrics(dial.needleFrequency, runState.activeSignal);

    drawTopHud(ctx, runState, audio.isMuted());
    drawOscilloscope(ctx, runState, dial, tuning, station, simTime);
    drawDialPanel(ctx, dial, station, tuning, lockFlashTimer);

    audio.updateContinuous(currentScene, dial.frequency, runState.activeSignal, tuning, station);
  } else if (currentScene === 'win') {
    drawWinScreen(ctx, runState, simTime);
    audio.updateContinuous(currentScene, dial.frequency, null, { clarity: 0 }, getStationForIndex(0));
  } else if (currentScene === 'lose') {
    drawLoseScreen(ctx, runState, simTime);
    audio.updateContinuous(currentScene, dial.frequency, null, { clarity: 0 }, getStationForIndex(0));
  }

  drawStageOverlay(ctx);
}

// Initialize requested boot scene & deterministic dev hooks before first paint
function initBootScene() {
  if (bootConfig.scene === 'title') {
    currentScene = 'title';
    simTime = bootConfig.fastForwardSeconds;
  } else if (bootConfig.scene === 'play') {
    startNewGame(bootConfig.seed);
    if (bootConfig.fastForwardSeconds > 0) {
      fastForwardPlay(bootConfig.fastForwardSeconds);
    }
  } else if (bootConfig.scene === 'win') {
    startNewGame(bootConfig.seed);
    fastForwardToWin();
  } else if (bootConfig.scene === 'lose') {
    startNewGame(bootConfig.seed);
    fastForwardToLose();
  }
}

initBootScene();
render();

let lastFrameMs = performance.now();
function frame(nowMs) {
  const dt = Math.min(0.05, Math.max(0, (nowMs - lastFrameMs) / 1000));
  lastFrameMs = nowMs;

  if (currentScene === 'play') {
    stepPlaySimulation(dt, input.getKeyboardState());
  } else {
    simTime += dt;
  }

  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
