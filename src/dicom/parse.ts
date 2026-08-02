import type { DicomInstance, WindowLevel } from './types';
import { decodePixelData, readTransferSyntax } from './decode';
import {
  extractEncapsulatedDocument,
  extractSrText,
  isDocumentSop,
  isEncapsulatedPdf,
  isStructuredReport,
  type DicomDocument,
} from './documents';

type DatasetLike = {
  string?: (tag: string) => string | undefined;
  uint16?: (tag: string) => number | undefined;
  elements?: Record<string, { dataOffset: number; length: number }>;
};

function firstNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const part = value.split('\\')[0];
  const n = Number(part);
  return Number.isFinite(n) ? n : fallback;
}

function parseFloatArray(value: string | undefined, expected: number): number[] | null {
  if (!value) return null;
  const parts = value.split('\\').map(Number);
  if (parts.length < expected || parts.some((n) => !Number.isFinite(n))) return null;
  return parts.slice(0, expected);
}

function defaultWindowLevel(
  pixels: ArrayLike<number>,
): WindowLevel {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { windowCenter: 0, windowWidth: 1 };
  }
  const width = max - min;
  return { windowCenter: min + width / 2, windowWidth: Math.max(1, width) };
}

/** Pack modality float values into Int16 when they fit. */
export function packModalityInt16(pixels: Float32Array): Int16Array | null {
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    if (!Number.isFinite(v) || v < -32768 || v > 32767) return null;
  }
  const out = new Int16Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    out[i] = Math.round(pixels[i]);
  }
  return out;
}

function buildMetaInstances(
  dataSet: DatasetLike,
  filePath: string,
  meta: {
    sopInstanceUID: string;
    sopClassUID: string;
    studyInstanceUID: string;
    seriesInstanceUID: string;
    studyDescription: string;
    seriesDescription: string;
    modality: string;
    patientName: string;
    patientId: string;
  },
): DicomInstance[] {
  const rows = dataSet.uint16?.('x00280010') ?? 0;
  const columns = dataSet.uint16?.('x00280011') ?? 0;
  if (!rows || !columns) {
    throw new Error(
      meta.sopClassUID
        ? `Unsupported SOP Class (no image pixels): ${meta.sopClassUID}`
        : 'Missing Rows/Columns',
    );
  }

  const bitsAllocated = dataSet.uint16?.('x00280100') ?? 16;
  const bitsStored = dataSet.uint16?.('x00280101') ?? bitsAllocated;
  const highBit = dataSet.uint16?.('x00280102') ?? bitsStored - 1;
  const pixelRepresentation = dataSet.uint16?.('x00280103') ?? 0;
  const samplesPerPixel = dataSet.uint16?.('x00280002') ?? 1;
  const photometricInterpretation = dataSet.string?.('x00280004') ?? 'MONOCHROME2';
  const planarConfiguration = dataSet.uint16?.('x00280006') ?? 0;
  const transferSyntax = readTransferSyntax(dataSet as Parameters<typeof readTransferSyntax>[0]);
  const numberOfFrames = Math.max(1, firstNumber(dataSet.string?.('x00280008'), 1));
  const frameTimeMs = (() => {
    const ft = firstNumber(dataSet.string?.('x00181063'), 0);
    if (ft > 0) return ft;
    const rate = firstNumber(dataSet.string?.('x00180040'), 0);
    return rate > 0 ? 1000 / rate : undefined;
  })();

  const slope = firstNumber(dataSet.string?.('x00281053'), 1);
  const intercept = firstNumber(dataSet.string?.('x00281052'), 0);

  const spacingParts = parseFloatArray(dataSet.string?.('x00280030'), 2);
  const pixelSpacing = {
    row: spacingParts?.[0] ?? 1,
    col: spacingParts?.[1] ?? spacingParts?.[0] ?? 1,
  };

  const ipp = parseFloatArray(dataSet.string?.('x00200032'), 3) as
    | [number, number, number]
    | null;
  const iop = parseFloatArray(dataSet.string?.('x00200037'), 6);
  const imageOrientationPatient = iop
    ? {
        rowCosines: [iop[0], iop[1], iop[2]] as [number, number, number],
        colCosines: [iop[3], iop[4], iop[5]] as [number, number, number],
      }
    : null;

  const wcTag = dataSet.string?.('x00281050');
  const wwTag = dataSet.string?.('x00281051');
  const instanceNumber = firstNumber(dataSet.string?.('x00200013'), 0);
  const windowLevel: WindowLevel =
    wcTag && wwTag
      ? {
          windowCenter: firstNumber(wcTag, 0),
          windowWidth: Math.max(1, firstNumber(wwTag, 1)),
        }
      : { windowCenter: 40, windowWidth: 400 };

  const instances: DicomInstance[] = [];
  for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
    instances.push({
      filePath,
      sopInstanceUID:
        numberOfFrames > 1
          ? `${meta.sopInstanceUID}:${frameIndex}`
          : meta.sopInstanceUID,
      sopClassUID: meta.sopClassUID,
      studyInstanceUID: meta.studyInstanceUID,
      seriesInstanceUID: meta.seriesInstanceUID,
      studyDescription: meta.studyDescription,
      seriesDescription: meta.seriesDescription,
      modality: meta.modality,
      patientName: meta.patientName,
      patientId: meta.patientId,
      rows,
      columns,
      bitsAllocated,
      bitsStored,
      highBit,
      pixelRepresentation,
      samplesPerPixel,
      photometricInterpretation,
      planarConfiguration,
      rescaleSlope: slope,
      rescaleIntercept: intercept,
      pixelSpacing,
      sliceThickness: firstNumber(dataSet.string?.('x00180050'), 0),
      spacingBetweenSlices: (() => {
        const v = firstNumber(dataSet.string?.('x00180088'), 0);
        return v > 0 ? v : undefined;
      })(),
      imagePositionPatient: ipp,
      imageOrientationPatient,
      instanceNumber: numberOfFrames > 1 ? instanceNumber * 1000 + frameIndex : instanceNumber,
      windowLevel,
      transferSyntax,
      numberOfFrames,
      frameIndex,
      frameTimeMs,
      pixelStatus: 'meta',
    });
  }
  return instances;
}

