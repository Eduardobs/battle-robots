import { expect, test } from '@playwright/test';

test('o botão alterna os dois temas pelo teclado e preserva a escolha do jogador', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const theme = page.getByRole('button', { name: 'Dark theme' });
  const root = page.locator('html');
  await expect(theme).toHaveAttribute('aria-pressed', 'false');
  await expect(root).toHaveCSS('color-scheme', 'light');
  await theme.press('Space');
  await expect(theme).toHaveAttribute('aria-pressed', 'true');
  await expect(root).toHaveCSS('color-scheme', 'dark');
  const darkPanel = await page.locator('.bay').first().evaluate(el => getComputedStyle(el).backgroundColor);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expect(theme).toHaveAttribute('aria-pressed', 'true');
  await expect(root).toHaveCSS('color-scheme', 'dark');
  await page.locator('#language').selectOption('pt-br');
  const toggle = page.getByRole('button', { name: 'Tema escuro' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.armory-link').first().click();
  await expect(page.locator('.part-card').first()).toHaveCSS('background-color', darkPanel);
  await page.keyboard.press('Escape');
  for (const button of await page.locator('.bay .ready-button').all()) await button.click();
  await page.locator('#pause-battle').click();
  const timer = await page.locator('#countdown').textContent();
  await toggle.click();
  await expect(root).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('#arena')).toHaveAttribute('data-state', 'paused');
  await expect(page.locator('#countdown')).toHaveText(timer);
  await page.locator('#finish-battle').click();
  await toggle.press('Enter');
  await expect(page.locator('.report-panel').first()).toHaveCSS('background-color', darkPanel);
});
