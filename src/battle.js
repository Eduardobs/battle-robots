import { ATTRIBUTES_BASE, BATTLE_TIME_IN_SECONDS } from '../config.js';
import { attributes, guns, utils } from './catalog.js';
import { generateArena, HEIGHT, inMud, RADIUS, rollerContact, touchesSpikes, WIDTH, withinSpikeBorder } from './simulation/arena.js';
import { ECHO_RADIUS, THAW_DURATION, weaponRange } from './simulation/combat-rules.js';
import { blocked, distance } from './simulation/geometry.js';
import { createModeController, isAlive, spawnPosition } from './simulation/modes.js';
import { createMovement } from './simulation/movement.js';
import { prepareNavigation } from './simulation/navigation.js';
import { createWeapons } from './simulation/weapons.js';

export { EDGE, generateArena, HEIGHT, RADIUS, WIDTH } from './simulation/arena.js';
export const STEP = 1 / 60;

const SPIKE_DAMAGE_PER_SECOND = 4;
const MEDAL_INTERVAL = 4;
export const DROP_TYPES = ['health', 'attribute', 'weapon', 'tool', 'teleport'];

function weaponStats() {
  return { shots: 0, hits: 0, misses: 0, criticals: 0, anchors: 0, damage: 0, burnDamage: 0 };
}

function recordShot(robot, key) {
  const entry = robot.report.weapons[key] ??= weaponStats();
  entry.shots++;
}

