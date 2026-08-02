import type {
  DicomInstance,
  DicomSeries,
  VolumeData,
  WindowLevel,
  MprPlane,
  MprBasis,
} from '../dicom/types';
import { getPixelBuffer } from '../dicom/parse';
import { buildVolumeGeometry, patientPlaneExtents, patientToVoxel, voxelToPatient } from './volumeGeometry';
import type { VolumeCursor } from './crosshair';
import { add, clamp, scale, type Vec3 } from './math';

function finishVolume(
  series: DicomSeries,
  data: Float32Array | Int16Array,
  dims: [number, number, number],
  spacing: [number, number, number],
  windowLevel: WindowLevel,
): VolumeData {
  const geometry = buildVolumeGeometry(series.instances, spacing);
  return { data, dims, spacing, windowLevel, geometry };
}

/**
 * Voxel Z spacing for the volume grid (mm between slice centers).
 * Prefer median IPP delta; Slice Thickness is reconstruction thickness, not step.
 */
export function estimateSliceSpacingMm(
  instances: DicomInstance[],
  fallbackRowSpacing = 1,
): number {
  const deltas: number[] = [];
  for (let i = 1; i < instances.length; i++) {
    const a = instances[i - 1].imagePositionPatient;
    const b = instances[i].imagePositionPatient;
    if (!a || !b) continue;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (d > 1e-6) deltas.push(d);
  }
  if (deltas.length > 0) {
    deltas.sort((x, y) => x - y);
    return deltas[Math.floor(deltas.length / 2)]!;
  }

  for (const inst of instances) {
    const sbs = inst.spacingBetweenSlices;
    if (sbs != null && sbs > 0) return sbs;
  }

  for (const inst of instances) {
    if (inst.sliceThickness > 0) return inst.sliceThickness;
  }

  return fallbackRowSpacing > 0 ? fallbackRowSpacing : 1;
}

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
  const sz = estimateSliceSpacingMm(instances, sy);

  return finishVolume(
    series,
    data,
    [cols, rows, slices],
    [sx, sy, sz],
    { ...first.windowLevel },
  );
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
  const sz = estimateSliceSpacingMm(instances, sy);

  return finishVolume(
    series,
    data,
    [cols, rows, slices],
    [sx, sy, sz],
    { ...first.windowLevel },
  );
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
  pixels: Float32Array | Int16Array;
  width: number;
  height: number;
  plane: MprPlane;
  index: number;
  /** Display spacing in mm for this plane (col = horizontal, row = vertical). */
  spacing: { col: number; row: number };
};

const sliceCaches = new WeakMap<VolumeData, Map<string, MprSlice>>();
const MAX_CACHED_SLICES = 48;

function sliceCacheKey(basis: MprBasis, plane: MprPlane, index: number): string {
  return `${basis}:${plane}:${index}`;
}

