import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { defaultLocalTranslationModel, localTranslationModels } from './model-capabilities.mjs';

const sentenceSplitter = new Intl.Segmenter('en', { granularity: 'sentence' });

function boundedChunks(text, limit) {
  const chunks = [];
  let pending = '';
  for (const { segment: sentence } of sentenceSplitter.segment(text)) {
    if (pending.length + sentence.length > limit && pending.trim()) {
      chunks.push(pending.trim());
      pending = '';
    }
    if (sentence.length <= limit) {
      pending += sentence;
      continue;
    }
    // Split an unusually long sentence near a word boundary.
    let rest = sentence.trim();
    while (rest.length > limit) {
      const before = rest.slice(0, limit + 1);
      const space = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\n'), before.lastIndexOf('\t'));
      const cut = space > limit / 2 ? space : Array.from(rest).slice(0, Math.floor(limit / 2)).join('').length;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trimStart();
    }
    pending = rest;
  }
  if (pending.trim()) chunks.push(pending.trim());
  return chunks;
}

function safePromptText(text) {
  // Reserve the model's control delimiters for the enclosing chat template.
  return text.replace(/<(?=\||\/?think>)/gi, '＜');
}

function haidassPrompt(text) {
  return [
    '<|im_start|>user',
    'Translate the following text from English to Simplified Chinese.',
    safePromptText(text) + '<|im_end|>',
    '<|im_start|>assistant',
    '<think>',
    '',
    '</think>',
    '',
    '',
  ].join('\n');
}

function hyMtRequest(source) {
  return {
    model: 'hy-mt2-1.8b', stream: false, max_tokens: Math.min(1024, Math.max(128, source.length)),
    temperature: 0.7, top_p: 0.6, top_k: 20, repeat_penalty: 1.05,
    messages: [{ role: 'user', content: 'Translate the following text into Simplified Chinese. Output only the translation, with no additional explanation:\n' + safePromptText(source) }],
  };
}

export async function translateSelection(text, complete, signal, modelId = defaultLocalTranslationModel) {
  const source = typeof text === 'string' ? text.trim() : '';
  if (!source || source.length > 6000) throw new Error('请选中不超过 6000 字符的英文内容。');
  const useHyMt = modelId === 'hy-mt2-1.8b';

  async function translateChunk(chunk) {
    signal?.throwIfAborted();
    // Incomplete selections often lack the sentence boundary seen in training.
    const padded = !useHyMt && !/[.!?;:…。！？；：]\p{P}*$/u.test(chunk);
    const prepared = padded ? chunk + '.' : chunk;
    const request = useHyMt ? hyMtRequest(chunk) : {
      prompt: haidassPrompt(prepared), n_predict: Math.min(384, Math.max(64, prepared.length)), temperature: 0,
      stop: ['<|im_end|>', '<|im_start|>'], cache_prompt: true, stream: false,
    };
    const result = await complete(request, signal);
    const choice = useHyMt ? result.choices?.[0] : null;
    if (choice?.finish_reason === 'length' || result.stop_type === 'limit' || result.truncated) {
      if (chunk.length < 80) throw new Error('本地模型未生成完整译文，请缩小选区后重试。');
      const parts = [];
      for (const part of boundedChunks(chunk, Math.floor(chunk.length / 2))) parts.push(await translateChunk(part));
      return joinChinese(parts);
    }
    const content = useHyMt ? choice?.message?.content : result.content;
    const translation = typeof content === 'string'
      ? content.replace(/^<think>[\s\S]*?<\/think>\s*/, '').trim() : '';
    if (!translation) throw new Error('本地模型未返回译文，请重试。');
    return padded ? translation.replace(/[。.\uff0e]$/, '') || translation : translation;
  }

  const paragraphs = [];
  for (const paragraph of source.split(/\r?\n(?:[ \t]*\r?\n)+/)) {
    const chunks = [];
    for (const chunk of boundedChunks(paragraph, useHyMt ? 1100 : 420)) chunks.push(await translateChunk(chunk));
    if (chunks.length) paragraphs.push(joinChinese(chunks));
  }
  return paragraphs.join('\n\n');
}

function joinChinese(parts) {
  return parts.reduce((text, part) => text + (/[A-Za-z0-9]$/.test(text) && /^[A-Za-z0-9]/.test(part) ? ' ' : '') + part, '');
}

