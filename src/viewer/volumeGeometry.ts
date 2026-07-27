import type { DicomInstance, MprPlane, VolumeData, VolumeGeometry } from '../dicom/types';
import type { VolumeCursor } from './crosshair';
import { type Vec3, add, cross, normalize, scale, sub, dot } from './math';

function asVec3(a: number[]): Vec3 {
  return [a[0], a[1], a[2]];
}

function len(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/**
 * Build patient-space geometry from a sorted series (RadiAnt-style LPS).
 * Returns null when IOP/IPP are missing or inconsistent.
 */
export function buildVolumeGeometry(
  instances: DicomInstance[],
  spacing: [number, number, number],
): VolumeGeometry | null {
  if (instances.length === 0) return null;
  const first = instances[0];
  const iop = first.imageOrientationPatient;
  const ipp = first.imagePositionPatient;
  if (!iop || !ipp) return null;

  // DICOM IOP: row direction = increasing column (voxel X), column direction = increasing row (voxel Y).
  const axisX = normalize(asVec3(iop.rowCosines));
  const axisY = normalize(asVec3(iop.colCosines));
  if (len(axisX) < 0.5 || len(axisY) < 0.5) return null;

  let axisZ = normalize(cross(axisX, axisY));
  if (instances.length > 1) {
    const last = instances[instances.length - 1].imagePositionPatient;
    if (last) {
      const delta = sub(asVec3(last), asVec3(ipp));
      if (len(delta) > 1e-6) {
        const fromIpp = normalize(delta);
        // Flip Z so it points along increasing slice index.
        if (dot(fromIpp, axisZ) < 0) axisZ = scale(axisZ, -1);
        // Prefer IPP-derived direction when gantry tilt differs slightly from IOP normal.
        if (Math.abs(dot(fromIpp, axisZ)) > 0.5) {
          axisZ = fromIpp;
        }
      }
    }
  }

  return {
    origin: asVec3(ipp),
    axisX,
    axisY,
    axisZ,
    spacing,
  };
}

export function voxelToPatient(
  volume: VolumeData,
  voxel: { x: number; y: number; z: number } | VolumeCursor,
): Vec3 | null {
  const g = volume.geometry;
  if (!g) return null;
  const [sx, sy, sz] = volume.spacing;
  return add(
    g.origin,
    add(
      scale(g.axisX, voxel.x * sx),
      add(scale(g.axisY, voxel.y * sy), scale(g.axisZ, voxel.z * sz)),
    ),
  );
}

export function patientToVoxel(volume: VolumeData, patient: Vec3): VolumeCursor | null {
  const g = volume.geometry;
  if (!g) return null;
  const [sx, sy, sz] = volume.spacing;
  const v = sub(patient, g.origin);
  return {
    x: dot(v, g.axisX) / (sx || 1),
    y: dot(v, g.axisY) / (sy || 1),
    z: dot(v, g.axisZ) / (sz || 1),
  };
}

export type PatientBounds = {
  min: Vec3;
  max: Vec3;
};

/** Axis-aligned bounds of the volume in patient LPS (mm). */
export function patientBounds(volume: VolumeData): PatientBounds | null {
  const g = volume.geometry;
  if (!g) return null;
  const [nx, ny, nz] = volume.dims;
  const corners: Array<[number, number, number]> = [
    [0, 0, 0],
    [nx - 1, 0, 0],
    [0, ny - 1, 0],
    [nx - 1, ny - 1, 0],
    [0, 0, nz - 1],
    [nx - 1, 0, nz - 1],
    [0, ny - 1, nz - 1],
    [nx - 1, ny - 1, nz - 1],
  ];
  let min: Vec3 = [Infinity, Infinity, Infinity];
  let max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const [x, y, z] of corners) {
    const p = voxelToPatient(volume, { x, y, z });
    if (!p) return null;
    min = [Math.min(min[0], p[0]), Math.min(min[1], p[1]), Math.min(min[2], p[2])];
    max = [Math.max(max[0], p[0]), Math.max(max[1], p[1]), Math.max(max[2], p[2])];
  }
  return { min, max };
}

export function hasPatientGeometry(volume: VolumeData): boolean {
  return !!volume.geometry;
}

function reject(v: Vec3, normal: Vec3): Vec3 {
  return sub(v, scale(normal, dot(v, normal)));
}

export type PatientPlaneFrame = {
  /** Anatomical plane normal in LPS */
  normal: Vec3;
  /** Image +U (rightward) in LPS */
  axisU: Vec3;
  /** Image +V (downward) in LPS — chosen so Superior is toward the top when possible */
  axisV: Vec3;
};

