import assert from 'node:assert/strict';
import test from 'node:test';
import { createBattle, EDGE, generateArena, HEIGHT, STEP, WIDTH } from '../../src/battle.js';
import { guns } from '../../src/catalog.js';

function loadout({ hp = 100, speed = 10, attack = 0, defense = 0, evasion = 0, aim = 0,
  weapons = [], tools = [], strategy = 'advance' } = {}) {
  return {
    stats: { hp, defense, attack, speed, evasion, aim },
    guns: weapons,
    utils: tools,
    strategy,
  };
}

function duel(loadouts, options = {}) {
  const events = [];
  const battle = createBattle(loadouts, {
    random: () => 0.1,
    onEvent: event => events.push(event),
    ...options,
  });
  return { ...battle, events };
}

test('a velocidade 100 percorre dez vezes a distância da velocidade 10 em campo livre', () => {
  const { state, step } = duel([loadout({ speed: 100 }), loadout()]);
  const [fast, slow] = state.robots;
  Object.assign(fast, { x: 100, y: 50, goal: { x: 250, y: 50 }, thinkAt: Infinity });
  Object.assign(slow, { x: 900, y: 50, goal: { x: 750, y: 50 }, thinkAt: Infinity });
  step();
  assert.ok(Math.abs((fast.x - 100) - (900 - slow.x) * 10) < 1e-8);
  assert.ok(fast.x > 100);
});

test('um movimento rápido para no contato com o adversário', () => {
  const { state, step } = duel([loadout({ speed: 5000 }), loadout()]);
  const [fast, slow] = state.robots;
  Object.assign(fast, { x: 100, y: 50, goal: { x: 600, y: 50 }, thinkAt: Infinity });
  Object.assign(slow, { x: 220, y: 50, goal: slow, thinkAt: Infinity });
  step();
  assert.equal(fast.x, slow.x - 38);
});

test('o dano escala com a razão entre ataque e defesa', () => {
  for (const [attack, defense, multiplier] of [[10, 10, 1], [100, 10, 10], [100, 100, 1], [10, 100, 0.1]]) {
    const { state, step, events } = duel([
      loadout({ attack, weapons: ['hammer'] }), loadout({ hp: 1000, defense }),
    ]);
    state.robots[1].x = state.robots[0].x + 60;
    step();
    const damage = guns.hammer.damage * multiplier;
    assert.equal(events.find(event => event.action === 'event.hit')?.damage, damage);
    assert.equal(state.robots[1].hp, 1000 - damage);
  }
});

test('a chance de esquiva depende da razão entre mira e evasão', () => {
  for (const [aim, evasion, rollWithinAccuracy, action] of [
    [1, 100, 0.009, 'event.hit'], [1, 100, 0.011, 'event.evaded'],
    [10, 1000, 0.009, 'event.hit'], [10, 1000, 0.011, 'event.evaded'],
    [10, 100, 0.09, 'event.hit'], [10, 100, 0.11, 'event.evaded'],
    [100, 100, 0.99, 'event.hit'], [200, 100, 0.99, 'event.hit'],
    [1, 0, 0.99, 'event.hit'], [1, 100, 1.01, 'event.miss'],
  ]) {
    const accuracy = 0.78 + 0.21 * (aim / (aim + 70));
    const { state, step, events } = duel([
      loadout({ aim, weapons: ['hammer'] }), loadout({ evasion }),
    ], { random: () => rollWithinAccuracy * accuracy });
    state.robots[1].x = state.robots[0].x + 60;
    step();
    assert.ok(events.some(event => event.action === action));
  }
});

test('a arena sorteia paredes e lama dentro dos limites do campo', () => {
  for (const [roll, count] of [[0.1, 3], [0.9, 4]]) {
    const { walls, mud } = generateArena(() => roll);
    assert.equal(walls.length, count);
    assert.equal(mud.length, 4);
    for (const { x, y, w, h } of walls) {
      assert.ok(w > 0 && h > 0);
      assert.ok(x >= EDGE && x + w <= WIDTH - EDGE);
      assert.ok(y >= EDGE && y + h <= HEIGHT - EDGE);
    }
    for (const { x, y, rx, ry } of mud) {
      assert.ok(rx > 0 && ry > 0);
      assert.ok(x - rx >= EDGE && x + rx <= WIDTH - EDGE);
      assert.ok(y - ry >= EDGE && y + ry <= HEIGHT - EDGE);
    }
  }
});

test('ao esgotar o tempo, o resultado usa o HP absoluto e trata empates', () => {
  for (const [hp, winner] of [[90, 0], [100, null], [110, 1]]) {
    const duration = STEP * 2.5;
    const { state, step, events } = duel([loadout(), loadout({ hp })], { duration });
    step();
    step();
    assert.equal(state.result, null);
    step();
    assert.equal(state.time, duration);
    assert.deepEqual(state.result, { winner, reason: 'timeout' });
    assert.equal(events.at(-1).action, 'event.timeout');
    const eventCount = events.length;
    step();
    assert.equal(events.length, eventCount);
    assert.equal(state.time, duration);
  }
});

