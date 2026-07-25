import type { Annotation, WindowLevel } from '../dicom/types';
import { applyWindowLevel } from './windowLevel';
import { imageToCanvas } from './math';

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
};

/**
 * Draw a single slice into a 2D canvas with W/L, zoom and pan.
 */
export function renderSliceToCanvas(
  canvas: HTMLCanvasElement,
  params: RenderParams,
  grayScratch?: Uint8ClampedArray,
): void {
  const { pixels, width, height, windowLevel, zoom, panX, panY, invert, flipH, flipV, colorRgba } =
    params;
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

  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const offCtx = off.getContext('2d');
  if (!offCtx) return;
  offCtx.putImageData(imageData, 0, 0);

  const vw = canvas.width;
  const vh = canvas.height;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, vw, vh);

  const fit = Math.min(vw / width, vh / height);
  const scale = fit * zoom;
  const drawW = width * scale;
  const drawH = height * scale;
  const dx = (vw - drawW) / 2 + panX;
  const dy = (vh - drawH) / 2 + panY;

  ctx.save();
  ctx.translate(dx + (flipH ? drawW : 0), dy + (flipV ? drawH : 0));
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(off, 0, 0, drawW, drawH);
  ctx.restore();
}

export function drawOverlays(canvas: HTMLCanvasElement, overlay: OverlayParams): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height, zoom, panX, panY, flipH = false, flipV = false } = overlay;
  const dpr = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);

  ctx.save();
  ctx.lineWidth = Math.max(1, dpr);

  if (overlay.crosshair) {
    const { u, v } = overlay.crosshair;
    const p = imageToCanvas(u, v, canvas, width, height, zoom, panX, panY, flipH, flipV);
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
    imageToCanvas(ix, iy, canvas, width, height, zoom, panX, panY, flipH, flipV);

  const drawSeg = (x0: number, y0: number, x1: number, y1: number, label?: string) => {
    const a = toCanvas(x0, y0);
    const b = toCanvas(x1, y1);
    ctx.strokeStyle = 'rgba(255, 220, 80, 0.95)';
    ctx.fillStyle = 'rgba(255, 220, 80, 0.95)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    if (label) {
      ctx.font = `${11 * dpr}px IBM Plex Mono, monospace`;
      ctx.fillText(label, (a.x + b.x) / 2 + 6 * dpr, (a.y + b.y) / 2 - 6 * dpr);
    }
  };

  const drawArrow = (x0: number, y0: number, x1: number, y1: number, label?: string) => {
    const a = toCanvas(x0, y0);
    const b = toCanvas(x1, y1);
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.95)';
    ctx.fillStyle = 'rgba(120, 200, 255, 0.95)';
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
  ) => {
    const a = toCanvas(x0, y0);
    const b = toCanvas(x1, y1);
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.strokeStyle = 'rgba(80, 255, 180, 0.95)';
    ctx.fillStyle = 'rgba(80, 255, 180, 0.12)';
    if (shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(left + w / 2, top + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(left, top, w, h);
      ctx.strokeRect(left, top, w, h);
    }
    if (label) {
      ctx.fillStyle = 'rgba(80, 255, 180, 0.95)';
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
  ) => {
    drawSeg(x0, y0, x1, y1);
    drawSeg(x1, y1, x2, y2, label);
  };

  const visible = (overlay.measures ?? []).filter(
    (m) => overlay.sliceIndex == null || m.sliceIndex === overlay.sliceIndex,
  );

  for (const m of visible) {
    if (m.kind === 'length') {
      drawSeg(m.x0, m.y0, m.x1, m.y1, `${m.mm.toFixed(1)} mm`);
    } else if (m.kind === 'angle') {
      drawAngle(m.x0, m.y0, m.x1, m.y1, m.x2, m.y2, `${m.deg.toFixed(1)}°`);
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
      );
    } else if (m.kind === 'arrow') {
      drawArrow(m.x0, m.y0, m.x1, m.y1, m.label);
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
