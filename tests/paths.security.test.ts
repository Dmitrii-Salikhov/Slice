import { describe, expect, it, beforeEach } from 'vitest';
import {
  allowRoot,
  allowFile,
  allowWriteFile,
  allowWriteRoot,
  assertReadable,
  assertWritable,
  assertOpenable,
  assertListable,
  containPath,
  resetForTests,
  registerSessionTemp,
  isSessionTemp,
  isBroadFilesystemRoot,
  setPendingMediaRoots,
  claimMediaRoot,
} from '../electron/paths.cjs';
import { joinMediaPath } from '../src/dicom/dicomdirTypes';
import { validatePacsConn } from '../electron/pacs.cjs';
import path from 'node:path';
import os from 'node:os';

describe('path allowlist', () => {
  beforeEach(() => {
    resetForTests();
  });

  it('denies reads outside allowed roots', () => {
    allowRoot('/tmp/slice-session');
    expect(() => assertReadable('/etc/passwd')).toThrow(/not allowed/);
    expect(assertReadable('/tmp/slice-session/a.dcm')).toContain('slice-session');
  });

  it('rejects broad filesystem roots', () => {
    expect(isBroadFilesystemRoot(os.homedir())).toBe(true);
    if (process.platform === 'win32') {
      expect(isBroadFilesystemRoot('C:\\')).toBe(true);
      expect(isBroadFilesystemRoot('C:\\Users')).toBe(true);
      expect(isBroadFilesystemRoot('C:\\Windows')).toBe(true);
      expect(isBroadFilesystemRoot('C:\\Program Files')).toBe(true);
      expect(() => allowRoot('C:\\')).toThrow(/too broad/);
      // Drive-relative /tmp is not a Unix root on Windows.
      expect(isBroadFilesystemRoot('/tmp')).toBe(false);
    } else {
      expect(isBroadFilesystemRoot('/')).toBe(true);
      expect(isBroadFilesystemRoot('/Users')).toBe(true);
      expect(isBroadFilesystemRoot('/tmp')).toBe(true);
      expect(() => allowRoot('/')).toThrow(/too broad/);
      expect(() => allowRoot('/tmp')).toThrow(/too broad/);
    }
  });

  it('allows exact files and write targets from dialogs', () => {
    allowFile('/Users/me/notes.json');
    expect(assertReadable('/Users/me/notes.json')).toBe(path.resolve('/Users/me/notes.json'));
    allowWriteFile('/Users/me/out.png');
    expect(assertWritable('/Users/me/out.png')).toBe(path.resolve('/Users/me/out.png'));
    expect(assertOpenable('/Users/me/out.png')).toBe(path.resolve('/Users/me/out.png'));
  });

  it('allows writes under export directory', () => {
    allowWriteRoot('/tmp/export-dir');
    expect(assertWritable('/tmp/export-dir/a.dcm')).toContain('export-dir');
    expect(() => assertWritable('/tmp/other/a.dcm')).toThrow(/not allowed/);
  });

  it('lists only under allowed roots', () => {
    allowRoot('/data/study');
    expect(assertListable('/data/study')).toContain('study');
    expect(assertListable('/data/study/sub')).toContain('sub');
    expect(() => assertListable('/data')).toThrow(/not allowed/);
  });

  it('session temp is exact registered dirs only', () => {
    const dir = path.join(os.tmpdir(), 'slice-zip-test-xyz');
    expect(isSessionTemp(path.join(dir, 'a.dcm'))).toBe(false);
    registerSessionTemp(dir);
    expect(assertReadable(path.join(dir, 'a.dcm'))).toContain('slice-zip-test-xyz');
    expect(() =>
      assertReadable(path.join(os.tmpdir(), 'slice-pwn', 'secret.dcm')),
    ).toThrow(/not allowed/);
  });

  it('media claim requires pending scan entry', () => {
    const media = path.join(os.tmpdir(), 'slice-media-cd');
    expect(() => claimMediaRoot(media)).toThrow(/last scan/);
    setPendingMediaRoots([media]);
    expect(claimMediaRoot(media)).toBe(path.resolve(media));
    expect(assertListable(media)).toBe(path.resolve(media));
  });

  it('media claim allows Windows optical drive roots from scan', () => {
    if (process.platform !== 'win32') return;
    expect(isBroadFilesystemRoot('Z:\\')).toBe(true);
    expect(() => allowRoot('Z:\\')).toThrow(/too broad/);
    setPendingMediaRoots(['Z:\\']);
    expect(claimMediaRoot('Z:\\')).toBe(path.resolve('Z:\\'));
    expect(assertListable('Z:\\')).toBe(path.resolve('Z:\\'));
    // Re-allow after claim (e.g. listDicomFiles) must not reject.
    expect(() => allowRoot('Z:\\')).not.toThrow();
  });

  it('containPath blocks traversal', () => {
    const root = path.join(os.tmpdir(), 'slice-contain');
    expect(containPath(root, ['IMG', '001.dcm'])).toBe(path.resolve(root, 'IMG', '001.dcm'));
    expect(containPath(root, ['..', 'etc', 'passwd'])).toBeNull();
    expect(containPath(root, ['foo', '..', '..', 'etc'])).toBeNull();
  });
});

describe('validatePacsConn', () => {
  it('accepts valid connection', () => {
    const c = validatePacsConn({
      host: '127.0.0.1',
      port: 11112,
      callingAe: 'SLICE',
      calledAe: 'PACS',
      localAe: 'SLICE',
      localPort: 11113,
    });
    expect(c.host).toBe('127.0.0.1');
    expect(c.port).toBe(11112);
    expect(c.localPort).toBe(11113);
  });

  it('rejects bad host and ports', () => {
    expect(() => validatePacsConn({ host: 'evil;rm', port: 104 })).toThrow(/host/i);
    expect(() => validatePacsConn({ host: 'pacs.local', port: 99999 })).toThrow(/port/i);
    expect(() =>
      validatePacsConn({ host: 'pacs.local', port: 104, localPort: 80 }),
    ).toThrow(/localPort/i);
  });
});

describe('joinMediaPath', () => {
  it('joins safe relative parts', () => {
    expect(joinMediaPath('/media/cd', ['DICOM', 'IMG001'])).toBe('/media/cd/DICOM/IMG001');
  });

  it('rejects path traversal', () => {
    expect(joinMediaPath('/media/cd', ['..', 'etc'])).toBeNull();
    expect(joinMediaPath('/media/cd', ['foo/../bar'])).toBeNull();
    expect(joinMediaPath('/media/cd', ['C:Windows'])).toBeNull();
  });
});
