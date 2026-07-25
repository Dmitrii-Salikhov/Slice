import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {
  collectCatalogFilePaths,
  countCatalogInstances,
  joinMediaPath,
  recordTypeLevel,
  splitFileId,
} from '../src/dicom/dicomdirTypes';
import { parseDicomdir } from '../src/dicom/dicomdir';
import { buildMinimalDicomdir, writeMinimalDicomdirTree } from './writeMinimalDicomdir';

describe('dicomdir path helpers', () => {
  it('splits and joins File IDs', () => {
    expect(splitFileId('DICOM\\PATIENT\\IMG001')).toEqual(['DICOM', 'PATIENT', 'IMG001']);
    expect(splitFileId('DICOM/IMG001')).toEqual(['DICOM', 'IMG001']);
    expect(joinMediaPath('/Volumes/CD', ['DICOM', 'IMG001'])).toBe('/Volumes/CD/DICOM/IMG001');
    expect(joinMediaPath('D:\\CD', ['DICOM', 'IMG001'])).toBe('D:\\CD\\DICOM\\IMG001');
  });

  it('maps record type levels', () => {
    expect(recordTypeLevel('PATIENT')).toBe(1);
    expect(recordTypeLevel('STUDY')).toBe(2);
    expect(recordTypeLevel('SERIES')).toBe(3);
    expect(recordTypeLevel('IMAGE')).toBe(4);
    expect(recordTypeLevel('SR DOCUMENT')).toBe(4);
  });
});

describe('parseDicomdir', () => {
  it('parses hierarchy and resolves file paths', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slice-dicomdir-'));
    const { dicomdirPath, files } = writeMinimalDicomdirTree(dir, ['IMG0001', 'IMG0002']);
    const buffer = await fs.readFile(dicomdirPath);

    const catalog = await parseDicomdir(buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ), dicomdirPath, dir);

    expect(catalog.fileSetId).toBe('SLICE');
    expect(catalog.patients).toHaveLength(1);
    expect(catalog.patients[0].patientId).toBe('P1');
    expect(catalog.patients[0].patientName).toContain('Test');
    expect(catalog.patients[0].studies).toHaveLength(1);
    expect(catalog.patients[0].studies[0].series).toHaveLength(1);
    expect(catalog.patients[0].studies[0].series[0].modality).toBe('CT');
    expect(countCatalogInstances(catalog)).toBe(2);

    const all = collectCatalogFilePaths(catalog);
    expect(all.sort()).toEqual(files.sort());

    const seriesOnly = collectCatalogFilePaths(catalog, {
      seriesInstanceUID: catalog.patients[0].studies[0].series[0].seriesInstanceUID,
    });
    expect(seriesOnly).toHaveLength(2);

    const missing = collectCatalogFilePaths(catalog, { seriesInstanceUID: 'nope' });
    expect(missing).toHaveLength(0);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('throws when Directory Record Sequence is missing', async () => {
    // Not a DICOMDIR — minimal image DICOM has no 0004,1220
    const { buildMinimalDicom } = await import('./writeMinimalDicom');
    const img = buildMinimalDicom({ rows: 4, columns: 4 });
    await expect(
      parseDicomdir(img.buffer.slice(img.byteOffset, img.byteOffset + img.byteLength), '/x', '/x'),
    ).rejects.toThrow(/Directory Record Sequence/i);
  });

  it('buildMinimalDicomdir produces DICM magic', () => {
    const buf = buildMinimalDicomdir();
    expect(buf.subarray(128, 132).toString('ascii')).toBe('DICM');
  });
});
