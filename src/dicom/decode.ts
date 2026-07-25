import jpeg from 'jpeg-js';
import { Decoder as JpegLosslessDecoder } from 'jpeg-lossless-decoder-js';
import { decodeRleFrame } from './rle';
import { TransferSyntax, isEncapsulated, isUncompressed } from './transferSyntax';
import {
  colorSamplesToRgba,
  isColorPhotometric,
  jpegRgbToRgba,
} from './color';

type DicomParserModule = typeof import('dicom-parser');
type DataSet = ReturnType<DicomParserModule['parseDicom']>;

type DecodeParams = {
  dataSet: DataSet;
  byteArray: Uint8Array;
  transferSyntax: string;
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  pixelRepresentation: number;
  samplesPerPixel: number;
  slope: number;
  intercept: number;
  frameIndex?: number;
  photometricInterpretation?: string;
  planarConfiguration?: number;
};

export type DecodeResult = {
  pixels: Float32Array;
  colorRgba?: Uint8ClampedArray;
};

type WasmModule = {
  ready?: Promise<unknown>;
  JpegLSDecoder?: new () => {
    getEncodedBuffer: (n: number) => Uint8Array;
    decode: () => void;
    getDecodedBuffer: () => Uint8Array;
    getFrameInfo: () => {
      width: number;
      height: number;
      bitsPerSample: number;
      componentCount: number;
    };
    delete: () => void;
  };
  J2KDecoder?: new () => {
    getEncodedBuffer: (n: number) => Uint8Array;
    decode: () => void;
    getDecodedBuffer: () => Uint8Array;
    getFrameInfo: () => {
      width: number;
      height: number;
      bitsPerSample: number;
      componentCount: number;
    };
    delete: () => void;
  };
};

let charlsPromise: Promise<WasmModule> | null = null;
let openjpegPromise: Promise<WasmModule> | null = null;

async function loadCharls(): Promise<WasmModule> {
  if (!charlsPromise) {
    charlsPromise = (async () => {
      const wasmUrl = (await import('@cornerstonejs/codec-charls/decodewasm?url')).default;
      const factoryMod = await import('@cornerstonejs/codec-charls/decodewasmjs');
      const factory = (factoryMod as { default: (opts: unknown) => Promise<WasmModule> }).default;
      const mod = await factory({
        locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path),
      });
      if (mod.ready) await mod.ready;
      return mod;
    })();
  }
  return charlsPromise;
}

async function loadOpenJpeg(): Promise<WasmModule> {
  if (!openjpegPromise) {
    openjpegPromise = (async () => {
      const factoryMod = await import('@cornerstonejs/codec-openjpeg/decode');
      const factory = (factoryMod as { default: (opts?: unknown) => Promise<WasmModule> }).default;
      const mod = await factory({});
      if (mod.ready) await mod.ready;
      return mod;
    })();
  }
  return openjpegPromise;
}

function rawToFloat(
  raw: Uint8Array,
  rows: number,
  columns: number,
  bitsAllocated: number,
  pixelRepresentation: number,
  samplesPerPixel: number,
  slope: number,
  intercept: number,
  littleEndian = true,
): Float32Array {
  const out = new Float32Array(rows * columns);
  if (bitsAllocated === 8) {
    for (let i = 0; i < out.length; i++) {
      out[i] = (raw[i * samplesPerPixel] ?? 0) * slope + intercept;
    }
    return out;
  }
  if (bitsAllocated === 16) {
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const signed = pixelRepresentation === 1;
    for (let i = 0; i < out.length; i++) {
      const off = i * samplesPerPixel * 2;
      const sample = signed
        ? view.getInt16(off, littleEndian)
        : view.getUint16(off, littleEndian);
      out[i] = sample * slope + intercept;
    }
    return out;
  }
  throw new Error(`Unsupported BitsAllocated: ${bitsAllocated}`);
}

function frameByteLength(
  rows: number,
  columns: number,
  bitsAllocated: number,
  samplesPerPixel: number,
): number {
  return rows * columns * samplesPerPixel * (bitsAllocated / 8);
}

