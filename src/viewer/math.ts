export type Vec3 = [number, number, number];

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function normalize(a: Vec3): Vec3 {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

export function lengthMm(
  dx: number,
  dy: number,
  spacingCol: number,
  spacingRow: number,
): number {
  return Math.hypot(dx * spacingCol, dy * spacingRow);
}

/**
 * Angle at vertex (x1,y1) between points (x0,y0)–(x1,y1)–(x2,y2) in mm space.
 */
export function angleDeg(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  spacingCol: number,
  spacingRow: number,
): number {
  const ax = (x0 - x1) * spacingCol;
  const ay = (y0 - y1) * spacingRow;
  const bx = (x2 - x1) * spacingCol;
  const by = (y2 - y1) * spacingRow;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-9 || lb < 1e-9) return 0;
  const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (la * lb)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Physical display size in mm (for anisotropic voxels / MPR). */
export function physicalSize(
  imageWidth: number,
  imageHeight: number,
  spacingCol = 1,
  spacingRow = 1,
): { w: number; h: number } {
  const sc = spacingCol > 0 ? spacingCol : 1;
  const sr = spacingRow > 0 ? spacingRow : 1;
  return { w: imageWidth * sc, h: imageHeight * sr };
}

/** Map client point → image pixel coords given canvas fit/zoom/pan (+ optional flips). */
export function clientToImage(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  panX: number,
  panY: number,
  flipH = false,
  flipV = false,
  spacingCol = 1,
  spacingRow = 1,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const dpr = canvas.width / Math.max(1, rect.width);
  const cx = (clientX - rect.left) * dpr;
  const cy = (clientY - rect.top) * dpr;
  const vw = canvas.width;
  const vh = canvas.height;
  const { w: physW, h: physH } = physicalSize(imageWidth, imageHeight, spacingCol, spacingRow);
  const fit = Math.min(vw / physW, vh / physH);
  const mmScale = fit * zoom; // canvas px per mm
  const drawW = physW * mmScale;
  const drawH = physH * mmScale;
  const dx = (vw - drawW) / 2 + panX;
  const dy = (vh - drawH) / 2 + panY;
  let ix = (cx - dx) / (mmScale * (spacingCol > 0 ? spacingCol : 1));
  let iy = (cy - dy) / (mmScale * (spacingRow > 0 ? spacingRow : 1));
  if (flipH) ix = imageWidth - ix;
  if (flipV) iy = imageHeight - iy;
  if (ix < -0.5 || iy < -0.5 || ix > imageWidth - 0.5 || iy > imageHeight - 0.5) {
    return null;
  }
  return { x: ix, y: iy };
}

export function imageToCanvas(
  ix: number,
  iy: number,
  canvas: HTMLCanvasElement,
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  panX: number,
  panY: number,
  flipH = false,
  flipV = false,
  spacingCol = 1,
  spacingRow = 1,
): { x: number; y: number } {
  const vw = canvas.width;
  const vh = canvas.height;
  const { w: physW, h: physH } = physicalSize(imageWidth, imageHeight, spacingCol, spacingRow);
  const fit = Math.min(vw / physW, vh / physH);
  const mmScale = fit * zoom;
  const drawW = physW * mmScale;
  const drawH = physH * mmScale;
  const dx = (vw - drawW) / 2 + panX;
  const dy = (vh - drawH) / 2 + panY;
  const sx = flipH ? imageWidth - ix : ix;
  const sy = flipV ? imageHeight - iy : iy;
  const sc = spacingCol > 0 ? spacingCol : 1;
  const sr = spacingRow > 0 ? spacingRow : 1;
  return {
    x: dx + sx * sc * mmScale,
    y: dy + sy * sr * mmScale,
  };
}
