import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, chmod, cp, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const arch = process.argv[2] || process.arch;
const runtimeHashes = {
  arm64: '44a097f66c5ceadb3eb1b3eccd54c331cf1fa3d93cbb246eda583b1fe0980540',
  x64: '3dad217d237c631021eef83d47bff166c2bec2c3f3822543651ea8abd5e119f7',
};
if (!Object.hasOwn(runtimeHashes, arch)) throw new Error('Use arm64 or x64 for macOS.');
const release = 'b12445';
const cache = resolve(process.env.ELR_RELEASE_DIR || 'release', 'runtime', 'haidass');
const hyMt = 'https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/resolve/a0c709d/';
await mkdir(cache, { recursive: true });

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function obtain(name, url, digest) {
  const path = join(cache, name);
  if (await sha256(path).catch(() => null) === digest) return path;
  const part = path + '.' + randomUUID() + '.part';
  try {
    execFileSync('curl', ['-fLSs', '--retry', '2', '--connect-timeout', '25', '--max-time', '900', '-o', part, url], { stdio: 'inherit' });
    if (await sha256(part) !== digest) throw new Error('Checksum mismatch for ' + name);
    await rename(part, path);
    return path;
  } finally {
    await rm(part, { force: true });
  }
}

await obtain('haidass-translate-143m-q8_0.gguf',
  'https://huggingface.co/umeiko/Haidass-Translate-143M-GGUF/resolve/0763c602a8099460a5fc767ee095abbe13f87332/haidass-translate-143m-q8_0.gguf?download=true',
  '37b8c73c9323fb17687ba286968e92f88387e659f5162526b03bf34b5f3fe990');
await obtain('Hy-MT2-1.8B-Q4_K_M.gguf', hyMt + 'Hy-MT2-1.8B-Q4_K_M.gguf?download=true',
  'dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699');
await obtain('Hy-MT2-LICENSE.txt', hyMt + 'LICENSE.txt', 'a1d52d448f81c584a47c583e19dfab2d3851c7c84431b07baee093c1113ed114');
await obtain('Haidass-LICENSE.txt', 'https://www.apache.org/licenses/LICENSE-2.0.txt',
  'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30');

const archiveName = 'llama-' + release + '-bin-macos-' + arch + '.tar.gz';
const archive = await obtain(archiveName, 'https://github.com/ggml-org/llama.cpp/releases/download/' + release + '/' + archiveName,
  runtimeHashes[arch]);
const unpacked = await mkdtemp(join(cache, '.engine-'));
try {
  execFileSync('tar', ['-xzf', archive, '-C', unpacked]);
  const entries = await readdir(unpacked, { recursive: true, withFileTypes: true });
  const server = entries.find((entry) => entry.name === 'llama-server' && entry.isFile());
  if (!server) throw new Error('The verified llama.cpp archive contains no server.');
  const bin = server.parentPath;
  const engine = join(cache, 'engine-darwin-' + arch);
  const staged = join(unpacked, '.engine');
  await mkdir(staged);
  for (const entry of await readdir(bin, { withFileTypes: true })) {
    if (entry.name !== 'llama-server' && !/(?:^LICENSE|\.dylib$|\.metallib$)/.test(entry.name)) continue;
    await cp(join(bin, entry.name), join(staged, entry.name), { verbatimSymlinks: true });
  }
  const license = entries.find((entry) => entry.name === 'LICENSE' && entry.isFile());
  if (license) await cp(join(license.parentPath, license.name), join(staged, 'LICENSE'));
  else {
    const target = join(staged, 'LICENSE');
    execFileSync('curl', ['-fLSs', '--retry', '2', '-o', target, 'https://raw.githubusercontent.com/ggml-org/llama.cpp/' + release + '/LICENSE']);
  }
  await chmod(join(staged, 'llama-server'), 0o755);
  await access(join(staged, 'LICENSE'));
  await rm(engine, { recursive: true, force: true });
  await rename(staged, engine);
  console.log(engine);
} finally {
  await rm(unpacked, { recursive: true, force: true });
}
