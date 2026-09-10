import { test, expect } from '@playwright/test';
import { examples } from '../../src/examples';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#ready-badge')).toHaveText('READY');
});
test('initial workspace, all presets, copy, diff, focus, and no external requests', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const preset of ['expanded', 'compact', 'custom', 'adaptive']) {
    await page.getByLabel('Layout preset').selectOption(preset);
    await expect(page.locator('#ready-badge')).toHaveText('READY');
    await expect(page.getByRole('button', { name: 'Copy output' })).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Copy output' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('With(');
  await page.getByRole('button', { name: 'Diff', exact: true }).click();
  await expect(page.locator('.tool')).toHaveClass(/diff-on/);
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await expect(page.locator('.tool')).toHaveClass(/focus-mode/);
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(errors).toEqual([]);
  expect(requests.filter((url) => !url.startsWith('http://127.0.0.1:4173/'))).toEqual([]);
});
for (const example of examples)
  test(`example: ${example.name}`, async ({ page }) => {
    await page.getByRole('button', { name: 'Examples' }).click();
    await page
      .getByRole('button', {
        name: new RegExp(example.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      })
      .click();
    await expect(page.getByLabel('Language', { exact: true })).toHaveValue(example.mode);
    await expect(page.locator('#ready-badge')).toHaveText('READY');
    await expect(page.locator('#diagnostics')).toBeHidden();
    if (example.mode === 'yaml') {
      await expect(page.getByRole('complementary', { name: 'YAML properties' })).toBeVisible();
      await page.locator('#outline-items button').first().click();
    }
  });
test('invalid edits disable stale copy and undo restores input', async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Source code' });
  await source.fill('If(true,');
  await expect(page.getByRole('button', { name: 'Copy output' })).toBeDisabled();
  await expect(page.locator('#diagnostics')).toBeVisible();
  await expect(source).toHaveText('If(true,');
  await source.press('Control+z');
  await expect(page.locator('#ready-badge')).toHaveText('READY');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('#ready-badge')).toHaveText('EMPTY');
  await expect(page.locator('#empty-hint')).toBeVisible();
});
test('file import, YAML outline, and download', async ({ page }) => {
  await page.locator('#file-input').setInputFiles({
    name: 'test.pa.yaml',
    mimeType: 'text/plain',
    buffer: Buffer.from(examples[2].source),
  });
  await expect(page.getByLabel('Language', { exact: true })).toHaveValue('yaml');
  await expect(page.locator('#ready-badge')).toHaveText('READY');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download formatted file' }).click();
  expect((await download).suggestedFilename()).toBe('formatted.pa.yaml');
});
test('settings persist, code storage requires opt in, erase works', async ({ page }) => {
  expect(await page.evaluate(() => localStorage.getItem('vrrdnt.powerfx.source.v1'))).toBeNull();
  await page.getByRole('button', { name: 'Formatting settings' }).click();
  await page.getByLabel('Line width', { exact: true }).fill('80');
  await page.getByLabel('Line width', { exact: true }).press('Tab');
  await page.getByLabel('Remember my code on this device').check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  await expect(page.locator('#style-status')).toContainText('80 cols');
  await expect(page.locator('#ready-badge')).toHaveText('READY');
  expect(
    await page.evaluate(() => localStorage.getItem('vrrdnt.powerfx.source.v1')),
  ).not.toBeNull();
  await page.getByRole('button', { name: 'Formatting settings' }).click();
  await page.getByRole('button', { name: 'Erase saved code and settings' }).click();
  expect(await page.evaluate(() => localStorage.getItem('vrrdnt.powerfx.source.v1'))).toBeNull();
  await expect(page.getByLabel('Remember my code on this device')).not.toBeChecked();
});
test('manual formatting and separator settings', async ({ page }) => {
  await page.getByRole('button', { name: 'Formatting settings' }).click();
  await page.getByLabel('Update the preview as I type').uncheck();
  await page.getByLabel('Power Fx separators').selectOption('comma');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('textbox', { name: 'Source code' }).fill('Set(x;1,25);;Notify("Saved")');
  await expect(page.locator('#ready-badge')).toHaveText('OUTDATED');
  await page.getByRole('textbox', { name: 'Source code' }).press('Control+Enter');
  await expect(page.locator('#ready-badge')).toHaveText('READY');
  await expect(page.getByRole('textbox', { name: 'Formatted code' })).toContainText('1,25');
});
test('storage and clipboard failure keep the formatter usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('storage blocked');
      },
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('blocked')) },
    });
  });
  await page.reload();
  await expect(page.locator('#ready-badge')).toHaveText('READY');
  await page.getByRole('button', { name: 'Copy output' }).click();
  await expect(page.locator('#toast')).toContainText('Clipboard access was blocked');
});
test('latest edits win and cancellation is recoverable', async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Source code' });
  await source.fill('Set(x,1);'.repeat(4000));
  // Dispatch both controls in one event-loop task so a fast worker cannot win the click race.
  await page.locator('#format').evaluate((button: HTMLButtonElement) => {
    button.click();
    document.querySelector<HTMLButtonElement>('#cancel')!.click();
  });
  await expect(page.locator('#ready-badge')).toHaveText('CANCELLED');
  await source.fill('Sum(9,8)');
  await page.locator('#format').click();
  await expect(page.locator('#ready-badge')).toHaveText('READY');
  await expect(page.getByRole('textbox', { name: 'Formatted code' })).toHaveText('Sum(9, 8)');
});
test('a worker loading failure does not loop and can be retried', async ({ page }) => {
  let requests = 0;
  await page.route('**/worker-*.js', async (route) => {
    requests++;
    await route.abort();
  });
  await page.reload();
  await expect(page.locator('#ready-badge')).toHaveText('ERROR');
  expect(requests).toBe(1);
  await page.unroute('**/worker-*.js');
  await page.locator('#format').click();
  await expect(page.locator('#ready-badge')).toHaveText('READY');
});
test('custom layout, desktop resizing, and keyboard find', async ({ page }) => {
  await page.getByRole('button', { name: 'Formatting settings' }).click();
  await page
    .getByRole('combobox', { name: 'Function arguments', exact: true })
    .selectOption('expanded');
  await page.getByRole('combobox', { name: 'Indent size', exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByLabel('Layout preset')).toHaveValue('custom');
  await expect(page.locator('#ready-badge')).toHaveText('READY');
  const splitter = page.getByRole('separator', { name: 'Resize editors' });
  await splitter.focus();
  await splitter.press('ArrowRight');
  await expect(splitter).toHaveAttribute('aria-valuenow', '55');
  await page.getByRole('textbox', { name: 'Source code' }).click();
  await page.getByRole('textbox', { name: 'Source code' }).press('Control+f');
  await expect(page.getByRole('textbox', { name: 'Find', exact: true })).toBeVisible();
});
