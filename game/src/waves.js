import {
  FONTS,
  PALETTE,
  clamp,
  drawPanel,
  drawRoundedRect,
  fontSpec,
  lerp,
} from './theme.js';

export const OSCILLOSCOPE_RECT = {
  x: 44,
  y: 118,
  width: 1192,
  height: 332,
};

function hashSample(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return (s - Math.floor(s)) * 2 - 1;
}

function generateStationNoise(u, time, dialFrequency, station) {
  const params = station.noiseParams;
  const dialOffset = dialFrequency * 3.17;
  const tFast = Math.floor(time * 42);

  // Broadband jitter coupled to dial movement + time
  const baseWhite = hashSample(u * 190 + dialOffset + tFast * 1.37);
  const fineWhite = hashSample(u * 410 - dialOffset * 0.7 + tFast * 2.91);
  let noise = (baseWhite * 0.65 + fineWhite * 0.35) * params.roughness;

  if (params.crackleRate > 0) {
    const spikeGate = hashSample(u * 64 + Math.floor(time * 24) * 7.13 + dialOffset);
    if (Math.abs(spikeGate) > 1 - params.crackleRate) {
      noise += Math.sign(spikeGate) * (0.65 + 0.55 * Math.abs(baseWhite));
    }
  }

  if (params.humCycles > 0) {
    noise += Math.sin(u * Math.PI * 2 * params.humCycles - time * 8.5 + dialOffset) * 0.18;
  }

  if (station.noiseCharacter === 'storm') {
    const packet = 0.5 + 0.5 * Math.sin(u * 14 + time * 5.2 + dialOffset * 0.4);
    noise *= 0.65 + packet * 0.65;
  }

  return clamp(noise, -1.35, 1.35);
}

/**
 * Computes normalized [-1, 1] waveform samples across the oscilloscope width.
 */
export function buildWaveformSamples(sampleCount, time, dialFrequency, signal, tuning, station) {
  const samples = new Float32Array(sampleCount);

  if (!signal) {
    for (let i = 0; i < sampleCount; i++) {
      const u = i / (sampleCount - 1);
      samples[i] = generateStationNoise(u, time, dialFrequency, station) * 0.52;
    }
    return samples;
  }

  const cycles = 2.4 + (signal.carrierHz - 200) / 140;
  const phaseSpeed = 7.0 + signal.carrierHz * 0.015;
  const clarity = tuning.clarity;
  const carrierAmp = tuning.carrierAmplitude;
  const noiseWeight = lerp(0.72, 0.06, Math.pow(clarity, 1.15));

  for (let i = 0; i < sampleCount; i++) {
    const u = i / (sampleCount - 1);
    // Subtle CRT edge taper keeps trace anchored cleanly inside the screen
    const edgeWindow = Math.sin(u * Math.PI);
    const windowScale = 0.25 + 0.75 * Math.pow(edgeWindow, 0.35);

    const angle = u * Math.PI * 2 * cycles - time * phaseSpeed;
    const fundamental = Math.sin(angle);
    const harmonic = Math.sin(angle * 2.0 + 0.6) * signal.harmonicMix;
    const carrier = (fundamental + harmonic) * carrierAmp;

    const staticNoise = generateStationNoise(u, time, dialFrequency, station) * noiseWeight;
    samples[i] = clamp((carrier + staticNoise) * windowScale, -1.05, 1.05);
  }

  return samples;
}

function drawTracePath(ctx, samples, plotX, plotY, plotW, plotH) {
  const midY = plotY + plotH * 0.5;
  const ampY = plotH * 0.36;

  ctx.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const x = plotX + (i / (samples.length - 1)) * plotW;
    const y = midY - samples[i] * ampY;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
}

function drawPhosphorTrace(ctx, samples, plotX, plotY, plotW, plotH, outerColor, coreColor) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Wide outer phosphor bloom
  drawTracePath(ctx, samples, plotX, plotY, plotW, plotH);
  ctx.strokeStyle = outerColor;
  ctx.lineWidth = 7.5;
  ctx.globalAlpha = 0.28;
  ctx.shadowColor = outerColor;
  ctx.shadowBlur = 18;
  ctx.stroke();

  // Medium beam
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 3.6;
  ctx.shadowBlur = 10;
  ctx.stroke();

  // Hot beam core
  ctx.globalAlpha = 1.0;
  ctx.strokeStyle = coreColor;
  ctx.lineWidth = 1.8;
  ctx.shadowBlur = 0;
  ctx.stroke();

  ctx.restore();
}

