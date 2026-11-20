import { BATTLE_TIME_IN_SECONDS } from '../config.js';
import { attributes, guns, utils } from './catalog.js';

export const WIDTH = 1040;
export const HEIGHT = 540;
export const EDGE = 18;
export const RADIUS = 19;
export const STEP = 1 / 60;

const rectangleAxes = [['x', 'w'], ['y', 'h']];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const expand = (rect, pad) => ({
  x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2,
});

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

function nextWaypoint(start, end, { solids, nodes, edges }) {
  if (!blocked(start, end, solids)) return end;
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
  return waypoint;
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
  const state = { ...arena, robots, drops: [], effects: [], time: 0, duration, result: null };

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
      robot.hp = Math.min(robot.stats.hp, robot.hp + robot.stats.hp * 0.2);
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

  function chooseGoal(robot, enemy, range) {
    const span = distance(robot, enemy);
    const nearCorner = Math.min(robot.x, WIDTH - robot.x) < 145 &&
      Math.min(robot.y, HEIGHT - robot.y) < 120;
    const threat = Math.max(100, ...enemy.guns.map(item => guns[item.key].range));
    const danger = span < threat && (robot.hp < robot.stats.hp * 0.4 ||
      (robot.strategy === 'distance' && span < range * 0.6));
    let intent;
    let goal;
    if (state.drops.length && !(nearCorner && span < 115)) {
      intent = 'drop';
      const cost = drop => distance(robot, drop) +
        (blocked(robot, drop, navigation.solids) ? 75 : 0) +
        Math.max(0, distance(robot, drop) - distance(enemy, drop)) * 0.45;
      goal = state.drops[0];
      let bestCost = cost(goal);
      for (const drop of state.drops) {
        const value = cost(drop);
        if (value < bestCost) {
          goal = drop;
          bestCost = value;
        }
      }
    } else if (nearCorner || danger || state.time >= robot.maneuverAt || !robot.guns.length) {
      intent = nearCorner || danger ? 'retreat' : 'reposition';
      const score = point => {
        const gap = distance(point, enemy);
        const cover = blocked(point, enemy, arena.walls);
        const desired = intent === 'retreat' ? threat + 130 : range * 0.85;
        return -Math.abs(gap - desired) * 0.7 - Math.abs(distance(robot, point) - 165) +
          Math.min(140, point.x, WIDTH - point.x, point.y, HEIGHT - point.y) * 0.9 +
          (cover && danger ? 75 : 0) - (inMud(point, arena.mud) ? 55 : 0);
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
    if (intent !== robot.intent) log(robot, `intent.${intent}`);
    robot.intent = intent;
    robot.goal = goal;
    robot.nextPath = 0;
    robot.thinkAt = state.time + (intent === 'retreat' || intent === 'reposition' ? 1.45 : 0.45);
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
    const [a, b] = robots;
    const winner = Math.abs(a.hp - b.hp) < 1e-8 ? null : a.hp > b.hp ? a.id : b.id;
    state.result = { winner, reason };
    log(null, `event.${reason}`);
  }

  function damage(attacker, defender, base, action, item) {
    const power = (1 + attacker.stats.attack / 55) / (1 + defender.stats.defense / 70);
    const applied = Math.min(defender.hp, base * power * (active(defender, 'shield') ? 0.55 : 1));
    defender.hp = Math.max(0, defender.hp - applied);
    log(attacker, action, item, applied);
    effect('hit', defender, defender, 0.40, { amount: applied });
    if (defender.hp <= 0) finish('knockout');
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
      const gap = distance(next, opponent);
      if (gap < RADIUS * 2 && gap < distance(robot, opponent)) continue;
      if (!blocked(robot, next, navigation.solids)) robot[axis] = next[axis];
    }
    return distance(prior, robot) > 0.01;
  }

  function turnToward(robot, target, dt) {
    const delta = Math.atan2(target.y - robot.y, target.x - robot.x) - robot.angle;
    const shortest = Math.atan2(Math.sin(delta), Math.cos(delta));
    robot.angle += clamp(shortest, -dt * 11, dt * 11);
  }

  function walk(robot, enemy, dt) {
    const muddy = inMud(robot, state.mud);
    if (muddy !== robot.muddy) log(robot, muddy ? 'event.enterMud' : 'event.leaveMud');
    robot.muddy = muddy;

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
    const firingDistance = robot.guns.length
      ? Math.min(...robot.guns.map(item => guns[item.key].range)) : RADIUS * 2 + 4;
    const aim = Math.atan2(enemy.y - robot.y, enemy.x - robot.x);
    const preferred = firingDistance * (robot.strategy === 'advance' ? 0.63 : 0.83);
    if (state.time >= robot.thinkAt) chooseGoal(robot, enemy, firingDistance);
    let target = robot;
    if (robot.goal !== enemy || span > preferred || !clear) {
      if (state.time >= robot.nextPath || !robot.waypoint || distance(robot, robot.waypoint) < 7) {
        robot.waypoint = nextWaypoint(robot, robot.goal, navigation);
        robot.nextPath = state.time + 0.20;
      }
      target = robot.waypoint;
    } else if (robot.strategy === 'flank') {
      target = { x: robot.x - Math.sin(aim) * 60, y: robot.y + Math.cos(aim) * 60 };
    }
    const speed = (57 + 155 * robot.stats.speed / (robot.stats.speed + 85)) *
      (active(robot, 'nitro') ? 1.2 : 1) * (muddy ? 0.55 : 1);
    const moving = move(robot, target, speed * dt, enemy);
    turnToward(robot, clear || distance(robot, target) < 1 ? enemy : target, dt);
    if (moving !== robot.moving) log(robot, moving ? 'event.move' : 'event.hold');
    robot.moving = moving;
  }

  function useTools(robot, enemy) {
    const span = distance(robot, enemy);
    const enemyRange = Math.max(0, ...enemy.guns.map(item => guns[item.key].range));
    for (const item of robot.utils) {
      const tool = utils[item.key];
      if (item.until && item.until <= state.time) {
        item.until = 0;
        log(robot, 'event.expireTool', `utils.${item.key}.name`);
      }
      const shouldUse = item.key === 'shield'
        ? (enemyRange >= span && !blocked(robot, enemy, state.walls)) || robot.burn
        : span > 125 || robot.muddy;
      if (shouldUse && item.ready <= state.time) {
        item.until = state.time + tool.duration;
        item.ready = state.time + tool.cooldown;
        log(robot, 'event.activate', `utils.${item.key}.name`);
      }
    }
  }

  function fire(robot, enemy) {
    for (const item of robot.guns) {
      if (state.result) break;
      const weapon = guns[item.key];
      if (item.ready > state.time) continue;
      const contact = firstContact(robot, enemy, state.walls);
      const wall = distance(contact, enemy) > 0.1;
      if (distance(robot, contact) > weapon.range || (wall && item.key !== 'hook')) continue;
      item.ready = state.time + weapon.interval;
      effect(item.key, robot, contact, item.key === 'hook' ? 0.35 : 0.21);
      if (wall) {
        robot.pull = { target: contact, until: state.time + 0.6, stop: RADIUS };
        effect('tether', robot, contact, 0.5, { attached: robot.id });
        log(robot, 'event.hookWall');
        continue;
      }
      const aim = robot.stats.aim / (robot.stats.aim + 70);
      const evasion = enemy.stats.evasion / (enemy.stats.evasion + 70);
      const roll = random();
      const accuracy = 0.78 + 0.21 * aim;
      if (roll >= accuracy) {
        log(robot, 'event.miss', `guns.${item.key}.name`);
        continue;
      }
      if (roll >= accuracy * (1 - 0.72 * evasion * (1 - aim * 0.65))) {
        const side = Math.atan2(enemy.y - robot.y, enemy.x - robot.x) + Math.PI / 2;
        const dx = Math.cos(side) * 11;
        const dy = Math.sin(side) * 11;
        if (!move(enemy, { x: enemy.x + dx, y: enemy.y + dy }, 11, robot)) {
          move(enemy, { x: enemy.x - dx, y: enemy.y - dy }, 11, robot);
        }
        log(robot, 'event.evaded', `guns.${item.key}.name`);
        log(enemy, 'event.dodge', `guns.${item.key}.name`);
        effect('dodge', enemy, enemy, 0.35);
        continue;
      }
      const critical = item.key === 'pistol' && random() < 0.18;
      damage(robot, enemy, weapon.damage * (critical ? 1.85 : 1), critical ? 'event.critical' : 'event.hit', `guns.${item.key}.name`);
      if (item.key === 'flame') {
        enemy.burn = { from: robot, until: state.time + 3, next: enemy.burn?.next ?? state.time + 0.25 };
      }
      if (item.key === 'hook') {
        enemy.pull = { target: robot, until: state.time + 0.55, stop: RADIUS * 2 };
        effect('tether', robot, enemy, 0.5, { attached: robot.id, victim: enemy.id });
        log(robot, 'event.hookEnemy');
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
    for (const robot of order) fire(robot, robots[1 - robot.id]);
    if (!state.result && state.time >= state.duration) finish('timeout');
  }

  return { state, step };
}
