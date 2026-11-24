import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { _electron as electron } from 'playwright-core';
import { openLibrary } from '../src/library.mjs';
import { fixturePDF } from './reader-fixture.mjs';

const directory = await mkdtemp(join(tmpdir(), 'elr-smoke-'));
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const archive = resolve('release/CoReader-' + version + '-win-x64.zip');
const packaged = process.argv[2] ? resolve(process.argv[2]) : join(directory, 'CoReader-win32-x64', 'CoReader.exe');
const pdfPath = join(directory, '测试论文.pdf');
const encryptedPath = join(directory, '加密测试.pdf');
const rendererErrors = [];
const received = [];
const appEnv = { ...process.env, APPDATA: directory, LOCALAPPDATA: directory,
  ENGLISH_LIT_READER_DATA: directory, ENGLISH_LIT_READER_HIDDEN: '1' };
for (const key of Object.keys(appEnv)) if (key.toUpperCase() === 'PATH') delete appEnv[key];
appEnv.PATH = [dirname(process.execPath), join(process.env.SystemRoot || 'C:\\Windows', 'System32')].join(delimiter);

async function fixtureCodeBuddy() {
  const args = process.argv.slice(2);
  if (!args.includes('--strict-mcp-config') || args[args.indexOf('--tools') + 1] !== '') process.exit(2);
  if (args.includes('--acp')) {
    const lines = createInterface({ input: process.stdin });
    for await (const line of lines) {
      const { id, method, params } = JSON.parse(line);
      let result;
      if (method === 'initialize' && params.protocolVersion === 1) result = { protocolVersion: 1 };
      else if (method === 'session/new' && params.mcpServers.length === 0) result = {
        sessionId: 'workbuddy-fixture-session',
        models: { currentModelId: 'fixture-workbuddy-model', availableModels: [
          { modelId: 'fixture-workbuddy-model', name: 'WorkBuddy Fixture' },
          { modelId: 'fixture-workbuddy-vision', name: 'WorkBuddy Vision' },
        ] },
        configOptions: [{ category: 'thought_level', currentValue: 'high', options: [{ value: 'low' }, { value: 'high' }] }],
        _meta: { 'codebuddy.ai/userinfo': { userNickname: 'WorkBuddy 测试账号' } },
      };
      else process.exit(12);
      console.log(JSON.stringify({ jsonrpc: '2.0', id, result }));
    }
    return;
  }
  if (!args.includes('--model=fixture-workbuddy-model')) process.exit(3);
  process.stdin.setEncoding('utf8');
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const { message } = JSON.parse(raw);
  const input = message.content[0].text;
  if (input === 'OK?' && !args.includes('--effort=high')) process.exit(5);
  const answer = input === 'OK?' ? 'OK' : /^待翻译原文：\s*\S/.test(input) ? '已通过 WorkBuddy 翻译' : '';
  if (!answer) process.exit(4);
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'fixture-workbuddy-model' }));
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: answer }));
}

async function installFixtureCodeBuddy() {
  const root = join(directory, 'npm', 'node_modules', '@tencent-ai', 'codebuddy-code');
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@tencent-ai/codebuddy-code', type: 'module', bin: { codebuddy: './cli.js' } }));
  await writeFile(join(root, 'cli.js'), "import { createInterface } from 'node:readline'; await (" + fixtureCodeBuddy.toString() + ')();');
}

