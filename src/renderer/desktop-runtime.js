import * as pdfjsLib from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { connectionNames } from '../model-capabilities.mjs';
import { extractPaperMetadata } from './pdf-metadata.mjs';

export { katex };
const api = window.reader;
const paperId = /^[a-f0-9]{64}$/;
const prefix = 'elr.';
const cache = new Map();
const formats = { summary: 'detailed-markdown' };
pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
const asset = (folder) => new URL('/pdf-assets/' + folder + '/', location.href).href;
export const pdfOptions = {
  cMapUrl: asset('cmaps'), cMapPacked: true, standardFontDataUrl: asset('standard_fonts'),
  wasmUrl: asset('wasm'), iccUrl: asset('iccs'), disableAutoFetch: true, disableStream: true,
  isEvalSupported: false,
};
let viewerPromise;
export function ensurePdfJs() {
  viewerPromise ||= import('pdfjs-dist/web/pdf_viewer.mjs')
    .then((V) => ({ pdfjsLib, V }))
    .catch((error) => { viewerPromise = null; throw error; });
  return viewerPromise;
}

function localRead(key, fallback) {
  try {
    const value = localStorage.getItem(prefix + key);
    return value === null ? fallback : JSON.parse(value);
  } catch { return fallback; }
}

function localSave(key, value) {
  cache.set(key, value);
  try { localStorage.setItem(prefix + key, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function readStore(key, fallback) {
  return cache.has(key) ? cache.get(key) : localRead(key, fallback);
}

export function writeStore(key, value) {
  const saved = localSave(key, value);
  const match = /^(marks|terms|result|figures)\.([a-f0-9]{64})$/.exec(key);
  if (match) {
    api.saveReaderData(match[2], match[1], value).catch((error) => {
      window.dispatchEvent(new CustomEvent('reader-storage-error', { detail: error.message || '文献记录保存失败。' }));
    });
    return true;
  }
  return saved;
}

export async function loadLibrary() {
  const [documents, saved] = await Promise.all([api.recent(), Promise.resolve(readStore('recent', []))]);
  const hidden = new Set(readStore('hidden-desktop-recents', []));
  const byId = new Map(documents.map((item) => [item.id, item]));
  const visible = saved.filter((item) => (item.mode === 'text' || byId.has(item.id)) && !hidden.has(item.id));
  const seen = new Set(visible.map((item) => item.id));
  const past = documents.filter((item) => !seen.has(item.id) && !hidden.has(item.id));
  localSave('recent', [...visible, ...past.map(toRecent)].slice(0, 8));
}

function toRecent(record) {
  return { id: record.id, name: record.name, size: record.size, mode: 'pdf',
    identity: [record.name, record.size || 0, 0].join('|'), addedAt: Date.now() };
}

export async function getStoredFile(id) {
  if (!paperId.test(id)) return null;
  const record = await api.reopen(id);
  const saved = await api.readerData(id);
  for (const [kind, entry] of Object.entries(saved)) {
    const key = kind + '.' + id;
    if (!cache.has(key)) {
      localSave(key, entry);
    }
  }
  return record;
}

export function reviveStoredFile(record) {
  if (!record || !paperId.test(record.id)) return null;
  const url = new URL('/documents/' + record.id, location.href).href;
  return {
    name: record.name,
    size: record.size,
    type: 'application/pdf',
    lastModified: 0,
    desktopId: record.id,
    desktopUrl: url,
    desktopPage: record.page,
    desktopZoom: record.zoom,
    arrayBuffer: () => fetch(url).then((response) => {
      if (!response.ok) throw new Error('PDF 文件无法读取。');
      return response.arrayBuffer();
    }),
  };
}

export async function indexOpenPaper(id, pdf, signal) {
  if (!paperId.test(id)) return null;
  signal.throwIfAborted();
  const details = await extractPaperMetadata(pdf);
  signal.throwIfAborted();
  return api.indexPaper(id, pdf.numPages, details);
}

async function withStoredPdf(id, signal, read) {
  if (!paperId.test(id)) return null;
  signal.throwIfAborted();
  const url = new URL('/documents/' + id, location.href).href;
  const task = pdfjsLib.getDocument({ ...pdfOptions, url });
  let cleanup;
  const dispose = () => cleanup ||= task.destroy().catch(() => {});
  signal.addEventListener('abort', dispose, { once: true });
  try {
    return await read(await task.promise);
  } finally {
    signal.removeEventListener('abort', dispose);
    await dispose();
  }
}

export function indexPaper(id, signal) {
  return withStoredPdf(id, signal, (pdf) => indexOpenPaper(id, pdf, signal));
}

export function renderPaperCover(id, signal) {
  return withStoredPdf(id, signal, async (pdf) => {
    const page = await pdf.getPage(1);
    signal.throwIfAborted();
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 560 / Math.max(base.width, base.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const task = page.render({ canvas, viewport, background: '#fff' });
    const cancel = () => task.cancel();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      await task.promise;
      signal.throwIfAborted();
      return canvas.toDataURL('image/webp', .85);
    } finally {
      signal.removeEventListener('abort', cancel);
      canvas.width = canvas.height = 0;
    }
  });
}

export async function openPaper(file) {
  const record = file ? await api.dropPaper(file) : await api.choosePaper();
  if (!record) return null;
  const hidden = readStore('hidden-desktop-recents', []);
  if (hidden.includes(record.id)) localSave('hidden-desktop-recents', hidden.filter((id) => id !== record.id));
  return reviveStoredFile(await getStoredFile(record.id));
}

export function deleteStoredFile(id) {
  if (paperId.test(id)) localSave('hidden-desktop-recents', [...new Set([...readStore('hidden-desktop-recents', []), id])]);
}

export function savePosition(id, page, scale, pageCount) {
  if (paperId.test(id)) api.position(id, page, Math.max(.25, Math.min(6, scale)), pageCount || undefined).catch(() => {});
}

export function markPagesRead(id, pages) {
  if (paperId.test(id) && Array.isArray(pages) && pages.length) {
    api.readPages?.(id, pages).catch(() => {});
  }
}

async function modelCatalog() {
  const [current, connections] = await Promise.all([api.getModel(), api.modelConnections()]);
  const providers = connections.filter((entry) => entry.models.length > 0).map(({ provider, models }) => ({
    id: provider, name: connectionNames[provider], models: models.map((item) => ({ ...item, name: item.label })),
  }));
  const offered = providers.find((entry) => entry.id === current.provider)?.models || [];
  const model = offered.find((entry) => entry.id === current.model)
    || (current.provider === 'workbuddy' && current.model === 'default' ? offered.find((entry) => entry.isDefault) : null);
  return { ok: true, providers, current: model ? { provider: current.provider, model: model.id,
    reasoningEffort: current.effort === 'default' ? '' : current.effort } : {} };
}

export async function fetchReader(path, options = {}) {
  options.signal?.throwIfAborted();
  const endpoint = new URL(path, 'https://reader.invalid');
  let result;
  if (endpoint.pathname === '/reader/meta') {
    const current = await api.getModel();
    result = { ...current, reasoningEffort: current.effort === 'default' ? '' : current.effort,
      summaryFormat: formats.summary, ok: true };
  } else if (endpoint.pathname === '/reader/models') {
    result = await modelCatalog();

  } else {
    return new Response(null, { status: 404 });
  }
  options.signal?.throwIfAborted();
  return Response.json(result);
}

export async function postReader(path, body, timeoutMs = 300000, signal) {
  const request = crypto.randomUUID();
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  combined.throwIfAborted();
  const cancel = () => api.cancelJob(request).catch(() => {});
  combined.addEventListener('abort', cancel, { once: true });
  try {
    const result = await api.readerRequest(path, { ...body, request });
    if (timeout.aborted && !signal?.aborted) {
      const error = new Error('ELR_TIMEOUT');
      error.timeout = true;
      throw error;
    }
    combined.throwIfAborted();
    return result;
  } finally {
    combined.removeEventListener('abort', cancel);
  }
}
