import assert from 'node:assert/strict';
import test from 'node:test';
import { createBattle, HEIGHT, RADIUS, STEP, WIDTH } from '../../src/battle.js';
import { blocked, distance } from '../../src/simulation/geometry.js';

function loadout({ hp = 100, speed = 10, attack = 10, defense = 10,
  weapons = [], tools = [], strategy = 'advance' } = {}) {
  return {
    stats: { hp, defense, attack, speed },
    guns: weapons,
    utils: tools,
    strategy,
  };
}

function duel(loadouts, options = {}) {
  const events = [];
  let seed = 7;
  const random = options.random ?? (() => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32));
  const battle = createBattle(loadouts, {
    random,
    onEvent: event => events.push(event),
    ...options,
  });
  return { ...battle, events };
}

// --- Rei da arena (king) ---

test('Rei da arena: zona muda de posição a cada 20 s, pontua sozinho e suspende na disputa', () => {
  const { state, step, events } = duel([loadout({ speed: 0 }), loadout({ speed: 0 })], { mode: 'king', duration: 60 });
  const [a, b] = state.robots;
  const { zone } = state.modeState;
  const initial = { x: zone.x, y: zone.y };

  // Somente A dentro por 0,6 s (acumula parcial sem fechar 1 ponto ainda)
  Object.assign(a, { x: zone.x, y: zone.y });
  Object.assign(b, { x: zone.x > WIDTH / 2 ? 80 : WIDTH - 80, y: HEIGHT / 2 });
  step(0.6);
  assert.equal(state.modeState.scores[0], 0);
  assert.equal(zone.owner, 0);
  assert.equal(zone.contested, false);

  // Ambos dentro por 2 s: pontuação suspensa
  Object.assign(b, { x: zone.x + 2 * RADIUS, y: zone.y });
  step(2);
  assert.equal(state.modeState.scores[0], 0);
  assert.equal(state.modeState.scores[1], 0);
  assert.equal(zone.contested, true);

  // B sai: A retoma de 0,6 s e completa 1 ponto após +0,4 s
  Object.assign(b, { x: zone.x > WIDTH / 2 ? 80 : WIDTH - 80, y: HEIGHT / 2 });
  step(0.4);
  assert.equal(state.modeState.scores[0], 1);
  assert.equal(zone.contested, false);

  // A fica fora até os 20 s e a zona muda de posição
  Object.assign(a, { x: b.x, y: b.y });
  step(17);
  assert.equal(state.time, 20);
  assert.ok(distance(zone, initial) > 50);
  assert.equal(zone.nextMove, 40);
  assert.equal(events.filter(event => event.action === 'event.zoneMove').length, 1);
});

test('Rei da arena: vence quem chegar a 30 pontos primeiro', () => {
  const { state, step } = duel([loadout({ speed: 0 }), loadout({ speed: 0 })], { mode: 'king', duration: 120 });
  const [a, b] = state.robots;
  const { zone } = state.modeState;
  Object.assign(b, { x: 80, y: 80 });
  for (let second = 0; second < 30; second++) {
    Object.assign(a, { x: zone.x, y: zone.y });
    if (distance(b, zone) <= zone.radius + 10) Object.assign(b, { x: WIDTH - 80, y: HEIGHT - 80 });
    step(1);
  }
  assert.equal(state.modeState.scores[0], 30);
  assert.deepEqual(state.result, { winner: 0, reason: 'objective' });
});

test('Rei da arena: tempo esgotado ou nocaute decide pelos pontos e empata em placar igual', () => {
  for (const reason of ['timeout', 'knockout']) {
    for (const [scoreA, scoreB, winner] of [[12, 8, 0], [5, 5, null], [3, 9, 1]]) {
      const { state, step } = duel([loadout({ speed: 0 }), loadout({ speed: 0 })], {
        mode: 'king', duration: reason === 'timeout' ? STEP : 30,
      });
      state.modeState.scores = [scoreA, scoreB];
      state.robots[0].hp = reason === 'knockout' ? 0 : 100;
      step();
      assert.deepEqual(state.result, { winner, reason });
    }
  }
});

