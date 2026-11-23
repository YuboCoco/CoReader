import { chatgptNetworkError } from './chatgpt.mjs';
import { defaultModel } from './library.mjs';
import { claudeVersion, providerEfforts } from './model-capabilities.mjs';

const chatPath = '/chat/completions';
export const kimiEndpoint = 'https://api.moonshot.cn/v1';
export const kimiDefaultModel = 'kimi-k3.1-pro';
export const apiModelEndpoints = {
  deepseek: defaultModel.endpoint,
  kimi: kimiEndpoint,
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  claude: 'https://api.anthropic.com/v1',
};
export const modelProviders = [...Object.keys(apiModelEndpoints), 'compatible', 'openai', 'chatgpt', 'workbuddy', 'codex'];

export function modelSelection(input) {
  const provider = modelProviders.includes(input?.provider) ? input.provider : 'deepseek';
  const model = typeof input?.model === 'string' ? input.model.trim().slice(0, 200) : '';
  if (!model) throw new Error('请填写模型 ID。');
  if (provider === 'workbuddy' || provider === 'codex') {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(model)) throw new Error('CLI 模型 ID 格式无效。');
    const efforts = providerEfforts(provider);
    return {
      provider, endpoint: '', model, label: model === 'default' ? 'CLI 默认模型' : model,
      effort: efforts.includes(input?.effort) ? input.effort : 'default',
      contextWindow: contextSize(input?.contextWindow, provider === 'codex' ? 128000 : 16384), images: imageMode(input?.images),
    };
  }
  let endpoint;
  try {
    endpoint = new URL(apiModelEndpoints[provider] || (provider === 'compatible'
      ? input?.endpoint?.trim() : 'https://api.openai.com/v1'));
  } catch {
    throw new Error('请输入有效的 API 地址。');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if ((endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:'))
    || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('API 地址应为 HTTPS。可以为本机模型填写回环 HTTP 地址。');
  }
  const address = endpoint.href.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  const efforts = providerEfforts(provider);
  const effort = efforts.includes(input?.effort) ? input.effort : 'default';
  const knownContext = (provider === 'deepseek' && /^(deepseek-flash|deepseek-v4(?:\b|-))/.test(model))
    || (provider === 'kimi' && /^kimi-k3\.1-pro(?:-highspeed)?$/.test(model)) ? 1048576
    : provider === 'glm' && /^glm-5\.3(?:-flashx?)?$/.test(model) ? 1048576 : 16384;
  const contextWindow = contextSize(input?.contextWindow, knownContext);
  const images = imageMode(input?.images);
  const label = provider === 'deepseek' && /^deepseek-(?:flash|v4-flash(?:-vision-exp)?)$/.test(model)
    ? 'DeepSeek V4.1 Flash' : (typeof input?.label === 'string' ? input.label.trim().slice(0, 120) || model : model);
  return { provider, endpoint: address, model, effort, label, contextWindow, images };
}

function contextSize(input, fallback) {
  const count = Number(input);
  return Number.isSafeInteger(count) && count >= 4096 && count <= 4000000 ? count : fallback;
}

function imageMode(value) {
  return ['auto', 'yes', 'no'].includes(value) ? value : 'auto';
}

export function makeMessages(operation, source, context) {
  const instructions = {
    translation: '将选中的学术英语准确译成简体中文。保留段落、专名、数字和公式，术语保持一致。只输出译文。',
    term: '用简体中文解释选中的英文论文术语。先用一句话说明含义，再结合提供的原句说明它在文中的用途，可用通俗例子。上下文不足时明确区分通用含义与论文特定用法。',
    test: 'Reply with OK.',
  };
  const label = operation === 'translation' ? '待翻译原文' : '术语';
  return [
    { role: 'system', content: instructions[operation] },
    { role: 'user', content: operation === 'test' ? 'OK?' : label + '：\n' + source
      + (context ? '\n\n附近原文（供理解语境）：\n' + context : '') },
  ];
}

function apiFailure(status) {
  if (status === 401 || status === 403) return '模型服务拒绝认证，请检查 API Key 和模型权限。';
  if (status === 429) return '模型服务限流或额度不足，请稍后再试。';
  if (status === 404) return '模型或 API 路径不存在，请检查模型 ID 和地址。';
  if (status >= 500) return '模型服务暂时不可用，请稍后再试。';
  return '模型请求失败（HTTP ' + status + '）。请检查端点、模型和推理强度。';
}

const subscriptionErrors = {
  subscription_sharing_user_not_eligible: '当前 ChatGPT 账号或工作区未开放订阅用量共享。',
  subscription_sharing_usage_limit_exceeded: 'ChatGPT 订阅已达用量上限，请在 ChatGPT 设置的「用量」中查看。',
  subscription_sharing_usage_unavailable: '暂时无法验证 ChatGPT 订阅用量，请稍后重试。',
  subscription_sharing_unsupported_capability: '所选 ChatGPT 模型或推理设置不支持此请求，请更换模型或使用默认强度。',
};

function subscriptionFailure(config, error) {
  if (config.provider !== 'chatgpt' || !Object.hasOwn(subscriptionErrors, error?.code)) return '';
  return subscriptionErrors[error.code];
}

function responsesInput(messages) {
  return messages.filter((message) => message.role !== 'system').map((message) => ({
    role: message.role,
    content: typeof message.content === 'string' ? [{ type: 'input_text', text: message.content }]
      : message.content.map((part) => part.type === 'image_url'
        ? { type: 'input_image', image_url: part.image_url.url }
        : { type: 'input_text', text: part.text }),
  }));
}

function claudeContent(content) {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type !== 'image_url') return { type: 'text', text: part.text };
    const image = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(part.image_url.url);
    if (!image) throw new Error('Claude 需要 JPEG、PNG、GIF 或 WebP 格式的插图。');
    return { type: 'image', source: { type: 'base64', media_type: image[1], data: image[2] } };
  });
}

