const path = require('node:path');
const fs = require('node:fs');

/**
 * Collect filesystem paths from process argv suitable for open-on-launch.
 * Skips the executable, Electron internals, and script entrypoints.
 * @param {string[]} argv
 * @param {{ execPath?: string }} [opts]
 * @returns {string[]}
 */
function collectOpenPathsFromArgv(argv, opts = {}) {
  const execPath = opts.execPath || process.execPath;
  const out = [];
  const seen = new Set();

  for (const raw of argv) {
    if (!raw || typeof raw !== 'string') continue;
    if (raw.startsWith('-')) continue;
    if (raw === execPath) continue;

    let resolved;
    try {
      resolved = path.resolve(raw);
    } catch {
      continue;
    }

    const base = path.basename(resolved).toLowerCase();
    if (base === 'electron' || base === 'electron.exe') continue;
    if (/\.(js|cjs|mjs|ts|tsx|json)$/i.test(base)) continue;
    if (resolved.includes(`${path.sep}node_modules${path.sep}`)) continue;
    if (seen.has(resolved)) continue;

    try {
      if (!fs.existsSync(resolved)) continue;
    } catch {
      continue;
    }

    seen.add(resolved);
    out.push(resolved);
  }

  return out;
}

module.exports = { collectOpenPathsFromArgv };
