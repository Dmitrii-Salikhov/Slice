import { describe, expect, it, vi } from 'vitest';
import { groupIntoStudies, loadDicomFolder, sortSeriesInstances } from '../src/dicom/series';
import { makeInstance } from './helpers';

describe('series', () => {
  it('sorts by ImagePositionPatient along slice normal', () => {
    const a = makeInstance({
      sopInstanceUID: 'a',
      imagePositionPatient: [0, 0, 10],
      instanceNumber: 99,
    });
    const b = makeInstance({
      sopInstanceUID: 'b',
      imagePositionPatient: [0, 0, 0],
      instanceNumber: 1,
    });
    const sorted = sortSeriesInstances([a, b]);
    expect(sorted.map((s) => s.sopInstanceUID)).toEqual(['b', 'a']);
  });

  it('falls back to instanceNumber without IPP', () => {
    const a = makeInstance({
      sopInstanceUID: 'a',
      imagePositionPatient: null,
      instanceNumber: 2,
    });
    const b = makeInstance({
      sopInstanceUID: 'b',
      imagePositionPatient: null,
      instanceNumber: 1,
    });
    const sorted = sortSeriesInstances([a, b]);
    expect(sorted[0].sopInstanceUID).toBe('b');
  });

  it('groups instances into studies and series', () => {
    const instances = [
      makeInstance({
        studyInstanceUID: 'st1',
        seriesInstanceUID: 'se2',
        seriesDescription: 'B',
        sopInstanceUID: '1',
      }),
      makeInstance({
        studyInstanceUID: 'st1',
        seriesInstanceUID: 'se1',
        seriesDescription: 'A',
        sopInstanceUID: '2',
      }),
      makeInstance({
        studyInstanceUID: 'st2',
        seriesInstanceUID: 'se3',
        seriesDescription: 'C',
        sopInstanceUID: '3',
        patientName: 'Other',
      }),
    ];
    const studies = groupIntoStudies(instances);
    expect(studies).toHaveLength(2);
    const st1 = studies.find((s) => s.studyInstanceUID === 'st1')!;
    expect(st1.series).toHaveLength(2);
    expect(st1.series[0].seriesDescription).toBe('A');
  });

  it('loadDicomFolder skips bad files and reports progress', async () => {
    const progress: number[] = [];
    const studies = await loadDicomFolder(
      ['good.dcm', 'bad.dcm'],
      async (p) => {
        if (p.includes('bad')) throw new Error('nope');
        // Minimal invalid buffer → parse fails → skipped
        return new ArrayBuffer(8);
      },
      (p) => progress.push(p.loaded),
    );
    expect(studies).toEqual([]);
    expect(progress.at(-1)).toBe(2);
    expect(progress.length).toBeGreaterThan(0);
  });

  it('loadDicomFolder uses provided reader', async () => {
    const reader = vi.fn(async () => new ArrayBuffer(4));
    await loadDicomFolder(['a.dcm'], reader);
    expect(reader).toHaveBeenCalledWith('a.dcm');
  });
});
