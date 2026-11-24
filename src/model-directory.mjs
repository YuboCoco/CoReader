import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { advertisedEfforts, claudeVersion } from './model-capabilities.mjs';

const maxModels = 1000;
const idPattern = /^[\w][\w./:@+-]{0,199}$/;
const apiNonText = /^(?:text-embedding-|text-moderation-|omni-moderation-|whisper-|tts-|dall-e-|sora(?:-|$)|gpt-image-|chatgpt-image-|davinci-002$|babbage-002$)|(?:^|-)(?:realtime|audio|transcribe|diarize|tts|embedding)(?:-|$)/i;

export function normalizeModelDirectory(items, provider) {
  const models = new Map();
  if (!Array.isArray(items)) return [];
  for (const item of items) {
    const id = item?.model || item?.slug || item?.id;
    if (typeof id !== 'string' || !idPattern.test(id) || models.has(id) || item.hidden
      || (provider === 'openai' && apiNonText.test(id))
      || (provider === 'claude' && item.lifecycle === 'retired')
      || (provider === 'doubao' && (!/^(?:doubao|ep)-/i.test(id) || (item.domain && !['LLM', 'VLM'].includes(item.domain))))
      || (provider === 'glm' && (!id.startsWith('glm-') || /(?:^|-)(?:ocr|image|asr|tts|embedding|realtime|voice)(?:-|$)/i.test(id)))) continue;
    const outputModalities = item.output_modalities ?? (provider === 'doubao' ? item.modalities?.output_modalities : undefined);
    if (Array.isArray(outputModalities) && !outputModalities.includes('text')) continue;
    const rawLabel = item.displayName || item.display_name || item.label || item.name;
    const label = typeof rawLabel === 'string' ? rawLabel.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) : '';
    const claudeEffort = provider === 'claude' ? item.capabilities?.effort : null;
    const declared = claudeEffort ? Object.entries(claudeEffort).filter(([, info]) => info?.supported === true).map(([level]) => level)
      : item.supportedReasoningEfforts ?? item.supported_reasoning_efforts ?? item.reasoning_efforts;
    const efforts = item.supportsReasoning === false ? [] : advertisedEfforts(declared, provider);
    const defaultEffort = item.defaultReasoningEffort ?? item.default_reasoning_effort;
    const contextWindow = Number(item.contextWindow ?? item.context_window ?? item.context_length ?? item.max_input_tokens ?? item.maxInputTokens
      ?? (provider === 'doubao' ? item.token_limits?.context_window : undefined));
    const claudeImages = provider === 'claude' ? item.capabilities?.image_input?.supported : undefined;
    const arkInputs = provider === 'doubao' ? item.modalities?.input_modalities : undefined;
    const images = provider === 'kimi-code' && ['yes', 'no'].includes(item.images) ? item.images
      : Array.isArray(arkInputs) ? (arkInputs.includes('image') ? 'yes' : 'no')
      : typeof claudeImages === 'boolean' ? (claudeImages ? 'yes' : 'no')
      : provider === 'glm' && /^glm-5\.3(?:-flashx?)?$/.test(id) ? (id === 'glm-5.3' ? 'no' : 'yes') : undefined;
    models.set(id, {
      id, label: label || id,
      ...(images ? { images } : {}),
      ...(efforts !== null ? { efforts } : {}),
      ...(efforts?.includes(defaultEffort) ? { defaultEffort } : {}),
      ...(Number.isSafeInteger(contextWindow) && contextWindow >= 4096 && contextWindow <= 4000000 ? { contextWindow } : {}),
      ...(item.isDefault === true ? { isDefault: true } : {}),
    });
    if (models.size >= maxModels) break;
  }
  return [...models.values()];
}

export async function fetchApiModelDirectory(provider, endpoint, key, { signal, fetcher = fetch } = {}) {
  const timeout = AbortSignal.timeout(12000);
  const claude = provider === 'claude';
  const headers = { Accept: 'application/json' };
  if (key) headers[claude ? 'x-api-key' : 'Authorization'] = claude ? key : 'Bearer ' + key;
  if (claude) headers['anthropic-version'] = claudeVersion;
  let response;
  try {
    response = await fetcher(endpoint + '/models' + (claude ? '?limit=1000' : ''), {
      method: 'GET', redirect: 'error', headers,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw new Error('无法读取模型目录，请检查网络和 API 地址。');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if ([401, 403].includes(response.status)) throw new Error('模型目录拒绝授权，请检查 API Key。');
    if ([404, 405, 501].includes(response.status)) {
      throw Object.assign(new Error('该服务暂时未提供可用模型目录。'), { code: 'NO_MODEL_CATALOG' });
    }
    throw new Error('模型目录暂不可用（HTTP ' + response.status + '）。');
  }
  const body = await response.json().catch(() => null);
  if (!Array.isArray(body?.data)) {
    throw Object.assign(new Error('服务商未返回可识别的模型目录。'), { code: 'NO_MODEL_CATALOG' });
  }
  return normalizeModelDirectory(body.data, provider);
}

export async function readCodeBuddyModelConfig(home = homedir()) {
  const configured = process.env.CODEBUDDY_CONFIG_DIR;
  const profile = configured && isAbsolute(configured) ? configured : join(home, '.codebuddy');
  const path = join(profile, 'models.json');
  const info = await stat(path).catch(() => null);
  if (!info?.isFile() || info.size > 1024 * 1024) return [];
  const data = await readFile(path, 'utf8').then(JSON.parse).catch(() => null);
  const definitions = new Map((Array.isArray(data?.models) ? data.models : [])
    .filter((entry) => typeof entry?.id === 'string').map((entry) => [entry.id, entry]));
  const ids = Array.isArray(data?.availableModels) && data.availableModels.length ? data.availableModels : [...definitions.keys()];
  return normalizeModelDirectory(ids.map((id) => ({ ...definitions.get(id), id })), 'workbuddy');
}
