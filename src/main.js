import { ATTRIBUTES_POINTS, ATTRIBUTES_BASE, BATTLE_TIME_IN_SECONDS, GUNS_QUANTITY, UTILS_QUANTITY } from '../config.js';
import { attributes, guns, utils, pilots, icon } from './catalog.js';
import { createBattle, STEP } from './battle.js';
import { createRenderer } from './render.js';
import { language, locale, decimalSeparator, numberFormat, resolveLanguage, setLanguage, t } from './i18n.js';

const byId = id => document.getElementById(id);
const hangar = byId('hangar');
const arena = byId('arena');
const bays = byId('bays');
const events = byId('events');
const result = byId('result');
const render = createRenderer(byId('field'));
const languageSelect = byId('language');
const formatHP = value => value > 0 && value < 0.1
  ? `<${numberFormat.format(0.1)}` : numberFormat.format(value);
const hpAmount = value => t('hpAmount', { value, unit: t('hpUnit') });
const pilotName = id => pilots[id].name;
const timecode = seconds => [Math.floor(seconds / 60), Math.floor(seconds % 60)]
  .map(value => String(value).padStart(2, '0')).join(':');
const equipmentCatalogs = { guns, utils, strategy: { advance: {}, distance: {}, flank: {} } };
let bayList = [];
let scores = [];
let battleState;
const eventRows = [];
let frameId = 0;

const loadouts = pilots.map((_, id) => ({
  stats: Object.fromEntries(attributes.map(({ id }) => [id, ATTRIBUTES_BASE])),
  guns: (id === 0 ? ['flame', 'pistol', 'saw', 'hammer', 'hook']
    : ['pistol', 'flame', 'saw', 'hammer', 'hook']).slice(0, GUNS_QUANTITY),
  utils: (id === 0 ? ['shield', 'nitro'] : ['nitro', 'shield']).slice(0, UTILS_QUANTITY),
  strategy: id === 0 ? 'advance' : 'distance',
  ready: false,
}));

function options(kind) {
  return Object.keys(equipmentCatalogs[kind]).map(key =>
    `<option value="${key}">${t(`${kind}.${key}.name`)}</option>`).join('');
}

function equipment(id, kind, selection, name) {
  return selection.map((_, slot) => {
    const field = `${kind}-${id}-${slot}`;
    const label = selection.length > 1 ? t('equipmentSlot', { name, number: slot + 1 }) : name;
    return `<label class="equipment" for="${field}">
      <span class="field-label">${label}</span>
      <span class="select-wrap"><i></i><select id="${field}" data-kind="${kind}" data-slot="${slot}" aria-describedby="${field}-detail">${options(kind)}</select>${icon('chevron')}</span>
      <small id="${field}-detail"></small>
    </label>`;
  }).join('');
}

