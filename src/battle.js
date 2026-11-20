import { BATTLE_TIME_IN_SECONDS } from '../config.js';
import { attributes, guns, utils } from './catalog.js';

export const WIDTH = 1040;
export const HEIGHT = 540;
export const EDGE = 18;
export const RADIUS = 19;
export const STEP = 1 / 60;

const SPEED_PER_POINT = 1.5;
const CONTACT_RANGE = RADIUS * 2;
const weaponRange = key => guns[key].range ?? CONTACT_RANGE;
const rectangleAxes = [['x', 'w'], ['y', 'h']];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const keepsRange = robot => robot.strategy === 'distance' || robot.strategy === 'flank';
const preferredRange = range => range - Math.min(10, range * 0.1);
const steeringOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6];
const expand = (rect, pad) => ({
  x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2,
});

function firingRange(robot) {
  const ranges = robot.guns.filter(item => !keepsRange(robot) || item.key !== 'hook' ||
    robot.guns.length === 1).map(item => weaponRange(item.key));
  if (!ranges.length) return RADIUS * 2 + 4;
  return keepsRange(robot) ? Math.max(...ranges) : Math.min(...ranges);
}

function impact(a, b, rect) {
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

function blocked(a, b, walls) {
  return walls.some(wall => impact(a, b, wall) !== null);
}

function firstContact(a, b, walls) {
  const time = Math.min(1, ...walls.map(wall => impact(a, b, wall) ?? 1));
  return pointAlong(a, b, time);
}

function pointAlong(a, b, fraction) {
  return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
}

function projectileLeg(from, direction, range, walls, previousWall) {
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

function robotImpact(from, to, target) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const x = from.x - target.x;
  const y = from.y - target.y;
  const gap = x * x + y * y - RADIUS ** 2;
  if (gap <= 0) return 0;
  const lengthSquared = dx * dx + dy * dy;
  const projection = x * dx + y * dy;
  const discriminant = projection ** 2 - lengthSquared * gap;
  if (!lengthSquared || projection >= 0 || discriminant < 0) return Infinity;
  const entry = (-projection - Math.sqrt(discriminant)) / lengthSquared;
  return entry <= 1 ? entry : Infinity;
}

const ECHO_DELAY = 0.5;
const ECHO_RADIUS = 36;

function bouncePoint(from, to, walls, range) {
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

export function generateArena(random) {
  const between = (min, max) => min + random() * (max - min);
  const cells = [[318, 142], [520, 270], [722, 400], [704, 135], [333, 395]];
  for (let index = cells.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [cells[index], cells[other]] = [cells[other], cells[index]];
  }
  const walls = cells.slice(0, random() < 0.5 ? 3 : 4).map(([cx, cy]) => {
    const horizontal = random() < 0.5;
    const w = horizontal ? between(83, 125) : between(32, 46);
    const h = horizontal ? between(32, 46) : between(83, 125);
    return { x: cx + between(-22, 22) - w / 2, y: cy + between(-17, 17) - h / 2, w, h };
  });
  const mud = [[176, 120], [864, 414], [533, 111], [511, 426]].map(([x, y]) => ({
    x: x + between(-30, 30), y: y + between(-22, 22),
    rx: between(38, 62), ry: between(27, 39),
  }));
  return { walls, mud };
}

function prepareNavigation(walls) {
  const solids = walls.map(wall => expand(wall, RADIUS));
  const nodes = walls.flatMap(wall => {
    const { x, y, w, h } = expand(wall, RADIUS + 5);
    return [{ x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h }];
  });
  const edges = nodes.map(start => nodes.map(end =>
    blocked(start, end, solids) ? Infinity : distance(start, end)));
  return { solids, nodes, edges };
}

function nextWaypoint(start, end, { solids, nodes, edges }, measure = false) {
  if (!blocked(start, end, solids)) return measure ? distance(start, end) : end;
  const costs = nodes.map(node => blocked(start, node, solids) ? Infinity : distance(start, node));
  const exits = nodes.map(node => blocked(node, end, solids) ? Infinity : distance(node, end));
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

function inMud(robot, mud) {
  return mud.some(puddle => ((robot.x - puddle.x) / puddle.rx) ** 2 +
    ((robot.y - puddle.y) / puddle.ry) ** 2 < 1);
}

export function createBattle(loadouts, {
  random = Math.random, duration = BATTLE_TIME_IN_SECONDS, onEvent = () => {},
} = {}) {
  const arena = generateArena(random);
  const navigation = prepareNavigation(arena.walls);
  const robots = loadouts.map((loadout, id) => ({
    id, x: id === 0 ? 71 : WIDTH - 71, y: HEIGHT / 2, angle: id === 0 ? 0 : Math.PI,
    stats: { ...loadout.stats }, hp: loadout.stats.hp, strategy: loadout.strategy,
    guns: loadout.guns.map(key => ({ key, ready: 0 })),
    utils: loadout.utils.map(key => ({ key, ready: 0, until: 0 })),
    baseStats: { ...loadout.stats }, boosts: {}, intent: null, goal: null, thinkAt: 0, maneuverAt: 2 + id,
    waypoint: null, nextPath: 0, burn: null, pull: null, muddy: false, moving: false,
  }));
  const state = { ...arena, robots, drops: [], effects: [], projectiles: [], time: 0, duration, result: null };

  let nextDrop = 5;
  const pick = list => list[Math.floor(random() * list.length)];
  const positions = [];
  for (let x = 90; x < WIDTH - 60; x += 55) {
    for (let y = 85; y < HEIGHT - 60; y += 50) {
      const point = { x, y };
      if (!blocked(point, point, navigation.solids)) positions.push(point);
    }
  }

  const maneuverPositions = positions.filter(point =>
    !(Math.min(point.x, WIDTH - point.x) < 150 && Math.min(point.y, HEIGHT - point.y) < 125));

  function freePositions() {
    return positions.filter(point => robots.every(robot => distance(point, robot) > 65) &&
      state.drops.every(drop => distance(point, drop) > 32));
  }

  function spawnDrop() {
    const spot = pick(freePositions());
    if (!spot) return;
    const type = pick(['health', 'attribute', 'weapon', 'tool', 'teleport']);
    state.drops.push({ ...spot, type });
    robots.forEach(robot => { robot.thinkAt = 0; });
    log(null, 'event.spawn', `drop.${type}`);
  }

  function expire(robot) {
    for (const [key, until] of Object.entries(robot.boosts)) {
      if (until > state.time + 1e-8) continue;
      if (key === 'hp') robot.hp *= robot.baseStats.hp / robot.stats.hp;
      robot.stats[key] = robot.baseStats[key];
      delete robot.boosts[key];
      log(robot, 'event.expireBoost', `attr.${key}.name`);
    }
    for (const [items, kind] of [[robot.guns, 'guns'], [robot.utils, 'utils']]) {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].expires <= state.time + 1e-8) {
          log(robot, 'event.remove', `${kind}.${items[i].key}.name`);
          items.splice(i, 1);
        }
      }
    }
  }

  function collect(robot, drop) {
    state.drops.splice(state.drops.indexOf(drop), 1);
    robots.forEach(unit => { unit.thinkAt = 0; });
    log(robot, 'event.collect', `drop.${drop.type}`);
    if (drop.type === 'health') {
      robot.hp = Math.min(robot.stats.hp, robot.hp + robot.stats.hp * 0.15);
      return;
    }
    if (drop.type === 'teleport') {
      const spot = pick(freePositions());
      if (spot) {
        effect('dodge', robot, robot, 0.5);
        Object.assign(robot, spot, { pull: null, waypoint: null });
        const enemy = robots[1 - robot.id];
        if (enemy.pull?.target === robot) enemy.pull = null;
        state.effects = state.effects.filter(e => e.kind !== 'tether');
        effect('dodge', robot, robot, 0.5);
      }
      return;
    }
    if (drop.type === 'weapon' || drop.type === 'tool') {
      const weapon = drop.type === 'weapon';
      const catalog = weapon ? guns : utils;
      const items = weapon ? robot.guns : robot.utils;
      const missing = Object.keys(catalog).filter(key => !items.some(item => item.key === key));
      if (missing.length) {
        const key = pick(missing);
        items.push({ key, ready: 0, until: 0, expires: state.time + 10 });
        log(robot, 'event.install', `${weapon ? 'guns' : 'utils'}.${key}.name`);
        return;
      }
    }
    const { id } = pick(attributes);
    const boosted = robot.baseStats[id] * 1.1;
    if (id === 'hp') robot.hp *= boosted / robot.stats.hp;
    robot.stats[id] = boosted;
    robot.boosts[id] = state.time + 5;
    log(robot, 'event.boost', `attr.${id}.name`);
  }

  function movementSpeed(robot) {
    return SPEED_PER_POINT * robot.stats.speed * (active(robot, 'nitro') ? 1.2 : 1) *
      (inMud(robot, arena.mud) && !active(robot, 'treads') ? 0.55 : 1);
  }

  function interceptPoint(robot, enemy, range) {
    if (enemy.intent !== 'drop' || !state.drops.includes(enemy.goal)) return null;
    const enemySpeed = movementSpeed(enemy);
    const speed = movementSpeed(robot);
    if (enemySpeed <= 0 || speed <= 0) return null;
    const waypoint = nextWaypoint(enemy, enemy.goal, navigation);
    for (const fraction of [0.85, 0.65, 0.45]) {
      const crossing = pointAlong(enemy, waypoint, fraction);
      const budget = (distance(enemy, crossing) / enemySpeed - 0.15) * speed;
      const point = maneuverPositions.find(candidate =>
        distance(candidate, crossing) <= range * 0.9 &&
        distance(candidate, crossing) >= RADIUS * 2 &&
        distance(robot, candidate) < budget && !blocked(candidate, crossing, arena.walls) &&
        nextWaypoint(robot, candidate, navigation, true) < budget);
      if (point) return point;
    }
    return null;
  }

  function chooseGoal(robot, enemy, range) {
    const span = distance(robot, enemy);
    const nearCorner = Math.min(robot.x, WIDTH - robot.x) < 145 &&
      Math.min(robot.y, HEIGHT - robot.y) < 120;
    const threat = Math.max(100, ...enemy.guns.map(item => weaponRange(item.key)));
    const danger = span < threat && (robot.hp < robot.stats.hp * 0.4 ||
      (robot.strategy === 'distance' && span < range * 0.6));
    let intent;
    let goal;
    const finalStretch = robot.strategy === 'score' && state.duration - state.time <= 20;
    const ahead = finalStretch && robot.hp > enemy.hp;
    const heal = finalStretch && robot.hp < enemy.hp && robot.hp < robot.stats.hp &&
      state.drops.filter(drop => drop.type === 'health');
    const drops = finalStretch ? (heal || []) : state.drops;
    const cooling = robot.strategy === 'skirmish' && robot.guns[0]?.ready > state.time + 0.15;
    const intercept = robot.strategy === 'intercept' && robot.guns.length &&
      interceptPoint(robot, enemy, range);
    const echo = enemy.echo;
    if (echo && distance(robot, echo.point) <= ECHO_RADIUS + 8) {
      intent = 'retreat';
      let shortest = Infinity;
      goal = robot;
      for (let index = 0; index < 12; index++) {
        const angle = index * Math.PI / 6;
        const point = { x: echo.point.x + Math.cos(angle) * (ECHO_RADIUS + 8),
          y: echo.point.y + Math.sin(angle) * (ECHO_RADIUS + 8) };
        if (point.x < EDGE + RADIUS || point.x > WIDTH - EDGE - RADIUS ||
            point.y < EDGE + RADIUS || point.y > HEIGHT - EDGE - RADIUS ||
            blocked(robot, point, navigation.solids)) continue;
        const gap = distance(robot, point);
        if (gap < shortest) {
          goal = point;
          shortest = gap;
        }
      }
    } else if (intercept) {
      intent = 'intercept';
      goal = intercept;
    } else if (drops.length && !cooling && !(nearCorner && span < 115)) {
      intent = 'drop';
      const cost = drop => distance(robot, drop) +
        (blocked(robot, drop, navigation.solids) ? 75 : 0) +
        Math.max(0, distance(robot, drop) - distance(enemy, drop)) * 0.45;
      goal = drops[0];
      let bestCost = cost(goal);
      for (const drop of drops) {
        const value = cost(drop);
        if (value < bestCost) {
          goal = drop;
          bestCost = value;
        }
      }
    } else if (keepsRange(robot) && robot.guns.length) {
      intent = 'fight';
      goal = enemy;
    } else if (ahead || cooling || (!finalStretch && (nearCorner || danger || state.time >= robot.maneuverAt)) || !robot.guns.length) {
      intent = ahead || cooling || nearCorner || danger ? 'retreat' : 'reposition';
      const score = point => {
        const gap = distance(point, enemy);
        const cover = blocked(point, enemy, arena.walls);
        const desired = intent === 'retreat' ? threat + 130 : range * 0.85;
        return -Math.abs(gap - desired) * 0.7 - Math.abs(distance(robot, point) - 165) +
          Math.min(140, point.x, WIDTH - point.x, point.y, HEIGHT - point.y) * 0.9 +
          (cover && (ahead || cooling || danger) ? 140 : 0) - (inMud(point, arena.mud) ? 55 : 0);
      };
      goal = maneuverPositions[0];
      let bestScore = score(goal);
      for (const point of maneuverPositions) {
        const value = score(point);
        if (value > bestScore) {
          goal = point;
          bestScore = value;
        }
      }
      robot.maneuverAt = state.time + 3 + random() * 2;
    } else {
      intent = 'fight';
      goal = enemy;
    }
    if (intent !== robot.intent && intent !== 'drop' && intent !== 'reposition') {
      log(robot, `intent.${intent}`);
    }
    robot.intent = intent;
    robot.goal = goal;
    robot.nextPath = 0;
    robot.thinkAt = state.time + (cooling || finalStretch ? 0.2 : intent === 'retreat' || intent === 'reposition' ? 1.45 : 0.45);
  }

  function log(robot, action, item = null, damage = null) {
    onEvent({ time: state.time, robot: robot?.id ?? null, action, item, damage });
  }

  function active(robot, key) {
    return robot.utils.some(item => item.key === key && item.until > state.time);
  }

  function effect(kind, from, to, life, extra = {}) {
    state.effects.push({ kind, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y },
      start: state.time, end: state.time + life, ...extra });
  }

  function finish(reason) {
    if (state.result) return;
    const [a, b] = robots;
    const winner = Math.abs(a.hp - b.hp) < 1e-8 ? null : a.hp > b.hp ? a.id : b.id;
    state.result = { winner, reason };
    log(null, `event.${reason}`);
  }

  function damage(attacker, defender, base, action, item) {
    const power = Math.max(1, attacker.stats.attack) / Math.max(1, defender.stats.defense);
    const applied = Math.min(defender.hp, base * power * (active(defender, 'shield') ? 0.55 : 1));
    defender.hp = Math.max(0, defender.hp - applied);
    log(attacker, action, item, applied);
    effect('hit', defender, defender, 0.40, { amount: applied });
    if (defender.hp <= 0) {
      finish('knockout');
      return;
    }
    const beacon = defender.utils.find(tool => tool.key === 'beacon' && tool.until > state.time);
    if (beacon && applied >= Math.min(15, defender.stats.hp * 0.12) &&
        distance(beacon.anchor, attacker) >= RADIUS * 2) {
      effect('beaconReturn', defender, beacon.anchor, 0.35);
      Object.assign(defender, beacon.anchor, { pull: null, waypoint: null, thinkAt: 0 });
      if (attacker.pull?.target === defender) attacker.pull = null;
      beacon.until = 0;
      log(defender, 'event.beaconReturn');
      return true;
    }
    return false;
  }

  function move(robot, target, amount, opponent) {
    const span = distance(robot, target);
    if (span < 0.1) return false;
    const to = pointAlong(robot, target, Math.min(amount / span, 1));
    to.x = clamp(to.x, EDGE + RADIUS, WIDTH - EDGE - RADIUS);
    to.y = clamp(to.y, EDGE + RADIUS, HEIGHT - EDGE - RADIUS);
    const prior = { x: robot.x, y: robot.y };
    for (const axis of ['x', 'y']) {
      const next = { x: robot.x, y: robot.y, [axis]: to[axis] };
      const closest = {
        ...next,
        [axis]: clamp(opponent[axis], Math.min(robot[axis], next[axis]), Math.max(robot[axis], next[axis])),
      };
      if (distance(closest, opponent) < RADIUS * 2 && distance(closest, opponent) < distance(robot, opponent)) {
        const crossGap = axis === 'x' ? robot.y - opponent.y : robot.x - opponent.x;
        const clearance = Math.sqrt((RADIUS * 2) ** 2 - crossGap ** 2);
        const side = Math.sign(robot[axis] - opponent[axis]);
        const contact = opponent[axis] + side * clearance;
        next[axis] = clamp(contact, Math.min(robot[axis], next[axis]), Math.max(robot[axis], next[axis]));
      }
      if (!blocked(robot, next, navigation.solids)) robot[axis] = next[axis];
    }
    return distance(prior, robot) > 0.01;
  }

  function turnToward(robot, target, dt) {
    const delta = Math.atan2(target.y - robot.y, target.x - robot.x) - robot.angle;
    const shortest = Math.atan2(Math.sin(delta), Math.cos(delta));
    robot.angle += clamp(shortest, -dt * 11, dt * 11);
  }

  function rangedTarget(robot, enemy, span, range) {
    const preferred = preferredRange(range);
    const flank = robot.strategy === 'flank';
    if (!flank && Math.abs(span - preferred) <= 2) return robot;
    const aim = Math.atan2(enemy.y - robot.y, enemy.x - robot.x);
    const lookAhead = flank ? 32 : Math.min(32, Math.abs(span - preferred));
    const radial = clamp((span - preferred) / lookAhead, -1, 1);
    const heading = aim + (flank ? Math.acos(radial) : radial > 0 ? 0 : Math.PI);
    const flankWeight = flank ? 0.55 * (1 - Math.abs(radial)) : 0;
    const rangeCost = gap => Math.abs(gap - preferred) + Math.max(0, gap - range) * 3;
    let target = robot;
    let bestScore = -rangeCost(span);
    for (const offset of steeringOffsets) {
      const angle = heading + offset * Math.PI / 6;
      const point = {
        x: clamp(robot.x + Math.cos(angle) * lookAhead, EDGE + RADIUS, WIDTH - EDGE - RADIUS),
        y: clamp(robot.y + Math.sin(angle) * lookAhead, EDGE + RADIUS, HEIGHT - EDGE - RADIUS),
      };
      if (blocked(robot, point, navigation.solids) || blocked(point, enemy, state.walls)) continue;
      const lateral = (point.y - robot.y) * Math.cos(aim) - (point.x - robot.x) * Math.sin(aim);
      const score = -rangeCost(distance(point, enemy)) +
        (Math.abs(lateral) + lateral * 0.05) * flankWeight;
      if (score > bestScore) {
        target = point;
        bestScore = score;
      }
    }
    return target;
  }

  function walk(robot, enemy, dt) {
    robot.muddy = inMud(robot, state.mud);

    if (robot.pull) {
      const { target, until, stop } = robot.pull;
      if (state.time < until && distance(robot, target) > stop &&
          move(robot, target, 325 * dt, enemy)) {
        turnToward(robot, target, dt);
        return;
      }
      robot.pull = null;
    }

    const span = distance(robot, enemy);
    const clear = !blocked(robot, enemy, state.walls);
    const firingDistance = firingRange(robot);
    const preferred = Math.max(CONTACT_RANGE, firingDistance * (robot.strategy === 'advance' ? 0.63 : 0.83));
    const speed = movementSpeed(robot);
    if (state.time >= robot.thinkAt) chooseGoal(robot, enemy, firingDistance);
    const prior = { x: robot.x, y: robot.y };
    let target = robot;
    let moving = false;
    if (keepsRange(robot) && robot.goal === enemy && clear && firingDistance > CONTACT_RANGE) {
      let remaining = speed * dt;
      while (remaining > 0) {
        target = rangedTarget(robot, enemy, distance(robot, enemy), firingDistance);
        const travel = Math.min(remaining, distance(robot, target));
        if (!move(robot, target, travel, enemy)) break;
        moving = true;
        remaining -= travel;
      }
    } else if (robot.goal !== enemy || span > preferred || !clear) {
      if (state.time >= robot.nextPath || !robot.waypoint || distance(robot, robot.waypoint) < 7) {
        robot.waypoint = nextWaypoint(robot, robot.goal, navigation);
        robot.nextPath = state.time + 0.20;
      }
      target = robot.waypoint;
      moving = move(robot, target, speed * dt, enemy);
    }
    if (moving) robot.heading = Math.atan2(robot.y - prior.y, robot.x - prior.x);
    turnToward(robot, clear || distance(robot, target) < 1 ? enemy : target, dt);
    if (moving !== robot.moving) log(robot, moving ? 'event.move' : 'event.hold');
    robot.moving = moving;
  }

  function useTools(robot, enemy) {
    const span = distance(robot, enemy);
    const enemyRange = Math.max(0, ...enemy.guns.map(item => weaponRange(item.key)));
    for (const item of robot.utils) {
      const tool = utils[item.key];
      if (item.until && item.until <= state.time) {
        item.until = 0;
        log(robot, 'event.expireTool', `utils.${item.key}.name`);
      }
      const shouldUse = item.key === 'shield'
        ? (enemyRange + 1e-8 >= span && !blocked(robot, enemy, state.walls)) || robot.burn
        : item.key === 'beacon'
          ? robot.intent === 'drop' && state.drops.includes(robot.goal) && blocked(robot, enemy, state.walls)
          : item.key === 'hologram'
            ? robot.intent === 'retreat' && span <= enemyRange && !blocked(robot, enemy, state.walls)
            : item.key === 'treads'
              ? inMud(robot, arena.mud) && (robot.moving || span <= enemyRange)
              : span > 125 || robot.muddy;
      if (shouldUse && item.ready <= state.time) {
        if (item.key === 'beacon') item.anchor = { x: robot.x, y: robot.y };
        if (item.key === 'hologram') {
          item.decoy = { x: robot.x, y: robot.y };
          item.heading = robot.heading ?? robot.angle;
        }
        item.until = state.time + tool.duration;
        item.ready = state.time + tool.cooldown;
        log(robot, 'event.activate', `utils.${item.key}.name`);
      }
    }
  }

  function retreatAnchor(robot, enemy, range) {
    const span = distance(robot, enemy);
    const preferred = preferredRange(firingRange(robot));
    if (robot.pull || span + RADIUS >= preferred) return null;
    let anchor = null;
    let bestScore = 0;
    for (const { x, y, w, h } of state.walls) {
      const nearX = clamp(robot.x, x, x + w);
      const nearY = clamp(robot.y, y, y + h);
      const targets = [
        { x, y: nearY }, { x: x + w, y: nearY }, { x: nearX, y }, { x: nearX, y: y + h },
        { x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h },
      ];
      for (const target of targets) {
        const contact = firstContact(robot, target, state.walls);
        const reach = distance(robot, contact);
        if (reach > range || reach <= RADIUS) continue;
        const clearance = firstContact(robot, contact, navigation.solids);
        const travel = Math.min(325 * 0.6, distance(robot, clearance) - 2);
        if (travel <= RADIUS) continue;
        const landing = pointAlong(robot, contact, travel / reach);
        if ((landing.x - robot.x) * (robot.x - enemy.x) +
            (landing.y - robot.y) * (robot.y - enemy.y) < 0) continue;
        const gain = distance(landing, enemy) - span;
        if (gain <= RADIUS) continue;
        const score = preferred - span - Math.abs(distance(landing, enemy) - preferred) +
          (blocked(landing, enemy, state.walls) ? 0 : 12);
        if (score > bestScore) {
          bestScore = score;
          anchor = { contact, landing };
        }
      }
    }
    return anchor;
  }

  function hit(robot, enemy, key, angle = Math.atan2(enemy.y - robot.y, enemy.x - robot.x)) {
    const weapon = guns[key];
    const aim = robot.stats.aim / (robot.stats.aim + 70);
    const dodgeChance = enemy.stats.evasion > 0
      ? clamp(1 - robot.stats.aim / enemy.stats.evasion, 0, 1)
      : 0;
    const roll = random();
    const accuracy = 0.78 + 0.21 * aim;
    if (roll >= accuracy) {
      log(robot, 'event.miss', `guns.${key}.name`);
      return;
    }
    if (roll >= accuracy * (1 - dodgeChance)) {
      const side = angle + Math.PI / 2;
      const dx = Math.cos(side) * 11;
      const dy = Math.sin(side) * 11;
      if (!move(enemy, { x: enemy.x + dx, y: enemy.y + dy }, 11, robot)) {
        move(enemy, { x: enemy.x - dx, y: enemy.y - dy }, 11, robot);
      }
      log(robot, 'event.evaded', `guns.${key}.name`);
      log(enemy, 'event.dodge', `guns.${key}.name`);
      effect('dodge', enemy, enemy, 0.35);
      return;
    }
    const critical = key === 'pistol' && random() < 0.18;
    const returned = damage(robot, enemy, weapon.damage * (critical ? 1.85 : 1), critical ? 'event.critical' : 'event.hit', `guns.${key}.name`);
    if (returned || state.result) return;
    if (key === 'pulse') {
      move(enemy, { x: enemy.x + 58 * Math.cos(angle), y: enemy.y + 58 * Math.sin(angle) }, 58, robot);
      enemy.thinkAt = 0;
    }
    if (key === 'flame') {
      enemy.burn = { from: robot, until: state.time + 3, next: enemy.burn?.next ?? state.time + 0.25 };
    }
    if (key === 'hook') {
      enemy.pull = { target: robot, until: state.time + 0.55, stop: RADIUS * 2 };
      effect('tether', robot, enemy, 0.5, { attached: robot.id, victim: enemy.id });
      log(robot, 'event.hookEnemy');
    }
  }

  function launch(robot, key, target, bounce, anchor) {
    const { range, projectileSpeed } = guns[key];
    const from = { x: robot.x, y: robot.y };
    const aim = bounce || target;
    const span = distance(from, aim) || 1;
    const direction = { x: (aim.x - from.x) / span, y: (aim.y - from.y) / span };
    const leg = anchor ? { to: anchor.contact } : projectileLeg(from, direction, range, state.walls);
    state.projectiles.push({
      key, robot, speed: projectileSpeed, anchor, x: from.x, y: from.y,
      from, ...leg, canBounce: key === 'disc', range,
    });
  }

  function absorbShot(enemy, hologram) {
    hologram.until = 0;
    log(enemy, 'event.decoy');
  }

  function advanceProjectile(shot, travel) {
    const { robot, key } = shot;
    const enemy = robots[1 - robot.id];
    while (travel > 0) {
      const span = distance(shot, shot.to);
      const next = travel >= span ? shot.to : pointAlong(shot, shot.to, travel / span);
      const enemyHit = robotImpact(shot, next, enemy);
      const hologram = enemy.utils.find(tool => tool.key === 'hologram' && tool.until > state.time);
      const decoyHit = hologram ? robotImpact(shot, next, hologram.decoy) : Infinity;
      if (decoyHit <= enemyHit && decoyHit !== Infinity) {
        absorbShot(enemy, hologram);
        return false;
      }
      if (enemyHit !== Infinity) {
        hit(robot, enemy, key, Math.atan2(shot.to.y - shot.from.y, shot.to.x - shot.from.x));
        return false;
      }
      Object.assign(shot, { x: next.x, y: next.y });
      if (travel < span) return true;
      const remainingRange = shot.range - distance(shot.from, shot.to);
      if (shot.canBounce && shot.reflection && remainingRange > 1e-8) {
        travel -= span;
        shot.from = shot.to;
        Object.assign(shot, projectileLeg(shot.from, shot.reflection, remainingRange, state.walls, shot.surface),
          { canBounce: false, range: remainingRange });
        continue;
      }
      if (shot.anchor) {
        const { contact, landing } = shot.anchor;
        robot.pull = { target: landing ?? contact, until: state.time + 0.6, stop: landing ? 0.1 : RADIUS };
        effect('tether', robot, contact, 0.5, { attached: robot.id });
        log(robot, 'event.hookWall');
      } else {
        log(robot, 'event.miss', `guns.${key}.name`);
      }
      return false;
    }
    return true;
  }

  function fire(robot, enemy) {
    for (const item of robot.guns) {
      if (state.result) break;
      const { key } = item;
      const weapon = guns[key];
      const range = weaponRange(key);
      if (item.ready > state.time) continue;
      if (key === 'hook' && keepsRange(robot)) {
        const anchor = retreatAnchor(robot, enemy, range);
        if (anchor) {
          item.ready = state.time + weapon.interval;
          launch(robot, key, anchor.contact, null, anchor);
          continue;
        }
        if (robot.guns.length > 1) continue;
      }
      if (key === 'echo' && robot.echo) continue;
      const hologram = key !== 'echo' && enemy.utils.find(tool =>
        tool.key === 'hologram' && tool.until > state.time &&
        distance(robot, tool.decoy) <= range + 1e-8 && !blocked(robot, tool.decoy, state.walls));
      const target = hologram ? hologram.decoy : enemy;
      const contact = firstContact(robot, target, state.walls);
      const wall = distance(contact, target) > 0.1;
      if (distance(robot, contact) > range + 1e-8) continue;
      const bounce = wall && key === 'disc' && bouncePoint(robot, target, state.walls, range);
      if (wall && key !== 'disc' && key !== 'hook') continue;
      item.ready = state.time + weapon.interval;
      if (key === 'echo') {
        robot.echo = { point: contact, at: state.time + ECHO_DELAY };
        effect('echo', contact, contact, ECHO_DELAY, { radius: ECHO_RADIUS });
        enemy.thinkAt = 0;
      } else if (weapon.projectileSpeed) {
        launch(robot, key, target, bounce, wall && key === 'hook' ? { contact } : null);
      } else {
        effect(key, robot, target, 0.21);
        if (hologram) absorbShot(enemy, hologram);
        else hit(robot, enemy, key);
      }
    }
  }

  const orders = [[robots[0], robots[1]], [robots[1], robots[0]]];
  let turn = random() < 0.5 ? 0 : 1;
  log(null, 'event.start');

  function step(dt = STEP) {
    if (state.result) return;
    const nextTime = state.time + dt;
    const delta = Math.min(dt, state.duration - state.time);
    state.time = nextTime + 1e-8 >= state.duration ? state.duration : nextTime;
    const effects = state.effects;
    let activeCount = 0;
    for (const event of effects) {
      if (event.end > state.time) effects[activeCount++] = event;
    }
    effects.length = activeCount;
    const order = orders[turn];
    turn = 1 - turn;
    if (state.time + 1e-8 >= nextDrop) {
      spawnDrop();
      nextDrop += 5;
    }
    for (const robot of order) expire(robot);
    for (const robot of order) {
      useTools(robot, robots[1 - robot.id]);
      walk(robot, robots[1 - robot.id], delta);
      const hologram = robot.utils.find(tool => tool.key === 'hologram' && tool.until > state.time);
      if (hologram) {
        const { decoy, heading } = hologram;
        const next = { x: decoy.x + Math.cos(heading) * 75 * delta,
          y: decoy.y + Math.sin(heading) * 75 * delta };
        if (!blocked(decoy, next, arena.walls)) Object.assign(decoy, next);
      }
    }
    for (let index = 0; index < state.drops.length;) {
      const drop = state.drops[index];
      let collector;
      let nearest = Infinity;
      for (const robot of order) {
        const gap = distance(robot, drop);
        if (gap <= RADIUS + 11 && gap < nearest && !blocked(robot, drop, arena.walls)) {
          collector = robot;
          nearest = gap;
        }
      }
      if (collector) collect(collector, drop);
      else index++;
    }
    for (const robot of order) {
      if (robot.burn && robot.burn.next <= state.time + 1e-8 && robot.burn.next <= robot.burn.until + 1e-8) {
        robot.burn.next += 0.25;
        damage(robot.burn.from, robot, 1.15, 'event.burn');
        if (state.result) return;
      }
      if (robot.burn?.until <= state.time + 1e-8) robot.burn = null;
    }
    for (const robot of order) {
      if (!robot.echo || robot.echo.at > state.time) continue;
      const { point } = robot.echo;
      robot.echo = null;
      effect('echoBlast', point, point, 0.25, { radius: ECHO_RADIUS });
      const enemy = robots[1 - robot.id];
      if (distance(enemy, point) <= ECHO_RADIUS && !blocked(point, enemy, arena.walls)) {
        damage(robot, enemy, guns.echo.damage, 'event.hit', 'guns.echo.name');
        if (state.result) return;
      }
    }
    state.projectiles = state.projectiles.filter(shot =>
      !state.result && advanceProjectile(shot, shot.speed * delta));
    for (const robot of order) fire(robot, robots[1 - robot.id]);
    if (!state.result && state.time >= state.duration) finish('timeout');
  }

  return { state, step, finish: () => finish('manualEnd') };
}
