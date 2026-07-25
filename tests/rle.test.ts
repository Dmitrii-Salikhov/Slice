import { describe, expect, it } from 'vitest';
import { decodeRleFrame } from '../src/dicom/rle';
import { encodeRle8 } from './helpers';

describe('rle', () => {
  it('decodes 8-bit single-segment frame', () => {
    const rows = 2;
    const cols = 3;
    const raw = Uint8Array.from([10, 10, 10, 20, 20, 20]);
    const encoded = encodeRle8(raw);
    const decoded = decodeRleFrame(encoded, rows, cols, 1, 8);
    expect([...decoded]).toEqual([10, 10, 10, 20, 20, 20]);
  });

  it('throws on invalid segment count', () => {
    const bad = new Uint8Array(8);
    new DataView(bad.buffer).setUint32(0, 0, true);
    expect(() => decodeRleFrame(bad, 1, 1, 1, 8)).toThrow(/Invalid RLE/);
  });

  it('decodes 16-bit two-segment frame (hi/lo)', () => {
    // pixels: 0x0102, 0x0304  → LE bytes lo,hi = 02 01 04 03
    const rows = 1;
    const cols = 2;
    const hi = Uint8Array.from([0x01, 0x03]);
    const lo = Uint8Array.from([0x02, 0x04]);

    // Encode segments with simple repeat
    const encSeg = (bytes: Uint8Array) => {
      const out: number[] = [];
      for (const b of bytes) {
        out.push(0, b); // run length 1
      }
      return Uint8Array.from(out);
    };
    const seg0 = encSeg(hi);
    const seg1 = encSeg(lo);
    const header = new ArrayBuffer(64);
    const view = new DataView(header);
    view.setUint32(0, 2, true);
    view.setUint32(4, 64, true);
    view.setUint32(8, 64 + seg0.length, true);
    const encoded = Uint8Array.from([...new Uint8Array(header), ...seg0, ...seg1]);

    const decoded = decodeRleFrame(encoded, rows, cols, 1, 16);
    expect(decoded[0]).toBe(0x02);
    expect(decoded[1]).toBe(0x01);
    expect(decoded[2]).toBe(0x04);
    expect(decoded[3]).toBe(0x03);
  });
});
