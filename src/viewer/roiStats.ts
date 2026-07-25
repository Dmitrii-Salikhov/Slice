export type RoiStats = {
  mean: number;
  sd: number;
  min: number;
  max: number;
  areaMm2: number;
  count: number;
};

export type RoiShape = 'rect' | 'ellipse';

/** Compute mean/SD/min/max and area for rect or ellipse ROI in image pixel space. */
export function computeRoiStats(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  spacingCol: number,
  spacingRow: number,
  shape: RoiShape = 'ellipse',
): RoiStats {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = Math.max(0.5, (maxX - minX) / 2);
  const ry = Math.max(0.5, (maxY - minY) / 2);

  const left = Math.max(0, Math.min(Math.floor(minX), width - 1));
  const right = Math.max(0, Math.min(Math.ceil(maxX), width - 1));
  const top = Math.max(0, Math.min(Math.floor(minY), height - 1));
  const bottom = Math.max(0, Math.min(Math.ceil(maxY), height - 1));

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let y = top; y <= bottom; y++) {
    const row = y * width;
    for (let x = left; x <= right; x++) {
      if (shape === 'ellipse') {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
      }
      const v = pixels[row + x];
      if (!Number.isFinite(v)) continue;
      sum += v;
      sumSq += v * v;
      if (v < min) min = v;
      if (v > max) max = v;
      count += 1;
    }
  }

  const mean = count > 0 ? sum / count : 0;
  const variance = count > 1 ? Math.max(0, sumSq / count - mean * mean) : 0;
  const wMm = Math.abs(x1 - x0) * spacingCol;
  const hMm = Math.abs(y1 - y0) * spacingRow;
  const areaMm2 =
    shape === 'ellipse' ? Math.PI * (wMm / 2) * (hMm / 2) : wMm * hMm;

  return {
    mean,
    sd: Math.sqrt(variance),
    min: count > 0 ? min : 0,
    max: count > 0 ? max : 0,
    areaMm2,
    count,
  };
}
