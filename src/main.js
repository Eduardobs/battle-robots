import { ATTRIBUTES_POINTS, ATTRIBUTES_BASE, BATTLE_TIME_IN_SECONDS, GUNS_QUANTITY, UTILS_QUANTITY } from '../config.js';
import { attributes, guns, utils, pilots, icon } from './catalog.js';
import { createBattle, STEP } from './battle.js';
import { createRenderer } from './render.js';

const byId = id => document.getElementById(id);
const hangar = byId('hangar');
const arena = byId('arena');
const bays = byId('bays');
const events = byId('events');
const result = byId('result');
const render = createRenderer(byId('field'));
const format = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const formatHP = value => value > 0 && value < 0.1 ? '<0,1' : format.format(value);
const timecode = seconds => [Math.floor(seconds / 60), Math.floor(seconds % 60)]
  .map(value => String(value).padStart(2, '0')).join(':');
const strategies = {
  advance: { name: 'Pressão', description: 'Avança para lutar a curta distância' },
  distance: { name: 'Distância', description: 'Recua se o adversário se aproximar demais' },
  flank: { name: 'Flanco', description: 'Circula o adversário enquanto ataca' },
};

const loadouts = pilots.map((_, id) => ({
  stats: Object.fromEntries(attributes.map(({ id }) => [id, ATTRIBUTES_BASE])),
  guns: (id === 0 ? ['flame', 'pistol', 'saw', 'hammer', 'hook']
    : ['pistol', 'flame', 'saw', 'hammer', 'hook']).slice(0, GUNS_QUANTITY),
  utils: (id === 0 ? ['shield', 'nitro'] : ['nitro', 'shield']).slice(0, UTILS_QUANTITY),
  strategy: id === 0 ? 'advance' : 'distance',
  ready: false,
}));

function options(catalog) {
  return Object.entries(catalog).map(([key, item]) =>
    `<option value="${key}">${item.name}</option>`).join('');
}

function equipment(id, kind, selection, catalog, name) {
  return selection.map((_, slot) => {
    const field = `${kind}-${id}-${slot}`;
    const label = selection.length > 1 ? `${name} ${slot + 1}` : name;
    return `<label class="equipment" for="${field}">
      <span class="field-label">${label}</span>
      <span class="select-wrap"><i></i><select id="${field}" data-kind="${kind}" data-slot="${slot}" aria-describedby="${field}-detail">${options(catalog)}</select>${icon('chevron')}</span>
      <small id="${field}-detail"></small>
    </label>`;
  }).join('');
}

bays.innerHTML = pilots.map((pilot, id) => `
  <article class="bay ${pilot.className}" aria-labelledby="pilot-${id}">
    <div class="chassis">
      <div class="pilot-title"><p class="eyebrow">JOGADOR ${id + 1}</p><h2 id="pilot-${id}">${pilot.name}</h2>
      <span class="pilot-state"><i></i><span>Configurando</span></span></div>
      <img class="robot-art" src="./assets/chassis.webp" alt="">
      <span class="reticle" aria-hidden="true"></span>
    </div>
    <div class="bay-controls">
      <div class="attributes-title"><h3>${icon('layers')} Atributos</h3><div class="budget"><output></output> pontos livres</div></div>
      <div class="budget-meter"><span></span></div>
      <fieldset>
        <legend class="sr-only">Atributos de ${pilot.name}</legend>
        <div class="attributes">${attributes.map(attr => `
          <div class="attribute" data-attribute="${attr.id}">
            <label for="${attr.id}-${id}" title="${attr.description}">${icon(attr.icon)} <span>${attr.label}</span></label>
            <button type="button" data-delta="-1" aria-label="Diminuir ${attr.label}">−</button>
            <input id="${attr.id}-${id}" type="number" inputmode="numeric" min="${ATTRIBUTES_BASE}" step="1" aria-label="${attr.label} de ${pilot.name}">
            <button type="button" data-delta="1" aria-label="Aumentar ${attr.label}">+</button>
          </div>`).join('')}</div>
      </fieldset>
      <fieldset class="equipment-grid">
        <legend class="sr-only">Equipamento e comportamento de ${pilot.name}</legend>
        ${equipment(id, 'guns', loadouts[id].guns, guns, 'Armamento')}
        ${equipment(id, 'utils', loadouts[id].utils, utils, 'Ferramenta')}
        ${equipment(id, 'strategy', [loadouts[id].strategy], strategies, 'Estratégia')}
      </fieldset>
      <button class="ready-button" type="button">${icon('check')} <span>Pronto</span></button>
    </div>
  </article>`).join('');

