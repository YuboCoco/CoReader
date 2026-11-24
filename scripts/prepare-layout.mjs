import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, mkdirSync } from 'node:fs';
import { copyFile, rename, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { layoutWeights } from '../src/layout-spec.mjs';

const directory = resolve(process.env.ELR_RELEASE_DIR || 'release', 'runtime', 'layout');
const target = join(directory, layoutWeights.file);
mkdirSync(directory, { recursive: true });

async function verify(file) {
  const info = await stat(file);
  if (info.size !== layoutWeights.bytes) throw new Error('Unexpected layout model size');
  const hash = createHash('sha256');
  for await (const data of createReadStream(file)) hash.update(data);
  if (hash.digest('hex') !== layoutWeights.sha256) throw new Error('Unexpected layout model checksum');
}

try {
  await verify(target);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const partial = target + '.' + randomUUID() + '.part';
  try {
    if (process.argv[2]) await copyFile(process.argv[2], partial);
    else execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl', ['-fLSs', '--max-time', '300', '-o', partial, layoutWeights.url], { stdio: 'inherit' });
    await verify(partial);
    await rename(partial, target);
  } finally {
    await rm(partial, { force: true });
  }
}
console.log(target);
