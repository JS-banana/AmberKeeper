import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCT_NAME = 'AmberKeeper';

const env = { ...process.env };

if (process.platform === 'darwin') {
  env.ELECTRON_EXEC_PATH = await ensureNamedElectronApp();
}

const child = spawn(
  process.execPath,
  [
    '--import',
    path.join(DESKTOP_ROOT, 'scripts/polyfill-stdout.mjs'),
    path.join(DESKTOP_ROOT, 'node_modules/electron-vite/bin/electron-vite.js'),
    'dev',
    ...process.argv.slice(2),
  ],
  {
    cwd: DESKTOP_ROOT,
    env,
    stdio: 'inherit',
  }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

async function ensureNamedElectronApp() {
  const electronPackageRoot = path.dirname(require.resolve('electron/package.json'));
  const electronVersion = require('electron/package.json').version;
  const sourceApp = path.join(electronPackageRoot, 'dist', 'Electron.app');
  const targetDir = path.join(DESKTOP_ROOT, 'node_modules/.cache/amberkeeper-electron');
  const targetApp = path.join(targetDir, `${PRODUCT_NAME}.app`);
  const markerPath = path.join(targetDir, 'source.txt');
  const marker = `${sourceApp}\n${electronVersion}\n${PRODUCT_NAME}\n`;

  if ((await readText(markerPath)) === marker) {
    return path.join(targetApp, 'Contents/MacOS/Electron');
  }

  await rm(targetApp, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  await cp(sourceApp, targetApp, { recursive: true });

  const plistPath = path.join(targetApp, 'Contents/Info.plist');
  replacePlistValue(plistPath, 'CFBundleDisplayName', PRODUCT_NAME);
  replacePlistValue(plistPath, 'CFBundleName', PRODUCT_NAME);
  replacePlistValue(plistPath, 'CFBundleIdentifier', 'com.amberkeeper.desktop.dev');

  await writeFile(markerPath, marker);
  return path.join(targetApp, 'Contents/MacOS/Electron');
}

async function readText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function replacePlistValue(plistPath, key, value) {
  const result = spawnSync('/usr/bin/plutil', ['-replace', key, '-string', value, plistPath], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Failed to update ${key} in ${plistPath}.`);
  }
}
