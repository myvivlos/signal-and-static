import { TOTAL_TRANSMISSIONS, getStationForIndex } from './levels.js';
import { getAccuracyPercent, getAverageErrorMhz } from './signals.js';
import {
  FONTS,
  PALETTE,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  drawGlowText,
  drawKeycapButton,
  drawPanel,
  fontSpec,
  formatClock,
} from './theme.js';
import { drawIdleOscilloscope } from './waves.js';

export const TITLE_START_RECT = {
  x: 430,
  y: 584,
  width: 420,
  height: 68,
};

export const RESTART_BUTTON_RECT = {
  x: 430,
  y: 572,
  width: 420,
  height: 68,
};

export function drawTitleScreen(ctx, time, audioMuted) {
  ctx.save();
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

  // Live idle oscilloscope behind the title stage
  drawIdleOscilloscope(ctx, { x: 64, y: 62, width: 1152, height: 596 }, time);

  // Translucent dark backdrop behind central typography for crisp contrast
  drawPanel(ctx, 150, 102, 980, 566, {
    radius: 16,
    fill: 'rgba(5, 7, 13, 0.84)',
    stroke: PALETTE.amber,
    lineWidth: 2.5,
    glowColor: PALETTE.amber,
    glowBlur: 18,
  });

  // Top badge
  ctx.font = fontSpec(FONTS.label, 18);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.teal;
  ctx.fillText('TOWER LISTENING POST  •  BAND 0.0 – 100.0 MHz', STAGE_WIDTH * 0.5, 144);

  // Main Logotype
  drawGlowText(ctx, 'SIGNAL & STATIC', STAGE_WIDTH * 0.5, 224, {
    font: fontSpec(FONTS.display, 102),
    color: PALETTE.amberBright,
    glowColor: PALETTE.amber,
    glowBlur: 24,
    maxWidth: 920,
  });

  // One-line tagline
  ctx.font = fontSpec(FONTS.label, 24);
  ctx.fillStyle = PALETTE.amber;
  ctx.fillText(
    'HUNT FAINT TRANSMISSIONS IN THE NOISE BEFORE THE TOWER GOES DARK.',
    STAGE_WIDTH * 0.5,
    296,
  );

  // Controls & Scoring Card
  drawPanel(ctx, 210, 344, 860, 206, {
    radius: 12,
    fill: 'rgba(11, 16, 29, 0.94)',
    stroke: PALETTE.panelBorder,
    lineWidth: 2,
  });

  const rows = [
    ['TUNE DIAL', 'A / D, ARROWS, OR MOUSE OVER DIAL', PALETTE.amberBright],
    ['LOCK SIGNAL', 'SPACE  (±2.0 MHz DECODES • >±8.0 MHz BURNS RELAY)', PALETTE.teal],
    ['OBJECTIVE', 'CLEAR 3 STATIONS OF 4 TRANSMISSIONS • 3 RELAYS', PALETTE.amberBright],
    ['AUDIO', `PRESS M TO TOGGLE SOUND  (${audioMuted ? 'MUTED' : 'ACTIVE'})`, PALETTE.amber],
  ];

  rows.forEach(([key, desc, color], idx) => {
    const ry = 382 + idx * 44;
    ctx.font = fontSpec(FONTS.display, 21);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.amber;
    ctx.fillText(key, 246, ry);

    ctx.font = fontSpec(FONTS.mono, 18);
    ctx.fillStyle = color;
    ctx.fillText(desc, 430, ry);
  });

  // Pulsing ENTER prompt button
  const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);
  drawKeycapButton(ctx, TITLE_START_RECT, 'PRESS ENTER TO BEGIN', {
    accent: pulse > 0.5 ? PALETTE.teal : PALETTE.amber,
    active: false,
    fontSize: 28,
  });

  ctx.restore();
}

function drawStatTile(ctx, x, y, width, height, label, value, color) {
  drawPanel(ctx, x, y, width, height, {
    radius: 12,
    fill: PALETTE.panelRaised,
    stroke: color,
    lineWidth: 2,
  });

  ctx.save();
  ctx.font = fontSpec(FONTS.label, 18);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.amber;
  ctx.fillText(label, x + width * 0.5, y + 18);

  drawGlowText(ctx, value, x + width * 0.5, y + height * 0.62, {
    font: fontSpec(FONTS.mono, 42),
    color,
    glowColor: color,
    glowBlur: 12,
  });
  ctx.restore();
}