// --- Capture a bandeira (ctf) ---

test('Capture a bandeira: entrega só vale com bandeira própria em casa e vence com 2 capturas', () => {
  const { state, step, events } = duel([loadout({ speed: 0 }), loadout({ speed: 0 })], { mode: 'ctf', duration: 120 });
  const [a, b] = state.robots;
  const { bases, flags } = state.modeState;

  // A pega a bandeira de B e B pega a bandeira de A
  Object.assign(a, { x: bases[1].x, y: bases[1].y });
  Object.assign(b, { x: bases[0].x, y: bases[0].y });
  step();
  assert.equal(flags[1].carrier, 0);
  assert.equal(flags[0].carrier, 1);

  // A volta para sua base com a bandeira rival, mas sua própria bandeira está fora -> não pontua
  Object.assign(a, { x: bases[0].x, y: bases[0].y });
  Object.assign(b, { x: WIDTH / 2, y: HEIGHT / 2 });
  step();
  assert.equal(state.modeState.captures[0], 0);
  assert.equal(flags[1].carrier, 0);

  // B é destruído: bandeira de A volta à base e A pontua imediatamente
  b.hp = 0;
  step();
  assert.equal(flags[0].atHome, true);
  assert.equal(flags[0].carrier, null);
  assert.equal(state.modeState.captures[0], 1);
  assert.equal(state.result, null);
  assert.ok(b.respawnAt > state.time);
  assert.ok(events.some(event => event.action === 'event.flagReturn'));
  assert.ok(events.some(event => event.action === 'event.flagCapture' && event.robot === 0));

  // B reaparece na base após 3 segundos com vida cheia
  step(2.9);
  assert.ok(b.respawnAt > 0);
  assert.equal(b.hp, 0);
  step(0.2);
  assert.equal(b.respawnAt, 0);
  assert.equal(b.hp, b.stats.hp);
  assert.equal(b.x, bases[1].x);
  assert.equal(b.y, bases[1].y);

  // Segunda captura de A encerra a partida
  Object.assign(b, { x: WIDTH / 2, y: HEIGHT / 2 });
  Object.assign(a, { x: bases[1].x, y: bases[1].y });
  step();
  Object.assign(a, { x: bases[0].x, y: bases[0].y });
  step();
  assert.equal(state.modeState.captures[0], 2);
  assert.deepEqual(state.result, { winner: 0, reason: 'objective' });
});

test('Capture a bandeira: tempo esgotado decide por capturas e empata em igualdade', () => {
  for (const [captures, winner] of [[[1, 0], 0], [[1, 1], null], [[0, 1], 1]]) {
    const { state, step } = duel([loadout({ speed: 0 }), loadout({ speed: 0 })], { mode: 'ctf', duration: STEP });
    state.modeState.captures = captures;
    step();
    assert.deepEqual(state.result, { winner, reason: 'timeout' });
  }
});

// --- Carga instável (charge) ---

