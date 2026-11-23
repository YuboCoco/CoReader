import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatGPTAuth, verifyIdentity } from '../src/chatgpt.mjs';
import { complete, modelSelection } from '../src/model.mjs';
import { analyzePaper, analyzeFigure, organizeReferences, referenceWindow, resolveReferenceBatch } from '../src/research.mjs';

const signal = new AbortController().signal;

test('complete paper coverage and saved notes survive a synthesis failure', async () => {
  const items = ['A technical method.\n'.repeat(2200), 'Detailed results and ablation.\n'.repeat(500)];
  const input = { text: items.join('\n\n'), pageTextLengths: items.map((s) => s.length) };
  const large = { context: { contextWindow: 120000 } };
  const direct = await analyzePaper(async (_system, user) => {
    assert.match(user, /Detailed results and ablation/);
    return '## 论文概览\n研究方法。';
  }, large, input, signal, () => {});
  assert.equal(direct.mode, 'direct');
  assert.deepEqual(direct.coverage.pages, [[1, 2]]);

  const small = { context: { contextWindow: 6000 } };
  const partial = await analyzePaper(async (system) => {
    if (system.startsWith('Synthesize')) throw new Error('synthesis interrupted');
    return 'Method and ablation identified.';
  }, small, input, signal, () => {});
  assert.equal(partial.mode, 'notes');
  assert.ok(partial.summaryDraft.notes.length > 1);
  assert.deepEqual(partial.coverage.pages, [[1, 2]]);
  const recovered = await analyzePaper(async (system) => {
    assert.match(system, /^Synthesize/);
    return '## 技术方案\n恢复成功。';
  }, small, { ...input, summaryDraft: partial.summaryDraft }, signal, () => {});
  assert.equal(recovered.mode, 'map-reduce');
});

test('bibliography verifies a printed DOI and excludes appendix items', async () => {
  const text = 'References\n[1] Jane Smith. Example Study. 2020. doi:10.1234/fixture\nAppendix A\n[1] Measurement unit';
  let streamed = 0;
  const parsed = await organizeReferences(async (system, input) => {
    assert.match(system, /bibliographic references/);
    assert.match(input, /2\| \[1\] Jane Smith/);
    return JSON.stringify({
      headingLine: 1, endLine: 3,
      entries: [{ startLine: 2, endLine: 2, number: '[1]', title: 'Example Study', firstAuthor: 'Jane Smith', year: '2020',
        printedAddress: '10.1234/fixture' }],
    });
  }, { text, pageLineCounts: [4] }, null, signal, () => { streamed++; }, () => {});
  assert.ok(streamed > 0);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].status, 'provided');
  assert.equal(parsed.entries[0].url, 'https://doi.org/10.1234/fixture');
});

test('bibliography displays an original address even when the model omits it', async () => {
  const text = 'References\n[1] Jane Smith. Study. 2020. https://example.org/study.\n[2] James Lee. Another Study. 2021. arXiv:2101.12345';
  const result = await referenceWindow(async () => JSON.stringify({
    headingLine: 1,
    entries: [
      { startLine: 2, endLine: 2, title: 'Study', printedAddress: 'https://example.org/incorrect' },
      { startLine: 3, endLine: 3, title: 'Another Study', printedAddress: '' },
    ],
  }), { text }, signal);
  assert.deepEqual(result.entries.map(({ status, url }) => [status, url]), [
    ['provided', 'https://example.org/study'],
    ['provided', 'https://arxiv.org/abs/2101.12345'],
  ]);
});

