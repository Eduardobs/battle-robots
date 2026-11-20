import { clamp } from './geometry.js';

export const WIDTH = 1040;
export const HEIGHT = 540;
export const EDGE = 18;
export const RADIUS = 19;
const SPIKE_BORDER = 10;
const SPIKE_INSET = EDGE + SPIKE_BORDER + RADIUS + 1;

export const withinSpikeBorder = ({ x, y }) =>
  Math.min(x, WIDTH - x, y, HEIGHT - y) <= EDGE + SPIKE_BORDER + RADIUS;
export const clampToSafeInterior = ({ x, y }) => ({
  x: clamp(x, SPIKE_INSET, WIDTH - SPIKE_INSET),
  y: clamp(y, SPIKE_INSET, HEIGHT - SPIKE_INSET),
});

export function touchesSpikes({ x, y }, spikePatches) {
  return withinSpikeBorder({ x, y }) || spikePatches.some(rect =>
    Math.hypot(x - clamp(x, rect.x, rect.x + rect.w), y - clamp(y, rect.y, rect.y + rect.h)) <= RADIUS);
}

export function generateArena(random) {
  const between = (min, max) => min + random() * (max - min);
  const cells = [[318, 142], [520, 270], [722, 400], [704, 135], [333, 395]];
  for (let index = cells.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [cells[index], cells[other]] = [cells[other], cells[index]];
  }
  const wallCount = random() < 0.5 ? 3 : 4;
  const walls = cells.slice(0, wallCount).map(([cx, cy]) => {
    const horizontal = random() < 0.5;
    const w = horizontal ? between(83, 125) : between(32, 46);
    const h = horizontal ? between(32, 46) : between(83, 125);
    return { x: cx + between(-22, 22) - w / 2, y: cy + between(-17, 17) - h / 2, w, h };
  });
  const mud = [[176, 120], [864, 414], [533, 111], [511, 426]].map(([x, y]) => ({
    x: x + between(-30, 30), y: y + between(-22, 22),
    rx: between(38, 62), ry: between(27, 39),
  }));
  const spikePatches = cells.slice(wallCount).map(([x, y]) => ({ x: x - 29, y: y - 23, w: 58, h: 46 }));
  const spikeRim = [
    { x: EDGE, y: EDGE, w: WIDTH - 2 * EDGE, h: SPIKE_BORDER },
    { x: EDGE, y: HEIGHT - EDGE - SPIKE_BORDER, w: WIDTH - 2 * EDGE, h: SPIKE_BORDER },
    { x: EDGE, y: EDGE + SPIKE_BORDER, w: SPIKE_BORDER, h: HEIGHT - 2 * (EDGE + SPIKE_BORDER) },
    { x: WIDTH - EDGE - SPIKE_BORDER, y: EDGE + SPIKE_BORDER, w: SPIKE_BORDER, h: HEIGHT - 2 * (EDGE + SPIKE_BORDER) },
  ];
  return { walls, mud, spikePatches, spikeRim };
}

export function inMud(robot, mud) {
  return mud.some(puddle => ((robot.x - puddle.x) / puddle.rx) ** 2 +
    ((robot.y - puddle.y) / puddle.ry) ** 2 < 1);
}
