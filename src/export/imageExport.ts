import type { DicomInstance, WindowLevel } from '../dicom/types';
import { applyWindowLevel } from '../viewer/windowLevel';
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

type ExportInstance = Pick<
  DicomInstance,
  'pixels' | 'pixelsInt16' | 'rows' | 'columns' | 'colorRgba'
>;

function instanceToRgba(
  instance: ExportInstance,
  windowLevel: WindowLevel,
  invert?: boolean,
): Uint8ClampedArray {
  const n = instance.rows * instance.columns * 4;
  if (instance.colorRgba && instance.colorRgba.length >= n) {
    return instance.colorRgba.subarray(0, n) as Uint8ClampedArray;
  }
  const pixels = instance.pixelsInt16 ?? instance.pixels;
  if (!pixels) {
    throw new Error('No pixel data to export');
  }
  return sliceToRgba(pixels, windowLevel, invert);
}

/** Encode current slice as JPEG (native resolution, current W/L). */
export function encodeSliceJpeg(
  instance: ExportInstance,
  windowLevel: WindowLevel,
  options?: { quality?: number; invert?: boolean },
): Uint8Array {
  const quality = options?.quality ?? 92;
  const rgba = instanceToRgba(instance, windowLevel, options?.invert);
  const encoded = jpeg.encode(
    {
      data: rgba,
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
  const rgba = instanceToRgba(instance, windowLevel, options?.invert);
  const width = instance.columns;
  const height = instance.rows;

  if (typeof document === 'undefined') {
    throw new Error('PNG export requires a browser canvas');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context');

  const imageData = ctx.createImageData(width, height);
  imageData.data.set(rgba);
  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))),
      'image/png',
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export function suggestImageFileName(
  instance: Pick<DicomInstance, 'patientId' | 'seriesDescription' | 'instanceNumber'>,
  format: ImageExportFormat,
): string {
  const safe = (s: string) =>
    (s || 'slice')
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'slice';
  const base = `${safe(instance.patientId)}_${safe(instance.seriesDescription)}_${String(
    instance.instanceNumber,
  ).padStart(4, '0')}`;
  return `${base}.${format === 'png' ? 'png' : 'jpg'}`;
}
