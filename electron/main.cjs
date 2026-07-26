const { app, BrowserWindow, dialog, ipcMain, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const { fileURLToPath } = require('node:url');
const { extractZipArchive, zipNeedsPassword, isZipPath } = require('./zip.cjs');
const { listMediaSources } = require('./media.cjs');
const { pacsEcho, pacsFind, pacsMove, pacsGet, pacsStore, validatePacsConn } = require('./pacs.cjs');
const { installAppMenu } = require('./menu.cjs');
const { collectOpenPathsFromArgv } = require('./argv.cjs');
const { checkGithubUpdate } = require('./update.cjs');
const {
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
  normalize,
  registerSessionTemp,
  setPendingMediaRoots,
  claimMediaRoot,
  isBroadFilesystemRoot,
} = require('./paths.cjs');

/** @type {Map<string, { cancelled: boolean }>} */
const activeRetrieves = new Map();

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {string[]} */
let pendingOpenPaths = collectOpenPathsFromArgv(process.argv);

const ICON_PATH = path.join(__dirname, '..', 'Icon.ico');

function PROFILES_FILE() {
  return path.join(app.getPath('userData'), 'pacs-profiles.json');
}

function BOUNDS_FILE() {
  return path.join(app.getPath('userData'), 'window-bounds.json');
}

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'githubusercontent.com',
]);

function isAllowedExternalUrl(urlStr) {
  let u;
  try {
    u = new URL(String(urlStr || ''));
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (ALLOWED_EXTERNAL_HOSTS.has(host)) return true;
  if (host.endsWith('.githubusercontent.com')) return true;
  return false;
}

function resolveAppIcon() {
  try {
    if (fsSync.existsSync(ICON_PATH)) return ICON_PATH;
  } catch {
    // ignore
  }
  return undefined;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function sendToRenderer(command, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('app:command', { command, payload });
}

function deliverOpenPaths(paths) {
  if (!paths || paths.length === 0) return;
  for (const p of paths) {
    try {
      const resolved = normalize(p);
      if (isBroadFilesystemRoot(resolved)) continue;
      const st = fsSync.statSync(resolved);
      if (st.isDirectory()) allowRoot(resolved);
      else allowFile(resolved);
    } catch {
      // skip
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:open-paths', paths);
  } else {
    pendingOpenPaths = [...new Set([...(pendingOpenPaths || []), ...paths])];
  }
}

function readWindowBounds() {
  try {
    const raw = fsSync.readFileSync(BOUNDS_FILE(), 'utf8');
    const b = JSON.parse(raw);
    if (
      typeof b?.width === 'number' &&
      typeof b?.height === 'number' &&
      b.width >= 960 &&
      b.height >= 640
    ) {
      return b;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveWindowBounds(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getBounds();
    fsSync.mkdirSync(path.dirname(BOUNDS_FILE()), { recursive: true });
    fsSync.writeFileSync(
      BOUNDS_FILE(),
      `${JSON.stringify({ ...b, isMaximized: win.isMaximized() }, null, 2)}\n`,
      'utf8',
    );
  } catch {
    // ignore
  }
}

function applyCsp() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const csp = isDev
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:* ws://localhost:* http://localhost:*; object-src 'none'; base-uri 'self'; frame-src 'self' blob:;"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'self' blob:;";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    headers['Content-Security-Policy'] = [csp];
    callback({ responseHeaders: headers });
  });
}

function createWindow() {
  const bounds = readWindowBounds();
  const icon = resolveAppIcon();
  const win = new BrowserWindow({
    width: bounds?.width ?? 1440,
    height: bounds?.height ?? 900,
    x: typeof bounds?.x === 'number' ? bounds.x : undefined,
    y: typeof bounds?.y === 'number' ? bounds.y : undefined,
    minWidth: 960,
    minHeight: 640,
    title: 'Slice',
    backgroundColor: '#0c0e12',
    show: false,
    autoHideMenuBar: process.platform === 'win32',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow = win;
  if (bounds?.isMaximized) win.maximize();

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    let allowed = false;
    try {
      if (devUrl) {
        const allowedOrigin = new URL(devUrl).origin;
        allowed = new URL(url).origin === allowedOrigin;
      } else if (url.startsWith('file:')) {
        const appRoot = path.resolve(path.join(__dirname, '..', 'dist'));
        const target = path.normalize(fileURLToPath(url));
        allowed = target === appRoot || target.startsWith(appRoot + path.sep);
      }
    } catch {
      allowed = false;
    }
    if (!allowed) event.preventDefault();
  });

  win.on('close', () => saveWindowBounds(win));
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.on('did-finish-load', () => {
    if (pendingOpenPaths.length > 0) {
      const paths = pendingOpenPaths;
      pendingOpenPaths = [];
      deliverOpenPaths(paths);
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    if (process.env.SLICE_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return win;
}

async function findDicomdir(dir) {
  const candidates = [
    path.join(dir, 'DICOMDIR'),
    path.join(dir, 'dicomdir'),
    path.join(dir, 'Dicomdir'),
    path.join(dir, 'DICOM', 'DICOMDIR'),
    path.join(dir, 'DICOM', 'dicomdir'),
  ];
  for (const candidate of candidates) {
    try {
      const st = await fs.stat(candidate);
      if (st.isFile()) return candidate;
    } catch {
      // continue
    }
  }
  return null;
}

function looksLikeDicomFile(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base === 'dicomdir') return false;
  return base.endsWith('.dcm') || base.endsWith('.dicom') || !base.includes('.');
}

async function collectDicomFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectDicomFiles(full)));
      continue;
    }
    if (entry.isFile() && looksLikeDicomFile(full)) {
      files.push(full);
    }
  }

  return files;
}

