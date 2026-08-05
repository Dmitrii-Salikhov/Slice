import type { Annotation, MprPlane, WindowLevel } from '../dicom/types';
import { applyWindowLevel } from './windowLevel';
import { imageToCanvas, physicalSize } from './math';
import { isAnnotationVisible } from './annotationTools';

export type RenderParams = {
  pixels: Float32Array | Int16Array;
  width: number;
  height: number;
  windowLevel: WindowLevel;
  zoom: number;
  panX: number;
  panY: number;
  invert?: boolean;
  flipH?: boolean;
  flipV?: boolean;
  /** Optional RGBA color buffer (length width*height*4). When set, skips VOI LUT. */
  colorRgba?: Uint8ClampedArray | null;
  /** Pixel spacing in mm (col = X, row = Y). Defaults to 1×1 (square pixels). */
  spacingCol?: number;
  spacingRow?: number;
};

export type DraftOverlay =
  | { kind: 'length' | 'roi' | 'arrow'; x0: number; y0: number; x1: number; y1: number }
  | {
      kind: 'angle';
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      x2?: number;
      y2?: number;
    };

export type OverlayParams = {
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
  flipH?: boolean;
  flipV?: boolean;
  crosshair?: { u: number; v: number } | null;
  measures?: Annotation[];
  draftMeasure?: DraftOverlay | null;
  probe?: { x: number; y: number; value: number; label?: string } | null;
  spacing?: { col: number; row: number };
  sliceIndex?: number;
  /** When set, only show annotations for this MPR plane. */
  mprPlane?: MprPlane;
  /** Highlight the annotation with this id (selection). */
  selectedId?: string | null;
};

/**
 * Draw a single slice into a 2D canvas with W/L, zoom and pan.
 */
const offscreenByKey = new Map<string, HTMLCanvasElement>();

function getOffscreen(width: number, height: number): HTMLCanvasElement {
  const key = `${width}x${height}`;
  let off = offscreenByKey.get(key);
  if (!off) {
    off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    offscreenByKey.set(key, off);
    if (offscreenByKey.size > 4) {
      const first = offscreenByKey.keys().next().value;
      if (first && first !== key) offscreenByKey.delete(first);
    }
  } else if (off.width !== width || off.height !== height) {
    off.width = width;
    off.height = height;
  }
  return off;
}

export function renderSliceToCanvas(
  canvas: HTMLCanvasElement,
  params: RenderParams,
  grayScratch?: Uint8ClampedArray,
): void {
  const { pixels, width, height, windowLevel, zoom, panX, panY, invert, flipH, flipV, colorRgba } =
    params;
  const spacingCol = params.spacingCol ?? 1;
  const spacingRow = params.spacingRow ?? 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  if (colorRgba && colorRgba.length >= width * height * 4) {
    data.set(colorRgba.subarray(0, width * height * 4));
  } else {
    const gray = applyWindowLevel(pixels, windowLevel, grayScratch);
    for (let i = 0; i < gray.length; i++) {
      let v = gray[i];
      if (invert) v = 255 - v;
      const o = i * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }

  const off = getOffscreen(width, height);
  const offCtx = off.getContext('2d');
  if (!offCtx) return;
  offCtx.putImageData(imageData, 0, 0);

  const vw = canvas.width;
  const vh = canvas.height;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, vw, vh);

  const { w: physW, h: physH } = physicalSize(width, height, spacingCol, spacingRow);
  const fit = Math.min(vw / physW, vh / physH);
  const mmScale = fit * zoom;
  const drawW = physW * mmScale;
  const drawH = physH * mmScale;
  const dx = (vw - drawW) / 2 + panX;
  const dy = (vh - drawH) / 2 + panY;

  ctx.save();
  ctx.translate(dx + (flipH ? drawW : 0), dy + (flipV ? drawH : 0));
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  // Smooth when magnifying (and when shrinking) — NEAREST looks blocky in MPR zoom.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, drawW, drawH);
  ctx.restore();
}

