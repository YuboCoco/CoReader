import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { parentPort, workerData } from 'node:worker_threads';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import { decodeLayout, inputSize, layoutWeights } from './layout-spec.mjs';

async function loadSession() {
  if ((await stat(workerData.model)).size !== layoutWeights.bytes) throw new Error('Layout model size mismatch');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(workerData.model)) hash.update(chunk);
  if (hash.digest('hex') !== layoutWeights.sha256) throw new Error('Layout model checksum mismatch');
  return InferenceSession.create(workerData.model, {
    executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1, logSeverityLevel: 3,
  });
}

let session;
let queue = Promise.resolve();

async function detect(id, bytes) {
  let inputs;
  let output;
  try {
    session ||= loadSession();
    const runner = await session;
    const rgba = new Uint8Array(bytes);
    const area = inputSize * inputSize;
    const rgb = new Float32Array(area * 3);
    for (let i = 0; i < area; i++) {
      rgb[i] = rgba[i * 4] / 255;
      rgb[area + i] = rgba[i * 4 + 1] / 255;
      rgb[2 * area + i] = rgba[i * 4 + 2] / 255;
    }
    inputs = {
      image: new Tensor('float32', rgb, [1, 3, inputSize, inputSize]),
      im_shape: new Tensor('float32', Float32Array.of(inputSize, inputSize), [1, 2]),
      scale_factor: new Tensor('float32', Float32Array.of(1, 1), [1, 2]),
    };
    output = await runner.run(inputs, ['det']);
    parentPort.postMessage({ id, regions: decodeLayout(output.det.data) });
  } catch {
    parentPort.postMessage({ id, regions: null });
  } finally {
    for (const tensor of Object.values(inputs || {})) tensor.dispose();
    for (const tensor of Object.values(output || {})) tensor.dispose();
  }
}

parentPort.on('message', ({ id, bytes }) => {
  queue = queue.then(() => detect(id, bytes));
});
