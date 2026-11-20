import { ATTRIBUTES_BASE } from '../../config.js';
import { guns } from '../catalog.js';
import { RADIUS } from './arena.js';
import { CONTROL_RECOVERY, ECHO_RADIUS, firingRange, keepsRange, preferredRange, THAW_DURATION, weaponRange } from './combat-rules.js';
import { blocked, clamp, distance, firstContact, pointAlong } from './geometry.js';
import { bouncePoint, projectileLeg, robotImpact } from './trajectories.js';

const PROJECTILE_SPEED_BONUS_PER_POINT = 0.001;
const ECHO_DELAY = 0.5;

export function createWeapons(state, navigation, { entersSpikes, move }, { random, damage, effect, log }) {
  const { robots } = state;

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
        if (entersSpikes(robot, landing)) continue;
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
    const critical = key === 'pistol' && random() < 0.18;
    const returned = damage(robot, enemy, weapon.damage * (critical ? 1.85 : 1), critical ? 'event.critical' : 'event.hit', `guns.${key}.name`);
    if (state.result) return;
    if (key === 'flame') {
      enemy.burns.push({ from: robot, until: state.time + 3, next: state.time + 0.25 });
    }
    if (!weapon.controlDuration || enemy.controlProtectedUntil > state.time + 1e-8) return;
    if (key === 'hook' && returned) return;

    const until = state.time + weapon.controlDuration;
    if (key === 'hammer' || key === 'pulse') enemy.lockedUntil = until;
    if (key === 'nitrogen') enemy.frozenUntil = until + THAW_DURATION;
    enemy.controlProtectedUntil = (key === 'nitrogen' ? enemy.frozenUntil : until) + CONTROL_RECOVERY;

    if (key === 'pulse' && !returned) {
      move(enemy, { x: enemy.x + 58 * Math.cos(angle), y: enemy.y + 58 * Math.sin(angle) }, 58, robot);
      enemy.thinkAt = 0;
    }
    if (key === 'hook') {
      enemy.pull = { target: robot, until, stop: RADIUS * 2 };
      effect('tether', robot, enemy, 0.5, { attached: robot.id, victim: enemy.id });
      log(robot, 'event.hookEnemy');
    }
  }

  function launch(robot, key, target, bounce, anchor) {
    const { range, projectileSpeed } = guns[key];
    const bonus = (robot.stats.projectileSpeed - ATTRIBUTES_BASE) * PROJECTILE_SPEED_BONUS_PER_POINT;
    const speed = projectileSpeed * (1 + bonus);
    const from = { x: robot.x, y: robot.y };
    const aim = bounce || target;
    const span = distance(from, aim) || 1;
    const direction = { x: (aim.x - from.x) / span, y: (aim.y - from.y) / span };
    const leg = anchor ? { to: anchor.contact } : projectileLeg(from, direction, range, state.walls);
    state.projectiles.push({
      key, robot, speed, anchor, x: from.x, y: from.y,
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

  return { advanceProjectile, fire };
}
