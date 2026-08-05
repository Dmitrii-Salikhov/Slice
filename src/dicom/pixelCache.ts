import type { DicomInstance } from './types';
import { decodeInstancePixels, hasPixels } from './parse';
import { sharedDecodePool } from './decodePool';

export type PixelCacheOptions = {
  /** Max decoded slices retained (default 192). */
  maxEntries?: number;
  /** Soft byte budget; evicts LRU until under limit (default 256 MiB). */
  maxBytes?: number;
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
  private readonly maxBytes: number;
  private readonly order: string[] = [];
  private readonly map = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<DicomInstance>>();
  private totalBytes = 0;

  constructor(options?: PixelCacheOptions) {
    this.maxEntries = Math.max(1, options?.maxEntries ?? 192);
    this.maxBytes = Math.max(1, options?.maxBytes ?? 256 * 1024 * 1024);
  }

  get size(): number {
    return this.map.size;
  }

  get bytes(): number {
    return this.totalBytes;
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

  private dropEntry(key: string) {
    const entry = this.map.get(key);
    if (!entry) return;
    this.map.delete(key);
    this.totalBytes = Math.max(0, this.totalBytes - entry.bytes);
    entry.instance.pixels = undefined;
    entry.instance.pixelsInt16 = undefined;
    entry.instance.colorRgba = undefined;
    entry.instance.pixelStatus = 'meta';
  }

  private evictIfNeeded() {
    while (
      (this.map.size > this.maxEntries || this.totalBytes > this.maxBytes) &&
      this.order.length > 0
    ) {
      const oldest = this.order.shift();
      if (!oldest) break;
      this.dropEntry(oldest);
    }
  }

  private remember(instance: DicomInstance) {
    const key = cacheKey(instance);
    if (this.map.has(key)) {
      this.touch(key);
      return;
    }
    const bytes = estimateBytes(instance);
    this.map.set(key, { key, instance, bytes });
    this.totalBytes += bytes;
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
    for (const key of [...this.map.keys()]) {
      this.dropEntry(key);
    }
    this.order.length = 0;
    this.inflight.clear();
    this.totalBytes = 0;
  }
}

export const sharedPixelCache = new PixelCache({
  maxEntries: 192,
  maxBytes: 256 * 1024 * 1024,
});

export function pixelCacheKey(instance: DicomInstance): string {
  return cacheKey(instance);
}