const bayList = [...bays.children];
const equipmentCatalogs = { guns, utils, strategy: strategies };
let frameId = 0;
const remaining = loadout => ATTRIBUTES_POINTS - Object.values(loadout.stats)
  .reduce((total, value) => total + value - ATTRIBUTES_BASE, 0);

function refresh(id, editedInput) {
  const bay = bayList[id];
  const loadout = loadouts[id];
  const rest = remaining(loadout);
  bay.querySelector('.budget output').value = rest;
  bay.querySelector('.budget-meter span').style.width = `${ATTRIBUTES_POINTS ? rest / ATTRIBUTES_POINTS * 100 : 0}%`;
  for (const row of bay.querySelectorAll('.attribute')) {
    const value = loadout.stats[row.dataset.attribute];
    const input = row.querySelector('input');
    if (input !== editedInput) input.value = value;
    input.max = value + rest;
    row.querySelector('[data-delta="-1"]').disabled = value <= ATTRIBUTES_BASE;
    row.querySelector('[data-delta="1"]').disabled = rest <= 0;
  }
  for (const select of bay.querySelectorAll('select')) {
    const { kind, slot } = select.dataset;
    const selected = loadout[kind];
    const key = kind === 'strategy' ? selected : selected[slot];
    const item = equipmentCatalogs[kind][key];
    select.value = key;
    if (kind !== 'strategy') for (const option of select.options) {
      option.disabled = option.value !== key && selected.includes(option.value);
    }
    select.parentElement.querySelector('i').innerHTML = icon(item.icon ?? 'target');
    byId(`${select.id}-detail`).textContent = item.description;
  }
  bay.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = loadout.ready; });
  bay.classList.toggle('is-ready', loadout.ready);
  bay.querySelector('.pilot-state span').textContent = loadout.ready ? 'Pronto' : 'Configurando';
  const ready = bay.querySelector('.ready-button');
  ready.setAttribute('aria-pressed', String(loadout.ready));
  ready.querySelector('span').textContent = loadout.ready ? 'Editar configuração' : 'Pronto';
  const count = loadouts.filter(entry => entry.ready).length;
  byId('ready-status').textContent = `${count}/2 jogadores prontos · A batalha começa após as duas confirmações.`;
}

function setAttribute(id, key, requested, editedInput) {
  const loadout = loadouts[id];
  if (loadout.ready) return;
  const max = loadout.stats[key] + remaining(loadout);
  loadout.stats[key] = Math.max(ATTRIBUTES_BASE, Math.min(max, Math.trunc(requested)));
  refresh(id, editedInput);
}

bayList.forEach((bay, id) => {
  const loadout = loadouts[id];
  bay.querySelectorAll('.attribute').forEach(row => {
    const key = row.dataset.attribute;
    const input = row.querySelector('input');
    input.addEventListener('input', () => {
      if (Number.isFinite(input.valueAsNumber)) setAttribute(id, key, input.valueAsNumber, input);
    });
    input.addEventListener('change', () => { input.value = loadout.stats[key]; });
    row.querySelectorAll('button').forEach(button => button.addEventListener('click', () =>
      setAttribute(id, key, loadout.stats[key] + Number(button.dataset.delta))));
  });
  bay.querySelectorAll('select').forEach(select => select.addEventListener('change', () => {
    const { kind, slot } = select.dataset;
    if (kind === 'strategy') loadout.strategy = select.value;
    else loadout[kind][slot] = select.value;
    refresh(id);
  }));
  bay.querySelector('.ready-button').addEventListener('click', () => {
    loadout.ready = !loadout.ready;
    refresh(id);
    if (loadouts.every(entry => entry.ready)) start();
  });
  refresh(id);
});

document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
byId('match-length').textContent = `${timecode(BATTLE_TIME_IN_SECONDS)} de combate`;

