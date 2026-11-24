import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { layoutWeights } from '../src/layout-spec.mjs';
import { localTranslationModels } from '../src/model-capabilities.mjs';

export const translationFiles = Object.values(localTranslationModels).flatMap(({ weights, license }) => [weights, license]);

export function stageDesktopApp(staging, distDir, manifest) {
  mkdirSync(join(staging, 'src'));
  for (const file of ['main.mjs', 'preload.cjs', 'library.mjs', 'model.mjs', 'model-capabilities.mjs', 'model-directory.mjs', 'chatgpt.mjs', 'kimi-code.mjs', 'codebuddy.mjs', 'provider-usage.mjs', 'local-translation.mjs', 'layout-model.mjs', 'layout-spec.mjs', 'reading-agent.mjs', 'research.mjs', 'paper-analysis.js', 'paper-planning.js', 'reader-requests.mjs', 'app-updates.mjs']) {
    cpSync(join('src', file), join(staging, 'src', file));
  }
  cpSync(distDir, join(staging, 'dist'), { recursive: true });
  cpSync('LICENSE', join(staging, 'LICENSE'));
  const { name, productName, version, main, description, license } = manifest;
  writeFileSync(join(staging, 'package.json'), JSON.stringify({ name, productName, version, main, description, license, type: 'module' }, null, 2));

  const licenses = join(staging, 'licenses');
  mkdirSync(licenses);
  for (const dependency of ['pdfjs-dist', 'react', 'react-dom', 'scheduler', 'react-markdown', 'remark-gfm', 'katex']) {
    const directory = join('node_modules', dependency);
    const license = readdirSync(directory).find((file) => /^licen[cs]e(?:\.(?:md|txt))?$/i.test(file));
    if (!license) throw new Error('Missing license for ' + dependency);
    cpSync(join(directory, license), join(licenses, dependency + '.txt'));
  }
  cpSync('assets/remark-math.LICENSE', join(licenses, 'remark-math-and-rehype-katex.txt'));
  mkdirSync(join(staging, 'assets'));
  cpSync('assets/coreader-cr.png', join(staging, 'assets', 'coreader-cr.png'));
}

export function copyLayoutBundle(output, model, platform, arch) {
  const modules = join(output, 'node_modules');
  mkdirSync(modules, { recursive: true });
  for (const file of ['layout-worker.mjs', 'layout-spec.mjs']) cpSync(join('src', file), join(output, file));
  cpSync(model, join(output, layoutWeights.file));
  cpSync('assets/layout-licenses', join(output, 'licenses'), { recursive: true });
  for (const name of ['onnxruntime-node', 'onnxruntime-common']) {
    const source = join('node_modules', name);
    const dest = join(modules, name);
    mkdirSync(dest);
    cpSync(join(source, 'package.json'), join(dest, 'package.json'));
    cpSync(join(source, 'dist'), join(dest, 'dist'), { recursive: true });
  }
  const target = join('bin', 'napi-v6', platform, arch);
  cpSync(join('node_modules', 'onnxruntime-node', target), join(modules, 'onnxruntime-node', target),
    { recursive: true, verbatimSymlinks: true });
}

export function writeMacIcon(destination) {
  const png = readFileSync('assets/coreader-cr.png');
  if (png.readUInt32BE(16) !== 1024 || png.readUInt32BE(20) !== 1024) throw new Error('Expected a 1024 × 1024 app icon.');
  const header = Buffer.alloc(16);
  header.write('icns', 0);
  header.writeUInt32BE(png.length + 16, 4);
  header.write('ic10', 8);
  header.writeUInt32BE(png.length + 8, 12);
  writeFileSync(destination, Buffer.concat([header, png]));
}