test('the bibliography model can select an indexed result but cannot supply a new address', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(new URL(url).hostname, 'api.crossref.org');
    return Response.json({ message: { items: ['First Journal', 'Second Journal'].map((venue, index) => ({
      title: ['Example Study'], DOI: '10.1234/study-' + index, 'container-title': [venue],
      author: [{ family: 'Smith' }], issued: { 'date-parts': [[2020]] },
    })) } });
  });
  const rows = [{ id: 'line-1', title: 'Example Study', authors: 'Jane Smith', year: '2020', venue: 'Second Journal' }];
  const selected = await resolveReferenceBatch(rows, signal, '', async (prompt, input) => {
    assert.match(prompt, /scholarly index candidate/);
    assert.equal(JSON.parse(input).candidates[1].venue, 'Second Journal');
    return '{"candidate":1,"url":"https://example.org/ignored"}';
  });
  assert.equal(selected[0].url, 'https://doi.org/10.1234/study-1');
  const rejected = await resolveReferenceBatch(rows, signal, '', async () => '{"candidate":5}');
  assert.deepEqual(rejected, [{ id: 'line-1', status: 'none' }]);
});

test('figure calls include only one image and its page context', async () => {
  const image = 'data:image/jpeg;base64,ZmFrZQ==';
  const result = await analyzeFigure(async (_system, input) => {
    assert.match(input[0].text, /第 2 页/);
    assert.match(input[0].text, /A figure caption/);
    assert.deepEqual(input[1], { type: 'image_url', image_url: { url: image } });
    return '## 图表说明\n一幅试验图。';
  }, { image, page: 2, context: 'A figure caption', position: { x: 0.2, y: 0.3 } }, signal);
  assert.equal(result.page, 2);
  assert.match(result.text, /试验图/);
});

