import { describe, expect, it } from 'vitest';
import { makeVolume } from './helpers';
import {
  extractPlanesSync,
  packVolumePayload,
  unpackOblique,
  unpackSlice,
} from '../src/viewer/mprExtractClient';
import { extractObliqueSlice, defaultOblique } from '../src/viewer/crosshair';
import type { MprSlicePayload, ObliqueSlicePayload } from '../src/viewer/mpr.worker';

describe('mprExtractClient helpers', () => {
  it('packVolumePayload copies buffers (main keeps original)', () => {
    const vol = makeVolume([4, 4, 4]);
    const before = vol.data[0];
    const packed = packVolumePayload(vol);
    expect(packed.payload.dataKind).toBe(vol.data instanceof Int16Array ? 'int16' : 'float32');
    expect(packed.payload.dims).toEqual([4, 4, 4]);
    expect(packed.transfer).toHaveLength(1);
    // Mutating the packed buffer must not affect the source volume.
    new Uint8Array(packed.payload.data).fill(0);
    expect(vol.data[0]).toBe(before);
  });

  it('extractPlanesSync returns three planes', () => {
    const vol = makeVolume([8, 8, 8]);
    const slices = extractPlanesSync(vol, 'stack', 'full', {
      axial: 3,
      coronal: 2,
      sagittal: 1,
    });
    expect(slices.axial.index).toBe(3);
    expect(slices.coronal.index).toBe(2);
    expect(slices.sagittal.index).toBe(1);
    expect(slices.axial.pixels.length).toBeGreaterThan(0);
  });

  it('unpackSlice round-trips payload', () => {
    const vol = makeVolume([4, 4, 4]);
    const sync = extractPlanesSync(vol, 'stack', 'interactive', {
      axial: 1,
      coronal: 1,
      sagittal: 1,
    });
    const src = sync.axial;
    const copy =
      src.pixels instanceof Int16Array ? new Int16Array(src.pixels) : new Float32Array(src.pixels);
    const payload: MprSlicePayload = {
      plane: src.plane,
      index: src.index,
      width: src.width,
      height: src.height,
      spacing: src.spacing,
      dataKind: src.pixels instanceof Int16Array ? 'int16' : 'float32',
      pixels: copy.buffer.slice(
        copy.byteOffset,
        copy.byteOffset + copy.byteLength,
      ) as ArrayBuffer,
    };
    const back = unpackSlice(payload);
    expect(back.width).toBe(src.width);
    expect(back.height).toBe(src.height);
    expect(back.index).toBe(src.index);
    expect([...back.pixels]).toEqual([...src.pixels]);
  });

  it('unpackOblique round-trips payload', () => {
    const vol = makeVolume([8, 8, 8]);
    const obl = extractObliqueSlice(vol, { ...defaultOblique(vol), width: 16, height: 16 });
    const copy = new Float32Array(obl.pixels);
    const payload: ObliqueSlicePayload = {
      width: obl.width,
      height: obl.height,
      spacing: obl.spacing,
      pixels: copy.buffer.slice(
        copy.byteOffset,
        copy.byteOffset + copy.byteLength,
      ) as ArrayBuffer,
    };
    const back = unpackOblique(payload);
    expect(back.width).toBe(16);
    expect([...back.pixels]).toEqual([...obl.pixels]);
  });
});
