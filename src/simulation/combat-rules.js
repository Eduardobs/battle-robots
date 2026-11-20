import { guns } from '../catalog.js';
import { RADIUS } from './arena.js';

export const THAW_DURATION = 1;
export const CONTROL_RECOVERY = 0.75;
export const CONTACT_RANGE = RADIUS * 2;
export const ECHO_RADIUS = 36;
export const weaponRange = key => guns[key].range ?? CONTACT_RANGE;
export const keepsRange = robot => robot.strategy === 'distance' || robot.strategy === 'flank';
export const preferredRange = range => range - Math.min(10, range * 0.1);

export function firingRange(robot) {
  const ranged = keepsRange(robot);
  let range = ranged ? -Infinity : Infinity;
  for (const { key } of robot.guns) {
    if (ranged && key === 'hook' && robot.guns.length > 1) continue;
    const reach = weaponRange(key);
    range = ranged ? Math.max(range, reach) : Math.min(range, reach);
  }
  return Number.isFinite(range) ? range : CONTACT_RANGE + 4;
}
