import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, net, protocol, safeStorage, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { cpSync, createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { defaultModel, openLibrary } from './library.mjs';
import { albumMimeType, listAlbumImages, resolveAlbumImageFile } from './album.mjs';
import { ambientMimeType, listAmbientAudio, resolveAmbientAudioFile } from './ambient.mjs';
import { createBingWallpaper } from './bing-wallpaper.mjs';
import { apiModelEndpoints, complete, makeMessages, modelSelection, normalizeApiEndpoint } from './model.mjs';
import { availableEfforts, connectionNames, defaultLocalTranslationModel, localTranslationModels } from './model-capabilities.mjs';
import { fetchApiModelDirectory, normalizeModelDirectory } from './model-directory.mjs';
import { claudeRateLimits, readDeepSeekBalance, readKimiBalance } from './provider-usage.mjs';
import { createChatGPTAuth } from './chatgpt.mjs';
import { createKimiCode } from './kimi-code.mjs';
import { analyzeFigure, analyzePaper, organizeReferences } from './research.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { runReaderRequest } from './reader-requests.mjs';
import { runReadingAgent } from './reading-agent.mjs';
import { locateCodeBuddy, readCodeBuddyModels, runCodeBuddy } from './codebuddy.mjs';
import { createLocalTranslator } from './local-translation.mjs';
import { detectPdfLayout } from './layout-model.mjs';
import { findAppUpdateDetails, selectUpdateAsset } from './app-updates.mjs';

const origin = 'litreader://app';
const isMac = process.platform === 'darwin';
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const preload = fileURLToPath(new URL('./preload.cjs', import.meta.url));
const appIcon = fileURLToPath(new URL('../assets/coreader-cr.png', import.meta.url));
const samplePaperPath = fileURLToPath(new URL('../assets/samples/Attention Is All You Need.pdf', import.meta.url));
const builtinSoundsDir = fileURLToPath(new URL('../assets/sounds/', import.meta.url));
// Bundled starter photos live outside app.asar (resources/photo) so nativeImage
// can read them directly for thumbnails; in development they come from assets/photo.
const defaultAlbumDir = app.isPackaged
  ? join(process.resourcesPath, 'photo')
  : fileURLToPath(new URL('../assets/photo/', import.meta.url));
const requestIdPattern = /^[a-f0-9-]{36}$/i;
let mainWindow;
let library;
let chatgpt;
let bingWallpaper;
const jobs = new Map();
const appLifetime = new AbortController();
const execFileAsync = promisify(execFile);
let updateCheck;
let updateDownloadController = null;
const translationBundle = app.isPackaged ? join(process.resourcesPath, 'haidass')
  : fileURLToPath(new URL('../release/runtime/haidass/', import.meta.url));
const offlineTranslators = new Map(Object.keys(localTranslationModels).map((id) =>
  [id, createLocalTranslator(translationBundle, appLifetime.signal, id,
    !app.isPackaged && isMac ? 'engine-darwin-' + process.arch : 'engine')]));
const activeResearch = new Set();
const activeAgentPapers = new Set();
const connectionProviders = Object.keys(connectionNames);
const apiProviders = [...Object.keys(apiModelEndpoints), 'compatible'];
const balanceReaders = { deepseek: readDeepSeekBalance, kimi: readKimiBalance };
const balances = new Map();
let claudeLimits;
const modelDirectories = new Map();
const directoryLifetimeMs = 5 * 60 * 1000;
const startupStatus = process.env.ENGLISH_LIT_READER_STARTUP_STATUS;

function reportStartup(status) {
  if (!startupStatus) return;
  try { writeFileSync(startupStatus, status, 'utf8'); }
  catch (error) { console.error('Could not write startup status:', error.message); }
}

protocol.registerSchemesAsPrivileged([{
  scheme: 'litreader',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
}]);

// Use CoReader as the userData directory, migrating legacy English Lit Reader data seamlessly.
const dataOverride = process.env.COREADER_DATA || process.env.ENGLISH_LIT_READER_DATA;
const profile = dataOverride && isAbsolute(dataOverride)
  ? dataOverride : join(app.getPath('appData'), 'CoReader');
if (!dataOverride && !existsSync(profile)) {
  const legacyProfile = join(app.getPath('appData'), 'English Lit Reader');
  if (existsSync(legacyProfile)) {
    try {
      renameSync(legacyProfile, profile);
    } catch {
      try {
        cpSync(legacyProfile, profile, { recursive: true });
      } catch (error) {
        console.error('Could not migrate legacy userData:', error?.message || error);
      }
    }
  }
}
mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
const kimiCode = createKimiCode({ home: join(profile, 'kimi-code'), signal: appLifetime.signal,
  openBrowser: (url) => shell.openExternal(url) });
app.setName('CoReader');
const ownsApp = app.requestSingleInstanceLock();
if (!ownsApp) {
  reportStartup('READY');
  app.quit();
}

function registerHandler(name, action) {
  ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame
      || !event.senderFrame?.url.startsWith(origin + '/')) {
      return { ok: false, error: '应用窗口已失效。' };
    }
    try {
      return { ok: true, value: await action(event, ...args) };
    } catch (error) {
      return { ok: false, error: error?.message || '操作失败。' };
    }
  });
}

function currentConfig() {
  const config = library.getSetting('model', defaultModel);
  return connectionProviders.includes(config.provider) ? config : defaultModel;
}

function providerConfig(provider) {
  const current = currentConfig();
  if (!provider) return current;
  const saved = library.getSetting('model-' + provider, null);
  if (saved) return saved;
  if (provider === current.provider) return current;
  const endpoint = apiModelEndpoints[provider] || (provider === 'chatgpt' ? 'https://api.openai.com/v1' : '');
  return { provider, endpoint, model: '', effort: 'default', images: 'auto' };
}

function hasConnection(provider) {
  if (provider === 'chatgpt') {
    try { return chatgpt.status().connected; }
    catch { return false; }
  }
  const profile = providerConfig(provider);
  if (provider === 'workbuddy') return library.getSetting('workbuddy-connected', Boolean(profile.model));
  if (provider === 'kimi-code') return library.getSetting('kimi-code-connected', false);
  if (provider === 'compatible') return Boolean(profile.endpoint);
  return apiProviders.includes(provider) && Boolean(profile.secret);
}

function translationPreference() {
  const saved = library.getSetting('translation-routing', null)
    || { mode: library.getSetting('translation-mode', 'local') === 'configured' ? 'configured' : 'local' };
  if (saved.mode === 'separate' && connectionProviders.includes(saved.provider) && hasConnection(saved.provider)) return saved;
  if (saved.mode === 'configured' && currentConfig().model && hasConnection(currentConfig().provider)) return saved;
  const model = saved.mode === 'local' && offlineTranslators.has(saved.model) ? saved.model : defaultLocalTranslationModel;
  return { mode: 'local', model };
}

async function translateOffline(text, selection, signal) {
  const model = selection.model;
  const translated = await offlineTranslators.get(model)(text, signal);
  return { text: translated, model: localTranslationModels[model].label, provider: 'local' };
}

function translateWithConfiguredProfile() {
  const preference = translationPreference();
  if (preference.mode !== 'separate') return currentConfig();
  return { ...providerConfig(preference.provider), model: preference.model,
    label: preference.label, contextWindow: preference.contextWindow, effort: preference.effort };
}

function publicConfig() {
  const { secret, ...config } = currentConfig();
  return { ...config, translation: translationPreference(), hasOpenAlexKey: Boolean(library.getSetting('openalex', '')) };
}

function protect(value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 密钥保护服务当前不可用。');
  return safeStorage.encryptString(value).toString('base64');
}

function checkKey(value) {
  const key = typeof value === 'string' ? value.trim() : '';
  if (key.length > 4096 || /[\r\n]/.test(key)) throw new Error('API Key 格式无效。');
  return key;
}