function drawGraticule(ctx, rect) {
  ctx.save();
  const cols = 10;
  const rows = 4;

  ctx.strokeStyle = 'rgba(255, 181, 69, 0.11)';
  ctx.lineWidth = 1;

  for (let c = 1; c < cols; c++) {
    const x = rect.x + (rect.width * c) / cols;
    ctx.beginPath();
    ctx.moveTo(x, rect.y + 8);
    ctx.lineTo(x, rect.y + rect.height - 8);
    ctx.stroke();
  }

  for (let r = 1; r < rows; r++) {
    const y = rect.y + (rect.height * r) / rows;
    ctx.beginPath();
    ctx.moveTo(rect.x + 8, y);
    ctx.lineTo(rect.x + rect.width - 8, y);
    ctx.stroke();
  }

  // Center zero-axis line
  const midY = rect.y + rect.height * 0.5;
  ctx.strokeStyle = 'rgba(255, 181, 69, 0.24)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rect.x + 12, midY);
  ctx.lineTo(rect.x + rect.width - 12, midY);
  ctx.stroke();

  // Corner calibration brackets
  const bLen = 16;
  const pad = 12;
  ctx.strokeStyle = PALETTE.amberDim;
  ctx.lineWidth = 2;
  const corners = [
    [rect.x + pad, rect.y + pad, 1, 1],
    [rect.x + rect.width - pad, rect.y + pad, -1, 1],
    [rect.x + pad, rect.y + rect.height - pad, 1, -1],
    [rect.x + rect.width - pad, rect.y + rect.height - pad, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * bLen, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * bLen);
    ctx.stroke();
  }

  ctx.restore();
}

function drawMeterBar(ctx, x, y, width, height, ratio, fillColor, label, valueText) {
  ctx.save();
  ctx.font = fontSpec(FONTS.label, 16);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = PALETTE.amber;
  ctx.fillText(label, x, y - 5);

  ctx.font = fontSpec(FONTS.mono, 16);
  ctx.textAlign = 'right';
  ctx.fillStyle = fillColor;
  ctx.fillText(valueText, x + width, y - 5);

  drawRoundedRect(ctx, x, y, width, height, 4);
  ctx.fillStyle = 'rgba(17, 25, 44, 0.9)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = PALETTE.panelBorder;
  ctx.stroke();

  const innerW = Math.max(0, (width - 4) * clamp(ratio, 0, 1));
  if (innerW > 0) {
    drawRoundedRect(ctx, x + 2, y + 2, innerW, height - 4, 3);
    ctx.fillStyle = fillColor;
    ctx.shadowColor = fillColor;
    ctx.shadowBlur = 10;
    ctx.fill();
  }
  ctx.restore();
}

