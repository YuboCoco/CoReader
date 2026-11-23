import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codexWindows, readCodexSubscription } from '../src/subscriptions.mjs';
import { claudeRateLimits, readDeepSeekBalance, readKimiBalance } from '../src/provider-usage.mjs';

test('Codex windows use the returned remaining percentage and reset timestamp', () => {
  const limits = codexWindows({
    rateLimits: { primary: { usedPercent: 99 } },
    rateLimitsByLimitId: { codex: {
      primary: { usedPercent: 16.5, windowDurationMins: 300, resetsAt: 1795000000 },
      secondary: { usedPercent: 35, windowDurationMins: 10080, resetsAt: 1795500000 },
    } },
  });
  assert.deepEqual(limits, [
    { id: 'secondary', remaining: 65, periodMins: 10080, resetsAt: 1795500000000 },
    { id: 'primary', remaining: 83.5, periodMins: 300, resetsAt: 1795000000000 },
  ]);
  assert.deepEqual(codexWindows({ rateLimits: { primary: { usedPercent: '35' } } }), []);
});

test('Codex account queries use the official local stdio sequence', async () => {
  async function testAppServer() {
    let initialized = false;
    const input = createInterface({ input: process.stdin });
    for await (const line of input) {
      const { method, id, params } = JSON.parse(line);
      if (method === 'initialized') {
        initialized = true;
        continue;
      }
      let result;
      if (method === 'initialize') {
        assert.equal(params.clientInfo.name, 'english_lit_reader');
        result = { userAgent: 'test' };
      } else if (method === 'account/read') {
        assert.ok(initialized);
        assert.deepEqual(params, { refreshToken: false });
        result = { account: { type: 'chatgpt', email: 'reader@example.test', planType: 'plus' } };
      } else if (method === 'account/rateLimits/read') {
        result = { rateLimits: { secondary: { usedPercent: 35, windowDurationMins: 10080, resetsAt: 1795500000 } } };
      } else assert.fail('Unexpected method ' + method);
      console.log(JSON.stringify({ id, result }));
    }
  }

  const program = "import assert from 'node:assert/strict'; import { createInterface } from 'node:readline'; await (" + testAppServer.toString() + ")();";
  const command = { file: process.execPath, args: ['--input-type=module', '-e', program, '--'] };
  const result = await readCodexSubscription({ command, cwd: process.cwd(), version: '0.4.1' });
  assert.equal(result.state, 'connected');
  assert.equal(result.plan, 'plus');
  assert.equal(result.windows[0].remaining, 65);
});

test('Kimi reports only the available balance, including a valid zero', async () => {
  const usage = await readKimiBalance('fixture-kimi', { fetcher: async (url, options) => {
    assert.equal(url, 'https://api.moonshot.cn/v1/users/me/balance');
    assert.equal(options.headers.Authorization, 'Bearer fixture-kimi');
    return Response.json({ code: 0, status: true, data: { available_balance: 0, voucher_balance: 20 } });
  } });
  assert.deepEqual(usage.balances, [{ currency: 'CNY', total: '0' }]);
  await assert.rejects(readKimiBalance('fixture-kimi', {
    fetcher: async () => Response.json({ code: 1, data: { available_balance: 10 } }),
  }), /未返回有效的余额/);
});

test('Claude rate-limit snapshots preserve zero and reject incomplete reports', () => {
  assert.equal(claudeRateLimits(new Headers()), null);
  const snapshot = claudeRateLimits(new Headers({
    'anthropic-ratelimit-requests-limit': '80', 'anthropic-ratelimit-requests-remaining': '0',
    'anthropic-ratelimit-requests-reset': '2026-11-21T01:00:00Z',
  }));
  assert.deepEqual(snapshot.requests, { total: 80, remaining: 0, resetsAt: Date.parse('2026-11-21T01:00:00Z') });
  assert.equal(snapshot.tokens, null);
});

test('DeepSeek balance uses the official read-only endpoint and preserves the reported decimal amounts', async () => {
  const result = await readDeepSeekBalance('fixture-only', {
    fetcher: async (address, options) => {
      assert.equal(address, 'https://api.deepseek.com/user/balance');
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer fixture-only');
      return Response.json({ is_available: true, balance_infos: [
        { currency: 'CNY', total_balance: '179.29', granted_balance: '0.00', topped_up_balance: '179.29' },
      ] });
    },
  });
  assert.equal(result.available, true);
  assert.deepEqual(result.balances, [{ currency: 'CNY', total: '179.29', granted: '0.00', toppedUp: '179.29' }]);
  await assert.rejects(readDeepSeekBalance('fixture-only', { fetcher: async () => new Response(null, { status: 401 }) }), /拒绝授权/);
});