const server = createServer(async (request, response) => {
  if (request.headers.authorization !== 'Bearer fixture-deepseek-only') {
    response.writeHead(401).end();
    return;
  }
  if (request.method === 'GET' && request.url === '/v1/models') {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: [
      { id: 'deepseek-flash', display_name: 'DeepSeek V4.1 Flash' },
      { id: 'deepseek-v4-pro' },
    ] }));
    return;
  }
  let payload = '';
  for await (const part of request) payload += part;
  const body = JSON.parse(payload);
  const content = body.messages[1].content;
  const instructions = body.messages[0].content;
  received.push({ url: request.url, model: body.model, auth: request.headers.authorization, content });
  const term = typeof content === 'string' && content.startsWith('术语');
  let answer = content === 'OK?' ? 'OK' : term ? '注意力头用于聚合上下文信息。' : '注意力头实验';
  if (instructions.startsWith('Analyze the supplied academic paper')) {
    assert.match(content, /Attention head experiments/);
    assert.match(content, /Evaluation on page two/);
    answer = '## 论文概览\n\n全文分析测试结果。\n\n$E=mc^2$\n\n|方式|结果|\n|---|---|\n|示例|100|';
  }
  if (instructions.startsWith('Extract bibliographic references')) {
    const line = content.split('\n').find((value) => value.includes('Jane Smith'));
    const heading = content.split('\n').find((value) => /^\d+\| References$/.test(value));
    const number = Number(line?.split('|')[0]);
    assert.ok(number > 0, content);
    answer = JSON.stringify({ headingLine: Number(heading?.split('|')[0]) || null,
      entries: [{ startLine: number, endLine: number, number: '[1]', title: 'Example Study',
        firstAuthor: 'Jane Smith', year: '2020', printedAddress: '10.1234/fixture' }] });
  }
  if (instructions.startsWith('Treat each citation as source data')) {
    answer = JSON.stringify(JSON.parse(content).map((item) => ({ id: item.id, title: 'Example Study', zh: '示例研究', authors: 'Jane Smith', year: '2020' })));
  }
  if (instructions.startsWith('You plan read-only retrieval')) {
    const planned = JSON.parse(content);
    assert.equal(planned.sources, undefined);
    assert.doesNotMatch(content, /Evaluation on page two/);
    answer = '{"queries":["Evaluation"],"pages":[]}';
  }
  if (instructions.startsWith('You are the reading assistant')) {
    const input = JSON.parse(content);
    if (input.question === '测试停止') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('data: {"choices":[{"delta":{"content":"等待停止的草稿"}}]}\n\n');
      const timer = globalThis.setTimeout(() => response.end(), 20000);
      response.once('close', () => clearTimeout(timer));
      return;
    }
    const reference = input.sources.find((item) => item.page === 2 && item.text.includes('Evaluation on page two'));
    assert.ok(reference);
    if (input.scope === 'paper search') {
      assert.equal(input.sources.filter((item) => item.kind === 'selection' && item.page === 1).length, 2);
      answer = '论文在第二页说明评估流程。 [' + reference.id + '] [S999]';
    } else {
      assert.equal(input.recent.at(-1).question, '如何评估结果？');
      assert.ok(input.sources.every((source) => source.page === 2));
      answer = '本页概述了评估。 [' + reference.id + ']';
    }
  }
  if (Array.isArray(content)) {
    assert.equal(content[1].type, 'image_url');
    assert.match(content[1].image_url.url, /^data:image\/(?:jpeg|png);base64,/);
    answer = '### 子图与可见结构\n\n选区包含试验内容。';
  }
  if (term) await setTimeout(850);
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  response.end('data: ' + JSON.stringify({ model: 'fixture-resolved', choices: [{ delta: { content: answer }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
});

await writeFile(pdfPath, fixturePDF());
const oldLibrary = openLibrary(directory);
const oldDocument = await oldLibrary.importFile(pdfPath);
oldLibrary.addMark(oldDocument.id, { page: 1, kind: 'note', note: '旧版批注迁移测试', quote: 'Attention head', rects: [{ x: .1, y: .13, w: .2, h: .04 }] });
oldLibrary.setSettings({
  model: { provider: 'compatible', model: 'retired-fixture' },
  'translation-routing': { mode: 'separate', provider: 'openai', model: 'retired-translation' },
});
oldLibrary.close();
let app;
async function launch() {
  app = await electron.launch({
    executablePath: packaged,
    cwd: dirname(packaged),
    env: appEnv,
    timeout: 30000,
  });
  await app.evaluate((_electron, port) => {
    const networkFetch = globalThis.fetch;
    globalThis.fetch = async (address, options) => {
      const url = new URL(address);
      if (url.origin === 'https://api.deepseek.com') {
        if (url.pathname === '/user/balance' && options.headers.Authorization === 'Bearer fixture-deepseek-only') {
          return Response.json({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '179.29' }] });
        }
        return networkFetch('http://127.0.0.1:' + port + '/v1' + url.pathname, options);
      }
      if (url.origin === 'https://open.bigmodel.cn') {
        if (options.headers.Authorization !== 'Bearer fixture-glm') return new Response(null, { status: 401 });
        if (url.pathname.endsWith('/models')) return new Response(null, { status: 404 });
        const payload = JSON.parse(options.body);
        if (url.pathname !== '/api/paas/v4/chat/completions' || payload.model !== 'glm-5.3-flash'
          || payload.reasoning_effort !== 'low') return new Response(null, { status: 400 });
        return Response.json({ model: payload.model, choices: [{ message: {
          content: payload.messages[1].content === 'OK?' ? 'OK' : '已通过 GLM 解释术语',
        }, finish_reason: 'stop' }] });
      }
      if (url.origin !== 'https://api.moonshot.cn') return networkFetch(address, options);
      if (options.headers.Authorization !== 'Bearer fixture-kimi') return new Response(null, { status: 401 });
      if (url.pathname === '/v1/models') {
        return Response.json({ data: [{ id: 'kimi-k3.1-pro', supported_reasoning_efforts: ['low', 'max'] }] });
      }
      if (url.pathname === '/v1/users/me/balance') {
        return Response.json({ code: 0, status: true, data: { available_balance: 49.58894 } });
      }
      const body = JSON.parse(options.body);
      if (url.pathname !== '/v1/chat/completions' || body.model !== 'kimi-k3.1-pro' || body.reasoning_effort !== 'low') {
        return new Response(null, { status: 400 });
      }
      return Response.json({ model: body.model, choices: [{ message: {
        content: body.messages[1].content === 'OK?' ? 'OK' : '已通过 Kimi 开放平台解释术语',
      }, finish_reason: 'stop' }] });
    };
  }, server.address().port);
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.setBackgroundThrottling(false);
  });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => rendererErrors.push(error.message));
  return page;
}