export function drawOscilloscope(ctx, runState, dial, tuning, station, time, rect = OSCILLOSCOPE_RECT) {
  const flash = runState.flashEffect;
  let borderStroke = PALETTE.panelBorder;
  let outerColor = PALETTE.amber;
  let coreColor = PALETTE.amberBright;

  if (flash.strength > 0.05) {
    if (flash.tone === 'teal') {
      borderStroke = PALETTE.teal;
      outerColor = PALETTE.teal;
      coreColor = PALETTE.tealBright;
    } else if (flash.tone === 'magenta') {
      borderStroke = PALETTE.magenta;
      outerColor = PALETTE.magenta;
      coreColor = PALETTE.magentaBright;
    }
  } else if (tuning.clarity > 0.78 && runState.activeSignal) {
    outerColor = PALETTE.teal;
    coreColor = PALETTE.tealBright;
  }

  drawPanel(ctx, rect.x, rect.y, rect.width, rect.height, {
    radius: 12,
    fill: '#060a14',
    stroke: borderStroke,
    lineWidth: 2.5,
  });

  ctx.save();
  drawRoundedRect(ctx, rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4, 10);
  ctx.clip();

  drawGraticule(ctx, rect);

  // Subtle flash tint overlay
  if (flash.strength > 0.02) {
    const tint =
      flash.tone === 'teal'
        ? `rgba(53, 224, 200, ${0.14 * flash.strength})`
        : flash.tone === 'magenta'
          ? `rgba(255, 79, 154, ${0.18 * flash.strength})`
          : `rgba(255, 181, 69, ${0.1 * flash.strength})`;
    ctx.fillStyle = tint;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  const samples = buildWaveformSamples(
    220,
    time,
    dial.needleFrequency,
    runState.activeSignal,
    tuning,
    station,
  );
  drawPhosphorTrace(
    ctx,
    samples,
    rect.x + 20,
    rect.y + 38,
    rect.width - 40,
    rect.height - 78,
    outerColor,
    coreColor,
  );

  // Top-left: Carrier Clarity meter
  const clarityPct = Math.round(tuning.clarity * 100);
  const clarityColor = tuning.clarity > 0.78 ? PALETTE.teal : PALETTE.amber;
  drawMeterBar(
    ctx,
    rect.x + 26,
    rect.y + 36,
    240,
    14,
    tuning.clarity,
    clarityColor,
    'CARRIER CLARITY',
    `${clarityPct}%`,
  );

  // Top-right: Signal Decay meter
  const signal = runState.activeSignal;
  const decayRatio = signal && signal.maxDecay > 0 ? signal.decayRemaining / signal.maxDecay : 0;
  const decayDanger = signal && decayRatio <= 0.25;
  const decayColor = decayDanger ? PALETTE.magenta : PALETTE.amber;
  const decayText = signal ? `${signal.decayRemaining.toFixed(1)}s` : 'SCAN';
  drawMeterBar(
    ctx,
    rect.x + rect.width - 266,
    rect.y + 36,
    240,
    14,
    decayRatio,
    decayColor,
    'SIGNAL INTEGRITY',
    decayText,
  );

  // Bottom status / feedback strip inside CRT
  const fb = runState.feedback;
  if (fb && fb.timer > 0) {
    const toneColor =
      fb.tone === 'teal' ? PALETTE.teal : fb.tone === 'magenta' ? PALETTE.magenta : PALETTE.amber;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = fontSpec(FONTS.display, 24);
    ctx.fillStyle = toneColor;
    ctx.shadowColor = toneColor;
    ctx.shadowBlur = 10;
    ctx.fillText(`${fb.title}  •  ${fb.detail}`, rect.x + rect.width * 0.5, rect.y + rect.height - 26);
    ctx.shadowBlur = 0;
  } else if (signal) {
    const hint =
      tuning.clarity > 0.78
        ? 'CARRIER SHARP — PRESS SPACE TO LOCK'
        : `NOISE PROFILE: ${station.noiseCharacter.toUpperCase()} — SWEEP DIAL TO ISOLATE SINE`;
    const hintColor = tuning.clarity > 0.78 ? PALETTE.teal : PALETTE.amber;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = fontSpec(FONTS.label, 19);
    ctx.fillStyle = hintColor;
    ctx.fillText(hint, rect.x + rect.width * 0.5, rect.y + rect.height - 26);
  }

  ctx.restore();
}

/**
 * Live idle oscilloscope drawn behind the Title screen.
 */
export function drawIdleOscilloscope(ctx, rect, time) {
  drawPanel(ctx, rect.x, rect.y, rect.width, rect.height, {
    radius: 14,
    fill: '#060a14',
    stroke: PALETTE.panelBorder,
    lineWidth: 2,
  });

  ctx.save();
  drawRoundedRect(ctx, rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4, 12);
  ctx.clip();
  drawGraticule(ctx, rect);

  const count = 200;
  const samples = new Float32Array(count);
  const sweep = 0.5 + 0.5 * Math.sin(time * 0.65);

  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const windowScale = 0.25 + 0.75 * Math.sin(u * Math.PI);
    const carrier = Math.sin(u * Math.PI * 2 * 3.5 - time * 4.5) * (0.35 + 0.45 * sweep);
    const staticNoise = hashSample(u * 210 + Math.floor(time * 32) * 1.9) * (0.55 - 0.38 * sweep);
    samples[i] = clamp((carrier + staticNoise) * windowScale, -1.0, 1.0);
  }

  const outer = sweep > 0.8 ? PALETTE.teal : PALETTE.amber;
  const core = sweep > 0.8 ? PALETTE.tealBright : PALETTE.amberBright;
  drawPhosphorTrace(ctx, samples, rect.x + 20, rect.y + 20, rect.width - 40, rect.height - 40, outer, core);
  ctx.restore();
}
