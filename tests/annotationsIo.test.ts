import { describe, expect, it } from 'vitest';
import {
  parseAnnotationsFile,
  serializeAnnotations,
} from '../src/viewer/annotationsIo';
import type { Annotation } from '../src/dicom/types';

describe('annotationsIo', () => {
  const annotations: Annotation[] = [
    {
      kind: 'length',
      id: 'a1',
      sliceIndex: 0,
      x0: 0,
      y0: 0,
      x1: 10,
      y1: 0,
      mm: 5,
    },
    {
      kind: 'angle',
      id: 'a2',
      sliceIndex: 1,
      x0: 0,
      y0: 0,
      x1: 5,
      y1: 5,
      x2: 10,
      y2: 0,
      deg: 90,
    },
  ];

  it('round-trips serialize and parse', () => {
    const json = serializeAnnotations('1.2.3', annotations);
    const parsed = parseAnnotationsFile(json);
    expect(parsed.version).toBe(1);
    expect(parsed.seriesInstanceUID).toBe('1.2.3');
    expect(parsed.annotations).toHaveLength(2);
    expect(parsed.annotations[0]).toMatchObject({ kind: 'length', mm: 5 });
    expect(parsed.annotations[1]).toMatchObject({ kind: 'angle', deg: 90 });
  });

  it('rejects invalid payloads', () => {
    expect(() => parseAnnotationsFile('{}')).toThrow(/Invalid annotations/);
    expect(() =>
      parseAnnotationsFile(JSON.stringify({ version: 1, annotations: [] })),
    ).toThrow(/seriesInstanceUID/);
    expect(() =>
      parseAnnotationsFile(
        JSON.stringify({ version: 2, seriesInstanceUID: 'x', annotations: [] }),
      ),
    ).toThrow(/Invalid annotations/);
  });
});
