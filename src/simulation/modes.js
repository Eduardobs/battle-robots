import { clampToSafeInterior, HEIGHT, RADIUS, WIDTH, withinSpikeBorder } from './arena.js';
import { CONTACT_RANGE } from './combat-rules.js';
import { blocked, distance, pathClearance } from './geometry.js';

export const MODES = ['battle', 'medals', 'king', 'ctf', 'charge', 'race'];

const KING_TARGET = 30;
const KING_INTERVAL = 20;
const KING_RADIUS = 62;

const CTF_TARGET = 2;
const CTF_BASE_RADIUS = 34;

const CHARGE_TARGET = 3;
const CHARGE_DURATION = 10;
const CHARGE_LOCK = 1;
const CHARGE_CORE_RADIUS = 16;

const RACE_TARGET = 3;
const RACE_PORTAL_RADIUS = 30;

const RESPAWN_DELAY = 3;

export const isAlive = robot => !(robot.respawnAt > 0);

export function spawnPosition(id) {
  return { x: id === 0 ? 71 : WIDTH - 71, y: HEIGHT / 2, angle: id === 0 ? 0 : Math.PI };
}

function clearRespawnSpot(desired, enemy, navigation) {
  if (!isAlive(enemy) || distance(desired, enemy) >= CONTACT_RANGE + 1) return desired;
  for (let step = 0; step < 12; step++) {
    const angle = Math.atan2(desired.y - enemy.y, desired.x - enemy.x) + step * Math.PI / 6;
    const candidate = clampToSafeInterior({
      x: enemy.x + Math.cos(angle) * (CONTACT_RANGE + 2),
      y: enemy.y + Math.sin(angle) * (CONTACT_RANGE + 2),
    });
    if (!withinSpikeBorder(candidate) && !blocked(candidate, candidate, navigation.barriers) &&
        distance(candidate, enemy) >= CONTACT_RANGE + 1) {
      return { ...desired, x: candidate.x, y: candidate.y };
    }
  }
  return desired;
}

function pickNearestValid(anchor, positions, navigation, used = []) {
  const clear = point => !withinSpikeBorder(point) && !blocked(point, point, navigation.barriers) &&
    used.every(other => distance(point, other) >= 120);
  if (clear(anchor)) return { x: anchor.x, y: anchor.y };
  let best = positions[0] ?? anchor;
  let shortest = Infinity;
  for (const point of positions) {
    if (!clear(point)) continue;
    const span = distance(point, anchor);
    if (span < shortest) {
      best = point;
      shortest = span;
    }
  }
  return { x: best.x, y: best.y };
}

