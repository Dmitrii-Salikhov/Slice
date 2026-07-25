import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SYNC_FLAGS,
  mapSliceDelta,
  mapSliceIndex,
} from '../src/viewer/seriesSync';

describe('seriesSync', () => {
  it('maps endpoints across different lengths', () => {
    expect(mapSliceIndex(0, 10, 5)).toBe(0);
    expect(mapSliceIndex(9, 10, 5)).toBe(4);
    expect(mapSliceIndex(4, 10, 5)).toBe(2);
  });

  it('handles equal lengths and single-slice series', () => {
    expect(mapSliceIndex(3, 8, 8)).toBe(3);
    expect(mapSliceIndex(5, 1, 20)).toBe(0);
    expect(mapSliceIndex(2, 10, 1)).toBe(0);
    expect(mapSliceIndex(0, 0, 5)).toBe(0);
  });

  it('clamps out-of-range source indices', () => {
    expect(mapSliceIndex(-2, 10, 5)).toBe(0);
    expect(mapSliceIndex(99, 10, 5)).toBe(4);
  });

  it('applies delta then maps onto target', () => {
    expect(mapSliceDelta(2, 1, 10, 5)).toEqual({ from: 3, to: 1 });
    expect(mapSliceDelta(0, -1, 10, 5)).toEqual({ from: 0, to: 0 });
    expect(mapSliceDelta(9, 1, 10, 5)).toEqual({ from: 9, to: 4 });
  });

  it('exposes default sync flags', () => {
    expect(DEFAULT_SYNC_FLAGS).toEqual({ scroll: true, wl: true, zoom: true });
  });
});
