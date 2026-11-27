import { copyFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const BING_MARKETS = ['zh-CN', 'en-US'];
const MAX_HISTORY = 30;
const MAX_CACHED_IMAGES = 40;

const MARKET_ORIGINS = {
  'zh-CN': 'https://cn.bing.com',
  'en-US': 'https://www.bing.com',
};

export function normalizeMarket(market) {
  return market === 'en-US' ? 'en-US' : 'zh-CN';
}

export function isValidDate(date) {
  return typeof date === 'string' && /^\d{8}$/.test(date);
}

export function normalizeKind(kind) {
  return kind === 'thumb' ? 'thumb' : 'full';
}

function localDayString(now = new Date()) {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return year + month + day;
}

async function readCatalog(catalogPath) {
  try {
    const raw = await readFile(catalogPath, 'utf8');
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items.filter((item) =>
      item && isValidDate(item.date) && typeof item.urlbase === 'string' && item.urlbase.startsWith('/')
    ) : [];
    return {
      updatedDay: typeof parsed?.updatedDay === 'string' ? parsed.updatedDay : '',
      items,
    };
  } catch {
    return { updatedDay: '', items: [] };
  }
}

async function writeCatalog(catalogPath, updatedDay, items) {
  const tempPath = catalogPath + '.tmp-' + process.pid + '-' + Date.now();
  await writeFile(tempPath, JSON.stringify({ updatedDay, items }, null, 2), 'utf8');
  await rename(tempPath, catalogPath);
}

function sanitizeFilenamePart(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
    .trim();
}

async function readFavorites(favoritesPath) {
  try {
    const raw = await readFile(favoritesPath, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];
    return list.filter((item) => item && isValidDate(item.date) && typeof item.urlbase === 'string' && item.urlbase.startsWith('/'))
      .map((item) => ({
        market: normalizeMarket(item.market),
        date: item.date,
        title: typeof item.title === 'string' ? item.title : '',
        copyright: typeof item.copyright === 'string' ? item.copyright : '',
        urlbase: item.urlbase,
        savedPath: typeof item.savedPath === 'string' ? item.savedPath : '',
        savedAt: typeof item.savedAt === 'string' ? item.savedAt : '',
      }));
  } catch {
    return [];
  }
}

async function writeFavorites(favoritesPath, list) {
  const tempPath = favoritesPath + '.tmp-' + process.pid + '-' + Date.now();
  await writeFile(tempPath, JSON.stringify(list, null, 2), 'utf8');
  await rename(tempPath, favoritesPath);
}

async function pruneFolder(folderPath, maxFiles) {
  try {
    const names = await readdir(folderPath);
    if (names.length <= maxFiles) return;
    const stats = await Promise.all(names.map(async (name) => {
      const full = join(folderPath, name);
      try {
        const info = await stat(full);
        return info.isFile() ? { full, mtimeMs: info.mtimeMs } : null;
      } catch {
        return null;
      }
    }));
    const files = stats.filter(Boolean).sort((a, b) => a.mtimeMs - b.mtimeMs);
    const excess = files.length - maxFiles;
    for (let i = 0; i < excess; i++) {
      await unlink(files[i].full).catch(() => {});
    }
  } catch {
    // Ignore cleanup errors.
  }
}

export function createBingWallpaper({ cacheDir, fetcher = fetch }) {
  if (!cacheDir) throw new Error('cacheDir is required');

  const favoritesPath = join(cacheDir, 'favorites.json');

  const list = async ({ market = 'zh-CN', force = false } = {}) => {
    const mkt = normalizeMarket(market);
    const origin = MARKET_ORIGINS[mkt];
    const today = localDayString();
    await mkdir(cacheDir, { recursive: true });
    const catalogPath = join(cacheDir, `catalog-${mkt}.json`);
    const [cached, favorites] = await Promise.all([
      readCatalog(catalogPath),
      readFavorites(favoritesPath),
    ]);

    if (!force && cached.updatedDay === today && cached.items.length > 0) {
      return { market: mkt, today, items: cached.items, favorites, offline: false, cached: true };
    }

    try {
      const urls = [
        `${origin}/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=${mkt}`,
        `${origin}/HPImageArchive.aspx?format=js&idx=7&n=8&mkt=${mkt}`,
      ];
      const responses = await Promise.all(urls.map(async (url) => {
        const res = await fetcher(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`Bing API responded ${res.status}`);
        return res.json();
      }));

      const merged = new Map(cached.items.map((item) => [item.date, item]));
      for (const payload of responses) {
        const images = Array.isArray(payload?.images) ? payload.images : [];
        for (const img of images) {
          if (!img || !isValidDate(img.startdate) || typeof img.urlbase !== 'string' || !img.urlbase.startsWith('/')) {
            continue;
          }
          merged.set(img.startdate, {
            date: img.startdate,
            title: typeof img.title === 'string' ? img.title : '',
            copyright: typeof img.copyright === 'string' ? img.copyright : '',
            urlbase: img.urlbase,
          });
        }
      }

      const items = [...merged.values()]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, MAX_HISTORY);

      await writeCatalog(catalogPath, today, items);
      return { market: mkt, today, items, favorites, offline: false };
    } catch (error) {
      return {
        market: mkt,
        today,
        items: cached.items,
        favorites,
        offline: true,
        error: error?.message || 'Fetch failed',
      };
    }
  };

  const getImageFile = async ({ market = 'zh-CN', date, kind = 'full' }) => {
    if (!isValidDate(date)) throw new Error('Invalid wallpaper date');
    const mkt = normalizeMarket(market);
    const k = normalizeKind(kind);
    const subDir = join(cacheDir, k === 'thumb' ? 'thumbs' : 'images');
    await mkdir(subDir, { recursive: true });
    const filePath = join(subDir, k === 'thumb' ? `${mkt}-${date}.jpg` : `${mkt}-${date}-uhd.jpg`);

    try {
      const info = await stat(filePath);
      if (info.isFile() && info.size > 0) {
        return { filePath, mime: 'image/jpeg' };
      }
    } catch {
      // Cache miss; proceed to download.
    }

    const catalogPath = join(cacheDir, `catalog-${mkt}.json`);
    let catalog = await readCatalog(catalogPath);
    let item = catalog.items.find((entry) => entry.date === date);
    if (!item) {
      const favorites = await readFavorites(favoritesPath);
      item = favorites.find((entry) => entry.market === mkt && entry.date === date);
    }
    if (!item) {
      const refreshed = await list({ market: mkt });
      item = refreshed.items.find((entry) => entry.date === date);
    }
    if (!item) throw new Error('Wallpaper not found');

    const origin = MARKET_ORIGINS[mkt];
    const resolutions = k === 'thumb' ? ['400x240'] : ['UHD', '1920x1080'];
    let buffer = null;
    let lastError = null;
    for (const resolution of resolutions) {
      const imageUrl = `${origin}${item.urlbase}_${resolution}.jpg`;
      try {
        const res = await fetcher(imageUrl, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) {
          lastError = new Error(`Image download responded ${res.status}`);
          continue;
        }
        const data = Buffer.from(await res.arrayBuffer());
        if (!data.length) {
          lastError = new Error('Empty image payload');
          continue;
        }
        buffer = data;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!buffer) throw lastError || new Error('Image download failed');

    const tempPath = filePath + '.tmp-' + process.pid + '-' + Date.now();
    await writeFile(tempPath, buffer);
    await rename(tempPath, filePath);
    await pruneFolder(subDir, MAX_CACHED_IMAGES);
    return { filePath, mime: 'image/jpeg' };
  };

  const getFavorites = async () => readFavorites(favoritesPath);

  const saveFavorite = async ({ market = 'zh-CN', date, saveDir }) => {
    if (!isValidDate(date)) throw new Error('Invalid wallpaper date');
    if (typeof saveDir !== 'string' || !saveDir.trim()) throw new Error('Invalid save directory');
    const mkt = normalizeMarket(market);
    await mkdir(cacheDir, { recursive: true });

    const { filePath } = await getImageFile({ market: mkt, date, kind: 'full' });
    const catalog = await readCatalog(join(cacheDir, `catalog-${mkt}.json`));
    const existing = await readFavorites(favoritesPath);
    const meta = catalog.items.find((entry) => entry.date === date)
      || existing.find((entry) => entry.market === mkt && entry.date === date);
    if (!meta) throw new Error('Wallpaper metadata not found');

    await mkdir(saveDir, { recursive: true });
    const slug = sanitizeFilenamePart(meta.title || '');
    const fileName = slug ? `Bing-${date}-${slug}.jpg` : `Bing-${mkt}-${date}.jpg`;
    const savedPath = join(saveDir, fileName);
    await copyFile(filePath, savedPath);

    const favorite = {
      market: mkt,
      date,
      title: meta.title || '',
      copyright: meta.copyright || '',
      urlbase: meta.urlbase,
      savedPath,
      savedAt: new Date().toISOString(),
    };
    const next = [
      favorite,
      ...existing.filter((entry) => !(entry.market === mkt && entry.date === date)),
    ];
    await writeFavorites(favoritesPath, next);
    return { favorite, favorites: next, savedPath };
  };

  const removeFavorite = async ({ market = 'zh-CN', date }) => {
    if (!isValidDate(date)) throw new Error('Invalid wallpaper date');
    const mkt = normalizeMarket(market);
    await mkdir(cacheDir, { recursive: true });
    const existing = await readFavorites(favoritesPath);
    const next = existing.filter((entry) => !(entry.market === mkt && entry.date === date));
    await writeFavorites(favoritesPath, next);
    return { favorites: next };
  };

  return { list, getImageFile, getFavorites, saveFavorite, removeFavorite };
}