function savedKey(previous = currentConfig()) {
  if (!previous.secret) return '';
  try {
    return safeStorage.decryptString(Buffer.from(previous.secret, 'base64'));
  } catch {
    throw new Error('本机无法解密已保存的 API Key，请重新填写。');
  }
}

function requireKey(config, key) {
  if (config.provider !== 'compatible' && apiProviders.includes(config.provider) && !key) throw new Error('请先在账号连接卡片中配置服务商 API Key。');
}

async function discoverModels(input) {
  const { provider } = input;
  if (!connectionProviders.includes(provider)) throw new Error('请选择服务商。');
  const stored = providerConfig(provider);
  const endpoint = input.endpoint ?? stored.endpoint;
  let scope = '';
  let accountName = '';
  let list;
  if (provider === 'chatgpt') {
    const account = chatgpt.status();
    if (!account.connected) throw new Error('登录并授权后可检测账号模型。');
    scope = account.active;
    list = () => chatgpt.models();
  } else if (provider === 'kimi-code') {
    list = () => kimiCode.models({ refresh: input.refresh });
  } else if (provider === 'workbuddy') {
    const command = await locateCodeBuddy();
    if (!command) throw new Error('安装官方 CodeBuddy CLI 后可读取可用模型。');
    list = async () => {
      const result = await readCodeBuddyModels({ command, workDir: join(app.getPath('userData'), 'codebuddy-runner'),
        signal: appLifetime.signal });
      accountName = result.accountName || '';
      return result.models;
    };
  } else {
    const key = input.key ?? savedKey(stored);
    requireKey(stored, key);
    const verified = !input.endpoint && input.key === undefined && ['glm', 'doubao', 'compatible'].includes(provider)
      ? normalizeModelDirectory([{ id: stored.verifiedModel }], provider) : [];
    if (verified.length && provider !== 'glm') return { models: verified };
    scope = createHash('sha256').update(key).digest('hex');
    list = async () => {
      try {
        const result = await fetchApiModelDirectory(provider, endpoint, key, {
          signal: appLifetime.signal, ...(provider === 'claude' ? { fetcher: fetchThroughSystem } : {}),
        });
        return [...result, ...verified.filter(({ id }) => !result.some((entry) => entry.id === id))];
      } catch (error) {
        if (verified.length && error.code === 'NO_MODEL_CATALOG') return verified;
        throw error;
      }
    };
  }
  const cacheKey = JSON.stringify([provider, endpoint, scope, stored.verifiedModel]);
  const cached = modelDirectories.get(cacheKey);
  if (!input.refresh && cached && Date.now() < cached.until) return cached.result;
  const entry = { until: Date.now() + directoryLifetimeMs, result: null };
  entry.result = Promise.resolve().then(list).then((models) => ({ models, ...(accountName ? { accountName } : {}) })).catch((error) => {
    if (modelDirectories.get(cacheKey) === entry) modelDirectories.delete(cacheKey);
    throw error;
  });
  modelDirectories.set(cacheKey, entry);
  if (modelDirectories.size > 32) modelDirectories.delete(modelDirectories.keys().next().value);
  return entry.result;
}

async function modelConnection(provider, refresh = false) {
  if (!connectionProviders.includes(provider)) throw new Error('请选择服务商。');
  if (!hasConnection(provider)) return { provider, connected: false, models: [] };
  const profile = providerConfig(provider);
  const details = provider === 'compatible' ? { endpoint: profile.endpoint, verifiedModel: profile.verifiedModel } : {};
  try {
    const { models, accountName } = await discoverModels({ provider, refresh });
    return { provider, connected: true, models, accountName, ...details };
  } catch (error) {
    return { provider, connected: true, models: [], problem: error.message, ...details };
  }
}

async function verifyApiModel(provider, credential, id, endpoint) {
  const models = normalizeModelDirectory([{ id }], provider);
  if (!models.length) throw new Error(provider === 'doubao'
    ? '请输入火山方舟的 Model ID 或推理接入点 ID。' : '请输入有效的模型 ID。');
  const effort = availableEfforts(provider, id, models[0]).ids.includes('low') ? 'low' : 'default';
  const config = modelSelection({ provider, model: id, effort, endpoint });
  const signal = AbortSignal.any([appLifetime.signal, AbortSignal.timeout(45000)]);
  await complete(config, credential, makeMessages('test'), { signal, maxTokens: 1024 });
  return { models, verifiedModel: id };
}

async function updateConnection(provider, { key, model, endpoint, disconnect } = {}) {
  if (provider !== 'workbuddy' && !apiProviders.includes(provider) && !(provider === 'kimi-code' && disconnect === true)) {
    throw new Error('请选择可配置的账号。');
  }
  if (disconnect) {
    if (provider === 'kimi-code') {
      await kimiCode.disconnect();
      clearKimiCodeDirectory();
    }
    const settings = ['workbuddy', 'kimi-code'].includes(provider) ? { [provider + '-connected']: false }
      : { ['model-' + provider]: { ...providerConfig(provider), secret: '', verifiedModel: '',
        ...(provider === 'compatible' ? { endpoint: '' } : {}) } };
    const current = currentConfig();
    if (current.provider === provider) settings.model = defaultModel;
    const translation = translationPreference();
    if (translation.provider === provider || (translation.mode === 'configured' && current.provider === provider)) {
      settings['translation-routing'] = { mode: 'local' };
    }
    library.setSettings(settings);
    return { provider, connected: false, models: [] };
  }
  const credential = provider === 'workbuddy' ? undefined : checkKey(key);
  requireKey({ provider }, credential);
  const customEndpoint = provider === 'compatible' ? normalizeApiEndpoint(endpoint) : undefined;
  const supportsModelId = provider === 'glm' || provider === 'doubao' || provider === 'compatible';
  const requestedModel = supportsModelId && typeof model === 'string' ? model.trim() : '';
  let result;
  if (requestedModel) result = await verifyApiModel(provider, credential, requestedModel, customEndpoint);
  else {
    try {
      result = await discoverModels({ provider, key: credential, endpoint: customEndpoint, refresh: true });
    } catch (error) {
      if (error.code !== 'NO_MODEL_CATALOG' || !supportsModelId) throw error;
      if (provider === 'doubao') throw new Error('方舟模型目录暂不可用，请填写 Model ID 或推理接入点 ID。');
      if (provider === 'compatible') throw new Error('该接口未提供模型目录，请填写模型 ID。');
    }
    if (provider === 'glm' && !result?.models.length) result = await verifyApiModel(provider, credential, 'glm-5.3-flash');
  }
  if (!result?.models.length && provider === 'compatible') throw new Error('该接口未返回可用模型，请填写模型 ID。');
  if (!result.models.length) throw new Error(provider === 'doubao'
    ? '方舟未返回可用的豆包模型，请填写已开通的 Model ID 或推理接入点 ID。' : '该账号没有返回可用的文本模型。');
  if (provider === 'workbuddy') {
    library.setSetting('workbuddy-connected', true);
  } else {
    const secret = credential ? protect(credential) : '';
    const credentials = { secret, ...(supportsModelId ? { verifiedModel: result.verifiedModel || '' } : {}),
      ...(customEndpoint ? { endpoint: customEndpoint } : {}) };
    const settings = { ['model-' + provider]: { ...providerConfig(provider), ...credentials } };
    const current = currentConfig();
    if (current.provider === provider) settings.model = { ...current, ...credentials };
    library.setSettings(settings);
  }
  return { provider, connected: true, ...result, ...(customEndpoint ? { endpoint: customEndpoint } : {}) };
}