const claudeFinish = (reason) => reason === 'max_tokens' ? 'length' : reason === 'stop_sequence' ? 'stop' : reason;
const responseBlockLimit = 2000000;

function parseModelJson(text, streamed) {
  const message = streamed ? '模型服务返回了无法解析的流式数据，请重试。' : '模型服务返回了无法解析的 JSON，请重试。';
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* A parsing failure must not expose the response body. */ }
  throw new Error(message);
}

async function readModelEvents(reader, prefix, onEvent) {
  let pending = prefix;
  let eventName = '';
  let dataLines = [];
  let eventSize = 0;
  const dispatch = () => {
    const data = dataLines.join('\n').trim();
    const name = eventName;
    dataLines = [];
    eventName = '';
    eventSize = 0;
    return Boolean(data) && onEvent(data, name);
  };
  const readLine = (line) => {
    if (!line) return dispatch();
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    if (line.startsWith('data:') || line === 'data') {
      const data = line.slice(5).replace(/^ /, '');
      eventSize += data.length + 1;
      if (eventSize > responseBlockLimit) throw new Error('模型返回的数据块过大。');
      dataLines.push(data);
    }
    return false;
  };
  for (;;) {
    // Keep a trailing CR until the next chunk distinguishes CRLF from CR.
    const trailingCR = pending.endsWith('\r');
    const lines = (trailingCR ? pending.slice(0, -1) : pending).split(/\r\n|[\r\n]/);
    pending = lines.pop() + (trailingCR ? '\r' : '');
    for (const line of lines) {
      if (line.length > responseBlockLimit) throw new Error('模型返回的数据块过大。');
      if (readLine(line)) return;
    }
    if (pending.length > responseBlockLimit) throw new Error('模型返回的数据块过大。');
    const { done, value } = await reader.read();
    if (done) break;
    pending += value;
  }
  if (!readLine(pending.replace(/\r$/, ''))) dispatch();
}

