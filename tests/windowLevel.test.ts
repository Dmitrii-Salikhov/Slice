import { describe, expect, it } from 'vitest';
import { applyWindowLevel, clampWindowLevel, PRESETS } from '../src/viewer/windowLevel';

describe('windowLevel', () => {
  it('maps below window to 0 and above to 255', () => {
    const pixels = new Float32Array([-1000, 40, 2000]);
    const out = applyWindowLevel(pixels, { windowCenter: 40, windowWidth: 80 });
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(255);
    expect(out[1]).toBeGreaterThan(100);
    expect(out[1]).toBeLessThan(160);
  });

  it('maps Int16 modality values the same as Float32', () => {
    const f = new Float32Array([-1000, 40, 2000]);
    const i = new Int16Array([-1000, 40, 2000]);
    const wl = { windowCenter: 40, windowWidth: 80 };
    const outF = applyWindowLevel(f, wl);
    const outI = applyWindowLevel(i, wl);
    expect([...outI]).toEqual([...outF]);
  });

  it('packModalityInt16 rejects out-of-range floats', async () => {
    const { packModalityInt16 } = await import('../src/dicom/parse');
    expect(packModalityInt16(new Float32Array([1, 2, 3]))).toBeInstanceOf(Int16Array);
    expect(packModalityInt16(new Float32Array([40000]))).toBeNull();
  });

  it('reuses output buffer when provided', () => {
    const pixels = new Float32Array([0, 1, 2]);
    const buf = new Uint8ClampedArray(3);
    const out = applyWindowLevel(pixels, { windowCenter: 1, windowWidth: 4 }, buf);
    expect(out).toBe(buf);
  });

  it('clampWindowLevel enforces minimum width 1', () => {
    expect(clampWindowLevel({ windowCenter: 10, windowWidth: 0 }).windowWidth).toBe(1);
    expect(clampWindowLevel({ windowCenter: 10, windowWidth: 50 }).windowWidth).toBe(50);
  });

  it('exposes clinical presets', () => {
    expect(PRESETS.lung.windowCenter).toBe(-600);
    expect(PRESETS.bone.windowWidth).toBe(1800);
    expect(PRESETS.brain.windowWidth).toBe(80);
  });
});
