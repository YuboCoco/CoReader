import assert from 'node:assert/strict';
import test from 'node:test';
import { findAppUpdate, findAppUpdateDetails, selectUpdateAsset } from '../src/app-updates.mjs';

const stableTag = 'https://github.com/YuboCoco/CoReader/releases/tag/';
const publishedRelease = stableTag + 'v0.1.10';

function redirectTo(url) {
  return async () => ({ status: 302, headers: { get: (name) => name === 'location' ? url : null } });
}

test('reads the public latest release redirect and compares versions numerically', async () => {
  const signal = new AbortController().signal;
  const update = await findAppUpdate('0.1.9', (url, options) => {
    assert.equal(url, 'https://github.com/YuboCoco/CoReader/releases/latest');
    assert.deepEqual(options, { method: 'HEAD', cache: 'no-cache', redirect: 'manual', credentials: 'omit', signal });
    return redirectTo(publishedRelease)();
  }, signal);
  assert.deepEqual(update, { version: '0.1.10', url: publishedRelease });
});

test('ignores equal and older releases and URLs outside this repository’s stable tags', async () => {
  assert.equal(await findAppUpdate('0.1.10', redirectTo(publishedRelease)), null);
  assert.equal(await findAppUpdate('0.2.0', redirectTo(publishedRelease)), null);
  for (const url of [
    stableTag + 'v0.2.0-rc.1',
    stableTag + 'v0.2.0/path',
    stableTag + 'v0.2.0%0A',
    stableTag + 'v0.2.0\n',
    'https://github.com/other/CoReader/releases/tag/v0.2.0',
    'https://example.com/YuboCoco/CoReader/releases/tag/v0.2.0',
    'https://github.com/YuboCoco/CoReader/releases',
    null,
  ]) {
    assert.equal(await findAppUpdate('0.1.9', redirectTo(url)), null);
  }
});

test('ignores unavailable releases and lets the background caller handle connection errors', async () => {
  assert.equal(await findAppUpdate('0.1.9', async () => new Response(null, { status: 404 })), null);
  await assert.rejects(findAppUpdate('0.1.9', async () => { throw new Error('offline'); }), /offline/);
});

test('falls back to following redirects when a runtime returns an opaque redirect', async () => {
  const calls = [];
  const update = await findAppUpdate('0.1.1', async (_url, options) => {
    calls.push(options.redirect);
    if (options.redirect === 'manual') return { status: 0, type: 'opaqueredirect', headers: { get: () => null } };
    return { status: 200, ok: true, url: stableTag + 'v0.1.2', headers: { get: () => null } };
  });
  assert.deepEqual(calls, ['manual', 'follow']);
  assert.deepEqual(update, { version: '0.1.2', url: stableTag + 'v0.1.2' });
});

test('findAppUpdateDetails parses release notes and assets from GitHub API and falls back on error', async () => {
  const details = await findAppUpdateDetails('0.1.6', async (url) => {
    assert.equal(url, 'https://api.github.com/repos/YuboCoco/CoReader/releases/latest');
    return new Response(JSON.stringify({
      tag_name: 'v0.1.7',
      html_url: stableTag + 'v0.1.7',
      body: '## Highlights\n- Faster startup',
      assets: [
        {
          name: 'CoReader-0.1.7-Setup-win-x64.exe',
          browser_download_url: 'https://github.com/YuboCoco/CoReader/releases/download/v0.1.7/CoReader-0.1.7-Setup-win-x64.exe',
          size: 123456,
        },
        {
          name: 'CoReader-0.1.7-win-x64.zip',
          browser_download_url: 'https://github.com/YuboCoco/CoReader/releases/download/v0.1.7/CoReader-0.1.7-win-x64.zip',
          size: 98765,
        },
        {
          name: 'evil.exe',
          browser_download_url: 'https://evil.example.com/evil.exe',
          size: 100,
        },
      ],
    }), { status: 200 });
  });
  assert.equal(details.version, '0.1.7');
  assert.equal(details.notes, '## Highlights\n- Faster startup');
  assert.equal(details.assets.length, 2);
  assert.equal(selectUpdateAsset(details.assets, { platform: 'win32', isInstaller: true }).kind, 'win-installer');
  assert.equal(selectUpdateAsset(details.assets, { platform: 'win32', isInstaller: false }).kind, 'win-zip');

  // Falls back to HEAD redirect when API returns 403
  const fallback = await findAppUpdateDetails('0.1.6', async (url) => {
    if (url.includes('api.github.com')) return new Response(null, { status: 403 });
    return redirectTo(stableTag + 'v0.1.7')();
  });
  assert.deepEqual(fallback, { version: '0.1.7', url: stableTag + 'v0.1.7', notes: '', assets: [] });
});
