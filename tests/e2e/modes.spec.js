import { expect, test } from '@playwright/test';

const newModes = [
  ['king', 'Rei da arena', /Pontos · \d+\/30/],
  ['ctf', 'Capture a bandeira', /Capturas · \d+\/2/],
  ['charge', 'Carga instável', /Pontos · \d+\/3/],
  ['race', 'Corrida de portais', /Voltas · \d+\/3 · Portais \d\/3/],
];

test('os quatro novos modos aparecem no hangar, no placar, no resumo e cabem em Full HD', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.clock.install();
  await page.goto('/');
  await page.locator('#language').selectOption('pt-br');

  for (const [modeId, modeLabel, scorePattern] of newModes) {
    const select = page.locator('#game-mode');
    await select.selectOption(modeId);
    await expect(select).toHaveValue(modeId);
    await expect(page.locator('#mode-rules')).not.toBeEmpty();

    for (const button of await page.locator('.bay .ready-button').all()) await button.click();
    await expect(page.locator('#arena')).toBeVisible();
    await page.clock.runFor(600);

    const scoreItems = page.locator('#scoreboard .mode-score');
    await expect(scoreItems).toHaveCount(2);
    await expect(scoreItems.nth(0)).toHaveText(scorePattern);
    await expect(scoreItems.nth(1)).toHaveText(scorePattern);

    const arenaOverflow = await page.evaluate(() => [
      document.documentElement.scrollWidth - innerWidth,
      document.documentElement.scrollHeight - innerHeight,
    ]);
    expect(arenaOverflow).toEqual([0, 0]);

    await page.locator('#finish-battle').click();
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#result-reason')).toContainText(modeLabel);
    await expect(page.locator('#result-score .mode-score')).toHaveCount(2);

    const resultOverflow = await page.evaluate(() => [
      document.documentElement.scrollWidth - innerWidth,
      document.documentElement.scrollHeight - innerHeight,
    ]);
    expect(resultOverflow).toEqual([0, 0]);

    await page.locator('#reset').click();
    await expect(page.locator('#hangar')).toBeVisible();
  }
});
