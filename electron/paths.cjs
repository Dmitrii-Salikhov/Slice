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
/** @type {Set<string>} */
const sessionTempRoots = new Set();
/** @type {Set<string>} */
const pendingMediaRoots = new Set();

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
  if (process.platform === 'win32') {
    return c.toLowerCase().startsWith(prefix.toLowerCase());
  }
  return c.startsWith(prefix);
}

/** Reject allowlisting entire disks / home / common top-level trees. */
function isBroadFilesystemRoot(dir) {
  const n = normalize(dir);
  if (process.platform === 'win32') {
    if (/^[a-zA-Z]:\\?$/i.test(n)) return true;
    if (/^[a-zA-Z]:\\Users$/i.test(n)) return true;
    if (/^[a-zA-Z]:\\Windows$/i.test(n)) return true;
    if (/^[a-zA-Z]:\\Program Files( \(x86\))?$/i.test(n)) return true;
  } else {
    if (n === '/') return true;
    const banned = new Set([
      '/Users',
      '/home',
      '/Volumes',
      '/private',
      '/tmp',
      '/var',
      '/etc',
      '/System',
      '/Library',
      '/Applications',
    ]);
    if (banned.has(n)) return true;
  }
  try {
    if (n === normalize(os.homedir())) return true;
  } catch {
    // ignore
  }
  return false;
}

function pathDenied(message) {
  const err = new Error(message);
  err.code = 'PATH_DENIED';
  return err;
}

function allowRoot(dir) {
  if (!dir) return;
  const n = normalize(dir);
  if (isBroadFilesystemRoot(n)) {
    throw pathDenied('Path too broad to allow');
  }
  allowedRoots.add(n);
}

function allowFile(filePath) {
  if (!filePath) return;
  allowedFiles.add(normalize(filePath));
}

function allowWriteRoot(dir) {
  if (!dir) return;
  const n = normalize(dir);
  if (isBroadFilesystemRoot(n)) {
    throw pathDenied('Path too broad to allow');
  }
  allowedWriteRoots.add(n);
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

/** Register a main-created temp directory (mkdtemp). */
function registerSessionTemp(dir) {
  const n = normalize(dir);
  sessionTempRoots.add(n);
  allowedRoots.add(n);
  allowedWriteRoots.add(n);
  return n;
}

function isSessionTemp(filePath) {
  const n = normalize(filePath);
  for (const root of sessionTempRoots) {
    if (isInside(n, root)) return true;
  }
  return false;
}

function setPendingMediaRoots(paths) {
  pendingMediaRoots.clear();
  for (const p of paths || []) {
    if (!p) continue;
    try {
      pendingMediaRoots.add(normalize(p));
    } catch {
      // skip
    }
  }
}

/** Claim a media path from the last media:list scan into the session allowlist. */
function claimMediaRoot(dirPath) {
  const n = normalize(dirPath);
  if (!pendingMediaRoots.has(n)) {
    throw pathDenied('Media path not from last scan');
  }
  if (isBroadFilesystemRoot(n)) {
    throw pathDenied('Path too broad to allow');
  }
  allowedRoots.add(n);
  return n;
}

function assertReadable(filePath) {
  const n = normalize(filePath);
  if (allowedFiles.has(n)) return n;
  for (const root of allowedRoots) {
    if (isInside(n, root)) return n;
  }
  if (isSessionTemp(n)) return n;
  throw pathDenied('Path not allowed for read');
}

function assertListable(dirPath) {
  const n = normalize(dirPath);
  for (const root of allowedRoots) {
    if (n === root || isInside(n, root)) return n;
  }
  if (isSessionTemp(n)) return n;
  throw pathDenied('Path not allowed for list');
}

function assertWritable(filePath) {
  const n = normalize(filePath);
  if (allowedWriteFiles.has(n)) return n;
  for (const root of allowedWriteRoots) {
    if (isInside(n, root)) return n;
  }
  if (isSessionTemp(n)) return n;
  throw pathDenied('Path not allowed for write');
}

function assertOpenable(filePath) {
  const n = normalize(filePath);
  if (allowedOpenFiles.has(n)) return n;
  if (isSessionTemp(n)) return n;
  for (const root of allowedRoots) {
    if (isInside(n, root) && /\.(pdf|png|jpe?g|dcm|dicom)$/i.test(n)) return n;
  }
  throw pathDenied('Path not allowed to open');
}

function assertZipSource(zipPath) {
  const n = normalize(zipPath);
  if (allowedFiles.has(n)) return n;
  for (const root of allowedRoots) {
    if (isInside(n, root)) return n;
  }
  throw pathDenied('Path not allowed for zip');
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
  sessionTempRoots.clear();
  pendingMediaRoots.clear();
}

module.exports = {
  normalize,
  isInside,
  isBroadFilesystemRoot,
  allowRoot,
  allowFile,
  allowWriteRoot,
  allowWriteFile,
  allowOpen,
  registerSessionTemp,
  isSessionTemp,
  setPendingMediaRoots,
  claimMediaRoot,
  assertReadable,
  assertListable,
  assertWritable,
  assertOpenable,
  assertZipSource,
  containPath,
  resetForTests,
};