/**
 * RadiAnt-like plane frame: anatomical normals in LPS.
 * Axial keeps acquisition IOP in-plane (no LPS AABB twist).
 * Coronal / sagittal keep Superior at the top of the image.
 */
export function patientPlaneFrame(
  volume: VolumeData,
  plane: MprPlane,
): PatientPlaneFrame | null {
  const g = volume.geometry;
  if (!g) return null;

  const normal: Vec3 =
    plane === 'axial' ? [0, 0, 1] : plane === 'coronal' ? [0, 1, 0] : [1, 0, 0];

  if (plane === 'axial') {
    // Acquisition axes: axisX = image right, axisY = image down (DICOM row/col).
    let axisU = reject(g.axisX, normal);
    let axisV = reject(g.axisY, normal);
    const uLen = Math.hypot(axisU[0], axisU[1], axisU[2]);
    const vLen = Math.hypot(axisV[0], axisV[1], axisV[2]);

    if (uLen < 0.2 && vLen < 0.2) {
      axisU = reject(Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], normal);
      axisU = normalize(axisU);
      axisV = normalize(cross(normal, axisU));
    } else if (uLen < 0.2) {
      axisV = normalize(axisV);
      axisU = normalize(cross(axisV, normal));
    } else if (vLen < 0.2) {
      axisU = normalize(axisU);
      axisV = normalize(cross(normal, axisU));
    } else {
      axisU = normalize(axisU);
      axisV = normalize(axisV);
      if (dot(cross(axisU, axisV), normal) < 0) {
        axisV = scale(axisV, -1);
      }
    }
    return { normal, axisU, axisV };
  }

  // Coronal / sagittal: SI must be vertical (Superior at top), not taken from axial IOP.
  const superior: Vec3 = [0, 0, 1];
  const anterior: Vec3 = [0, 1, 0];
  const lpsX: Vec3 = [1, 0, 0];

  // Horizontal: follow acquisition axis projected into the plane, stripped of SI.
  const preferred = plane === 'sagittal' ? g.axisY : g.axisX;
  let axisU = reject(reject(preferred, normal), superior);
  if (Math.hypot(axisU[0], axisU[1], axisU[2]) < 0.2) {
    const fallback = plane === 'sagittal' ? anterior : lpsX;
    axisU = reject(reject(fallback, normal), superior);
  }
  axisU = normalize(axisU);

  // Image-down ≈ inferior (matches stack coronal/sagittal flip of Z).
  let axisV = normalize(reject(scale(superior, -1), normal));
  axisV = normalize(reject(axisV, axisU));
  if (dot(axisV, superior) > 0) axisV = scale(axisV, -1);

  // Match stack left/right: sagittal anterior→right, coronal +X→right.
  if (plane === 'sagittal' && dot(axisU, anterior) < 0) axisU = scale(axisU, -1);
  if (plane === 'coronal' && dot(axisU, lpsX) < 0) axisU = scale(axisU, -1);

  return { normal, axisU, axisV };
}

export type PatientPlaneExtents = {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  nMin: number;
  nMax: number;
  center: Vec3;
  frame: PatientPlaneFrame;
};

/** Project volume corners onto a patient plane frame. */
export function patientPlaneExtents(
  volume: VolumeData,
  plane: MprPlane,
): PatientPlaneExtents | null {
  const frame = patientPlaneFrame(volume, plane);
  if (!frame) return null;
  const [nx, ny, nz] = volume.dims;
  const mid = voxelToPatient(volume, {
    x: (nx - 1) / 2,
    y: (ny - 1) / 2,
    z: (nz - 1) / 2,
  });
  if (!mid) return null;

  const corners: Array<[number, number, number]> = [
    [0, 0, 0],
    [nx - 1, 0, 0],
    [0, ny - 1, 0],
    [nx - 1, ny - 1, 0],
    [0, 0, nz - 1],
    [nx - 1, 0, nz - 1],
    [0, ny - 1, nz - 1],
    [nx - 1, ny - 1, nz - 1],
  ];

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  let nMin = Infinity;
  let nMax = -Infinity;
  for (const [x, y, z] of corners) {
    const p = voxelToPatient(volume, { x, y, z });
    if (!p) return null;
    const d = sub(p, mid);
    const u = dot(d, frame.axisU);
    const v = dot(d, frame.axisV);
    const n = dot(d, frame.normal);
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
    nMin = Math.min(nMin, n);
    nMax = Math.max(nMax, n);
  }

  return { uMin, uMax, vMin, vMax, nMin, nMax, center: mid, frame };
}
