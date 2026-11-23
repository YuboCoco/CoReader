import { spawn } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { normalizeModelDirectory } from './model-directory.mjs';

const packageName = '@tencent-ai/codebuddy-code';
const outputLimit = 12 * 1024 * 1024;
const exists = (path) => stat(path).then((file) => file.isFile(), () => false);
const safeOptions = ['--tools', '', '--strict-mcp-config', '--setting-sources', '',
  '--permission-mode', 'dontAsk',
  '--settings', JSON.stringify({ disableAllHooks: true, allowUntrustedFrontmatterHooks: false })];

function codeBuddyEnvironment() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:CODEBUDDY_|ANTHROPIC_|NODE_OPTIONS$|ELECTRON_RUN_AS_NODE$)/i.test(key)));
  const customProfile = process.env.CODEBUDDY_CONFIG_DIR;
  return { ...env, ...(customProfile && isAbsolute(customProfile) ? { CODEBUDDY_CONFIG_DIR: customProfile } : {}),
    DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1',
    CODEBUDDY_CODE_DISABLE_BACKGROUND_TASKS: '1', CODEBUDDY_DISABLE_BACKGROUND_TASKS: '1' };
}

export async function locateCodeBuddy(env = process.env) {
  const pathDirs = (env.PATH || env.Path || '').split(delimiter).filter(isAbsolute);
  const nativeDirs = env.LOCALAPPDATA ? [join(env.LOCALAPPDATA, 'codebuddy', 'bin'), ...pathDirs] : pathDirs;
  const command = process.platform === 'win32' ? 'codebuddy.exe' : 'codebuddy';
  for (const dir of nativeDirs) {
    const file = join(dir, command);
    if (await exists(file)) return { file, args: [] };
  }
  if (process.platform !== 'win32') return null;

  // Windows npm shims are batch files. Resolve the package's bin with Node
  // directly so Windows never interprets prompts or model IDs as commands.
  const prefixes = env.APPDATA ? [join(env.APPDATA, 'npm'), ...pathDirs] : pathDirs;
  let node;
  for (const dir of pathDirs) {
    const file = join(dir, 'node.exe');
    if (await exists(file)) { node = file; break; }
  }
  if (!node) return null;
  for (const prefix of new Set(prefixes)) {
    const root = join(prefix, 'node_modules', '@tencent-ai', 'codebuddy-code');
    const entry = await readFile(join(root, 'package.json'), 'utf8').then((raw) => {
      const manifest = JSON.parse(raw);
      return manifest.name === packageName ? manifest.bin?.codebuddy : null;
    }).catch(() => null);
    if (typeof entry !== 'string') continue;
    const file = resolve(root, entry);
    const inside = relative(root, file);
    if (!inside || inside.startsWith('..') || isAbsolute(inside) || !await exists(file)) continue;
    return { file: node, args: [file] };
  }
  return null;
}

function selectOptions(config) {
  return Array.isArray(config?.options) ? config.options.flatMap((item) =>
    Array.isArray(item?.options) ? item.options : [item]) : [];
}

function acpModels(result) {
  const configs = Array.isArray(result.configOptions) ? result.configOptions : [];
  const picker = configs.find((option) => option?.category === 'model' || option?.id === 'model');
  const thought = configs.find((option) => option?.category === 'thought_level' || option?.id === 'effort');
  const current = picker?.currentValue || result.models?.currentModelId;
  const modelOptions = selectOptions(picker).map((item) => ({ ...item, id: item?.value }));
  const available = modelOptions.length ? modelOptions
    : Array.isArray(result.models?.availableModels) ? result.models.availableModels : [];
  const items = available.filter((item) => item && !item.disabled).map((item) => {
    const id = item.id || item.modelId;
    return { ...item, id, isDefault: id === current,
      ...(id === current && thought ? { supportedReasoningEfforts: selectOptions(thought).map((option) => option?.value),
        defaultReasoningEffort: thought.currentValue } : {}),
    };
  });
  const user = result._meta?.['codebuddy.ai/userinfo'];
  const name = user?.userNickname || user?.userName;
  return {
    models: normalizeModelDirectory(items, 'workbuddy'),
    ...(typeof name === 'string' && name.trim() ? { accountName: name.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80) } : {}),
  };
}

