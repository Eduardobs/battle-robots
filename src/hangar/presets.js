import { ATTRIBUTES_BASE, ATTRIBUTES_POINTS, GUNS_QUANTITY, UTILS_QUANTITY } from '../../config.js';
import { attributes, guns } from '../catalog.js';

const MAX_SPEED_POINTS = 100;

export const presets = {
  brawler: {
    strategy: 'advance',
    weights: { hp: 28, defense: 21, attack: 32, speed: 9, power: 10 },
    guns: ['saw', 'hook', 'hammer', 'nitrogen', 'flame', 'pistol', 'echo', 'disc', 'pulse'],
    utils: ['shield', 'nitro', 'treads', 'beacon', 'hologram'],
  },
  marksman: {
    strategy: 'distance',
    weights: { hp: 24, defense: 15, attack: 31, speed: 12, projectileSpeed: 18 },
    guns: ['disc', 'pistol', 'hook', 'echo', 'nitrogen', 'flame', 'pulse', 'hammer', 'saw'],
    utils: ['nitro', 'shield', 'treads', 'hologram', 'beacon'],
  },
  raider: {
    strategy: 'intercept',
    weights: { hp: 24, defense: 16, attack: 33, speed: 17, projectileSpeed: 10 },
    guns: ['flame', 'nitrogen', 'hook', 'pistol', 'echo', 'saw', 'hammer', 'disc', 'pulse'],
    utils: ['nitro', 'treads', 'shield', 'beacon', 'hologram'],
  },
  skirmisher: {
    strategy: 'skirmish',
    weights: { hp: 25, defense: 17, attack: 35, speed: 13, projectileSpeed: 10 },
    guns: ['nitrogen', 'echo', 'flame', 'pistol', 'disc', 'hook', 'hammer', 'saw', 'pulse'],
    utils: ['hologram', 'shield', 'nitro', 'treads', 'beacon'],
  },
  survivor: {
    strategy: 'score',
    weights: { hp: 35, defense: 26, attack: 24, speed: 10, projectileSpeed: 5 },
    guns: ['pistol', 'disc', 'nitrogen', 'flame', 'echo', 'hook', 'pulse', 'hammer', 'saw'],
    utils: ['shield', 'treads', 'nitro', 'beacon', 'hologram'],
  },
};

export function createPreset(key, {
  points = ATTRIBUTES_POINTS, base = ATTRIBUTES_BASE, gunCount = GUNS_QUANTITY, toolCount = UTILS_QUANTITY,
} = {}) {
  const preset = presets[key];
  const weapons = preset.guns.slice(0, gunCount);
  const tools = preset.utils.slice(0, toolCount);
  const weights = { ...preset.weights };
  if (!weapons.length) weights.attack = weights.power = 0;
  if (!weapons.some(weapon => guns[weapon].projectileSpeed)) weights.projectileSpeed = 0;

  let total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const cappedSpeed = points * weights.speed > MAX_SPEED_POINTS * total ? MAX_SPEED_POINTS : 0;
  if (cappedSpeed) {
    points -= cappedSpeed;
    total -= weights.speed;
    weights.speed = 0;
  }
  const shares = attributes.map(({ id }) => {
    const weightedPoints = points * (weights[id] ?? 0);
    return { id, points: Math.floor(weightedPoints / total), remainder: weightedPoints % total };
  });
  const stats = Object.fromEntries(shares.map(share => [share.id, base + share.points]));
  const used = shares.reduce((sum, share) => sum + share.points, 0);
  // Assign rounding leftovers to the attributes with the largest fractional shares.
  shares.sort((a, b) => b.remainder - a.remainder);
  for (const { id } of shares.slice(0, points - used)) stats[id]++;
  stats.speed += cappedSpeed;

  return { stats, guns: weapons, utils: tools, strategy: preset.strategy };
}