function rememberSlice(
  volume: VolumeData,
  basis: MprBasis,
  slice: MprSlice,
): MprSlice {
  let cache = sliceCaches.get(volume);
  if (!cache) {
    cache = new Map();
    sliceCaches.set(volume, cache);
  }
  const key = sliceCacheKey(basis, slice.plane, slice.index);
  cache.set(key, slice);
  while (cache.size > MAX_CACHED_SLICES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return slice;
}

function copyPlanePixels(
  src: Float32Array | Int16Array,
): Float32Array | Int16Array {
  return src instanceof Int16Array ? new Int16Array(src) : new Float32Array(src);
}

function allocPlane(size: number, data: Float32Array | Int16Array): Float32Array | Int16Array {
  return data instanceof Int16Array ? new Int16Array(size) : new Float32Array(size);
}

function sampleTrilinear(volume: VolumeData, x: number, y: number, z: number): number {
  const [nx, ny, nz] = volume.dims;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = Math.min(nx - 1, x0 + 1);
  const y1 = Math.min(ny - 1, y0 + 1);
  const z1 = Math.min(nz - 1, z0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const c000 = sampleVolume(volume, clamp(x0, 0, nx - 1), clamp(y0, 0, ny - 1), clamp(z0, 0, nz - 1));
  const c100 = sampleVolume(volume, x1, clamp(y0, 0, ny - 1), clamp(z0, 0, nz - 1));
  const c010 = sampleVolume(volume, clamp(x0, 0, nx - 1), y1, clamp(z0, 0, nz - 1));
  const c110 = sampleVolume(volume, x1, y1, clamp(z0, 0, nz - 1));
  const c001 = sampleVolume(volume, clamp(x0, 0, nx - 1), clamp(y0, 0, ny - 1), z1);
  const c101 = sampleVolume(volume, x1, clamp(y0, 0, ny - 1), z1);
  const c011 = sampleVolume(volume, clamp(x0, 0, nx - 1), y1, z1);
  const c111 = sampleVolume(volume, x1, y1, z1);
  const c00 = c000 * (1 - fx) + c100 * fx;
  const c10 = c010 * (1 - fx) + c110 * fx;
  const c01 = c001 * (1 - fx) + c101 * fx;
  const c11 = c011 * (1 - fx) + c111 * fx;
  const c0 = c00 * (1 - fy) + c10 * fy;
  const c1 = c01 * (1 - fy) + c11 * fy;
  return c0 * (1 - fz) + c1 * fz;
}

/** Stack-axis MPR (legacy / fallback). */
function extractStackMprSlice(
  volume: VolumeData,
  plane: MprPlane,
  index: number,
): MprSlice {
  const [nx, ny, nz] = volume.dims;
  const [sx, sy, sz] = volume.spacing;
  const data = volume.data;

  if (plane === 'axial') {
    const z = Math.min(nz - 1, Math.max(0, index));
    const start = z * ny * nx;
    // Copy — never return a live view into volume.data (shared buffer races with cache/GPU).
    const pixels = copyPlanePixels(data.subarray(start, start + nx * ny));
    return {
      pixels,
      width: nx,
      height: ny,
      plane,
      index: z,
      spacing: { col: sx, row: sy },
    };
  }

  if (plane === 'coronal') {
    const y = Math.min(ny - 1, Math.max(0, index));
    const pixels = allocPlane(nx * nz, data);
    for (let z = 0; z < nz; z++) {
      const destRow = (nz - 1 - z) * nx;
      const srcBase = z * ny * nx + y * nx;
      for (let x = 0; x < nx; x++) {
        pixels[destRow + x] = data[srcBase + x];
      }
    }
    return {
      pixels,
      width: nx,
      height: nz,
      plane,
      index: y,
      spacing: { col: sx, row: sz },
    };
  }

  const x = Math.min(nx - 1, Math.max(0, index));
  const pixels = allocPlane(ny * nz, data);
  for (let z = 0; z < nz; z++) {
    const destRow = (nz - 1 - z) * ny;
    for (let y = 0; y < ny; y++) {
      pixels[destRow + y] = data[z * ny * nx + y * nx + x];
    }
  }
  return {
    pixels,
    width: ny,
    height: nz,
    plane,
    index: x,
    spacing: { col: sy, row: sz },
  };
}

/**
 * RadiAnt-style MPR: anatomical normals in LPS, in-plane axes follow volume IOP
 * so axial matches the original series orientation (no 45° LPS twist).
 */
function extractPatientMprSlice(
  volume: VolumeData,
  plane: MprPlane,
  index: number,
): MprSlice | null {
  const extents = patientPlaneExtents(volume, plane);
  if (!extents) return null;
  const [sx, sy, sz] = volume.spacing;
  const { uMin, uMax, vMin, vMax, nMin, nMax, center, frame } = extents;

  const stepN =
    plane === 'axial' ? sz : plane === 'coronal' ? sy : sx;
  const stepU = plane === 'sagittal' ? sy : sx;
  const stepV = plane === 'axial' ? sy : sz;

  const nCount = Math.max(1, Math.round((nMax - nMin) / (stepN > 0 ? stepN : 1)));
  const width = Math.max(1, Math.round((uMax - uMin) / (stepU > 0 ? stepU : 1)));
  const height = Math.max(1, Math.round((vMax - vMin) / (stepV > 0 ? stepV : 1)));
  const zi = Math.min(nCount - 1, Math.max(0, index));
  const n = nMin + ((zi + 0.5) / nCount) * (nMax - nMin);

  const pixels = new Float32Array(width * height);
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const uu = uMin + ((u + 0.5) / width) * (uMax - uMin);
      const vv = vMin + ((v + 0.5) / height) * (vMax - vMin);
      const p: Vec3 = add(
        center,
        add(
          scale(frame.normal, n),
          add(scale(frame.axisU, uu), scale(frame.axisV, vv)),
        ),
      );
      const voxel = patientToVoxel(volume, p);
      pixels[v * width + u] = voxel
        ? sampleTrilinear(volume, voxel.x, voxel.y, voxel.z)
        : 0;
    }
  }

  return {
    pixels,
    width,
    height,
    plane,
    index: zi,
    spacing: {
      col: Math.abs(uMax - uMin) / width,
      row: Math.abs(vMax - vMin) / height,
    },
  };
}