export type ParseResult =
  | { kind: 'image'; instances: DicomInstance[] }
  | { kind: 'document'; document: DicomDocument };

/**
 * Fast metadata-only parse (no pixel decode). Multiframe → N meta instances.
 */
export async function parseDicomMeta(
  arrayBuffer: ArrayBuffer,
  filePath: string,
): Promise<ParseResult> {
  const dicomParser = await import('dicom-parser');
  const byteArray = new Uint8Array(arrayBuffer);
  const dataSet = dicomParser.parseDicom(byteArray) as DatasetLike;

  const sopClassUID = dataSet.string?.('x00080016') ?? '';
  const meta = {
    filePath,
    sopInstanceUID: dataSet.string?.('x00080018') ?? filePath,
    sopClassUID,
    studyInstanceUID: dataSet.string?.('x0020000d') ?? 'unknown-study',
    seriesInstanceUID: dataSet.string?.('x0020000e') ?? 'unknown-series',
    studyDescription: dataSet.string?.('x00081030') ?? '',
    seriesDescription: dataSet.string?.('x0008103e') ?? '',
    modality: dataSet.string?.('x00080060') ?? '',
    patientName: dataSet.string?.('x00100010') ?? 'Anonymous',
    patientId: dataSet.string?.('x00100020') ?? '',
  };

  if (isDocumentSop(sopClassUID)) {
    if (isEncapsulatedPdf(sopClassUID)) {
      const pdfBytes = extractEncapsulatedDocument(dataSet, byteArray);
      if (!pdfBytes) throw new Error('Encapsulated PDF missing document bytes');
      return {
        kind: 'document',
        document: {
          kind: 'pdf',
          ...meta,
          label: meta.seriesDescription || 'Encapsulated PDF',
          modality: meta.modality || 'DOC',
          pdfBytes: new Uint8Array(pdfBytes),
          mimeType: dataSet.string?.('x00420012') ?? 'application/pdf',
        },
      };
    }
    if (isStructuredReport(sopClassUID)) {
      const text = await extractSrText(arrayBuffer);
      return {
        kind: 'document',
        document: {
          kind: 'sr',
          ...meta,
          label: meta.seriesDescription || 'Structured Report',
          modality: meta.modality || 'SR',
          text,
        },
      };
    }
  }

  return { kind: 'image', instances: buildMetaInstances(dataSet, filePath, meta) };
}

