import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { normalizeModelDirectory } from './model-directory.mjs';

const provider = 'managed:kimi-code';
const loginPath = '/oauth/login';
const loginStatusPath = loginPath + '?provider=' + encodeURIComponent(provider);
const noToolsConfig = 'builtin_product_skills = false\nmerge_all_available_skills = false\n[tools]\nenabled = ["*"]\n';
const isFile = (path) => stat(path).then((item) => item.isFile(), () => false);

export async function locateKimiCode(env = process.env) {
  const windows = process.platform === 'win32';
  const paths = [...new Set([...(env.PATH || env.Path || '').split(delimiter).filter(isAbsolute),
    join(homedir(), '.local', 'bin'), join(homedir(), '.kimi-code', 'bin'),
    ...(windows ? [] : ['/opt/homebrew/bin', '/usr/local/bin'])])];
  for (const directory of paths) {
    const file = join(directory, windows ? 'kimi.exe' : 'kimi');
    if (await isFile(file)) return { file, args: [] };
  }
  if (!windows) return null;

  // A Windows npm shim is a batch script. Invoke the resolved package with Node to avoid shell interpretation.
  const prefixes = [...new Set([...(env.APPDATA ? [join(env.APPDATA, 'npm')] : []), ...paths])];
  for (const prefix of prefixes) {
    const root = join(prefix, 'node_modules', '@moonshot-ai', 'kimi-code');
    const manifest = await readFile(join(root, 'package.json'), 'utf8').then(JSON.parse).catch(() => null);
    if (manifest?.name !== '@moonshot-ai/kimi-code' || typeof manifest.bin?.kimi !== 'string') continue;
    const entry = resolve(root, manifest.bin.kimi);
    const inside = relative(root, entry);
    if (!inside || inside.startsWith('..') || isAbsolute(inside) || !await isFile(entry)) continue;
    for (const directory of paths) {
      const file = join(directory, 'node.exe');
      if (await isFile(file)) return { file, args: [entry] };
    }
  }
  return null;
}

function spawnServer(command, home, workspace, signal) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:KIMI_|MOONSHOT_|NODE_OPTIONS$|ELECTRON_RUN_AS_NODE$)/i.test(key)));
  // Keep a user-supplied path to Git Bash on Windows, while keeping auth and inference endpoints official.
  if (process.env.KIMI_SHELL_PATH) env.KIMI_SHELL_PATH = process.env.KIMI_SHELL_PATH;
  const child = spawn(command.file, [...command.args, 'web', '--json', '--host', '127.0.0.1', '--port', '0'], {
    cwd: workspace, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    env: { ...env, KIMI_CODE_HOME: home, KIMI_DISABLE_TELEMETRY: '1' },
  });
  return new Promise((resolveReady, reject) => {
    const lines = createInterface({ input: child.stdout });
    const startup = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
    let ready;
    const stop = () => child.kill();
    const fail = () => {
      if (!ready) reject(new Error('Kimi Code 本地服务未启动。请确认已安装支持 web --json 的新版 CLI。'));
    };
    signal.addEventListener('abort', stop, { once: true });
    startup.addEventListener('abort', stop, { once: true });
    child.once('error', fail);
    child.once('close', () => {
      startup.removeEventListener('abort', stop);
      signal.removeEventListener('abort', stop);
      fail();
    });
    let bytes = 0;
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (!ready && bytes > 65536) stop();
    });
    lines.on('line', (line) => {
      if (ready) return;
      try {
        const { origin, token } = JSON.parse(line);
        const url = new URL(origin);
        if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.origin !== origin || !url.port
          || typeof token !== 'string' || !/^[\x21-\x7e]{1,1024}$/.test(token)) return;
        ready = { origin, token, child };
        startup.removeEventListener('abort', stop);
        resolveReady(ready);
      } catch { /* The startup JSON line may be preceded by diagnostics. */ }
    });
  });
}

function verificationUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.port && !url.username && !url.password
      && /^(?:[a-z0-9-]+\.)*kimi\.(?:com|ai)$/.test(url.hostname)) return url.href;
  } catch { /* An invalid verification URL is not opened. */ }
  return '';
}

function loginSnapshot(flow) {
  const status = flow?.status;
  if (status !== 'pending') return { status: status || 'cancelled' };
  const url = verificationUrl(flow.verification_uri_complete) || verificationUrl(flow.verification_uri);
  if (!url) throw new Error('Kimi Code 返回了无法验证的授权地址。');
  const fromDate = typeof flow.expires_at === 'string' ? Date.parse(flow.expires_at) : NaN;
  const seconds = Number(flow.expires_in);
  const expiresAt = Number.isFinite(fromDate) ? fromDate : Date.now() + (seconds > 0 ? seconds : 600) * 1000;
  return { status, url, userCode: typeof flow.user_code === 'string' ? flow.user_code.slice(0, 32) : '',
    interval: Math.max(2, Math.min(30, Number(flow.interval) || 5)), expiresAt };
}

function inputParts(messages) {
  return messages.flatMap(({ role, content }) => {
    if (typeof content === 'string') return [{ type: 'text', text: role === 'system' ? '任务指令：\n' + content : content }];
    return content.map((part) => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      const img = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=]+)$/i.exec(part.image_url?.url || '');
      if (role === 'user' && img) return { type: 'image', source: { kind: 'base64', media_type: img[1], data: img[2] } };
      throw new Error('Kimi Code 需要本地的 PNG、JPEG、WebP 或 GIF 插图。');
    });
  });
}

