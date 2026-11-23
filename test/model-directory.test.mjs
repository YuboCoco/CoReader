import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableEfforts, mergeModelOptions } from '../src/model-capabilities.mjs';
import { fetchApiModelDirectory, normalizeModelDirectory } from '../src/model-directory.mjs';

test('model-specific metadata overrides documented choices and distinguishes unknown from unavailable', () => {
  const models = normalizeModelDirectory([
    { id: 'gpt-5.5', isDefault: true, supportedReasoningEfforts: [
      { reasoningEffort: 'medium' }, { reasoningEffort: 'xhigh' }, { reasoningEffort: 'fake' },
    ], defaultReasoningEffort: 'medium' },
    { id: 'instant', supportedReasoningEfforts: [] },
    { id: 'old' },
    { id: 'hidden', hidden: true },
  ], 'codex');
  assert.equal(models.length, 3);
  const [defaultModel] = mergeModelOptions({ provider: 'codex', model: 'default' }, models);
  assert.match(defaultModel.label, /gpt-5\.5/);
  assert.deepEqual(availableEfforts('codex', 'default', defaultModel),
    { ids: ['medium', 'xhigh'], source: 'service', defaultId: 'medium' });
  assert.deepEqual(availableEfforts('codex', 'instant', models[1]).ids, []);
  assert.equal(availableEfforts('codex', 'old', models[2]).source, 'manual');
  assert.equal(availableEfforts('kimi', 'kimi-k3.1-pro').source, 'docs');
  assert.deepEqual(availableEfforts('kimi', 'kimi-k3.1-pro', { efforts: ['low'] }).ids, ['low']);
  assert.deepEqual(availableEfforts('openai', 'gpt-4.1-2025-04-14').ids, []);
});

test('HTTP model discovery fetches only the authenticated catalog and omits non-text models', async () => {
  const rows = await fetchApiModelDirectory('openai', 'https://api.openai.com/v1', 'fixture', {
    fetcher: async (address, options) => {
      assert.equal(address, 'https://api.openai.com/v1/models');
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer fixture');
      assert.equal(options.body, undefined);
      return Response.json({ data: [
        { id: 'gpt-4.1' }, { id: 'text-embedding-3-small' }, { id: 'gpt-image-1' }, { id: 'gpt-4.1' },
      ] });
    },
  });
  assert.deepEqual(rows, [{ id: 'gpt-4.1', label: 'gpt-4.1' }]);
  await assert.rejects(fetchApiModelDirectory('compatible', 'https://example.test/v1', '', {
    fetcher: async () => new Response(null, { status: 405 }),
  }), /未提供可用模型目录/);
});
