import { expect, test } from '@playwright/test';
import { ATTRIBUTES_BASE, ATTRIBUTES_POINTS, GUNS_QUANTITY, UTILS_QUANTITY } from '../../config.js';

test('o hangar aplica o orçamento de atributos e restaura as escolhas após recarregar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const bay = page.locator('.bay').first();
  const hp = bay.getByRole('slider', { name: /^HP\b/ });
  const defense = bay.locator('#defense-0');
  const strategy = bay.locator('#strategy-0-0');
  const budget = bay.locator('.budget output');

  await expect(hp).toHaveValue(String(ATTRIBUTES_BASE));
  await expect(budget).toHaveText(String(ATTRIBUTES_POINTS));

  const maxHP = ATTRIBUTES_BASE + ATTRIBUTES_POINTS;
  const track = await hp.boundingBox();
  await page.mouse.move(track.x + 7, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2, { steps: 5 });
  await page.mouse.up();
  const draggedHP = Number(await hp.inputValue());
  expect(draggedHP).toBeGreaterThan(ATTRIBUTES_BASE);
  expect(draggedHP).toBeLessThan(maxHP);
  await expect(budget).toHaveText(String(maxHP - draggedHP));

  await hp.press('End');
  await expect(hp).toHaveValue(String(maxHP));
  await expect(bay.locator('[data-attribute="hp"] .attribute-value')).toHaveValue(String(maxHP));
  await expect(budget).toHaveText('0');
  await expect(defense).toHaveAttribute('max', String(ATTRIBUTES_BASE));
  await expect(defense).toBeDisabled();
  await hp.press('ArrowLeft');
  await expect(budget).toHaveText('1');
  await expect(defense).toBeEnabled();
  await defense.press('ArrowRight');
  await expect(budget).toHaveText('0');
  await expect(hp).toHaveAttribute('max', String(maxHP - 1));
  await strategy.selectOption('flank');

  await page.reload();
  await expect(hp).toHaveValue(String(maxHP - 1));
  await expect(defense).toHaveValue(String(ATTRIBUTES_BASE + 1));
  await expect(strategy).toHaveValue('flank');
  await expect(budget).toHaveText('0');
  await expect(bay.getByRole('button', { name: 'Ready', exact: true })).toBeEnabled();
});

test('o hangar aceita valores digitados e os sincroniza com os sliders', async ({ page }) => {
  await page.goto('/');
  const bay = page.locator('.bay').first();
  const hp = bay.getByRole('spinbutton', { name: /^HP value/ });
  const slider = bay.getByRole('slider', { name: /^HP\b/ });
  const max = ATTRIBUTES_BASE + ATTRIBUTES_POINTS;

  await hp.fill(String(max + 1));
  await hp.press('Enter');
  await expect(hp).toHaveValue(String(max));
  await expect(slider).toHaveValue(String(max));
  await expect(bay.locator('.budget output')).toHaveText('0');

  await slider.press('ArrowLeft');
  await expect(hp).toHaveValue(String(max - 1));
  await hp.fill('');
  await hp.press('Tab');
  await expect(hp).toHaveValue(String(max - 1));

  await hp.fill(String(ATTRIBUTES_BASE + 1));
  await hp.press('Tab');
  await expect(slider).toHaveValue(String(ATTRIBUTES_BASE + 1));
  await page.reload();
  await expect(hp).toHaveValue(String(ATTRIBUTES_BASE + 1));
  await bay.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(hp).toBeDisabled();
});

test('o hangar distribui e limpa os pontos de cada robô', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('.bay').first();
  const second = page.locator('.bay').nth(1);
  const clear = first.getByRole('button', { name: 'Clear points' });
  const randomize = first.getByRole('button', { name: 'Distribute points randomly' });
  const firstHP = first.locator('#hp-0');
  const secondHP = second.locator('#hp-1');
  const hp = ATTRIBUTES_BASE + 1;

  await expect(clear).toBeDisabled();
  await firstHP.press('ArrowRight');
  await secondHP.press('ArrowRight');
  await randomize.click();
  await expect(first.locator('.budget output')).toHaveText('0');
  await expect(randomize).toBeDisabled();
  const stats = await first.locator('.attribute input[type="range"]').evaluateAll(inputs =>
    inputs.map(input => Number(input.value)));
  expect(stats[0]).toBeGreaterThanOrEqual(hp);
  expect(stats.reduce((sum, value) => sum + value - ATTRIBUTES_BASE, 0)).toBe(ATTRIBUTES_POINTS);

  await page.reload();
  await expect(first.locator('.budget output')).toHaveText('0');
  await first.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(clear).toBeDisabled();
  await expect(firstHP).toBeDisabled();
  await first.getByRole('button', { name: 'Edit loadout', exact: true }).click();
  await expect(firstHP).toBeEnabled();
  await clear.click();
  await expect(first.locator('.budget output')).toHaveText(String(ATTRIBUTES_POINTS));
  await expect(secondHP).toHaveValue(String(hp));
  await page.reload();
  await expect(firstHP).toHaveValue(String(ATTRIBUTES_BASE));
  await expect(clear).toBeDisabled();
});

