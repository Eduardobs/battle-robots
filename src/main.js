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
const eventScroll = byId('event-scroll');
const result = byId('result');
const battleControls = byId('battle-controls');
const pauseButton = byId('pause-battle');
const finishButton = byId('finish-battle');
const render = createRenderer(byId('field'));
const languageSelect = byId('language');
const formatHP = value => value > 0 && value < 0.1
  ? `<${numberFormat.format(0.1)}` : numberFormat.format(value);
const hpAmount = value => t('hpAmount', { value, unit: t('hpUnit') });
const pilotName = id => pilots[id].name;
const timecode = seconds => [Math.floor(seconds / 60), Math.floor(seconds % 60)]
  .map(value => String(value).padStart(2, '0')).join(':');
const equipmentCatalogs = { guns, utils, strategy: { advance: {}, distance: {}, flank: {}, intercept: {}, skirmish: {}, score: {} } };
let bayList = [];
let scores = [];
let countdown;
let displayedSeconds;
let battle;
let paused = false;
let previous;
let elapsed;
let nextScore;
const MAX_EVENT_ROWS = 160;
const SCORE_INTERVAL = 0.1;
const MAX_FRAME_DELAY = 0.1;
const eventRows = [];
const pendingEvents = [];
let frameId = 0;

const loadouts = pilots.map((_, id) => ({
  stats: Object.fromEntries(attributes.map(({ id }) => [id, ATTRIBUTES_BASE])),
  guns: (id === 0 ? ['flame', 'pistol', 'saw', 'hammer', 'hook', 'pulse', 'disc', 'echo', 'nitrogen']
    : ['pistol', 'flame', 'saw', 'hammer', 'hook', 'pulse', 'disc', 'echo', 'nitrogen']).slice(0, GUNS_QUANTITY),
  utils: (id === 0 ? ['shield', 'nitro', 'beacon', 'hologram', 'treads'] : ['nitro', 'shield', 'beacon', 'hologram', 'treads']).slice(0, UTILS_QUANTITY),
  strategy: id === 0 ? 'advance' : 'distance',
  ready: false,
}));

const storageKey = 'battle-robots-loadouts';
const remaining = loadout => ATTRIBUTES_POINTS - Object.values(loadout.stats)
  .reduce((total, value) => total + value - ATTRIBUTES_BASE, 0);


function configuration({ stats, guns, utils, strategy }) {
  return { stats, guns, utils, strategy };
}

function validateConfiguration(value) {
  if (!value || typeof value !== 'object') return;
  const { stats: savedStats, guns, utils, strategy } = value;
  if (!savedStats || typeof savedStats !== 'object') return;
  const stats = { projectileSpeed: ATTRIBUTES_BASE, power: ATTRIBUTES_BASE, ...savedStats };
  const entries = attributes.map(({ id }) => [id, stats[id]]);
  if (entries.some(([, points]) => !Number.isInteger(points) || points < ATTRIBUTES_BASE)) return;
  const config = { stats: Object.fromEntries(entries), guns, utils, strategy };
  if (remaining(config) < 0 || typeof strategy !== 'string' ||
      !Object.hasOwn(equipmentCatalogs.strategy, strategy)) return;
  for (const [kind, count] of [['guns', GUNS_QUANTITY], ['utils', UTILS_QUANTITY]]) {
    const items = config[kind];
    if (!Array.isArray(items) || items.length !== count || new Set(items).size !== count ||
        items.some(item => typeof item !== 'string' || !Object.hasOwn(equipmentCatalogs[kind], item))) return;
  }
  return config;
}

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (Array.isArray(saved)) loadouts.forEach((loadout, id) => {
    const config = validateConfiguration(saved[id]);
    if (config) Object.assign(loadout, config);
  });
} catch {
  // Use defaults when storage is unavailable or unreadable.
}