test('Carga instável: núcleo no centro, contagem de 10 s, transferência sem reiniciar e bloqueio de 1 s', () => {
  const { state, step, events } = duel([loadout({ speed: 0 }), loadout({ speed: 0 })], { mode: 'charge', duration: 120 });
  const [a, b] = state.robots;
  const { core } = state.modeState;

  assert.equal(core.x, WIDTH / 2);
  assert.equal(core.y, HEIGHT / 2);
  assert.equal(blocked(core, core, state.walls), false);

  // A toca no núcleo no centro e vira portador com 10 s
  Object.assign(a, { x: WIDTH / 2, y: HEIGHT / 2 });
  Object.assign(b, { x: 200, y: HEIGHT / 2 });
  step(0.5);
  assert.equal(core.carrier, 0);
  assert.equal(core.timer, 10);

  // Passam 3 s com A carregando -> restam 7 s
  step(3);
  assert.ok(Math.abs(core.timer - 7) < 1e-8);

  // Encosta no rival B -> transfere sem reiniciar contagem e bloqueia por 1 s
  Object.assign(b, { x: a.x + 2 * RADIUS, y: a.y });
  step(0.5);
  assert.equal(core.carrier, 1);
  assert.ok(Math.abs(core.timer - 6.5) < 1e-8);
  assert.ok(events.some(event => event.action === 'event.coreTransfer' && event.robot === 0));

  // Durante o 1 s de bloqueio, contato não devolve o núcleo
  step(0.5);
  assert.equal(core.carrier, 1);
  assert.ok(Math.abs(core.timer - 6) < 1e-8);

  // Após 1 s de bloqueio, contato transfere de volta para A sem reiniciar a contagem
  step(0.5);
  assert.equal(core.carrier, 0);
  assert.ok(Math.abs(core.timer - 5.5) < 1e-8);

  // Afastam-se e contagem zera -> B ganha 1 ponto e a rodada reinicia
  Object.assign(b, { x: 100, y: 100 });
  step(5.5);
  assert.deepEqual(state.modeState.points, [0, 1]);
  assert.equal(state.modeState.round, 2);
  assert.equal(core.carrier, null);
  assert.equal(core.x, WIDTH / 2);
  assert.equal(core.y, HEIGHT / 2);
  assert.equal(core.timer, 10);
  assert.equal(a.x, 71);
  assert.equal(b.x, WIDTH - 71);
  assert.equal(state.result, null);
});

test('Carga instável: nocaute dá 1 ponto, repõe rodada e 3 pontos encerram a partida', () => {
  const { state, step } = duel([
    loadout({ weapons: ['hammer'], attack: 50, speed: 0 }),
    loadout({ hp: 10, defense: 1, speed: 0 }),
  ], { mode: 'charge', duration: 120 });
  const [a, b] = state.robots;

  for (let round = 1; round <= 3; round++) {
    Object.assign(a, { x: 200, y: 100 });
    Object.assign(b, { x: 200 + 2 * RADIUS, y: 100 });
    step();
    assert.deepEqual(state.modeState.points, [round, 0]);
    if (round < 3) {
      assert.equal(state.result, null);
      assert.equal(b.hp, b.stats.hp);
      assert.equal(a.x, 71);
      assert.equal(b.x, WIDTH - 71);
    }
  }
  assert.deepEqual(state.result, { winner: 0, reason: 'objective' });
});

test('Carga instável: tempo esgotado decide pelos pontos e empata em placar igual', () => {
  for (const [points, winner] of [[[2, 1], 0], [[1, 1], null], [[0, 2], 1]]) {
    const { state, step } = duel([loadout({ speed: 0 }), loadout({ speed: 0 })], { mode: 'charge', duration: STEP });
    state.modeState.points = points;
    step();
    assert.deepEqual(state.result, { winner, reason: 'timeout' });
  }
});

// --- Corrida de portais (race) ---

