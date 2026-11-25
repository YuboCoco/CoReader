import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  ambientMimeType,
  ambientTrackTitle,
  isAmbientAudioName,
  listAmbientAudio,
  pickNextAmbientIndex,
  resolveAmbientAudioFile,
} from '../src/ambient.mjs';

test('ambientMimeType and isAmbientAudioName accept safe relative audio paths only', () => {
  assert.equal(ambientMimeType('campfire.WAV'), 'audio/wav');
  assert.equal(ambientMimeType('rain/light-rain.mp3'), 'audio/mpeg');
  assert.equal(ambientMimeType('cover.png'), null);

  assert.equal(isAmbientAudioName('nature/waves.mp3'), true);
  assert.equal(isAmbientAudioName('stream.ogg'), true);
  assert.equal(isAmbientAudioName('.hidden.wav'), false);
  assert.equal(isAmbientAudioName('../escape.mp3'), false);
  assert.equal(isAmbientAudioName('/abs/track.wav'), false);
});

test('resolveAmbientAudioFile allows safe subfolders and blocks traversal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coreader-ambient-resolve-'));
  try {
    assert.equal(resolveAmbientAudioFile(dir, 'rain.wav'), join(dir, 'rain.wav'));
    assert.equal(resolveAmbientAudioFile(dir, 'rain/light-rain.mp3'), join(dir, 'rain', 'light-rain.mp3'));
    assert.equal(resolveAmbientAudioFile(dir, '../rain.wav'), null);
    assert.equal(resolveAmbientAudioFile(dir, 'rain/../../secret.mp3'), null);
    assert.equal(resolveAmbientAudioFile(dir, 'notes.txt'), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listAmbientAudio loads categorized SoftEcho builtin tracks and custom directories', async () => {
  const builtin = await listAmbientAudio('assets/sounds', true);
  assert.equal(builtin.missing, false);
  assert.equal(builtin.tracks.length, 84);
  assert.ok(builtin.tracks.some((t) => t.name === 'nature/campfire.mp3' && t.title === '烤火' && t.category === 'nature'));
  assert.ok(builtin.tracks.some((t) => t.name === 'rain/light-rain.mp3' && t.category === 'rain'));
  assert.ok(builtin.tracks.some((t) => t.name === 'nature/waves.mp3' && t.title === '海浪'));

  assert.equal(ambientTrackTitle('forest-night.mp3', false), 'forest-night');

  const dir = await mkdtemp(join(tmpdir(), 'coreader-ambient-list-'));
  try {
    await writeFile(join(dir, 'track10.mp3'), 'x');
    await writeFile(join(dir, 'track2.wav'), 'x');
    await writeFile(join(dir, '.dot.wav'), 'x');
    await writeFile(join(dir, 'ignore.txt'), 'x');
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'sub-sound.ogg'), 'x');

    const custom = await listAmbientAudio(dir, false);
    assert.equal(custom.missing, false);
    assert.deepEqual(custom.tracks.map((t) => t.name), ['sub/sub-sound.ogg', 'track2.wav', 'track10.mp3']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('pickNextAmbientIndex keeps single loop sticky and avoids consecutive repeats in random mode', () => {
  assert.equal(pickNextAmbientIndex(3, 1, 'single'), 1);
  assert.equal(pickNextAmbientIndex(1, 0, 'random'), 0);
  for (let current = 0; current < 3; current++) {
    for (const r of [0, 0.49, 0.99]) {
      const next = pickNextAmbientIndex(3, current, 'random', () => r);
      assert.notEqual(next, current);
      assert.ok(next >= 0 && next < 3);
    }
  }
});
