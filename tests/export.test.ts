import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import dicomParser from 'dicom-parser';
import {
  encodeRenderedSlice,
  encodeSliceJpeg,
  sliceToRgba,
  suggestImageFileName,
} from '../src/export/imageExport';
import {
  anonymizeDicomBuffer,
  suggestDicomFileName,
} from '../src/export/anonymize';
import { buildMinimalDicom } from './writeMinimalDicom';
import type { Annotation } from '../src/dicom/types';

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

  it('encodes JPEG from Int16 pixels (common after MPR cache clear)', () => {
    const rows = 16;
    const columns = 16;
    const pixelsInt16 = Int16Array.from({ length: rows * columns }, (_, i) => i);
    const jpeg = encodeSliceJpeg(
      { pixelsInt16, rows, columns },
      { windowCenter: 100, windowWidth: 200 },
    );
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
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

  it('encodeRenderedSlice PNG/JPEG includes MPR annotations for matching plane', async () => {
    const probe = document.createElement('canvas').getContext('2d');
    if (!probe) {
      // jsdom without node-canvas cannot paint — Electron renderer has 2d context.
      return;
    }
    const w = 32;
    const h = 24;
    const pixels = new Float32Array(w * h);
    pixels.fill(40);
    const measures: Annotation[] = [
      {
        kind: 'arrow',
        id: 'a1',
        sliceIndex: 3,
        mprPlane: 'coronal',
        x0: 4,
        y0: 4,
        x1: 20,
        y1: 16,
      },
    ];
    const png = await encodeRenderedSlice({
      width: w,
      height: h,
      windowLevel: { windowCenter: 40, windowWidth: 400 },
      pixels,
      measures,
      sliceIndex: 3,
      mprPlane: 'coronal',
      format: 'png',
    });
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);

    const jpeg = await encodeRenderedSlice({
      width: w,
      height: h,
      windowLevel: { windowCenter: 40, windowWidth: 400 },
      pixels,
      measures,
      sliceIndex: 3,
      mprPlane: 'coronal',
      format: 'jpeg',
    });
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
  });

  it('encodeRenderedSlice JPEG falls back without canvas when no overlays', async () => {
    const w = 8;
    const h = 8;
    const pixels = Int16Array.from({ length: w * h }, (_, i) => i * 10);
    const jpeg = await encodeRenderedSlice({
      width: w,
      height: h,
      windowLevel: { windowCenter: 40, windowWidth: 400 },
      pixels,
      format: 'jpeg',
    });
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
  });

  it('suggests safe image file names including MPR plane', () => {
    expect(
      suggestImageFileName(
        { patientId: 'P 1', seriesDescription: 'Axial/CT', instanceNumber: 3 },
        'png',
      ),
    ).toMatch(/\.png$/);
    expect(
      suggestImageFileName(
        {
          patientId: 'P1',
          seriesDescription: 'Bone',
          instanceNumber: 12,
          plane: 'coronal',
        },
        'jpeg',
      ),
    ).toMatch(/coronal.*\.jpg$/);
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
    expect(ds.string('x00100030')).toBeUndefined();
    expect(ds.uint16('x00280010')).toBeGreaterThan(0);
    expect(ds.uint16('x00280011')).toBeGreaterThan(0);
  });

  it('suggests dicom file names', () => {
    expect(suggestDicomFileName({ patientId: 'ANON', instanceNumber: 2 })).toMatch(
      /^ANON_0002.*\.dcm$/,
    );
  });
});
