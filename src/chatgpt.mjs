import { createHash, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';
import { createServer } from 'node:http';
import { normalizeModelDirectory } from './model-directory.mjs';

const issuer = 'https://auth.openai.com';
export const chatEndpoint = 'https://api.openai.com/v1';
const scope = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const planPermission = 'chatgpt.tokens.use.direct';
const random = () => randomBytes(32).toString('base64url');

export function chatgptNetworkError(stage, address, failure) {
  const hostname = new URL(address).hostname;
  const chromiumCode = /^net::(ERR_[A-Z0-9_]+)$/.exec(failure?.message)?.[1];
  const code = failure?.cause?.code ?? failure?.code ?? chromiumCode;
  const detail = failure?.name === 'TimeoutError' ? '（请求超时）'
    : typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,60}$/.test(code) ? '（' + code + '）' : '';
  return new Error('ChatGPT ' + stage + '失败。无法连接 ' + hostname + detail
    + '，请检查 Windows 系统代理和网络。', { cause: failure });
}

async function json(fetcher, address, stage, { signal, ...options } = {}) {
  const timeout = AbortSignal.timeout(20000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetcher(address, { ...options, redirect: 'error', signal: requestSignal });
  } catch (failure) {
    signal?.throwIfAborted();
    throw chatgptNetworkError(stage, address, requestSignal.reason || failure);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error('ChatGPT ' + stage + '失败（HTTP ' + response.status + '）。');
    error.code = data.error?.code || data.error;
    error.status = response.status;
    throw error;
  }
  try {
    return await response.json();
  } catch (failure) {
    signal?.throwIfAborted();
    if (failure instanceof SyntaxError) throw new Error('ChatGPT ' + stage + '时返回的数据格式无效。');
    throw chatgptNetworkError(stage, address, requestSignal.reason || failure);
  }
}

function browserCallback(state, signal) {
  let finish;
  const outcome = new Promise((resolve) => { finish = resolve; });
  const server = createServer((req, res) => {
    const address = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method !== 'GET' || address.pathname !== '/auth/callback') {
      res.writeHead(404).end();
      return;
    }
    if (address.searchParams.get('state') !== state) {
      res.writeHead(400).end('Invalid authorization state');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('已收到授权回调。可以关闭此页，返回 CoReader 查看结果。');
    finish({ params: address.searchParams });
  });
  signal.addEventListener('abort', () => finish({ cancelled: true }), { once: true });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        redirect: 'http://127.0.0.1:' + server.address().port + '/auth/callback',
        outcome,
        close: () => { server.close(); server.closeAllConnections(); },
      });
    });
  });
}

export function verifyIdentity(token, jwks, client, nonce, now = Math.floor(Date.now() / 1000)) {
  const pieces = String(token || '').split('.');
  if (pieces.length !== 3) throw new Error('ChatGPT 返回的身份凭据无法验证。');
  const [header, payload] = pieces.slice(0, 2).map((part) => JSON.parse(Buffer.from(part, 'base64url')));
  const jwk = jwks.keys?.find((key) => key.kid === header.kid && (!key.alg || key.alg === header.alg)
    && (!key.use || key.use === 'sig'));
  if (!jwk || !['RS256', 'ES256'].includes(header.alg)) throw new Error('无法找到 ChatGPT 身份签名密钥。');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const signed = Buffer.from(pieces[0] + '.' + pieces[1], 'ascii');
  const signatureKey = header.alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key;
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!verify('sha256', signed, signatureKey, Buffer.from(pieces[2], 'base64url'))
    || payload.iss !== issuer || !audience.includes(client) || (audience.length > 1 && payload.azp !== client)
    || !Number.isFinite(payload.exp) || payload.exp <= now || payload.nonce !== nonce
    || typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('ChatGPT 身份验证失败，请重新登录。');
  }
  return { subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : '' };
}

