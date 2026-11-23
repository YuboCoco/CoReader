import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { _electron as electron } from 'playwright-core';

const [exe, source] = process.argv.slice(2);
const profile = await mkdtemp(join(tmpdir(), 'elr-ui-fix-'));
let app;
try {
  app = await electron.launch({ executablePath: resolve(exe), cwd: dirname(resolve(exe)), timeout: 30000,
    env: { ...process.env, APPDATA: profile, LOCALAPPDATA: profile, ENGLISH_LIT_READER_DATA: profile, ENGLISH_LIT_READER_HIDDEN: '1' } });
  await app.evaluate(({ BrowserWindow, dialog }, file) => {
    BrowserWindow.getAllWindows()[0]?.webContents.setBackgroundThrottling(false);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, resolve(source));
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  await page.getByRole('button', { name: '打开 PDF', exact: true }).click();
  await page.getByText('功能栏', { exact: true }).waitFor();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '模型设置', exact: true });
  await dialog.waitFor();
  const dialogBox = await dialog.boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  console.log('settings dialog', dialogBox, viewport);
  assert.ok(dialogBox && viewport && dialogBox.x >= 0 && dialogBox.y >= 0 &&
    dialogBox.x + dialogBox.width <= viewport.width && dialogBox.y + dialogBox.height <= viewport.height);
  const hitTarget = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return element?.closest('dialog')?.className || '';
  }, { x: dialogBox.x + dialogBox.width / 2, y: dialogBox.y + dialogBox.height / 2 });
  assert.match(hitTarget, /model-center/);
  await dialog.getByRole('button', { name: '显示设置', exact: true }).click();
  await dialog.getByText('功能栏布局', { exact: true }).waitFor();
  assert.equal(await dialog.evaluate((node) => {
    const color = getComputedStyle(node).backgroundColor;
    return !color.endsWith(', 0)') && color !== 'transparent';
  }), true);
  await dialog.getByRole('button', { name: '关闭设置' }).click().catch(() => {});
  console.log('cards', await page.locator('[data-elr-docked-card]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-elr-docked-card'))), await page.locator('[data-elr-floating-card]').count(), await page.locator('.elr-grip').count());
  const card = page.locator('[data-elr-docked-card="terms"]');
  console.log('card background', await card.evaluate((node) => getComputedStyle(node).backgroundColor));
  assert.equal(await card.evaluate((node) => {
    const color = getComputedStyle(node).backgroundColor;
    return !color.endsWith(', 0)') && color !== 'transparent';
  }), true);
  console.log('PASS visible settings page and opaque docked card');
} finally {
  await app?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
}