export function resolveMprBasis(volume: VolumeData, requested: MprBasis): MprBasis {
  if (requested === 'patient' && volume.geometry) return 'patient';
  return 'stack';
}

/**
 * Extract an orthogonal MPR plane.
 * `basis: 'patient'` — RadiAnt-style anatomical LPS planes (falls back to stack if no geometry).
 * `basis: 'stack'` — cut along acquisition voxel axes (legacy).
 */
export function extractMprSlice(
  volume: VolumeData,
  plane: MprPlane,
  index: number,
  basis: MprBasis = 'patient',
): MprSlice {
  const resolved = resolveMprBasis(volume, basis);
  const cache = sliceCaches.get(volume);
  const key = sliceCacheKey(resolved, plane, index);
  const hit = cache?.get(key);
  if (hit && hit.plane === plane && hit.index === index) return hit;

  let slice: MprSlice;
  if (resolved === 'patient') {
    slice = extractPatientMprSlice(volume, plane, index) ?? extractStackMprSlice(volume, plane, index);
  } else {
    slice = extractStackMprSlice(volume, plane, index);
  }
  if (slice.plane !== plane) {
    slice = { ...slice, plane };
  }
  return rememberSlice(volume, resolved, slice);
}

export function maxIndex(
  volume: VolumeData,
  plane: MprPlane,
  basis: MprBasis = 'patient',
): number {
  const resolved = resolveMprBasis(volume, basis);
  if (resolved === 'stack') {
    const [nx, ny, nz] = volume.dims;
    if (plane === 'axial') return nz - 1;
    if (plane === 'coronal') return ny - 1;
    return nx - 1;
  }

  const extents = patientPlaneExtents(volume, plane);
  if (!extents) return maxIndex(volume, plane, 'stack');
  const [sx, sy, sz] = volume.spacing;
  const stepN = plane === 'axial' ? sz : plane === 'coronal' ? sy : sx;
  const n = Math.max(1, Math.round((extents.nMax - extents.nMin) / (stepN > 0 ? stepN : 1)));
  return n - 1;
}

/** Plane index implied by the current voxel cursor. */
export function planeIndexFromCursor(
  volume: VolumeData,
  plane: MprPlane,
  cursor: VolumeCursor,
  basis: MprBasis = 'patient',
): number {
  const resolved = resolveMprBasis(volume, basis);
  if (resolved === 'stack') {
    if (plane === 'axial') return Math.round(cursor.z);
    if (plane === 'coronal') return Math.round(cursor.y);
    return Math.round(cursor.x);
  }
  const extents = patientPlaneExtents(volume, plane);
  const patient = voxelToPatient(volume, cursor);
  if (!extents || !patient) return planeIndexFromCursor(volume, plane, cursor, 'stack');
  const [sx, sy, sz] = volume.spacing;
  const stepN = plane === 'axial' ? sz : plane === 'coronal' ? sy : sx;
  const nCount = Math.max(1, Math.round((extents.nMax - extents.nMin) / (stepN > 0 ? stepN : 1)));
  const rel = [
    patient[0] - extents.center[0],
    patient[1] - extents.center[1],
    patient[2] - extents.center[2],
  ] as Vec3;
  const nPos =
    rel[0] * extents.frame.normal[0] +
    rel[1] * extents.frame.normal[1] +
    rel[2] * extents.frame.normal[2];
  const t =
    nCount === 1 ? 0 : (nPos - extents.nMin) / (extents.nMax - extents.nMin || 1);
  // Bin i is centered at (i+0.5)/nCount; floor is stable under small patient↔voxel noise.
  return Math.min(nCount - 1, Math.max(0, Math.floor(t * nCount)));
}

