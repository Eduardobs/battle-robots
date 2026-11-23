import { t } from '../i18n.js';

export const spriteUrl = (key, view) => new URL(`../../assets/equipment/${key}-${view}.webp`, import.meta.url).href;
const arenaImages = new Map();

function arenaImage(key) {
  if (!arenaImages.has(key)) {
    const image = new Image();
    image.src = spriteUrl(key, 'arena');
    arenaImages.set(key, image);
  }
  return arenaImages.get(key);
}

export function hangarMounts(items, kind, id, previous) {
  if (!items.length) return '';
  const guns = kind === 'guns';
  const columns = Math.min(guns ? 3 : 2, items.length);
  const rows = Math.ceil(items.length / columns);
  const size = Math.min(guns ? 148 : 116, 280 / columns, 174 / rows);
  return items.map((key, index) => {
    const row = Math.floor(index / columns);
    const slots = Math.min(columns, items.length - row * columns);
    // Mounts follow the two axes of the deck in the chassis illustration.
    const side = 0.5 - (index % columns + 0.5) / slots;
    const depth = (row + 0.5) / rows - 0.5;
    const x = (guns ? 344 : 215) + side * (guns ? 263 : 241) + depth * 93;
    const y = (guns ? 180 : 112) - side * 75 + depth * 113;
    arenaImage(key);
    const item = `${kind}.${key}`;
    const installed = previous && previous[index] !== key;
    return `<g class="mount${installed ? ' just-installed' : ''}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 96})">
      <image href="${spriteUrl(key, 'hangar')}" width="96" height="96" aria-hidden="true"/>
      ${installed ? '<path class="mount-brackets" d="M5 25V5h20m46 0h20v20m0 46v20H71m-46 0H5V71"/>' : ''}
      <rect class="mount-target" x="12" y="12" width="72" height="72"
        rx="4" data-item="${item}" data-field="${kind}-${id}-${index}" tabindex="0" role="button" aria-haspopup="dialog" aria-label="${t(`${item}.name`)}"
        aria-describedby="${kind}-${id}-${index}-detail"/>
    </g>`;
  }).join('');
}

export function drawBattleMounts(ctx, items, guns) {
  if (!items.length) return;
  const columns = Math.min(guns ? 3 : 2, items.length);
  const rows = Math.ceil(items.length / columns);
  items.forEach(({ key }, index) => {
    const image = arenaImage(key);
    if (!image.complete || !image.naturalWidth) return;
    const row = Math.floor(index / columns);
    const slots = Math.min(columns, items.length - row * columns);
    const size = Math.min(guns ? 22 : 14, 35 / slots, (guns ? 26 : 17) / rows);
    const x = guns ? 19 - row * 24 / rows : -16 + row * 16 / rows;
    const y = ((index % columns + 0.5) / slots - 0.5) * 32;
    ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
  });
}
