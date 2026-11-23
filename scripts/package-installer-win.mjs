import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { productName, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const output = resolve(process.env.ELR_RELEASE_DIR || join(root, 'release'));
const payload = join(output, productName + '-win32-x64');
const script = join(root, 'scripts', 'coreader.iss');
const icon = join(root, 'assets', 'coreader-cr.ico');
const compiler = process.env.COREADER_ISCC || 'ISCC.exe';
const chinese = process.env.COREADER_INNO_ZH;
const options = ['-Qp', '-O' + output, '-DAppVersion=' + version, '-DPayloadDir=' + payload, '-DAppIcon=' + icon];

if (!existsSync(join(payload, productName + '.exe'))) {
  throw new Error('Build the Windows application with npm run package:win first.');
}
if (chinese) options.push('-DChineseMessages=' + resolve(chinese));

try {
  execFileSync(compiler, [...options, script], { stdio: 'inherit' });
} catch (error) {
  if (error.code === 'ENOENT') throw new Error('Install Inno Setup 6.7+ or set COREADER_ISCC to the path to ISCC.exe.');
  throw error;
}

console.log(join(output, productName + '-' + version + '-Setup-win-x64.exe'));
