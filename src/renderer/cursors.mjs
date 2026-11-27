// Slim, soft-rounded pill-geometry cursor suite for CoReader.
// Designed around two signature motifs:
// 1. A nimble, tailless softly-rounded arrowhead for the default pointer.
// 2. Refined rounded-cap corner arcs paired with delicate nested inner wedges
//    for resize & directional cursors.
// Sized at 20-22px so cursors feel light, sharp, and unobtrusive on dense PDF text.

const DARK_UI_TONES = new Set(['navy', 'ink', 'forest', 'plum', 'ember', 'prism-dark']);

const PALETTES = {
  light: {
    top: '#223045',
    bottom: '#131c2b',
    stroke: '#ffffff',
    strokeWidth: '1.2',
    accent: '#2563eb',
    shadow: 'rgba(12, 20, 34, 0.20)',
  },
  dark: {
    top: '#ffffff',
    bottom: '#eaf1fa',
    stroke: '#0f1726',
    strokeWidth: '0.95',
    accent: '#60a5fa',
    shadow: 'rgba(4, 10, 22, 0.36)',
  },
};

function svgCursor(size, hotspotX, hotspotY, body, fallback) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;
  const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return {
    size,
    hotspotX,
    hotspotY,
    fallback,
    dataUri,
    css: `url("${dataUri}") ${hotspotX} ${hotspotY}, ${fallback}`,
  };
}

function defs(p) {
  return `<defs>`
    + `<linearGradient id="g" x1="0" y1="0" x2="0.2" y2="1">`
    + `<stop offset="0%" stop-color="${p.top}"/>`
    + `<stop offset="100%" stop-color="${p.bottom}"/>`
    + `</linearGradient>`
    + `<filter id="s" x="-25%" y="-25%" width="150%" height="150%">`
    + `<feDropShadow dx="0" dy="0.7" stdDeviation="0.7" flood-color="${p.shadow}"/>`
    + `</filter>`
    + `</defs>`;
}

// Slim signature resize motif: two opposing rounded-cap arcs with delicate
// nested triangular wedges tucked inside each crook, centered at (11, 11).
function arcWedgeResize(p, angleDeg) {
  const corner = `<path d="M4.2 8.8 V5.8 C4.2 4.8 4.8 4.2 5.8 4.2 H8.8" fill="none" stroke="${p.stroke}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="M4.2 8.8 V5.8 C4.2 4.8 4.8 4.2 5.8 4.2 H8.8" fill="none" stroke="url(#g)" stroke-width="2.05" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="M6.8 9.2 L6.8 7.3 C6.8 7.0 7.0 6.8 7.3 6.8 L9.2 6.8 C9.6 6.8 9.7 7.2 9.4 7.5 L7.5 9.4 C7.2 9.7 6.8 9.6 6.8 9.2 Z" fill="url(#g)" stroke="${p.stroke}" stroke-width="0.8" stroke-linejoin="round"/>`;

  return `${defs(p)}<g filter="url(#s)" transform="rotate(${angleDeg} 11 11)">`
    + corner
    + `<g transform="rotate(180 11 11)">${corner}</g>`
    + `</g>`;
}

