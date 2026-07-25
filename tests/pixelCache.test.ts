import { describe, expect, it, vi } from 'vitest';
import { PixelCache } from '../src/dicom/pixelCache';
import { makeInstance } from './helpers';
import type { DicomInstance } from '../src/dicom/types';

describe('PixelCache', () => {
  it('evicts oldest entries when over capacity', async () => {
    const cache = new PixelCache({ maxEntries: 2 });
    const readFile = vi.fn(async () => new ArrayBuffer(0));

    const decodeStub = async (instance: DicomInstance) => {
      instance.pixelsInt16 = new Int16Array(4);
      instance.pixelStatus = 'ready';
    };

    // Bypass real decode by pre-filling via ensure after mocking parse path:
    // ensure calls decodeInstancePixels — stub by putting pixels before ensure peek fails.
    // Instead call remember path by ensuring with a custom approach:
    const a = makeInstance({
      filePath: '/a.dcm',
      sopInstanceUID: 'a',
      pixels: undefined,
      pixelStatus: 'meta',
      rows: 2,
      columns: 2,
    });
    const b = makeInstance({
      filePath: '/b.dcm',
      sopInstanceUID: 'b',
      pixels: undefined,
      pixelStatus: 'meta',
      rows: 2,
      columns: 2,
    });
    const c = makeInstance({
      filePath: '/c.dcm',
      sopInstanceUID: 'c',
      pixels: undefined,
      pixelStatus: 'meta',
      rows: 2,
      columns: 2,
    });

    // Manually populate like ensure would after decode
    const rememberViaEnsure = async (inst: DicomInstance) => {
      await decodeStub(inst);
      // Call ensure — hasPixels && ready → remember without readFile decode
      await cache.ensure(inst, readFile);
    };

    await rememberViaEnsure(a);
    await rememberViaEnsure(b);
    expect(cache.size).toBe(2);
    expect(a.pixelsInt16).toBeTruthy();
    expect(b.pixelsInt16).toBeTruthy();

    await rememberViaEnsure(c);
    expect(cache.size).toBe(2);
    expect(a.pixelStatus).toBe('meta');
    expect(a.pixelsInt16).toBeUndefined();
    expect(c.pixelsInt16).toBeTruthy();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('clear drops all buffers', async () => {
    const cache = new PixelCache({ maxEntries: 8 });
    const inst = makeInstance({
      filePath: '/x.dcm',
      pixelsInt16: new Int16Array([1, 2, 3, 4]),
      pixels: undefined,
      pixelStatus: 'ready',
      rows: 2,
      columns: 2,
    });
    await cache.ensure(inst, async () => new ArrayBuffer(0));
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(inst.pixelsInt16).toBeUndefined();
    expect(inst.pixelStatus).toBe('meta');
  });
});
