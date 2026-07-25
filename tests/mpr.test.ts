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
    const axial = extractMprSlice(vol, 'axial', 1);
    expect(axial.width).toBe(3);
    expect(axial.height).toBe(3);
    expect(axial.pixels[0]).toBe(sampleVolume(vol, 0, 0, 1));

    const coronal = extractMprSlice(vol, 'coronal', 1);
    expect(coronal.width).toBe(3);
    expect(coronal.height).toBe(3);

    const sagittal = extractMprSlice(vol, 'sagittal', 1);
    expect(sagittal.width).toBe(3);
    expect(sagittal.height).toBe(3);
  });

  it('maxIndex and defaultWl', () => {
    const vol = makeVolume([5, 6, 7]);
    expect(maxIndex(vol, 'axial')).toBe(6);
    expect(maxIndex(vol, 'coronal')).toBe(5);
    expect(maxIndex(vol, 'sagittal')).toBe(4);
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
