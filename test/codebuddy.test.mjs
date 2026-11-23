import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readCodeBuddyModels, runCodeBuddy } from '../src/codebuddy.mjs';
import { modelSelection } from '../src/model.mjs';

async function fakeCli() {
  const args = process.argv.slice(1);
  assert.ok(args.includes('--strict-mcp-config') && args.includes('--no-session-persistence'));
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.equal(JSON.parse(args[args.indexOf('--settings') + 1]).disableAllHooks, true);
  assert.ok(args.includes('--model=fixture/text-vision') && args.includes('--effort=high'));
  process.stdin.setEncoding('utf8');
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw);
  assert.equal(input.type, 'user');
  const [text, picture] = input.message.content;
  const emit = (event) => console.log(JSON.stringify(event));
  if (text.text === 'no login') {
    emit({ type: 'assistant', message: { model: 'default-model', content: [{ type: 'text', text: 'Authentication required' }] } });
    emit({ type: 'result', is_error: true });
    return;
  }
  if (text.text === 'wait') {
    await new Promise((done) => setTimeout(done, 20000));
    return;
  }
  assert.equal(text.text, '论文内容'.repeat(18000));
  assert.deepEqual(picture, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AQID' } });
  emit({ type: 'system', subtype: 'init', model: 'fixture/text-vision' });
  emit({ type: 'assistant', message: { model: 'fixture/actual', content: [{ type: 'thinking', thinking: 'hidden' }] } });
  emit({ type: 'result', is_error: false, result: '结果正文' });
}

const fakeProgram = "import assert from 'node:assert/strict'; await (" + fakeCli.toString() + ")();";

async function fakeAcp() {
  assert.ok(process.argv.includes('--acp') && process.argv.includes('--strict-mcp-config'));
  assert.equal(process.argv[process.argv.indexOf('--tools') + 1], '');
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    const { id, method, params } = JSON.parse(line);
    const emit = (response) => console.log(JSON.stringify({ jsonrpc: '2.0', id, ...response }));
    if (method === 'initialize') {
      assert.equal(params.protocolVersion, 1);
      assert.deepEqual(params.clientCapabilities, {});
      emit({ result: { protocolVersion: 1 } });
    } else {
      assert.equal(method, 'session/new');
      assert.deepEqual(params.mcpServers, []);
      if (process.argv.includes('--signed-out')) {
        emit({ error: { code: -32000, message: 'auth_required' } });
        continue;
      }
      emit({ result: { sessionId: 'session-1', configOptions: [
        { id: 'model', category: 'model', currentValue: 'reader-default', options: [
          { value: 'reader-default', name: 'Reader Default' }, { value: 'reader-other', name: 'Reader Other' },
        ] },
        { id: 'reasoning', category: 'thought_level', currentValue: 'medium', options: [
          { value: 'low' }, { value: 'medium' },
        ] },
      ], _meta: { 'codebuddy.ai/userinfo': { userNickname: 'Account fixture' } } } });
    }
  }
}

test('CodeBuddy ACP reads session model metadata without prompts or tool capabilities', async (t) => {
  const workDir = await mkdtemp(join(tmpdir(), 'elr-codebuddy-acp-'));
  t.after(() => rm(workDir, { recursive: true, force: true }));
  const program = "import assert from 'node:assert/strict'; import { createInterface } from 'node:readline'; await (" + fakeAcp.toString() + ")();";
  const command = { file: process.execPath, args: ['--input-type=module', '-e', program, '--'] };
  const result = await readCodeBuddyModels({ command, workDir });
  assert.equal(result.accountName, 'Account fixture');
  assert.deepEqual(result.models, [
    { id: 'reader-default', label: 'Reader Default', efforts: ['low', 'medium'], defaultEffort: 'medium', isDefault: true },
    { id: 'reader-other', label: 'Reader Other' },
  ]);
  await assert.rejects(readCodeBuddyModels({ command: { ...command, args: [...command.args, '--signed-out'] }, workDir }),
    { code: 'AUTH_REQUIRED' });
});

test('WorkBuddy uses CLI model IDs, retains effort and rejects option-shaped values', () => {
  assert.deepEqual(modelSelection({ provider: 'workbuddy', model: 'default', effort: 'high' }), {
    provider: 'workbuddy', endpoint: '', model: 'default', effort: 'high',
    label: 'CLI 默认模型', contextWindow: 16384, images: 'auto',
  });
  assert.throws(() => modelSelection({ provider: 'workbuddy', model: '--help' }), /格式无效/);
});

test('CodeBuddy transports long text and cropped images over stdin and handles login and cancellation', async (t) => {
  const workDir = await mkdtemp(join(tmpdir(), 'elr-codebuddy-test-'));
  t.after(() => rm(workDir, { recursive: true, force: true }));
  const config = modelSelection({ provider: 'workbuddy', model: 'fixture/text-vision', effort: 'high' });
  const messages = (content) => [{ role: 'system', content: 'Test system prompt' }, { role: 'user', content }];
  const locate = () => ({ file: process.execPath, args: ['--input-type=module', '-e', fakeProgram, '--'] });
  let resolved = '';
  const result = await runCodeBuddy(config, messages([
    { type: 'text', text: '论文内容'.repeat(18000) },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } },
  ]), { locate, workDir, onModel: (model) => { resolved = model; } });
  assert.equal(result, '结果正文');
  assert.equal(resolved, 'fixture/actual');
  await assert.rejects(runCodeBuddy(config, messages('no login'), { locate, workDir }), /请先在 CodeBuddy CLI 中登录/);
  await assert.rejects(runCodeBuddy(config, messages('test'), { locate: () => null, workDir }), /未检测到/);
  const signal = AbortSignal.timeout(350);
  await assert.rejects(runCodeBuddy(config, messages('wait'), { locate, workDir, signal }), { name: 'TimeoutError' });
});