function buildBays() {
  bays.innerHTML = pilots.map((pilot, id) => {
    const name = pilotName(id);
    return `
    <article class="bay ${pilot.className}" aria-labelledby="pilot-${id}">
      <div class="chassis">
        <div class="pilot-title"><p class="eyebrow">${t('player', { number: id + 1 })}</p><h2 id="pilot-${id}">${name}</h2>
        <span class="pilot-state"><i></i><span></span></span></div>
        <img class="robot-art" src="./assets/chassis.webp" alt="">
        <span class="reticle" aria-hidden="true"></span>
      </div>
      <div class="bay-controls">
        <div class="attributes-title"><h3>${icon('layers')} ${t('attributes')}</h3><div class="budget"><output></output> ${t('points')}</div></div>
        <div class="budget-meter"><span></span></div>
        <fieldset>
          <legend class="sr-only">${t('attributeLegend', { name })}</legend>
          <div class="attributes">${attributes.map(attr => {
            const attribute = t(`attr.${attr.id}.name`);
            return `
            <div class="attribute" data-attribute="${attr.id}">
              <label for="${attr.id}-${id}" title="${t(`attr.${attr.id}.description`)}">${icon(attr.icon)} <span>${attribute}</span></label>
              <button type="button" data-delta="-1" aria-label="${t('decrease', { attribute })}">−</button>
              <input id="${attr.id}-${id}" type="number" inputmode="numeric" min="${ATTRIBUTES_BASE}" step="1" aria-label="${t('attributeInput', { attribute, name })}">
              <button type="button" data-delta="1" aria-label="${t('increase', { attribute })}">+</button>
            </div>`;
          }).join('')}</div>
        </fieldset>
        <fieldset class="equipment-grid">
          <legend class="sr-only">${t('equipmentLegend', { name })}</legend>
          ${equipment(id, 'guns', loadouts[id].guns, t('weapon'))}
          ${equipment(id, 'utils', loadouts[id].utils, t('tool'))}
          ${equipment(id, 'strategy', [loadouts[id].strategy], t('strategy'))}
        </fieldset>
        <button class="ready-button" type="button">${icon('check')} <span></span></button>
      </div>
    </article>`;
  }).join('');
  bayList = [...bays.children];
  bayList.forEach(bindBay);
}

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
    byId(`${select.id}-detail`).textContent = t(`${kind}.${key}.description`);
  }
  bay.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = loadout.ready; });
  bay.classList.toggle('is-ready', loadout.ready);
  bay.querySelector('.pilot-state span').textContent = t(loadout.ready ? 'ready' : 'configuring');
  const ready = bay.querySelector('.ready-button');
  ready.setAttribute('aria-pressed', String(loadout.ready));
  ready.querySelector('span').textContent = t(loadout.ready ? 'edit' : 'ready');
  const count = loadouts.filter(entry => entry.ready).length;
  byId('ready-status').textContent = t('readyStatus', { count });
}

function setAttribute(id, key, requested, editedInput) {
  const loadout = loadouts[id];
  if (loadout.ready) return;
  const max = loadout.stats[key] + remaining(loadout);
  loadout.stats[key] = Math.max(ATTRIBUTES_BASE, Math.min(max, Math.trunc(requested)));
  refresh(id, editedInput);
}

function bindBay(bay, id) {
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
}

document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });

function setStage(inBattle) {
  hangar.hidden = inBattle;
  arena.hidden = !inBattle;
  byId('stage-hangar').removeAttribute('aria-current');
  byId('stage-arena').removeAttribute('aria-current');
  byId(inBattle ? 'stage-arena' : 'stage-hangar').setAttribute('aria-current', 'step');
  window.scrollTo(0, 0);
}

function updateEvent(row, { time, robot, action, item, damage }) {
  const values = [
    `${timecode(time)}${decimalSeparator}${String(Math.floor((time % 1) * 100)).padStart(2, '0')}`,
    robot === null ? t('arena') : pilotName(robot),
    t(action, item ? { item: t(item) } : {}),
    damage === null ? '—' : hpAmount(`−${formatHP(damage)}`),
  ];
  values.forEach((value, index) => { row.children[index].textContent = value; });
}

function appendEvent(event) {
  const follow = events.scrollTop + events.clientHeight >= events.scrollHeight - 24;
  const row = document.createElement('li');
  for (const className of ['event-time', pilots[event.robot]?.className ?? '', 'event-action', 'event-damage']) {
    const cell = document.createElement('span');
    cell.className = className;
    row.append(cell);
  }
  updateEvent(row, event);
  eventRows.push({ row, event });
  events.append(row);
  if (follow) events.scrollTop = events.scrollHeight;
}

function scorePanel(pilot, id) {
  return `<div class="score ${pilot.className}"><div><strong>${pilotName(id)}</strong><span class="score-hp"></span></div>
    <div class="hp-track"><i></i></div><div class="score-tools"></div></div>`;
}

