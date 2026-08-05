import { describe, expect, it } from 'vitest';
import {
  buildVolume,
  estimateSliceSpacingMm,
  extractMprSlice,
  maxIndex,
  sampleVolume,
  defaultWl,
  resolveMprBasis,
  planeIndexFromCursor,
  cursorFromPlaneIndex,
  crosshairInMprPlane,
  cursorFromMprPlaneClick,
  clearMprSliceCache,
} from '../src/viewer/mpr';
import { makeInstance, makeVolume } from './helpers';
import type { DicomSeries } from '../src/dicom/types';
import { physicalSize } from '../src/viewer/math';

describe('mpr', () => {
  it('buildVolume stacks instances and derives spacing', () => {
    const instances = [0, 1, 2].map((z) =>
      makeInstance({
        rows: 2,
        columns: 2,
        fill: z,
        imagePositionPatient: [0, 0, z * 2],
        sliceThickness: 0,
        pixelSpacing: { row: 0.5, col: 0.5 },
        sopInstanceUID: `s${z}`,
      }),
    );
    const series: DicomSeries = {
      seriesInstanceUID: 'se',
      studyInstanceUID: 'st',
      seriesDescription: 'CT',
      modality: 'CT',
      patientName: 'P',
      patientId: '1',
      studyDescription: 'S',
      instances,
    };
    const vol = buildVolume(series);
    expect(vol.dims).toEqual([2, 2, 3]);
    expect(vol.spacing[0]).toBe(0.5);
    expect(vol.spacing[2]).toBeCloseTo(2);
    expect(sampleVolume(vol, 0, 0, 2)).toBe(2);
  });

  it('buildVolume prefers IPP spacing over Slice Thickness', () => {
    const instances = [0, 1, 2, 3].map((z) =>
      makeInstance({
        rows: 2,
        columns: 2,
        fill: z,
        imagePositionPatient: [0, 0, z * 1],
        sliceThickness: 2,
        spacingBetweenSlices: 1.5,
        pixelSpacing: { row: 0.5, col: 0.5 },
        sopInstanceUID: `s${z}`,
      }),
    );
    const series: DicomSeries = {
      seriesInstanceUID: 'se',
      studyInstanceUID: 'st',
      seriesDescription: 'CT',
      modality: 'CT',
      patientName: 'P',
      patientId: '1',
      studyDescription: 'S',
      instances,
    };
    expect(estimateSliceSpacingMm(instances, 0.5)).toBeCloseTo(1);
    const vol = buildVolume(series);
    expect(vol.spacing[0]).toBe(0.5);
    expect(vol.spacing[1]).toBe(0.5);
    expect(vol.spacing[2]).toBeCloseTo(1);

    const coronal = extractMprSlice(vol, 'coronal', 0, 'stack');
    const { w, h } = physicalSize(
      coronal.width,
      coronal.height,
      coronal.spacing.col,
      coronal.spacing.row,
    );
    // Display height uses IPP step (1), not Slice Thickness (2).
    expect(coronal.spacing.row).toBeCloseTo(1);
    expect(h).toBeCloseTo(vol.dims[2] * 1);
    expect(h).not.toBeCloseTo(vol.dims[2] * 2);
    expect(w).toBeCloseTo(vol.dims[0] * 0.5);
  });

  it('estimateSliceSpacingMm falls back to SpacingBetweenSlices then thickness', () => {
    const noIpp = [0, 1].map((z) =>
      makeInstance({
        rows: 2,
        columns: 2,
        fill: z,
        imagePositionPatient: null,
        sliceThickness: 3,
        spacingBetweenSlices: 1.25,
        sopInstanceUID: `n${z}`,
      }),
    );
    expect(estimateSliceSpacingMm(noIpp, 0.5)).toBeCloseTo(1.25);

    const thicknessOnly = [0, 1].map((z) =>
      makeInstance({
        rows: 2,
        columns: 2,
        fill: z,
        imagePositionPatient: null,
        sliceThickness: 2.5,
        sopInstanceUID: `t${z}`,
      }),
    );
    expect(estimateSliceSpacingMm(thicknessOnly, 0.5)).toBeCloseTo(2.5);
    expect(estimateSliceSpacingMm([], 0.7)).toBeCloseTo(0.7);
  });

  it('rejects empty and inhomogeneous series', () => {
    expect(() =>
      buildVolume({
        seriesInstanceUID: 'se',
        studyInstanceUID: 'st',
        seriesDescription: '',
        modality: 'CT',
        patientName: '',
        patientId: '',
        studyDescription: '',
        instances: [],
      }),
    ).toThrow(/Empty/);

    expect(() =>
      buildVolume({
        seriesInstanceUID: 'se',
        studyInstanceUID: 'st',
        seriesDescription: '',
        modality: 'CT',
        patientName: '',
        patientId: '',
        studyDescription: '',
        instances: [
          makeInstance({ rows: 2, columns: 2 }),
          makeInstance({ rows: 3, columns: 2, sopInstanceUID: 'b' }),
        ],
      }),
    ).toThrow(/Inhomogeneous/);
  });

  it('extracts axial/coronal/sagittal planes', () => {
    const vol = makeVolume([3, 3, 3]);
    const axial = extractMprSlice(vol, 'axial', 1, 'stack');
    expect(axial.width).toBe(3);
    expect(axial.height).toBe(3);
    expect(axial.pixels[0]).toBe(sampleVolume(vol, 0, 0, 1));
    expect(axial.spacing).toEqual({ col: 1, row: 1 });

    const coronal = extractMprSlice(vol, 'coronal', 1, 'stack');
    expect(coronal.width).toBe(3);
    expect(coronal.height).toBe(3);
    // helpers makeVolume uses spacing [1,1,2]
    expect(coronal.spacing).toEqual({ col: 1, row: 2 });

    const sagittal = extractMprSlice(vol, 'sagittal', 1, 'stack');
    expect(sagittal.width).toBe(3);
    expect(sagittal.height).toBe(3);
    expect(sagittal.spacing).toEqual({ col: 1, row: 2 });
  });

  it('patient axial follows IOP in-plane orientation (no LPS twist)', () => {
    // Volume axes rotated 45° in XY — stack axial is upright in that frame.
    const vol = makeVolume([8, 8, 4], (x, y, z) => (x === 0 ? 1000 : z));
    vol.geometry = {
      origin: [0, 0, 0],
      axisX: [Math.SQRT1_2, Math.SQRT1_2, 0],
      axisY: [-Math.SQRT1_2, Math.SQRT1_2, 0],
      axisZ: [0, 0, 1],
      spacing: [1, 1, 2],
    };
    const patient = extractMprSlice(vol, 'axial', 1, 'patient');
    const stack = extractMprSlice(vol, 'axial', 1, 'stack');
    // Bright column (x=0) should stay on the left in both views — not mirrored.
    expect(patient.pixels[0]).toBeGreaterThan(patient.pixels[patient.width - 1]);
    expect(stack.pixels[0]).toBeGreaterThan(stack.pixels[stack.width - 1]);
    // Top-left bright, bottom-left also bright (vertical column), top-right dark.
    expect(patient.pixels[0]).toBeGreaterThan(500);
    expect(patient.pixels[(patient.height - 1) * patient.width]).toBeGreaterThan(500);
    expect(patient.pixels[patient.width - 1]).toBeLessThan(500);
  });

  it('buildVolumeGeometry maps DICOM row→X and column→Y', async () => {
    const { buildVolumeGeometry } = await import('../src/viewer/volumeGeometry');
    const instances = [0, 1].map((z) =>
      makeInstance({
        rows: 2,
        columns: 2,
        fill: z,
        imagePositionPatient: [0, 0, z],
        imageOrientationPatient: {
          rowCosines: [1, 0, 0],
          colCosines: [0, 1, 0],
        },
        sopInstanceUID: `s${z}`,
      }),
    );
    const g = buildVolumeGeometry(instances, [1, 1, 1]);
    expect(g).not.toBeNull();
    expect(g!.axisX[0]).toBeCloseTo(1);
    expect(g!.axisX[1]).toBeCloseTo(0);
    expect(g!.axisY[0]).toBeCloseTo(0);
    expect(g!.axisY[1]).toBeCloseTo(1);
    expect(g!.axisZ[2]).toBeCloseTo(1);
  });

  it('patient-basis coronal keeps superior at top and uses LPS', () => {
    const vol = makeVolume([4, 4, 4], (x, y, z) => z * 100 + y * 10 + x);
    const coronal = extractMprSlice(vol, 'coronal', 1, 'patient');
    expect(coronal.width).toBeGreaterThan(0);
    expect(coronal.height).toBeGreaterThan(0);
    const top = coronal.pixels[Math.floor(coronal.width / 2)];
    const bottom =
      coronal.pixels[(coronal.height - 1) * coronal.width + Math.floor(coronal.width / 2)];
    expect(top).toBeGreaterThan(bottom);
  });

  it('patient-basis sagittal stands upright (superior at top)', () => {
    const vol = makeVolume([4, 4, 8], (x, y, z) => z * 100 + y * 10 + x);
    const sagittal = extractMprSlice(vol, 'sagittal', 1, 'patient');
    // Portrait-ish: height tracks SI (z), width tracks AP (y)
    expect(sagittal.height).toBeGreaterThan(sagittal.width * 0.8);
    const midU = Math.floor(sagittal.width / 2);
    const top = sagittal.pixels[midU];
    const bottom = sagittal.pixels[(sagittal.height - 1) * sagittal.width + midU];
    expect(top).toBeGreaterThan(bottom);
  });

  it('falls back to stack when geometry is missing', () => {
    const vol = makeVolume([3, 3, 3]);
    vol.geometry = null;
    const coronal = extractMprSlice(vol, 'coronal', 1, 'patient');
    expect(coronal.width).toBe(3);
    expect(coronal.height).toBe(3);
  });

  it('maxIndex and defaultWl', () => {
    const vol = makeVolume([5, 6, 7]);
    expect(maxIndex(vol, 'axial', 'stack')).toBe(6);
    expect(maxIndex(vol, 'coronal', 'stack')).toBe(5);
    expect(maxIndex(vol, 'sagittal', 'stack')).toBe(4);
    expect(defaultWl(vol)).toEqual(vol.windowLevel);
  });

  it('buildVolume packs Int16 planes into Int16 volume', () => {
    const instances = [0, 1].map((z) =>
      makeInstance({
        rows: 2,
        columns: 2,
        pixels: undefined,
        pixelsInt16: Int16Array.from([z, z, z, z]),
        imagePositionPatient: [0, 0, z],
        sopInstanceUID: `s${z}`,
      }),
    );
    const series: DicomSeries = {
      seriesInstanceUID: 'se',
      studyInstanceUID: 'st',
      seriesDescription: 'CT',
      modality: 'CT',
      patientName: 'P',
      patientId: '1',
      studyDescription: 'S',
      instances,
    };
    const vol = buildVolume(series);
    expect(vol.data).toBeInstanceOf(Int16Array);
    expect(sampleVolume(vol, 0, 0, 1)).toBe(1);
  });

  it('resolveMprBasis falls back to stack without geometry', () => {
    const vol = makeVolume([4, 4, 4]);
    expect(resolveMprBasis(vol, 'patient')).toBe('patient');
    expect(resolveMprBasis(vol, 'stack')).toBe('stack');
    vol.geometry = null;
    expect(resolveMprBasis(vol, 'patient')).toBe('stack');
  });

  it('patient coronal/sagittal spacing uses mm (anisotropic Z)', () => {
    const vol = makeVolume([8, 8, 8]); // spacing [1,1,2]
    const coronal = extractMprSlice(vol, 'coronal', 3, 'patient');
    const sagittal = extractMprSlice(vol, 'sagittal', 3, 'patient');
    expect(coronal.spacing.row).toBeGreaterThan(coronal.spacing.col * 1.5);
    expect(sagittal.spacing.row).toBeGreaterThan(sagittal.spacing.col * 1.5);
  });

  it('patient planeIndex ↔ cursor round-trips for all planes', () => {
    const vol = makeVolume([8, 8, 8]);
    const cursor = { x: 2, y: 3, z: 4 };
    for (const plane of ['axial', 'coronal', 'sagittal'] as const) {
      const idx = planeIndexFromCursor(vol, plane, cursor, 'patient');
      const next = cursorFromPlaneIndex(vol, plane, idx, cursor, 'patient');
      const back = planeIndexFromCursor(vol, plane, next, 'patient');
      expect(back).toBe(idx);
    }
  });

  it('patient cursorFromPlaneIndex round-trips for every scroll index', () => {
    const vol = makeVolume([8, 8, 12]);
    const cursor = { x: 3.5, y: 3.5, z: 5.5 };
    for (const plane of ['axial', 'coronal', 'sagittal'] as const) {
      const max = maxIndex(vol, plane, 'patient');
      for (let i = 0; i <= max; i++) {
        const next = cursorFromPlaneIndex(vol, plane, i, cursor, 'patient');
        expect(planeIndexFromCursor(vol, plane, next, 'patient')).toBe(i);
      }
    }
  });

  it('caps patient MPR raster size to limit memory', () => {
    const vol = makeVolume([16, 16, 16]);
    vol.spacing = [0.05, 0.05, 0.05];
    const axial = extractMprSlice(vol, 'axial', 8, 'patient');
    expect(Math.max(axial.width, axial.height)).toBeLessThanOrEqual(640);
    const coronal = extractMprSlice(vol, 'coronal', 8, 'patient');
    expect(Math.max(coronal.width, coronal.height)).toBeLessThanOrEqual(640);
    const fast = extractMprSlice(vol, 'axial', 8, 'patient', { quality: 'interactive' });
    expect(Math.max(fast.width, fast.height)).toBeLessThanOrEqual(256);
  });

  it('clears MPR slice cache and drops interactive twin after full extract', () => {
    const vol = makeVolume([16, 16, 16]);
    vol.spacing = [0.05, 0.05, 0.05];
    const interactive = extractMprSlice(vol, 'axial', 4, 'patient', { quality: 'interactive' });
    expect(interactive.index).toBe(4);
    const full = extractMprSlice(vol, 'axial', 5, 'patient', { quality: 'full' });
    expect(full.index).toBe(5);
    // Cache hit for same full index
    expect(extractMprSlice(vol, 'axial', 5, 'patient', { quality: 'full' })).toBe(full);
    clearMprSliceCache(vol);
    expect(extractMprSlice(vol, 'axial', 5, 'patient', { quality: 'full' })).not.toBe(full);
  });

  it('patient crosshair ↔ click round-trips on axial', () => {
    const vol = makeVolume([8, 8, 8]);
    const cursor = { x: 2.5, y: 3.5, z: 4 };
    const slice = extractMprSlice(vol, 'axial', planeIndexFromCursor(vol, 'axial', cursor, 'patient'), 'patient');
    const ch = crosshairInMprPlane(vol, 'axial', cursor, 'patient', slice);
    const clicked = cursorFromMprPlaneClick(vol, 'axial', ch.u, ch.v, cursor, 'patient', slice);
    expect(clicked.x).toBeCloseTo(cursor.x, 0);
    expect(clicked.y).toBeCloseTo(cursor.y, 0);
  });

  it('stack crosshair helpers match voxel indices', () => {
    const vol = makeVolume([8, 8, 8]);
    const cursor = { x: 2, y: 3, z: 4 };
    const axial = extractMprSlice(vol, 'axial', 4, 'stack');
    expect(crosshairInMprPlane(vol, 'axial', cursor, 'stack', axial)).toEqual({ u: 2, v: 3 });
    const fromClick = cursorFromMprPlaneClick(vol, 'axial', 5, 6, cursor, 'stack', axial);
    expect(fromClick).toEqual({ x: 5, y: 6, z: 4 });
  });

  it('patient maxIndex is positive for all planes', () => {
    const vol = makeVolume([8, 8, 12]);
    expect(maxIndex(vol, 'axial', 'patient')).toBeGreaterThan(0);
    expect(maxIndex(vol, 'coronal', 'patient')).toBeGreaterThan(0);
    expect(maxIndex(vol, 'sagittal', 'patient')).toBeGreaterThan(0);
  });

  it('buildVolume attaches patient geometry from IOP/IPP', () => {
    const instances = [0, 1, 2].map((z) =>
      makeInstance({
        rows: 4,
        columns: 4,
        fill: z,
        imagePositionPatient: [0, 0, z * 2],
        imageOrientationPatient: {
          rowCosines: [1, 0, 0],
          colCosines: [0, 1, 0],
        },
        pixelSpacing: { row: 0.5, col: 0.5 },
        sopInstanceUID: `s${z}`,
      }),
    );
    const series: DicomSeries = {
      seriesInstanceUID: 'se',
      studyInstanceUID: 'st',
      seriesDescription: 'CT',
      modality: 'CT',
      patientName: 'P',
      patientId: '1',
      studyDescription: 'S',
      instances,
    };
    const vol = buildVolume(series);
    expect(vol.geometry).not.toBeNull();
    expect(vol.geometry!.axisX).toEqual([1, 0, 0]);
    expect(vol.geometry!.axisY).toEqual([0, 1, 0]);
    expect(resolveMprBasis(vol, 'patient')).toBe('patient');
  });
});
