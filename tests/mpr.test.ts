import { describe, expect, it } from 'vitest';
import {
  buildVolume,
  extractMprSlice,
  maxIndex,
  sampleVolume,
  defaultWl,
} from '../src/viewer/mpr';
import { makeInstance, makeVolume } from './helpers';
import type { DicomSeries } from '../src/dicom/types';

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
});