export function createChatGPTAuth({ read, write, openBrowser, fetcher = fetch }) {
  let activeFlow;
  const refreshes = new Map();
  const state = () => read() || { host: '', active: '', accounts: [] };
  const account = (id) => state().accounts.find((item) => item.client === id);
  const current = () => account(state().active);
  const enabled = (item) => Boolean(item?.access && item.scopes?.includes(planPermission));
  const storeAccount = (item) => {
    const previous = state();
    const accounts = [...previous.accounts.filter((old) => old.client !== item.client), item];
    write({ ...previous, active: item.client, accounts });
  };
  const config = (signal) => json(fetcher, issuer + '/.well-known/openid-configuration', '读取身份服务配置', { signal });
  function issuerUrl(address) {
    if (new URL(address).origin !== issuer) throw new Error('ChatGPT 服务地址验证失败。');
    return address;
  }
  const postForm = (body, stage, signal) => json(fetcher, issuer + '/api/accounts/oauth/token', stage, {
    method: 'POST', body: new URLSearchParams(body), signal,
  });
  function credentials(tokens, previous = {}) {
    if (typeof tokens.access_token !== 'string' || String(tokens.token_type || '').toLowerCase() !== 'bearer'
      || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new Error('ChatGPT 未返回有效的访问凭据。');
    return {
      access: tokens.access_token,
      refresh: tokens.refresh_token || previous.refresh || '',
      expiry: Date.now() + tokens.expires_in * 1000,
      scopes: typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : (previous.scopes || []),
    };
  }
  function status() {
    const { active, accounts } = state();
    return {
      active,
      connected: enabled(current()),
      accounts: accounts.map(({ client, email }) => ({ client, email })),
    };
  }

  return {
    status,
    cancel() { activeFlow?.abort(); },
    async signIn(selected) {
      if (activeFlow) throw new Error('已有 ChatGPT 授权在进行。');
      const previous = selected ? account(selected) : null;
      if (selected && !previous) throw new Error('找不到该 ChatGPT 注册记录。');
      const abort = new AbortController();
      activeFlow = abort;
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(180000)]);
      let listener;
      try {
        const before = state();
        const host = before.host || 'urn:uuid:' + randomUUID();
        if (!before.host) write({ ...before, host });
        const marker = random();
        const nonce = random();
        const verifier = random();
        listener = await browserCallback(marker, signal);
        const address = new URL(issuer + '/api/accounts/authorize');
        address.search = new URLSearchParams({
          client_id: previous?.client || 'dynamic_agent_client', ext_agent_host_id: host,
          ...(previous ? {} : { agent_name_hint: 'CoReader' }),
          ...(previous?.idToken ? { id_token_hint: previous.idToken } : {}),
          ...(previous?.email ? { login_hint: previous.email } : {}),
          ...(previous && !enabled(previous) ? { prompt: 'consent' } : {}),
          response_type: 'code', redirect_uri: listener.redirect, scope, resource: chatEndpoint,
          state: marker, nonce, code_challenge_method: 'S256',
          code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        });
        await openBrowser(address.href);
        const returned = await listener.outcome;
        signal.throwIfAborted();
        const params = returned.params;
        if (params?.has('error')) throw new Error('ChatGPT 授权未完成。可以重试，或使用 API Key。');
        const client = params?.get('client_id') || previous?.client;
        const code = params?.get('code');
        if (!code || !/^[A-Za-z0-9_-]{4,256}$/.test(client || '') || client === 'dynamic_agent_client'
          || (previous && client !== previous.client)) {
          throw new Error('ChatGPT 授权回调无效。');
        }
        const tokens = await postForm({
          grant_type: 'authorization_code', code, client_id: client, code_verifier: verifier,
          redirect_uri: listener.redirect, resource: chatEndpoint,
        }, '交换授权码', signal);
        const discovery = await config(signal);
        if (discovery.issuer !== issuer) throw new Error('ChatGPT 身份提供方不匹配。');
        const jwks = await json(fetcher, issuerUrl(discovery.jwks_uri), '读取身份签名密钥', { signal });
        const identity = verifyIdentity(tokens.id_token, jwks, client, nonce);
        if (previous && identity.subject !== previous.subject) throw new Error('返回的 ChatGPT 账号与所选账号不同。');
        signal.throwIfAborted();
        storeAccount({ client, ...identity, idToken: tokens.id_token, ...credentials(tokens) });
        return status();
      } catch (error) {
        if (signal.aborted) throw new Error('ChatGPT 登录已取消或超时。');
        throw error;
      } finally {
        listener?.close();
        activeFlow = undefined;
      }
    },
    select(id) {
      if (!account(id)) throw new Error('找不到该 ChatGPT 账号。');
      write({ ...state(), active: id });
      return status();
    },
    async signOut() {
      const selected = current();
      if (!selected) return status();
      if (refreshes.has(selected.client)) await refreshes.get(selected.client).catch(() => {});
      const item = account(selected.client);
      let revocationFailed = false;
      if (item.refresh) {
        try {
          const settings = await config();
          const response = await fetcher(issuerUrl(settings.revocation_endpoint), {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
            body: new URLSearchParams({ token: item.refresh, token_type_hint: 'refresh_token', client_id: item.client }),
          });
          revocationFailed = !response.ok;
        } catch { revocationFailed = true; }
      }
      const latest = state();
      write({ ...latest, accounts: latest.accounts.map((old) => old.client === item.client
        ? { client: old.client, email: old.email, subject: old.subject } : old) });
      return { ...status(), revocationFailed };
    },
    async token() {
      const item = current();
      if (!enabled(item)) throw new Error('请先登录 ChatGPT 并允许使用订阅额度。');
      if (item.expiry > Date.now() + 60000) return item.access;
      if (!item.refresh) throw new Error('ChatGPT 登录已过期，请重新登录。');
      if (!refreshes.has(item.client)) {
        const renewal = (async () => {
          try {
            const tokens = await postForm({
              grant_type: 'refresh_token', client_id: item.client, refresh_token: item.refresh, resource: chatEndpoint,
            }, '续期授权');
            const latest = state();
            if (latest.accounts.find((record) => record.client === item.client)?.refresh !== item.refresh) {
              throw new Error('ChatGPT 会话已更改，请重试。');
            }
            const updated = { ...item, ...credentials(tokens, item) };
            write({ ...latest, accounts: latest.accounts.map((record) => record.client === item.client ? updated : record) });
            if (!enabled(updated)) throw new Error('ChatGPT 订阅授权已失效，请重新登录。');
            return updated.access;
          } catch (error) {
            if (error.code === 'invalid_grant') throw new Error('ChatGPT 登录已失效，请重新登录。');
            throw error;
          } finally { refreshes.delete(item.client); }
        })();
        refreshes.set(item.client, renewal);
      }
      return refreshes.get(item.client);
    },
    async models() {
      const token = await this.token();
      const catalog = await json(fetcher, chatEndpoint + '/models', '读取可用模型', { headers: { Authorization: 'Bearer ' + token } });
      if (Array.isArray(catalog.models)) {
        return normalizeModelDirectory(catalog.models.filter((item) => item?.visibility === 'list'), 'chatgpt');
      }
      if (Array.isArray(catalog.data)) return normalizeModelDirectory(catalog.data, 'chatgpt');
      throw new Error('ChatGPT 未返回可识别的模型目录。');
    },
  };
}
