import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openLibrary } from '../src/library.mjs';
import { complete } from '../src/model.mjs';
import { runReadingAgent } from '../src/reading-agent.mjs';

const request = {
  question: '这些结果说明什么？', page: 1, pageCount: 3, scope: 'paper',
  pages: [
    { page: 1, text: 'We use an attention mechanism.' },
    { page: 2, text: 'Evaluation accuracy reaches 92.4 percent.' },
    { page: 3, text: 'Unrelated bibliography sentinel' },
  ],
  quotes: [{ page: 1, end: 1, text: 'attention mechanism' }],
};

test('Agent plans local retrieval and makes only validated passages citable', async () => {
  const stages = [];
  let calls = 0;
  const turn = await runReadingAgent(request, {
    documentName: 'Fixture paper.pdf',
    history: [{ question: '用了什么机制？', text: '注意力机制 [S9]' }],
    progress: (stage, text) => stages.push([stage, text]),
    modelCall: async (_system, input, options) => {
      const data = JSON.parse(input);
      assert.equal(options.requireComplete, true);
      assert.equal(data.recent[0].question, '用了什么机制？');
      if (++calls === 1) {
        assert.equal(data.sources, undefined);
        assert.doesNotMatch(input, /sentinel|92\.4/);
        return '{"queries":["evaluation accuracy"],"pages":[2,999]}';
      }
      assert.ok(data.sources.some((source) => source.kind === 'selection' && source.page === 1));
      assert.doesNotMatch(input, /sentinel/);
      const supporting = data.sources.find((source) => source.page === 2);
      assert.match(supporting.text, /92\.4/);
      options.onText('草稿片段');
      return '准确率为 92.4%。 [' + supporting.id + '] [S99]';
    },
  });
  assert.equal(calls, 2);
  assert.doesNotMatch(turn.text, /S99/);
  assert.deepEqual(turn.sources.filter((source) => source.cited).map((source) => source.page), [2]);
  assert.deepEqual(stages.map(([phase]) => phase), ['planning', 'reading', 'answering', 'answering']);
});

test('Agent current-page mode excludes other pages and does not generate after abort', async () => {
  let calls = 0;
  const signal = AbortSignal.abort();
  await assert.rejects(runReadingAgent(request, { signal, modelCall: () => assert.fail() }), { name: 'AbortError' });
  await runReadingAgent({ ...request, scope: 'page', page: 2, quotes: [] }, {
    modelCall: async (_system, input) => {
      calls++;
      assert.deepEqual(JSON.parse(input).sources.map(({ page }) => page), [2]);
      return '这是本页的实验。 [S1]';
    },
  });
  assert.equal(calls, 1);
});

test('Agent rejects an incomplete stream before treating it as a finished answer', async () => {
  const config = { provider: 'compatible', endpoint: 'http://localhost', model: 'test', effort: 'default' };
  const fetcher = async () => new Response('data: {"choices":[{"delta":{"content":"draft"}}]}\n\n', {
    headers: { 'Content-Type': 'text/event-stream' },
  });
  await assert.rejects(complete(config, '', [{ role: 'user', content: 'question' }], { fetcher, requireComplete: true }), /提前断开/);
});

test('Agent history is persisted and isolated by PDF', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'elr-agent-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const firstPath = join(directory, 'first.pdf');
  const secondPath = join(directory, 'second.pdf');
  await writeFile(firstPath, '%PDF-1.4\nfixture first');
  await writeFile(secondPath, '%PDF-1.4\nfixture second');
  const library = openLibrary(directory);
  const first = await library.importFile(firstPath);
  const second = await library.importFile(secondPath);
  const turn = { id: 'first-turn', question: 'Question', text: 'Answer', sources: [] };
  library.appendAgentTurn(first.id, turn);
  assert.deepEqual(library.agentHistory(second.id), []);
  library.close();
  const reopened = openLibrary(directory);
  assert.deepEqual(reopened.agentHistory(first.id), [turn]);
  reopened.close();
});
