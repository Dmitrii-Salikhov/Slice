const path = require('node:path');
const os = require('node:os');

/** @type {Set<string>} */
const allowedRoots = new Set();
/** @type {Set<string>} */
const allowedFiles = new Set();
/** @type {Set<string>} */
const allowedWriteRoots = new Set();
/** @type {Set<string>} */
const allowedWriteFiles = new Set();
/** @type {Set<string>} */
const allowedOpenFiles = new Set();

function normalize(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid path');
  }
  return path.resolve(filePath);
}

function isInside(child, parent) {
  const c = normalize(child);
  const p = normalize(parent);
  if (c === p) return true;
  const prefix = p.endsWith(path.sep) ? p : p + path.sep;
  // Case-insensitive on Windows
  if (process.platform === 'win32') {
    return c.toLowerCase().startsWith(prefix.toLowerCase());
  }
  return c.startsWith(prefix);
}

function allowRoot(dir) {
  if (!dir) return;
  allowedRoots.add(normalize(dir));
}

function allowFile(filePath) {
  if (!filePath) return;
  allowedFiles.add(normalize(filePath));
}

function allowWriteRoot(dir) {
  if (!dir) return;
  allowedWriteRoots.add(normalize(dir));
}

function allowWriteFile(filePath) {
  if (!filePath) return;
  const n = normalize(filePath);
  allowedWriteFiles.add(n);
  allowOpen(n);
}

function allowOpen(filePath) {
  if (!filePath) return;
  allowedOpenFiles.add(normalize(filePath));
}

function isUnderTmpSlice(filePath) {
  const n = normalize(filePath);
  const tmp = normalize(os.tmpdir());
  if (!isInside(n, tmp)) return false;
  // any path under os.tmpdir()/slice-* 
  const rel = n.slice(tmp.length).split(path.sep).filter(Boolean);
  return rel.some((seg) => seg.startsWith('slice-'));
}

function assertReadable(filePath) {
  const n = normalize(filePath);
  if (allowedFiles.has(n)) return n;
  for (const root of allowedRoots) {
    if (isInside(n, root)) return n;
  }
  if (isUnderTmpSlice(n)) return n;
  const err = new Error('Path not allowed for read');
  err.code = 'PATH_DENIED';
  throw err;
}

function assertListable(dirPath) {
  const n = normalize(dirPath);
  for (const root of allowedRoots) {
    if (n === root || isInside(n, root)) return n;
  }
  const err = new Error('Path not allowed for list');
  err.code = 'PATH_DENIED';
  throw err;
}

function assertWritable(filePath) {
  const n = normalize(filePath);
  if (allowedWriteFiles.has(n)) return n;
  for (const root of allowedWriteRoots) {
    if (isInside(n, root)) return n;
  }
  if (isUnderTmpSlice(n)) return n;
  const err = new Error('Path not allowed for write');
  err.code = 'PATH_DENIED';
  throw err;
}

function assertOpenable(filePath) {
  const n = normalize(filePath);
  if (allowedOpenFiles.has(n)) return n;
  if (isUnderTmpSlice(n)) return n;
  // Also allow opening files we can read that are PDF/images under session
  for (const root of allowedRoots) {
    if (isInside(n, root) && /\.(pdf|png|jpe?g|dcm|dicom)$/i.test(n)) return n;
  }
  const err = new Error('Path not allowed to open');
  err.code = 'PATH_DENIED';
  throw err;
}

function assertZipSource(zipPath) {
  const n = normalize(zipPath);
  // ZIP may be outside session until extract — allow any real zip chosen via dialog/drop
  // but register after dialog. For needsPassword before allow, check allowedFiles or roots or absolute under user home is too broad.
  // Policy: zip source must be in allowedFiles (from dialog) or under an allowed root or dropped (registered).
  if (allowedFiles.has(n)) return n;
  for (const root of allowedRoots) {
    if (isInside(n, root)) return n;
  }
  const err = new Error('Path not allowed for zip');
  err.code = 'PATH_DENIED';
  throw err;
}

/** Ensure resolved child stays under root (Zip-Slip / DICOMDIR). */
function containPath(rootDir, relativeParts) {
  const root = normalize(rootDir);
  const parts = (relativeParts || [])
    .map((p) => String(p).replace(/\\/g, '/'))
    .flatMap((p) => p.split('/'))
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part === '.' || part === '..') return null;
    if (part.includes('\0')) return null;
    if (/^[a-zA-Z]:/.test(part)) return null;
    if (part.startsWith('/') || part.startsWith('\\')) return null;
  }

  const resolved = normalize(path.join(root, ...parts));
  if (!isInside(resolved, root)) return null;
  return resolved;
}

function resetForTests() {
  allowedRoots.clear();
  allowedFiles.clear();
  allowedWriteRoots.clear();
  allowedWriteFiles.clear();
  allowedOpenFiles.clear();
}

module.exports = {
  normalize,
  isInside,
  allowRoot,
  allowFile,
  allowWriteRoot,
  allowWriteFile,
  allowOpen,
  assertReadable,
  assertListable,
  assertWritable,
  assertOpenable,
  assertZipSource,
  containPath,
  resetForTests,
  isUnderTmpSlice,
};
