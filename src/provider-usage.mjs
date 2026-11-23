const balanceAmount = (value) => typeof value === 'string' && /^-?\d{1,15}(?:\.\d{1,8})?$/.test(value) ? value : null;

export async function readDeepSeekBalance(key, { signal, fetcher = fetch } = {}) {
  if (!key) throw new Error('请先在模型设置中保存 DeepSeek API Key。');
  let response;
  try {
    response = await fetcher('https://api.deepseek.com/user/balance', {
      method: 'GET', headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' }, redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error('无法读取 DeepSeek 余额，请检查网络后重试。');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if ([401, 403].includes(response.status)) throw new Error('DeepSeek 拒绝授权，请检查已保存的 API Key。');
    throw new Error('DeepSeek 余额暂不可用（HTTP ' + response.status + '）。');
  }
  const data = await response.json().catch(() => null);
  if (!Array.isArray(data?.balance_infos) || typeof data.is_available !== 'boolean') throw new Error('DeepSeek 未返回有效的余额。');
  const balances = data.balance_infos.slice(0, 8).flatMap((entry) => {
    const total = balanceAmount(entry?.total_balance);
    if (!['CNY', 'USD'].includes(entry?.currency) || total === null) return [];
    return [{ currency: entry.currency, total, granted: balanceAmount(entry.granted_balance), toppedUp: balanceAmount(entry.topped_up_balance) }];
  });
  return { checkedAt: Date.now(), available: data.is_available, balances };
}

export async function readKimiBalance(key, { signal, fetcher = fetch } = {}) {
  const timeout = AbortSignal.timeout(12000);
  let response;
  try {
    response = await fetcher('https://api.moonshot.cn/v1/users/me/balance', {
      method: 'GET', headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
      redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw new Error('无法读取 Kimi 余额，请检查网络后重试。');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Kimi 余额暂不可用（HTTP ' + response.status + '）。');
  }
  const result = await response.json().catch(() => null);
  const total = balanceAmount(String(result?.data?.available_balance ?? ''));
  if (result?.code !== 0 || result.status === false || total === null) throw new Error('Kimi 未返回有效的余额。');
  return { checkedAt: Date.now(), balances: [{ currency: 'CNY', total }] };
}

export function claudeRateLimits(headers) {
  const read = (metric) => {
    const prefix = 'anthropic-ratelimit-' + metric + '-';
    const limit = headers.get(prefix + 'limit');
    const remaining = headers.get(prefix + 'remaining');
    const resetsAt = Date.parse(headers.get(prefix + 'reset') || '');
    if (!/^\d+$/.test(limit || '') || !/^\d+$/.test(remaining || '') || !Number.isFinite(resetsAt)) return null;
    const total = Number(limit);
    const left = Number(remaining);
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(left) || total < 1 || left > total) return null;
    return { total, remaining: left, resetsAt };
  };
  const requests = read('requests');
  const tokens = read('tokens');
  return requests || tokens ? { checkedAt: Date.now(), requests, tokens } : null;
}