export function createBattle(loadouts, {
  random = Math.random, duration = BATTLE_TIME_IN_SECONDS, mode = 'battle', onEvent = () => {},
} = {}) {
  const arena = generateArena(random, { clearCenter: mode === 'charge' });
  const navigation = prepareNavigation(arena.walls, [...arena.spikePatches, ...arena.rollers]);
  const dropTypes = mode === 'medals' ? [...DROP_TYPES, 'medal'] : DROP_TYPES;
  const robots = loadouts.map((loadout, id) => {
    const stats = { projectileSpeed: ATTRIBUTES_BASE, power: ATTRIBUTES_BASE, ...loadout.stats };
    const baseStats = Object.fromEntries(attributes.map(({ id }) => [id, stats[id]]));
    return {
      id, ...spawnPosition(id),
      stats: { ...baseStats }, hp: baseStats.hp, strategy: loadout.strategy,
      initialGuns: [...loadout.guns], initialUtils: [...loadout.utils],
      guns: loadout.guns.map(key => ({ key, ready: 0 })),
      utils: loadout.utils.map(key => ({ key, ready: 0, until: 0 })),
      baseStats, boosts: {}, intent: null, goal: null, thinkAt: 0, maneuverAt: 2 + id,
      waypoint: null, nextPath: 0, burns: [], lockedUntil: 0, frozenUntil: 0, controlProtectedUntil: 0,
      pull: null, muddy: false, moving: false, spikeDamage: 0, respawnAt: 0,
      report: {
        weapons: Object.fromEntries(loadout.guns.map(key => [key, weaponStats()])),
        tools: Object.fromEntries(loadout.utils.map(key => [key, 0])),
        drops: Object.fromEntries(dropTypes.map(type => [type, 0])),
        healing: 0, damageTaken: 0, defenseMitigated: 0, shieldMitigated: 0, spikeDamage: 0,
        decoys: 0, beaconReturns: 0, boosts: 0, controlHits: 0,
      },
    };
  });
  const state = { ...arena, mode, modeState: null, robots, drops: [], effects: [], projectiles: [], time: 0, duration, result: null };

  let nextDrop = 5;
  let nextMedal = MEDAL_INTERVAL;
  const pick = list => list[Math.floor(random() * list.length)];
  const positions = [];
  for (let x = 90; x < WIDTH - 60; x += 55) {
    for (let y = 85; y < HEIGHT - 60; y += 50) {
      const point = { x, y };
      if (!withinSpikeBorder(point) && !blocked(point, point, navigation.barriers)) positions.push(point);
    }
  }

  const maneuverPositions = positions.filter(point =>
    !(Math.min(point.x, WIDTH - point.x) < 150 && Math.min(point.y, HEIGHT - point.y) < 125));

  function freePositions() {
    return positions.filter(point => robots.every(robot => !isAlive(robot) || distance(point, robot) > 65) &&
      state.drops.every(drop => distance(point, drop) > 32));
  }

  function spawnDrop(requestedType) {
    const spot = pick(freePositions());
    if (!spot) return;
    const type = requestedType ?? pick(DROP_TYPES);
    state.drops.push({ ...spot, type });
    robots.forEach(robot => { robot.thinkAt = 0; });
    log(null, 'event.spawn', `drop.${type}`);
  }

  function expire(robot) {
    for (const [key, until] of Object.entries(robot.boosts)) {
      if (until > state.time + 1e-8) continue;
      if (key === 'hp' && robot.hp > 0) robot.hp *= robot.baseStats.hp / robot.stats.hp;
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
    robot.report.drops[drop.type]++;
    log(robot, 'event.collect', `drop.${drop.type}`);
    if (drop.type === 'medal') return;
    if (drop.type === 'health') {
      const previousHP = robot.hp;
      robot.hp = Math.min(robot.stats.hp, robot.hp + robot.stats.hp * 0.15);
      robot.report.healing += robot.hp - previousHP;
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
        if (weapon) robot.report.weapons[key] ??= weaponStats();
        else robot.report.tools[key] ??= 0;
        log(robot, 'event.install', `${weapon ? 'guns' : 'utils'}.${key}.name`);
        return;
      }
    }
    const { id } = pick(attributes);
    const boosted = robot.baseStats[id] * 1.1;
    if (id === 'hp') robot.hp *= boosted / robot.stats.hp;
    robot.stats[id] = boosted;
    robot.boosts[id] = state.time + 5;
    robot.report.boosts++;
    log(robot, 'event.boost', `attr.${id}.name`);
  }

  function canAct(robot) {
    return isAlive(robot) && state.time + 1e-8 >= Math.max(robot.lockedUntil, robot.frozenUntil - THAW_DURATION);
  }

  function log(robot, action, item = null, damage = null) {
    onEvent({ time: state.time, robot: robot?.id ?? null, action, item, damage });
  }

  function active(robot, key) {
    return isAlive(robot) && robot.utils.some(item => item.key === key && item.until > state.time);
  }

  function effect(kind, from, to, life, extra = {}) {
    state.effects.push({ kind, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y },
      start: state.time, end: state.time + life, ...extra });
  }

  function clearRobotTransient(robot) {
    reportSpikeDamage(robot);
    robot.burns = [];
    robot.lockedUntil = 0;
    robot.frozenUntil = 0;
    robot.controlProtectedUntil = 0;
    robot.pull = null;
    robot.echo = null;
    robot.moving = false;
    robot.waypoint = null;
    robot.intent = null;
    robot.goal = null;
    for (const tool of robot.utils) tool.until = 0;
    const enemy = robots[1 - robot.id];
    if (enemy.pull?.target === robot) enemy.pull = null;
    state.effects = state.effects.filter(e => e.kind !== 'tether' || (e.attached !== robot.id && e.victim !== robot.id));
  }

  function resetRobotForRound(robot) {
    clearRobotTransient(robot);
    robot.stats = { ...robot.baseStats };
    robot.boosts = {};
    robot.hp = robot.baseStats.hp;
    robot.respawnAt = 0;
    robot.guns = robot.initialGuns.map(key => ({ key, ready: 0 }));
    robot.utils = robot.initialUtils.map(key => ({ key, ready: 0, until: 0 }));
    Object.assign(robot, spawnPosition(robot.id), {
      thinkAt: 0, nextPath: 0, maneuverAt: state.time + 2 + robot.id,
    });
  }

  let roundReset = false;

  function finish(reason) {
    if (state.result) return;
    robots.forEach(reportSpikeDamage);
    const [a, b] = robots;
    const difference = modeController.compare();
    const winner = Math.abs(difference) < Number.EPSILON ? null : difference > 0 ? a.id : b.id;
    state.result = { winner, reason };
    log(null, `event.${reason}`);
  }

  const modeController = createModeController(state, navigation, positions, {
    pick, log, effect, finish, resetRobotForRound, clearRobotTransient,
  });

  function handleDefeat(robot) {
    reportSpikeDamage(robot);
    const outcome = modeController.onDefeat(robot);
    if (outcome === 'roundReset') roundReset = true;
    return outcome;
  }

  function reportSpikeDamage(robot) {
    if (!robot.spikeDamage) return;
    log(robot, 'event.spikes', null, robot.spikeDamage);
    effect('hit', robot, robot, 0.40, { amount: robot.spikeDamage });
    robot.spikeDamage = 0;
  }

  function damage(attacker, defender, base, action, key) {
    if (!isAlive(defender)) return 'defeated';
    const power = Math.max(1, attacker.stats.attack) / Math.max(1, defender.stats.defense);
    const afterDefense = base * power;
    const afterShield = afterDefense * (active(defender, 'shield') ? 0.55 : 1);
    const applied = Math.min(defender.hp, afterShield);
    const weapon = attacker.report.weapons[key];
    weapon.damage += applied;
    if (action === 'event.burn') {
      weapon.burnDamage += applied;
    } else {
      weapon.hits++;
      if (action === 'event.critical') weapon.criticals++;
    }
    defender.report.damageTaken += applied;
    defender.report.defenseMitigated += Math.max(0, base * Math.max(1, attacker.stats.attack) - afterDefense);
    defender.report.shieldMitigated += afterDefense - afterShield;
    defender.hp = Math.max(0, defender.hp - applied);
    log(attacker, action, action === 'event.burn' ? null : `guns.${key}.name`, applied);
    effect('hit', defender, defender, 0.40, { amount: applied });
    if (defender.hp <= 0) {
      handleDefeat(defender);
      return 'defeated';
    }
    const beacon = defender.utils.find(tool => tool.key === 'beacon' && tool.until > state.time);
    if (beacon && applied >= Math.min(15, defender.stats.hp * 0.12) &&
        distance(beacon.anchor, attacker) >= RADIUS * 2) {
      effect('beaconReturn', defender, beacon.anchor, 0.35);
      Object.assign(defender, beacon.anchor, { pull: null, waypoint: null, thinkAt: 0 });
      if (attacker.pull?.target === defender) attacker.pull = null;
      beacon.until = 0;
      defender.report.beaconReturns++;
      log(defender, 'event.beaconReturn');
      return 'beacon';
    }
    return false;
  }

  function shouldActivateTool(key, robot, enemy, span, enemyRange) {
    const enemyAlive = isAlive(enemy);
    switch (key) {
      case 'shield':
        return robot.burns.length > 0 || (enemyAlive && enemyRange + 1e-8 >= span && !blocked(robot, enemy, state.walls));
      case 'beacon':
        return robot.intent === 'drop' && state.drops.includes(robot.goal) && blocked(robot, enemy, state.walls);
      case 'hologram':
        return enemyAlive && (robot.intent === 'retreat' || robot.intent === 'evadeCore' || robot.intent === 'returnFlag') &&
          span <= enemyRange && !blocked(robot, enemy, state.walls);
      case 'treads':
        return inMud(robot, state.mud) && (robot.moving || (enemyAlive && span <= enemyRange));
      case 'nitro':
        return robot.muddy || (enemyAlive && span > 125) ||
          ['zone', 'seekFlag', 'returnFlag', 'interceptCarrier', 'seekCore', 'passCore', 'evadeCore', 'racePortal']
            .includes(robot.intent);
    }
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
      if (item.ready > state.time || !canAct(robot)) continue;
      if (!shouldActivateTool(item.key, robot, enemy, span, enemyRange)) continue;
      if (item.key === 'beacon') item.anchor = { x: robot.x, y: robot.y };
      if (item.key === 'hologram') {
        item.decoy = { x: robot.x, y: robot.y };
        item.heading = robot.heading ?? robot.angle;
      }
      item.until = state.time + tool.duration;
      item.ready = state.time + tool.cooldown;
      robot.report.tools[item.key] = (robot.report.tools[item.key] ?? 0) + 1;
      log(robot, 'event.activate', `utils.${item.key}.name`);
    }
  }

  function crush(robot) {
    if (!isAlive(robot)) return;
    const damage = robot.hp;
    robot.hp = 0;
    robot.report.damageTaken += damage;
    log(robot, 'event.roller', null, damage);
    effect('hit', robot, robot, 0.4, { amount: damage });
    handleDefeat(robot);
  }

  const movement = createMovement(state, navigation, maneuverPositions, { random, active, log, crush });
  const { advanceProjectile, fire } = createWeapons(state, navigation, movement, { random, damage, effect, log, recordShot });
  const { walk, pushOpponents } = movement;
  const orders = [[robots[0], robots[1]], [robots[1], robots[0]]];
  let turn = random() < 0.5 ? 0 : 1;
  log(null, 'event.start');
  if (mode === 'medals') spawnDrop('medal');

  function step(dt = STEP) {
    if (state.result) return;
    roundReset = false;
    const touching = robots.find(robot => isAlive(robot) && rollerContact(robot, robot) === 0);
    if (touching) {
      crush(touching);
      if (state.result || roundReset) return;
    }
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
    modeController.beforeStep?.();
    if (mode === 'medals' && state.time + 1e-8 >= nextMedal) {
      spawnDrop('medal');
      nextMedal += MEDAL_INTERVAL;
    }
    if (state.time + 1e-8 >= nextDrop) {
      spawnDrop();
      nextDrop += 5;
    }
    for (const robot of order) expire(robot);
    for (const robot of order) {
      if (!isAlive(robot)) continue;
      if (touchesSpikes(robot, state.spikePatches)) {
        const amount = Math.min(robot.hp, SPIKE_DAMAGE_PER_SECOND * delta);
        robot.hp -= amount;
        robot.spikeDamage += amount;
        robot.report.spikeDamage += amount;
        if (robot.spikeDamage >= SPIKE_DAMAGE_PER_SECOND / 2 - 1e-8) reportSpikeDamage(robot);
      } else {
        reportSpikeDamage(robot);
      }
    }
    for (const robot of order) {
      if (!isAlive(robot) || robot.hp > 0) continue;
      handleDefeat(robot);
      if (state.result || roundReset) return;
    }
    const movements = robots.map(({ x, y }) => ({ x, y }));
    for (const robot of order) {
      if (!isAlive(robot)) continue;
      useTools(robot, robots[1 - robot.id]);
      const movement = movements[robot.id];
      movement.walked = canAct(robot) && walk(robot, robots[1 - robot.id], delta, movement);
      if (state.result || roundReset) return;
      const hologram = robot.utils.find(tool => tool.key === 'hologram' && tool.until > state.time);
      if (hologram) {
        const { decoy, heading } = hologram;
        const next = { x: decoy.x + Math.cos(heading) * 75 * delta,
          y: decoy.y + Math.sin(heading) * 75 * delta };
        if (!blocked(decoy, next, arena.walls)) Object.assign(decoy, next);
      }
    }
    const pushed = pushOpponents(movements, delta);
    if (state.result || roundReset) return;
    for (const robot of order) {
      if (!isAlive(robot)) continue;
      const { x, y, walked } = movements[robot.id];
      if (walked === undefined && !pushed) continue;
      const moving = walked || pushed;
      if (moving) robot.heading = Math.atan2(robot.y - y, robot.x - x);
      if (moving !== robot.moving) log(robot, moving ? 'event.move' : 'event.hold');
      robot.moving = moving;
    }
    for (let index = 0; index < state.drops.length;) {
      const drop = state.drops[index];
      let collector;
      let nearest = Infinity;
      for (const robot of order) {
        const gap = distance(robot, drop);
        if (canAct(robot) && gap <= RADIUS + 11 && gap < nearest && !blocked(robot, drop, arena.walls)) {
          collector = robot;
          nearest = gap;
        }
      }
      if (collector) collect(collector, drop);
      else index++;
    }
    if (modeController.update?.(delta, movements, order) === 'roundReset' || state.result || roundReset) return;
    for (const robot of order) {
      if (!isAlive(robot)) continue;
      for (const burn of robot.burns) {
        while (burn.next <= Math.min(state.time, burn.until) + 1e-8) {
          burn.next += 0.25;
          damage(burn.from, robot, 1.15, 'event.burn', 'flame');
          if (state.result || roundReset || !isAlive(robot)) break;
        }
        if (state.result || roundReset || !isAlive(robot)) break;
      }
      if (state.result || roundReset) return;
      if (robot.burns.length) robot.burns = robot.burns.filter(burn => burn.until > state.time + 1e-8);
    }
    for (const robot of order) {
      if (!isAlive(robot) || !robot.echo || robot.echo.at > state.time) continue;
      const { point } = robot.echo;
      robot.echo = null;
      effect('echoBlast', point, point, 0.25, { radius: ECHO_RADIUS });
      const enemy = robots[1 - robot.id];
      if (isAlive(enemy) && distance(enemy, point) <= ECHO_RADIUS && !blocked(point, enemy, arena.walls)) {
        damage(robot, enemy, guns.echo.damage, 'event.hit', 'echo');
        if (state.result || roundReset) return;
      } else {
        robot.report.weapons.echo.misses++;
      }
    }
    state.projectiles = state.projectiles.filter(shot =>
      !state.result && !roundReset && advanceProjectile(shot, shot.speed * delta));
    if (state.result || roundReset) return;
    for (const robot of order) {
      const enemy = robots[1 - robot.id];
      if (canAct(robot) && isAlive(enemy)) fire(robot, enemy);
      if (state.result || roundReset) return;
    }
    if (!state.result && state.time >= state.duration) finish('timeout');
  }

  return { state, step, finish: () => finish('manualEnd') };
}
