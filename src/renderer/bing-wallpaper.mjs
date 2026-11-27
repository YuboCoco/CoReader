const DARK_UI_TONES = new Set(['navy', 'ink', 'forest', 'plum', 'ember', 'prism-dark']);

const api = window.reader;

let state = {
  enabled: false,
  market: 'zh-CN',
  selectedDate: '',
  items: [],
  favorites: [],
  activeItem: null,
  saveDir: '',
  saveDirIsDefault: true,
  loading: false,
  offline: false,
  error: '',
  accentColor: '',
};

const listeners = new Set();
let requestSeq = 0;
let accentSeq = 0;
let loadedMarket = '';
let loadedDay = '';
let currentSettings = {};
let installed = false;
let lastDarkAppearance = null;

function localDayString() {
  const now = new Date();
  return String(now.getFullYear())
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0');
}

function emit() {
  for (const listener of listeners) {
    try { listener(state); } catch {}
  }
}

function setState(patch) {
  state = { ...state, ...patch };
  emit();
}

export function getBingWallpaperState() {
  return state;
}

export function subscribeBingWallpaper(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isDarkAppearance(settings) {
  const tone = settings?.uiTone || 'default';
  if (DARK_UI_TONES.has(tone)) return true;
  if (tone === 'default') return document.documentElement.dataset.desktopScheme === 'dark';
  return false;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h /= 6;
  return [h * 360, s, l];
}

async function extractAccentFromUrl(url, dark) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 18;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, 32, 18);
  const { data } = ctx.getImageData(0, 0, 32, 18);

  let bestScore = -1;
  let bestH = 215;
  let bestS = 0.55;
  let sumSin = 0;
  let sumCos = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const rad = (h * Math.PI) / 180;
    sumSin += Math.sin(rad) * (0.2 + s);
    sumCos += Math.cos(rad) * (0.2 + s);
    count++;

    if (l < 0.14 || l > 0.88) continue;
    const midScore = 1 - Math.abs(l - 0.5) * 1.4;
    const score = s * (0.5 + 0.5 * Math.max(0, midScore));
    if (score > bestScore) {
      bestScore = score;
      bestH = h;
      bestS = s;
    }
  }

  if (bestScore < 0.12 && count > 0) {
    bestH = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
    if (bestH < 0) bestH += 360;
    bestS = 0.45;
  }

  const h = Math.round(bestH);
  if (dark) {
    const sat = Math.round(Math.max(58, Math.min(82, bestS * 100)));
    const light = 67;
    return {
      brand: `hsl(${h} ${sat}% ${light}%)`,
      ambient: `hsl(${h} ${Math.max(36, sat - 18)}% 34% / .26)`,
      bounce: `hsl(${(h + 28) % 360} ${Math.max(32, sat - 22)}% 30% / .22)`,
    };
  }
  const sat = Math.round(Math.max(48, Math.min(72, bestS * 100)));
  const light = 40;
  return {
    brand: `hsl(${h} ${sat}% ${light}%)`,
    ambient: `hsl(${h} ${Math.max(35, sat - 14)}% 78% / .32)`,
    bounce: `hsl(${(h + 28) % 360} ${Math.max(30, sat - 18)}% 82% / .28)`,
  };
}

function clearRootStyles() {
  const root = document.documentElement;
  delete root.dataset.elrBingWallpaper;
  delete root.dataset.elrBingDynamic;
  root.style.removeProperty('--elr-bing-url');
  root.style.removeProperty('--elr-bing-blur');
  root.style.removeProperty('--elr-bing-veil');
  root.style.removeProperty('--elr-bing-brand');
  root.style.removeProperty('--elr-bing-ambient');
  root.style.removeProperty('--elr-bing-bounce');
}

function clearDynamicTokens() {
  const root = document.documentElement;
  delete root.dataset.elrBingDynamic;
  root.style.removeProperty('--elr-bing-brand');
  root.style.removeProperty('--elr-bing-ambient');
  root.style.removeProperty('--elr-bing-bounce');
}

