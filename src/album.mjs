import { readdir, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';

export const ALBUM_MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function albumMimeType(name) {
  if (typeof name !== 'string') return null;
  return ALBUM_MIME_TYPES[extname(name).toLowerCase()] || null;
}

export function isAlbumImageName(name) {
  if (typeof name !== 'string' || !name || name.startsWith('.')) return false;
  if (basename(name) !== name || name.includes('/') || name.includes('\\')) return false;
  return Boolean(albumMimeType(name));
}

export function resolveAlbumImageFile(folderPath, fileName) {
  if (typeof folderPath !== 'string' || !folderPath.trim() || !isAlbumImageName(fileName)) return null;
  const root = resolve(folderPath);
  const target = resolve(root, fileName);
  const rel = relative(root, target);
  if (!rel || rel !== fileName || rel.startsWith('..') || isAbsolute(rel)) return null;
  return target;
}

export async function listAlbumImages(folderPath) {
  if (typeof folderPath !== 'string' || !folderPath.trim()) {
    return { path: '', images: [] };
  }
  const root = resolve(folderPath);
  let info;
  try {
    info = await stat(root);
  } catch {
    return { path: root, images: [], missing: true };
  }
  if (!info.isDirectory()) {
    return { path: root, images: [], missing: true };
  }
  const entries = await readdir(root, { withFileTypes: true });
  const images = entries
    .filter((entry) => entry.isFile() && isAlbumImageName(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => nameCollator.compare(a, b));
  return { path: root, images, missing: false };
}
