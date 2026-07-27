import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {
  ZipWriter,
  Uint8ArrayWriter,
  Uint8ArrayReader,
  TextReader,
} from '@zip.js/zip.js';
import { createRequire } from 'node:module';
import { buildMinimalDicom } from './writeMinimalDicom';

const require = createRequire(import.meta.url);
const { extractZipArchive, zipNeedsPassword, isZipPath } = require('../electron/zip.cjs');
const {
  hasDicomContent,
  classifyFromDiskutil,
  listMediaSources,
  parseWindowsLogicalDiskJson,
} = require('../electron/media.cjs');

describe('zip helpers', () => {
  it('detects zip extension', () => {
    expect(isZipPath('/a/b/c.ZIP')).toBe(true);
    expect(isZipPath('/a/b/archive.zip')).toBe(true);
    expect(isZipPath('/a/b/c.dcm')).toBe(false);
    expect(isZipPath('/a/b/zip')).toBe(false);
  });

  it('extracts plain zip with dicom-like entries and nested folders', async () => {
    const writer = new ZipWriter(new Uint8ArrayWriter());
    await writer.add('series/img.dcm', new TextReader('DICMpayload'));
    await writer.add('series/IM0001', new TextReader('noext'));
    await writer.add('readme.txt', new TextReader('ignore me'));
    await writer.add('DICOMDIR', new TextReader('dir'));
    const bytes = await writer.close();

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slice-test-'));
    const zipPath = path.join(dir, 'plain.zip');
    await fs.writeFile(zipPath, bytes);

    expect(await zipNeedsPassword(zipPath)).toBe(false);
    const result = await extractZipArchive(zipPath);
    expect(result.entryCount).toBeGreaterThanOrEqual(3);
    expect(result.files.some((f: string) => f.endsWith('img.dcm'))).toBe(true);
    expect(result.files.some((f: string) => f.endsWith('IM0001'))).toBe(true);
    expect(result.files.some((f: string) => f.endsWith('readme.txt'))).toBe(false);
    expect(result.files.some((f: string) => /dicomdir$/i.test(f))).toBe(false);

    const img = result.files.find((f: string) => f.endsWith('img.dcm'))!;
    expect(await fs.readFile(img, 'utf8')).toBe('DICMpayload');

    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(result.extractDir, { recursive: true, force: true });
  });

  it('skips path-traversal entries', async () => {
    const writer = new ZipWriter(new Uint8ArrayWriter());
    await writer.add('../escape.dcm', new TextReader('bad'));
    await writer.add('safe.dcm', new TextReader('ok'));
    const bytes = await writer.close();

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slice-test-'));
    const zipPath = path.join(dir, 'trav.zip');
    await fs.writeFile(zipPath, bytes);

    const result = await extractZipArchive(zipPath);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].endsWith('safe.dcm')).toBe(true);
    expect(result.files[0].includes(`${path.sep}..${path.sep}`)).toBe(false);

    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(result.extractDir, { recursive: true, force: true });
  });

  it('extracts zip containing a real minimal DICOM', async () => {
    const dicom = buildMinimalDicom({ rows: 4, columns: 4, instanceNumber: 1 });
    const writer = new ZipWriter(new Uint8ArrayWriter());
    await writer.add('CT0001.dcm', new Uint8ArrayReader(new Uint8Array(dicom)));
    const bytes = await writer.close();

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slice-test-'));
    const zipPath = path.join(dir, 'dicom.zip');
    await fs.writeFile(zipPath, bytes);

    const result = await extractZipArchive(zipPath);
    expect(result.files).toHaveLength(1);
    const buf = await fs.readFile(result.files[0]);
    expect(buf.subarray(128, 132).toString('ascii')).toBe('DICM');

    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(result.extractDir, { recursive: true, force: true });
  });

  it('requires password for AES-encrypted zip', async () => {
    const writer = new ZipWriter(new Uint8ArrayWriter());
    await writer.add('secret.dcm', new TextReader('DICMsecret'), {
      password: 's3cret',
      encryptionStrength: 3,
    });
    const bytes = await writer.close();

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slice-test-'));
    const zipPath = path.join(dir, 'enc.zip');
    await fs.writeFile(zipPath, bytes);

    expect(await zipNeedsPassword(zipPath)).toBe(true);

    await expect(extractZipArchive(zipPath)).rejects.toMatchObject({ code: 'NEEDS_PASSWORD' });

    const unlocked = await extractZipArchive(zipPath, 's3cret');
    expect(unlocked.files).toHaveLength(1);
    expect(await fs.readFile(unlocked.files[0], 'utf8')).toBe('DICMsecret');

    await expect(extractZipArchive(zipPath, 'wrong')).rejects.toMatchObject({
      code: 'INVALID_PASSWORD',
    });

    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(unlocked.extractDir, { recursive: true, force: true });
  });

  it('requires password for ZipCrypto-encrypted zip', async () => {
    const writer = new ZipWriter(new Uint8ArrayWriter());
    await writer.add('legacy.dcm', new TextReader('legacy-data'), {
      password: 'zipcrypto',
    });
    const bytes = await writer.close();

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slice-test-'));
    const zipPath = path.join(dir, 'zipcrypto.zip');
    await fs.writeFile(zipPath, bytes);

    expect(await zipNeedsPassword(zipPath)).toBe(true);
    const unlocked = await extractZipArchive(zipPath, 'zipcrypto');
    expect(unlocked.files).toHaveLength(1);

    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(unlocked.extractDir, { recursive: true, force: true });
  });
});

