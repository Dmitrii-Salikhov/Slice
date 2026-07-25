/** GitHub release check in main process (avoids renderer CORS). */

/**
 * @param {string} v
 */
function normalizeVersion(v) {
  return String(v || '')
    .trim()
    .replace(/^v/i, '');
}

/**
 * @param {string} a
 * @param {string} b
 */
function compareVersions(a, b) {
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

/**
 * @param {Array<{ name?: string, browser_download_url?: string }>} assets
 */
function pickWindowsZip(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const zip =
    list.find((a) => /win-x64\.zip$/i.test(a.name || '')) ||
    list.find((a) => /\.zip$/i.test(a.name || '') && /win/i.test(a.name || '')) ||
    list.find((a) => /\.zip$/i.test(a.name || ''));
  return zip?.browser_download_url || null;
}

/**
 * @param {string} currentVersion
 * @param {{ owner: string, repo: string }} repo
 */
async function checkGithubUpdate(currentVersion, repo) {
  const current = normalizeVersion(currentVersion);
  const owner = String(repo?.owner || '').trim();
  const name = String(repo?.repo || '').trim();
  if (!owner || !name) {
    return {
      status: 'error',
      currentVersion: current,
      message: 'Update repository is not configured',
    };
  }
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/latest`;
  try {
    const res = await fetch(url, {
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
    const data = await res.json();
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
      body: String(data.body || '').trim() || '(no release notes)',
      htmlUrl:
        data.html_url || `https://github.com/${owner}/${name}/releases`,
      downloadUrl: pickWindowsZip(data.assets || []),
      publishedAt: data.published_at || null,
    };
  } catch (e) {
    return {
      status: 'error',
      currentVersion: current,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

module.exports = { checkGithubUpdate, compareVersions, normalizeVersion };