function localPort() {
  return new Promise((done, fail) => {
    const reservation = createServer();
    reservation.once('error', fail);
    reservation.listen(0, '127.0.0.1', () => {
      const { port } = reservation.address();
      reservation.close((error) => error ? fail(error) : done(port));
    });
  });
}

function localJson(port, key, path, signal, value) {
  return new Promise((done, fail) => {
    const body = value === undefined ? undefined : Buffer.from(JSON.stringify(value));
    const req = request({
      host: '127.0.0.1', port, path, agent: false, signal,
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + key,
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {}),
      },
    }, (response) => {
      response.on('error', fail);
      if (response.statusCode !== 200) {
        response.resume();
        fail(new Error('本地翻译引擎返回 HTTP ' + response.statusCode + '。'));
        return;
      }
      let data = '';
      response.setEncoding('utf8');
      response.on('data', (part) => {
        data += part;
        if (data.length > 1024 * 1024) response.destroy(new Error('本地翻译结果过大。'));
      });
      response.on('end', () => {
        try { done(JSON.parse(data)); } catch (error) { fail(error); }
      });
    });
    req.on('error', fail);
    req.end(body);
  });
}

export function createLocalTranslator(bundle, lifetime, modelId = defaultLocalTranslationModel, engineDirectory = 'engine') {
  const engine = join(bundle, engineDirectory);
  const useHyMt = modelId === 'hy-mt2-1.8b';
  const endpoint = useHyMt ? '/v1/chat/completions' : '/completion';
  const { weights, label } = localTranslationModels[modelId];
  let active;

  async function launch(instance) {
    const executable = join(engine, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
    const model = join(bundle, weights);
    try { await Promise.all([access(executable), access(model)]); }
    catch { throw new Error(label + ' 的离线翻译文件缺失，请从完整的 CoReader 安装包或便携包运行。'); }

    const port = await localPort();
    lifetime.throwIfAborted();
    const key = randomBytes(32).toString('hex');
    const threads = String(Math.max(1, Math.min(4, availableParallelism() - 1)));
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:LLAMA_|GGML_|HF_)/i.test(name)));
    const processHandle = spawn(executable, [
      '--model', model, '--alias', modelId, '--host', '127.0.0.1', '--port', String(port),
      '--api-key', key, '--ctx-size', useHyMt ? '4096' : '2048', '--parallel', '1', '--n-gpu-layers', '0',
      '--threads', threads, '--threads-batch', threads, '--no-webui', '--log-disable',
      ...(useHyMt ? ['--jinja'] : []),
    ], { cwd: engine, windowsHide: true, stdio: 'ignore', env });
    instance.child = processHandle;
    let failed = false;
    const reset = () => {
      failed = true;
      if (active === instance) active = undefined;
    };
    processHandle.on('error', reset);
    processHandle.once('exit', reset);
    const startup = AbortSignal.any([lifetime, AbortSignal.timeout(useHyMt ? 45000 : 30000)]);
    try {
      while (!failed) {
        startup.throwIfAborted();
        const info = await localJson(port, key, '/v1/models', AbortSignal.any([startup, AbortSignal.timeout(1200)])).catch(() => null);
        // Also check health because the model directory may be available while weights load.
        if (info?.data?.some((item) => item.id === modelId)) {
          const status = await localJson(port, key, '/health', AbortSignal.any([startup, AbortSignal.timeout(1200)])).catch(() => null);
          if (status?.status === 'ok') return { port, key };
        }
        await pause(150, undefined, { signal: startup });
      }
    } catch {
      lifetime.throwIfAborted();
      throw new Error('离线翻译引擎启动超时，请重试。');
    }
    throw new Error('离线翻译引擎未能启动，请检查当前系统和处理器架构。');
  }

  lifetime.addEventListener('abort', () => active?.child?.kill(), { once: true });

  return (text, signal) => translateSelection(text, async (body, requestSignal) => {
    if (!active) {
      const instance = {};
      active = instance;
      instance.ready = launch(instance).catch((error) => {
        if (active === instance) active = undefined;
        instance.child?.kill();
        throw error;
      });
    }
    const { port, key } = await active.ready;
    requestSignal?.throwIfAborted();
    return localJson(port, key, endpoint, requestSignal, body);
  }, signal, modelId);
}