test('Corrida de portais: exige ordem correta, reaparece no último portal em 3 s e vence com 3 voltas', () => {
  const { state, step, events } = duel([
    loadout({ speed: 0 }),
    loadout({ speed: 0, weapons: ['hammer'], attack: 100 }),
  ], { mode: 'race', duration: 120 });
  const [a, b] = state.robots;
  const { portals, progress } = state.modeState;
  assert.equal(portals.length, 3);

  // Passar pelo portal 2 fora de ordem não valida
  Object.assign(a, { x: portals[1].x, y: portals[1].y });
  step();
  assert.deepEqual(progress[0], { laps: 0, nextPortal: 0, lastPortal: null });

  // Passa pelo portal 1 -> valida e vira ponto de reaparecimento
  Object.assign(a, { x: portals[0].x, y: portals[0].y });
  step();
  assert.deepEqual(progress[0], { laps: 0, nextPortal: 1, lastPortal: 0 });

  // A é destruído longe do portal -> reaparece após 3 s no portal 1 (último validado)
  Object.assign(a, { x: 120, y: 120, hp: 10 });
  Object.assign(b, { x: 120 + 2 * RADIUS, y: 120 });
  step();
  assert.ok(a.respawnAt > state.time);
  assert.equal(state.result, null);
  step(2.9);
  assert.ok(a.respawnAt > 0);
  step(0.2);
  assert.equal(a.respawnAt, 0);
  assert.equal(a.hp, a.stats.hp);
  assert.equal(a.x, portals[0].x);
  assert.equal(a.y, portals[0].y);
  assert.deepEqual(progress[0], { laps: 0, nextPortal: 1, lastPortal: 0 });

  // Completa a 1ª volta (portais 2 e 3) e mais 2 voltas -> vence com 3 voltas
  Object.assign(b, { x: 80, y: 80 });
  for (const portalIndex of [1, 2, 0, 1, 2, 0, 1, 2]) {
    Object.assign(a, { x: portals[portalIndex].x, y: portals[portalIndex].y });
    step();
  }
  assert.equal(progress[0].laps, 3);
  assert.equal(events.filter(event => event.action === 'event.lapComplete' && event.robot === 0).length, 3);
  assert.deepEqual(state.result, { winner: 0, reason: 'objective' });
});

test('Corrida de portais: tempo esgotado compara voltas, depois portais da volta atual, e empata se igual', () => {
  const cases = [
    [[{ laps: 2, nextPortal: 0, lastPortal: 2 }, { laps: 1, nextPortal: 2, lastPortal: 1 }], 0],
    [[{ laps: 1, nextPortal: 2, lastPortal: 1 }, { laps: 1, nextPortal: 1, lastPortal: 0 }], 0],
    [[{ laps: 1, nextPortal: 1, lastPortal: 0 }, { laps: 1, nextPortal: 2, lastPortal: 1 }], 1],
    [[{ laps: 1, nextPortal: 2, lastPortal: 1 }, { laps: 1, nextPortal: 2, lastPortal: 1 }], null],
  ];
  for (const [progress, winner] of cases) {
    const { state, step } = duel([loadout({ speed: 0 }), loadout({ speed: 0 })], { mode: 'race', duration: STEP });
    state.modeState.progress = progress;
    step();
    assert.deepEqual(state.result, { winner, reason: 'timeout' });
  }
});

test('os robôs autônomos perseguem ativamente o objetivo em cada um dos 4 modos', () => {
  const runner = loadout({ speed: 120, weapons: ['pistol'], tools: ['nitro'] });
  for (const mode of ['king', 'ctf', 'charge', 'race']) {
    const { state, step } = duel([runner, runner], { mode, duration: 40 });
    for (let frame = 0; frame < 40 / STEP && !state.result; frame++) step();
    if (mode === 'king') {
      assert.ok(state.modeState.scores[0] + state.modeState.scores[1] > 0 || state.result, 'king scored');
    } else if (mode === 'ctf') {
      const movedFlag = state.modeState.captures[0] + state.modeState.captures[1] > 0 ||
        state.modeState.flags.some(flag => !flag.atHome);
      assert.ok(movedFlag || state.result, 'ctf engaged flags');
    } else if (mode === 'charge') {
      const engaged = state.modeState.points[0] + state.modeState.points[1] > 0 ||
        state.modeState.core.carrier !== null;
      assert.ok(engaged || state.result, 'charge engaged core');
    } else if (mode === 'race') {
      const totalPortals = state.modeState.progress.reduce((sum, p) => sum + p.laps * 3 + p.nextPortal, 0);
      assert.ok(totalPortals > 0 || state.result, 'race crossed portals');
    }
  }
});