async function resolveDroppedPaths(paths) {
  const files = [];
  const seen = new Set();

  for (const p of paths) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    try {
      const resolved = normalize(p);
      if (isBroadFilesystemRoot(resolved)) continue;
      const stat = await fs.stat(resolved);
      if (stat.isDirectory()) {
        if (isBroadFilesystemRoot(resolved)) continue;
        allowRoot(resolved);
        files.push(...(await collectDicomFiles(resolved)));
      } else if (stat.isFile()) {
        // File drops: allow only the file, not its entire parent directory.
        allowFile(resolved);
        if (isZipPath(resolved)) {
          const needs = await zipNeedsPassword(resolved);
          if (needs) {
            return { needsPassword: true, zipPath: resolved, files: [] };
          }
          const extracted = await extractZipArchive(resolved);
          registerSessionTemp(extracted.extractDir);
          files.push(...extracted.files);
        } else {
          files.push(resolved);
        }
      }
    } catch {
      // skip inaccessible / denied paths
    }
  }

  return { needsPassword: false, files: [...new Set(files)] };
}

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Open DICOM folder',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const folder = result.filePaths[0];
  try {
    allowRoot(folder);
  } catch {
    return null;
  }
  return folder;
});

ipcMain.handle('dialog:openFile', async (_event, opts = {}) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: opts.title || 'Open file',
    filters: opts.filters || [{ name: 'All files', extensions: ['*'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  allowFile(filePath);
  return filePath;
});

ipcMain.handle('dialog:openDicomFiles', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    title: 'Open DICOM files',
    filters: [
      { name: 'DICOM', extensions: ['dcm', 'dicom'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  for (const filePath of result.filePaths) {
    allowFile(filePath);
    try {
      allowRoot(path.dirname(filePath));
    } catch {
      // parent may be too broad (e.g. home) — file itself remains allowed
    }
  }
  return result.filePaths;
});

ipcMain.on('window:setProgress', (event, value) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  if (typeof value === 'number' && value >= 0 && value <= 1) {
    win.setProgressBar(value);
  } else {
    win.setProgressBar(-1);
  }
});

ipcMain.handle('dialog:openZip', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Open DICOM ZIP',
    filters: [
      { name: 'ZIP archives', extensions: ['zip'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const zipPath = result.filePaths[0];
  allowFile(zipPath);
  try {
    allowRoot(path.dirname(zipPath));
  } catch {
    // parent may be too broad
  }
  return zipPath;
});

ipcMain.handle('shell:openPath', async (_event, p) => {
  try {
    const allowed = assertOpenable(p);
    return shell.openPath(allowed);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
});

ipcMain.handle('dialog:saveFile', async (_event, opts = {}) => {
  const result = await dialog.showSaveDialog({
    title: opts.title || 'Save file',
    defaultPath: opts.defaultPath || undefined,
    filters: opts.filters || [{ name: 'All files', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePath) return null;
  allowWriteFile(result.filePath);
  return result.filePath;
});

ipcMain.handle('dialog:saveDirectory', async (_event, opts = {}) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: opts.title || 'Select export folder',
    defaultPath: opts.defaultPath || undefined,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const dir = result.filePaths[0];
  allowWriteRoot(dir);
  return dir;
});

ipcMain.handle('fs:writeFile', async (_event, filePath, data) => {
  try {
    const allowed = assertWritable(filePath);
    const buffer = Buffer.from(data);
    await fs.mkdir(path.dirname(allowed), { recursive: true });
    await fs.writeFile(allowed, buffer);
    allowOpen(allowed);
    return { ok: true, bytes: buffer.length };
  } catch (e) {
    return { ok: false, bytes: 0, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle('fs:writeTemp', async (_event, fileName, data) => {
  try {
    const safe = path.basename(String(fileName || 'file.bin')).replace(/[^\w.-]+/g, '_');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slice-out-'));
    registerSessionTemp(dir);
    const outPath = path.join(dir, safe || 'file.bin');
    const buffer = Buffer.from(data);
    await fs.writeFile(outPath, buffer);
    allowOpen(outPath);
    allowFile(outPath);
    return { ok: true, path: outPath, bytes: buffer.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle('fs:listDicomFiles', async (_event, folderPath) => {
  const allowed = assertListable(folderPath);
  allowRoot(allowed);
  return collectDicomFiles(allowed);
});

ipcMain.handle('fs:findDicomdir', async (_event, folderPath) => {
  if (!folderPath) return null;
  const allowed = assertListable(folderPath);
  return findDicomdir(allowed);
});

ipcMain.handle('fs:resolveDroppedPaths', async (_event, paths) => {
  return resolveDroppedPaths(Array.isArray(paths) ? paths : []);
});

ipcMain.handle('fs:readFile', async (_event, filePath) => {
  const allowed = assertReadable(filePath);
  const buffer = await fs.readFile(allowed);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
});

ipcMain.handle('zip:needsPassword', async (_event, zipPath) => {
  const allowed = assertZipSource(zipPath);
  return zipNeedsPassword(allowed);
});

ipcMain.handle('zip:extract', async (_event, zipPath, password) => {
  try {
    const allowed = assertZipSource(zipPath);
    const result = await extractZipArchive(allowed, password || undefined);
    registerSessionTemp(result.extractDir);
    return {
      ok: true,
      files: result.files,
      extractDir: result.extractDir,
      entryCount: result.entryCount,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code =
      e && e.code
        ? e.code
        : msg.includes('Invalid password')
          ? 'INVALID_PASSWORD'
          : 'ERROR';
    // Never echo password in error strings
    return { ok: false, error: msg, code };
  }
});

ipcMain.handle('media:list', async () => {
  try {
    const list = await listMediaSources();
    setPendingMediaRoots((list || []).map((m) => m?.path).filter(Boolean));
    return list;
  } catch {
    return [];
  }
});

ipcMain.handle('media:open', async (_event, mediaPath) => {
  try {
    const allowed = claimMediaRoot(mediaPath);
    return { ok: true, path: allowed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

function withValidatedPacs(handler) {
  return async (event, conn, ...rest) => {
    try {
      const safe = validatePacsConn(conn);
      return await handler(event, safe, ...rest);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        results: [],
        files: [],
      };
    }
  };
}

ipcMain.handle(
  'pacs:echo',
  withValidatedPacs(async (_event, conn) => {
    try {
      return { ok: true, ...(await pacsEcho(conn)) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }),
);

ipcMain.handle(
  'pacs:find',
  withValidatedPacs(async (_event, conn, query) => {
    try {
      const results = await pacsFind(conn, query || {});
      return { ok: true, results };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), results: [] };
    }
  }),
);

async function runPacsRetrieve(event, conn, studyInstanceUid, opts, retrieveFn) {
  const baseOpts = opts || {};
  const jobId = baseOpts.jobId || `${Date.now()}-${Math.random()}`;
  const job = { cancelled: false };
  activeRetrieves.set(jobId, job);
  try {
    const result = await retrieveFn(conn, studyInstanceUid, {
      ...baseOpts,
      jobId,
      onProgress: (received) => {
        event.sender.send('pacs:retrieve-progress', { jobId, received });
      },
      isCancelled: () => job.cancelled,
    });
    if (result?.extractDir) registerSessionTemp(result.extractDir);
    if (Array.isArray(result?.files)) {
      for (const f of result.files) allowFile(f);
    }
    return { ok: true, ...result, jobId };
  } catch (e) {
    const cancelled = (e && e.name === 'AbortError') || job.cancelled;
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      files: [],
      ...(cancelled ? { cancelled: true } : {}),
      jobId,
    };
  } finally {
    activeRetrieves.delete(jobId);
  }
}

ipcMain.handle('pacs:move', async (event, conn, studyInstanceUid, opts) => {
  try {
    const safe = validatePacsConn(conn);
    return await runPacsRetrieve(event, safe, studyInstanceUid, opts, pacsMove);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), files: [] };
  }
});

ipcMain.handle('pacs:get', async (event, conn, studyInstanceUid, opts) => {
  try {
    const safe = validatePacsConn(conn);
    return await runPacsRetrieve(event, safe, studyInstanceUid, opts, pacsGet);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), files: [] };
  }
});

ipcMain.handle('pacs:retrieve-cancel', (_event, jobId) => {
  const job = activeRetrieves.get(jobId);
  if (job) job.cancelled = true;
  return { ok: true };
});

ipcMain.handle('pacs:store', async (_event, conn, filePaths) => {
  try {
    const safe = validatePacsConn(conn);
    const allowed = [];
    for (const p of filePaths || []) {
      allowed.push(assertReadable(p));
    }
    if (allowed.length === 0) throw new Error('No allowed files to store');
    const result = await pacsStore(safe, allowed);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('app:getUpdateRepo', () => {
  try {
    const pkg = require('../package.json');
    const repoUrl = pkg.repository?.url || pkg.homepage || '';
    const m = /github\.com[/:]([^/]+)\/([^/.]+)/i.exec(repoUrl);
    if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
  } catch {
    // fall through
  }
  return { owner: 'Dmitrii-Salikhov', repo: 'Slice' };
});

ipcMain.handle('app:checkUpdate', async () => {
  let repo = { owner: 'Dmitrii-Salikhov', repo: 'Slice' };
  try {
    const pkg = require('../package.json');
    const repoUrl = pkg.repository?.url || pkg.homepage || '';
    const m = /github\.com[/:]([^/]+)\/([^/.]+)/i.exec(repoUrl);
    if (m) repo = { owner: m[1], repo: m[2].replace(/\.git$/, '') };
  } catch {
    // keep default
  }
  return checkGithubUpdate(app.getVersion(), repo);
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  try {
    const s = String(url || '');
    if (!isAllowedExternalUrl(s)) {
      return { ok: false, error: 'URL host not allowed' };
    }
    await shell.openExternal(s);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle('settings:getPacsProfiles', async () => {
  try {
    const raw = await fs.readFile(PROFILES_FILE(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.handle('settings:setPacsProfiles', async (_event, payload) => {
  try {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.profiles)) {
      throw new Error('Invalid profiles payload');
    }
    for (const p of payload.profiles) {
      if (p?.conn) validatePacsConn(p.conn);
    }
    const file = PROFILES_FILE();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

if (gotLock) {
  app.on('second-instance', (_event, argv) => {
    const paths = collectOpenPathsFromArgv(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    deliverOpenPaths(paths);
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.slice.dicomviewer');
    }
    const icon = resolveAppIcon();
    if (icon && process.platform === 'darwin') {
      try {
        app.dock?.setIcon(icon);
      } catch {
        // .ico may not apply on macOS dock; ignore
      }
    }
    applyCsp();
    installAppMenu(sendToRenderer);
    createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
