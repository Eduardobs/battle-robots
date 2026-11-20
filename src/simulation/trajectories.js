import { EDGE, HEIGHT, RADIUS, WIDTH } from './arena.js';
import { blocked, distance, impact, pathClearance, pointAlong, rectangleAxes } from './geometry.js';

export const DODGE_CLEARANCE = RADIUS + 4;

export function projectileLeg(from, direction, range, walls, previousWall) {
  const { x, y } = direction;
  const limitX = x < 0 ? EDGE : WIDTH - EDGE;
  const limitY = y < 0 ? EDGE : HEIGHT - EDGE;
  const spanX = x ? (limitX - from.x) / x : Infinity;
  const spanY = y ? (limitY - from.y) / y : Infinity;
  const span = Math.min(range, spanX, spanY);
  const far = { x: from.x + x * span, y: from.y + y * span };
  let fraction = 1;
  let surface = null;
  for (const wall of walls) {
    if (wall === previousWall) continue;
    const entry = impact(from, far, wall);
    if (entry !== null && entry <= fraction) {
      fraction = entry;
      surface = wall;
    }
  }

  const to = pointAlong(from, far, fraction);
  const flipsX = surface
    ? x && Math.abs(to.x - (x > 0 ? surface.x : surface.x + surface.w)) < 1e-8
    : span === spanX;
  const flipsY = surface
    ? y && Math.abs(to.y - (y > 0 ? surface.y : surface.y + surface.h)) < 1e-8
    : span === spanY;
  const reflection = flipsX || flipsY ? { x: flipsX ? -x : x, y: flipsY ? -y : y } : null;
  return { to, reflection, surface };
}

export function robotImpact(from, to, target, radius = RADIUS) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const x = from.x - target.x;
  const y = from.y - target.y;
  const gap = x * x + y * y - radius ** 2;
  if (gap <= 0) return 0;
  const lengthSquared = dx * dx + dy * dy;
  const projection = x * dx + y * dy;
  const discriminant = projection ** 2 - lengthSquared * gap;
  if (!lengthSquared || projection >= 0 || discriminant < 0) return Infinity;
  const entry = (-projection - Math.sqrt(discriminant)) / lengthSquared;
  return entry <= 1 ? entry : Infinity;
}

export function entersProjectilePath(start, end, axis, { from, to }) {
  const clearance = DODGE_CLEARANCE - 1e-8;
  if (pathClearance(start, from, to) < clearance) return false;
  // The swept path of an axis-aligned move is a rectangle with circular ends.
  const padX = axis === 'y' ? clearance : 0;
  const padY = axis === 'x' ? clearance : 0;
  const swept = {
    x: Math.min(start.x, end.x) - padX, y: Math.min(start.y, end.y) - padY,
    w: Math.abs(end.x - start.x) + padX * 2, h: Math.abs(end.y - start.y) + padY * 2,
  };
  return impact(from, to, swept) !== null ||
    robotImpact(from, to, end, clearance) !== Infinity;
}

export function bouncePoint(from, to, walls, range) {
  let best;
  for (const wall of walls) {
    for (const [axis, length] of rectangleAxes) {
      const cross = axis === 'x' ? 'y' : 'x';
      const crossLength = axis === 'x' ? 'h' : 'w';
      for (const face of [wall[axis], wall[axis] + wall[length]]) {
        const side = face === wall[axis] ? -1 : 1;
        if ((from[axis] - face) * side <= 0 || (to[axis] - face) * side <= 0) continue;
        const mirror = { ...to, [axis]: 2 * face - to[axis] };
        const point = pointAlong(from, mirror, (face - from[axis]) / (mirror[axis] - from[axis]));
        point[axis] = face;
        if (point[cross] < wall[cross] || point[cross] > wall[cross] + wall[crossLength]) continue;
        const gap = distance(from, point) + distance(point, to);
        const outside = { ...point, [axis]: face + side * 0.001 };
        if (gap > range || blocked(from, outside, walls) || blocked(outside, to, walls)) continue;
        best = point;
        range = gap;
      }
    }
  }
  return best;
}
