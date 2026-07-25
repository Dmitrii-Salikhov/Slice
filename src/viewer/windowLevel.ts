import type { WindowLevel } from '../dicom/types';

export type PixelBuffer = Float32Array | Int16Array | ArrayLike<number>;

/** Apply VOI LUT (linear) → 8-bit grayscale. Supports Float32 or Int16 modality values. */
export function applyWindowLevel(
  pixels: PixelBuffer,
  wl: WindowLevel,
  out?: Uint8ClampedArray,
): Uint8ClampedArray {
  const result =
    out && out.length === pixels.length ? out : new Uint8ClampedArray(pixels.length);
  const width = Math.max(1, wl.windowWidth);
  const center = wl.windowCenter;
  const ymin = 0;
  const ymax = 255;
  const c = center - 0.5;
  const w = width - 1;

  for (let i = 0; i < pixels.length; i++) {
    const x = pixels[i];
    let y: number;
    if (x <= c - 0.5 * w) y = ymin;
    else if (x > c + 0.5 * w) y = ymax;
    else y = ((x - c) / w + 0.5) * (ymax - ymin) + ymin;
    result[i] = y;
  }
  return result;
}

export const PRESETS: Record<string, WindowLevel> = {
  soft: { windowCenter: 40, windowWidth: 400 },
  lung: { windowCenter: -600, windowWidth: 1500 },
  bone: { windowCenter: 400, windowWidth: 1800 },
  brain: { windowCenter: 40, windowWidth: 80 },
  abdomen: { windowCenter: 60, windowWidth: 400 },
};

export function clampWindowLevel(wl: WindowLevel): WindowLevel {
  return {
    windowCenter: wl.windowCenter,
    windowWidth: Math.max(1, wl.windowWidth),
  };
}