test('um disparo letal limita o dano à vida restante e termina em nocaute', () => {
  const { state, step, events } = duel([
    loadout({ weapons: ['hammer'] }),
    loadout({ hp: 10 }),
  ]);
  state.robots[1].x = state.robots[0].x + 60;
  step();
  assert.equal(state.robots[1].hp, 0);
  assert.deepEqual(state.result, { winner: 0, reason: 'knockout' });
  assert.deepEqual(events.slice(-2).map(({ robot, action, damage }) => [robot, action, damage]), [
    [0, 'event.hit', 10],
    [null, 'event.knockout', null],
  ]);
});

test('o escudo reduz o dano e a arma respeita o intervalo entre disparos', () => {
  const { state, step, events } = duel([
    loadout({ weapons: ['hammer'] }),
    loadout({ tools: ['shield'] }),
  ], { random: () => 0.2 });
  state.robots[1].x = state.robots[0].x + 60;
  step();
  assert.equal(state.robots[1].hp, 100 - guns.hammer.damage * 0.55);
  assert.ok(events.some(event => event.action === 'event.activate' && event.item === 'utils.shield.name'));
  step();
  assert.equal(events.filter(event => event.action === 'event.hit').length, 1);
});

test('um drop de vida é coletado e a cura respeita o HP máximo', () => {
  const { state, step, events } = duel([loadout(), loadout()]);
  const robot = state.robots[0];
  robot.hp = 95;
  state.drops.push({ x: robot.x, y: robot.y, type: 'health' });
  step();
  assert.equal(robot.hp, 100);
  assert.equal(state.drops.length, 0);
  assert.ok(events.some(event => event.robot === 0 && event.action === 'event.collect' &&
    event.item === 'drop.health'));
});

for (const strategy of ['distance', 'flank']) {
  test(`${strategy} recua até perto do alcance da pistola e continua atirando`, () => {
    const { state, step, events } = duel([
      loadout({ weapons: ['pistol', 'saw'], strategy }), loadout(),
    ], { random: () => 0.2 });
    const [robot, enemy] = state.robots;
    Object.assign(robot, { x: 250, y: 280 });
    Object.assign(enemy, { x: 100, y: 280, goal: enemy, thinkAt: Infinity });
    for (let frame = 0; frame < 180; frame++) step();
    const gap = Math.hypot(robot.x - enemy.x, robot.y - enemy.y);
    assert.ok(gap >= guns.pistol.range - 15 && gap <= guns.pistol.range, `distância: ${gap}`);
    assert.ok(events.some(event => event.time > 2 && event.action === 'event.hit' &&
      event.item === 'guns.pistol.name'));
    if (strategy === 'flank') assert.ok(Math.abs(robot.y - 280) > 20);
  });

  test(`${strategy} usa o gancho temporário para se afastar pela parede`, () => {
    const { state, step, events } = duel([
      loadout({ weapons: ['pistol'], strategy }), loadout(),
    ]);
    const [robot, enemy] = state.robots;
    Object.assign(robot, { x: 400, y: 200 });
    Object.assign(enemy, { x: 270, y: 200, goal: enemy, thinkAt: Infinity });
    robot.guns.push({ key: 'hook', ready: 0, expires: 10 });
    step();
    assert.ok(events.some(event => event.action === 'event.hookWall'));
    assert.ok(robot.pull);
    for (let frame = 0; frame < 20; frame++) step();
    assert.ok(Math.hypot(robot.x - enemy.x, robot.y - enemy.y) > 165);
    assert.equal(enemy.pull, null);
  });

  test(`${strategy} poupa o gancho quando não há parede para recuar`, () => {
    const { state, step, events } = duel([
      loadout({ weapons: ['pistol', 'hook'], strategy }), loadout(),
    ]);
    const [robot, enemy] = state.robots;
    enemy.x = robot.x + 100;
    step();
    assert.equal(robot.guns[1].ready, 0);
    assert.equal(enemy.pull, null);
    assert.ok(events.some(event => event.item === 'guns.pistol.name'));
  });
}

test('o canhão de pulso causa dano e empurra o alvo para longe', () => {
  const { state, step } = duel([loadout({ weapons: ['pulse'], speed: 0 }), loadout({ speed: 0 })]);
  const [attacker, target] = state.robots;
  Object.assign(attacker, { x: 100, y: 50 });
  Object.assign(target, { x: 150, y: 50 });
  step();
  assert.equal(target.hp, 95);
  assert.equal(target.x, 208);
});

test('o eco atinge apenas se o alvo permanecer na área até o pulso', () => {
  for (const escapes of [false, true]) {
    const { state, step } = duel([loadout({ weapons: ['echo'], speed: 0 }), loadout({ speed: 0 })]);
    const [attacker, target] = state.robots;
    Object.assign(attacker, { x: 100, y: 50 });
    Object.assign(target, { x: 150, y: 50 });
    step();
    assert.equal(target.hp, 100);
    assert.ok(state.effects.some(effect => effect.kind === 'echo'));
    if (escapes) target.x += 50;
    for (let frame = 0; frame < 40; frame++) step();
    assert.equal(target.hp, escapes ? 100 : 84);
  }
});