test('o hangar valida JSON e permite baixar a configuração aplicada', async ({ page }) => {
  await page.goto('/');
  const bay = page.locator('.bay').first();
  await bay.getByText('JSON configuration', { exact: true }).click();
  const input = bay.getByRole('textbox', { name: 'Paste the configuration JSON' });
  const apply = bay.getByRole('button', { name: 'Apply JSON' });
  const hp = bay.locator('#hp-0');
  const projectileSpeed = bay.getByRole('slider', { name: 'Projectile speed for Red' });
  const power = bay.getByRole('slider', { name: 'Power for Red' });
  const status = bay.locator('.loadout-json').getByRole('status');
  await expect(bay.locator('#evasion-0, #aim-0')).toHaveCount(0);

  await input.fill('{');
  await apply.click();
  await expect(status).toContainText('Invalid JSON');
  await expect(hp).toHaveValue(String(ATTRIBUTES_BASE));

  const config = {
    stats: {
      hp: ATTRIBUTES_BASE + ATTRIBUTES_POINTS - 2,
      defense: ATTRIBUTES_BASE,
      attack: ATTRIBUTES_BASE,
      speed: ATTRIBUTES_BASE,
    },
    guns: ['pistol', 'flame', 'saw', 'hammer', 'hook'].slice(0, GUNS_QUANTITY),
    utils: ['nitro', 'shield'].slice(0, UTILS_QUANTITY),
    strategy: 'flank',
  };
  await input.fill(JSON.stringify({ ...config, stats: { ...config.stats, hp: config.stats.hp + 3 } }));
  await apply.click();
  await expect(status).toContainText('Invalid JSON');
  await expect(hp).toHaveValue(String(ATTRIBUTES_BASE));

  const legacyStats = { ...config.stats, evasion: ATTRIBUTES_BASE + 1, aim: ATTRIBUTES_BASE + 1 };
  await input.fill(JSON.stringify({ ...config, stats: legacyStats }));
  await apply.click();
  await expect(status).toHaveText('Configuration loaded.');
  await expect(hp).toHaveValue(String(config.stats.hp));
  await expect(bay.locator('#strategy-0-0')).toHaveValue(config.strategy);
  await expect(projectileSpeed).toHaveValue(String(ATTRIBUTES_BASE));
  await expect(power).toHaveValue(String(ATTRIBUTES_BASE));

  await hp.press('ArrowLeft');
  await projectileSpeed.press('ArrowRight');
  await power.press('ArrowRight');
  await page.reload();
  await expect(projectileSpeed).toHaveValue(String(ATTRIBUTES_BASE + 1));
  await expect(power).toHaveValue(String(ATTRIBUTES_BASE + 1));
  await expect(bay.locator('.budget output')).toHaveText('1');
  await bay.getByText('JSON configuration', { exact: true }).click();

  const downloadEvent = page.waitForEvent('download');
  await bay.getByRole('button', { name: /Download JSON/ }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString('utf8'))).toEqual({
    ...config,
    stats: { ...config.stats, hp: config.stats.hp - 1, projectileSpeed: ATTRIBUTES_BASE + 1, power: ATTRIBUTES_BASE + 1 },
  });
});

test('o idioma escolhido é aplicado ao hangar e persiste após recarregar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Combat hangar' })).toBeVisible();
  await page.locator('#language').selectOption('pt-br');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await page.reload();
  await expect(page.locator('#language')).toHaveValue('pt-br');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
});

test('dois jogadores confirmam, veem o resultado e voltam ao hangar', async ({ page }) => {
  await page.route('**/config.js', async route => {
    const response = await route.fetch();
    const config = await response.text();
    await route.fulfill({
      response,
      body: config.replace(/BATTLE_TIME_IN_SECONDS = [^;]+;/, 'BATTLE_TIME_IN_SECONDS = 2;'),
    });
  });
  await page.clock.install();
  await page.goto('/');
  const bays = page.locator('.bay');
  const first = bays.nth(0);
  const second = bays.nth(1);
  const hangar = page.locator('#hangar');
  const arena = page.locator('#arena');

  await first.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(first.getByRole('button', { name: 'Edit loadout' })).toHaveAttribute('aria-pressed', 'true');
  await expect(first.locator('#hp-0')).toBeDisabled();
  await expect(hangar).toBeVisible();
  await expect(arena).toBeHidden();

  await second.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(hangar).toBeHidden();
  await expect(arena).toBeVisible();
  await expect(arena.getByRole('img')).toBeVisible();
  await expect(arena.locator('#events')).toContainText('Battle started');

  await page.clock.runFor(2200);
  await expect(arena.locator('#countdown')).toHaveText('00:00');
  await expect(arena.locator('#result-reason')).toHaveText('Time up');
  await expect(arena.locator('#result-title')).toBeFocused();
  await expect(arena.locator('#events')).toContainText('Battle time expired');

  await arena.getByRole('button', { name: 'Back to the hangar' }).click();
  await expect(hangar).toBeVisible();
  await expect(arena).toBeHidden();
  await expect(hangar.getByRole('button', { name: 'Ready', exact: true })).toHaveCount(2);
  await expect(first.locator('#hp-0')).toBeEnabled();
});

