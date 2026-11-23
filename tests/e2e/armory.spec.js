import { expect, test } from '@playwright/test';

test('o arsenal ilustra cada encaixe, impede duplicatas e persiste a peça instalada', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const bay = page.locator('.bay').first();
  const field = bay.locator('#guns-0-0');
  const otherGun = await bay.locator('#guns-0-1').inputValue();
  const dialog = page.getByRole('dialog', { name: 'Armory' });

  await bay.getByRole('button', { name: 'Armory', exact: true }).click();
  await expect(dialog.locator(`[data-key="${otherGun}"]`)).toBeDisabled();
  await dialog.getByRole('button', { name: 'Tool 2', exact: true }).click();
  const card = dialog.locator('.part-card:enabled[aria-pressed="false"]').first();
  const key = await card.getAttribute('data-key');
  await card.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(bay.locator('#utils-0-1')).toHaveValue(key);
  await expect(bay.locator('[data-browse="utils-0-1"]')).toBeFocused();
  await expect(bay.locator(`.just-installed [data-item="utils.${key}"]`)).toHaveCount(1);
  await expect(bay.locator('.install-status')).toContainText('Installed');
  await expect(bay.locator('.just-installed image')).toHaveAttribute('href', new RegExp(key + '-hangar.webp$'));
  await expect(page.locator('.bay').nth(1).locator('.just-installed')).toHaveCount(0);

  await page.reload();
  const mount = bay.locator(`[data-item="utils.${key}"]`);
  await mount.press('Enter');
  await expect(dialog.getByRole('button', { name: 'Tool 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator(`[data-key="${key}"]`)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(field).toBeVisible();
  await bay.locator('.ready-button').click();
  await expect(bay.locator('.armory-link')).toBeDisabled();
});
