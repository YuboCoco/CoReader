import assert from 'node:assert/strict';
import test from 'node:test';
import { findAppUpdate } from '../src/app-updates.mjs';

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
