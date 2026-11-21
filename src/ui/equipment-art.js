import { t } from '../i18n.js';

const spriteUrl = (key, view) => new URL(`../../assets/equipment/${key}-${view}.webp`, import.meta.url).href;
const arenaImages = new Map();

function arenaImage(key) {
  if (!arenaImages.has(key)) {
    const image = new Image();
    image.src = spriteUrl(key, 'arena');
    arenaImages.set(key, image);
  }
  return arenaImages.get(key);
}

// Visible part of each 96 × 96 hangar sprite, excluding its transparent margin and shadow.
const mountBounds = {
  beacon: [31, 23, 59, 56],
  disc: [31, 30, 76, 63],
  echo: [31, 25, 65, 57],
  flame: [25, 27, 75, 64],
  hammer: [30, 27, 80, 69],
  hologram: [31, 25, 60, 56],
  hook: [30, 26, 70, 61],
  nitro: [23, 22, 65, 57],
  nitrogen: [25, 23, 67, 61],
  pistol: [31, 23, 72, 61],
  pulse: [31, 24, 75, 67],
  saw: [31, 32, 78, 65],
  shield: [30, 29, 62, 57],
  treads: [29, 24, 65, 59],
};

export function hangarMounts(items, kind, id) {
  if (!items.length) return '';
  const guns = kind === 'guns';
  const columns = Math.min(guns ? 3 : 2, items.length);
  const rows = Math.ceil(items.length / columns);
  const size = Math.min(guns ? 215 : 164, 386 / columns, 270 / rows);
  return items.map((key, index) => {
    const row = Math.floor(index / columns);
    const slots = Math.min(columns, items.length - row * columns);
    // Paint the far side of each row first so nearer mounts cover it naturally.
    const side = 0.5 - (index % columns + 0.5) / slots;
    const depth = (row + 0.5) / rows - 0.5;
    const x = (guns ? 349 : 164) + side * (guns ? 238 : 157) + depth * 68;
    const y = (guns ? 259 : 170) - side * 63 + depth * 100;
    arenaImage(key);
    const item = `${kind}.${key}`;
    const [left, top, right, bottom] = mountBounds[key];
    return `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 96})">
      <image href="${spriteUrl(key, 'hangar')}" width="96" height="96" aria-hidden="true"/>
      <rect class="mount-target" x="${left}" y="${top}" width="${right - left}" height="${bottom - top}"
        rx="4" data-item="${item}" tabindex="0" role="img" aria-label="${t(`${item}.name`)}"
        aria-describedby="${kind}-${id}-${index}-detail"/>
    </g>`;
  }).join('');
}

export function drawBattleMounts(ctx, items, guns) {
  if (!items.length) return;
  const columns = Math.min(3, items.length);
  const rows = Math.ceil(items.length / columns);
  items.forEach(({ key }, index) => {
    const image = arenaImage(key);
    if (!image.complete || !image.naturalWidth) return;
    const row = Math.floor(index / columns);
    const slots = Math.min(columns, items.length - row * columns);
    const size = Math.min(guns ? 40 : 31, 86 / slots, 52 / rows);
    const x = (guns ? 15 : -12) + (guns ? -1 : 1) * row * 7;
    const y = ((index % columns + 0.5) / slots - 0.5) * 29;
    ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
  });
}
