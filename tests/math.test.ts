import { describe, expect, it } from 'vitest';
import {
  add,
  angleDeg,
  clamp,
  clientToImage,
  cross,
  dot,
  imageToCanvas,
  lengthMm,
  normalize,
  scale,
  sub,
} from '../src/viewer/math';

describe('math', () => {
  it('clamp bounds values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it('vector ops', () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(sub([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3]);
    expect(scale([1, 2, 3], 2)).toEqual([2, 4, 6]);
    expect(dot([1, 0, 0], [0, 1, 0])).toBe(0);
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
  });

  it('normalize unit and zero vectors', () => {
    const n = normalize([3, 0, 0]);
    expect(n[0]).toBeCloseTo(1);
    expect(n[1]).toBeCloseTo(0);
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('lengthMm uses spacing', () => {
    expect(lengthMm(3, 4, 1, 1)).toBe(5);
    expect(lengthMm(2, 0, 0.5, 1)).toBe(1);
  });

  it('angleDeg measures angle at vertex in mm space', () => {
    // right angle at (0,0): (-1,0)–(0,0)–(0,1)
    expect(angleDeg(-1, 0, 0, 0, 0, 1, 1, 1)).toBeCloseTo(90);
    // spacing stretches vertical → still 90 for axis-aligned
    expect(angleDeg(-1, 0, 0, 0, 0, 1, 2, 0.5)).toBeCloseTo(90);
    // degenerate
    expect(angleDeg(0, 0, 0, 0, 1, 0, 1, 1)).toBe(0);
  });

  it('imageToCanvas and clientToImage round-trip center', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }),
    });

    const mid = imageToCanvas(50, 25, canvas, 100, 50, 1, 0, 0);
    // Client coords in CSS pixels matching canvas layout
    const back = clientToImage(mid.x, mid.y, canvas, 100, 50, 1, 0, 0);
    expect(back).not.toBeNull();
    expect(back!.x).toBeCloseTo(50, 0);
    expect(back!.y).toBeCloseTo(25, 0);
  });

  it('clientToImage returns null outside image', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }),
    });
    // Image 50×50 fitted into 200×100 → letterboxed; far right is outside
    expect(clientToImage(199, 50, canvas, 50, 50, 1, 0, 0)).toBeNull();
  });

  it('clientToImage allowOutside maps letterbox clicks to extended coords', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }),
    });
    const pt = clientToImage(10, 50, canvas, 50, 50, 1, 0, 0, false, false, 1, 1, {
      allowOutside: true,
    });
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeLessThan(0);
  });
});
