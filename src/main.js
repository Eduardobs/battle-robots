import { BATTLE_TIME_IN_SECONDS } from '../config.js';
import { createArenaController } from './arena/controller.js';
import { buildBays, resetReady } from './hangar/hangar.js';
import { language, locale, resolveLanguage, setLanguage, t } from './i18n.js';
import { timecode } from './ui/format.js';
import { icon } from './ui/icons.js';

const byId = id => document.getElementById(id);
const stages = ['hangar', 'arena', 'result'];
const languageSelect = byId('language');

document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });

function setStage(stage) {
  for (const id of stages) {
    byId(id).hidden = id !== stage;
    const indicator = byId(`stage-${id}`);
    if (id === stage) indicator.setAttribute('aria-current', 'step');
    else indicator.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  byId(`${stage}-title`).focus({ preventScroll: true });
}

const controller = createArenaController({
  setStage,
  onReset() {
    resetReady();
    setStage('hangar');
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
