export const attributes = [
  { id: 'hp', icon: 'heart' },
  { id: 'defense', icon: 'shield' },
  { id: 'attack', icon: 'swords' },
  { id: 'speed', icon: 'bolt' },
  { id: 'projectileSpeed', icon: 'bolt' },
  { id: 'power', icon: 'wind' },
];

export const guns = {
  flame: { icon: 'flame', range: 195, interval: 0.45, damage: 4, projectileSpeed: 480 },
  nitrogen: { icon: 'snowflake', range: 210, interval: 2.5, damage: 12, projectileSpeed: 500 },
  pistol: { icon: 'pistol', range: 340, interval: 1.1, damage: 11, projectileSpeed: 1200 },
  saw: { icon: 'saw', interval: 0.23, damage: 3 },
  hammer: { icon: 'hammer', interval: 1.7, damage: 25 },
  hook: { icon: 'hook', range: 230, interval: 1.8, damage: 5, projectileSpeed: 850 },
  pulse: { icon: 'wind', range: 115, interval: 1.5, damage: 5, projectileSpeed: 660 },
  disc: { icon: 'saw', range: 440, interval: 1.6, damage: 10, projectileSpeed: 330 },
  echo: { icon: 'target', range: 250, interval: 2.4, damage: 16 },
};

export const utils = {
  shield: { icon: 'shield', duration: 3, cooldown: 20 },
  nitro: { icon: 'bolt', duration: 5, cooldown: 20 },
  beacon: { icon: 'target', duration: 4, cooldown: 20 },
  hologram: { icon: 'layers', duration: 2, cooldown: 18 },
  treads: { icon: 'wind', duration: 3, cooldown: 18 },
};

export const pilots = [
  { nameKey: 'pilot.red', color: '#ff8b54', ink: '#ffb183', className: 'orange' },
  { nameKey: 'pilot.blue', color: '#64d5fe', ink: '#a0e7ff', className: 'blue' },
];


export const equipmentCatalogs = { guns, utils, strategy: { advance: {}, distance: {}, flank: {}, intercept: {}, skirmish: {}, score: {} } };
