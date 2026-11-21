import assert from 'node:assert/strict';
import test from 'node:test';
import { ATTRIBUTES_BASE } from '../../config.js';
import { createBattle, EDGE, generateArena, HEIGHT, RADIUS, STEP, WIDTH } from '../../src/battle.js';
import { guns } from '../../src/catalog.js';

function loadout({ hp = 100, speed = 10, attack = 0, defense = 0,
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

test('a diferença de Potência determina a direção e a velocidade na disputa corpo a corpo', () => {
  const start = 200;
  const displacements = [];
  for (const difference of [0, 100, 200, -100]) {
    const configs = [loadout({ speed: 100, weapons: ['saw'] }), loadout({ speed: 100, weapons: ['saw'] })];
    configs[difference < 0 ? 1 : 0].stats.power = ATTRIBUTES_BASE + Math.abs(difference);
    const { state, step } = duel(configs);
    const [a, b] = state.robots;
    assert.equal(b.baseStats.power, difference < 0 ? ATTRIBUTES_BASE + 100 : ATTRIBUTES_BASE);
    Object.assign(a, { x: start, y: 50 });
    Object.assign(b, { x: start + 2 * RADIUS, y: 50 });
    for (let frame = 0; frame < 4; frame++) step();
    assert.ok(Math.abs(b.x - a.x - 2 * RADIUS) < 1e-8);
    displacements.push(a.x - start);
  }
  const [tie, smaller, larger, reverse] = displacements;
  assert.equal(tie, 0);
  assert.ok(smaller > 0 && larger > smaller);
  assert.ok(Math.abs(smaller + reverse) < 1e-8);
});

test('a Potência exige que ambos avancem e mantém a direção do avanço em diagonal', () => {
  const component = 2 * RADIUS / Math.sqrt(2);
  for (const opposingSpeed of [0, 100]) {
    const strong = loadout({ speed: 100, weapons: ['saw'] });
    strong.stats.power = ATTRIBUTES_BASE + 100;
    const { state, step } = duel([strong, loadout({ speed: opposingSpeed, weapons: ['saw'] })]);
    const [a, b] = state.robots;
    Object.assign(a, { x: 200, y: 50 });
    Object.assign(b, { x: a.x + component, y: a.y + component });
    step();
    const dx = a.x - 200;
    const dy = a.y - 50;
    assert.ok(Math.abs(dx - dy) < 1e-8);
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 2 * RADIUS) < 1e-8);
    if (opposingSpeed) assert.ok(dx > 0);
    else assert.ok(Math.abs(dx) < 1e-8);
  }
});

test('o empurrão mantém os robôs em contato sem atravessar paredes ou a borda', () => {
  for (const boundary of ['wall', 'edge']) {
    const strong = loadout({ speed: 100, weapons: ['saw'] });
    strong.stats.power = ATTRIBUTES_BASE + 5000;
    const { state, step } = duel([strong, loadout({ speed: 100, weapons: ['saw'] })]);
    const [a, b] = state.robots;
    const wall = state.walls[0];
    const limit = boundary === 'wall' ? wall.x - RADIUS : WIDTH - EDGE - RADIUS;
    const y = boundary === 'wall' ? wall.y + wall.h / 2 : HEIGHT / 2;
    Object.assign(b, { x: limit - 1, y, goal: a, thinkAt: Infinity });
    Object.assign(a, { x: b.x - 2 * RADIUS, y, goal: b, thinkAt: Infinity });
    for (let frame = 0; frame < 4; frame++) step();
    assert.ok(b.x <= limit && limit - b.x < 1e-7);
    assert.ok(Math.abs(b.x - a.x - 2 * RADIUS) < 1e-8);
  }
});

test('o dano escala com a razão entre ataque e defesa', () => {
  for (const [attack, defense, multiplier] of [[10, 10, 1], [100, 10, 10], [100, 100, 1], [10, 100, 0.1]]) {
    const { state, step, events } = duel([
      loadout({ attack, weapons: ['hammer'] }), loadout({ hp: 1000, defense, speed: 0 }),
    ]);
    state.robots[1].x = state.robots[0].x + 2 * RADIUS;
    step();
    const damage = guns.hammer.damage * multiplier;
    assert.equal(events.find(event => event.action === 'event.hit')?.damage, damage);
    assert.equal(state.robots[1].hp, 1000 - damage);
  }
});

