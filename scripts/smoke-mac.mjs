import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';
import { inputSize } from '../src/layout-spec.mjs';
import { openLibrary } from '../src/library.mjs';
import { fixturePDF } from './reader-fixture.mjs';

const bundle = process.argv[2];
if (process.platform !== 'darwin' || !bundle) {
  throw new Error('Use macOS and pass the path to the built CoReader.app.');
}
const profile = await mkdtemp(join(tmpdir(), 'coreader-mac-smoke-'));
let app;
try {
  const pdf = join(profile, 'Coreader macOS fixture.pdf');
  await writeFile(pdf, fixturePDF());
  const library = openLibrary(profile);
  try { await library.importFile(pdf); } finally { library.close(); }

  app = await electron.launch({
    executablePath: resolve(bundle, 'Contents', 'MacOS', 'CoReader'),
    env: { ...process.env, ENGLISH_LIT_READER_DATA: profile },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const home = page.locator('.pl-home');
  await home.getByRole('button', { name: 'Coreader macOS fixture', exact: true }).waitFor();
  const toolbar = page.locator('.desktop-mac-toolbar');
  await toolbar.waitFor();
  assert.equal(await toolbar.evaluate((node) => getComputedStyle(node).getPropertyValue('app-region') || getComputedStyle(node).getPropertyValue('-webkit-app-region')), 'drag');
  assert.equal(await page.evaluate(() => window.reader.platform), 'darwin');

  await app.evaluate(({ BrowserWindow, dialog, Menu }, path) => {
    const window = BrowserWindow.getAllWindows()[0];
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    Menu.getApplicationMenu().getMenuItemById('open-pdf').click(null, window);
  }, pdf);
  await page.locator('.textLayer span').filter({ hasText: 'Attention head experiments' }).waitFor();

  const agent = page.locator('[data-elr-docked-card="agent"]');
  const question = agent.getByRole('textbox');
  await question.fill('Draft');
  const height = await agent.evaluate((node) => node.getBoundingClientRect().height);
  await question.clear();
  assert.equal(await agent.evaluate((node) => node.getBoundingClientRect().height), height);
  assert.doesNotMatch(await agent.getAttribute('class'), /\bis-compact\b/);

  const browserWindowFullscreen = (active) => app.evaluate(({ BrowserWindow }, value) => {
    BrowserWindow.getAllWindows()[0].setFullScreen(value);
  }, active);
  await browserWindowFullscreen(true);
  await toolbar.waitFor({ state: 'hidden' });
  await browserWindowFullscreen(false);
  await toolbar.waitFor();

  const offline = await page.evaluate(async (size) => {
    const pixels = new Uint8Array(size * size * 4).fill(255);
    const regions = await window.reader.parallelLayout(pixels.buffer);
    const responses = [];
    for (const model of ['haidass-translate-143m', 'hy-mt2-1.8b']) {
      await window.reader.saveModel({ translation: { mode: 'local', model } });
      responses.push(await window.reader.readerRequest('/translate', {
        request: crypto.randomUUID(), text: 'The transformer uses a multi-head attention mechanism.',
      }));
    }
    return { regions, responses };
  }, inputSize);
  assert.ok(Array.isArray(offline.regions), 'The native layout worker must return regions.');
  assert.deepEqual(offline.responses.map(({ model }) => model), ['Haidass-Translate-143M', 'Hy-MT2-1.8B']);
  for (const response of offline.responses) {
    assert.equal(response.provider, 'local');
    assert.match(response.text, /注意力/);
  }
  assert.deepEqual(errors, []);
  console.log('PASS macOS window, PDF, reading assistant, ONNX layout and offline translation.');
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
