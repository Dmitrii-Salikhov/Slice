import { describe, expect, it } from 'vitest';
import {
  createErrorLogStore,
  formatErrorTimestamp,
  pruneExpired,
  pruneOverflow,
  DEFAULT_MAX_ENTRIES,
} from '../src/errorLog/store';

describe('error log store', () => {
  it('adds entries with timestamps', () => {
    let clock = 1_700_000_000_000;
    let n = 0;
    const store = createErrorLogStore({
      now: () => clock,
      createId: () => `id-${++n}`,
    });

    const a = store.add('first', 'load');
    expect(a).toMatchObject({ id: 'id-1', message: 'first', at: clock, source: 'load' });
    expect(store.getEntries()).toHaveLength(1);

    clock += 1000;
    store.add('second');
    expect(store.getEntries().map((e) => e.message)).toEqual(['first', 'second']);
  });

  it('self-cleans by maxEntries (keeps newest)', () => {
    let clock = 1000;
    const store = createErrorLogStore({
      maxEntries: 3,
      maxAgeMs: 0,
      now: () => (clock += 1),
    });

    store.add('a');
    store.add('b');
    store.add('c');
    store.add('d');
    expect(store.getEntries().map((e) => e.message)).toEqual(['b', 'c', 'd']);
  });

  it('self-cleans by maxAgeMs', () => {
    let clock = 10_000;
    const store = createErrorLogStore({
      maxEntries: 50,
      maxAgeMs: 5_000,
      now: () => clock,
    });

    store.add('old');
    clock = 12_000;
    store.add('mid');
    clock = 20_000; // mid is 8s old → expired; new entry triggers prune
    store.add('new');
    expect(store.getEntries().map((e) => e.message)).toEqual(['new']);
  });

  it('clears all entries', () => {
    const store = createErrorLogStore({ maxAgeMs: 0 });
    store.add('x');
    store.add('y');
    store.clear();
    expect(store.getEntries()).toEqual([]);
  });

  it('trims empty messages', () => {
    const store = createErrorLogStore({ maxAgeMs: 0 });
    expect(store.add('   ').message).toBe('(empty error)');
  });

  it('uses default max entries', () => {
    expect(DEFAULT_MAX_ENTRIES).toBe(50);
    const store = createErrorLogStore({ maxAgeMs: 0 });
    expect(store.maxEntries).toBe(50);
  });
});

describe('error log prune helpers', () => {
  it('pruneOverflow keeps tail', () => {
    const entries = [
      { id: '1', message: 'a', at: 1 },
      { id: '2', message: 'b', at: 2 },
      { id: '3', message: 'c', at: 3 },
    ];
    expect(pruneOverflow(entries, 2).map((e) => e.id)).toEqual(['2', '3']);
    expect(pruneOverflow(entries, 0)).toEqual([]);
  });

  it('pruneExpired drops old', () => {
    const entries = [
      { id: '1', message: 'a', at: 100 },
      { id: '2', message: 'b', at: 200 },
    ];
    expect(pruneExpired(entries, 250, 100).map((e) => e.id)).toEqual(['2']);
  });
});

describe('formatErrorTimestamp', () => {
  it('formats RU and EN styles', () => {
    // 2026-07-25 18:05:09 UTC → local may differ; use fixed offset via components
    const at = Date.UTC(2026, 6, 25, 15, 5, 9); // month 6 = July
    const ru = formatErrorTimestamp(at, 'ru');
    const en = formatErrorTimestamp(at, 'en');
    expect(ru).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/);
    expect(en).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(formatErrorTimestamp(Number.NaN, 'en')).toBe('—');
  });
});
