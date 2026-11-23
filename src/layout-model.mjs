import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { inputSize, layoutWeights } from './layout-spec.mjs';

let worker;
let sequence = 0;
const pending = new Map();

function receive(id, regions) {
  const request = pending.get(id);
  if (!request) return;
  pending.delete(id);
  clearTimeout(request.timer);
  request.resolve(regions);
}

function stop(active) {
  if (worker !== active) return;
  worker = null;
  for (const id of pending.keys()) receive(id, null);
  active.terminate().catch(() => {});
}

export async function detectPdfLayout(bytes, packaged) {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== inputSize ** 2 * 4 || pending.size >= 8) return null;
  if (!worker) {
    const model = packaged
      ? join(process.resourcesPath, 'layout', layoutWeights.file)
      : fileURLToPath(new URL('../release/runtime/layout/' + layoutWeights.file, import.meta.url));
    const script = packaged
      ? join(process.resourcesPath, 'layout', 'layout-worker.mjs')
      : new URL('./layout-worker.mjs', import.meta.url);
    const active = new Worker(script, { workerData: { model } });
    worker = active;
    active.unref();
    active.on('message', ({ id, regions }) => receive(id, regions));
    active.on('error', () => stop(active));
    active.on('exit', () => stop(active));
  }
  const active = worker;
  return new Promise((resolve) => {
    const id = ++sequence;
    const timer = setTimeout(() => stop(active), 60000);
    timer.unref();
    pending.set(id, { resolve, timer });
    try {
      active.postMessage({ id, bytes }, [bytes]);
    } catch {
      receive(id, null);
    }
  });
}