async function applyActiveWallpaper(item, settings) {
  const root = document.documentElement;
  if (!item) return;
  const seq = ++requestSeq;
  const preloader = new Image();
  await new Promise((resolve) => {
    preloader.onload = resolve;
    preloader.onerror = resolve;
    preloader.src = item.fullUrl;
  });
  if (seq !== requestSeq || !currentSettings.bingWallpaperEnabled) return;
  root.style.setProperty('--elr-bing-url', `url("${item.fullUrl}")`);

  if (settings.bingWallpaperDynamicColor !== false && item.thumbUrl) {
    const aSeq = ++accentSeq;
    try {
      const dark = isDarkAppearance(settings);
      const palette = await extractAccentFromUrl(item.thumbUrl, dark);
      if (aSeq !== accentSeq || !currentSettings.bingWallpaperEnabled || currentSettings.bingWallpaperDynamicColor === false) {
        return;
      }
      if (palette) {
        lastDarkAppearance = dark;
        root.dataset.elrBingDynamic = 'on';
        root.style.setProperty('--elr-bing-brand', palette.brand);
        root.style.setProperty('--elr-bing-ambient', palette.ambient);
        root.style.setProperty('--elr-bing-bounce', palette.bounce);
        setState({ accentColor: palette.brand });
      }
    } catch {
      lastDarkAppearance = null;
      clearDynamicTokens();
    }
  } else {
    lastDarkAppearance = null;
    clearDynamicTokens();
    setState({ accentColor: '' });
  }
}

async function syncCatalog(market, force = false) {
  if (!api?.bingWallpaperList) return;
  const today = localDayString();
  if (!force && loadedMarket === market && loadedDay === today && state.items.length > 0) {
    return;
  }
  setState({ loading: true, error: '' });
  try {
    const result = await api.bingWallpaperList({ market, force });
    loadedMarket = result.market || market;
    loadedDay = result.today || today;
    const items = Array.isArray(result.items) ? result.items : [];
    const favorites = Array.isArray(result.favorites) ? result.favorites : state.favorites;
    const selectedDate = currentSettings.bingWallpaperDate;
    const activeItem = items.find((i) => i.date === selectedDate)
      || favorites.find((i) => i.date === selectedDate && (i.market || loadedMarket) === loadedMarket)
      || favorites.find((i) => i.date === selectedDate)
      || items[0]
      || null;
    setState({
      market: loadedMarket,
      items,
      favorites,
      activeItem,
      loading: false,
      offline: Boolean(result.offline),
      error: result.error || '',
    });
    if (currentSettings.bingWallpaperEnabled && activeItem) {
      applyActiveWallpaper(activeItem, currentSettings);
    }
  } catch (error) {
    setState({
      loading: false,
      offline: true,
      error: error?.message || '获取 Bing 壁纸失败',
    });
  }
}

export async function refreshBingWallpapers(force = true) {
  const market = currentSettings.bingWallpaperMarket === 'en-US' ? 'en-US' : 'zh-CN';
  await syncCatalog(market, force);
}

export function isBingFavorited(item, favorites = state.favorites) {
  if (!item?.date || !Array.isArray(favorites)) return false;
  const mkt = item.market || state.market || 'zh-CN';
  return favorites.some((fav) => fav.date === item.date && (fav.market || 'zh-CN') === mkt);
}

export async function toggleBingFavorite(item = state.activeItem) {
  if (!item?.date) return null;
  const mkt = item.market || state.market || 'zh-CN';
  if (isBingFavorited(item, state.favorites)) {
    const res = await api?.bingWallpaperRemoveFavorite?.({ market: mkt, date: item.date });
    if (res?.favorites) setState({ favorites: res.favorites });
    return { favorited: false };
  }
  const res = await api?.bingWallpaperSaveFavorite?.({ market: mkt, date: item.date });
  if (res?.favorites) setState({ favorites: res.favorites });
  return { favorited: true, savedPath: res?.savedPath || '' };
}

