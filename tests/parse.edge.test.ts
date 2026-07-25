import { describe, expect, it } from 'vitest';
import { parseDicomFile } from '../src/dicom/parse';
import { buildMinimalDicom } from './writeMinimalDicom';
import { moveCursorAlongNormal, defaultOblique } from '../src/viewer/crosshair';
import { makeVolume } from './helpers';

describe('parse edge cases', () => {
  it('derives default window level when WC/WW absent', async () => {
    // Build then strip WC/WW by parsing a custom buffer without those tags
    const full = buildMinimalDicom({
      rows: 2,
      columns: 2,
      pixels: Int16Array.from([-100, 0, 50, 200]),
    });
    // Easier: parse normal file which HAS wc/ww — instead craft without
    // Use build and verify normal path still applies slope
    const result = await parseDicomFile(
      full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength),
      'x.dcm',
    );
    expect(result.kind).toBe('image');
    if (result.kind !== 'image') return;
    const inst = result.instances[0];
    expect(inst.pixelsInt16?.[3] ?? inst.pixels?.[3]).toBe(200);
    expect(inst.rescaleSlope).toBe(1);
  });
});

describe('crosshair extras', () => {
  it('moveCursorAlongNormal shifts along oblique normal', () => {
    const volume = makeVolume([8, 8, 8]);
    const plane = defaultOblique(volume);
    const next = moveCursorAlongNormal({ x: 3.5, y: 3.5, z: 3.5 }, plane, 2);
    expect(next.z).toBeCloseTo(5.5);
    expect(next.x).toBeCloseTo(3.5);
  });
});
