import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  albumMimeType,
  isAlbumImageName,
  listAlbumImages,
  resolveAlbumImageFile,
} from '../src/album.mjs';

test('albumMimeType and isAlbumImageName accept safe raster filenames only', () => {
  assert.equal(albumMimeType('cover.JPG'), 'image/jpeg');
  assert.equal(albumMimeType('shot.webp'), 'image/webp');
  assert.equal(albumMimeType('note.txt'), null);

  assert.equal(isAlbumImageName('photo-1.png'), true);
  assert.equal(isAlbumImageName('photo.AVIF'), true);
  assert.equal(isAlbumImageName('.hidden.png'), false);
  assert.equal(isAlbumImageName('../escape.png'), false);
  assert.equal(isAlbumImageName('sub/pic.jpg'), false);
  assert.equal(isAlbumImageName('sub\\pic.jpg'), false);
  assert.equal(isAlbumImageName('vector.svg'), false);
});

test('resolveAlbumImageFile blocks traversal and nested paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coreader-album-resolve-'));
  try {
    assert.equal(resolveAlbumImageFile(dir, 'a.jpg'), resolve(dir, 'a.jpg'));
    assert.equal(resolveAlbumImageFile(dir, '../a.jpg'), null);
    assert.equal(resolveAlbumImageFile(dir, 'nested/a.jpg'), null);
    assert.equal(resolveAlbumImageFile('', 'a.jpg'), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listAlbumImages sorts naturally and ignores hidden or unsupported entries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coreader-album-list-'));
  try {
    await writeFile(join(dir, 'img10.png'), 'x');
    await writeFile(join(dir, 'img2.jpg'), 'x');
    await writeFile(join(dir, 'img1.webp'), 'x');
    await writeFile(join(dir, '.DS_Store.png'), 'x');
    await writeFile(join(dir, 'readme.txt'), 'x');
    await mkdir(join(dir, 'nested.jpg'));

    const listed = await listAlbumImages(dir);
    assert.equal(listed.missing, false);
    assert.deepEqual(listed.images, ['img1.webp', 'img2.jpg', 'img10.png']);

    const missing = await listAlbumImages(join(dir, 'does-not-exist'));
    assert.equal(missing.missing, true);
    assert.deepEqual(missing.images, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