function extractUncompressedRaw(
  dataSet: DataSet,
  byteArray: Uint8Array,
  rows: number,
  columns: number,
  bitsAllocated: number,
  samplesPerPixel: number,
  frameIndex: number,
): Uint8Array {
  const pixelElement = dataSet.elements?.x7fe00010;
  if (!pixelElement) throw new Error('Missing Pixel Data (7FE0,0010)');
  const frameBytes = frameByteLength(rows, columns, bitsAllocated, samplesPerPixel);
  const start = pixelElement.dataOffset + frameIndex * frameBytes;
  const end = Math.min(start + frameBytes, pixelElement.dataOffset + pixelElement.length);
  if (start >= pixelElement.dataOffset + pixelElement.length) {
    throw new Error(`Frame ${frameIndex} out of range`);
  }
  return byteArray.subarray(start, end);
}

async function getEncapsulatedFrame(
  dicomParser: DicomParserModule,
  dataSet: DataSet,
  frameIndex: number,
): Promise<Uint8Array> {
  const pixelElement = dataSet.elements?.x7fe00010;
  if (!pixelElement) throw new Error('Missing Pixel Data (7FE0,0010)');

  try {
    return dicomParser.readEncapsulatedImageFrame(dataSet, pixelElement, frameIndex);
  } catch {
    return dicomParser.readEncapsulatedPixelData(dataSet, pixelElement, frameIndex);
  }
}

function decodeJpegBaselineColor(frame: Uint8Array): DecodeResult {
  const decoded = jpeg.decode(frame, { useTArray: true, formatAsRGBA: false });
  const { width, height, data } = decoded;
  const { rgba, luma } = jpegRgbToRgba(data, width, height);
  return { pixels: luma, colorRgba: rgba };
}

function decodeJpegBaselineGray(frame: Uint8Array): Float32Array {
  const decoded = jpeg.decode(frame, { useTArray: true, formatAsRGBA: false });
  const { width, height, data } = decoded;
  const out = new Float32Array(width * height);
  const spp = data.length / (width * height);
  for (let i = 0; i < out.length; i++) {
    out[i] = data[Math.floor(i * spp)] ?? 0;
  }
  return out;
}

function decodeJpegLossless(
  frame: Uint8Array,
  pixelRepresentation: number,
  slope: number,
  intercept: number,
): Float32Array {
  const decoder = new JpegLosslessDecoder();
  const decoded = decoder.decode(
    frame.buffer as ArrayBuffer,
    frame.byteOffset,
    frame.byteLength,
  );
  if (!decoded) throw new Error('JPEG Lossless decode failed');
  const out = new Float32Array(decoded.length);
  if (decoded instanceof Uint16Array && pixelRepresentation === 1) {
    const view = new Int16Array(decoded.buffer, decoded.byteOffset, decoded.length);
    for (let i = 0; i < view.length; i++) out[i] = view[i] * slope + intercept;
  } else {
    for (let i = 0; i < decoded.length; i++) out[i] = decoded[i] * slope + intercept;
  }
  return out;
}

async function decodeJpegLS(
  frame: Uint8Array,
  slope: number,
  intercept: number,
  pixelRepresentation: number,
): Promise<Float32Array> {
  const charls = await loadCharls();
  if (!charls.JpegLSDecoder) throw new Error('JpegLSDecoder unavailable');
  const decoder = new charls.JpegLSDecoder();
  try {
    const enc = decoder.getEncodedBuffer(frame.length);
    enc.set(frame);
    decoder.decode();
    const info = decoder.getFrameInfo();
    const decoded = decoder.getDecodedBuffer();
    const out = new Float32Array(info.width * info.height);
    if (info.bitsPerSample <= 8) {
      for (let i = 0; i < out.length; i++) out[i] = decoded[i] * slope + intercept;
    } else {
      const view = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
      const signed = pixelRepresentation === 1;
      for (let i = 0; i < out.length; i++) {
        const v = signed ? view.getInt16(i * 2, true) : view.getUint16(i * 2, true);
        out[i] = v * slope + intercept;
      }
    }
    return out;
  } finally {
    decoder.delete();
  }
}

async function decodeJpeg2000(
  frame: Uint8Array,
  slope: number,
  intercept: number,
  pixelRepresentation: number,
): Promise<Float32Array> {
  const openjpeg = await loadOpenJpeg();
  if (!openjpeg.J2KDecoder) throw new Error('J2KDecoder unavailable');
  const decoder = new openjpeg.J2KDecoder();
  try {
    const enc = decoder.getEncodedBuffer(frame.length);
    enc.set(frame);
    decoder.decode();
    const info = decoder.getFrameInfo();
    const decoded = decoder.getDecodedBuffer();
    const out = new Float32Array(info.width * info.height);
    if (info.bitsPerSample <= 8) {
      for (let i = 0; i < out.length; i++) out[i] = decoded[i] * slope + intercept;
    } else {
      const view = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
      const signed = pixelRepresentation === 1;
      for (let i = 0; i < out.length; i++) {
        const v = signed ? view.getInt16(i * 2, true) : view.getUint16(i * 2, true);
        out[i] = v * slope + intercept;
      }
    }
    return out;
  } finally {
    decoder.delete();
  }
}