test('Claude uses native image blocks and exposes only answer text from the stream', async () => {
  const config = modelSelection({ provider: 'claude', model: 'claude-fixture', effort: 'medium' });
  const messages = [{ role: 'system', content: 'Explain the figure.' }, { role: 'user', content: [
    { type: 'text', text: 'Figure 1' },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,ZmFrZQ==' } },
  ] }];
  const models = [];
  const result = await complete(config, 'fixture-claude', messages, {
    onModel: (model) => models.push(model),
    fetcher: async (url, options) => {
      assert.equal(url, 'https://api.anthropic.com/v1/messages');
      assert.equal(options.headers['x-api-key'], 'fixture-claude');
      const payload = JSON.parse(options.body);
      assert.equal(payload.system, 'Explain the figure.');
      assert.deepEqual(payload.output_config, { effort: 'medium' });
      assert.deepEqual(payload.messages, [{ role: 'user', content: [
        { type: 'text', text: 'Figure 1' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'ZmFrZQ==' } },
      ] }]);
      const frames = [
        ['message_start', { message: { model: 'claude-fixture-actual' } }],
        ['content_block_delta', { delta: { type: 'thinking_delta', thinking: 'hidden' } }],
        ['content_block_delta', { delta: { type: 'text_delta', text: '图解' } }],
        ['message_delta', { delta: { stop_reason: 'end_turn' } }], ['message_stop', {}],
      ];
      const body = frames.map(([type, frame]) => 'event: ' + type + '\ndata: ' + JSON.stringify(frame) + '\n\n').join('');
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  assert.equal(result, '图解');
  assert.deepEqual(models, ['claude-fixture-actual']);
});

test('ChatGPT subscription uses the public Responses API with vision input and no API-only fields', async () => {
  const config = modelSelection({ provider: 'chatgpt', endpoint: 'http://127.0.0.1', model: 'fixture', effort: 'high' });
  const messages = [{ role: 'system', content: 'Read paper' }, { role: 'user', content: [
    { type: 'text', text: 'image' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,ZmFrZQ==' } },
  ] }];
  const text = await complete(config, 'fixture-oauth', messages, {
    fetcher: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options.headers.Authorization, 'Bearer fixture-oauth');
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.equal(body.stream, true);
      assert.equal(body.max_output_tokens, undefined);
      assert.equal(body.instructions, 'Read paper');
      assert.equal(body.input[0].content[1].type, 'input_image');
      assert.deepEqual(body.reasoning, { effort: 'high' });
      return new Response('data: {"type":"response.output_text.delta","delta":"图解"}\n\n'
        + 'data: {"type":"response.completed","response":{"model":"actual-fixture"}}\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  assert.equal(text, '图解');
});

test('ChatGPT decodes named SSE events even when the response header says JSON', async () => {
  const config = modelSelection({ provider: 'chatgpt', model: 'fixture' });
  const payload = new TextEncoder().encode(
    'event: response.created\r\ndata: {"response":{"model":"fixture-streamed"}}\r\n\r\n'
    + ': keepalive\r\n\r\n'
    + 'event: response.output_text.delta\r\ndata: {"delta":\r\ndata: "论文"}\r\n\r\n'
    + 'event: response.output_text.delta\r\ndata: {"delta":"回答"}\r\n\r\n'
    + 'event: response.completed\r\ndata: {"response":{"model":"fixture-streamed"}}\r\n\r\n',
  );
  const updates = [];
  const models = [];
  const result = await complete(config, 'fixture-oauth', [{ role: 'user', content: 'question' }], {
    onText: (text) => updates.push(text),
    onModel: (model) => models.push(model),
    fetcher: async () => new Response(new ReadableStream({
      start(controller) {
        for (let i = 0; i < payload.length; i += 2) controller.enqueue(payload.subarray(i, i + 2));
        controller.close();
      },
    }), { headers: { 'Content-Type': 'application/json' } }),
  });
  assert.equal(result, '论文回答');
  assert.deepEqual(updates, ['论文', '论文回答']);
  assert.equal(models.at(-1), 'fixture-streamed');
});

test('the response body takes precedence for JSON replies and malformed streams have a readable error', async () => {
  const config = modelSelection({ provider: 'chatgpt', model: 'fixture' });
  const messages = [{ role: 'user', content: 'question' }];
  const sse = { headers: { 'Content-Type': 'text/event-stream' } };
  const text = await complete(config, 'fixture-oauth', messages, {
    fetcher: async () => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '完成' }] }] }, sse),
  });
  assert.equal(text, '完成');
  await assert.rejects(complete(config, 'fixture-oauth', messages, {
    fetcher: async () => new Response('event: response.output_text.delta\ndata: broken payload\n\n', sse),
  }), /模型服务返回了无法解析的流式数据/);
  await assert.rejects(complete(config, 'fixture-oauth', messages, {
    fetcher: async () => new Response('data: {"type":"response.output_text.delta","delta":"未完成"}\n\ndata: [DONE]\n\n'),
  }), /生成连接提前断开/);
});

