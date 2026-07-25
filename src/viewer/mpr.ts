import type { DicomSeries, VolumeData, WindowLevel, MprPlane } from '../dicom/types';
import { getPixelBuffer } from '../dicom/parse';

/**
 * Build a regular volume from a sorted CT/MR series.
 * Instances must already have decoded pixels (pixelsInt16 or pixels).
 */
export function buildVolume(series: DicomSeries): VolumeData {
  const instances = series.instances;
  if (instances.length === 0) {
    throw new Error('Empty series');
  }

  const first = instances[0];
  const cols = first.columns;
  const rows = first.rows;
  const slices = instances.length;
  const planeSize = cols * rows;

  const allInt16 = instances.every((inst) => !!inst.pixelsInt16);
  const data: Float32Array | Int16Array = allInt16
    ? new Int16Array(planeSize * slices)
    : new Float32Array(planeSize * slices);

  for (let z = 0; z < slices; z++) {
    const inst = instances[z];
    if (inst.rows !== rows || inst.columns !== cols) {
      throw new Error('Inhomogeneous series dimensions — MPR requires uniform matrix');
    }
    const buf = getPixelBuffer(inst);
    if (!buf) {
      throw new Error(`Missing pixels for slice ${z}`);
    }
    if (allInt16 && inst.pixelsInt16) {
      (data as Int16Array).set(inst.pixelsInt16, z * planeSize);
    } else if (buf instanceof Float32Array) {
      (data as Float32Array).set(buf, z * planeSize);
    } else {
      const dest = data as Float32Array;
      const offset = z * planeSize;
      for (let i = 0; i < planeSize; i++) dest[offset + i] = buf[i];
    }
  }

  const sx = first.pixelSpacing.col;
  const sy = first.pixelSpacing.row;
  let sz = first.sliceThickness || 0;
  if ((!sz || sz <= 0) && instances.length > 1) {
    const a = instances[0].imagePositionPatient;
    const b = instances[1].imagePositionPatient;
    if (a && b) {
      sz = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
  }
  if (!sz || sz <= 0) sz = sy;

  return {
    data,
    dims: [cols, rows, slices],
    spacing: [sx, sy, sz],
    windowLevel: { ...first.windowLevel },
  };
}

export type BuildVolumeProgress = {
  loaded: number;
  total: number;
};

/**
 * Decode slices on demand and assemble a volume. Copies each plane immediately
 * so LRU eviction of instance pixels cannot corrupt the volume.
 */
export async function buildVolumeProgressive(
  series: DicomSeries,
  ensure: (instance: DicomSeries['instances'][number]) => Promise<void>,
  options?: {
    signal?: AbortSignal;
    onProgress?: (p: BuildVolumeProgress) => void;
  },
): Promise<VolumeData> {
  const instances = series.instances;
  if (instances.length === 0) throw new Error('Empty series');

  const signal = options?.signal;
  const throwIfAborted = () => {
    if (signal?.aborted) {
      const err = new Error('MPR build cancelled');
      err.name = 'AbortError';
      throw err;
    }
  };

  throwIfAborted();
  await ensure(instances[0]);
  throwIfAborted();

  const first = instances[0];
  const cols = first.columns;
  const rows = first.rows;
  const slices = instances.length;
  const planeSize = cols * rows;

  const preferInt16 = !!first.pixelsInt16;
  const data: Float32Array | Int16Array = preferInt16
    ? new Int16Array(planeSize * slices)
    : new Float32Array(planeSize * slices);

  const writePlane = (z: number, inst: DicomSeries['instances'][number]) => {
    if (inst.rows !== rows || inst.columns !== cols) {
      throw new Error('Inhomogeneous series dimensions — MPR requires uniform matrix');
    }
    const buf = getPixelBuffer(inst);
    if (!buf) throw new Error(`Missing pixels for slice ${z}`);
    if (preferInt16 && inst.pixelsInt16) {
      (data as Int16Array).set(inst.pixelsInt16, z * planeSize);
    } else if (buf instanceof Float32Array && !preferInt16) {
      (data as Float32Array).set(buf, z * planeSize);
    } else {
      const dest = data as Float32Array;
      const offset = z * planeSize;
      for (let i = 0; i < planeSize; i++) dest[offset + i] = buf[i];
    }
  };

  writePlane(0, first);
  options?.onProgress?.({ loaded: 1, total: slices });

  for (let z = 1; z < slices; z++) {
    throwIfAborted();
    await ensure(instances[z]);
    throwIfAborted();
    writePlane(z, instances[z]);
    options?.onProgress?.({ loaded: z + 1, total: slices });
  }

  const sx = first.pixelSpacing.col;
  const sy = first.pixelSpacing.row;
  let sz = first.sliceThickness || 0;
  if ((!sz || sz <= 0) && instances.length > 1) {
    const a = instances[0].imagePositionPatient;
    const b = instances[1].imagePositionPatient;
    if (a && b) {
      sz = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
  }
  if (!sz || sz <= 0) sz = sy;

  return {
    data,
    dims: [cols, rows, slices],
    spacing: [sx, sy, sz],
    windowLevel: { ...first.windowLevel },
  };
}

function index3(x: number, y: number, z: number, dims: [number, number, number]): number {
  const [nx, ny] = dims;
  return z * ny * nx + y * nx + x;
}

export function sampleVolume(
  volume: VolumeData,
  x: number,
  y: number,
  z: number,
): number {
  const [nx, ny, nz] = volume.dims;
  const xi = Math.min(nx - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(ny - 1, Math.max(0, Math.round(y)));
  const zi = Math.min(nz - 1, Math.max(0, Math.round(z)));
  return volume.data[index3(xi, yi, zi, volume.dims)];
}

export type MprSlice = {
  pixels: Float32Array;
  width: number;
  height: number;
  plane: MprPlane;
  index: number;
};

/**
 * Extract an orthogonal MPR plane at the given index.
 */
export function extractMprSlice(
  volume: VolumeData,
  plane: MprPlane,
  index: number,
): MprSlice {
  const [nx, ny, nz] = volume.dims;

  if (plane === 'axial') {
    const z = Math.min(nz - 1, Math.max(0, index));
    const pixels = new Float32Array(nx * ny);
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        pixels[y * nx + x] = volume.data[index3(x, y, z, volume.dims)];
      }
    }
    return { pixels, width: nx, height: ny, plane, index: z };
  }

  if (plane === 'coronal') {
    const y = Math.min(ny - 1, Math.max(0, index));
    const pixels = new Float32Array(nx * nz);
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        pixels[(nz - 1 - z) * nx + x] = volume.data[index3(x, y, z, volume.dims)];
      }
    }
    return { pixels, width: nx, height: nz, plane, index: y };
  }

  const x = Math.min(nx - 1, Math.max(0, index));
  const pixels = new Float32Array(ny * nz);
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      pixels[(nz - 1 - z) * ny + y] = volume.data[index3(x, y, z, volume.dims)];
    }
  }
  return { pixels, width: ny, height: nz, plane, index: x };
}

export function maxIndex(volume: VolumeData, plane: MprPlane): number {
  const [nx, ny, nz] = volume.dims;
  if (plane === 'axial') return nz - 1;
  if (plane === 'coronal') return ny - 1;
  return nx - 1;
}

export function defaultWl(volume: VolumeData): WindowLevel {
  return { ...volume.windowLevel };
}
