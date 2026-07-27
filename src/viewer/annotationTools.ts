import type { Annotation, AngleMeasure, LengthMeasure, MprPlane, RoiMeasure } from '../dicom/types';
import { angleDeg, lengthMm } from './math';
import { computeRoiStats, type RoiStats } from './roiStats';

export type MeasureMeta = {
  sliceIndex: number;
  mprPlane?: MprPlane;
};

/** Whether an annotation should be drawn for the current view. */
export function isAnnotationVisible(
  m: Annotation,
  opts: { sliceIndex?: number; mprPlane?: MprPlane },
): boolean {
  if (opts.mprPlane) {
    return m.mprPlane === opts.mprPlane && m.sliceIndex === (opts.sliceIndex ?? m.sliceIndex);
  }
  if (m.mprPlane) return false;
  return opts.sliceIndex == null || m.sliceIndex === opts.sliceIndex;
}

export function finishLength(
  draft: { x0: number; y0: number; x1: number; y1: number },
  spacingCol: number,
  spacingRow: number,
  meta: MeasureMeta,
  id = `${Date.now()}`,
): LengthMeasure | null {
  const mm = lengthMm(draft.x1 - draft.x0, draft.y1 - draft.y0, spacingCol, spacingRow);
  if (mm <= 0.1) return null;
  return {
    kind: 'length',
    id,
    sliceIndex: meta.sliceIndex,
    mprPlane: meta.mprPlane,
    x0: draft.x0,
    y0: draft.y0,
    x1: draft.x1,
    y1: draft.y1,
    mm,
  };
}

export function finishAngle(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  spacingCol: number,
  spacingRow: number,
  meta: MeasureMeta,
  id = `${Date.now()}`,
): AngleMeasure | null {
  const deg = angleDeg(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, spacingCol, spacingRow);
  if (deg <= 0.1) return null;
  return {
    kind: 'angle',
    id,
    sliceIndex: meta.sliceIndex,
    mprPlane: meta.mprPlane,
    x0: p0.x,
    y0: p0.y,
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
    deg,
  };
}

export function finishEllipseRoi(
  draft: { x0: number; y0: number; x1: number; y1: number },
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  spacingCol: number,
  spacingRow: number,
  meta: MeasureMeta,
  id = `${Date.now()}`,
): { annotation: RoiMeasure; stats: RoiStats } | null {
  if (Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0) <= 2) return null;
  const stats = computeRoiStats(
    pixels,
    width,
    height,
    draft.x0,
    draft.y0,
    draft.x1,
    draft.y1,
    spacingCol,
    spacingRow,
    'ellipse',
  );
  if (stats.count <= 0) return null;
  return {
    stats,
    annotation: {
      kind: 'roi',
      shape: 'ellipse',
      id,
      sliceIndex: meta.sliceIndex,
      mprPlane: meta.mprPlane,
      x0: draft.x0,
      y0: draft.y0,
      x1: draft.x1,
      y1: draft.y1,
      mean: stats.mean,
      sd: stats.sd,
      min: stats.min,
      max: stats.max,
      areaMm2: stats.areaMm2,
    },
  };
}

export function isMeasureTool(tool: string): boolean {
  return tool === 'length' || tool === 'angle' || tool === 'roi' || tool === 'arrow' || tool === 'probe';
}

/** Tools where a click selects annotations instead of drawing. */
export function isNavTool(tool: string): boolean {
  return (
    tool === 'scroll' ||
    tool === 'wl' ||
    tool === 'zoom' ||
    tool === 'pan' ||
    tool === 'crosshair'
  );
}

/** Hit-test slop in image pixels, scaled so it stays ~8 CSS px on screen. */
export function annotationHitSlop(zoom: number): number {
  return Math.max(4, 8 / Math.max(zoom, 0.01));
}

function distToSegment(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

function distToEllipseBoundary(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;
  if (rx < 1e-6 || ry < 1e-6) return Math.hypot(px - cx, py - cy);
  const nx = (px - cx) / rx;
  const ny = (py - cy) / ry;
  const r = Math.hypot(nx, ny);
  if (r < 1e-9) return Math.min(rx, ry);
  // Point on the ellipse in the same direction.
  const ex = cx + (nx / r) * rx;
  const ey = cy + (ny / r) * ry;
  return Math.hypot(px - ex, py - ey);
}

function pointInEllipse(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;
  if (rx < 1e-6 || ry < 1e-6) return false;
  const nx = (px - cx) / rx;
  const ny = (py - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function pointInRect(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  return px >= left && px <= right && py >= top && py <= bottom;
}

/**
 * Distance from point to annotation (image pixels). Lower is closer.
 * Returns Infinity when outside hit region beyond slop for filled shapes
 * is not applicable — callers compare to slop for lines; for ROI, inside
 * counts as distance 0.
 */
export function annotationHitDistance(m: Annotation, px: number, py: number): number {
  if (m.kind === 'length' || m.kind === 'arrow') {
    return distToSegment(px, py, m.x0, m.y0, m.x1, m.y1);
  }
  if (m.kind === 'angle') {
    return Math.min(
      distToSegment(px, py, m.x0, m.y0, m.x1, m.y1),
      distToSegment(px, py, m.x1, m.y1, m.x2, m.y2),
    );
  }
  // ROI
  const shape = m.shape ?? 'ellipse';
  if (shape === 'ellipse') {
    if (pointInEllipse(px, py, m.x0, m.y0, m.x1, m.y1)) return 0;
    return distToEllipseBoundary(px, py, m.x0, m.y0, m.x1, m.y1);
  }
  if (pointInRect(px, py, m.x0, m.y0, m.x1, m.y1)) return 0;
  const left = Math.min(m.x0, m.x1);
  const right = Math.max(m.x0, m.x1);
  const top = Math.min(m.y0, m.y1);
  const bottom = Math.max(m.y0, m.y1);
  const cx = Math.max(left, Math.min(right, px));
  const cy = Math.max(top, Math.min(bottom, py));
  return Math.hypot(px - cx, py - cy);
}

export function hitTestAnnotation(
  m: Annotation,
  pt: { x: number; y: number },
  slop: number,
): boolean {
  return annotationHitDistance(m, pt.x, pt.y) <= slop;
}

/**
 * Pick the closest visible annotation under the cursor.
 * Returns null when nothing is within slop.
 */
export function pickAnnotation(
  annotations: Annotation[],
  pt: { x: number; y: number },
  slop: number,
  visibility: { sliceIndex?: number; mprPlane?: MprPlane },
): Annotation | null {
  let best: Annotation | null = null;
  let bestDist = slop;
  for (const m of annotations) {
    if (!isAnnotationVisible(m, visibility)) continue;
    const d = annotationHitDistance(m, pt.x, pt.y);
    if (d <= bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}
