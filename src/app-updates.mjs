const repo = 'YuboCoco/CoReader';
const releaseBase = `https://github.com/${repo}/releases/`;
const tagBase = releaseBase + 'tag/';
const downloadBase = releaseBase + 'download/';
const latestApiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
const stableVersionPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function versionParts(version) {
  if (typeof version !== 'string') return null;
  const match = stableVersionPattern.exec(version);
  return match && match[0] === version ? match.slice(1).map(BigInt) : null;
}

function isNewerVersion(candidateParts, currentParts) {
  if (!candidateParts || !currentParts) return false;
  const changed = candidateParts.findIndex((part, index) => part !== currentParts[index]);
  return changed !== -1 && candidateParts[changed] > currentParts[changed];
}

export async function findAppUpdate(currentVersion, fetcher, signal) {
  const current = versionParts(currentVersion);
  if (!current) return null;

  // Read GitHub’s latest stable tag from the permanent release redirect.
  const response = await fetcher(releaseBase + 'latest', {
    method: 'HEAD', cache: 'no-cache', redirect: 'manual', credentials: 'omit', signal,
  });
  let url = null;
  if (response.status >= 300 && response.status < 400) {
    url = response.headers.get('location');
  } else if (response.type === 'opaqueredirect') {
    const followed = await fetcher(releaseBase + 'latest', {
      method: 'HEAD', cache: 'no-cache', redirect: 'follow', credentials: 'omit', signal,
    });
    if (followed.ok) url = followed.url;
  } else {
    return null;
  }
  if (!url?.startsWith(tagBase)) return null;

  const latest = versionParts(url.slice(tagBase.length));
  if (!isNewerVersion(latest, current)) return null;

  return { version: latest.join('.'), url };
}

export async function findAppUpdateDetails(currentVersion, fetcher, signal) {
  const current = versionParts(currentVersion);
  if (!current) return null;

  try {
    const response = await fetcher(latestApiUrl, {
      method: 'GET',
      cache: 'no-cache',
      credentials: 'omit',
      headers: { Accept: 'application/vnd.github+json' },
      signal,
    });
    if (response.ok) {
      const data = await response.json();
      if (data && !data.draft && !data.prerelease) {
        const latest = versionParts(data.tag_name);
        const url = typeof data.html_url === 'string' && data.html_url.startsWith(tagBase)
          ? data.html_url
          : (latest ? `${tagBase}v${latest.join('.')}` : '');
        if (!latest || !url) return null;
        if (!isNewerVersion(latest, current)) return null;
        const assets = Array.isArray(data.assets)
          ? data.assets
            .filter((asset) => asset
              && typeof asset.name === 'string'
              && typeof asset.browser_download_url === 'string'
              && asset.browser_download_url.startsWith(downloadBase))
            .map((asset) => ({
              name: asset.name,
              url: asset.browser_download_url,
              size: Number.isFinite(Number(asset.size)) ? Number(asset.size) : 0,
            }))
          : [];
        return {
          version: latest.join('.'),
          url,
          notes: typeof data.body === 'string' ? data.body.trim() : '',
          assets,
        };
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    // Fall back to the lightweight redirect check below.
  }

  const fallback = await findAppUpdate(currentVersion, fetcher, signal);
  return fallback ? { ...fallback, notes: '', assets: [] } : null;
}

export function selectUpdateAsset(assets, { platform = process.platform, arch = process.arch, isInstaller = false } = {}) {
  if (!Array.isArray(assets) || !assets.length) return null;
  if (platform === 'win32') {
    if (isInstaller) {
      const exe = assets.find((a) => /-Setup-win-x64\.exe$/i.test(a.name));
      if (exe) return { ...exe, kind: 'win-installer' };
    }
    const zip = assets.find((a) => /-win-x64\.zip$/i.test(a.name));
    if (zip) return { ...zip, kind: 'win-zip' };
    if (!isInstaller) {
      const exe = assets.find((a) => /-Setup-win-x64\.exe$/i.test(a.name));
      if (exe) return { ...exe, kind: 'win-installer' };
    }
    return null;
  }
  if (platform === 'darwin') {
    const pattern = arch === 'arm64' ? /-mac-arm64\.zip$/i : /-mac-x64\.zip$/i;
    const zip = assets.find((a) => pattern.test(a.name));
    return zip ? { ...zip, kind: 'mac-zip' } : null;
  }
  return null;
}