export function drawWinScreen(ctx, runState, time) {
  ctx.save();
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

  drawIdleOscilloscope(ctx, { x: 64, y: 62, width: 1152, height: 596 }, time);

  drawPanel(ctx, 130, 86, 1020, 586, {
    radius: 16,
    fill: 'rgba(5, 7, 13, 0.88)',
    stroke: PALETTE.teal,
    lineWidth: 3,
    glowColor: PALETTE.teal,
    glowBlur: 20,
  });

  drawGlowText(ctx, 'TRANSMISSION COMPLETE', STAGE_WIDTH * 0.5, 170, {
    font: fontSpec(FONTS.display, 68),
    color: PALETTE.tealBright,
    glowColor: PALETTE.teal,
    glowBlur: 22,
    maxWidth: 940,
  });

  ctx.font = fontSpec(FONTS.label, 24);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.amber;
  ctx.fillText(
    `ALL 3 STATIONS CLEARED  •  ${runState.relays}/3 RELAYS INTACT  •  ${formatClock(runState.clock)} REMAINING`,
    STAGE_WIDTH * 0.5,
    244,
  );

  const accuracyPct = getAccuracyPercent(runState);
  const avgError = getAverageErrorMhz(runState);

  drawStatTile(ctx, 190, 300, 276, 136, 'FINAL SCORE', String(runState.score), PALETTE.amberBright);
  drawStatTile(ctx, 502, 300, 276, 136, 'BEST STREAK', `x${runState.bestStreak}`, PALETTE.teal);
  drawStatTile(ctx, 814, 300, 276, 136, 'ACCURACY', `${accuracyPct}%`, PALETTE.tealBright);

  ctx.font = fontSpec(FONTS.mono, 20);
  ctx.fillStyle = PALETTE.amberBright;
  ctx.fillText(
    `CLEAN DECODES: ${runState.decodedCount}/${TOTAL_TRANSMISSIONS}   •   AVG ERROR: ±${avgError.toFixed(2)} MHz`,
    STAGE_WIDTH * 0.5,
    494,
  );

  drawKeycapButton(ctx, RESTART_BUTTON_RECT, 'PRESS R TO RESTART', {
    accent: PALETTE.teal,
    fontSize: 28,
  });

  ctx.restore();
}

export function drawLoseScreen(ctx, runState, time) {
  ctx.save();
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

  drawIdleOscilloscope(ctx, { x: 64, y: 62, width: 1152, height: 596 }, time);

  drawPanel(ctx, 130, 86, 1020, 586, {
    radius: 16,
    fill: 'rgba(5, 7, 13, 0.90)',
    stroke: PALETTE.magenta,
    lineWidth: 3,
    glowColor: PALETTE.magenta,
    glowBlur: 22,
  });

  drawGlowText(ctx, 'SIGNAL LOST', STAGE_WIDTH * 0.5, 170, {
    font: fontSpec(FONTS.display, 90),
    color: PALETTE.magentaBright,
    glowColor: PALETTE.magenta,
    glowBlur: 24,
    maxWidth: 920,
  });

  const reasonText =
    runState.loseReason === 'relays'
      ? 'ALL THREE TOWER RELAYS BURNED OUT'
      : 'TOWER CLOCK EXPIRED — CARRIER LOST IN STATIC';

  ctx.font = fontSpec(FONTS.label, 25);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.magenta;
  ctx.fillText(reasonText, STAGE_WIDTH * 0.5, 246);

  const station = getStationForIndex(runState.stationIndex);
  const progressText = `${runState.completedTransmissions}/${TOTAL_TRANSMISSIONS} TX`;

  drawStatTile(ctx, 190, 300, 276, 136, 'FINAL SCORE', String(runState.score), PALETTE.amberBright);
  drawStatTile(ctx, 502, 300, 276, 136, 'PROGRESS', progressText, PALETTE.magentaBright);
  drawStatTile(ctx, 814, 300, 276, 136, 'BEST STREAK', `x${runState.bestStreak}`, PALETTE.amber);

  ctx.font = fontSpec(FONTS.mono, 20);
  ctx.fillStyle = PALETTE.amberBright;
  ctx.fillText(
    `REACHED ${station.code} // ${station.name}   •   RELAYS BURNED: ${runState.burnCount}/3`,
    STAGE_WIDTH * 0.5,
    494,
  );

  drawKeycapButton(ctx, RESTART_BUTTON_RECT, 'PRESS R TO RESTART', {
    accent: PALETTE.magenta,
    fontSize: 28,
  });

  ctx.restore();
}
