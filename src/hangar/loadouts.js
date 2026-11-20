import { ATTRIBUTES_BASE, ATTRIBUTES_POINTS, GUNS_QUANTITY, UTILS_QUANTITY } from '../../config.js';
import { attributes, equipmentCatalogs, pilots } from '../catalog.js';

export const loadouts = pilots.map((_, id) => ({
  stats: Object.fromEntries(attributes.map(({ id }) => [id, ATTRIBUTES_BASE])),
  guns: [...(id === 0 ? ['flame', 'pistol'] : ['pistol', 'flame']),
    'saw', 'hammer', 'hook', 'pulse', 'disc', 'echo', 'nitrogen'].slice(0, GUNS_QUANTITY),
  utils: [...(id === 0 ? ['shield', 'nitro'] : ['nitro', 'shield']),
    'beacon', 'hologram', 'treads'].slice(0, UTILS_QUANTITY),
  strategy: id === 0 ? 'advance' : 'distance',
  ready: false,
}));

const storageKey = 'battle-robots-loadouts';
export const remaining = loadout => ATTRIBUTES_POINTS - Object.values(loadout.stats)
  .reduce((total, value) => total + value - ATTRIBUTES_BASE, 0);

export function configuration({ stats, guns, utils, strategy }) {
  return { stats, guns, utils, strategy };
}

export function validateConfiguration(value) {
  if (!value || typeof value !== 'object') return;
  const { stats: savedStats, guns, utils, strategy } = value;
  if (!savedStats || typeof savedStats !== 'object') return;
  const stats = { projectileSpeed: ATTRIBUTES_BASE, power: ATTRIBUTES_BASE, ...savedStats };
  const entries = attributes.map(({ id }) => [id, stats[id]]);
  if (entries.some(([, points]) => !Number.isInteger(points) || points < ATTRIBUTES_BASE)) return;
  const config = { stats: Object.fromEntries(entries), guns, utils, strategy };
  if (remaining(config) < 0 || typeof strategy !== 'string' ||
      !Object.hasOwn(equipmentCatalogs.strategy, strategy)) return;
  for (const [kind, count] of [['guns', GUNS_QUANTITY], ['utils', UTILS_QUANTITY]]) {
    const items = config[kind];
    if (!Array.isArray(items) || items.length !== count || new Set(items).size !== count ||
        items.some(item => typeof item !== 'string' || !Object.hasOwn(equipmentCatalogs[kind], item))) return;
  }
  return config;
}

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (Array.isArray(saved)) loadouts.forEach((loadout, id) => {
    const config = validateConfiguration(saved[id]);
    if (config) Object.assign(loadout, config);
  });
} catch {
  // Use defaults when storage is unavailable or unreadable.
}

export function saveConfigurations() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(loadouts.map(configuration)));
  } catch {
    // Changes remain available for the current page.
  }
}