export async function loadBingSaveDir() {
  const info = await api?.bingWallpaperGetSaveDir?.();
  if (info?.path) {
    setState({ saveDir: info.path, saveDirIsDefault: Boolean(info.isDefault) });
  }
  return info || null;
}

export async function chooseBingSaveDir() {
  const info = await api?.bingWallpaperChooseSaveDir?.();
  if (info?.path) {
    setState({ saveDir: info.path, saveDirIsDefault: Boolean(info.isDefault) });
  }
  return info || null;
}

export async function openBingSaveDir() {
  return api?.bingWallpaperOpenSaveDir?.();
}

function applySettings(settings) {
  currentSettings = settings || {};
  const enabled = Boolean(currentSettings.bingWallpaperEnabled);
  const market = currentSettings.bingWallpaperMarket === 'en-US' ? 'en-US' : 'zh-CN';
  const selectedDate = typeof currentSettings.bingWallpaperDate === 'string' ? currentSettings.bingWallpaperDate : '';
  const blur = Math.max(0, Math.min(16, Number(currentSettings.bingWallpaperBlur ?? 0) || 0));
  const dim = Math.max(0, Math.min(75, Number(currentSettings.bingWallpaperDim ?? 28) || 0));

  const root = document.documentElement;
  if (!enabled) {
    requestSeq++;
    accentSeq++;
    lastDarkAppearance = null;
    clearRootStyles();
    setState({ enabled: false, market, selectedDate, accentColor: '' });
    return;
  }

  root.dataset.elrBingWallpaper = 'on';
  root.style.setProperty('--elr-bing-blur', `${blur}px`);
  root.style.setProperty('--elr-bing-veil', String(dim));

  const activeItem = state.items.find((i) => i.date === selectedDate)
    || state.favorites.find((i) => i.date === selectedDate && (i.market || market) === market)
    || state.favorites.find((i) => i.date === selectedDate)
    || state.items[0]
    || null;
  const marketChanged = loadedMarket !== market;
  const dateChanged = activeItem?.date !== state.activeItem?.date;
  const dynamicChanged = (currentSettings.bingWallpaperDynamicColor !== false) !== Boolean(root.dataset.elrBingDynamic === 'on');
  const darkNow = isDarkAppearance(currentSettings);
  const appearanceChanged = currentSettings.bingWallpaperDynamicColor !== false && darkNow !== lastDarkAppearance;

  setState({ enabled: true, market, selectedDate, activeItem });

  if (marketChanged || loadedDay !== localDayString() || !state.items.length) {
    syncCatalog(market, false);
  } else if (activeItem && (dateChanged || dynamicChanged || appearanceChanged || !root.style.getPropertyValue('--elr-bing-url'))) {
    applyActiveWallpaper(activeItem, currentSettings);
  }
}

export function installBingWallpaper(readSettings, subscribeSettings) {
  if (installed) return;
  installed = true;

  applySettings(readSettings());
  subscribeSettings(() => applySettings(readSettings()));

  const checkRollover = () => {
    if (!currentSettings.bingWallpaperEnabled) return;
    const today = localDayString();
    if (loadedDay && loadedDay !== today) {
      syncCatalog(currentSettings.bingWallpaperMarket === 'en-US' ? 'en-US' : 'zh-CN', true);
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkRollover();
  });
  window.setInterval(checkRollover, 15 * 60 * 1000);

  const observer = new MutationObserver(() => {
    if (currentSettings.bingWallpaperEnabled && currentSettings.bingWallpaperDynamicColor !== false && state.activeItem) {
      applyActiveWallpaper(state.activeItem, currentSettings);
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-desktop-scheme'] });
}