async function connectionUsage(provider, refresh) {
  if (provider !== 'claude' && !Object.hasOwn(balanceReaders, provider)) return null;
  if (!hasConnection(provider)) return null;
  const secret = providerConfig(provider).secret;
  const key = savedKey(providerConfig(provider));
  const scope = createHash('sha256').update(key).digest('hex');
  if (provider === 'claude') return claudeLimits?.scope === scope ? claudeLimits.data : null;
  let entry = balances.get(provider);
  if (entry?.scope !== scope || (!refresh && entry.until < Date.now()) || refresh) {
    entry = { scope, until: Date.now() + 60000, pending: balanceReaders[provider](key, { signal: appLifetime.signal }) };
    balances.set(provider, entry);
  }
  try {
    const data = await entry.pending;
    return providerConfig(provider).secret === secret ? data : null;
  } catch (error) {
    if (balances.get(provider) === entry) balances.delete(provider);
    throw error;
  }
}

function fetchThroughSystem(address, options) {
  return net.fetch(address, { ...options, credentials: 'omit' });
}

async function getCredential(config, key) {
  const active = config.provider === 'chatgpt' ? chatgpt.status().active : null;
  await availableModel(config.provider, config.model);
  if (config.provider === 'chatgpt') {
    const token = await chatgpt.token();
    if (chatgpt.status().active !== active) throw new Error('ChatGPT 账号已切换，请重试。');
    return token;
  }
  if (config.provider === 'compatible') {
    const profile = providerConfig('compatible');
    if (config.endpoint !== profile.endpoint) throw new Error('自定义 API 地址已更改，请重试。');
    return savedKey(profile);
  }
  requireKey(config, key);
  return key;
}

function completeModel(config, key, messages, options) {
  if (config.provider === 'kimi-code') return kimiCode.complete(config, messages, options);
  if (config.provider === 'workbuddy') {
    const signal = AbortSignal.any([appLifetime.signal, ...(options?.signal ? [options.signal] : [])]);
    return runCodeBuddy(config, messages, { ...options, signal, workDir: join(app.getPath('userData'), 'codebuddy-runner') });
  }
  if (config.provider === 'claude') {
    const scope = createHash('sha256').update(key).digest('hex');
    return complete(config, key, messages, { ...options, fetcher: fetchThroughSystem, onHeaders(headers) {
      const data = claudeRateLimits(headers);
      if (data) claudeLimits = { scope, data };
    } });
  }
  return complete(config, key, messages, config.provider === 'chatgpt' ? { ...options, fetcher: fetchThroughSystem } : options);
}

function signalMessage(signal, failure) {
  if (!signal.aborted) return failure?.message || '模型请求失败。';
  return signal.reason?.name === 'TimeoutError' ? '模型请求超时，可稍后重试。' : '已取消生成。';
}

function rangeFor(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2]), 0);
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end ? { start, end } : null;
}

async function streamRangeFile(request, path, contentType, extraHeaders = {}) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return new Response(null, { status: 404 });
  const headers = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(info.size),
    ...extraHeaders,
  };
  const rangeHeader = request.headers.get('range');
  const range = rangeHeader ? rangeFor(rangeHeader, info.size) : null;
  if (rangeHeader && !range) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + info.size } });
  }
  if (range) {
    headers['Content-Length'] = String(range.end - range.start + 1);
    headers['Content-Range'] = 'bytes ' + range.start + '-' + range.end + '/' + info.size;
  }
  const body = request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(path, range || undefined));
  return new Response(body, { status: range ? 206 : 200, headers });
}

async function pdfResponse(request, id) {
  const paper = library.find(id);
  if (!paper) return new Response(null, { status: 404 });
  return streamRangeFile(request, library.pathFor(id), 'application/pdf');
}

function authorizedAmbientSet() {
  const saved = library?.getSetting?.('ambient-folders-v1', []);
  const set = new Set();
  if (Array.isArray(saved)) {
    for (const item of saved) {
      if (typeof item === 'string' && item.trim()) set.add(resolve(item));
    }
  }
  return set;
}

function authorizeAmbientFolder(folderPath) {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return '';
  const resolved = resolve(folderPath);
  const set = authorizedAmbientSet();
  set.add(resolved);
  library?.setSetting?.('ambient-folders-v1', [...set]);
  return resolved;
}

function isAuthorizedAmbientFolder(folderPath) {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return false;
  return authorizedAmbientSet().has(resolve(folderPath));
}

async function ambientResponse(request, url) {
  const source = url.searchParams.get('source') || 'builtin';
  const folder = url.searchParams.get('folder') || '';
  const name = url.searchParams.get('name') || '';
  let targetDir = '';
  if (source === 'builtin') {
    targetDir = builtinSoundsDir;
  } else if (isAuthorizedAmbientFolder(folder)) {
    targetDir = folder;
  } else {
    return new Response(null, { status: 403 });
  }
  const target = resolveAmbientAudioFile(targetDir, name);
  const mime = ambientMimeType(name);
  if (!target || !mime) return new Response(null, { status: 404 });
  return streamRangeFile(request, target, mime, { 'Cache-Control': 'public, max-age=300' });
}

function authorizedAlbumSet() {
  const saved = library?.getSetting?.('album-folders-v1', []);
  const set = new Set();
  if (Array.isArray(saved)) {
    for (const item of saved) {
      if (typeof item === 'string' && item.trim()) set.add(resolve(item));
    }
  }
  return set;
}

function authorizeAlbumFolder(folderPath) {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return '';
  const resolved = resolve(folderPath);
  const set = authorizedAlbumSet();
  set.add(resolved);
  library?.setSetting?.('album-folders-v1', [...set]);
  return resolved;
}

function isAuthorizedAlbumFolder(folderPath) {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return false;
  const resolved = resolve(folderPath);
  if (resolved === resolve(defaultAlbumDir)) return true;
  return authorizedAlbumSet().has(resolved);
}

async function existingDirectory(folderPath) {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return undefined;
  const resolved = resolve(folderPath);
  try {
    const info = await stat(resolved);
    return info.isDirectory() ? resolved : undefined;
  } catch {
    return undefined;
  }
}

const albumImageCache = new Map();
const ALBUM_CACHE_MAX = 64;

function getCachedAlbumThumb(key) {
  if (!albumImageCache.has(key)) return null;
  const hit = albumImageCache.get(key);
  albumImageCache.delete(key);
  albumImageCache.set(key, hit);
  return hit;
}

function setCachedAlbumThumb(key, entry) {
  if (albumImageCache.has(key)) albumImageCache.delete(key);
  albumImageCache.set(key, entry);
  while (albumImageCache.size > ALBUM_CACHE_MAX) {
    const oldest = albumImageCache.keys().next().value;
    albumImageCache.delete(oldest);
  }
}

async function albumResponse(request, url) {
  const folder = url.searchParams.get('folder') || '';
  const name = url.searchParams.get('name') || '';
  const rawMaxWidth = Number(url.searchParams.get('w'));
  const maxWidth = Number.isFinite(rawMaxWidth) && rawMaxWidth > 0 ? Math.min(2000, Math.max(80, Math.round(rawMaxWidth))) : 0;
  if (!isAuthorizedAlbumFolder(folder)) return new Response(null, { status: 403 });
  const target = resolveAlbumImageFile(folder, name);
  const mime = albumMimeType(name);
  if (!target || !mime) return new Response(null, { status: 404 });
  try {
    const info = await stat(target);
    if (!info.isFile()) return new Response(null, { status: 404 });
    if (maxWidth > 0 && request.method === 'GET' && mime !== 'image/gif') {
      const cacheKey = `${target}|${info.mtimeMs}|${maxWidth}`;
      let cached = getCachedAlbumThumb(cacheKey);
      if (!cached) {
        const img = nativeImage.createFromPath(target);
        if (!img.isEmpty()) {
          const { width, height } = img.getSize();
          if (width > maxWidth || height > maxWidth) {
            const resized = width >= height
              ? img.resize({ width: maxWidth, quality: 'good' })
              : img.resize({ height: maxWidth, quality: 'good' });
            const isPng = mime === 'image/png';
            const buffer = isPng ? resized.toPNG() : resized.toJPEG(84);
            cached = { buffer, contentType: isPng ? 'image/png' : 'image/jpeg' };
            setCachedAlbumThumb(cacheKey, cached);
          }
        }
      }
      if (cached) {
        return new Response(cached.buffer, {
          status: 200,
          headers: {
            'Content-Type': cached.contentType,
            'Content-Length': String(cached.buffer.length),
            'Cache-Control': 'public, max-age=300',
          },
        });
      }
    }
    const headers = {
      'Content-Type': mime,
      'Content-Length': String(info.size),
      'Cache-Control': 'public, max-age=300',
    };
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
    return new Response(Readable.toWeb(createReadStream(target)), { status: 200, headers });
  } catch {
    return new Response(null, { status: 404 });
  }
}

