export const attributes = [
  { id: 'hp', icon: 'heart' },
  { id: 'defense', icon: 'shield' },
  { id: 'attack', icon: 'swords' },
  { id: 'speed', icon: 'bolt' },
  { id: 'evasion', icon: 'wind' },
  { id: 'aim', icon: 'target' },
];

export const guns = {
  flame: { icon: 'flame', range: 195, interval: 0.45, damage: 4 },
  pistol: { icon: 'pistol', range: 340, interval: 1.1, damage: 11 },
  saw: { icon: 'saw', range: 64, interval: 0.23, damage: 3 },
  hammer: { icon: 'hammer', range: 76, interval: 1.7, damage: 25 },
  hook: { icon: 'hook', range: 230, interval: 1.8, damage: 5 },
};

export const utils = {
  shield: { icon: 'shield', duration: 3, cooldown: 20 },
  nitro: { icon: 'bolt', duration: 5, cooldown: 20 },
};

export const pilots = [
  { color: '#ff8b54', ink: '#ffb183', className: 'orange' },
  { color: '#64d5fe', ink: '#a0e7ff', className: 'blue' },
];

const icons = {
  swords: '<path d="m14 17 3 3m-4-2 5-5m-5 0L4 4h5l8 8M7 17l-3 3m2-7 5 5m1-8 7-6h2l-1 4-6 6"/>',
  heart: '<path d="M20.8 8.5c0 4.6-8.8 9.5-8.8 9.5S3.2 13.1 3.2 8.5a4.3 4.3 0 0 1 8.8-1 4.3 4.3 0 0 1 8.8 1Z"/>',
  shield: '<path d="M12 21s7-3.5 7-10V5l-7-2-7 2v6c0 6.5 7 10 7 10Z"/><path d="m9 12 2 2 4-4"/>',
  bolt: '<path d="m13 2-8 12h6l-1 8 9-12h-6l1-8Z"/>',
  wind: '<path d="M3 8h12a2 2 0 1 0-2-2M2 12h18a2 2 0 1 0-2-2M5 16h10a2 2 0 1 1-2 2"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  flame: '<path d="M12 22a7 7 0 0 1-5-12c0 3 2 3 2 3-1-5 4-7 4-11 4 4 7 8 7 13a7 7 0 0 1-8 7Z"/><path d="M12 22c-4-2-3-5 0-8 3 3 4 6 0 8Z"/>',
  pistol: '<path d="M3 6h18v5H11l-2 7H4l2-7H3zM12 11v3H9"/>',
  saw: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="m12 5 2-3m3 5 4-1m-2 6 3 2m-5 3 1 4m-6-2-2 3m-3-5-4 1m2-6-3-2m5-3L6 3"/>',
  hammer: '<path d="m13 3 8 8-4 4-8-8zm0 8L4 20l-2-2 9-9"/>',
  hook: '<path d="M12 3v12a5 5 0 1 0 10 0v-3l-3 3"/><circle cx="12" cy="4" r="2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l3 2"/>',
  log: '<path d="M5 3h14v18H5zM8 8h8m-8 4h8m-8 4h5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
};

export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}
