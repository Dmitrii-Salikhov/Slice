declare module 'dicom-parser' {
  export type Element = {
    dataOffset: number;
    length: number;
    vr?: string;
    fragments?: { offset: number; length: number }[];
    basicOffsetTable?: number[];
  };

  export type DataSet = {
    string: (tag: string) => string | undefined;
    intString: (tag: string) => string | undefined;
    floatString: (tag: string) => string | undefined;
    uint16: (tag: string) => number | undefined;
    int16: (tag: string) => number | undefined;
    elements: Record<string, Element>;
  };

  export function parseDicom(
    byteArray: Uint8Array,
    options?: { TransferSyntaxUID?: string },
  ): DataSet;

  export function readEncapsulatedImageFrame(
    dataSet: DataSet,
    pixelDataElement: Element,
    frameIndex: number,
    basicOffsetTable?: number[],
    fragments?: Element['fragments'],
  ): Uint8Array;

  export function readEncapsulatedPixelData(
    dataSet: DataSet,
    pixelDataElement: Element,
    frame: number,
  ): Uint8Array;
}

declare module 'dcmjs';

declare module 'jpeg-js' {
  const jpeg: {
    decode: (
      data: Uint8Array | ArrayBuffer,
      opts?: { useTArray?: boolean; formatAsRGBA?: boolean },
    ) => { width: number; height: number; data: Uint8Array };
    encode: (
      image: { data: Uint8Array | Uint8ClampedArray; width: number; height: number },
      quality?: number,
    ) => { data: Uint8Array; width: number; height: number };
  };
  export default jpeg;
}

declare module 'jpeg-lossless-decoder-js' {
  export class Decoder {
    numBytes: number;
    decode(
      buffer?: ArrayBuffer,
      offset?: number,
      length?: number,
      numBytes?: number,
    ): Uint8Array | Uint16Array | null;
    decompress(buffer: ArrayBuffer, offset: number, length: number): ArrayBuffer;
  }
}

declare module '@cornerstonejs/codec-charls/decodewasmjs' {
  const factory: (opts?: {
    locateFile?: (path: string, prefix?: string) => string;
  }) => Promise<Record<string, unknown>>;
  export default factory;
}

declare module '@cornerstonejs/codec-charls/decodewasm?url' {
  const url: string;
  export default url;
}

declare module '@cornerstonejs/codec-openjpeg/decode' {
  const factory: (opts?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  export default factory;
}
