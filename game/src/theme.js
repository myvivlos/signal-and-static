export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;

export const PALETTE = {
  bg: '#05070d',
  panel: '#0b101d',
  panelRaised: '#11192c',
  panelBorder: '#283652',
  amber: '#ffb545',
  amberBright: '#ffe3a8',
  amberDim: '#9a651b',
  amberFaint: 'rgba(255, 181, 69, 0.14)',
  teal: '#35e0c8',
  tealBright: '#a6fff1',
  tealDim: '#176e64',
  tealFaint: 'rgba(53, 224, 200, 0.16)',
  magenta: '#ff4f9a',
  magentaBright: '#ffb3d3',
  magentaDim: '#7a1f47',
  magentaFaint: 'rgba(255, 79, 154, 0.18)',
};

export const FONTS = {
  display: '900 %px Impact, "Arial Narrow", "DIN Condensed", "Roboto Condensed", system-ui, sans-serif',
  label: '700 %px "Arial Narrow", "Roboto Condensed", Impact, system-ui, sans-serif',
  mono: '700 %px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
};

export function fontSpec(template, sizePx) {
  return template.replace('%', String(Math.round(sizePx)));
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Deterministic Mulberry32 PRNG for repeatable runs and waveforms.
 */
export function createRng(seed) {
  let state = (seed >>> 0) || 1;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawPanel(ctx, x, y, width, height, options = {}) {
  const {
    radius = 10,
    fill = PALETTE.panel,
    stroke = PALETTE.panelBorder,
    lineWidth = 2,
    glowColor = null,
    glowBlur = 0,
  } = options;

  ctx.save();
  if (glowColor && glowBlur > 0) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur;
  }
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
}

export function drawGlowText(ctx, text, x, y, options = {}) {
  const {
    font = fontSpec(FONTS.display, 48),
    color = PALETTE.amber,
    glowColor = color,
    glowBlur = 14,
    align = 'center',
    baseline = 'middle',
    maxWidth = undefined,
  } = options;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (glowBlur > 0) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur;
  }
  ctx.fillStyle = color;
  if (maxWidth !== undefined) {
    ctx.fillText(text, x, y, maxWidth);
  } else {
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

export function drawKeycapButton(ctx, rect, label, options = {}) {
  const {
    accent = PALETTE.amber,
    active = false,
    fontSize = 20,
  } = options;

  ctx.save();
  drawRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 8);
  ctx.fillStyle = active ? accent : PALETTE.panelRaised;
  if (active) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16;
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = accent;
  ctx.stroke();

  ctx.font = fontSpec(FONTS.display, fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = active ? PALETTE.bg : accent;
  ctx.fillText(label, rect.x + rect.width * 0.5, rect.y + rect.height * 0.5 + 1, rect.width - 20);
  ctx.restore();
}

let cachedOverlayCanvas = null;

function buildOverlayCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = STAGE_WIDTH;
  canvas.height = STAGE_HEIGHT;
  const octx = canvas.getContext('2d');

  // Subtle horizontal phosphor scanlines across the whole CRT stage
  octx.fillStyle = 'rgba(0, 0, 0, 0.20)';
  for (let y = 0; y < STAGE_HEIGHT; y += 3) {
    octx.fillRect(0, y, STAGE_WIDTH, 1);
  }

  // Deep radial vignette for late-night tower framing
  const cx = STAGE_WIDTH * 0.5;
  const cy = STAGE_HEIGHT * 0.48;
  const grad = octx.createRadialGradient(cx, cy, STAGE_HEIGHT * 0.36, cx, cy, STAGE_WIDTH * 0.68);
  grad.addColorStop(0, 'rgba(5, 7, 13, 0)');
  grad.addColorStop(0.72, 'rgba(5, 7, 13, 0.22)');
  grad.addColorStop(1, 'rgba(2, 3, 7, 0.72)');
  octx.fillStyle = grad;
  octx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

  return canvas;
}

export function drawStageOverlay(ctx) {
  if (!cachedOverlayCanvas) {
    cachedOverlayCanvas = buildOverlayCanvas();
  }
  ctx.drawImage(cachedOverlayCanvas, 0, 0);
}

export function formatClock(seconds) {
  const clamped = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
