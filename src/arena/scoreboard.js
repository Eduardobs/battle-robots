import { attributes, equipmentCatalogs, pilots } from '../catalog.js';
import { decimalSeparator, numberFormat, t } from '../i18n.js';
import { formatHP, timecode } from '../ui/format.js';
import { icon } from '../ui/icons.js';

let scores = [];
let countdown;
let displayedSeconds;

function scorePanel(pilot, id) {
  const stats = attributes.map(attr => `<div><dt>${icon(attr.icon)} ${t(`attr.${attr.id}.name`)}</dt><dd></dd></div>`).join('');
  return `<section class="score ${pilot.className}" aria-labelledby="robot-title-${id}"><div><h2 id="robot-title-${id}">${pilot.name}</h2><span class="score-hp"></span></div>
    <div class="hp-track"><i></i></div><div class="score-tools"></div>
    <div class="robot-details" id="robot-details-${id}">
      <ul class="battle-statuses"><li></li><li>${t('status.locked')}</li><li>${t('status.frozen')}</li></ul>
      <div class="battle-detail-groups">
        <div><h3>${t('attributes')}</h3><dl class="battle-stats">${stats}</dl></div>
        <div><h3>${t('weapon')}</h3><ol class="battle-slots" data-kind="guns"></ol></div>
        <div><h3>${t('tool')}</h3><ol class="battle-slots" data-kind="utils"></ol></div>
      </div></div></section>`;
}

export function buildScoreboard() {
  document.getElementById('scoreboard').innerHTML = `${scorePanel(pilots[0], 0)}
    <div class="timer"><span class="eyebrow">${t('remainingTime')}</span><strong id="countdown"></strong></div>
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
  group.list.innerHTML = items.map(({ key, expires }) => `<li>
    ${icon(equipmentCatalogs[kind][key].icon)} <span>${t(`${kind}.${key}.name`)}${expires
      ? ` <small class="drop-bonus">${t('dropBonus')}</small>` : ''}</span>${kind === 'guns'
      ? '<span class="weapon-cooldown"></span>' : ''}</li>`).join('') || '<li>—</li>';
  if (kind === 'guns') group.counters = group.list.querySelectorAll('.weapon-cooldown');
}

export function updateRobotDetails({ robots, time, result }) {
  for (const robot of robots) {
    const score = scores[robot.id];
    const burns = robot.burns.length;
    if (score.burns !== burns) {
      score.burns = burns;
      score.statuses[0].textContent = `${t('status.burned')} ×${burns}`;
      score.statuses[0].classList.toggle('inactive', burns === 0);
    }
    score.statuses[1].classList.toggle('inactive', robot.lockedUntil <= time + 1e-8);
    score.statuses[2].classList.toggle('inactive', robot.frozenUntil <= time + 1e-8);

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
    updateEquipment(score.utils, robot.utils, 'utils');
    updateEquipment(score.guns, robot.guns, 'guns');
    score.guns.counters.forEach((counter, index) => {
      const remaining = result ? 0 : Math.round((robot.guns[index].ready - time) * 100);
      const text = remaining > 0 ? (remaining / 100).toFixed(2).replace('.', decimalSeparator) : '';
      if (counter.textContent !== text) counter.textContent = text;
    });
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
    const tools = [
      robot.intent && t(`intent.${robot.intent}`),
      ...robot.utils.filter(item => item.until > state.time).map(item => t(`utils.${item.key}.name`)),
    ].filter(Boolean).join(' · ');
    if (score.tools.textContent !== tools) score.tools.textContent = tools;
  });
  updateRobotDetails(state);
}
