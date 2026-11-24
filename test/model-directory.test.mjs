import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableEfforts, mergeModelOptions } from '../src/model-capabilities.mjs';
import { fetchApiModelDirectory, normalizeModelDirectory } from '../src/model-directory.mjs';
import { apiModelEndpoints, complete, makeMessages, modelSelection } from '../src/model.mjs';

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

test('the Ark catalog offers Doubao chat models with their context and image capabilities', async () => {
  const entries = await fetchApiModelDirectory('doubao', apiModelEndpoints.doubao, 'fake-ark-key', {
    fetcher: async (address, options) => {
      assert.equal(address, 'https://ark.cn-beijing.volces.com/api/v3/models');
      assert.equal(options.headers.Authorization, 'Bearer fake-ark-key');
      return Response.json({ data: [
        { id: 'doubao-seed-2-1-pro-260915', domain: 'VLM', token_limits: { context_window: 1048576 },
          modalities: { input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'doubao-video', domain: 'VideoGeneration' },
        { id: 'doubao-seed-image', domain: 'VLM', modalities: { output_modalities: ['image'] } },
        { id: 'deepseek-v4-flash', domain: 'LLM' },
      ] });
    },
  });
  assert.deepEqual(entries, [{
    id: 'doubao-seed-2-1-pro-260915', label: 'doubao-seed-2-1-pro-260915', images: 'yes', contextWindow: 1048576,
  }]);
});

test('Doubao endpoints and GLM send authenticated chat requests to the official provider', async () => {
  for (const [provider, model, endpoint] of [
    ['doubao', 'ep-20261124123456-example', 'https://ark.cn-beijing.volces.com/api/v3'],
    ['glm', 'glm-5.3', 'https://open.bigmodel.cn/api/paas/v4'],
  ]) {
    const config = modelSelection({ provider, model, endpoint: 'https://user-supplied.test' });
    const messages = makeMessages('test');
    const answer = await complete(config, 'fixture-key', messages, {
      fetcher: async (address, options) => {
        assert.equal(address, endpoint + '/chat/completions');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers.Authorization, 'Bearer fixture-key');
        assert.deepEqual(JSON.parse(options.body), { model, messages, stream: true, max_tokens: 4096 });
        return new Response('data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } });
      },
    });
    assert.equal(answer, 'OK');
  }
});
