import { createBattle, STEP } from '../battle.js';
import { t } from '../i18n.js';
import { renderBattleReport } from './battle-report.js';
import { clearEvents, flushEvents, queueEvent, translateEvents } from './event-log.js';
import { createRenderer } from './renderer.js';
import { buildScoreboard, updateRobotDetails, updateScore } from './scoreboard.js';

export function createArenaController({ setStage, onReset }) {
  const byId = id => document.getElementById(id);
  const viewResult = byId('view-result');
  const battleControls = byId('battle-controls');
  const pauseButton = byId('pause-battle');
  const finishButton = byId('finish-battle');
  const render = createRenderer(byId('field'));
  let battle;
  let paused = false;
  let previous;
  let elapsed;
  let nextScore;
  const SCORE_INTERVAL = 0.1;
  const MAX_FRAME_DELAY = 0.1;
  let frameId = 0;

  function updateBattleControls() {
    const finished = Boolean(battle?.state.result);
    battleControls.hidden = !battle || finished;
    viewResult.hidden = !finished;
    byId('battle-status').textContent = t(finished ? 'finished' : paused ? 'paused' : 'intent.fight');
    pauseButton.textContent = t(paused ? 'resumeBattle' : 'pauseBattle');
  }

  function showResult() {
    updateBattleControls();
    renderBattleReport(battle.state);
    setStage('result');
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
      showResult();
    } else {
      frameId = requestAnimationFrame(frame);
    }
  }

  function scheduleFrame() {
    previous = performance.now();
    frameId = requestAnimationFrame(frame);
  }

  function start(loadouts) {
    clearEvents();
    paused = false;
    elapsed = 0;
    nextScore = SCORE_INTERVAL;
    battle = createBattle(loadouts, { onEvent: queueEvent });
    updateBattleControls();
    setStage('arena');
    buildScoreboard();
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
    showResult();
  });

  viewResult.addEventListener('click', showResult);
  byId('view-arena').addEventListener('click', () => {
    setStage('arena');
    render(battle.state);
  });

  byId('reset').addEventListener('click', () => {
    cancelAnimationFrame(frameId);
    battle = undefined;
    paused = false;
    clearEvents();
    onReset();
  });

  function translate() {
    updateBattleControls();
    if (!battle) return;
    buildScoreboard();
    const { state } = battle;
    render(state);
    updateScore(state);
    translateEvents();
    if (state.result) renderBattleReport(state);
  }

  return { start, translate };
}
