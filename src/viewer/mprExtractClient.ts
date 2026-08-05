import type { MprBasis, MprPlane, VolumeData } from '../dicom/types';
import type { ObliquePlane, ObliqueSlice } from './crosshair';
import { extractObliqueSlice } from './crosshair';
import {
  extractMprSlice,
  type MprExtractQuality,
  type MprSlice,
} from './mpr';
import type {
  MprSlicePayload,
  ObliqueSlicePayload,
  VolumePayload,
} from './mpr.worker';

export type OrthogonalSlices = Record<MprPlane, MprSlice>;

/**
 * Full-volume clone into a Worker doubles RAM and OOMs Electron on clinical CT.
 * Keep the worker module for a future SharedArrayBuffer path; extracts stay on
 * the main thread for now (rAF coalesce + fast-scroll still apply in UI).
 */
const MPR_WORKER_ENABLED = false;

function toArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

export function packVolumePayload(volume: VolumeData): {
  payload: VolumePayload;
  transfer: Transferable[];
} {
  // Single copy of the underlying bytes (used by tests / future worker path).
  const data = toArrayBuffer(volume.data);
  return {
    payload: {
      data,
      dataKind: volume.data instanceof Int16Array ? 'int16' : 'float32',
      dims: volume.dims,
      spacing: volume.spacing,
      windowLevel: volume.windowLevel,
      geometry: volume.geometry ?? null,
    },
    transfer: [data],
  };
}

export function unpackSlice(payload: MprSlicePayload): MprSlice {
  const pixels =
    payload.dataKind === 'int16'
      ? new Int16Array(payload.pixels)
      : new Float32Array(payload.pixels);
  return {
    plane: payload.plane,
    index: payload.index,
    width: payload.width,
    height: payload.height,
    spacing: payload.spacing,
    pixels,
  };
}

export function unpackOblique(payload: ObliqueSlicePayload): ObliqueSlice {
  return {
    width: payload.width,
    height: payload.height,
    spacing: payload.spacing,
    pixels: new Float32Array(payload.pixels),
  };
}

export function extractPlanesSync(
  volume: VolumeData,
  basis: MprBasis,
  quality: MprExtractQuality,
  indices: Record<MprPlane, number>,
): OrthogonalSlices {
  const opts = { quality };
  return {
    axial: extractMprSlice(volume, 'axial', indices.axial, basis, opts),
    coronal: extractMprSlice(volume, 'coronal', indices.coronal, basis, opts),
    sagittal: extractMprSlice(volume, 'sagittal', indices.sagittal, basis, opts),
  };
}

/**
 * MPR extract facade. Worker path is gated off (see MPR_WORKER_ENABLED).
 */
export class MprExtractClient {
  get available(): boolean {
    return MPR_WORKER_ENABLED && typeof Worker !== 'undefined';
  }

  setVolume(_volume: VolumeData): Promise<void> {
    return Promise.resolve();
  }

  clear(): void {
    // no-op while worker is disabled
  }

  extractPlanes(
    volume: VolumeData,
    basis: MprBasis,
    quality: MprExtractQuality,
    indices: Record<MprPlane, number>,
  ): Promise<OrthogonalSlices> {
    return Promise.resolve(extractPlanesSync(volume, basis, quality, indices));
  }

  extractOblique(volume: VolumeData, plane: ObliquePlane): Promise<ObliqueSlice> {
    return Promise.resolve(extractObliqueSlice(volume, plane));
  }
}

export const sharedMprExtractClient = new MprExtractClient();
