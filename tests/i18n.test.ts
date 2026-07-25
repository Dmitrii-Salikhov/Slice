import { describe, expect, it } from 'vitest';
import { dictionaries, formatMessage } from '../src/i18n/translations';

describe('i18n', () => {
  it('has matching keys in en and ru', () => {
    const enKeys = Object.keys(dictionaries.en).sort();
    const ruKeys = Object.keys(dictionaries.ru).sort();
    expect(ruKeys).toEqual(enKeys);
  });

  it('formatMessage substitutes params', () => {
    expect(formatMessage('Loading {loaded}/{total}', { loaded: 3, total: 10 })).toBe(
      'Loading 3/10',
    );
    expect(formatMessage('Hello')).toBe('Hello');
    expect(formatMessage('X {missing}', {})).toBe('X {missing}');
  });

  it('includes ZIP / media / PACS / error log strings in both locales', () => {
    for (const key of [
      'toolbar.openZip',
      'toolbar.openMedia',
      'toolbar.pacs',
      'zip.passwordTitle',
      'media.title',
      'pacs.find',
      'pacs.retrieve',
      'pacs.store',
      'error.zipInvalidPassword',
      'errorLog.title',
      'errorLog.clear',
      'errorLog.empty',
      'dicomdir.title',
      'dicomdir.loadSeries',
      'pacs.queryLevel',
      'pacs.drillSeries',
      'toolbar.angle',
      'toolbar.cine',
      'toolbar.saveAnnotations',
      'toolbar.tags',
      'tags.title',
      'error.loadCancelled',
      'app.buildingVolume',
      'document.pdf',
      'document.openExternal',
      'pacs.profiles',
      'pacs.retrieveProgress',
    ] as const) {
      expect(dictionaries.en[key].length).toBeGreaterThan(0);
      expect(dictionaries.ru[key].length).toBeGreaterThan(0);
    }
    expect(dictionaries.en['pacs.find']).toBe('C-FIND');
    expect(dictionaries.ru['errorLog.title']).toBe('Лог ошибок');
    expect(dictionaries.ru['dicomdir.title']).toContain('DICOMDIR');
    expect(dictionaries.en['pacs.levelSeries']).toBe('Series');
  });
});
