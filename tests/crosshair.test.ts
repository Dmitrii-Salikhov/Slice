import { describe, expect, it } from 'vitest';
import {
  clampCursor,
  crosshairInPlane,
  cursorFromIndices,
  cursorFromPlaneClick,
  defaultOblique,
  extractObliqueSlice,
  indicesFromCursor,
  offsetOrigin,
  planeNormal,
  probeVolume,
  rotateOblique,
  setObliqueCenter,
} from '../src/viewer/crosshair';
import { makeVolume } from './helpers';

describe('crosshair / oblique', () => {
  const volume = makeVolume([8, 8, 8]);

  it('converts cursor ↔ indices', () => {
    const cursor = cursorFromIndices({ axial: 3, coronal: 2, sagittal: 1 });
    expect(cursor).toEqual({ x: 1, y: 2, z: 3 });
    expect(indicesFromCursor(cursor)).toEqual({ axial: 3, coronal: 2, sagittal: 1 });
  });

  it('clamps cursor to volume', () => {
    const c = clampCursor({ x: -5, y: 99, z: 3.2 }, volume);
    expect(c.x).toBe(0);
    expect(c.y).toBe(7);
    expect(c.z).toBe(3.2);
  });

  it('maps crosshair in each plane and click back', () => {
    const cursor = { x: 2, y: 3, z: 4 };
    expect(crosshairInPlane('axial', cursor, volume.dims)).toEqual({ u: 2, v: 3 });
    const fromAxial = cursorFromPlaneClick('axial', 5, 6, cursor, volume.dims);
    expect(fromAxial).toEqual({ x: 5, y: 6, z: 4 });

    const chCor = crosshairInPlane('coronal', cursor, volume.dims);
    const fromCor = cursorFromPlaneClick('coronal', chCor.u, chCor.v, cursor, volume.dims);
    expect(fromCor.x).toBeCloseTo(cursor.x);
    expect(fromCor.z).toBeCloseTo(cursor.z);

    const chSag = crosshairInPlane('sagittal', cursor, volume.dims);
    const fromSag = cursorFromPlaneClick('sagittal', chSag.u, chSag.v, cursor, volume.dims);
    expect(fromSag.y).toBeCloseTo(cursor.y);
    expect(fromSag.z).toBeCloseTo(cursor.z);
  });

  it('builds and rotates oblique plane', () => {
    const base = defaultOblique(volume);
    expect(base.origin).toEqual([3.5, 3.5, 3.5]);
    const rotated = rotateOblique(base, 90, 0);
    expect(rotated.axisU[0]).toBeCloseTo(0, 5);
    expect(Math.abs(rotated.axisU[1])).toBeCloseTo(1, 5);

    const centered = setObliqueCenter(base, { x: 1, y: 2, z: 3 });
    expect(centered.origin).toEqual([1, 2, 3]);
  });

  it('extracts oblique slice and probes volume', () => {
    const plane = defaultOblique(volume);
    const slice = extractObliqueSlice(volume, plane);
    expect(slice.width).toBe(8);
    expect(slice.height).toBe(8);
    expect(slice.pixels.length).toBe(64);
    expect(slice.spacing[0]).toBeGreaterThan(0);

    expect(probeVolume(volume, { x: 1, y: 1, z: 1 })).toBe(sampleApprox(1, 1, 1));
  });

  it('offsetOrigin moves along normal', () => {
    const plane = defaultOblique(volume);
    const n = planeNormal(plane);
    expect(n[2]).toBeCloseTo(1);
    const moved = offsetOrigin(plane, 2);
    expect(moved.origin[2]).toBeCloseTo(plane.origin[2] + 2);
  });
});

function sampleApprox(x: number, y: number, z: number) {
  return x + y * 10 + z * 100;
}