/**
 * Decode Pixel Data for the given transfer syntax → modality values (+ optional color).
 */
export async function decodePixelData(params: DecodeParams): Promise<DecodeResult> {
  const {
    dataSet,
    byteArray,
    transferSyntax,
    rows,
    columns,
    bitsAllocated,
    pixelRepresentation,
    samplesPerPixel,
    slope,
    intercept,
    frameIndex = 0,
    photometricInterpretation = 'MONOCHROME2',
    planarConfiguration = 0,
  } = params;

  const littleEndian = transferSyntax !== TransferSyntax.ExplicitVRBigEndian;
  const color = isColorPhotometric(photometricInterpretation) && samplesPerPixel >= 3;

  const tryUncompressed = (): DecodeResult => {
    const raw = extractUncompressedRaw(
      dataSet,
      byteArray,
      rows,
      columns,
      bitsAllocated,
      samplesPerPixel,
      frameIndex,
    );
    if (color && bitsAllocated === 8) {
      const { rgba, luma } = colorSamplesToRgba(
        raw,
        columns,
        rows,
        photometricInterpretation,
        planarConfiguration,
        samplesPerPixel,
      );
      return { pixels: luma, colorRgba: rgba };
    }
    return {
      pixels: rawToFloat(
        raw,
        rows,
        columns,
        bitsAllocated,
        pixelRepresentation,
        samplesPerPixel,
        color ? 1 : slope,
        color ? 0 : intercept,
        littleEndian,
      ),
    };
  };

  if (isUncompressed(transferSyntax)) {
    return tryUncompressed();
  }

  if (!isEncapsulated(transferSyntax)) {
    try {
      return tryUncompressed();
    } catch {
      throw new Error(`Unsupported transfer syntax: ${transferSyntax}`);
    }
  }

  const dicomParser = await import('dicom-parser');
  const frame = await getEncapsulatedFrame(dicomParser, dataSet, frameIndex);

  switch (transferSyntax) {
    case TransferSyntax.RLELossless: {
      const raw = decodeRleFrame(frame, rows, columns, samplesPerPixel, bitsAllocated);
      if (color && bitsAllocated === 8) {
        const { rgba, luma } = colorSamplesToRgba(
          raw,
          columns,
          rows,
          photometricInterpretation,
          planarConfiguration,
          samplesPerPixel,
        );
        return { pixels: luma, colorRgba: rgba };
      }
      return {
        pixels: rawToFloat(
          raw,
          rows,
          columns,
          bitsAllocated,
          pixelRepresentation,
          samplesPerPixel,
          slope,
          intercept,
        ),
      };
    }
    case TransferSyntax.JPEGBaseline:
    case TransferSyntax.JPEGExtended: {
      if (color) return decodeJpegBaselineColor(frame);
      const values = decodeJpegBaselineGray(frame);
      if (slope !== 1 || intercept !== 0) {
        for (let i = 0; i < values.length; i++) values[i] = values[i] * slope + intercept;
      }
      return { pixels: values };
    }
    case TransferSyntax.JPEGLossless:
    case TransferSyntax.JPEGLosslessSV1:
      return {
        pixels: decodeJpegLossless(frame, pixelRepresentation, slope, intercept),
      };
    case TransferSyntax.JPEGLSLossless:
    case TransferSyntax.JPEGLSNearLossless:
      return {
        pixels: await decodeJpegLS(frame, slope, intercept, pixelRepresentation),
      };
    case TransferSyntax.JPEG2000Lossless:
    case TransferSyntax.JPEG2000:
      return {
        pixels: await decodeJpeg2000(frame, slope, intercept, pixelRepresentation),
      };
    default:
      throw new Error(`Unsupported encapsulated transfer syntax: ${transferSyntax}`);
  }
}

export function readTransferSyntax(dataSet: DataSet): string {
  return dataSet.string?.('x00020010') ?? TransferSyntax.ImplicitVRLittleEndian;
}
