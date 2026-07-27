import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDicomFile, parseDicomMeta, decodeInstancePixels } from '../src/dicom/parse';
import { loadDicomFolder } from '../src/dicom/series';
import { buildVolumeProgressive, extractMprSlice } from '../src/viewer/mpr';
import { sharedPixelCache } from '../src/dicom/pixelCache';
import { TransferSyntax } from '../src/dicom/transferSyntax';
import { writeMinimalSeries } from './writeMinimalDicom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phantomDir = path.join(root, 'tests', '.fixtures', 'phantom');

describe('parse + load integration (minimal DICOM)', () => {
  let files: string[] = [];

  beforeAll(() => {
    files = writeMinimalSeries(phantomDir, 8, 16, 16);
  });

  it('parses a slice with expected tags and pixels', async () => {
    const file = files[0];
    const buf = await fs.readFile(file);
    const result = await parseDicomFile(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      file,
    );
    expect(result.kind).toBe('image');
    if (result.kind !== 'image') return;
    const inst = result.instances[0];

    expect(inst.rows).toBe(16);
    expect(inst.columns).toBe(16);
    expect(inst.modality).toBe('CT');
    const px = inst.pixelsInt16 ?? inst.pixels;
    expect(px).toBeTruthy();
    expect(px!.length).toBe(16 * 16);
    expect(inst.transferSyntax).toBe(TransferSyntax.ImplicitVRLittleEndian);
    expect(inst.patientName).toContain('Phantom');
    expect(inst.windowLevel.windowWidth).toBe(400);
    expect(Number.isFinite(px![0])).toBe(true);
  });

  it('parseDicomMeta has no pixels until decode', async () => {
    const file = files[0];
    const buf = await fs.readFile(file);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const meta = await parseDicomMeta(ab, file);
    expect(meta.kind).toBe('image');
    if (meta.kind !== 'image') return;
    const inst = meta.instances[0];
    expect(inst.pixelStatus).toBe('meta');
    expect(inst.pixels).toBeUndefined();
    expect(inst.pixelsInt16).toBeUndefined();
    await decodeInstancePixels(inst, ab);
    expect(inst.pixelStatus).toBe('ready');
    expect(inst.pixelsInt16 ?? inst.pixels).toBeTruthy();
  });

  it('loads folder into a sortable series and builds MPR volume', async () => {
    expect(files.length).toBe(8);

    const studies = await loadDicomFolder(files, async (p) => {
      const buf = await fs.readFile(p);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    });

    expect(studies).toHaveLength(1);
    expect(studies[0].series).toHaveLength(1);
    const series = studies[0].series[0];
    expect(series.instances).toHaveLength(8);
    expect(series.instances.every((i) => i.pixelStatus === 'meta')).toBe(true);

    const zs = series.instances.map((i) => i.imagePositionPatient![2]);
    for (let i = 1; i < zs.length; i++) {
      expect(zs[i]).toBeGreaterThan(zs[i - 1]);
    }

    const readFile = async (p: string) => {
      const buf = await fs.readFile(p);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    };
    const volume = await buildVolumeProgressive(series, (inst) =>
      sharedPixelCache.ensure(inst, readFile),
    );
    expect(volume.dims).toEqual([16, 16, 8]);
    expect(volume.data instanceof Int16Array || volume.data instanceof Float32Array).toBe(
      true,
    );
    const axial = extractMprSlice(volume, 'axial', 4, 'stack');
    expect(axial.pixels.length).toBe(16 * 16);
    const sag = extractMprSlice(volume, 'sagittal', 8, 'stack');
    expect(sag.width).toBe(16);
    expect(sag.height).toBe(8);
    expect(volume.geometry).toBeTruthy();
    const patientSag = extractMprSlice(volume, 'sagittal', 0, 'patient');
    expect(patientSag.width).toBeGreaterThan(0);
    expect(patientSag.height).toBeGreaterThan(0);
  });

  it('skips non-dicom noise next to valid files', async () => {
    const junk = path.join(phantomDir, 'readme.txt');
    await fs.writeFile(junk, 'not dicom');
    const studies = await loadDicomFolder([junk, files[0]], async (p) => {
      const buf = await fs.readFile(p);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    });
    expect(studies[0].series[0].instances.length).toBe(1);
    await fs.unlink(junk);
  });
});