async function bingWallpaperResponse(request, url) {
  if (!bingWallpaper) return new Response(null, { status: 404 });
  try {
    const date = url.searchParams.get('date') || '';
    const market = url.searchParams.get('market') || 'zh-CN';
    const kind = url.searchParams.get('kind') || 'full';
    const { filePath, mime } = await bingWallpaper.getImageFile({ market, date, kind });
    const info = await stat(filePath);
    if (!info.isFile()) return new Response(null, { status: 404 });
    const headers = {
      'Content-Type': mime,
      'Content-Length': String(info.size),
      'Cache-Control': 'public, max-age=86400',
    };
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
    return new Response(Readable.toWeb(createReadStream(filePath)), { status: 200, headers });
  } catch {
    return new Response(null, { status: 404 });
  }
}

function serveApp() {
  protocol.handle('litreader', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app' || !['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 404 });
    if (url.pathname.startsWith('/documents/')) return pdfResponse(request, url.pathname.slice('/documents/'.length));
    if (url.pathname === '/album-file') return albumResponse(request, url);
    if (url.pathname === '/ambient-file') return ambientResponse(request, url);
    if (url.pathname === '/bing-wallpaper-file') return bingWallpaperResponse(request, url);
    try {
      const path = resolve(dist, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      const child = relative(dist, path);
      if (!child || child.startsWith('..') || isAbsolute(child)) return new Response(null, { status: 404 });
      return await net.fetch(pathToFileURL(path).href);
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

function publicResearch(snapshot) {
  if (!snapshot.summary) return snapshot;
  const { summaryDraft, ...summary } = snapshot.summary;
  return { ...snapshot, summary: { ...summary, canRetry: Boolean(summaryDraft) } };
}

async function runResearch(event, input) {
  const { paper, request, operation } = input || {};
  if (typeof request !== 'string' || !requestIdPattern.test(request) || jobs.has(request)
    || !['summary', 'references', 'figure'].includes(operation) || !library.find(paper)) {
    throw new Error('无效的论文任务。');
  }
  const task = paper + ':' + operation;
  if (activeResearch.has(task)) throw new Error('这项任务仍在运行。');
  if (operation !== 'figure' && !input.retry && (typeof input.text !== 'string' || input.text.length > 12000000
    || !Array.isArray(input.pageTextLengths) || input.pageTextLengths.length > 20000)) {
    throw new Error('论文文字超出可处理的范围。');
  }
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(operation === 'figure' ? 150000 : 900000)]);
  jobs.set(request, controller);
  activeResearch.add(task);
  const progress = (message, references) => {
    if (!event.sender.isDestroyed()) event.sender.send('research:progress', { paper, request, operation, message, references });
  };
  try {
    const config = modelSelection(currentConfig());
    const sourceKey = savedKey();
    // Reuse the same credential identity for all calls in this task.
    const key = await getCredential(config, sourceKey);
    let actual = '';
    const modelCall = (system, user, options) => {
      signal.throwIfAborted();
      return completeModel(config, key, [{ role: 'system', content: system }, { role: 'user', content: user }], {
        ...options, onModel: (value) => { if (typeof value === 'string') actual = value.slice(0, 150); },
      });
    };
    const metadata = () => ({ provider: config.provider, model: config.label, modelId: config.model,
      actualModel: actual, effort: config.effort, finishedAt: new Date().toISOString() });
    const current = library.research(paper);
    if (operation === 'summary') {
      if (typeof input.text !== 'string' || input.text.length > 12000000) throw new Error('需要重新提取论文文字。');
      if (input.retry && !current.summary?.summaryDraft) throw new Error('没有可重试的分段笔记。');
      const outcome = await analyzePaper(modelCall, { context: { contextWindow: config.contextWindow },
        defaultMaxTokens: ['deepseek', 'openai', 'chatgpt'].includes(config.provider) ? 24576 : 8192 },
      { ...input, summaryDraft: input.retry ? current.summary?.summaryDraft : undefined }, signal, progress);
      library.saveResearch(paper, 'summary', '', { ...outcome, metadata: metadata() });
    }
    if (operation === 'references') {
      const persist = (result) => {
        library.saveResearch(paper, 'references', '', { ...result, metadata: metadata() });
        progress(undefined, result);
      };
      const storedOpenAlex = library.getSetting('openalex', '');
      let openAlexKey = '';
      try { if (storedOpenAlex) openAlexKey = safeStorage.decryptString(Buffer.from(storedOpenAlex, 'base64')); }
      catch { progress('OpenAlex 密钥无法读取，将使用 Crossref'); }
      const outcome = await organizeReferences(modelCall, input, current.references, signal, persist, progress, { openAlexKey });
      persist(outcome);
    }
    if (operation === 'figure') {
      const position = input.position;
      if (!Number.isSafeInteger(input.page) || input.page < 1 || input.page > 20000 || !position
        || ![position.x, position.y, position.w, position.h].every(Number.isFinite)
        || position.x < 0 || position.y < 0 || position.w <= 0 || position.h <= 0
        || position.x + position.w > 1.001 || position.y + position.h > 1.001
        || typeof input.image !== 'string' || input.image.length > 4000000
        || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(input.image)) throw new Error('插图选区无效，请重新框选。');
      if (config.images === 'no') throw new Error('当前配置关闭了视觉输入，请在模型设置中选择支持图像的模型。');
      if (config.provider === 'deepseek' && config.images === 'auto' && !/^deepseek-(?:flash|v4(?:\\.1)?-flash)/.test(config.model)) {
        throw new Error('请选择 DeepSeek Flash 等支持图像输入的模型。');
      }
      const converted = nativeImage.createFromDataURL(input.image);
      if (converted.isEmpty() || Math.max(...Object.values(converted.getSize())) > 2000) throw new Error('无法读取所选插图。');
      progress('正在解读所选插图');
      const outcome = await analyzeFigure(modelCall, input, signal);
      const preview = 'data:image/jpeg;base64,' + converted.resize({ width: 380 }).toJPEG(78).toString('base64');
      const id = randomUUID();
      library.saveResearch(paper, 'figure', id, { ...outcome, id, preview, metadata: metadata() });
    }
    return publicResearch(library.research(paper));
  } catch (error) {
    throw new Error(signalMessage(signal, error));
  } finally {
    activeResearch.delete(task);
    jobs.delete(request);
  }
}

function legacyMetadata(value) {
  if (!value) return null;
  const model = value.actualModel || value.modelId || value.model;
  return { provider: value.provider, model, modelName: value.model || model,
    reasoningEffort: value.effort === 'default' ? '' : value.effort, followDefault: value.effort === 'default',
    generatedAt: value.finishedAt };
}

