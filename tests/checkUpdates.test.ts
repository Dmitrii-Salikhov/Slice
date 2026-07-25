import { describe, expect, it, vi } from 'vitest';
import {
  checkGithubUpdate,
  compareVersions,
  normalizeVersion,
} from '../src/update/checkUpdates';

describe('normalizeVersion', () => {
  it('strips v prefix and whitespace', () => {
    expect(normalizeVersion(' v1.0.1 ')).toBe('1.0.1');
    expect(normalizeVersion('1.0.1')).toBe('1.0.1');
  });
});

describe('compareVersions', () => {
  it('orders semver segments', () => {
    expect(compareVersions('1.0.2', '1.0.1')).toBe(1);
    expect(compareVersions('1.0.1', '1.0.2')).toBe(-1);
    expect(compareVersions('1.0.1', 'v1.0.1')).toBe(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
  });
});

describe('checkGithubUpdate', () => {
  it('reports up-to-date when latest equals current', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.1',
        name: '1.0.1',
        body: 'notes',
        html_url: 'https://github.com/Dmitrii-Salikhov/Slice/releases/tag/v1.0.1',
        assets: [],
      }),
    })) as unknown as typeof fetch;

    const result = await checkGithubUpdate('1.0.1', { owner: 'Dmitrii-Salikhov', repo: 'Slice' }, fetchImpl);
    expect(result.status).toBe('up-to-date');
  });

  it('reports available with changelog and zip url', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.2',
        name: 'Slice 1.0.2',
        body: '### Fixes\n- bug',
        html_url: 'https://github.com/Dmitrii-Salikhov/Slice/releases/tag/v1.0.2',
        assets: [
          {
            name: 'Slice-1.0.2-win-x64.zip',
            browser_download_url: 'https://example.com/Slice-1.0.2-win-x64.zip',
            size: 10,
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const result = await checkGithubUpdate('1.0.1', { owner: 'Dmitrii-Salikhov', repo: 'Slice' }, fetchImpl);
    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.latestVersion).toBe('1.0.2');
      expect(result.body).toContain('Fixes');
      expect(result.downloadUrl).toContain('win-x64.zip');
    }
  });

  it('maps 404 to error', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const result = await checkGithubUpdate('1.0.1', { owner: 'Dmitrii-Salikhov', repo: 'Slice' }, fetchImpl);
    expect(result.status).toBe('error');
  });
});
