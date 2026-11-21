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

export function hangarMounts(items, kind) {
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
    return `<image href="${spriteUrl(key, 'hangar')}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"/>`;
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
