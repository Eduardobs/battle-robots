import { ATTRIBUTES_BASE, ATTRIBUTES_POINTS } from '../../config.js';
import { attributes, equipmentCatalogs, pilots } from '../catalog.js';
import { numberFormat, t } from '../i18n.js';
import { icon } from '../ui/icons.js';
import { bindConfiguration } from './json-panel.js';
import { loadouts, remaining, saveConfigurations } from './loadouts.js';

const bays = document.getElementById('bays');
let bayList = [];

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

export function buildBays(onReady) {
  bays.innerHTML = pilots.map((pilot, id) => {
    const name = pilot.name;
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
  bayList = [...bays.children].map(bay => ({
    bay,
    rows: [...bay.querySelectorAll('.attribute')].map(row => ({
      key: row.dataset.attribute,
      slider: row.querySelector('input[type="range"]'),
      field: row.querySelector('.attribute-value'),
      limit: row.querySelector('.attribute-max'),
    })),
  }));
  bayList.forEach((controls, id) => bindBay(controls, id, onReady));
}

function refreshAttributes(id) {
  const { bay, rows } = bayList[id];
  const loadout = loadouts[id];
  const rest = remaining(loadout);
  bay.querySelector('.budget output').value = rest;
  bay.querySelector('.budget-meter span').style.width = `${ATTRIBUTES_POINTS ? rest / ATTRIBUTES_POINTS * 100 : 0}%`;
  bay.querySelector('[data-attributes="clear"]').disabled = rest === ATTRIBUTES_POINTS;
  bay.querySelector('[data-attributes="random"]').disabled = rest === 0;
  for (const { key, slider, field, limit } of rows) {
    const value = loadout.stats[key];
    const max = value + rest;
    const range = max - ATTRIBUTES_BASE;
    slider.max = field.max = max;
    slider.value = field.value = value;
    slider.disabled = field.disabled = range === 0;
    slider.style.setProperty('--fill', `${range ? (value - ATTRIBUTES_BASE) / range * 100 : 0}%`);
    limit.textContent = numberFormat.format(max);
  }
}

function refreshEquipment(id) {
  const { bay } = bayList[id];
  const loadout = loadouts[id];
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
    document.getElementById(`${select.id}-detail`).textContent = t(`${kind}.${key}.description`);
  }
}

function refreshReady(id) {
  const { bay } = bayList[id];
  const loadout = loadouts[id];
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
  document.getElementById('ready-status').textContent = t('readyStatus', { count });
}

function setAttribute(id, key, requested) {
  const loadout = loadouts[id];
  if (loadout.ready) return;
  const max = loadout.stats[key] + remaining(loadout);
  loadout.stats[key] = Math.max(ATTRIBUTES_BASE, Math.min(max, Math.trunc(requested)));
  saveConfigurations();
  refreshAttributes(id);
}

function bindBay({ bay, rows }, id, onReady) {
  const loadout = loadouts[id];
  rows.forEach(({ key, slider, field }) => {
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
    refreshAttributes(id);
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
    refreshAttributes(id);
  });
  bay.querySelectorAll('select').forEach(select => select.addEventListener('change', () => {
    const { kind, slot } = select.dataset;
    if (kind === 'strategy') loadout.strategy = select.value;
    else loadout[kind][slot] = select.value;
    saveConfigurations();
    refreshEquipment(id);
  }));
  bindConfiguration(bay, id, loadout, () => {
    saveConfigurations();
    refreshAttributes(id);
    refreshEquipment(id);
  });
  bay.querySelector('.ready-button').addEventListener('click', () => {
    loadout.ready = !loadout.ready;
    refreshReady(id);
    if (loadouts.every(entry => entry.ready)) onReady(loadouts);
  });
  refreshAttributes(id);
  refreshEquipment(id);
  refreshReady(id);
}

export function resetReady() {
  loadouts.forEach(loadout => { loadout.ready = false; });
  bayList.forEach((_, id) => refreshReady(id));
}
