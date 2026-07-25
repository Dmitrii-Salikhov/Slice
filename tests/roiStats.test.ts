import { describe, expect, it } from 'vitest';
import { computeRoiStats } from '../src/viewer/roiStats';
import { dumpDicomTags } from '../src/dicom/tags';
import type { DataSet } from 'dicom-parser';

describe('roiStats', () => {
  it('computes mean, sd, min/max and area for ellipse ROI', () => {
    const width = 4;
    const height = 4;
    const pixels = new Float32Array([
      1, 2, 3, 4, //
      5, 6, 7, 8, //
      9, 10, 11, 12, //
      13, 14, 15, 16,
    ]);
    const stats = computeRoiStats(pixels, width, height, 1, 1, 2, 2, 0.5, 0.5, 'ellipse');
    expect(stats.count).toBeGreaterThan(0);
    expect(stats.min).toBeLessThanOrEqual(stats.max);
    expect(stats.areaMm2).toBeCloseTo(Math.PI * 0.25 * 0.25, 5);
  });

  it('rect ROI includes full AABB', () => {
    const pixels = Float32Array.from([10, 20, 30, 40]);
    const stats = computeRoiStats(pixels, 2, 2, -5, -5, 50, 50, 1, 1, 'rect');
    expect(stats.count).toBe(4);
    expect(stats.mean).toBe(25);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(40);
  });
});

describe('dumpDicomTags', () => {
  it('formats elements into rows and hides large binary', () => {
    const dataSet = {
      string: (tag: string) => (tag === 'x00100010' ? 'Doe^John' : undefined),
      uint16: (tag: string) => (tag === 'x00280010' ? 512 : undefined),
      int16: () => undefined,
      intString: () => undefined,
      floatString: () => undefined,
      elements: {
        x00100010: { dataOffset: 0, length: 8, vr: 'PN' },
        x00280010: { dataOffset: 10, length: 2, vr: 'US' },
        x7fe00010: { dataOffset: 100, length: 99999, vr: 'OB' },
      },
    } as unknown as DataSet;

    const rows = dumpDicomTags(dataSet);
    expect(rows.some((r) => r.name === 'Patient Name' && r.value.includes('Doe'))).toBe(
      true,
    );
    expect(rows.some((r) => r.tag.includes('7FE0') && r.value.includes('binary'))).toBe(
      true,
    );
  });
});