test('a arena sorteia paredes, lama e placas de espinhos dentro dos limites do campo', () => {
  for (const [roll, count] of [[0.1, 3], [0.9, 4]]) {
    const { walls, mud, spikePatches, spikeRim } = generateArena(() => roll);
    assert.equal(walls.length, count);
    assert.equal(mud.length, 4);
    assert.ok(spikePatches.length > 0);
    for (const { x, y, w, h } of [...walls, ...spikePatches, ...spikeRim]) {
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

test('o contato com a placa e com os quatro lados da borda causa dano até o robô sair', () => {
  const { state, step, events } = duel([loadout({ speed: 0 }), loadout({ speed: 0 })]);
  const robot = state.robots[0];
  const { x, y, h } = state.spikePatches[0];
  const edge = EDGE + RADIUS;
  for (const point of [
    { x: x - RADIUS, y: y + h / 2 },
    { x: edge, y: HEIGHT / 2 }, { x: WIDTH - edge, y: HEIGHT / 2 },
    { x: WIDTH / 2, y: edge }, { x: WIDTH / 2, y: HEIGHT - edge },
  ]) {
    const hp = robot.hp;
    Object.assign(robot, point);
    step(0.5);
    assert.equal(robot.hp, hp - 2);
    Object.assign(robot, { x: 90, y: HEIGHT / 2 });
    step(0.5);
    assert.equal(robot.hp, hp - 2);
  }
  assert.equal(events.filter(event => event.action === 'event.spikes' && event.damage === 2).length, 5);
});

test('o robô sai da borda com velocidade reduzida e retoma a velocidade ao sair', () => {
  const { state, step } = duel([loadout({ speed: 100 }), loadout({ speed: 0 })]);
  const robot = state.robots[0];
  const edge = EDGE + RADIUS;
  Object.assign(robot, { x: edge, goal: { x: 100, y: robot.y }, thinkAt: Infinity });
  step(0.1);
  assert.equal(robot.x, edge + 7.5);
  step(0.1);
  const escaped = robot.x;
  step(0.1);
  assert.equal(robot.x, escaped + 15);
  assert.ok(Math.abs(robot.hp - 99.2) < 1e-8);
});

test('os espinhos podem nocautear um robô que permanece na borda', () => {
  const { state, step, events } = duel([loadout({ hp: 0.5, speed: 0 }), loadout()]);
  state.robots[0].x = EDGE + RADIUS;
  step(0.25);
  assert.equal(state.robots[0].hp, 0);
  assert.deepEqual(state.result, { winner: 1, reason: 'knockout' });
  assert.equal(events.find(event => event.action === 'event.spikes')?.damage, 0.5);
});

test('a navegação contorna a placa e evita um destino junto à borda', () => {
  const { state, step } = duel([loadout({ speed: 5000 }), loadout({ speed: 0 })]);
  const [robot, enemy] = state.robots;
  const { x, y, w, h } = state.spikePatches[0];
  const goal = { x: x + w + 65, y: y + h / 2 };
  Object.assign(robot, { x: x - 50, y: goal.y, goal, thinkAt: Infinity });
  Object.assign(enemy, { goal: enemy, thinkAt: Infinity });
  step();
  assert.ok(robot.y !== goal.y);
  for (let frame = 0; frame < 10; frame++) step();
  assert.equal(robot.x, goal.x);
  assert.equal(robot.y, goal.y);

  robot.goal = { x: goal.x, y: HEIGHT - EDGE - RADIUS };
  robot.nextPath = 0;
  for (let frame = 0; frame < 10; frame++) step();
  assert.ok(robot.y > goal.y);
  assert.ok(robot.y < robot.goal.y);
  assert.equal(robot.hp, 100);
});

test('ao esgotar o tempo, o resultado compara os percentuais de vida restante', () => {
  for (const [hp, winner] of [[100, 0], [120, null], [140, 1]]) {
    const duration = STEP * 2.5;
    const { state, step, events } = duel([loadout(), loadout({ hp: 200 })], { duration });
    state.robots[0].hp = 60;
    state.robots[1].hp = hp;
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

test('o encerramento manual usa o máximo de vida com o bônus ativo', () => {
  const { state, step, finish } = duel([loadout(), loadout({ hp: 200 })]);
  const [a, b] = state.robots;
  a.hp = 60;
  b.hp = 116;
  state.drops.push({ x: b.x, y: b.y, type: 'attribute' });
  step();
  assert.ok(b.stats.hp > b.baseStats.hp);
  finish();
  assert.deepEqual(state.result, { winner: 0, reason: 'manualEnd' });
});

test('um ataque letal limita o dano à vida restante e termina em nocaute', () => {
  const { state, step, events } = duel([
    loadout({ weapons: ['hammer'] }),
    loadout({ hp: 10, speed: 0 }),
  ]);
  state.robots[1].x = state.robots[0].x + 2 * RADIUS;
  step();
  assert.equal(state.robots[1].hp, 0);
  assert.equal(state.robots[0].report.weapons.hammer.damage, 10);
  assert.equal(state.robots[1].report.damageTaken, 10);
  assert.deepEqual(state.result, { winner: 0, reason: 'knockout' });
  assert.deepEqual(events.slice(-2).map(({ robot, action, damage }) => [robot, action, damage]), [
    [0, 'event.hit', 10],
    [null, 'event.knockout', null],
  ]);
});

test('o escudo reduz o dano e a arma respeita o intervalo entre ataques', () => {
  const { state, step, events } = duel([
    loadout({ weapons: ['hammer'] }),
    loadout({ tools: ['shield'], speed: 0, defense: 2 }),
  ], { random: () => 0.2 });
  state.robots[1].x = state.robots[0].x + 2 * RADIUS;
  step();
  const { report, hp } = state.robots[1];
  const afterDefense = guns.hammer.damage / 2;
  assert.equal(hp, 100 - afterDefense * 0.55);
  assert.equal(report.defenseMitigated, guns.hammer.damage - afterDefense);
  assert.equal(report.shieldMitigated, afterDefense - afterDefense * 0.55);
  assert.equal(report.tools.shield, 1);
  assert.ok(events.some(event => event.action === 'event.activate' && event.item === 'utils.shield.name'));
  step();
  assert.equal(events.filter(event => event.action === 'event.hit').length, 1);
});

test('o drop de vida recupera 15% do HP máximo e respeita esse limite', () => {
  const { state, step, events } = duel([loadout(), loadout()]);
  const robot = state.robots[0];
  robot.hp = 60;
  state.drops.push({ x: robot.x, y: robot.y, type: 'health' });
  step();
  assert.equal(robot.hp, 75);

  robot.hp = 95;
  state.drops.push({ x: robot.x, y: robot.y, type: 'health' });
  step();
  assert.equal(robot.hp, 100);
  assert.equal(robot.report.healing, 20);
  assert.equal(robot.report.drops.health, 2);
  assert.equal(state.drops.length, 0);
  assert.ok(events.some(event => event.robot === 0 && event.action === 'event.collect' &&
    event.item === 'drop.health'));
});

for (const strategy of ['distance', 'flank']) {
  test(`${strategy} recua até perto do alcance da pistola e continua atirando`, () => {
    const { state, step, events } = duel([
      loadout({ weapons: ['pistol', 'saw'], strategy, speed: 100 }), loadout(),
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
    assert.equal(robot.pull, null);
    assert.ok(state.projectiles.some(shot => shot.key === 'hook'));
    for (let frame = 0; frame < 20 && !robot.pull; frame++) step();
    assert.ok(events.some(event => event.action === 'event.hookWall'));
    assert.equal(robot.report.weapons.hook.anchors, 1);
    assert.equal(robot.report.weapons.hook.misses, 0);
    assert.ok(robot.pull);
    for (let frame = 0; frame < 20; frame++) step();
    assert.ok(Math.hypot(robot.x - enemy.x, robot.y - enemy.y) > 165);
    assert.equal(enemy.pull, null);
  });

  test(`${strategy} poupa o gancho quando não há parede para recuar`, () => {
    const { state, step } = duel([
      loadout({ weapons: ['pistol', 'hook'], strategy }), loadout(),
    ]);
    const [robot, enemy] = state.robots;
    enemy.x = robot.x + 100;
    step();
    assert.equal(robot.guns[1].ready, 0);
    assert.equal(enemy.pull, null);
    assert.ok(state.projectiles.some(shot => shot.key === 'pistol'));
    assert.ok(!state.projectiles.some(shot => shot.key === 'hook'));
  });
}

test('o canhão de pulso causa dano e empurra o alvo para longe', () => {
  const { state, step } = duel([loadout({ weapons: ['pulse'], speed: 0 }), loadout({ speed: 0 })]);
  const [attacker, target] = state.robots;
  Object.assign(attacker, { x: 100, y: 50 });
  Object.assign(target, { x: 150, y: 50 });
  step();
  assert.equal(target.hp, 100);
  assert.equal(target.x, 150);
  for (let frame = 0; frame < 3; frame++) step();
  assert.equal(target.hp, 95);
  assert.equal(target.x, 208);
});

test('a pistola viaja mais rápido que o disco e ambos causam dano só no impacto', () => {
  const { state, step } = duel([
    loadout({ weapons: ['pistol', 'disc'], speed: 0 }), loadout({ speed: 0 }),
  ], { random: () => 0.95 });
  const [attacker, target] = state.robots;
  Object.assign(attacker, { x: 100, y: 50 });
  Object.assign(target, { x: 280, y: 50 });
  step();
  assert.equal(target.hp, 100);
  const [bullet, disc] = state.projectiles;
  step();
  assert.ok(Math.abs(bullet.x - (100 + guns.pistol.projectileSpeed * STEP)) < 1e-8);
  assert.ok(Math.abs(disc.x - (100 + guns.disc.projectileSpeed * STEP)) < 1e-8);
  assert.ok(bullet.x > disc.x);
  for (let frame = 0; frame < 8; frame++) step();
  assert.equal(target.hp, 100 - guns.pistol.damage);
  for (let frame = 0; frame < 25; frame++) step();
  assert.equal(target.hp, 100 - guns.pistol.damage - guns.disc.damage);
});

test('velocidade do projétil aumenta proporcionalmente à velocidade base de cada arma', () => {
  const weapons = Object.keys(guns).filter(key => guns[key].projectileSpeed);
  const loadoutWithBonus = loadout({ weapons, speed: 0 });
  loadoutWithBonus.stats.projectileSpeed = ATTRIBUTES_BASE + 250;
  const { state, step } = duel([loadoutWithBonus, loadout({ speed: 0 })]);
  const [attacker, target] = state.robots;
  Object.assign(attacker, { x: 100, y: 50 });
  Object.assign(target, { x: 190, y: 50 });

  step();
  assert.equal(state.projectiles.length, weapons.length);
  step();
  for (const shot of state.projectiles) {
    const expected = 100 + guns[shot.key].projectileSpeed * 1.25 * STEP;
    assert.ok(Math.abs(shot.x - expected) < 1e-8, shot.key);
  }
});

test('um disparo já lançado passa pelo ponto onde o alvo estava', () => {
  const { state, step, events } = duel([
    loadout({ weapons: ['disc'], speed: 0 }), loadout({ speed: 0 }),
  ]);
  const [attacker, target] = state.robots;
  Object.assign(attacker, { x: 100, y: 50 });
  Object.assign(target, { x: 280, y: 50 });
  step();
  target.y = 100;
  for (let frame = 0; frame < 85; frame++) step();
  assert.equal(state.projectiles.length, 0);
  assert.equal(target.hp, 100);
  assert.ok(events.some(event => event.action === 'event.miss' && event.item === 'guns.disc.name'));
});

test('o robô prioriza a esquiva e retoma o caminho para o item após o projétil passar', () => {
  const { state, step } = duel([
    loadout({ weapons: ['disc'], speed: 0 }), loadout({ speed: 100 }),
  ]);
  const [attacker, target] = state.robots;
  Object.assign(attacker, { x: 140, y: 50 });
  Object.assign(target, { x: 280, y: 50, goal: target, thinkAt: Infinity });
  step();
  const drop = { x: 410, y: 50, type: 'health' };
  state.drops.push(drop);
  Object.assign(target, { intent: 'drop', goal: drop });

  step();
  assert.equal(target.x, 280);
  assert.ok(target.y > 50);
  assert.equal(target.goal, drop);

  for (let frame = 0; frame < 50; frame++) step();
  assert.equal(target.hp, 100);
  assert.ok(target.x > 280);
});

test('um projétil fora da rota do robô não interrompe seu movimento', () => {
  const { state, step } = duel([
    loadout({ weapons: ['disc'], speed: 0 }), loadout({ speed: 100 }),
  ]);
  const [attacker, target] = state.robots;
  Object.assign(attacker, { x: 100, y: 50 });
  Object.assign(target, { x: 280, y: 50, goal: target, thinkAt: Infinity });
  step();
  Object.assign(target, { y: 90, goal: { x: 400, y: 90 } });

  step();
  assert.equal(target.y, 90);
  assert.ok(target.x > 280);
});

test('um robô rápido evita reentrar ou cruzar a trajetória até o projétil desaparecer', () => {
  const shotY = 77;
  for (const goalY of [shotY, 49]) {
    const { state, step } = duel([
      loadout({ weapons: ['disc'], speed: 0 }), loadout({ speed: 3500 }),
    ]);
    const [attacker, target] = state.robots;
    const endX = 100 + guns.disc.range;
    Object.assign(attacker, { x: 100, y: shotY });
    Object.assign(target, { x: endX, y: shotY, goal: target, thinkAt: Infinity });
    step();
    const [shot] = state.projectiles;

    for (let frame = 0; frame < 60 && target.y === shotY; frame++) step();
    assert.ok(target.y > shotY + RADIUS);
    assert.ok(state.projectiles.includes(shot));
    target.goal = { x: endX, y: goalY };

    while (state.projectiles.includes(shot)) {
      step();
      assert.ok(target.y > shotY + RADIUS);
      assert.equal(target.hp, 100);
    }
    step();
    assert.equal(target.y, goalY);
  }
});

test('o disco percorre os dois trechos do ricochete para acertar atrás da parede', () => {
  const { state, step } = duel([
    loadout({ weapons: ['pistol', 'disc'], speed: 0 }), loadout({ speed: 0 }),
  ]);
  state.walls.splice(0, state.walls.length,
    { x: 175, y: 85, w: 10, h: 40 }, { x: 130, y: 150, w: 105, h: 20 });
  const [attacker, target] = state.robots;
  Object.assign(attacker, { x: 100, y: 100 });
  Object.assign(target, { x: 260, y: 100 });
  step();
  assert.deepEqual(state.projectiles.map(shot => shot.key), ['disc']);
  const [disc] = state.projectiles;
  for (let frame = 0; frame < 18; frame++) step();
  assert.ok(disc.x > 180 && disc.y < 150);
  assert.equal(target.hp, 100);
  for (let frame = 0; frame < 18; frame++) step();
  assert.equal(target.hp, 100 - guns.disc.damage);
});

test('o disco rebate na primeira parede mesmo se o alvo sair da trajetória', () => {
  const { state, step, events } = duel([
    loadout({ weapons: ['disc'], speed: 0 }), loadout({ speed: 0 }),
  ]);
  state.walls.splice(0, state.walls.length,
    { x: 300, y: 80, w: 10, h: 40 }, { x: 70, y: 80, w: 10, h: 40 });
  const [attacker, target] = state.robots;
  Object.assign(attacker, { x: 100, y: 100 });
  Object.assign(target, { x: 200, y: 100 });
  step();
  target.y = 150;

  for (let frame = 0; frame < 37; frame++) step();
  assert.equal(state.projectiles.length, 1);
  assert.equal(state.projectiles[0].x, 296.5);
  assert.ok(!events.some(event => event.action === 'event.miss'));

  for (let frame = 0; frame < 40; frame++) step();
  assert.equal(state.projectiles.length, 0);
  assert.equal(events.filter(event => event.action === 'event.miss').length, 1);
});

test('o disco pode rebater na parede que protege o alvo sem uma rota de ricochete até ele', () => {
  const { state, step } = duel([
    loadout({ weapons: ['disc'], speed: 0 }), loadout({ speed: 0 }),
  ]);
  state.walls.splice(0, state.walls.length, { x: 200, y: 70, w: 10, h: 60 });
  const [attacker, target] = state.robots;
  Object.assign(attacker, { x: 100, y: 100 });
  Object.assign(target, { x: 260, y: 100 });
  step();
  for (let frame = 0; frame < 19; frame++) step();
  assert.equal(state.projectiles.length, 1);
  assert.equal(state.projectiles[0].x, 195.5);
  assert.equal(target.hp, 100);
});

test('a serra e o martelo causam dano imediato a curta distância', () => {
  for (const [weapon, strategy] of [['saw', 'distance'], ['hammer', 'advance']]) {
    const { state, step } = duel([
      loadout({ weapons: [weapon], strategy, speed: 0 }), loadout({ speed: 0 }),
    ], { random: () => 0.95 });
    const [attacker, target] = state.robots;
    Object.assign(attacker, { x: 450, y: 50 });
    Object.assign(target, { x: 450 + guns[weapon].range + 1, y: 50, goal: target, thinkAt: Infinity });
    step();
    assert.equal(target.hp, 100);
    assert.equal(attacker.guns[0].ready, 0);
    target.x -= 1;
    step();
    assert.ok(target.x - attacker.x > 2 * RADIUS);
    assert.equal(target.hp, 100 - guns[weapon].damage);
    assert.equal(state.projectiles.length, 0);
  }
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
    const { shots, hits, misses } = attacker.report.weapons.echo;
    assert.deepEqual({ shots, hits, misses }, { shots: 1, hits: escapes ? 0 : 1, misses: escapes ? 1 : 0 });
  }
});

function statusDuel(weapon) {
  const battle = duel([loadout({ weapons: [weapon], speed: 0 }), loadout({ speed: 0 })]);
  const [attacker, target] = battle.state.robots;
  Object.assign(attacker, { x: 100, y: 70 });
  Object.assign(target, { x: 100 + 2 * RADIUS, y: 70 });
  for (let frame = 0; frame < 30 && target.hp === 100; frame++) battle.step();
  assert.equal(target.hp, 100 - guns[weapon].damage);
  attacker.guns[0].ready = Infinity;
  return { ...battle, attacker, target };
}

test('cada acerto do lança-chamas causa doze pulsos independentes durante três segundos', () => {
  const { step, attacker, target } = statusDuel('flame');
  step(0.5);
  attacker.guns[0].ready = 0;
  step();
  step(0.1);
  attacker.guns[0].ready = Infinity;
  assert.equal(target.burns.length, 2);
  step(2.5);
  assert.equal(target.burns.length, 1);
  step(0.5);
  assert.equal(target.burns.length, 0);
  assert.equal(attacker.report.weapons.flame.hits, 2);
  assert.ok(Math.abs(attacker.report.weapons.flame.burnDamage - 24 * 1.15) < 1e-8);
  assert.ok(Math.abs(target.hp - (100 - 2 * guns.flame.damage - 24 * 1.15)) < 1e-8);
});

for (const weapon of ['hammer', 'pulse', 'nitrogen']) {
  test(`${weapon} impede ações até o fim da imobilização`, () => {
    const { step, state, target } = statusDuel(weapon);
    const start = { x: target.x, y: target.y };
    Object.assign(target, { goal: { x: 500, y: target.y }, thinkAt: Infinity });
    target.stats.speed = 100;
    target.guns.push({ key: 'pistol', ready: 0 });
    target.utils.push({ key: 'shield', ready: 0, until: 0 });
    const frozen = weapon === 'nitrogen';
    step(guns[weapon].controlDuration - STEP);
    assert.deepEqual({ x: target.x, y: target.y }, start);
    assert.equal(target.guns[0].ready, 0);
    assert.equal(target.utils[0].ready, 0);
    step();
    assert.ok(target.guns[0].ready > state.time);
    assert.ok(target.utils[0].ready > state.time);
    if (frozen) {
      for (let frame = 1; frame <= 61; frame++) {
        const before = target.x;
        step();
        assert.ok(Math.abs(target.x - before - 150 * STEP * Math.min(1, frame * STEP)) < 1e-8);
      }
    }
  });
}

test('armas de controle causam dano sem encadear efeitos e voltam a imobilizar após a recuperação', () => {
  const { step, state, attacker, target } = statusDuel('hammer');
  const lockedUntil = target.lockedUntil;
  const startX = target.x;
  attacker.guns.push(
    { key: 'nitrogen', ready: 0 },
    { key: 'pulse', ready: lockedUntil },
    { key: 'hook', ready: lockedUntil },
  );

  step();
  step(0.1);
  assert.equal(target.hp, 100 - guns.hammer.damage - guns.nitrogen.damage);
  assert.equal(target.frozenUntil, 0);

  step(lockedUntil - state.time + STEP);
  target.guns.push({ key: 'pistol', ready: 0 });
  step(0.1);
  assert.equal(target.hp, 100 - guns.hammer.damage - guns.nitrogen.damage - guns.pulse.damage - guns.hook.damage);
  assert.ok(target.guns[0].ready > state.time);
  assert.equal(target.lockedUntil, lockedUntil);
  assert.equal(target.x, startX);
  assert.equal(target.pull, null);

  attacker.guns[0].ready = lockedUntil + 0.75;
  step(lockedUntil + 0.75 - state.time + STEP);
  assert.ok(target.lockedUntil > state.time);
  assert.equal(target.hp, 100 - 2 * guns.hammer.damage - guns.nitrogen.damage - guns.pulse.damage - guns.hook.damage);
});
