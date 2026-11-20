import { RADIUS, withinSpikeBorder } from './arena.js';
import { blocked, distance, expand } from './geometry.js';

export function prepareNavigation(walls, spikePatches) {
  const solids = walls.map(wall => expand(wall, RADIUS));
  const hazards = spikePatches.map(rect => expand(rect, RADIUS));
  const barriers = [...solids, ...hazards];
  const nodes = barriers.flatMap(barrier => {
    const { x, y, w, h } = expand(barrier, 5);
    return [{ x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h }];
  }).filter(point => !withinSpikeBorder(point));
  const edges = nodes.map(start => nodes.map(end =>
    blocked(start, end, barriers) ? Infinity : distance(start, end)));
  return { solids, hazards, barriers, nodes, edges };
}

export function nextWaypoint(start, end, { barriers, nodes, edges }, measure = false) {
  if (!blocked(start, end, barriers)) return measure ? distance(start, end) : end;
  const costs = nodes.map(node => blocked(start, node, barriers) ? Infinity : distance(start, node));
  const exits = nodes.map(node => blocked(node, end, barriers) ? Infinity : distance(node, end));
  const first = [...nodes];
  const visited = new Set();
  let best = Infinity;
  let waypoint = start;
  while (visited.size < nodes.length) {
    let current = -1;
    costs.forEach((cost, index) => {
      if (!visited.has(index) && cost < (costs[current] ?? Infinity)) current = index;
    });
    if (current < 0 || costs[current] >= best) break;
    visited.add(current);
    if (costs[current] + exits[current] < best) {
      best = costs[current] + exits[current];
      waypoint = first[current];
    }
    edges[current].forEach((weight, index) => {
      if (costs[current] + weight < costs[index]) {
        costs[index] = costs[current] + weight;
        first[index] = first[current];
      }
    });
  }
  return measure ? best : waypoint;
}
