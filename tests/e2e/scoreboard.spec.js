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

  expect(snapshots[0].weapon).toContain('Pistol');
  expect(snapshots[0].cooldown).toBe('2.00');
  expect(snapshots[0].bonus).toContain('+1');
  expect(snapshots[1].weapon).toContain('Liquid nitrogen');
  expect(snapshots[1].cooldown).toBe('1.00');
  expect(snapshots[1].bonus).toBeUndefined();
  expect(snapshots[2].weapon).toBe('—');
  expect(snapshots[2].cooldown).toBeUndefined();
});