try {
  if (!process.argv[2]) execFileSync('tar.exe', ['-xf', archive, '-C', directory]);
  await installFixtureCodeBuddy();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  let page = await launch();
  await page.getByRole('heading', { name: '全部论文', exact: true }).waitFor();
  await page.locator('.pl-home').getByRole('button', { name: '测试论文', exact: true }).waitFor();


  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, pdfPath);
  await page.getByRole('button', { name: '打开 PDF', exact: true }).click();
  const firstPage = page.locator('.pdfViewer .page[data-page-number="1"]');
  const selected = firstPage.locator('.textLayer span').filter({ hasText: 'Attention head experiments' }).first();
  await selected.waitFor({ state: 'visible' });
  await page.getByText('旧版批注迁移测试').waitFor();
  assert.ok(await firstPage.locator('.canvasWrapper canvas').first().evaluate((canvas) => canvas.width > 100));

  const drag = async (from, to) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
  };
  const center = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert.ok(box);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const selectRange = async (from, to, append = false) => {
    await selected.evaluate((element, [begin, end, shift]) => {
      element.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, shiftKey: shift,
      }));
      const node = element.firstChild;
      const range = document.createRange();
      range.setStart(node, begin);
      range.setEnd(node, end);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
      element.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, pointerId: 1, isPrimary: true, button: 0, buttons: 0, shiftKey: shift,
      }));
    }, [from, to, append]);
  };

  await selectRange(0, 14);
  await page.waitForFunction(() => document.querySelector('.elr-sel-edit')?.value === 'Attention head');
  await page.locator('.elr-sel-actions').getByRole('button', { name: '翻译', exact: true }).click();
  await page.locator('.elr-sel-text').filter({ hasText: /注意[力头]/ }).waitFor({ timeout: 60000 });
  assert.equal(received.length, 0);
  console.log('PASS bundled Haidass translates PDF text by default before any model account is configured');

  const modeButton = (name) => page.getByRole('group', { name: 'PDF 阅读模式' })
    .getByRole('button', { name, exact: true });
  await page.getByRole('button', { name: '目录', exact: true }).click();
  const outline = page.getByRole('navigation', { name: '章节导航' });
  const evaluation = outline.getByRole('button', { name: /^2 Evaluation on page two/ });
  await evaluation.waitFor();
  await outline.getByRole('button', { name: '折叠 Paper overview' }).click();
  await evaluation.waitFor({ state: 'hidden' });
  await outline.getByRole('button', { name: '展开 Paper overview' }).click();
  await evaluation.click();
  await page.getByText('2 / 2', { exact: true }).waitFor();
  assert.equal(await evaluation.getAttribute('aria-current'), 'location');
  await modeButton('对照').click();
  const parallel = page.getByRole('region', { name: 'PDF 对照译文' });
  const firstParagraph = parallel.locator('[data-pdf-paragraph="0"]');
  const originals = page.locator('.elr-pdf-hover-layer span');
  await firstParagraph.hover();
  await page.waitForFunction(() => document.querySelector('[data-pdf-paragraph="0"][data-hovered="true"]') && document.querySelector('.elr-pdf-hover-layer span'));
  assert.ok(await originals.count());
  await parallel.getByRole('button', { name: '翻译本页' }).hover();
  await originals.first().waitFor({ state: 'hidden' });
  const originalLabel = page.locator('.page[data-page-number="2"] .textLayer span').filter({ hasText: /^2 Evaluation on page two$/ });
  await originalLabel.hover();
  await firstParagraph.and(parallel.locator('[data-hovered="true"]')).waitFor();
  const crops = parallel.locator('figure[data-kind] img');
  for (const kind of ['figure', 'table', 'formula']) {
    await parallel.locator('figure[data-kind="' + kind + '"] img').first().waitFor();
  }
  assert.ok(await crops.evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 5)));
  assert.equal(await parallel.locator('figure[data-kind="formula"] button').count(), 0);
  if (process.env.ENGLISH_LIT_READER_READING_IMAGE) {
    const preview = process.env.ENGLISH_LIT_READER_READING_IMAGE;
    await writeFile(preview + '.pdf', fixturePDF());
    for (const kind of ['figure', 'table', 'formula']) {
      const url = await parallel.locator('figure[data-kind="' + kind + '"] img').first().getAttribute('src');
      await writeFile(preview + '.' + kind + '.png', Buffer.from(url.split(',')[1], 'base64'));
    }
    await parallel.locator('figure[data-kind="figure"]').scrollIntoViewIfNeeded();
    const png = await app.evaluate(async ({ BrowserWindow }) => {
      const appWindow = BrowserWindow.getAllWindows()[0];
      appWindow.setOpacity(0);
      appWindow.showInactive();
      try {
        return (await appWindow.webContents.capturePage()).toPNG().toString('base64');
      } finally {
        appWindow.hide();
        appWindow.setOpacity(1);
      }
    });
    if (png) await writeFile(preview, Buffer.from(png, 'base64'));
  }
  const equationIndex = await parallel.locator('article').filter({ hasText: 'We use x = y in the evaluation.' }).getAttribute('data-pdf-paragraph');
  const inlineEquation = parallel.locator('[data-pdf-paragraph="' + equationIndex + '"]');
  await inlineEquation.getByRole('button', { name: '翻译此段' }).click();
  await inlineEquation.locator('.elr-paragraph-translation').filter({ hasText: 'x = y' }).waitFor({ timeout: 90000 });
  await firstParagraph.getByRole('button', { name: '翻译此段' }).click();
  const translationResult = firstParagraph.locator('.elr-paragraph-translation, .elr-paragraph-error');
  await translationResult.waitFor({ timeout: 90000 });
  assert.equal(await firstParagraph.locator('.elr-paragraph-error').count(), 0, await translationResult.innerText());
  const savedTranslationText = await firstParagraph.locator('.elr-paragraph-translation').innerText();
  assert.match(savedTranslationText, /[\u3400-\u9fff]/);
  const originalPdf = page.locator('.elr-pdf-container');
  assert.equal(await originalPdf.isVisible(), true);
  const divider = page.getByRole('separator', { name: '调整原文和译文宽度' });
  const originalWidth = (await originalPdf.boundingBox()).width;
  await divider.press('ArrowLeft');
  assert.ok((await originalPdf.boundingBox()).width < originalWidth);
  await divider.press('ArrowRight');
  await page.getByText('2 / 2', { exact: true }).waitFor();
  await modeButton('重排').click();
  await page.getByText('2 / 2', { exact: true }).waitFor();
  await firstParagraph.getByText('2 Evaluation on page two', { exact: true }).waitFor();
  await modeButton('译文').click();
  assert.equal(await firstParagraph.getByText('2 Evaluation on page two', { exact: true }).count(), 0);
  assert.equal(await firstParagraph.locator('.elr-paragraph-translation').innerText(), savedTranslationText);
  await firstParagraph.getByRole('button', { name: '定位原文' }).click();
  await parallel.waitFor({ state: 'hidden' });
  await page.getByText('2 / 2', { exact: true }).waitFor();
  assert.ok((await page.evaluate(async () => {
    const [paper] = await window.reader.recent();
    return window.reader.parallelPage(paper.id, 2);
  })).some((block) => block.text === savedTranslationText));
  await page.getByRole('button', { name: '目录', exact: true }).click();
  await page.getByRole('button', { name: '上一页', exact: true }).click();
  await page.getByText('1 / 2', { exact: true }).waitFor();
  console.log('PASS numbered PDF outline, bidirectional hover, original vector figure/table/formula crops, and saved offline translation');

  // Authorize through the real loopback callback with a synthetic issuer and models.
  await app.evaluate(({ protocol, shell }) => {
    const { generateKeyPairSync, sign } = process.getBuiltinModule('node:crypto');
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const replyClient = 'oaiapp_smoke_fixture';
    const access = 'smoke-subscription-access';
    const origin = 'https://auth.openai.com';
    const originalFetch = globalThis.fetch;
    let auth;
    shell.openExternal = async (address) => {
      const url = new URL(address);
      if (url.origin !== origin || url.pathname !== '/api/accounts/authorize') throw new Error('Unexpected external URL');
      auth = url;
      const callback = new URL(url.searchParams.get('redirect_uri'));
      if (callback.hostname !== '127.0.0.1') throw new Error('Not a local callback');
      callback.searchParams.set('state', url.searchParams.get('state'));
      callback.searchParams.set('client_id', replyClient);
      callback.searchParams.set('code', 'smoke-code');
      if (!(await originalFetch(callback)).ok) throw new Error('Local authorization callback failed');
    };
    protocol.handle('https', async (request) => {
      switch (request.url) {
        case origin + '/api/accounts/oauth/token': {
          const form = new URLSearchParams(await request.text());
          if (request.method !== 'POST' || !request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')
            || form.get('code') !== 'smoke-code' || form.get('client_id') !== replyClient) return Response.json({}, { status: 400 });
          const claims = { iss: origin, sub: 'desktop-subscription-smoke', aud: replyClient,
            exp: Math.floor(Date.now() / 1000) + 900, nonce: auth.searchParams.get('nonce'), email: 'chatgpt-smoke@example.test' };
          const signed = [{ alg: 'RS256', kid: 'smoke-jwk' }, claims].map((value) =>
            Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
          const idToken = signed + '.' + sign('sha256', Buffer.from(signed), privateKey).toString('base64url');
          return Response.json({ access_token: access, id_token: idToken, token_type: 'Bearer',
            expires_in: 900, scope: 'openid chatgpt.tokens.use.direct' });
        }
        case origin + '/.well-known/openid-configuration':
          return Response.json({ issuer: origin, jwks_uri: origin + '/smoke-jwks' });
        case origin + '/smoke-jwks':
          return Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'smoke-jwk', alg: 'RS256' }] });
        case 'https://api.openai.com/v1/models':
          if (request.headers.get('authorization') !== 'Bearer ' + access) return Response.json({}, { status: 401 });
          return Response.json({ models: [
            { visibility: 'list', slug: 'fixture-answers', display_name: 'Fixture Answers', supported_reasoning_efforts: ['high'] },
            { visibility: 'list', slug: 'fixture-translation', display_name: 'Fixture Translation', supported_reasoning_efforts: ['low'] },
          ] });
        case 'https://api.openai.com/v1/responses': {
          if (request.headers.get('authorization') !== 'Bearer ' + access) return Response.json({}, { status: 401 });
          const payload = await request.json();
          const input = payload.input[0].content[0].text;
          const question = payload.model === 'fixture-answers' && payload.reasoning?.effort === 'high'
            && (input === 'OK?' || input.includes('术语'));
          const translation = payload.model === 'fixture-translation' && payload.reasoning?.effort === 'low' && input.includes('待翻译原文');
          if (!question && !translation) return Response.json({}, { status: 400 });
          const events = [
            ['response.created', { response: { model: payload.model } }],
            ['response.output_text.delta', { delta: translation ? '订阅翻译模型结果' : '订阅问答模型结果' }],
            ['response.completed', { response: { model: payload.model } }],
          ];
          const body = events.map(([name, data]) => 'event: ' + name + '\r\ndata: ' + JSON.stringify(data) + '\r\n\r\n').join('');
          return new Response(body, { headers: { 'Content-Type': question ? 'application/json' : 'text/event-stream' } });
        }
        default: return new Response(null, { status: 404 });
      }
    });
  });
  const openModels = () => page.getByRole('button', { name: '模型设置', exact: true }).click();
  await openModels();
  let modelCenter = page.getByRole('dialog', { name: '模型设置', exact: true });
  const questionModel = () => modelCenter.getByLabel('问答', { exact: true });
  const translationModel = () => modelCenter.getByLabel('翻译', { exact: true });
  const questionEffort = () => modelCenter.getByLabel('问答推理强度', { exact: true });
  const optionValues = (select) => select.locator('option').evaluateAll((options) => options.map((item) => item.value));
  const previousCard = () => modelCenter.getByRole('button', { name: '上一个账号卡片', exact: true });
  const nextCard = () => modelCenter.getByRole('button', { name: '下一个账号卡片', exact: true });
  const currentCard = () => modelCenter.locator('.connection-slide:not([inert]) > .connection-card');
  const cardDimensions = () => currentCard().evaluate((card) => [card.offsetWidth, card.offsetHeight]);
  const initialCardDimensions = await cardDimensions();
  assert.ok(initialCardDimensions[1] < 100);
  const verifyCard = async (name) => {
    await modelCenter.getByRole('button', { name: '管理 ' + name + ' 连接', exact: true }).waitFor();
    await currentCard().locator('img.connection-icon').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
    assert.deepEqual(await cardDimensions(), initialCardDimensions);
  };
  const openAccount = async (name) => {
    await verifyCard(name);
    await currentCard().click();
    const detail = page.getByRole('dialog', { name: name + ' 连接设置', exact: true });
    await detail.waitFor();
    return detail;
  };
  const closeAccount = async (detail) => {
    await detail.getByRole('button', { name: '关闭连接设置' }).click();
    await detail.waitFor({ state: 'hidden' });
    assert.ok(await modelCenter.isVisible());
  };
  const saveSettings = async () => {
    await modelCenter.getByRole('button', { name: '保存设置', exact: true }).click();
    await modelCenter.waitFor({ state: 'hidden' });
  };
  await questionModel().waitFor();
  assert.deepEqual(await optionValues(questionModel()), ['']);
  assert.deepEqual(await optionValues(translationModel()), ['local', 'local:hy-mt2-1.8b']);
  assert.equal(await modelCenter.getByText('订阅与用量', { exact: true }).count(), 0);
  for (const name of ['Codex', 'OpenAI API Key', 'OpenAI 兼容服务']) assert.equal(await modelCenter.getByText(name, { exact: true }).count(), 0);
  assert.deepEqual(await optionValues(page.locator('.elr-head-models select').nth(0)), ['']);
  let chatgptDetails = await openAccount('ChatGPT');
  await chatgptDetails.getByRole('button', { name: '连接 ChatGPT', exact: true }).click();
  await chatgptDetails.getByRole('option', { name: /chatgpt-smoke@example\.test/ }).waitFor({ state: 'attached' });
  assert.equal(await chatgptDetails.getByRole('link', { name: /查看 ChatGPT 用量/ }).getAttribute('href'), 'https://chatgpt.com/settings/usage');
  await closeAccount(chatgptDetails);
  await currentCard().getByText('已连接 · 2 个模型', { exact: true }).waitFor();
  assert.deepEqual(await optionValues(questionModel()), ['', 'chatgpt:fixture-answers', 'chatgpt:fixture-translation']);
  await questionModel().selectOption('chatgpt:fixture-answers');
  await questionEffort().selectOption('high');
  await modelCenter.getByRole('button', { name: '测试问答模型' }).click();
  await modelCenter.getByText('连接成功，模型已返回结果。').waitFor();
  await translationModel().selectOption('chatgpt:fixture-translation');
  await modelCenter.getByLabel('翻译推理强度', { exact: true }).selectOption('low');
  await saveSettings();
  const routed = await page.evaluate(async () => {
    const question = await window.reader.readerRequest('/term', { request: crypto.randomUUID(), term: 'Attention' });
    const translation = await window.reader.readerRequest('/translate', { request: crypto.randomUUID(),
      provider: 'chatgpt', model: 'fixture-answers', reasoningEffort: 'high', text: 'Attention head' });
    const [paper] = await window.reader.recent();
    const nativeTranslation = await window.reader.startJob({ request: crypto.randomUUID(), paper: paper.id, operation: 'translation', source: 'Attention head' });
    return { question, translation, nativeTranslation };
  });
  assert.equal(routed.question.text, '订阅问答模型结果', JSON.stringify(routed));
  assert.equal(routed.translation.text, '订阅翻译模型结果', JSON.stringify(routed));
  assert.equal(routed.translation.model, 'fixture-translation');
  assert.equal(routed.nativeTranslation.body, '订阅翻译模型结果');
  console.log('PASS ChatGPT browser callback, authorized models, and question/translation streams including SSE with a JSON header');

  await openModels();
  chatgptDetails = await openAccount('ChatGPT');
  await chatgptDetails.getByRole('button', { name: '断开连接', exact: true }).click();
  await chatgptDetails.getByRole('button', { name: '允许使用订阅', exact: true }).waitFor();
  await closeAccount(chatgptDetails);
  assert.deepEqual(await optionValues(questionModel()), ['']);
  assert.deepEqual(await optionValues(translationModel()), ['local']);
  await app.evaluate(({ protocol }) => protocol.unhandle('https'));

  await nextCard().click();
  await verifyCard('DeepSeek');
  assert.equal(await modelCenter.getByLabel('DeepSeek API Key', { exact: true }).count(), 0);
  const deepDetails = await openAccount('DeepSeek');
  const deepKey = deepDetails.getByLabel('DeepSeek API Key', { exact: true });
  await deepKey.fill('bad-fixture');
  await deepDetails.getByRole('button', { name: '验证并连接', exact: true }).click();
  await deepDetails.getByRole('alert').filter({ hasText: '模型目录拒绝授权' }).waitFor();
  assert.deepEqual(await optionValues(questionModel()), ['']);
  await deepKey.fill('fixture-deepseek-only');
  await deepDetails.getByRole('button', { name: '验证并连接', exact: true }).click();
  await deepDetails.getByText('¥179.29', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await deepDetails.waitFor({ state: 'hidden' });
  assert.ok(await modelCenter.isVisible());
  await currentCard().getByText('¥179.29', { exact: true }).waitFor();
  assert.deepEqual(await cardDimensions(), initialCardDimensions);
  assert.deepEqual(await optionValues(questionModel()), ['', 'deepseek:deepseek-flash', 'deepseek:deepseek-v4-pro']);
  await questionModel().selectOption('deepseek:deepseek-flash');
  await questionEffort().selectOption('high');
  await nextCard().click();
  await verifyCard('Kimi');
  await previousCard().press('ArrowLeft');
  await verifyCard('DeepSeek');
  assert.equal(await questionModel().inputValue(), 'deepseek:deepseek-flash');
  await nextCard().click();
  let kimiDetails = await openAccount('Kimi');
  assert.equal(await modelCenter.locator('#connection-kimi-code').count(), 0);
  await kimiDetails.getByRole('button', { name: 'Kimi Code', exact: true }).click();
  await kimiDetails.getByRole('button', { name: '登录 Kimi Code', exact: true }).waitFor();
  await kimiDetails.getByLabel('Kimi API Key', { exact: true }).waitFor({ state: 'hidden' });
  await kimiDetails.getByRole('button', { name: 'Kimi API', exact: true }).click();
  await kimiDetails.getByLabel('Kimi API Key', { exact: true }).fill('fixture-kimi');
  await kimiDetails.getByRole('button', { name: '验证并连接', exact: true }).click();
  await kimiDetails.getByText('¥49.58894', { exact: true }).waitFor();
  await closeAccount(kimiDetails);
  await currentCard().getByText('¥49.58894', { exact: true }).waitFor();
  assert.deepEqual(await cardDimensions(), initialCardDimensions);
  assert.equal(await questionModel().inputValue(), 'deepseek:deepseek-flash');
  await questionModel().selectOption('kimi:kimi-k3.1-pro');
  assert.deepEqual(await optionValues(questionEffort()), ['default', 'low', 'max']);
  await questionEffort().selectOption('low');
  await modelCenter.getByRole('button', { name: '测试问答模型' }).click();
  await modelCenter.getByText('连接成功，模型已返回结果。').waitFor();
  await saveSettings();
  await page.locator('.elr-head-models').getByText('kimi-k3.1-pro', { exact: true }).waitFor({ state: 'attached' });
  const kimiTerm = await page.evaluate(() => window.reader.readerRequest('/term', {
    request: crypto.randomUUID(), term: 'Kimi 路由测试',
  }));
  assert.equal(kimiTerm.text, '已通过 Kimi 开放平台解释术语', JSON.stringify(kimiTerm));

  await openModels();
  await previousCard().click();
  await verifyCard('自定义 API');
  await previousCard().click();
  await verifyCard('火山方舟');
  await previousCard().click();
  const workBuddy = await openAccount('WorkBuddy');
  await workBuddy.getByRole('button', { name: '检测 CodeBuddy CLI 账号', exact: true }).click();
  await workBuddy.getByRole('button', { name: '刷新模型', exact: true }).waitFor();
  await closeAccount(workBuddy);
  await questionModel().selectOption('workbuddy:fixture-workbuddy-model');
  assert.deepEqual(await optionValues(questionEffort()), ['default', 'low', 'high']);
  await app.evaluate(({ protocol }) => {
    protocol.handle('https', async (request) => {
      const address = new URL(request.url);
      if (address.origin !== 'https://api.anthropic.com' || request.headers.get('x-api-key') !== 'fixture-claude'
        || request.headers.get('anthropic-version') !== '2026-10-21') return new Response(null, { status: 401 });
      if (address.pathname === '/v1/models') return Response.json({ data: [
        { id: 'claude-fixture', display_name: 'Claude Fixture', max_input_tokens: 200000,
          capabilities: { effort: { medium: { supported: true } }, image_input: { supported: true } } },
      ] });
      if (address.pathname !== '/v1/messages') return new Response(null, { status: 404 });
      const body = await request.json();
      if (body.model !== 'claude-fixture' || body.output_config?.effort !== 'medium' || body.messages.some((row) => row.role === 'system')) {
        return new Response(null, { status: 400 });
      }
      const events = [
        { type: 'message_start', message: { model: body.model } },
        { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hidden' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: body.messages[0].content === 'OK?' ? 'OK' : '已通过 Claude 解释术语' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } }, { type: 'message_stop' },
      ];
      return new Response(events.map((item) => 'event: ' + item.type + '\ndata: ' + JSON.stringify(item) + '\n\n').join(''), {
        headers: {
          'content-type': 'text/event-stream',
          'anthropic-ratelimit-requests-limit': '80', 'anthropic-ratelimit-requests-remaining': '42',
          'anthropic-ratelimit-requests-reset': new Date(Date.now() + 60000).toISOString(),
        },
      });
    });
  });
  await previousCard().click();
  let claudeDetails = await openAccount('Claude');
  const keysLink = claudeDetails.getByRole('link', { name: /在 Claude Console 创建 API Key/ });
  assert.equal(await keysLink.getAttribute('href'), 'https://platform.claude.com/settings/keys');
  await app.evaluate(({ shell }) => {
    shell.openExternal = async (address) => { globalThis.smokeExternal = address; };
  });
  await keysLink.click();
  assert.equal(await app.evaluate(() => globalThis.smokeExternal), 'https://platform.claude.com/settings/keys');
  await claudeDetails.getByLabel('Claude API Key', { exact: true }).fill('fixture-claude');
  await claudeDetails.getByRole('button', { name: '验证并连接' }).click();
  await claudeDetails.getByRole('link', { name: /查看控制台用量/ }).waitFor();
  await closeAccount(claudeDetails);
  await questionModel().selectOption('claude:claude-fixture');
  assert.deepEqual(await optionValues(questionEffort()), ['default', 'medium']);
  await questionEffort().selectOption('medium');
  await modelCenter.getByRole('button', { name: '测试问答模型' }).click();
  await modelCenter.getByText('连接成功，模型已返回结果。').waitFor();
  claudeDetails = await openAccount('Claude');
  await claudeDetails.getByRole('button', { name: '刷新用量' }).click();
  await claudeDetails.getByText('42 / 80 次请求', { exact: true }).waitFor();
  await closeAccount(claudeDetails);
  await currentCard().getByText('42 / 80 次请求', { exact: true }).waitFor();
  const claudeTerm = await page.evaluate(() => window.reader.readerRequest('/term', {
    request: crypto.randomUUID(), provider: 'claude', model: 'claude-fixture', reasoningEffort: 'medium', term: 'Attention',
  }));
  assert.equal(claudeTerm.text, '已通过 Claude 解释术语', JSON.stringify(claudeTerm));
  claudeDetails = await openAccount('Claude');
  await claudeDetails.getByRole('button', { name: '断开连接', exact: true }).click();
  await claudeDetails.getByLabel('Claude API Key', { exact: true }).waitFor();
  await closeAccount(claudeDetails);
  await app.evaluate(({ protocol }) => protocol.unhandle('https'));

  await previousCard().click();
  const glmDetails = await openAccount('GLM');
  await glmDetails.getByLabel('GLM API Key', { exact: true }).fill('fixture-glm');
  await glmDetails.getByRole('button', { name: '验证并连接' }).click();
  await glmDetails.getByRole('button', { name: '刷新模型', exact: true }).waitFor();
  const glmModels = await page.evaluate(() => window.reader.getModelConnection('glm', true));
  assert.deepEqual(glmModels.models.map((entry) => entry.id), ['glm-5.3-flash']);
  const glmTerm = await page.evaluate(() => window.reader.readerRequest('/term', {
    request: crypto.randomUUID(), provider: 'glm', model: 'glm-5.3-flash', reasoningEffort: 'low', term: 'Attention',
  }));
  assert.equal(glmTerm.text, '已通过 GLM 解释术语', JSON.stringify(glmTerm));
  await glmDetails.getByRole('button', { name: '断开连接', exact: true }).click();
  await glmDetails.getByLabel('GLM API Key', { exact: true }).waitFor();
  await closeAccount(glmDetails);
  await previousCard().click();
  kimiDetails = await openAccount('Kimi');
  await kimiDetails.getByRole('button', { name: '断开连接', exact: true }).click();
  await kimiDetails.getByLabel('Kimi API Key', { exact: true }).waitFor();
  await closeAccount(kimiDetails);
  assert.ok(!(await optionValues(questionModel())).some((value) => value.startsWith('kimi:')));
  assert.ok(!(await optionValues(translationModel())).some((value) => value.startsWith('kimi:')));
  await questionModel().selectOption('deepseek:deepseek-flash');
  await questionEffort().selectOption('high');
  await translationModel().selectOption('configured');
  await saveSettings();
  await page.locator('.elr-head-models').getByText('DeepSeek V4.1 Flash', { exact: true }).waitFor({ state: 'attached' });
  assert.deepEqual(await optionValues(page.locator('.elr-head-models select').nth(0)), ['deepseek', 'workbuddy']);
  console.log('PASS compact cards, layered account dialogs, two balances, and actual GLM and Claude requests');

  await page.locator('.elr-settings-btn').click();
  const display = page.locator('.elr-settings-panel');
  await display.locator('select').nth(0).selectOption('ivory');
  await display.locator('select').nth(1).selectOption('blue');
  await display.getByRole('button', { name: '开', exact: true }).click();

  await page.locator('.elr-settings-btn').click();
  await page.locator('.elr-pdf-container[data-elr-page-theme="ivory"]').waitFor();
  await selectRange(0, 14);
  const popup = page.locator('.elr-popup');
  await popup.locator('.elr-popup-head').getByRole('button', { name: /^(重新)?翻译$/ }).waitFor();
  const selectionTools = page.getByRole('toolbar', { name: 'PDF 划词工具栏' });
  await selectionTools.getByRole('button', { name: '解释术语', exact: true }).click();
  const term = page.locator('.elr-term-toggle').filter({ hasText: 'Attention head' }).first();
  await term.waitFor();
  await term.click();
  await page.locator('.elr-term-popover').getByText('注意力头用于聚合上下文信息。', { exact: true }).waitFor();
  await page.locator('.elr-term-popover').getByRole('button', { name: '关闭', exact: true }).click();
  await popup.locator('.elr-popup-head').getByRole('button', { name: /^(重新)?翻译$/ }).click();
  await popup.getByText('注意力头实验', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await popup.waitFor({ state: 'hidden' });
  await page.keyboard.down('Shift');
  await selectRange(15, 26, true);
  await page.keyboard.up('Shift');
  await page.waitForFunction(() => document.querySelector('textarea.elr-sel-edit')?.value.includes('\n\n'));
  assert.match(await page.locator('textarea.elr-sel-edit').inputValue(), /Attention head\s+experiments?$/);
  await page.keyboard.press('Escape');
  await popup.waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: '将功能栏停靠到下方', exact: true }).click();
  await page.locator('.elr-body.dock-bottom').waitFor();
  await page.locator('.elr-terms .elr-detail-split').waitFor();
  await page.locator('.elr-selection-panes.is-side-by-side').waitFor();
  await page.getByRole('button', { name: '将功能栏停靠到右侧', exact: true }).click();
  await page.locator('.elr-body:not(.dock-bottom)').waitFor();
  const termsCard = page.locator('[data-elr-docked-card="terms"] .elr-grip');
  await termsCard.hover();
  await drag(await center(termsCard), { x: 470, y: 210 });
  const floating = page.locator('[data-elr-floating-card="terms"]');
  await floating.waitFor();
  const widthBefore = (await floating.boundingBox()).width;
  const corner = await center(floating.locator('.elr-rz-se'));
  await drag(corner, { x: corner.x + 38, y: corner.y + 26 });
  assert.ok((await floating.boundingBox()).width > widthBefore + 25);
  await drag(await center(floating.locator('.elr-grip')), await center(page.locator('.elr-side-top .elr-card-head')));
  await termsCard.waitFor();
  console.log('PASS plug-in layout, floating cards, Shift selection, appearance, inline translation and term bubble; previous annotations migrated');

  await page.getByRole('button', { name: '分析论文', exact: true }).click();
  await page.getByText('全文分析测试结果。', { exact: true }).waitFor();
  await page.locator('.katex').first().waitFor();
  await page.getByRole('table').first().waitFor();
  await page.getByRole('button', { name: '查看分析模型与时间', exact: true }).click();
  const analysisInfo = page.getByRole('dialog', { name: '查看分析模型与时间', exact: true });
  await analysisInfo.getByText('模型 deepseek / DeepSeek V4.1 Flash', { exact: true }).waitFor();
  await analysisInfo.getByText('推理强度 高', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^参考文献(?: \(\d+\))?$/ }).click();
  await page.getByRole('button', { name: /^(整理参考文献|重新整理参考文献)$/ }).click();
  await page.getByText(/示例研究/).first().waitFor();
  assert.equal(await page.locator('a[href^="https://doi.org/10.1234/fixture"]').first().getAttribute('href'), 'https://doi.org/10.1234/fixture');

  await page.getByRole('button', { name: '插图解释', exact: true }).click();
  const target = await firstPage.boundingBox();
  assert.ok(target);
  await page.mouse.move(target.x + 65, target.y + 50);
  await page.mouse.down();
  await page.mouse.move(target.x + 270, target.y + 150, { steps: 9 });
  await page.mouse.up();
  await page.getByRole('heading', { name: '子图与可见结构', exact: true }).waitFor();
  assert.equal(received.filter((item) => Array.isArray(item.content)).length, 1);
  assert.ok(received.every((call) => call.model === 'deepseek-flash'
    && call.url === '/v1/chat/completions' && call.auth === 'Bearer fixture-deepseek-only'));
  assert.deepEqual(rendererErrors, []);
  console.log('PASS plug-in operations for analysis, staged bibliography and PDF figure selection');

  await selectRange(15, 26);
  await page.waitForFunction(() => /experimen/.test(document.querySelector('.elr-sel-edit')?.value));
  await page.locator('.elr-sel-actions').getByRole('button', { name: '问阅读助手', exact: true }).click();
  const agent = page.locator('.elr-agent-slot');
  await agent.waitFor();
  await selectRange(0, 14);
  await page.waitForFunction(() => document.querySelector('.elr-sel-edit')?.value === 'Attention head');
  await selectionTools.getByRole('button', { name: '引用至阅读助手', exact: true }).click();
  await agent.locator('.elr-agent-compose .elr-agent-quotes li').nth(1).waitFor();
  assert.equal(await agent.locator('.elr-agent-compose .elr-agent-quotes li').count(), 2);
  await agent.getByLabel('向论文提问').fill('如何评估结果？');
  await agent.getByRole('button', { name: '发送', exact: true }).click();
  await agent.locator('.elr-agent-answer .elr-markdown').filter({ hasText: '论文在第二页说明评估流程。' }).waitFor();
  assert.doesNotMatch(await agent.innerText(), /S999/);
  await agent.getByRole('button', { name: /跳到第 2 页 S\d+/ }).first().click();
  await page.getByText('2 / 2', { exact: true }).waitFor();
  await agent.getByRole('button', { name: '总结本页', exact: true }).click();
  await agent.locator('.elr-agent-answer .elr-markdown').filter({ hasText: '本页概述了评估。' }).waitFor();
  await agent.getByLabel('检索范围').selectOption('page');
  await agent.getByLabel('向论文提问').fill('测试停止');
  await agent.getByRole('button', { name: '发送', exact: true }).click();
  await agent.locator('.elr-agent-stream').filter({ hasText: '等待停止的草稿' }).waitFor();
  await agent.getByRole('button', { name: '停止', exact: true }).click();
  await agent.getByRole('button', { name: '发送', exact: true }).waitFor();
  assert.equal(await agent.locator('.elr-agent-turn').count(), 2);
  console.log('PASS Agent selection context, local retrieval, citation jump, follow-up, streaming and cancellation');

  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await page.getByText('2 / 2', { exact: true }).waitFor();
  await app.close();
  app = null;
  page = await launch();
  modelCenter = page.getByRole('dialog', { name: '模型设置', exact: true });
  const ready = page.locator('.pdfViewer .page .textLayer span').first();
  await ready.waitFor();
  await page.getByText('2 / 2', { exact: true }).waitFor();
  await page.locator('.elr-pdf-container[data-elr-page-theme="ivory"]').waitFor();
  await page.locator('.elr-term-toggle').filter({ hasText: 'Attention head' }).first().waitFor();
  await page.getByRole('button', { name: '论文分析', exact: true }).click();
  await page.getByText('全文分析测试结果。', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^参考文献(?: \(\d+\))?$/ }).click();
  await page.locator('a[href^="https://doi.org/10.1234/fixture"]').first().waitFor();
  await page.getByRole('button', { name: '图解', exact: true }).click();
  await page.getByText('子图与可见结构', { exact: true }).first().waitFor();
  assert.deepEqual(rendererErrors, []);
  console.log('PASS plug-in-format research, page position, preferences and terms survive a packaged app restart');
  await page.getByRole('button', { name: '阅读助手', exact: true }).click();
  const restoredAgent = page.locator('.elr-agent-slot');
  await restoredAgent.locator('.elr-agent-answer .elr-markdown').filter({ hasText: '本页概述了评估。' }).waitFor();
  assert.equal(await restoredAgent.locator('.elr-agent-turn').count(), 2);
  console.log('PASS Agent history is restored from the packaged app database');
  await modeButton('对照').click();
  await page.getByRole('region', { name: 'PDF 对照译文' })
    .getByText(savedTranslationText, { exact: true }).waitFor();
  await modeButton('原文').click();
  console.log('PASS paragraph translation is reused after a restart');

  await openModels();
  await questionModel().selectOption('workbuddy:fixture-workbuddy-model');
  await questionEffort().selectOption('high');
  await modelCenter.getByRole('button', { name: '测试问答模型' }).click();
  await modelCenter.getByText('连接成功，模型已返回结果。').waitFor();
  await saveSettings();
  await page.locator('.elr-head-models').getByText('WorkBuddy Fixture', { exact: true }).waitFor({ state: 'attached' });
  assert.ok((await page.locator('.elr-sel-edit').inputValue()).includes('Attention head'));
  await page.locator('.elr-sel-actions').getByRole('button', { name: '翻译', exact: true }).click();
  await page.locator('.elr-sel-text').getByText('已通过 WorkBuddy 翻译', { exact: true }).waitFor();
  assert.deepEqual(rendererErrors, []);
  console.log('PASS WorkBuddy settings and translation through the Windows npm CLI shim');

  const python = process.env.ENGLISH_LIT_READER_SMOKE_PYTHON;
  if (python) {
    execFileSync(python, ['-c', "from pypdf import PdfWriter; import sys; w = PdfWriter(clone_from=sys.argv[1]); w.encrypt('test-password', algorithm='RC4-128'); w.write(sys.argv[2])", pdfPath, encryptedPath]);
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, encryptedPath);
    await page.getByRole('button', { name: '打开 PDF', exact: true }).click();
    const unlock = page.getByRole('dialog').filter({ hasText: '解锁 PDF' });
    await unlock.getByLabel('PDF 密码').fill('wrong-password');
    await unlock.getByRole('button', { name: '打开 PDF', exact: true }).click();
    await unlock.getByText('密码有误，请重试。').waitFor();
    await unlock.getByLabel('PDF 密码').fill('test-password');
    await unlock.getByRole('button', { name: '打开 PDF', exact: true }).click();
    await unlock.waitFor({ state: 'hidden' });
    await page.getByText('加密测试.pdf', { exact: true }).first().waitFor();
    await page.locator('.pdfViewer .page[data-page-number="1"] .textLayer span').filter({ hasText: 'Attention head experiments' }).first().waitFor();
    assert.deepEqual(rendererErrors, []);
    console.log('PASS encrypted PDF prompting, incorrect password, and successful unlock');
  }
} catch (error) {
  if (app) {
    const view = await app.firstWindow().catch(() => null);
    if (view) {
      console.error((await view.locator('body').innerText().catch(() => '')).slice(0, 3500));
      console.error('Selection:', await view.locator('textarea.elr-sel-edit').inputValue({ timeout: 500 }).catch(() => ''), 'Native:', await view.evaluate(() => window.getSelection()?.toString()).catch(() => ''));
    }
  }
  console.error('Renderer errors:', rendererErrors);
  throw error;
} finally {
  await app?.close().catch(() => {});
  if (server.listening) await new Promise((done) => server.close(done));
  await rm(directory, { recursive: true, force: true });
}