async function readModelReply(response, onEvent) {
  if (!response.body) throw new Error('模型服务未返回正文，请重试。');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let prefix = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      prefix += value;
      const start = prefix.trimStart();
      if (start.length >= 6 || /^[{\[]/.test(start)) break;
      if (prefix.length > responseBlockLimit) throw new Error('模型返回的数据块过大。');
    }
    const start = prefix.trimStart();
    const declaredStream = response.headers.get('content-type')?.toLowerCase().includes('text/event-stream');
    if (/^(?:[:]|(?:event|data|id|retry):)/.test(start) || (declaredStream && !/^[{\[]/.test(start))) {
      await readModelEvents(reader, prefix, onEvent);
      return { streamed: true };
    }
    let text = prefix;
    while (text.length <= responseBlockLimit) {
      const { done, value } = await reader.read();
      if (done) return { streamed: false, data: parseModelJson(text, false) };
      text += value;
    }
    throw new Error('模型返回的数据块过大。');
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function complete(config, apiKey, messages, { signal, onText, onModel, onHeaders, maxTokens = 4096, requireComplete = false, fetcher = fetch } = {}) {
  const responses = ['openai', 'chatgpt'].includes(config.provider);
  const claude = config.provider === 'claude';
  const system = messages.find((message) => message.role === 'system')?.content || '';
  const payload = responses ? {
    model: config.model, input: responsesInput(messages), stream: true, store: false, instructions: system,
    ...(config.provider === 'openai' ? { max_output_tokens: maxTokens } : {}),
  } : claude ? {
    model: config.model, system, stream: true, max_tokens: maxTokens,
    messages: messages.filter((message) => message.role !== 'system').map(({ role, content }) => ({ role, content: claudeContent(content) })),
  } : { model: config.model, messages, stream: true, max_tokens: maxTokens };
  if (config.effort !== 'default') {
    if (responses) payload.reasoning = { effort: config.effort };
    else if (claude) payload.output_config = { effort: config.effort };
    else if (config.provider === 'deepseek' && config.effort === 'none') payload.thinking = { type: 'disabled' };
    else payload.reasoning_effort = config.effort;
  }
  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' };
  if (apiKey) headers[claude ? 'x-api-key' : 'Authorization'] = claude ? apiKey : 'Bearer ' + apiKey;
  if (claude) headers['anthropic-version'] = claudeVersion;
  const address = config.endpoint + (responses ? '/responses' : claude ? '/messages' : chatPath);
  let response;
  try {
    response = await fetcher(address, {
      method: 'POST', headers, body: JSON.stringify(payload), signal, redirect: 'error',
    });
  } catch (failure) {
    if (signal?.aborted) throw signal.reason;
    if (config.provider === 'chatgpt') throw chatgptNetworkError('请求模型', address, failure);
    throw new Error('无法连接模型服务，请检查网络和 API 地址。', { cause: failure });
  }
  onHeaders?.(response.headers);
  if (!response.ok) {
    if (config.provider === 'chatgpt') {
      const body = await response.json().catch(() => null);
      const message = subscriptionFailure(config, body?.error);
      if (message) throw new Error(message);
      if ([401, 403].includes(response.status)) throw new Error('ChatGPT 订阅授权不可用，请在模型设置中重新连接。');
    } else await response.body?.cancel().catch(() => {});
    throw new Error(apiFailure(response.status));
  }
  let output = '';
  let finishReason;
  let doneEvent = false;
  const append = (content) => {
    if (typeof content !== 'string' || !content) return;
    if ((output.length + content.length) > 100000) throw new Error('模型输出超过可显示范围。');
    output += content;
    onText?.(output);
  };
  const { streamed, data } = await readModelReply(response, (text, eventName) => {
    if (text === '[DONE]') {
      if (!responses && !claude) doneEvent = true;
      return true;
    }
    const frame = parseModelJson(text, true);
    const type = frame.type || eventName;
    if (frame.error || type === 'response.failed' || type === 'error') {
      throw new Error(subscriptionFailure(config, frame.response?.error || frame.error || frame) || '模型服务在生成过程中返回错误。');
    }
    const actualModel = frame.response?.model || frame.message?.model || frame.model;
    if (typeof actualModel === 'string') onModel?.(actualModel);
    if (responses) {
      if (type === 'response.output_text.delta') append(frame.delta);
      if (type === 'response.incomplete') finishReason = 'length';
      if (type === 'response.completed' || type === 'response.incomplete') doneEvent = true;
    } else if (claude) {
      if (type === 'content_block_start' && frame.content_block?.type === 'text') append(frame.content_block.text);
      if (type === 'content_block_delta' && frame.delta?.type === 'text_delta') append(frame.delta.text);
      if (type === 'message_delta') finishReason = claudeFinish(frame.delta?.stop_reason) || finishReason;
      if (type === 'message_stop') doneEvent = true;
    } else {
      const choice = frame.choices?.[0];
      append(choice?.delta?.content);
      finishReason = choice?.finish_reason || finishReason;
    }
    return doneEvent;
  });
  if (!streamed) {
    onModel?.(data.model);
    if (responses) {
      for (const item of data.output || []) for (const part of item.content || []) if (part.type === 'output_text') append(part.text);
      if (data.status === 'incomplete') finishReason = 'length';
      if (data.status === 'failed') throw new Error(subscriptionFailure(config, data.error) || '模型服务在生成过程中返回错误。');
      doneEvent = data.status === 'completed' || data.status === 'incomplete';
    } else if (claude) {
      for (const part of data.content || []) if (part.type === 'text') append(part.text);
      finishReason = claudeFinish(data.stop_reason);
      doneEvent = Boolean(finishReason);
    } else {
      const choice = data.choices?.[0];
      append(choice?.message?.content);
      finishReason = choice?.finish_reason;
    }
  }
  if (((responses || claude) && !doneEvent) || (requireComplete && streamed && !doneEvent && !finishReason)) {
    throw new Error('生成连接提前断开，请重试。');
  }
  if (requireComplete && finishReason && !['stop', 'length', 'end_turn'].includes(finishReason)) {
    throw new Error('模型未正常完成本轮回答，请重试。');
  }
  if (!output.trim()) throw new Error('模型没有返回正文。可尝试降低推理强度或更换模型。');
  if (finishReason === 'length') throw new Error('模型触及输出上限。请缩短选区后重试。');
  return output.trim();
}
