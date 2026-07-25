const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const {
  ZipReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ERR_ENCRYPTED,
  ERR_INVALID_PASSWORD,
} = require('@zip.js/zip.js');

function looksLikeDicomName(name) {
  const base = path.basename(name).toLowerCase();
  if (base === 'dicomdir') return false;
  return base.endsWith('.dcm') || base.endsWith('.dicom') || !base.includes('.');
}

function isZipPath(filePath) {
  return /\.zip$/i.test(filePath);
}

/**
 * @param {string} zipPath
 * @param {string} [password]
 * @returns {Promise<{ files: string[], extractDir: string, entryCount: number }>}
 */
async function extractZipArchive(zipPath, password) {
  const data = await fs.readFile(zipPath);
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(data)), {
    password: password || undefined,
  });

  let entries;
  try {
    entries = await reader.getEntries();
  } catch (e) {
    await reader.close().catch(() => {});
    throw e;
  }

  const encrypted = entries.some((e) => !e.directory && e.encrypted);
  if (encrypted && !password) {
    await reader.close().catch(() => {});
    const err = new Error(ERR_ENCRYPTED);
    err.code = 'NEEDS_PASSWORD';
    throw err;
  }

  const extractDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slice-zip-'));
  const files = [];
  const rootResolved = path.resolve(extractDir);

  try {
    for (const entry of entries) {
      if (entry.directory) continue;
      const rel = entry.filename.replace(/^[/\\]+/, '').replace(/\\/g, '/');
      if (!rel || rel.includes('\0')) continue;

      const parts = rel.split('/').filter(Boolean);
      if (
        parts.some(
          (p) =>
            p === '.' ||
            p === '..' ||
            p.includes('..') ||
            /^[a-zA-Z]:/.test(p),
        )
      ) {
        continue;
      }

      const outPath = path.resolve(extractDir, ...parts);
      const prefix = rootResolved.endsWith(path.sep)
        ? rootResolved
        : rootResolved + path.sep;
      if (outPath !== rootResolved && !outPath.startsWith(prefix)) {
        continue;
      }

      await fs.mkdir(path.dirname(outPath), { recursive: true });

      let bytes;
      try {
        bytes = await entry.getData(new Uint8ArrayWriter());
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === ERR_ENCRYPTED || msg === ERR_INVALID_PASSWORD) {
          const err = new Error(msg === ERR_INVALID_PASSWORD ? ERR_INVALID_PASSWORD : ERR_ENCRYPTED);
          err.code = msg === ERR_INVALID_PASSWORD ? 'INVALID_PASSWORD' : 'NEEDS_PASSWORD';
          throw err;
        }
        throw e;
      }

      await fs.writeFile(outPath, Buffer.from(bytes));
      if (looksLikeDicomName(rel)) files.push(outPath);
    }
  } catch (e) {
    await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    throw e;
  } finally {
    await reader.close().catch(() => {});
  }

  return { files, extractDir, entryCount: entries.length };
}

/**
 * Peek whether archive has encrypted entries (no extract).
 * @param {string} zipPath
 */
async function zipNeedsPassword(zipPath) {
  const data = await fs.readFile(zipPath);
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(data)));
  try {
    const entries = await reader.getEntries();
    return entries.some((e) => !e.directory && e.encrypted);
  } finally {
    await reader.close().catch(() => {});
  }
}

module.exports = {
  extractZipArchive,
  zipNeedsPassword,
  isZipPath,
};
