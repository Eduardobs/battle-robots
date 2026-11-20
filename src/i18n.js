import ptBR from './locales/pt-br.js';
import en from './locales/en.js';
import es from './locales/es.js';

const messages = { 'pt-br': ptBR, en, es };
const locales = { 'pt-br': 'pt-BR', en: 'en', es: 'es' };

export function resolveLanguage(preferences) {
  for (const preference of preferences) {
    const code = preference?.toLowerCase();
    if (Object.hasOwn(messages, code)) return code;
    const base = code?.split('-')[0];
    if (base === 'pt') return 'pt-br';
    if (Object.hasOwn(messages, base)) return base;
  }
  return 'pt-br';
}

export let language = 'pt-br';
export let locale = locales[language];
export let numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
export let decimalSeparator = ',';
export let damageFormat = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function setLanguage(code) {
  language = resolveLanguage([code]);
  locale = locales[language];
  numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  decimalSeparator = numberFormat.formatToParts(0.1).find(part => part.type === 'decimal').value;
  damageFormat = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function t(key, values = {}) {
  return messages[language][key].replace(/\{(\w+)\}/g, (_, name) => values[name]);
}
