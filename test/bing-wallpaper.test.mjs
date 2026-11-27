import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBingWallpaper } from '../src/bing-wallpaper.mjs';

function makeArchivePayload(dates) {
  return {
    images: dates.map((date) => ({
      startdate: date,
      title: `Title ${date}`,
      copyright: `Copyright ${date}`,
      urlbase: `/th?id=OHR.Test_${date}`,
    })),
  };
}

test('bing-wallpaper fetches, dedupes, caps at 30, caches offline, and caches images', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coreader-bing-'));
  try {
    const calls = [];
    const batch1 = Array.from({ length: 8 }, (_, i) => String(20261127 - i));
    const batch2 = Array.from({ length: 8 }, (_, i) => String(20261120 - i));

    const fetcher = async (url) => {
      calls.push(url);
      if (url.includes('HPImageArchive.aspx')) {
        const payload = url.includes('idx=0') ? makeArchivePayload(batch1) : makeArchivePayload(batch2);
        return new Response(JSON.stringify(payload), { status: 200 });
      }
      return new Response(Buffer.from('fake-jpeg-data-' + url), { status: 200 });
    };

    const service = createBingWallpaper({ cacheDir: dir, fetcher });
    const first = await service.list({ market: 'zh-CN', force: true });
    assert.equal(first.offline, false);
    assert.equal(first.market, 'zh-CN');
    assert.equal(first.items.length, 15); // 20261127..20261113 deduped on 20261120
    assert.equal(first.items[0].date, '20261127');

    // Second call without force uses today's disk cache without calling fetcher
    const callsBeforeCached = calls.length;
    const cached = await service.list({ market: 'zh-CN' });
    assert.equal(cached.cached, true);
    assert.equal(calls.length, callsBeforeCached);

    // Image download (UHD preferred) and cache reuse
    const img1 = await service.getImageFile({ market: 'zh-CN', date: '20261127', kind: 'full' });
    assert.ok(calls.at(-1).endsWith('_UHD.jpg'));
    const imgStat = await stat(img1.filePath);
    assert.ok(imgStat.size > 0);
    const callsAfterImg1 = calls.length;

    const img1Again = await service.getImageFile({ market: 'zh-CN', date: '20261127', kind: 'full' });
    assert.equal(img1Again.filePath, img1.filePath);
    assert.equal(calls.length, callsAfterImg1);

    // Fallback to 1920x1080 if UHD returns 404
    const fallbackService = createBingWallpaper({
      cacheDir: dir,
      fetcher: async (url) => {
        if (url.endsWith('_UHD.jpg')) return new Response(null, { status: 404 });
        return new Response(Buffer.from('fallback-1080p'), { status: 200 });
      },
    });
    const imgFallback = await fallbackService.getImageFile({ market: 'zh-CN', date: '20261126', kind: 'full' });
    assert.ok((await stat(imgFallback.filePath)).size > 0);

    const thumb = await service.getImageFile({ market: 'zh-CN', date: '20261127', kind: 'thumb' });
    assert.ok(thumb.filePath.includes('thumbs'));

    // Reject invalid dates
    await assert.rejects(() => service.getImageFile({ market: 'zh-CN', date: '../bad', kind: 'full' }), /Invalid wallpaper date/);

    // Offline fallback preserves cached catalog when fetcher fails
    const offlineService = createBingWallpaper({
      cacheDir: dir,
      fetcher: async () => { throw new Error('Network down'); },
    });
    const offline = await offlineService.list({ market: 'zh-CN', force: true });
    assert.equal(offline.offline, true);
    assert.equal(offline.items.length, 15);

    // Save favorite downloads/copies to saveDir and persists favorites.json
    const saveDir = join(dir, 'saved-wallpapers');
    const saved = await service.saveFavorite({ market: 'zh-CN', date: '20261127', saveDir });
    assert.equal(saved.favorites.length, 1);
    assert.ok(saved.savedPath.startsWith(saveDir));
    const savedStat = await stat(saved.savedPath);
    assert.ok(savedStat.size > 0);

    const listedWithFav = await service.list({ market: 'zh-CN' });
    assert.equal(listedWithFav.favorites.length, 1);
    assert.equal(listedWithFav.favorites[0].date, '20261127');

    // Removing favorite keeps downloaded file on disk
    const removed = await service.removeFavorite({ market: 'zh-CN', date: '20261127' });
    assert.equal(removed.favorites.length, 0);
    const keptStat = await stat(saved.savedPath);
    assert.ok(keptStat.size > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
