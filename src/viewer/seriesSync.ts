/**
 * Map a slice index from one series length to another via normalized position.
 * Used for linked scrolling when series have different instance counts.
 */
export function mapSliceIndex(
  fromIndex: number,
  fromCount: number,
  toCount: number,
): number {
  const fromMax = Math.max(0, fromCount - 1);
  const toMax = Math.max(0, toCount - 1);
  if (fromMax === 0 || toMax === 0) return 0;
  const t = Math.min(1, Math.max(0, fromIndex / fromMax));
  return Math.round(t * toMax);
}

/** Apply a scroll delta on the source series and map the result onto the target. */
export function mapSliceDelta(
  fromIndex: number,
  delta: number,
  fromCount: number,
  toCount: number,
): { from: number; to: number } {
  const from = Math.min(Math.max(0, fromIndex + delta), Math.max(0, fromCount - 1));
  return {
    from,
    to: mapSliceIndex(from, fromCount, toCount),
  };
}

export type SyncFlags = {
  scroll: boolean;
  wl: boolean;
  zoom: boolean;
};

export const DEFAULT_SYNC_FLAGS: SyncFlags = {
  scroll: false,
  wl: true,
  zoom: true,
};
