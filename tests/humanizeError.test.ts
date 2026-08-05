import { describe, expect, it } from 'vitest';
import { humanizeError, messageForFailedLoad } from '../src/errorLog/humanizeError';
import type { MessageKey } from '../src/i18n/translations';
import { dictionaries } from '../src/i18n/translations';

const t = (key: MessageKey) => dictionaries.ru[key] ?? dictionaries.en[key] ?? key;

describe('humanizeError', () => {
  it('maps common technical messages to RU user text', () => {
    expect(humanizeError('No handler registered for media:open', t)).toBe(
      t('error.restartRequired'),
    );
    expect(humanizeError('dicomParser.parseDicom: missing required meta header attribute 0002,0010', t)).toBe(
      t('error.wrongFormat'),
    );
    expect(humanizeError('Unsupported transfer syntax: 1.2.840.10008.1.2.4.90', t)).toBe(
      t('error.unsupportedTransfer'),
    );
    expect(humanizeError('Unsupported SOP Class (no image pixels): 1.2.840…', t)).toBe(
      t('error.notImageDicom'),
    );
    expect(humanizeError('ENOENT: no such file or directory', t)).toBe(t('error.fileNotFound'));
    expect(humanizeError('EACCES: permission denied', t)).toBe(t('error.accessDenied'));
    expect(humanizeError('Missing Pixel Data (7FE0,0010)', t)).toBe(t('error.decodeFailed'));
    expect(humanizeError('Inhomogeneous series dimensions — MPR requires uniform matrix', t)).toBe(
      t('error.mprFailed'),
    );
    expect(humanizeError('WebGL unavailable — using Canvas renderer', t)).toBe(
      t('error.webglFallback'),
    );
  });

  it('keeps already-friendly messages', () => {
    expect(humanizeError(t('error.noFiles'), t)).toBe(t('error.noFiles'));
  });

  it('handles empty input', () => {
    expect(humanizeError('   ', t)).toBe(t('error.unknown'));
  });
});

describe('messageForFailedLoad', () => {
  it('reports no files when scan is empty', () => {
    expect(messageForFailedLoad(0, [], t)).toBe(t('error.noFiles'));
  });

  it('reports wrong format when all skips are parse failures', () => {
    expect(
      messageForFailedLoad(
        3,
        [
          'dicomParser.parseDicom: missing required meta header attribute 0002,0010',
          'dicomParser.parseDicom: missing required meta header attribute 0002,0010',
        ],
        t,
      ),
    ).toBe(t('error.wrongFormat'));
  });

  it('reports unsupported transfer when that dominates', () => {
    expect(
      messageForFailedLoad(2, ['Unsupported transfer syntax: 1.2.840', 'Unsupported transfer syntax: x'], t),
    ).toBe(t('error.unsupportedTransfer'));
  });

  it('falls back to noParse for mixed/unknown skips', () => {
    expect(messageForFailedLoad(2, ['weird', 'other'], t)).toBe(t('error.noParse'));
  });
});
