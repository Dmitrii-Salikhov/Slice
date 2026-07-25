#!/usr/bin/env node
/**
 * Zip electron-builder win-unpacked folder for portable distribution.
 * Prefer running this on Windows after `npm run dist:dir`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const src = path.join(root, 'release', 'win-unpacked');
const zipName = `Slice-${version}-win-x64.zip`;
const zipPath = path.join(root, 'release', zipName);

if (!fs.existsSync(src)) {
  console.error(`Missing ${src}. Run npm run dist:dir first.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(zipPath), { recursive: true });
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

if (process.platform === 'win32') {
  const ps = `
    Compress-Archive -Path '${src.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}'
  `;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const r = spawnSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', src, zipPath], {
  stdio: 'inherit',
});
if (r.error || (r.status ?? 1) !== 0) {
  // Fallback: zip CLI
  const z = spawnSync('zip', ['-r', zipPath, '.'], { cwd: src, stdio: 'inherit' });
  process.exit(z.status ?? 1);
}
console.log(`Wrote ${zipPath}`);
