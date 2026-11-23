import { expect, test } from '@playwright/test';

test('o placar acompanha a troca de arma no mesmo slot e o fim de um bônus', async ({ page }) => {
  await page.goto('/');
  const snapshots = await page.evaluate(async () => {
    const { buildScoreboard, updateScore } = await import('./src/arena/scoreboard.js');
    const { createBattle } = await import('./src/battle.js');
    const { loadouts } = await import('./src/hangar/loadouts.js');
    const { state } = createBattle(loadouts);
    const robot = state.robots[0];
    buildScoreboard();
    const panel = document.getElementById('robot-details-0');

    function snapshot() {
      updateScore(state);
      const weapon = panel.querySelector('[data-kind="guns"] li');
      return {
        sprites: [...panel.closest('.score').querySelectorAll('.score-armament img')].map(img => new URL(img.src).pathname.split('/').pop()),
        weapon: weapon.textContent.trim().replace(/\s+/g, ' '),
        cooldown: weapon.querySelector('.weapon-cooldown')?.textContent,
        bonus: panel.querySelector('.battle-stats .drop-bonus')?.textContent,
      };
    }

    robot.guns = [{ key: 'pistol', ready: 2, expires: 5 }];
    robot.stats.attack = robot.baseStats.attack + 1;
    robot.boosts.attack = 5;
    const initial = snapshot();
    state.time = 5;
    robot.guns.splice(0, 1, { key: 'nitrogen', ready: 6, expires: 15 });
    robot.stats.attack = robot.baseStats.attack;
    delete robot.boosts.attack;
    const replacement = snapshot();
    robot.guns.length = 0;
    return [initial, replacement, snapshot()];
  });

  expect(snapshots.map(snapshot => snapshot.sprites)).toEqual([['pistol-arena.webp'], ['nitrogen-arena.webp'], []]);
  expect(snapshots[0].weapon).toContain('Pistol');
  expect(snapshots[0].cooldown).toBe('2.00');
  expect(snapshots[0].bonus).toContain('+1');
  expect(snapshots[1].weapon).toContain('Liquid nitrogen');
  expect(snapshots[1].cooldown).toBe('1.00');
  expect(snapshots[1].bonus).toBeUndefined();
  expect(snapshots[2].weapon).toBe('—');
  expect(snapshots[2].cooldown).toBeUndefined();
});

test('o placar exibe a duração dos status e o tempo até reutilizar cada ferramenta', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { buildScoreboard, updateScore } = await import('./src/arena/scoreboard.js');
    const { createBattle } = await import('./src/battle.js');
    const { loadouts } = await import('./src/hangar/loadouts.js');
    const { setLanguage } = await import('./src/i18n.js');
    const { state } = createBattle(loadouts);
    setLanguage('pt-br');
    const robot = state.robots[0];
    robot.burns = [{ until: 2 }, { until: 3 }];
    robot.lockedUntil = 1.5;
    robot.frozenUntil = 2.5;
    robot.guns = [{ key: 'hammer', ready: 0 }];
    robot.utils = [{ key: 'shield', until: 3, ready: 20 }, { key: 'nitro', until: 0, ready: 0 }];
    state.time = 1;
    buildScoreboard();
    updateScore(state);
    window.advanceScoreboard = () => {
      state.time = 3;
      robot.burns = [];
      updateScore(state);
    };
  });

  const score = page.locator('.score').first();
  const details = score.locator('.robot-details');
  await details.evaluate(panel => { panel.open = true; });
  const statuses = score.locator('.battle-statuses li');
  const cooldowns = details.locator('.tool-cooldown');
  await expect(statuses).toHaveText(['Queimado ×2 2,00 s', 'Travado 0,50 s', 'Congelado 1,50 s']);
  await expect(score.locator('.score-tools')).toHaveText('Escudo 2,00 s');
  await expect(cooldowns.first()).toHaveText('19,00');
  await expect(cooldowns.last()).toBeHidden();
  await expect(details.locator('[data-kind="guns"] li')).toHaveText('Marreta');

  await page.evaluate(() => window.advanceScoreboard());
  await expect(score.locator('.battle-statuses li:visible')).toHaveCount(0);
  await expect(score.locator('.score-tools')).toBeEmpty();
  await expect(cooldowns.first()).toHaveText('17,00');
});
