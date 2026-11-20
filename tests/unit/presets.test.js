import assert from 'node:assert/strict';
import test from 'node:test';
import { attributes, equipmentCatalogs, guns, utils } from '../../src/catalog.js';
import { remaining, validateConfiguration } from '../../src/hangar/loadouts.js';
import { createPreset, presets } from '../../src/hangar/presets.js';

test('todas as predefinições são compatíveis com a configuração padrão', () => {
  const configs = Object.keys(presets).map(key => createPreset(key));
  assert.ok(configs.length >= 5);
  assert.equal(new Set(configs.map(config => config.strategy)).size, configs.length);
  for (const config of configs) {
    assert.deepEqual(validateConfiguration(config), config);
    assert.equal(remaining(config), 0);
  }
});

test('as predefinições respeitam orçamentos e quantidades de equipamento diferentes', () => {
  const base = 17;
  for (const key of Object.keys(presets)) {
    for (const points of [0, 1, 203, 5001]) {
      for (const gunCount of [0, 1, Object.keys(guns).length]) {
        for (const toolCount of [0, 1, Object.keys(utils).length]) {
          const config = createPreset(key, { points, base, gunCount, toolCount });
          assert.deepEqual(Object.keys(config.stats), attributes.map(({ id }) => id));
          const values = Object.values(config.stats);
          assert.ok(values.every(value => Number.isInteger(value) && value >= base));
          assert.equal(values.reduce((total, value) => total + value - base, 0), points);
          assert.ok(config.stats.speed <= base + 100);
          if (points === 5001) assert.equal(config.stats.speed, base + 100);
          for (const [kind, count] of [['guns', gunCount], ['utils', toolCount]]) {
            assert.equal(config[kind].length, count);
            assert.equal(new Set(config[kind]).size, count);
            assert.ok(config[kind].every(item => Object.hasOwn(equipmentCatalogs[kind], item)));
          }
          if (!gunCount) assert.equal(config.stats.attack, base);
          if (!config.guns.some(weapon => guns[weapon].projectileSpeed)) {
            assert.equal(config.stats.projectileSpeed, base);
          }
        }
      }
    }
  }
});

test('a velocidade mantém a proporção original até chegar ao limite de pontos', () => {
  const config = points => createPreset('brawler', { points, base: 10, gunCount: 2 });
  assert.equal(config(1000).stats.speed, 100);
  assert.equal(config(1111).stats.speed, 110);
  assert.equal(config(1112).stats.speed, 110);
});
