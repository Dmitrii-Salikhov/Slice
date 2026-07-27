import { describe, expect, it } from 'vitest';
import {
  buildVolumeGeometry,
  hasPatientGeometry,
  patientBounds,
  patientPlaneExtents,
  patientPlaneFrame,
  patientToVoxel,
  voxelToPatient,
} from '../src/viewer/volumeGeometry';
import { makeInstance, makeVolume } from './helpers';
import { dot } from '../src/viewer/math';

describe('volumeGeometry', () => {
  it('returns null without IOP/IPP or empty series', () => {
    expect(buildVolumeGeometry([], [1, 1, 1])).toBeNull();
    expect(
      buildVolumeGeometry(
        [
          makeInstance({
            imageOrientationPatient: null,
            imagePositionPatient: [0, 0, 0],
          }),
        ],
        [1, 1, 1],
      ),
    ).toBeNull();
    expect(
      buildVolumeGeometry(
        [
          makeInstance({
            imageOrientationPatient: {
              rowCosines: [1, 0, 0],
              colCosines: [0, 1, 0],
            },
            imagePositionPatient: null,
          }),
        ],
        [1, 1, 1],
      ),
    ).toBeNull();
  });

  it('maps DICOM row→axisX and column→axisY (not swapped)', () => {
    const g = buildVolumeGeometry(
      [
        makeInstance({
          imagePositionPatient: [10, 20, 30],
          imageOrientationPatient: {
            rowCosines: [1, 0, 0],
            colCosines: [0, 1, 0],
          },
        }),
        makeInstance({
          imagePositionPatient: [10, 20, 32],
          sopInstanceUID: 's2',
        }),
      ],
      [0.5, 0.5, 2],
    );
    expect(g).not.toBeNull();
    expect(g!.origin).toEqual([10, 20, 30]);
    expect(g!.axisX).toEqual([1, 0, 0]);
    expect(g!.axisY).toEqual([0, 1, 0]);
    expect(g!.axisZ[2]).toBeCloseTo(1);
    expect(g!.spacing).toEqual([0.5, 0.5, 2]);
  });

  it('flips axisZ to follow increasing IPP', () => {
    // row × col = +Z, but slices decrease in Z → flip
    const g = buildVolumeGeometry(
      [
        makeInstance({
          imagePositionPatient: [0, 0, 10],
          imageOrientationPatient: {
            rowCosines: [1, 0, 0],
            colCosines: [0, 1, 0],
          },
        }),
        makeInstance({
          imagePositionPatient: [0, 0, 8],
          sopInstanceUID: 's2',
        }),
      ],
      [1, 1, 2],
    );
    expect(g!.axisZ[2]).toBeCloseTo(-1);
  });

  it('voxelToPatient ↔ patientToVoxel round-trips', () => {
    const vol = makeVolume([5, 6, 7]);
    const patient = voxelToPatient(vol, { x: 2, y: 3, z: 4 });
    expect(patient).not.toBeNull();
    const back = patientToVoxel(vol, patient!);
    expect(back!.x).toBeCloseTo(2);
    expect(back!.y).toBeCloseTo(3);
    expect(back!.z).toBeCloseTo(4);
  });

  it('hasPatientGeometry and patientBounds cover corners', () => {
    const vol = makeVolume([3, 4, 5]);
    expect(hasPatientGeometry(vol)).toBe(true);
    const b = patientBounds(vol);
    expect(b).not.toBeNull();
    expect(b!.min[0]).toBe(0);
    expect(b!.max[0]).toBeCloseTo(2);
    expect(b!.max[1]).toBeCloseTo(3);
    expect(b!.max[2]).toBeCloseTo(4 * 2); // spacing z=2

    vol.geometry = null;
    expect(hasPatientGeometry(vol)).toBe(false);
    expect(patientBounds(vol)).toBeNull();
    expect(voxelToPatient(vol, { x: 0, y: 0, z: 0 })).toBeNull();
  });

  it('axial frame follows IOP; coronal/sagittal keep Superior at top', () => {
    const vol = makeVolume([8, 8, 8]);
    // 45° FOV in XY
    vol.geometry = {
      origin: [0, 0, 0],
      axisX: [Math.SQRT1_2, Math.SQRT1_2, 0],
      axisY: [-Math.SQRT1_2, Math.SQRT1_2, 0],
      axisZ: [0, 0, 1],
      spacing: [1, 1, 2],
    };

    const axial = patientPlaneFrame(vol, 'axial');
    expect(axial).not.toBeNull();
    expect(axial!.normal).toEqual([0, 0, 1]);
    expect(axial!.axisU[0]).toBeCloseTo(Math.SQRT1_2);
    expect(axial!.axisU[1]).toBeCloseTo(Math.SQRT1_2);
    expect(axial!.axisV[0]).toBeCloseTo(-Math.SQRT1_2);
    expect(axial!.axisV[1]).toBeCloseTo(Math.SQRT1_2);

    const coronal = patientPlaneFrame(vol, 'coronal');
    expect(coronal!.normal).toEqual([0, 1, 0]);
    expect(dot(coronal!.axisV, [0, 0, 1])).toBeLessThan(0); // image-down ≠ superior

    const sagittal = patientPlaneFrame(vol, 'sagittal');
    expect(sagittal!.normal).toEqual([1, 0, 0]);
    expect(dot(sagittal!.axisV, [0, 0, 1])).toBeLessThan(0);
    expect(dot(sagittal!.axisU, [0, 1, 0])).toBeGreaterThan(0); // anterior → right
  });

  it('patientPlaneExtents project volume onto plane axes', () => {
    const vol = makeVolume([4, 4, 4]);
    const ax = patientPlaneExtents(vol, 'axial');
    const cor = patientPlaneExtents(vol, 'coronal');
    const sag = patientPlaneExtents(vol, 'sagittal');
    expect(ax!.uMax - ax!.uMin).toBeGreaterThan(0);
    expect(cor!.vMax - cor!.vMin).toBeGreaterThan(0);
    expect(sag!.nMax - sag!.nMin).toBeGreaterThan(0);
  });
});
