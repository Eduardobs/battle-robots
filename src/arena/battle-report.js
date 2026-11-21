import { DROP_TYPES } from '../battle.js';
import { guns, pilots } from '../catalog.js';
import { locale, numberFormat, t } from '../i18n.js';
import { formatHP, hpAmount, timecode } from '../ui/format.js';
import { icon } from '../ui/icons.js';

const byId = id => document.getElementById(id);
const sum = values => values.reduce((total, value) => total + value, 0);
const pending = ({ shots, hits, misses, anchors }) => shots - hits - misses - anchors;

function comparisonPanel(title, symbol, rows, reports) {
  const header = pilots.map(pilot => `<th scope="col" class="${pilot.className}">${t(pilot.nameKey)}</th>`).join('');
  const body = rows.map(([label, value]) => `
    <tr><th scope="row">${t(label)}</th>${reports.map(report => `<td>${value(report)}</td>`).join('')}</tr>`).join('');
  return `<table class="report-table">
    <caption>${icon(symbol)} ${t(title)}</caption>
    <thead><tr><th scope="col">${t('report.metric')}</th>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

export function renderBattleReport({ result, robots, time }) {
  const { winner, reason } = result;
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
  const accuracy = ({ hits, misses }) => hits + misses ? percent.format(hits / (hits + misses)) : '—';
  const value = key => report => numberFormat.format(report[key]);
  const health = key => report => hpAmount(formatHP(report[key]));
  const reports = robots.map(({ report }) => {
    const weapons = Object.values(report.weapons);
    const weaponTotal = key => sum(weapons.map(weapon => weapon[key]));
    return {
      ...report,
      ...Object.fromEntries(['shots', 'hits', 'misses', 'criticals', 'anchors', 'damage', 'burnDamage']
        .map(key => [key, weaponTotal(key)])),
      pending: sum(weapons.map(pending)),
      dropsTotal: sum(Object.values(report.drops)),
      toolUses: sum(Object.values(report.tools)),
    };
  });
  const outcome = byId('result-outcome');
  outcome.className = `report-outcome ${winner === null ? '' : pilots[winner].className}`;
  byId('result-reason').textContent = t(reason);
  byId('result-winner').textContent = winner === null ? t('draw') : t('winner', { name: t(pilots[winner].nameKey) });
  byId('result-duration').textContent = timecode(time);
  byId('result-score').innerHTML = robots.map(({ id, hp, stats }) => {
    const ratio = hp / stats.hp;
    const pilot = pilots[id];
    return `<div class="report-health ${pilot.className}">
      <div><strong>${t(pilot.nameKey)}</strong><span>${percent.format(ratio)}</span></div>
      <div class="hp-track" aria-hidden="true"><i style="width:${100 * ratio}%"></i></div>
      <span>${t('hpScore', { current: formatHP(hp), max: formatHP(stats.hp), unit: t('hpUnit') })}</span>
    </div>`;
  }).join('');

  const tools = new Set(reports.flatMap(report => Object.keys(report.tools)));
  byId('report-comparison').innerHTML = [
    comparisonPanel('report.combat', 'target', [
      ['report.shots', value('shots')], ['report.hits', value('hits')], ['report.misses', value('misses')],
      ['report.accuracy', accuracy], ['report.criticals', value('criticals')],
      ['report.controlHits', value('controlHits')], ['report.anchors', value('anchors')],
      ['report.pending', value('pending')],
    ], reports),
    comparisonPanel('report.survival', 'shield', [
      ['report.damageDealt', health('damage')], ['report.burnDamage', health('burnDamage')],
      ['report.damageTaken', report => hpAmount(formatHP(report.damageTaken + report.spikeDamage))],
      ['report.spikeDamage', health('spikeDamage')], ['report.healing', health('healing')],
      ['report.defenseMitigated', health('defenseMitigated')], ['report.shieldMitigated', health('shieldMitigated')],
    ], reports),
    comparisonPanel('report.drops', 'layers', [
      ['report.dropsTotal', value('dropsTotal')],
      ...DROP_TYPES.map(type => [`drop.${type}`, report => numberFormat.format(report.drops[type])]),
      ['report.boosts', value('boosts')],
    ], reports),
    comparisonPanel('report.tools', 'settings', [
      ['report.toolUses', value('toolUses')],
      ...Array.from(tools, key => [`utils.${key}.name`, report => numberFormat.format(report.tools[key] ?? 0)]),
      ['report.decoys', value('decoys')], ['report.beaconReturns', value('beaconReturns')],
    ], reports),
  ].map(panel => `<div class="report-panel">${panel}</div>`).join('');

  const columns = [
    ['report.shots', value('shots')], ['report.hits', value('hits')], ['report.misses', value('misses')],
    ['report.accuracy', accuracy], ['report.criticals', value('criticals')], ['report.anchors', value('anchors')],
    ['report.pending', weapon => numberFormat.format(pending(weapon))], ['damage', health('damage')],
  ];
  byId('report-weapons').innerHTML = robots.map(({ id, report }) => {
    const pilot = pilots[id];
    const name = t(pilot.nameKey);
    const entries = Object.entries(report.weapons);
    const header = columns.map(([label]) => `<th scope="col">${t(label)}</th>`).join('');
    const body = entries.map(([key, weapon]) => `
      <tr><th scope="row">${icon(guns[key].icon)} ${t(`guns.${key}.name`)}</th>
      ${columns.map(([, format]) => `<td>${format(weapon)}</td>`).join('')}</tr>`).join('');
    return `<div class="report-panel report-weapon-panel ${pilot.className}"><h3>${name}</h3>${entries.length ? `
      <div class="report-scroll" role="region" aria-label="${t('report.weaponRegion', { name })}" tabindex="0">
        <table class="report-table" aria-label="${t('report.weaponRegion', { name })}">
          <thead><tr><th scope="col">${t('report.weapon')}</th>${header}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>` : `<p class="report-empty">${t('report.noWeapons')}</p>`}</div>`;
  }).join('');
}
