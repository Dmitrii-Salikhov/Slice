/** Shared DICOM domain types */

export type WindowLevel = {
  windowCenter: number;
  windowWidth: number;
};

export type PixelSpacing = {
  row: number;
  col: number;
};

export type ImageOrientation = {
  rowCosines: [number, number, number];
  colCosines: [number, number, number];
};

export type DicomInstance = {
  filePath: string;
  sopInstanceUID: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  studyDescription: string;
  seriesDescription: string;
  modality: string;
  patientName: string;
  patientId: string;
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  highBit: number;
  pixelRepresentation: number; // 0 unsigned, 1 signed
  samplesPerPixel: number;
  photometricInterpretation: string;
  rescaleSlope: number;
  rescaleIntercept: number;
  pixelSpacing: PixelSpacing;
  sliceThickness: number;
  imagePositionPatient: [number, number, number] | null;
  imageOrientationPatient: ImageOrientation | null;
  instanceNumber: number;
  windowLevel: WindowLevel;
  transferSyntax?: string;
  numberOfFrames?: number;
  frameIndex?: number;
  frameTimeMs?: number;
  planarConfiguration?: number;
  sopClassUID?: string;
  /** Lazy pixel load status */
  pixelStatus?: 'meta' | 'ready' | 'error';
  /**
   * Modality pixel values (slope/intercept already applied).
   * Prefer pixelsInt16 when present for memory; otherwise Float32.
   */
  pixels?: Float32Array;
  /** Compact mono storage (modality values rounded to int16) */
  pixelsInt16?: Int16Array;
  /** Optional RGBA color buffer for RGB/YBR images */
  colorRgba?: Uint8ClampedArray;
};

export type ViewerTool =
  | 'scroll'
  | 'wl'
  | 'zoom'
  | 'pan'
  | 'crosshair'
  | 'length'
  | 'probe'
  | 'angle'
  | 'roi'
  | 'arrow';

type AnnotationBase = {
  id: string;
  sliceIndex: number;
};

export type LengthMeasure = AnnotationBase & {
  kind: 'length';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  mm: number;
};

export type AngleMeasure = AnnotationBase & {
  kind: 'angle';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  deg: number;
};

export type RoiMeasure = AnnotationBase & {
  kind: 'roi';
  /** Default ellipse (RadiAnt-style). Legacy files may omit → treat as ellipse. */
  shape?: 'rect' | 'ellipse';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  mean: number;
  sd: number;
  min?: number;
  max?: number;
  areaMm2: number;
};

export type ArrowAnnotation = AnnotationBase & {
  kind: 'arrow';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  label?: string;
};

export type Annotation = LengthMeasure | AngleMeasure | RoiMeasure | ArrowAnnotation;

/** @deprecated use Annotation */
export type Measure = LengthMeasure;

export type DicomSeries = {
  seriesInstanceUID: string;
  studyInstanceUID: string;
  seriesDescription: string;
  modality: string;
  patientName: string;
  patientId: string;
  studyDescription: string;
  instances: DicomInstance[];
  /** Non-image document (PDF/SR) when present — instances may be empty */
  document?: import('./documents').DicomDocument;
};

export type DicomStudy = {
  studyInstanceUID: string;
  studyDescription: string;
  patientName: string;
  patientId: string;
  series: DicomSeries[];
};

export type VolumeGeometry = {
  /** Patient LPS (mm) of voxel index (0,0,0) — DICOM Image Position Patient */
  origin: [number, number, number];
  /** Unit direction of +column (DICOM IOP column cosines) */
  axisX: [number, number, number];
  /** Unit direction of +row (DICOM IOP row cosines) */
  axisY: [number, number, number];
  /** Unit direction of +slice (toward increasing stack index) */
  axisZ: [number, number, number];
  /** Copy of volume spacing [sx, sy, sz] used when geometry was built */
  spacing: [number, number, number];
};

export type VolumeData = {
  /** Flattened [z][y][x] — Float32 or packed Int16 modality values */
  data: Float32Array | Int16Array;
  dims: [number, number, number]; // [cols, rows, slices] = [x, y, z]
  spacing: [number, number, number]; // [sx, sy, sz]
  windowLevel: WindowLevel;
  /** Patient-space frame (RadiAnt-style). Absent → stack-only MPR. */
  geometry?: VolumeGeometry | null;
};

/** How orthogonal MPR planes are defined. */
export type MprBasis = 'patient' | 'stack';

export type MprPlane = 'axial' | 'sagittal' | 'coronal';

export type ViewportState = {
  sliceIndex: number;
  windowLevel: WindowLevel;
  zoom: number;
  panX: number;
  panY: number;
};
