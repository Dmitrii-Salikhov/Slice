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
} from '../electron/paths.cjs';
import { joinMediaPath } from '../src/dicom/dicomdirTypes';
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

  it('containPath blocks traversal', () => {
    const root = path.join(os.tmpdir(), 'slice-contain');
    expect(containPath(root, ['IMG', '001.dcm'])).toBe(path.resolve(root, 'IMG', '001.dcm'));
    expect(containPath(root, ['..', 'etc', 'passwd'])).toBeNull();
    expect(containPath(root, ['foo', '..', '..', 'etc'])).toBeNull();
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
