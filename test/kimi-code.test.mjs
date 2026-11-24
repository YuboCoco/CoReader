import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { createKimiCode } from '../src/kimi-code.mjs';

test('Kimi Code authorizes through its local service and uses only managed models', async () => {
  const temp = resolve(tmpdir());
  const home = await mkdtemp(join(temp, 'elr-kimi-code-test-'));
  const controller = new AbortController();
  const opened = [];
  const reads = [];
  let auth = false;
  const name = 'managed:kimi-code';
  const model = name + '/test-model';
  const callback = 'https://www.kimi.com/code/device';
  const executable = join(home, 'server.mjs');
  await writeFile(executable, 'console.log(JSON.stringify({ origin: "http://127.0.0.1:43121", token: "local-test-token" })); setInterval(() => {}, 1000);');
  const adapter = createKimiCode({ home, signal: controller.signal, openBrowser: async (url) => { opened.push(url); },
    locate: async () => ({ file: process.execPath, args: [executable] }),
    async fetcher(url, options) {
      assert.equal(options.headers.Authorization, 'Bearer local-test-token');
      assert.equal(options.redirect, 'error');
      const address = new URL(url);
      assert.equal(address.origin, 'http://127.0.0.1:43121');
      const path = address.pathname.slice('/api/v1'.length);
      const data = options.body ? JSON.parse(options.body) : null;
      reads.push(options.method + ' ' + path);
      let result;
      switch (options.method + ' ' + path) {
        case 'GET /auth':
          result = { managed_provider: auth ? { name, status: 'authenticated' } : null };
          break;
        case 'POST /oauth/login':
          assert.equal(data.provider, name);
          result = { status: 'pending', verification_uri_complete: 'https://evil.test/auth', verification_uri: callback,
            user_code: 'TEST-ONLY', interval: 5, expires_in: 60 };
          break;
        case 'GET /oauth/login':
        case 'DELETE /oauth/login':
          assert.equal(address.searchParams.get('provider'), name);
          result = { status: options.method === 'DELETE' ? 'cancelled' : 'authenticated' };
          auth = options.method === 'GET';
          break;
        case 'GET /models':
          result = { items: [
            { provider: 'openai', model: 'other/model' },
            { provider: name, model, display_name: 'Kimi subscription model', max_context_size: 128000,
              capabilities: ['image_in'], support_efforts: ['high'], default_effort: 'high' },
          ] };
          break;
        case 'POST /sessions':
          assert.equal(data.agent_config.model, model);
          assert.equal(data.agent_config.permission_mode, 'manual');
          assert.equal(data.metadata.cwd, join(home, 'requests'));
          result = { id: 'session_fixture' };
          break;
        case 'POST /sessions/session_fixture/prompts':
          assert.equal(data.thinking, 'high');
          assert.deepEqual(data.content, [
            { type: 'text', text: '任务指令：\nReply OK' },
            { type: 'image', source: { kind: 'base64', media_type: 'image/png', data: 'YQ==' } },
          ]);
          result = { prompt_id: 'prompt_fixture', status: 'running' };
          break;
        case 'GET /sessions/session_fixture':
          result = { main_turn_active: false, pending_interaction: 'none', last_turn_reason: 'completed' };
          break;
        case 'GET /sessions/session_fixture/messages':
          result = { items: [{ content: [{ type: 'thinking', text: 'hidden' }, { type: 'text', text: 'OK' }] }] };
          break;
        case 'POST /sessions/session_fixture:archive':
          result = { archived: true };
          break;
        case 'POST /oauth/logout':
          assert.equal(data.provider, name);
          auth = false;
          result = {};
          break;
        default:
          assert.fail('Unexpected request: ' + options.method + ' ' + path);
      }
      return Response.json({ code: 0, data: result });
    },
  });
  try {
    await assert.rejects(adapter.models(), /请先在模型设置中登录/);
    const login = await adapter.beginLogin();
    assert.equal(login.status, 'pending');
    assert.equal(login.userCode, 'TEST-ONLY');
    assert.deepEqual(opened, [callback]);
    await adapter.cancelLogin();
    assert.equal((await adapter.pollLogin()).status, 'cancelled');

    await adapter.beginLogin();
    assert.equal((await adapter.pollLogin()).status, 'authenticated');
    assert.deepEqual(await adapter.models(), [
      { id: model, label: 'Kimi subscription model', images: 'yes', contextWindow: 128000, efforts: ['high'], defaultEffort: 'high' },
    ]);
    const config = await readFile(join(home, 'config.toml'), 'utf8');
    assert.match(config, /\[tools\]\nenabled = \["\*"\]/);
    const response = await adapter.complete({ model, effort: 'high' }, [
      { role: 'system', content: 'Reply OK' },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,YQ==' } }] },
    ]);
    assert.equal(response, 'OK');
    assert.ok(reads.includes('POST /sessions/session_fixture:archive'));
    await adapter.disconnect();
    await assert.rejects(adapter.models(), /请先在模型设置中登录/);
  } finally {
    controller.abort();
    if (dirname(home) === temp && basename(home).startsWith('elr-kimi-code-test-')) await rm(home, { recursive: true, force: true, maxRetries: 5 });
  }
});
