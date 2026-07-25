/** Color photometric helpers (RGB / YBR → RGBA + luminance). */

export function isColorPhotometric(photo: string): boolean {
  const p = photo.toUpperCase();
  return (
    p === 'RGB' ||
    p === 'YBR_FULL' ||
    p === 'YBR_FULL_422' ||
    p === 'YBR_PARTIAL_420' ||
    p === 'YBR_ICT' ||
    p === 'YBR_RCT'
  );
}

function ybrToRgb(y: number, cb: number, cr: number): [number, number, number] {
  const r = y + 1.402 * (cr - 128);
  const g = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
  const b = y + 1.772 * (cb - 128);
  return [
    Math.min(255, Math.max(0, Math.round(r))),
    Math.min(255, Math.max(0, Math.round(g))),
    Math.min(255, Math.max(0, Math.round(b))),
  ];
}

/**
 * Convert planar or interleaved 8-bit color samples to RGBA + grayscale luminance.
 * planarConfiguration: 0 = interleaved (RGBRGB…), 1 = planar (RRR…GGG…BBB…)
 */
export function colorSamplesToRgba(
  samples: Uint8Array,
  width: number,
  height: number,
  photometric: string,
  planarConfiguration: number,
  samplesPerPixel: number,
): { rgba: Uint8ClampedArray; luma: Float32Array } {
  const n = width * height;
  const rgba = new Uint8ClampedArray(n * 4);
  const luma = new Float32Array(n);
  const photo = photometric.toUpperCase();
  const spp = Math.max(3, samplesPerPixel);

  const readPixel = (i: number): [number, number, number] => {
    if (planarConfiguration === 1) {
      return [samples[i] ?? 0, samples[n + i] ?? 0, samples[2 * n + i] ?? 0];
    }
    const o = i * spp;
    return [samples[o] ?? 0, samples[o + 1] ?? 0, samples[o + 2] ?? 0];
  };

  for (let i = 0; i < n; i++) {
    let [c0, c1, c2] = readPixel(i);
    let r: number;
    let g: number;
    let b: number;
    if (photo.startsWith('YBR')) {
      [r, g, b] = ybrToRgb(c0, c1, c2);
    } else {
      r = c0;
      g = c1;
      b = c2;
    }
    const o = i * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = 255;
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  return { rgba, luma };
}

/** JPEG decoded RGB/YCbCr buffer (from jpeg-js) → RGBA + luma. */
export function jpegRgbToRgba(
  data: Uint8Array,
  width: number,
  height: number,
): { rgba: Uint8ClampedArray; luma: Float32Array } {
  const n = width * height;
  const spp = Math.max(1, Math.floor(data.length / n));
  const rgba = new Uint8ClampedArray(n * 4);
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * spp;
    const r = data[o] ?? 0;
    const g = spp >= 3 ? (data[o + 1] ?? r) : r;
    const b = spp >= 3 ? (data[o + 2] ?? r) : r;
    const d = i * 4;
    rgba[d] = r;
    rgba[d + 1] = g;
    rgba[d + 2] = b;
    rgba[d + 3] = 255;
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return { rgba, luma };
}
