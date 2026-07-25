import { describe, expect, it } from 'vitest';
import dicomParser from 'dicom-parser';
import { buildMinimalDicom } from './writeMinimalDicom';

describe('writeMinimalDicom', () => {
  it('produces a buffer dicom-parser accepts', () => {
    const buf = buildMinimalDicom({ rows: 4, columns: 4, instanceNumber: 1, z: -1.25 });
    const ds = dicomParser.parseDicom(new Uint8Array(buf));
    expect(ds.string('x00020010')).toBe('1.2.840.10008.1.2');
    expect(ds.uint16('x00280010')).toBe(4);
    expect(ds.uint16('x00280011')).toBe(4);
    expect(ds.string('x00080060')).toBe('CT');
    expect(ds.elements.x7fe00010.length).toBe(4 * 4 * 2);
  });
});