test('ChatGPT usage limits produce the same guidance for HTTP and stream failures', async () => {
  const config = modelSelection({ provider: 'chatgpt', model: 'fixture' });
  const messages = [{ role: 'user', content: 'fixture' }];
  const error = { code: 'subscription_sharing_usage_limit_exceeded' };
  const responses = [
    Response.json({ error }, { status: 429 }),
    new Response('data: ' + JSON.stringify({ type: 'response.failed', response: { error } }) + '\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } }),
  ];
  for (const response of responses) {
    await assert.rejects(complete(config, 'fixture-oauth', messages, { fetcher: async () => response }), /订阅已达用量上限/);
  }
});

test('ChatGPT transport errors identify the failing operation without exposing credentials', async () => {
  const fail = async () => { throw new TypeError('net::ERR_PROXY_CONNECTION_FAILED'); };
  const auth = createChatGPTAuth({
    read: () => ({ active: 'fixture', accounts: [{
      client: 'fixture', access: 'opaque-credential', expiry: Date.now() + 120000, scopes: ['chatgpt.tokens.use.direct'],
    }] }),
    fetcher: fail,
  });
  await assert.rejects(auth.models(), /读取可用模型失败。无法连接 api\.openai\.com（ERR_PROXY_CONNECTION_FAILED）/);
  const config = modelSelection({ provider: 'chatgpt', model: 'fixture' });
  await assert.rejects(
    complete(config, 'opaque-credential', [{ role: 'user', content: 'fixture' }], { fetcher: fail }),
    /请求模型失败。无法连接 api\.openai\.com（ERR_PROXY_CONNECTION_FAILED）/,
  );
});

test('ChatGPT authorization binds callback and identity and rotates an expiring token', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256' }] };
  let oauth;
  let encryptedStore;
  const client = 'oaiapp_fixture';
  const scopes = 'openid email offline_access resource.invoke chatgpt.tokens.use.direct';
  const idToken = () => {
    const header = { alg: 'RS256', kid: 'fixture' };
    const claims = { iss: 'https://auth.openai.com', aud: client, nonce: oauth.searchParams.get('nonce'),
      exp: Math.floor(Date.now() / 1000) + 600, sub: 'fixture-account', email: 'reader@example.test' };
    const input = [header, claims].map((value) => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    return input + '.' + sign('sha256', Buffer.from(input), privateKey).toString('base64url');
  };
  const auth = createChatGPTAuth({
    read: () => encryptedStore,
    write: (value) => { encryptedStore = value; },
    async openBrowser(url) {
      oauth = new URL(url);
      assert.match(oauth.searchParams.get('ext_agent_host_id'), /^urn:uuid:/);
      assert.equal(oauth.searchParams.get('client_id'), 'dynamic_agent_client');
      const reply = new URL(oauth.searchParams.get('redirect_uri'));
      reply.searchParams.set('state', 'wrong');
      assert.equal((await fetch(reply)).status, 400);
      reply.searchParams.set('state', oauth.searchParams.get('state'));
      reply.searchParams.set('client_id', client);
      reply.searchParams.set('code', 'one-time-code');
      assert.equal((await fetch(reply)).status, 200);
    },
    async fetcher(url, options) {
      if (url.endsWith('/oauth/token')) {
        const params = options.body;
        assert.equal(params.get('client_id'), client);
        if (params.get('grant_type') === 'refresh_token') {
          assert.equal(params.get('refresh_token'), 'first-refresh');
          return Response.json({ access_token: 'renewed', refresh_token: 'second-refresh', token_type: 'Bearer', expires_in: 3600 });
        }
        assert.equal(params.get('code'), 'one-time-code');
        assert.equal(params.get('redirect_uri'), oauth.searchParams.get('redirect_uri'));
        assert.equal(createHash('sha256').update(params.get('code_verifier')).digest('base64url'), oauth.searchParams.get('code_challenge'));
        return Response.json({ access_token: 'old', refresh_token: 'first-refresh', id_token: idToken(),
          token_type: 'Bearer', scope: scopes, expires_in: 1 });
      }
      if (url.endsWith('/openid-configuration')) return Response.json({
        issuer: 'https://auth.openai.com', jwks_uri: 'https://auth.openai.com/jwks',
        revocation_endpoint: 'https://auth.openai.com/revoke',
      });
      if (url.endsWith('/jwks')) return Response.json(jwks);
      if (url.endsWith('/models')) {
        assert.equal(options.headers.Authorization, 'Bearer renewed');
        return Response.json({ models: [{ visibility: 'list', slug: 'fixture', display_name: 'Fixture' },
          { visibility: 'hide', slug: 'hidden' }] });
      }
      if (url.endsWith('/revoke')) {
        assert.equal(options.body.get('token'), 'second-refresh');
        return new Response(null, { status: 200 });
      }
      throw new Error('Unexpected test request');
    },
  });
  assert.equal((await auth.signIn()).connected, true);
  assert.throws(() => verifyIdentity(idToken(), jwks, client, 'incorrect nonce'), /身份验证失败/);
  assert.equal(await auth.token(), 'renewed');
  assert.deepEqual((await auth.models()).map((item) => item.id), ['fixture']);
  assert.equal((await auth.signOut()).connected, false);
});