function buildCursorSet(scheme) {
  const p = PALETTES[scheme === 'dark' ? 'dark' : 'light'];
  const g = defs(p);
  const make = (size, hx, hy, body, fallback) => svgCursor(size, hx, hy, body, fallback);

  return {
    // Nimble tailless softly-rounded organic arrowhead
    '--elr-cur-default': make(22, 4, 2,
      `${g}<g filter="url(#s)">`
      + `<path d="M4.0 3.3 C4.0 2.3 5.1 1.8 5.9 2.4 L16.2 10.1 C17.1 10.8 16.7 12.2 15.6 12.4 L11.9 12.8 C10.4 13.0 9.1 13.7 8.1 14.8 L6.2 16.7 C5.4 17.5 4.0 16.9 4.0 15.8 Z" fill="url(#g)" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`
      + `</g>`,
      'default'
    ),

    // Slim rounded minimalist pointing hand
    '--elr-cur-pointer': make(22, 8, 2,
      `${g}<g filter="url(#s)">`
      + `<path d="M8.1 2.4 C9.0 2.4 9.7 3.1 9.7 4.0 V8.4 C10.1 8.0 10.6 7.8 11.2 7.8 C11.9 7.8 12.4 8.2 12.7 8.7 C13.1 8.4 13.6 8.2 14.1 8.2 C14.9 8.2 15.5 8.7 15.7 9.4 C16.1 9.2 16.5 9.1 17.0 9.3 C17.7 9.6 18.2 10.3 18.2 11.2 V13.6 C18.2 16.6 16.0 18.8 12.9 18.8 H10.8 C8.4 18.8 6.7 17.5 5.4 15.4 L3.5 12.3 C3.0 11.4 3.3 10.3 4.2 9.9 C4.9 9.5 5.7 9.7 6.2 10.3 L6.5 10.7 V4.0 C6.5 3.1 7.2 2.4 8.1 2.4 Z" fill="url(#g)" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`
      + `</g>`,
      'pointer'
    ),

    // Razor-fine I-beam for PDF text selection
    '--elr-cur-text': make(20, 10, 10,
      `<path d="M8.1 4.2 Q10 4.7 11.9 4.2 M10 4.6 V15.4 M8.1 15.8 Q10 15.3 11.9 15.8" fill="none" stroke="${p.stroke}" stroke-width="2.1" stroke-linecap="round"/>`
      + `<path d="M8.1 4.2 Q10 4.7 11.9 4.2 M10 4.6 V15.4 M8.1 15.8 Q10 15.3 11.9 15.8" fill="none" stroke="${p.top}" stroke-width="1.05" stroke-linecap="round"/>`,
      'text'
    ),

    // Slim rounded open hand
    '--elr-cur-grab': make(22, 11, 11,
      `${g}<g filter="url(#s)">`
      + `<path d="M8.2 5.4 C8.2 4.6 8.8 4.0 9.6 4.0 C10.3 4.0 10.9 4.6 10.9 5.4 V8.8 V4.7 C10.9 3.9 11.5 3.2 12.3 3.2 C13.1 3.2 13.7 3.9 13.7 4.7 V8.8 V5.8 C13.7 5.0 14.3 4.4 15.0 4.4 C15.7 4.4 16.3 5.0 16.3 5.8 V9.6 V7.7 C16.3 7.0 16.9 6.5 17.5 6.5 C18.2 6.5 18.7 7.0 18.7 7.8 V12.9 C18.7 16.2 16.2 18.6 12.9 18.6 H10.9 C8.3 18.6 6.5 17.2 5.3 15.0 L3.7 12.1 C3.3 11.3 3.6 10.3 4.3 9.9 C5.0 9.5 5.9 9.8 6.3 10.5 L7.7 12.4 V7.3 C7.7 6.5 7.9 5.9 8.2 5.4 Z" fill="url(#g)" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`
      + `</g>`,
      'grab'
    ),

    // Slim rounded gripping hand
    '--elr-cur-grabbing': make(22, 11, 11,
      `${g}<g filter="url(#s)">`
      + `<path d="M7.5 8.8 C7.5 7.7 8.3 7.0 9.3 7.0 C9.9 7.0 10.3 7.3 10.7 7.6 C11.0 7.1 11.5 6.8 12.2 6.8 C12.9 6.8 13.4 7.1 13.7 7.6 C14.1 7.3 14.6 7.2 15.1 7.2 C15.8 7.2 16.5 7.7 16.7 8.4 C17.1 8.3 17.5 8.3 17.9 8.4 C18.5 8.7 18.9 9.4 18.9 10.2 V12.9 C18.9 16.0 16.6 18.3 13.3 18.3 H10.8 C8.3 18.3 6.5 16.9 5.4 14.8 L4.4 13.0 C4.0 12.1 4.3 11.1 5.1 10.7 C5.8 10.3 6.6 10.6 7.0 11.2 L7.5 11.9 Z" fill="url(#g)" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`
      + `</g>`,
      'grabbing'
    ),

    // Fine open-aperture crosshair with accent center dot
    '--elr-cur-crosshair': make(20, 10, 10,
      `<path d="M10 2.4 V6.4 M10 13.6 V17.6 M2.4 10 H6.4 M13.6 10 H17.6" fill="none" stroke="${p.stroke}" stroke-width="2.6" stroke-linecap="round"/>`
      + `<path d="M10 2.4 V6.4 M10 13.6 V17.6 M2.4 10 H6.4 M13.6 10 H17.6" fill="none" stroke="${p.top}" stroke-width="1.3" stroke-linecap="round"/>`
      + `<circle cx="10" cy="10" r="1.5" fill="${p.accent}" stroke="${p.stroke}" stroke-width="0.8"/>`,
      'crosshair'
    ),

    // Refined 4-way rounded directional chevrons around a center dot
    '--elr-cur-move': make(22, 11, 11,
      `${g}<g filter="url(#s)">`
      + [0, 90, 180, 270].map((deg) => (
        `<g transform="rotate(${deg} 11 11)">`
        + `<path d="M8.8 5.2 L10.6 3.4 C10.8 3.2 11.2 3.2 11.4 3.4 L13.2 5.2" fill="none" stroke="${p.stroke}" stroke-width="3.0" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<path d="M8.8 5.2 L10.6 3.4 C10.8 3.2 11.2 3.2 11.4 3.4 L13.2 5.2" fill="none" stroke="url(#g)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
        + `</g>`
      )).join('')
      + `<circle cx="11" cy="11" r="1.75" fill="url(#g)" stroke="${p.stroke}" stroke-width="0.9"/>`
      + `</g>`,
      'move'
    ),

    // Slim signature resize suite (NW-SE, NE-SW, E-W, N-S)
    '--elr-cur-nwse': make(22, 11, 11, arcWedgeResize(p, 0), 'nwse-resize'),
    '--elr-cur-nesw': make(22, 11, 11, arcWedgeResize(p, 90), 'nesw-resize'),
    '--elr-cur-ew': make(22, 11, 11, arcWedgeResize(p, -45), 'ew-resize'),
    '--elr-cur-ns': make(22, 11, 11, arcWedgeResize(p, 45), 'ns-resize'),

    // Slim column splitter
    '--elr-cur-col': make(22, 11, 11,
      `${g}<g filter="url(#s)">`
      + `<rect x="10.0" y="4.5" width="2.0" height="13.0" rx="1.0" fill="url(#g)" stroke="${p.stroke}" stroke-width="0.9"/>`
      + `<path d="M6.8 8.3 L4.2 10.6 C4.0 10.8 4.0 11.2 4.2 11.4 L6.8 13.7" fill="none" stroke="${p.stroke}" stroke-width="3.0" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M6.8 8.3 L4.2 10.6 C4.0 10.8 4.0 11.2 4.2 11.4 L6.8 13.7" fill="none" stroke="url(#g)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M15.2 8.3 L17.8 10.6 C18.0 10.8 18.0 11.2 17.8 11.4 L15.2 13.7" fill="none" stroke="${p.stroke}" stroke-width="3.0" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M15.2 8.3 L17.8 10.6 C18.0 10.8 18.0 11.2 17.8 11.4 L15.2 13.7" fill="none" stroke="url(#g)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
      + `</g>`,
      'col-resize'
    ),

    // Slim row splitter
    '--elr-cur-row': make(22, 11, 11,
      `${g}<g filter="url(#s)" transform="rotate(90 11 11)">`
      + `<rect x="10.0" y="4.5" width="2.0" height="13.0" rx="1.0" fill="url(#g)" stroke="${p.stroke}" stroke-width="0.9"/>`
      + `<path d="M6.8 8.3 L4.2 10.6 C4.0 10.8 4.0 11.2 4.2 11.4 L6.8 13.7" fill="none" stroke="${p.stroke}" stroke-width="3.0" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M6.8 8.3 L4.2 10.6 C4.0 10.8 4.0 11.2 4.2 11.4 L6.8 13.7" fill="none" stroke="url(#g)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M15.2 8.3 L17.8 10.6 C18.0 10.8 18.0 11.2 17.8 11.4 L15.2 13.7" fill="none" stroke="${p.stroke}" stroke-width="3.0" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M15.2 8.3 L17.8 10.6 C18.0 10.8 18.0 11.2 17.8 11.4 L15.2 13.7" fill="none" stroke="url(#g)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
      + `</g>`,
      'row-resize'
    ),

    // Slim rounded not-allowed ring
    '--elr-cur-not-allowed': make(20, 10, 10,
      `${g}<g filter="url(#s)">`
      + `<circle cx="10" cy="10" r="6.0" fill="none" stroke="${p.stroke}" stroke-width="3.0"/>`
      + `<path d="M6.0 6.0 L14.0 14.0" stroke="${p.stroke}" stroke-width="3.0" stroke-linecap="round"/>`
      + `<circle cx="10" cy="10" r="6.0" fill="none" stroke="url(#g)" stroke-width="1.6"/>`
      + `<path d="M6.0 6.0 L14.0 14.0" stroke="url(#g)" stroke-width="1.6" stroke-linecap="round"/>`
      + `</g>`,
      'not-allowed'
    ),
  };
}

const pngCache = { light: null, dark: null };
const pngPending = { light: null, dark: null };
const supportsImageSet = typeof CSS !== 'undefined'
  && CSS.supports?.('cursor', 'image-set(url("data:image/png;base64,iVBORw0KGgo=") 1x) 0 0, auto');

function rasterizeSvgToPng(dataUri, pixelSize) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = pixelSize;
        canvas.height = pixelSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(''); return; }
        ctx.clearRect(0, 0, pixelSize, pixelSize);
        ctx.drawImage(img, 0, 0, pixelSize, pixelSize);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = dataUri;
  });
}

async function loadPngCursorSet(scheme) {
  if (pngCache[scheme]) return pngCache[scheme];
  if (pngPending[scheme]) return pngPending[scheme];

  const rawSet = buildCursorSet(scheme);
  pngPending[scheme] = Promise.all(
    Object.entries(rawSet).map(async ([name, entry]) => {
      const [png1x, png2x] = await Promise.all([
        rasterizeSvgToPng(entry.dataUri, entry.size),
        supportsImageSet ? rasterizeSvgToPng(entry.dataUri, entry.size * 2) : Promise.resolve(''),
      ]);
      if (png1x && png2x && supportsImageSet) {
        return [name, `image-set(url("${png1x}") 1x, url("${png2x}") 2x) ${entry.hotspotX} ${entry.hotspotY}, ${entry.fallback}`];
      }
      if (png1x) {
        return [name, `url("${png1x}") ${entry.hotspotX} ${entry.hotspotY}, ${entry.fallback}`];
      }
      return [name, entry.css];
    })
  ).then((entries) => {
    const resolved = Object.fromEntries(entries);
    pngCache[scheme] = resolved;
    pngPending[scheme] = null;
    return resolved;
  });

  return pngPending[scheme];
}

let activeSchemeApplied = '';
let applySeq = 0;

function applyCursors(root, readSettings, darkQuery) {
  const settings = readSettings?.() || {};
  const tone = settings.uiTone || 'default';
  const scheme = tone === 'default'
    ? (darkQuery.matches ? 'dark' : 'light')
    : (DARK_UI_TONES.has(tone) ? 'dark' : 'light');

  const seq = ++applySeq;
  const applyResolved = (vars) => {
    if (seq !== applySeq) return;
    if (activeSchemeApplied !== scheme) {
      for (const [name, value] of Object.entries(vars)) {
        root.style.setProperty(name, value);
      }
      activeSchemeApplied = scheme;
    }
    root.dataset.elrCursors = 'glass';
    root.dataset.elrCursorScheme = scheme;
  };

  if (pngCache[scheme]) {
    applyResolved(pngCache[scheme]);
  } else {
    loadPngCursorSet(scheme).then(applyResolved);
  }
}

export function installCustomCursors(readSettings, subscribe) {
  const root = document.documentElement;
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const sync = () => applyCursors(root, readSettings, darkQuery);
  sync();
  const unsubscribe = typeof subscribe === 'function' ? subscribe(sync) : () => {};
  darkQuery.addEventListener('change', sync);
  return () => {
    unsubscribe();
    darkQuery.removeEventListener('change', sync);
  };
}