export function createModeController(state, navigation, positions, {
  pick, log, effect, finish, resetRobotForRound, clearRobotTransient,
}) {
  const { mode, robots } = state;

  function scheduleRespawn(robot) {
    clearRobotTransient(robot);
    robot.hp = 0;
    robot.respawnAt = state.time + RESPAWN_DELAY;
    log(robot, 'event.destroyed');
  }

  function processRespawns(respawnFor) {
    for (const robot of robots) {
      if (!robot.respawnAt || state.time + 1e-8 < robot.respawnAt) continue;
      const desired = respawnFor(robot);
      const spot = clearRespawnSpot(desired, robots[1 - robot.id], navigation);
      robot.respawnAt = 0;
      robot.hp = robot.stats.hp;
      Object.assign(robot, spot, {
        waypoint: null, nextPath: 0, thinkAt: 0, moving: false, pull: null,
        burns: [], lockedUntil: 0, frozenUntil: 0, controlProtectedUntil: 0, echo: null, spikeDamage: 0,
      });
      effect('dodge', robot, robot, 0.5);
      log(robot, 'event.respawn');
    }
  }

  if (mode === 'king') {
    const initial = pick(positions);
    const modeState = {
      target: KING_TARGET,
      interval: KING_INTERVAL,
      scores: [0, 0],
      holdTime: [0, 0],
      zone: { x: initial.x, y: initial.y, radius: KING_RADIUS, nextMove: KING_INTERVAL, owner: null, contested: false },
    };
    state.modeState = modeState;

    function relocateZone() {
      const far = positions.filter(point => distance(point, modeState.zone) >= 220);
      const spot = pick(far.length ? far : positions);
      modeState.zone.x = spot.x;
      modeState.zone.y = spot.y;
      modeState.zone.nextMove += KING_INTERVAL;
      modeState.zone.owner = null;
      modeState.zone.contested = false;
      robots.forEach(robot => { robot.thinkAt = 0; robot.nextPath = 0; });
      log(null, 'event.zoneMove');
    }

    function scoreSlice(slice) {
      const [a, b] = robots;
      const { zone } = modeState;
      const inA = isAlive(a) && distance(a, zone) <= zone.radius;
      const inB = isAlive(b) && distance(b, zone) <= zone.radius;
      if (inA && inB) {
        zone.owner = null;
        zone.contested = true;
        return;
      }
      if (!inA && !inB) {
        zone.owner = null;
        zone.contested = false;
        return;
      }
      const id = inA ? 0 : 1;
      zone.owner = id;
      zone.contested = false;
      modeState.holdTime[id] += slice;
      while (modeState.holdTime[id] >= 1 - 1e-8) {
        modeState.holdTime[id] = Math.max(0, modeState.holdTime[id] - 1);
        modeState.scores[id] += 1;
        if (modeState.scores[id] >= KING_TARGET) {
          modeState.scores[id] = KING_TARGET;
          finish('objective');
          return;
        }
      }
    }

    return {
      update(delta) {
        let remaining = delta;
        let currentTime = state.time - delta;
        while (remaining > 1e-9 && !state.result) {
          const untilMove = modeState.zone.nextMove - currentTime;
          const slice = Math.min(remaining, Math.max(0, untilMove));
          if (slice > 0) {
            scoreSlice(slice);
            if (state.result) return;
            currentTime += slice;
            remaining -= slice;
          }
          if (currentTime + 1e-8 >= modeState.zone.nextMove) relocateZone();
        }
      },
      onDefeat() {
        finish('knockout');
        return 'finished';
      },
      compare() {
        return modeState.scores[0] - modeState.scores[1];
      },
    };
  }

  if (mode === 'ctf') {
    const bases = [0, 1].map(id => ({ id, ...spawnPosition(id), radius: CTF_BASE_RADIUS }));
    const flags = bases.map(base => ({ id: base.id, x: base.x, y: base.y, carrier: null, atHome: true }));
    const modeState = {
      target: CTF_TARGET,
      respawnDelay: RESPAWN_DELAY,
      captures: [0, 0],
      bases,
      flags,
    };
    state.modeState = modeState;

    function resetFlag(flag) {
      const base = bases[flag.id];
      flag.carrier = null;
      flag.atHome = true;
      flag.x = base.x;
      flag.y = base.y;
    }

    function syncFlags() {
      for (const flag of flags) {
        if (flag.carrier === null) continue;
        const carrier = robots[flag.carrier];
        flag.x = carrier.x;
        flag.y = carrier.y;
      }
    }

    function tryCapture(robot, from) {
      const enemyFlag = flags[1 - robot.id];
      const ownFlag = flags[robot.id];
      const ownBase = bases[robot.id];
      if (enemyFlag.carrier !== robot.id || !ownFlag.atHome) return false;
      if (pathClearance(ownBase, from, robot) > ownBase.radius) return false;
      modeState.captures[robot.id] += 1;
      resetFlag(enemyFlag);
      effect('capture', ownBase, ownBase, 0.55, { team: robot.id });
      log(robot, 'event.flagCapture');
      robots.forEach(unit => { unit.thinkAt = 0; unit.nextPath = 0; });
      if (modeState.captures[robot.id] >= CTF_TARGET) finish('objective');
      return true;
    }

    return {
      beforeStep() {
        processRespawns(robot => spawnPosition(robot.id));
      },
      update(_delta, movements, order) {
        syncFlags();
        for (const robot of order) {
          if (state.result || !isAlive(robot)) continue;
          const from = movements[robot.id];
          const enemyFlag = flags[1 - robot.id];
          if (enemyFlag.carrier === null && pathClearance(enemyFlag, from, robot) <= bases[enemyFlag.id].radius) {
            enemyFlag.carrier = robot.id;
            enemyFlag.atHome = false;
            enemyFlag.x = robot.x;
            enemyFlag.y = robot.y;
            robots.forEach(unit => { unit.thinkAt = 0; unit.nextPath = 0; });
            log(robot, 'event.flagPickup');
          }
          tryCapture(robot, from);
        }
        syncFlags();
      },
      onDefeat(robot) {
        const carried = flags[1 - robot.id];
        if (carried.carrier === robot.id) {
          resetFlag(carried);
          log(robot, 'event.flagReturn');
          robots.forEach(unit => { unit.thinkAt = 0; unit.nextPath = 0; });
        }
        scheduleRespawn(robot);
        const survivor = robots[1 - robot.id];
        if (isAlive(survivor)) tryCapture(survivor, survivor);
        return state.result ? 'finished' : 'respawning';
      },
      compare() {
        return modeState.captures[0] - modeState.captures[1];
      },
    };
  }

  if (mode === 'charge') {
    const modeState = {
      target: CHARGE_TARGET,
      duration: CHARGE_DURATION,
      transferLock: CHARGE_LOCK,
      round: 1,
      points: [0, 0],
      core: {
        x: WIDTH / 2, y: HEIGHT / 2, radius: CHARGE_CORE_RADIUS,
        carrier: null, timer: CHARGE_DURATION, transferLockUntil: 0,
      },
    };
    state.modeState = modeState;

    function resetRound() {
      modeState.round += 1;
      for (const robot of robots) resetRobotForRound(robot);
      state.projectiles.length = 0;
      state.effects = state.effects.filter(item => item.kind === 'coreBlast');
      Object.assign(modeState.core, {
        x: WIDTH / 2, y: HEIGHT / 2, carrier: null, timer: CHARGE_DURATION, transferLockUntil: 0,
      });
      log(null, 'event.newRound');
    }

    function awardPoint(winnerId) {
      modeState.points[winnerId] += 1;
      log(robots[winnerId], 'event.roundPoint');
      if (modeState.points[winnerId] >= CHARGE_TARGET) {
        finish('objective');
        return 'finished';
      }
      resetRound();
      return 'roundReset';
    }

    return {
      update(delta, movements, order) {
        const { core } = modeState;
        if (core.carrier === null) {
          let taker = null;
          let nearest = Infinity;
          for (const robot of order) {
            if (!isAlive(robot)) continue;
            const gap = pathClearance(core, movements[robot.id], robot);
            if (gap <= RADIUS + core.radius && gap < nearest && !blocked(robot, core, state.walls)) {
              taker = robot;
              nearest = gap;
            }
          }
          if (taker) {
            core.carrier = taker.id;
            core.timer = CHARGE_DURATION;
            core.transferLockUntil = 0;
            core.x = taker.x;
            core.y = taker.y;
            robots.forEach(unit => { unit.thinkAt = 0; unit.nextPath = 0; });
            log(taker, 'event.corePickup');
            effect('coreTransfer', { x: WIDTH / 2, y: HEIGHT / 2 }, taker, 0.35);
          }
          return null;
        }

        let carrier = robots[core.carrier];
        let rival = robots[1 - core.carrier];
        const touching = distance(carrier, rival) <= CONTACT_RANGE + 1 ||
          movements[0].touchedOpponent || movements[1].touchedOpponent;
        if (touching && state.time + 1e-8 >= core.transferLockUntil) {
          const previous = carrier;
          core.carrier = rival.id;
          core.transferLockUntil = state.time + CHARGE_LOCK;
          carrier = rival;
          rival = previous;
          robots.forEach(unit => { unit.thinkAt = 0; unit.nextPath = 0; });
          log(previous, 'event.coreTransfer');
          effect('coreTransfer', previous, carrier, 0.35);
        }

        core.x = carrier.x;
        core.y = carrier.y;
        core.timer = Math.max(0, core.timer - delta);
        if (core.timer <= 1e-8) {
          log(carrier, 'event.coreDetonate');
          effect('coreBlast', carrier, carrier, 0.55);
          return awardPoint(rival.id);
        }
        return null;
      },
      onDefeat(robot) {
        const rival = robots[1 - robot.id];
        if (rival.hp > 0) return awardPoint(rival.id);
        resetRound();
        return 'roundReset';
      },
      compare() {
        return modeState.points[0] - modeState.points[1];
      },
    };
  }

  if (mode === 'race') {
    const anchors = [
      { x: WIDTH / 2, y: 105 },
      { x: WIDTH - 185, y: HEIGHT - 115 },
      { x: 185, y: HEIGHT - 115 },
    ];
    const portals = [];
    for (let id = 0; id < anchors.length; id++) {
      const point = pickNearestValid(anchors[id], positions, navigation, portals);
      portals.push({ id, x: point.x, y: point.y, radius: RACE_PORTAL_RADIUS });
    }
    const modeState = {
      target: RACE_TARGET,
      respawnDelay: RESPAWN_DELAY,
      portals,
      progress: [
        { laps: 0, nextPortal: 0, lastPortal: null },
        { laps: 0, nextPortal: 0, lastPortal: null },
      ],
    };
    state.modeState = modeState;

    function respawnFor(robot) {
      const prog = modeState.progress[robot.id];
      if (prog.lastPortal === null) return spawnPosition(robot.id);
      const from = portals[prog.lastPortal];
      const next = portals[prog.nextPortal];
      return { x: from.x, y: from.y, angle: Math.atan2(next.y - from.y, next.x - from.x) };
    }

    return {
      beforeStep() {
        processRespawns(respawnFor);
      },
      update(_delta, movements, order) {
        for (const robot of order) {
          if (state.result || !isAlive(robot)) continue;
          const prog = modeState.progress[robot.id];
          const portal = portals[prog.nextPortal];
          if (pathClearance(portal, movements[robot.id], robot) > portal.radius) continue;
          prog.lastPortal = prog.nextPortal;
          prog.nextPortal = (prog.nextPortal + 1) % portals.length;
          effect('portalPass', portal, portal, 0.45, { team: robot.id, radius: portal.radius });
          robot.thinkAt = 0;
          robot.nextPath = 0;
          if (prog.nextPortal === 0) {
            prog.laps += 1;
            log(robot, 'event.lapComplete');
            if (prog.laps >= RACE_TARGET) {
              finish('objective');
              return;
            }
          } else {
            log(robot, 'event.portalPass');
          }
        }
      },
      onDefeat(robot) {
        scheduleRespawn(robot);
        return 'respawning';
      },
      compare() {
        const [a, b] = modeState.progress;
        return (a.laps * portals.length + a.nextPortal) - (b.laps * portals.length + b.nextPortal);
      },
    };
  }

  return {
    compare() {
      const [a, b] = robots;
      return mode === 'medals'
        ? a.report.drops.medal - b.report.drops.medal
        : a.hp / a.stats.hp - b.hp / b.stats.hp;
    },
    onDefeat() {
      finish('knockout');
      return 'finished';
    },
  };
}