test('a batalha pode ser pausada, retomada e encerrada durante a pausa', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const ready = page.getByRole('button', { name: 'Ready', exact: true });
  await ready.first().click();
  await ready.first().click();

  const countdown = page.locator('#countdown');
  const events = page.locator('#events');
  const pause = page.getByRole('button', { name: 'Pause battle' });
  const resume = page.getByRole('button', { name: 'Resume battle' });
  await pause.click();
  await expect(resume).toBeFocused();
  await expect(page.locator('#battle-status')).toHaveText('Battle paused');
  const pausedTime = await countdown.textContent();
  const pausedEvents = await events.textContent();

  await page.clock.runFor(2500);
  await expect(countdown).toHaveText(pausedTime);
  await expect(events).toHaveText(pausedEvents);

  await resume.click();
  await page.clock.runFor(1250);
  await expect(countdown).not.toHaveText(pausedTime);

  await pause.click();
  const finalTime = await countdown.textContent();
  await page.getByRole('button', { name: 'End battle' }).click();
  await expect(page.locator('#result-reason')).toHaveText('Ended manually');
  await expect(page.locator('#result-title')).toBeFocused();
  await expect(events).toContainText('Battle ended manually');
  await expect(resume).toBeHidden();
  await page.clock.runFor(2500);
  await expect(countdown).toHaveText(finalTime);
});

test('o cooldown aparece ao lado do golpe de cada robô e acompanha o tempo da batalha', async ({ page }) => {
  const startTime = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({ time: startTime });
  await page.clock.pauseAt(new Date(startTime.getTime() + 1000));
  await page.addInitScript(() => {
    let seed = 3;
    Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
  });
  await page.goto('/');
  await page.locator('#language').selectOption('pt-br');
  for (const id of [0, 1]) {
    const speed = page.locator(`[data-attribute="speed"] input[type="number"]`).nth(id);
    await speed.fill(String(ATTRIBUTES_BASE + 100));
    await speed.press('Enter');
  }
  const ready = page.getByRole('button', { name: 'Pronto', exact: true });
  await ready.first().press('Enter');
  await ready.first().press('Enter');

  const red = page.locator('#robot-details-0 li').filter({ hasText: 'Lança-chamas' }).locator('.weapon-cooldown');
  const blue = page.locator('#robot-details-1 li').filter({ hasText: 'Pistola' }).locator('.weapon-cooldown');
  await expect(red).toBeHidden();
  await expect(blue).toBeHidden();

  await page.clock.runFor(1600);
  await expect(blue).toHaveText(/^1,0\d$/);
  await page.clock.runFor(100);
  await expect(blue).toHaveText(/^0,\d{2}$/);
  await expect(red).toBeHidden();
  await page.locator('#pause-battle').press('Enter');
  const pausedCooldown = await blue.textContent();
  await page.clock.runFor(500);
  await expect(blue).toHaveText(pausedCooldown);

  await page.locator('#pause-battle').press('Enter');
  await page.clock.runFor(150);
  await expect(blue).toHaveText(/^0,\d{2}$/);
  expect(await blue.textContent()).not.toBe(pausedCooldown);

  for (let tick = 0; tick < 100 && !await red.textContent(); tick++) {
    await page.clock.runFor(100);
  }
  await expect(red).toHaveText(/^0,\d{2}$/);
  await page.locator('#finish-battle').press('Enter');
  await expect(red).toBeHidden();
  await expect(blue).toBeHidden();
});

test('os efeitos simultâneos preservam as dimensões do placar e da arena', async ({ page }) => {
  await page.goto('/');
  const ready = page.getByRole('button', { name: 'Ready', exact: true });
  await ready.first().click();
  await ready.first().click();
  await page.locator('#pause-battle').click();

  const layout = page.locator('.score, .arena-frame');
  const bounds = () => layout.evaluateAll(elements => elements.map(element => {
    const { y, height } = element.getBoundingClientRect();
    return { y, height };
  }));

  for (const width of [1280, 800, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const statuses = page.locator('.battle-statuses').first();
    const initial = await bounds();
    await statuses.locator('li').evaluateAll(items => items.forEach(item => item.classList.remove('inactive')));
    expect(await bounds()).toEqual(initial);
    for (const details of await page.locator('.robot-details').all()) {
      expect(await details.evaluate(panel => panel.scrollHeight <= panel.clientHeight
        && panel.getBoundingClientRect().bottom <= panel.closest('.score').getBoundingClientRect().bottom)).toBe(true);
    }
    await statuses.locator('li').evaluateAll(items => items.forEach(item => item.classList.add('inactive')));
    expect(await bounds()).toEqual(initial);
  }
});