export function drawOverlays(canvas: HTMLCanvasElement, overlay: OverlayParams): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height, zoom, panX, panY, flipH = false, flipV = false } = overlay;
  const spacingCol = overlay.spacing?.col ?? 1;
  const spacingRow = overlay.spacing?.row ?? 1;
  const dpr = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);

  ctx.save();
  ctx.lineWidth = Math.max(1, dpr);

  if (overlay.crosshair) {
    const { u, v } = overlay.crosshair;
    const p = imageToCanvas(
      u,
      v,
      canvas,
      width,
      height,
      zoom,
      panX,
      panY,
      flipH,
      flipV,
      spacingCol,
      spacingRow,
    );
    ctx.strokeStyle = 'rgba(255, 180, 60, 0.9)';
    ctx.beginPath();
    ctx.moveTo(p.x, 0);
    ctx.lineTo(p.x, canvas.height);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80, 200, 255, 0.9)';
    ctx.beginPath();
    ctx.moveTo(0, p.y);
    ctx.lineTo(canvas.width, p.y);
    ctx.stroke();
  }

  const toCanvas = (ix: number, iy: number) =>
    imageToCanvas(
      ix,
      iy,
      canvas,
      width,
      height,
      zoom,
      panX,
      panY,
      flipH,
      flipV,
      spacingCol,
      spacingRow,
    );

  const drawSeg = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    label?: string,
    selected = false,
  ) => {
    const a = toCanvas(x0, y0);
    const b = toCanvas(x1, y1);
    if (selected) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 4 * dpr;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, dpr);
    }
    ctx.strokeStyle = selected ? 'rgba(255, 240, 120, 1)' : 'rgba(255, 220, 80, 0.95)';
    ctx.fillStyle = selected ? 'rgba(255, 240, 120, 1)' : 'rgba(255, 220, 80, 0.95)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, (selected ? 4.5 : 3) * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    if (label) {
      ctx.font = `${11 * dpr}px IBM Plex Mono, monospace`;
      ctx.fillText(label, (a.x + b.x) / 2 + 6 * dpr, (a.y + b.y) / 2 - 6 * dpr);
    }
  };

  const drawArrow = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    label?: string,
    selected = false,
  ) => {
    const a = toCanvas(x0, y0);
    const b = toCanvas(x1, y1);
    if (selected) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 4 * dpr;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, dpr);
    }
    ctx.strokeStyle = selected ? 'rgba(160, 230, 255, 1)' : 'rgba(120, 200, 255, 0.95)';
    ctx.fillStyle = selected ? 'rgba(160, 230, 255, 1)' : 'rgba(120, 200, 255, 0.95)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const head = 10 * dpr;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(ang - 0.4), b.y - head * Math.sin(ang - 0.4));
    ctx.lineTo(b.x - head * Math.cos(ang + 0.4), b.y - head * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
    if (label) {
      ctx.font = `${11 * dpr}px IBM Plex Mono, monospace`;
      ctx.fillText(label, b.x + 6 * dpr, b.y - 6 * dpr);
    }
  };

  const drawRoi = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    label?: string,
    shape: 'rect' | 'ellipse' = 'ellipse',
    selected = false,
  ) => {
    const a = toCanvas(x0, y0);
    const b = toCanvas(x1, y1);
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    const stroke = () => {
      if (shape === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(left + w / 2, top + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(left, top, w, h);
        ctx.strokeRect(left, top, w, h);
      }
    };
    if (selected) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 4 * dpr;
      stroke();
      ctx.lineWidth = Math.max(1, dpr);
    }
    ctx.strokeStyle = selected ? 'rgba(120, 255, 200, 1)' : 'rgba(80, 255, 180, 0.95)';
    ctx.fillStyle = selected ? 'rgba(80, 255, 180, 0.22)' : 'rgba(80, 255, 180, 0.12)';
    stroke();
    if (label) {
      ctx.fillStyle = selected ? 'rgba(120, 255, 200, 1)' : 'rgba(80, 255, 180, 0.95)';
      ctx.font = `${11 * dpr}px Consolas, monospace`;
      ctx.fillText(label, left + 4 * dpr, top - 4 * dpr);
    }
  };

  const drawAngle = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    label?: string,
    selected = false,
  ) => {
    drawSeg(x0, y0, x1, y1, undefined, selected);
    drawSeg(x1, y1, x2, y2, label, selected);
  };

  const visible = (overlay.measures ?? []).filter((m) =>
    isAnnotationVisible(m, { sliceIndex: overlay.sliceIndex, mprPlane: overlay.mprPlane }),
  );

  for (const m of visible) {
    const selected = overlay.selectedId != null && m.id === overlay.selectedId;
    if (m.kind === 'length') {
      drawSeg(m.x0, m.y0, m.x1, m.y1, `${m.mm.toFixed(1)} mm`, selected);
    } else if (m.kind === 'angle') {
      drawAngle(m.x0, m.y0, m.x1, m.y1, m.x2, m.y2, `${m.deg.toFixed(1)}°`, selected);
    } else if (m.kind === 'roi') {
      const shape = m.shape ?? 'ellipse';
      const range =
        m.min != null && m.max != null
          ? ` [${m.min.toFixed(0)}…${m.max.toFixed(0)}]`
          : '';
      drawRoi(
        m.x0,
        m.y0,
        m.x1,
        m.y1,
        `μ ${m.mean.toFixed(1)} ± ${m.sd.toFixed(1)}${range} · ${m.areaMm2.toFixed(0)} mm²`,
        shape,
        selected,
      );
    } else if (m.kind === 'arrow') {
      drawArrow(m.x0, m.y0, m.x1, m.y1, m.label, selected);
    }
  }

  const d = overlay.draftMeasure;
  if (d) {
    if (d.kind === 'angle') {
      drawSeg(d.x0, d.y0, d.x1, d.y1);
      if (d.x2 != null && d.y2 != null) drawSeg(d.x1, d.y1, d.x2, d.y2);
    } else if (d.kind === 'roi') {
      drawRoi(d.x0, d.y0, d.x1, d.y1);
    } else if (d.kind === 'arrow') {
      drawArrow(d.x0, d.y0, d.x1, d.y1);
    } else {
      drawSeg(d.x0, d.y0, d.x1, d.y1);
    }
  }

  if (overlay.probe) {
    const p = toCanvas(overlay.probe.x, overlay.probe.y);
    ctx.strokeStyle = 'rgba(120, 255, 160, 0.95)';
    ctx.beginPath();
    ctx.moveTo(p.x - 8 * dpr, p.y);
    ctx.lineTo(p.x + 8 * dpr, p.y);
    ctx.moveTo(p.x, p.y - 8 * dpr);
    ctx.lineTo(p.x, p.y + 8 * dpr);
    ctx.stroke();
    ctx.fillStyle = 'rgba(120, 255, 160, 0.95)';
    ctx.font = `${11 * dpr}px IBM Plex Mono, monospace`;
    const text =
      overlay.probe.label ?? `${overlay.probe.value.toFixed(1)} HU`;
    ctx.fillText(text, p.x + 10 * dpr, p.y - 8 * dpr);
  }

  ctx.restore();
}
