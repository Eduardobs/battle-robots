import { circleImpact, clamp, expand, impact } from './geometry.js';

export const WIDTH = 1040;
export const HEIGHT = 540;
export const EDGE = 18;
export const RADIUS = 19;
const SPIKE_BORDER = 10;
const SPIKE_INSET = EDGE + SPIKE_BORDER + RADIUS + 1;

const ROLLER_WIDTH = 96;
const ROLLER_HEIGHT = 18;
const rollerX = (WIDTH - ROLLER_WIDTH) / 2;
const rollers = [EDGE, HEIGHT - EDGE - ROLLER_HEIGHT].map(y =>
  ({ x: rollerX, y, w: ROLLER_WIDTH, h: ROLLER_HEIGHT }));

// Sweep the circular chassis against the faces and rounded contact zones at each corner.
export function rollerContact(start, end) {
  let first = Infinity;
  for (const rect of rollers) {
    if (impact(start, end, expand(rect, RADIUS)) === null) continue;
    const { x, y, w, h } = rect;
    first = Math.min(first,
      impact(start, end, { x: x - RADIUS, y, w: w + 2 * RADIUS, h }) ?? Infinity,
      impact(start, end, { x, y: y - RADIUS, w, h: h + 2 * RADIUS }) ?? Infinity);
    for (const cx of [x, x + w]) {
      for (const cy of [y, y + h]) {
        first = Math.min(first, circleImpact(start, end, { x: cx, y: cy }, RADIUS));
      }
    }
  }
  return first;
}

export const withinSpikeBorder = ({ x, y }) =>
  Math.min(x, WIDTH - x, y, HEIGHT - y) <= EDGE + SPIKE_BORDER + RADIUS;
export const clampToSafeInterior = ({ x, y }) => ({
  x: clamp(x, SPIKE_INSET, WIDTH - SPIKE_INSET),
  y: clamp(y, SPIKE_INSET, HEIGHT - SPIKE_INSET),
});

const spikeRim = [
  ...[EDGE, HEIGHT - EDGE - SPIKE_BORDER].flatMap(y => [EDGE, rollerX + ROLLER_WIDTH].map(x =>
    ({ x, y, w: rollerX - EDGE, h: SPIKE_BORDER }))),
  { x: EDGE, y: EDGE + SPIKE_BORDER, w: SPIKE_BORDER, h: HEIGHT - 2 * (EDGE + SPIKE_BORDER) },
  { x: WIDTH - EDGE - SPIKE_BORDER, y: EDGE + SPIKE_BORDER, w: SPIKE_BORDER, h: HEIGHT - 2 * (EDGE + SPIKE_BORDER) },
];

export function touchesSpikes({ x, y }, spikePatches) {
  return (withinSpikeBorder({ x, y }) && spikeRim.some(touches)) || spikePatches.some(touches);
  function touches(rect) {
    return Math.hypot(x - clamp(x, rect.x, rect.x + rect.w), y - clamp(y, rect.y, rect.y + rect.h)) <= RADIUS;
  }
}

export function generateArena(random, { clearCenter = false } = {}) {
  const between = (min, max) => min + random() * (max - min);
  const cells = clearCenter
    ? [[318, 142], [722, 400], [704, 135], [333, 395]]
    : [[318, 142], [520, 270], [722, 400], [704, 135], [333, 395]];
  for (let index = cells.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [cells[index], cells[other]] = [cells[other], cells[index]];
  }
  const wallCount = clearCenter ? 3 : random() < 0.5 ? 3 : 4;
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
  return { walls, mud, spikePatches, spikeRim, rollers };
}

export function inMud(robot, mud) {
  return mud.some(puddle => ((robot.x - puddle.x) / puddle.rx) ** 2 +
    ((robot.y - puddle.y) / puddle.ry) ** 2 < 1);
}
