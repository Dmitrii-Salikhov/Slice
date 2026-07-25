import { describe, expect, it } from 'vitest';
import {
  colorSamplesToRgba,
  isColorPhotometric,
  jpegRgbToRgba,
} from '../src/dicom/color';

describe('color', () => {
  it('detects color photometric interpretations', () => {
    expect(isColorPhotometric('RGB')).toBe(true);
    expect(isColorPhotometric('YBR_FULL')).toBe(true);
    expect(isColorPhotometric('MONOCHROME2')).toBe(false);
  });

  it('converts interleaved RGB samples', () => {
    const samples = Uint8Array.from([255, 0, 0, 0, 255, 0]);
    const { rgba, luma } = colorSamplesToRgba(samples, 2, 1, 'RGB', 0, 3);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(0);
    expect(rgba[4]).toBe(0);
    expect(rgba[5]).toBe(255);
    expect(luma[0]).toBeCloseTo(0.299 * 255);
    expect(luma[1]).toBeCloseTo(0.587 * 255);
  });

  it('converts YBR_FULL to RGB', () => {
    // Y=128, Cb=128, Cr=128 → neutral gray
    const samples = Uint8Array.from([128, 128, 128]);
    const { rgba } = colorSamplesToRgba(samples, 1, 1, 'YBR_FULL', 0, 3);
    expect(rgba[0]).toBe(128);
    expect(rgba[1]).toBe(128);
    expect(rgba[2]).toBe(128);
  });

  it('converts planar RGB', () => {
    const samples = Uint8Array.from([10, 20, 30, 40, 50, 60]); // RR GG BB for 2 px
    const { rgba } = colorSamplesToRgba(samples, 2, 1, 'RGB', 1, 3);
    expect(rgba[0]).toBe(10);
    expect(rgba[1]).toBe(30);
    expect(rgba[2]).toBe(50);
    expect(rgba[4]).toBe(20);
    expect(rgba[5]).toBe(40);
    expect(rgba[6]).toBe(60);
  });

  it('packs jpeg RGB buffer', () => {
    const data = Uint8Array.from([1, 2, 3]);
    const { rgba, luma } = jpegRgbToRgba(data, 1, 1);
    expect(rgba[0]).toBe(1);
    expect(rgba[1]).toBe(2);
    expect(rgba[2]).toBe(3);
    expect(luma[0]).toBeCloseTo(0.299 * 1 + 0.587 * 2 + 0.114 * 3);
  });
});