function setStage(inBattle) {
  hangar.hidden = inBattle;
  arena.hidden = !inBattle;
  byId('stage-hangar').removeAttribute('aria-current');
  byId('stage-arena').removeAttribute('aria-current');
  byId(inBattle ? 'stage-arena' : 'stage-hangar').setAttribute('aria-current', 'step');
  window.scrollTo(0, 0);
}

function appendEvent({ time, robot, action, damage }) {
  const follow = events.scrollTop + events.clientHeight >= events.scrollHeight - 24;
  const row = document.createElement('li');
  const pilot = pilots[robot];
  for (const [value, className] of [
    [`${timecode(time)}.${String(Math.floor((time % 1) * 100)).padStart(2, '0')}`, 'event-time'],
    [pilot?.name ?? 'Arena', pilot?.className ?? ''],
    [action, 'event-action'],
    [damage === null ? '—' : `−${formatHP(damage)} HP`, 'event-damage'],
  ]) {
    const cell = document.createElement('span');
    cell.className = className;
    cell.textContent = value;
    row.append(cell);
  }
  events.append(row);
  if (follow) events.scrollTop = events.scrollHeight;
}

function scorePanel(pilot) {
  return `<div class="score ${pilot.className}"><div><strong>${pilot.name}</strong><span class="score-hp"></span></div>
    <div class="hp-track"><i></i></div><div class="score-tools"></div></div>`;
}

byId('scoreboard').innerHTML = `${scorePanel(pilots[0])}
  <div class="timer"><span class="eyebrow">TEMPO RESTANTE</span><strong id="countdown"></strong></div>
  ${scorePanel(pilots[1])}`;
const scores = [...document.querySelectorAll('.score')].map(score => ({
  hp: score.querySelector('.score-hp'), bar: score.querySelector('.hp-track i'), tools: score.querySelector('.score-tools'),
}));

function updateScore(state) {
  byId('countdown').textContent = timecode(Math.ceil(state.duration - state.time));
  state.robots.forEach((robot, id) => {
    const score = scores[id];
    score.hp.textContent = `${formatHP(robot.hp)} / ${format.format(robot.stats.hp)} HP`;
    score.bar.style.width = `${robot.hp / robot.stats.hp * 100}%`;
    const tools = [
      robot.intent,
      ...robot.utils.filter(item => item.until > state.time || item.expires).map(item => utils[item.key].name),
      ...robot.guns.filter(item => item.expires).map(item => guns[item.key].name),
      ...attributes.filter(attr => robot.boosts[attr.id]).map(attr => `${attr.label} +10%`),
    ].filter(Boolean).join(' · ');
    if (score.tools.textContent !== tools) score.tools.textContent = tools;
  });
}

function showResult(state) {
  const { winner, reason } = state.result;
  byId('battle-status').textContent = 'Combate encerrado';
  byId('result-reason').textContent = reason === 'knockout' ? 'NOCAUTE' : 'TEMPO ESGOTADO';
  byId('result-title').textContent = winner === null ? 'Empate' : `${pilots[winner].name} venceu`;
  byId('result-score').textContent = state.robots
    .map((robot, id) => `${pilots[id].name} ${formatHP(robot.hp)} HP`).join(' · ');
  result.hidden = false;
  byId('result-title').focus({ preventScroll: true });
}

function start() {
  events.replaceChildren();
  result.hidden = true;
  byId('battle-status').textContent = 'Em combate';
  setStage(true);
  byId('arena-title').focus({ preventScroll: true });
  const battle = createBattle(loadouts, { onEvent: appendEvent });
  let previous = performance.now();
  let elapsed = 0;
  function frame(timestamp) {
    elapsed += Math.max(0, (timestamp - previous) / 1000);
    previous = timestamp;
    while (elapsed >= STEP && !battle.state.result) {
      battle.step();
      elapsed -= STEP;
    }
    render(battle.state);
    updateScore(battle.state);
    if (battle.state.result) showResult(battle.state);
    else frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);
}

byId('reset').addEventListener('click', () => {
  cancelAnimationFrame(frameId);
  loadouts.forEach(loadout => { loadout.ready = false; });
  bayList.forEach((_, id) => refresh(id));
  setStage(false);
  byId('hangar-title').setAttribute('tabindex', '-1');
  byId('hangar-title').focus({ preventScroll: true });
});
