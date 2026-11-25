import { createGlassLens, supportsGlassLens } from './glass-lens.mjs';

const surfaces = {
  '.elr-reader-capsule': .12,
  '.elr-pdf-outline': .08,
  '.elr-parallel-actions': .10,
  '.elr-reading-round, .elr-find, .elr-zoom-menu, .elr-reader-options, .elr-settings-panel': 0,
  '.elr-selection-tools, .elr-popup, .elr-note-bubble, .elr-term-popover, .elr-formula-card': 0,
  '.elr-sec[data-elr-floating-card], .elr-drag-ghost, .elr-card-menu, .elr-menu, .elr-agent-model-menu': 0,
  '.elr-parallel-status, .elr-workspace-tab, .desktop-update': 0,
  '.pl-dialog, .settings.model-center, .settings.connection-detail, .settings.pdf-password, .report-dialog': 0,
};
const modalDialogSelector = '.pl-dialog, .settings.model-center, .settings.connection-detail, .settings.pdf-password, .report-dialog';
const surfaceSelector = Object.keys(surfaces).join(', ');
const materialProperties = ['density', 'brightness', 'saturation', 'protection'];
const sceneSelector = '.elr-view, .elr-reading-space, .elr-pdf-container, .elr-pdf-wrap, .pl-home, .pdfViewer .page';
const inkKey = 'coreader:liquid-glass-ink';
const paperSelector = '.pdfViewer .page[data-page-number]';
const black = [0, 0, 0];
const white = [255, 255, 255];
const softBlack = [60, 60, 67];
const softWhite = [235, 235, 245];
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const luminance = ([red, green, blue]) => (.299 * red + .587 * green + .114 * blue) / 255;
const relativeGray = ([red, green, blue]) => .213 * red + .715 * green + .072 * blue;

export function glassTintPreference(value) {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1.5) : 1;
}

const relativeLuminance = (color) => color.reduce((sum, value, i) => {
  const channel = value / 255;
  const linear = channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  return sum + linear * [.2126, .7152, .0722][i];
}, 0);

function inkContrast(background, ink, opacity) {
  const blended = background.map((value, i) => mix(value, ink[i], opacity));
  const tones = [relativeLuminance(background), relativeLuminance(blended)].sort((a, b) => a - b);
  return (tones[1] + .05) / (tones[0] + .05);
}

export function describeGlassScene(samples) {
  const ranked = samples.map((rgb) => ({ rgb, light: luminance(rgb) })).sort((a, b) => a.light - b.light);
  const kept = ranked.length > 4 ? ranked.slice(2, -2) : ranked;
  const light = kept.reduce((sum, pixel) => sum + pixel.light, 0) / kept.length;
  const chroma = kept.reduce((sum, { rgb }) => sum + (Math.max(...rgb) - Math.min(...rgb)) / 255, 0) / kept.length;
  return { light, chroma, texture: kept.at(-1).light - kept[0].light, samples: kept.map(({ rgb }) => rgb) };
}

export function glassMaterial(scene, scheme, previousInk, preference, readable, allowAdaptiveInk = true) {
  const dark = scheme === 'dark';
  const threshold = previousInk === 'light' ? .55 : previousInk === 'dark' ? .45 : .50;
  const darkInk = dark || (allowAdaptiveInk && readable && scene.light < threshold);
  const ink = darkInk ? 'light' : 'dark';
  const tint = dark ? [20, 20, 24] : darkInk ? [16, 18, 22] : white;
  const [thin, dense, saturation, bright] = dark ? [.16, .38, 1.60, .8]
    : darkInk ? [.10, .30, 1.70, .85] : [.06, .22, 1.80, 1.06];
  const strength = readable ? clamp(.55 * (darkInk ? scene.light : 1 - scene.light) + .7 * scene.texture + .3 * scene.chroma) : 1;
  const keptSaturation = Math.max(.45, 1 - .75 * scene.chroma);
  const colorSaturation = mix(1, saturation * keptSaturation, Math.min(preference, 1));
  let density = darkInk ? strength : Math.round(strength * 4) / 4;
  let brightness = bright;
  let protection = 0;
  const passes = (color, opacity) => scene.samples.every((sample) => {
    const light = relativeGray(sample);
    const alpha = clamp((mix(thin, dense, density) + protection) * preference);
    const filter = mix(1, brightness, Math.min(preference, 1));
    const backdrop = sample.map((value, i) => mix(clamp(mix(light, value, colorSaturation) * filter, 0, 255), tint[i], alpha));
    return inkContrast(backdrop, color, opacity) >= 4.5;
  });
  const primary = darkInk ? white : black;
  const primaryOpacity = darkInk ? .94 : .86;
  const secondary = darkInk ? softWhite : softBlack;
  const secondaryOpacity = darkInk ? .64 : .70;
  if (preference >= .5 && !passes(primary, primaryOpacity)) {
    density = 1;
    // Keep the PDF visible. Strengthen the tint when the darkest or brightest part
    // of a mixed background would make the primary ink fail at the normal density.
    if (darkInk) {
      while (brightness > .60 && !passes(primary, primaryOpacity)) brightness = Math.max(.60, brightness - .025);
    }
    while (protection < .65 && !passes(primary, primaryOpacity)) protection += .04;
  }
  return {
    ink, density, protection,
    strongLabels: preference >= .5 && !passes(secondary, secondaryOpacity),
    brightness: mix(1, brightness, Math.min(preference, 1)),
    saturation: colorSaturation,
  };
}

