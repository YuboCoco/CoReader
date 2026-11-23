import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';

const [executable, source, preview] = process.argv.slice(2);
if (!executable || !source) throw new Error('用法：node scripts/smoke-layout-win.mjs CoReader.exe Mamba.pdf [preview.png]');
const profile = await mkdtemp(join(tmpdir(), 'elr-layout-'));
let app;
try {
  app = await electron.launch({
    executablePath: resolve(executable),
    cwd: dirname(resolve(executable)),
    timeout: 30000,
    env: { ...process.env, APPDATA: profile, LOCALAPPDATA: profile, ENGLISH_LIT_READER_DATA: profile, ENGLISH_LIT_READER_HIDDEN: '1' },
  });
  await app.evaluate(({ BrowserWindow, dialog }, paper) => {
    BrowserWindow.getAllWindows()[0]?.webContents.setBackgroundThrottling(false);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paper] });
  }, resolve(source));
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: '打开 PDF', exact: true }).click();
  const originalMode = page.getByRole('button', { name: '原文', exact: true });
  await originalMode.waitFor({ timeout: 60000 });
  const next = page.getByRole('button', { name: '下一页', exact: true });
  await next.click();
  await next.click();
  await page.getByText(/^3 \/ 36$/, { exact: true }).waitFor();
  await originalMode.click();
  const pane = page.getByRole('region', { name: 'PDF 对照译文' }).locator('[data-pdf-sheet="3"]');
  const diagram = pane.locator('figure[data-kind="figure"][data-layout-source="model"]').first();
  await diagram.getByRole('img').waitFor({ timeout: 120000 });
  const caption = pane.locator('[data-pdf-paragraph]').filter({ hasText: 'Structured SSMs independently map each channel' }).first();
  await caption.waitFor();
  const formulas = pane.locator('figure[data-kind="formula"][data-layout-source="model"]');
  await formulas.first().getByRole('img').waitFor();
  assert.equal(await diagram.count(), 1);
  const formulaCount = await formulas.count();
  console.log('Mamba model blocks', await pane.locator('[data-pdf-paragraph]').evaluateAll((entries) => entries.map((entry) => [entry.dataset.kind || '', entry.dataset.layoutSource || '', (entry.querySelector('.elr-paragraph-excerpt')?.textContent || '').trim().slice(0, 80)])));
  assert.ok(formulaCount >= 2);
  assert.ok(await diagram.getByRole('img').evaluate((image) =>
    image.complete && image.naturalWidth > 100 && image.naturalHeight / image.naturalWidth > .35));
  const text = await pane.locator('[data-pdf-paragraph]').evaluateAll((entries) =>
    entries.map((entry) => entry.querySelector('.elr-paragraph-excerpt')?.textContent || '').join(' '));
  assert.doesNotMatch(text, /Selective State Space Model|Hardware-aware State Expansion|Selection Mechanism/);
  assert.deepEqual(errors, []);
  if (preview) {
    const image = await diagram.getByRole('img').getAttribute('src');
    await writeFile(preview, Buffer.from(image.split(',')[1], 'base64'));
    const capture = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setOpacity(0);
      window.showInactive();
      try { return (await window.webContents.capturePage()).toPNG().toString('base64'); }
      finally { window.hide(); window.setOpacity(1); }
    });
    await writeFile(preview + '.reader.png', Buffer.from(capture, 'base64'));
  }
  console.log('PASS Mamba page 3 model layout, complete figure crop, caption placement, and standalone equation crops');
} finally {
  await app?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
}