function buildScoreboard() {
  byId('scoreboard').innerHTML = `${scorePanel(pilots[0], 0)}
    <div class="timer"><span class="eyebrow">${t('remainingTime')}</span><strong id="countdown"></strong></div>
    ${scorePanel(pilots[1], 1)}`;
  scores = [...document.querySelectorAll('.score')].map(score => ({
    hp: score.querySelector('.score-hp'), bar: score.querySelector('.hp-track i'), tools: score.querySelector('.score-tools'),
  }));
}

function updateScore(state) {
  byId('countdown').textContent = timecode(Math.ceil(state.duration - state.time));
  state.robots.forEach((robot, id) => {
    const score = scores[id];
    score.hp.textContent = t('hpScore', {
      current: formatHP(robot.hp), max: numberFormat.format(robot.stats.hp), unit: t('hpUnit'),
    });
    score.bar.style.width = `${robot.hp / robot.stats.hp * 100}%`;
    const tools = [
      robot.intent && t(`intent.${robot.intent}`),
      ...robot.utils.filter(item => item.until > state.time || item.expires).map(item => t(`utils.${item.key}.name`)),
      ...robot.guns.filter(item => item.expires).map(item => t(`guns.${item.key}.name`)),
      ...attributes.filter(attr => robot.boosts[attr.id]).map(attr => t('boost', { item: t(`attr.${attr.id}.name`) })),
    ].filter(Boolean).join(' · ');
    if (score.tools.textContent !== tools) score.tools.textContent = tools;
  });
}

function showResult(state, focus = true) {
  const { winner, reason } = state.result;
  byId('battle-status').textContent = t('finished');
  byId('result-reason').textContent = t(reason);
  byId('result-title').textContent = winner === null ? t('draw') : t('winner', { name: pilotName(winner) });
  byId('result-score').textContent = state.robots
    .map((robot, id) => t('pilotScore', { name: pilotName(id), hp: hpAmount(formatHP(robot.hp)) })).join(' · ');
  result.hidden = false;
  if (focus) byId('result-title').focus({ preventScroll: true });
}

function start() {
  eventRows.length = 0;
  events.replaceChildren();
  result.hidden = true;
  byId('battle-status').textContent = t('intent.fight');
  setStage(true);
  byId('arena-title').focus({ preventScroll: true });
  const battle = createBattle(loadouts, { onEvent: appendEvent });
  battleState = battle.state;
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
  battleState = undefined;
  eventRows.length = 0;
  events.replaceChildren();
  loadouts.forEach(loadout => { loadout.ready = false; });
  bayList.forEach((_, id) => refresh(id));
  setStage(false);
  byId('hangar-title').setAttribute('tabindex', '-1');
  byId('hangar-title').focus({ preventScroll: true });
});

function applyLanguage(code) {
  setLanguage(code);
  document.documentElement.lang = locale;
  languageSelect.value = language;
  document.querySelectorAll('[data-t]').forEach(element => { element.textContent = t(element.dataset.t); });
  document.querySelectorAll('[data-t-label]').forEach(element => {
    element.setAttribute('aria-label', t(element.dataset.tLabel));
  });
  document.querySelector('meta[name="description"]').content = t('description');
  languageSelect.setAttribute('aria-label', t('language'));
  byId('match-length').textContent = t('matchLength', { time: timecode(BATTLE_TIME_IN_SECONDS) });
  byId('battle-status').textContent = t('intent.fight');
  buildBays();
  buildScoreboard();
  eventRows.forEach(({ row, event }) => updateEvent(row, event));
  if (battleState) {
    render(battleState);
    updateScore(battleState);
    if (battleState.result) showResult(battleState, false);
  }
}

let preferredLanguage;
try {
  preferredLanguage = localStorage.getItem('battle-robots-language');
} catch {
  // Language selection remains available when storage is blocked.
}
applyLanguage(resolveLanguage([preferredLanguage, ...(navigator.languages ?? [navigator.language])]));
languageSelect.addEventListener('change', () => {
  applyLanguage(languageSelect.value);
  try {
    localStorage.setItem('battle-robots-language', language);
  } catch {
    // Keep the selected language for the current page.
  }
});
