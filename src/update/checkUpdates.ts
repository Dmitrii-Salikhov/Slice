/** GitHub release update check (folder/zip distribution). */

export type GithubReleaseAsset = {
  name: string;
  browser_download_url: string;
  size: number;
};

export type UpdateCheckResult =
  | {
      status: 'up-to-date';
      currentVersion: string;
      latestVersion: string;
    }
  | {
      status: 'available';
      currentVersion: string;
      latestVersion: string;
      releaseName: string;
      body: string;
      htmlUrl: string;
      downloadUrl: string | null;
      publishedAt: string | null;
    }
  | {
      status: 'error';
      currentVersion: string;
      message: string;
    };

export type UpdateRepo = {
  owner: string;
  repo: string;
};

export function normalizeVersion(v: string): string {
  return v.trim().replace(/^v/i, '');
}

/** Compare semver-ish strings: 1 if a>b, -1 if a<b, 0 if equal/unparsed. */
export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split(/[.+-]/).map((x) => parseInt(x, 10));
  const pb = normalizeVersion(b).split(/[.+-]/).map((x) => parseInt(x, 10));
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function pickWindowsZip(assets: GithubReleaseAsset[]): string | null {
  const zip =
    assets.find((a) => /win-x64\.zip$/i.test(a.name)) ||
    assets.find((a) => /\.zip$/i.test(a.name) && /win/i.test(a.name)) ||
    assets.find((a) => /\.zip$/i.test(a.name));
  return zip?.browser_download_url ?? null;
}

export async function checkGithubUpdate(
  currentVersion: string,
  repo: UpdateRepo,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateCheckResult> {
  const current = normalizeVersion(currentVersion);
  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`;
  try {
    const res = await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Slice-DICOM-Viewer',
      },
    });
    if (res.status === 404) {
      return {
        status: 'error',
        currentVersion: current,
        message: 'No GitHub releases found yet',
      };
    }
    if (!res.ok) {
      return {
        status: 'error',
        currentVersion: current,
        message: `GitHub API ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      tag_name?: string;
      name?: string;
      body?: string;
      html_url?: string;
      published_at?: string;
      assets?: GithubReleaseAsset[];
    };
    const latest = normalizeVersion(data.tag_name || data.name || '');
    if (!latest) {
      return {
        status: 'error',
        currentVersion: current,
        message: 'Latest release has no version tag',
      };
    }
    if (compareVersions(latest, current) <= 0) {
      return { status: 'up-to-date', currentVersion: current, latestVersion: latest };
    }
    return {
      status: 'available',
      currentVersion: current,
      latestVersion: latest,
      releaseName: data.name || `v${latest}`,
      body: (data.body || '').trim() || '(no release notes)',
      htmlUrl: data.html_url || `https://github.com/${repo.owner}/${repo.repo}/releases`,
      downloadUrl: pickWindowsZip(data.assets || []),
      publishedAt: data.published_at ?? null,
    };
  } catch (e) {
    return {
      status: 'error',
      currentVersion: current,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
