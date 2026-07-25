import type { DicomInstance } from './types';
import type { DecodeWorkerRequest, DecodeWorkerResponse } from './decode.worker';

type Pending = {
  resolve: (v: DecodeWorkerResponse) => void;
  reject: (e: Error) => void;
};

/**
 * Small pool of module workers for DICOM pixel decode.
 * Falls back to null when Worker is unavailable (tests / restricted env).
 */
export class DecodeWorkerPool {
  private readonly size: number;
  private workers: Worker[] = [];
  private rr = 0;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private failed = false;

  constructor(size = 2) {
    this.size = Math.max(1, Math.min(4, size));
  }

  private ensureWorkers(): boolean {
    if (this.failed) return false;
    if (this.workers.length > 0) return true;
    if (typeof Worker === 'undefined') {
      this.failed = true;
      return false;
    }
    try {
      for (let i = 0; i < this.size; i++) {
        const w = new Worker(new URL('./decode.worker.ts', import.meta.url), {
          type: 'module',
        });
        w.onmessage = (ev: MessageEvent<DecodeWorkerResponse>) => {
          const res = ev.data;
          const p = this.pending.get(res.id);
          if (!p) return;
          this.pending.delete(res.id);
          p.resolve(res);
        };
        w.onerror = () => {
          this.failed = true;
        };
        this.workers.push(w);
      }
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  get available(): boolean {
    return this.ensureWorkers();
  }

  async decode(
    buffer: ArrayBuffer,
    instance: DicomInstance,
  ): Promise<DecodeWorkerResponse> {
    if (!this.ensureWorkers()) {
      return { id: 0, ok: false, error: 'Worker unavailable' };
    }
    const id = this.nextId++;
    const req: DecodeWorkerRequest = {
      id,
      buffer,
      meta: {
        filePath: instance.filePath,
        rows: instance.rows,
        columns: instance.columns,
        bitsAllocated: instance.bitsAllocated,
        bitsStored: instance.bitsStored,
        pixelRepresentation: instance.pixelRepresentation,
        samplesPerPixel: instance.samplesPerPixel,
        rescaleSlope: instance.rescaleSlope,
        rescaleIntercept: instance.rescaleIntercept,
        photometricInterpretation: instance.photometricInterpretation,
        planarConfiguration: instance.planarConfiguration ?? 0,
        transferSyntax: instance.transferSyntax,
        frameIndex: instance.frameIndex ?? 0,
      },
    };

    return new Promise<DecodeWorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const w = this.workers[this.rr++ % this.workers.length];
      try {
        w.postMessage(req, [buffer]);
      } catch (e) {
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  applyResult(instance: DicomInstance, res: DecodeWorkerResponse): boolean {
    if (!res.ok) return false;
    if (res.windowLevel) instance.windowLevel = res.windowLevel;
    if (res.kind === 'color' && res.pixels && res.colorRgba) {
      instance.pixels = new Float32Array(res.pixels);
      instance.colorRgba = new Uint8ClampedArray(res.colorRgba);
      instance.pixelsInt16 = undefined;
    } else if (res.kind === 'int16' && res.pixels) {
      instance.pixelsInt16 = new Int16Array(res.pixels);
      instance.pixels = undefined;
      instance.colorRgba = undefined;
    } else if (res.kind === 'float' && res.pixels) {
      instance.pixels = new Float32Array(res.pixels);
      instance.pixelsInt16 = undefined;
      instance.colorRgba = undefined;
    } else {
      return false;
    }
    instance.pixelStatus = 'ready';
    return true;
  }

  destroy() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.pending.clear();
  }
}

export const sharedDecodePool = new DecodeWorkerPool(2);