describe('media helpers', () => {
  it('detects DICOMDIR and common media folders', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slice-media-'));
    expect(await hasDicomContent(dir)).toBe(false);

    await fs.writeFile(path.join(dir, 'DICOMDIR'), 'x');
    expect(await hasDicomContent(dir)).toBe(true);
    await fs.rm(path.join(dir, 'DICOMDIR'));

    await fs.mkdir(path.join(dir, 'DICOM'));
    expect(await hasDicomContent(dir)).toBe(true);
    await fs.rm(path.join(dir, 'DICOM'), { recursive: true });

    await fs.writeFile(path.join(dir, 'scan.dcm'), 'x');
    expect(await hasDicomContent(dir)).toBe(true);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('classifies diskutil optical / removable info', () => {
    expect(
      classifyFromDiskutil('Optical Media Type: DVD-ROM\nProtocol: Optical'),
    ).toEqual({ optical: true, removable: false });

    expect(
      classifyFromDiskutil('Removable Media: Removable\nEjectable: Yes'),
    ).toEqual({ optical: false, removable: true });

    expect(classifyFromDiskutil('Protocol: SATA\nSolid State: Yes')).toEqual({
      optical: false,
      removable: false,
    });
  });

  it('parses Windows logical-disk JSON without WMI', async () => {
    const list = await parseWindowsLogicalDiskJson(
      JSON.stringify([
        { DeviceID: 'D:', VolumeName: 'DICOM_CD', DriveType: 5 },
        { DeviceID: 'E:', VolumeName: 'USB', DriveType: 2 },
      ]),
    );
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      path: 'D:\\',
      name: 'DICOM_CD',
      kind: 'optical',
      platform: 'win32',
      hasDicom: expect.any(Boolean),
    });
    expect(list[1]).toMatchObject({
      path: 'E:\\',
      kind: 'removable',
      platform: 'win32',
    });
    expect(await parseWindowsLogicalDiskJson('not-json')).toEqual([]);
    expect(await parseWindowsLogicalDiskJson('')).toEqual([]);
  });

  it(
    'listMediaSources returns an array without throwing',
    async () => {
      const list = await listMediaSources();
      expect(Array.isArray(list)).toBe(true);
      for (const item of list) {
        expect(item).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          path: expect.any(String),
          kind: expect.any(String),
          hasDicom: expect.any(Boolean),
          platform: expect.any(String),
        });
      }
    },
    12_000,
  );
});