function readerData(id) {
  const records = library.records(id);
  const research = library.research(id);
  const summary = research.summary;
  return {
    marks: records.marks.map((item) => ({ ...item, text: item.quote, hl: item.kind === 'highlight',
      kind: item.kind === 'highlight' ? 'hl' : 'note' })),
    terms: records.terms.map((item) => ({ id: item.key, term: item.term, body: item.body, error: item.error, surrounding: item.context })),
    result: {
      ...(summary ? {
        summary: summary.text, summaryCoverage: { ...summary.coverage, failedChunks: summary.failedChunks, notes: summary.mode === 'notes' },
        summaryMeta: legacyMetadata(summary.metadata),
        summaryDetail: { format: 'detailed-markdown', mode: summary.mode, draft: summary.summaryDraft, error: summary.synthesisError },
      } : {}),
      references: research.references?.entries || [],
    },
    figures: research.figures.map((item) => ({ ...item, ...legacyMetadata(item.metadata) })),
    ...library.readerData(id),
  };
}

function lookupKey() {
  try {
    const encrypted = library.getSetting('openalex', '');
    return encrypted ? safeStorage.decryptString(Buffer.from(encrypted, 'base64')) : '';
  } catch { return ''; }
}

async function readerRequest(event, path, body) {
  if (!['/translate', '/term', '/formula', '/summary', '/figure', '/agent',
    '/references/segment', '/references/fields', '/references/resolve'].includes(path)
    || typeof body?.request !== 'string' || !requestIdPattern.test(body.request) || jobs.has(body.request)) {
    throw new Error('无效的阅读任务。');
  }
  const controller = new AbortController();
  jobs.set(body.request, controller);
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(path === '/summary' ? 790000 : path === '/agent' ? 490000 : 290000)]);
  try {
    const translation = path === '/translate' ? translationPreference() : null;
    if (translation?.mode === 'local') {
      return { ok: true, ...await translateOffline(body.text, translation, signal) };
    }
    const separate = translation?.mode === 'separate';
    if (!separate && body.provider && !connectionProviders.includes(body.provider)) throw new Error('请重新选择可用模型。');
    const provider = body.provider || currentConfig().provider;
    const stored = separate ? translateWithConfiguredProfile() : providerConfig(provider);
    const chosenModel = separate ? stored.model : body.model || stored.model;
    const sameModel = chosenModel === stored.model;
    const config = await configuredSelection({ provider: stored.provider, model: chosenModel,
      ...(sameModel ? { contextWindow: stored.contextWindow } : {}),
      effort: separate ? stored.effort : body.reasoningEffort ?? (sameModel ? stored.effort : 'default') });
    const credential = await getCredential(config, savedKey(stored));
    if (path === '/figure' && (config.images === 'no'
      || (config.provider === 'deepseek' && config.images === 'auto' && !/^deepseek-(?:flash|v4(?:\.1)?-flash)/.test(config.model)))) {
      return { ok: false, code: 'figure-model' };
    }
    let actual = '';
    const modelCall = (system, user, options) => completeModel(config, credential,
      [{ role: 'system', content: system }, { role: 'user', content: user }], {
        ...options, signal: options?.signal || signal,
        onModel: (model) => { if (typeof model === 'string') actual = model.slice(0, 200); },
      });
    const metadata = () => ({
      provider: config.provider, model: config.model,
      modelName: config.provider === 'workbuddy' && actual ? actual : config.label || config.model, actualModel: actual,
      reasoningEffort: config.effort === 'default' ? '' : config.effort,
      generatedAt: new Date().toISOString(),
    });
    if (path === '/agent') {
      const paper = library.find(body.paper);
      if (!paper) throw new Error('请先打开一篇 PDF 文献。');
      if (activeAgentPapers.has(paper.id)) throw new Error('这篇文献已有问题正在处理。');
      activeAgentPapers.add(paper.id);
      try {
        const turn = await runReadingAgent(body, {
          modelCall, signal, contextWindow: config.contextWindow, documentName: paper.name,
          history: library.agentHistory(paper.id),
          progress: (phase, text) => {
            if (!signal.aborted && !event.sender.isDestroyed()) {
              event.sender.send('agent:progress', { request: body.request, phase, text });
            }
          },
        });
        signal.throwIfAborted();
        return { ok: true, turn: library.appendAgentTurn(paper.id, {
          ...turn, id: body.request, metadata: metadata(),
        }) };
      } finally {
        activeAgentPapers.delete(paper.id);
      }
    }
    const result = await runReaderRequest(path, body, signal, {
      modelCall, metadata, openAlexKey: path === '/references/resolve' ? lookupKey() : undefined,
      modelInfo: {
        context: { contextWindow: config.contextWindow },
        defaultMaxTokens: config.provider === 'workbuddy' ? 8192 : 24576,
      },
    });
    return translation && result.ok ? { ...result, ...metadata() } : result;
  } catch (error) {
    return { ok: false, error: signalMessage(signal, error) };
  } finally {
    jobs.delete(body.request);
  }
}

async function availableModel(provider, id) {
  if (!connectionProviders.includes(provider) || !id) throw new Error('请在模型设置中选择可用模型。');
  if (!hasConnection(provider)) throw new Error('请先在模型设置中连接 ' + connectionNames[provider] + '。');
  const account = provider === 'chatgpt' ? chatgpt.status().active : null;
  const { models } = await discoverModels({ provider });
  if (provider === 'chatgpt' && chatgpt.status().active !== account) throw new Error('ChatGPT 账号已切换，请重新选择模型。');
  if (!hasConnection(provider)) throw new Error('账号连接已更改，请重新选择模型。');
  const model = models.find((entry) => entry.id === id)
    || (provider === 'workbuddy' && id === 'default' ? models.find((entry) => entry.isDefault) : null);
  if (!model) throw new Error('当前连接未提供所选模型，请重新选择。');
  return model;
}

async function configuredSelection(input, advanced = false) {
  const entry = await availableModel(input?.provider, input?.model);
  const profile = providerConfig(input.provider);
  const sameModel = profile.model === entry.id;
  const contextWindow = advanced ? input.contextWindow || entry.contextWindow
    : input.contextWindow || (sameModel ? profile.contextWindow : null) || entry.contextWindow;
  const efforts = availableEfforts(input.provider, entry.id, entry);
  const preference = advanced ? input.images : sameModel ? profile.images : 'auto';
  const images = preference && preference !== 'auto' ? preference : entry.images || 'auto';
  return modelSelection({ ...profile, model: entry.id, label: entry.label, contextWindow, images,
    effort: efforts.ids.includes(input.effort) ? input.effort : 'default' });
}

async function validateTranslation(input, question) {
  if (input?.mode === 'local') {
    const model = input.model ?? defaultLocalTranslationModel;
    if (!offlineTranslators.has(model)) throw new Error('请选择可用的离线翻译模型。');
    return { mode: 'local', model };
  }
  if (input?.mode === 'configured' && question) return { mode: 'configured' };
  if (input?.mode !== 'separate') throw new Error('请选择翻译模型。');
  const model = await configuredSelection(input);
  return { mode: 'separate', provider: model.provider, model: model.model,
    label: model.label, effort: model.effort, contextWindow: model.contextWindow };
}

async function* pdfsInFolder(root, errors) {
  const pending = [root];
  while (pending.length) {
    const folder = pending.pop();
    let entries;
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch (error) {
      errors.push(basename(folder) + '：' + error.message);
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) pending.push(join(folder, entry.name));
      else if (entry.isFile() && /\.pdf$/i.test(entry.name)) yield join(folder, entry.name);
    }
  }
}

function clearKimiCodeDirectory() {
  for (const key of modelDirectories.keys()) {
    if (key.startsWith('["kimi-code",')) modelDirectories.delete(key);
  }
}

async function kimiCodeLogin(action) {
  let result;
  if (action === 'begin') result = await kimiCode.beginLogin();
  else if (action === 'poll') result = await kimiCode.pollLogin();
  else if (action === 'cancel') return kimiCode.cancelLogin();
  else throw new Error('无效的 Kimi Code 授权操作。');
  if (result.status === 'authenticated') {
    clearKimiCodeDirectory();
    library.setSetting('kimi-code-connected', true);
  }
  return result;
}

