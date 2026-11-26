import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { packager } from '@electron/packager';
import { layoutWeights } from '../src/layout-spec.mjs';
import { copyAlbumPhotos, copyLayoutBundle, stageDesktopApp, translationFiles, writeMacIcon } from './desktop-bundle.mjs';

const arch = process.argv[2] || process.arch;
const native = process.platform === 'darwin';
const crossSigner = process.env.COREADER_MAC_CODESIGN;
if (!['arm64', 'x64'].includes(arch) || (!native && !(process.platform === 'linux' && crossSigner))) {
  throw new Error('Use macOS, or a Linux cross-build with COREADER_MAC_CODESIGN, and select arm64 or x64.');
}
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const { productName, version } = manifest;
const output = resolve(process.env.ELR_RELEASE_DIR || 'release');
const dist = resolve(process.env.ELR_DIST_DIR || 'dist');
const runtime = join(output, 'runtime');
const translation = join(runtime, 'haidass');
const engine = join(translation, 'engine-darwin-' + arch);
const layout = join(runtime, 'layout', layoutWeights.file);
if (![join(engine, 'llama-server'), ...translationFiles.map((file) => join(translation, file))].every(existsSync)) {
  throw new Error('Run npm run prepare:translation:mac -- ' + arch + ' before packaging.');
}
if (!existsSync(layout)) throw new Error('Run npm run prepare:layout:mac before packaging.');

mkdirSync(output, { recursive: true });
const work = mkdtempSync(join(output, '.mac-stage-'));
try {
  const application = join(work, 'application');
  mkdirSync(application);
  stageDesktopApp(application, dist, manifest);
  const icon = join(work, 'CoReader.icns');
  writeMacIcon(icon);
  const electronVersion = manifest.devDependencies.electron;
  const electronZip = join(runtime, 'electron-v' + electronVersion + '-darwin-' + arch + '.zip');
  const [build] = await packager({
    dir: application, out: output, tmpdir: work, name: productName, platform: 'darwin', arch, electronVersion,
    appVersion: version, appBundleId: 'com.yubococo.coreader', appCategoryType: 'public.app-category.productivity',
    extendInfo: { LSMinimumSystemVersion: '13.3' },
    darwinDarkModeSupport: true, asar: true, prune: false, overwrite: true, icon,
    ...(existsSync(electronZip) ? { electronZipDir: runtime } : {}),
  });
  const appName = productName + '.app';
  const app = join(build, appName);
  const resources = join(app, 'Contents', 'Resources');
  const bundledTranslation = join(resources, 'haidass');
  mkdirSync(bundledTranslation);
  for (const file of translationFiles) cpSync(join(translation, file), join(bundledTranslation, file));
  cpSync(engine, join(bundledTranslation, 'engine'), { recursive: true, verbatimSymlinks: true });
  copyLayoutBundle(join(resources, 'layout'), layout, 'darwin', arch);
  copyAlbumPhotos(resources);
  const usage = readFileSync('USAGE.zh.txt', 'utf8').split(/\r?\n/);
  const notes = [
    productName + ' ' + version + ' · macOS',
    '',
    '安装版打开 DMG 后将 CoReader 拖入应用程序。ZIP 解压后双击 CoReader.app。',
    '数据目录为 ~/Library/Application Support/English Lit Reader。',
    '',
    ...usage.slice(usage.indexOf('使用方式')),
  ];
  writeFileSync(join(resources, 'README-zh.txt'), notes.join('\n'));

  if (native) {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], { stdio: 'inherit' });
    execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  } else {
    execFileSync(crossSigner, ['sign', app], { stdio: 'inherit' });
  }

  const base = join(output, productName + '-' + version + '-mac-' + arch);
  const zip = base + '.zip';
  rmSync(zip, { force: true });
  if (native) execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip], { stdio: 'inherit' });
  else execFileSync('zip', ['-qry', zip, appName], { cwd: build, stdio: 'inherit' });
  console.log(zip);

  if (native) {
    symlinkSync('/Applications', join(build, 'Applications'));
    const dmg = base + '.dmg';
    execFileSync('hdiutil', ['create', '-ov', '-volname', productName, '-srcfolder', build, '-format', 'UDZO', dmg], { stdio: 'inherit' });
    execFileSync('hdiutil', ['verify', dmg], { stdio: 'inherit' });
    console.log(dmg);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
