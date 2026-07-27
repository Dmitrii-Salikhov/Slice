import type { Annotation, MprPlane, WindowLevel } from '../dicom/types';
import { applyWindowLevel } from '../viewer/windowLevel';
import { drawOverlays } from '../viewer/render';
import jpeg from 'jpeg-js';

export type ImageExportFormat = 'jpeg' | 'png';

/** Apply W/L and pack grayscale → RGBA for encoders. */
export function sliceToRgba(
  pixels: Float32Array | Int16Array,
  windowLevel: WindowLevel,
  invert = false,
): Uint8ClampedArray {
  const gray = applyWindowLevel(pixels, windowLevel);
  const rgba = new Uint8ClampedArray(gray.length * 4);
  for (let i = 0; i < gray.length; i++) {
    let v = gray[i];
    if (invert) v = 255 - v;
    const o = i * 4;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = v;
    rgba[o + 3] = 255;
  }
  return rgba;
}

type ExportInstance = {
  pixels?: Float32Array;
  pixelsInt16?: Int16Array;
  rows: number;
  columns: number;
  colorRgba?: Uint8ClampedArray;
};

function instanceToRgba(
  instance: ExportInstance,
  windowLevel: WindowLevel,
  invert?: boolean,
): Uint8ClampedArray {
  const n = instance.rows * instance.columns * 4;
  if (instance.colorRgba && instance.colorRgba.length >= n) {
    return new Uint8ClampedArray(instance.colorRgba.subarray(0, n));
  }
  const pixels = instance.pixelsInt16 ?? instance.pixels;
  if (!pixels) {
    throw new Error('No pixel data to export');
  }
  return sliceToRgba(pixels, windowLevel, invert);
}

export type RenderedExportOptions = {
  width: number;
  height: number;
  windowLevel: WindowLevel;
  pixels?: Float32Array | Int16Array;
  colorRgba?: Uint8ClampedArray | null;
  invert?: boolean;
  flipH?: boolean;
  flipV?: boolean;
  measures?: Annotation[];
  sliceIndex?: number;
  mprPlane?: MprPlane;
  format: ImageExportFormat;
  quality?: number;
};

function requireCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('Image export requires a browser canvas');
  }
  return document.createElement('canvas');
}

async function canvasToBytes(
  canvas: HTMLCanvasElement,
  format: ImageExportFormat,
  quality = 92,
): Promise<Uint8Array> {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`${format.toUpperCase()} encode failed`))),
      mime,
      format === 'jpeg' ? quality / 100 : undefined,
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function paintSliceToCanvas(opts: RenderedExportOptions): HTMLCanvasElement {
  const {
    width,
    height,
    windowLevel,
    invert = false,
    flipH = false,
    flipV = false,
    measures,
    sliceIndex,
    mprPlane,
  } = opts;

  if (width < 1 || height < 1) throw new Error('Invalid export size');

  const canvas = requireCanvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context');

  const imageData = ctx.createImageData(width, height);
  if (opts.colorRgba && opts.colorRgba.length >= width * height * 4) {
    imageData.data.set(opts.colorRgba.subarray(0, width * height * 4));
  } else if (opts.pixels) {
    imageData.data.set(sliceToRgba(opts.pixels, windowLevel, invert));
  } else {
    throw new Error('No pixel data to export');
  }

  // 1:1 pixel buffer → optional flips via intermediate canvas
  const src = requireCanvas();
  src.width = width;
  src.height = height;
  const srcCtx = src.getContext('2d');
  if (!srcCtx) throw new Error('Could not create canvas context');
  srcCtx.putImageData(imageData, 0, 0);

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(flipH ? width : 0, flipV ? height : 0);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(src, 0, 0);
  ctx.restore();

  if (measures && measures.length > 0) {
    drawOverlays(canvas, {
      width,
      height,
      zoom: 1,
      panX: 0,
      panY: 0,
      flipH,
      flipV,
      // Pixel-space overlays (annotations are stored in image pixels).
      spacing: { col: 1, row: 1 },
      measures,
      sliceIndex,
      mprPlane,
    });
  }

  return canvas;
}

/**
 * Export a slice at native resolution with current W/L, flips, and annotations.
 * Matches what the viewer shows (minus zoom/pan framing).
 */
export async function encodeRenderedSlice(opts: RenderedExportOptions): Promise<Uint8Array> {
  try {
    const canvas = paintSliceToCanvas(opts);
    return await canvasToBytes(canvas, opts.format, opts.quality ?? 92);
  } catch (err) {
    // Fallback when canvas 2d is unavailable (rare) or toBlob fails — still export pixels.
    if (opts.measures && opts.measures.length > 0) throw err;
    if (opts.format === 'jpeg') {
      return encodeSliceJpeg(
        {
          pixels: opts.pixels instanceof Float32Array ? opts.pixels : undefined,
          pixelsInt16: opts.pixels instanceof Int16Array ? opts.pixels : undefined,
          colorRgba: opts.colorRgba ?? undefined,
          rows: opts.height,
          columns: opts.width,
        },
        opts.windowLevel,
        { invert: opts.invert, quality: opts.quality },
      );
    }
    throw err;
  }
}

/** Encode current stack instance as JPEG (native resolution, current W/L). */
export function encodeSliceJpeg(
  instance: ExportInstance,
  windowLevel: WindowLevel,
  options?: { quality?: number; invert?: boolean },
): Uint8Array {
  const quality = options?.quality ?? 92;
  const rgba = instanceToRgba(instance, windowLevel, options?.invert);
  // jpeg-js is picky about TypedArray brands — pass a plain Uint8Array copy.
  const data = new Uint8Array(rgba.byteLength);
  data.set(rgba);
  const encoded = jpeg.encode(
    {
      data,
      width: instance.columns,
      height: instance.rows,
    },
    quality,
  );
  return new Uint8Array(encoded.data);
}

/**
 * Encode PNG via canvas (renderer / Electron). Throws if canvas unavailable.
 */
export async function encodeSlicePng(
  instance: ExportInstance,
  windowLevel: WindowLevel,
  options?: { invert?: boolean },
): Promise<Uint8Array> {
  return encodeRenderedSlice({
    width: instance.columns,
    height: instance.rows,
    windowLevel,
    pixels: instance.pixelsInt16 ?? instance.pixels,
    colorRgba: instance.colorRgba,
    invert: options?.invert,
    format: 'png',
  });
}

export function suggestImageFileName(
  meta: {
    patientId?: string;
    seriesDescription?: string;
    instanceNumber?: number;
    plane?: MprPlane | string;
  },
  format: ImageExportFormat,
): string {
  const safe = (s: string) =>
    (s || 'slice')
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'slice';
  const plane = meta.plane ? `_${safe(String(meta.plane))}` : '';
  const num =
    meta.instanceNumber != null
      ? `_${String(meta.instanceNumber).padStart(4, '0')}`
      : '';
  const base = `${safe(meta.patientId || 'slice')}_${safe(meta.seriesDescription || 'image')}${plane}${num}`;
  return `${base}.${format === 'png' ? 'png' : 'jpg'}`;
}
