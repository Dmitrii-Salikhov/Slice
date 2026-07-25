import type { MprPlane, VolumeData } from '../dicom/types';
import { clamp, type Vec3, add, cross, normalize, scale } from './math';

export type VolumeCursor = {
  /** Voxel indices (continuous) in volume space [x, y, z] = [col, row, slice] */
  x: number;
  y: number;
  z: number;
};

export function cursorFromIndices(indices: Record<MprPlane, number>): VolumeCursor {
  return {
    x: indices.sagittal,
    y: indices.coronal,
    z: indices.axial,
  };
}

export function indicesFromCursor(cursor: VolumeCursor): Record<MprPlane, number> {
  return {
    axial: Math.round(cursor.z),
    coronal: Math.round(cursor.y),
    sagittal: Math.round(cursor.x),
  };
}

export function clampCursor(cursor: VolumeCursor, volume: VolumeData): VolumeCursor {
  const [nx, ny, nz] = volume.dims;
  return {
    x: clamp(cursor.x, 0, nx - 1),
    y: clamp(cursor.y, 0, ny - 1),
    z: clamp(cursor.z, 0, nz - 1),
  };
}

/** Crosshair position in plane image coords (pixel). */
export function crosshairInPlane(
  plane: MprPlane,
  cursor: VolumeCursor,
  dims: [number, number, number],
): { u: number; v: number } {
  const [, , nz] = dims;
  if (plane === 'axial') return { u: cursor.x, v: cursor.y };
  if (plane === 'coronal') return { u: cursor.x, v: nz - 1 - cursor.z };
  return { u: cursor.y, v: nz - 1 - cursor.z };
}

/** Update cursor from a click in plane image coords. */
export function cursorFromPlaneClick(
  plane: MprPlane,
  u: number,
  v: number,
  cursor: VolumeCursor,
  dims: [number, number, number],
): VolumeCursor {
  const [, , nz] = dims;
  if (plane === 'axial') return { x: u, y: v, z: cursor.z };
  if (plane === 'coronal') return { x: u, y: cursor.y, z: nz - 1 - v };
  return { x: cursor.x, y: u, z: nz - 1 - v };
}

export type ObliquePlane = {
  /** Center in voxel coordinates */
  origin: Vec3;
  /** Unit axes in voxel space (not mm) */
  axisU: Vec3;
  axisV: Vec3;
  width: number;
  height: number;
};

export function defaultOblique(volume: VolumeData): ObliquePlane {
  const [nx, ny, nz] = volume.dims;
  return {
    origin: [(nx - 1) / 2, (ny - 1) / 2, (nz - 1) / 2],
    axisU: [1, 0, 0],
    axisV: [0, 1, 0],
    width: nx,
    height: ny,
  };
}

/** Rotate oblique plane: yaw around Z, pitch around local X. Angles in degrees. */
export function rotateOblique(
  base: ObliquePlane,
  yawDeg: number,
  pitchDeg: number,
): ObliquePlane {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  // Start from axial (U=X, V=Y, N=Z), apply yaw then pitch
  let axisU: Vec3 = [cy, sy, 0];
  let axisV: Vec3 = [-sy * sp, cy * sp, cp];
  // Re-orthonormalize
  const normal = normalize(cross(axisU, axisV));
  axisU = normalize(axisU);
  axisV = normalize(cross(normal, axisU));

  return { ...base, axisU, axisV };
}

function sampleTrilinear(volume: VolumeData, x: number, y: number, z: number): number {
  const [nx, ny, nz] = volume.dims;
  if (x < 0 || y < 0 || z < 0 || x > nx - 1 || y > ny - 1 || z > nz - 1) return 0;

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = Math.min(nx - 1, x0 + 1);
  const y1 = Math.min(ny - 1, y0 + 1);
  const z1 = Math.min(nz - 1, z0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;

  const idx = (xi: number, yi: number, zi: number) => zi * ny * nx + yi * nx + xi;
  const c000 = volume.data[idx(x0, y0, z0)];
  const c100 = volume.data[idx(x1, y0, z0)];
  const c010 = volume.data[idx(x0, y1, z0)];
  const c110 = volume.data[idx(x1, y1, z0)];
  const c001 = volume.data[idx(x0, y0, z1)];
  const c101 = volume.data[idx(x1, y0, z1)];
  const c011 = volume.data[idx(x0, y1, z1)];
  const c111 = volume.data[idx(x1, y1, z1)];

  const c00 = c000 * (1 - fx) + c100 * fx;
  const c10 = c010 * (1 - fx) + c110 * fx;
  const c01 = c001 * (1 - fx) + c101 * fx;
  const c11 = c011 * (1 - fx) + c111 * fx;
  const c0 = c00 * (1 - fy) + c10 * fy;
  const c1 = c01 * (1 - fy) + c11 * fy;
  return c0 * (1 - fz) + c1 * fz;
}

export type ObliqueSlice = {
  pixels: Float32Array;
  width: number;
  height: number;
  /** Approximate in-plane spacing (mm) along U/V */
  spacing: [number, number];
};

export function extractObliqueSlice(
  volume: VolumeData,
  plane: ObliquePlane,
): ObliqueSlice {
  const { origin, axisU, axisV, width, height } = plane;
  const pixels = new Float32Array(width * height);
  const halfW = (width - 1) / 2;
  const halfH = (height - 1) / 2;

  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const du = u - halfW;
      const dv = v - halfH;
      const p = add(origin, add(scale(axisU, du), scale(axisV, dv)));
      pixels[v * width + u] = sampleTrilinear(volume, p[0], p[1], p[2]);
    }
  }

  // Spacing ≈ voxel spacing projected onto axes
  const [sx, sy, sz] = volume.spacing;
  const spacingU = Math.hypot(axisU[0] * sx, axisU[1] * sy, axisU[2] * sz);
  const spacingV = Math.hypot(axisV[0] * sx, axisV[1] * sy, axisV[2] * sz);

  return { pixels, width, height, spacing: [spacingU, spacingV] };
}

export function setObliqueCenter(plane: ObliquePlane, cursor: VolumeCursor): ObliquePlane {
  return {
    ...plane,
    origin: [cursor.x, cursor.y, cursor.z],
  };
}

export function probeVolume(volume: VolumeData, cursor: VolumeCursor): number {
  return sampleTrilinear(volume, cursor.x, cursor.y, cursor.z);
}

export function moveCursorAlongNormal(
  cursor: VolumeCursor,
  plane: ObliquePlane,
  delta: number,
): VolumeCursor {
  const n = normalize(cross(plane.axisU, plane.axisV));
  const p = add([cursor.x, cursor.y, cursor.z], scale(n, delta));
  return { x: p[0], y: p[1], z: p[2] };
}

export function planeNormal(plane: ObliquePlane): Vec3 {
  return normalize(cross(plane.axisU, plane.axisV));
}

export function offsetOrigin(plane: ObliquePlane, delta: number): ObliquePlane {
  return {
    ...plane,
    origin: add(plane.origin, scale(planeNormal(plane), delta)),
  };
}
