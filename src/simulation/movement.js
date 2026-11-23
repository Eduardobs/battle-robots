import { clampToSafeInterior, EDGE, HEIGHT, inMud, RADIUS, rollerContact, touchesSpikes, WIDTH, withinSpikeBorder } from './arena.js';
import { CONTACT_RANGE, ECHO_RADIUS, firingRange, keepsRange, preferredRange, THAW_DURATION, weaponRange } from './combat-rules.js';
import { blocked, clamp, closestFraction, distance, expand, impact, inside, pathClearance, pointAlong } from './geometry.js';
import { isAlive } from './modes.js';
import { nextWaypoint } from './navigation.js';
import { DODGE_CLEARANCE, entersProjectilePath, projectileLeg } from './trajectories.js';

const SPEED_PER_POINT = 1.5;
const PUSH_POWER_SCALE = 100;
const DODGE_LOOKAHEAD = 0.45;
const SPIKE_SPEED = 0.5;
const steeringOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6];

export function createMovement(state, navigation, maneuverPositions, { random, active, log, crush }) {
  const { robots } = state;

  function movementSpeed(robot) {
    const thaw = clamp(1 - (robot.frozenUntil - state.time) / THAW_DURATION, 0, 1);
    return thaw * SPEED_PER_POINT * robot.stats.speed * spikeSpeed(robot) * (active(robot, 'nitro') ? 1.2 : 1) *
      (inMud(robot, state.mud) && !active(robot, 'treads') ? 0.55 : 1);
  }

  function spikeSpeed(robot) {
    return touchesSpikes(robot, state.spikePatches) ? SPIKE_SPEED : 1;
  }

  function entersSpikes(start, end) {
    return (!withinSpikeBorder(start) && withinSpikeBorder(end)) ||
      navigation.hazards.some(rect => !inside(start, rect) && impact(start, end, rect) !== null);
  }

  function safeTarget(point, origin = point) {
    const safe = clampToSafeInterior(point);
    const patch = navigation.hazards.find(rect => inside(safe, rect));
    if (!patch) return withinSpikeBorder(point) ? safe : point;
    const { x, y, w, h } = expand(patch, 1);
    const exits = [{ x, y: safe.y }, { x: x + w, y: safe.y }, { x: safe.x, y }, { x: safe.x, y: y + h }];
    let best = point;
    let gap = Infinity;
    for (const exit of exits) {
      const span = distance(origin, exit);
      if (span < gap && !withinSpikeBorder(exit) && !blocked(point, exit, navigation.solids) &&
          !entersSpikes(point, exit)) {
        best = exit;
        gap = span;
      }
    }
    return best;
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
        distance(robot, candidate) < budget && !blocked(candidate, crossing, state.walls) &&
        nextWaypoint(robot, candidate, navigation, true) < budget);
      if (point) return point;
    }
    return null;
  }

  function rollerGoal(robot, enemy) {
    if (robot.stats.power <= enemy.stats.power || distance(robot, enemy) > 175) return null;
    for (const roller of state.rollers) {
      const target = { x: roller.x + roller.w / 2, y: roller.y + roller.h / 2 };
      const gap = distance(enemy, target);
      if (gap > 135 || blocked(enemy, target, navigation.solids)) continue;
      const dx = (target.x - enemy.x) / gap;
      const dy = (target.y - enemy.y) / gap;
      const behind = (enemy.x - robot.x) * dx + (enemy.y - robot.y) * dy;
      const lateral = (robot.x - enemy.x) * -dy + (robot.y - enemy.y) * dx;
      if (behind > 0 && Math.abs(lateral) < behind * 0.2 &&
          !blocked(robot, enemy, navigation.solids)) return enemy;
      let point = { x: enemy.x - dx * (CONTACT_RANGE + 8), y: enemy.y - dy * (CONTACT_RANGE + 8) };
      if (pathClearance(enemy, robot, point) < CONTACT_RANGE - 0.01) {
        const side = Math.sign(lateral) || 1;
        const offset = side * (CONTACT_RANGE + 12);
        const depth = Math.abs(lateral) < CONTACT_RANGE ? behind : CONTACT_RANGE + 8;
        point = { x: enemy.x - dx * depth - dy * offset,
          y: enemy.y - dy * depth + dx * offset };
      }
      if (!withinSpikeBorder(point) && !blocked(robot, point, navigation.barriers)) return point;
    }
    return null;
  }

  function nearestMedal(robot) {
    let nearest;
    let shortest = Infinity;
    for (const drop of state.drops) {
      if (drop.type !== 'medal') continue;
      const cost = nextWaypoint(robot, drop, navigation, true);
      if (cost < shortest) {
        nearest = drop;
        shortest = cost;
      }
    }
    return nearest;
  }

  function zoneStandPoint(zone, enemy) {
    if (!isAlive(enemy)) return { x: zone.x, y: zone.y };
    const span = distance(zone, enemy) || 1;
    const offset = Math.max(0, zone.radius - 18);
    const point = clampToSafeInterior({
      x: zone.x + (zone.x - enemy.x) / span * offset,
      y: zone.y + (zone.y - enemy.y) / span * offset,
    });
    return !withinSpikeBorder(point) && !blocked(point, point, navigation.barriers) ? point : { x: zone.x, y: zone.y };
  }

  function modeGoal(robot, enemy) {
    const ms = state.modeState;
    if (!ms) return null;
    const enemyAlive = isAlive(enemy);
    if (state.mode === 'king') {
      const { zone } = ms;
      const inZone = distance(robot, zone) <= zone.radius - 8;
      const enemyInZone = enemyAlive && distance(enemy, zone) <= zone.radius;
      if (!inZone) return { intent: 'zone', goal: { x: zone.x, y: zone.y } };
      if (!enemyInZone) {
        const goal = keepsRange(robot) ? zoneStandPoint(zone, enemy) : { x: zone.x, y: zone.y };
        return { intent: 'holdZone', goal };
      }
      if (keepsRange(robot) && robot.guns.length) {
        return { intent: 'contestZone', goal: zoneStandPoint(zone, enemy) };
      }
      return { intent: 'contestZone', goal: enemy };
    }
    if (state.mode === 'ctf') {
      const ownBase = ms.bases[robot.id];
      const enemyBase = ms.bases[1 - robot.id];
      const ownFlag = ms.flags[robot.id];
      const enemyFlag = ms.flags[1 - robot.id];
      if (enemyFlag.carrier === robot.id) {
        if (ownFlag.atHome || !enemyAlive) return { intent: 'returnFlag', goal: ownBase };
        return { intent: 'interceptCarrier', goal: enemy };
      }
      if (!ownFlag.atHome && enemyAlive) {
        if (distance(enemy, enemyBase) < distance(robot, enemyBase) + 120 || distance(robot, enemy) < 280) {
          return { intent: 'interceptCarrier', goal: enemy };
        }
      }
      return { intent: 'seekFlag', goal: enemyBase };
    }
    if (state.mode === 'charge') {
      const { core } = ms;
      if (core.carrier === null) return { intent: 'seekCore', goal: { x: core.x, y: core.y } };
      if (core.carrier === robot.id) return { intent: 'passCore', goal: enemy };
      let best = maneuverPositions[0] ?? robot;
      let bestScore = -Infinity;
      for (const point of maneuverPositions) {
        const score = distance(point, enemy) * 1.3 - distance(robot, point) * 0.25 +
          Math.min(130, point.x, WIDTH - point.x, point.y, HEIGHT - point.y) * 0.7 -
          (inMud(point, state.mud) ? 65 : 0);
        if (score > bestScore) {
          best = point;
          bestScore = score;
        }
      }
      return { intent: 'evadeCore', goal: best };
    }
    if (state.mode === 'race') {
      const portal = ms.portals[ms.progress[robot.id].nextPortal];
      return { intent: 'racePortal', goal: { x: portal.x, y: portal.y } };
    }
    return null;
  }

  function chooseGoal(robot, enemy, range) {
    const enemyAlive = isAlive(enemy);
    const span = distance(robot, enemy);
    const nearCorner = Math.min(robot.x, WIDTH - robot.x) < 145 &&
      Math.min(robot.y, HEIGHT - robot.y) < 120;
    const threat = Math.max(100, ...enemy.guns.map(item => weaponRange(item.key)));
    const danger = enemyAlive && span < threat && (robot.hp < robot.stats.hp * 0.4 ||
      (robot.strategy === 'distance' && span < range * 0.6));
    let intent;
    let goal;
    const finalStretch = state.mode === 'battle' && robot.strategy === 'score' && state.duration - state.time <= 20;
    const ahead = finalStretch && robot.hp > enemy.hp;
    const heal = finalStretch && robot.hp < enemy.hp && robot.hp < robot.stats.hp &&
      state.drops.filter(drop => drop.type === 'health');
    const drops = finalStretch ? (heal || []) : state.drops;
    const cooling = enemyAlive && robot.strategy === 'skirmish' && robot.guns[0]?.ready > state.time + 0.15;
    const objective = modeGoal(robot, enemy);
    const medal = state.mode === 'medals' && nearestMedal(robot);
    const intercept = !objective && !medal && enemyAlive && robot.strategy === 'intercept' && robot.guns.length &&
      interceptPoint(robot, enemy, range);
    const push = !objective && !medal && enemyAlive && rollerGoal(robot, enemy);
    const echo = enemyAlive && enemy.echo;
    if (echo && distance(robot, echo.point) <= ECHO_RADIUS + 8) {
      intent = 'retreat';
      let shortest = Infinity;
      goal = robot;
      for (let index = 0; index < 12; index++) {
        const angle = index * Math.PI / 6;
        const point = { x: echo.point.x + Math.cos(angle) * (ECHO_RADIUS + 8),
          y: echo.point.y + Math.sin(angle) * (ECHO_RADIUS + 8) };
        if (withinSpikeBorder(point) || entersSpikes(robot, point) ||
            blocked(robot, point, navigation.solids)) continue;
        const gap = distance(robot, point);
        if (gap < shortest) {
          goal = point;
          shortest = gap;
        }
      }
    } else if (objective) {
      intent = objective.intent;
      goal = objective.goal;
    } else if (medal) {
      intent = 'drop';
      goal = medal;
    } else if (push) {
      intent = 'push';
      goal = push;
    } else if (intercept) {
      intent = 'intercept';
      goal = intercept;
    } else if (drops.length && !cooling && !(nearCorner && span < 115)) {
      intent = 'drop';
      const cost = drop => {
        const span = distance(robot, drop);
        return span + (blocked(robot, drop, navigation.barriers) ? 75 : 0) +
          Math.max(0, span - distance(enemy, drop)) * 0.45;
      };
      goal = drops[0];
      let bestCost = cost(goal);
      for (const drop of drops) {
        const value = cost(drop);
        if (value < bestCost) {
          goal = drop;
          bestCost = value;
        }
      }
    } else if (enemyAlive && keepsRange(robot) && robot.guns.length) {
      intent = 'fight';
      goal = enemy;
    } else if (!enemyAlive || ahead || cooling || (!finalStretch && (nearCorner || danger || state.time >= robot.maneuverAt)) || !robot.guns.length) {
      intent = ahead || cooling || nearCorner || danger ? 'retreat' : 'reposition';
      const seekCover = enemyAlive && (ahead || cooling || danger);
      const desired = intent === 'retreat' ? threat + 130 : range * 0.85;
      const score = point => {
        const gap = distance(point, enemy);
        const cover = seekCover && blocked(point, enemy, state.walls);
        return -Math.abs(gap - desired) * 0.7 - Math.abs(distance(robot, point) - 165) +
          Math.min(140, point.x, WIDTH - point.x, point.y, HEIGHT - point.y) * 0.9 +
          (cover ? 140 : 0) - (inMud(point, state.mud) ? 55 : 0);
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
    const fastThink = cooling || finalStretch ||
      ['evadeCore', 'contestZone', 'interceptCarrier', 'passCore', 'holdZone', 'zone'].includes(intent);
    robot.thinkAt = state.time + (fastThink ? 0.25 : intent === 'retreat' || intent === 'reposition' ? 1.45 : 0.45);
  }

  function move(robot, target, amount, opponent, paths, movement) {
    const span = distance(robot, target);
    if (span < 0.1) return false;
    const to = pointAlong(robot, target, Math.min(amount / span, 1));
    to.x = clamp(to.x, EDGE + RADIUS, WIDTH - EDGE - RADIUS);
    to.y = clamp(to.y, EDGE + RADIUS, HEIGHT - EDGE - RADIUS);
    const prior = { x: robot.x, y: robot.y };
    const opponentAlive = isAlive(opponent);
    for (const axis of ['x', 'y']) {
      const next = { x: robot.x, y: robot.y, [axis]: to[axis] };
      const closest = {
        ...next,
        [axis]: clamp(opponent[axis], Math.min(robot[axis], next[axis]), Math.max(robot[axis], next[axis])),
      };
      const gap = distance(closest, opponent);
      const contactWithOpponent = opponentAlive && gap < CONTACT_RANGE && gap < distance(robot, opponent);
      if (contactWithOpponent) {
        const crossGap = axis === 'x' ? robot.y - opponent.y : robot.x - opponent.x;
        const clearance = Math.sqrt(CONTACT_RANGE ** 2 - crossGap ** 2);
        const side = Math.sign(robot[axis] - opponent[axis]);
        const contact = opponent[axis] + side * clearance;
        next[axis] = clamp(contact, Math.min(robot[axis], next[axis]), Math.max(robot[axis], next[axis]));
      }
      if (!contactWithOpponent && next[axis] === robot[axis]) continue;
      if (blocked(robot, next, navigation.solids) || (paths && (entersSpikes(robot, next) ||
          paths.some(path => entersProjectilePath(robot, next, axis, path))))) continue;
      const contact = rollerContact(robot, next);
      if (contact <= 1) {
        if (paths) continue;
        Object.assign(robot, pointAlong(robot, next, contact));
        crush(robot);
        return true;
      }
      if (contactWithOpponent && movement) {
        movement.pressure = { x: (target.x - prior.x) / span, y: (target.y - prior.y) / span };
        movement.touchedOpponent = true;
      }
      robot[axis] = next[axis];
    }
    if (opponentAlive && movement && distance(robot, opponent) <= CONTACT_RANGE + 1) {
      movement.touchedOpponent = true;
    }
    return distance(prior, robot) > 0.01;
  }

  function pushOpponents(movements, dt) {
    const [a, b] = robots;
    if (!isAlive(a) || !isAlive(b)) return false;
    const [first, second] = movements.map(({ pressure }) => pressure);
    const difference = a.stats.power - b.stats.power;
    if (!difference || Math.abs(distance(a, b) - CONTACT_RANGE) > 1e-8) return false;

    const stronger = difference > 0 ? a : b;
    const weaker = difference > 0 ? b : a;
    const direction = difference > 0 ? first : second;
    const resistance = difference > 0 ? second : first;
    const dx = weaker.x - stronger.x;
    const dy = weaker.y - stronger.y;
    if (!direction || direction.x * dx + direction.y * dy <= 0) return false;
    const offensivePush = stronger.intent === 'push' && stronger.goal === weaker;
    if (!offensivePush && (!resistance || resistance.x * dx + resistance.y * dy >= 0)) return false;
    const advantage = Math.abs(difference);
    let travel = movementSpeed(stronger) * dt * advantage / (advantage + PUSH_POWER_SCALE);

    for (const robot of robots) {
      for (const [axis, extent] of [['x', WIDTH], ['y', HEIGHT]]) {
        const component = direction[axis];
        if (!component) continue;
        const boundary = component > 0 ? extent - EDGE - RADIUS : EDGE + RADIUS;
        travel = Math.min(travel, (boundary - robot[axis]) / component);
      }
    }
    if (travel <= 0) return false;

    for (const robot of robots) {
      const end = { x: robot.x + direction.x * travel, y: robot.y + direction.y * travel };
      const entry = Math.min(...navigation.solids.map(wall => impact(robot, end, wall) ?? Infinity));
      if (entry <= 1) travel = travel * entry - 1e-8;
      if (travel <= 1e-8) return false;
    }
    const contacts = robots.map(robot => rollerContact(robot,
      { x: robot.x + direction.x * travel, y: robot.y + direction.y * travel }));
    const entry = Math.min(...contacts);
    if (entry <= 1) travel *= entry;
    for (const robot of robots) {
      robot.x += direction.x * travel;
      robot.y += direction.y * travel;
    }
    if (entry <= 1) crush(robots[contacts.indexOf(entry)]);
    return true;
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
      const point = clampToSafeInterior({
        x: robot.x + Math.cos(angle) * lookAhead, y: robot.y + Math.sin(angle) * lookAhead,
      });
      if (entersSpikes(robot, point) || blocked(robot, point, navigation.solids) ||
          blocked(point, enemy, state.walls)) continue;
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

  function projectilePaths(robot) {
    const paths = [];
    for (const shot of state.projectiles) {
      if (shot.robot === robot) continue;
      paths.push({ from: shot, to: shot.to, speed: shot.speed, delay: 0 });
      if (!shot.canBounce || !shot.reflection) continue;
      const remaining = shot.range - distance(shot.from, shot.to);
      if (remaining <= 1e-8) continue;
      const { to } = projectileLeg(shot.to, shot.reflection, remaining, state.walls, shot.surface);
      paths.push({ from: shot.to, to, speed: shot.speed, delay: distance(shot, shot.to) / shot.speed });
    }
    return paths;
  }

  function dodgeTarget(robot, enemy, speed, dt, paths) {
    if (speed <= 0) return null;
    const horizon = Math.max(dt, DODGE_LOOKAHEAD);
    const threats = [];

    for (const { from, to, speed, delay } of paths) {
      const span = distance(from, to);
      const length = Math.min(span, (horizon - delay) * speed);
      if (length <= 0) continue;
      const end = pointAlong(from, to, length / span);
      const fraction = closestFraction(from, end, robot);
      const clearance = distance(robot, pointAlong(from, end, fraction));
      if (clearance >= (fraction === 0 && delay === 0 ? RADIUS : DODGE_CLEARANCE)) continue;
      threats.push({
        from, end, clearance, time: delay + fraction * length / speed,
        angle: Math.atan2(to.y - from.y, to.x - from.x),
      });
    }

    if (!threats.length) return null;

    const urgent = threats.reduce((first, threat) => threat.time < first.time ? threat : first);
    const reach = Math.min(speed * Math.max(dt, urgent.time), DODGE_CLEARANCE * 2);
    let best = Math.min(...threats.map(threat => threat.clearance));
    let target = null;
    for (const offset of steeringOffsets) {
      const angle = urgent.angle + Math.PI / 2 + offset * Math.PI / 6;
      const point = clampToSafeInterior({
        x: robot.x + Math.cos(angle) * reach, y: robot.y + Math.sin(angle) * reach,
      });
      if (entersSpikes(robot, point) || blocked(robot, point, navigation.solids) ||
          (isAlive(enemy) && distance(enemy, pointAlong(robot, point, closestFraction(robot, point, enemy))) <
            Math.min(CONTACT_RANGE, distance(robot, enemy)) - 1e-8)) continue;
      const span = distance(robot, point);
      if (span <= 0.01) continue;
      const score = Math.min(DODGE_CLEARANCE, ...threats.map(({ from, end, time }) => {
        const position = pointAlong(robot, point, Math.min(1, speed * Math.max(dt, time) / span));
        return pathClearance(position, from, end);
      }));
      if (score > best + 1e-8) {
        target = point;
        best = score;
      }
    }
    return target;
  }

  function walk(robot, enemy, dt, movement) {
    robot.muddy = inMud(robot, state.mud);

    if (robot.pull) {
      const { target, until, stop } = robot.pull;
      if (state.time < until && distance(robot, target) > stop &&
          move(robot, target, 325 * dt * spikeSpeed(robot), enemy)) {
        turnToward(robot, target, dt);
        return;
      }
      robot.pull = null;
    }

    const enemyAlive = isAlive(enemy);
    const span = distance(robot, enemy);
    const clear = enemyAlive && !blocked(robot, enemy, state.walls);
    const firingDistance = firingRange(robot);
    const preferred = Math.max(CONTACT_RANGE, firingDistance * (robot.strategy === 'advance' ? 0.63 : 0.83));
    const speed = movementSpeed(robot);
    const paths = projectilePaths(robot);
    const dodge = dodgeTarget(robot, enemy, speed, dt, paths);
    if (!dodge && state.time >= robot.thinkAt) chooseGoal(robot, enemy, firingDistance);
    const escape = safeTarget(robot);
    let target = robot;
    let moving = false;
    if (dodge || escape !== robot) {
      target = dodge || escape;
      moving = move(robot, target, speed * dt, enemy, paths, movement);
      robot.nextPath = 0;
    } else if ((robot.intent === 'push' || robot.intent === 'passCore') && robot.goal === enemy && clear) {
      target = enemy;
      moving = move(robot, enemy, speed * dt, enemy, paths, movement);
    } else if (keepsRange(robot) && robot.goal === enemy && clear && firingDistance > CONTACT_RANGE &&
        (span <= firingDistance || !entersSpikes(robot, enemy))) {
      let remaining = speed * dt;
      while (remaining > 0) {
        target = rangedTarget(robot, enemy, distance(robot, enemy), firingDistance);
        const travel = Math.min(remaining, distance(robot, target));
        if (!move(robot, target, travel, enemy, paths, movement)) break;
        moving = true;
        remaining -= travel;
      }
    } else if (robot.goal === enemy && clear && preferred === CONTACT_RANGE &&
        Math.abs(span - CONTACT_RANGE) <= 1e-8) {
      target = enemy;
      moving = move(robot, target, speed * dt, enemy, paths, movement);
    } else if (robot.goal !== enemy || span > preferred || !clear || robot.intent === 'passCore') {
      if (state.time >= robot.nextPath || !robot.waypoint || distance(robot, robot.waypoint) < 7) {
        robot.waypoint = nextWaypoint(robot, safeTarget(robot.goal, robot), navigation);
        robot.nextPath = state.time + 0.20;
      }
      target = robot.waypoint;
      moving = move(robot, target, speed * dt, enemy, paths, movement);
    }
    turnToward(robot, enemyAlive && (clear || distance(robot, target) < 1) ? enemy : target, dt);
    return moving;
  }

  return { entersSpikes, move, pushOpponents, walk };
}