/** Move cursor so the given plane shows `index` (keeps the other patient axes). */
export function cursorFromPlaneIndex(
  volume: VolumeData,
  plane: MprPlane,
  index: number,
  cursor: VolumeCursor,
  basis: MprBasis = 'patient',
): VolumeCursor {
  const resolved = resolveMprBasis(volume, basis);
  if (resolved === 'stack') {
    if (plane === 'axial') return { ...cursor, z: index };
    if (plane === 'coronal') return { ...cursor, y: index };
    return { ...cursor, x: index };
  }

  const extents = patientPlaneExtents(volume, plane);
  const patient = voxelToPatient(volume, cursor);
  if (!extents || !patient) {
    return cursorFromPlaneIndex(volume, plane, index, cursor, 'stack');
  }
  const [sx, sy, sz] = volume.spacing;
  const stepN = plane === 'axial' ? sz : plane === 'coronal' ? sy : sx;
  const nCount = Math.max(1, Math.round((extents.nMax - extents.nMin) / (stepN > 0 ? stepN : 1)));
  const zi = Math.min(nCount - 1, Math.max(0, index));
  const nTarget = extents.nMin + ((zi + 0.5) / nCount) * (extents.nMax - extents.nMin);

  const rel: Vec3 = [
    patient[0] - extents.center[0],
    patient[1] - extents.center[1],
    patient[2] - extents.center[2],
  ];
  const nCur =
    rel[0] * extents.frame.normal[0] +
    rel[1] * extents.frame.normal[1] +
    rel[2] * extents.frame.normal[2];
  const delta = nTarget - nCur;
  const next: Vec3 = [
    patient[0] + extents.frame.normal[0] * delta,
    patient[1] + extents.frame.normal[1] * delta,
    patient[2] + extents.frame.normal[2] * delta,
  ];
  return patientToVoxel(volume, next) ?? cursor;
}

/** Crosshair in plane image coords for the active basis. */
export function crosshairInMprPlane(
  volume: VolumeData,
  plane: MprPlane,
  cursor: VolumeCursor,
  basis: MprBasis,
  slice: MprSlice,
): { u: number; v: number } {
  const resolved = resolveMprBasis(volume, basis);
  if (resolved === 'stack') {
    const [, , nz] = volume.dims;
    if (plane === 'axial') return { u: cursor.x, v: cursor.y };
    if (plane === 'coronal') return { u: cursor.x, v: nz - 1 - cursor.z };
    return { u: cursor.y, v: nz - 1 - cursor.z };
  }

  const extents = patientPlaneExtents(volume, plane);
  const patient = voxelToPatient(volume, cursor);
  if (!extents || !patient) {
    return crosshairInMprPlane(volume, plane, cursor, 'stack', slice);
  }
  const rel: Vec3 = [
    patient[0] - extents.center[0],
    patient[1] - extents.center[1],
    patient[2] - extents.center[2],
  ];
  const uu =
    rel[0] * extents.frame.axisU[0] +
    rel[1] * extents.frame.axisU[1] +
    rel[2] * extents.frame.axisU[2];
  const vv =
    rel[0] * extents.frame.axisV[0] +
    rel[1] * extents.frame.axisV[1] +
    rel[2] * extents.frame.axisV[2];
  const { width, height } = slice;
  return {
    u: ((uu - extents.uMin) / (extents.uMax - extents.uMin || 1)) * width - 0.5,
    v: ((vv - extents.vMin) / (extents.vMax - extents.vMin || 1)) * height - 0.5,
  };
}

export function cursorFromMprPlaneClick(
  volume: VolumeData,
  plane: MprPlane,
  u: number,
  v: number,
  cursor: VolumeCursor,
  basis: MprBasis,
  slice: MprSlice,
): VolumeCursor {
  const resolved = resolveMprBasis(volume, basis);
  if (resolved === 'stack') {
    const [, , nz] = volume.dims;
    if (plane === 'axial') return { x: u, y: v, z: cursor.z };
    if (plane === 'coronal') return { x: u, y: cursor.y, z: nz - 1 - v };
    return { x: cursor.x, y: u, z: nz - 1 - v };
  }

  const extents = patientPlaneExtents(volume, plane);
  const patient = voxelToPatient(volume, cursor);
  if (!extents || !patient) {
    return cursorFromMprPlaneClick(volume, plane, u, v, cursor, 'stack', slice);
  }
  const { width, height } = slice;
  const uu = extents.uMin + ((u + 0.5) / width) * (extents.uMax - extents.uMin);
  const vv = extents.vMin + ((v + 0.5) / height) * (extents.vMax - extents.vMin);
  const rel: Vec3 = [
    patient[0] - extents.center[0],
    patient[1] - extents.center[1],
    patient[2] - extents.center[2],
  ];
  const nPos =
    rel[0] * extents.frame.normal[0] +
    rel[1] * extents.frame.normal[1] +
    rel[2] * extents.frame.normal[2];
  const next = add(
    extents.center,
    add(
      scale(extents.frame.normal, nPos),
      add(scale(extents.frame.axisU, uu), scale(extents.frame.axisV, vv)),
    ),
  );
  return patientToVoxel(volume, next) ?? cursor;
}

export function defaultWl(volume: VolumeData): WindowLevel {
  return { ...volume.windowLevel };
}
