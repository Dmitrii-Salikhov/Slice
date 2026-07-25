/**
 * Decode worker: receive DICOM buffer + meta, return pixel payloads off the UI thread.
 * Falls back path is main-thread decodeInstancePixels when Worker is unavailable.
 */

export type DecodeWorkerRequest = {
  id: number;
  buffer: ArrayBuffer;
  meta: {
    filePath: string;
    rows: number;
    columns: number;
    bitsAllocated: number;
    bitsStored: number;
    pixelRepresentation: number;
    samplesPerPixel: number;
    rescaleSlope: number;
    rescaleIntercept: number;
    photometricInterpretation: string;
    planarConfiguration: number;
    transferSyntax?: string;
    frameIndex: number;
  };
};

export type DecodeWorkerResponse =
  | {
      id: number;
      ok: true;
      kind: 'int16' | 'float' | 'color';
      pixels?: ArrayBuffer;
      colorRgba?: ArrayBuffer;
      windowLevel?: { windowCenter: number; windowWidth: number };
    }
  | { id: number; ok: false; error: string };

function defaultWindowLevel(pixels: ArrayLike<number>) {
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

function packModalityInt16(pixels: Float32Array): Int16Array | null {
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    if (!Number.isFinite(v) || v < -32768 || v > 32767) return null;
  }
  const out = new Int16Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) out[i] = Math.round(pixels[i]);
  return out;
}

function toArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

async function handle(req: DecodeWorkerRequest): Promise<DecodeWorkerResponse> {
  try {
    const { decodePixelData, readTransferSyntax } = await import('./decode');
    const dicomParser = await import('dicom-parser');
    const byteArray = new Uint8Array(req.buffer);
    const dataSet = dicomParser.parseDicom(byteArray);
    const transferSyntax =
      req.meta.transferSyntax ??
      readTransferSyntax(dataSet as Parameters<typeof readTransferSyntax>[0]);

    const decoded = await decodePixelData({
      dataSet: dataSet as Parameters<typeof decodePixelData>[0]['dataSet'],
      byteArray,
      transferSyntax,
      rows: req.meta.rows,
      columns: req.meta.columns,
      bitsAllocated: req.meta.bitsAllocated,
      bitsStored: req.meta.bitsStored,
      pixelRepresentation: req.meta.pixelRepresentation,
      samplesPerPixel: req.meta.samplesPerPixel,
      slope: req.meta.rescaleSlope,
      intercept: req.meta.rescaleIntercept,
      frameIndex: req.meta.frameIndex,
      photometricInterpretation: req.meta.photometricInterpretation,
      planarConfiguration: req.meta.planarConfiguration,
    });

    const hasWlTags =
      dataSet.string?.('x00281050') != null && dataSet.string?.('x00281051') != null;
    const windowLevel = hasWlTags ? undefined : defaultWindowLevel(decoded.pixels);

    if (decoded.colorRgba) {
      return {
        id: req.id,
        ok: true,
        kind: 'color',
        pixels: toArrayBuffer(decoded.pixels),
        colorRgba: toArrayBuffer(decoded.colorRgba),
        windowLevel,
      };
    }

    const packed = packModalityInt16(decoded.pixels);
    if (packed) {
      return {
        id: req.id,
        ok: true,
        kind: 'int16',
        pixels: toArrayBuffer(packed),
        windowLevel,
      };
    }

    return {
      id: req.id,
      ok: true,
      kind: 'float',
      pixels: toArrayBuffer(decoded.pixels),
      windowLevel,
    };
  } catch (e) {
    return {
      id: req.id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

self.onmessage = (ev: MessageEvent<DecodeWorkerRequest>) => {
  void handle(ev.data).then((res) => {
    const transfer: Transferable[] = [];
    if (res.ok) {
      if (res.pixels) transfer.push(res.pixels);
      if (res.colorRgba) transfer.push(res.colorRgba);
    }
    (self as unknown as Worker).postMessage(res, transfer);
  });
};
