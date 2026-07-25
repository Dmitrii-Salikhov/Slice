export type ErrorLogEntry = {
  id: string;
  message: string;
  /** Unix ms */
  at: number;
  source?: string;
};

export type ErrorLogOptions = {
  /** Max retained entries (oldest dropped). Default 50. */
  maxEntries?: number;
  /** Drop entries older than this age in ms. Default 24h. */
  maxAgeMs?: number;
  /** Optional clock for tests. */
  now?: () => number;
  /** Optional id generator for tests. */
  createId?: () => string;
};

export const DEFAULT_MAX_ENTRIES = 50;
export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let idSeq = 0;

function defaultId(): string {
  idSeq += 1;
  return `err-${Date.now()}-${idSeq}`;
}

/** Remove expired entries (self-clean by age). */
export function pruneExpired(
  entries: ErrorLogEntry[],
  now: number,
  maxAgeMs: number,
): ErrorLogEntry[] {
  if (maxAgeMs <= 0) return entries;
  const cutoff = now - maxAgeMs;
  return entries.filter((e) => e.at >= cutoff);
}

/** Cap list length (self-clean by size), keeping newest. */
export function pruneOverflow(entries: ErrorLogEntry[], maxEntries: number): ErrorLogEntry[] {
  if (maxEntries <= 0) return [];
  if (entries.length <= maxEntries) return entries;
  return entries.slice(entries.length - maxEntries);
}

export function createErrorLogStore(options: ErrorLogOptions = {}) {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = options.now ?? (() => Date.now());
  const createId = options.createId ?? defaultId;

  let entries: ErrorLogEntry[] = [];

  function snapshot(): ErrorLogEntry[] {
    entries = pruneOverflow(pruneExpired(entries, now(), maxAgeMs), maxEntries);
    return entries.slice();
  }

  function add(message: string, source?: string): ErrorLogEntry {
    const trimmed = message.trim();
    const entry: ErrorLogEntry = {
      id: createId(),
      message: trimmed || '(empty error)',
      at: now(),
      source: source || undefined,
    };
    entries = pruneOverflow(pruneExpired([...entries, entry], entry.at, maxAgeMs), maxEntries);
    return entry;
  }

  function clear(): void {
    entries = [];
  }

  return {
    add,
    clear,
    getEntries: snapshot,
    get maxEntries() {
      return maxEntries;
    },
    get maxAgeMs() {
      return maxAgeMs;
    },
  };
}

export type ErrorLogStore = ReturnType<typeof createErrorLogStore>;

/** Format timestamp for log UI. */
export function formatErrorTimestamp(at: number, locale: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '—';

  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  // RU: DD.MM.YYYY HH:mm:ss · EN/other: YYYY-MM-DD HH:mm:ss
  if (locale.startsWith('ru')) {
    return `${dd}.${mm}.${yyyy} ${hh}:${mi}:${ss}`;
  }
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}