export function createKimiCode({ home, signal, openBrowser, locate = locateKimiCode, fetcher = fetch }) {
  const workspace = join(home, 'requests');
  let serverPending;
  let loginActive;
  let loginStarting;

  async function start() {
    const command = await locate();
    if (!command) throw new Error('请安装新版 Kimi Code CLI，然后重试。');
    await mkdir(workspace, { recursive: true, mode: 0o700 });
    await writeFile(join(home, 'config.toml'), noToolsConfig, { flag: 'wx', mode: 0o600 })
      .catch((error) => { if (error.code !== 'EEXIST') throw error; });
    signal.throwIfAborted();
    return spawnServer(command, home, workspace, signal);
  }

  async function request(path, { method = 'GET', body, requestSignal, existing = false } = {}) {
    if (existing && !serverPending) return null;
    if (!serverPending) {
      const pending = start();
      serverPending = pending;
      pending.then(({ child }) => {
        child.once('close', () => { if (serverPending === pending) serverPending = null; });
      }, () => { if (serverPending === pending) serverPending = null; });
    }
    const { origin, token } = await serverPending;
    requestSignal?.throwIfAborted();
    const deadline = AbortSignal.timeout(15000);
    const response = await fetcher(origin + '/api/v1' + path, {
      method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error',
      signal: AbortSignal.any([signal, deadline, ...(requestSignal ? [requestSignal] : [])]),
    });
    if (response.status === 204) return null;
    const envelope = await response.json().catch(() => null);
    if (!response.ok || envelope?.code !== 0) {
      const code = Number(envelope?.code);
      const authExpired = [40110, 40111, 40112, 40113].includes(code);
      throw new Error(authExpired ? 'Kimi Code 授权不可用，请重新登录。'
        : 'Kimi Code 请求失败（' + (Number.isInteger(code) && code > 0 ? code : response.status) + '）。');
    }
    return envelope.data;
  }

  return {
    async beginLogin() {
      if (loginStarting || loginActive) throw new Error('Kimi Code 已有授权请求，请先结束当前授权。');
      const operation = new AbortController();
      loginStarting = operation;
      try {
        const flow = loginSnapshot(await request(loginPath, { method: 'POST', body: { provider }, requestSignal: operation.signal }));
        operation.signal.throwIfAborted();
        if (flow.status === 'pending') {
          loginActive = flow;
          await openBrowser(flow.url).catch(() => {}); // The verified URL is also available in the settings.
        }
        return flow;
      } catch (error) {
        await request(loginStatusPath, { method: 'DELETE', existing: true }).catch(() => {});
        throw error;
      } finally {
        loginStarting = null;
      }
    },

    async pollLogin() {
      const pending = loginActive;
      if (!pending) return { status: 'cancelled' };
      const flow = Date.now() < pending.expiresAt ? loginSnapshot(await request(loginStatusPath)) : { status: 'expired' };
      if (loginActive !== pending) return { status: 'cancelled' };
      if (flow.status !== 'pending') loginActive = null;
      if (flow.status === 'expired') await request(loginStatusPath, { method: 'DELETE', existing: true }).catch(() => {});
      return flow;
    },

    async cancelLogin() {
      loginStarting?.abort(new Error('已取消 Kimi Code 授权。'));
      if (!loginActive) return;
      loginActive = null;
      await request(loginStatusPath, { method: 'DELETE', existing: true });
    },

    async disconnect() {
      await request('/oauth/logout', { method: 'POST', body: { provider } });
    },

    async models({ refresh = false } = {}) {
      const auth = await request('/auth');
      if (auth?.managed_provider?.status !== 'authenticated') throw new Error('请先在模型设置中登录 Kimi Code。');
      if (refresh) await request('/providers/' + encodeURIComponent(provider) + ':refresh', { method: 'POST' });
      const result = await request('/models');
      const items = Array.isArray(result?.items) ? result.items : [];
      return normalizeModelDirectory(items.filter((item) => item?.provider === provider).map((item) => ({
        id: item.model, display_name: item.display_name, contextWindow: item.max_context_size,
        supportedReasoningEfforts: item.support_efforts, defaultReasoningEffort: item.default_effort,
        ...(Array.isArray(item.capabilities) ? { images: item.capabilities.includes('image_in') ? 'yes' : 'no' } : {}),
      })), 'kimi-code');
    },

    async complete(config, messages, options = {}) {
      const requestSignal = options.signal || AbortSignal.timeout(180000);
      const content = inputParts(messages);
      const session = await request('/sessions', { method: 'POST', requestSignal, body: {
        title: 'CoReader', metadata: { cwd: workspace }, agent_config: { model: config.model, permission_mode: 'manual' },
      } });
      if (typeof session?.id !== 'string' || !/^session_[\w-]+$/.test(session.id)) throw new Error('Kimi Code 未返回有效的会话。');
      const path = '/sessions/' + encodeURIComponent(session.id);
      let finished = false;
      try {
        const accepted = await request(path + '/prompts', { method: 'POST', requestSignal, body: {
          content, ...(config.effort !== 'default' ? { thinking: config.effort } : {}),
        } });
        if (!accepted?.prompt_id || ['blocked', 'failed'].includes(accepted.status)) throw new Error('Kimi Code 未接受该请求。');
        while (true) {
          await delay(500, undefined, { signal: requestSignal });
          const state = await request(path, { requestSignal });
          if (state.pending_interaction && state.pending_interaction !== 'none') throw new Error('Kimi Code 请求需要额外操作，已停止。');
          if (!state.main_turn_active && state.last_turn_reason) {
            finished = true;
            if (state.last_turn_reason !== 'completed') throw new Error('Kimi Code 未完成该请求，请重试。');
            break;
          }
        }
        const history = await request(path + '/messages?page_size=100&role=assistant', { requestSignal });
        const answer = (history?.items || []).reverse().flatMap((item) => (item.content || [])
          .filter((part) => part.type === 'text').map((part) => part.text)).join('').trim();
        if (!answer) throw new Error('Kimi Code 未返回可用的文本。');
        options.onModel?.(config.model);
        options.onText?.(answer);
        return answer;
      } finally {
        if (!finished) await request(path + ':abort', { method: 'POST', existing: true, requestSignal: AbortSignal.timeout(3000) }).catch(() => {});
        await request(path + ':archive', { method: 'POST', existing: true, requestSignal: AbortSignal.timeout(3000) }).catch(() => {});
      }
    },
  };
}