function saveConfigurations() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(loadouts.map(configuration)));
  } catch {
    // Changes remain available for the current page.
  }
}

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
              <input class="attribute-value" type="number" min="${ATTRIBUTES_BASE}" step="1" aria-label="${t('attributeValueInput', { attribute, name })}">
              <input id="${attr.id}-${id}" type="range" min="${ATTRIBUTES_BASE}" step="1" aria-label="${t('attributeInput', { attribute, name })}">
              <div class="attribute-limits" aria-hidden="true"><span>${numberFormat.format(ATTRIBUTES_BASE)}</span><span class="attribute-max"></span></div>
            </div>`;
          }).join('')}</div>
          <div class="attribute-actions">
            <button type="button" data-attributes="clear">${t('clearAttributes')}</button>
            <button type="button" data-attributes="random">${t('randomizeAttributes')}</button>
          </div>
        </fieldset>
        <fieldset class="equipment-grid">
          <legend class="sr-only">${t('equipmentLegend', { name })}</legend>
          ${equipment(id, 'guns', loadouts[id].guns, t('weapon'))}
          ${equipment(id, 'utils', loadouts[id].utils, t('tool'))}
          ${equipment(id, 'strategy', [loadouts[id].strategy], t('strategy'))}
        </fieldset>
        <details class="loadout-json">
          <summary>${t('loadoutJson')}</summary>
          <div class="json-actions">
            <button type="button" data-json="download">${t('downloadJson')}</button>
            <button type="button" data-json="copy">${t('copyJson')}</button>
          </div>
          <label for="loadout-json-${id}">${t('jsonInput')}</label>
          <textarea id="loadout-json-${id}" rows="4" spellcheck="false"></textarea>
          <div class="json-actions">
            <button type="button" data-json="apply">${t('applyJson')}</button>
            <label class="json-file">${t('openJson')}
              <input type="file" accept=".json,application/json" aria-label="${t('openJson')}">
            </label>
          </div>
          <p class="json-status" role="status"></p>
        </details>
        <button class="ready-button" type="button">${icon('check')} <span></span></button>
      </div>
    </article>`;
  }).join('');
  bayList = [...bays.children];
  bayList.forEach(bindBay);
}

