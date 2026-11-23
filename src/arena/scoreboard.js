import { attributes, pilots } from '../catalog.js';
import { decimalSeparator, numberFormat, t } from '../i18n.js';
import { formatHP, timecode } from '../ui/format.js';
import { spriteUrl } from '../ui/equipment-art.js';
import { highlight } from '../ui/feedback.js';
import { icon } from '../ui/icons.js';

let scores = [];
let countdown;
let displayedSeconds;

export function modeScoreText({ mode, modeState }, robot) {
  if (mode === 'medals') return t('medalScore', { count: robot.report.drops.medal });
  if (mode === 'king') return t('kingScore', { score: modeState.scores[robot.id], target: modeState.target });
  if (mode === 'ctf') return t('ctfScore', { score: modeState.captures[robot.id], target: modeState.target });
  if (mode === 'charge') return t('chargeScore', { score: modeState.points[robot.id], target: modeState.target });
  if (mode === 'race') {
    const { laps, nextPortal } = modeState.progress[robot.id];
    return t('raceScore', { laps, target: modeState.target, portals: nextPortal });
  }
  return '';
}

function scorePanel(pilot, id, mode) {
  const stats = attributes.map(attr => `<div><dt>${icon(attr.icon)} ${t(`attr.${attr.id}.name`)}</dt><dd></dd></div>`).join('');
  const detailsOpen = document.getElementById(`robot-details-${id}`)?.open;
  const scoreClass = mode === 'medals' ? 'medal-score mode-score' : 'mode-score';
  return `<section class="score ${pilot.className}" aria-labelledby="robot-title-${id}"><div><h2 id="robot-title-${id}">${t(pilot.nameKey)}</h2><span class="score-armament" role="group" aria-label="${t('weapon')}"></span><span class="score-hp"></span></div>
    <div class="hp-track"><i></i></div>
    ${mode !== 'battle' ? `<strong class="${scoreClass}"></strong>` : ''}
    <div class="score-tools"></div>
    <ul class="battle-statuses"><li></li><li></li><li></li></ul>
    <details class="robot-details" id="robot-details-${id}"${detailsOpen ? ' open' : ''}>
      <summary>${t('robotDetails')}</summary>
      <div class="battle-detail-groups">
        <div><h3>${t('attributes')}</h3><dl class="battle-stats">${stats}</dl></div>
        <div><h3>${t('weapon')}</h3><ol class="battle-slots" data-kind="guns"></ol></div>
        <div><h3>${t('tool')}</h3><ol class="battle-slots" data-kind="utils"></ol></div>
      </div></details></section>`;
}

export function buildScoreboard(mode = 'battle') {
  document.getElementById('scoreboard').innerHTML = `${scorePanel(pilots[0], 0, mode)}
    <div class="timer"><span class="timer-label eyebrow">${icon('clock')} ${t('remainingTime')}</span><strong id="countdown"></strong></div>
    ${scorePanel(pilots[1], 1, mode)}`;
  countdown = document.getElementById('countdown');
  displayedSeconds = undefined;
  scores = [...document.querySelectorAll('.score')].map(score => ({
    statuses: score.querySelector('.battle-statuses').children,
    modeScore: score.querySelector('.mode-score'),
    stats: [...score.querySelectorAll('.battle-stats dd')].map((field, index) => ({ field, id: attributes[index].id })),
    guns: { list: score.querySelector('[data-kind="guns"]'), strip: score.querySelector('.score-armament') },
    utils: { list: score.querySelector('[data-kind="utils"]') },
    hp: score.querySelector('.score-hp'), bar: score.querySelector('.hp-track i'), tools: score.querySelector('.score-tools'),
  }));
}

function updateEquipment(group, items, kind) {
  if (group.items?.length === items.length && items.every((item, i) => item === group.items[i])) return;
  group.items = [...items];
  if (group.strip) {
    group.strip.innerHTML = items.map(({ key }) => {
      const name = t(`guns.${key}.name`);
      return `<img src="${spriteUrl(key, 'arena')}" width="18" height="18" alt="${name}" title="${name}">`;
    }).join('');
  }
  const counterClass = kind === 'guns' ? 'weapon-cooldown' : 'tool-cooldown';
  const counterTip = t(kind === 'guns' ? 'cooldownTip' : 'toolCooldownTip');
  group.list.innerHTML = items.map(({ key, expires }) => `<li>
    <img class="slot-sprite" src="${spriteUrl(key, 'arena')}" width="18" height="18" alt=""> <span>${t(`${kind}.${key}.name`)}${expires
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

export function updateRobotDetails(state) {
  const { robots, time, result, mode, modeState } = state;
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

    const tools = [];
    if (robot.respawnAt > time) {
      tools.push(t('respawnIn', { time: formatRemaining(robot.respawnAt, time) || `0${decimalSeparator}00` }));
    } else {
      const intent = robot.intent === 'drop' && robot.goal?.type === 'medal' ? 'medal' : robot.intent;
      if (intent) tools.push(t(`intent.${intent}`));
      if (mode === 'ctf' && modeState.flags[1 - robot.id].carrier === robot.id) {
        tools.push(t('carryingFlag'));
      } else if (mode === 'charge' && modeState.core.carrier === robot.id) {
        const left = formatRemaining(time + modeState.core.timer, time) || `0${decimalSeparator}00`;
        tools.push(t('carryingCore', { time: left }));
      } else if (mode === 'king' && modeState.zone.contested) {
        tools.push(t('zoneContested'));
      }
      for (const item of robot.utils) {
        const remaining = formatRemaining(item.until, time);
        if (remaining) tools.push(`${t(`utils.${item.key}.name`)} ${remaining} s`);
      }
    }
    const toolText = tools.join(' · ');
    if (score.tools.textContent !== toolText) score.tools.textContent = toolText;
  }
}

export function updateScore(state) {
  const seconds = Math.ceil(state.duration - state.time);
  if (displayedSeconds !== seconds) {
    displayedSeconds = seconds;
    countdown.parentElement.classList.toggle('is-urgent', seconds <= 10);
    countdown.textContent = timecode(seconds);
  }
  state.robots.forEach((robot, id) => {
    const score = scores[id];
    if (score.modeScore) {
      const text = modeScoreText(state, robot);
      if (score.modeScoreText !== text) {
        score.modeScoreText = text;
        score.modeScore.textContent = text;
      }
    }
    if (score.currentHP !== robot.hp || score.maxHP !== robot.stats.hp) {
      if (robot.hp < score.currentHP) highlight(score.hp);
      score.currentHP = robot.hp;
      score.maxHP = robot.stats.hp;
      score.hp.textContent = t('hpScore', {
        current: formatHP(robot.hp), max: numberFormat.format(robot.stats.hp), unit: t('hpUnit'),
      });
      score.bar.style.transform = `scaleX(${robot.hp / robot.stats.hp})`;
    }
  });
  updateRobotDetails(state);
}