/**
 * Decode pixels for a meta instance into the instance fields (Int16 when possible).
 */
export async function decodeInstancePixels(
  instance: DicomInstance,
  arrayBuffer: ArrayBuffer,
): Promise<void> {
  const dicomParser = await import('dicom-parser');
  const byteArray = new Uint8Array(arrayBuffer);
  const dataSet = dicomParser.parseDicom(byteArray) as DatasetLike;
  const transferSyntax =
    instance.transferSyntax ??
    readTransferSyntax(dataSet as Parameters<typeof readTransferSyntax>[0]);

  const decoded = await decodePixelData({
    dataSet: dataSet as Parameters<typeof decodePixelData>[0]['dataSet'],
    byteArray,
    transferSyntax,
    rows: instance.rows,
    columns: instance.columns,
    bitsAllocated: instance.bitsAllocated,
    bitsStored: instance.bitsStored,
    pixelRepresentation: instance.pixelRepresentation,
    samplesPerPixel: instance.samplesPerPixel,
    slope: instance.rescaleSlope,
    intercept: instance.rescaleIntercept,
    frameIndex: instance.frameIndex ?? 0,
    photometricInterpretation: instance.photometricInterpretation,
    planarConfiguration: instance.planarConfiguration ?? 0,
  });

  const hasWlTags =
    dataSet.string?.('x00281050') != null && dataSet.string?.('x00281051') != null;
  if (!hasWlTags) {
    instance.windowLevel = defaultWindowLevel(decoded.pixels);
  }

  if (decoded.colorRgba) {
    instance.colorRgba = decoded.colorRgba;
    instance.pixels = decoded.pixels;
    instance.pixelsInt16 = undefined;
  } else {
    const packed = packModalityInt16(decoded.pixels);
    if (packed) {
      instance.pixelsInt16 = packed;
      instance.pixels = undefined;
    } else {
      instance.pixels = decoded.pixels;
      instance.pixelsInt16 = undefined;
    }
    instance.colorRgba = undefined;
  }
  instance.pixelStatus = 'ready';
}

/**
 * Full parse with pixels decoded (tests / small files). Prefer parseDicomMeta + decodeInstancePixels.
 */
export async function parseDicomFile(
  arrayBuffer: ArrayBuffer,
  filePath: string,
): Promise<ParseResult> {
  const result = await parseDicomMeta(arrayBuffer, filePath);
  if (result.kind === 'document') return result;
  for (const inst of result.instances) {
    await decodeInstancePixels(inst, arrayBuffer);
  }
  return result;
}

/** Sample modality value at pixel index (Int16 or Float32). */
export function getModalityPixel(instance: DicomInstance, index: number): number {
  if (instance.pixelsInt16) return instance.pixelsInt16[index];
  if (instance.pixels) return instance.pixels[index];
  return NaN;
}

export function hasPixels(instance: DicomInstance): boolean {
  return !!(instance.pixelsInt16 || instance.pixels || instance.colorRgba);
}

/** Active mono pixel buffer (Int16 preferred). */
export function getPixelBuffer(
  instance: DicomInstance,
): Float32Array | Int16Array | null {
  if (instance.pixelsInt16) return instance.pixelsInt16;
  if (instance.pixels) return instance.pixels;
  return null;
}
