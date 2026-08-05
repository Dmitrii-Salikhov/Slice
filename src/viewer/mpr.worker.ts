/**
 * MPR extract worker — holds a volume copy and runs orthogonal/oblique extracts
 * off the UI thread.
 */
import type { MprBasis, MprPlane, VolumeData, VolumeGeometry, WindowLevel } from '../dicom/types';
import type { ObliquePlane } from './crosshair';
import { extractObliqueSlice } from './crosshair';
import {
  clearMprSliceCache,
  extractMprSlice,
  type MprExtractQuality,
  type MprSlice,
} from './mpr';

export type VolumePayload = {
  data: ArrayBuffer;
  dataKind: 'float32' | 'int16';
  dims: [number, number, number];
  spacing: [number, number, number];
  windowLevel: WindowLevel;
  geometry?: VolumeGeometry | null;
};

export type MprSlicePayload = {
  plane: MprPlane;
  index: number;
  width: number;
  height: number;
  spacing: { col: number; row: number };
  dataKind: 'float32' | 'int16';
  pixels: ArrayBuffer;
};

export type ObliqueSlicePayload = {
  width: number;
  height: number;
  spacing: [number, number];
  pixels: ArrayBuffer;
};

export type MprWorkerRequest =
  | { type: 'setVolume'; id: number; volume: VolumePayload }
  | {
      type: 'extractPlanes';
      id: number;
      basis: MprBasis;
      quality: MprExtractQuality;
      indices: Record<MprPlane, number>;
    }
  | { type: 'extractOblique'; id: number; plane: ObliquePlane }
  | { type: 'clear'; id: number };

export type MprWorkerResponse =
  | { type: 'ok'; id: number }
  | {
      type: 'planes';
      id: number;
      axial: MprSlicePayload;
      coronal: MprSlicePayload;
      sagittal: MprSlicePayload;
    }
  | { type: 'oblique'; id: number; slice: ObliqueSlicePayload }
  | { type: 'error'; id: number; error: string };

let volume: VolumeData | null = null;

function reviveVolume(payload: VolumePayload): VolumeData {
  const data =
    payload.dataKind === 'int16'
      ? new Int16Array(payload.data)
      : new Float32Array(payload.data);
  return {
    data,
    dims: payload.dims,
    spacing: payload.spacing,
    windowLevel: payload.windowLevel,
    geometry: payload.geometry ?? null,
  };
}

function packSlice(slice: MprSlice): { payload: MprSlicePayload; transfer: Transferable[] } {
  const copy =
    slice.pixels instanceof Int16Array
      ? new Int16Array(slice.pixels)
      : new Float32Array(slice.pixels);
  const pixels = copy.buffer.slice(
    copy.byteOffset,
    copy.byteOffset + copy.byteLength,
  ) as ArrayBuffer;
  return {
    payload: {
      plane: slice.plane,
      index: slice.index,
      width: slice.width,
      height: slice.height,
      spacing: slice.spacing,
      dataKind: slice.pixels instanceof Int16Array ? 'int16' : 'float32',
      pixels,
    },
    transfer: [pixels],
  };
}

function packOblique(slice: ReturnType<typeof extractObliqueSlice>): {
  payload: ObliqueSlicePayload;
  transfer: Transferable[];
} {
  const copy = new Float32Array(slice.pixels);
  const pixels = copy.buffer.slice(
    copy.byteOffset,
    copy.byteOffset + copy.byteLength,
  ) as ArrayBuffer;
  return {
    payload: {
      width: slice.width,
      height: slice.height,
      spacing: slice.spacing,
      pixels,
    },
    transfer: [pixels],
  };
}

function reply(msg: MprWorkerResponse, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(msg, transfer);
}

self.onmessage = (ev: MessageEvent<MprWorkerRequest>) => {
  const req = ev.data;
  try {
    if (req.type === 'clear') {
      if (volume) clearMprSliceCache(volume);
      volume = null;
      reply({ type: 'ok', id: req.id });
      return;
    }

    if (req.type === 'setVolume') {
      if (volume) clearMprSliceCache(volume);
      volume = reviveVolume(req.volume);
      reply({ type: 'ok', id: req.id });
      return;
    }

    if (!volume) {
      reply({ type: 'error', id: req.id, error: 'No volume in MPR worker' });
      return;
    }

    if (req.type === 'extractPlanes') {
      const opts = { quality: req.quality };
      const axial = packSlice(
        extractMprSlice(volume, 'axial', req.indices.axial, req.basis, opts),
      );
      const coronal = packSlice(
        extractMprSlice(volume, 'coronal', req.indices.coronal, req.basis, opts),
      );
      const sagittal = packSlice(
        extractMprSlice(volume, 'sagittal', req.indices.sagittal, req.basis, opts),
      );
      reply(
        {
          type: 'planes',
          id: req.id,
          axial: axial.payload,
          coronal: coronal.payload,
          sagittal: sagittal.payload,
        },
        [...axial.transfer, ...coronal.transfer, ...sagittal.transfer],
      );
      return;
    }

    if (req.type === 'extractOblique') {
      const packed = packOblique(extractObliqueSlice(volume, req.plane));
      reply({ type: 'oblique', id: req.id, slice: packed.payload }, packed.transfer);
    }
  } catch (e) {
    reply({
      type: 'error',
      id: req.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
};