function backgroundSampler() {
  let bitmaps = new WeakMap();
  const thumbnail = document.createElement('canvas');
  const context = thumbnail.getContext('2d', { willReadFrequently: true });
  const colors = new Map();

  function rgbaColor(value) {
    if (!value) return null;
    if (colors.has(value)) return colors.get(value);
    thumbnail.width = 1;
    thumbnail.height = 1;
    context.fillStyle = 'transparent';
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const rgba = [...context.getImageData(0, 0, 1, 1).data];
    if (colors.size >= 96) colors.clear();
    colors.set(value, rgba);
    return rgba;
  }

  function cssColor(value) {
    const rgba = rgbaColor(value);
    return rgba?.[3] > 250 ? rgba.slice(0, 3) : null;
  }

  function pdfPixel(page, x, y) {
    const wrapper = page.querySelector('.canvasWrapper');
    if (!wrapper) return null;
    const paper = cssColor(getComputedStyle(wrapper, '::before').backgroundColor) || white;
    for (const canvas of wrapper.querySelectorAll('canvas')) {
      const rect = canvas.getBoundingClientRect();
      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom || !canvas.width || !canvas.height) continue;
      try {
        let preview = bitmaps.get(canvas);
        if (!preview) {
          const scale = Math.min(1, 150 / Math.max(canvas.width, canvas.height));
          thumbnail.width = Math.max(1, Math.round(canvas.width * scale));
          thumbnail.height = Math.max(1, Math.round(canvas.height * scale));
          context.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
          preview = context.getImageData(0, 0, thumbnail.width, thumbnail.height);
          bitmaps.set(canvas, preview);
        }
        const px = Math.floor((x - rect.left) * preview.width / rect.width);
        const py = Math.floor((y - rect.top) * preview.height / rect.height);
        const index = (py * preview.width + px) * 4;
        const alpha = preview.data[index + 3] / 255;
        return paper.map((channel, i) => Math.min(channel, mix(255, preview.data[index + i], alpha)));
      } catch {
        // PDF.js normally owns a readable canvas. A protected canvas uses the theme fallback.
        thumbnail.width = 1;
        return null;
      }
    }
    return null;
  }

  function point(surface, x, y, fallback) {
    const stack = document.elementsFromPoint(x, y);
    for (const node of stack) {
      if (surface.contains(node) || node.closest('[data-elr-motion-copy]')) continue;
      const page = node.closest(paperSelector);
      if (page && page.closest('.elr-pdf-container')) {
        const pixel = pdfPixel(page, x, y);
        if (pixel) return { pixel, readable: true };
      }
      if (node.matches('video, img, canvas') || (node.matches('[data-elr-liquid]') && !node.contains(surface))) break;
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none') break;
      const pixel = cssColor(style.backgroundColor);
      if (pixel) return { pixel, readable: false };
    }
    return { pixel: fallback, readable: false };
  }

  function scene(surface, rect, scheme) {
    const tone = surface.closest('[class*="elr-tone-"]') || document.documentElement;
    const fallback = cssColor(getComputedStyle(tone).getPropertyValue('--dsw-alias-bg-base').trim())
      || (scheme === 'dark' ? [48, 49, 53] : [236, 239, 242]);
    // Top-layer dialogs intercept hit-testing. Read the visible PDF underneath
    // them directly, including the tint of the modal backdrop.
    const modal = surface.matches('dialog:modal');
    const scrim = modal ? rgbaColor(getComputedStyle(surface, '::backdrop').backgroundColor) : null;
    const pages = modal ? [...document.querySelectorAll(paperSelector)].flatMap((page) => {
      const scroll = page.closest('.elr-pdf-container');
      return scroll && getComputedStyle(scroll).visibility === 'visible'
        ? [{ page, box: scroll.getBoundingClientRect(), rect: page.getBoundingClientRect() }] : [];
    }) : [];
    const within = (box, x, y) => x >= box.left && x < box.right && y >= box.top && y < box.bottom;
    const points = Array.from({ length: 15 }, (_, index) => {
      const x = clamp(rect.left + ((index % 5) + .5) * rect.width / 5, 0, Math.max(0, innerWidth - 1));
      const y = clamp(rect.top + (Math.floor(index / 5) + .5) * rect.height / 3, 0, Math.max(0, innerHeight - 1));
      const underDialog = pages.find(({ rect, box }) => within(rect, x, y) && within(box, x, y));
      const pdf = underDialog && pdfPixel(underDialog.page, x, y);
      if (pdf) {
        const pixel = scrim ? pdf.map((color, i) => mix(color, scrim[i], scrim[3] / 255)) : pdf;
        return { pixel, readable: true };
      }
      return point(surface, x, y, fallback);
    });
    return { ...describeGlassScene(points.map(({ pixel }) => pixel)), readable: points.some(({ readable }) => readable) };
  }

  function refresh(page) {
    if (!page) bitmaps = new WeakMap();
    else page.querySelectorAll('.canvasWrapper canvas').forEach((canvas) => bitmaps.delete(canvas));
  }
  return { scene, refresh };
}