function refresh(id) {
  const bay = bayList[id];
  const loadout = loadouts[id];
  const rest = remaining(loadout);
  bay.querySelector('.budget output').value = rest;
  bay.querySelector('.budget-meter span').style.width = `${ATTRIBUTES_POINTS ? rest / ATTRIBUTES_POINTS * 100 : 0}%`;
  bay.querySelector('[data-attributes="clear"]').disabled = rest === ATTRIBUTES_POINTS;
  bay.querySelector('[data-attributes="random"]').disabled = rest === 0;
  for (const row of bay.querySelectorAll('.attribute')) {
    const value = loadout.stats[row.dataset.attribute];
    const slider = row.querySelector('input[type="range"]');
    const field = row.querySelector('.attribute-value');
    const max = value + rest;
    const range = max - ATTRIBUTES_BASE;
    slider.max = field.max = max;
    slider.value = field.value = value;
    slider.disabled = field.disabled = range === 0;
    slider.style.setProperty('--fill', `${range ? (value - ATTRIBUTES_BASE) / range * 100 : 0}%`);
    row.querySelector('.attribute-max').textContent = numberFormat.format(max);
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
  for (const control of bay.querySelectorAll('[data-json="apply"], .json-file input')) {
    control.disabled = loadout.ready;
  }
  bay.classList.toggle('is-ready', loadout.ready);
  bay.querySelector('.pilot-state span').textContent = t(loadout.ready ? 'ready' : 'configuring');
  const ready = bay.querySelector('.ready-button');
  ready.setAttribute('aria-pressed', String(loadout.ready));
  ready.querySelector('span').textContent = t(loadout.ready ? 'edit' : 'ready');
  const count = loadouts.filter(entry => entry.ready).length;
  byId('ready-status').textContent = t('readyStatus', { count });
}

function setAttribute(id, key, requested) {
  const loadout = loadouts[id];
  if (loadout.ready) return;
  const max = loadout.stats[key] + remaining(loadout);
  loadout.stats[key] = Math.max(ATTRIBUTES_BASE, Math.min(max, Math.trunc(requested)));
  saveConfigurations();
  refresh(id);
}

function bindConfiguration(bay, id) {
  const loadout = loadouts[id];
  const panel = bay.querySelector('.loadout-json');
  const input = panel.querySelector('textarea');
  const fileInput = panel.querySelector('input');
  const status = key => { panel.querySelector('.json-status').textContent = t(key); };
  const json = () => JSON.stringify(configuration(loadout), null, 2);
  let importRequest = 0;

  function apply(source) {
    if (loadout.ready) return;
    let config;
    try {
      config = validateConfiguration(JSON.parse(source));
    } catch {
      // Invalid JSON leaves the current configuration intact.
    }
    if (!config) {
      status('invalidJson');
      return;
    }
    Object.assign(loadout, config);
    saveConfigurations();
    refresh(id);
    input.value = json();
    status('loadedJson');
  }

  panel.querySelector('[data-json="download"]').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `robot-${pilots[id].name.toLowerCase()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  panel.querySelector('[data-json="copy"]').addEventListener('click', async () => {
    const source = json();
    try {
      await navigator.clipboard.writeText(source);
      status('copiedJson');
    } catch {
      input.value = source;
      input.focus();
      input.select();
      status('manualCopyJson');
    }
  });
  panel.querySelector('[data-json="apply"]').addEventListener('click', () => {
    importRequest++;
    apply(input.value);
  });
  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files;
    if (!file) return;
    fileInput.value = '';
    const request = ++importRequest;
    try {
      const source = await file.text();
      if (request === importRequest && panel.isConnected) apply(source);
    } catch {
      if (request === importRequest) status('invalidJson');
    }
  });
}

function bindBay(bay, id) {
  const loadout = loadouts[id];
  bay.querySelectorAll('.attribute').forEach(row => {
    const key = row.dataset.attribute;
    const slider = row.querySelector('input[type="range"]');
    const field = row.querySelector('.attribute-value');
    slider.addEventListener('input', () => setAttribute(id, key, slider.valueAsNumber));
    field.addEventListener('blur', () => {
      const value = field.valueAsNumber;
      if (Number.isFinite(value) && value !== loadout.stats[key]) {
        setAttribute(id, key, value);
      } else {
        field.value = loadout.stats[key];
      }
    });
    field.addEventListener('keydown', event => {
      if (event.key === 'Enter') field.blur();
    });
  });
  bay.querySelector('[data-attributes="clear"]').addEventListener('click', () => {
    for (const { id: key } of attributes) loadout.stats[key] = ATTRIBUTES_BASE;
    saveConfigurations();
    refresh(id);
  });
  bay.querySelector('[data-attributes="random"]').addEventListener('click', () => {
    const points = remaining(loadout);
    const cuts = attributes.slice(1).map(() => Math.floor(Math.random() * (points + 1)));
    cuts.sort((a, b) => a - b);
    cuts.unshift(0);
    cuts.push(points);
    attributes.forEach(({ id: key }, index) => {
      loadout.stats[key] += cuts[index + 1] - cuts[index];
    });
    saveConfigurations();
    refresh(id);
  });
  bay.querySelectorAll('select').forEach(select => select.addEventListener('change', () => {
    const { kind, slot } = select.dataset;
    if (kind === 'strategy') loadout.strategy = select.value;
    else loadout[kind][slot] = select.value;
    saveConfigurations();
    refresh(id);
  }));
  bindConfiguration(bay, id);
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

function createEventRow(event) {
  const row = document.createElement('li');
  for (const className of ['event-time', pilots[event.robot]?.className ?? '', 'event-action', 'event-damage']) {
    const cell = document.createElement('span');
    cell.className = className;
    row.append(cell);
  }
  updateEvent(row, event);
  return row;
}

function queueEvent(event) {
  if (event.action === 'event.move' || event.action === 'event.hold') return;
  pendingEvents.push(event);
}

function flushEvents() {
  if (!pendingEvents.length) return;
  const follow = eventScroll.scrollTop + eventScroll.clientHeight >= eventScroll.scrollHeight - 24;
  const overflow = eventRows.length + pendingEvents.length - MAX_EVENT_ROWS;
  if (overflow > 0) {
    for (const { row } of eventRows.splice(0, overflow)) row.remove();
  }
  const batch = document.createDocumentFragment();
  for (let index = Math.max(0, pendingEvents.length - MAX_EVENT_ROWS); index < pendingEvents.length; index++) {
    const event = pendingEvents[index];
    const row = createEventRow(event);
    eventRows.push({ row, event });
    batch.append(row);
  }
  pendingEvents.length = 0;
  events.append(batch);
  if (follow) eventScroll.scrollTop = eventScroll.scrollHeight;
}

function clearEvents() {
  pendingEvents.length = 0;
  eventRows.length = 0;
  events.replaceChildren();
}

function scorePanel(pilot, id) {
  return `<section class="score ${pilot.className}" aria-labelledby="robot-title-${id}"><div><h2 id="robot-title-${id}">${pilotName(id)}</h2><span class="score-hp"></span></div>
    <div class="hp-track"><i></i></div><div class="score-tools"></div>
    <div class="robot-details" id="robot-details-${id}"></div></section>`;
}

function buildScoreboard() {
  byId('scoreboard').innerHTML = `${scorePanel(pilots[0], 0)}
    <div class="timer"><span class="eyebrow">${t('remainingTime')}</span><strong id="countdown"></strong></div>
    ${scorePanel(pilots[1], 1)}`;
  countdown = byId('countdown');
  displayedSeconds = undefined;
  scores = [...document.querySelectorAll('.score')].map(score => ({
    details: score.querySelector('.robot-details'),
    hp: score.querySelector('.score-hp'), bar: score.querySelector('.hp-track i'), tools: score.querySelector('.score-tools'),
  }));
}

function renderRobotDetails(panel, robot, time) {
  const burns = robot.burns.length;
  const statuses = [
    [`${t('status.burned')} ×${burns}`, burns > 0],
    [t('status.locked'), robot.lockedUntil > time + 1e-8],
    [t('status.frozen'), robot.frozenUntil > time + 1e-8],
  ];
  const signature = JSON.stringify([language, statuses, robot.stats, Object.keys(robot.boosts),
    robot.guns.map(item => [item.key, item.expires]), robot.utils.map(item => [item.key, item.expires])]);
  if (panel.dataset.signature === signature) return;
  panel.dataset.signature = signature;

  const statRows = attributes.map(({ id, icon: symbol }) => {
    const boosted = Object.hasOwn(robot.boosts, id);
    const bonus = boosted
      ? `<span class="drop-bonus" title="${t('dropBonus')}"><span class="sr-only">${t('dropBonus')} </span>+${numberFormat.format(robot.stats[id] - robot.baseStats[id])}</span>`
      : '';
    return `<div><dt>${icon(symbol)} ${t(`attr.${id}.name`)}</dt>
      <dd>${numberFormat.format(robot.stats[id])}${bonus}</dd></div>`;
  }).join('');
  const equipment = [['guns', 'weapon'], ['utils', 'tool']].map(([kind, label]) => {
    const slots = robot[kind].map(({ key, expires }) => `<li>
      ${icon(equipmentCatalogs[kind][key].icon)} <span>${t(`${kind}.${key}.name`)}${expires
        ? ` <small class="drop-bonus">${t('dropBonus')}</small>` : ''}</span>${kind === 'guns'
        ? '<span class="weapon-cooldown"></span>' : ''}</li>`).join('');
    return `<div><h3>${t(label)}</h3><ol class="battle-slots">${slots || '<li>—</li>'}</ol></div>`;
  }).join('');
  panel.innerHTML = `<ul class="battle-statuses">${statuses.map(([label, active]) => `<li${active ? '' : ' class="inactive"'}>${label}</li>`).join('')}</ul>
    <div class="battle-detail-groups"><div><h3>${t('attributes')}</h3><dl class="battle-stats">${statRows}</dl></div>${equipment}</div>`;
}

function updateRobotDetails({ robots, time, result }) {
  for (const robot of robots) {
    const panel = scores[robot.id].details;
    renderRobotDetails(panel, robot, time);
    panel.querySelectorAll('.weapon-cooldown').forEach((counter, index) => {
      const remaining = result ? 0 : Math.round((robot.guns[index].ready - time) * 100);
      const text = remaining > 0 ? (remaining / 100).toFixed(2).replace('.', decimalSeparator) : '';
      if (counter.textContent !== text) counter.textContent = text;
    });
  }
}

function updateScore(state) {
  const seconds = Math.ceil(state.duration - state.time);
  if (displayedSeconds !== seconds) {
    displayedSeconds = seconds;
    countdown.textContent = timecode(seconds);
  }
  state.robots.forEach((robot, id) => {
    const score = scores[id];
    if (score.currentHP !== robot.hp || score.maxHP !== robot.stats.hp) {
      score.currentHP = robot.hp;
      score.maxHP = robot.stats.hp;
      score.hp.textContent = t('hpScore', {
        current: formatHP(robot.hp), max: numberFormat.format(robot.stats.hp), unit: t('hpUnit'),
      });
      score.bar.style.width = `${robot.hp / robot.stats.hp * 100}%`;
    }
    const tools = [
      robot.intent && t(`intent.${robot.intent}`),
      ...robot.utils.filter(item => item.until > state.time).map(item => t(`utils.${item.key}.name`)),
    ].filter(Boolean).join(' · ');
    if (score.tools.textContent !== tools) score.tools.textContent = tools;
  });
  updateRobotDetails(state);
}

function updateBattleControls() {
  const finished = Boolean(battle?.state.result);
  battleControls.hidden = !battle || finished;
  byId('battle-status').textContent = t(finished ? 'finished' : paused ? 'paused' : 'intent.fight');
  pauseButton.textContent = t(paused ? 'resumeBattle' : 'pauseBattle');
}

function showResult(state, focus = true) {
  const { winner, reason } = state.result;
  byId('result-reason').textContent = t(reason);
  byId('result-title').textContent = winner === null ? t('draw') : t('winner', { name: pilotName(winner) });
  byId('result-score').textContent = state.robots
    .map((robot, id) => t('pilotScore', { name: pilotName(id), hp: hpAmount(formatHP(robot.hp)) })).join(' · ');
  result.hidden = false;
  if (focus) byId('result-title').focus({ preventScroll: true });
}

function frame(timestamp) {
  const { state } = battle;
  elapsed += Math.min(MAX_FRAME_DELAY, Math.max(0, (timestamp - previous) / 1000));
  previous = timestamp;
  const time = state.time;
  while (elapsed >= STEP && !state.result) {
    battle.step();
    elapsed -= STEP;
  }
  if (state.time !== time) {
    render(state);
    if (state.result || state.time >= nextScore) {
      updateScore(state);
      nextScore = state.time + SCORE_INTERVAL;
    } else {
      updateRobotDetails(state);
    }
    flushEvents();
  }
  if (state.result) {
    updateBattleControls();
    showResult(state);
  } else {
    frameId = requestAnimationFrame(frame);
  }
}

function scheduleFrame() {
  previous = performance.now();
  frameId = requestAnimationFrame(frame);
}

function start() {
  clearEvents();
  result.hidden = true;
  paused = false;
  elapsed = 0;
  nextScore = SCORE_INTERVAL;
  battle = createBattle(loadouts, { onEvent: queueEvent });
  updateBattleControls();
  setStage(true);
  byId('arena-title').focus({ preventScroll: true });
  render(battle.state);
  updateScore(battle.state);
  flushEvents();
  scheduleFrame();
}

pauseButton.addEventListener('click', () => {
  if (!battle || battle.state.result) return;
  paused = !paused;
  if (paused) {
    cancelAnimationFrame(frameId);
    updateScore(battle.state);
  } else {
    scheduleFrame();
  }
  updateBattleControls();
});

finishButton.addEventListener('click', () => {
  if (!battle || battle.state.result) return;
  cancelAnimationFrame(frameId);
  battle.finish();
  updateScore(battle.state);
  flushEvents();
  updateBattleControls();
  showResult(battle.state);
});

byId('reset').addEventListener('click', () => {
  cancelAnimationFrame(frameId);
  battle = undefined;
  paused = false;
  clearEvents();
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
  updateBattleControls();
  buildBays();
  buildScoreboard();
  eventRows.forEach(({ row, event }) => updateEvent(row, event));
  if (battle) {
    const battleState = battle.state;
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
