import type { DicomInstance, VolumeData } from '../src/dicom/types';

export function makeInstance(
  overrides: Partial<DicomInstance> & {
    rows?: number;
    columns?: number;
    fill?: number;
  } = {},
): DicomInstance {
  const rows = overrides.rows ?? 4;
  const columns = overrides.columns ?? 4;
  const fill = overrides.fill ?? 0;
  const pixels =
    'pixels' in overrides
      ? overrides.pixels
      : overrides.pixelsInt16
        ? undefined
        : Float32Array.from({ length: rows * columns }, () => fill);

  return {
    filePath: overrides.filePath ?? '/tmp/a.dcm',
    sopInstanceUID: overrides.sopInstanceUID ?? 'sop-1',
    studyInstanceUID: overrides.studyInstanceUID ?? 'study-1',
    seriesInstanceUID: overrides.seriesInstanceUID ?? 'series-1',
    studyDescription: overrides.studyDescription ?? 'Study A',
    seriesDescription: overrides.seriesDescription ?? 'Series A',
    modality: overrides.modality ?? 'CT',
    patientName: overrides.patientName ?? 'Test^Patient',
    patientId: overrides.patientId ?? 'ID1',
    rows,
    columns,
    bitsAllocated: overrides.bitsAllocated ?? 16,
    bitsStored: overrides.bitsStored ?? 16,
    highBit: overrides.highBit ?? 15,
    pixelRepresentation: overrides.pixelRepresentation ?? 1,
    samplesPerPixel: overrides.samplesPerPixel ?? 1,
    photometricInterpretation: overrides.photometricInterpretation ?? 'MONOCHROME2',
    rescaleSlope: overrides.rescaleSlope ?? 1,
    rescaleIntercept: overrides.rescaleIntercept ?? 0,
    pixelSpacing: overrides.pixelSpacing ?? { row: 1, col: 1 },
    sliceThickness: overrides.sliceThickness ?? 1,
    imagePositionPatient:
      overrides.imagePositionPatient !== undefined
        ? overrides.imagePositionPatient
        : [0, 0, 0],
    imageOrientationPatient:
      overrides.imageOrientationPatient !== undefined
        ? overrides.imageOrientationPatient
        : {
            rowCosines: [1, 0, 0],
            colCosines: [0, 1, 0],
          },
    instanceNumber: overrides.instanceNumber ?? 1,
    windowLevel: overrides.windowLevel ?? { windowCenter: 40, windowWidth: 400 },
    transferSyntax: overrides.transferSyntax,
    pixelStatus: overrides.pixelStatus ?? (pixels || overrides.pixelsInt16 || overrides.colorRgba ? 'ready' : 'meta'),
    pixels,
    pixelsInt16: overrides.pixelsInt16,
    colorRgba: overrides.colorRgba,
  };
}

export function makeVolume(
  dims: [number, number, number] = [4, 4, 4],
  fill = (x: number, y: number, z: number) => x + y * 10 + z * 100,
): VolumeData {
  const [nx, ny, nz] = dims;
  const data = new Float32Array(nx * ny * nz);
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        data[z * ny * nx + y * nx + x] = fill(x, y, z);
      }
    }
  }
  return {
    data,
    dims,
    spacing: [1, 1, 2],
    windowLevel: { windowCenter: 40, windowWidth: 400 },
    geometry: {
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisY: [0, 1, 0],
      axisZ: [0, 0, 1],
      spacing: [1, 1, 2],
    },
  };
}

/** Encode a single 8-bit RLE segment (repeat-only for simplicity). */
export function encodeRleSegment(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const value = bytes[i];
    let run = 1;
    while (i + run < bytes.length && bytes[i + run] === value && run < 128) run++;
    out.push(run - 1, value);
    i += run;
  }
  return Uint8Array.from(out);
}

/** Build a minimal 8-bit single-segment RLE frame. */
export function encodeRle8(pixels: Uint8Array): Uint8Array {
  const segment = encodeRleSegment(pixels);
  const header = new ArrayBuffer(64);
  const view = new DataView(header);
  view.setUint32(0, 1, true); // 1 segment
  view.setUint32(4, 64, true); // offset to segment data
  return Uint8Array.from([...new Uint8Array(header), ...segment]);
}
