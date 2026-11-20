import assert from 'node:assert/strict';
import test from 'node:test';
import { createBattle, EDGE, generateArena, HEIGHT, STEP, WIDTH } from '../../src/battle.js';
import { guns } from '../../src/catalog.js';

function loadout({ hp = 100, weapons = [], tools = [] } = {}) {
  return {
    stats: { hp, defense: 0, attack: 0, speed: 10, evasion: 0, aim: 0 },
    guns: weapons,
    utils: tools,
    strategy: 'advance',
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