export async function readCodeBuddyModels({ command, workDir, signal }) {
  if (!command) throw new Error('安装官方 CodeBuddy CLI 后可读取可用模型。');
  const timeout = AbortSignal.timeout(15000);
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
  await mkdir(workDir, { recursive: true });
  abort.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command.file, [...command.args, '--acp', '--no-session-persistence', ...safeOptions], {
      cwd: workDir, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], signal: abort, env: codeBuddyEnvironment(),
    });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let bytes = 0;
    let state = 1;
    let outcome;
    const finish = (error, value) => {
      if (outcome) return;
      outcome = { error, value };
      lines.close();
      child.stdin.end();
      if (child.exitCode === null && !child.killed) child.kill();
    };
    const unavailable = () => finish(new Error(abort.aborted
      ? '读取 CodeBuddy 模型目录超时。' : '当前 CodeBuddy CLI 未返回模型目录。请确认已登录并使用新版 CLI。'));
    const send = (id, method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    child.once('error', unavailable);
    child.once('close', () => {
      if (!outcome) unavailable();
      if (outcome.error) reject(outcome.error);
      else resolve(outcome.value);
    });
    child.stdin.on('error', unavailable);
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) unavailable();
    });
    lines.on('line', (line) => {
      if (outcome) return;
      let frame;
      try { frame = JSON.parse(line); } catch { return; }
      if (!frame || frame.jsonrpc !== '2.0') return;
      if (frame.method) {
        if (frame.id !== null && frame.id !== undefined) unavailable();
        return;
      }
      if (frame.id !== state) return;
      if (frame.error) {
        if (frame.error.code === -32000 || /auth[_ ]required|not logged in/i.test(frame.error.message || '')) {
          const error = new Error('请先在官方 CodeBuddy CLI 登录国内站或国际站，然后刷新模型。');
          error.code = 'AUTH_REQUIRED';
          return finish(error);
        }
        return unavailable();
      }
      if (state === 1 && frame.result?.protocolVersion === 1) {
        state = 2;
        return send(2, 'session/new', { cwd: workDir, mcpServers: [] });
      }
      if (state === 2 && frame.result?.sessionId) {
        const result = acpModels(frame.result);
        return result.models.length ? finish(null, result) : unavailable();
      }
      unavailable();
    });
    send(1, 'initialize', { protocolVersion: 1, clientCapabilities: {},
      clientInfo: { name: 'english-lit-reader', title: 'CoReader' } });
  });
}

function inputMessage(content) {
  const parts = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
  return { type: 'user', message: { role: 'user', content: parts.map((item) => {
    if (item.type === 'text') return { type: 'text', text: item.text };
    const image = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+=*)$/.exec(item.image_url?.url);
    if (item.type !== 'image_url' || !image) throw new Error('CodeBuddy 无法读取所选插图。');
    return { type: 'image', source: { type: 'base64', media_type: image[1], data: image[2] } };
  }) } };
}

function readResult(stdout, stderr, code) {
  let model = '';
  let result;
  for (const line of stdout.split('\n')) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type === 'system' && event.subtype === 'init' && typeof event.model === 'string') model = event.model;
    if (event?.type === 'assistant' && typeof event.message?.model === 'string') model = event.message.model;
    if (event?.type === 'result') result = event;
  }
  if (code === 0 && result && !result.is_error && typeof result.result === 'string' && result.result.trim()) {
    return { text: result.result.trim(), model };
  }

  const detail = stderr + '\n' + (result?.result || '') + '\n' + (Array.isArray(result?.errors) ? result.errors.join('\n') : '') + '\n' + stdout.slice(0, 5000);
  if (/not logged in|please (?:log\s?in|sign in)|authentication required|unauthori[sz]ed|登录|401/i.test(detail)) {
    throw new Error('请先在 CodeBuddy CLI 中登录与你的 WorkBuddy 相同的账号，然后重试。');
  }
  if (/insufficient (?:credits|quota)|credit.*(?:exhausted|balance)|限流|积分不足|429/i.test(detail)) {
    throw new Error('CodeBuddy 账号积分不足或请求被限流。');
  }
  if (/unknown option|unrecognized (?:argument|option)/i.test(detail)) {
    throw new Error('当前 CodeBuddy CLI 版本过旧，请更新后重试。');
  }
  throw new Error('CodeBuddy CLI 未返回可用结果。请检查 CLI 登录状态和该账号是否可用所选模型。');
}

export async function runCodeBuddy(config, messages, { signal, onText, onModel, workDir, locate = locateCodeBuddy } = {}) {
  const deadline = AbortSignal.timeout(300000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  combined.throwIfAborted();
  const command = await locate();
  if (!command) throw new Error('未检测到 CodeBuddy CLI。请安装官方 CLI，并登录你的 WorkBuddy 账号。');
  await mkdir(workDir, { recursive: true });
  combined.throwIfAborted();

  const system = messages.find((item) => item.role === 'system')?.content || '';
  const user = messages.find((item) => item.role === 'user')?.content;
  const input = JSON.stringify(inputMessage(user)) + '\n';
  const args = [...command.args,
    '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--no-session-persistence', '--max-turns', '1', ...safeOptions,
    '--system-prompt', system,
  ];
  if (config.model !== 'default') args.push('--model=' + config.model);
  if (config.effort && config.effort !== 'default') args.push('--effort=' + config.effort);
  const result = await new Promise((done, fail) => {
    const child = spawn(command.file, args, {
      cwd: workDir, windowsHide: true, signal: combined,
      env: codeBuddyEnvironment(),
    });
    child.stdin.on('error', () => {}); // A failed login can close stdin early.
    let processFailure;
    child.once('error', () => {
      processFailure ||= new Error('无法启动 CodeBuddy CLI。请检查官方 CLI 的安装。');
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (processFailure) return;
      if (stdout.length + chunk.length > outputLimit) {
        processFailure = new Error('CodeBuddy CLI 输出超过大小限制。');
        child.kill();
      } else {
        stdout += chunk;
      }
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 8000) stderr = (stderr + chunk).slice(0, 8000);
    });
    child.once('close', (code) => {
      try {
        combined.throwIfAborted();
        if (processFailure) throw processFailure;
        done(readResult(stdout, stderr, code));
      } catch (error) {
        fail(error);
      }
    });
    child.stdin.end(input, 'utf8');
  });
  if (result.model) onModel?.(result.model);
  onText?.(result.text);
  return result.text;
}