function attachActions() {
  const importLibraryPapers = async (paths, category, errors = []) => {
    const papers = new Set();
    for await (const path of paths) {
      try {
        papers.add((await library.importFile(path, category ?? null)).id);
      } catch (error) {
        errors.push(basename(String(path)) + '：' + error.message);
      }
    }
    return { count: papers.size, errors };
  };
  registerHandler('paper:library', () => library.paperLibrary());
  registerHandler('paper:library-folder', async (_event, category) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择包含 PDF 的文件夹', properties: ['openDirectory', 'dontAddToRecent'],
    });
    if (result.canceled || !result.filePaths[0]) return { count: 0, errors: [] };
    const errors = [];
    const imported = await importLibraryPapers(pdfsInFolder(result.filePaths[0], errors), category, errors);
    return { ...imported, empty: !imported.count && !errors.length };
  });
  registerHandler('paper:library-drop', (_event, paths, category) => {
    if (!Array.isArray(paths) || paths.length > 2000) throw new Error('一次最多导入 2000 份 PDF。');
    return importLibraryPapers(paths, category);
  });
  registerHandler('paper:category-save', (_event, input) => library.savePaperCategory(input));
  registerHandler('paper:category-remove', (_event, id) => library.removePaperCategory(id));
  registerHandler('paper:classify', (_event, ids, target) => library.classifyPapers(ids, target));
  registerHandler('paper:category-exclude', (_event, ids, category) => library.removePapersFromCategory(ids, category));
  registerHandler('paper:tag-create', (_event, name) => library.createPaperTag(name));
  registerHandler('paper:details', (_event, id, details) => library.updatePaperDetails(id, details));
  registerHandler('paper:abstract-translation', (_event, id, source, translated) =>
    library.savePaperAbstractTranslation(id, source, translated));
  registerHandler('paper:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    return result.canceled ? null : library.importFile(result.filePaths[0]);
  });
  registerHandler('paper:drop', (_event, file) => library.importFile(file));
  registerHandler('paper:recent', () => library.recent());
  registerHandler('paper:reopen', (_event, id) => library.reopen(id));
  registerHandler('paper:position', (_event, id, page, zoom, pageCount) => library.position(id, page, zoom, pageCount));
  registerHandler('paper:readPages', (_event, id, pages) => library.markPagesRead(id, pages));
  registerHandler('paper:page-count', (_event, id, count) => library.savePaperPageCount(id, count));
  registerHandler('paper:index', (_event, id, count, details) => library.indexPaper(id, count, details));
  registerHandler('paper:records', (_event, id) => library.records(id));
  registerHandler('reader:data', (_event, id) => readerData(id));
  registerHandler('reader:save', (_event, id, kind, value) => library.saveReaderData(id, kind, value));
  registerHandler('reader:request', readerRequest);
  registerHandler('parallel:layout', (_event, pixels) => detectPdfLayout(pixels, app.isPackaged));
  registerHandler('parallel:page', (_event, paper, page) => library.parallelPage(paper, page));
  registerHandler('parallel:save', (_event, paper, page, entry) => library.saveParallelBlock(paper, page, entry));
  registerHandler('agent:history', (_event, paper) => library.agentHistory(paper));
  registerHandler('mark:add', (_event, id, record) => library.addMark(id, record));
  registerHandler('mark:edit', (_event, id, key, body) => library.updateMark(id, key, body));
  registerHandler('mark:delete', (_event, id, key) => library.deleteMark(id, key));
  registerHandler('term:delete', (_event, id, key) => library.deleteTerm(id, key));
  registerHandler('model:get', () => publicConfig());
  registerHandler('model:connections', () => Promise.all(connectionProviders.map((provider) => modelConnection(provider))));
  registerHandler('model:connection', (_event, provider, refresh) => modelConnection(provider, refresh === true));
  registerHandler('model:connection-update', (_event, provider, input) => updateConnection(provider, input));
  registerHandler('model:usage', (_event, provider, refresh) => connectionUsage(provider, refresh === true));
  registerHandler('kimi-code:login', (_event, action) => kimiCodeLogin(action));
  registerHandler('chatgpt:status', () => chatgpt.status());
  registerHandler('chatgpt:login', (_event, account) => chatgpt.signIn(account));
  registerHandler('chatgpt:select', (_event, account) => chatgpt.select(account));
  registerHandler('chatgpt:cancel', () => chatgpt.cancel());
  registerHandler('chatgpt:logout', () => chatgpt.signOut());
  registerHandler('link:open', (_event, address) => {
    if (typeof address !== 'string' || !/^https?:\/\//i.test(address)) throw new Error('无效的文献地址。');
    const link = new URL(address);
    if (link.username || link.password) throw new Error('无效的文献地址。');
    return shell.openExternal(link.href);
  });
  registerHandler('research:get', (_event, id) => publicResearch(library.research(id)));
  registerHandler('research:delete-figure', (_event, paper, figure) => {
    library.removeFigure(paper, figure);
    return library.research(paper).figures;
  });
  registerHandler('research:run', runResearch);
  registerHandler('model:save', async (_event, input) => {
    const question = input.question ? await configuredSelection(input.question, true) : null;
    const translation = await validateTranslation(input.translation, question);
    const openAlexKey = checkKey(input.openAlexKey);
    const settings = { 'translation-routing': translation };
    if (question) {
      const saved = providerConfig(question.provider);
      const profile = { ...question, secret: saved.secret || '',
        ...(saved.verifiedModel ? { verifiedModel: saved.verifiedModel } : {}) };
      settings['model-' + question.provider] = profile;
      settings.model = profile;
    } else {
      settings.model = defaultModel;
    }
    if (openAlexKey || input.clearOpenAlex) settings.openalex = openAlexKey ? protect(openAlexKey) : '';
    library.setSettings(settings);
    return publicConfig();
  });
  registerHandler('model:test', async (_event, input) => {
    const config = await configuredSelection(input, true);
    const key = await getCredential(config, savedKey(providerConfig(config.provider)));
    const signal = AbortSignal.timeout(30000);
    try {
      await completeModel(config, key, makeMessages('test'), { signal, maxTokens: config.effort === 'default' ? 1024 : 4096 });
    } catch (failure) {
      throw new Error(signalMessage(signal, failure));
    }
    return true;
  });
  registerHandler('job:start', async (event, input) => {
    const { paper, request, operation } = input ?? {};
    if (!requestIdPattern.test(request) || jobs.has(request) || !library.find(paper)
      || !['term', 'translation'].includes(operation)) throw new Error('无效的模型任务。');
    const source = typeof input.source === 'string' ? input.source.trim() : '';
    const maxLength = operation === 'term' ? 200 : 6000;
    if (!source || source.length > maxLength) throw new Error('请缩短原文选区后再试。');
    const context = typeof input.context === 'string' ? input.context.slice(0, 2400) : '';
    const isTerm = operation === 'term';
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]);
    if (isTerm) library.beginTerm(paper, source, request, context);
    jobs.set(request, controller);
    let body = '';
    let error = '';
    let lastProgress = 0;
    try {
      const translation = isTerm ? null : translationPreference();
      if (translation?.mode === 'local') {
        const { text } = await translateOffline(source, translation, signal);
        return { body: text };
      }
      const profile = isTerm ? currentConfig() : translateWithConfiguredProfile();
      const config = modelSelection(profile);
      const key = await getCredential(config, savedKey(profile));
      body = await completeModel(config, key, makeMessages(operation, source, context), {
        signal,
        onText: isTerm ? undefined : (output) => {
          const now = Date.now();
          if (now - lastProgress < 80 || event.sender.isDestroyed()) return;
          lastProgress = now;
          event.sender.send('job:progress', { paper, request, output });
        },
      });
    } catch (failure) {
      error = signalMessage(signal, failure);
    } finally {
      jobs.delete(request);
    }
    if (isTerm) return { terms: library.finishTerm(paper, source, request, body, error) };
    if (error) throw new Error(error);
    return { body };
  });
  registerHandler('job:cancel', (_event, request) => jobs.get(request)?.abort());
  registerHandler('app:version', () => app.getVersion());
  registerHandler('app:check-update', async (_event, force = false) => {
    if (force) updateCheck = null;
    if (!updateCheck) {
      updateCheck = findAppUpdateDetails(app.getVersion(), fetchThroughSystem,
        AbortSignal.any([appLifetime.signal, AbortSignal.timeout(10000)])).catch((error) => {
        updateCheck = null;
        if (force) throw new Error('检查更新失败，请确认网络或系统代理连接正常。');
        return null;
      });
    }
    return updateCheck;
  });
  registerHandler('app:cancel-update', () => {
    updateDownloadController?.abort();
    updateDownloadController = null;
    return true;
  });
  registerHandler('app:install-update', async (event, updateInfo) => {
    if (!app.isPackaged) {
      return { started: false, reason: 'dev', message: '当前为开发模式，无法自动覆盖，请前往 Release 页面下载。' };
    }
    const exePath = app.getPath('exe');
    const exeDir = dirname(exePath);
    const isInstaller = process.platform === 'win32'
      && (existsSync(join(exeDir, 'unins000.exe'))
        || (await readdir(exeDir).catch(() => [])).some((name) => /^unins\d+\.exe$/i.test(name)));
    const asset = selectUpdateAsset(updateInfo?.assets, {
      platform: process.platform,
      arch: process.arch,
      isInstaller,
    });
    if (!asset) {
      return { started: false, reason: 'no-asset', message: '未找到适配当前系统的安装包，请前往 Release 页面手动下载。' };
    }
    if (updateDownloadController) {
      throw new Error('正在下载更新，请稍候。');
    }

    const controller = new AbortController();
    updateDownloadController = controller;
    const signal = AbortSignal.any([appLifetime.signal, controller.signal]);
    const updatesDir = join(app.getPath('userData'), 'updates');
    await mkdir(updatesDir, { recursive: true });
    const targetFile = join(updatesDir, basename(asset.name));
    const partFile = targetFile + '.part';
    const sendProgress = (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send('app:update-progress', payload);
    };

    try {
      let skipDownload = false;
      if (asset.size > 0 && existsSync(targetFile)) {
        try {
          const existing = await stat(targetFile);
          if (existing.isFile() && existing.size === asset.size) skipDownload = true;
        } catch {}
      }

      if (!skipDownload) {
        sendProgress({ stage: 'downloading', received: 0, total: asset.size || 0, percent: 0 });
        const res = await fetchThroughSystem(asset.url, { signal });
        if (!res.ok || !res.body) throw new Error(`下载更新失败（HTTP ${res.status}）。`);
        const total = Number(res.headers.get('content-length')) || asset.size || 0;
        let received = 0;
        let lastSent = 0;
        const reader = res.body.getReader();
        const stream = new Readable({
          async read() {
            try {
              const { done, value } = await reader.read();
              if (done) {
                this.push(null);
                return;
              }
              received += value.byteLength;
              const now = Date.now();
              if (now - lastSent >= 100 || (total && received >= total)) {
                lastSent = now;
                const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
                sendProgress({ stage: 'downloading', received, total, percent });
              }
              this.push(Buffer.from(value));
            } catch (err) {
              this.destroy(err);
            }
          },
        });
        await pipeline(stream, createWriteStream(partFile), { signal });
        if (asset.size > 0) {
          const info = await stat(partFile);
          if (info.size !== asset.size) {
            await rm(partFile, { force: true }).catch(() => {});
            throw new Error('下载文件不完整，请重试。');
          }
        }
        await rm(targetFile, { force: true }).catch(() => {});
        await rename(partFile, targetFile);
      }

      sendProgress({ stage: 'installing', received: asset.size || 0, total: asset.size || 0, percent: 100 });

      if (asset.kind === 'win-installer') {
        const child = spawn(targetFile, ['/SILENT', '/CLOSEAPPLICATIONS', '/RESTARTAPPLICATIONS'], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        setTimeout(() => app.quit(), 250);
        return { started: true, kind: asset.kind };
      }

      if (asset.kind === 'win-zip') {
        const extractDir = join(updatesDir, 'extract-' + Date.now());
        await mkdir(extractDir, { recursive: true });
        await execFileAsync('powershell.exe', [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
          `Expand-Archive -LiteralPath '${targetFile.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
        ], { signal });
        let sourceDir = extractDir;
        if (!existsSync(join(sourceDir, 'CoReader.exe'))) {
          const entries = await readdir(extractDir, { withFileTypes: true });
          const sub = entries.find((entry) => entry.isDirectory() && existsSync(join(extractDir, entry.name, 'CoReader.exe')));
          if (sub) sourceDir = join(extractDir, sub.name);
        }
        if (!existsSync(join(sourceDir, 'CoReader.exe'))) {
          throw new Error('更新包内容异常，未找到 CoReader.exe。');
        }
        const psScript = join(tmpdir(), `coreader-update-${process.pid}-${Date.now()}.ps1`);
        const esc = (s) => s.replace(/'/g, "''");
        await writeFile(psScript, [
          `Wait-Process -Id ${process.pid} -Timeout 30 -ErrorAction SilentlyContinue`,
          'Start-Sleep -Milliseconds 600',
          `Copy-Item -Path '${esc(sourceDir)}\\*' -Destination '${esc(exeDir)}' -Recurse -Force`,
          `Start-Process -FilePath '${esc(exePath)}'`,
          `Remove-Item -LiteralPath '${esc(extractDir)}' -Recurse -Force -ErrorAction SilentlyContinue`,
          `Remove-Item -LiteralPath '${esc(psScript)}' -Force -ErrorAction SilentlyContinue`,
        ].join('\r\n'), 'utf8');
        const child = spawn('powershell.exe', [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', psScript,
        ], { detached: true, stdio: 'ignore' });
        child.unref();
        setTimeout(() => app.quit(), 250);
        return { started: true, kind: asset.kind };
      }

      if (asset.kind === 'mac-zip') {
        const appBundle = resolve(exeDir, '../..');
        if (!appBundle.endsWith('.app')) {
          return { started: false, reason: 'no-bundle', message: '无法定位当前应用包，请前往 Release 页面手动更新。' };
        }
        const extractDir = join(updatesDir, 'extract-' + Date.now());
        await mkdir(extractDir, { recursive: true });
        await execFileAsync('ditto', ['-x', '-k', targetFile, extractDir], { signal });
        const newApp = join(extractDir, 'CoReader.app');
        if (!existsSync(newApp)) throw new Error('更新包内未找到 CoReader.app。');
        const shScript = join(tmpdir(), `coreader-update-${process.pid}-${Date.now()}.sh`);
        const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
        await writeFile(shScript, [
          '#!/bin/sh',
          `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
          `rm -rf ${q(appBundle)} && ditto ${q(newApp)} ${q(appBundle)} && open -n ${q(appBundle)}`,
          `rm -rf ${q(extractDir)} ${q(shScript)}`,
        ].join('\n'), { mode: 0o755 });
        const child = spawn('/bin/sh', [shScript], { detached: true, stdio: 'ignore' });
        child.unref();
        setTimeout(() => app.quit(), 250);
        return { started: true, kind: asset.kind };
      }

      return { started: false, reason: 'unsupported' };
    } catch (error) {
      await rm(partFile, { force: true }).catch(() => {});
      if (controller.signal.aborted) {
        return { started: false, reason: 'canceled' };
      }
      throw error;
    } finally {
      if (updateDownloadController === controller) updateDownloadController = null;
    }
  });
  registerHandler('window:ready', () => reportStartup('READY'));
  registerHandler('album:choose-folder', async (_event, currentFolder = '') => {
    const defaultPath = await existingDirectory(currentFolder || defaultAlbumDir);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择照片文件夹',
      ...(defaultPath ? { defaultPath } : {}),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const folder = authorizeAlbumFolder(result.filePaths[0]);
    return listAlbumImages(folder);
  });
  registerHandler('album:list-folder', async (_event, folder = '') => {
    if (!folder) {
      const listed = await listAlbumImages(defaultAlbumDir);
      if (listed.missing || !listed.images.length) return { path: '', images: [], missing: false };
      return { ...listed, isDefault: true };
    }
    if (!isAuthorizedAlbumFolder(folder)) return { path: '', images: [], unauthorized: true };
    return listAlbumImages(folder);
  });
  registerHandler('ambient:choose-folder', async (_event, currentFolder = '') => {
    const defaultPath = await existingDirectory(currentFolder || builtinSoundsDir);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择白噪音音频文件夹',
      ...(defaultPath ? { defaultPath } : {}),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const folder = authorizeAmbientFolder(result.filePaths[0]);
    return listAmbientAudio(folder, false);
  });
  registerHandler('ambient:list-tracks', async (_event, folder = '') => {
    if (!folder) return listAmbientAudio(builtinSoundsDir, true);
    if (!isAuthorizedAmbientFolder(folder)) return { path: '', tracks: [], unauthorized: true };
    return listAmbientAudio(folder, false);
  });
  registerHandler('bing-wallpaper:list', async (_event, options = {}) => {
    const result = await bingWallpaper.list({ market: options?.market, force: Boolean(options?.force) });
    const decorate = (item, market) => ({
      date: item.date,
      title: item.title,
      copyright: item.copyright,
      market,
      ...(item.savedPath ? { savedPath: item.savedPath } : {}),
      fullUrl: `${origin}/bing-wallpaper-file?date=${encodeURIComponent(item.date)}&market=${encodeURIComponent(market)}&kind=full`,
      thumbUrl: `${origin}/bing-wallpaper-file?date=${encodeURIComponent(item.date)}&market=${encodeURIComponent(market)}&kind=thumb`,
    });
    const items = result.items.map((item) => decorate(item, result.market));
    const favorites = Array.isArray(result.favorites)
      ? result.favorites.map((item) => decorate(item, item.market || result.market))
      : [];
    return { ...result, items, favorites };
  });
  const currentBingSaveDir = () => library.getSetting('bing-wallpaper-save-dir', '')
    || join(app.getPath('pictures'), 'CoReader Bing Wallpapers');
  const decorateBingItem = (item, market) => ({
    date: item.date,
    title: item.title,
    copyright: item.copyright,
    market,
    ...(item.savedPath ? { savedPath: item.savedPath } : {}),
    fullUrl: `${origin}/bing-wallpaper-file?date=${encodeURIComponent(item.date)}&market=${encodeURIComponent(market)}&kind=full`,
    thumbUrl: `${origin}/bing-wallpaper-file?date=${encodeURIComponent(item.date)}&market=${encodeURIComponent(market)}&kind=thumb`,
  });
  registerHandler('bing-wallpaper:get-save-dir', () => ({
    path: currentBingSaveDir(),
    isDefault: !library.getSetting('bing-wallpaper-save-dir', ''),
  }));
  registerHandler('bing-wallpaper:choose-save-dir', async () => {
    const current = currentBingSaveDir();
    const defaultPath = await existingDirectory(current) || app.getPath('pictures');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择壁纸保存目录',
      ...(defaultPath ? { defaultPath } : {}),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const folder = result.filePaths[0];
    library.setSetting('bing-wallpaper-save-dir', folder);
    return { path: folder, isDefault: false };
  });
  registerHandler('bing-wallpaper:open-save-dir', async () => {
    const dir = currentBingSaveDir();
    await mkdir(dir, { recursive: true });
    const err = await shell.openPath(dir);
    if (err) throw new Error(err);
    return true;
  });
  registerHandler('bing-wallpaper:save-favorite', async (_event, input = {}) => {
    const res = await bingWallpaper.saveFavorite({
      market: input?.market,
      date: input?.date,
      saveDir: currentBingSaveDir(),
    });
    return {
      savedPath: res.savedPath,
      favorite: decorateBingItem(res.favorite, res.favorite.market),
      favorites: res.favorites.map((item) => decorateBingItem(item, item.market)),
    };
  });
  registerHandler('bing-wallpaper:remove-favorite', async (_event, input = {}) => {
    const res = await bingWallpaper.removeFavorite({
      market: input?.market,
      date: input?.date,
    });
    return {
      favorites: res.favorites.map((item) => decorateBingItem(item, item.market)),
    };
  });
  registerHandler('window:fullscreen', () => {
    const next = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(next);
    return next;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'CoReader', icon: appIcon, width: 1360, height: 880, minWidth: 760, minHeight: 550,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b2028' : '#f4f6f9',
    ...(isMac ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 14 } } : { autoHideMenuBar: true }),
    show: process.env.ENGLISH_LIT_READER_HIDDEN !== '1',
    webPreferences: { preload, nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  if (isMac) {
    const window = mainWindow;
    window.on('enter-full-screen', () => window.webContents.send('window:fullscreen-changed', true));
    window.on('leave-full-screen', () => window.webContents.send('window:fullscreen-changed', false));
  } else {
    mainWindow.removeMenu();
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.on('closed', () => { mainWindow = undefined; });
  return mainWindow.loadURL(origin + '/');
}

function installMacMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: '文件', submenu: [
      { id: 'open-pdf', label: '打开 PDF…', accelerator: 'Command+O', click: () => mainWindow?.webContents.send('window:open-paper') },
      { type: 'separator' },
      { role: 'close' },
    ] },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]));
}

