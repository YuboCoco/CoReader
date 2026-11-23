import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';
import { createInterface } from 'node:readline';

const isFile = (path) => stat(path).then((entry) => entry.isFile(), () => false);

export async function locateCodex(env = process.env) {
  const paths = (env.PATH || env.Path || '').split(delimiter).filter(isAbsolute);
  const npm = env.APPDATA ? join(env.APPDATA, 'npm') : '';
  const prefixes = [...new Set([npm, ...paths].filter(Boolean))];
  if (process.platform === 'win32') {
    const target = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
    const vendor = process.arch === 'arm64' ? 'codex-win32-arm64' : 'codex-win32-x64';
    for (const prefix of prefixes) {
      const root = join(prefix, 'node_modules', '@openai');
      const candidates = [
        join(root, vendor, 'vendor', target, 'bin', 'codex.exe'),
        join(root, 'codex', 'node_modules', '@openai', vendor, 'vendor', target, 'bin', 'codex.exe'),
      ];
      for (const file of candidates) if (await isFile(file)) return { file, args: [] };
    }
  }
  const name = process.platform === 'win32' ? 'codex.exe' : 'codex';
  for (const dir of paths) {
    const file = join(dir, name);
    if (await isFile(file)) return { file, args: [] };
  }
  if (process.platform !== 'win32') return null;

  // npm's Windows .cmd shim needs a shell. Use its fixed Node entry instead.
  const nodes = await Promise.all(paths.map(async (dir) => {
    const file = join(dir, 'node.exe');
    return await isFile(file) ? file : null;
  }));
  const node = nodes.find(Boolean);
  if (!node) return null;
  for (const prefix of prefixes) {
    const root = join(prefix, 'node_modules', '@openai', 'codex');
    const packageInfo = await readFile(join(root, 'package.json'), 'utf8').then(JSON.parse).catch(() => null);
    if (packageInfo?.name !== '@openai/codex') continue;
    const entry = join(root, 'bin', 'codex.js');
    if (await isFile(entry)) return { file: node, args: [entry] };
  }
  return null;
}

const limitedText = (value, count) => typeof value === 'string' ? value.trim().slice(0, count) : '';
const epochMs = (value) => Number.isSafeInteger(value) && value > 0 && value < 8640000000000 ? value * 1000 : null;

export function codexWindows(result) {
  const snapshot = result?.rateLimitsByLimitId?.codex || result?.rateLimits;
  if (!snapshot || typeof snapshot !== 'object') return [];
  return ['primary', 'secondary'].flatMap((id) => {
    const entry = snapshot[id];
    if (!Number.isFinite(entry?.usedPercent) || entry.usedPercent < 0) return [];
    return [{
      id,
      remaining: Math.max(0, 100 - entry.usedPercent),
      periodMins: Number.isSafeInteger(entry.windowDurationMins) && entry.windowDurationMins > 0 ? entry.windowDurationMins : null,
      resetsAt: epochMs(entry.resetsAt),
    }];
  }).sort((a, b) => (b.periodMins || 0) - (a.periodMins || 0));
}

export function codexEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:OPENAI_(?:API_KEY|BASE_URL)|CODEX_(?:API_KEY|BASE_URL)|NODE_OPTIONS|ELECTRON_RUN_AS_NODE)$/i.test(key)));
}

export async function readCodexSubscription({ command, cwd, signal, version = 'dev', quota = true, models = false }) {
  if (!command) return { state: 'not-installed' };
  const timeout = AbortSignal.timeout(18000);
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
  abort.throwIfAborted();
  const env = codexEnvironment();
  return new Promise((resolve, reject) => {
    const processHandle = spawn(command.file, [...command.args, 'app-server', '--listen', 'stdio://'], {
      cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], signal: abort, env,
    });
    const stream = createInterface({ input: processHandle.stdout, crlfDelay: Infinity });
    let account;
    const catalog = [];
    let nextRequest = 3;
    const seenCursors = new Set();
    let settled = false;
    let bytes = 0;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      stream.close();
      processHandle.stdin.end();
      if (processHandle.exitCode === null && !processHandle.killed) processHandle.kill();
      if (error) reject(error);
      else resolve(value);
    };
    const openFailed = () => {
      const message = abort.aborted ? '读取 Codex 数据超时。' : '无法读取 Codex 数据，请确认安装了支持 App Server 的版本。';
      if (account && !models) finish({ ...account, quotaError: message });
      else finish(null, new Error(message));
    };
    const send = (request) => processHandle.stdin.write(JSON.stringify(request) + '\n');
    const list = (cursor) => send({ method: 'model/list', id: ++nextRequest, params: { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) } });
    processHandle.stdin.on('error', openFailed);
    processHandle.on('error', openFailed);
    processHandle.once('close', openFailed);
    processHandle.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) openFailed();
    });
    stream.on('line', (line) => {
      if (settled) return;
      let frame;
      try { frame = JSON.parse(line); } catch { return; }
      if (!frame || typeof frame !== 'object' || frame.method) return;
      if (frame.id === 1) {
        if (frame.error || !frame.result) return openFailed();
        send({ method: 'initialized' });
        send({ method: 'account/read', id: 2, params: { refreshToken: false } });
      } else if (frame.id === 2) {
        if (frame.error || !frame.result) return openFailed();
        const info = frame.result.account;
        if (!info) return finish({ state: 'signed-out' });
        if (info.type !== 'chatgpt') return finish({ state: 'other-auth' });
        account = { state: 'connected', plan: limitedText(info.planType, 80), email: limitedText(info.email, 254) };
        if (models) return list();
        if (!quota) return finish(account);
        send({ method: 'account/rateLimits/read', id: 3 });
      } else if (models && frame.id === nextRequest && account) {
        if (frame.error || !Array.isArray(frame.result?.data)) return openFailed();
        catalog.push(...frame.result.data.slice(0, 1000 - catalog.length));
        const cursor = frame.result.nextCursor;
        if (catalog.length < 1000 && typeof cursor === 'string' && cursor && cursor.length <= 4096
          && !seenCursors.has(cursor) && seenCursors.size < 19) {
          seenCursors.add(cursor);
          return list(cursor);
        }
        finish({ ...account, models: catalog });
      } else if (frame.id === 3 && account) {
        if (frame.error) return finish({ ...account, quotaError: 'Codex 当前无法提供额度数据。' });
        finish({ ...account, windows: codexWindows(frame.result), checkedAt: Date.now() });
      }
    });
    send({ method: 'initialize', id: 1, params: {
      clientInfo: { name: 'english_lit_reader', title: 'CoReader', version },
    } });
  });
}

export { readDeepSeekBalance } from './provider-usage.mjs';
