const releaseBase = 'https://github.com/YuboCoco/CoReader/releases/';
const tagBase = releaseBase + 'tag/';
const stableVersionPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function versionParts(version) {
  const match = stableVersionPattern.exec(version);
  return match && match[0] === version ? match.slice(1).map(BigInt) : null;
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
  if (!latest) return null;

  const changed = latest.findIndex((part, index) => part !== current[index]);
  if (changed === -1 || latest[changed] < current[changed]) return null;

  return { version: latest.join('.'), url };
}
