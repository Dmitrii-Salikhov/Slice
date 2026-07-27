import { describe, expect, it } from 'vitest';
import {
  annotationHitSlop,
  finishAngle,
  finishEllipseRoi,
  finishLength,
  hitTestAnnotation,
  isAnnotationVisible,
  isMeasureTool,
  isNavTool,
  pickAnnotation,
} from '../src/viewer/annotationTools';
import type { Annotation } from '../src/dicom/types';

describe('annotationTools', () => {
  it('finishLength computes mm and rejects tiny drags', () => {
    const ok = finishLength(
      { x0: 0, y0: 0, x1: 10, y1: 0 },
      0.5,
      0.5,
      { sliceIndex: 3 },
      'L1',
    );
    expect(ok).toMatchObject({ kind: 'length', id: 'L1', sliceIndex: 3, mm: 5 });
    expect(ok?.mprPlane).toBeUndefined();

    const mpr = finishLength(
      { x0: 0, y0: 0, x1: 0, y1: 20 },
      1,
      2,
      { sliceIndex: 1, mprPlane: 'sagittal' },
      'L2',
    );
    expect(mpr?.mm).toBeCloseTo(40);
    expect(mpr?.mprPlane).toBe('sagittal');

    expect(
      finishLength({ x0: 0, y0: 0, x1: 0.01, y1: 0 }, 1, 1, { sliceIndex: 0 }),
    ).toBeNull();
  });

  it('finishAngle measures vertex angle in mm space', () => {
    const ann = finishAngle(
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      1,
      1,
      { sliceIndex: 0, mprPlane: 'axial' },
      'A1',
    );
    expect(ann?.deg).toBeCloseTo(90, 5);
    expect(ann?.mprPlane).toBe('axial');
  });

  it('finishEllipseRoi returns stats for bright region', () => {
    const w = 32;
    const h = 32;
    const pixels = new Float32Array(w * h);
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) pixels[y * w + x] = 100;
    }
    const result = finishEllipseRoi(
      { x0: 8, y0: 8, x1: 24, y1: 24 },
      pixels,
      w,
      h,
      1,
      1,
      { sliceIndex: 2, mprPlane: 'coronal' },
      'R1',
    );
    expect(result).not.toBeNull();
    expect(result!.annotation.kind).toBe('roi');
    expect(result!.annotation.shape).toBe('ellipse');
    expect(result!.annotation.mean).toBeGreaterThan(50);
    expect(result!.annotation.areaMm2).toBeGreaterThan(0);
    expect(
      finishEllipseRoi({ x0: 0, y0: 0, x1: 1, y1: 1 }, pixels, w, h, 1, 1, {
        sliceIndex: 0,
      }),
    ).toBeNull();
  });

  it('isAnnotationVisible separates stack vs MPR planes', () => {
    const stack: Annotation = {
      kind: 'length',
      id: '1',
      sliceIndex: 5,
      x0: 0,
      y0: 0,
      x1: 1,
      y1: 0,
      mm: 1,
    };
    const mprAx: Annotation = { ...stack, id: '2', mprPlane: 'axial', sliceIndex: 2 };
    const mprCor: Annotation = { ...stack, id: '3', mprPlane: 'coronal', sliceIndex: 2 };

    expect(isAnnotationVisible(stack, { sliceIndex: 5 })).toBe(true);
    expect(isAnnotationVisible(stack, { sliceIndex: 4 })).toBe(false);
    expect(isAnnotationVisible(mprAx, { sliceIndex: 5 })).toBe(false);

    expect(isAnnotationVisible(mprAx, { mprPlane: 'axial', sliceIndex: 2 })).toBe(true);
    expect(isAnnotationVisible(mprAx, { mprPlane: 'axial', sliceIndex: 1 })).toBe(false);
    expect(isAnnotationVisible(mprCor, { mprPlane: 'axial', sliceIndex: 2 })).toBe(false);
    expect(isAnnotationVisible(stack, { mprPlane: 'axial', sliceIndex: 5 })).toBe(false);
  });

  it('isMeasureTool detects annotation tools', () => {
    expect(isMeasureTool('length')).toBe(true);
    expect(isMeasureTool('angle')).toBe(true);
    expect(isMeasureTool('roi')).toBe(true);
    expect(isMeasureTool('scroll')).toBe(false);
    expect(isMeasureTool('crosshair')).toBe(false);
  });

  it('isNavTool and annotationHitSlop', () => {
    expect(isNavTool('pan')).toBe(true);
    expect(isNavTool('wl')).toBe(true);
    expect(isNavTool('length')).toBe(false);
    expect(annotationHitSlop(1)).toBe(8);
    expect(annotationHitSlop(2)).toBe(4);
    expect(annotationHitSlop(0.5)).toBe(16);
  });

  it('hitTestAnnotation and pickAnnotation', () => {
    const length: Annotation = {
      kind: 'length',
      id: 'L',
      sliceIndex: 0,
      x0: 0,
      y0: 0,
      x1: 100,
      y1: 0,
      mm: 100,
    };
    const roi: Annotation = {
      kind: 'roi',
      shape: 'ellipse',
      id: 'R',
      sliceIndex: 0,
      x0: 10,
      y0: 10,
      x1: 50,
      y1: 40,
      mean: 1,
      sd: 0,
      areaMm2: 1,
    };
    const angle: Annotation = {
      kind: 'angle',
      id: 'A',
      sliceIndex: 0,
      x0: 0,
      y0: 50,
      x1: 20,
      y1: 50,
      x2: 20,
      y2: 70,
      deg: 90,
    };
    const otherSlice: Annotation = { ...length, id: 'X', sliceIndex: 1 };

    expect(hitTestAnnotation(length, { x: 50, y: 0 }, 4)).toBe(true);
    expect(hitTestAnnotation(length, { x: 50, y: 20 }, 4)).toBe(false);
    expect(hitTestAnnotation(roi, { x: 30, y: 25 }, 4)).toBe(true);
    expect(hitTestAnnotation(angle, { x: 20, y: 60 }, 4)).toBe(true);

    const picked = pickAnnotation(
      [length, roi, angle, otherSlice],
      { x: 30, y: 25 },
      4,
      { sliceIndex: 0 },
    );
    expect(picked?.id).toBe('R');

    expect(
      pickAnnotation([length, otherSlice], { x: 50, y: 0 }, 4, { sliceIndex: 1 })?.id,
    ).toBe('X');
    expect(
      pickAnnotation([length], { x: 50, y: 40 }, 4, { sliceIndex: 0 }),
    ).toBeNull();
  });
});
