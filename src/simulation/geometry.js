export const rectangleAxes = [['x', 'w'], ['y', 'h']];
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const expand = (rect, pad) => ({
  x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2,
});
export const inside = (point, rect) => point.x >= rect.x && point.x <= rect.x + rect.w &&
  point.y >= rect.y && point.y <= rect.y + rect.h;

export function impact(a, b, rect) {
  // Most segments lie entirely on one side of the obstacle.
  if ((a.x < rect.x && b.x < rect.x) || (a.x > rect.x + rect.w && b.x > rect.x + rect.w) ||
      (a.y < rect.y && b.y < rect.y) || (a.y > rect.y + rect.h && b.y > rect.y + rect.h)) return null;
  let enter = 0;
  let leave = 1;
  for (const [axis, length] of rectangleAxes) {
    const delta = b[axis] - a[axis];
    const min = rect[axis];
    const max = min + rect[length];
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] < min || a[axis] > max) return null;
      continue;
    }
    const near = (min - a[axis]) / delta;
    const far = (max - a[axis]) / delta;
    enter = Math.max(enter, Math.min(near, far));
    leave = Math.min(leave, Math.max(near, far));
    if (enter > leave) return null;
  }
  return enter;
}

export function blocked(a, b, walls) {
  return walls.some(wall => impact(a, b, wall) !== null);
}

export function firstContact(a, b, walls) {
  let time = 1;
  for (const wall of walls) {
    const entry = impact(a, b, wall);
    if (entry !== null && entry < time) time = entry;
  }
  return pointAlong(a, b, time);
}

export function pointAlong(a, b, fraction) {
  return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
}

export function closestFraction(from, to, point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  return lengthSquared ? clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared, 0, 1) : 0;
}

export function pathClearance(point, from, to) {
  return distance(point, pointAlong(from, to, closestFraction(from, to, point)));
}

export function circleImpact(from, to, target, radius) {
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
