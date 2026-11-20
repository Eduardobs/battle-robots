import { BATTLE_TIME_IN_SECONDS } from '../config.js';
import { createArenaController } from './arena/controller.js';
import { buildBays, resetReady } from './hangar/hangar.js';
import { language, locale, resolveLanguage, setLanguage, t } from './i18n.js';
import { timecode } from './ui/format.js';
import { icon } from './ui/icons.js';

const byId = id => document.getElementById(id);
const hangar = byId('hangar');
const arena = byId('arena');
const languageSelect = byId('language');

document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });

function setStage(inBattle) {
  hangar.hidden = inBattle;
  arena.hidden = !inBattle;
  byId('stage-hangar').removeAttribute('aria-current');
  byId('stage-arena').removeAttribute('aria-current');
  byId(inBattle ? 'stage-arena' : 'stage-hangar').setAttribute('aria-current', 'step');
  window.scrollTo(0, 0);
}

const controller = createArenaController({
  onStart: () => setStage(true),
  onReset() {
    resetReady();
    setStage(false);
    const title = byId('hangar-title');
    title.setAttribute('tabindex', '-1');
    title.focus({ preventScroll: true });
  },
});

function applyLanguage(code) {
  setLanguage(code);
  document.documentElement.lang = locale;
  languageSelect.value = language;
  document.querySelectorAll('[data-t]').forEach(element => { element.textContent = t(element.dataset.t); });
  document.querySelectorAll('[data-t-label]').forEach(element => {
    element.setAttribute('aria-label', t(element.dataset.tLabel));
  });
  document.querySelectorAll('[data-t-title]').forEach(element => { element.title = t(element.dataset.tTitle); });
  document.querySelector('meta[name="description"]').content = t('description');
  languageSelect.setAttribute('aria-label', t('language'));
  byId('match-length').textContent = t('matchLength', { time: timecode(BATTLE_TIME_IN_SECONDS) });
  buildBays(controller.start);
  controller.translate();
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
