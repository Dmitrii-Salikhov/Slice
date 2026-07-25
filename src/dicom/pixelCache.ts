import type { DicomInstance } from './types';
import { decodeInstancePixels, hasPixels } from './parse';
import { sharedDecodePool } from './decodePool';

export type PixelCacheOptions = {
  /** Max decoded slices retained (default 192). */
  maxEntries?: number;
};

type CacheEntry = {
  key: string;
  instance: DicomInstance;
  bytes: number;
};

function cacheKey(instance: DicomInstance): string {
  return `${instance.filePath}#${instance.frameIndex ?? 0}`;
}

function estimateBytes(instance: DicomInstance): number {
  if (instance.colorRgba) return instance.colorRgba.byteLength;
  if (instance.pixelsInt16) return instance.pixelsInt16.byteLength;
  if (instance.pixels) return instance.pixels.byteLength;
  return instance.rows * instance.columns * 2;
}

/**
 * LRU cache of decoded DICOM slices. Evicts oldest entries and clears pixel buffers.
 */
export class PixelCache {
  private readonly maxEntries: number;
  private readonly order: string[] = [];
  private readonly map = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<DicomInstance>>();

  constructor(options?: PixelCacheOptions) {
    this.maxEntries = Math.max(1, options?.maxEntries ?? 192);
  }

  get size(): number {
    return this.map.size;
  }

  peek(instance: DicomInstance): boolean {
    const key = cacheKey(instance);
    if (this.map.has(key) && hasPixels(instance)) {
      this.touch(key);
      return true;
    }
    return hasPixels(instance) && instance.pixelStatus === 'ready';
  }

  private touch(key: string) {
    const idx = this.order.indexOf(key);
    if (idx >= 0) this.order.splice(idx, 1);
    this.order.push(key);
  }

  private evictIfNeeded() {
    while (this.map.size > this.maxEntries && this.order.length > 0) {
      const oldest = this.order.shift();
      if (!oldest) break;
      const entry = this.map.get(oldest);
      this.map.delete(oldest);
      if (entry) {
        entry.instance.pixels = undefined;
        entry.instance.pixelsInt16 = undefined;
        entry.instance.colorRgba = undefined;
        entry.instance.pixelStatus = 'meta';
      }
    }
  }

  private remember(instance: DicomInstance) {
    const key = cacheKey(instance);
    if (this.map.has(key)) {
      this.touch(key);
      return;
    }
    this.map.set(key, { key, instance, bytes: estimateBytes(instance) });
    this.touch(key);
    this.evictIfNeeded();
  }

  /**
   * Ensure instance has decoded pixels. Uses readFile(path) to load buffer.
   */
  async ensure(
    instance: DicomInstance,
    readFile: (path: string) => Promise<ArrayBuffer>,
  ): Promise<DicomInstance> {
    if (hasPixels(instance) && instance.pixelStatus === 'ready') {
      this.remember(instance);
      return instance;
    }

    const key = cacheKey(instance);
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const buffer = await readFile(instance.filePath);
        let decoded = false;
        if (sharedDecodePool.available) {
          try {
            const copy = buffer.slice(0);
            const res = await sharedDecodePool.decode(copy, instance);
            decoded = sharedDecodePool.applyResult(instance, res);
          } catch {
            decoded = false;
          }
        }
        if (!decoded) {
          await decodeInstancePixels(instance, buffer);
        }
        this.remember(instance);
        return instance;
      } catch (e) {
        instance.pixelStatus = 'error';
        throw e;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  /** Prefetch a list of instances (best-effort, limited concurrency). */
  async prefetch(
    instances: DicomInstance[],
    readFile: (path: string) => Promise<ArrayBuffer>,
    concurrency = 4,
  ): Promise<void> {
    const queue = instances.filter(
      (i) => !(hasPixels(i) && i.pixelStatus === 'ready'),
    );
    let idx = 0;
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (idx < queue.length) {
        const cur = queue[idx++];
        try {
          await this.ensure(cur, readFile);
        } catch {
          // ignore prefetch errors
        }
      }
    });
    await Promise.all(workers);
  }

  clear() {
    for (const entry of this.map.values()) {
      entry.instance.pixels = undefined;
      entry.instance.pixelsInt16 = undefined;
      entry.instance.colorRgba = undefined;
      entry.instance.pixelStatus = 'meta';
    }
    this.map.clear();
    this.order.length = 0;
    this.inflight.clear();
  }
}

export const sharedPixelCache = new PixelCache({ maxEntries: 192 });

export function pixelCacheKey(instance: DicomInstance): string {
  return cacheKey(instance);
}
