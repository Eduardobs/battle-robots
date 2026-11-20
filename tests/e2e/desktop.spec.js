import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1920, height: 1080 } });

async function expectToFit(page) {
  const overflow = await page.evaluate(() => {
    const viewport = document.documentElement;
    return [viewport.scrollWidth - innerWidth, viewport.scrollHeight - innerHeight];
  });
  expect(overflow).toEqual([0, 0]);
}

test('o tooltip de atributo fecha ao sair com o mouse ou mover o foco', async ({ page }) => {
  await page.goto('/');
  const bay = page.locator('.bay').first();
  const slider = bay.locator('#hp-0');
  const tooltip = bay.locator('#tip-hp-0');

  await slider.click();
  await expect(slider).toBeFocused();
  await expect(tooltip).toBeVisible();
  const bounds = await tooltip.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(tooltip).toBeHidden();
  await expect(slider).toBeFocused();

  await slider.hover();
  await expect(tooltip).toBeVisible();
  await bay.locator('.json-toggle').focus();
  await expect(tooltip).toBeHidden();
});

test('o hangar, o editor, a arena e o resultado cabem em Full HD nos três idiomas', async ({ page }) => {
  const locales = [
    ['pt-br', 'Vermelho', 'Vida máxima'],
    ['es', 'Rojo', 'Salud máxima'],
    ['en', 'Red', 'Maximum health'],
  ];
  await page.goto('/');
  const language = page.locator('#language');
  const bay = page.locator('.bay').first();
  for (const [code, name, help] of locales) {
    await language.selectOption(code);
    await expect(bay.getByRole('heading', { name, exact: true })).toBeVisible();
    await bay.locator('#hp-0').focus();
    await expect(bay.getByRole('tooltip').filter({ hasText: help })).toBeVisible();
    await bay.locator('#hp-0').press('Escape');
    await expect(bay.locator('#tip-hp-0')).toBeHidden();
    await expectToFit(page);
  }
  await bay.locator('.json-toggle').click();
  await bay.locator('textarea').fill('{"stats":');
  await bay.locator('[data-json=apply]').click();
  for (const [code] of locales) {
    await language.selectOption(code);
    await expect(bay.locator('textarea')).toHaveValue('{"stats":');
    await expect(bay.locator('.json-status')).toBeVisible();
    await expectToFit(page);
  }
  await bay.locator('.ready-button').click();
  await page.locator('.bay').nth(1).locator('.ready-button').click();
  await page.locator('#pause-battle').click();
  for (const [code, name] of locales) {
    await language.selectOption(code);
    await expect(page.locator('#robot-title-0')).toHaveText(name);
    await expectToFit(page);
  }
  await page.locator('#finish-battle').click();
  for (const [code, name] of locales) {
    await language.selectOption(code);
    await expect(page.locator('#result-score')).toContainText(name);
    await expectToFit(page);
  }
});

test('o histórico mantém a página consultada e acompanha os eventos ao voltar à última', async ({ page }) => {
  await page.goto('/');
  for (const button of await page.locator('.bay .ready-button').all()) await button.click();
  await page.locator('#pause-battle').click();
  const append = count => page.evaluate(async count => {
    const { queueEvent, flushEvents } = await import('/src/arena/event-log.js');
    for (let i = 0; i < count; i++) {
      queueEvent({ time: i, robot: 0, action: 'event.install', item: 'utils.treads.name', damage: null });
    }
    flushEvents();
  }, count);
  await append(180);
  await page.locator('#older-events').click();
  const firstTime = page.locator('#events .event-time').first();
  const pinned = await firstTime.textContent();
  await append(3);
  await expect(firstTime).toHaveText(pinned);
  await page.locator('#language').selectOption('es');
  await expect(page.locator('#events li').first()).toContainText('Orugas de emergencia');
  const region = page.locator('#event-scroll');
  await expect.poll(() => region.evaluate(el => ({
    width: el.scrollWidth - el.clientWidth, height: el.scrollHeight - el.clientHeight,
  }))).toEqual({ width: 0, height: 0 });
  while (await page.locator('#newer-events').isEnabled()) await page.locator('#newer-events').click();
  await append(1);
  await expect(page.locator('#newer-events')).toBeDisabled();
  await expect(page.locator('#events .event-time').last()).toHaveText('00:00,00');
});

test('a configuração máxima permite navegar por todos os equipamentos sem ampliar a tela', async ({ page }) => {
  await page.route('**/config.js', async route => {
    const response = await route.fetch();
    const config = (await response.text())
      .replace(/GUNS_QUANTITY = \d+/, 'GUNS_QUANTITY = 9')
      .replace(/UTILS_QUANTITY = \d+/, 'UTILS_QUANTITY = 5');
    await route.fulfill({ response, body: config });
  });
  await page.goto('/');
  const bay = page.locator('.bay').first();
  const groups = bay.locator('.equipment-group');
  for (const [index, slots] of [9, 5].entries()) {
    const group = groups.nth(index);
    for (let slot = 1; slot < slots; slot++) {
      await group.locator('[data-step="1"]').click();
      await expect(group.locator('select:visible')).toHaveAttribute('data-slot', String(slot));
    }
  }
  await page.locator('#language').selectOption('pt-br');
  await expect(bay.locator('#guns-0-8')).toBeVisible();
  await expect(bay.locator('#utils-0-4')).toBeVisible();
  await expectToFit(page);
  for (const button of await page.locator('.bay .ready-button').all()) await button.click();
  await page.locator('#pause-battle').click();
  const details = page.locator('#robot-details-0');
  const weapons = details.locator('[data-kind="guns"] li');
  await expect(weapons.first()).toBeHidden();
  await details.locator('summary').press('Enter');
  await expect(weapons).toHaveCount(9);
  await expect(weapons.last()).toBeVisible();
  await expectToFit(page);
});
