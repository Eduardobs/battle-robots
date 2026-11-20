import assert from 'node:assert/strict';
import test from 'node:test';
import { decimalSeparator, locale, resolveLanguage, setLanguage, t } from '../../src/i18n.js';
import en from '../../src/locales/en.js';
import es from '../../src/locales/es.js';
import ptBR from '../../src/locales/pt-br.js';

test('resolve a primeira preferência suportada e usa pt-BR como padrão', () => {
  assert.equal(resolveLanguage([undefined, 'fr-FR', 'ES-MX', 'en-US']), 'es');
  assert.equal(resolveLanguage(['EN-GB', 'pt-PT']), 'en');
  assert.equal(resolveLanguage(['pt-PT']), 'pt-br');
  assert.equal(resolveLanguage([]), 'pt-br');
});

test('troca o idioma, o separador decimal e interpola as mensagens', () => {
  setLanguage('en-US');
  assert.equal(locale, 'en');
  assert.equal(decimalSeparator, '.');
  assert.match(t('readyStatus', { count: 1 }), /^1\/2 players ready/);

  setLanguage('pt-BR');
  assert.equal(locale, 'pt-BR');
  assert.equal(decimalSeparator, ',');
  assert.match(t('readyStatus', { count: 2 }), /^2\/2/);
});

test('os três idiomas têm as mesmas chaves e parâmetros de tradução', () => {
  const parameters = message => [...message.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const [code, messages] of Object.entries({ en, es })) {
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(ptBR).sort(), code);
    for (const key of Object.keys(ptBR)) {
      assert.deepEqual(parameters(messages[key]), parameters(ptBR[key]), `${code}: ${key}`);
    }
  }
});
