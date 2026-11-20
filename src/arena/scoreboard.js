import { attributes, equipmentCatalogs, pilots } from '../catalog.js';
import { decimalSeparator, numberFormat, t } from '../i18n.js';
import { formatHP, timecode } from '../ui/format.js';
import { icon } from '../ui/icons.js';

let scores = [];
let countdown;
let displayedSeconds;

function scorePanel(pilot, id) {
  const stats = attributes.map(attr => `<div><dt>${icon(attr.icon)} ${t(`attr.${attr.id}.name`)}</dt><dd></dd></div>`).join('');
  const detailsOpen = document.getElementById(`robot-details-${id}`)?.open;
  return `<section class="score ${pilot.className}" aria-labelledby="robot-title-${id}"><div><h2 id="robot-title-${id}">${t(pilot.nameKey)}</h2><span class="score-hp"></span></div>
    <div class="hp-track"><i></i></div><div class="score-tools"></div>
    <ul class="battle-statuses"><li></li><li></li><li></li></ul>
    <details class="robot-details" id="robot-details-${id}"${detailsOpen ? ' open' : ''}>
      <summary>${t('robotDetails')}</summary>
      <div class="battle-detail-groups">
        <div><h3>${t('attributes')}</h3><dl class="battle-stats">${stats}</dl></div>
        <div><h3>${t('weapon')}</h3><ol class="battle-slots" data-kind="guns"></ol></div>
        <div><h3>${t('tool')}</h3><ol class="battle-slots" data-kind="utils"></ol></div>
      </div></details></section>`;
}

export function buildScoreboard() {
  document.getElementById('scoreboard').innerHTML = `${scorePanel(pilots[0], 0)}
    <div class="timer"><span class="timer-label eyebrow">${icon('clock')} ${t('remainingTime')}</span><strong id="countdown"></strong></div>
    ${scorePanel(pilots[1], 1)}`;
  countdown = document.getElementById('countdown');
  displayedSeconds = undefined;
  scores = [...document.querySelectorAll('.score')].map(score => ({
    statuses: score.querySelector('.battle-statuses').children,
    stats: [...score.querySelectorAll('.battle-stats dd')].map((field, index) => ({ field, id: attributes[index].id })),
    guns: { list: score.querySelector('[data-kind="guns"]') },
    utils: { list: score.querySelector('[data-kind="utils"]') },
    hp: score.querySelector('.score-hp'), bar: score.querySelector('.hp-track i'), tools: score.querySelector('.score-tools'),
  }));
}

function updateEquipment(group, items, kind) {
  if (group.items?.length === items.length && items.every((item, i) => item === group.items[i])) return;
  group.items = [...items];
  const counterClass = kind === 'guns' ? 'weapon-cooldown' : 'tool-cooldown';
  const counterTip = t(kind === 'guns' ? 'cooldownTip' : 'toolCooldownTip');
  group.list.innerHTML = items.map(({ key, expires }) => `<li>
    ${icon(equipmentCatalogs[kind][key].icon)} <span>${t(`${kind}.${key}.name`)}${expires
      ? ` <small class="drop-bonus">${t('dropBonus')}</small>` : ''}</span>
    <span class="${counterClass}" title="${counterTip}"></span></li>`).join('') || '<li>—</li>';
  group.counters = group.list.querySelectorAll(`.${counterClass}`);
}

function formatRemaining(until, time) {
  const remaining = Math.round((until - time) * 100);
  return remaining > 0 ? (remaining / 100).toFixed(2).replace('.', decimalSeparator) : '';
}

function updateStatus(field, label, until, time) {
  const remaining = formatRemaining(until, time);
  const text = `${label} ${remaining || `0${decimalSeparator}00`} s`;
  if (field.textContent !== text) field.textContent = text;
  field.classList.toggle('inactive', !remaining);
}

export function updateRobotDetails({ robots, time, result }) {
  for (const robot of robots) {
    const score = scores[robot.id];
    const burnUntil = Math.max(0, ...robot.burns.map(burn => burn.until));
    updateStatus(score.statuses[0], `${t('status.burned')} ×${robot.burns.length}`, burnUntil, time);
    updateStatus(score.statuses[1], t('status.locked'), robot.lockedUntil, time);
    updateStatus(score.statuses[2], t('status.frozen'), robot.frozenUntil, time);

    for (const stat of score.stats) {
      const value = robot.stats[stat.id];
      const boosted = Object.hasOwn(robot.boosts, stat.id);
      if (stat.value === value && stat.boosted === boosted) continue;
      stat.value = value;
      stat.boosted = boosted;
      const bonus = boosted
        ? `<span class="drop-bonus" title="${t('dropBonus')}"><span class="sr-only">${t('dropBonus')} </span>+${numberFormat.format(value - robot.baseStats[stat.id])}</span>`
        : '';
      stat.field.innerHTML = numberFormat.format(value) + bonus;
    }
    for (const kind of ['utils', 'guns']) {
      const items = robot[kind];
      const group = score[kind];
      updateEquipment(group, items, kind);
      group.counters.forEach((counter, index) => {
        const text = result ? '' : formatRemaining(items[index].ready, time);
        if (counter.textContent !== text) counter.textContent = text;
      });
    }

    const tools = robot.intent ? [t(`intent.${robot.intent}`)] : [];
    for (const item of robot.utils) {
      const remaining = formatRemaining(item.until, time);
      if (remaining) tools.push(`${t(`utils.${item.key}.name`)} ${remaining} s`);
    }
    const toolText = tools.join(' · ');
    if (score.tools.textContent !== toolText) score.tools.textContent = toolText;
  }
}

export function updateScore(state) {
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
  });
  updateRobotDetails(state);
}
