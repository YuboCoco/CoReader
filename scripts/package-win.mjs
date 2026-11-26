import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { packager } from '@electron/packager';
import { layoutWeights } from '../src/layout-spec.mjs';
import { copyAlbumPhotos, copyLayoutBundle, stageDesktopApp, translationFiles } from './desktop-bundle.mjs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const productName = manifest.productName;
const output = resolve(process.env.ELR_RELEASE_DIR || 'release');
const distDir = resolve(process.env.ELR_DIST_DIR || 'dist');
mkdirSync(output, { recursive: true });
const staging = mkdtempSync(join(output, '.stage-'));

try {
  stageDesktopApp(staging, distDir, manifest);
  const icon = resolve('assets/coreader-cr.ico');
  const runtimeCache = join(output, 'runtime');
  const translationCache = join(runtimeCache, 'haidass');
  const engineCache = join(translationCache, 'engine');
  if (!translationFiles.every((file) => existsSync(join(translationCache, file))) ||
      !existsSync(join(engineCache, 'llama-server.exe'))) {
    throw new Error('Run npm run prepare:translation:win before packaging the Windows offline model.');
  }
  const layoutModel = join(runtimeCache, 'layout', layoutWeights.file);
  if (!existsSync(layoutModel)) throw new Error('Run npm run prepare:layout:win before packaging the Windows layout model.');
  const cachedRuntime = join(runtimeCache, 'electron-v' + manifest.devDependencies.electron + '-win32-x64.zip');
  const [folder] = await packager({
    dir: staging, out: output, name: productName, executableName: productName,
    platform: 'win32', arch: 'x64', electronVersion: manifest.devDependencies.electron,
    appVersion: manifest.version, asar: true, prune: false, overwrite: true, icon,
    win32metadata: { CompanyName: 'English Lit Reader contributors' },
    ...(existsSync(cachedRuntime) ? { electronZipDir: runtimeCache } : {}),
  });
  const translationDir = join(folder, 'resources', 'haidass');
  const engineDir = join(translationDir, 'engine');
  mkdirSync(engineDir, { recursive: true });
  for (const file of translationFiles) cpSync(join(translationCache, file), join(translationDir, file));
  for (const file of readdirSync(engineCache)) {
    if (/^LICENSE|^llama-server\.exe$|^(?:ggml[-\w]*|libomp|llama(?:-common|-server-impl)?|mtmd)\.dll$/.test(file)) {
      cpSync(join(engineCache, file), join(engineDir, file));
    }
  }
  copyLayoutBundle(join(folder, 'resources', 'layout'), layoutModel, 'win32', 'x64');
  copyAlbumPhotos(join(folder, 'resources'));
  cpSync('USAGE.zh.txt', join(folder, 'README-zh.txt'));
  // Keep a stable, already-extracted copy beside the versioned archive so an
  // update can be tested directly without manually unpacking the ZIP again.
  const stableLatest = join(output, productName + '-latest');
  let latest = stableLatest;
  try {
    rmSync(stableLatest, { recursive: true, force: true });
  } catch (_) {
    latest = join(output, productName + '-latest-' + manifest.version);
    rmSync(latest, { recursive: true, force: true });
  }
  cpSync(folder, latest, { recursive: true });
  console.log(latest);
  const archive = join(output, productName + '-' + manifest.version + '-win-x64.zip');
  const appFolder = productName + '-win32-x64';
  execFileSync('tar.exe', ['-a', '-c', '-f', archive, '-C', output, appFolder], { stdio: 'inherit' });
  console.log(archive);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
