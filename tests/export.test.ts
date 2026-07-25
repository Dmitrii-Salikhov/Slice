import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import dicomParser from 'dicom-parser';
import {
  encodeSliceJpeg,
  sliceToRgba,
  suggestImageFileName,
} from '../src/export/imageExport';
import {
  anonymizeDicomBuffer,
  suggestDicomFileName,
} from '../src/export/anonymize';
import { buildMinimalDicom } from './writeMinimalDicom';

describe('image export', () => {
  it('packs W/L grayscale into RGBA', () => {
    const pixels = Float32Array.from([-1000, 40, 3000]);
    const rgba = sliceToRgba(pixels, { windowCenter: 40, windowWidth: 400 });
    expect(rgba.length).toBe(12);
    expect(rgba[0]).toBe(0);
    expect(rgba[3]).toBe(255);
    expect(rgba[4]).toBeGreaterThan(0);
    expect(rgba[8]).toBe(255);
  });

  it('encodes JPEG bytes for a tiny slice', () => {
    const rows = 8;
    const columns = 8;
    const pixels = new Float32Array(rows * columns);
    for (let i = 0; i < pixels.length; i++) pixels[i] = i;
    const jpeg = encodeSliceJpeg(
      { pixels, rows, columns },
      { windowCenter: 32, windowWidth: 64 },
      { quality: 85 },
    );
    expect(jpeg.length).toBeGreaterThan(50);
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8); // SOI
  });

  it('uses colorRgba when present instead of W/L grayscale', () => {
    const rows = 2;
    const columns = 2;
    const pixels = new Float32Array(4);
    const colorRgba = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
    ]);
    const jpeg = encodeSliceJpeg(
      { pixels, rows, columns, colorRgba },
      { windowCenter: 0, windowWidth: 1 },
    );
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
  });

  it('suggests safe image file names', () => {
    expect(
      suggestImageFileName(
        { patientId: 'P 1', seriesDescription: 'Axial/CT', instanceNumber: 3 },
        'png',
      ),
    ).toMatch(/\.png$/);
  });
});

describe('dicom anonymize', () => {
  it('replaces PHI and keeps image geometry', async () => {
    const sample = path.join(process.cwd(), 'sample-dicom', 'IMG0001.dcm');
    const buf = fs.existsSync(sample)
      ? fs.readFileSync(sample)
      : buildMinimalDicom({ rows: 8, columns: 8, instanceNumber: 1 });

    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const anon = await anonymizeDicomBuffer(ab, {
      patientName: 'Anonymous',
      patientId: 'ANON',
    });

    const ds = dicomParser.parseDicom(new Uint8Array(anon));
    expect(ds.string('x00100010')).toContain('Anonymous');
    expect(ds.string('x00100020')).toBe('ANON');
    expect(ds.string('x00100030')).toBeUndefined(); // birth date cleared
    expect(ds.uint16('x00280010')).toBeGreaterThan(0);
    expect(ds.uint16('x00280011')).toBeGreaterThan(0);
  });

  it('suggests dicom file names', () => {
    expect(suggestDicomFileName({ patientId: 'ANON', instanceNumber: 2 })).toMatch(
      /^ANON_0002.*\.dcm$/,
    );
  });
});