function startupFailure(error) {
  const message = '初始化阅读器失败。' + (error?.message || '');
  if (startupStatus) reportStartup('ERROR ' + message);
  else dialog.showErrorBox('CoReader 启动失败', message);
  app.exit(1);
}

async function ensureSamplePaper() {
  if (library.getSetting('sample-paper-seeded-v1', false)) return;
  try {
    const seeded = await library.seedSamplePaper(samplePaperPath, {
      title: 'Attention Is All You Need',
      authors: 'Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Łukasz Kaiser, Illia Polosukhin',
      year: '2017',
      venue: 'NeurIPS',
      arxiv: '1706.03762',
      tags: ['示例论文', 'transformer'],
      status: 'unread',
    });
    if (seeded) library.setSetting('sample-paper-seeded-v1', true);
  } catch (error) {
    console.error('Could not seed sample paper:', error?.message || error);
  }
}

if (ownsApp) {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(async () => {
    library = openLibrary(app.getPath('userData'));
    await ensureSamplePaper();
    chatgpt = createChatGPTAuth({
      fetcher: fetchThroughSystem,
      read() {
        const value = library.getSetting('chatgpt', '');
        return value ? JSON.parse(safeStorage.decryptString(Buffer.from(value, 'base64'))) : null;
      },
      write(value) { library.setSetting('chatgpt', protect(JSON.stringify(value))); },
      openBrowser: (url) => shell.openExternal(url),
    });
    bingWallpaper = createBingWallpaper({
      cacheDir: join(app.getPath('userData'), 'bing-wallpaper'),
      fetcher: fetchThroughSystem,
    });
    serveApp();
    attachActions();
    if (isMac) installMacMenu();
    return createWindow();
  }).catch(startupFailure);
  app.on('activate', () => {
    if (isMac && library && !mainWindow) createWindow().catch(startupFailure);
  });
  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
  app.on('before-quit', () => {
    appLifetime.abort();
    chatgpt?.cancel();
    for (const controller of jobs.values()) controller.abort();
  });
}
