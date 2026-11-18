import {
  DIAL_TRACK_RECT,
  LOCK_BUTTON_RECT,
  MAX_FREQ,
  MIN_FREQ,
  frequencyToX,
} from './dial.js';
import {
  TOTAL_TRANSMISSIONS,
  TRANSMISSIONS_PER_STATION,
  getStationForIndex,
} from './levels.js';
import { MAX_RELAYS } from './signals.js';
import {
  FONTS,
  PALETTE,
  drawGlowText,
  drawKeycapButton,
  drawPanel,
  drawRoundedRect,
  fontSpec,
  formatClock,
} from './theme.js';

export const MUTE_BUTTON_RECT = {
  x: 1150,
  y: 28,
  width: 76,
  height: 66,
};

function drawRelayLamps(ctx, x, y, relaysRemaining) {
  ctx.save();
  ctx.font = fontSpec(FONTS.label, 15);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.amber;
  ctx.fillText('RELAYS', x + 58, y + 6);

  const radius = 13;
  const spacing = 36;
  const cy = y + 41;

  for (let i = 0; i < MAX_RELAYS; i++) {
    const cx = x + 22 + i * spacing;
    const intact = i < relaysRemaining;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);

    if (intact) {
      ctx.fillStyle = PALETTE.amber;
      ctx.shadowColor = PALETTE.amber;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = PALETTE.amberBright;
      ctx.stroke();

      // Inner filament highlight
      ctx.beginPath();
      ctx.arc(cx - 3, cy - 3, 4, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.amberBright;
      ctx.fill();
    } else {
      ctx.fillStyle = '#1b0b15';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = PALETTE.magenta;
      ctx.stroke();

      // Burned X mark
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 6);
      ctx.lineTo(cx + 6, cy + 6);
      ctx.moveTo(cx + 6, cy - 6);
      ctx.lineTo(cx - 6, cy + 6);
      ctx.strokeStyle = PALETTE.magenta;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawTopHud(ctx, runState, audioMuted) {
  const station = getStationForIndex(runState.stationIndex);

  // Left: Station & Transmission Pips
  drawPanel(ctx, 44, 18, 412, 86, { radius: 10 });
  ctx.save();
  ctx.font = fontSpec(FONTS.display, 26);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.amber;
  ctx.fillText(`${station.code} // ${station.name}`, 62, 27);

  ctx.font = fontSpec(FONTS.label, 15);
  ctx.fillStyle = PALETTE.amberBright;
  ctx.fillText(station.subtitle, 62, 58);

  // 4 transmission pips for current station
  const pipStartX = 62;
  const pipY = 80;
  for (let i = 0; i < TRANSMISSIONS_PER_STATION; i++) {
    const px = pipStartX + i * 32;
    const done = i < runState.slotInStation;
    const current = i === runState.slotInStation;
    drawRoundedRect(ctx, px, pipY, 24, 10, 3);
    if (done) {
      ctx.fillStyle = PALETTE.teal;
      ctx.shadowColor = PALETTE.teal;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (current) {
      ctx.fillStyle = PALETTE.amber;
      ctx.fill();
    } else {
      ctx.fillStyle = '#172136';
      ctx.fill();
      ctx.strokeStyle = PALETTE.panelBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.font = fontSpec(FONTS.mono, 16);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.teal;
  ctx.fillText(
    `TX ${Math.min(runState.completedTransmissions + 1, TOTAL_TRANSMISSIONS)}/${TOTAL_TRANSMISSIONS}`,
    438,
    84,
  );
  ctx.restore();

  // Center: Score & Streak
  drawPanel(ctx, 470, 18, 326, 86, { radius: 10 });
  ctx.save();
  ctx.font = fontSpec(FONTS.label, 15);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.amber;
  ctx.fillText('SCORE', 490, 26);

  drawGlowText(ctx, String(runState.score).padStart(5, '0'), 490, 71, {
    font: fontSpec(FONTS.mono, 36),
    color: PALETTE.amberBright,
    glowColor: PALETTE.amber,
    glowBlur: 10,
    align: 'left',
    baseline: 'middle',
  });

  ctx.font = fontSpec(FONTS.label, 15);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = runState.streak > 0 ? PALETTE.teal : PALETTE.amber;
  ctx.fillText('STREAK', 776, 26);

  const streakColor = runState.streak >= 2 ? PALETTE.teal : runState.streak === 1 ? PALETTE.amber : PALETTE.amberDim;
  drawGlowText(ctx, `x${runState.streak}`, 776, 71, {
    font: fontSpec(FONTS.display, 36),
    color: streakColor,
    glowColor: streakColor,
    glowBlur: runState.streak > 0 ? 12 : 0,
    align: 'right',
    baseline: 'middle',
  });
  ctx.restore();

  // Right: Clock, Relays, Mute
  const clockDanger = runState.clock <= 20;
  drawPanel(ctx, 810, 18, 426, 86, {
    radius: 10,
    stroke: clockDanger ? PALETTE.magenta : PALETTE.panelBorder,
  });

  ctx.save();
  ctx.font = fontSpec(FONTS.label, 15);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = clockDanger ? PALETTE.magenta : PALETTE.amber;
  ctx.fillText('TOWER CLOCK', 830, 26);

  drawGlowText(ctx, formatClock(runState.clock), 830, 71, {
    font: fontSpec(FONTS.mono, 36),
    color: clockDanger ? PALETTE.magentaBright : PALETTE.amberBright,
    glowColor: clockDanger ? PALETTE.magenta : PALETTE.amber,
    glowBlur: clockDanger ? 14 : 8,
    align: 'left',
    baseline: 'middle',
  });
  ctx.restore();

  drawRelayLamps(ctx, 996, 20, runState.relays);

  // Mute toggle button
  drawKeycapButton(ctx, MUTE_BUTTON_RECT, audioMuted ? 'M: OFF' : 'M: ON', {
    accent: audioMuted ? PALETTE.magenta : PALETTE.amber,
    fontSize: 17,
  });
}

export function drawDialPanel(ctx, dial, station, tuning, lockFlash) {
  const panelRect = { x: 44, y: 464, width: 1192, height: 236 };
  drawPanel(ctx, panelRect.x, panelRect.y, panelRect.width, panelRect.height, {
    radius: 12,
    fill: PALETTE.panel,
    stroke: PALETTE.panelBorder,
    lineWidth: 2.5,
  });

  // Panel header
  ctx.save();
  ctx.font = fontSpec(FONTS.label, 17);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.amber;
  ctx.fillText('MAIN TUNING BAND  •  0.0 – 100.0 MHz', 84, 492);
  ctx.restore();

  // Dial scale recess
  const track = DIAL_TRACK_RECT;
  drawPanel(ctx, track.x - 12, track.y, track.width + 24, track.height, {
    radius: 10,
    fill: '#060a14',
    stroke: dial.isDragging || dial.isHoveringTrack ? PALETTE.amber : PALETTE.panelBorder,
    lineWidth: 2,
  });

  ctx.save();
  const baselineY = track.y + 72;

  // Horizontal band rail
  ctx.strokeStyle = 'rgba(255, 181, 69, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(track.x, baselineY);
  ctx.lineTo(track.x + track.width, baselineY);
  ctx.stroke();

  // Station reference ticks along top edge of scale
  for (const markFreq of station.stationTicks) {
    const mx = frequencyToX(markFreq, track);
    ctx.fillStyle = PALETTE.teal;
    ctx.beginPath();
    ctx.moveTo(mx, track.y + 12);
    ctx.lineTo(mx - 5, track.y + 4);
    ctx.lineTo(mx + 5, track.y + 4);
    ctx.closePath();
    ctx.fill();
  }

  // Frequency scale ticks (0..100 MHz)
  ctx.font = fontSpec(FONTS.mono, 14);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let mhz = MIN_FREQ; mhz <= MAX_FREQ; mhz += 1) {
    const tx = frequencyToX(mhz, track);
    const isMajor = mhz % 10 === 0;
    const isMid = mhz % 5 === 0;
    const tickH = isMajor ? 28 : isMid ? 18 : 10;

    ctx.strokeStyle = isMajor
      ? PALETTE.amber
      : isMid
        ? 'rgba(255, 181, 69, 0.65)'
        : 'rgba(255, 181, 69, 0.28)';
    ctx.lineWidth = isMajor ? 2.2 : 1.2;

    ctx.beginPath();
    ctx.moveTo(tx, baselineY - tickH);
    ctx.lineTo(tx, baselineY + 4);
    ctx.stroke();

    if (isMajor) {
      ctx.fillStyle = PALETTE.amberBright;
      ctx.fillText(String(mhz), tx, baselineY + 11);
    }
  }

  // Tuning needle
  const needleX = frequencyToX(dial.needleFrequency, track);
  const needleColor = tuning.clarity > 0.78 ? PALETTE.teal : PALETTE.amber;

  ctx.shadowColor = needleColor;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = needleColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(needleX, track.y + 8);
  ctx.lineTo(needleX, track.y + track.height - 8);
  ctx.stroke();

  // Needle diamond cap
  ctx.fillStyle = PALETTE.amberBright;
  ctx.beginPath();
  ctx.moveTo(needleX, track.y + 18);
  ctx.lineTo(needleX - 9, track.y + 4);
  ctx.lineTo(needleX + 9, track.y + 4);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // Digital MHz Readout Box (right side)
  drawPanel(ctx, 944, 486, 262, 82, {
    radius: 10,
    fill: '#060a14',
    stroke: needleColor,
    lineWidth: 2,
  });

  ctx.font = fontSpec(FONTS.label, 14);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.amber;
  ctx.fillText('TUNED FREQUENCY', 962, 496);

  drawGlowText(ctx, `${dial.frequency.toFixed(1)} MHz`, 1075, 539, {
    font: fontSpec(FONTS.mono, 34),
    color: tuning.clarity > 0.78 ? PALETTE.tealBright : PALETTE.amberBright,
    glowColor: needleColor,
    glowBlur: 10,
    align: 'center',
    baseline: 'middle',
  });

  // Lock Action Button
  const lockAccent = tuning.clarity > 0.78 ? PALETTE.teal : PALETTE.amber;
  drawKeycapButton(ctx, LOCK_BUTTON_RECT, '[ SPACE ] LOCK SIGNAL', {
    accent: lockAccent,
    active: lockFlash > 0.15,
    fontSize: 18,
  });

  // Bottom control legend
  ctx.font = fontSpec(FONTS.label, 17);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.amberBright;
  ctx.fillText(
    'A / D OR ARROWS / MOUSE OVER DIAL: TUNE   •   SPACE: LOCK TRANSMISSION   •   M: TOGGLE AUDIO',
    panelRect.x + panelRect.width * 0.5,
    674,
  );
  ctx.restore();
}
