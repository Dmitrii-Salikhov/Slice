const path = require('node:path');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function hasDicomContent(root) {
  const dicomdirNames = ['DICOMDIR', 'dicomdir', 'Dicomdir'];
  for (const name of dicomdirNames) {
    if (await pathExists(path.join(root, name))) return true;
  }
  // Shallow check: DICOM/ folder common on media
  for (const name of ['DICOM', 'Dicom', 'dicom', 'IHE_PDI', 'IMAGES']) {
    if (await pathExists(path.join(root, name))) return true;
  }
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    let files = 0;
    for (const e of entries) {
      if (!e.isFile()) continue;
      const base = e.name.toLowerCase();
      if (base.endsWith('.dcm') || base.endsWith('.dicom')) return true;
      files += 1;
      if (files > 40) break;
    }
  } catch {
    // ignore
  }
  return false;
}

async function diskutilInfo(mountPoint) {
  try {
    const { stdout } = await execFileAsync('diskutil', ['info', mountPoint], {
      timeout: 8000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return '';
  }
}

function classifyFromDiskutil(info) {
  const optical =
    /Optical Media Type:/i.test(info) ||
    /Protocol:\s*Optical/i.test(info) ||
    /Bus Protocol:\s*Optical/i.test(info) ||
    /Disc Burning/i.test(info);
  const removable =
    /Removable Media:\s*Removable/i.test(info) ||
    /Ejectable:\s*Yes/i.test(info) ||
    /Solid State:\s*No/i.test(info);
  return { optical, removable };
}

async function listMacVolumes() {
  const root = '/Volumes';
  if (!(await pathExists(root))) return [];

  const names = await fs.readdir(root);
  const out = [];

  for (const name of names) {
    if (name === '.' || name === '..') continue;
    const mountPath = path.join(root, name);
    let stat;
    try {
      stat = await fs.stat(mountPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const info = await diskutilInfo(mountPath);
    const { optical, removable } = classifyFromDiskutil(info);
    const dicom = await hasDicomContent(mountPath);

    // Prefer optical; also surface removable/USB with DICOM (PDI sticks)
    if (!optical && !(removable && dicom) && !dicom) continue;

    out.push({
      id: mountPath,
      name,
      path: mountPath,
      kind: optical ? 'optical' : removable ? 'removable' : 'volume',
      hasDicom: dicom,
      platform: 'darwin',
    });
  }

  return out;
}

async function listWindowsOptical() {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        // Prefer DriveType filter in WMI query (faster than Where-Object piping).
        "Get-CimInstance -ClassName Win32_LogicalDisk -Filter \"DriveType=2 OR DriveType=5\" -ErrorAction SilentlyContinue | Select-Object DeviceID, VolumeName, DriveType | ConvertTo-Json -Compress",
      ],
      { timeout: 4000, windowsHide: true, killSignal: 'SIGKILL' },
    );
    return parseWindowsLogicalDiskJson(stdout);
  } catch {
    return [];
  }
}

/**
 * @param {string} stdout
 * @returns {Promise<Array<{ id: string, name: string, path: string, kind: string, hasDicom: boolean, platform: string }>>}
 */
async function parseWindowsLogicalDiskJson(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout || '[]');
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  const out = [];
  for (const row of rows) {
    const letter = String(row.DeviceID || '').replace(/\\$/, '');
    if (!letter) continue;
    const mountPath = letter.endsWith(':') ? `${letter}\\` : letter;
    let dicom = false;
    try {
      dicom = await Promise.race([
        hasDicomContent(mountPath),
        new Promise((resolve) => setTimeout(() => resolve(false), 1500)),
      ]);
    } catch {
      dicom = false;
    }
    const kind = Number(row.DriveType) === 5 ? 'optical' : 'removable';
    out.push({
      id: mountPath,
      name: row.VolumeName || letter,
      path: mountPath,
      kind,
      hasDicom: dicom,
      platform: 'win32',
    });
  }
  return out;
}

async function listLinuxMedia() {
  const candidates = new Set();
  try {
    const mounts = await fs.readFile('/proc/mounts', 'utf8');
    for (const line of mounts.split('\n')) {
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const device = parts[0];
      const mountPoint = parts[1]?.replace(/\\040/g, ' ');
      if (!mountPoint) continue;
      if (/^\/dev\/(sr|cdrom|dvd)/.test(device) || mountPoint.startsWith('/media/') || mountPoint.startsWith('/run/media/')) {
        candidates.add(mountPoint);
      }
    }
  } catch {
    // ignore
  }

  for (const base of ['/media', '/mnt', '/run/media']) {
    if (!(await pathExists(base))) continue;
    try {
      const walk = async (dir, depth) => {
        if (depth > 2) return;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isDirectory()) continue;
          const full = path.join(dir, e.name);
          candidates.add(full);
          if (depth < 2) await walk(full, depth + 1);
        }
      };
      await walk(base, 0);
    } catch {
      // ignore
    }
  }

  const out = [];
  for (const mountPath of candidates) {
    let stat;
    try {
      stat = await fs.stat(mountPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const dicom = await hasDicomContent(mountPath);
    const optical = /cdrom|dvd|sr\d/i.test(mountPath);
    if (!optical && !dicom) continue;
    out.push({
      id: mountPath,
      name: path.basename(mountPath) || mountPath,
      path: mountPath,
      kind: optical ? 'optical' : 'volume',
      hasDicom: dicom,
      platform: 'linux',
    });
  }
  return out;
}

/**
 * List CD/DVD and DICOM-bearing removable volumes.
 * Hard wall-clock budget so CI / hung WMI never blocks forever.
 * @returns {Promise<Array<{ id: string, name: string, path: string, kind: string, hasDicom: boolean, platform: string }>>}
 */
async function listMediaSources() {
  const run = async () => {
    if (process.platform === 'darwin') return listMacVolumes();
    if (process.platform === 'win32') return listWindowsOptical();
    return listLinuxMedia();
  };
  try {
    return await Promise.race([
      run(),
      new Promise((resolve) => setTimeout(() => resolve([]), 6000)),
    ]);
  } catch {
    return [];
  }
}

module.exports = {
  listMediaSources,
  hasDicomContent,
  classifyFromDiskutil,
  parseWindowsLogicalDiskJson,
};