export function installLiquidGlass(readSettings, subscribe) {
  const root = document.documentElement;
  const noGlass = matchMedia('(prefers-reduced-transparency: reduce), (forced-colors: active), (prefers-contrast: more)');
  const lensSupported = supportsGlassLens();
  const sampler = backgroundSampler();
  const active = new Map();
  let remembered = {};
  try { remembered = JSON.parse(localStorage.getItem(inkKey)) || {}; } catch {}
  let timer;
  let frame;
  let dirtyInk = false;
  let enabled = false;
  let prefs;
  let tone;
  function updateSoon() {
    clearTimeout(timer);
    timer = null;
    if (enabled && !frame) frame = requestAnimationFrame(update);
  }
  function schedule() {
    if (enabled && !timer && !frame) timer = setTimeout(updateSoon, 80);
  }
  const resize = new ResizeObserver(schedule);

  function clearMaterial(surface) {
    surface.removeAttribute('data-elr-liquid');
    surface.removeAttribute('data-elr-liquid-ink');
    surface.removeAttribute('data-elr-liquid-strong-labels');
    surface.style.removeProperty('--elr-liquid-lens');
    for (const name of materialProperties) surface.style.removeProperty('--elr-liquid-' + name);
  }

  function restoreFrostedSurfaces() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = frame = null;
    for (const { lens } of active.values()) lens?.clear();
    active.clear();
    resize.disconnect();
    // Exit animation copies can still carry the liquid styles of their source.
    for (const surface of document.querySelectorAll('[data-elr-liquid]')) clearMaterial(surface);
    sampler.refresh();
  }

  function register(surface) {
    const [name, split] = Object.entries(surfaces).find(([selector]) => surface.matches(selector));
    const key = name.split(', ').find((selector) => surface.matches(selector));
    const state = { key, lens: split && lensSupported ? createGlassLens(surface, split) : null };
    active.set(surface, state);
    resize.observe(surface);
    return state;
  }

  function update() {
    frame = null;
    for (const [surface, state] of active) {
      if (!surface.isConnected || !surface.matches(surfaceSelector) || surface.closest('[data-elr-motion-copy]')) {
        state.lens?.clear();
        clearMaterial(surface);
        resize.unobserve(surface);
        active.delete(surface);
      }
    }
    const measured = [];
    for (const surface of document.querySelectorAll(surfaceSelector)) {
      if (surface.closest('[data-elr-motion-copy]')) continue;
      const state = active.get(surface) || register(surface);
      // Sample the settled card, keeping its material stable during a fold.
      if (surface.matches('.elr-floating-card[data-elr-folding][data-elr-liquid]')) continue;
      const rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) {
        state.lens?.clear();
        continue;
      }
      const scheme = getComputedStyle(surface).colorScheme === 'dark' ? 'dark' : 'light';
      const scene = noGlass.matches ? null : sampler.scene(surface, rect, scheme);
      const preferenceKey = scheme + ':' + state.key;
      measured.push({ surface, state, scheme, scene, rect, preferenceKey, previousInk: remembered[preferenceKey] });
    }

    // The tools use one ink whenever the responsive layout puts them on the same row.
    const rows = new Map();
    for (const item of measured) {
      if (!item.scene || !item.surface.closest('.elr-reading-tools') || !item.surface.matches('.elr-reading-round, .elr-find')) continue;
      const key = item.scheme + ':' + Math.round(item.rect.top / 8);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(item);
    }
    for (const items of rows.values()) {
      if (items.length < 2) continue;
      const scene = describeGlassScene(items.flatMap(({ scene }) => scene.samples));
      scene.readable = items.some(({ scene }) => scene.readable);
      for (const item of items) {
        item.scene = scene;
        item.rowInk = items[0].previousInk;
      }
    }

    for (const { surface, state, scheme, scene, rowInk, previousInk, preferenceKey } of measured) {
      const isDialog = surface.matches(modalDialogSelector);
      if (surface.dataset.elrLiquid !== scheme) surface.dataset.elrLiquid = scheme;
      const material = scene ? glassMaterial(scene, scheme, isDialog ? undefined : (rowInk || previousInk), prefs[scheme], scene.readable, !isDialog) : null;
      const ink = material?.ink ?? (scheme === 'dark' ? 'light' : 'dark');
      if (surface.dataset.elrLiquidInk !== ink) surface.dataset.elrLiquidInk = ink;
      if (!isDialog && scene?.readable && remembered[preferenceKey] !== ink) {
        remembered[preferenceKey] = ink;
        dirtyInk = true;
      }
      surface.toggleAttribute('data-elr-liquid-strong-labels', Boolean(material?.strongLabels));
      if (material) {
        for (const name of materialProperties) {
          const property = '--elr-liquid-' + name;
          const value = material[name].toFixed(4);
          if (surface.style.getPropertyValue(property) !== value) surface.style.setProperty(property, value);
        }
      }
      state.lens?.update(Boolean(material));
    }
    if (dirtyInk) {
      dirtyInk = false;
      try { localStorage.setItem(inkKey, JSON.stringify(remembered)); } catch {}
    }
  }

  function settingsChanged() {
    const settings = readSettings();
    const nextEnabled = settings.glassEnabled !== false;
    const light = glassTintPreference(settings.glassTintLight);
    const dark = glassTintPreference(settings.glassTintDark);
    if (enabled === nextEnabled && prefs?.light === light && prefs?.dark === dark && tone === settings.uiTone) return;
    const wasEnabled = enabled;
    enabled = nextEnabled;
    prefs = { light, dark };
    tone = settings.uiTone;
    root.style.setProperty('--elr-liquid-preference-light', light);
    root.style.setProperty('--elr-liquid-preference-dark', dark);
    if (enabled) updateSoon();
    else if (wasEnabled) restoreFrostedSurfaces();
  }

  const relevance = surfaceSelector + ', ' + sceneSelector + ', .canvasWrapper canvas';
  const changes = new MutationObserver((records) => {
    if (!enabled) return;
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.target === root || record.target.matches(relevance)) { updateSoon(); break; }
      } else if ([...record.addedNodes, ...record.removedNodes].some((node) =>
        node instanceof Element && (node.matches(relevance) || node.querySelector(relevance)))) {
        updateSoon();
        break;
      }
    }
  });
  changes.observe(root, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['class', 'open', 'hidden', 'data-desktop-scheme', 'data-elr-page-theme', 'data-reading-mode', 'data-capsule-position', 'data-elr-folding'],
  });
  settingsChanged();
  subscribe(settingsChanged);
  document.addEventListener('scroll', schedule, { capture: true, passive: true });
  document.addEventListener('toggle', updateSoon, true);
  document.addEventListener('transitionend', schedule, true);
  document.addEventListener('transitioncancel', schedule, true);
  document.addEventListener('pointermove', (event) => {
    if (event.buttons && event.target.closest?.('[data-elr-liquid], .elr-split-handle')) schedule();
  }, { passive: true });
  document.addEventListener('reader-glass-backdrop', ({ detail }) => {
    if (!enabled) return;
    sampler.refresh(detail);
    schedule();
  });
  window.addEventListener('resize', schedule, { passive: true });
  noGlass.addEventListener('change', schedule);
}
