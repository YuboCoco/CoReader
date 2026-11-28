// The reader surface comes from the English Literature Reader plug-in.
// Native Windows storage and model requests are provided by desktop-runtime.js.
import React from 'react';
import { createPortal } from 'react-dom';
import { getBingWallpaperState, isBingFavorited, subscribeBingWallpaper, toggleBingFavorite } from './bing-wallpaper.mjs';
import ChevronDown from 'kubai-icons-react/icons/chevron-down';
import ChevronLeft from 'kubai-icons-react/icons/chevron-left';
import ChevronRight from 'kubai-icons-react/icons/chevron-right';
import ChevronUp from 'kubai-icons-react/icons/chevron-up';
import Languages from 'kubai-icons-react/icons/languages';
import Scan from 'kubai-icons-react/icons/scan';
import AudioLines from 'kubai-icons-react/duotone/icons/audio-lines';
import CircleHelp from 'kubai-icons-react/duotone/icons/circle-help';
import CloudRain from 'kubai-icons-react/duotone/icons/cloud-rain';
import Copy from 'kubai-icons-react/duotone/icons/copy';
import FileText from 'kubai-icons-react/duotone/icons/file-text';
import FolderOpen from 'kubai-icons-react/duotone/icons/folder-open';
import Home from 'kubai-icons-react/duotone/icons/home';
import Images from 'kubai-icons-react/duotone/icons/images';
import Info from 'kubai-icons-react/duotone/icons/info';
import LayoutDashboard from 'kubai-icons-react/duotone/icons/layout-dashboard';
import Paintbrush from 'kubai-icons-react/duotone/icons/paintbrush';
import PanelBottom from 'kubai-icons-react/duotone/icons/panel-bottom';
import Pause from 'kubai-icons-react/duotone/icons/pause';
import Play from 'kubai-icons-react/duotone/icons/play';
import Quote from 'kubai-icons-react/duotone/icons/quote';
import Repeat from 'kubai-icons-react/duotone/icons/repeat';
import RotateCw from 'kubai-icons-react/duotone/icons/rotate-cw';
import Search from 'kubai-icons-react/duotone/icons/search';
import Settings from 'kubai-icons-react/duotone/icons/settings';
import Shuffle from 'kubai-icons-react/duotone/icons/shuffle';
import Sidebar from 'kubai-icons-react/duotone/icons/sidebar';
import TextSize from 'kubai-icons-react/duotone/icons/text-size';
import Volume from 'kubai-icons-react/duotone/icons/volume';
import Waves from 'kubai-icons-react/duotone/icons/waves';
import ZoomIn from 'kubai-icons-react/duotone/icons/zoom-in';
import { EmptyState } from './empty-state.jsx';
import ZoomOut from 'kubai-icons-react/duotone/icons/zoom-out';
import * as desktop from './desktop-runtime.js';
import { alignPageTextLayer } from './pdf-text-align.mjs';
import { pickNextAmbientIndex } from '../ambient-shared.mjs';
import { ambientTrackIcon } from './ambient-icons.js';
import { AgentPanel } from './agent-panel.jsx';
import { PaperLibrary } from './paper-library.jsx';
import { FigurePicker } from './figure-picker.jsx';
import { LayoutIcon } from './layout-icons.jsx';
import { animateComparePane, animateSelectionSurface, boxTransform, comparePaneCopy, coverVisual,
  fittedImageRect, motionDuration, motionEasing, motionTiming, reduceMotion, scrollWithMotion } from './surface-motion.js';
import { OriginalPdfMediaAction, PdfOutline, PdfSplitHandle, PdfTranslations,
  useOriginalPdfMedia, usePdfReading } from './pdf-reading.jsx';
import { blockForAnchor, equationNumber, paragraphBlocks, paragraphTermContext, readingLines, termContextWindow,
  visualCaptionLabel, visualCaptionPattern as FIGURE_LABEL_RE } from './pdf-reading.mjs';
import { blockAtPoint, viewportBounds } from './pdf-media.mjs';
import { readingAgentLimits } from '../reading-agent.mjs';
import { availableEfforts, effortLabels } from '../model-capabilities.mjs';

const h = React.createElement;

const MAX_SELECTION = 6000;
const LIGHT_PAGE_THEMES = ['default', 'paper', 'eye', 'ivory', 'mist', 'sage', 'linen'];
const DARK_PAGE_THEMES = ['dark-slate', 'dark-midnight', 'dark-sepia', 'dark-forest', 'dark-oled'];
const PAGE_THEMES = [...LIGHT_PAGE_THEMES, ...DARK_PAGE_THEMES];
const UI_TONES = {
  light: ['blue', 'green', 'amber', 'pink', 'prism-light'],
  dark: ['default', 'navy', 'ink', 'forest', 'plum', 'ember', 'prism-dark'],
  duo: ['duo-blue', 'duo-orange', 'duo-green', 'duo-purple'],
};
const FIGURE_SORT_ORDERS = ['document-asc', 'document-desc', 'time-asc', 'time-desc'];
const figureNumberOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
// (v13 #1) One coalesced decoration pass per burst of pdf.js page events.
const DECORATE_DEBOUNCE_MS = 160;
const SELECTION_DEBOUNCE_MS = 350;
const CSS_ID = 'english-lit-reader-css';
const BASE = '/reader';
const loadPaperPlanning = () => import('../paper-planning.js');

const SIDE_READER_MIN_W = 360;
const PANE_DIVIDER_SIZE = 8;
const ANALYSIS_CARD_KEYS = ['summary', 'references', 'figure', 'agent'];
const CARD_KEYS = ['selection', 'recent', 'terms', 'marks', ...ANALYSIS_CARD_KEYS, 'album', 'ambient', 'clock'];
const CUSTOM_CARD_LAYOUT_LIMIT = 3;
const CARD_HEADER_HEIGHT = 54;
const CARD_MIN_H = 272;
const SIDE_CARD_MIN_W = 392;
const CARD_GRID_PADDING = 10;
const CARD_GRID_GAP = 10;
const SIDE_MIN = SIDE_CARD_MIN_W + CARD_GRID_PADDING * 2 + 16;
const SIDE_DEFAULT = SIDE_MIN;
const SIDE_DUAL_MIN = SIDE_CARD_MIN_W * 2 + CARD_GRID_PADDING * 2 + CARD_GRID_GAP + 16;
const SIDE_READER_SHARE = .3;
const CARD_FONT_MIN = 11;
const CARD_FONT_DEFAULT = 13;
const CARD_FONT_MAX = 24;
const AGENT_CARD_MIN_H = 320;
const BOTTOM_COMPACT_CARD_WIDTH = 248;
const CARD_DOCK_BOTTOM_GAP = 14;
const BOTTOM_DOCK_HEAD_H = 38;
const BOTTOM_DOCK_GRID_PADDING = 4;
const SIDE_H_MIN = CARD_MIN_H + BOTTOM_DOCK_HEAD_H + 6 + BOTTOM_DOCK_GRID_PADDING + 6 + 1;
const SIDE_H_DEFAULT = SIDE_H_MIN + 17;
const BOTTOM_READER_MIN_H = 140;
const SELECTION_PANE_MIN_W = 102;
const SELECTION_PANE_MIN_H = 66;
const SELECTION_SPLITTER_SIZE = 12;
const MARKS_CARD_MIN_H = 140;
// (v8 #6) Smallest allowed height of the upper side block (selection card +
// movable sections) when the user drags the inner splitter.
const SIDE_TOP_MIN = 90;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;
const PDF_CANVAS_MAX_EDGE = 8192;
const PDF_CANVAS_MAX_PIXELS = 16 * 1024 * 1024;
const PDF_OVERLAY_MAX_EDGE = 4096;
const PDF_OVERLAY_MAX_PIXELS = 4 * 1024 * 1024;

function sizePdfOverlay(canvas, { width, height }) {
  const scale = Math.min(3, Math.max(1, window.devicePixelRatio || 1),
    PDF_OVERLAY_MAX_EDGE / width, PDF_OVERLAY_MAX_EDGE / height,
    Math.sqrt(PDF_OVERLAY_MAX_PIXELS / (width * height)));
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  return scale;
}
// (v20 #3) Presets offered by the zoom dropdown; the free-form number input
// accepts anything inside ZOOM_MIN..ZOOM_MAX.
const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300, 400];
const RECENT_MAX = 8;
const RECENT_TEXT_CAP = 60000;
const STORE_PREFIX = 'elr.';
const MODEL_KEY = 'model';
// (v12) Set when the user actually picks a model in the dropdown. Auto-filled
// defaults must not count as an explicit choice, otherwise a slow profile
// default would keep breaking full-text translation.
// (v14 #2) Explicit popup font size (px), adjustable with the A−/A+ buttons.
const POPUP_FONT_KEY = 'popupFont';
const POPUP_FONT_DEFAULT = 13;
const POPUP_FONT_MIN = 10;
const POPUP_FONT_MAX = 24;
const NOTE_POPUP_MIN = { w: 344, h: 214 };
const RECENT_KEY = 'recent';
// (v24 #2) Which records the "highlights & notes" list shows: 'all' | 'hl' | 'note'.
const MARK_FILTER_KEY = 'markFilter';
const SNAP_KEY = 'snapshot';
const TEXT_SNAP_KEY = 'reader-text';
const SELECTION_SNAP_KEY = 'reader-selection';
const DRAFT_RESULT_KEY = 'reader-draft-result';
const RESULT_PREFIX = 'result.';
const FIGURES_PREFIX = 'figures.';
const MARKS_PREFIX = 'marks.';
// (v35 #1) Per-paper glossary of explained professional terms.
const TERMS_PREFIX = 'terms.';
const MAX_TERM_CHARS = 200;
const HIGHLIGHT_COLORS = {
  yellow: { dot: '#e5b84c', ink: 'rgba(255, 222, 74, .9)' },
  green: { dot: '#5dbb87', ink: 'rgba(125, 223, 154, .78)' },
  blue: { dot: '#5899de', ink: 'rgba(118, 189, 255, .76)' },
  red: { dot: '#e57670', ink: 'rgba(255, 141, 139, .76)' },
};

function highlightAnchors(mark) {
  if (mark.anchors?.length) return mark.anchors;
  return mark.page && mark.rects?.length ? [{ page: mark.page, rects: mark.rects, legacy: true }] : [];
}

const highlightSurface = (page, legacy) => legacy ? page : page?.querySelector('.canvasWrapper') || page;

function sameHighlightLocation(first, second) {
  return first.length > 0 && first.length === second.length && first.every(({ page, rects }, index) => {
    const other = second[index];
    return page === other.page && rects.length === other.rects.length && rects.every((rect, i) =>
      ['x', 'y', 'w', 'h'].every((edge) => Math.abs(rect[edge] - other.rects[i][edge]) < .001)
    );
  });
}
const SELECTION_TOOL_WIDTH = 274;
const SELECTION_TOOL_HEIGHT = 42;
const SELECTION_TOOL_GAP = 8;
const { readStore, writeStore, reviveStoredFile, getStoredFile, deleteStoredFile, openPaper, fetchReader, postReader, savePosition, markPagesRead } = desktop;
const fileCache = new Map();

const resultKey = (id) => RESULT_PREFIX + id;
const loadResult = (id) => (id ? readStore(resultKey(id), null) : null);
const saveResult = (id, patch) => {
  return !!id && writeStore(resultKey(id), Object.assign({}, loadResult(id) || {}, patch));
};
const unsavedFigureHistory = new Map();
function loadFigureHistory(id, legacy) {
  if (!id) return [];
  const saved = unsavedFigureHistory.get(id) || readStore(FIGURES_PREFIX + id, null);
  if (Array.isArray(saved)) return saved;
  const previous = legacy === undefined ? loadResult(id)?.figure : legacy;
  return typeof previous?.text === 'string' && previous.text.trim() ? [{ ...previous, id: 'legacy' }] : [];
}
function persistFigureHistory(id, entries) {
  const saved = writeStore(FIGURES_PREFIX + id, entries);
  if (saved) unsavedFigureHistory.delete(id);
  else unsavedFigureHistory.set(id, entries);
  return saved;
}
function figurePagePosition(page, viewport, crop) {
  const original = page.getViewport({ scale: 1 });
  if (original.rotation === viewport.rotation) return { x: crop.x, y: crop.y };
  const toOriginal = (x, y) => original.convertToViewportPoint(
    ...viewport.convertToPdfPoint(x * viewport.width, y * viewport.height),
  );
  const start = toOriginal(crop.x, crop.y);
  const end = toOriginal(crop.x + crop.w, crop.y + crop.h);
  return { x: Math.min(start[0], end[0]) / original.width, y: Math.min(start[1], end[1]) / original.height };
}
function figureOrderLabel(caption) {
  const label = visualCaptionLabel(caption)?.number;
  if (!label || /\d/.test(label)) return label ?? null;
  const roman = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const values = Array.from(label.toUpperCase(), (letter) => roman[letter]);
  return String(values.reduce((total, value, i) => total + (value < values[i + 1] ? -value : value), 0));
}
function orderFigureEntries(entries, order) {
  const direction = order.endsWith('-asc') ? 1 : -1;
  const compareKnown = (a, b, compare) => {
    if (a == null || b == null) return Number(a == null) - Number(b == null);
    return direction * compare(a, b);
  };
  const byNumber = (a, b) => a - b;
  if (order.startsWith('time-')) {
    return entries.map((entry) => {
      const time = Date.parse(entry.generatedAt);
      return { entry, time: Number.isFinite(time) ? time : null };
    }).sort((a, b) => compareKnown(a.time, b.time, byNumber)).map(({ entry }) => entry);
  }
  const items = entries.map((entry) => {
    const page = Number(entry.page);
    const position = entry.position;
    return {
      entry, page: Number.isInteger(page) && page > 0 ? page : null,
      position: Number.isFinite(position?.x) && Number.isFinite(position.y) ? position : null,
      label: entry.kind === 'formula' ? (entry.number || equationNumber(entry.formula)) : figureOrderLabel(entry.label || entry.caption),
    };
  });
  // Older entries only have a page and caption. Use figure numbers on pages
  // where positions are missing and every entry has a numbered caption.
  const pagesWithMissingPositions = new Set(items.filter((item) => !item.position).map((item) => item.page));
  const pagesWithMissingLabels = new Set(items.filter((item) => !item.label).map((item) => item.page));
  const byPosition = (a, b) => (a.y - b.y) || (a.x - b.x);
  return items.sort((a, b) => {
    const byPage = compareKnown(a.page, b.page, byNumber);
    if (byPage || a.page == null) return byPage;
    if (pagesWithMissingPositions.has(a.page) && !pagesWithMissingLabels.has(a.page)) {
      const byLabel = compareKnown(a.label, b.label, figureNumberOrder.compare);
      if (byLabel) return byLabel;
    }
    return compareKnown(a.position, b.position, byPosition)
      || compareKnown(a.label, b.label, figureNumberOrder.compare);
  }).map(({ entry }) => entry);
}
function readGenerationMetadata(response, selection) {
  const { provider = selection.provider, model = selection.model, generatedAt } = response;
  const sameRoute = provider === selection.provider && model === selection.model;
  const modelName = response.modelName && response.modelName !== model ? response.modelName
    : (sameRoute && selection.modelName) || model;
  const reasoningEffort = response.reasoningEffort || (sameRoute ? selection.reasoningEffort : null);
  return {
    provider, model, modelName, reasoningEffort,
    reasoningEffortName: sameRoute && reasoningEffort === selection.reasoningEffort ? selection.reasoningEffortName : '',
    followDefault: !reasoningEffort && (!sameRoute || selection.followDefault),
    generatedAt: generatedAt || new Date().toISOString(),
  };
}
const marksKey = (id) => MARKS_PREFIX + id;
// (v35 #1) Professional-term explanations, one list per paper. Kept apart from
// `marks` on purpose: a term is a GLOSSARY entry keyed by the term itself, not
// a passage marker, so it must neither appear in the highlight list nor be
// matched against PDF text.
const termsKey = (id) => TERMS_PREFIX + id;
const normalizeTerm = (t) => ({
  id: t && t.id ? t.id : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7),
  term: String((t && t.term) || ''),
  body: String((t && t.body) || ''),
  surrounding: String((t && t.surrounding) || ''),
  error: String((t && t.error) || ''),
  at: Number(t && t.at) || Date.now(),
});
const paperTerms = new Map();
const termListeners = new Set();
const subscribeTerms = (listener) => {
  termListeners.add(listener);
  return () => termListeners.delete(listener);
};
const getPaperTerms = (id) => {
  if (!paperTerms.has(id)) {
    const saved = id ? readStore(termsKey(id), []) : [];
    paperTerms.set(id, Array.isArray(saved) ? saved.map(normalizeTerm).filter((entry) => entry.term) : []);
  }
  return paperTerms.get(id);
};
const setPaperTerms = (id, entries) => {
  paperTerms.set(id, entries);
  // Busy state only applies to requests in this session. A persisted entry
  // without an explanation can be retried after a reload.
  if (id) writeStore(termsKey(id), entries.map(normalizeTerm));
  for (const listener of termListeners) listener();
};

// (v23 #1) Highlight and annotation are two SEPARATE features that share one
// storage list only for convenience. Every record has an explicit `kind`:
//   'hl'   → colored band  (`hl: true`,  `note: ''`)
//   'note' → annotation    (`hl: false`, `note: <text>`)
// Selecting "高亮" creates/updates the 'hl' record for that sentence; selecting
// "批注" creates/updates the 'note' record. They never share a record, so
// removing one can never remove the other, and the same sentence may hold both
// as two independent entries.
//
// Legacy records (before v23) carry only `hl` / `note`; `kind` is derived from
// those, then rewritten on the next save.
const normalizeMark = (m) => {
  const note = String((m && m.note) || '');
  const trimmed = note.trim();
  const wanted = m && m.kind === 'hl' ? 'hl' : (m && m.kind === 'note' ? 'note' : '');
  const kind = wanted || (trimmed ? 'note' : 'hl');
  return {
    id: m && m.id ? m.id : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7),
    text: String((m && m.text) || ''),
    kind,
    note: kind === 'note' ? trimmed : '',
    hl: kind === 'hl',
    color: kind === 'hl' && Object.hasOwn(HIGHLIGHT_COLORS, m?.color) ? m.color : undefined,
    page: Number(m?.page) || undefined,
    rects: Array.isArray(m?.rects) ? m.rects : undefined,
    anchors: Array.isArray(m?.anchors) ? m.anchors.filter((anchor) =>
      Number.isInteger(anchor?.page) && anchor.page > 0 && Array.isArray(anchor.rects) && anchor.rects.length
    ) : undefined,
  };
};
const loadMarks = (id) => {
  const v = id ? readStore(marksKey(id), []) : [];
  return Array.isArray(v) ? v.map(normalizeMark).filter((mark) => mark.hl || mark.note) : [];
};
const saveMarks = (id, list) => { if (id) writeStore(marksKey(id), list); };

// ------------------------------------------------------------------
// Shared live state. Persisted to localStorage and mirrored between the
// conversation-view Reader and the overlay Reader, so closing/reopening
// the window (or switching tabs) keeps the paper and all results.
// ------------------------------------------------------------------
const ALBUM_DEFAULT_INTERVAL_SEC = 30;
const ALBUM_INTERVAL_MIN = 1;
const ALBUM_INTERVAL_MAX = 86400;
const ALBUM_INTERVAL_OPTIONS = [
  { value: 15, label: '15 秒' },
  { value: 30, label: '30 秒' },
  { value: 60, label: '1 分钟' },
  { value: 300, label: '5 分钟' },
  { value: 600, label: '10 分钟' },
];
const ALBUM_ORDER_OPTIONS = [
  { value: 'sequential', label: '顺序轮播' },
  { value: 'random', label: '随机轮播' },
];
const ALBUM_TRANSITION_OPTIONS = [
  { value: 'fade', label: '柔和淡入' },
  { value: 'ken-burns', label: '电影推镜' },
  { value: 'blur-dissolve', label: '景深虚化' },
  { value: 'slide-depth', label: '视差滑入' },
  { value: 'iris-reveal', label: '光圈展开' },
  { value: 'curtain-wipe', label: '斜切幕布' },
];
const ALBUM_HEAD_HIDE_MS = 2600;
const ALBUM_TRANSITION_MS = 820;

function normalizeAlbumInterval(raw) {
  const sec = Math.round(Number(raw));
  if (!Number.isFinite(sec) || sec < ALBUM_INTERVAL_MIN) return ALBUM_DEFAULT_INTERVAL_SEC;
  return Math.min(ALBUM_INTERVAL_MAX, sec);
}

function normalizeAlbumOrder(raw) {
  return raw === 'random' ? 'random' : 'sequential';
}

function normalizeAlbumTransition(raw) {
  return ALBUM_TRANSITION_OPTIONS.some((item) => item.value === raw) ? raw : 'fade';
}

function buildAlbumPlayOrder(length, random, pinnedFirst = -1, avoidFirst = -1) {
  if (length <= 0) return [];
  const order = Array.from({ length }, (_, idx) => idx);
  if (!random || length === 1) return order;
  const start = pinnedFirst >= 0 && pinnedFirst < length ? 1 : 0;
  if (start === 1 && pinnedFirst !== 0) {
    order[0] = pinnedFirst;
    order[pinnedFirst] = 0;
  }
  for (let i = length - 1; i > start; i -= 1) {
    const j = start + Math.floor(Math.random() * (i - start + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  if (start === 0 && avoidFirst >= 0 && order[0] === avoidFirst) {
    const swapIdx = 1 + Math.floor(Math.random() * (length - 1));
    const tmp = order[0];
    order[0] = order[swapIdx];
    order[swapIdx] = tmp;
  }
  return order;
}

const DEFAULT_SHARED = {
  mode: 'pdf', text: '', summary: '', summaryCoverage: null, summaryMeta: null, summaryDetail: null,
  selection: '', selectionResult: '', pdfName: '', pageNum: 1,
  // (v18 #4/#5) The English box is editable in BOTH places (the inline card and
  // the side column). The edited value lives here, in the shared layer, so the
  // two boxes are literally the same state: typing in one updates the other
  // without any event plumbing. `selection` keeps the RAW selection, because
  // highlights and notes must still match the PDF text.
  selectionEdit: '', selectionPrefix: '',
  selectionSplit: 96 / (96 + 150),
  selectionWidthSplit: 0.5,
  selectionCardOpen: true,
  recentOpen: true, marksOpen: true, termsOpen: true,
  analysisOpen: Object.fromEntries(ANALYSIS_CARD_KEYS.map((key) => [key, true])),
  cardFont: CARD_FONT_DEFAULT,
  agentModel: null,
  sideWidth: SIDE_DEFAULT, dualSideWidth: SIDE_DUAL_MIN, sideHeight: SIDE_H_DEFAULT, dock: 'right', sideDock: 'right',
  panMode: false,
  // (v19 #4) Pages across: 0 = one page, 1 = two pages, 2 = three pages. It used
  // to be a boolean; a number keeps the old value readable (see the migration
  // below) and gives the toolbar a real three-way choice.
  spreadMode: 0,
  pdfOffsetX: 0,
  capsulePosition: 'top',
  glassEnabled: true, glassTintLight: 1, glassTintDark: 1,
  customCursor: true,
  selectionPopupTransparent: true,
  theme: 'default',
  // (v40) Overall UI tone. `theme` above only recolours the PAPER (the page
  // itself), which is a reading preference; this one tints the reader's own
  // chrome — toolbar, cards, side panel, floating cards — so the whole
  // surface reads as one blue / green interface. `default` keeps the host
  // tokens untouched, so an old snapshot looks exactly as before.
  uiTone: 'default',
  auroraMode: 'smooth',
  bingWallpaperEnabled: false,
  bingWallpaperMarket: 'zh-CN',
  bingWallpaperDate: '',
  bingWallpaperBlur: 0,
  bingWallpaperDim: 28,
  bingWallpaperDynamicColor: true,
  popupOn: false, autoTranslateSelection: false, autoTranslatePaper: true, popupLayout: 'stacked', popupShowOriginal: true, paperId: '',
  // (v21 #1) The reference column. `references` holds the parsed bibliography
  // enriched with resolved addresses, so it survives a tab switch together with
  // the analysis it belongs to. `referencesBusy` is transient and only guards
  // the button; it is not persisted between sessions on purpose.
  references: [],
  // (v28 #2, revised) 论文分析 and 参考文献 are two VIEWS of the same column,
  // switched by a segmented control, not two panes side by side. Only one of
  // them is mounted at a time, so each gets the full column width.
  analysisTab: 'summary',
  figureSort: 'time-desc',
  // (v8 #6) Height of the upper half of the side pane (selection card plus the
  // movable sections), and (v8 #7) their order.
  sideTopHeight: 220, sectionOrder: ['clock', 'summary', 'album', 'agent', 'ambient', 'selection', 'recent', 'terms', 'marks', 'references', 'figure'],
  // (v27) Which function cards are ENABLED. Closing a card removes it from this
  // list; the card manager (the ⚙ in the card column's header) adds it back. A
  // separate list from `sectionOrder` on purpose: order must survive a card
  // being closed and reopened, otherwise reopening would silently move it to
  // the end of the column.
  cards: ['clock', 'summary', 'album', 'agent', 'ambient'],
  albumOpen: true,
  albumFolder: '',
  albumImages: [],
  albumInterval: 30,
  albumOrder: 'sequential',
  albumTransition: 'fade',
  ambientOpen: true,
  ambientFolder: '',
  ambientTrack: '',
  ambientMix: {},
  ambientMode: 'single',
  ambientVolume: 0.8,
  ambientPresets: [],
  clockOpen: true,
  clockStyle: 'digital',
  clock24h: true,
  clockShowSeconds: true,
  floatingCards: {},
  // (v25 #3) Horizontal size of that block when the side panel is docked at the
  // bottom (the two halves sit side by side there).
  sideTopWidth: 380,
  // (v32 #1) Per-card widths, only meaningful in the bottom dock where the three
  // function cards sit side by side. A missing key means "share the row evenly",
  // which is the old behaviour, so an untouched column looks exactly as before.
  cardWidths: {},
  // The feature workspace defaults to two columns on the right:
  // left column: clock, summary, album; right column: agent, ambient.
  featureColumns: 2,
  // When two columns are enabled, this records the user's chosen column for
  // each card. Missing entries use the stable alternating layout.
  featureCardColumns: { clock: 0, summary: 0, album: 0, agent: 1, ambient: 1 },
  // (v38) Per-card heights, only meaningful in the RIGHT dock, where the cards
  // are stacked and share the column's height (v37). A missing key means "take an
  // even share", which is the v37 behaviour, so an untouched column looks exactly
  // as before; a stored value pins that one card and the rest divide what is left.
  cardHeights: {},
  customCardLayouts: Array(CUSTOM_CARD_LAYOUT_LIMIT).fill(null),
};
const CARD_OPEN_FIELDS = { selection: 'selectionCardOpen', recent: 'recentOpen', terms: 'termsOpen', marks: 'marksOpen', album: 'albumOpen', ambient: 'ambientOpen', clock: 'clockOpen' };
function cardOpenPatch(state, keys, open) {
  const patch = {};
  for (const key of keys) {
    const field = CARD_OPEN_FIELDS[key];
    if (field) patch[field] = open;
    else (patch.analysisOpen ??= { ...state.analysisOpen })[key] = open;
  }
  return patch;
}
const CARD_LAYOUT_FIELDS = [
  'dock', 'sideDock', 'sectionOrder', 'cards', 'floatingCards', 'cardWidths', 'cardHeights', 'featureColumns', 'featureCardColumns',
  'sideWidth', 'dualSideWidth', 'sideHeight', 'sideTopWidth', 'sideTopHeight', 'selectionSplit', 'selectionWidthSplit',
  'selectionCardOpen', 'recentOpen', 'termsOpen', 'marksOpen', 'albumOpen', 'ambientOpen', 'clockOpen', 'analysisOpen',
];

const snapshotCardLayout = (state) => Object.fromEntries(CARD_LAYOUT_FIELDS.map((key) => [key, state[key] ?? DEFAULT_SHARED[key]]));
const TEXT_KEYS = ['text'];
const SELECTION_KEYS = ['selection', 'selectionEdit', 'selectionPrefix', 'selectionResult'];
const ANALYSIS_KEYS = ['summary', 'summaryCoverage', 'summaryMeta', 'summaryDetail', 'references'];
const contentKeys = new Set([...TEXT_KEYS, ...SELECTION_KEYS, ...ANALYSIS_KEYS]);
const savedView = readStore(SNAP_KEY, null) || {};
const oldSnapshot = Object.keys(savedView).some((key) => contentKeys.has(key));
let shared = Object.assign({}, DEFAULT_SHARED, savedView);
shared.customCardLayouts = Array.from({ length: CUSTOM_CARD_LAYOUT_LIMIT }, (_, slot) => {
  const preset = Array.isArray(savedView.customCardLayouts)
    ? savedView.customCardLayouts[slot]
    : slot === 0 ? savedView.customCardLayout : null;
  return preset && typeof preset === 'object' && !Array.isArray(preset) ? snapshotCardLayout(preset) : null;
});
delete shared.customCardLayout;
if (!Object.hasOwn(savedView, 'dualSideWidth') && Number(savedView.featureColumns) === 2 && Number.isFinite(savedView.sideWidth)) {
  shared.dualSideWidth = Math.max(SIDE_DUAL_MIN, savedView.sideWidth);
}
if (!(savedView.selectionSplit > 0 && savedView.selectionSplit < 1 && Number.isFinite(savedView.selectionSplit))) {
  const originalHeight = Number(savedView.selEditH);
  const translatedHeight = Number(savedView.selResultH);
  shared.selectionSplit = Number.isFinite(originalHeight) && Number.isFinite(translatedHeight) && originalHeight > 0 && translatedHeight > 0
    ? originalHeight / (originalHeight + translatedHeight) : DEFAULT_SHARED.selectionSplit;
}
if (!Number.isFinite(shared.selectionWidthSplit) || shared.selectionWidthSplit <= 0 || shared.selectionWidthSplit >= 1) {
  shared.selectionWidthSplit = DEFAULT_SHARED.selectionWidthSplit;
}
shared.floatingCards = Object.fromEntries(CARD_KEYS.flatMap((key) => {
  const box = shared.floatingCards?.[key];
  return box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0
    ? [[key, box]] : [];
}));
if (!FIGURE_SORT_ORDERS.includes(shared.figureSort)) shared.figureSort = DEFAULT_SHARED.figureSort;
if (!shared.featureCardColumns || typeof shared.featureCardColumns !== 'object' || Array.isArray(shared.featureCardColumns)) shared.featureCardColumns = {};
else shared.featureCardColumns = Object.fromEntries(Object.entries(shared.featureCardColumns)
  .filter(([key, value]) => CARD_KEYS.includes(key) && (Number(value) === 0 || Number(value) === 1))
  .map(([key, value]) => [key, Number(value)]));
const storedForPaper = (key) => {
  const saved = readStore(key, null);
  return saved && saved.paperId === shared.paperId ? saved : {};
};
if (!oldSnapshot) {
  Object.assign(shared, storedForPaper(TEXT_SNAP_KEY), storedForPaper(SELECTION_SNAP_KEY));
  if (!shared.paperId) Object.assign(shared, storedForPaper(DRAFT_RESULT_KEY));
}
delete shared.darkMode;
shared.sideDock = shared.sideDock === 'left' ? 'left' : 'right';
if (!PAGE_THEMES.includes(shared.theme)) shared.theme = 'default';
if (shared.capsulePosition !== 'bottom') shared.capsulePosition = 'top';
// (v19 #4) `spreadMode` was a boolean (false = one page, true = two pages) and is
// now a page count minus one. Translate any stored boolean once, here.
if (shared.spreadMode === true) shared.spreadMode = 1;
else if (shared.spreadMode === false || shared.spreadMode == null) shared.spreadMode = 0;
else if (!Number.isFinite(Number(shared.spreadMode))) shared.spreadMode = 0;
else shared.spreadMode = Math.max(0, Math.min(2, Math.trunc(Number(shared.spreadMode))));
shared.pdfOffsetX = Number.isFinite(Number(shared.pdfOffsetX)) ? Math.max(-100, Math.min(100, Math.round(Number(shared.pdfOffsetX)))) : 0;
// (v20) The full-text translation column and the three-column layout and the
// translation overlay were removed at the user's request. Drop their stored
// flags so an old snapshot cannot resurrect a feature that no longer exists.
delete shared.threeCol;
delete shared.overlayMode;
delete shared.translation;
delete shared.tab;
// (v27) `cards` holds the enabled function cards. An old snapshot has no such
// field, and an empty array is a legal choice (all cards closed), so only a
// missing/ malformed value falls back to "all three enabled".
{
  const known = CARD_KEYS;
  const saved = Array.isArray(savedView.cards) ? savedView.cards : null;
  if (!saved) shared.cards = DEFAULT_SHARED.cards.slice();
  else shared.cards = [...new Set(saved.filter((k) => known.indexOf(k) !== -1))];
  shared.clockOpen = shared.clockOpen !== false;
  shared.clockStyle = shared.clockStyle === 'analog' ? 'analog' : 'digital';
  shared.clock24h = shared.clock24h !== false;
  shared.clockShowSeconds = shared.clockShowSeconds !== false;
  shared.albumOpen = shared.albumOpen !== false;
  shared.albumFolder = typeof shared.albumFolder === 'string' ? shared.albumFolder : '';
  shared.albumImages = Array.isArray(shared.albumImages)
    ? [...new Set(shared.albumImages.filter((item) => typeof item === 'string' && item.trim()))]
    : [];
  {
    shared.albumInterval = normalizeAlbumInterval(shared.albumInterval);
    shared.albumOrder = normalizeAlbumOrder(shared.albumOrder);
    shared.albumTransition = normalizeAlbumTransition(shared.albumTransition);
  }
  shared.ambientOpen = shared.ambientOpen !== false;
  shared.ambientFolder = typeof shared.ambientFolder === 'string' ? shared.ambientFolder : '';
  {
    const remapLegacyTrack = (name) => {
      if (name === 'campfire.wav') return 'nature/campfire.mp3';
      if (name === 'rain.wav') return 'rain/light-rain.mp3';
      if (name === 'ocean.wav') return 'nature/waves.mp3';
      return typeof name === 'string' ? name : '';
    };
    shared.ambientTrack = remapLegacyTrack(shared.ambientTrack || '');
    const rawMix = shared.ambientMix && typeof shared.ambientMix === 'object' ? shared.ambientMix : null;
    const cleanMix = {};
    if (rawMix) {
      for (const [key, val] of Object.entries(rawMix)) {
        const mappedKey = remapLegacyTrack(key);
        const vol = Number(val);
        if (mappedKey && Number.isFinite(vol)) {
          cleanMix[mappedKey] = Math.min(1, Math.max(0.05, vol));
        }
      }
    }
    shared.ambientMix = cleanMix;
  }
  shared.ambientMode = shared.ambientMode === 'random' ? 'random' : 'single';
  {
    const rawVol = Number(shared.ambientVolume);
    shared.ambientVolume = Number.isFinite(rawVol) ? Math.min(1, Math.max(0, rawVol)) : 0.8;
  }
  shared.ambientPresets = Array.isArray(shared.ambientPresets)
    ? shared.ambientPresets.map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = String(item.name || '').trim();
      const rawMix = item.mix && typeof item.mix === 'object' ? item.mix : {};
      const cleanMix = {};
      for (const [k, v] of Object.entries(rawMix)) {
        const vol = Number(v);
        if (k && Number.isFinite(vol)) cleanMix[k] = Math.min(1, Math.max(0.05, vol));
      }
      if (!name || !Object.keys(cleanMix).length) return null;
      return { id: String(item.id || name + '-' + Math.random().toString(36).slice(2, 7)), name, mix: cleanMix };
    }).filter(Boolean)
    : [];
  if (!Array.isArray(shared.sectionOrder)) shared.sectionOrder = known.slice();
  else shared.sectionOrder = [...new Set([...shared.sectionOrder.filter((key) => known.includes(key)), ...known])];
}
// (v28) The analysis column shows either the paper analysis or the reference
// list, never both. Anything unrecognised falls back to the analysis.
if (!['summary', 'references', 'figure', 'agent'].includes(shared.analysisTab)) shared.analysisTab = 'summary';
// (v32 #1) Sanitise the per-card widths once: only known cards, only finite
// positive pixel values. Anything else is dropped so the column falls back to
// the even split instead of rendering a zero-width card.
{
  const widths = {};
  const raw = shared.cardWidths && typeof shared.cardWidths === 'object' ? shared.cardWidths : null;
  if (raw) {
    const known = CARD_KEYS;
    for (let i = 0; i < known.length; i++) {
      const px = Number(raw[known[i]]);
      if (Number.isFinite(px) && px >= 140) widths[known[i]] = Math.round(px);
    }
  }
  shared.cardWidths = widths;
}
// Bring saved heights forward to the current minimum for expanded docked cards.
{
  const heights = {};
  const rawH = shared.cardHeights && typeof shared.cardHeights === 'object' ? shared.cardHeights : null;
  if (rawH) {
    const knownH = CARD_KEYS;
    for (let i = 0; i < knownH.length; i++) {
      const px = Number(rawH[knownH[i]]);
      if (Number.isFinite(px) && px > 0) heights[knownH[i]] = Math.max(CARD_MIN_H, Math.round(px));
    }
  }
  shared.cardHeights = heights;
}
if (shared.uiTone !== 'default' && !Object.values(UI_TONES).some((tones) => tones.includes(shared.uiTone))) shared.uiTone = 'default';
if (!['smooth', 'quality', 'off'].includes(shared.auroraMode)) shared.auroraMode = 'smooth';
shared.bingWallpaperEnabled = Boolean(shared.bingWallpaperEnabled);
shared.bingWallpaperMarket = shared.bingWallpaperMarket === 'en-US' ? 'en-US' : 'zh-CN';
shared.bingWallpaperDate = typeof shared.bingWallpaperDate === 'string' && /^\d{8}$/.test(shared.bingWallpaperDate) ? shared.bingWallpaperDate : '';
shared.bingWallpaperBlur = Number.isFinite(Number(shared.bingWallpaperBlur)) ? Math.max(0, Math.min(16, Math.round(Number(shared.bingWallpaperBlur)))) : 0;
shared.bingWallpaperDim = Number.isFinite(Number(shared.bingWallpaperDim)) ? Math.max(0, Math.min(75, Math.round(Number(shared.bingWallpaperDim)))) : 28;
shared.bingWallpaperDynamicColor = shared.bingWallpaperDynamicColor !== false;
const sharedListeners = new Set();
const readShared = () => shared;
const viewKeys = Object.keys(DEFAULT_SHARED).filter((key) => !contentKeys.has(key));
const pickSnapshot = (keys) => Object.fromEntries(keys.map((key) => [key, shared[key]]));
const writeDocumentSnapshot = (key, fields) => writeStore(key, { paperId: shared.paperId, ...pickSnapshot(fields) });
let keepLegacySnapshot = false;
if (oldSnapshot) {
  const textSaved = writeDocumentSnapshot(TEXT_SNAP_KEY, TEXT_KEYS);
  const selectionSaved = writeDocumentSnapshot(SELECTION_SNAP_KEY, SELECTION_KEYS);
  let analysisSaved;
  if (shared.paperId) {
    const previous = loadResult(shared.paperId) || {};
    const missing = ANALYSIS_KEYS.filter((key) => previous[key] == null && Object.hasOwn(savedView, key));
    analysisSaved = !missing.length || saveResult(shared.paperId, pickSnapshot(missing));
  } else {
    analysisSaved = writeDocumentSnapshot(DRAFT_RESULT_KEY, ANALYSIS_KEYS);
  }
  // Keep the original record if the storage quota interrupts the upgrade.
  keepLegacySnapshot = !(textSaved && selectionSaved && analysisSaved);
}
const legacyPaperId = savedView.paperId;
const legacyAnalysis = keepLegacySnapshot ? pickSnapshot(ANALYSIS_KEYS) : null;
const dirtySnapshot = new Set(oldSnapshot ? [SNAP_KEY] : []);
let snapshotTimer = null;
const flushSnapshot = () => {
  if (snapshotTimer !== null) clearTimeout(snapshotTimer);
  snapshotTimer = null;
  if (dirtySnapshot.has(TEXT_SNAP_KEY)) writeDocumentSnapshot(TEXT_SNAP_KEY, TEXT_KEYS);
  if (dirtySnapshot.has(SELECTION_SNAP_KEY)) writeDocumentSnapshot(SELECTION_SNAP_KEY, SELECTION_KEYS);
  if (dirtySnapshot.has(DRAFT_RESULT_KEY) && !shared.paperId) writeDocumentSnapshot(DRAFT_RESULT_KEY, ANALYSIS_KEYS);
  if (dirtySnapshot.has(SNAP_KEY) && !keepLegacySnapshot) writeStore(SNAP_KEY, pickSnapshot(viewKeys));
  dirtySnapshot.clear();
};
const scheduleSnapshot = () => {
  if (dirtySnapshot.size && snapshotTimer === null) snapshotTimer = setTimeout(flushSnapshot, 150);
};
const writeShared = (patch) => {
  for (const key of Object.keys(patch)) {
    if (TEXT_KEYS.includes(key)) dirtySnapshot.add(TEXT_SNAP_KEY);
    else if (SELECTION_KEYS.includes(key)) dirtySnapshot.add(SELECTION_SNAP_KEY);
    else if (ANALYSIS_KEYS.includes(key)) dirtySnapshot.add(DRAFT_RESULT_KEY);
    else dirtySnapshot.add(SNAP_KEY);
  }
  if (Object.hasOwn(patch, 'paperId')) {
    dirtySnapshot.add(TEXT_SNAP_KEY);
    dirtySnapshot.add(SELECTION_SNAP_KEY);
  }
  shared = Object.assign({}, shared, patch);
  scheduleSnapshot();
  sharedListeners.forEach((fn) => { try { fn(); } catch (_) {} });
};
// Settings dialogs live outside the Reader component. These small accessors
// let them update the same persisted view state without duplicating storage
// keys or forcing a reload of the reading surface.
const readReaderSettings = () => readShared();
const writeReaderSettings = (patch) => writeShared(patch);
const subscribeReaderSettings = (listener) => {
  sharedListeners.add(listener);
  return () => sharedListeners.delete(listener);
};
scheduleSnapshot();
function useShared(key) {
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    sharedListeners.add(force);
    return () => { sharedListeners.delete(force); };
  }, [force]);
  const setValue = React.useCallback((next) => {
    const prev = readShared()[key];
    const v = typeof next === 'function' ? next(prev) : next;
    if (v === prev) return;
    const patch = {};
    patch[key] = v;
    writeShared(patch);
  }, [key]);
  return [readShared()[key], setValue];
}

// -------------------------------------------------------------------------
// (v23 #5) The HOST colour scheme.
//
// The reader's own `theme` field only styles the PDF page (default / paper /
// eye) and never described the app's light/dark mode. The floating cards are
// rendered through `createPortal` into <body>, i.e. OUTSIDE the reader's DOM
// subtree, so a container class could never reach them — the scheme has to be
// a module-level value the portals can read.
//
// Two independent sources, because neither is guaranteed:
//   1. the `theme` client service (`getTheme().active.colorScheme`) when the
//      host exposes it;
//   2. otherwise the resolved `--dsw-alias-bg-base` value, which is what the
//      host actually paints with, sampled on every root attribute change.
// -------------------------------------------------------------------------
let hostScheme = 'light';
const schemeListeners = new Set();
const setHostScheme = (next) => {
  const v = next === 'dark' ? 'dark' : 'light';
  if (v === hostScheme) return;
  hostScheme = v;
  schemeListeners.forEach((fn) => { try { fn(); } catch (_) {} });
};
function useHostScheme() {
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    schemeListeners.add(force);
    return () => { schemeListeners.delete(force); };
  }, [force]);
  return hostScheme;
}

const CSS = [
  // (v44 #1) The floating bottom-right launcher and the full-screen overlay it
  // opened are GONE: the reader is reached through the conversation tab, the
  // sidebar palette and the right-sidebar guide tab only. The status dot below
  // is still used by the reader's own header, so its rule stays.
  '.elr-launcher-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--dsw-alias-brand-primary); }',
  // (v44 #1) The `.elr-overlay*` family went with the launcher — the full-screen
  // overlay was the launcher's destination and nothing else rendered it.
  // (v11 #2) The sidebar-tool destination: the host `main` panel is a flex
  // column with a definite height, so the reader only has to opt into it.
  '.elr-panel { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; overflow: hidden; background: var(--dsw-alias-bg-base); }',
  '.elr-panel .elr-view { min-height: 0; height: 100%; }',
  // The icon seat in `sidebar.panellist` hands the component an owner prop with
  // the host's resolved size; the glyph must not add its own box.
  '.elr-nav-icon { display: inline-flex; align-items: center; justify-content: center; color: currentColor; line-height: 0; }',
  // (v15 #4) The whole view is a NON-scrolling box. Without overflow:hidden a
  // PDF that is taller than the pane used to make an ancestor scroll, which
  // dragged the right-hand analysis column along with the paper.
  '.elr-view { flex: 1 1 auto; height: 100%; min-height: 360px; width: 100%; min-width: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 13px; }',
  '.elr-view:fullscreen { width: 100%; height: 100%; min-height: 0; max-width: none; max-height: none; }',
  // Keep portal overlays above the reader toolbar even when the host is moved
  // inside the reader for fullscreen. The empty host leaves hit testing to its children.
  '.elr-floating-host { position: fixed; inset: 0 auto auto 0; width: 0; height: 0; z-index: 210; }',
  '.elr-head { position: relative; z-index: 200; flex: 0 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 9px; }',
  '.elr-head-controls, .elr-head-group { display: flex; align-items: center; gap: 5px; min-height: 30px; }',
  '.elr-head-controls { flex-wrap: wrap; }',
  '.elr-head-group { flex: 0 0 auto; white-space: nowrap; }',
  '.elr-head-models { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; flex: 1 1 455px; min-width: 0; }',
  '.elr-head-model { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; }',
  '.elr-head-model .elr-select { min-width: 0; max-width: 142px; padding: 4px 6px; text-overflow: ellipsis; }',
  '.elr-head-model .elr-select-provider { max-width: 104px; }',
  '.elr-head-model .elr-select-effort { max-width: 78px; }',
  '.elr-head-model .elr-select-label { flex: 0 0 auto; white-space: nowrap; }',
  '.elr-head-models > .elr-btn { padding: 4px 6px; }',
  '.elr-head-actions { display: flex; align-items: center; gap: 6px; margin-inline-start: auto; }',
  '.elr-head-actions .elr-fullscreen-btn { display: grid; place-items: center; box-sizing: border-box; flex: none; width: 30px; height: 30px; padding: 0; }',
  '.elr-fullscreen-icon { position: relative; display: block; width: 16px; height: 16px; }',
  '.elr-fullscreen-icon > span { position: absolute; box-sizing: border-box; width: 5px; height: 5px; border-top: 1.5px solid currentColor; border-left: 1.5px solid currentColor; transform: rotate(var(--elr-corner-angle)); }',
  '.elr-fullscreen-icon > :nth-child(1) { --elr-corner-angle: 0deg; top: 0; left: 0; }',
  '.elr-fullscreen-icon > :nth-child(2) { --elr-corner-angle: 90deg; top: 0; right: 0; }',
  '.elr-fullscreen-icon > :nth-child(3) { --elr-corner-angle: -90deg; bottom: 0; left: 0; }',
  '.elr-fullscreen-icon > :nth-child(4) { --elr-corner-angle: 180deg; bottom: 0; right: 0; }',
  '.elr-fullscreen-icon.is-active > span { transform: rotate(calc(var(--elr-corner-angle) + 180deg)); }',
  '.elr-head :is(.elr-icon-btn, .elr-select, .elr-btn):focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }',
  '.elr-spacer { flex: 1; }',
  '.elr-model { font-size: 11px; color: var(--dsw-alias-label-secondary); }',
  '.elr-icon-btn { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-radius: 7px; padding: 4px 10px; cursor: pointer; font-size: calc(12px + var(--elr-card-font-adjust, 0px)); }',
  '.elr-icon-btn:hover { border-color: var(--dsw-alias-brand-primary); }',
  // (v14 #2) Compact A−/A+ buttons in the popup title bar.
  '.elr-font-btn { padding: 2px 7px; font-size: 12px; font-weight: 600; line-height: 1.2; }',
  '.elr-font-btn:disabled { opacity: .45; cursor: default; }',
  '.elr-segment { display: inline-flex; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; }',
  '.elr-seg { border: none; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); padding: 5px 12px; cursor: pointer; font-size: calc(12px + var(--elr-card-font-adjust, 0px)); }',
  '.elr-seg + .elr-seg { border-left: 1px solid var(--dsw-alias-border-l1); }',
  // Active buttons use a brand tint + brand text: readable in both themes,
  // unlike a solid brand fill with hard-coded white text.
  '.elr-seg.active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-brand-primary); font-weight: 600; }',
  '.elr-field { box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 5px 8px; font-size: 12px; width: 150px; max-width: 100%; }',
  '.elr-body { position: relative; flex: 1; min-height: 0; display: flex; overflow: hidden; }',
  '.elr-body.dock-left > .elr-side { order: 0; }',
  '.elr-body.dock-left > .elr-resizer { order: 1; }',
  '.elr-body.dock-left > .elr-main { order: 2; }',
  // (v15 #4) Both columns are independent scroll roots. `min-height: 0` +
  // `overflow: hidden` on the flex parent lets each column own its scrollbar.
  '.elr-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }',
  '.elr-side { --elr-sidebar-available: calc(100% - min(' + SIDE_READER_MIN_W + 'px, ' + (SIDE_READER_SHARE * 100) + '%) - ' + PANE_DIVIDER_SIZE + 'px); display: flex; flex-direction: column; box-sizing: border-box; min-width: min(' + SIDE_MIN + 'px, var(--elr-sidebar-available)); max-width: min(70%, var(--elr-sidebar-available)); min-height: 0; overflow: hidden; overscroll-behavior: contain; transition: transform var(--duration-md) var(--ease-out); }',
  '.elr-side[data-dual-columns] { min-width: min(' + SIDE_DUAL_MIN + 'px, var(--elr-sidebar-available)); max-width: var(--elr-sidebar-available); }',
  '.elr-side.is-stowed { position: absolute; inset: 0 0 0 auto; transform: translateX(100%); transition: transform var(--duration-exit-md) var(--ease-in); pointer-events: none; }',
  '.elr-body.dock-left .elr-side.is-stowed { inset: 0 auto 0 0; transform: translateX(-100%); }',
  '.elr-body.dock-bottom .elr-side.is-stowed { inset: auto 0 0; transform: translateY(100%); }',
  // (v25 #3) The analysis column always stacks its tabs header above its body,
  // including in the horizontal bottom dock where `side` itself is a row.
  '.elr-side-col { display: flex; flex-direction: column; flex: 1 1 0; min-width: 0; min-height: 0; overflow: hidden; }',
  // (v28 #2, revised) 论文分析 and 参考文献 are two VIEWS of this one column,
  // switched by the segmented control in `.elr-tabs`, so there is no side-by-side
  // wrapper any more — whichever view is selected owns the full width.
  // `.elr-out` below sets its own padding with the same specificity, so the
  // override has to be qualified by both classes.
  '.elr-out.elr-refs-out { padding: 10px 12px; }',
  // (v8 #6) The upper block (selection card + movable sections) now has an
  // explicit height the user drags, so it must not shrink below it.
  // (v31 #1) A flex column with `gap` turns the stack into separate cards
  // instead of one continuous bordered list.
  '.elr-side-top { flex: 0 0 auto; min-height: 80px; display: flex; flex-direction: column; padding: 0; overflow: hidden; }',
  '.elr-side-top > .elr-col-head { flex: 0 0 auto; }',
  // (v43 #1) The card column's header is a solid strip on the panel background,
  // with NO rule under it: that underline was the "stray horizontal line" the user
  // boxed. The 6px margin is the separation the line used to provide, and the
  // background keeps cards from showing through when the body scrolls.
  '.elr-col-head.elr-card-head { background: var(--dsw-alias-bg-base); border-bottom: none; margin-bottom: 6px; }',
  // (v32b #1) The cards live in their own scroller so the 「功能栏」 header row
  // (title + ⚙) and the card manager stay pinned at the top. Previously the
  // header was the first child of the scrolling column, so it scrolled away
  // with the cards whenever the column overflowed.
  '.elr-side-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 9px; padding: 0 10px 10px; overflow: auto; overscroll-behavior: contain; }',
  '.elr-side-body { scrollbar-width: thin; scrollbar-color: transparent transparent; }',
  '.elr-side-body.elr-scrolling { scrollbar-color: var(--dsw-alias-label-secondary) transparent; }',
  // A fixed-width track with a grip that grows along the track.
  '.elr-divider { box-sizing: border-box; flex: 0 0 ' + PANE_DIVIDER_SIZE + 'px; position: relative; display: grid; place-items: center; cursor: col-resize; touch-action: none; user-select: none; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 78%, transparent); border-inline: 1px solid var(--dsw-alias-border-l1); transition: background var(--duration-feedback) var(--ease-out), border-color var(--duration-feedback) var(--ease-out); }',
  '.elr-divider::before { content: ""; position: absolute; inset: 0 -5px; }',
  '.elr-divider::after { content: ""; width: 4px; height: 56px; max-height: 100%; border-radius: 999px; background: var(--dsw-alias-brand-primary); opacity: .68; transform: scaleY(.46); transition: transform var(--duration-feedback) var(--ease-out), opacity var(--duration-feedback) var(--ease-out), box-shadow var(--duration-feedback) var(--ease-out); pointer-events: none; }',
  '.elr-divider:is(:hover,.active,:focus-visible) { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l1)); }',
  '.elr-divider:is(:hover,.active,:focus-visible)::after { transform: scaleY(1); opacity: 1; box-shadow: 0 0 8px color-mix(in srgb, var(--dsw-alias-brand-primary) 50%, transparent); }',
  '.elr-divider.axis-row { cursor: row-resize; border-inline: 0; border-block: 1px solid var(--dsw-alias-border-l1); }',
  '.elr-divider.axis-row::before { inset: -5px 0; }',
  '.elr-divider.axis-row::after { width: 56px; height: 4px; max-width: 100%; transform: scaleX(.46); }',
  '.elr-divider.axis-row:is(:hover,.active,:focus-visible)::after { transform: scaleX(1); box-shadow: 0 0 8px color-mix(in srgb, var(--dsw-alias-brand-primary) 50%, transparent); }',
  '.elr-divider:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }',
  '@media (prefers-reduced-motion: reduce) { .elr-divider::after { transition-property: opacity; } }',
  '.elr-body.is-resizing-panes { user-select: none; }',
  '.elr-body.is-resizing-panes .elr-main, .elr-body.is-resizing-panes .elr-side { visibility: hidden; pointer-events: none !important; contain: strict; }',
  '.elr-body.is-resizing-panes > .elr-resizer { opacity: 0; }',
  '.elr-body.is-resizing-panes .elr-feature-column > .elr-sec, .elr-body.is-resizing-panes .elr-pdf-container > .pdfViewer { transition: none; }',
  '.elr-resize-curtain-clip { position: fixed; z-index: 140; box-sizing: border-box; display: flex; padding: 8px; overflow: hidden; pointer-events: none; contain: strict; background: var(--dsw-alias-bg-base); }',
  '.elr-resize-curtain-clip.is-bottom { flex-direction: column; }',
  '.elr-resize-curtain-clip.is-right { flex-direction: row; }',
  '.elr-resize-curtain-clip.is-left { flex-direction: row-reverse; }',
  '.elr-resize-pane { display: grid; place-items: center; box-sizing: border-box; overflow: hidden; border-radius: 16px; border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l2) 55%, var(--dsw-alias-border-l1)); contain: layout style paint; animation: elr-resize-pane-in 150ms cubic-bezier(.22, 1, .36, 1) both; }',
  '@keyframes elr-resize-pane-in { from { border-radius: 0; opacity: .76; } to { border-radius: 16px; opacity: 1; } }',
  '.elr-resize-pane.is-reader { flex: 1 1 0; min-width: 0; min-height: 0; background: radial-gradient(circle at 28% 22%, color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent), transparent 58%), var(--dsw-alias-bg-layer-1); }',
  '.elr-resize-pane.is-side { flex: 0 0 auto; background: radial-gradient(circle at 70% 26%, color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent), transparent 60%), color-mix(in srgb, var(--dsw-alias-bg-layer-2) 68%, var(--dsw-alias-bg-layer-1)); }',
  '.elr-resize-pane-badge { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; min-width: 156px; max-width: calc(100% - 24px); max-height: calc(100% - 24px); padding: 16px 28px; box-sizing: border-box; border-radius: 18px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-overlay); box-shadow: 0 8px 24px rgb(15 23 42 / .07); text-align: center; }',
  '.elr-resize-pane-icon { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 11%, var(--dsw-alias-bg-layer-2)); border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }',
  '.elr-resize-pane-icon svg { width: 26px; height: 26px; display: block; }',
  '.elr-resize-pane-title { font-size: 15px; font-weight: 650; letter-spacing: .04em; color: var(--dsw-alias-label-primary); line-height: 1.25; white-space: nowrap; }',
  '.elr-resize-pane-sub { font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; line-height: 1.2; white-space: nowrap; }',
  '.elr-resize-curtain-edge { flex: 0 0 auto; position: relative; display: grid; place-items: center; }',
  '.elr-resize-curtain-edge::after { content: ""; border-radius: 999px; background: var(--dsw-alias-brand-primary); box-shadow: 0 0 8px color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent); }',
  '.elr-resize-curtain-clip.is-bottom > .elr-resize-curtain-edge { width: 100%; }',
  '.elr-resize-curtain-clip.is-bottom > .elr-resize-curtain-edge::after { width: 42px; height: 3px; }',
  '.elr-resize-curtain-clip:is(.is-right, .is-left) > .elr-resize-curtain-edge { height: 100%; }',
  '.elr-resize-curtain-clip:is(.is-right, .is-left) > .elr-resize-curtain-edge::after { width: 3px; height: 42px; }',
  '.elr-resizer { z-index: 6; }',
  // (v8 #7) Reorderable side sections (recent reading, notes, selection).
  // (v31 #1) Each section is a self-contained CARD now: its own border,
  // radius and surface, so three of them read as three blocks instead of one
  // striped list. `overflow: hidden` keeps the children's square corners from
  // poking through the rounded ones.
  // (v37) A card is a flex COLUMN and its inner list carries the growth. Before
  // this, every list had a hard `max-height` (168 / 200 / 320px), so enlarging the
  // 功能栏 only added empty space under a stuck list, and shrinking it left the
  // list clipped with no scrollbar. Now the card hands its own height down to the
  // list, which scrolls inside whatever room it is given.
  '.elr-sec { position: relative; flex: 0 0 auto; display: flex; flex-direction: column; min-height: 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; transition: border-color var(--duration-feedback) var(--ease-out), box-shadow var(--duration-feedback) var(--ease-out); }',
  // (v37) In the right dock the cards SHARE the column height instead of each
  // sitting at its natural height: `flex: 1 1 auto` lets them grow into a taller
  // 功能栏 and shrink into a shorter one, and `min-height: 84px` stops a card from
  // collapsing into a bare header. Inner lists then scroll inside that height.
  '.elr-side-body > .elr-sec { flex: 1 1 auto; min-height: 84px; }',
  // A collapsed card is just its header, so it must not claim a share of the
  // column height.
  '.elr-side-body > .elr-sec.is-collapsed { flex: 0 0 auto; min-height: 0; }',
  // (v37) Whatever a card holds (`.elr-recent` / `.elr-marks` / `.elr-terms` /
  // `.elr-sel-card`) is the box that receives the height, so the inner list can
  // turn it into a scroll region. Without this the inner roots kept their natural
  // height and the extra room showed up as a blank strip under the content.
  '.elr-side-body > .elr-sec > * { flex: 1 1 auto; min-height: 0; }',
  // The dragged card itself fades so the pointer clearly "carries" a copy
  // (the full-size ghost is rendered separately).
  '.elr-sec.dragging { opacity: .35; border-style: dashed; }',
  // (v31 #2) The drop target lights up: brand-tinted surface, a brand ring,
  // and a solid bar on the edge the card would land against.
  '.elr-sec.over { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, var(--dsw-alias-bg-layer-1)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 34%, transparent), 0 6px 18px rgba(0, 0, 0, .10); }',
  '.elr-sec.over-above::before, .elr-sec.over-below::after { content: ""; position: absolute; left: 8px; right: 8px; height: 3px; border-radius: 2px; background: var(--dsw-alias-brand-primary); z-index: 2; }',
  '.elr-sec.over-above::before { top: 0; }',
  '.elr-sec.over-below::after { bottom: 0; }',
  // (v36 fix) In the bottom dock the cards sit in one ROW, so "before/after the
  // target" is horizontal: the bar moves to the left or right edge, where the
  // card will actually land. The stacked layout keeps top/bottom.
  '.elr-body.dock-bottom .elr-sec.over-above::before, .elr-body.dock-bottom .elr-sec.over-below::after { top: 8px; bottom: 8px; left: auto; right: auto; width: 3px; height: auto; }',
  '.elr-body.dock-bottom .elr-sec.over-above::before { top: 8px; bottom: 8px; left: 0; }',
  '.elr-body.dock-bottom .elr-sec.over-below::after { top: 8px; bottom: 8px; right: 0; }',
  '.elr-card-dock-target > .elr-card-head { color: var(--dsw-alias-brand-primary); }',
  '.elr-card-dock-target > .elr-side-body { background-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent); }',
  // (v31 #2) The floating clone that follows the pointer while reordering.
  // It is portalled to <body>, positioned fixed, and never receives events.
  '.elr-drag-ghost { position: fixed; inset: 0 auto auto 0; z-index: 200; pointer-events: none; box-sizing: border-box; display: grid; place-items: center; padding: 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--radius-lg, 15px); color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 82%, transparent); backdrop-filter: blur(16px) saturate(1.4); -webkit-backdrop-filter: blur(16px) saturate(1.4); box-shadow: 0 10px 26px rgb(10 18 30 / .20), var(--elr-frosted-rim); overflow: hidden; will-change: translate, transform; contain: layout style paint; transition: width 160ms var(--ease-out), height 160ms var(--ease-out); }',
  '.elr-drag-ghost.is-lifting { animation: elr-drag-lift-pop 240ms cubic-bezier(.22, 1.25, .36, 1) both; }',
  '@keyframes elr-drag-lift-pop { 0% { opacity: 0; scale: .92; } 45% { opacity: 1; scale: .95; } 100% { opacity: 1; scale: 1; } }',
  '.elr-drag-ghost-label { max-width: 100%; max-height: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: calc(13px + var(--elr-card-font-adjust, 0px)); font-weight: 650; }',
  '.elr-drag-ghost.is-vertical .elr-drag-ghost-label { writing-mode: vertical-rl; }',
  'body.elr-card-dragging, body.elr-card-dragging * { cursor: grabbing !important; }',
  'body.elr-card-dragging .elr-main, body.elr-card-dragging .elr-side, body.elr-card-dragging .elr-card-menu, body.elr-card-dragging .elr-sec[data-elr-floating-card] { pointer-events: none !important; }',
  // Faint 15% text-color drop hint line positioned directly inside the target gap.
  '.elr-drop-line { position: fixed; z-index: 195; pointer-events: none; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent); animation: elr-drop-line-fade 120ms var(--ease-out) both; }',
  '@keyframes elr-drop-line-fade { from { opacity: 0; } to { opacity: 1; } }',
  // Ripple avoidance on sibling cards while dragging (transform-only, quick spring).
  '.elr-side-top.drag-active .elr-sec[data-elr-docked-card]:not(.dragging) { will-change: transform; transition: transform 250ms var(--elr-reorder-spring, cubic-bezier(.22, 1.12, .36, 1)) var(--elr-ripple-delay, 0ms), border-color var(--duration-feedback) var(--ease-out), box-shadow var(--duration-feedback) var(--ease-out); transform: translate3d(var(--elr-ripple-x, 0px), var(--elr-ripple-y, 0px), 0); }',
  '@supports (animation-timing-function: linear(0, 1)) { :root { --elr-reorder-spring: linear(0, .42, .88, 1.03, 1.04, 1.01, 1); } }',
  '@media (prefers-reduced-motion: reduce) { .elr-drag-ghost.is-lifting, .elr-drop-line { animation: none; } .elr-side-top.drag-active .elr-sec[data-elr-docked-card]:not(.dragging) { transition: none; transform: none; } }',
  // (v17 #2) `min-height: 0` instead of a hard 120px: a fixed minimum made the
  // analysis/translation column overflow the side panel (which clips) instead
  // of letting `.elr-out` scroll on its own. `flex-basis: 0` is what makes the
  // column take exactly the space left under the tabs, so the analysis pane
  // scrolls inside itself and never drags the PDF or the selection card.
  '.elr-col { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; overflow: hidden; }',
  '.elr-col-head { display: flex; align-items: center; gap: 8px; padding: 7px 12px; color: var(--dsw-alias-label-secondary); font-size: 12px; }',
  // The manager is portalled above the card column so it cannot shrink the scroll area.
  '.elr-card-head { position: relative; }',
  '.elr-card-head .elr-icon-btn.active { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }',
  '.elr-card-menu { position: fixed; z-index: 131; box-sizing: border-box; padding: 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-overlay); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: var(--dsw-alias-label-primary); box-shadow: 0 12px 32px rgba(0,0,0,.22); display: flex; flex-direction: column; gap: 10px; overflow: auto; overscroll-behavior: contain; }',
  '.elr-card-menu > * { flex: 0 0 auto; }',
  '.elr-card-menu-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); }',
  '.elr-card-menu-title-wrap { display: flex; align-items: center; gap: 7px; min-width: 0; }',
  '.elr-card-menu-title { font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-primary); }',
  '.elr-card-menu-count { padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); font-size: 11px; font-weight: 600; }',
  '.elr-card-menu-reset { padding: 3px 8px; font-size: 11px; border-radius: 6px; }',
  '.elr-card-menu-section { display: flex; flex-direction: column; gap: 6px; }',
  '.elr-card-menu-section-head { display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary); }',
  '.elr-card-menu-section-badge { font-size: 10px; padding: 0 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }',
  '.elr-card-menu-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }',
  '.elr-card-tile { display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 8px 9px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); text-align: start; font: inherit; cursor: pointer; transition: border-color .14s ease, background .14s ease, transform .14s ease; }',
  '.elr-card-tile:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 50%, var(--dsw-alias-border-l2)); }',
  '.elr-card-tile.is-on { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-layer-1)); }',
  '.elr-card-tile.is-off { border-style: dashed; background: var(--dsw-alias-bg-layer-2); opacity: .88; cursor: grab; touch-action: none; }',
  '.elr-card-tile.is-off:hover { opacity: 1; background: var(--dsw-alias-bg-layer-1); }',
  '.elr-card-tile.is-off:active { cursor: grabbing; }',
  '.elr-menu-drag-ghost { position: fixed; left: 0; top: 0; z-index: 200; pointer-events: none; box-sizing: border-box; width: 220px; padding: 10px 12px; border: 1.5px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 10px 24px rgb(10 18 30 / .20); display: flex; flex-direction: column; gap: 3px; will-change: transform; contain: layout style paint; }',
  '.elr-menu-drag-ghost.is-outside { border-color: var(--dsw-alias-brand-primary); }',
  '.elr-card-tile-top { display: flex; align-items: center; gap: 5px; min-width: 0; }',
  '.elr-card-tile-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; }',
  '.elr-card-tile-float { flex: 0 0 auto; padding: 0 5px; border-radius: 4px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); color: var(--dsw-alias-brand-primary); font-size: 10px; line-height: 1.5; }',
  '.elr-card-tile-state { flex: 0 0 auto; width: 16px; height: 16px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; }',
  '.elr-card-tile.is-on .elr-card-tile-state { background: var(--dsw-alias-brand-primary); color: #fff; }',
  '.elr-card-tile.is-off .elr-card-tile-state { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l2); }',
  '.elr-card-tile-desc { font-size: 10.5px; line-height: 1.35; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.elr-card-menu-empty { padding: 8px 10px; border-radius: 8px; border: 1px dashed var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); font-size: 11px; text-align: center; }',
  '.elr-card-none { padding: 14px 12px; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.6; text-align: center; }',
  // A closed card's × never inherits the card header's click-to-collapse.
  '.elr-card-control { flex: 0 0 auto; display: grid; place-items: center; position: relative; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }',
  '.elr-card-control:hover, .elr-card-control:focus-visible { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }',
  '.elr-card-control:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }',
  '.elr-card-x:hover { color: var(--dsw-alias-state-error-primary); }',
  '.elr-card-x::before, .elr-card-x::after { content: ""; position: absolute; width: 10px; height: 1.5px; border-radius: 1px; background: currentColor; transform: rotate(45deg); }',
  '.elr-card-x::after { transform: rotate(-45deg); }',
  '.elr-floating-card { position: fixed; z-index: 114; box-sizing: border-box; box-shadow: 0 10px 32px rgba(0,0,0,.24); color: var(--dsw-alias-label-primary); font-size: 13px; --elr-rz-corner: 15px; }',
  '.elr-floating-card.is-front { z-index: 115; }',
  '.elr-floating-card .elr-card-content { overflow: auto; }',
  '.elr-floating-card .elr-rz-se::after { content: ""; position: absolute; right: 4px; bottom: 4px; width: 8px; height: 8px; color: var(--dsw-alias-label-secondary); opacity: .55; background: repeating-linear-gradient(-45deg, currentColor 0 1.25px, transparent 1.25px 3.2px); clip-path: polygon(100% 0, 100% 100%, 0 100%); pointer-events: none; transition: color var(--duration-feedback) var(--ease-out), opacity var(--duration-feedback) var(--ease-out); }',
  '.elr-floating-card .elr-rz-se:is(:hover, .is-resizing)::after { color: var(--dsw-alias-brand-primary); opacity: .95; }',
  '.elr-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 7px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); }',
  '.elr-btn { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 7px; padding: 6px 12px; cursor: pointer; font-size: calc(12px + var(--elr-card-font-adjust, 0px)); }',
  '.elr-btn:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary); }',
  '.elr-btn:disabled { opacity: .55; cursor: not-allowed; }',
  '.elr-btn.active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); font-weight: 600; }',
  '.elr-btn.primary { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); font-weight: 600; }',
  '.elr-input, .elr-out { flex: 1 1 auto; min-height: 0; width: 100%; box-sizing: border-box; border: none; outline: none; resize: none; padding: 14px 16px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; line-height: 1.7; }',
  '.elr-out { white-space: pre-wrap; overflow: auto; overscroll-behavior: contain; }',
  '.elr-out-empty { color: var(--dsw-alias-label-secondary); }',
  '.elr-notice { position: absolute; z-index: 40; inset: auto 16px 16px auto; box-sizing: border-box; max-width: min(380px, calc(100% - 32px)); pointer-events: none; }',
  '.elr-notice-pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 13px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-overlay); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); color: var(--dsw-alias-label-primary); box-shadow: 0 8px 24px rgb(12 20 34 / .16); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; animation: elr-notice-in 220ms cubic-bezier(.22, 1, .36, 1) both; }',
  '.elr-notice-pill::before { content: ""; flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-brand-primary); }',
  '.elr-notice-pill.is-ok::before { background: #2fb36d; }',
  '.elr-notice-pill.is-warn { color: var(--dsw-alias-state-warn-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 35%, var(--dsw-alias-border-l2)); }',
  '.elr-notice-pill.is-warn::before { background: var(--dsw-alias-state-warn-primary); }',
  '.elr-notice-pill.is-error { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, var(--dsw-alias-border-l2)); }',
  '.elr-notice-pill.is-error::before { background: var(--dsw-alias-state-error-primary); }',
  '@keyframes elr-notice-in { 0% { opacity: 0; transform: translateY(8px) scale(.97); } 100% { opacity: 1; transform: translateY(0) scale(1); } }',
  '@media (prefers-reduced-motion: reduce) { .elr-notice-pill { animation: none; } }',
  // (v31 #1) The card FRAME is `.elr-sec` now, so the inner roots drop their
  // own bottom rule and surface — otherwise a card would show a double border
  // and a slightly different shade from its frame.
  '.elr-sel-card { background: transparent; display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; overflow: hidden; }',
  // Let the card frame provide a single surface behind the title and content.
  '.elr-function-head { flex: 0 0 52px; height: 52px; min-height: 52px; box-sizing: border-box; display: flex; align-items: stretch; padding: 6px; color: var(--dsw-alias-label-primary); font-size: calc(13px + var(--elr-card-font-adjust, 0px)); font-weight: 650; }',
  '.elr-card-toggle { --elr-toggle-hover-bg: rgb(15 23 42 / .045); --elr-toggle-hover-border: rgb(15 23 42 / .08); --elr-toggle-hover-shadow: inset 0 1px 0 rgb(255 255 255 / .85), inset 0 -1px 0 rgb(0 0 0 / .05), 0 1px 2px rgb(15 23 42 / .06); --elr-toggle-press-bg: rgb(15 23 42 / .075); --elr-toggle-press-border: rgb(15 23 42 / .12); --elr-toggle-press-shadow: inset 0 1px 2px rgb(15 23 42 / .15), inset 0 0 0 transparent, 0 1px 0 rgb(255 255 255 / .9); flex: 1 1 auto; min-width: 0; min-height: 0; display: grid; place-items: center; padding: 5px 10px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: inherit; font: inherit; text-align: center; cursor: pointer; user-select: none; touch-action: none; box-shadow: inset 0 0 0 transparent, inset 0 0 0 transparent, 0 0 0 transparent; transition: transform 120ms ease, box-shadow 140ms ease, background-color 160ms ease, border-color 160ms ease, color 160ms ease; }',
  ':is(:root[data-desktop-scheme="dark"], .elr-tone-navy, .elr-tone-ink, .elr-tone-forest, .elr-tone-plum, .elr-tone-ember, .elr-tone-prism-dark) .elr-card-toggle { --elr-toggle-hover-bg: rgb(255 255 255 / .06); --elr-toggle-hover-border: rgb(255 255 255 / .09); --elr-toggle-hover-shadow: inset 0 1px 0 rgb(255 255 255 / .1), inset 0 -1px 0 rgb(0 0 0 / .22), 0 1px 2px rgb(0 0 0 / .22); --elr-toggle-press-bg: rgb(0 0 0 / .24); --elr-toggle-press-border: rgb(255 255 255 / .07); --elr-toggle-press-shadow: inset 0 1px 2px rgb(0 0 0 / .42), inset 0 0 0 transparent, 0 1px 0 rgb(255 255 255 / .08); }',
  '.elr-card-toggle:hover:not(:active, .is-pressed) { background: var(--elr-toggle-hover-bg); border-color: var(--elr-toggle-hover-border); box-shadow: var(--elr-toggle-hover-shadow); }',
  '.elr-card-toggle:is(:active, .is-pressed) { transform: translateY(1px); background: var(--elr-toggle-press-bg); border-color: var(--elr-toggle-press-border); box-shadow: var(--elr-toggle-press-shadow); }',
  '.elr-card-toggle:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }',
  '.elr-card-label { display: inline-flex; align-items: center; gap: 7px; max-width: 100%; max-height: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: .01em; }',
  '.elr-card-label::before { content: ""; flex: 0 0 auto; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-brand-primary); opacity: .82; }',
  '.elr-card-content { display: flex; flex: 1 1 auto; min-width: 0; min-height: 0; flex-direction: column; overflow: hidden; }',
  '.elr-selection-content { display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; min-height: 0; padding: var(--elr-card-content-gap) var(--elr-card-inset) var(--elr-card-inset) var(--elr-card-leading); overflow: hidden auto; }',
  '.elr-floating-card .elr-selection-content { overscroll-behavior: contain; }',
  '.elr-sel-actions { flex: 0 0 auto; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-bottom: 7px; }',
  '.elr-sel-actions .elr-btn, .elr-selection-copy { padding: 3px 7px; font-size: calc(11px + var(--elr-card-font-adjust, 0px)); white-space: nowrap; }',
  '.elr-selection-hint { flex: 0 0 auto; min-width: 0; max-width: 100%; color: var(--dsw-alias-label-secondary); font-size: calc(11px + var(--elr-card-font-adjust, 0px)); line-height: 1.4; overflow-wrap: anywhere; }',
  '.elr-sel-working { color: var(--dsw-alias-brand-primary); }',
  '.elr-selection-panes { --elr-selection-pane-min: ' + SELECTION_PANE_MIN_H + 'px; --elr-selection-splitter: ' + SELECTION_SPLITTER_SIZE + 'px; --elr-selection-tracks: clamp(var(--elr-selection-pane-min), var(--elr-selection-source), calc(100% - var(--elr-selection-splitter) - var(--elr-selection-pane-min))) var(--elr-selection-splitter) minmax(var(--elr-selection-pane-min), 1fr); display: grid; flex: 1 0 0; grid-template-rows: var(--elr-selection-tracks); min-height: calc(2 * var(--elr-selection-pane-min) + var(--elr-selection-splitter)); min-width: 0; }',
  '.elr-selection-panes.is-side-by-side { --elr-selection-pane-min: ' + SELECTION_PANE_MIN_W + 'px; grid-template-columns: var(--elr-selection-tracks); grid-template-rows: auto minmax(0, 1fr); min-height: 108px; }',
  '.elr-selection-pane { display: grid; grid-template-rows: minmax(18px, auto) minmax(0, 1fr); grid-template-columns: minmax(0, 1fr); min-height: 0; min-width: 0; }',
  '.elr-selection-panes.is-side-by-side > .elr-selection-pane { display: grid; grid-row: 1 / -1; grid-template-rows: subgrid; grid-template-columns: minmax(0, 1fr); }',
  '.elr-selection-pane-head { min-width: 0; height: 22px; margin-bottom: 3px; display: flex; align-items: center; gap: 7px; color: var(--dsw-alias-label-secondary); font-size: calc(11px + var(--elr-card-font-adjust, 0px)); line-height: 1.4; }',
  '.elr-selection-pane-head > :first-child { flex: 0 0 auto; font-weight: 600; white-space: nowrap; }',
  '.elr-selection-pane-head .elr-selection-hint { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.elr-selection-copy { margin-inline-start: auto; }',
  '.elr-selection-split { display: grid; place-items: center; border-radius: 4px; cursor: ns-resize; touch-action: none; }',
  '.elr-selection-split::after { content: ""; width: 28px; height: 3px; border-radius: 3px; background: var(--dsw-alias-border-l2); }',
  '.elr-selection-panes.is-side-by-side > .elr-selection-split { grid-row: 1 / -1; cursor: ew-resize; background: linear-gradient(var(--dsw-alias-border-l1), var(--dsw-alias-border-l1)) center / 1px calc(100% - 6px) no-repeat; }',
  '.elr-selection-panes.is-side-by-side > .elr-selection-split::after { width: 3px; height: 28px; }',
  '.elr-selection-split:is(:hover,:active,:focus-visible)::after { background: var(--dsw-alias-brand-primary); }',
  '.elr-selection-split:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }',
  '.elr-sel-edit, .elr-sel-text { flex: 1 1 0; min-height: 0; min-width: 0; width: 100%; box-sizing: border-box; overflow: auto; padding: 5px 7px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: calc(12px + var(--elr-card-font-adjust, 0px)); line-height: 1.6; overflow-wrap: anywhere; }',
  '.elr-sel-edit { display: block; resize: none; }',
  '.elr-selection-panes.is-side-by-side :is(.elr-sel-edit,.elr-sel-text) { align-self: stretch; }',
  '.elr-sel-text { white-space: pre-wrap; }',
  '.elr-sel-text.elr-out-empty { color: var(--dsw-alias-label-secondary); }',
  '.elr-selection-pane :is(textarea,.elr-sel-text):focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }',
  // (v30 #1) `padding-bottom: 0` glued the segmented pill onto this row's own
  // 1px bottom rule: the pill's rounded border and the rule overlapped into a
  // double line. Equal vertical padding lets the pill float clear of the rule.
  '.elr-tabs { display: flex; align-items: center; gap: 4px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); }',
  '.elr-tab { border: none; background: transparent; color: var(--dsw-alias-label-secondary); padding: 7px 14px; cursor: pointer; border-bottom: 2px solid transparent; font-size: 12px; }',
  '.elr-tab.active { color: var(--dsw-alias-brand-primary); border-bottom-color: var(--dsw-alias-brand-primary); }',
  '.elr-hint { padding: 6px 12px; color: var(--dsw-alias-label-secondary); font-size: 11px; }',
  // (v44 #2) Kept for the TEXT mode hint under the textarea only. The PDF-mode
  // bottom-left tip that used to overlay the page is gone — it floated over the
  // paper and the user asked for it to be cancelled.
  '.elr-markdown :is(h2,h3,h4,h5,h6) { font-size: calc(14px + var(--elr-card-font-adjust, 0px)); margin: 14px 0 6px; color: var(--dsw-alias-brand-primary); }',
  '.elr-markdown :is(h4,h5,h6) { font-size: calc(13px + var(--elr-card-font-adjust, 0px)); }',
  '.elr-figure-out { display: flex; flex-direction: column; gap: var(--elr-card-content-gap); }',
  '.elr-content-tools { flex: none; display: grid; gap: var(--elr-card-content-gap); padding: 0 var(--elr-card-inset) 0 var(--elr-card-leading); }',
  '.elr-content-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; padding: 3px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-base); }',
  '.elr-content-tabs button { min-width: 0; padding: 5px 3px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: calc(12px + var(--elr-card-font-adjust, 0px)); cursor: pointer; }',
  '.elr-content-tabs button:hover { color: var(--dsw-alias-label-primary); }',
  '.elr-content-tabs button[aria-pressed="true"] { color: var(--dsw-alias-brand-primary); font-weight: 650; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 17%, var(--dsw-alias-bg-layer-1)); }',
  '.elr-figure-sort { display: flex; align-items: center; gap: 8px; max-width: 100%; color: var(--dsw-alias-label-secondary); font-size: calc(12px + var(--elr-card-font-adjust, 0px)); }',
  '.elr-figure-sort > span { flex: none; }',
  '.elr-figure-sort > .elr-select { min-width: 0; }',
  '.elr-figure-entry { flex: 0 0 auto; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }',
  '.elr-figure-entry-head { display: flex; align-items: center; gap: 4px; padding: 5px 7px; }',
  '.elr-figure-entry-toggle { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 5px 3px; border: 0; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-weight: 600; text-align: left; cursor: pointer; overflow-wrap: anywhere; }',
  '.elr-figure-entry-toggle::before { content: ""; flex: 0 0 6px; height: 6px; box-sizing: border-box; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; transform: rotate(-45deg); }',
  '.elr-figure-entry-toggle[aria-expanded="true"]::before { transform: rotate(45deg); }',
  '.elr-figure-entry-toggle:hover { background: var(--dsw-alias-bg-layer-2); }',
  '.elr-figure-entry-head :is(.elr-figure-entry-page,.elr-figure-entry-remove) { min-height: 25px; height: 25px; border-radius: 7px; flex: 0 0 auto; }',
  '.elr-figure-entry-head .elr-figure-entry-page { min-width: 24px; width: auto; padding-inline: 5px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 11px; font-variant-numeric: tabular-nums; }',
  '.elr-figure-entry-head .elr-figure-entry-page:hover:not(:disabled) { color: var(--dsw-alias-brand-primary); }',
  '.elr-figure-entry-head .elr-figure-entry-page:disabled { opacity: .55; cursor: default; }',
  '.elr-figure-entry-head .elr-figure-entry-remove { width: 25px; }',
  '.elr-generation-meta { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: calc(11px + var(--elr-card-font-adjust, 0px)); color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }',
  '.elr-figure-entry .elr-generation-meta { padding: 2px 10px 8px; }',
  '.elr-summary-error { overflow-wrap: anywhere; }',
  '.elr-figure-entry-body { padding: 6px 10px 10px; border-top: 1px solid var(--dsw-alias-border-l1); overflow-wrap: anywhere; }',
  '.elr-figure-entry-body blockquote { margin: 4px 0 8px; padding-inline-start: 8px; border-inline-start: 2px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); white-space: pre-line; }',
  '.elr-figure-activity { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); font-size: calc(12px + var(--elr-card-font-adjust, 0px)); }',
  '.elr-markdown p, .elr-markdown li { line-height: 1.7; }',
  '.elr-markdown ol { list-style: decimal; margin-block: 6px; padding-inline-start: 24px; }',
  '.elr-markdown code { background: var(--dsw-alias-bg-layer-2); padding: 1px 4px; border-radius: 4px; }',
  // ---- v9 #2: rendered math and tables ----
  '.elr-math-block { margin: 8px 0; max-width: 100%; overflow-x: auto; overflow-y: hidden; padding: 2px 0 6px; scrollbar-width: thin; }',
  '.elr-math-block .elr-katex .katex { font-size: .96em; }',
  '.elr-math-inline { padding: 0 1px; }',
  '.elr-katex-err { color: var(--dsw-alias-state-error-primary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: calc(11px + var(--elr-card-font-adjust, 0px)); word-break: break-all; }',
  '.elr-table-wrap { margin: 8px 0; overflow-x: auto; }',
  '.elr-md-table { border-collapse: collapse; width: 100%; font-size: calc(12px + var(--elr-card-font-adjust, 0px)); }',
  '.elr-md-table th, .elr-md-table td { border: 1px solid var(--dsw-alias-border-l1); padding: 5px 8px; text-align: left; vertical-align: top; line-height: 1.6; }',
  '.elr-md-table th { background: var(--dsw-alias-bg-layer-2); font-weight: 600; }',
  '.elr-md-table tr:nth-child(even) td { background: var(--dsw-alias-bg-layer-1); }',
  // KaTeX ships its own font metrics; only the text colour needs to follow
  // the host theme, otherwise formulas stay black on a dark background.
  '.elr-katex .katex { font-size: 1.05em; color: var(--dsw-alias-label-primary); }',
  '.elr-katex .katex-display { margin: 0; }',
  '.elr-pdf-wrap { position: relative; flex: 1 1 auto; min-height: 240px; background: var(--dsw-alias-bg-layer-2); }',
  // (v15 #4) `contain` stops wheel/touch scroll chaining: once this element
  // reaches its own edge the gesture is consumed instead of scrolling the
  // frame (and therefore the right analysis column) as well.
  // (v34 #2) `contain: layout paint style` keeps the viewport's inner layout
  // from invalidating anything above it while the side pane is being dragged.
  // It deliberately does NOT include SIZE containment (`strict` would imply it
  // and collapse this absolutely-positioned box to zero height).
  '.elr-pdf-container { position: absolute; inset: 0; overflow: auto; overscroll-behavior: contain; contain: layout paint style; }',
  '.elr-pdf-container > .pdfViewer { transform: translate3d(calc(var(--elr-pdf-offset-x, 0) * 0.45cqw), 0, 0); transition: transform 110ms cubic-bezier(.22, 1, .36, 1); will-change: transform; }',
  '.elr-pdf-container .textLayer span { letter-spacing: normal; word-spacing: normal; }',
  '@media (prefers-reduced-motion: reduce) { .elr-pdf-container > .pdfViewer { transition: none; } }',
  '.elr-pdf-wrap.is-start { min-height: 0; background: var(--dsw-alias-bg-base); }',
  '.elr-pdf-wrap.is-start > .elr-pdf-container { visibility: hidden; }',
  '.elr-drag-mask { position: absolute; inset: 10px; z-index: 5; display: flex; align-items: center; justify-content: center; border: 2px dashed var(--dsw-alias-brand-primary); border-radius: 14px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-brand-primary); font-size: 15px; font-weight: 600; pointer-events: none; }',
  '.elr-pdf-iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: none; z-index: 2; background: var(--dsw-alias-bg-base); }',
  '.elr-retry-bar { position: absolute; top: 10px; left: 10px; right: 10px; z-index: 6; display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-state-error-primary); font-size: 12px; flex-wrap: wrap; word-break: break-word; }',
  '.elr-select { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 5px 8px; font-size: calc(12px + var(--elr-card-font-adjust, 0px)); max-width: 190px; }',
  '.elr-select-label { font-size: 11px; color: var(--dsw-alias-label-secondary); }',
  '.elr-recent { background: transparent; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }',
  // (v37) `max-height` → flex growth: the list now fills the room the card has.
  '.elr-recent-list { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0 8px 8px; }',
  '.elr-recent-empty { padding: 4px 12px 10px; color: var(--dsw-alias-label-secondary); font-size: calc(11px + var(--elr-card-font-adjust, 0px)); }',
  '.elr-recent-item { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 6px; font-size: calc(11px + var(--elr-card-font-adjust, 0px)); }',
  '.elr-recent-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-primary); }',
  '.elr-recent-item button { border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: calc(11px + var(--elr-card-font-adjust, 0px)); padding: 2px 4px; }',
  '.elr-recent-item button:hover { color: var(--dsw-alias-state-error-primary); }',
  // ---- v4: inline translation popup ----
  '.elr-popup { position: fixed; z-index: 120; display: flex; flex-direction: column; border-radius: 16px; font-size: 12px; }',
  // (v14 #2) Font size is set EXPLICITLY by the A−/A+ buttons on the title
  // bar and written as an inline fontSize on the card; the text regions simply
  // inherit it. No container query / automatic scaling: `cqw` was silently
  // dropped in the user's Electron build, so resizing never changed the text.
  '.elr-popup-text { font-size: inherit; line-height: 1.65; }',
  // (v15 #2) The two regions are visually distinct cards: the EDITABLE English
  // original sits on a neutral layer with a muted accent, the Chinese result on
  // a soft brand tint. Both use only host theme tokens.
  '.elr-popup-label { display: block; font-size: 11px; font-weight: 600; margin-bottom: 5px; color: var(--dsw-alias-label-secondary); }',
  '.elr-popup-original-head { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; margin-bottom: 5px; }',
  '.elr-popup-original-head .elr-popup-label { margin: 0; }',
  // (v19 #1) Each of the two cards is a flex COLUMN that owns its own height
  // share of the popup body (`flex-grow` = the weight in `popup.ow`/`popup.rw`).
  // Resizing the outer card therefore stretches BOTH boxes instead of leaving
  // them at their old fixed heights, and the weights can still be rebalanced
  // one at a time by dragging the grip under either box.
  '.elr-popup-block { box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; min-height: calc(55px + 1.7em); overflow: hidden; }',
  '.elr-popup-block + .elr-popup-block { margin-top: 9px; }',
  // (v19 #1) The per-box height grip is a normal flex
  // item at the bottom of the card, not an absolutely positioned overlay.
  '.elr-popup-grip { flex: 0 0 9px; height: 9px; margin-top: 5px; cursor: ns-resize; border-radius: 4px; background: linear-gradient(180deg, transparent 0 40%, var(--dsw-alias-border-l2) 40% 60%, transparent 60%); opacity: .5; touch-action: none; }',
  '.elr-popup-grip:hover, .elr-popup-grip:active { opacity: 1; }',
  '.elr-popup-block-original { background: var(--dsw-alias-bg-layer-1); border-left: 3px solid var(--dsw-alias-border-l2); }',
  '.elr-popup-block-result { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, var(--dsw-alias-bg-overlay)); border-left: 3px solid var(--dsw-alias-brand-primary); }',
  // (v15 #1) The English original is an editable textarea, so the same card can
  // be re-translated after correcting pdf.js line-wrap noise. It must NOT start
  // a card drag (unlike the title bar), so its events stay on the textarea.
  // (v17 #1) `max-height` is gone and `resize: vertical` stays: the English box
  // and the Chinese box below are now sized INDEPENDENTLY by the user instead
  // of sharing one scrolling body.
  // (v17 #1) `resize: vertical` + its own scrollbar: the English box and the
  // Chinese box below are sized INDEPENDENTLY by the reader, so making one
  // taller never pushes the other around.
  // (v19 #1) The textarea is now a flex child that FILLS its card, so growing the
  // outer popup grows the writing area automatically. `resize` is off because the
  // height is owned by the card's flex weight (see the grip below it).
  '.elr-popup-textarea { display: block; width: 100%; flex: 1 1 0; min-height: 0; box-sizing: border-box; resize: none; overflow: auto; overscroll-behavior: contain; border: none; outline: none; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; line-height: 1.65; }',
  '.elr-popup-text { white-space: pre-wrap; line-height: 1.7; color: var(--dsw-alias-label-primary); font-size: inherit; }',
  // (v17 #1) A native `resize` handle only works when the element scrolls on its
  // own, so the result box gets `overflow: auto`; its height is therefore
  // independent of the English box above it.
  // (v19 #1) Same treatment as the English box: it FILLS the result card, which is
  // a flex child of the popup body, so an outer resize stretches it too.
  '.elr-popup-result-box { display: block; flex: 1 1 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }',
  // (v17 #3) The staged / empty hint must read as a hint, not as a translation:
  // `.elr-popup-text` would otherwise win on equal specificity.
  '.elr-popup-result-box.elr-out-empty { color: var(--dsw-alias-label-secondary); }',
  // (v23 #5) Dark app theme: the Chinese result area must stay readable.
  // (v42 #1) These used to be hard-coded #000000 / #ffffff, which ignored the
  // interface tone completely — picking 淡黄色 / 淡绿色 / 深蓝色 still left a
  // pure black box under a light card. They now consume the same alias tokens
  // as everything else, so `.elr-tone-*` and the host light/dark scheme both
  // drive the colour: light schemes give dark-on-light, dark schemes give
  // light-on-dark, and the result block keeps its brand accent either way.
  '.elr-popup-dark .elr-popup-block-result { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, var(--dsw-alias-bg-layer-1)); border-left-color: var(--dsw-alias-brand-primary); }',
  '.elr-popup-dark .elr-popup-result-box, .elr-popup-dark .elr-popup-textarea { background: transparent; color: var(--dsw-alias-label-primary); }',
  '.elr-popup-dark .elr-popup-block-result .elr-popup-label { color: var(--dsw-alias-label-secondary); }',
  '.elr-popup-dark .elr-popup-result-box.elr-out-empty { color: var(--dsw-alias-label-secondary); }',
  '.elr-popup-actions { display: flex; align-items: center; justify-content: flex-end; margin-top: 7px; }',
  // The title bar doubles as the drag handle.
  '.elr-popup-head { display: flex; flex: 0 0 auto; flex-wrap: nowrap; align-items: center; gap: 6px; padding: 7px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); font-size: 11px; white-space: nowrap; cursor: move; user-select: none; touch-action: none; }',
  '.elr-popup[data-selection-anchored] .elr-popup-head { cursor: default; }',
  '.elr-popup-head .elr-icon-btn { padding: 2px 6px; white-space: nowrap; }',
  '.elr-popup-head .elr-popup-translate { min-width: 0; overflow: hidden; text-overflow: ellipsis; border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); font-weight: 600; }',
  '.elr-floating-card.is-compare-hidden { display: none !important; }',
  '.elr-popup-head .elr-popup-original-toggle, .elr-popup-head .elr-popup-translate-btn { width: auto; min-width: 24px; padding: 0 6px; font-size: 11px; font-weight: 600; letter-spacing: .01em; }',
  '.elr-popup-head .elr-popup-original-toggle[aria-pressed="true"] { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); }',
  '.elr-popup-head .elr-popup-translate:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }',
  '.elr-popup-head .elr-popup-translate:disabled { opacity: .5; cursor: default; border-color: var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }',
  // (v17 #1) The body no longer scrolls as a whole: each of the two cards owns
  // its size, so the reader can make the English box tall and the Chinese box
  // short (or the other way round) without them fighting.
  // (v19 #1) The body is the flex CONTAINER whose two cards share its height by
  // weight (`popup.ow` / `popup.rw`). `overflow: hidden` because each card owns
  // its own scrollbar now; nothing should scroll the body itself.
  '.elr-popup-body { padding: 10px 12px; flex: 1 1 0; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }',
  '.elr-popup.is-side-by-side .elr-popup-body { flex-direction: row; }',
  '.elr-popup.is-side-by-side .elr-popup-block { min-width: min(132px, 40%); min-height: 0; margin-block-start: 0; }',
  '.elr-popup-body > .elr-popup-column-grip { flex: 0 0 10px; cursor: ew-resize; touch-action: none; background: linear-gradient(90deg, transparent 40%, var(--dsw-alias-border-l2) 40% 60%, transparent 60%) center / 100% 22px no-repeat; }',
  '.elr-popup-layout-toggle svg, .elr-analysis-icon svg { width: 15px; height: 15px; }',
  '.elr-popup :is(.elr-popup-textarea,.elr-popup-result-box), .elr-note-bubble .elr-note-bubble-textarea { overflow: hidden auto; overflow-wrap: anywhere; }',
  // ---- v9 #1: floating cards can be resized ----
  // (v18 #3) The native `resize` property only ever exposes the bottom-right
  // corner, which is why resizing felt broken. Every floating card now carries
  // eight invisible edge/corner strips (`.elr-rz-*`) that drive the geometry
  // directly, so ANY edge or corner can be dragged. `overflow: hidden` is kept
  // because the inner body owns its own scrollbar.
  '.elr-resizable { overflow: hidden; }',
  '.elr-grip-corner { position: absolute; right: 3px; bottom: 3px; width: 11px; height: 11px; pointer-events: none; opacity: .65; background: linear-gradient(135deg, transparent 0 45%, var(--dsw-alias-border-l2) 45% 55%, transparent 55% 70%, var(--dsw-alias-border-l2) 70% 80%, transparent 80%); transition: opacity var(--duration-feedback) var(--ease-out), filter var(--duration-feedback) var(--ease-out); }',
  '.elr-rz { position: absolute; z-index: 6; background: transparent; touch-action: none; transition: background var(--duration-feedback) var(--ease-out); }',
  '.elr-rz::before { content: ""; position: absolute; pointer-events: none; opacity: 0; transition: opacity var(--duration-feedback) var(--ease-out), transform var(--duration-feedback) var(--ease-out), filter var(--duration-feedback) var(--ease-out); }',
  '.elr-rz:is(:hover, .is-resizing)::before { opacity: .94; }',
  '.elr-rz.is-resizing::before { opacity: 1; }',
  '.elr-rz-n { top: 0; left: 18px; right: 18px; height: 7px; cursor: ns-resize; border-radius: 999px; }',
  '.elr-rz-s { bottom: 0; left: 18px; right: 18px; height: 7px; cursor: ns-resize; border-radius: 999px; }',
  '.elr-rz-e { right: 0; top: 18px; bottom: 18px; width: 7px; cursor: ew-resize; border-radius: 999px; }',
  '.elr-rz-w { left: 0; top: 18px; bottom: 18px; width: 7px; cursor: ew-resize; border-radius: 999px; }',
  '.elr-rz-n::before, .elr-rz-s::before { left: 6px; right: 6px; height: 2.5px; border-radius: 999px; background: var(--dsw-alias-brand-primary); box-shadow: 0 0 8px color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); }',
  '.elr-rz-n::before { top: 0; transform: scaleX(.72); }',
  '.elr-rz-s::before { bottom: 0; transform: scaleX(.72); }',
  '.elr-rz-n:is(:hover, .is-resizing)::before, .elr-rz-s:is(:hover, .is-resizing)::before { transform: scaleX(1); }',
  '.elr-rz-n:is(:hover, .is-resizing) { background: radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent), transparent 76%); }',
  '.elr-rz-s:is(:hover, .is-resizing) { background: radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent), transparent 76%); }',
  '.elr-rz-e::before, .elr-rz-w::before { top: 6px; bottom: 6px; width: 2.5px; border-radius: 999px; background: var(--dsw-alias-brand-primary); box-shadow: 0 0 8px color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); }',
  '.elr-rz-e::before { right: 0; transform: scaleY(.72); }',
  '.elr-rz-w::before { left: 0; transform: scaleY(.72); }',
  '.elr-rz-e:is(:hover, .is-resizing)::before, .elr-rz-w:is(:hover, .is-resizing)::before { transform: scaleY(1); }',
  '.elr-rz-e:is(:hover, .is-resizing) { background: radial-gradient(ellipse at 100% 50%, color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent), transparent 76%); }',
  '.elr-rz-w:is(:hover, .is-resizing) { background: radial-gradient(ellipse at 0% 50%, color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent), transparent 76%); }',
  '.elr-rz-ne { top: 0; right: 0; width: 18px; height: 18px; cursor: nesw-resize; border-top-right-radius: var(--elr-rz-corner, 15px); }',
  '.elr-rz-nw { top: 0; left: 0; width: 18px; height: 18px; cursor: nwse-resize; border-top-left-radius: var(--elr-rz-corner, 15px); }',
  '.elr-rz-se { bottom: 0; right: 0; width: 18px; height: 18px; cursor: nwse-resize; border-bottom-right-radius: var(--elr-rz-corner, 15px); }',
  '.elr-rz-sw { bottom: 0; left: 0; width: 18px; height: 18px; cursor: nesw-resize; border-bottom-left-radius: var(--elr-rz-corner, 15px); }',
  ':is(.elr-rz-ne, .elr-rz-nw, .elr-rz-se, .elr-rz-sw)::before { width: 15px; height: 15px; box-sizing: border-box; border: 0 solid var(--dsw-alias-brand-primary); filter: drop-shadow(0 0 4px color-mix(in srgb, var(--dsw-alias-brand-primary) 60%, transparent)); transform: scale(.86); }',
  ':is(.elr-rz-ne, .elr-rz-nw, .elr-rz-se, .elr-rz-sw):is(:hover, .is-resizing)::before { transform: scale(1); }',
  '.elr-rz-nw::before { top: 0; left: 0; border-top-width: 2.5px; border-left-width: 2.5px; border-top-left-radius: var(--elr-rz-corner, 16px); transform-origin: top left; }',
  '.elr-rz-ne::before { top: 0; right: 0; border-top-width: 2.5px; border-right-width: 2.5px; border-top-right-radius: var(--elr-rz-corner, 16px); transform-origin: top right; }',
  '.elr-rz-sw::before { bottom: 0; left: 0; border-bottom-width: 2.5px; border-left-width: 2.5px; border-bottom-left-radius: var(--elr-rz-corner, 16px); transform-origin: bottom left; }',
  '.elr-rz-se::before { bottom: 0; right: 0; border-bottom-width: 2.5px; border-right-width: 2.5px; border-bottom-right-radius: var(--elr-rz-corner, 16px); transform-origin: bottom right; }',
  '.elr-rz-nw:is(:hover, .is-resizing) { background: radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent), transparent 76%); }',
  '.elr-rz-ne:is(:hover, .is-resizing) { background: radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent), transparent 76%); }',
  '.elr-rz-sw:is(:hover, .is-resizing) { background: radial-gradient(circle at 0% 100%, color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent), transparent 76%); }',
  '.elr-rz-se:is(:hover, .is-resizing) { background: radial-gradient(circle at 100% 100%, color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent), transparent 76%); }',
  '.elr-popup, .elr-note-bubble { --elr-rz-corner: 15px; }',
  '.elr-formula-card { --elr-rz-corner: 9px; }',
  '.elr-resizable:has(.elr-rz-se:is(:hover, .is-resizing)) > .elr-grip-corner { opacity: 1; filter: drop-shadow(0 0 2px var(--dsw-alias-brand-primary)); }',
  '@media (prefers-reduced-motion: reduce) { .elr-rz, .elr-rz::before, .elr-grip-corner { transition: none; } }',
  // (v18 #3/#5) A box that resizes by dragging its own bottom edge. The height
  // is written into the element's inline style by the handle, so React never
  // fights the browser over it.
  // (v18 #4/#5) The English side of the selection card is now an editor.
  // (v18 #1) Empty state shown in the analysis pane before a paper is opened.
  // ---- v1.0.5: highlights are painted UNDER the glyphs, on their own layer ----
  // pdf.js draws text AND figures into one opaque page canvas, and its text
  // layer is only 25% opaque with transparent glyphs. Painting a background on
  // a text-layer span therefore washes out the text and can bleed onto
  // neighbouring words. Instead we draw translucent yellow rectangles onto an
  // overlay canvas stacked between the page canvas and the text layer, and use
  // `mix-blend-mode: multiply` so black glyphs stay black and white paper turns
  // pale yellow. Nothing is painted on the spans themselves.
  // The overlay lives INSIDE `.canvasWrapper` (not `.page`): `.page` carries a
  // 9px transparent border (pdf_viewer.css `--page-border`), so anchoring to it
  // shifted every rectangle and dashed underline by the border width — the
  // misalignment reported in v7. `.canvasWrapper` is now the positioning
  // context and its rect is also the measuring origin.
  '.elr-pdf-container .pdfViewer .page .canvasWrapper { position: relative; }',
  '.elr-hl-overlay { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 3; mix-blend-mode: multiply; }',
  '.elr-hl-note { cursor: help; }',
  // ---- (v44 #3) 纸张纹理 / 护眼黄: repaint ONLY the white paper ----
  // WHAT WAS WRONG (v8 and earlier): the tint was a `::after` on `.page`, i.e.
  // a sheet laid OVER the rendered page. It washed the glyphs, the figures and
  // the tables alike, which is exactly what the user forbids. The `background-color`
  // rules next to it could never do anything either: pdf.js paints an OPAQUE
  // WHITE rectangle into the page canvas itself (`beginDrawing()` in
  // `vendor/pdf.min.js`: `ctx.fillStyle = background || "#ffffff"; fillRect(...)`),
  // so any CSS background behind the canvas is 100% covered.
  //
  // WHAT REPLACES IT: one blended layer per page, inside `.canvasWrapper`
  // (already `position: relative`, already the anchor for the highlight overlay),
  // at `z-index: 1` — above the canvas, below `.elr-hl-overlay` (3) and
  // `.elr-find-overlay` (4).
  // `mix-blend-mode: darken` is the whole trick: every channel keeps the DARKER
  // of (layer, page), so black text stays pure black, a figure or a table rule
  // that is already darker than the tint is returned unchanged, and only the
  // white the renderer painted — plus anything lighter than the tint — becomes
  // paper. `multiply` (the highlight overlay's mode) would have darkened the
  // figures themselves, so it is deliberately NOT used here.
  // TWO generated layers take part, both `mix-blend-mode: darken`:
  //   ::before — the flat paper tint, OPAQUE, so pure white becomes paper at
  //              full strength;
  //   ::after  — the fibre/grain texture, built only from LOW-ALPHA gradients.
  // Because the blend is `darken` and every grain colour is a translucent
  // warm grey, the texture can only ever REMOVE a little light from a channel:
  //   · pure black glyphs  → unchanged (already darker than any grain);
  //   · a figure/table pixel darker than the grain → returned unchanged;
  //   · a near-white pixel inside a figure → gets the same faint grain the
  //     paper around it gets, which is what real print looks like, and is the
  //     only case where anything "inside" a figure is touched at all.
  // `multiply` is deliberately NOT used: it would darken every figure.
  // (v45) The texture is back, after the user asked for it explicitly — but it
  // is built from low-alpha CSS gradients instead of the v8 opaque sheet, so it
  // can never stamp hard lines across a chart.
  '.elr-pdf-container[data-elr-page-theme]:not([data-elr-page-dark]) .pdfViewer .page .canvasWrapper::before { background-color: var(--elr-paper-color); content: ""; position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; mix-blend-mode: darken; border-radius: 2px; }',
  '.elr-pdf-container[data-elr-page-theme="paper"] { --elr-paper-color: #f7f3e9; }',
  '.elr-pdf-container[data-elr-page-theme="eye"] { --elr-paper-color: #faf6e5; }',
  '.elr-pdf-container[data-elr-page-theme="linen"] { --elr-paper-color: #f4f1e8; }',
  '.elr-pdf-container[data-elr-page-theme="sage"] { --elr-paper-color: #eff5ef; }',
  '.elr-pdf-container[data-elr-page-theme="mist"] { --elr-paper-color: #eff4f7; }',
  '.elr-pdf-container[data-elr-page-theme="ivory"] { --elr-paper-color: #faf8f1; }',
  '.elr-pdf-container[data-elr-page-dark] .pdfViewer .page, .elr-pdf-container[data-elr-page-dark] .pdfViewer .page .canvasWrapper { background-color: var(--elr-paper-color); }',
  '.elr-pdf-container[data-elr-page-dark] .pdfViewer .page { box-shadow: 0 2px 12px rgb(0 0 0 / .45), inset 0 0 0 1px rgb(255 255 255 / .08); }',
  '.elr-pdf-container[data-elr-page-dark] .pdfViewer .page .canvasWrapper > canvas:not(.elr-hl-overlay):not(.elr-find-overlay) { filter: invert(1) hue-rotate(180deg) contrast(.94) brightness(.90); }',
  '.elr-pdf-container[data-elr-page-dark] .pdfViewer .page .canvasWrapper::before { background-color: var(--elr-paper-color); content: ""; position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; mix-blend-mode: lighten; border-radius: 2px; }',
  '.elr-pdf-container[data-elr-page-dark] .elr-hl-overlay, .elr-pdf-container[data-elr-page-dark] .elr-find-overlay { mix-blend-mode: screen; }',
  '.elr-pdf-container[data-elr-page-theme="dark-slate"] { --elr-paper-color: #1b2028; }',
  '.elr-pdf-container[data-elr-page-theme="dark-midnight"] { --elr-paper-color: #141d2b; }',
  '.elr-pdf-container[data-elr-page-theme="dark-sepia"] { --elr-paper-color: #211c17; }',
  '.elr-pdf-container[data-elr-page-theme="dark-forest"] { --elr-paper-color: #14211b; }',
  '.elr-pdf-container[data-elr-page-theme="dark-oled"] { --elr-paper-color: #0d0f14; }',
  '.elr-pdf-container:is([data-elr-page-theme="paper"], [data-elr-page-theme="eye"], [data-elr-page-theme="linen"]) .pdfViewer .page .canvasWrapper::after { content: ""; position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; mix-blend-mode: darken; }',
  // Fibres run in two near-orthogonal directions at coprime pitches (3px / 4px /
  // 7px) so no visible plaid can emerge, plus an isotropic speckle and three
  // large soft blotches for the uneven tone of real stock.
  '.elr-pdf-container[data-elr-page-theme="paper"] .pdfViewer .page .canvasWrapper::after { background-image: repeating-linear-gradient(0deg, rgba(122, 98, 62, 0.05) 0px, rgba(122, 98, 62, 0.05) 1px, rgba(122, 98, 62, 0) 1px, rgba(122, 98, 62, 0) 3px), repeating-linear-gradient(90deg, rgba(122, 98, 62, 0.042) 0px, rgba(122, 98, 62, 0.042) 1px, rgba(122, 98, 62, 0) 1px, rgba(122, 98, 62, 0) 4px), repeating-linear-gradient(46deg, rgba(112, 90, 58, 0.03) 0px, rgba(112, 90, 58, 0.03) 1px, rgba(112, 90, 58, 0) 1px, rgba(112, 90, 58, 0) 7px), repeating-radial-gradient(circle at 50% 50%, rgba(130, 106, 70, 0.045) 0px, rgba(130, 106, 70, 0.045) 0.7px, rgba(130, 106, 70, 0) 0.7px, rgba(130, 106, 70, 0) 3px), radial-gradient(120% 95% at 16% 10%, rgba(150, 122, 80, 0.09), rgba(150, 122, 80, 0) 62%), radial-gradient(105% 85% at 84% 90%, rgba(120, 96, 62, 0.085), rgba(120, 96, 62, 0) 58%), radial-gradient(90% 70% at 58% 42%, rgba(163, 136, 94, 0.055), rgba(163, 136, 94, 0) 72%); }',
  '.elr-pdf-container[data-elr-page-theme="eye"] .pdfViewer .page .canvasWrapper::after { background-image: repeating-linear-gradient(0deg, rgba(150, 126, 58, 0.038) 0px, rgba(150, 126, 58, 0.038) 1px, rgba(150, 126, 58, 0) 1px, rgba(150, 126, 58, 0) 3px), repeating-linear-gradient(90deg, rgba(150, 126, 58, 0.032) 0px, rgba(150, 126, 58, 0.032) 1px, rgba(150, 126, 58, 0) 1px, rgba(150, 126, 58, 0) 4px), repeating-linear-gradient(46deg, rgba(140, 118, 54, 0.024) 0px, rgba(140, 118, 54, 0.024) 1px, rgba(140, 118, 54, 0) 1px, rgba(140, 118, 54, 0) 7px), repeating-radial-gradient(circle at 50% 50%, rgba(158, 134, 66, 0.034) 0px, rgba(158, 134, 66, 0.034) 0.7px, rgba(158, 134, 66, 0) 0.7px, rgba(158, 134, 66, 0) 3px), radial-gradient(120% 95% at 16% 10%, rgba(170, 144, 76, 0.07), rgba(170, 144, 76, 0) 62%), radial-gradient(105% 85% at 84% 90%, rgba(150, 126, 62, 0.065), rgba(150, 126, 62, 0) 58%), radial-gradient(90% 70% at 58% 42%, rgba(180, 155, 88, 0.045), rgba(180, 155, 88, 0) 72%); }',
  '.elr-pdf-container[data-elr-page-theme="linen"] .pdfViewer .page .canvasWrapper::after { background-image: repeating-linear-gradient(0deg, rgba(109, 102, 83, .055) 0 1px, transparent 1px 5px), repeating-linear-gradient(90deg, rgba(109, 102, 83, .04) 0 1px, transparent 1px 4px); }',
  // Keep each palette self-contained, including text for controls and status.
  // ---- v5: context menu for selection actions ----
  '.elr-menu { position: fixed; z-index: 130; min-width: 168px; padding: 5px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 9px; background: var(--dsw-alias-bg-overlay); box-shadow: 0 10px 30px rgba(0,0,0,.3); }',
  '.elr-menu-item { display: block; width: 100%; text-align: left; border: none; background: transparent; color: var(--dsw-alias-label-primary); padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }',
  '.elr-menu-item:hover { background: var(--dsw-alias-bg-layer-2); }',
  '.elr-card-context { width: 156px; padding: 5px; gap: 2px; }',
  '.elr-card-context .elr-menu-item.is-destructive { color: var(--dsw-alias-state-error-primary); }',
  '.elr-menu-sep { height: 1px; margin: 4px 2px; background: var(--dsw-alias-border-l1); }',
  // ---- v5: note bubble shown beside an annotated sentence ----
  '.elr-note-bubble { position: fixed; z-index: 125; display: flex; flex-direction: column; box-sizing: border-box; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.65; }',
  '.elr-note-bubble-body { gap: 8px; }',
  '.elr-note-bubble-textarea { flex: 1 1 auto; width: 100%; box-sizing: border-box; min-height: 0; resize: none; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 44%, transparent); color: var(--dsw-alias-label-primary); font: inherit; padding: 8px 10px; overscroll-behavior: contain; }',
  '.elr-note-source { flex: 0 0 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); font-size: 11px; }',
  '.elr-marks { background: transparent; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }',
  // (v37) `max-height: 200px` → `flex: 1 1 auto`: the annotations list follows the
  // 功能栏 instead of stopping at a fixed 200px.
  '.elr-marks-list { display: grid; align-content: start; gap: 6px; flex: 1 1 auto; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0 8px 8px; }',
  // (v24 #2) Segmented control under the "高亮与批注" header: 全部 / 仅高亮 / 仅批注.
  // (v41) It used to be glued to the header: `margin: 0 10px 8px` left no space
  // above it, and the segments inherited `.elr-seg`'s `bg-layer-2` background —
  // the SAME tone as the header bar — so the whole thing read as one crammed
  // block. Now it is its own band: a `bg-base` pill tray with real vertical
  // spacing above and below, transparent segments inside it (only the active
  // one is filled), so header / filter / list are three distinct rows.
  '.elr-marks-filter { flex: 0 0 auto; display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 2px; margin: 0 var(--elr-card-inset) var(--elr-card-content-gap) var(--elr-card-leading); padding: 2px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; background: var(--dsw-alias-bg-base); }',
  '.elr-marks-filter .elr-seg { min-width: 0; text-align: center; padding: 3px 4px; font-size: calc(11px + var(--elr-card-font-adjust, 0px)); line-height: 1.45; border-radius: 4px; background: transparent; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  // The base `.elr-seg + .elr-seg` divider belongs to the JOINED toolbar control;
  // inside this tray the segments are separate pills, so drop the rule.
  '.elr-marks-filter .elr-seg + .elr-seg { border-left: none; }',
  '.elr-marks-filter .elr-seg:hover { color: var(--dsw-alias-label-primary); }',
  '.elr-marks-filter .elr-seg.active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-brand-primary); font-weight: 600; }',
  '.elr-body.dock-bottom .elr-marks-filter { align-self: flex-start; grid-template-columns: repeat(3, minmax(35px, 1fr)); max-width: calc(100% - var(--elr-card-inset)); }',
  '.elr-body.dock-bottom .elr-marks-filter .elr-seg { padding-block: 2px; }',
  '.elr-mark-item { display: grid; gap: 3px; box-sizing: border-box; min-width: 0; padding: 5px 7px 7px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; background: var(--dsw-alias-bg-layer-1); }',
  '.elr-mark-row { display: flex; align-items: center; gap: 3px; min-width: 0; }',
  '.elr-mark-badge { display: inline-flex; align-items: center; gap: 4px; margin-inline-end: auto; font-size: calc(11px + var(--elr-card-font-adjust, 0px)); font-weight: 600; color: var(--dsw-alias-brand-primary); }',
  '.elr-mark-badge::before { content: ""; flex: 0 0 6px; height: 6px; border-radius: 50%; background: currentColor; }',
  '.elr-mark-item.is-hl .elr-mark-badge { color: var(--dsw-alias-state-warn-primary); }',
  '.elr-mark-locate-icon { width: 11px; height: 11px; display: grid; place-items: center; box-sizing: border-box; border: 1px solid currentColor; border-radius: 50%; }',
  '.elr-mark-locate-icon::after { content: ""; width: 3px; height: 3px; background: currentColor; border-radius: 50%; }',
  '.elr-mark-edit-icon { width: 11px; height: 4px; box-sizing: border-box; border: 1px solid currentColor; border-radius: 1px; transform: rotate(-45deg); position: relative; }',
  '.elr-mark-edit-icon::after { content: ""; position: absolute; inset: -1px auto auto -3px; width: 3px; height: 4px; background: currentColor; clip-path: polygon(0 50%, 100% 0, 100% 100%); }',
  '.elr-mark-preview { display: block; width: 100%; min-width: 0; padding: 2px 3px; box-sizing: border-box; border: none; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: calc(12px + var(--elr-card-font-adjust, 0px)); line-height: 1.5; text-align: start; cursor: pointer; }',
  '.elr-mark-preview:hover { background: var(--dsw-alias-bg-layer-2); }',
  '.elr-mark-preview:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }',
  '.elr-mark-preview > span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; }',
  '.elr-mark-item.is-note .elr-mark-source { color: var(--dsw-alias-label-secondary); font-size: calc(11px + var(--elr-card-font-adjust, 0px)); border-inline-start: 2px solid var(--dsw-alias-border-l2); padding-inline-start: 6px; }',
  '.elr-mark-item.is-note .elr-mark-source > span { -webkit-line-clamp: 2; }',
  '@container elr-mark-strip (height < 78px) { .elr-mark-item { --elr-mark-preview-lines: 1; } }',
  '@container elr-mark-strip (height >= 120px) { .elr-mark-item { --elr-mark-preview-lines: 3; } }',
  '@container elr-mark-strip (height >= 156px) { .elr-mark-item { --elr-mark-preview-lines: 5; } }',
  '@container elr-mark-strip (height >= 210px) { .elr-mark-item { --elr-mark-preview-lines: 8; } }',
  '.elr-marks-empty { padding: 5px 9px 9px; font-size: calc(11px + var(--elr-card-font-adjust, 0px)); line-height: 1.5; color: var(--dsw-alias-label-secondary); }',
  // ---- v35 #1: 术语解释. A glossary, not a passage list: each row is the term
  // itself and expands into the explanation that was generated for it.
  '.elr-terms { background: transparent; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }',
  '.elr-terms-busy { font-size: calc(11px + var(--elr-card-font-adjust, 0px)); font-weight: 400; color: var(--dsw-alias-brand-primary); }',
  // (v37) `max-height: 200px` → flex growth, so the glossary grows with the card.
  '.elr-terms-list { flex: 1 1 auto; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0 7px 7px; }',
  '.elr-term-item { border: 1px solid var(--dsw-alias-border-l1); border-inline-start: 2px solid var(--dsw-alias-brand-primary); border-radius: 7px; background: var(--dsw-alias-bg-layer-1); }',
  '.elr-term-item + .elr-term-item { margin-block-start: 4px; }',
  '.elr-term-row { display: flex; align-items: center; gap: 2px; padding-inline-end: 3px; }',
  '.elr-term-toggle { flex: 1 1 auto; min-width: 0; min-height: 28px; display: flex; align-items: center; gap: 5px; padding: 2px 3px 2px 6px; border: 0; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; text-align: start; cursor: pointer; }',
  '.elr-term-toggle::before { content: ""; flex: 0 0 5px; width: 5px; height: 5px; box-sizing: border-box; border-inline-end: 1px solid currentColor; border-bottom: 1px solid currentColor; transform: rotate(-45deg); }',
  '.elr-term-toggle[aria-expanded="true"]::before { transform: rotate(45deg); }',
  '.elr-term-toggle:hover .elr-term-name { color: var(--dsw-alias-brand-primary); }',
  '.elr-term-toggle:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }',
  '.elr-term-name { font-size: calc(12px + var(--elr-card-font-adjust, 0px)); line-height: 1.35; font-weight: 600; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.elr-term-status-dot { flex: 0 0 6px; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-brand-primary); }',
  '.elr-term-status-dot.is-error, .elr-term-error { color: var(--dsw-alias-state-error-primary); }',
  '.elr-term-status-dot.is-error { background: currentColor; }',
  '.elr-term-error { margin: 0 0 7px; overflow-wrap: anywhere; }',
  '.elr-remove-control:is(:hover, :focus-visible) { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, currentColor 11%, transparent); }',
  '.elr-trash-icon { position: relative; display: block; box-sizing: border-box; width: 10px; height: 9px; margin-top: 5px; border: 1px solid currentColor; border-radius: 0 0 2px 2px; }',
  '.elr-trash-icon::before { content: ""; position: absolute; top: -3px; left: -2px; width: 12px; height: 1px; border-radius: 1px; background: currentColor; }',
  '.elr-trash-icon::after { content: ""; position: absolute; top: -6px; left: 2px; box-sizing: border-box; width: 4px; height: 3px; border: 1px solid currentColor; border-bottom: 0; border-radius: 2px 2px 0 0; }',
  '.elr-term-body { border-top: 1px solid var(--dsw-alias-border-l1); padding: 7px 9px 9px; font-size: calc(11px + var(--elr-card-font-adjust, 0px)); color: var(--dsw-alias-label-primary); max-height: 320px; overflow: auto; }',
  '.elr-term-popover { position: fixed; z-index: 127; box-sizing: border-box; display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); box-shadow: 0 10px 28px rgba(0,0,0,.25); font-size: 12px; }',
  '.elr-term-popover:focus { outline: none; }',
  '.elr-term-popover::before { content: ""; position: absolute; z-index: 2; width: 8px; height: 8px; background: var(--dsw-alias-bg-overlay); border: 0 solid var(--dsw-alias-border-l2); pointer-events: none; }',
  '.elr-term-popover[data-side="left"]::before { right: -5px; top: var(--elr-term-arrow); transform: translateY(-50%) rotate(45deg); border-width: 1px 1px 0 0; }',
  '.elr-term-popover[data-side="right"]::before { left: -5px; top: var(--elr-term-arrow); transform: translateY(-50%) rotate(45deg); border-width: 0 0 1px 1px; }',
  '.elr-term-popover[data-side="above"]::before { bottom: -5px; left: var(--elr-term-arrow); transform: translateX(-50%) rotate(45deg); border-width: 0 1px 1px 0; }',
  '.elr-term-popover[data-side="below"]::before { top: -5px; left: var(--elr-term-arrow); transform: translateX(-50%) rotate(45deg); border-width: 1px 0 0 1px; }',
  '.elr-term-popover-surface { display: flex; flex-direction: column; min-height: 0; overflow: hidden; border-radius: inherit; }',
  '.elr-term-popover-head { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 8px 5px 11px; border-bottom: 1px solid var(--dsw-alias-border-l1); }',
  '.elr-term-popover-head strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.elr-term-popover-body { min-height: 0; overflow: auto; overscroll-behavior: contain; margin-inline: 5px; padding: 7px 6px 11px; overflow-wrap: anywhere; scrollbar-gutter: stable; }',
  '.elr-term-popover-body:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }',
  '.elr-term-toggle[aria-haspopup="dialog"][aria-expanded="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }',
  // ---- v5 (#3): dock the reading side pane right or bottom ----
  '.elr-body.dock-bottom { flex-direction: column; }',
  '.elr-body.dock-bottom .elr-main { width: 100%; }',
  '.elr-body.dock-bottom .elr-side { flex: 0 0 auto; width: 100% !important; max-width: none; min-height: ' + SIDE_H_MIN + 'px; max-height: max(' + SIDE_H_MIN + 'px, calc(100% - ' + (BOTTOM_READER_MIN_H + PANE_DIVIDER_SIZE) + 'px)); border-left: none; border-top: 1px solid var(--dsw-alias-border-l1); }',
  '.elr-body.dock-bottom .elr-pdf-wrap { min-height: 0; }',
  // ---- v25 #3: docked at the bottom, the side panel is WIDE and SHORT, so its
  // three blocks (selection sections / tabs+analysis) go side by side instead of
  // stacking; the old vertical splitter becomes a vertical divider.
  '.elr-body.dock-bottom .elr-side { flex-direction: row; }',
  '.elr-body.dock-bottom .elr-side > .elr-side-col { flex: 1 1 0; min-width: 0; }',
  // (v25 #3) Side by side, the three sections share one row.
  // (v32 #1) `wrap` was removed: per-card width dragging only reads as "side by
  // side" when the cards cannot wrap onto a second line. The row scrolls
  // horizontally instead, which is what a manual width implies.
  // (v32b #1) The header row is now OUTSIDE the scroller: `.elr-side-top`
  // stacks the header above `.elr-side-body`, so the
  // 「功能栏 · ⚙」 row stays pinned to the top in both docks.
  '.elr-body.dock-bottom .elr-side-top { display: flex; flex-direction: column; flex-wrap: nowrap; align-items: stretch; overflow: hidden; }',
  '.elr-body.dock-bottom .elr-side-top > .elr-col-head { display: none; }',
  // (v27) …except the card column's header, which owns the ⚙ card manager: a
  // hidden header would make the manager unreachable exactly where the cards are
  // laid out side by side.
  '.elr-body.dock-bottom .elr-side-top > .elr-col-head.elr-card-head { display: flex; flex: 0 0 auto; box-sizing: border-box; padding: 4px 10px 6px; border-bottom: none; }',
  '.elr-body.dock-bottom [data-elr-docked-card] > :first-child { flex-direction: row; min-width: 0; }',
  '.elr-body.dock-bottom [data-elr-docked-card] .elr-function-head { flex: 0 0 ' + (CARD_HEADER_HEIGHT - 2) + 'px; height: auto; min-height: 0; padding: 6px; }',
  '.elr-body.dock-bottom [data-elr-docked-card] .elr-card-toggle { width: 100%; height: 100%; padding: 6px; }',
  '.elr-body.dock-bottom [data-elr-docked-card] .elr-card-label { writing-mode: vertical-rl; }',
  // (v32b #2) The per-card width handles. They exist in BOTH docks — the right
  // dock treats them as "resize the card column", the bottom dock as "resize
  // this card". The previous build only had a 5px right-hand strip, docked-bottom
  // only, and hid the last card's, so neither edge ever responded.
  //
  // They sit INSIDE the card's border box (`left: 0` / `right: 0`) on purpose:
  // `.elr-sec` is `overflow: hidden`, so a handle hanging outside the box would
  // be clipped away — and a clipped handle cannot be grabbed. `z-index: 3` keeps
  // them above the card body; the card itself is not `draggable` (only its ⠿
  // head is), so a pointerdown here cannot start a native drag.
  '.elr-card-rz { position: absolute; top: 10px; bottom: 10px; width: 8px; cursor: col-resize; background: transparent; touch-action: none; z-index: 3; border-radius: 999px; }',
  '.elr-card-rz.is-right { right: 0; }',
  '.elr-card-rz.is-left { left: 0; }',
  '.elr-card-rz::before { content: ""; position: absolute; top: 6px; bottom: 6px; width: 2.5px; border-radius: 999px; background: var(--dsw-alias-brand-primary); opacity: 0; box-shadow: 0 0 8px color-mix(in srgb, var(--dsw-alias-brand-primary) 54%, transparent); transition: opacity var(--duration-feedback) var(--ease-out), transform var(--duration-feedback) var(--ease-out); transform: scaleY(.72); pointer-events: none; }',
  '.elr-card-rz::after { content: ""; position: absolute; inset: 0; border-radius: 999px; opacity: 0; transition: opacity var(--duration-feedback) var(--ease-out); pointer-events: none; }',
  '.elr-card-rz.is-right::before { right: 0; }',
  '.elr-card-rz.is-left::before { left: 0; }',
  '.elr-card-rz.is-right::after { background: radial-gradient(ellipse at 100% 50%, color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent), transparent 78%); }',
  '.elr-card-rz.is-left::after { background: radial-gradient(ellipse at 0% 50%, color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent), transparent 78%); }',
  '.elr-card-rz:is(:hover, :active, .is-resizing)::before { opacity: .94; transform: scaleY(1); }',
  '.elr-card-rz:is(:hover, :active, .is-resizing)::after { opacity: 1; }',
  '.elr-card-rz.is-resizing::before { opacity: 1; }',
  // (v38 #1) Bottom edge handle — right/left dock only, where the cards are stacked
  // and each one can have its own height.
  '.elr-card-rz.is-bottom { top: auto; bottom: 0; left: 10px; right: 10px; width: auto; height: 8px; cursor: row-resize; border-radius: 999px; }',
  '.elr-card-rz.is-bottom::before { top: auto; bottom: 0; left: 6px; right: 6px; width: auto; height: 2.5px; transform: scaleX(.72); }',
  '.elr-card-rz.is-bottom::after { background: radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent), transparent 78%); }',
  '.elr-card-rz.is-bottom:is(:hover, :active, .is-resizing)::before { opacity: .94; transform: scaleX(1); }',
  '.elr-card-rz.is-bottom.is-resizing::before { opacity: 1; }',
  '.elr-recent-name { cursor: pointer; }',
  '.elr-recent-item.current { border-color: var(--dsw-alias-brand-primary); }',
  '.elr-recent-item.current .elr-recent-name { color: var(--dsw-alias-brand-primary); font-weight: 600; }',
  // ---- v8 #3: formula explanation card ----
  '.elr-formula-card { position: fixed; z-index: 126; display: flex; flex-direction: column; padding: 9px 11px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); box-shadow: 0 12px 32px rgba(0,0,0,.3); font-size: 12px; }',
  '.elr-formula-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--dsw-alias-label-secondary); font-size: 11px; cursor: move; user-select: none; }',
  '.elr-formula-src { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; padding: 6px 8px; margin-bottom: 8px; max-height: 84px; overflow: auto; white-space: pre-wrap; word-break: break-word; }',
  '.elr-formula-render { flex: 0 0 auto; max-height: 30vh; overflow: auto; padding: 8px 10px; margin-bottom: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-layer-1); }',
  '.elr-formula-body { flex: 1 1 auto; min-height: 60px; overflow: auto; line-height: 1.7; white-space: normal; }',
  // ---- v8 #6/#7 rule definitions live with the rest of the layout above ----
  // ---- v4: minimize chip ----
  // (v44 #1) The chip belonged to the removed launcher overlay (it was the
  // "expand" button of the minimized full-screen reader), so it is gone too.
  // ---- v19 #4: three-pages-across reading mode (reworked in v20 #2) ----
  // pdf.js only knows NONE/ODD/EVEN (1 or 2 pages per row), so "three up" is a
  // grid laid over the normal single-page flow: nothing is re-parented, so pdf.js
  // can never undo it.
  // (v20 #2) The columns are `max-content`, NOT `1fr`: a `1fr` column only caps the
  // COLUMN, while the page box keeps its own scaled width, so at a large zoom the
  // page simply overflowed its column and painted over its neighbour. Sizing each
  // column to its page means the pages can never overlap — when three of them no
  // longer fit, the container scrolls horizontally instead, exactly like pdf.js's
  // own two-page spread does.
  '.elr-pdf-container.elr-three .pdfViewer { display: grid; grid-template-columns: repeat(3, max-content); column-gap: 12px; row-gap: 12px; justify-content: start; align-items: start; width: max-content; margin: 0 auto; padding: 10px; }',
  '.elr-pdf-container.elr-three .pdfViewer .page { margin: 0 auto; }',
  // ---- v20 #3: zoom percentage control ----
  // (v28 #3) The number field types an arbitrary percentage; the preset list is
  // a visible <select> beside it. The native spinner arrows are suppressed
  // because 缩小 / 放大 already sit immediately to their left.
  // (v28 #3, revised) ONE control: a text field with a caret that opens the
  // preset list. Typing a value and picking a preset are the same widget, so the
  // toolbar no longer shows a separate input plus a separate <select>. `zoomDraft`
  // still buffers keystrokes so typing "1" on the way to "150" does not jump to
  // 25 %. A `<select>` cannot do this — its value is always one of its options.
  // (v30 #2) The box used to be sized by its children, so it came out visibly
  // SHORTER than the `.elr-btn` beside it (input padding 3px, caret 9px glyph).
  // A fixed height matching `.elr-btn` (6px padding + 1px border + 12px text
  // ≈ 28px) plus `stretch` children makes the three parts one flush block.
  '.elr-zoom { position: relative; display: inline-flex; align-items: stretch; height: 28px; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; background: var(--dsw-alias-bg-base); }',
  '.elr-zoom.open, .elr-zoom:focus-within { border-color: var(--dsw-alias-brand-primary); }',
  '.elr-zoom-input { width: 46px; height: 100%; box-sizing: border-box; padding: 0 1px 0 8px; border: none; outline: none; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; text-align: right; -moz-appearance: textfield; appearance: textfield; }',
  '.elr-zoom-input::-webkit-outer-spin-button, .elr-zoom-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }',
  '.elr-zoom-suffix { display: flex; align-items: center; padding-right: 1px; font-size: 12px; color: var(--dsw-alias-label-secondary); }',
  // Equal padding on both sides of the caret keeps the ▾ visually centred in
  // its own hit area; the right radius stops the hover fill from squaring off
  // the container's corner.
  '.elr-zoom-caret { display: flex; align-items: center; justify-content: center; height: 100%; box-sizing: border-box; border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 9px; line-height: 1; padding: 0 7px; border-radius: 0 6px 6px 0; }',
  '.elr-zoom-caret:hover:not(:disabled) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }',
  '.elr-zoom-caret:disabled { opacity: .45; cursor: default; }',
  // (v30 #3) The menu is glued to the container on BOTH sides (`left`/`right`
  // -1px so it lines up with the container's own 1px border) instead of a
  // `min-width` — the preset list is now exactly as wide as the zoom field.
  // Each item centres its number so the column of percentages is symmetric.
  '.elr-zoom-menu { position: fixed; inset: auto; margin: 4px 0; position-area: block-end span-inline-end; justify-self: start; position-try-fallbacks: flip-block, flip-inline; box-sizing: border-box; min-width: 112px; padding: 4px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-overlay); box-shadow: 0 8px 22px rgba(0, 0, 0, .22); }',
  '.elr-zoom-menu:popover-open { display: flex; flex-direction: column; }',
  '.elr-zoom-item { border: none; background: transparent; color: var(--dsw-alias-label-primary); text-align: center; padding: 4px 0; border-radius: 5px; cursor: pointer; font: inherit; font-size: 12px; }',
  '.elr-zoom-item:hover { background: var(--dsw-alias-bg-layer-2); }',
  '.elr-zoom-item.active { color: var(--dsw-alias-brand-primary); font-weight: 600; }',
  // (v46) The settings widget is absolutely positioned, so its host span must
  // be its own stacking context; the panel is clamped to the viewport so it
  // cannot run off the right edge when the toolbar is narrow.
  '.elr-settings { position: relative; display: inline-flex; align-items: stretch; }',
  '.elr-settings .elr-settings-btn { display: inline-flex; align-items: center; gap: 5px; }',
  '.elr-settings-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-brand-primary); }',
  '.elr-settings-panel { position: absolute; right: 0; top: calc(100% + 6px); z-index: 40; box-sizing: border-box; width: 264px; max-width: 88vw; padding: 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-overlay); box-shadow: 0 12px 30px rgba(0, 0, 0, .26); }',
  '.elr-settings-head { padding: 4px 8px 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); }',
  '.elr-settings-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 7px; cursor: pointer; }',
  '.elr-settings-row:hover { background: var(--dsw-alias-bg-layer-2); }',
  '.elr-settings-label { flex: 1 1 auto; min-width: 0; font-size: 12px; color: var(--dsw-alias-label-primary); }',
  '.elr-settings-ctrl { flex: 0 0 auto; display: inline-flex; align-items: center; }',
  '.elr-settings-seg { display: inline-flex; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; overflow: hidden; }',
  '.elr-settings-seg .elr-seg { padding: 4px 10px; font-size: 11px; }',
  // ---- v39: in-document search box ----
  '.elr-find-input { flex: 1 1 0; width: 0; min-width: 0; height: 100%; box-sizing: border-box; padding: 0; appearance: none; border: none; outline: none; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }',
  '.elr-find-input::-webkit-search-cancel-button { display: none; }',
  '.elr-find-input::placeholder { color: var(--dsw-alias-label-secondary); }',
  '.elr-find-input:disabled { opacity: .45; }',
  '.elr-find-actions { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 1px; }',
  '.elr-find-count { padding: 0 2px; font-size: 10px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }',
  '.elr-find-count:empty { display: none; }',
  '.elr-find-btn { display: grid; place-items: center; width: 18px; height: 20px; box-sizing: border-box; padding: 0; border: none; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font: inherit; font-size: 14px; line-height: 1; }',
  '.elr-find-btn:hover:not(:disabled) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }',
  '.elr-find-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }',
  '.elr-find-btn:disabled { opacity: .4; cursor: default; }',
  '.elr-find-btn.is-prev::before, .elr-find-btn.is-next::before { content: ""; width: 5px; height: 5px; border-top: 1.25px solid currentColor; border-left: 1.25px solid currentColor; transform: translateY(1px) rotate(45deg); }',
  '.elr-find-btn.is-next::before { transform: translateY(-1px) rotate(225deg); }',
  // (v39 #1) The hit overlay sits above the page canvas next to the
  // highlight layer, but with `multiply` it tints text without hiding it.
  '.elr-find-overlay { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 4; mix-blend-mode: multiply; }',
  // ---- v21 #1 / v28 #2: bibliography column ----
  '.elr-refs-list { display: grid; gap: 9px; }',
  '.elr-ref { min-width: 0; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent); font-size: calc(12px + var(--elr-card-font-adjust, 0px)); line-height: 1.6; }',
  '.elr-ref-index { margin-inline-end: 6px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }',
  '.elr-ref-heading { overflow-wrap: anywhere; }',
  '.elr-ref-en { color: var(--dsw-alias-label-primary); font-weight: 600; overflow-wrap: anywhere; white-space: normal; }',
  '.elr-ref-zh { color: var(--dsw-alias-label-secondary); margin-top: 2px; word-break: break-word; }',
  '.elr-ref-meta { color: var(--dsw-alias-label-secondary); font-size: calc(11px + var(--elr-card-font-adjust, 0px)); }',
  '.elr-ref-link { display: block; margin-top: 3px; font-size: calc(11px + var(--elr-card-font-adjust, 0px)); color: var(--dsw-alias-brand-primary); word-break: break-all; text-decoration: none; }',
  '.elr-ref-link:hover { text-decoration: underline; }',
  '.elr-ref-missing { display: block; margin-top: 3px; font-size: calc(11px + var(--elr-card-font-adjust, 0px)); color: var(--dsw-alias-label-secondary); }',
  '.elr-refs-stage { flex: 0 0 auto; padding: 4px 12px 6px; font-size: calc(11px + var(--elr-card-font-adjust, 0px)); color: var(--dsw-alias-label-secondary); border-bottom: 1px solid var(--dsw-alias-border-l1); }',
  '.elr-analysis-card-body > .elr-col { position: relative; }',
  '.elr-card-center-status { position: absolute; inset: 0; z-index: 6; display: grid; place-items: center; padding: 16px; pointer-events: none; }',
  '.elr-card-center-box { pointer-events: auto; max-width: min(320px, 92%); display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 18px; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l2) 72%, transparent); background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 88%, transparent); backdrop-filter: blur(14px) saturate(1.25); -webkit-backdrop-filter: blur(14px) saturate(1.25); box-shadow: 0 10px 28px rgb(12 20 34 / .22); text-align: center; font-size: calc(12.5px + var(--elr-card-font-adjust, 0px)); line-height: 1.55; color: var(--dsw-alias-label-primary); }',
  '.elr-card-center-box.is-error { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 42%, transparent); }',
  '.elr-card-center-msg { color: var(--dsw-alias-label-secondary); word-break: break-word; }',
  '.elr-card-center-box.is-error .elr-card-center-msg { color: var(--dsw-alias-state-error-primary); }',
  '.elr-card-center-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; }',
  // Apple-inspired desktop surface.
  '.elr-view { font-family: inherit; letter-spacing: -.005em; background: var(--dsw-alias-bg-base); }',
  '.elr-head { min-height: 48px; box-sizing: border-box; padding: 8px 14px; background: var(--dsw-alias-bg-layer-1); border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 72%, transparent); box-shadow: 0 1px 0 rgba(255,255,255,.32), 0 4px 16px rgba(20,28,45,.035); backdrop-filter: saturate(150%) blur(18px); -webkit-backdrop-filter: saturate(150%) blur(18px); }',
  '.elr-head .elr-select, .elr-head .elr-btn, .elr-head .elr-icon-btn { min-height: 30px; border-radius: 9px; border-color: color-mix(in srgb, var(--dsw-alias-border-l2) 72%, transparent); background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 80%, transparent); transition: background-color var(--duration-feedback) var(--ease-out), border-color var(--duration-feedback) var(--ease-out), transform var(--duration-feedback) var(--ease-out), box-shadow var(--duration-feedback) var(--ease-out); }',
  '.elr-head .elr-select:hover, .elr-head .elr-btn:hover:not(:disabled), .elr-head .elr-icon-btn:hover { background: var(--dsw-alias-bg-layer-1); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 42%, var(--dsw-alias-border-l2)); box-shadow: 0 2px 8px rgba(20,28,45,.07); }',
  '.elr-head .elr-btn:active:not(:disabled), .elr-head .elr-icon-btn:active { transform: scale(.97); }',
  '.elr-head .elr-btn.active { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 64%, transparent); }',
  '.elr-body, .elr-main, .elr-side { background: var(--dsw-alias-bg-base); }',
  '.elr-toolbar { min-height: 44px; box-sizing: border-box; padding: 7px 12px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 88%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 75%, transparent); backdrop-filter: saturate(150%) blur(16px); -webkit-backdrop-filter: saturate(150%) blur(16px); }',
  '.elr-toolbar .elr-btn, .elr-toolbar .elr-select, .elr-toolbar .elr-icon-btn { min-height: 30px; border-radius: 9px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 76%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-border-l2) 65%, transparent); transition: background-color var(--duration-feedback) var(--ease-out), border-color var(--duration-feedback) var(--ease-out), transform var(--duration-feedback) var(--ease-out), box-shadow var(--duration-feedback) var(--ease-out); }',
  '.elr-toolbar .elr-btn:hover:not(:disabled), .elr-toolbar .elr-select:hover, .elr-toolbar .elr-icon-btn:hover { background: var(--dsw-alias-bg-layer-1); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l2)); box-shadow: 0 2px 9px rgba(20,28,45,.06); }',
  '.elr-toolbar .elr-btn:active:not(:disabled), .elr-toolbar .elr-icon-btn:active { transform: scale(.97); }',
  '.elr-toolbar { position: relative; z-index: 200; isolation: isolate; }',
  '.elr-toolbar .elr-settings { position: relative; z-index: 260; }',
  '.elr-toolbar .elr-btn.active, .elr-toolbar .elr-btn.primary { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 64%, transparent); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, var(--dsw-alias-bg-layer-1)); box-shadow: none; }',
  '.elr-segment { padding: 2px; gap: 2px; border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 72%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 86%, transparent); }',
  '.elr-seg { border-radius: 8px; padding: 5px 11px; }',
  '.elr-seg + .elr-seg { border-left: 0; }',
  '.elr-seg.active { color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-1); box-shadow: 0 1px 4px rgba(20,28,45,.10); }',
  '.elr-side-body { gap: 10px; padding: 0 11px 11px; }',
  '.elr-sec { border-color: color-mix(in srgb, var(--dsw-alias-border-l1) 83%, transparent); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); box-shadow: 0 1px 1px rgba(20,28,45,.025), 0 6px 18px rgb(12 20 34 / .14); }',
  '.elr-body:not(.dock-bottom) .elr-sec:hover:not(.over) { box-shadow: 0 4px 8px rgb(12 20 34 / .12), 0 8px 20px rgb(12 20 34 / .13); }',
  '.elr-card-control { border-radius: 8px; transition: background-color var(--duration-feedback) var(--ease-out), transform var(--duration-feedback) var(--ease-out); }',
  '.elr-card-control:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }',
  '.elr-card-control:active { transform: scale(.92); }',
  '.elr-tabs { gap: 3px; padding: 8px 12px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 86%, transparent); border-bottom-color: color-mix(in srgb, var(--dsw-alias-border-l1) 72%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }',
  '.elr-tab { border-radius: 9px; padding: 7px 12px; border-bottom: 0; transition: background-color var(--duration-feedback) var(--ease-out), color var(--duration-feedback) var(--ease-out), transform var(--duration-feedback) var(--ease-out); }',
  '.elr-tab:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); color: var(--dsw-alias-brand-primary); }',
  '.elr-tab.active { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 11%, var(--dsw-alias-bg-layer-1)); border-bottom: 0; font-weight: 650; }',
  '.elr-tab:active { transform: scale(.97); }',
  '.elr-input, .elr-out { padding: 20px clamp(18px, 3vw, 34px); line-height: 1.78; background: color-mix(in srgb, var(--dsw-alias-bg-base) 92%, transparent); }',
  '.elr-popup-head { min-height: 40px; padding-inline: 12px; border-bottom-color: color-mix(in srgb, var(--dsw-alias-border-l1) 72%, transparent); }',
  '.elr-popup .elr-btn, .elr-popup .elr-icon-btn { border-radius: 8px; }',
  '.elr-sel-edit, .elr-sel-text { border-color: color-mix(in srgb, var(--dsw-alias-border-l1) 80%, transparent); border-radius: var(--elr-card-content-radius); background: var(--elr-card-content-bg); }',
  '.elr-figure-entry, .elr-ref-entry { border-radius: 12px; border-color: color-mix(in srgb, var(--dsw-alias-border-l1) 82%, transparent); background: color-mix(in srgb, var(--dsw-alias-bg-base) 56%, transparent); box-shadow: 0 2px 10px rgba(20,28,45,.04); }',
  '.elr-figure-entry[data-kind="formula"] .elr-figure-entry-toggle { font-variant-numeric: tabular-nums; }',
  '.elr-figure-entry-toggle > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.elr-figure-entry .elr-formula-render { padding-block: 0 5px; overflow: auto; }',
  '.elr-pdf-wrap { background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 84%, transparent); }',
  '.elr-view :is(button, select, input, textarea):focus-visible { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 72%, transparent); outline-offset: 2px; }',
  '.elr-view :is(button, .elr-btn, .elr-tab, .elr-seg, .elr-icon-btn) { -webkit-tap-highlight-color: transparent; }',
  '@media (prefers-reduced-motion: reduce) { .elr-view :is(.elr-head .elr-btn, .elr-head .elr-icon-btn, .elr-toolbar .elr-btn, .elr-toolbar .elr-icon-btn, .elr-card-control, .elr-tab):active { transform: none; } .elr-selection-tools button:active:not(:disabled) { scale: none; } }',
  // Final readability and layering fixes for the Apple-style surface.
  '.settings { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); box-shadow: 0 20px 60px rgba(15,23,42,.22); }',
  '.settings:is(.model-center,.connection-detail)::backdrop { background: var(--elr-glass-scrim); backdrop-filter: blur(8px); }',
  '.settings .model-center-header, .settings .connection-detail-header { background: transparent; border-bottom-color: var(--dsw-alias-border-l1); }',
  '.settings .connection-card, .settings .subscription-card, .settings .account-settings, .settings .advanced-config { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l1); }',
  '.settings .connection-card:hover, .settings .subscription-card summary:hover { background: var(--dsw-alias-bg-layer-2); }',
  '.settings :is(input, select, textarea, button) { opacity: 1; pointer-events: auto; }',
  '.settings .model-center-pane, .settings .connection-detail-body { background: transparent; }',
  '.elr-floating-card .elr-card-content, .elr-floating-card .elr-selection-content { color: var(--dsw-alias-label-primary); }',
  '.elr-floating-card .elr-card-toggle, .elr-floating-card .elr-card-label, .elr-floating-card .elr-col-head { color: var(--dsw-alias-label-primary); }',
  '.elr-settings { position: relative; z-index: 80; }',
  '.elr-settings-panel { position: absolute; top: calc(100% + 6px); right: auto; left: 0; z-index: 1000 !important; width: 300px; max-width: calc(100vw - 16px); max-height: min(520px, calc(100vh - 84px)); overflow: auto; box-sizing: border-box; padding: 8px; color: var(--dsw-alias-label-primary); pointer-events: auto; }',
  '.elr-settings-panel .elr-settings-row { color: var(--dsw-alias-label-primary); min-height: 34px; }',
  '.elr-settings-panel .elr-settings-row:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, var(--dsw-alias-bg-layer-2)); }',
  '.elr-settings-panel .elr-settings-head { color: var(--dsw-alias-label-secondary); padding: 6px 9px 9px; }',
  '.elr-settings-panel .elr-select, .elr-settings-panel .elr-settings-seg { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l1); }',
  '.elr-settings-panel .elr-settings-seg .elr-seg { color: var(--dsw-alias-label-secondary); background: transparent; }',
  '.elr-settings-panel .elr-settings-seg .elr-seg.active { color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-1); }',
  '.elr-zoom-menu, .elr-card-menu { max-height: min(420px, calc(100vh - 84px)); overflow: auto; pointer-events: auto; background: var(--dsw-alias-bg-layer-1); opacity: 1; }',
  '.settings:is(.model-center,.connection-detail)[open] { --elr-frosted-fill: var(--elr-glass-dialog-fill); --elr-frosted-blur: var(--elr-glass-floating-blur); border-color: transparent; border-radius: 16px; background: var(--elr-frosted-background); backdrop-filter: var(--elr-frosted-filter); box-shadow: var(--elr-frosted-rim), 0 16px 44px rgb(12 20 34 / .23); }',
  '.settings.connection-detail[open] { --elr-frosted-fill: var(--elr-glass-floating-fill); }',
  '.elr-settings-panel, .elr-card-menu, .elr-note-bubble { --elr-frosted-fill: var(--elr-glass-floating-fill); --elr-frosted-blur: var(--elr-glass-floating-blur); background: var(--elr-frosted-background); border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l2) 58%, transparent); border-radius: 16px; backdrop-filter: var(--elr-frosted-filter); box-shadow: var(--elr-frosted-rim), 0 12px 34px rgb(12 20 34 / .20); }',
  '.elr-popup .elr-popup-block-original { background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 22%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-border-l1) 70%, transparent); transition: background-color .18s var(--ease-out), border-color .18s var(--ease-out); }',
  '.elr-popup .elr-popup-block-original:focus-within { background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 30%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 52%, var(--dsw-alias-border-l2)); }',
  '.elr-popup .elr-popup-block-result { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-border-l1) 70%, transparent); }',
  '.elr-popup.is-frosted-blocks .elr-popup-block-original { background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 88%, transparent); backdrop-filter: blur(18px) saturate(1.35); -webkit-backdrop-filter: blur(18px) saturate(1.35); border-color: color-mix(in srgb, var(--dsw-alias-border-l2) 55%, transparent); box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent); }',
  '.elr-popup.is-frosted-blocks .elr-popup-block-original:focus-within { background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 92%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 58%, var(--dsw-alias-border-l2)); }',
  '.elr-popup.is-frosted-blocks .elr-popup-block-result { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, color-mix(in srgb, var(--dsw-alias-bg-layer-1) 88%, transparent)); backdrop-filter: blur(18px) saturate(1.35); -webkit-backdrop-filter: blur(18px) saturate(1.35); border-color: color-mix(in srgb, var(--dsw-alias-border-l2) 55%, transparent); box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent); }',
  '.elr-selection-tools { position: fixed; z-index: 124; box-sizing: border-box; height: ' + SELECTION_TOOL_HEIGHT + 'px; display: flex; align-items: center; justify-content: center; gap: 3px; padding-inline: 7px; border-radius: 999px; color: var(--dsw-alias-label-primary); user-select: none; }',
  '.elr-selection-tools button { flex: 0 1 30px; display: grid; place-items: center; min-width: 0; height: 30px; padding: 0; border: 0; border-radius: 50%; color: inherit; background: transparent; cursor: pointer; }',
  '.elr-selection-tools button:hover, .elr-selection-tools button[aria-pressed="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); }',
  '.elr-selection-tools button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }',
  '.elr-selection-tools button:active:not(:disabled) { scale: .92; }',
  '.elr-selection-tools button:disabled { opacity: .45; cursor: default; }',
  '.elr-selection-tools .elr-selection-swatch { flex-basis: 26px; }',
  '.elr-selection-swatch span { width: 16px; height: 16px; box-sizing: border-box; border: 1px solid rgba(0,0,0,.14); border-radius: 50%; background: var(--elr-swatch); }',
  '.elr-selection-tools svg { width: 18px; height: 18px; }',
  '.elr-selection-divider { flex: 0 0 1px; height: 18px; margin-inline: 2px; background: var(--dsw-alias-border-l2); }',
  '.elr-mark-badge::before { background: var(--elr-mark-swatch, currentColor); }',
  '@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { .settings:is(.model-center,.connection-detail)[open], .elr-settings-panel, .elr-card-menu, .elr-note-bubble { background: var(--dsw-alias-bg-layer-1); backdrop-filter: none; } }',
  '.elr-feature-workspace { position: relative; flex: 1 1 auto; min-height: 0; height: 100%; overflow: hidden; background: radial-gradient(ellipse at 82% 6%, var(--elr-duo-side-ambient, var(--elr-glass-ambient)), transparent 72%), radial-gradient(ellipse at 14% 85%, var(--elr-workspace-reflection, var(--elr-glass-bounce)), transparent 69%), var(--elr-duo-side, var(--dsw-alias-bg-base)); }',
  '.elr-card-head.elr-workspace-head { position: absolute; inset: 0 0 auto 0; z-index: 6; box-sizing: border-box; min-height: ' + BOTTOM_DOCK_HEAD_H + 'px; margin-bottom: 0; padding: 9px 12px 10px; background: transparent; container-type: inline-size; isolation: isolate; }',
  '.elr-card-head.elr-workspace-head::before { content: ""; position: absolute; inset: 0 0 -18px 0; z-index: -1; pointer-events: none; background: linear-gradient(180deg, color-mix(in srgb, var(--elr-duo-side, var(--dsw-alias-bg-base)) 82%, transparent) 0%, color-mix(in srgb, var(--elr-duo-side, var(--dsw-alias-bg-base)) 46%, transparent) 58%, transparent 100%); }',
  '@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { .elr-card-head.elr-workspace-head::before { background: linear-gradient(180deg, var(--elr-duo-side, var(--dsw-alias-bg-base)) 68%, transparent 100%); backdrop-filter: none; -webkit-backdrop-filter: none; } }',
  '.elr-card-font-menu > label { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; font-size: 12px; }',
  '.elr-card-font-menu output { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }',
  '.elr-card-font-menu input { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: var(--dsw-alias-brand-primary); }',
  '.elr-card-font-menu > button { justify-self: start; }',
  '.elr-reader-options.elr-theme-menu { width: min(304px, calc(100vw - 20px)); max-height: min(500px, calc(100vh - 20px)); overflow: auto; padding: 10px; gap: 10px; }',
  '.elr-theme-menu-group { display: grid; gap: 6px; }',
  '.elr-theme-menu-label { font-size: 11.5px; font-weight: 600; color: var(--dsw-alias-label-secondary); }',
  '.elr-theme-menu-sublabel { font-size: 11px; color: var(--dsw-alias-label-secondary); opacity: .85; margin-top: 2px; }',
  '.elr-theme-chip-grid { display: flex; flex-wrap: wrap; gap: 5px; }',
  '.elr-theme-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 60%, transparent); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; transition: border-color .15s var(--ease-out), background-color .15s var(--ease-out), color .15s var(--ease-out); }',
  '.elr-theme-chip:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, var(--dsw-alias-bg-layer-1)); }',
  '.elr-theme-chip[aria-pressed="true"] { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-brand-primary); font-weight: 600; }',
  '.elr-theme-chip:disabled { opacity: .45; cursor: default; }',
  '.elr-theme-swatch { width: 11px; height: 11px; flex: 0 0 11px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 24%, transparent); background: var(--elr-swatch, var(--dsw-alias-bg-layer-1)); }',
  '.elr-album-card { position: relative; display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; overflow: hidden; }',
  '.elr-album-card .elr-function-head { position: relative; z-index: 4; transition: transform 220ms var(--ease-out), opacity 180ms var(--ease-out); }',
  '.elr-album-card.has-photos .elr-function-head { position: absolute; inset: 0 0 auto 0; background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-bg-layer-1) 92%, transparent) 0%, color-mix(in srgb, var(--dsw-alias-bg-layer-1) 62%, transparent) 72%, transparent 100%); }',
  '.elr-album-card.has-photos.is-head-hidden .elr-function-head { transform: translateY(-100%); opacity: 0; pointer-events: none; transition-timing-function: var(--ease-in); }',
  '.elr-body.dock-bottom [data-elr-docked-card="album"] > .elr-album-card { flex-direction: row; }',
  '.elr-body.dock-bottom [data-elr-docked-card="album"] > .elr-album-card.has-photos .elr-function-head { inset: 0 auto 0 0; width: ' + (CARD_HEADER_HEIGHT - 2) + 'px; height: auto; min-height: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--dsw-alias-bg-layer-1) 88%, transparent) 0%, color-mix(in srgb, var(--dsw-alias-bg-layer-1) 52%, transparent) 72%, transparent 100%); }',
  '.elr-body.dock-bottom [data-elr-docked-card="album"] > .elr-album-card.has-photos.is-head-hidden .elr-function-head { transform: translateX(-100%); }',
  '.elr-body.dock-bottom [data-elr-docked-card="album"] > .elr-album-card.has-photos:not(.is-head-hidden) .elr-album-hud { left: ' + (CARD_HEADER_HEIGHT + 4) + 'px; }',
  '.elr-settings-range { flex: 1 1 auto; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px; }',
  '.elr-settings-range input { width: 100%; min-width: 0; margin: 0; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }',
  '.elr-settings-range output { min-width: 3ch; text-align: end; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); }',
  '.elr-album-picker-backdrop { position: fixed; inset: 0; z-index: 420; display: grid; place-items: center; padding: 20px; background: rgb(10 14 22 / .44); backdrop-filter: blur(4px); }',
  '.elr-album-picker { width: min(740px, 100%); max-height: min(620px, calc(100vh - 48px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l2) 70%, transparent); border-radius: 18px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 22px 54px rgb(8 12 20 / .34); }',
  '.elr-album-picker-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); }',
  '.elr-album-picker-title { margin: 0; font-size: 15px; font-weight: 650; }',
  '.elr-album-picker-path { flex: 1 1 auto; min-width: 0; font-size: 12px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.elr-album-picker-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 16px; font-size: 12px; color: var(--dsw-alias-label-secondary); border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 60%, transparent); }',
  '.elr-album-picker-grid { flex: 1 1 auto; min-height: 180px; overflow: auto; padding: 14px 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 10px; align-content: start; }',
  '.elr-album-thumb { position: relative; display: flex; flex-direction: column; gap: 5px; padding: 5px; border: 1.5px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-2); color: inherit; font: inherit; text-align: start; cursor: pointer; transition: border-color .15s var(--ease-out), background-color .15s var(--ease-out), transform .15s var(--ease-out); }',
  '.elr-album-thumb:hover { border-color: var(--dsw-alias-border-l2); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, var(--dsw-alias-bg-layer-2)); }',
  '.elr-album-thumb[aria-pressed="true"] { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, var(--dsw-alias-bg-layer-1)); }',
  '.elr-album-thumb-img { width: 100%; aspect-ratio: 4 / 3; border-radius: 8px; object-fit: cover; display: block; background: var(--dsw-alias-bg-base); }',
  '.elr-album-thumb-name { font-size: 11px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.elr-album-thumb[aria-pressed="true"] .elr-album-thumb-name { color: var(--dsw-alias-brand-primary); font-weight: 600; }',
  '.elr-album-thumb-check { position: absolute; top: 10px; right: 10px; width: 20px; height: 20px; border-radius: 999px; display: grid; place-items: center; font-size: 11px; font-weight: 700; border: 1.5px solid rgb(255 255 255 / .85); background: rgb(16 20 28 / .45); color: transparent; }',
  '.elr-album-thumb[aria-pressed="true"] .elr-album-thumb-check { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }',
  '.elr-album-picker-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 16px; border-top: 1px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 55%, transparent); }',
  '.elr-album-picker-foot-hint { font-size: 12px; color: var(--dsw-alias-label-secondary); }',
  '.elr-album-picker-actions { display: flex; align-items: center; gap: 8px; }',
  '.elr-ambient-card { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; overflow: hidden; }',
  '.elr-ambient-body { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; gap: 7px; margin: 0 var(--elr-card-inset) var(--elr-card-inset) var(--elr-card-leading); padding: var(--elr-card-content-gap); border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--elr-card-content-radius); background: var(--elr-card-content-bg); overflow: hidden; }',
  '.elr-ambient-source { display: flex; align-items: center; gap: 5px; min-width: 0; flex: 0 0 auto; }',
  '.elr-ambient-source-name { flex: 1 1 auto; min-width: 0; font-size: 11.5px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.elr-ambient-source .elr-btn { padding: 3px 8px; font-size: 11.5px; flex: 0 0 auto; }',
  '.elr-ambient-search { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 3px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }',
  '.elr-ambient-search input { flex: 1 1 auto; min-width: 0; border: 0; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; outline: none; }',
  '.elr-ambient-cats { flex: 0 0 auto; display: flex; gap: 4px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }',
  '.elr-ambient-cats::-webkit-scrollbar { display: none; }',
  '.elr-ambient-cat { flex: 0 0 auto; padding: 3px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; cursor: pointer; white-space: nowrap; }',
  '.elr-ambient-cat[aria-pressed="true"] { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-brand-primary); font-weight: 600; }',
  '.elr-ambient-grid { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 6px; align-content: start; padding-right: 2px; }',
  '.elr-ambient-tile { display: flex; flex-direction: column; gap: 5px; padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); transition: border-color .15s var(--ease-out), background-color .15s var(--ease-out); }',
  '.elr-ambient-tile:hover { border-color: var(--dsw-alias-border-l2); }',
  '.elr-ambient-tile.is-active { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 11%, var(--dsw-alias-bg-layer-1)); }',
  '.elr-ambient-track { display: flex; align-items: center; gap: 6px; width: 100%; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: calc(12px + var(--elr-card-font-adjust, 0px)); text-align: start; cursor: pointer; }',
  '.elr-ambient-tile.is-active .elr-ambient-track { color: var(--dsw-alias-brand-primary); font-weight: 600; }',
  '.elr-ambient-track-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.elr-ambient-dot { width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: var(--dsw-alias-brand-primary); opacity: 0; }',
  '.elr-ambient-tile.is-playing .elr-ambient-dot { opacity: 1; animation: elr-ambient-pulse 1.5s var(--ease-in-out) infinite; }',
  '.elr-ambient-tile-vol { display: flex; align-items: center; gap: 5px; }',
  '.elr-ambient-tile-vol input { flex: 1 1 auto; min-width: 0; margin: 0; height: 4px; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }',
  '.elr-ambient-tile-vol span { font-size: 10.5px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; min-width: 3ch; text-align: end; }',
  '@keyframes elr-ambient-pulse { 0%, 100% { transform: scale(.85); opacity: .65; } 50% { transform: scale(1.25); opacity: 1; } }',
  '.elr-ambient-controls { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding-top: 6px; border-top: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 70%, transparent); }',
  '.elr-ambient-play { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border: 1px solid var(--dsw-alias-brand-primary); border-radius: 999px; background: var(--dsw-alias-brand-primary); color: #fff; font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; }',
  '.elr-ambient-play:disabled { opacity: .45; cursor: default; }',
  '.elr-ambient-mode { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 11.5px; cursor: pointer; }',
  '.elr-ambient-mode:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }',
  '.elr-ambient-mode:disabled { opacity: .45; cursor: default; }',
  '.elr-ambient-vol { flex: 1 1 82px; min-width: 68px; display: inline-flex; align-items: center; gap: 4px; color: var(--dsw-alias-label-secondary); font-size: 11px; }',
  '.elr-ambient-vol input { flex: 1 1 auto; min-width: 40px; margin: 0; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }',
  '.elr-ambient-vol output { min-width: 3.4ch; text-align: end; font-variant-numeric: tabular-nums; }',
  '.elr-ambient-presets { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 6px; padding-right: 2px; }',
  '.elr-ambient-preset { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); transition: border-color .15s var(--ease-out), background-color .15s var(--ease-out); }',
  '.elr-ambient-preset:hover { border-color: var(--dsw-alias-border-l2); }',
  '.elr-ambient-preset.is-active { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 11%, var(--dsw-alias-bg-layer-1)); }',
  '.elr-ambient-preset-apply { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; }',
  '.elr-ambient-preset-name { width: 100%; font-size: calc(12px + var(--elr-card-font-adjust, 0px)); font-weight: 600; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.elr-ambient-preset.is-active .elr-ambient-preset-name { color: var(--dsw-alias-brand-primary); }',
  '.elr-ambient-preset-meta { width: 100%; font-size: 11px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.elr-ambient-preset-edit { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 5px; }',
  '.elr-ambient-preset-edit input { flex: 1 1 auto; min-width: 0; padding: 3px 7px; border: 1px solid var(--dsw-alias-brand-primary); border-radius: 6px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; outline: none; }',
  '.elr-ambient-preset-actions { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; }',
  '.elr-ambient-preset-btn { width: 24px; height: 24px; padding: 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); display: grid; place-items: center; cursor: pointer; }',
  '.elr-ambient-preset-btn:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }',
  '.elr-ambient-preset-btn.is-danger:hover { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 50%, transparent); }',
  '@media (prefers-reduced-motion: reduce) { .elr-ambient-tile.is-playing .elr-ambient-dot { animation: none; } }',
  '.elr-album-empty { margin: 0 var(--elr-card-inset) var(--elr-card-inset) var(--elr-card-leading); padding: var(--elr-card-content-gap); border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--elr-card-content-radius); background: var(--elr-card-content-bg); flex: 1 1 auto; min-height: 0; display: grid; place-items: center; }',
  '.elr-album-stage { position: relative; flex: 1 1 auto; min-height: 0; margin: 0 var(--elr-card-inset) var(--elr-card-inset) var(--elr-card-leading); border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--elr-card-content-radius); background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 72%, transparent); overflow: hidden; cursor: pointer; contain: layout paint; }',
  '.elr-album-card.has-photos .elr-album-stage { margin: 0; border: 0; border-radius: 0; }',
  '.elr-album-photo { position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover; user-select: none; }',
  '.elr-album-photo.is-entering { opacity: 0; pointer-events: none; z-index: 2; }',
  '.elr-album-photo.is-visible { opacity: 1; z-index: 1; }',
  '.elr-album-photo.is-leaving { z-index: 1; pointer-events: none; will-change: opacity, transform, filter; animation-fill-mode: both; }',
  '.elr-album-photo.is-entering-active { z-index: 2; will-change: opacity, transform, filter, clip-path; animation-fill-mode: both; }',
  '.elr-album-stage[data-transition="fade"] .elr-album-photo.is-entering-active { animation: elr-album-fade-in 520ms cubic-bezier(.4, 0, .2, 1) both; }',
  '.elr-album-stage[data-transition="fade"] .elr-album-photo.is-leaving { animation: elr-album-fade-out 520ms cubic-bezier(.4, 0, .2, 1) both; }',
  '.elr-album-stage[data-transition="ken-burns"] .elr-album-photo.is-entering-active { animation: elr-album-kb-in 780ms cubic-bezier(.22, 1, .36, 1) both; }',
  '.elr-album-stage[data-transition="ken-burns"] .elr-album-photo.is-leaving { animation: elr-album-kb-out 780ms cubic-bezier(.4, 0, .2, 1) both; }',
  '.elr-album-stage[data-transition="blur-dissolve"] .elr-album-photo.is-entering-active { animation: elr-album-blur-in 720ms cubic-bezier(.22, 1, .36, 1) both; }',
  '.elr-album-stage[data-transition="blur-dissolve"] .elr-album-photo.is-leaving { animation: elr-album-blur-out 720ms cubic-bezier(.4, 0, .2, 1) both; }',
  '.elr-album-stage[data-transition="slide-depth"] .elr-album-photo.is-entering-active { box-shadow: -14px 0 32px rgb(0 0 0 / .35); animation: elr-album-slide-in-next 640ms cubic-bezier(.22, 1, .36, 1) both; }',
  '.elr-album-stage[data-transition="slide-depth"] .elr-album-photo.is-leaving { animation: elr-album-slide-out-next 640ms cubic-bezier(.22, 1, .36, 1) both; }',
  '.elr-album-stage[data-transition="slide-depth"][data-dir="prev"] .elr-album-photo.is-entering-active { box-shadow: 14px 0 32px rgb(0 0 0 / .35); animation: elr-album-slide-in-prev 640ms cubic-bezier(.22, 1, .36, 1) both; }',
  '.elr-album-stage[data-transition="slide-depth"][data-dir="prev"] .elr-album-photo.is-leaving { animation: elr-album-slide-out-prev 640ms cubic-bezier(.22, 1, .36, 1) both; }',
  '.elr-album-stage[data-transition="iris-reveal"] .elr-album-photo.is-entering-active { animation: elr-album-iris-in 760ms cubic-bezier(.22, 1, .36, 1) both; }',
  '.elr-album-stage[data-transition="iris-reveal"] .elr-album-photo.is-leaving { animation: elr-album-iris-out 760ms cubic-bezier(.4, 0, .2, 1) both; }',
  '.elr-album-stage[data-transition="curtain-wipe"] .elr-album-photo.is-entering-active { animation: elr-album-curtain-in 720ms cubic-bezier(.22, 1, .36, 1) both; }',
  '.elr-album-stage[data-transition="curtain-wipe"] .elr-album-photo.is-leaving { animation: elr-album-curtain-out 720ms cubic-bezier(.4, 0, .2, 1) both; }',
  '@keyframes elr-album-fade-in { from { opacity: 0; } to { opacity: 1; } }',
  '@keyframes elr-album-fade-out { from { opacity: 1; } to { opacity: 0; } }',
  '@keyframes elr-album-kb-in { from { opacity: 0; transform: scale(1.09) translate3d(1.5%, -1%, 0); } to { opacity: 1; transform: scale(1) translate3d(0, 0, 0); } }',
  '@keyframes elr-album-kb-out { from { opacity: 1; transform: scale(1) translate3d(0, 0, 0); } to { opacity: 0; transform: scale(1.05) translate3d(-1.5%, 1%, 0); } }',
  '@keyframes elr-album-blur-in { from { opacity: 0; filter: blur(12px) saturate(1.1); transform: scale(1.06); } to { opacity: 1; filter: blur(0) saturate(1); transform: scale(1); } }',
  '@keyframes elr-album-blur-out { from { opacity: 1; filter: blur(0); transform: scale(1); } to { opacity: 0; filter: blur(10px); transform: scale(1.04); } }',
  '@keyframes elr-album-slide-in-next { from { transform: translate3d(100%, 0, 0); opacity: .92; } to { transform: translate3d(0, 0, 0); opacity: 1; } }',
  '@keyframes elr-album-slide-out-next { from { transform: translate3d(0, 0, 0) scale(1); filter: brightness(1); } to { transform: translate3d(-24%, 0, 0) scale(.94); filter: brightness(.72); } }',
  '@keyframes elr-album-slide-in-prev { from { transform: translate3d(-100%, 0, 0); opacity: .92; } to { transform: translate3d(0, 0, 0); opacity: 1; } }',
  '@keyframes elr-album-slide-out-prev { from { transform: translate3d(0, 0, 0) scale(1); filter: brightness(1); } to { transform: translate3d(24%, 0, 0) scale(.94); filter: brightness(.72); } }',
  '@keyframes elr-album-iris-in { from { clip-path: circle(0% at 50% 50%); transform: scale(1.06); opacity: .88; } to { clip-path: circle(82% at 50% 50%); transform: scale(1); opacity: 1; } }',
  '@keyframes elr-album-iris-out { from { opacity: 1; transform: scale(1); } to { opacity: .6; transform: scale(.97); } }',
  '@keyframes elr-album-curtain-in { from { clip-path: polygon(0 0, 0 0, -24% 100%, -24% 100%); transform: scale(1.04); } to { clip-path: polygon(0 0, 124% 0, 100% 100%, 0 100%); transform: scale(1); } }',
  '@keyframes elr-album-curtain-out { from { opacity: 1; transform: scale(1); } to { opacity: .75; transform: scale(.98); } }',
  '.elr-album-hud { position: absolute; inset: auto 8px 8px 8px; z-index: 4; display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 999px; border: 1px solid rgb(255 255 255 / .18); background: rgb(16 20 28 / .72); color: #fff; font-size: 11.5px; transition: transform 220ms var(--ease-out), opacity 180ms var(--ease-out); }',
  '.elr-album-card.is-head-hidden .elr-album-hud { transform: translateY(120%); opacity: 0; pointer-events: none; transition-timing-function: var(--ease-in); }',
  '.elr-album-hud-count { margin-inline-end: auto; font-variant-numeric: tabular-nums; padding-inline: 4px; opacity: .92; }',
  '.elr-album-hud-btn { height: 24px; min-width: 24px; padding: 0 7px; border: 0; border-radius: 999px; background: rgb(255 255 255 / .14); color: #fff; font: inherit; font-size: 11.5px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; }',
  '.elr-album-hud-btn:hover { background: rgb(255 255 255 / .26); }',
  '@media (prefers-reduced-motion: reduce) { .elr-album-photo { transition: none; animation: none !important; } .elr-album-card .elr-function-head, .elr-album-hud { transition: none; } }',
  ':is([data-elr-docked-card],[data-elr-floating-card]) { font-size: calc(13px + var(--elr-card-font-adjust, 0px)); }',
  '.elr-feature-grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: ' + CARD_GRID_GAP + 'px; padding: 52px ' + CARD_GRID_PADDING + 'px 10px; scroll-padding-top: 52px; overflow: hidden auto; align-items: stretch; }',
  '.elr-body:not(.dock-bottom) .elr-feature-grid { scrollbar-gutter: stable; }',
  '.elr-feature-workspace.drag-active .elr-feature-grid, .elr-feature-grid.is-resizing-card { overflow-anchor: none; }',
  '.elr-feature-grid.is-resizing-card [data-elr-docked-card] { transition: none; }',
  '.elr-feature-grid[data-columns="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); overflow-x: hidden; }',
  '.elr-feature-column { position: relative; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 10px; }',
  '.elr-body:not(.dock-bottom) .elr-feature-grid { padding-block-end: 0; }',
  '.elr-body:not(.dock-bottom) .elr-feature-column::after { content: ""; flex: 0 0 ' + (CARD_DOCK_BOTTOM_GAP - 10) + 'px; }',
  '.elr-feature-column > .elr-sec { flex: 1 1 210px; min-height: 116px; }',
  '.elr-feature-column > .elr-analysis-card { flex: 1.35 1 300px; min-height: 270px; }',
  '.elr-analysis-card { display: flex; flex-direction: column; min-width: 0; overflow: hidden; }',
  '.elr-analysis-card-inner { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; overflow: hidden; }',
  '.elr-analysis-card-body { position: relative; display: flex; flex: 1 1 auto; min-height: 0; overflow: hidden; }',
  '.elr-analysis-card-body > .elr-col { flex: 1 1 auto; min-height: 0; overflow: hidden; }',
  '.elr-analysis-card-body > .elr-col > .elr-toolbar { border-bottom: 0; padding-block-start: 0; }',
  '.elr-analysis-card-body .elr-tabs { flex: 0 0 auto; }',
  '.elr-analysis-card-body .elr-out, .elr-analysis-card-body .elr-analysis-body, .elr-analysis-card-body .elr-figure-list { min-height: 0; overflow: auto; }',
  '.elr-analysis-actions { position: absolute; top: calc(var(--elr-card-content-gap) + 6px); right: calc(var(--elr-card-inset) + 8px); z-index: 4; display: flex; align-items: center; justify-content: flex-end; gap: 3px; }',
  '.elr-analysis-card-body:has(> .elr-analysis-actions) > .elr-col > .elr-out, .elr-analysis-card-body:has(> .elr-analysis-actions) > .elr-out { padding-top: 34px; }',
  '.elr-analysis-actions .elr-analysis-icon { color: var(--dsw-alias-label-primary); }',
  '.elr-analysis-icon:disabled { opacity: .45; cursor: default; }',
  '.elr-analysis-actions .elr-analysis-run { color: var(--dsw-alias-brand-primary); }',
  '.elr-analysis-info:popover-open .elr-generation-meta { display: grid; gap: 5px; margin: 0; padding: 2px 4px; border: 0; background: transparent; overflow-wrap: anywhere; }',
  '.elr-analysis-info-coverage { margin: 8px 4px 2px; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l2); font-size: .87em; line-height: 1.5; overflow-wrap: anywhere; }',
  '.elr-analysis-card-body > .elr-col > .elr-out, .elr-analysis-card-body > .elr-out, .elr-agent-slot > .elr-out { width: auto; min-width: 0; margin: var(--elr-card-content-gap) var(--elr-card-inset) var(--elr-card-inset) var(--elr-card-leading); padding: var(--elr-card-content-gap); }',
  ':is(.elr-analysis-card-body > .elr-col > .elr-out, .elr-analysis-card-body > .elr-out, .elr-agent-slot > .elr-out, .elr-recent-list, .elr-recent-empty, .elr-terms-list, .elr-marks-list, .elr-marks-empty) { border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--elr-card-content-radius); background: var(--elr-card-content-bg); }',
  ':is(.elr-recent-list, .elr-recent-empty, .elr-terms-list, .elr-marks-list, .elr-marks-empty):not(.elr-detail-navigation) { margin: 0 var(--elr-card-inset) var(--elr-card-inset) var(--elr-card-leading); padding: var(--elr-card-content-gap); }',
  '.elr-summary-recovery { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }',
  '.elr-body.dock-bottom .elr-side { display: block; }',
  '.elr-body.dock-bottom .elr-side-top { width: 100%; height: 100%; }',
  '.elr-body.dock-bottom .elr-feature-grid { display: flex; flex-direction: row; align-items: stretch; padding-block: 44px ' + BOTTOM_DOCK_GRID_PADDING + 'px; scroll-padding-top: 44px; overflow-x: scroll; overflow-y: hidden; }',
  '.elr-body.dock-bottom .elr-feature-column { box-sizing: border-box; flex: 0 0 auto; min-width: 100%; width: max-content; flex-direction: row; align-items: stretch; padding-inline-end: 10px; }',
  '.elr-body.dock-bottom [data-elr-docked-card] { --elr-card-leading: 0px; box-sizing: border-box; flex: 0 0 auto; width: var(--elr-dock-card-width, 308px); min-width: var(--elr-dock-card-min-width, 226px); }',
  '.elr-body.dock-bottom [data-elr-docked-card="selection"] { --elr-dock-card-width: 510px; --elr-dock-card-min-width: 356px; }',
  '.elr-body.dock-bottom [data-elr-docked-card="agent"] { --elr-dock-card-width: 456px; --elr-dock-card-min-width: 330px; }',
  '.elr-body.dock-bottom [data-elr-docked-card="summary"] { --elr-dock-card-width: 420px; --elr-dock-card-min-width: 284px; }',
  '.elr-body.dock-bottom :is([data-elr-docked-card="references"],[data-elr-docked-card="figure"]) { --elr-dock-card-width: 380px; --elr-dock-card-min-width: 284px; }',
  '.elr-body.dock-bottom :is([data-elr-docked-card="terms"],[data-elr-docked-card="marks"]) { --elr-dock-card-width: 440px; --elr-dock-card-min-width: 330px; }',
  '.elr-body.dock-bottom [data-elr-docked-card="album"] { --elr-dock-card-width: 340px; --elr-dock-card-min-width: 240px; }',
  '.elr-body.dock-bottom [data-elr-docked-card="ambient"] { --elr-dock-card-width: 368px; --elr-dock-card-min-width: 270px; }',
  '.elr-body.dock-bottom [data-elr-docked-card="clock"] { --elr-dock-card-width: 280px; --elr-dock-card-min-width: 248px; }',
  '.elr-feature-column > [data-elr-docked-card="clock"]:not(.is-collapsed) { min-height: 228px; }',
  '.elr-clock-card { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; overflow: hidden; }',
  '.elr-clock-card .elr-function-head { transition: opacity 220ms var(--ease-out), transform 220ms var(--ease-out); }',
  '.elr-clock-stage { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; margin: 0 var(--elr-card-inset) var(--elr-card-inset) var(--elr-card-leading); padding: 14px 12px 12px; border-radius: var(--elr-card-content-radius); border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 70%, rgb(255 255 255 / .28)); background: radial-gradient(circle at 22% 16%, rgb(255 255 255 / .24), transparent 56%), radial-gradient(circle at 84% 86%, color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent), transparent 60%), linear-gradient(155deg, color-mix(in srgb, var(--dsw-alias-bg-layer-1) 52%, transparent), color-mix(in srgb, var(--dsw-alias-bg-layer-2) 34%, transparent)); box-shadow: inset 0 1px 0 rgb(255 255 255 / .32), inset 0 -1px 0 rgb(10 18 30 / .08), 0 4px 14px rgb(10 18 30 / .06); overflow: hidden; cursor: pointer; transition: background 220ms var(--ease-out), border-color 220ms var(--ease-out), box-shadow 220ms var(--ease-out); }',
  '.elr-clock-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 5px; transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out); }',
  '.elr-sec[data-elr-floating-card="clock"] { transition: background 220ms var(--ease-out), border-color 220ms var(--ease-out), box-shadow 220ms var(--ease-out), backdrop-filter 220ms var(--ease-out); }',
  '.elr-sec[data-elr-floating-card="clock"]::after, .elr-sec[data-elr-floating-card="clock"] > .elr-rz { transition: opacity 220ms var(--ease-out); }',
  '.elr-sec[data-elr-floating-card="clock"]:has(> .elr-clock-card.is-chrome-hidden) { background: transparent !important; border-color: transparent !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; pointer-events: none; }',
  '.elr-sec[data-elr-floating-card="clock"]:has(> .elr-clock-card.is-chrome-hidden)::after, .elr-sec[data-elr-floating-card="clock"]:has(> .elr-clock-card.is-chrome-hidden) > .elr-rz { opacity: 0; pointer-events: none; }',
  '.elr-clock-card.is-chrome-hidden .elr-function-head { opacity: 0; transform: translateY(-6px); pointer-events: none; }',
  '.elr-clock-card.is-chrome-hidden .elr-clock-stage { background: transparent; border-color: transparent; box-shadow: none; pointer-events: none; cursor: default; }',
  '.elr-clock-card.is-chrome-hidden .elr-clock-digital, .elr-clock-card.is-chrome-hidden .elr-clock-analog { pointer-events: auto; cursor: grab; padding: 6px 12px; border-radius: 14px; }',
  '.elr-clock-card.is-direct-dragging .elr-clock-digital, .elr-clock-card.is-direct-dragging .elr-clock-analog { cursor: grabbing; opacity: .9; }',
  '.elr-clock-card.is-chrome-hidden .elr-clock-toolbar { opacity: 0; transform: translateY(4px); pointer-events: none; }',
  '.elr-clock-digital { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }',
  '.elr-clock-time-row { display: inline-flex; align-items: baseline; justify-content: center; gap: 5px; font-variant-numeric: tabular-nums; line-height: 1; }',
  '.elr-clock-hhmm { font-size: clamp(30px, 4.4vw, 40px); font-weight: 700; letter-spacing: -.03em; color: var(--dsw-alias-label-primary); text-shadow: 0 1px 10px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); }',
  '.elr-clock-sec { padding: 3px 6px; border-radius: 999px; font-size: 13px; font-weight: 600; color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, rgb(255 255 255 / .20)); border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, rgb(255 255 255 / .28)); box-shadow: inset 0 1px 0 rgb(255 255 255 / .36); }',
  '.elr-clock-ampm { font-size: 11px; font-weight: 650; letter-spacing: .04em; color: var(--dsw-alias-label-secondary); align-self: flex-start; margin-top: 4px; }',
  '.elr-clock-date { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 46%, transparent); border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 60%, rgb(255 255 255 / .24)); box-shadow: inset 0 1px 0 rgb(255 255 255 / .24); }',
  '.elr-clock-progress { width: min(176px, 78%); height: 3px; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--dsw-alias-border-l1) 65%, transparent); }',
  '.elr-clock-progress > span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 65%, transparent), var(--dsw-alias-brand-primary)); transition: width 320ms var(--ease-out); }',
  '.elr-clock-analog { display: flex; flex-direction: column; align-items: center; gap: 6px; }',
  '.elr-clock-dial { width: 116px; height: 116px; border-radius: 50%; background: radial-gradient(circle at 30% 25%, rgb(255 255 255 / .30), transparent 64%), color-mix(in srgb, var(--dsw-alias-bg-layer-1) 44%, transparent); border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l2) 55%, rgb(255 255 255 / .36)); box-shadow: inset 0 1px 0 rgb(255 255 255 / .42), inset 0 -2px 8px rgb(10 18 30 / .08), 0 6px 16px rgb(10 18 30 / .10); }',
  '.elr-clock-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 5px; }',
  '.elr-clock-pill { padding: 3px 9px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 75%, rgb(255 255 255 / .22)); background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 52%, transparent); color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; cursor: pointer; transition: background-color 140ms var(--ease-out), border-color 140ms var(--ease-out), color 140ms var(--ease-out); }',
  '.elr-clock-pill:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }',
  '.elr-clock-pill[aria-pressed="true"] { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, rgb(255 255 255 / .14)); color: var(--dsw-alias-brand-primary); font-weight: 600; }',
  '.elr-body.dock-bottom [data-elr-docked-card] > :first-child > :not(.elr-function-head) { min-width: 0; margin-block-start: var(--elr-card-inset); }',
  '.elr-body.dock-bottom [data-elr-docked-card="album"] > .elr-album-card.has-photos > :not(.elr-function-head) { margin-block-start: 0; }',
  '.elr-body.dock-bottom [data-elr-docked-card] .elr-selection-content { padding-block-start: 0; }',
  '.elr-body.dock-bottom [data-elr-docked-card] .elr-analysis-card-body > .elr-col > .elr-toolbar { min-height: 35px; padding: 0 8px 6px; }',
  '.elr-detail-split { display: grid; grid-template-columns: minmax(92px, 37%) minmax(0, 1fr); gap: var(--elr-card-content-gap); margin: 0 var(--elr-card-inset) var(--elr-card-inset) var(--elr-card-leading); flex: 1 1 0; min-height: 0; min-width: 0; }',
  '.elr-detail-navigation { align-content: start; padding: 5px; }',
  '.elr-detail-navigation .elr-term-item { border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; }',
  '.elr-detail-navigation .elr-term-toggle { padding-inline-start: 9px; border-radius: 999px; min-height: 29px; }',
  '.elr-detail-navigation .elr-term-toggle::before { display: none; }',
  '.elr-detail-navigation :is(.elr-term-item.open,.elr-mark-select[aria-pressed="true"]) { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, var(--dsw-alias-bg-layer-1)); }',
  '.elr-detail-content { min-width: 0; min-height: 0; margin: 0; overflow: auto; overscroll-behavior: contain; overflow-wrap: anywhere; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--elr-card-content-radius); padding: 9px 10px; background: var(--elr-card-content-bg); }',
  '.elr-detail-heading { display: flex; align-items: center; gap: 4px; min-width: 0; margin: 0 0 7px; font-size: calc(13px + var(--elr-card-font-adjust, 0px)); color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }',
  '.elr-detail-content .elr-term-body { padding: 0; border: 0; }',
  '.elr-mark-select { min-width: 0; width: 100%; cursor: pointer; color: var(--dsw-alias-label-primary); text-align: start; font: inherit; }',
  '.elr-mark-select .elr-mark-badge { margin-inline-end: 0; }',
  '.elr-mark-select .elr-mark-preview { padding: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.elr-detail-content .elr-note-detail-text { white-space: pre-wrap; margin: 0 0 9px; line-height: 1.6; font-size: calc(13px + var(--elr-card-font-adjust, 0px)); }',
  '.elr-note-detail-source { margin: 0; padding-inline-start: 8px; border-inline-start: 2px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-size: calc(12px + var(--elr-card-font-adjust, 0px)); white-space: pre-wrap; line-height: 1.6; }',
  '.elr-note-inline { display: grid; gap: 7px; min-width: 0; margin: 0 0 9px; }',
  '.elr-note-inline textarea { width: 100%; box-sizing: border-box; min-height: 80px; max-height: 55vh; resize: vertical; padding: 7px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; line-height: 1.55; }',
  '.elr-note-inline textarea:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); }',
  '.elr-note-inline-actions { display: flex; flex-wrap: wrap; justify-content: end; gap: 5px; }',
  '.elr-note-inline-actions button[type="submit"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }',
  '.elr-term-detail { display: flex; flex-direction: column; overflow: hidden; }',
  '.elr-term-detail > .elr-term-body { overflow: auto; min-height: 0; overscroll-behavior: contain; }',
  '.elr-term-detail-heading { display: flex; align-items: center; justify-content: space-between; gap: 5px; margin: 0 0 6px; min-width: 0; flex: none; }',
  '.elr-term-detail-heading strong { min-width: 0; overflow-wrap: anywhere; }',
  '.elr-term-inline-detail { padding: 2px 7px 5px; }',
  '.elr-term-inline-detail > .elr-remove-control { margin-inline-start: auto; }',
  '.elr-term-popover-actions { flex: none; display: flex; align-items: center; gap: 4px; }',
  '@media (max-width: 1050px) {',
  '  .elr-head { gap: 5px; padding-inline: 8px; }',
  '  .elr-head-controls, .elr-head-group { gap: 3px; }',
  '  .elr-head .elr-btn { padding-inline: 6px; }',
  '}',
  '.elr-feature-grid .elr-card-none { grid-column: 1 / -1; align-self: center; }',
  '.elr-feature-column > .elr-sec { box-sizing: border-box; min-height: 0; max-height: var(--elr-card-max-height); }',
  '.elr-feature-column > .elr-sec:not(.is-collapsed) { min-height: ' + CARD_MIN_H + 'px; }',
  '.elr-feature-column > .elr-sec.is-collapsed { flex: 0 0 54px; min-height: 54px; max-height: 54px; }',
  '.elr-feature-column > .elr-sec.is-compact:not(.is-collapsed) { flex: 0 0 auto; min-height: 0; }',
  '.elr-body.dock-bottom .elr-feature-column > [data-elr-docked-card] { min-height: 0; }',
  '.elr-body.dock-bottom .elr-feature-column > .elr-sec.is-compact:not(.is-collapsed) { width: ' + BOTTOM_COMPACT_CARD_WIDTH + 'px; min-width: 0; }',
  '.elr-body:not(.dock-bottom) .elr-feature-column > .elr-sec.is-compact:not(.is-collapsed) { height: calc-size(auto, size * 1.5); }',
  '.elr-body:not(.dock-bottom) [data-elr-docked-card="agent"]:not(.is-collapsed), [data-elr-floating-card="agent"].is-open { min-height: ' + AGENT_CARD_MIN_H + 'px; }',
  '.elr-sec.is-compact .elr-out-empty { padding: 6px var(--elr-card-content-gap); }',
  '.elr-sec.is-compact .elr-selection-panes { flex: 0 0 auto; grid-template: auto / minmax(0,1fr); min-height: 0; }',
  '.elr-sec.is-compact .elr-selection-panes > :first-child { grid-row: auto; grid-template-rows: auto 30px; }',
  '.elr-sec.is-compact :is(.elr-sel-actions, .elr-selection-panes > :not(:first-child)) { display: none; }',
  '.elr-feature-column > .elr-sec.is-collapsed .elr-analysis-card-inner { min-height: 54px; }',
  '.elr-sec > :first-child > .elr-card-fold-content { opacity: 1; transition: opacity var(--duration-md) var(--ease-out); }',
  '.elr-sec.is-collapsed > :first-child > .elr-card-fold-content { opacity: 0; transition: opacity var(--duration-exit-md) var(--ease-in); pointer-events: none; }',
  '.elr-feature-grid.is-folding-cards { overflow-anchor: none; contain: layout; }',
  '.elr-sec[data-elr-folding] { overflow: clip; }',
  '.elr-sec[data-elr-folding="closing-height"] > :first-child > .elr-card-fold-content { box-sizing: border-box; min-height: var(--elr-fold-content-size); }',
  '.elr-body.dock-bottom [data-elr-docked-card][data-elr-folding="closing-width"] > :first-child > .elr-card-fold-content { box-sizing: border-box; min-width: var(--elr-fold-content-size); }',
  '.elr-workspace-tab { --elr-frosted-fill: var(--elr-glass-chrome-fill); position: absolute; z-index: 95; right: 0; top: 50%; translate: 0 -50%; writing-mode: vertical-rl; padding: 12px 8px; border: 1px solid transparent; border-radius: 12px 0 0 12px; color: var(--dsw-alias-label-primary); font: inherit; letter-spacing: .09em; background: var(--elr-frosted-background); backdrop-filter: var(--elr-frosted-filter); box-shadow: var(--elr-frosted-rim), 0 3px 13px rgba(0,0,0,.17); cursor: pointer; }',
  '.elr-body.dock-left .elr-workspace-tab { left: 0; right: auto; border-radius: 0 12px 12px 0; }',
  '.elr-body.dock-bottom .elr-workspace-tab { inset: auto auto 0 50%; translate: -50% 0; writing-mode: horizontal-tb; padding: 6px 17px; border-radius: 12px 12px 0 0; }',
  '.elr-workspace-tab:hover { color: var(--dsw-alias-brand-primary); }',
  '@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { .elr-workspace-tab { background: var(--dsw-alias-bg-layer-1); backdrop-filter: none; } }',
  '.elr-workspace-head .elr-card-control, .elr-popup-head .elr-inline-control { width: 28px; height: 28px; flex: 0 0 28px; display: grid; place-items: center; padding: 0; border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l2) 70%, transparent); border-radius: 8px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 70%, transparent); }',
  '.elr-workspace-head .elr-card-control:not(:disabled):hover, .elr-popup-head .elr-inline-control:not(:disabled):hover, .elr-workspace-head .elr-card-control.active { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, var(--dsw-alias-bg-layer-1)); }',
  ':where(.elr-tone-duo-blue, .elr-tone-duo-orange, .elr-tone-duo-green, .elr-tone-duo-purple) .elr-card-head.elr-workspace-head { color: var(--elr-duo-side-muted); }',
  ':where(.elr-tone-duo-blue, .elr-tone-duo-orange, .elr-tone-duo-green, .elr-tone-duo-purple) .elr-workspace-head .elr-card-control { color: var(--elr-duo-side-label); border-color: rgb(255 255 255 / .20); background: rgb(255 255 255 / .09); }',
  ':where(.elr-tone-duo-blue, .elr-tone-duo-orange, .elr-tone-duo-green, .elr-tone-duo-purple) .elr-workspace-head .elr-card-control:is(:hover:not(:disabled),.active) { color: var(--elr-duo-side-accent); background: rgb(255 255 255 / .16); }',
  ':where(.elr-tone-duo-blue, .elr-tone-duo-orange, .elr-tone-duo-green, .elr-tone-duo-purple) .elr-workspace-head .elr-card-control:focus-visible { outline-color: var(--elr-duo-side-accent); }',
  '.elr-workspace-head .elr-card-control:disabled, .elr-popup-head .elr-inline-control:disabled { opacity: .42; cursor: default; }',
  '.elr-workspace-head .elr-card-control svg, .elr-popup-head .elr-inline-control svg { display: block; width: 16px; height: 16px; }',
  '.elr-card-layout-menu .elr-save-layout { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }',
  '.elr-card-layout-row { display: grid; grid-template-columns: minmax(0, 1fr) 30px; gap: 5px; }',
  '.elr-card-layout-row > .elr-btn:first-child { text-align: start; }',
  '.elr-card-layout-row .elr-layout-delete { display: grid; place-items: center; padding: 0; }',
  '.elr-card-layout-row .elr-layout-delete:hover { color: var(--dsw-alias-state-error-primary); }',
  '.elr-card-layout-limit { padding: 3px; font-size: 12px; color: var(--dsw-alias-state-warn-primary); }',
  '.elr-feature-column > .elr-sec, .elr-floating-card { transition: box-shadow var(--duration-feedback) var(--ease-out); }',
  '.elr-body.dock-bottom .elr-feature-column > .elr-sec.is-collapsed { flex: 0 0 54px; width: 54px; min-width: 54px; max-width: 54px; min-height: 0; max-height: none; }',
  '@media (prefers-reduced-motion: reduce) { .elr-side, .elr-side.is-stowed { transition: none; } .elr-sec:not(.dragging) > :first-child > .elr-card-fold-content { transition-duration: var(--duration-reduced); } }',
  '.elr-sec[data-elr-docked-card], .elr-sec[data-elr-floating-card] { background: var(--elr-frosted-background); --elr-sec-radius: 15px; border: 1px solid transparent; border-radius: var(--elr-sec-radius); box-shadow: 0 2px 4px rgb(12 20 34 / .12), 0 8px 18px rgb(12 20 34 / .12); backdrop-filter: var(--elr-frosted-filter); }',
  '.elr-sec[data-elr-floating-card] { --elr-card-fill: var(--elr-glass-floating-fill); --elr-card-blur: var(--elr-glass-floating-blur); box-shadow: 0 3px 8px rgb(10 18 30 / .17), 0 12px 36px rgb(10 18 30 / .24); }',
  '.elr-sec[data-elr-docked-card="recent"] { --elr-card-fill: calc(var(--elr-glass-docked-fill) - 4%); }',
  '.elr-recent-item.current { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 11%, transparent); }',
  '.elr-recent-item:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }',
  // Paint the bevel inside the existing border box. Offset, feathered shadows
  // merge at the rounded corners and follow the same light across every card.
  '.elr-sec[data-elr-docked-card]::after, .elr-sec[data-elr-floating-card]::after { content: ""; position: absolute; inset: 0; border-radius: calc(var(--elr-sec-radius) - 1px); pointer-events: none; z-index: 2; box-shadow: var(--elr-frosted-rim); }',
  '.elr-sec[data-elr-floating-card][data-elr-folding] { contain: layout; }',
  '.elr-gesturing .elr-feature-grid .elr-sec[data-elr-docked-card], .elr-gesturing .elr-sec[data-elr-floating-card], .elr-gesturing .elr-card-menu, .elr-gesturing .elr-capsule-popover, .elr-gesturing .elr-reader-capsule, .elr-gesturing .elr-toolbar { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
  '@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { .elr-sec[data-elr-docked-card], .elr-sec[data-elr-floating-card], .elr-drag-ghost { background: var(--dsw-alias-bg-layer-1); backdrop-filter: none; } }',
  '.elr-card-drop-placeholder { --elr-drop-accent: var(--dsw-alias-brand-primary, #2467ab); flex: 0 0 ' + CARD_HEADER_HEIGHT + 'px; min-height: ' + CARD_HEADER_HEIGHT + 'px; box-sizing: border-box; border: 2px solid var(--elr-drop-accent); border-radius: 15px; background: color-mix(in srgb, var(--elr-drop-accent) 24%, var(--dsw-alias-bg-layer-1)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--elr-drop-accent) 42%, transparent), 0 0 0 3px color-mix(in srgb, var(--elr-drop-accent) 24%, transparent), 0 5px 18px rgba(20,28,45,.16); }',
  '.elr-feature-column > .elr-sec.dragging { position: absolute; inset: 0 auto auto 0; visibility: hidden; pointer-events: none; }',
  '.elr-floating-card.dragging { visibility: hidden; pointer-events: none; }',
  '.elr-feature-column > .elr-sec.dragging, .elr-feature-column > .elr-sec.dragging * { transition: none !important; animation: none !important; }',
  '.elr-no-card-motion .elr-feature-column > .elr-sec, .elr-no-card-motion .elr-feature-column > .elr-sec * { transition: none !important; animation: none !important; }',
  '.elr-body.dock-bottom .elr-card-drop-placeholder { width: ' + CARD_HEADER_HEIGHT + 'px; min-width: ' + CARD_HEADER_HEIGHT + 'px; min-height: 0; height: 100%; }',
].join('\n');

function installCss() {
  let tag = document.getElementById(CSS_ID);
  if (!tag) {
    tag = document.createElement('style');
    tag.id = CSS_ID;
    tag.dataset.pluginCss = CSS_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = CSS;
  return () => {};
}

const ensurePdfJs = desktop.ensurePdfJs;

// Render one TeX expression. `throwOnError: false` makes KaTeX draw the
// offending fragment in red instead of throwing, which keeps a partially
// malformed answer readable instead of blanking the whole card.
// (v10 #2) Models routinely emit TeX that KaTeX rejects even though the
// intent is obvious — `\bm` (needs the bm package), `\mathbbm` (bbm),
// `\label{}`/`\tag{}` (not in KaTeX), `\operatorname*`, `\hspace*`, stray
// `\nonumber`. One failed token used to turn the WHOLE expression into a red
// error node, which is what made "the formulas in the explanation still do not
// render". Normalising the common offenders and retrying makes far more
// expressions come out typeset.
function normalizeTex(tex) {
  let src = String(tex == null ? '' : tex);
  src = src.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/[\u3000\u00a0]/g, ' ');
  src = src.replace(/\\mathbbm(?![a-zA-Z])/g, '\\mathbb');
  src = src.replace(/\\bm(?![a-zA-Z])\s*\{/g, '\\boldsymbol{');
  src = src.replace(/\\operatorname\*\s*\{/g, '\\operatorname{');
  src = src.replace(/\\(?:label|tag|hspace\*?|phantom)\s*\{[^{}]*\}/g, '');
  src = src.replace(/\\(?:nonumber|notag|displaystyle|textstyle)(?![a-zA-Z])/g, '');
  src = src.replace(/\\mbox\s*\{/g, '\\text{');
  src = src.replace(/\\eqref\s*\{[^{}]*\}/g, '');
  // `\color{...}` and `\begin{figure}` style leftovers cannot be typeset.
  src = src.replace(/\\begin\{(?:figure|table|tabular|center|flushleft|flushright)\}[\s\S]*?\\end\{\1\}/g, '');
  return src;
}

// A KaTeX failure node is `<span class="katex-error" ...>`. Detecting it lets
// us retry with the normalised source instead of showing raw TeX.
const KATEX_FAILED_RE = /class="[^"]*\bkatex-error\b/;

function renderMath(tex, display) {
  const src0 = String(tex == null ? '' : tex).trim();
  if (!src0) return null;
  const katex = desktop.katex;
  if (katex && typeof katex.renderToString === 'function') {
    const attempts = [src0];
    const normalized = normalizeTex(src0).trim();
    if (normalized && normalized !== src0) attempts.push(normalized);
    for (let i = 0; i < attempts.length; i++) {
      try {
        const html = katex.renderToString(attempts[i], {
          displayMode: !!display,
          throwOnError: false,
          strict: 'ignore',
          output: 'html',
          trust: false,
        });
        if (!KATEX_FAILED_RE.test(html)) {
          return h('span', {
            className: 'elr-katex',
            dangerouslySetInnerHTML: { __html: html },
          });
        }
      } catch (_) {}
    }
  }
  return h('code', { className: 'elr-katex-err' }, display ? '$$' + src0 + '$$' : '$' + src0 + '$');
}

// Cell text may itself contain math, bold or `code`, so cells go through
// the same inline renderer as paragraphs.
//
// Both delimiter families are honoured because the model uses whichever it
// prefers: `$…$` / `$$…$$` (TeX style) and `\(…\)` / `\[…\]` (LaTeX style).
// Only handling dollars left `\(F\)` printed literally, which is unreadable.
//
// (v10 #2) The `\(…\)` body must be matched with a LAZY ANY-CHAR pattern, not
// with `[^)]*?`: a formula such as `\(X_{(T+1):(T+S)}\)` contains closing
// parentheses of its own, so the character-class version could never reach the
// real `\)` terminator and the whole expression fell back to raw text. Lazy
// matching still stops at the FIRST `\)` (or `\]`), which is the correct
// behaviour for inline math.
const INLINE_MATH_RE = /(\*\*[^*]+\*\*|`[^`]+`|\$\$[\s\S]+?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$)/g;
const INLINE_WITH_SOURCES = new RegExp(INLINE_MATH_RE.source + '|(\\[S\\d+\\])', 'g');
function renderInline(text, source) {
  // `$$…$$`, `\[…\]` and `\(…\)` are tried before `$…$`, otherwise the
  // single-dollar pattern eats their inner pair and leaves the outer
  // delimiters printed.
  const parts = String(text == null ? '' : text).split(source ? INLINE_WITH_SOURCES : INLINE_MATH_RE);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (part.length > 4 && part.slice(0, 2) === '**' && part.slice(-2) === '**') {
      out.push(h('strong', { key: 'b' + i }, renderInline(part.slice(2, -2), source)));
      continue;
    }
    if (part.length > 2 && part.charAt(0) === '`' && part.charAt(part.length - 1) === '`') {
      const codeText = part.slice(1, -1);
      if (/^\$\$[\s\S]+?\$\$$/.test(codeText) && /\\[a-zA-Z]+/.test(codeText)) {
        out.push(h('span', { key: 'M' + i, className: 'elr-math-inline' }, renderMath(codeText.slice(2, -2), false)));
        continue;
      }
      if (/^\$[^$\n]+\$$/.test(codeText) && /\\[a-zA-Z]+/.test(codeText)) {
        out.push(h('span', { key: 'm' + i, className: 'elr-math-inline' }, renderMath(codeText.slice(1, -1), false)));
        continue;
      }
      out.push(h('code', { key: 'c' + i }, codeText));
      continue;
    }
    if (part.length > 4 && part.slice(0, 2) === '$$' && part.slice(-2) === '$$') {
      out.push(h('span', { key: 'M' + i, className: 'elr-math-inline' }, renderMath(part.slice(2, -2), false)));
      continue;
    }
    if (part.length > 4 && part.slice(0, 2) === '\\[' && part.slice(-2) === '\\]') {
      out.push(h('span', { key: 'B' + i, className: 'elr-math-inline' }, renderMath(part.slice(2, -2), false)));
      continue;
    }
    if (part.length > 4 && part.slice(0, 2) === '\\(' && part.slice(-2) === '\\)') {
      out.push(h('span', { key: 'p' + i, className: 'elr-math-inline' }, renderMath(part.slice(2, -2), false)));
      continue;
    }
    if (part.length > 2 && part.charAt(0) === '$' && part.charAt(part.length - 1) === '$') {
      out.push(h('span', { key: 'm' + i, className: 'elr-math-inline' }, renderMath(part.slice(1, -1), false)));
      continue;
    }
    const marker = source && /^\[(S\d+)\]$/.exec(part);
    out.push(marker ? source(marker[1], 'cite' + i) || part : part);
  }
  return out;
}

const isTableSeparator = (line) => {
  const s = String(line || '').trim();
  if (!s) return false;
  if (s.indexOf('|') < 0 && s.indexOf(' ') < 0) return false;
  return /^\|?[\s:-]*-[\s:|-]*\|?$/.test(s) && (s.match(/-/g) || []).length >= 2;
};
const splitTableRow = (line) => {
  let s = String(line || '').trim();
  if (s.charAt(0) === '|') s = s.slice(1);
  if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
  return s.split('|').map((cell) => cell.trim());
};

// (v9 #2) A formula selected out of a PDF arrives as BARE TeX — no `$…$`
// delimiters — and often spans several lines:
//
//   $$X_{(T+1):(T+S)} = F(X_{1:T}, E_{1:T}) \in \mathbb{R}^{M \times S}$$
//   X_{(T+1):(T+S)} = F(X_{1:T}, E_{1:T}) \in \mathbb{R}^{M \times S}
//
// Both have to end up typeset. Text that is already delimited (or is prose
// with inline math) goes through the Markdown renderer; undelimited source is
// wrapped in display math and handed to KaTeX directly.
function renderFormulaPreview(text) {
  const src = String(text == null ? '' : text).trim();
  if (!src) return null;
  // Both delimiter families count as "already delimited": `$$…$$`/`$…$`
  // and the LaTeX pair `\[…\]`/`\(…\)` that the model also emits. The `\(…\)`
  // body is matched with a lazy any-char pattern because the formula itself
  // contains parentheses (`X_{(T+1):(T+S)}`), which the old `[^)]*?` version
  // could never span.
  const hasDisplay = src.indexOf('$$') >= 0 || src.indexOf('\\[') >= 0;
  const hasInline = /\\\([\s\S]*?\\\)/.test(src) || /\$[^$\n]+\$/.test(src);
  if (hasDisplay || hasInline) return renderMarkdown(src);
  // Prose detection: a line of running English would be mangled by KaTeX,
  // whereas a formula is mostly symbols, operators and backslash commands.
  const words = src.split(/\s+/).filter((w) => w.length > 2 && /^[A-Za-z][A-Za-z'’-]*$/.test(w));
  const prose = words.length > src.split(/\s+/).length * 0.55 && words.length > 6;
  if (prose) return h('div', { className: 'elr-markdown' }, renderMarkdown(src));
  // Strip a stray pair of delimiters, then typeset as display math.
  let tex = src;
  if (tex.slice(0, 2) === '$$' && tex.slice(-2) === '$$') tex = tex.slice(2, -2);
  else if (tex.slice(0, 2) === '\\[' && tex.slice(-2) === '\\]') tex = tex.slice(2, -2);
  else if (tex.charAt(0) === '$' && tex.charAt(tex.length - 1) === '$') tex = tex.slice(1, -1);
  // Line breaks inside a formula are layout, not math: a PDF wraps a single
  // expression across lines, so they collapse to one space. (`\\` would need
  // an aligned/gathered environment and would render as a stray red token.)
  tex = tex.split('\n').map((line) => line.trim()).filter(Boolean).join(' ');
  return h('div', { className: 'elr-math-block' }, renderMath(tex, true));
}

// Block-level Markdown with the two additions the model actually emits:
// `$$…$$` / `\[…\]` display math and GitHub-style pipe tables.
function renderMarkdown(text, inline = renderInline) {
  const lines = String(text || '').split('\n');
  const nodes = [];
  let list = null;
  const flush = () => {
    if (!list) return;
    nodes.push(h(list.tag, { key: list.tag + nodes.length, start: list.start }, list.items));
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Display math, possibly spanning several lines. Both `$$…$$` and the
    // LaTeX pair `\[…\]` are supported: the model uses whichever it likes.
    const trimmed = line.trim();
    const opener = trimmed.startsWith('$$') ? '$$' : (trimmed.startsWith('\\[') ? '\\[' : '');
    if (opener) {
      const closer = opener === '$$' ? '$$' : '\\]';
      const after = trimmed.slice(opener.length);
      const closeAt = after.indexOf(closer);
      if (closeAt >= 0) {
        if (!after.slice(closeAt + closer.length).trim()) {
          flush();
          nodes.push(h('div', { key: 'dm' + i, className: 'elr-math-block' }, renderMath(after.slice(0, closeAt), true)));
          continue;
        }
      } else {
        flush();
        const buf = after ? [after] : [];
        let closed = false;
        for (let j = i + 1; j < lines.length; j++) {
          const row = lines[j];
          const at = row.indexOf(closer);
          if (at >= 0) {
            if (row.slice(0, at).trim()) buf.push(row.slice(0, at));
            i = j;
            closed = true;
            break;
          }
          buf.push(row);
        }
        nodes.push(h('div', { key: 'dm' + i, className: 'elr-math-block' }, renderMath(buf.join('\n'), true)));
        if (!closed) i = lines.length;
        continue;
      }
    }
    // Pipe table: a header row followed by a separator row.
    if (line.indexOf('|') >= 0 && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flush();
      const head = splitTableRow(line);
      const rows = [];
      let j = i + 2;
      for (; j < lines.length; j++) {
        const row = lines[j];
        if (!row.trim() || row.indexOf('|') < 0) break;
        rows.push(splitTableRow(row));
      }
      i = j - 1;
      nodes.push(h('div', { key: 'tb' + i, className: 'elr-table-wrap' },
        h('table', { className: 'elr-md-table' },
          h('thead', null, h('tr', null, head.map((cell, ci) =>
            h('th', { key: 'h' + ci }, inline(cell))))),
          h('tbody', null, rows.map((row, ri) =>
            h('tr', { key: 'r' + ri }, row.map((cell, ci) =>
              h('td', { key: 'c' + ci }, inline(cell))))))
        )
      ));
      continue;
    }
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      const level = Math.max(2, heading[1].length);
      nodes.push(h('h' + level, { key: 'h' + i }, inline(heading[2].replace(/[ \t]+#+$/, ''))));
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const tag = bullet ? 'ul' : 'ol';
      if (list?.tag !== tag) {
        flush();
        list = { tag, start: numbered ? Number(numbered[1]) : undefined, items: [] };
      }
      list.items.push(h('li', { key: 'li' + i }, inline(bullet ? bullet[1] : numbered[2])));
      continue;
    }
    flush();
    if (line.trim() === '') { nodes.push(h('div', { key: 'br' + i, style: { height: '6px' } })); continue; }
    nodes.push(h('p', { key: 'p' + i, style: { margin: '4px 0' } }, inline(line)));
  }
  flush();
  return nodes;
}

function renderFigureMarkdown(text) {
  const source = text.trim();
  const fenced = /^(`{3,}|~{3,})(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n\1$/i.exec(source);
  return renderMarkdown(fenced ? fenced[2] : source);
}

function renderGenerationMetadata(record, selection, t) {
  const saved = record || {};
  const unknown = t('generation.unrecorded');
  const nameOf = (route) => route.modelName || route.model;
  const effortOf = (route) => route.reasoningEffortName || route.reasoningEffort || (route.followDefault ? t('effort.follow') : '');
  const current = (value) => value ? t('generation.currentSetting', { value }) : unknown;
  const name = nameOf(saved);
  const model = name ? [saved.provider, name].filter(Boolean).join(' / ')
    : current(nameOf(selection) && [selection.provider, nameOf(selection)].filter(Boolean).join(' / '));
  const effort = effortOf(saved) || current(effortOf(selection));
  const route = [saved.provider, saved.model].filter(Boolean).join(' / ');
  const time = Date.parse(saved.generatedAt);
  return h('div', { className: 'elr-generation-meta' },
    h('span', { title: route || undefined }, t('generation.model', { model })),
    h('span', null, t('generation.effort', { effort })),
    h('span', null, t('generation.time') + ' ', Number.isFinite(time)
      ? h('time', { dateTime: saved.generatedAt, title: saved.generatedAt }, new Date(time).toLocaleString()) : unknown)
  );
}

const readerIcons = {
  play: Play, pause: Pause, refresh: RotateCw, copy: Copy, info: Info,
  dockRight: Sidebar, dockBottom: PanelBottom, font: TextSize, layout: LayoutDashboard,
  palette: Paintbrush, album: Images, folderOpen: FolderOpen,
  audio: AudioLines, rain: CloudRain, waves: Waves, repeat: Repeat, shuffle: Shuffle, volume: Volume,
  settings: Settings, translate: Languages, capture: Scan, home: Home, search: Search,
  note: FileText, term: CircleHelp, agent: Quote, previous: ChevronLeft, next: ChevronRight,
  down: ChevronDown, up: ChevronUp, zoomIn: ZoomIn, zoomOut: ZoomOut,
};

const readerIconPaths = {
  fontMinus: 'M2.5 15 6.5 5l4 10M4 11.5h5m4 .5h4.5',
  fontPlus: 'M2.5 15 6.5 5l4 10M4 11.5h5m4 .5h5m-2.5-2.5v5',
  collapse: 'm5 4 5 4 5-4M5 16l5-4 5 4',
  expand: 'm5 8 5-4 5 4M5 12l5 4 5-4',
  outline: 'M5 3.5h10a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15V5A1.5 1.5 0 0 1 5 3.5zM7.3 3.5v13M9.9 7h3.9m-3.9 3h3.9m-3.9 3h2.6',
  stowRight: 'M5 5l5 5-5 5m8-11v12',
  stowBottom: 'M5 5l5 5 5-5m-11 8h12',
  edit: 'M13.8 3.6a1.7 1.7 0 0 1 2.4 2.4l-8.6 8.6-3.3.8.8-3.3 8.7-8.5zM12.2 5.2l2.4 2.4',
  trash: 'M4.5 6h11M8 6V4.2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6m2 0-.7 9.3a1.5 1.5 0 0 1-1.5 1.4H8.2a1.5 1.5 0 0 1-1.5-1.4L6 6m2.7 3v4.5m2.6-4.5v4.5',
};

function readerIcon(name, size = 20, flip = false) {
  const Glyph = readerIcons[name];
  if (Glyph) return h(Glyph, { size, trigger: 'none', style: {
    '--kd-b': 'color-mix(in srgb, currentColor 40%, transparent)',
    transform: (name === 'dockRight' ? !flip : flip) ? 'scaleX(-1)' : undefined,
  } });
  return h('svg', { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
    style: flip ? { transform: 'scaleX(-1)' } : undefined,
  }, h('path', { d: readerIconPaths[name] }));
}

const post = postReader;

function copyText(text) {
  try { return navigator.clipboard.writeText(text); } catch (_) { return Promise.resolve(); }
}

// (v34 #2) Coalesce a drag gesture's DOM writes to ONE per animation frame.
//
// `pointermove` is not throttled to the refresh rate: a 1000 Hz gaming mouse
// delivers that many events per second, and every one of them used to write a
// width/height straight to the DOM. Each write invalidates layout, and the
// layout in question re-centres every pdf.js page (`.pdfViewer .page` is
// `margin: 1px auto`), so hundreds of queued writes per frame turned a drag
// into a slideshow. Buffering the newest value and painting it once inside a
// `requestAnimationFrame` keeps the gesture in step with what the screen can
// actually show — intermediate positions that would never be displayed are
// simply dropped, and the LAST value always wins.
function frameWriter(paint) {
  let frame = 0;
  let last = null;
  const run = () => {
    frame = 0;
    const value = last;
    last = null;
    if (value !== null && value !== undefined) paint(value);
  };
  const stop = () => {
    if (!frame) return;
    try {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(frame);
      else window.clearTimeout(frame);
    } catch (_) {}
    frame = 0;
  };
  return {
    push(value) {
      last = value;
      if (frame) return;
      frame = window.requestAnimationFrame
        ? window.requestAnimationFrame(run)
        : window.setTimeout(run, 16);
    },
    // Paint the pending value right now (used on pointerup so the release
    // frame cannot lag one event behind the commit).
    flush() {
      stop();
      run();
    },
    cancel() {
      stop();
      last = null;
    },
  };
}

// (v34 #2) "Cheap paint" mode for the duration of a size gesture. Card
// transitions and the PDF viewport's hit-testing are pure overhead while a
// handle is being dragged, and hover tracking over the text layer costs one
// hit test per frame on top of the layout the drag already forces.
const GESTURE_CLASS = 'elr-gesturing';
let gestureDepth = 0;
function gestureStart() {
  gestureDepth += 1;
  try { document.body.classList.add(GESTURE_CLASS); } catch (_) {}
}
function gestureEnd() {
  gestureDepth = Math.max(0, gestureDepth - 1);
  if (gestureDepth > 0) return;
  try { document.body.classList.remove(GESTURE_CLASS); } catch (_) {}
  try { document.dispatchEvent(new CustomEvent('reader-gesture-end')); } catch (_) {}
}

// (v18 #3) Edge/corner resize for the floating cards. The browser's native
// `resize: both` only ever exposes ONE handle in the bottom-right corner, which
// is what the reader complained about. These eight transparent strips sit on the
// four borders and the four corners and drag the corresponding side: the card's
// own { x, y, w, h } state is patched on every pointermove, so no CSS resize is
// involved and the geometry stays exact.
const RESIZE_EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function popupViewport() {
  const viewport = window.visualViewport;
  const x = (viewport && viewport.offsetLeft) || 0;
  const y = (viewport && viewport.offsetTop) || 0;
  const width = (viewport && viewport.width) || window.innerWidth || 1200;
  const height = (viewport && viewport.height) || window.innerHeight || 800;
  const chrome = window.getComputedStyle(document.documentElement);
  const frameTop = parseFloat(chrome.getPropertyValue('--dsh-frame-chrome-top'));
  const frameClearance = Number.isFinite(frameTop) ? frameTop : (parseFloat(chrome.getPropertyValue('--dsh-frame-top-clearance')) || 0);
  const titleBar = document.fullscreenElement?.classList.contains('elr-view') ? 0 : frameClearance;
  const gapX = Math.min(8, width / 4);
  const gapY = Math.min(8, height / 4);
  const bottom = y + height - gapY;
  return { left: x + gapX, top: Math.min(bottom - 1, Math.max(y, titleBar) + gapY), right: x + width - gapX, bottom };
}

function displayCardHeightLimit() {
  const viewport = window.visualViewport;
  const height = (viewport && viewport.height) || window.innerHeight || 800;
  return Math.max(CARD_MIN_H, Math.floor(height));
}

const clampPopup = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

function fitPopupBox(box, viewport) {
  const w = Math.min(box.w, viewport.right - viewport.left);
  const h = Math.min(box.h, viewport.bottom - viewport.top);
  return {
    w, h,
    x: clampPopup(box.x, viewport.left, viewport.right - w),
    y: clampPopup(box.y, viewport.top, viewport.bottom - h),
  };
}

function translationPopupMinimum(font, horizontal, showOriginal = true) {
  if (!showOriginal) return { w: Math.max(320, font * 16), h: Math.max(164, 114 + Math.ceil(font * 3.5)) };
  if (horizontal) return { w: Math.max(510, font * 24), h: Math.max(192, 132 + Math.ceil(font * 3.2)) };
  return { w: Math.max(352, font * 16), h: Math.max(252, 190 + font * 4) };
}

function translationPopupSize(original, result, font, horizontal, showOriginal = true) {
  const effectiveHorizontal = showOriginal && horizontal;
  const min = translationPopupMinimum(font, effectiveHorizontal, showOriginal);
  const source = String(original || '');
  const translated = String(result || '');
  const maxWidth = !showOriginal ? 540 : (effectiveHorizontal ? 790 : 640);
  const measureLen = !showOriginal ? Math.max(source.length, Math.round(translated.length * 1.4)) : source.length;
  const w = Math.min(maxWidth, min.w + Math.round(Math.sqrt(Math.max(0, measureLen - 20)) * 9.5));
  const paneWidth = Math.max(120, effectiveHorizontal ? (w - 78) / 2 : w - 58);
  const lines = (text) => text.split(/\r?\n/).reduce((count, line) => {
    const wide = (line.match(/[^\u0000-\u024f]/g) || []).length;
    const ems = wide + (line.length - wide) * .56;
    return count + Math.max(1, Math.ceil(ems * font / paneWidth));
  }, 0);
  const originalLines = lines(source);
  const resultLines = translated ? lines(translated) : Math.max(showOriginal ? 2 : 1, Math.ceil(originalLines * .8));
  const textLines = !showOriginal
    ? resultLines
    : (effectiveHorizontal ? Math.max(originalLines, resultLines) : Math.max(2, originalLines) + resultLines);
  const chromeH = !showOriginal ? 114 : (effectiveHorizontal ? 112 : 162);
  const h = Math.min(550, Math.max(min.h, Math.ceil(chromeH + textLines * font * 1.75)));
  return { w, h };
}

function selectionToolLayout(rect, popupHeight = 0) {
  const viewport = popupViewport();
  const width = Math.min(SELECTION_TOOL_WIDTH, viewport.right - viewport.left);
  const below = rect.bottom + SELECTION_TOOL_GAP;
  const above = rect.top - SELECTION_TOOL_GAP;
  const height = SELECTION_TOOL_HEIGHT + (popupHeight ? popupHeight + SELECTION_TOOL_GAP : 0);
  const roomBelow = viewport.bottom - below;
  const roomAbove = above - viewport.top;
  const top = roomBelow >= height || roomBelow >= roomAbove ? below : above - height;
  return {
    x: clampPopup(rect.left, viewport.left, viewport.right - width),
    y: clampPopup(top, viewport.top, viewport.bottom - height),
    w: width,
  };
}

function popupBelowSelectionTools(box, position) {
  return fitPopupBox({
    ...box, x: position.x, y: position.y + SELECTION_TOOL_HEIGHT + SELECTION_TOOL_GAP,
  }, popupViewport());
}

function selectionTranslationLayout(rect, box, minHeight) {
  const viewport = popupViewport();
  const toolHeight = SELECTION_TOOL_HEIGHT + SELECTION_TOOL_GAP;
  const available = viewport.bottom - viewport.top - toolHeight;
  const besideSelection = Math.max(viewport.bottom - rect.bottom, rect.top - viewport.top) - toolHeight - SELECTION_TOOL_GAP;
  const h = Math.max(1, Math.min(box.h, available, besideSelection >= minHeight ? besideSelection : available));
  const w = Math.min(box.w, viewport.right - viewport.left);
  const position = selectionToolLayout(rect, h);
  position.x = clampPopup(rect.left, viewport.left, viewport.right - Math.max(w, position.w));
  return { position, box: popupBelowSelectionTools({ ...box, w, h }, position) };
}

function functionCardOrder(saved) {
  const valid = Array.isArray(saved) ? saved.filter((key) => CARD_KEYS.includes(key)) : [];
  return [...new Set([...valid, ...CARD_KEYS])];
}

// Readers in the main view and sidebar share one set of floating windows.
const cardWindowHosts = new Set();
const cardWindowListeners = new Set();
let cardWindowHost = null;
const readCardWindowHost = () => cardWindowHost;
const subscribeCardWindowHost = (listener) => {
  cardWindowListeners.add(listener);
  return () => cardWindowListeners.delete(listener);
};
function selectCardWindowHost(host) {
  if (host === cardWindowHost) return;
  cardWindowHost = host;
  for (const listener of cardWindowListeners) listener();
}

function placeFunctionCard(box, open, viewport) {
  return fitPopupBox({ ...box, h: open ? box.h : CARD_HEADER_HEIGHT }, viewport);
}

function termPopoverSpace(rect, bounds, card = rect, dock = 'right') {
  const gap = 9;
  const width = Math.min(400, bounds.right - bounds.left);
  const height = Math.min(430, bounds.bottom - bounds.top);
  const centerX = rect.anchorX ?? (rect.left + rect.right) / 2;
  const centerY = rect.anchorY ?? (rect.top + rect.bottom) / 2;
  const sides = dock === 'bottom' ? ['above', 'left', 'right', 'below']
    : (dock === 'left' ? ['right', 'left', 'above', 'below'] : ['left', 'right', 'above', 'below']);
  const candidates = (target) => {
    const left = Math.max(0, Math.min(width, target.left - gap - bounds.left));
    const right = Math.max(0, Math.min(width, bounds.right - target.right - gap));
    const above = Math.max(0, Math.min(height, target.top - gap - bounds.top));
    const below = Math.max(0, Math.min(height, bounds.bottom - target.bottom - gap));
    const x = clampPopup(centerX - width / 2, bounds.left, bounds.right - width);
    const placements = {
      left: { width: left, maxHeight: height, x: target.left - gap - left },
      right: { width: right, maxHeight: height, x: target.right + gap },
      above: { width, maxHeight: above, x, edgeY: target.top - gap },
      below: { width, maxHeight: below, x, edgeY: target.bottom + gap },
    };
    return sides.map((side) => ({ ...placements[side], side, centerX, centerY }));
  };
  const hasRoom = (fit) => fit.width >= Math.min(250, width) && fit.maxHeight >= Math.min(145, height);
  const nearRow = candidates(rect);
  // Prefer the outside of the whole card, using the row itself as the
  // boundary when a narrow reader leaves little space around the card.
  return candidates(card).find(hasRoom) || nearRow.find(hasRoom)
    || nearRow.sort((a, b) => b.width * b.maxHeight - a.width * a.maxHeight)[0];
}

function placePopupNearRect(box, rect, viewport) {
  if (!rect) return fitPopupBox(box, viewport);
  const h = Math.min(box.h, viewport.bottom - viewport.top);
  const below = rect.bottom + 6;
  const above = rect.top - 6;
  const spaceBelow = viewport.bottom - below;
  const spaceAbove = above - viewport.top;
  const y = spaceBelow >= h || (spaceAbove < h && spaceBelow >= spaceAbove) ? below : above - h;
  return fitPopupBox({ ...box, x: rect.left, y }, viewport);
}

function placeNoteBubble(id, text, note, rect) {
  const viewport = popupViewport();
  const w = Math.min(392, viewport.right - viewport.left);
  const charsPerLine = Math.max(1, Math.floor((w - 38) / 12));
  const lines = String(note || '').split(/\r?\n/).reduce((total, line) => (
    total + Math.max(1, Math.ceil(line.length / charsPerLine))
  ), 0);
  const box = placePopupNearRect({
    x: viewport.left + 32, y: viewport.top + 32, w, h: Math.min(490, Math.max(NOTE_POPUP_MIN.h, 110 + lines * 20)),
  }, rect, viewport);
  return { id, text, note, ...box };
}

function resizePanelBox(origin, edge, dx, dy, bounds, minWidth, minHeight) {
  const right = origin.x + origin.w;
  const bottom = origin.y + origin.h;
  const width = Math.min(minWidth, bounds.right - bounds.left);
  const height = Math.min(minHeight, bounds.bottom - bounds.top);
  const x = edge.includes('w') ? clampPopup(origin.x + dx, bounds.left, right - width) : origin.x;
  const y = edge.includes('n') ? clampPopup(origin.y + dy, bounds.top, bottom - height) : origin.y;
  const endX = edge.includes('e') ? clampPopup(right + dx, x + width, bounds.right) : right;
  const endY = edge.includes('s') ? clampPopup(bottom + dy, y + height, bounds.bottom) : bottom;
  return { x, y, w: endX - x, h: endY - y };
}

function resizeHandles(onPatch, minWidth, minHeight, getBounds, { edges = RESIZE_EDGES, cancelRef, title } = {}) {
  return edges.map((edge) => h('span', {
    key: edge,
    className: 'elr-rz elr-rz-' + edge,
    title, 'aria-hidden': true,
    onPointerDown: (event) => {
      if (event.button !== 0 || event.isPrimary === false || cancelRef?.current) return;
      const handle = event.currentTarget;
      const card = handle.parentElement;
      if (!card) return;
      const start = card.getBoundingClientRect();
      const origin = { x: start.left, y: start.top, w: start.width, h: start.height };
      const originalStyle = { left: card.style.left, top: card.style.top, width: card.style.width, height: card.style.height };
      const bounds = getBounds?.() || { left: 0, top: 0, right: Infinity, bottom: Infinity };
      const computed = window.getComputedStyle(card);
      const inset = (properties) => computed.boxSizing === 'border-box' ? 0
        : properties.reduce((total, property) => total + (parseFloat(computed[property]) || 0), 0);
      const insetX = inset(['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']);
      const insetY = inset(['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']);
      const { clientX: startX, clientY: startY, pointerId: pointer } = event;
      let active = true;
      const nextBox = (ev) => resizePanelBox(origin, edge, ev.clientX - startX, ev.clientY - startY, bounds, minWidth, minHeight);
      const measuredPatch = (box) => {
        const patch = {};
        if (edge.includes('w')) patch.x = box.x;
        if (edge.includes('n')) patch.y = box.y;
        if (edge.includes('w') || edge.includes('e')) patch.w = box.w - insetX;
        if (edge.includes('n') || edge.includes('s')) patch.h = box.h - insetY;
        return patch;
      };
      const paint = (box) => {
        const patch = measuredPatch(box);
        if (patch.x !== undefined) card.style.left = patch.x + 'px';
        if (patch.y !== undefined) card.style.top = patch.y + 'px';
        if (patch.w !== undefined) card.style.width = patch.w + 'px';
        if (patch.h !== undefined) card.style.height = patch.h + 'px';
      };
      const painter = frameWriter(paint);
      const cleanup = () => {
        if (!active) return false;
        active = false;
        handle.classList.remove('is-resizing');
        card.classList.remove('is-resizing-edge');
        if (cancelRef?.current === cancel) cancelRef.current = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('blur', cancel);
        handle.removeEventListener('lostpointercapture', onCancel);
        try { if (handle.hasPointerCapture?.(pointer)) handle.releasePointerCapture(pointer); } catch (_) {}
        painter.cancel();
        gestureEnd();
        return true;
      };
      const move = (ev) => {
        if (ev.pointerId === pointer) painter.push(nextBox(ev));
      };
      const finish = (ev) => {
        if (ev.pointerId !== pointer || !cleanup()) return;
        const box = nextBox(ev);
        if ((ev.clientX === startX && ev.clientY === startY) || Object.keys(box).every((key) => box[key] === origin[key])) {
          Object.assign(card.style, originalStyle);
          return;
        }
        paint(box);
        onPatch(getBounds ? box : measuredPatch(box), edge);
      };
      const cancel = () => {
        if (cleanup()) Object.assign(card.style, originalStyle);
      };
      const onCancel = (ev) => { if (ev.pointerId === pointer) cancel(); };
      const onKey = (ev) => {
        if (ev.key !== 'Escape') return;
        ev.preventDefault();
        ev.stopPropagation();
        cancel();
      };
      if (cancelRef) cancelRef.current = cancel;
      handle.classList.add('is-resizing');
      card.classList.add('is-resizing-edge');
      gestureStart();
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('blur', cancel);
      handle.addEventListener('lostpointercapture', onCancel);
      try { handle.setPointerCapture(pointer); } catch (_) {}
      event.preventDefault();
      event.stopPropagation();
    },
  }));
}

function selectionPaneSize(split) {
  return 'calc(' + (split * 100) + '% - ' + (split * SELECTION_SPLITTER_SIZE) + 'px)';
}

function selectionPaneGrip(split, onSplit, label, cancelRef, sideBySide) {
  const minSize = sideBySide ? SELECTION_PANE_MIN_W : SELECTION_PANE_MIN_H;
  const growKey = sideBySide ? 'ArrowRight' : 'ArrowDown';
  const shrinkKey = sideBySide ? 'ArrowLeft' : 'ArrowUp';
  const pointerPosition = (event) => sideBySide ? event.clientX : event.clientY;
  const measure = (grip) => {
    const panes = grip.parentElement;
    return {
      panes,
      available: sideBySide ? panes.clientWidth - grip.offsetWidth : panes.clientHeight - grip.offsetHeight,
      originalSize: sideBySide ? grip.previousElementSibling.offsetWidth : grip.previousElementSibling.offsetHeight,
    };
  };
  const splitAt = (size, available) => {
    const floor = Math.min(minSize, available / 2);
    return clampPopup(size, floor, available - floor) / available;
  };
  return h('div', {
    className: 'elr-selection-split', role: 'separator', tabIndex: 0,
    title: label, 'aria-label': label, 'aria-orientation': sideBySide ? 'vertical' : 'horizontal',
    'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(split * 100),
    onKeyDown: (event) => {
      if (![shrinkKey, growKey, 'Home', 'End'].includes(event.key)) return;
      const { available, originalSize } = measure(event.currentTarget);
      if (available <= 0) return;
      const step = event.shiftKey ? 36 : 12;
      const position = event.key === 'Home' ? 0 : event.key === 'End' ? available
        : originalSize + (event.key === shrinkKey ? -step : step);
      event.preventDefault();
      onSplit(splitAt(position, available));
    },
    onPointerDown: (event) => {
      if (event.button !== 0 || event.isPrimary === false || cancelRef.current) return;
      const grip = event.currentTarget;
      const { panes, available, originalSize } = measure(grip);
      if (available <= 0) return;
      const scroller = sideBySide ? panes.closest('.elr-side-body') : panes.parentElement;
      const scroll = () => sideBySide ? scroller?.scrollLeft ?? 0 : scroller.scrollTop;
      const scrollStart = scroll();
      const start = pointerPosition(event);
      const { pointerId } = event;
      const delta = (next) => pointerPosition(next) - start + scroll() - scrollStart;
      const ratio = (next) => splitAt(originalSize + delta(next), available);
      const paint = (value) => panes.style.setProperty('--elr-selection-source', selectionPaneSize(value));
      const painter = frameWriter(paint);
      const remove = () => {
        if (cancelRef.current !== cancel) return false;
        cancelRef.current = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', interrupt);
        window.removeEventListener('keydown', escape, true);
        window.removeEventListener('blur', cancel);
        grip.removeEventListener('lostpointercapture', interrupt);
        try { if (grip.hasPointerCapture?.(pointerId)) grip.releasePointerCapture(pointerId); } catch (_) {}
        painter.cancel();
        gestureEnd();
        return true;
      };
      const move = (next) => {
        if (next.pointerId === pointerId) painter.push(ratio(next));
      };
      const up = (next) => {
        if (next.pointerId !== pointerId || !remove()) return;
        if (!delta(next)) { paint(split); return; }
        const value = ratio(next);
        paint(value);
        onSplit(value);
      };
      const cancel = () => { if (remove()) paint(split); };
      const interrupt = (next) => { if (next.pointerId === pointerId) cancel(); };
      const escape = (next) => {
        if (next.key !== 'Escape') return;
        next.preventDefault();
        next.stopPropagation();
        cancel();
      };
      cancelRef.current = cancel;
      gestureStart();
      grip.focus({ preventScroll: true });
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', interrupt);
      window.addEventListener('keydown', escape, true);
      window.addEventListener('blur', cancel);
      grip.addEventListener('lostpointercapture', interrupt);
      try { grip.setPointerCapture(pointerId); } catch (_) {}
      event.preventDefault();
      event.stopPropagation();
    },
  });
}

// (v13 #3) A pdf.js text-layer selection is NOT clean prose: every visual line
// ends in a hard newline, words are often split by an end-of-line hyphen
// ("remark-\nable"), and soft hyphens / ligatures / duplicate spaces leak in.
// Translating that verbatim is exactly why the result came back scrambled.
// Normalise it into real paragraphs BEFORE it is sent to the model.
function cleanSelectionText(raw) {
  let s = String(raw == null ? '' : raw);
  if (!s) return '';
  s = s.replace(/\r\n?/g, '\n');
  // soft hyphen, zero-width joiners, BOM; NBSP becomes a normal space.
  s = s.replace(/[\u00ad\u200b\u200c\u200d\u2060\ufeff]/g, '');
  s = s.replace(/\u00a0/g, ' ');
  // common typographic ligatures
  s = s.replace(/\ufb00/g, 'ff').replace(/\ufb01/g, 'fi').replace(/\ufb02/g, 'fl')
    .replace(/\ufb03/g, 'ffi').replace(/\ufb04/g, 'ffl');
  // De-hyphenate a word broken by a line wrap, but only when the next line
  // continues in lower case (a real compound like "state-of-the-\nArt"
  // keeps its hyphen).
  s = s.replace(/([A-Za-z])-\n([a-z])/g, '$1$2');
  // A single newline is a visual line wrap inside one paragraph -> space.
  // Two or more newlines are a genuine paragraph break -> exactly two.
  s = s.replace(/\n{2,}/g, '\u0000');
  s = s.replace(/\n/g, ' ');
  s = s.replace(/\u0000/g, '\n\n');
  s = s.replace(/[ \t]{2,}/g, ' ');
  s = s.split('\n').map((line) => line.trim()).join('\n');
  return s.trim();
}

// (v13 #4) A Selection can hold several ranges (Ctrl+select, or a selection
// crossing a pdf.js page boundary). `sel.toString()` is not reliable there,
// and the old 1500-char clip chopped the tail off a two-paragraph selection.
// Read every range explicitly, then clean the joined text once.
function selectionToText(sel) {
  if (!sel || sel.isCollapsed) return '';
  const pieces = [];
  const count = sel.rangeCount || 0;
  for (let i = 0; i < count; i++) {
    try {
      const r = sel.getRangeAt(i);
      const v = r ? pdfRangeText(r) : '';
      if (v) pieces.push(v);
    } catch (_) {}
  }
  if (!pieces.length) {
    try { pieces.push(String(sel.toString() || '')); } catch (_) {}
  }
  // (v14 #1) Join the ranges with a single newline, which cleanSelectionText
  // turns into a space. A multi-range selection is usually several fragments
  // of ONE continuous sentence (pdf.js splits it at a page boundary);
  // inserting "\n\n" would fabricate a paragraph break and split the Chinese
  // translation into disconnected blocks. A genuine "\n\n" already inside a
  // single range is still preserved by cleanSelectionText.
  return cleanSelectionText(pieces.join('\n'));
}

function pdfRangeText(range) {
  const start = range.startContainer;
  const first = (start.nodeType === Node.TEXT_NODE ? start.parentElement : start).closest?.('.textLayer');
  if (!first) return range.toString();
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = root.nodeType === Node.TEXT_NODE ? root : walker.nextNode();
  let previous;
  let text = '';
  for (; node; node = walker.nextNode()) {
    const span = node.parentElement?.closest('.textLayer span:not(.markedContent)');
    if (!span || !range.intersectsNode(node)) continue;
    const piece = node.data.slice(node === start ? range.startOffset : 0,
      node === range.endContainer ? range.endOffset : node.length);
    if (!piece) continue;
    const rect = span.getBoundingClientRect();
    const layer = span.closest('.textLayer');
    if (previous && previous.span !== span) {
      const verticalGap = Math.abs(rect.top - previous.rect.top);
      const height = Math.max(rect.height, previous.rect.height);
      if (previous.layer !== layer || verticalGap > height * 1.55) text = text.trimEnd() + '\n\n';
      else if (verticalGap > height * .55 || rect.left < previous.rect.left - height) text = text.trimEnd() + '\n';
      else if (rect.left - previous.rect.right > height * .11 && !/\s$/.test(text) && !/^\s/.test(piece)) text += ' ';
    }
    text += piece;
    previous = { span, rect, layer };
  }
  return text || range.toString();
}

function pdfGlyphAt(x, y) {
  const caret = document.caretPositionFromPoint?.(x, y);
  const node = caret?.offsetNode;
  if (node?.nodeType !== Node.TEXT_NODE || !node.parentElement?.closest('.textLayer span:not(.markedContent)')) return null;
  const range = document.createRange();
  for (const offset of [caret.offset, caret.offset - 1]) {
    if (offset < 0 || offset >= node.length) continue;
    const first = offset > 0 && /[\uDC00-\uDFFF]/.test(node.data[offset]) ? offset - 1 : offset;
    const end = first + (node.data.codePointAt(first) > 0xffff ? 2 : 1);
    if (!node.data.slice(first, end).trim()) continue;
    range.setStart(node, first);
    range.setEnd(node, end);
    const rect = range.getBoundingClientRect();
    if (x >= rect.left - .5 && x <= rect.right + .5 && y >= rect.top - 1.5 && y <= rect.bottom + 1.5) return { node, first, end };
  }
  return null;
}

function includePdfEdgeGlyphs(selection, startGlyph, endGlyph) {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  const forward = range.startContainer === selection.anchorNode && range.startOffset === selection.anchorOffset;
  const from = forward ? startGlyph : endGlyph;
  const to = forward ? endGlyph : startGlyph;
  const start = from?.node === range.startContainer && from.end === range.startOffset ? from.first : range.startOffset;
  const end = to?.node === range.endContainer && to.first === range.endOffset ? to.end : range.endOffset;
  if (start === range.startOffset && end === range.endOffset) return;
  if (forward) selection.setBaseAndExtent(range.startContainer, start, range.endContainer, end);
  else selection.setBaseAndExtent(range.endContainer, end, range.startContainer, start);
}

function selectionDraft(current, fragment, intent) {
  const previousPrefix = current.selectionPrefix || '';
  const prefix = intent === 'append' ? current.selectionEdit.trimEnd() : intent === 'extend' ? previousPrefix : '';
  const source = prefix ? fragment : fragment.slice(0, MAX_SELECTION);
  if (intent !== 'append' && current.selection === source && previousPrefix === prefix) return null;
  const draft = prefix ? prefix + '\n\n' + source : source;
  if (draft.length > MAX_SELECTION) return { overflow: true };
  return { selection: source, selectionEdit: draft, selectionPrefix: prefix, selectionResult: '' };
}

// (v35 #1) The sentence a selected term sits in. A single word carries almost no
// local sense, so the right-click explanation sends the surrounding sentence
// separately from the whole paper: that is what tells the model how the authors
// are USING the term here, not just what the term means in the abstract.
function termContextFromText(source, term) {
  const offset = source.toLowerCase().indexOf(term.toLowerCase());
  return offset < 0 ? source.slice(0, 1600).trim() : termContextWindow(source, offset, term.length);
}

const PAGE_THEME_SWATCHES = {
  default: 'linear-gradient(135deg, #ffffff 50%, #242a34 50%)',
  paper: '#f7f3ea',
  eye: '#f3ecd6',
  ivory: '#fbf9f3',
  mist: '#ecf2f8',
  sage: '#e8f2ea',
  linen: '#f2ede3',
  'dark-slate': '#1b2028',
  'dark-midnight': '#141d2b',
  'dark-sepia': '#211c17',
  'dark-forest': '#14211b',
  'dark-oled': '#0d0f14',
};

const UI_TONE_SWATCHES = {
  default: '#191c22',
  blue: '#d4e5f7',
  green: '#d5ebdd',
  amber: '#f4e3c5',
  pink: '#f5dbe3',
  'prism-light': 'linear-gradient(135deg, #d7e8ff, #f5d8f0)',
  navy: '#172235',
  ink: '#1c2026',
  forest: '#182821',
  plum: '#251d31',
  ember: '#2d1f1b',
  'prism-dark': 'linear-gradient(135deg, #1d2f52, #3e1f49)',
  'duo-blue': 'linear-gradient(135deg, #f8fbff 50%, #1c3554 50%)',
  'duo-orange': 'linear-gradient(135deg, #f5f5f5 50%, #5c3322 50%)',
  'duo-green': 'linear-gradient(135deg, #faf8f2 50%, #234232 50%)',
  'duo-purple': 'linear-gradient(135deg, #f4f3f8 50%, #382a52 50%)',
};

function albumFileUrl(folderPath, fileName, maxWidth = 0) {
  const base = 'litreader://app/album-file?folder=' + encodeURIComponent(folderPath) + '&name=' + encodeURIComponent(fileName);
  return maxWidth > 0 ? base + '&w=' + maxWidth : base;
}

const AlbumCard = React.memo(function AlbumCard({ folder, selectedImages, intervalSec, order = 'sequential', transition = 'fade', open, floatingHost, toneCls, header, onSaveAlbum, onContextMenu }) {
  const [state, setState] = React.useState({ folder: '', images: [], status: 'idle' });
  const [playState, setPlayState] = React.useState({ order: [], pos: 0, dir: 'next' });
  const [headVisible, setHeadVisible] = React.useState(false);
  const [picker, setPicker] = React.useState(null);
  const hideTimerRef = React.useRef(null);
  const pressingRef = React.useRef(false);
  const orderMode = normalizeAlbumOrder(order);
  const transitionMode = normalizeAlbumTransition(transition);

  const clearHideTimer = React.useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const availableSet = React.useMemo(() => new Set(state.images), [state.images]);
  const activeImages = React.useMemo(() => {
    if (!state.images.length) return [];
    const chosen = Array.isArray(selectedImages) ? selectedImages.filter((name) => availableSet.has(name)) : [];
    return chosen.length > 0 ? chosen : state.images;
  }, [availableSet, selectedImages, state.images]);

  const resolvedFolder = state.folder || folder;
  const hasPhotos = open && Boolean(resolvedFolder) && activeImages.length > 0;

  const scheduleAutoHide = React.useCallback(() => {
    clearHideTimer();
    if (!hasPhotos || pressingRef.current) return;
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setHeadVisible(false);
    }, ALBUM_HEAD_HIDE_MS);
  }, [clearHideTimer, hasPhotos]);

  const revealHead = React.useCallback(() => {
    if (!hasPhotos) return;
    setHeadVisible(true);
    scheduleAutoHide();
  }, [hasPhotos, scheduleAutoHide]);

  React.useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ folder: folder || prev.folder, images: prev.folder === (folder || prev.folder) ? prev.images : [], status: 'loading' }));
    const readerApi = window.reader;
    if (!readerApi?.listAlbumFolder) {
      setState({ folder: folder || '', images: [], status: folder ? 'unauthorized' : 'idle' });
      return undefined;
    }
    readerApi.listAlbumFolder(folder || '').then((result) => {
      if (cancelled) return;
      if (result?.unauthorized) {
        setState({ folder: folder || '', images: [], status: 'unauthorized' });
        return;
      }
      if (result?.missing) {
        setState({ folder: folder || '', images: [], status: 'missing' });
        return;
      }
      const images = Array.isArray(result?.images) ? result.images : [];
      const actualFolder = result?.path || folder || '';
      setState({ folder: actualFolder, images, status: actualFolder ? 'ready' : 'idle' });
    }).catch(() => {
      if (!cancelled) setState({ folder: folder || '', images: [], status: folder ? 'missing' : 'idle' });
    });
    return () => { cancelled = true; };
  }, [folder]);

  React.useEffect(() => {
    const n = activeImages.length;
    setPlayState((prev) => {
      if (n <= 0) return { order: [], pos: 0, dir: 'next' };
      const currentIdx = prev.order.length === n ? prev.order[prev.pos % n] : -1;
      if (orderMode === 'random') {
        return { order: buildAlbumPlayOrder(n, true, currentIdx), pos: 0, dir: 'next' };
      }
      const seq = buildAlbumPlayOrder(n, false);
      return { order: seq, pos: currentIdx >= 0 && currentIdx < n ? currentIdx : 0, dir: 'next' };
    });
  }, [activeImages, orderMode]);

  const advancePlayState = React.useCallback((delta) => {
    const n = activeImages.length;
    if (n <= 1) return;
    setPlayState((prev) => {
      const currentOrder = prev.order.length === n ? prev.order : buildAlbumPlayOrder(n, orderMode === 'random');
      const currentPos = Math.max(0, Math.min(n - 1, prev.pos));
      const nextPos = currentPos + delta;
      const dir = delta < 0 ? 'prev' : 'next';
      if (orderMode === 'random' && nextPos >= n) {
        const lastIdx = currentOrder[currentPos];
        return { order: buildAlbumPlayOrder(n, true, -1, lastIdx), pos: 0, dir };
      }
      return { order: currentOrder, pos: (nextPos + n) % n, dir };
    });
  }, [activeImages.length, orderMode]);

  React.useEffect(() => {
    clearHideTimer();
    if (!hasPhotos) {
      setHeadVisible(true);
      return undefined;
    }
    setHeadVisible(false);
    return undefined;
  }, [clearHideTimer, hasPhotos]);

  React.useEffect(() => clearHideTimer, [clearHideTimer]);

  React.useEffect(() => {
    if (!hasPhotos || activeImages.length <= 1) return undefined;
    const delayMs = normalizeAlbumInterval(intervalSec) * 1000;
    let id = null;
    const start = () => {
      if (id || document.hidden) return;
      id = setInterval(() => {
        advancePlayState(1);
      }, delayMs);
    };
    const stop = () => {
      if (id) {
        clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [activeImages.length, advancePlayState, hasPhotos, intervalSec]);

  React.useEffect(() => {
    if (!picker) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPicker(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picker]);

  const chooseFolder = async (event, insidePicker = false) => {
    event?.stopPropagation?.();
    const currentPath = (insidePicker ? picker?.folder : '') || state.folder || folder || '';
    const chosen = await window.reader?.chooseAlbumFolder?.(currentPath);
    if (!chosen?.path) return;
    const images = Array.isArray(chosen.images) ? chosen.images : [];
    if (images.length > 0) {
      setPicker({ folder: chosen.path, images, selected: [] });
      return;
    }
    if (insidePicker) {
      setPicker({ folder: chosen.path, images: [], selected: [] });
      return;
    }
    setState({ folder: chosen.path, images: [], status: chosen.missing ? 'missing' : 'ready' });
    setPlayState({ order: [], pos: 0, dir: 'next' });
    onSaveAlbum(chosen.path, []);
  };

  const openPickerForCurrent = (event) => {
    event?.stopPropagation?.();
    const currentFolder = state.folder || folder;
    if (!currentFolder || state.status === 'unauthorized' || state.status === 'missing') {
      chooseFolder(event);
      return;
    }
    revealHead();
    const currentValid = Array.isArray(selectedImages) ? selectedImages.filter((n) => availableSet.has(n)) : [];
    setPicker({ folder: currentFolder, images: state.images, selected: currentValid });
  };

  const togglePickedPhoto = (name) => {
    setPicker((prev) => {
      if (!prev) return prev;
      const exists = prev.selected.includes(name);
      return {
        ...prev,
        selected: exists ? prev.selected.filter((item) => item !== name) : [...prev.selected, name],
      };
    });
  };

  const confirmPicker = () => {
    if (!picker) return;
    const targetFolder = picker.folder;
    const images = picker.images;
    const selected = picker.selected.filter((name) => images.includes(name));
    setState({ folder: targetFolder, images, status: 'ready' });
    setPlayState({ order: [], pos: 0, dir: 'next' });
    setPicker(null);
    onSaveAlbum(targetFolder, selected);
  };

  const stepPhoto = (delta, event) => {
    event?.stopPropagation?.();
    if (!activeImages.length) return;
    revealHead();
    advancePlayState(delta);
  };

  const handlePointerDownCapture = () => {
    if (!hasPhotos) return;
    pressingRef.current = true;
    clearHideTimer();
    setHeadVisible(true);
    const release = () => {
      pressingRef.current = false;
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      scheduleAutoHide();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  };

  const effectiveOrder = playState.order.length === activeImages.length ? playState.order : null;
  const activePos = activeImages.length > 0 ? playState.pos % activeImages.length : 0;
  const activeIdx = effectiveOrder ? effectiveOrder[activePos] : activePos;
  const nextIdx = activeImages.length > 1
    ? (effectiveOrder ? effectiveOrder[(activePos + 1) % activeImages.length] : (activePos + 1) % activeImages.length)
    : -1;
  const activeName = hasPhotos ? activeImages[activeIdx] : '';
  const photoUrl = activeName ? albumFileUrl(resolvedFolder, activeName, 1200) : '';
  const nextName = hasPhotos && nextIdx >= 0 ? activeImages[nextIdx] : '';
  const nextPhotoUrl = nextName ? albumFileUrl(resolvedFolder, nextName, 1200) : '';
  const [photoLayer, setPhotoLayer] = React.useState({ current: '', prev: '', ready: false, animating: false, dir: 'next', seq: 0 });
  const fadeCleanupRef = React.useRef(null);
  const transitionRafRef = React.useRef(null);
  const currentImgRef = React.useRef(null);

  if (photoUrl !== photoLayer.current) {
    const hasPrev = Boolean(photoLayer.current && photoUrl);
    setPhotoLayer({
      current: photoUrl,
      prev: hasPrev ? photoLayer.current : '',
      ready: !hasPrev,
      animating: false,
      dir: playState.dir || 'next',
      seq: photoLayer.seq + 1,
    });
  }

  const triggerPhotoReveal = React.useCallback((targetUrl, targetSeq) => {
    if (transitionRafRef.current) cancelAnimationFrame(transitionRafRef.current);
    transitionRafRef.current = requestAnimationFrame(() => {
      transitionRafRef.current = null;
      setPhotoLayer((prevState) => {
        if (prevState.current !== targetUrl || prevState.seq !== targetSeq || prevState.ready) return prevState;
        const shouldAnimate = Boolean(prevState.prev && prevState.prev !== targetUrl);
        return { ...prevState, ready: true, animating: shouldAnimate };
      });
      if (fadeCleanupRef.current) clearTimeout(fadeCleanupRef.current);
      fadeCleanupRef.current = setTimeout(() => {
        fadeCleanupRef.current = null;
        setPhotoLayer((prevState) => (
          prevState.current === targetUrl && prevState.seq === targetSeq
            ? { ...prevState, prev: '', animating: false }
            : prevState
        ));
      }, ALBUM_TRANSITION_MS + 80);
    });
  }, []);

  React.useEffect(() => {
    if (fadeCleanupRef.current) {
      clearTimeout(fadeCleanupRef.current);
      fadeCleanupRef.current = null;
    }
    if (transitionRafRef.current) {
      cancelAnimationFrame(transitionRafRef.current);
      transitionRafRef.current = null;
    }
    if (!photoLayer.current || !photoLayer.prev) return undefined;
    const img = currentImgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      triggerPhotoReveal(photoLayer.current, photoLayer.seq);
    }
    return undefined;
  }, [photoLayer.current, photoLayer.seq, triggerPhotoReveal]);

  React.useEffect(() => {
    if (!nextPhotoUrl) return undefined;
    const preload = new Image();
    preload.decoding = 'async';
    preload.src = nextPhotoUrl;
    return () => { preload.src = ''; };
  }, [nextPhotoUrl]);

  const handleCurrentPhotoLoad = React.useCallback(() => {
    triggerPhotoReveal(photoLayer.current, photoLayer.seq);
  }, [photoLayer.current, photoLayer.seq, triggerPhotoReveal]);

  React.useEffect(() => () => {
    if (fadeCleanupRef.current) clearTimeout(fadeCleanupRef.current);
    if (transitionRafRef.current) cancelAnimationFrame(transitionRafRef.current);
  }, []);

  let emptyTitle = '选择照片文件夹';
  let emptyActionLabel = '选择文件夹';
  if (folder) {
    if (state.status === 'loading') emptyTitle = '正在读取文件夹照片…';
    else if (state.status === 'unauthorized' || state.status === 'missing') {
      emptyTitle = state.status === 'missing' ? '原文件夹已移动或不可访问' : '需要重新授权照片文件夹';
      emptyActionLabel = '重新选择文件夹';
    } else if (!state.images.length) {
      emptyTitle = '该文件夹内暂无支持的图片';
      emptyActionLabel = '更换文件夹';
    }
  }

  const pickerNode = picker && floatingHost ? createPortal(h('div', {
    className: 'elr-album-picker-backdrop' + (toneCls || ''),
    onClick: () => setPicker(null),
  },
    h('div', {
      className: 'elr-album-picker',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': '选择相册照片',
      onClick: (e) => e.stopPropagation(),
    },
      h('div', { className: 'elr-album-picker-head' },
        h('h3', { className: 'elr-album-picker-title' }, '选择相册照片'),
        h('span', { className: 'elr-album-picker-path', title: picker.folder }, picker.folder),
        h('button', {
          type: 'button',
          className: 'elr-btn',
          onClick: (e) => chooseFolder(e, true),
        }, '更换文件夹')
      ),
      h('div', { className: 'elr-album-picker-bar' },
        h('span', null, '共 ' + picker.images.length + ' 张照片 · ' + (picker.selected.length ? '已选 ' + picker.selected.length + ' 张' : '当前未选择（将轮播全部照片）')),
        h('button', {
          type: 'button',
          className: 'elr-btn',
          disabled: !picker.selected.length,
          onClick: () => setPicker((prev) => (prev ? { ...prev, selected: [] } : prev)),
        }, '清空选择（轮播全部）')
      ),
      picker.images.length ? h('div', { className: 'elr-album-picker-grid' },
        picker.images.map((name) => {
          const picked = picker.selected.includes(name);
          return h('button', {
            key: name,
            type: 'button',
            className: 'elr-album-thumb',
            'aria-pressed': picked,
            onClick: () => togglePickedPhoto(name),
          },
            h('img', {
              src: albumFileUrl(picker.folder, name, 360),
              alt: name,
              className: 'elr-album-thumb-img',
              loading: 'lazy',
              decoding: 'async',
              draggable: false,
            }),
            h('span', { className: 'elr-album-thumb-check', 'aria-hidden': true }, picked ? '✓' : ''),
            h('span', { className: 'elr-album-thumb-name', title: name }, name)
          );
        })
      ) : h('div', { className: 'elr-album-picker-grid' },
        h(EmptyState, {
          size: 'card',
          icon: 'image',
          title: '该文件夹内暂无支持的图片',
          primaryAction: { label: '更换文件夹', onClick: (e) => chooseFolder(e, true) },
        })
      ),
      h('div', { className: 'elr-album-picker-foot' },
        h('span', { className: 'elr-album-picker-foot-hint' }, '可点选单张或多张图片；不选则轮播整个文件夹'),
        h('div', { className: 'elr-album-picker-actions' },
          h('button', { type: 'button', className: 'elr-btn', onClick: () => setPicker(null) }, '取消'),
          h('button', { type: 'button', className: 'elr-btn primary', onClick: confirmPicker }, '确定')
        )
      )
    )
  ), floatingHost) : null;

  return h('div', {
    className: 'elr-album-card' + (hasPhotos ? ' has-photos' : '') + (hasPhotos && !headVisible ? ' is-head-hidden' : ''),
    onPointerDownCapture: handlePointerDownCapture,
    onClickCapture: revealHead,
    onFocusCapture: revealHead,
    onContextMenu,
  },
    header,
    hasPhotos ? h('div', {
      className: 'elr-album-stage elr-card-fold-content',
      'data-transition': transitionMode,
      'data-dir': photoLayer.dir || 'next',
      inert: !open,
    },
      photoLayer.prev && photoLayer.prev !== photoLayer.current ? h('img', {
        key: 'prev-' + photoLayer.seq + '-' + photoLayer.prev,
        src: photoLayer.prev,
        alt: '',
        'aria-hidden': true,
        className: 'elr-album-photo ' + (photoLayer.animating ? 'is-leaving' : 'is-visible'),
        decoding: 'async',
        draggable: false,
      }) : null,
      photoLayer.current ? h('img', {
        ref: currentImgRef,
        key: 'cur-' + photoLayer.seq + '-' + photoLayer.current,
        src: photoLayer.current,
        alt: activeName,
        className: 'elr-album-photo ' + (!photoLayer.ready ? 'is-entering' : (photoLayer.animating ? 'is-entering-active' : 'is-visible')),
        decoding: 'async',
        draggable: false,
        onLoad: handleCurrentPhotoLoad,
        onError: handleCurrentPhotoLoad,
      }) : null,
      h('div', { className: 'elr-album-hud', onClick: (e) => e.stopPropagation() },
        h('span', { className: 'elr-album-hud-count' }, (activePos + 1) + ' / ' + activeImages.length),
        activeImages.length > 1 ? h('button', {
          type: 'button', className: 'elr-album-hud-btn', title: '上一张', 'aria-label': '上一张',
          onClick: (e) => stepPhoto(-1, e),
        }, '‹') : null,
        activeImages.length > 1 ? h('button', {
          type: 'button', className: 'elr-album-hud-btn', title: '下一张', 'aria-label': '下一张',
          onClick: (e) => stepPhoto(1, e),
        }, '›') : null,
        h('button', {
          type: 'button', className: 'elr-album-hud-btn', title: '选择照片 / 文件夹', 'aria-label': '选择照片 / 文件夹',
          onClick: openPickerForCurrent,
        }, readerIcon('folderOpen', 13), '选照片')
      )
    ) : h('div', { className: 'elr-album-empty elr-card-fold-content', inert: !open },
      h(EmptyState, {
        size: 'card',
        icon: 'image',
        title: emptyTitle,
        primaryAction: state.status === 'loading' ? undefined : { label: emptyActionLabel, onClick: chooseFolder },
      })
    ),
    pickerNode
  );
});

function ambientUrl(folderPath, fileName) {
  if (!fileName) return '';
  if (!folderPath) return 'litreader://app/ambient-file?source=builtin&name=' + encodeURIComponent(fileName);
  return 'litreader://app/ambient-file?source=custom&folder=' + encodeURIComponent(folderPath) + '&name=' + encodeURIComponent(fileName);
}

const AmbientAudioChannel = React.memo(function AmbientAudioChannel({ url, volume, loop, playing, onEnded }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const audio = ref.current;
    if (audio) audio.volume = Math.min(1, Math.max(0, Number(volume) || 0));
  }, [volume]);
  React.useEffect(() => {
    const audio = ref.current;
    if (!audio || !url) return;
    if (!playing) {
      audio.pause();
      return;
    }
    audio.volume = Math.min(1, Math.max(0, Number(volume) || 0));
    const p = audio.play();
    if (p?.catch) p.catch(() => {});
  }, [playing, url]);
  return h('audio', { ref, src: url, loop, preload: 'auto', onEnded });
});

const AmbientCard = React.memo(function AmbientCard({ folder, track, mix, playMode, volume, presets, open, header, onUpdate }) {
  const [state, setState] = React.useState({ folder: '', tracks: [], status: 'loading' });
  const [playing, setPlaying] = React.useState(false);
  const [category, setCategory] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [editingPresetId, setEditingPresetId] = React.useState('');
  const [editingPresetName, setEditingPresetName] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ folder: folder || '', tracks: prev.folder === (folder || '') ? prev.tracks : [], status: 'loading' }));
    const readerApi = window.reader;
    if (!readerApi?.listAmbientTracks) {
      setState({ folder: folder || '', tracks: [], status: 'unauthorized' });
      return undefined;
    }
    readerApi.listAmbientTracks(folder || '').then((result) => {
      if (cancelled) return;
      if (result?.unauthorized) {
        setState({ folder: folder || '', tracks: [], status: 'unauthorized' });
        return;
      }
      if (result?.missing) {
        setState({ folder: folder || '', tracks: [], status: 'missing' });
        return;
      }
      const tracks = Array.isArray(result?.tracks) ? result.tracks : [];
      setState({ folder: folder ? (result?.path || folder) : '', tracks, status: 'ready' });
      setCategory('all');
    }).catch(() => {
      if (!cancelled) setState({ folder: folder || '', tracks: [], status: 'missing' });
    });
    return () => { cancelled = true; };
  }, [folder]);

  const tracks = state.tracks;
  const tracksByName = React.useMemo(() => new Map(tracks.map((item) => [item.name, item])), [tracks]);
  const mixMap = mix && typeof mix === 'object' ? mix : {};
  const presetList = Array.isArray(presets) ? presets : [];
  const activeMixEntries = React.useMemo(() => {
    const valid = Object.entries(mixMap).filter(([name]) => tracksByName.has(name));
    if (valid.length > 0) return valid;
    return [];
  }, [mixMap, tracksByName]);

  const masterVolume = Number.isFinite(Number(volume)) ? Math.min(1, Math.max(0, Number(volume))) : 0.8;
  const isRandomSingle = playMode === 'random' && activeMixEntries.length <= 1;

  const saveCurrentPreset = () => {
    if (!activeMixEntries.length) return;
    const names = activeMixEntries.map(([name]) => tracksByName.get(name)?.title || name);
    const defaultName = names.length <= 2 ? names.join(' + ') : names.slice(0, 2).join(' + ') + ' 等 ' + names.length + ' 音';
    const nextMix = Object.fromEntries(activeMixEntries.map(([name, vol]) => [name, vol]));
    const id = 'preset-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    onUpdate({ ambientPresets: [{ id, name: defaultName, mix: nextMix }, ...presetList] });
    setCategory('presets');
    setEditingPresetId(id);
    setEditingPresetName(defaultName);
  };

  const applyPreset = (preset) => {
    if (!preset?.mix) return;
    const keys = Object.keys(preset.mix);
    if (!keys.length) return;
    onUpdate({ ambientMix: { ...preset.mix }, ambientTrack: keys[0] });
    setPlaying(true);
  };

  const commitPresetRename = (id) => {
    const trimmed = editingPresetName.trim();
    if (trimmed) {
      onUpdate({
        ambientPresets: presetList.map((item) => (item.id === id ? { ...item, name: trimmed } : item)),
      });
    }
    setEditingPresetId('');
    setEditingPresetName('');
  };

  const deletePreset = (id) => {
    onUpdate({ ambientPresets: presetList.filter((item) => item.id !== id) });
    if (editingPresetId === id) {
      setEditingPresetId('');
      setEditingPresetName('');
    }
  };

  const resetBuiltin = (event) => {
    event?.stopPropagation?.();
    setPlaying(false);
    setCategory('all');
    setQuery('');
    onUpdate({
      ambientFolder: '',
      ambientTrack: '',
      ambientMix: {},
    });
  };

  const toggleTrack = (name) => {
    const next = { ...mixMap };
    if (name in next) {
      delete next[name];
      const remaining = Object.keys(next);
      onUpdate({ ambientMix: next, ambientTrack: remaining[0] || track });
      if (!remaining.length) setPlaying(false);
    } else {
      next[name] = 0.65;
      onUpdate({ ambientMix: next, ambientTrack: name });
      setPlaying(true);
    }
  };

  const setTrackVolume = (name, value) => {
    const clamped = Math.min(1, Math.max(0.05, Number(value) || 0.65));
    onUpdate({ ambientMix: { ...mixMap, [name]: clamped } });
  };

  const togglePlayAll = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (!activeMixEntries.length && tracks.length) {
      const seed = tracksByName.has(track) ? track : tracks[0].name;
      onUpdate({ ambientMix: { ...mixMap, [seed]: 0.65 }, ambientTrack: seed });
    }
    setPlaying(true);
  };

  const triggerRandomMix = () => {
    if (!tracks.length) return;
    const count = tracks.length === 1 ? 1 : (tracks.length >= 3 ? (Math.random() < 0.5 ? 2 : 3) : 2);
    const pool = [...tracks];
    const picked = {};
    for (let i = 0; i < count && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const [chosen] = pool.splice(idx, 1);
      picked[chosen.name] = Number((0.4 + Math.random() * 0.45).toFixed(2));
    }
    const keys = Object.keys(picked);
    onUpdate({ ambientMix: picked, ambientTrack: keys[0] || '' });
    setPlaying(true);
  };

  const handleEnded = (endedName) => {
    if (!playing || !tracks.length) return;
    if (playMode === 'random') {
      const idx = tracks.findIndex((item) => item.name === endedName);
      const nextIdx = pickNextAmbientIndex(tracks.length, Math.max(0, idx), 'random');
      const nextItem = tracks[nextIdx];
      if (nextItem) {
        onUpdate({
          ambientTrack: nextItem.name,
          ambientMix: { [nextItem.name]: mixMap[endedName] ?? 0.65 },
        });
      }
    }
  };

  const categories = React.useMemo(() => {
    const seen = new Map();
    for (const item of tracks) {
      if (item.category && item.category !== 'custom' && !seen.has(item.category)) {
        seen.set(item.category, item.categoryLabel || item.category);
      }
    }
    return [...seen.entries()];
  }, [tracks]);

  const visibleTracks = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return tracks.filter((item) => {
      if (category === 'active' && !(item.name in mixMap)) return false;
      if (category !== 'all' && category !== 'active' && item.category !== category) return false;
      if (q && !item.title.toLowerCase().includes(q) && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tracks, category, query, mixMap]);

  const sourceLabel = folder
    ? (folder.split(/[/\\]/).filter(Boolean).at(-1) || folder)
    : 'SoftEcho 白噪音 (' + tracks.length + ')';

  let emptyTitle = '暂无支持播放的音频';
  if (state.status === 'loading') emptyTitle = '正在读取音频列表…';
  else if (state.status === 'unauthorized' || state.status === 'missing') {
    emptyTitle = state.status === 'missing' ? '原文件夹已移动或不可访问' : '需要重新授权音频文件夹';
  }

  const isSameMix = (a, b) => {
    const ka = Object.keys(a || {});
    const kb = Object.keys(b || {});
    if (ka.length !== kb.length || !ka.length) return false;
    return ka.every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 0.01);
  };

  return h('div', { className: 'elr-ambient-card' },
    header,
    activeMixEntries.map(([name, trackVol]) => h(AmbientAudioChannel, {
      key: (folder || 'builtin') + '::' + name,
      url: ambientUrl(folder ? (state.folder || folder) : '', name),
      volume: masterVolume * trackVol,
      loop: !isRandomSingle,
      playing,
      onEnded: () => handleEnded(name),
    })),
    h('div', { className: 'elr-ambient-body elr-card-fold-content', inert: !open },
      h('div', { className: 'elr-ambient-source' },
        h('span', { className: 'elr-ambient-source-name', title: folder || '内置 SoftEcho 白噪音库（assets/sounds）' },
          sourceLabel + (activeMixEntries.length ? ' · 已混音 ' + activeMixEntries.length : '')
        ),
        activeMixEntries.length ? h('button', {
          type: 'button', className: 'elr-btn',
          onClick: () => { setPlaying(false); onUpdate({ ambientMix: {} }); },
        }, '清空') : null,
        folder ? h('button', { type: 'button', className: 'elr-btn', onClick: resetBuiltin }, '内置') : null,
        h('button', {
          type: 'button', className: 'elr-btn',
          disabled: !activeMixEntries.length,
          onClick: saveCurrentPreset,
        }, '收藏组合')
      ),
      category !== 'presets' && tracks.length > 6 ? h('div', { className: 'elr-ambient-search' },
        readerIcon('search', 13),
        h('input', {
          type: 'search',
          value: query,
          placeholder: '筛选白噪音（如：雨、烤火、图书馆）…',
          'aria-label': '筛选白噪音',
          onChange: (e) => setQuery(e.target.value),
        })
      ) : null,
      categories.length > 1 || activeMixEntries.length > 0 || presetList.length > 0 ? h('div', { className: 'elr-ambient-cats', role: 'tablist', 'aria-label': '白噪音分类' },
        h('button', {
          type: 'button', className: 'elr-ambient-cat', 'aria-pressed': category === 'all',
          onClick: () => setCategory('all'),
        }, '全部'),
        h('button', {
          type: 'button', className: 'elr-ambient-cat', 'aria-pressed': category === 'active',
          onClick: () => setCategory('active'),
        }, '已开启 (' + activeMixEntries.length + ')'),
        h('button', {
          type: 'button', className: 'elr-ambient-cat', 'aria-pressed': category === 'presets',
          onClick: () => setCategory('presets'),
        }, '收藏 (' + presetList.length + ')'),
        categories.map(([catId, catLabel]) => h('button', {
          key: catId, type: 'button', className: 'elr-ambient-cat', 'aria-pressed': category === catId,
          onClick: () => setCategory(catId),
        }, catLabel))
      ) : null,
      category === 'presets' ? (presetList.length ? h('div', { className: 'elr-ambient-presets' },
        presetList.map((preset) => {
          const isEditing = editingPresetId === preset.id;
          const isCurrent = isSameMix(preset.mix, mixMap);
          const summary = Object.entries(preset.mix)
            .map(([name, vol]) => (tracksByName.get(name)?.title || name.split('/').pop()) + ' ' + Math.round(vol * 100) + '%')
            .join(' · ');
          return h('div', { key: preset.id, className: 'elr-ambient-preset' + (isCurrent ? ' is-active' : '') },
            isEditing ? h('div', { className: 'elr-ambient-preset-edit' },
              h('input', {
                type: 'text',
                value: editingPresetName,
                autoFocus: true,
                maxLength: 40,
                'aria-label': '组合名称',
                onChange: (e) => setEditingPresetName(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitPresetRename(preset.id); }
                  else if (e.key === 'Escape') { e.preventDefault(); setEditingPresetId(''); setEditingPresetName(''); }
                },
                onBlur: () => commitPresetRename(preset.id),
              })
            ) : h('button', {
              type: 'button',
              className: 'elr-ambient-preset-apply',
              onClick: () => applyPreset(preset),
            },
              h('span', { className: 'elr-ambient-preset-name', title: preset.name }, preset.name),
              h('span', { className: 'elr-ambient-preset-meta', title: summary }, summary)
            ),
            h('div', { className: 'elr-ambient-preset-actions' },
              h('button', {
                type: 'button',
                className: 'elr-ambient-preset-btn',
                title: '重命名组合',
                'aria-label': '重命名组合',
                onClick: () => {
                  if (isEditing) commitPresetRename(preset.id);
                  else { setEditingPresetId(preset.id); setEditingPresetName(preset.name); }
                },
              }, readerIcon('edit', 12)),
              h('button', {
                type: 'button',
                className: 'elr-ambient-preset-btn is-danger',
                title: '删除组合',
                'aria-label': '删除组合',
                onClick: () => deletePreset(preset.id),
              }, readerIcon('trash', 12))
            )
          );
        })
      ) : h(EmptyState, {
        size: 'card',
        icon: 'star',
        title: '还没有收藏的白噪音组合',
      })) : (tracks.length ? (visibleTracks.length ? h('div', { className: 'elr-ambient-grid' },
        visibleTracks.map((item) => {
          const active = item.name in mixMap;
          const trackVol = active ? mixMap[item.name] : 0.65;
          const isPlaying = active && playing;
          return h('div', {
            key: item.name,
            className: 'elr-ambient-tile' + (active ? ' is-active' : '') + (isPlaying ? ' is-playing' : ''),
          },
            h('button', {
              type: 'button',
              className: 'elr-ambient-track',
              'aria-pressed': active,
              onClick: () => toggleTrack(item.name),
            },
              ambientTrackIcon(item, 14),
              h('span', { className: 'elr-ambient-track-title', title: item.title }, item.title),
              h('span', { className: 'elr-ambient-dot', 'aria-hidden': true })
            ),
            active ? h('div', { className: 'elr-ambient-tile-vol' },
              h('input', {
                type: 'range',
                min: 0.05,
                max: 1,
                step: 0.05,
                value: trackVol,
                'aria-label': item.title + ' 音量',
                onChange: (e) => setTrackVolume(item.name, e.target.value),
              }),
              h('span', null, Math.round(trackVol * 100) + '%')
            ) : null
          );
        })
      ) : h(EmptyState, {
        size: 'card',
        icon: 'search',
        title: category === 'active' ? '当前尚未开启任何白噪音' : '没有匹配的白噪音',
      })) : h(EmptyState, {
        size: 'card',
        icon: 'sliders',
        title: emptyTitle,
        primaryAction: state.status === 'loading' ? undefined : (folder ? { label: '恢复内置', onClick: resetBuiltin } : undefined),
      })),
      h('div', { className: 'elr-ambient-controls' },
        h('button', {
          type: 'button',
          className: 'elr-ambient-play',
          disabled: !tracks.length,
          onClick: togglePlayAll,
        }, readerIcon(playing ? 'pause' : 'play', 13), playing ? '暂停' : '播放'),
        h('button', {
          type: 'button',
          className: 'elr-ambient-mode',
          disabled: !tracks.length,
          title: playMode === 'random' ? '切换为循环混音' : '切换为单曲随机',
          onClick: () => onUpdate({ ambientMode: playMode === 'random' ? 'single' : 'random' }),
        }, readerIcon(playMode === 'random' ? 'shuffle' : 'repeat', 13), playMode === 'random' ? '随机播放' : '循环混音'),
        h('button', {
          type: 'button',
          className: 'elr-ambient-mode',
          disabled: !tracks.length,
          title: '随机组合多种白噪音同时播放',
          onClick: triggerRandomMix,
        }, '随机混音'),
        h('label', { className: 'elr-ambient-vol' },
          readerIcon('volume', 13),
          h('input', {
            type: 'range',
            min: 0,
            max: 1,
            step: 0.02,
            value: masterVolume,
            'aria-label': '白噪音总音量',
            'aria-valuetext': Math.round(masterVolume * 100) + '%',
            onChange: (e) => onUpdate({ ambientVolume: Number(e.target.value) }),
          }),
          h('output', { 'aria-hidden': true }, Math.round(masterVolume * 100) + '%')
        )
      )
    )
  );
});

const CLOCK_WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const ClockCard = React.memo(function ClockCard({ styleMode, use24h, showSeconds, open, isFloating, header, onUpdate, onMoveFloating }) {
  const [now, setNow] = React.useState(() => new Date());
  const [chromeVisible, setChromeVisible] = React.useState(false);
  const [directDragging, setDirectDragging] = React.useState(false);
  const hideChromeTimerRef = React.useRef(null);
  const pressingRef = React.useRef(false);
  const suppressClickRef = React.useRef(false);

  const clearHideChromeTimer = React.useCallback(() => {
    if (hideChromeTimerRef.current) {
      clearTimeout(hideChromeTimerRef.current);
      hideChromeTimerRef.current = null;
    }
  }, []);

  const scheduleHideChrome = React.useCallback(() => {
    clearHideChromeTimer();
    if (!isFloating || !open || pressingRef.current) return;
    hideChromeTimerRef.current = setTimeout(() => {
      hideChromeTimerRef.current = null;
      setChromeVisible(false);
    }, ALBUM_HEAD_HIDE_MS);
  }, [clearHideChromeTimer, isFloating, open]);

  const revealChrome = React.useCallback((event) => {
    if (!isFloating) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event?.stopPropagation?.();
      return;
    }
    setChromeVisible(true);
    scheduleHideChrome();
  }, [isFloating, scheduleHideChrome]);

  React.useEffect(() => {
    clearHideChromeTimer();
    if (!isFloating) {
      setChromeVisible(true);
      return undefined;
    }
    setChromeVisible(false);
    return undefined;
  }, [clearHideChromeTimer, isFloating]);

  React.useEffect(() => clearHideChromeTimer, [clearHideChromeTimer]);

  const handlePointerDownCapture = () => {
    if (!isFloating) return;
    pressingRef.current = true;
    clearHideChromeTimer();
    const release = () => {
      pressingRef.current = false;
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      scheduleHideChrome();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  };

  const handleClockBodyPointerDown = (event) => {
    if (!isFloating || chromeVisible || event.button !== 0 || !onMoveFloating) return;
    const cardEl = event.currentTarget.closest('[data-elr-floating-card="clock"]');
    if (!cardEl) return;
    event.preventDefault();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = cardEl.getBoundingClientRect();
    let active = false;
    let moved = false;
    let lastX = startRect.left;
    let lastY = startRect.top;
    const activate = () => {
      if (active) return;
      active = true;
      setDirectDragging(true);
      document.body.classList.add('elr-card-dragging');
    };
    const holdTimer = setTimeout(activate, 180);
    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!active) {
        if (Math.hypot(dx, dy) < 5) return;
        clearTimeout(holdTimer);
        activate();
      }
      moved = true;
      lastX = Math.max(8, Math.min(window.innerWidth - startRect.width - 8, startRect.left + dx));
      lastY = Math.max(8, Math.min(window.innerHeight - startRect.height - 8, startRect.top + dy));
      cardEl.style.left = lastX + 'px';
      cardEl.style.top = lastY + 'px';
    };
    const cleanupDrag = (commit) => {
      clearTimeout(holdTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      document.body.classList.remove('elr-card-dragging');
      setDirectDragging(false);
      if (active) {
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 0);
      }
      if (commit && moved) onMoveFloating(lastX, lastY);
    };
    const onUp = (upEvent) => { if (upEvent.pointerId === pointerId) cleanupDrag(true); };
    const onCancel = (cancelEvent) => { if (cancelEvent.pointerId === pointerId) cleanupDrag(false); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  React.useEffect(() => {
    if (!open) return undefined;
    setNow(new Date());
    let timer = null;
    const stepMs = showSeconds || styleMode === 'analog' ? 1000 : 15000;
    const start = () => {
      if (timer || document.hidden) return;
      setNow(new Date());
      timer = setInterval(() => setNow(new Date()), stepMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [open, showSeconds, styleMode]);

  const rawHours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const pad2 = (n) => String(n).padStart(2, '0');
  const displayHour = use24h ? rawHours : (rawHours % 12 || 12);
  const ampm = rawHours >= 12 ? 'PM' : 'AM';
  const dateText = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 · ' + CLOCK_WEEKDAYS[now.getDay()];

  const secAngle = seconds * 6;
  const minAngle = minutes * 6 + seconds * 0.1;
  const hourAngle = (rawHours % 12) * 30 + minutes * 0.5;

  return h('div', {
    className: 'elr-clock-card' + (isFloating ? ' is-floating' + (!chromeVisible ? ' is-chrome-hidden' : '') + (directDragging ? ' is-direct-dragging' : '') : ''),
    onPointerDownCapture: handlePointerDownCapture,
    onClickCapture: revealChrome,
    onFocusCapture: revealChrome,
  },
    header,
    h('div', { className: 'elr-clock-stage elr-card-fold-content', inert: !open },
      styleMode === 'analog' ? h('div', { className: 'elr-clock-analog', onPointerDown: handleClockBodyPointerDown },
        h('svg', { className: 'elr-clock-dial', viewBox: '0 0 120 120', role: 'img', 'aria-label': '模拟时钟 ' + pad2(displayHour) + ':' + pad2(minutes) },
          Array.from({ length: 12 }, (_, idx) => {
            const angle = (idx * 30 * Math.PI) / 180;
            const major = idx % 3 === 0;
            const r1 = major ? 46 : 48;
            const r2 = 53;
            return h('line', {
              key: idx,
              x1: 60 + Math.sin(angle) * r1,
              y1: 60 - Math.cos(angle) * r1,
              x2: 60 + Math.sin(angle) * r2,
              y2: 60 - Math.cos(angle) * r2,
              stroke: 'currentColor',
              strokeOpacity: major ? 0.58 : 0.28,
              strokeWidth: major ? 2 : 1.2,
              strokeLinecap: 'round',
            });
          }),
          h('line', {
            x1: 60, y1: 60, x2: 60, y2: 33,
            stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round',
            transform: 'rotate(' + hourAngle + ' 60 60)',
          }),
          h('line', {
            x1: 60, y1: 60, x2: 60, y2: 20,
            stroke: 'currentColor', strokeWidth: 2.1, strokeLinecap: 'round',
            transform: 'rotate(' + minAngle + ' 60 60)',
          }),
          showSeconds ? h('line', {
            x1: 60, y1: 68, x2: 60, y2: 16,
            stroke: 'var(--dsw-alias-brand-primary)', strokeWidth: 1.4, strokeLinecap: 'round',
            transform: 'rotate(' + secAngle + ' 60 60)',
          }) : null,
          h('circle', { cx: 60, cy: 60, r: 3.4, fill: 'var(--dsw-alias-brand-primary)' })
        ),
        h('div', { className: 'elr-clock-date' }, dateText)
      ) : h('div', { className: 'elr-clock-digital', onPointerDown: handleClockBodyPointerDown },
        h('div', { className: 'elr-clock-time-row' },
          !use24h ? h('span', { className: 'elr-clock-ampm' }, ampm) : null,
          h('span', { className: 'elr-clock-hhmm' }, pad2(displayHour) + ':' + pad2(minutes)),
          showSeconds ? h('span', { className: 'elr-clock-sec' }, pad2(seconds)) : null
        ),
        h('div', { className: 'elr-clock-date' }, dateText),
        showSeconds ? h('div', { className: 'elr-clock-progress', 'aria-hidden': true },
          h('span', { style: { width: ((seconds / 59) * 100).toFixed(1) + '%' } })
        ) : null
      ),
      h('div', { className: 'elr-clock-toolbar' },
        h('button', {
          type: 'button',
          className: 'elr-clock-pill',
          'aria-pressed': styleMode === 'digital',
          onClick: () => onUpdate({ clockStyle: styleMode === 'analog' ? 'digital' : 'analog' }),
        }, styleMode === 'analog' ? '指针表盘' : '数字时钟'),
        styleMode === 'digital' ? h('button', {
          type: 'button',
          className: 'elr-clock-pill',
          'aria-pressed': use24h,
          onClick: () => onUpdate({ clock24h: !use24h }),
        }, use24h ? '24 小时' : '12 小时') : null,
        h('button', {
          type: 'button',
          className: 'elr-clock-pill',
          'aria-pressed': showSeconds,
          onClick: () => onUpdate({ clockShowSeconds: !showSeconds }),
        }, showSeconds ? '显示秒' : '隐藏秒')
      )
    )
  );
});

function isPdf(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  return name.endsWith('.pdf') || file.type === 'application/pdf';
}

function Reader(props) {
  const t = props.t;
  const selectionHintId = React.useId();
  const readerRef = React.useRef(null);
  const fullscreenPendingRef = React.useRef(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [floatingHost] = React.useState(() => {
    const node = document.createElement('div');
    node.className = 'elr-floating-host';
    return node;
  });
  // Shared (persisted) view state — survives close/reopen and tab unmount.
  const [mode, setMode] = useShared('mode');
  const [text, setText] = useShared('text');
  const [savedSummary] = useShared('summary');
  const [summaryCoverage] = useShared('summaryCoverage');
  const [summaryMeta] = useShared('summaryMeta');
  const [savedSummaryDetail] = useShared('summaryDetail');
  const summaryDetail = savedSummaryDetail?.format === 'detailed-markdown' ? savedSummaryDetail : null;
  const summary = summaryDetail ? savedSummary : '';
  const [selection] = useShared('selection');
  // (v18 #4/#5) The editable English text shared by the inline card and the
  // side column. `selection` stays the untouched PDF selection.
  const [selectionEdit, setSelectionEdit] = useShared('selectionEdit');
  const [selectionResult, setSelectionResult] = useShared('selectionResult');
  const [pdfName, setPdfName] = useShared('pdfName');
  const [pageNum, setPageNum] = useShared('pageNum');
  const [sideWidth, setSideWidth] = useShared('sideWidth');
  const [dualSideWidth, setDualSideWidth] = useShared('dualSideWidth');
  const [sideHeight, setSideHeight] = useShared('sideHeight');
  const [dock, setDock] = useShared('dock');
  const [sideDock] = useShared('sideDock');
  const isLeftSide = dock !== 'bottom' && sideDock === 'left';
  const [panMode, setPanMode] = useShared('panMode');
  const [spreadMode, setSpreadMode] = useShared('spreadMode');
  const [pdfOffsetX, setPdfOffsetX] = useShared('pdfOffsetX');
  const pdfOffsetInputRef = React.useRef(null);
  const pdfOffsetOutputRef = React.useRef(null);
  const pdfOffsetResetRef = React.useRef(null);
  const pdfOffsetDraggingRef = React.useRef(false);
  const pdfOffsetWidthRef = React.useRef(0);
  const applyOffsetPreview = (rawVal, liveDrag = false) => {
    const val = Number(rawVal) || 0;
    const pct = (val + 100) / 2;
    const start = Math.min(50, pct) + '%';
    const end = Math.max(50, pct) + '%';
    const text = !val ? '居中' : ((val < 0 ? '左移 ' : '右移 ') + Math.abs(val) + '%');
    if (liveDrag && viewerElRef.current) {
      const width = pdfOffsetWidthRef.current || containerRef.current?.clientWidth || 0;
      viewerElRef.current.style.transform = 'translate3d(' + (val * width * 0.0045).toFixed(2) + 'px, 0, 0)';
    } else {
      containerRef.current?.style.setProperty('--elr-pdf-offset-x', String(val));
      if (viewerElRef.current) viewerElRef.current.style.transform = '';
    }
    if (pdfOffsetInputRef.current) {
      pdfOffsetInputRef.current.style.setProperty('--elr-fill-start', start);
      pdfOffsetInputRef.current.style.setProperty('--elr-fill-end', end);
      pdfOffsetInputRef.current.setAttribute('aria-valuetext', text);
    }
    if (pdfOffsetOutputRef.current) pdfOffsetOutputRef.current.textContent = text;
    if (pdfOffsetResetRef.current) pdfOffsetResetRef.current.disabled = !val;
  };
  React.useEffect(() => {
    if (pdfOffsetDraggingRef.current) return;
    const val = pdfOffsetX || 0;
    if (pdfOffsetInputRef.current) pdfOffsetInputRef.current.value = String(val);
    applyOffsetPreview(val, false);
  }, [pdfOffsetX]);
  const [capsulePosition] = useShared('capsulePosition');
  const [theme, setTheme] = useShared('theme');
  // (v40) Reader chrome tint (淡蓝 / 淡绿), independent from `theme` above.
  const [uiTone, setUiTone] = useShared('uiTone');
  const [bingWallpaperEnabled, setBingWallpaperEnabled] = useShared('bingWallpaperEnabled');
  const [bingWallpaper, setBingWallpaper] = React.useState(() => getBingWallpaperState());
  React.useEffect(() => subscribeBingWallpaper(setBingWallpaper), []);
  // Floating cards also need the tone when the portal host is under document.body.
  const toneCls = uiTone === 'default' ? '' : ' elr-tone-' + uiTone;
  const [popupOn, setPopupOn] = useShared('popupOn');
  const [autoTranslatePaper] = useShared('autoTranslatePaper');
  const [paperId, setPaperId] = useShared('paperId');
  // (v8 #6) Height of the upper side block, so the selection card and the
  // translation/analysis area can be sized independently.
  const [sideTopHeight, setSideTopHeight] = useShared('sideTopHeight');
  // (v25 #3) Width of that same block when the side panel is docked at the
  // bottom: the two halves sit side by side there, so the divider moves on the
  // horizontal axis and the size that has to be remembered is a width.
  const [sideTopWidth, setSideTopWidth] = useShared('sideTopWidth');
  // (v8 #7) Order of the movable side sections.
  const [sectionOrder, setSectionOrder] = useShared('sectionOrder');
  // (v27) Enabled function cards. Separate from `sectionOrder` so closing and
  // reopening a card keeps its position instead of appending it.
  const [cards] = useShared('cards');
  const [floatingCards, setFloatingCards] = useShared('floatingCards');
  const [floatingBounds, setFloatingBounds] = React.useState(popupViewport);
  const [frontCard, setFrontCard] = React.useState(null);
  const ownsCardWindows = React.useSyncExternalStore(subscribeCardWindowHost, readCardWindowHost) === floatingHost;
  const focusCardHandleRef = React.useRef(null);
  // (v21 #1) Parsed bibliography of the current paper, enriched with the
  // addresses the Host resolved. Stored with the analysis so a tab switch does
  // not throw it away.
  const [references, setReferences] = useShared('references');
  // (v28) Which view the analysis column shows: 'summary' | 'references'.
  const [analysisTab, setAnalysisTab] = useShared('analysisTab');
  const [agentQuote, setAgentQuote] = React.useState(null);
  const [agentModel, setAgentModel] = useShared('agentModel');
  const agentSelectionRef = React.useRef(null);
  const [figureSort, setFigureSort] = useShared('figureSort');
  const [selectionSplit, setSelectionSplit] = useShared('selectionSplit');
  const [selectionWidthSplit, setSelectionWidthSplit] = useShared('selectionWidthSplit');
  const [selectionCardOpen] = useShared('selectionCardOpen');
  const [selectionPopupTransparent] = useShared('selectionPopupTransparent');
  const [popupShowOriginal, setPopupShowOriginal] = useShared('popupShowOriginal');
  const popupOriginalVisible = popupShowOriginal !== false;
  // (v32 #1) Per-card widths for the side-by-side bottom dock only. `{}` means
  // "no override", which falls back to an even split of the row.
  const [albumOpen] = useShared('albumOpen');
  const [albumFolder] = useShared('albumFolder');
  const [albumImages] = useShared('albumImages');
  const [albumInterval, setAlbumInterval] = useShared('albumInterval');
  const [albumOrder] = useShared('albumOrder');
  const [albumTransition] = useShared('albumTransition');
  const albumIntervalSec = normalizeAlbumInterval(albumInterval);
  const albumOrderMode = normalizeAlbumOrder(albumOrder);
  const albumTransitionMode = normalizeAlbumTransition(albumTransition);
  const [ambientOpen] = useShared('ambientOpen');
  const [ambientFolder] = useShared('ambientFolder');
  const [ambientTrack] = useShared('ambientTrack');
  const [ambientMix] = useShared('ambientMix');
  const [ambientMode] = useShared('ambientMode');
  const [ambientVolume] = useShared('ambientVolume');
  const [ambientPresets] = useShared('ambientPresets');
  const [clockOpen] = useShared('clockOpen');
  const [clockStyle] = useShared('clockStyle');
  const [clock24h] = useShared('clock24h');
  const [clockShowSeconds] = useShared('clockShowSeconds');
  const [cardWidths, setCardWidths] = useShared('cardWidths');
  // (v38) Per-card heights for the stacked right dock only. `{}` means "no
  // override", which falls back to the even share introduced in v37.
  const [cardHeights, setCardHeights] = useShared('cardHeights');
  const [cardFont, setCardFont] = useShared('cardFont');
  const cardFontSize = Math.max(CARD_FONT_MIN, Math.min(CARD_FONT_MAX, Number(cardFont) || CARD_FONT_DEFAULT));
  const cardFontAdjust = (cardFontSize - CARD_FONT_DEFAULT) + 'px';
  const cardFontMenuId = React.useId();
  const themeMenuId = React.useId();
  const [cardMaxHeight, setCardMaxHeight] = React.useState(displayCardHeightLimit);
  const [featureColumns, setFeatureColumns] = useShared('featureColumns');
  const dualColumns = dock === 'right' && Number(featureColumns) === 2;
  const [customCardLayouts, setCustomCardLayouts] = useShared('customCardLayouts');
  const [layoutLimitReached, setLayoutLimitReached] = React.useState(false);
  const [workspaceStowed, setWorkspaceStowed] = React.useState(false);
  const workspaceId = React.useId();
  const workspaceCloseRef = React.useRef(null);
  const workspaceTabRef = React.useRef(null);
  const moveWorkspaceFocus = React.useRef(false);
  const layoutMenuId = React.useId();
  const layoutMenuRef = React.useRef(null);
  const [featureCardColumns] = useShared('featureCardColumns');
  const hostScheme = useHostScheme();
  const scheme = uiTone === 'default' ? hostScheme : (UI_TONES.dark.includes(uiTone) ? 'dark' : 'light');

  // Local (per-mount) state.
  const [meta, setMeta] = React.useState(null);
  const [catalog, setCatalog] = React.useState(null);
  const [selProvider, setSelProvider] = React.useState('');
  const [selModel, setSelModel] = React.useState('');
  const [selEffort, setSelEffort] = React.useState('');
  // (v12) Whether the user has made an explicit model choice. When false,
  // whole-document translation asks the Host for a fast model.
  const openModelSettings = props.onModelSettings;
  const activeCatalog = catalog?.revision === props.modelRevision ? catalog : null;
  const selectedEntry = activeCatalog?.providers.find((item) => item.id === selProvider)?.models.find((item) => item.id === selModel);
  const efforts = React.useMemo(() => {
    const available = availableEfforts(selProvider, selModel, selectedEntry);
    return { provider: selProvider, model: selModel, source: available.source,
      efforts: available.ids.map((id) => ({ id, name: effortLabels[id] })),
      defaultId: available.defaultId, defaultEffort: effortLabels[available.defaultId] || '' };
  }, [selProvider, selModel, selectedEntry]);
  const [recent, setRecent] = React.useState(() => {
    const saved = readStore(RECENT_KEY, []);
    const list = Array.isArray(saved) ? saved : [];
    // (#3 v1.0.5) Entries written by older versions may lack `identity`, which
    // is why the same paper kept appearing several times. Derive a stable
    // identity for every entry, then collapse duplicates keeping the newest.
    const seen = Object.create(null);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || typeof e !== 'object') continue;
      const identity = e.identity || [e.name || '', e.size || 0].join('|');
      if (seen[identity]) continue;
      seen[identity] = true;
      out.push(Object.assign({}, e, { identity }));
    }
    if (out.length !== list.length) writeStore(RECENT_KEY, out);
    return out.slice(0, RECENT_MAX);
  });
  const [recentOpen] = useShared('recentOpen');
  const [marksOpen] = useShared('marksOpen');
  const [analysisOpen, setAnalysisOpen] = useShared('analysisOpen');
  // (v27) Whether the card manager popover is showing. Purely local: it is a
  // transient menu, not a preference.
  const [cardMenuOpen, setCardMenuOpen] = React.useState(false);
  const cardMenuButtonRef = React.useRef(null);
  const cardMenuRef = React.useRef(null);
  const menuDragJustEndedRef = React.useRef(false);
  const [cardContext, setCardContext] = React.useState(null);
  const cardContextRef = React.useRef(null);
  const [marks, setMarks] = React.useState([]);
  const terms = React.useSyncExternalStore(subscribeTerms, () => getPaperTerms(paperId));
  // (v24 #2) Which records the list shows: 'all' | 'hl' | 'note'. Persisted so the
  // choice survives a remount (the Reader is unmounted when the view is switched).
  const [markFilter, setMarkFilter] = React.useState(() => {
    const saved = readStore(MARK_FILTER_KEY, 'all');
    return saved === 'hl' || saved === 'note' ? saved : 'all';
  });
  const marksListRef = React.useRef(null);
  const [markDetailId, setMarkDetailId] = React.useState('');
  const markDetailIdForA11y = React.useId();
  const [inlineNoteDrafts, setInlineNoteDrafts] = React.useState(() => new Map());
  React.useEffect(() => setInlineNoteDrafts(new Map()), [paperId]);
  const changeMarkFilter = (next) => {
    const value = next === 'hl' || next === 'note' ? next : 'all';
    if (value === markFilter) return;
    marksListRef.current?.scrollTo(0, 0);
    setMarkFilter(value);
    writeStore(MARK_FILTER_KEY, value);
  };
  const [selectionBusy, setSelectionBusy] = React.useState(false);
  const [termsOpen, setTermsOpen] = useShared('termsOpen');
  const [termOpenId, setTermOpenId] = React.useState('');
  const [termBubble, setTermBubble] = React.useState(null);
  const termBubbleId = React.useId();
  const termDetailId = React.useId();
  const termBubbleRef = React.useRef(null);
  const termsListRef = React.useRef(null);
  const newestTermId = terms[0]?.id;
  React.useLayoutEffect(() => {
    termsListRef.current?.scrollTo(0, 0);
  }, [newestTermId, termsOpen]);
  const [summaryBusy, setSummaryBusy] = React.useState(false);
  const [summaryIssue, setSummaryIssue] = React.useState('');
  // (v21 #1) Reference lookup runs right after the analysis, so it gets its own
  // transient busy flag: the analysis text is already usable while the addresses
  // are still being resolved.
  const [referencesBusy, setReferencesBusy] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [hasPdf, setHasPdf] = React.useState(false);
  const [pdfAnalysisReady, setPdfAnalysisReady] = React.useState(false);
  const [pdfTextBusy, setPdfTextBusy] = React.useState(false);
  const [pageCount, setPageCount] = React.useState(0);
  const [dropSeq, setDropSeq] = React.useState(0);
  const [pdfError, setPdfError] = React.useState('');
  const [previewMode, setPreviewMode] = React.useState('pdfjs');
  const [nativeUrl, setNativeUrl] = React.useState('');
  const [popup, setPopup] = React.useState(null);
  const [selectionTools, setSelectionTools] = React.useState(null);
  const selectionPopupElement = React.useRef(null);
  const selectionPopupMotion = React.useRef(null);
  const selectionPopupTrigger = React.useRef(null);
  React.useLayoutEffect(() => {
    const trigger = selectionPopupTrigger.current;
    const node = selectionPopupElement.current;
    if (!trigger || !node) return;
    selectionPopupTrigger.current = null;
    selectionPopupMotion.current = animateSelectionSurface(node, trigger.rect, trigger.keyboard, false, selectionPopupMotion.current);
  }, [popup]);
  React.useEffect(() => () => selectionPopupMotion.current?.cancel(), []);
  const inlinePopupRef = React.useRef(popup);
  inlinePopupRef.current = popup;
  const selectionToolsRef = React.useRef(selectionTools);
  selectionToolsRef.current = selectionTools;
  const selectedHighlightRef = React.useRef(null);
  // (v14 #2) Persisted, user-controlled font size for the inline-translation
  // card. Resizing the card no longer changes it implicitly.
  const [popupFont, setPopupFont] = React.useState(() => {
    const v = Number(readStore(POPUP_FONT_KEY, POPUP_FONT_DEFAULT));
    return Number.isFinite(v) ? Math.max(POPUP_FONT_MIN, Math.min(POPUP_FONT_MAX, v)) : POPUP_FONT_DEFAULT;
  });
  const changePopupFont = (delta) => {
    setPopupFont((prev) => {
      const next = Math.max(POPUP_FONT_MIN, Math.min(POPUP_FONT_MAX, prev + delta));
      writeStore(POPUP_FONT_KEY, next);
      return next;
    });
  };
  const [menu, setMenu] = React.useState(null);
  const [noteBubble, setNoteBubble] = React.useState(null);
  const noteBubbleRef = React.useRef(noteBubble);
  noteBubbleRef.current = noteBubble;
  const noteBubbleElement = React.useRef(null);
  const noteBubbleMotion = React.useRef(null);
  const noteBubbleTrigger = React.useRef(null);
  React.useLayoutEffect(() => {
    const trigger = noteBubbleTrigger.current;
    const node = noteBubbleElement.current;
    if (!trigger || !node) return;
    noteBubbleTrigger.current = null;
    noteBubbleMotion.current = animateSelectionSurface(node, trigger.rect, trigger.keyboard, false, noteBubbleMotion.current);
  }, [noteBubble]);
  React.useLayoutEffect(() => {
    if (selectionTools || popup || noteBubble) {
      document.dispatchEvent(new CustomEvent('reader-glass-sync'));
    }
  }, [Boolean(selectionTools), Boolean(popup), Boolean(noteBubble)]);
  React.useEffect(() => () => noteBubbleMotion.current?.cancel(), []);
  const [popupLayout, setPopupLayout] = useShared('popupLayout');
  const popupHorizontal = popupLayout === 'side-by-side';
  const summaryInfoId = React.useId();
  const [cardDrop, setCardDrop] = React.useState(null);
  const [ghost, setGhost] = React.useState(null);
  const cardGhostRef = React.useRef(null);
  const cardGestureCancelRef = React.useRef(null);
  const cardPositionsBeforeMove = React.useRef(null);
  const cardMoveAnimations = React.useRef(new Map());
  const floatingSettleRef = React.useRef(null);
  const floatingSettleAnimRef = React.useRef(null);
  // (v32 #3) Same idea for the two live-resize handles below: the pending pixel
  // size is written to the element during the gesture and only committed to
  // shared state on pointerup, so one drag re-renders once instead of ~60 times.
  const sideTopElRef = React.useRef(null);
  const sideElRef = React.useRef(null);
  const cardsBeforeFold = React.useRef(null);
  const cardFoldAnimations = React.useRef(new Map());

  const cancelCardFolds = () => {
    const running = cardFoldAnimations.current;
    for (const [card, animation] of running) {
      animation.cancel();
      card.removeAttribute('data-elr-folding');
    }
    running.clear();
    sideTopElRef.current?.querySelector('.elr-feature-grid')?.classList.remove('is-folding-cards');
  };

  const rememberCardFold = () => {
    const grid = !workspaceStowed ? sideTopElRef.current?.querySelector('.elr-feature-grid') : null;
    const scroll = grid && { top: grid.scrollTop, left: grid.scrollLeft };
    cancelCardFolds();
    cardsBeforeFold.current = grid ? { grid, scroll } : null;
  };

  React.useLayoutEffect(() => {
    const before = cardsBeforeFold.current;
    if (!before) return;
    cardsBeforeFold.current = null;
    before.grid?.scrollTo({ ...before.scroll, behavior: 'instant' });
  }, [selectionCardOpen, recentOpen, termsOpen, marksOpen, analysisOpen]);

  React.useEffect(() => () => cancelCardFolds(), [dock, paperId]);
  React.useLayoutEffect(() => {
    if (!moveWorkspaceFocus.current) return;
    moveWorkspaceFocus.current = false;
    (workspaceStowed ? workspaceTabRef : workspaceCloseRef).current?.focus({ preventScroll: true });
  }, [workspaceStowed]);

  const rememberCardPositions = (draggedKey, settling = false, ghostBox = null, ghostScale = 1) => {
    if (reduceMotion() && !settling) return;
    const cards = sideTopElRef.current?.querySelectorAll('[data-elr-docked-card]') || [];
    const boxes = new Map([...cards]
      .filter((card) => card.dataset.elrDockedCard !== draggedKey)
      .map((card) => [card.dataset.elrDockedCard, card.getBoundingClientRect()]));
    if (settling && draggedKey && ghostBox) {
      boxes.set(draggedKey, { left: ghostBox.x, top: ghostBox.y, width: ghostBox.w, height: ghostBox.h, scale: ghostScale });
    }
    cardPositionsBeforeMove.current = { settling, draggedKey: settling ? draggedKey : null, boxes };
  };

  React.useLayoutEffect(() => {
    const before = cardPositionsBeforeMove.current;
    if (!before) return;
    cardPositionsBeforeMove.current = null;
    const running = cardMoveAnimations.current;
    for (const animation of running.values()) animation.cancel();
    running.clear();

    const cards = sideTopElRef.current?.querySelectorAll('[data-elr-docked-card]:not(.dragging)') || [];
    const offsets = [...cards].flatMap((card) => {
      const key = card.dataset.elrDockedCard;
      const previous = before.boxes.get(key);
      if (!previous) return [];
      const current = card.getBoundingClientRect();
      const scale = previous.scale ?? 1;
      const prevLeft = previous.left + (previous.width * (1 - scale)) / 2;
      const prevTop = previous.top + (previous.height * (1 - scale)) / 2;
      const x = prevLeft - current.left;
      const y = prevTop - current.top;
      const sx = before.settling && key === before.draggedKey
        ? (previous.width * scale) / Math.max(1, current.width)
        : 1;
      const sy = before.settling && key === before.draggedKey
        ? (previous.height * scale) / Math.max(1, current.height)
        : 1;
      const scaled = Math.abs(sx - 1) >= 0.02 || Math.abs(sy - 1) >= 0.02;
      return Math.hypot(x, y) >= 1 || scaled ? [{ card, x, y, sx, sy, scaled }] : [];
    });
    const reduced = reduceMotion();
    const springEase = getComputedStyle(document.documentElement).getPropertyValue('--elr-reorder-spring').trim()
      || 'cubic-bezier(.22, 1.12, .36, 1)';
    const timing = reduced
      ? { duration: 0, easing: 'linear' }
      : before.settling
        ? { duration: 240, easing: springEase }
        : motionTiming('sm', 'move');
    if (reduced) return;
    for (const { card, x, y, sx, sy, scaled } of offsets) {
      const frames = scaled ? [
        { transformOrigin: 'top left', transform: 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + sx + ',' + sy + ')' },
        { transformOrigin: 'top left', transform: 'translate3d(0,0,0) scale(1, 1)' },
      ] : [{ transform: 'translate3d(' + x + 'px,' + y + 'px,0)' }, { transform: 'translate3d(0,0,0)' }];
      const animation = card.animate(frames, timing);
      animation.id = 'elr-card-avoidance';
      running.set(card, animation);
      animation.onfinish = () => running.delete(card);
    }
  }, [ghost, cardDrop, sectionOrder, featureCardColumns]);

  React.useEffect(() => {
    const running = cardMoveAnimations.current;
    return () => {
      for (const animation of running.values()) animation.cancel();
      running.clear();
      floatingSettleAnimRef.current?.cancel();
      floatingSettleAnimRef.current = null;
    };
  }, []);

  // Animate a floating card expanding back from its dragged capsule into full window size.
  React.useLayoutEffect(() => {
    const pending = floatingSettleRef.current;
    if (!pending || ghost) return;
    floatingSettleRef.current = null;
    if (reduceMotion()) return;
    const node = floatingHost.querySelector('[data-elr-floating-card="' + pending.key + '"]');
    if (!node) return;
    const to = node.getBoundingClientRect();
    const { from } = pending;
    if (!to.width || !to.height || !from?.w || !from?.h) return;
    floatingSettleAnimRef.current?.cancel();
    const fromScale = from.scale ?? 0.92;
    const fromX = from.x + (from.w * (1 - fromScale)) / 2;
    const fromY = from.y + (from.h * (1 - fromScale)) / 2;
    const dx = fromX - to.left;
    const dy = fromY - to.top;
    const sx = (from.w * fromScale) / Math.max(1, to.width);
    const sy = (from.h * fromScale) / Math.max(1, to.height);
    const animation = node.animate([
      {
        opacity: 0.9,
        transformOrigin: 'top left',
        transform: 'translate3d(' + dx + 'px,' + dy + 'px,0) scale(' + sx + ',' + sy + ')',
      },
      {
        opacity: 1,
        transformOrigin: 'top left',
        transform: 'translate3d(0,0,0) scale(1, 1)',
      },
    ], { duration: 200, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    floatingSettleAnimRef.current = animation;
    animation.onfinish = () => { if (floatingSettleAnimRef.current === animation) floatingSettleAnimRef.current = null; };
    animation.oncancel = () => { if (floatingSettleAnimRef.current === animation) floatingSettleAnimRef.current = null; };
  }, [floatingCards, ghost]);
  // (v8 #3) Formula explanation card: { x, y, text, body, busy }.
  const [formulaCard, setFormulaCard] = React.useState(null);
  const formulaRunRef = React.useRef(null);
  const [figurePicking, setFigurePicking] = React.useState(false);
  const [figureActivity, setFigureActivity] = React.useState(null);
  const [figureArchive, setFigureArchive] = React.useState(null);
  const [contentCategory, setContentCategory] = React.useState('visual');
  const [expandedContent, setExpandedContent] = React.useState({});
  const figureListRef = React.useRef(null);
  const revealFigureRef = React.useRef(null);
  const openFigureRef = React.useRef(null);
  const figureEntries = React.useMemo(() => figureArchive?.paper === paperId
    ? orderFigureEntries(figureArchive.entries.filter((entry) => entry
      && (entry.kind === 'formula') === (contentCategory === 'formula')), figureSort)
    : [], [figureArchive, paperId, figureSort, contentCategory]);
  const expandedFigure = expandedContent[contentCategory];
  const setExpandedFigure = (id) => setExpandedContent((previous) => ({ ...previous, [contentCategory]: id }));
  const showContentCategory = (category) => {
    setCardEnabled('figure', true);
    setAnalysisOpen((previous) => previous.figure ? previous : { ...previous, figure: true });
    setContentCategory(category);
  };
  const saveContentAnalysis = (paper, category, result) => {
    const entries = [result, ...loadFigureHistory(paper)];
    const saved = persistFigureHistory(paper, entries);
    revealFigureRef.current = result.id;
    setFigureArchive({ paper, entries });
    setExpandedContent((previous) => ({ ...previous, [category]: result.id }));
    return saved;
  };
  React.useLayoutEffect(() => {
    const list = figureListRef.current;
    const entry = openFigureRef.current;
    if (!revealFigureRef.current || revealFigureRef.current !== expandedFigure || !list || !entry) return;
    revealFigureRef.current = null;
    list.scrollTop += entry.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientTop;
  }, [expandedFigure, analysisTab, mode]);
  // (v9 #2) Re-render once KaTeX finishes loading, so a translation/formula
  // card that mounted before the script arrived upgrades from raw TeX to
  // typeset math without the user having to reopen it.


  const objectUrlRef = React.useRef('');
  const inputRef = React.useRef(null);
  const selectionSourceRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const coverFlight = React.useRef(null);
  const coverOrigin = React.useRef(null);
  const readingSpaceRef = React.useRef(null);
  const readingCapsuleRef = React.useRef(null);
  const viewerElRef = React.useRef(null);
  const pdfFileRef = React.useRef(null);
  const txtFileRef = React.useRef(null);
  const selectionSeq = React.useRef(0);
  const markLocateSeq = React.useRef(0);
  const lastFileRef = React.useRef(null);
  const viewerPromiseRef = React.useRef(null);
  const pdfStateRef = React.useRef(null);
  const pdfDocRef = React.useRef(null);
  const pdfLoadingTaskRef = React.useRef(null);
  const translateRef = React.useRef(async () => {});
  // (v17 #3) Selecting text only STAGES the selection: the English text is shown
  // immediately and the model is called only when the reader presses 翻译.
  const stageRef = React.useRef(() => {});
  const popupDragCancelRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const resizeRef = React.useRef(null);
  const splitRef = React.useRef(null);
  const sideTopHeightRef = React.useRef(sideTopHeight);
  sideTopHeightRef.current = sideTopHeight;
  // (v25 #3) The same block's horizontal size, used by the divider when the side
  // panel is docked at the bottom.
  const sideTopWidthRef = React.useRef(sideTopWidth);
  sideTopWidthRef.current = sideTopWidth;
  const dockRef = React.useRef(dock);
  dockRef.current = dock;

  const refRunRef = React.useRef(null);
  const pdfReferenceSourceRef = React.useRef(null);
  const pdfTextJobRef = React.useRef(null);
  const figurePickingRef = React.useRef(false);
  const figureRunRef = React.useRef(null);
  const summaryRunRef = React.useRef(null);
  const paperIdRef = React.useRef(paperId);
  paperIdRef.current = paperId;
  const marksRef = React.useRef(marks);
  marksRef.current = marks;
  const popupOnRef = React.useRef(popupOn);
  popupOnRef.current = popupOn;
  const spreadModeRef = React.useRef(spreadMode);
  spreadModeRef.current = spreadMode;
  const applyHighlightsRef = React.useRef(() => {});
  // (v18 #2) Per-page scratch data for the decoration pass: the whitespace-
  // stripped text index (cached between passes) and a flag telling whether any
  // span currently carries our `elr-hl-note` class / `elrMark` dataset, so the
  // document-wide cleanup is skipped whenever there is nothing to clean.
  const pageTextCache = new WeakMap();
  const hlTagsRef = React.useRef(false);
  const customRanges = React.useRef([]);
  // (v13 #1) pdf.js fires `textlayerrendered` / `pagerendered` once PER PAGE.
  // The old handlers ran a full-document `applyHighlights()` (querying every
  // span of every page, building Range rects, and re-rendering theme canvases)
  // for each of those events, so a 30-page paper did the same heavy pass 60+
  // times back-to-back and froze the UI. Coalesce whole bursts into ONE pass.
  const decorateTimerRef = React.useRef(null);
  const scheduleDecorate = () => {
    if (decorateTimerRef.current) clearTimeout(decorateTimerRef.current);
    decorateTimerRef.current = setTimeout(() => {
      decorateTimerRef.current = null;
      applyHighlightsRef.current();
      paintFindHitsRef.current();
    }, DECORATE_DEBOUNCE_MS);
  };
  const scheduleDecorateRef = React.useRef(() => {});
  scheduleDecorateRef.current = scheduleDecorate;

  const noticeSeqRef = React.useRef(0);
  const notify = (message, kind = '') => setNotice(message ? { id: ++noticeSeqRef.current, message, kind } : null);

  React.useEffect(() => {
    if (!notice) return;
    const delay = notice.kind === 'error' || notice.kind === 'warn' ? 7000 : notice.kind === 'ok' ? 2400 : 3500;
    const timeout = window.setTimeout(() => setNotice(null), delay);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  React.useLayoutEffect(() => {
    const syncFullscreen = () => {
      const reader = readerRef.current;
      const active = Boolean(reader && document.fullscreenElement === reader);
      // Keep the portal container stable so floating cards survive the move.
      const target = active ? reader : document.body;
      if (floatingHost.parentNode !== target) target.appendChild(floatingHost);
      setIsFullscreen(active);
    };
    syncFullscreen();
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      floatingHost.remove();
    };
  }, [floatingHost]);

  const toggleFullscreen = async () => {
    const reader = readerRef.current;
    if (!reader || fullscreenPendingRef.current) return;
    fullscreenPendingRef.current = true;
    try {
      if (window.reader?.platform === 'darwin') await window.reader.toggleFullscreen();
      else if (document.fullscreenElement === reader) await document.exitFullscreen();
      else await reader.requestFullscreen();
    } catch (_) {
      notify(t('fullscreen.failed'), 'error');
    } finally {
      fullscreenPendingRef.current = false;
    }
  };

  React.useEffect(() => {
    let alive = true;
    fetchReader(BASE + '/meta', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => { if (alive && data && data.ok) setMeta(data); })
      .catch(() => {});
    fetchReader(BASE + '/models', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => {
        if (!alive || !data || !data.ok) return;
        setCatalog({ ...data, revision: props.modelRevision });
        const saved = props.modelRevision ? {} : readStore(MODEL_KEY, null) || {};
        const current = data.current || {};
        const providers = Array.isArray(data.providers) ? data.providers : [];
        let p = String(saved.provider || current.provider || (providers[0] && providers[0].id) || '').trim();
        let m = String(saved.model || current.model || '').trim();
        if (!providers.some((x) => x.id === p)) p = current.provider || providers[0]?.id || '';
        if (!providers.some((x) => x.id === p && x.models.some((entry) => entry.id === m))) {
          m = p === current.provider ? current.model : '';
        }
        const found = providers.find((x) => x.id === p);
        const models = found && Array.isArray(found.models) ? found.models : [];
        if (!models.some((x) => x.id === m)) m = models[0]?.id || '';
        setSelProvider(p);
        setSelModel(m);
        const savedEffort = p === saved.provider && m === saved.model ? saved.reasoningEffort : undefined;
        const e = String(savedEffort ?? (p === current.provider && m === current.model ? current.reasoningEffort : '') ?? '').trim();
        setSelEffort(e);
        if (p && m) writeStore(MODEL_KEY, { provider: p, model: m, reasoningEffort: e });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [props.modelRevision]);

  const modelBody = () => {
    const body = { paper: readShared().paperId };
    if (selectedEntry) {
      body.provider = selProvider;
      body.model = selModel;
      body.reasoningEffort = selEffort;
    }
    return body;
  };
  bodyRef.current = modelBody;

  const describeModelSelection = (request) => {
    const provider = request.provider || meta?.provider || '';
    const model = request.model || meta?.model || '';
    const advertised = catalog?.providers?.find((item) => item.id === provider)?.models;
    const modelName = advertised?.find((item) => item.id === model)?.name || model;
    const matchingEfforts = efforts?.provider === provider && efforts?.model === model ? efforts : null;
    const hostEffort = provider === meta?.provider && model === meta?.model ? meta.reasoningEffort : '';
    const reasoningEffort = (request.reasoningEffort ?? hostEffort) || matchingEfforts?.defaultId || '';
    const reasoningEffortName = matchingEfforts?.efforts.find((item) => item.id === reasoningEffort)?.name || reasoningEffort;
    return { provider, model, modelName, reasoningEffort, reasoningEffortName, followDefault: !request.reasoningEffort };
  };

  const persistModel = (provider, model, effort) => {
    writeStore(MODEL_KEY, { provider, model, reasoningEffort: effort });
  };

  React.useEffect(() => {
    if (!selectedEntry || !selEffort || efforts.efforts.some((item) => item.id === selEffort)) return;
    setSelEffort('');
    persistModel(selProvider, selModel, '');
  }, [efforts, selEffort, selectedEntry]);

  // Restore the records for the active paper.
  React.useEffect(() => {
    const id = paperId;
    revealFigureRef.current = null;
    setExpandedContent({});
    setContentCategory('visual');
    setTermBubble(null);
    setTermOpenId('');
    if (!id) { setFigureArchive(null); return; }
    const r = { ...(id === legacyPaperId && legacyAnalysis), ...loadResult(id) };
    writeShared({
      summary: typeof r.summary === 'string' ? r.summary : '', summaryCoverage: r.summaryCoverage || null,
      summaryMeta: r.summaryMeta || null, summaryDetail: r.summaryDetail || null,
    });
    setFigureArchive({ paper: id, entries: loadFigureHistory(id, r.figure ?? null) });
    // (v21 #1) Restore the resolved bibliography together with the analysis it
    // was gathered for, so reopening a paper does not re-query Crossref.
    setReferences(Array.isArray(r.references) ? r.references.map((item) => (
      item && item.url && !item.startLine ? { ...item, status: 'legacy' } : item
    )) : []);
    const list = loadMarks(id);
    marksRef.current = list;
    setMarks(list);
    try { if (globalThis.CSS && CSS.highlights) CSS.highlights.delete('elr-lit-note'); } catch (_) {}
  }, [paperId]);

  const setFigurePickMode = (on) => {
    figurePickingRef.current = on;
    setFigurePicking(on);
    if (on) setSelectionTools(null);
  };
  const cancelFigureWork = () => {
    const run = figureRunRef.current;
    figureRunRef.current = null;
    if (run) {
      run.controller.abort();
      try { run.task?.cancel(); } catch (_) {}
    }
  };
  const cancelFormulaWork = () => {
    const run = formulaRunRef.current;
    formulaRunRef.current = null;
    if (run) {
      run.controller.abort();
      try { run.task?.cancel(); } catch (_) {}
    }
  };
  const cancelAnalysisTasks = () => {
    if (refRunRef.current) refRunRef.current.controller.abort();
    if (summaryRunRef.current) summaryRunRef.current.abort();
    refRunRef.current = null;
    summaryRunRef.current = null;
    cancelFigureWork();
    cancelFormulaWork();
  };
  const resetAnalysisTasks = () => {
    cancelAnalysisTasks();
    setSummaryIssue('');
    setFigurePickMode(false);
    setFigureActivity(null);
    setReferencesBusy(false);
    setSummaryBusy(false);
  };
  React.useEffect(() => () => {
    cancelAnalysisTasks();
    selectionSeq.current++;
  }, []);

  // (#3) Reopen the in-memory PDF after this Reader is remounted.
  // (v24 #1) …and after a page RELOAD the bytes come from IndexedDB instead, so
  // the paper the snapshot points at is still open when the tab comes back.
  React.useEffect(() => {
    if (mode !== 'pdf' || !paperId) return;
    const cached = fileCache.get(paperId);
    if (cached && !pdfDocRef.current) {
      lastFileRef.current = cached;
      setDropSeq((n) => n + 1);
      return;
    }
    if (pdfDocRef.current) return;
    getStoredFile(paperId).then((record) => {
      if (!record || pdfDocRef.current || readShared().paperId !== paperId || readShared().mode !== 'pdf') return;
      const file = reviveStoredFile(record);
      if (!file) return;
      // The desktop database may have records absent from the local cache.
      setFigureArchive({ paper: paperId, entries: loadFigureHistory(paperId) });
      fileCache.set(paperId, file);
      lastFileRef.current = file;
      setDropSeq((n) => n + 1);
    }).catch(() => {});
  }, []);

  const addRecent = (entry) => {
    setRecent((prev) => {
      const rest = (prev || []).filter((x) => x && x.id !== entry.id &&
        !(entry.identity && x.identity && x.identity === entry.identity));
      const next = [entry].concat(rest).slice(0, RECENT_MAX);
      writeStore(RECENT_KEY, next);
      return next;
    });
  };

  const cancelCoverFlight = React.useCallback(() => {
    const flight = coverFlight.current;
    if (!flight) return;
    coverFlight.current = null;
    window.clearTimeout(flight.timeout);
    window.cancelAnimationFrame(flight.measureFrame);
    flight.maskedViewer?.removeAttribute('data-cover-opening');
    flight.animation?.cancel();
    flight.reveal?.cancel();
    flight.visual.remove();
  }, []);
  const startCoverFlight = (origin, box, returning) => {
    cancelCoverFlight();
    const visual = coverVisual(origin.image, box, floatingHost);
    const maskedViewer = returning ? null : containerRef.current;
    maskedViewer?.setAttribute('data-cover-opening', '');
    const flight = { ...origin, box, returning, visual, maskedViewer,
      // A slow or failed render falls back to the normal PDF viewer.
      timeout: window.setTimeout(cancelCoverFlight, 1800) };
    coverFlight.current = flight;
    return flight;
  };
  const finishCoverFlight = React.useCallback((flight, node, box) => {
    if (!box || Math.abs(box.width / box.height - flight.box.width / flight.box.height) > .05) {
      cancelCoverFlight();
      return false;
    }
    window.clearTimeout(flight.timeout);
    const timing = motionTiming('lg', 'move', flight.keyboard);
    if (!timing.fadeOnly) timing.duration = motionDuration('exit-lg');
    flight.animation = flight.visual.animate(timing.fadeOnly
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ transform: 'none', opacity: 1 }, { transform: boxTransform(box, flight.box), opacity: 1, offset: .86 },
          { transform: boxTransform(box, flight.box), opacity: 0 }], { ...timing, fill: 'both' });
    flight.reveal = node.animate([{ opacity: 0 }, { opacity: 0, offset: timing.fadeOnly ? 0 : .86 }, { opacity: 1 }],
      { ...timing, easing: motionEasing('enter') });
    flight.animation.finished.then(() => {
      if (coverFlight.current === flight) cancelCoverFlight();
    }, () => {});
    return true;
  }, [cancelCoverFlight]);
  const openFromCover = (entry, image, keyboard) => {
    const box = entry.page === 1 && fittedImageRect(image);
    if (box) startCoverFlight({ id: entry.id, image: image.currentSrc || image.src, keyboard }, box, false);
    else cancelCoverFlight();
    openRecent(entry);
  };
  const coverReady = React.useCallback((id, image) => {
    const flight = coverFlight.current;
    if (!flight?.returning || flight.id !== id || flight.animation) return;
    const box = fittedImageRect(image);
    if (box) finishCoverFlight(flight, image, box);
  }, [finishCoverFlight]);
  const firstPdfCoverPage = (viewer) => {
    if (!viewer || viewer.currentPageNumber !== 1 || pdfReadingRef.current?.mode !== 'pdf') return null;
    if (viewer.getPageView(0)?.viewport?.rotation) return null;
    const canvas = viewer.getPageView(0)?.div?.querySelector('.canvasWrapper canvas');
    if (!canvas?.width || !canvas.height) return null;
    const box = canvas.getBoundingClientRect();
    const viewport = containerRef.current?.getBoundingClientRect();
    if (!viewport || box.left < viewport.left - 2 || box.right > viewport.right + 2
        || box.top < viewport.top - 2 || box.bottom > viewport.bottom + 2 || !box.width || !box.height) return null;
    return { box, canvas };
  };
  const revealOpeningCover = (flight, viewer) => {
    // PDF.js can fit the page again from its ResizeObserver after pagerendered.
    const sameBox = (left, right) => ['left', 'top', 'width', 'height']
      .every((edge) => Math.abs(left[edge] - right[edge]) < .5);
    let sample;
    const waitForLayout = () => {
      if (coverFlight.current !== flight) return;
      const page = firstPdfCoverPage(viewer);
      if (!page || (sample && sample.canvas !== page.canvas)) {
        sample = page;
        flight.measureFrame = requestAnimationFrame(waitForLayout);
        return;
      }
      if (!sample || !sameBox(sample.box, page.box)) {
        sample = page;
        flight.measureFrame = requestAnimationFrame(waitForLayout);
        return;
      }
      if (Math.abs(page.box.width / page.box.height - flight.box.width / flight.box.height) > .05) {
        cancelCoverFlight();
        return;
      }
      clearTimeout(flight.timeout);
      const timing = motionTiming('lg', 'move', flight.keyboard);
      const moveTo = (box, duration) => {
        const current = boxTransform(flight.visual.getBoundingClientRect(), flight.box);
        flight.visual.style.transform = current;
        flight.animation?.cancel();
        flight.animation = flight.visual.animate([{ transform: current }, { transform: boxTransform(box, flight.box) }], {
          duration, easing: timing.easing, fill: 'both',
        });
        flight.animation.finished.then(handoff, () => {});
      };
      const handoff = () => {
        if (coverFlight.current !== flight) return;
        const target = firstPdfCoverPage(viewer);
        if (!target) { cancelCoverFlight(); return; }
        if (!timing.fadeOnly) {
          if (!sameBox(flight.visual.getBoundingClientRect(), target.box)) {
            moveTo(target.box, Math.round(timing.duration * .23));
            return;
          }
          // Reveal the page below the aligned cover, then dissolve just the cover.
        }
        flight.maskedViewer?.removeAttribute('data-cover-opening');
        coverOrigin.current = { id: flight.id, image: flight.image, keyboard: flight.keyboard };
        flight.reveal = flight.visual.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: timing.fadeOnly ? timing.duration : Math.round(timing.duration * .18), easing: motionEasing('exit'), fill: 'both',
        });
        flight.reveal.finished.then(() => {
          if (coverFlight.current === flight) cancelCoverFlight();
        }, () => {});
      };
      if (timing.fadeOnly) {
        handoff();
        return;
      }
      moveTo(page.box, Math.round(timing.duration * .82));
    };
    flight.measureFrame = requestAnimationFrame(waitForLayout);
  };
  React.useEffect(() => {
    window.addEventListener('resize', cancelCoverFlight);
    return () => { window.removeEventListener('resize', cancelCoverFlight); cancelCoverFlight(); };
  }, []);

  const openRecent = (entry) => {
    if (!entry) return;
    const cached = fileCache.get(entry.id);
    if (cached) { handleFile(cached, entry.id); return; }
    if (typeof entry.text === 'string' && entry.text) {
      resetAnalysisTasks();
      if (entry.id !== readShared().paperId) resetSelection();
      setPaperId(entry.id);
      changeMode('text');
      setText(entry.text);
      setPdfName(entry.name || '');
      notify(t('recent.opened'), 'ok');
      return;
    }
    // (v24 #1) A PDF used to be unrecoverable once the page had been reloaded,
    // so a double-click silently opened the OS file picker instead. The bytes
    // are now persisted in IndexedDB, so restore them first and only fall back
    // to the picker when the store has nothing for this entry.
    if (entry.mode !== 'text') {
      notify(t('recent.loading'), '');
      getStoredFile(entry.id).then((record) => {
        const file = reviveStoredFile(record);
        if (file) {
          fileCache.set(entry.id, file);
          handleFile(file, entry.id);
          notify(t('recent.opened'), 'ok');
          return;
        }
        notify(t('recent.missing'), 'error');
        openPdfPicker();
      }).catch(() => {
        notify(t('recent.missing'), 'error');
        openPdfPicker();
      });
      return;
    }
    notify(t('recent.missing'), 'error');
    openPdfPicker();
  };

  const removeRecent = (id) => {
    setRecent((prev) => {
      const next = (prev || []).filter((x) => x && x.id !== id);
      writeStore(RECENT_KEY, next);
      return next;
    });
    fileCache.delete(id);
    try { deleteStoredFile(id); } catch (_) {}
  };

  const resetSelection = () => {
    selectionSeq.current++;
    setSelectionBusy(false);
    popupDragCancelRef.current?.();
    setPopup(null);
    setSelectionTools(null);
    selectedHighlightRef.current = null;
    writeShared({ selection: '', selectionEdit: '', selectionPrefix: '', selectionResult: '' });
  };

  const rectForPopup = (rect) => {
    if (!rect) return null;
    const w = 360;
    return {
      x: Math.max(8, Math.min(Number(rect.left) || 8, (window.innerWidth || 1200) - w - 8)),
      y: Math.max(8, Math.min((Number(rect.bottom) || 0) + 6, (window.innerHeight || 800) - 170)),
    };
  };

  const placeTranslationPopup = (value, rect, previous) => {
    const viewport = popupViewport();
    const { w, h } = translationPopupSize(value, readShared().selectionResult, popupFont, popupHorizontal, popupOriginalVisible);
    let x = previous ? previous.x : viewport.left;
    let y = previous ? previous.y : viewport.top;
    if (rect) {
      x = Number.isFinite(rect.left) ? rect.left : x;
      const below = Number.isFinite(rect.bottom) ? rect.bottom + 6 : y;
      const above = Number.isFinite(rect.top) ? rect.top - 6 : below - 12;
      const spaceBelow = viewport.bottom - below;
      const spaceAbove = above - viewport.top;
      y = spaceBelow >= h || (spaceAbove < h && spaceBelow >= spaceAbove) ? below : above - h;
    }
    return { ...previous, ...fitPopupBox({ x, y, w, h }, viewport), horizontal: popupHorizontal, showOriginal: popupOriginalVisible };
  };

  const popupMinimum = translationPopupMinimum(popupFont, popupHorizontal, popupOriginalVisible);
  const openSelectionTranslation = (rect, value, result) => {
    const layout = selectionTranslationLayout(rect, translationPopupSize(value, result, popupFont, popupHorizontal, popupOriginalVisible), popupMinimum.h);
    setPopup({ ...layout.box, followsSelection: true, horizontal: popupHorizontal, showOriginal: popupOriginalVisible });
    return layout.position;
  };

  const closeTranslationPopup = () => {
    popupDragCancelRef.current?.();
    setPopup(null);
    setSelectionTools((tools) => tools && { ...tools, position: selectionToolLayout(tools.rect) });
  };

  const dismissSelectionSurfaces = () => {
    selectionPopupTrigger.current = null;
    selectionPopupMotion.current?.cancel();
    selectionPopupMotion.current = null;
    if (inlinePopupRef.current?.followsSelection) {
      popupDragCancelRef.current?.();
      setPopup(null);
    }
    setSelectionTools(null);
  };

  React.useLayoutEffect(() => {
    const previous = inlinePopupRef.current;
    if (!previous || popupDragCancelRef.current) return;
    const switching = previous.horizontal !== popupHorizontal || previous.showOriginal !== popupOriginalVisible;
    const desired = previous.manualSize && !switching
      ? popupMinimum
      : translationPopupSize(readShared().selectionEdit, selectionResult, popupFont, popupHorizontal, popupOriginalVisible);
    const size = switching ? { ...previous, ...desired } : { ...previous, w: Math.max(previous.w, desired.w), h: Math.max(previous.h, desired.h) };
    const state = { ...previous, horizontal: popupHorizontal, showOriginal: popupOriginalVisible, manualSize: !switching && previous.manualSize };
    const tools = selectionToolsRef.current;
    if (previous.followsSelection && tools) {
      const { box, position } = selectionTranslationLayout(tools.rect, size, popupMinimum.h);
      if (!switching && box.w === previous.w && box.h === previous.h) return;
      setPopup({ ...state, ...box });
      setSelectionTools({ ...tools, position });
    } else {
      const box = fitPopupBox(size, popupViewport());
      if (switching || box.w !== previous.w || box.h !== previous.h) setPopup({ ...state, ...box });
    }
  }, [popupFont, selectionResult, popupHorizontal, popupOriginalVisible]);

  stageRef.current = (value, rect, intent, ranges) => {
    if (!value) return;
    const next = selectionDraft(readShared(), value, intent);
    if (next?.overflow) {
      notify(t('selection.limit', { count: MAX_SELECTION }), 'warn');
      return;
    }
    const state = readShared();
    let anchor = null;
    if (state.mode === 'pdf') {
      const selected = window.getSelection();
      const pageFor = (node) => Number((node?.parentElement || node)?.closest?.('.page[data-page-number]')?.dataset.pageNumber) || 0;
      const first = pageFor(selected?.anchorNode);
      const last = pageFor(selected?.focusNode);
      const actual = (next?.selectionEdit ?? readShared().selectionEdit).trim();
      anchor = first && last ? { paper: state.paperId, text: value.trim(), page: Math.min(first, last), end: Math.max(first, last) } : null;
      agentSelectionRef.current = actual === value.trim() ? anchor : null;
    }
    if (next) {
      selectionSeq.current++;
      setSelectionBusy(false);
      popupDragCancelRef.current?.();
      writeShared(next);
    }
    if (state.mode === 'pdf' && rect) {
      const anchors = captureHighlightAnchors(containerRef.current, ranges || []);
      selectedHighlightRef.current = { paper: state.paperId, text: next?.selection ?? state.selection, anchors };
      const draft = next?.selectionEdit ?? state.selectionEdit;
      const result = next ? next.selectionResult : state.selectionResult;
      const position = !noteBubble && popupOnRef.current ? openSelectionTranslation(rect, draft, result) : selectionToolLayout(rect);
      setSelectionTools({ text: value, rect, range: ranges?.[0]?.cloneRange(), position, anchor, anchors });
    } else if (popupOnRef.current) {
      setPopup((previous) => !next && previous ? previous : placeTranslationPopup(readShared().selectionEdit, rect, previous));
    }
    if (next && state.mode === 'pdf' && state.autoTranslateSelection) void translateRef.current();
  };

  translateRef.current = async () => {
    const value = readShared().selectionEdit;
    if (!value.trim()) return;
    const seq = ++selectionSeq.current;
    setSelectionBusy(true);
    if (popupOnRef.current && readShared().mode !== 'pdf') {
      setPopup((previous) => previous || placeTranslationPopup(value));
    }
    try {
      const data = await post('/translate', Object.assign({ text: value, full: false }, bodyRef.current()));
      if (seq !== selectionSeq.current) return;
      if (data && data.ok && data.text) {
        setSelectionResult(data.text);
        recordReadPages([readShared().pageNum]);
      } else {
        notify((data && data.error) || 'translation failed', 'error');
      }
    } catch (error) {
      if (seq === selectionSeq.current) notify(String(error && error.message ? error.message : error), 'error');
    } finally {
      if (seq === selectionSeq.current) setSelectionBusy(false);
    }
  };

  const changeMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setDragOver(false);
  };

  const releaseNativeUrl = () => {
    if (objectUrlRef.current) {
      try { URL.revokeObjectURL(objectUrlRef.current); } catch (_) {}
      objectUrlRef.current = '';
    }
  };

  // (v25 #1) Close the current paper. Everything the document owns is released
  // here — pdf.js viewer + document, the native-preview blob URL, the extracted
  // text, the analysis, the pending selection and the inline card — so the reader
  // drops back to the empty state WITHOUT touching anything already persisted
  // (analysis / marks / bibliography stay under their paperId in localStorage and
  // the bytes stay in IndexedDB, so reopening from 近期阅读 restores all of it).
  const closePaper = () => {
    const origin = coverOrigin.current;
    const page = origin?.id === readShared().paperId ? firstPdfCoverPage(pdfStateRef.current?.viewer) : null;
    coverOrigin.current = null;
    if (page) startCoverFlight(origin, page.box, true);
    else cancelCoverFlight();
    // Drop any queued decoration pass first: it would run against a teardown DOM.
    if (decorateTimerRef.current) {
      clearTimeout(decorateTimerRef.current);
      decorateTimerRef.current = null;
    }
    resetAnalysisTasks();
    clearFind();
    setFindControl({ open: false, motion: false });
    pdfReferenceSourceRef.current = null;
    disposeViewer();
    setPdfAnalysisReady(false);
    setPdfTextBusy(false);
    releaseNativeUrl();
    lastFileRef.current = null;
    setHasPdf(false);
    setPdfName('');
    setPdfError('');
    setPreviewMode('pdfjs');
    setPageCount(0);
    setPageNum(1);
    setText('');
    writeShared({ summary: '', summaryCoverage: null, summaryMeta: null, summaryDetail: null });
    setReferences([]);
    resetSelection();
    setMenu(null);
    setNoteBubble(null);
    setFormulaCard(null);
    setPaperId('');
    notify('');
  };

  function referenceReadingOrder(lines) {
    // Some PDFs emit the two columns one baseline at a time. Only reorder
    // when there is a clear gutter and both columns share several baselines.
    const substantial = lines.filter((line) => line.text.length >= 20 && line.right > line.left);
    if (substantial.length < 6 || lines.some((line) => !Number.isFinite(line.y))) return lines;
    let min = Infinity;
    let max = -Infinity;
    for (const line of substantial) {
      min = Math.min(min, line.left);
      max = Math.max(max, line.right);
    }
    const middle = (min + max) / 2;
    const side = (line) => {
      if (line.right <= middle - 5) return 'left';
      if (line.left >= middle + 5) return 'right';
      return 'span';
    };
    const left = substantial.filter((line) => side(line) === 'left');
    const right = substantial.filter((line) => side(line) === 'right');
    if (left.length < 3 || right.length < 3) return lines;
    const rightBaselines = new Set(right.map((line) => Math.round(line.y)));
    let paired = 0;
    for (const line of left) {
      const baseline = Math.round(line.y);
      for (let y = baseline - 3; y <= baseline + 3; y++) {
        if (rightBaselines.has(y)) { paired++; break; }
      }
      if (paired >= 3) break;
    }
    if (paired < 3) return lines;
    let changes = 0;
    let previous = '';
    for (const line of substantial) {
      const current = side(line);
      if (current === 'span') continue;
      if (previous && current !== previous) changes++;
      previous = current;
    }
    if (changes < 2) return lines;
    const ordered = [];
    let leftColumn = [];
    let rightColumn = [];
    const flush = () => {
      ordered.push(...leftColumn, ...rightColumn);
      leftColumn = [];
      rightColumn = [];
    };
    for (const line of lines.slice().sort((a, b) => b.y - a.y || a.left - b.left)) {
      const column = side(line);
      if (column === 'span') { flush(); ordered.push(line); }
      else if (column === 'left') leftColumn.push(line);
      else rightColumn.push(line);
    }
    flush();
    return ordered;
  }

  function formatPdfPage(items) {
    const cleanLine = (value) => value.normalize('NFC').replace(/[\ufb00-\ufb06]/g, (ligature) => ligature.normalize('NFKC')).replace(/\s+/g, ' ').trim();
    const newLine = () => ({ text: '', left: Infinity, right: -Infinity, y: NaN, size: 0 });
    let positioned = [];
    let inOrder = null;
    if (items.some((item) => item && item.hasEOL)) {
      let line = newLine();
      for (const item of items) {
        if (item && item.str) {
          line.text += item.str;
          line.size = Math.max(line.size, Math.abs(Number(item.height || item.transform?.[3])) || 0);
          const x = item.transform?.[4];
          if (Number.isFinite(x)) {
            line.left = Math.min(line.left, x);
            line.right = Math.max(line.right, x + (Number(item.width) || 0));
            if (!Number.isFinite(line.y)) line.y = item.transform[5];
          }
        }
        if (item && item.hasEOL) {
          line.text = cleanLine(line.text);
          if (line.text) positioned.push(line);
          line = newLine();
        }
      }
      line.text = cleanLine(line.text);
      if (line.text) positioned.push(line);
      inOrder = referenceReadingOrder(positioned);
    } else {
      const rows = new Map();
      let leftEdge = Infinity;
      let rightEdge = -Infinity;
      for (const item of items) {
        if (!item || !item.str) continue;
        const x = Number(item.transform?.[4]) || 0;
        const y = Math.round((Number(item.transform?.[5]) || 0) * 2) / 2;
        leftEdge = Math.min(leftEdge, x);
        rightEdge = Math.max(rightEdge, x);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push({ str: item.str, x, width: Number(item.width) || 0,
          size: Math.abs(Number(item.height || item.transform?.[3])) || 0 });
      }
      const lineFromCells = (cells, y) => ({
        text: cleanLine(cells.map((cell) => cell.str).join('')),
        left: cells[0].x, right: cells.reduce((edge, cell) => Math.max(edge, cell.x + cell.width), -Infinity), y,
        size: cells.reduce((value, cell) => Math.max(value, cell.size), 0),
      });
      const middle = (leftEdge + rightEdge) / 2;
      const left = [];
      const right = [];
      let paired = false;
      for (const y of [...rows.keys()].sort((a, b) => b - a)) {
        const cells = rows.get(y).sort((a, b) => a.x - b.x);
        const line = lineFromCells(cells, y);
        if (!line.text) continue;
        positioned.push(line);
        const startsLeft = cells[0].x < middle - 8;
        const endsRight = cells[cells.length - 1].x > middle + 8;
        if (startsLeft) left.push(lineFromCells(cells.filter((cell) => cell.x <= middle), y));
        if (endsRight) right.push(lineFromCells(cells.filter((cell) => cell.x > middle), y));
        paired ||= startsLeft && endsRight;
      }
      if (paired && left.length >= 3 && right.length >= 3) positioned = left.concat(right).filter((line) => line.text);
      inOrder = positioned;
    }
    const text = positioned.map((line) => line.text).join('\n');
    return {
      positioned: inOrder,
      text,
      referenceText: inOrder === positioned ? text : inOrder.map((line) => line.text).join('\n'),
      // Keep the original glyph order and normalization for PDF text-layer offsets.
      searchText: items.map((item) => String(item?.str || '').replace(/[ \t\n\r\u00a0]/g, '')).join(''),
    };
  }

  function readPdfPageText(job, pageNumber, proxy) {
    const cache = job.pageText || (job.pageText = new Map());
    if (!cache.has(pageNumber)) {
      const read = Promise.resolve(proxy || job.pdf.getPage(pageNumber)).then(async (page) => {
        const content = await page.getTextContent({ disableNormalization: true });
        const items = content?.items || [];
        return { ...formatPdfPage(items), view: page.view, items };
      });
      cache.set(pageNumber, read);
      read.catch(() => { if (cache.get(pageNumber) === read) cache.delete(pageNumber); });
    }
    return cache.get(pageNumber);
  }

  const pdfReading = usePdfReading({ paper: paperId, edition: dropSeq, ready: pdfAnalysisReady,
    page: pageNum, setPage: setPageNum, pdfState: pdfStateRef, pdfJob: pdfTextJobRef,
    container: containerRef, readText: readPdfPageText, formatLines: (items) => referenceReadingOrder(readingLines(items)) });
  const pdfReadingRef = React.useRef(pdfReading);
  pdfReadingRef.current = pdfReading;
  const comparison = pdfReading.mode === 'compare';
  const effectiveSpreadMode = comparison ? 0 : (Number(spreadMode) || 0);
  spreadModeRef.current = effectiveSpreadMode;
  const showOriginalPdf = pdfReading.mode === 'pdf' || pdfReading.mode === 'compare';
  const originalMediaEnabled = mode === 'pdf' && pdfReading.mode === 'pdf' && pdfAnalysisReady
    && previewMode !== 'native' && !figurePicking;
  const originalMedia = useOriginalPdfMedia({ enabled: originalMediaEnabled, paper: paperId,
    edition: dropSeq, container: containerRef, pdfState: pdfStateRef, loadMedia: pdfReading.loadMedia });

  async function extractText(job, alive) {
    const pages = [];
    const referencePages = [];
    for (let pageNumber = 1; pageNumber <= job.pdf.numPages; pageNumber++) {
      // Let the viewer paint between reads and stop when the paper changes.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!alive()) return null;
      const page = await readPdfPageText(job, pageNumber);
      if (!alive()) return null;
      pages.push(page.text);
      referencePages.push(page.referenceText);
    }
    const text = pages.filter(Boolean).join('\n\n');
    return {
      text,
      noText: !text,
      pageTextLengths: pages.map((page) => page.length),
      referenceText: referencePages.filter(Boolean).join('\n\n'),
      pageLineCounts: referencePages.map((page) => page ? page.split('\n').length : 0),
    };
  }

  const readAgentPages = async (scope, current, signal) => {
    const job = pdfTextJobRef.current;
    if (!job || job.paper !== readShared().paperId) throw new Error('PDF 尚未就绪。');
    const pageCount = job.pdf.numPages;
    const order = scope === 'paper' ? [current, ...Array.from({ length: pageCount }, (_, i) => i + 1).filter((page) => page !== current)] : [current];
    const pages = [];
    let available = readingAgentLimits.maxIndexChars;
    for (const page of order) {
      signal.throwIfAborted();
      if (job !== pdfTextJobRef.current) throw new Error('当前文献已切换。');
      const pageText = await readPdfPageText(job, page).catch(() => null);
      if (pageText) {
        const text = pageText.text.slice(0, Math.min(available, readingAgentLimits.maxPageChars));
        pages.push({ page, text });
        available -= text.length;
      }
      if (!available) break;
      if (page % 8 === 0) await new Promise((done) => setTimeout(done, 0));
    }
    signal.throwIfAborted();
    return { pages, pageCount };
  };

  const addAgentSelection = (picked) => {
    const { paperId: paper, selectionEdit: draft } = readShared();
    const source = (picked?.text ?? draft).trim();
    if (!paper || !source || !pdfAnalysisReady) return;
    const anchor = picked?.anchor ?? agentSelectionRef.current;
    const location = anchor?.paper === paper && anchor.text === source ? { page: anchor.page, end: anchor.end } : {};
    setCardEnabled('agent', true);
    setAnalysisOpen((previous) => previous.agent ? previous : { ...previous, agent: true });
    setAgentQuote({ paper, quotes: [{ ...location, text: source.slice(0, readingAgentLimits.maxQuoteChars) }] });
    setAnalysisTab('agent');
    popupDragCancelRef.current?.();
    setPopup(null);
    setSelectionTools(null);
  };

  const jumpAgentSource = ({ page }) => {
    pdfReading.showSource();
    const state = pdfStateRef.current;
    if (!state?.viewer || !page || page > state.viewer.pagesCount) return;
    state.viewer.currentPageNumber = page;
    setPageNum(page);
  };

  const prepareAnalysisText = async (showFeedback = true) => {
    const current = readShared();
    if (current.mode !== 'pdf') return Boolean(current.text.trim());
    const job = pdfTextJobRef.current;
    if (!job || job.paper !== current.paperId) return false;
    const alive = () => pdfTextJobRef.current === job && readShared().paperId === job.paper && readShared().mode === 'pdf';
    if (!job.pending) {
      setPdfTextBusy(true);
      if (showFeedback) notify(t('pdf.extracting'));
      job.pending = extractText(job, alive).catch(() => null);
    }
    const source = await job.pending;
    if (!alive()) return false;
    setPdfTextBusy(false);
    if (!source) {
      job.pending = null;
      if (showFeedback) notify(t('pdf.extractFailed'), 'error');
      return false;
    }
    pdfReferenceSourceRef.current = { ...source, paper: job.paper };
    if (source.noText) {
      if (showFeedback) notify(t('references.noText'), 'warn');
      return false;
    }
    setText(source.text);
    return true;
  };

  const runWithAnalysisText = async (action) => {
    if (await prepareAnalysisText()) await action();
  };

  const nearbyFigureText = (pageText, viewport, box) => {
    if (!pageText) return { caption: '', context: '' };
    const left = box.x * viewport.width;
    const right = (box.x + box.w) * viewport.width;
    const top = box.y * viewport.height;
    const bottom = (box.y + box.h) * viewport.height;
    const positioned = pageText.positioned.flatMap((line, index) => {
      if (![line.left, line.right, line.y].every(Number.isFinite)) return [];
      const a = viewport.convertToViewportPoint(line.left, line.y);
      const b = viewport.convertToViewportPoint(line.right, line.y);
      const first = Math.min(a[0], b[0]);
      const last = Math.max(a[0], b[0]);
      const baseline = (a[1] + b[1]) / 2;
      return [{
        text: line.text, index, baseline, first,
        horizontalGap: Math.max(0, left - last, first - right),
        distance: Math.max(0, top - baseline, baseline - bottom),
      }];
    });
    const nearby = positioned.filter((line) => line.horizontalGap <= 28 && line.distance <= 105);
    const opener = nearby.filter((line) => FIGURE_LABEL_RE.test(line.text) && line.distance <= 72)
      .sort((a, b) => (a.distance + a.horizontalGap) - (b.distance + b.horizontalGap))[0];
    const captionLines = [];
    if (opener) {
      captionLines.push(opener);
      for (const line of nearby) {
        const previous = captionLines.at(-1);
        if (line.index <= opener.index) continue;
        if (captionLines.length >= 5 || line.index !== previous.index + 1 || FIGURE_LABEL_RE.test(line.text)
          || line.baseline - previous.baseline < 0 || line.baseline - previous.baseline > 23
          || Math.abs(line.first - opener.first) > 55) break;
        captionLines.push(line);
      }
    }
    const context = nearby.filter((line) => !captionLines.includes(line))
      .sort((a, b) => a.distance - b.distance).slice(0, 18)
      .sort((a, b) => a.index - b.index).map((line) => line.text).join('\n').slice(0, 3000);
    return {
      caption: captionLines.map((line) => line.text).join(' ').slice(0, 1500),
      context: context || (positioned.length ? '' : pageText.text.slice(0, 1800)),
    };
  };

  const renderFigureCrop = async (page, viewport, crop, run) => {
    const edge = Math.max(crop.w * viewport.width, crop.h * viewport.height);
    const scale = Math.min(4, 1600 / edge);
    const scaled = page.getViewport({ scale, rotation: viewport.rotation });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.w * scaled.width));
    canvas.height = Math.max(1, Math.round(crop.h * scaled.height));
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) throw new Error(t('figure.renderFailed'));
    const task = page.render({
      canvasContext, viewport: scaled,
      transform: [1, 0, 0, 1, -crop.x * scaled.width, -crop.y * scaled.height],
      background: 'rgb(255, 255, 255)',
    });
    run.task = task;
    try {
      await task.promise;
      const encode = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
      const maxBytes = 1100 * 1024;
      let blob = await encode('image/png');
      if (!blob || blob.size > maxBytes) blob = await encode('image/jpeg', 0.88);
      if (blob && blob.size > maxBytes) blob = await encode('image/jpeg', 0.68);
      if (!blob || blob.size > maxBytes) throw new Error(t('figure.imageInvalid'));
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(t('figure.renderFailed')));
        reader.readAsDataURL(blob);
      });
    } finally {
      run.task = null;
      canvas.width = 0;
      canvas.height = 0;
    }
  };

  const analyzeFigure = async (job, pageNumber, rotation, crop, asset) => {
    cancelFigureWork();
    showContentCategory('visual');
    const request = bodyRef.current();
    const selection = describeModelSelection(request);
    const run = { controller: new AbortController(), task: null };
    figureRunRef.current = run;
    const alive = () => figureRunRef.current === run && pdfTextJobRef.current === job
      && readShared().mode === 'pdf' && readShared().paperId === job.paper;
    setAnalysisTab('figure');
    let category = 'visual';
    setFigureActivity({ paper: job.paper, category, busy: true });
    try {
      const page = await job.pdf.getPage(pageNumber);
      if (!alive()) return;
      const viewport = page.getViewport(Number.isFinite(rotation) ? { scale: 1, rotation } : { scale: 1 });
      const context = readPdfPageText(job, pageNumber, page).catch(() => null);
      if (!asset) {
        const regions = await pdfReading.loadMedia(pageNumber, job).catch(() => []);
        if (!alive()) return;
        const selected = [crop.x * viewport.width, crop.y * viewport.height,
          (crop.x + crop.w) * viewport.width, (crop.y + crop.h) * viewport.height];
        const area = (selected[2] - selected[0]) * (selected[3] - selected[1]);
        asset = regions.find((region) => {
          const bounds = viewportBounds(viewport, region.bounds);
          const overlap = Math.max(0, Math.min(bounds[2], selected[2]) - Math.max(bounds[0], selected[0])) *
            Math.max(0, Math.min(bounds[3], selected[3]) - Math.max(bounds[1], selected[1]));
          const assetArea = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]);
          return overlap > area * .55 && overlap > assetArea * .5;
        });
      }
      const excerpts = nearbyFigureText(await context, viewport, crop);
      const kind = asset?.kind || visualCaptionLabel(excerpts.caption)?.kind || 'figure';
      if (!alive()) return;
      if (kind === 'formula') {
        category = 'formula';
        showContentCategory(category);
        setFigureActivity({ paper: job.paper, category, busy: true });
      }
      const image = await renderFigureCrop(page, viewport, crop, run);
      if (!alive()) return;
      const response = await post('/figure', { ...request, image, page: pageNumber, position: crop, kind, ...excerpts }, 165000, run.controller.signal);
      if (!alive()) return;
      if (!response?.ok) {
        const errors = { 'figure-model': 'figure.modelRequired', 'figure-attachments': 'figure.attachmentsRequired', 'figure-image': 'figure.imageInvalid' };
        const error = errors[response?.code] ? t(errors[response.code]) : (response?.error || t('figure.failed'));
        setFigureActivity({ paper: job.paper, category, error });
        return;
      }
      if (typeof response.text !== 'string' || !response.text.trim()) throw new Error(t('figure.failed'));
      const result = {
        id: globalThis.crypto?.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2),
        kind,
        label: asset?.captionLabel || asset?.label,
        number: asset?.number,
        page: pageNumber,
        position: figurePagePosition(page, viewport, crop),
        caption: excerpts.caption,
        text: response.text,
        ...readGenerationMetadata(response, selection),
      };
      const saved = saveContentAnalysis(job.paper, category, result);
      setFigureActivity(saved ? null : { paper: job.paper, category, error: t('figure.saveFailed') });
    } catch (error) {
      if (alive()) setFigureActivity({ paper: job.paper, category, error: String(error?.message || t('figure.failed')) });
    } finally {
      if (figureRunRef.current === run) figureRunRef.current = null;
    }
  };

  const toggleFigurePicker = () => {
    if (!pdfTextJobRef.current || figureRunRef.current) return;
    if (figurePickingRef.current) {
      setFigurePickMode(false);
    } else {
      showContentCategory('visual');
      setAnalysisTab('figure');
      setFigurePickMode(true);
    }
  };

  const confirmFigureBox = (page, crop) => {
    const job = pdfTextJobRef.current;
    const viewport = pdfStateRef.current?.viewer.getPageView(page - 1)?.viewport;
    setFigurePickMode(false);
    if (job && viewport && page >= 1 && page <= job.pdf.numPages) void analyzeFigure(job, page, viewport.rotation, crop);
  };

  const openNativePreview = (file, reason) => {
    releaseNativeUrl();
    let url = '';
    try { url = URL.createObjectURL(file); } catch (_) {}
    if (!url) { setPdfError(String(reason || 'PDF preview unavailable')); return; }
    objectUrlRef.current = url;
    setNativeUrl(url);
    setPreviewMode('native');
    setPdfName(file && file.name ? file.name : '');
    setHasPdf(true);
    setPdfError(String(reason || ''));
    notify(t('pdf.nativeFallback'), 'ok');
  };

  // ---- v1.0.5 (#1) highlights, painted UNDER the glyphs ----
  // pdf.js renders every page into one opaque canvas and keeps its text layer at
  // 25% opacity with transparent glyphs on top. Styling text-layer spans was
  // both washed out and prone to bleeding onto unrelated words. We now draw
  // translucent yellow rectangles on a dedicated overlay canvas that sits
  // BETWEEN the page canvas and the text layer, with `mix-blend-mode: multiply`:
  // white paper turns pale yellow while the black glyphs stay black.
  // (v39 #1) A search hit is drawn on its OWN overlay canvas (class
  // `elr-find-overlay`, orange) rather than through `paintPageHighlights`:
  // the marks pass owns `cached.canvas` and calls `clearPageOverlay()` on
  // every page it repaints, so a hit stored there would be wiped the next
  // time a page was decorated. A separate class means both can coexist and
  // `applyHighlights` cannot see it.
  const FIND_FILL = 'rgba(255, 168, 38, 0.8)';
  // Hard ceiling on collected hits: a two-letter query in a long paper can
  // match thousands of times, and every hit is held in React state.
  const MAX_FIND_HITS = 600;
  const normText = (value) => String(value == null ? '' : value).replace(/\s+/g, '');
  const clearHlOverlays = () => {
    const container = containerRef.current;
    if (!container) return;
    const nodes = container.querySelectorAll('.elr-hl-overlay');
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n && n.parentNode) n.parentNode.removeChild(n);
    }
  };
  // (v18 #2) Drop the overlay canvas of ONE page (used both when repainting it
  // and when its marks disappeared), instead of clearing the whole document.
  const clearPageOverlay = (pageEl) => {
    if (!pageEl) return;
    const nodes = pageEl.querySelectorAll('.elr-hl-overlay');
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n && n.parentNode) n.parentNode.removeChild(n);
    }
  };
  const paintPageHighlights = (pageEl, hitRects, noteRects) => {
    if (!hitRects.length && !noteRects?.length) return null;
    // Anchor to `.canvasWrapper`, the box the glyph canvas occupies, instead of
    // `.page` — the latter has a 9px transparent border (`--page-border`), which
    // both offsets absolutely positioned children and inflates the measured rect.
    const wrapper = pageEl.querySelector('.canvasWrapper') || pageEl;
    let rect = null;
    try { rect = wrapper.getBoundingClientRect(); } catch (_) { return null; }
    if (!rect || !rect.width || !rect.height) return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'elr-hl-overlay';
    const dpr = sizePdfOverlay(canvas, rect);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    let drew = 0;
    for (let i = 0; i < hitRects.length; i++) {
      const { rect: r, ink } = hitRects[i];
      if (!r || !r.width || !r.height) continue;
      const x = (r.left - rect.left) * sx;
      const y = (r.top - rect.top) * sy;
      const w = r.width * sx;
      const h = r.height * sy;
      ctx.clearRect(x, y, w, h);
      ctx.fillStyle = ink;
      ctx.fillRect(x, y, w, h);
      drew += 1;
    }
    // (#4) Annotated sentences also get a blue dotted underline, drawn here
    // because a border on a text-layer span would be composited at 25%.
    const notes = noteRects || [];
    if (notes.length) {
      ctx.strokeStyle = '#2f7fd4';
      ctx.lineWidth = Math.max(1, Math.round(1.5 * dpr));
      ctx.setLineDash([Math.round(3 * dpr), Math.round(2.5 * dpr)]);
      for (let i = 0; i < notes.length; i++) {
        const r = notes[i];
        if (!r || !r.width) continue;
        const y = Math.round(((r.bottom - rect.top) * sy) - ctx.lineWidth);
        ctx.beginPath();
        ctx.moveTo((r.left - rect.left) * sx, y);
        ctx.lineTo((r.right - rect.left) * sx, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // (v8 #2) The canvas is appended when there is ANY ink on it: an annotation
    // without a highlight still needs its dotted underline.
    if (!drew && !notes.length) return null;
    wrapper.appendChild(canvas);
    return canvas;
  };
  // (v39 #1) Search-hit overlay. Same geometry as `paintPageHighlights`
  // (anchored to `.canvasWrapper`, DPR-scaled), but a distinct class so the
  // marks pass can neither reuse nor clear it. `active` picks the darker
  // orange for the hit the user is currently on.
  const clearFindOverlays = () => {
    const container = containerRef.current;
    if (!container) return;
    const nodes = container.querySelectorAll('.elr-find-overlay');
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n && n.parentNode) n.parentNode.removeChild(n);
    }
  };
  const paintFindOverlay = (pageEl, rects, active) => {
    if (!pageEl || !rects || !rects.length) return;
    const wrapper = pageEl.querySelector('.canvasWrapper') || pageEl;
    let box = null;
    try { box = wrapper.getBoundingClientRect(); } catch (_) { return; }
    if (!box || !box.width || !box.height) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'elr-find-overlay' + (active ? ' is-active' : '');
    sizePdfOverlay(canvas, box);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sx = canvas.width / box.width;
    const sy = canvas.height / box.height;
    ctx.fillStyle = active ? 'rgba(255, 140, 0, 0.95)' : FIND_FILL;
    let drew = 0;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (!r || !r.width || !r.height) continue;
      ctx.fillRect((r.left - box.left) * sx, (r.top - box.top) * sy, r.width * sx, r.height * sy);
      drew += 1;
    }
    if (!drew) return;
    wrapper.appendChild(canvas);
  };
  // (v9 #3) Word-accurate rectangles for a character range inside one span.
  //
  // Filling a whole `.textLayer span` was the reason selecting two words
  // painted the entire line: pdf.js frequently emits ONE span per visual
  // line, so the span box is the line box. Building a DOM Range over the
  // matched characters and calling `getClientRects()` yields one box per
  // wrapped line segment that actually contains the text, which is what the
  // user expects to see highlighted.
  const rectsForSpanRange = (span, from, to) => {
    try {
      const node = span.firstChild;
      if (!node || node.nodeType !== 3) return null;
      const raw = node.nodeValue || '';
      const start = Math.max(0, Math.min(from, raw.length));
      const end = Math.max(start, Math.min(to, raw.length));
      if (end <= start) return null;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const list = range.getClientRects ? range.getClientRects() : null;
      const out = [];
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          if (r && r.width > 0 && r.height > 0) out.push(r);
        }
      }
      try { range.detach(); } catch (_) {}
      return out.length ? out : null;
    } catch (_) { return null; }
  };

  const captureHighlightAnchors = (container, ranges) => {
    if (!container || !ranges.length) return [];
    const anchors = [];
    for (const layer of container.querySelectorAll('.pdfViewer .page[data-page-number] .textLayer')) {
      const covering = ranges.filter((range) => range.intersectsNode(layer));
      if (!covering.length) continue;
      const pageEl = layer.closest('.page[data-page-number]');
      const bounds = highlightSurface(pageEl).getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      const rects = [];
      for (const span of layer.querySelectorAll('span')) {
        const node = span.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) continue;
        for (const range of covering) {
          if (!range.intersectsNode(node)) continue;
          const from = node === range.startContainer ? range.startOffset : 0;
          const to = node === range.endContainer ? range.endOffset : node.length;
          for (const rect of rectsForSpanRange(span, from, to) || []) {
            rects.push({
              x: (rect.left - bounds.left) / bounds.width,
              y: (rect.top - bounds.top) / bounds.height,
              w: rect.width / bounds.width,
              h: rect.height / bounds.height,
            });
          }
        }
      }
      if (rects.length) anchors.push({ page: Number(pageEl.dataset.pageNumber), rects });
    }
    return anchors;
  };
  // (v22) Build (or reuse) the whitespace-stripped text index of one page.
  //
  // Extracted from `applyHighlights` so the "jump to this annotation" feature
  // can locate a mark on a page that has not been decorated yet (for example
  // when the user clicks an annotation before any highlight was painted).
  const pageIndexOf = (pageEl, spans) => {
    let cached = pageTextCache.get(pageEl);
    if (cached && cached.spanCount === spans.length) return cached;
    const texts = [];
    const starts = [];
    const maps = [];
    let cursor = 0;
    for (let i = 0; i < spans.length; i++) {
      const raw = String(spans[i].textContent || '');
      let norm = '';
      const map = [];
      for (let c = 0; c < raw.length; c++) {
        const ch = raw.charAt(c);
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\u00a0') continue;
        norm += ch;
        map.push(c);
      }
      starts.push(cursor);
      texts.push(norm);
      maps.push(map);
      cursor += norm.length;
    }
    cached = { spanCount: spans.length, texts, starts, maps, pageText: texts.join(''), sig: '', canvas: null };
    pageTextCache.set(pageEl, cached);
    return cached;
  };

  const applyHighlights = () => {
    const container = containerRef.current;
    if (!container) return;
    const list = marksRef.current || [];
    // (v18 #2) Scrolling a long paper used to stutter because this pass ran on
    // EVERY `pagerendered` / `textlayerrendered` event and each time did three
    // expensive things for the whole DOCUMENT: it cleared a class/dataset on
    // every span, it rebuilt the concatenated page text of every page, and it
    // re-created one overlay canvas per page.
    //
    // Now the pass is incremental:
    //   * each page keeps its own text index in a WeakMap, reused as long as the
    //     page's span count is unchanged (only a zoom / re-render invalidates it);
    //   * a page whose marks signature and overlay canvas are unchanged is
    //     skipped outright, so scrolling only pays for pages that really changed;
    //   * tags and the overlay are dropped per PAGE, not document-wide.
    if (!list.length) {
      clearHlOverlays();
      if (hlTagsRef.current) {
        const allSpans = container.querySelectorAll('.textLayer span');
        for (let i = 0; i < allSpans.length; i++) {
          allSpans[i].classList.remove('elr-hl-note');
          if (allSpans[i].dataset) delete allSpans[i].dataset.elrMark;
        }
        hlTagsRef.current = false;
      }
      return;
    }
    // Position-less highlights stay in the list until the passage is selected again.
    const highlightsByPage = new Map();
    for (let idx = list.length - 1; idx >= 0; idx--) {
      const mark = list[idx];
      if (!mark.hl) continue;
      const ink = HIGHLIGHT_COLORS[mark.color]?.ink || HIGHLIGHT_COLORS.yellow.ink;
      for (const { page, rects, legacy } of highlightAnchors(mark)) {
        if (!highlightsByPage.has(page)) highlightsByPage.set(page, []);
        highlightsByPage.get(page).push({ id: mark.id, ink, rects, legacy });
      }
    }
    const items = list.filter((mark) => !mark.hl && String(mark.note || '').trim()).map((m) => ({
      needle: normText(m.text),
      id: m.id,
      anchors: highlightAnchors(m),
    })).filter((item) => item.needle.length > 0);
    const noteSig = items.map((item) => item.id).join('|');
    const pages = container.querySelectorAll('.pdfViewer .page');
    for (let p = 0; p < pages.length; p++) {
      const pageEl = pages[p];
      const spans = pageEl.querySelectorAll('.textLayer span');
      if (!spans.length) continue;
      // (v22) The per-page index is built by `pageIndexOf`, shared with the
      // "jump to annotation" feature.
      const cached = pageIndexOf(pageEl, spans);
      const { texts, starts, maps, pageText } = cached;
      if (!pageText) continue;
      // (v18 #2) A zoom or a theme repaint replaces the page canvas; the marks
      // signature alone would then look unchanged while the overlay is stale.
      // Fold the rendered canvas size into the signature so such a page is
      // repainted exactly once.
      const glyph = pageEl.querySelector('.canvasWrapper canvas');
      const dim = glyph ? [glyph.width, glyph.height, glyph.clientWidth, glyph.clientHeight].join('x') : '0';
      const currentPage = Number(pageEl.dataset.pageNumber);
      const highlights = highlightsByPage.get(currentPage) || [];
      const pageSig = noteSig + '#' + JSON.stringify(highlights) + '#' + dim;
      if (cached.sig === pageSig && (!cached.canvas || cached.canvas.isConnected)) continue;
      // Repaint just this page: drop its old tags and its old overlay first.
      for (let i = 0; i < spans.length; i++) {
        spans[i].classList.remove('elr-hl-note');
        if (spans[i].dataset) delete spans[i].dataset.elrMark;
      }
      clearPageOverlay(pageEl);
      const hitRects = [];
      const noteRects = [];
      const bounds = pageEl.getBoundingClientRect();
      const surface = highlightSurface(pageEl).getBoundingClientRect();
      const clientRect = (box, base) => new DOMRect(base.left + box.x * base.width, base.top + box.y * base.height, box.w * base.width, box.h * base.height);
      for (const { ink, rects, legacy } of highlights) {
        for (const box of rects) hitRects.push({ rect: clientRect(box, legacy ? bounds : surface), ink });
      }
      const touched = new Map();
      for (const item of items) {
        const part = item.anchors.find((anchor) => anchor.page === currentPage);
        if (item.anchors.length && !part) continue;
        const anchoredRects = part?.rects.map((box) => clientRect(box, part.legacy ? bounds : surface));
        if (anchoredRects) noteRects.push(...anchoredRects);
        const needle = item.needle;
        let from = 0;
        for (;;) {
          const at = pageText.indexOf(needle, from);
          if (at < 0) break;
          const end = at + needle.length;
          for (let i = 0; i < spans.length; i++) {
            const s = starts[i];
            const e = s + texts[i].length;
            if (!texts[i].length || e <= at || s >= end) continue;
            // Overlap translated back into the span's own character indices.
            const normFrom = Math.max(at, s) - s;
            const normTo = Math.min(end, e) - s;
            const map = maps[i];
            const rawFrom = map[Math.max(0, Math.min(normFrom, map.length - 1))];
            const rawTo = map[Math.max(0, Math.min(normTo - 1, map.length - 1))] + 1;
            const glyphs = rectsForSpanRange(spans[i], rawFrom, rawTo) || [spans[i].getBoundingClientRect()];
            if (anchoredRects && !glyphs.some((glyph) => anchoredRects.some((rect) =>
              glyph.left < rect.right && glyph.right > rect.left && glyph.top < rect.bottom && glyph.bottom > rect.top))) continue;
            if (!anchoredRects) noteRects.push(...glyphs);
            let ids = touched.get(spans[i]);
            if (!ids) { ids = []; touched.set(spans[i], ids); }
            spans[i].classList.add('elr-hl-note');
            if (!ids.includes(item.id)) ids.push(item.id);
          }
          from = end;
        }
      }
      // The dataset supports existing annotation interactions; highlights hit-test their rectangles.
      if (touched.size) {
        touched.forEach((ids, span) => {
          if (span && span.dataset) span.dataset.elrMark = ids.join(' ');
        });
      }
      // (v18 #2) Remember what this page's canvas represents, so the next
      // decoration pass — including the ones fired while scrolling — can skip
      // it outright.
      cached.sig = pageSig;
      cached.canvas = hitRects.length || noteRects.length ? paintPageHighlights(pageEl, hitRects, noteRects) : null;
      if (touched.size) hlTagsRef.current = true;
    }
  };
  applyHighlightsRef.current = applyHighlights;


  // (v19 #4) `spreadMode` is now the number of EXTRA pages per row (0/1/2).
  // pdf.js can only do one or two pages per row (`SpreadMode.NONE` / `ODD`), so:
  //  - 0 → NONE
  //  - 1 → ODD (pdf.js groups pages into `.spread` rows of two)
  //  - 2 → NONE plus the `.elr-three` grid, which is a pure CSS overlay on the
  //        normal single-page flow. Nothing is re-parented, so pdf.js cannot
  //        undo it, and page canvases keep their own scale.
  const applySpread = (viewer, V) => {
    const count = Number(spreadModeRef.current) || 0;
    try {
      const odd = V && V.SpreadMode ? V.SpreadMode.ODD : 1;
      const none = V && V.SpreadMode ? V.SpreadMode.NONE : 0;
      viewer.spreadMode = count === 1 ? odd : none;
    } catch (_) {}
  };

  // v1.0.6: dispose the CURRENT viewer completely before a new document is
  // installed. Re-installing a document on a live PDFViewer used to crash inside
  // its own teardown ("Cannot read properties of null (reading 'destroy')"):
  // setDocument() re-enters _resetView() -> _cancelRendering(), which calls
  // cancelRendering() on page views whose annotation-editor layer had already
  // been released, and the plugin's synchronous `applySpread()` right after
  // setDocument() hit an empty `_pages` array (that is also why 单双栏 stopped
  // working after a switch). A fresh viewer per document sidesteps the whole
  // reuse path: nothing of the old document survives.
  // (v51) One dedicated worker for OUR pdf.js copy, owned by us and torn
  // down with the viewer. Handing it over as `workerPort` is deliberate:
  // `GlobalWorkerOptions.workerSrc` is a property of the shared global this
  // library instance exposes, so if the host page later touches its own
  // `pdfjsLib.GlobalWorkerOptions`, our document could end up paired with a
  // foreign worker and fail with a version mismatch. A private port cannot
  // be captured that way.
  const [positionReady, setPositionReady] = React.useState(null);
  const disposeViewer = () => {
    cancelFigureWork();
    pdfTextJobRef.current = null;
    const s = pdfStateRef.current;
    s?.resize?.disconnect();
    s?.dispose?.();
    const task = pdfLoadingTaskRef.current;
    pdfLoadingTaskRef.current = null;
    pdfDocRef.current = null;
    pdfStateRef.current = null;
    viewerPromiseRef.current = null;
    if (s) {
      try { s.viewer.setDocument(null); } catch (_) {}
      try { s.viewer.cleanup(); } catch (_) {}
    }
    if (task) task.destroy().catch(() => {});
    props.onPdfPassword(null);
    if (viewerElRef.current) {
      try { viewerElRef.current.textContent = ''; } catch (_) {}
    }
  };

  function fitPdfPage(state) {
    const { viewer, container } = state;
    const number = viewer.currentPageNumber;
    const page = viewer.getPageView(number - 1)?.div;
    if (!page || !container.clientWidth || !container.clientHeight) return;
    const box = page.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const across = Math.min(viewer.pagesCount, 1 + (Number(spreadModeRef.current) || 0));
    const width = Math.max(1, container.clientWidth - 36) / across;
    const height = Math.max(1, container.clientHeight - 24);
    const scale = Math.min(ZOOM_MAX, viewer.currentScale * Math.min(width / box.width, height / box.height));
    state.fitPage = true;
    state.updatingFit = true;
    try {
      if (Math.abs(viewer.currentScale - scale) > .001) viewer.currentScale = scale;
      viewer.scrollPageIntoView({ pageNumber: number });
      const pageTop = page.getBoundingClientRect().top;
      const frameTop = container.getBoundingClientRect().top;
      container.scrollTop = Math.max(0, container.scrollTop + pageTop - frameTop - 4);
    } finally {
      state.updatingFit = false;
    }
  }

  function ensureViewer() {
    if (viewerPromiseRef.current) return viewerPromiseRef.current;
    const pending = (async () => {
      const { pdfjsLib, V } = await ensurePdfJs();
      if (viewerPromiseRef.current !== pending) return null;
      const container = containerRef.current;
      const viewerEl = viewerElRef.current;
      if (!container || !viewerEl) throw new Error('PDF viewer container is not ready');
      viewerEl.lang = 'en';
      const eventBus = new V.EventBus();
      const linkService = new V.PDFLinkService({ eventBus, externalLinkTarget: V.LinkTarget?.BLANK || 2 });
      const viewer = new V.PDFViewer({
        container, viewer: viewerEl, eventBus, linkService, textLayerMode: 1,
        // Keep the backing bitmap well below Chromium's limits at high zoom.
        // PDF.js detail canvases use the viewport's full device pixel ratio.
        maxCanvasPixels: PDF_CANVAS_MAX_PIXELS, maxCanvasDim: PDF_CANVAS_MAX_EDGE,
        enableDetailCanvas: window.reader?.platform !== 'darwin' && window.devicePixelRatio <= 1.5,
      });
      linkService.setViewer(viewer);
      const state = { eventBus, linkService, viewer, V, pdfjsLib, container, fitPage: false, updatingFit: false, pendingResize: false, pageOps: new WeakMap() };
      const applyContainerResize = () => {
        if (!viewer.pdfDocument || !container.clientWidth || !container.clientHeight) return;
        state.pendingResize = false;
        if (state.fitPage) fitPdfPage(state);
        viewer.update();
      };
      state.resize = new ResizeObserver(() => {
        if (!viewer.pdfDocument || !container.clientWidth || !container.clientHeight) return;
        // Defer expensive PDF re-scaling and canvas invalidation until pane/card
        // resize gestures end so dragging the divider stays responsive.
        if (document.body.classList.contains(GESTURE_CLASS)) {
          state.pendingResize = true;
          return;
        }
        applyContainerResize();
      });
      state.resize.observe(container);
      const onGestureEnd = () => {
        if (state.pendingResize) applyContainerResize();
      };
      document.addEventListener('reader-gesture-end', onGestureEnd);
      let compareSnapTimer = null;
      let comparePendingPage = 0;
      let compareAutoScrollingUntil = 0;
      const clearCompareSnap = () => {
        if (compareSnapTimer) {
          clearTimeout(compareSnapTimer);
          compareSnapTimer = null;
        }
      };
      const centerComparePage = (targetPage) => {
        if (pdfReadingRef.current.mode !== 'compare') return;
        const pageEl = viewer.getPageView(targetPage - 1)?.div;
        if (!pageEl || !container.clientWidth || !container.clientHeight) return;
        const pageRect = pageEl.getBoundingClientRect();
        const boxRect = container.getBoundingClientRect();
        if (!pageRect.width || !pageRect.height) return;
        const targetLeft = Math.max(0, Math.round(
          container.scrollLeft + (pageRect.left - boxRect.left) - (container.clientWidth - pageRect.width) / 2
        ));
        const verticalMargin = pageRect.height <= container.clientHeight
          ? (container.clientHeight - pageRect.height) / 2
          : 8;
        const targetTop = Math.max(0, Math.round(
          container.scrollTop + (pageRect.top - boxRect.top) - verticalMargin
        ));
        if (Math.abs(targetLeft - container.scrollLeft) <= 4 && Math.abs(targetTop - container.scrollTop) <= 4) return;
        compareAutoScrollingUntil = performance.now() + 450;
        container.scrollTo({
          left: targetLeft,
          top: targetTop,
          behavior: reduceMotion() ? 'auto' : 'smooth',
        });
      };
      const scheduleCompareSnap = (pageNumber) => {
        comparePendingPage = pageNumber;
        clearCompareSnap();
        compareSnapTimer = setTimeout(() => {
          compareSnapTimer = null;
          const target = comparePendingPage;
          comparePendingPage = 0;
          if (target) centerComparePage(target);
        }, 180);
      };
      const onCompareScroll = () => {
        if (!comparePendingPage || pdfReadingRef.current.mode !== 'compare') return;
        if (performance.now() < compareAutoScrollingUntil) return;
        scheduleCompareSnap(comparePendingPage);
      };
      container.addEventListener('scroll', onCompareScroll, { passive: true });
      state.dispose = () => {
        clearCompareSnap();
        container.removeEventListener('scroll', onCompareScroll);
        document.removeEventListener('reader-gesture-end', onGestureEnd);
      };
      eventBus.on('pagechanging', (e) => {
        if (e?.pageNumber) {
          pdfReading.onOriginalPage(e.pageNumber);
          if (pdfReadingRef.current.mode === 'compare' && e.previous && e.previous !== e.pageNumber) {
            scheduleCompareSnap(e.pageNumber);
          }
        }
      });
      // (v20 #3) Keep the toolbar percentage in sync with whatever changed the
      // scale: our +/- buttons, the preset list, Ctrl+wheel, or pdf.js itself.
      eventBus.on('scalechanging', (e) => {
        if (!state.updatingFit) state.fitPage = false;
        const scale = e && Number(e.scale);
        if (Number.isFinite(scale) && scale > 0) setZoomPct(Math.round(scale * 100));
      });
      // (v13 #1) ONE coalesced decoration pass for a burst of per-page events,
      // instead of a full-document pass per page per event.
      eventBus.on('textlayerrendered', (event) => {
        const pageView = event?.source;
        const pageEl = pageView?.div;
        const pdfPage = pageView?.pdfPage;
        if (pageEl && pdfPage) {
          let opsPromise = state.pageOps.get(pdfPage);
          if (!opsPromise) {
            opsPromise = pdfPage.getOperatorList().catch(() => null);
            state.pageOps.set(pdfPage, opsPromise);
          }
          opsPromise.then((operators) => {
            if (pdfStateRef.current !== state || !pageEl.isConnected || !operators) return;
            if (alignPageTextLayer(pageEl, operators, pdfjsLib.OPS, pdfPage.getViewport({ scale: 1 }))) {
              scheduleDecorateRef.current();
            }
          });
        }
        scheduleDecorateRef.current();
        const pending = findScrollRef.current;
        if (pending && event && pending.page === event.pageNumber) pending.scroll();
      });
      eventBus.on('pagesloaded', () => scheduleDecorateRef.current());
      // (#1) Spread must be (re)applied AFTER the page views exist. `pagesinit`
      // fires at the end of setDocument() once `_pages` is populated, which is the
      // earliest point where `_updateSpreadMode()` can wrap pages into `.spread`.
      eventBus.on('pagesinit', () => {
        applySpread(viewer, V);
        const file = lastFileRef.current;
        if (file?.desktopPage && file.desktopPage <= viewer.pagesCount) viewer.currentPageNumber = file.desktopPage;
        fitPdfPage(state);
        setZoomPct(Math.round(viewer.currentScale * 100));
        setPageNum(viewer.currentPageNumber);
        setPositionReady(file);
        scheduleDecorateRef.current();
      });
      eventBus.on('pagerendered', (event) => {
        scheduleDecorateRef.current();
        if (!event.error && !event.cssTransform) document.dispatchEvent(new CustomEvent('reader-glass-backdrop', { detail: event.source?.div }));
        const flight = coverFlight.current;
        if (!flight || flight.returning || flight.measureFrame || flight.id !== lastFileRef.current?.desktopId
            || event.pageNumber !== 1 || event.cssTransform || event.error) return;
        revealOpeningCover(flight, viewer);
      });
      pdfStateRef.current = state;
      return state;
    })().catch((error) => {
      if (viewerPromiseRef.current === pending) viewerPromiseRef.current = null;
      throw error;
    });
    viewerPromiseRef.current = pending;
    return pending;
  }

  React.useEffect(() => {
    setPdfAnalysisReady(false);
    setPdfTextBusy(false);
    setFigurePickMode(false);
    setFigureActivity(null);
    if (mode !== 'pdf') return;
    return () => {
      // (v13 #1) Drop any pending decoration pass from the old document so it
      // cannot run against a DOM that is about to be torn down.
      if (decorateTimerRef.current) {
        clearTimeout(decorateTimerRef.current);
        decorateTimerRef.current = null;
      }
      disposeViewer();
      releaseNativeUrl();
    };
  }, [mode]);

  React.useEffect(() => {
    if (mode !== 'pdf' || dropSeq === 0) return;
    const file = lastFileRef.current;
    if (!file) return;
    const sourcePaper = readShared().paperId;
    const indexing = new AbortController();
    let cancelled = false;
    const alive = () => !cancelled && lastFileRef.current === file
      && readShared().paperId === sourcePaper && readShared().mode === 'pdf';
    (async () => {
      setPositionReady(null);
      setPdfAnalysisReady(false);
      setPdfTextBusy(false);
      setPdfError('');
      setPreviewMode('pdfjs');
      notify(t('pdf.loading'));
      const pdfInput = file.desktopUrl ? { url: file.desktopUrl } : { data: new Uint8Array(await file.arrayBuffer()) };
      if (!alive()) return;
      // Tear the previous viewer down entirely, then build a fresh one on the
      // same DOM node. This is what makes switching between recently-read PDFs
      // survive; see disposeViewer().
      disposeViewer();
      const state = await ensureViewer();
      if (!state || !alive()) return;
      // (v51) Ask for our own worker explicitly. Without it pdf.js falls
      // back to `GlobalWorkerOptions.workerSrc`, which a foreign `pdfjsLib`
      // on the page may have rewritten to ITS worker.
      const task = state.pdfjsLib.getDocument({ ...pdfInput, ...desktop.pdfOptions });
      pdfLoadingTaskRef.current = task;
      task.onPassword = (update, reason) => {
        if (!alive()) return;
        props.onPdfPassword({
          text: reason === state.pdfjsLib.PasswordResponses.INCORRECT_PASSWORD ? '密码有误，请重试。' : '此 PDF 受密码保护。',
          submit: (password) => { if (alive()) update(password); },
          cancel: () => { if (alive()) closePaper(); },
        });
      };
      const pdf = await task.promise;
      if (!alive()) return;
      pdfDocRef.current = pdf;
      void desktop.indexOpenPaper(sourcePaper, pdf, indexing.signal).catch(() => {});
      state.linkService.setDocument(pdf, null);
      state.viewer.setDocument(pdf);
      pdfTextJobRef.current = { pdf, paper: sourcePaper, pending: null };
      setPdfAnalysisReady(true);
      // No synchronous applySpread() here: `_pages` does not exist yet. The
      // `pagesinit` handler above applies the current spread mode instead.
      setPageCount(pdf.numPages || 0);
      setPageNum(file.desktopPage || 1);
      setPdfName(file.name || '');
      setHasPdf(true);
      setPdfError('');
      setNotice((previous) => previous?.message === t('pdf.loading') ? null : previous);
    })().catch((error) => {
      if (!alive()) return;
      const reason = String(error && error.message ? error.message : error);
      disposeViewer();
      setPdfError(reason);
      openNativePreview(file, reason);
    });
    return () => { cancelled = true; indexing.abort(); };
  }, [mode, dropSeq]);

  // (#4) Two-column browsing. Toggling re-wraps pages and creates the
  // horizontal scroll range that (#5) drag-to-pan then scrolls.
  React.useEffect(() => {
    const s = pdfStateRef.current;
    if (s && s.viewer && s.V) applySpread(s.viewer, s.V);
    scheduleDecorateRef.current();
  }, [effectiveSpreadMode, dropSeq, hasPdf]);

  React.useEffect(() => {
    scheduleDecorateRef.current();
  }, [marks]);

  // (#6) Ctrl + wheel zooms the PDF instead of scrolling the page.
  React.useEffect(() => {
    if (mode !== 'pdf') return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const s = pdfStateRef.current;
      if (!s || !s.viewer) return;
      e.preventDefault();
      const v = s.viewer;
      const base = v.currentScale || 1;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, base * factor));
      try { v.currentScale = next; } catch (_) {}
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); };
  }, [mode, hasPdf]);

  React.useEffect(() => {
    if (!popupOn && inlinePopupRef.current) closeTranslationPopup();
  }, [popupOn]);

  React.useEffect(() => {
    const viewport = window.visualViewport;
    const fitPrevious = (previous) => {
      if (!previous) return previous;
      const box = fitPopupBox(previous, popupViewport());
      return Object.keys(box).every((key) => box[key] === previous[key]) ? previous : { ...previous, ...box };
    };
    const reflow = () => {
      popupDragCancelRef.current?.();
      cardGestureCancelRef.current?.();
      dismissSelectionSurfaces();
      setCardMaxHeight(displayCardHeightLimit());
      if (Object.keys(readShared().floatingCards).length) setFloatingBounds(popupViewport());
      setPopup(fitPrevious);
      setNoteBubble(fitPrevious);
    };
    window.addEventListener('resize', reflow);
    const syncDisplayHeight = () => setCardMaxHeight(displayCardHeightLimit());
    window.addEventListener('focus', syncDisplayHeight);
    document.addEventListener('fullscreenchange', reflow);
    viewport?.addEventListener('resize', reflow);
    viewport?.addEventListener('scroll', reflow);
    return () => {
      window.removeEventListener('resize', reflow);
      window.removeEventListener('focus', syncDisplayHeight);
      document.removeEventListener('fullscreenchange', reflow);
      viewport?.removeEventListener('resize', reflow);
      viewport?.removeEventListener('scroll', reflow);
      popupDragCancelRef.current?.();
      cardGestureCancelRef.current?.();
    };
  }, []);

  // (#4) Right-click on a selection inside the PDF opens our own menu with
  // Highlight / Add note. A double-click on an annotated span opens the note
  // bubble beside that sentence.
  React.useEffect(() => {
    if (mode !== 'pdf') return;
    const el = containerRef.current;
    if (!el) return;
    let menuRequest = 0;
    const onContextMenu = async (e) => {
      // (v9 #4) Two ways in, and the FIRST one needs no selection at all:
      // right-clicking an already highlighted/annotated sentence must open
      // the menu with "remove highlight" / note actions. Requiring a fresh
      // selection made the user re-select the whole sentence every time,
      // which is exactly what was reported.
      const clickEl = e.target && e.target.nodeType === 1 ? e.target : (e.target ? e.target.parentElement : null);
      const pageTarget = clickEl?.closest?.('.pdfViewer .page[data-page-number]');
      const textTarget = clickEl?.closest?.('.textLayer');
      const request = ++menuRequest;
      if (originalMediaEnabled && pageTarget && !e.ctrlKey && (window.getSelection()?.isCollapsed ?? true)) {
        e.preventDefault();
        e.stopPropagation();
        const hit = await originalMedia.find(e);
        if (request !== menuRequest) return;
        if (hit) {
          setMenu({ x: e.clientX, y: e.clientY, media: hit });
          return;
        }
      }
      if (pageTarget && !textTarget && pdfTextJobRef.current && !figureRunRef.current) {
        e.preventDefault();
        e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY, rect: pageTarget.getBoundingClientRect(), figure: true, page: Number(pageTarget.dataset.pageNumber) || pageNum });
        return;
      }
      const marks = marksRef.current || [];
      const clicked = clickEl?.closest?.('.textLayer span[data-elr-mark]');
      const noteOnSpan = (span) => {
        const ids = span?.dataset.elrMark?.split(' ') || [];
        return marks.find((mark) => mark.kind === 'note' && ids.includes(mark.id));
      };
      const page = Number(pageTarget?.dataset.pageNumber);
      const hitHighlight = pageTarget ? marks.find((mark) => mark.hl && highlightAnchors(mark).some((part) => {
        if (part.page !== page) return false;
        const bounds = highlightSurface(pageTarget, part.legacy).getBoundingClientRect();
        const px = (e.clientX - bounds.left) / bounds.width;
        const py = (e.clientY - bounds.top) / bounds.height;
        return part.rects.some(({ x, y, w, h }) => px >= x && px <= x + w && py >= y && py <= y + h);
      })) : null;
      const sel = window.getSelection();
      const raw = sel && el.contains(sel.anchorNode) && el.contains(sel.focusNode) ? selectionToText(sel) : '';
      const clickedNote = noteOnSpan(clicked);
      const target = hitHighlight || (!raw && clickedNote);
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        setMenu({
          x: e.clientX, y: e.clientY, rect: clicked?.getBoundingClientRect(),
          text: cleanSelectionText(target.text).slice(0, MAX_SELECTION),
          markId: hitHighlight?.id, noteId: clickedNote?.id,
          anchors: highlightAnchors(target),
        });
        return;
      }
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      const clipped = raw.slice(0, MAX_SELECTION);
      const ranges = Array.from({ length: sel.rangeCount }, (_, i) => sel.getRangeAt(i));
      const rect = ranges[0].getBoundingClientRect();
      const anchors = captureHighlightAnchors(el, ranges);
      const markId = marks.find((mark) => mark.hl && sameHighlightLocation(anchors, highlightAnchors(mark)))?.id;
      const anchorEl = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
      const needle = normText(clipped);
      const note = noteOnSpan(anchorEl?.closest('.textLayer span')) || marks.find((mark) => {
        const text = normText(mark.text);
        return mark.kind === 'note' && text && needle && (text.includes(needle) || needle.includes(text));
      });
      setMenu({ x: e.clientX, y: e.clientY, rect, text: clipped, markId, noteId: note?.id, anchors });
    };
    const onDoubleClick = (e) => {
      if (figurePickingRef.current) return;
      const target = e.target;
      if (!target || !target.closest) return;
      const span = target.closest('.textLayer span.elr-hl-note');
      if (!span) return;
      const rawIds = span.dataset ? String(span.dataset.elrMark || '') : '';
      const ids = rawIds ? rawIds.split(' ').filter(Boolean) : [];
      // (v23 #1) A double-click opens the ANNOTATION, so only note records are
      // considered — a plain highlight must not open the bubble.
      const mark = (marksRef.current || []).find((m) => ids.indexOf(m.id) !== -1 && (m.kind === 'note' || String(m.note || '').trim())) ||
        (marksRef.current || []).find((m) => String(m.note || '').trim() && String(m.text || '').trim() &&
          String(span.textContent || '').trim().indexOf(String(m.text || '').trim()) !== -1);
      if (!mark) return;
      e.preventDefault();
      e.stopPropagation();
      const { top, bottom } = span.getBoundingClientRect();
      setNoteBubble(placeNoteBubble(mark.id, mark.text, mark.note || '', { left: e.clientX, top, bottom }));
    };
    const dismiss = () => { menuRequest++; setMenu(null); };
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('dblclick', onDoubleClick);
    document.addEventListener('click', dismiss);
    document.addEventListener('scroll', dismiss, true);
    return () => {
      menuRequest++;
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('dblclick', onDoubleClick);
      document.removeEventListener('click', dismiss);
      document.removeEventListener('scroll', dismiss, true);
    };
  }, [mode, hasPdf, originalMediaEnabled, paperId, dropSeq]);

  React.useEffect(() => {
    const isPdf = mode === 'pdf';
    const source = isPdf ? containerRef.current : inputRef.current;
    if (!source) return;
    let timer;
    let gesture = null;
    const inside = (node) => Boolean(node && source.contains(node));
    const readSelection = () => {
      if (!isPdf) {
        const value = cleanSelectionText(source.value.slice(source.selectionStart, source.selectionEnd));
        const rect = source.getBoundingClientRect();
        return { value, rect: { left: rect.left + 12, top: rect.top, bottom: rect.top + 36 } };
      }
      const native = window.getSelection();
      if (!native || native.isCollapsed || !native.rangeCount || !inside(native.anchorNode) || !inside(native.focusNode)) return null;
      const ranges = Array.from({ length: native.rangeCount }, (_, i) => native.getRangeAt(i));
      return { value: selectionToText(native), rect: ranges[0].getBoundingClientRect(), ranges };
    };
    const cancel = () => {
      clearTimeout(timer);
      gesture = null;
    };
    const commit = () => {
      clearTimeout(timer);
      if (!gesture || gesture.drawing || readShared().paperId !== paperId) return;
      if (isPdf && figurePickingRef.current) { cancel(); return; }
      const { intent, touch, from, to, correctEdges } = gesture;
      if (!touch) gesture = null;
      if (correctEdges) includePdfEdgeGlyphs(window.getSelection(), from, to);
      const picked = readSelection();
      if (picked && picked.value.length >= (isPdf ? 1 : 2)) stageRef.current(picked.value, picked.rect, intent, picked.ranges);
    };
    const schedule = (delay) => {
      clearTimeout(timer);
      timer = setTimeout(commit, delay);
    };
    const onChange = () => {
      if (gesture && !gesture.drawing) schedule(gesture.touch ? SELECTION_DEBOUNCE_MS : 30);
    };
    const onNativeTextSelect = () => {
      if (!gesture && document.activeElement === source) {
        const picked = readSelection();
        if (!picked || picked.value.length < 2 || picked.value === readShared().selection) return;
        gesture = { drawing: false, intent: 'replace' };
      }
      onChange();
    };
    const onDown = (event) => {
      if (event.isPrimary === false) return;
      if (event.target?.closest?.('.elr-selection-tools, .elr-popup, .elr-note-bubble')) { cancel(); return; }
      if (gesture && !gesture.drawing) commit();
      cancel();
      if (isPdf) dismissSelectionSurfaces();
      if (event.button !== 0 || !inside(event.target)
        || (isPdf && (figurePickingRef.current || event.ctrlKey || event.metaKey))) return;
      const current = readShared();
      const append = event.shiftKey && current.selectionEdit.trim();
      let intent = append ? 'append' : 'replace';
      if (append || (!event.shiftKey && current.selectionPrefix)) {
        if (isPdf) {
          // Reset the browser anchor so a new drag starts at the pointer.
          window.getSelection()?.removeAllRanges();
        } else {
          const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
          if (caret?.offsetNode === source) {
            source.setSelectionRange(caret.offset, caret.offset);
          } else if (append) {
            intent = 'extend';
          } else {
            source.setSelectionRange(source.selectionEnd, source.selectionEnd);
          }
        }
      }
      const touch = event.pointerType === 'touch';
      gesture = { pointer: event.pointerId, drawing: true, touch, intent };
      if (isPdf && !touch) {
        gesture.start = [event.clientX, event.clientY];
        gesture.from = pdfGlyphAt(...gesture.start);
      }
    };
    const onUp = (event) => {
      if (gesture?.pointer !== event.pointerId) return;
      gesture.drawing = false;
      if (gesture.start && Math.hypot(event.clientX - gesture.start[0], event.clientY - gesture.start[1]) >= 3) {
        gesture.to = pdfGlyphAt(event.clientX, event.clientY);
        gesture.correctEdges = true;
      }
      schedule(30);
    };
    const onCancel = (event) => {
      if (gesture?.pointer !== event.pointerId) return;
      if (!gesture.touch) { cancel(); return; }
      gesture.drawing = false;
      schedule(SELECTION_DEBOUNCE_MS);
    };
    const onKey = (event) => {
      const extendsRange = event.shiftKey && /^(Arrow|Home|End|Page)/.test(event.key);
      const selectsAll = !isPdf && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a';
      if (!extendsRange && !selectsAll) return;
      const insidePdfCaret = isPdf && event.target === document.body && inside(window.getSelection()?.anchorNode);
      if ((!inside(event.target) && !insidePdfCaret) || gesture?.drawing) return;
      if (!gesture?.keyboard || selectsAll) {
        const current = readShared();
        const extend = extendsRange && current.selectionPrefix && readSelection()?.value === current.selection;
        gesture = { keyboard: true, drawing: false, intent: extend ? 'extend' : 'replace' };
      }
      schedule(30);
    };
    const trackSelection = frameWriter(() => {
      const tools = selectionToolsRef.current;
      if (!tools) return;
      const rect = tools.range?.getBoundingClientRect();
      const bounds = source.getBoundingClientRect();
      if (!rect?.width || rect.bottom <= bounds.top || rect.top >= bounds.bottom
        || rect.right <= bounds.left || rect.left >= bounds.right) {
        dismissSelectionSurfaces();
        return;
      }
      if (rect.left === tools.rect.left && rect.top === tools.rect.top && rect.bottom === tools.rect.bottom) return;
      const popup = inlinePopupRef.current;
      const follows = popup?.followsSelection && !popupDragCancelRef.current;
      const annotation = noteBubbleRef.current;
      const followsNote = annotation?.anchorRange && annotation.anchorRange === tools.range;
      const layout = follows ? selectionTranslationLayout(rect, popup, popupMinimum.h) : null;
      const position = layout?.position || selectionToolLayout(rect, followsNote ? annotation.h : 0);
      setSelectionTools((current) => current?.range === tools.range ? { ...current, rect, position } : current);
      if (layout) setPopup((current) => current === popup ? { ...current, ...layout.box } : current);
      if (followsNote) setNoteBubble((current) => current === annotation ? { ...current, ...popupBelowSelectionTools(current, position) } : current);
    });
    const onScroll = () => {
      if (selectionToolsRef.current) trackSelection.push(true);
    };
    const dismissTranslation = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing
        || event.target?.closest?.('.elr-term-popover')
        || document.querySelector('dialog:modal, [popover]:popover-open')) return;
      if (noteBubbleRef.current && event.target?.closest?.('.elr-note-bubble')) {
        event.preventDefault();
        closeNoteBubble();
        return;
      }
      if (isPdf && (selectionToolsRef.current || inlinePopupRef.current?.followsSelection)) {
        event.preventDefault();
        dismissSelectionSurfaces();
      } else if (inlinePopupRef.current) {
        event.preventDefault();
        closeTranslationPopup();
      }
    };
    document.addEventListener('selectionchange', onChange);
    if (isPdf) source.addEventListener('scroll', onScroll, { passive: true });
    if (!isPdf) source.addEventListener('select', onNativeTextSelect);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onCancel, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keydown', dismissTranslation);
    window.addEventListener('blur', cancel);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      if (isPdf) source.removeEventListener('scroll', onScroll);
      trackSelection.cancel();
      if (!isPdf) source.removeEventListener('select', onNativeTextSelect);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onCancel, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('keydown', dismissTranslation);
      window.removeEventListener('blur', cancel);
      cancel();
    };
  }, [mode, paperId, previewMode, panMode, popupMinimum.h]);

  const referenceScanComplete = (scan) => {
    if (scan.next === null && !scan.failed.size) return true;
    if (!scan.heading) return false;
    const end = (scan.end || scan.totalLines + 1) - 1;
    let next = scan.heading;
    const ranges = Array.from(scan.windows.values()).sort((a, b) => a.from - b.from);
    for (const range of ranges) {
      if (scan.failed.has(range.cursor) || range.to < next) continue;
      if (range.from > next) return false;
      next = range.to + 1;
      if (next > end) return true;
    }
    return false;
  };

  const doReferences = async () => {
    if (!await prepareAnalysisText(false)) return;
    const { paperId: paper, text: source } = readShared();
    if (!source.trim() || refRunRef.current) return;

    const pdfSource = pdfReferenceSourceRef.current;
    const originalPdf = pdfSource?.paper === paper && pdfSource?.text === source ? pdfSource : null;
    const ticket = { controller: new AbortController() };
    refRunRef.current = ticket;
    const alive = () => refRunRef.current === ticket && readShared().paperId === paper && readShared().text === source;
    const model = bodyRef.current();
    const call = async (path, payload, timeout) => {
      try {
        const result = await post(path, { ...model, ...payload }, timeout, ticket.controller.signal);
        return result?.ok ? result : null;
      } catch (_) {
        return null;
      }
    };
    const save = (rows) => {
      setReferences(rows);
      saveResult(paper, { references: rows });
    };
    let current = Array.isArray(readShared().references) ? readShared().references : [];
    setReferencesBusy(true);
    try {
      const planning = await loadPaperPlanning().catch(() => null);
      if (!planning || !alive()) return;
      const plan = planning.planReferenceScan(originalPdf?.referenceText ?? source, originalPdf?.pageLineCounts);
      const scan = { next: 0, windows: new Map(), failed: new Set() };
      const found = new Map();
      for (let cursor = 0; cursor < plan.windows.length && !referenceScanComplete(scan); cursor++) {
        const segment = (retryWindow) => call('/references/segment', {
          referenceWindow: planning.referenceScanWindow(plan, cursor, retryWindow), retryWindow,
        }, retryWindow ? 150000 : 80000);
        let batch = await segment(false);
        if (!alive()) return;
        if (!batch || batch.partial) {
          const retry = await segment(true);
          if (!alive()) return;
          if (retry && (!batch || !retry.partial)) batch = retry;
          else if (retry) {
            batch.entries = [...new Map([...batch.entries, ...retry.entries].map((row) => [row.id, row])).values()];
          }
        }
        if (!batch) break;
        scan.next = batch.nextCursor;
        scan.totalLines = batch.totalLines;
        if (batch.partial) scan.failed.add(cursor);
        else {
          scan.heading ??= batch.headingLine;
          scan.end ??= batch.endLine;
        }
        scan.windows.set(cursor, batch);
        for (const row of batch.entries) found.set(row.id, row);
        if (found.size) {
          const rows = [...found.values()].sort((a, b) => a.startLine - b.startLine);
          const distinct = [];
          for (const row of rows) {
            if (!distinct.length || row.startLine > distinct.at(-1).endLine) distinct.push(row);
          }
          current = mergeReferenceCache(distinct, current);
          save(current);
        }
      }
      if (!found.size && referenceScanComplete(scan)) {
        current = [];
        save(current);
      }

      // Keep links supplied in the paper or already verified. A new run retries
      // entries whose address could not be resolved.
      const linked = (item) => item.url && (item.status === 'provided' || item.status === 'matched');
      const work = current.filter((item) => !linked(item) || !item.zh);
      for (let start = 0; start < work.length; start += 6) {
        let entries = work.slice(start, start + 6);
        const needFields = entries.filter((item) => !item.title || !item.zh);
        if (needFields.length) {
          const fields = await call('/references/fields', { entries: needFields }, 130000);
          if (!alive()) return;
          current = applyReferenceFields(current, fields);
          entries = applyReferenceFields(entries, fields);
          save(current);
        }
        const missing = entries.filter((item) => item.title && !linked(item));
        if (missing.length) {
          const response = await call('/references/resolve', { entries: missing }, 240000);
          if (!alive()) return;
          current = applyReferenceResolve(current, response);
          save(current);
        }
      }
    } finally {
      if (refRunRef.current === ticket) {
        refRunRef.current = null;
        setReferencesBusy(false);
      }
    }
  };

  const mergeReferenceCache = (fresh, previous) => {
    const byId = new Map(previous.filter((row) => row && row.id).map((row) => [row.id, row]));
    return fresh.map((row) => {
      const old = byId.get(row.id);
      if (!old || old.raw !== row.raw || (row.title && old.title && row.title !== old.title)) return row;
      const sameCitation = (!row.year || !old.year || row.year === old.year)
        && (!row.authors || !old.authors || row.authors === old.authors);
      const cachedAddress = row.status !== 'provided' && sameCitation
        && ['matched', 'confirm', 'none', 'retry'].includes(old.status);
      return {
        ...row,
        title: row.title || old.title || '',
        zh: old.zh || '',
        authors: row.authors || old.authors || '',
        venue: row.venue || old.venue || '',
        year: row.year || old.year || '',
        ...(cachedAddress ? {
          status: old.status,
          url: old.status === 'matched' ? old.url : '',
          doi: old.status === 'matched' ? old.doi : '',
          found: old.status === 'matched' && Boolean(old.url),
        } : {}),
      };
    });
  };

  const applyReferenceFields = (list, payload) => {
    if (!payload || !payload.ok || !Array.isArray(payload.fields)) return list;
    const byId = new Map();
    for (const field of payload.fields) {
      const id = String((field && field.id) || '');
      if (id && !byId.has(id)) byId.set(id, field);
    }
    return list.map((item) => {
      const field = byId.get(item.id);
      if (!field) return item;
      return Object.assign({}, item, {
        title: String(item.title || field.title || ''),
        zh: String(item.zh || field.zh || ''),
        authors: String(item.authors || field.authors || ''),
        venue: String(item.venue || field.venue || ''),
        year: String(item.year || field.year || ''),
        status: item.status === 'provided' ? 'provided' : (item.status === 'pending' ? 'fields' : item.status),
      });
    });
  };

  const applyReferenceResolve = (list, payload) => {
    if (!payload || !payload.ok || !Array.isArray(payload.results)) return list;
    const byId = new Map();
    for (const hit of payload.results) {
      const id = String((hit && hit.id) || '');
      if (id && !byId.has(id)) byId.set(id, hit);
    }
    return list.map((item) => {
      const hit = byId.get(item.id);
      if (!hit) return item;
      return Object.assign({}, item, {
        status: String(hit.status || item.status),
        reason: String(hit.reason || ''),
        url: String(hit.url || ''),
        doi: String(hit.doi || ''),
        found: Boolean(hit.url) && (hit.status === 'matched' || hit.status === 'provided'),
        matchedTitle: String(hit.matchedTitle || ''),
        matchedYear: String(hit.matchedYear || ''),
      });
    });
  };


  const doSummary = async (retry = false) => {
    const { paperId: paper, text: source, summaryDetail: previous, summaryMeta: previousMeta } = readShared();
    if (!source.trim()) { notify(t('selection.empty'), 'error'); return; }
    if (summaryRunRef.current) return;
    const summaryDraft = retry && previous?.format === 'detailed-markdown' ? previous.draft : undefined;
    if (retry && !summaryDraft) return;
    const request = bodyRef.current();
    const selection = describeModelSelection(request);
    const controller = new AbortController();
    summaryRunRef.current = controller;
    const alive = () => summaryRunRef.current === controller && readShared().paperId === paper && readShared().text === source;
    const reportIssue = (message) => {
      setSummaryIssue(message);
      notify(message, 'error');
    };
    setSummaryIssue('');
    setSummaryBusy(true);
    notify(t(retry ? 'summary.synthesizing' : 'summary.running'));
    try {
      const pdfSource = pdfReferenceSourceRef.current;
      const pageTextLengths = pdfSource?.paper === paper && pdfSource.text === source ? pdfSource.pageTextLengths : undefined;
      const meta = await fetchReader(BASE + '/meta', {
        credentials: 'same-origin', cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      }).then((response) => response.ok ? response.json() : null).catch(() => null);
      if (!alive()) return;
      if (meta?.summaryFormat !== 'detailed-markdown') {
        reportIssue(t('summary.hostUnavailable'));
        return;
      }
      const data = await post('/summary', {
        ...request, text: source, pageTextLengths, summaryDraft,
      }, 780000, controller.signal);
      if (!alive()) return;
      if (data && data.ok) {
        if (data.format !== 'detailed-markdown') {
          reportIssue(t('summary.hostUnavailable'));
          return;
        }
        if (typeof data.text !== 'string' || !data.text.trim()) {
          reportIssue(t('summary.failed'));
          return;
        }
        const value = data.text;
        const coverage = data.coverage ? { ...data.coverage, failedChunks: Number(data.failedChunks) || 0, notes: data.mode === 'notes' } : null;
        const result = {
          summary: value, summaryCoverage: coverage,
          summaryMeta: retry && coverage?.notes ? previousMeta : readGenerationMetadata(data, selection),
          summaryDetail: {
            format: 'detailed-markdown', mode: data.mode, draft: data.summaryDraft || null,
            error: typeof data.synthesisError === 'string' ? data.synthesisError.slice(0, 500) : '',
          },
        };
        writeShared(result);
        saveResult(paper, result);
        let message = coverage?.notes ? t('summary.notesOnly') : t('ready');
        if (data.failedChunks) message += ' · ' + t('summary.coverageFailed', { count: data.failedChunks });
        notify(message, data.failedChunks ? 'error' : 'ok');
      } else reportIssue(data?.error || t('summary.failed'));
    } catch (error) {
      if (alive()) {
        reportIssue(error?.status === 404 || error?.status === 405
          ? t('summary.hostUnavailable') : String(error?.message || t('summary.failed')));
      }
    } finally {
      if (summaryRunRef.current === controller) {
        summaryRunRef.current = null;
        setSummaryBusy(false);
      }
    }
  };

  // (#6) Explicit re-analysis: nothing is regenerated unless this is pressed.
  // (v20 #1) This used to re-run the full-text translation as well; that feature
  // is gone, so the analysis panel's own button (doSummary) is the only entry.

  // (v8 #3) Explain a formula in the context of the current paper. The paper
  // text is forwarded so the Host can ground the symbols in what the authors
  // actually defined, instead of guessing from the expression alone.
  const explainFormula = async (value, rect, region) => {
    const formula = String(value || '').trim();
    if (!formula && !region) { notify(t('selection.empty'), 'error'); return; }
    cancelFormulaWork();
    const paper = readShared().paperId;
    const job = pdfTextJobRef.current;
    const run = { controller: new AbortController(), task: null };
    const alive = () => formulaRunRef.current === run && readShared().paperId === paper;
    formulaRunRef.current = run;
    const request = bodyRef.current();
    const pos = rectForPopup(rect) || { x: 40, y: 120 };
    if (paper) showContentCategory('formula');
    setFormulaCard({ x: pos.x, y: pos.y, text: formula, body: '', busy: true, paper });
    try {
      let context = String(text || '').slice(0, 40000);
      let image;
      let position;
      if (region) {
        const page = await job.pdf.getPage(region.page);
        if (!alive()) return;
        const viewport = page.getViewport({ scale: 1, rotation: region.rotation });
        position = figurePagePosition(page, viewport, region.crop);
        const contents = await readPdfPageText(job, region.page, page).catch(() => null);
        if (!alive()) return;
        context = nearbyFigureText(contents, viewport, region.crop).context;
        if (!formula) image = await renderFigureCrop(page, viewport, region.crop, run);
      }
      if (!alive()) return;
      const data = image
        ? await post('/figure', { ...request, image, context, page: region.page, position: region.crop, kind: 'formula' }, 165000, run.controller.signal)
        : await post('/formula', { ...request, formula: formula.slice(0, 4000), context }, 150000, run.controller.signal);
      if (!alive()) return;
      if (!data?.ok) throw new Error(data?.code === 'figure-model' ? t('formula.imageModelRequired') : (data?.error || t('formula.failed')));
      const body = typeof data.text === 'string' ? data.text.trim() : '';
      if (!body) throw new Error(t('formula.failed'));
      setFormulaCard((previous) => previous && { ...previous, body, busy: false });
      const saved = !paper || saveContentAnalysis(paper, 'formula', {
        id: globalThis.crypto?.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2),
        kind: 'formula', page: region?.page ?? (job?.paper === paper ? pageNum : null),
        position, formula, number: region?.block.number || equationNumber(formula),
        text: body, ...readGenerationMetadata(data, describeModelSelection(request)),
      });
      notify(saved ? t('ready') : t('figure.saveFailed'), saved ? 'ok' : 'warn');
    } catch (error) {
      if (!alive()) return;
      const msg = String(error && error.message ? error.message : error);
      setFormulaCard((previous) => previous && { ...previous, body: msg, busy: false, error: msg });
      notify(msg, 'error');
    } finally {
      if (formulaRunRef.current === run) formulaRunRef.current = null;
    }
  };

  const mediaActionLabel = (kind) => t(kind === 'formula' ? 'formula.explain' : kind === 'table' ? 'table.explain' : 'figure.explain');
  const explainOriginalMedia = (hit) => {
    setMenu(null);
    const job = pdfTextJobRef.current;
    if (!job || !originalMediaEnabled || !containerRef.current?.contains(hit.node)) return;
    const { block, crop, page, rect, rotation } = hit;
    if (block.kind === 'formula') {
      void explainFormula(block.formulaText, rect, hit);
      return;
    }
    void analyzeFigure(job, page, rotation, crop, block);
  };

  async function termContextFromPdf(job, anchor, term) {
    const { page, rects } = anchor;
    const rect = rects[0];
    const rotation = pdfStateRef.current?.viewer.getPageView(page - 1)?.viewport?.rotation;
    const proxy = await job.pdf.getPage(page);
    const viewport = proxy.getViewport(Number.isFinite(rotation) ? { scale: 1, rotation } : { scale: 1 });
    const [x, y] = viewport.convertToPdfPoint((rect.x + rect.w / 2) * viewport.width, (rect.y + rect.h / 2) * viewport.height);
    const content = await readPdfPageText(job, page, proxy);
    const lines = content.readingLines ||= referenceReadingOrder(readingLines(content.items));
    const blocks = paragraphBlocks(lines, content.view);
    const target = blockAtPoint(blocks, x, y) || blockForAnchor(blocks, { x, y });
    return target ? paragraphTermContext(blocks, blocks.indexOf(target), term) : '';
  }

  const explainTerm = async (value, surrounding, anchors) => {
    const term = String(value || '').trim().slice(0, MAX_TERM_CHARS).trimEnd();
    if (!term) { notify(t('selection.empty'), 'error'); return; }
    const { paperId: paper, mode, text: source } = readShared();
    if (!paper && (mode !== 'text' || !source.trim())) {
      notify(t('term.needPaper'), 'error');
      return;
    }
    setCardEnabled('terms', true);
    setTermsOpen(true);
    const entries = getPaperTerms(paper);
    const key = term.toLowerCase();
    const sameTerm = (entry) => entry.term.trim().toLowerCase() === key;
    const previous = entries.find(sameTerm);
    if (previous?.busy) return;
    const record = normalizeTerm({ id: previous?.id, term, body: previous?.body });
    const job = pdfTextJobRef.current;
    const anchor = anchors?.find((part) => part.rects?.length);
    const supplied = String(surrounding || '').trim();
    setPaperTerms(paper, [{ ...record, busy: true }, ...entries.filter((entry) => !sameTerm(entry))]);
    notify(t('term.running'));

    let body = record.body;
    let error = '';
    try {
      const passage = mode === 'pdf' && job?.paper === paper && anchor
        ? await termContextFromPdf(job, anchor, term).catch(() => '') : '';
      record.surrounding = passage || (supplied && supplied !== term ? supplied : termContextFromText(source, term));
      const data = await post('/term', {
        ...bodyRef.current(),
        term,
        surrounding: record.surrounding,
      });
      const explanation = String(data?.text || '').trim();
      if (!data?.ok || !explanation) throw new Error(data?.error || t('term.failed'));
      body = explanation;
    } catch (failure) {
      error = failure?.timeout ? t('term.failed') : String(failure?.message || failure || t('term.failed'));
    }

    const current = getPaperTerms(paper);
    if (!current.some((entry) => entry.id === record.id)) return;
    setPaperTerms(paper, current.map((entry) => entry.id === record.id ? { ...record, body, error } : entry));
    if (readShared().paperId === paper) {
      notify(error || t('ready'), error ? 'error' : 'ok');
    }
  };

  const explainSelectionTerm = (input) => {
    const { selectionEdit: draft, paperId: paper } = readShared();
    const picked = input?.value.slice(input.selectionStart, input.selectionEnd);
    const term = cleanSelectionText(picked) || cleanSelectionText(draft);
    if (term.length > MAX_TERM_CHARS) { notify(t('term.selectShort'), 'warn'); return; }
    const selected = selectedHighlightRef.current;
    const anchors = selected?.paper === paper && cleanSelectionText(selected.text).includes(term) ? selected.anchors : null;
    const excerpt = picked ? termContextWindow(draft, input.selectionStart, picked.length) : '';
    return explainTerm(term, excerpt, anchors);
  };

  const removeTerm = (id) => {
    const { paperId: paper } = readShared();
    setPaperTerms(paper, getPaperTerms(paper).filter((entry) => entry.id !== id));
    if (termBubble?.id === id) setTermBubble(null);
    if (termOpenId === id) setTermOpenId('');
  };

  const handleFile = (file, existingId) => {
    if (!file) return;
    if (isPdf(file) && !file.desktopId) {
      openPaper(file).then((paper) => { if (paper) handleFile(paper, paper.desktopId); }).catch((error) => notify(error.message, 'error'));
      return;
    }
    const name = file.name || 'untitled';
    // (#5) One entry per physical file: identity is name + size + lastModified,
    // so re-opening the same paper refreshes its entry instead of adding a new
    // one. The entry id stays stable so saved translation/analysis/marks and
    // any in-memory bytes keep working.
    const identity = [name, file.size || 0, file.lastModified || 0].join('|');
    const known = recent.find((x) => x && x.identity === identity);
    const id = file.desktopId || existingId || (known && known.id) || (String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8));
    fileCache.set(id, file);
    pdfTextJobRef.current = null;
    pdfReferenceSourceRef.current = null;
    setPdfAnalysisReady(false);
    setPdfTextBusy(false);
    resetAnalysisTasks();
    if (id !== readShared().paperId) resetSelection();
    clearFind();
    setText('');
    setPaperId(id);
    const base = { id, identity, name, size: file.size || 0, addedAt: Date.now() };
    if (isPdf(file)) {
      addRecent(Object.assign({}, base, { mode: 'pdf' }));
      lastFileRef.current = file;
      changeMode('pdf');
      setDropSeq((n) => n + 1);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        if (readShared().paperId !== id) return;
        const value = String(reader.result || '');
        addRecent(Object.assign({}, base, { mode: 'text', text: value.slice(0, RECENT_TEXT_CAP) }));
        changeMode('text');
        setText(value);
        setPdfName(name);
        notify(t('ready'), 'ok');
      };
      reader.onerror = () => notify(t('error'), 'error');
      reader.readAsText(file);
    }
  };

  const onDrop = (event) => {
    // (v19 #3) A section-reorder drop bubbles here as well; it carries no files
    // and must not be treated as "the user dropped a paper".
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    const files = event.dataTransfer && event.dataTransfer.files;
    if (files && files[0]) handleFile(files[0]);
  };
  // (v19 #3) Only a FILE drag may raise the "release to open" mask. The section
  // grips in the right column start an HTML5 drag too, and that dragover event
  // bubbles up to this root handler, which used to light up the mask while the
  // user was merely reordering the analysis panels.
  const isFileDrag = (event) => {
    const dt = event.dataTransfer;
    if (!dt) return false;
    const types = dt.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === 'Files' || types[i] === 'application/x-moz-file') return true;
    }
    return false;
  };
  const onDragOver = (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!showPdfStart && !dragOver) setDragOver(true);
  };
  const onDragLeave = (event) => {
    if (!dragOver) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false);
  };
  const onPdfFile = (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) handleFile(file);
    event.target.value = '';
  };
  const onTxtFile = (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) handleFile(file);
    event.target.value = '';
  };

  const goPage = (delta) => {
    if (!pdfStateRef.current?.viewer) return;
    const next = Math.max(1, Math.min(pageCount || 1, pageNum + delta));
    if (next !== pageNum) pdfReading.jump({ page: next });
  };

  // ---------------------------------------------------------------------
  // (v39) In-document search.
  //
  // Search uses rendered text when available and reads PDF text directly
  // for unopened pages. Both paths ignore whitespace. Hits are stored as
  // { page, at, len } offsets into that page's `pageText`; rectangles are
  // recomputed at paint time from the live spans, so a zoom only repaints
  // instead of re-searching.
  // ---------------------------------------------------------------------
  const [findQuery, setFindQuery] = React.useState('');
  const [findHits, setFindHits] = React.useState([]);
  const [findAt, setFindAt] = React.useState(-1);
  const [findBusy, setFindBusy] = React.useState(false);
  const [findControl, setFindControl] = React.useState({ open: false, motion: false });
  const findRegionId = React.useId();
  const outlineId = React.useId();
  const findInputRef = React.useRef(null);
  const findButtonRef = React.useRef(null);
  const findBoxRef = React.useRef(null);
  React.useLayoutEffect(() => {
    if (findControl.open) findInputRef.current?.focus({ preventScroll: true });
  }, [findControl.open]);
  const findHitsRef = React.useRef([]);
  findHitsRef.current = findHits;
  const findAtRef = React.useRef(-1);
  findAtRef.current = findAt;
  const findQueryRef = React.useRef('');
  findQueryRef.current = findQuery;
  React.useEffect(() => {
    if (!findControl.open) return;
    const dismissEmptyFind = (event) => {
      if (findQueryRef.current.trim() || findBoxRef.current?.contains(event.target)) return;
      setFindQuery('');
      setFindControl({ open: false, motion: true });
    };
    document.addEventListener('pointerdown', dismissEmptyFind, true);
    return () => document.removeEventListener('pointerdown', dismissEmptyFind, true);
  }, [findControl.open]);
  // The needle the current `findHits` were produced from. Enter compares it
  // against what is typed now: an edited query must RE-SEARCH, an unchanged
  // one must step — otherwise typing a new word and pressing Enter would walk
  // through the previous word's hits.
  const findSearchedRef = React.useRef('');
  const findRunRef = React.useRef(0);
  const findScrollRef = React.useRef(null);
  const paintFindHitsRef = React.useRef(() => {});

  // Rectangles of ONE hit inside ONE page, resolved through the cached
  // index (norm index -> raw index per span, exactly like the marks pass).
  const findRectsForPage = (pageEl, hit) => {
    const spans = pageEl.querySelectorAll('.textLayer span:not(.markedContent)');
    if (!spans.length) return null;
    const cached = pageIndexOf(pageEl, spans);
    const { texts, starts, maps, pageText } = cached;
    if (!pageText) return null;
    const at = hit.at;
    const end = at + hit.len;
    const out = [];
    for (let i = 0; i < spans.length; i++) {
      const s = starts[i];
      const e = s + texts[i].length;
      if (!texts[i].length || e <= at || s >= end) continue;
      const normFrom = Math.max(at, s) - s;
      const normTo = Math.min(end, e) - s;
      const map = maps[i];
      if (!map || !map.length) continue;
      const rawFrom = map[Math.max(0, Math.min(normFrom, map.length - 1))];
      const rawTo = map[Math.max(0, Math.min(normTo - 1, map.length - 1))] + 1;
      let rects = rectsForSpanRange(spans[i], rawFrom, rawTo);
      if (!rects) {
        try { rects = [spans[i].getBoundingClientRect()]; } catch (_) { rects = null; }
      }
      if (rects) for (let k = 0; k < rects.length; k++) out.push(rects[k]);
    }
    return out.length ? out : null;
  };

  // Repaint EVERY hit on every laid-out page, with the current one darker.
  // Called after each decoration pass too (a zoom replaces the page canvas
  // and would otherwise leave stale orange rectangles behind).
  const paintFindHits = () => {
    const container = containerRef.current;
    if (!container) return;
    clearFindOverlays();
    const hits = findHitsRef.current || [];
    if (!hits.length) return;
    const active = findAtRef.current;
    const pages = container.querySelectorAll('.pdfViewer .page');
    // Group by page so one page pays for one canvas, not one per hit.
    const byPage = new Map();
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const list = byPage.get(h.page);
      if (list) list.push({ hit: h, active: i === active });
      else byPage.set(h.page, [{ hit: h, active: i === active }]);
    }
    byPage.forEach((entries, pageNo) => {
      const pageEl = pages[pageNo - 1];
      if (!pageEl) return;
      // Two layers per page: the active hit gets the darker fill, every other
      // hit the lighter one, so stepping through matches is always visible no
      // matter how many of them share a page.
      const idleRects = [];
      const liveRects = [];
      for (let i = 0; i < entries.length; i++) {
        const r = findRectsForPage(pageEl, entries[i].hit);
        if (!r) continue;
        const bucket = entries[i].active ? liveRects : idleRects;
        for (let k = 0; k < r.length; k++) bucket.push(r[k]);
      }
      if (idleRects.length) paintFindOverlay(pageEl, idleRects, false);
      if (liveRects.length) paintFindOverlay(pageEl, liveRects, true);
    });
  };
  paintFindHitsRef.current = paintFindHits;

  const collectFindHits = async (rawQuery, job, alive) => {
    const container = containerRef.current;
    const needle = normText(rawQuery);
    if (!container || !job || !needle) return [];
    const pages = container.querySelectorAll('.pdfViewer .page');
    const out = [];
    for (let p = 0; p < job.pdf.numPages; p++) {
      if (!alive()) return [];
      const pageEl = pages[p];
      const spans = pageEl && pageEl.querySelectorAll('.textLayer span:not(.markedContent)');
      let pageText = spans && spans.length ? pageIndexOf(pageEl, spans).pageText : null;
      if (pageText == null) {
        try {
          const content = await readPdfPageText(job, p + 1);
          if (!alive()) return [];
          pageText = content.searchText;
        } catch (_) { continue; }
      }
      if (!pageText) continue;
      let from = 0;
      for (;;) {
        const at = pageText.indexOf(needle, from);
        if (at < 0) break;
        out.push({ page: p + 1, at, len: needle.length });
        if (out.length >= MAX_FIND_HITS) return out;
        from = at + Math.max(1, needle.length);
      }
    }
    return out;
  };

  const showFindHit = (next, hits) => {
    pdfReading.showSource();
    setFindAt(next);
    findAtRef.current = next;
    const hit = hits[next];
    const container = containerRef.current;
    const s = pdfStateRef.current;
    if (container && s && s.viewer) {
      // Setting the page FIRST is what makes the target page exist in the
      // DOM at all — pdf.js only lays out pages around the current one, so
      // scrolling before the switch lands on an element that does not exist.
      try {
        s.viewer.currentPageNumber = hit.page;
        setPageNum(hit.page);
      } catch (_) {}
    }
    const scroll = () => {
      if (findScrollRef.current !== pending) return;
      const again = containerRef.current;
      if (!again) return;
      const pages = again.querySelectorAll('.pdfViewer .page');
      const pageEl = pages[hit.page - 1];
      if (!pageEl) return;
      const spans = pageEl.querySelectorAll('.textLayer span:not(.markedContent)');
      if (!spans.length) { paintFindHitsRef.current(); return; }
      findScrollRef.current = null;
      const cached = pageIndexOf(pageEl, spans);
      // Scroll to the span that CONTAINS the hit, not to the page top.
      let target = null;
      for (let i = 0; i < spans.length; i++) {
        const from = cached.starts[i];
        const to = from + cached.texts[i].length;
        if (to > hit.at) { target = spans[i]; break; }
      }
      paintFindHitsRef.current();
      if (target) scrollElementIntoView(again, target);
    };
    const pending = { page: hit.page, scroll };
    findScrollRef.current = pending;
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(scroll);
    } else {
      setTimeout(scroll, 16);
    }
  };

  const runFind = async (delta) => {
    const query = normText(findQueryRef.current);
    const job = pdfTextJobRef.current;
    if (!query || !job) return;
    const run = ++findRunRef.current;
    const alive = () => findRunRef.current === run && pdfTextJobRef.current === job && normText(findQueryRef.current) === query;
    setFindBusy(true);
    try {
      const hits = await collectFindHits(query, job, alive);
      if (!alive()) return;
      findHitsRef.current = hits;
      findSearchedRef.current = query;
      setFindHits(hits);
      if (!hits.length) {
        setFindAt(-1);
        findAtRef.current = -1;
        clearFindOverlays();
        notify(t('find.noMatches'));
        return;
      }
      const pageNow = Number(pdfStateRef.current?.viewer?.currentPageNumber) || Number(pageNum) || 1;
      const start = delta < 0
        ? hits.findLastIndex((hit) => hit.page <= pageNow)
        : hits.findIndex((hit) => hit.page >= pageNow);
      showFindHit(start >= 0 ? start : (delta < 0 ? hits.length - 1 : 0), hits);
    } finally {
      if (findRunRef.current === run) setFindBusy(false);
    }
  };
  const stepFind = (delta) => {
    const query = normText(findQueryRef.current);
    if (!query || findBusy) return;
    const hits = findHitsRef.current;
    if (!hits.length || query !== findSearchedRef.current) {
      void runFind(delta);
      return;
    }
    const start = findAtRef.current;
    const next = start < 0 ? (delta < 0 ? hits.length - 1 : 0) : (start + delta + hits.length) % hits.length;
    showFindHit(next, hits);
  };
  const resetFindResults = () => {
    findRunRef.current++;
    findScrollRef.current = null;
    setFindBusy(false);
    findSearchedRef.current = '';
    setFindHits([]);
    findHitsRef.current = [];
    setFindAt(-1);
    findAtRef.current = -1;
    clearFindOverlays();
  };
  const clearFind = () => {
    setFindQuery('');
    findQueryRef.current = '';
    resetFindResults();
  };
  const openFind = (motion) => {
    if (findControl.open) findInputRef.current?.focus({ preventScroll: true });
    else setFindControl({ open: true, motion });
  };
  const closeFind = (motion) => {
    setFindControl({ open: false, motion });
    clearFind();
    findButtonRef.current?.focus({ preventScroll: true });
  };
  // (v20 #3) Zoom percentage. `zoomPct` is the committed value and mirrors
  // `viewer.currentScale`; `zoomDraft` holds what is currently being typed, so
  // typing "1" on the way to "150" does not jump the page to 25 % first. The
  // pdf.js `scalechanging` event keeps `zoomPct` correct for every other path
  // (Ctrl+wheel, the +/- buttons, a preset).
  const [zoomPct, setZoomPct] = React.useState(100);
  const [zoomDraft, setZoomDraft] = React.useState(null);
  // (v28 #3, revised) The merged zoom control keeps its preset list open or closed.
  const [zoomMenuOpen, setZoomMenuOpen] = React.useState(false);
  const zoomBoxRef = React.useRef(null);
  const zoomPopupRef = React.useRef(null);
  const zoomCaretRef = React.useRef(null);
  const setMenuMotionInput = (menu, keyboard) => {
    if (menu) menu.toggleAttribute('data-keyboard-motion', keyboard);
  };
  const setCapsuleMenuOrigin = (event, trigger) => {
    const menu = event.currentTarget;
    if (!trigger || !menu.matches(':popover-open')) return;
    const control = trigger.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, (control.left + control.width / 2 - box.left) / box.width * 100));
    menu.style.transformOrigin = x + '% ' + (control.top + control.height / 2 < box.top + box.height / 2 ? 'top' : 'bottom');
  };
  React.useLayoutEffect(() => {
    const menu = zoomPopupRef.current;
    if (!menu) return;
    if (zoomMenuOpen) menu.showPopover({ source: zoomBoxRef.current });
    else menu.hidePopover();
  }, [zoomMenuOpen, hasPdf]);
  const applyZoomPct = (pct) => {
    const s = pdfStateRef.current;
    const numeric = Number(pct);
    if (!Number.isFinite(numeric)) return;
    const clamped = Math.max(ZOOM_MIN * 100, Math.min(ZOOM_MAX * 100, Math.round(numeric)));
    setZoomPct(clamped);
    if (!s || !s.viewer) return;
    try { s.viewer.currentScale = clamped / 100; } catch (_) {}
  };
  const commitZoomDraft = () => {
    if (zoomDraft == null) return;
    const raw = String(zoomDraft).trim();
    setZoomDraft(null);
    if (!raw) return;
    applyZoomPct(raw);
  };

  // (v28 #3, revised) Close the preset popup on any outside click / Escape. The
  // listener is only attached while the popup is open, so the toolbar stays free
  // of global handlers the rest of the time.
  React.useEffect(() => {
    if (!zoomMenuOpen) return undefined;
    const onDown = (event) => {
      const box = zoomBoxRef.current;
      const target = event && event.target;
      if (box && target && typeof box.contains === 'function' && box.contains(target)) return;
      setZoomMenuOpen(false);
    };
    const onKey = (event) => {
      if (event && event.key === 'Escape') setZoomMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [zoomMenuOpen]);

  // (v46) Appearance controls are all in ONE panel now. Previously the two
  // colour selects, the dock toggle and the inline-translation toggle each
  // took a slot in the toolbar, which made a row of six controls where five
  // of them were "look" and only one was "read". The panel closes on an
  // outside click or Escape, exactly like the zoom preset list above.
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsBoxRef = React.useRef(null);
  const settingsPanelRef = React.useRef(null);
  React.useEffect(() => {
    if (!settingsOpen) return undefined;
    const onDown = (event) => {
      const box = settingsBoxRef.current;
      const target = event && event.target;
      if (box && target && typeof box.contains === 'function' && box.contains(target)) return;
      setSettingsOpen(false);
    };
    const onKey = (event) => {
      if (event && event.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [settingsOpen]);

  React.useLayoutEffect(() => {
    if (!settingsOpen) return undefined;
    const wrapper = settingsBoxRef.current;
    const panel = settingsPanelRef.current;
    if (!wrapper || !panel) return undefined;
    const place = () => {
      const anchor = wrapper.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
      const width = Math.min(300, Math.max(220, viewportWidth - 16));
      const margin = 8;
      const maxHeight = Math.min(520, Math.max(180, viewportHeight - 16));
      const below = viewportHeight - anchor.bottom - margin;
      const above = anchor.top - margin;
      const openBelow = below >= 220 || below >= above;
      const height = Math.min(maxHeight, Math.max(180, openBelow ? below : above));
      const left = Math.max(margin, Math.min(anchor.right - width, viewportWidth - width - margin));
      const top = openBelow ? anchor.bottom + 6 : Math.max(margin, anchor.top - height - 6);
      panel.style.left = Math.round(left - anchor.left) + 'px';
      panel.style.top = Math.round(top - anchor.top) + 'px';
      panel.style.right = 'auto';
      panel.style.width = width + 'px';
      panel.style.maxHeight = height + 'px';
      panel.dataset.side = openBelow ? 'below' : 'above';
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [settingsOpen]);

  // (v46) One row of the settings panel: a label on the left, the control on
  // the right. `elr-settings-row` is a <label>, so clicking the text focuses
  // its select — the whole row is a hit target, not just the 12px control.
  const settingsRow = (key, label, control) => h('label', { key, className: 'elr-settings-row' },
    h('span', { className: 'elr-settings-label' }, label),
    h('span', { className: 'elr-settings-ctrl' }, control)
  );
  // (v46) A two-option segmented control for the panel's switches. `active`
  // is what `--dsw-alias-brand-primary` hangs off, so the current choice is
  // readable at a glance instead of being inferred from the button text.
  const settingsSeg = (key, options, current, onPick) => h('span', { key, className: 'elr-settings-seg' },
    options.map((opt) => h('button', {
      key: opt.value,
      className: 'elr-seg' + (opt.value === current ? ' active' : ''),
      onClick: (e) => { e.preventDefault(); onPick(opt.value); },
    }, opt.label))
  );

  const zoom = (dir) => {
    const s = pdfStateRef.current;
    if (!s || !s.viewer) return;
    try {
      const v = s.viewer;
      v.currentScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (v.currentScale || 1) * (dir > 0 ? 1.2 : 1 / 1.2)));
    } catch (_) {}
  };

  // (v23 #1) Highlight and annotation are INDEPENDENT. Adding one never turns on
  // the other, and removing one never removes the other. A record that ends up
  // with neither flag is pruned, so the list only holds real content.
  // (v23 #1) A record is EITHER a highlight OR an annotation — never both.
  // `findMarkByText` therefore only matches a record of the requested kind, so
  // highlighting a sentence that is already annotated creates a second,
  // independent record instead of mutating the annotation.
  const markKind = (m) => (m && (m.kind === 'note' || (m.note && m.note.trim())) ? 'note' : 'hl');
  const findMarkByText = (value, kind) => {
    const needle = normText(value);
    if (!needle) return null;
    const list = marksRef.current || [];
    for (let i = 0; i < list.length; i++) {
      if (markKind(list[i]) === kind && normText(list[i].text) === needle) return list[i];
    }
    return null;
  };
  const writeMarks = (next) => {
    marksRef.current = next;
    setMarks(next);
    saveMarks(paperIdRef.current, next);
    applyHighlights();
  };
  const newMarkId = () => String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7);
  const addHighlight = (source = selection, color, anchors) => {
    const value = String(source || '').trim();
    if (!value) { notify(t('selection.empty'), 'error'); return; }
    setMenu(null);
    const current = readShared();
    const picked = selectedHighlightRef.current;
    const location = anchors ?? (picked?.paper === current.paperId && picked.text.trim() === value ? picked.anchors : []);
    if (current.mode === 'pdf' && !location.length) { notify(t('mark.selectPdf'), 'warn'); return; }
    const list = marksRef.current || [];
    const needle = normText(value);
    const existing = list.find((mark) => mark.hl && sameHighlightLocation(location, highlightAnchors(mark)))
      || list.find((mark) => mark.hl && !highlightAnchors(mark).length && normText(mark.text) === needle);
    if (existing) {
      const needsLocation = location.length > 0 && !highlightAnchors(existing).length;
      if (needsLocation || (color && color !== (existing.color || 'yellow'))) {
        const updated = { ...existing, color: color || existing.color || 'yellow' };
        if (needsLocation) updated.anchors = location;
        writeMarks([updated, ...list.filter((mark) => mark.id !== existing.id)]);
      }
      notify(t('mark.saved'), 'ok');
      return;
    }
    writeMarks([{ id: newMarkId(), text: value, kind: 'hl', note: '', hl: true, color: color || 'yellow', anchors: location }]
      .concat(list).slice(0, 120));
    recordReadPages([readShared().pageNum]);
    notify(t('mark.saved'), 'ok');
  };
  // Annotation only. It never adds a highlight.
  const addNote = (source = selection, rect = null, tools = null, explicitAnchors) => {
    const value = String(source || '').trim();
    if (!value) { notify(t('selection.empty'), 'error'); return; }
    setMenu(null);
    const anchors = explicitAnchors ?? tools?.anchors ?? (selectedHighlightRef.current?.text === value ? selectedHighlightRef.current.anchors : []);
    const existing = (marksRef.current || []).find((mark) => markKind(mark) === 'note' && sameHighlightLocation(anchors, highlightAnchors(mark)))
      || (!anchors.length ? findMarkByText(value, 'note') : null);
    if (tools && noteBubbleRef.current?.anchorRange === tools.range) {
      floatingHost.querySelector('.elr-note-bubble-textarea')?.focus({ preventScroll: true });
      return;
    }
    const draft = { ...placeNoteBubble(existing?.id || newMarkId(), value, existing?.note || '', rect), anchors };
    if (tools) {
      closeTranslationPopup();
      const layout = selectionTranslationLayout(rect, draft, NOTE_POPUP_MIN.h);
      setSelectionTools({ ...tools, position: layout.position });
      setNoteBubble({ ...draft, ...layout.box, anchorRange: tools.range, sourceRange: tools.range });
    } else setNoteBubble(draft);
  };
  const closeNoteBubble = () => {
    noteBubbleTrigger.current = null;
    const range = noteBubbleRef.current?.anchorRange || noteBubbleRef.current?.sourceRange;
    if (range) setSelectionTools((tools) => tools?.range === range ? { ...tools, position: selectionToolLayout(tools.rect) } : tools);
    setNoteBubble(null);
  };
  const saveNoteBubble = () => {
    const draft = noteBubbleRef.current;
    const value = draft?.note?.trim();
    if (!value) return;
    const list = marksRef.current || [];
    if (list.some((mark) => mark.id === draft.id)) updateNote(draft.id, value);
    else writeMarks([{ id: draft.id, text: draft.text, kind: 'note', note: value, hl: false, anchors: draft.anchors }, ...list].slice(0, 120));
    recordReadPages([readShared().pageNum]);
    closeNoteBubble();
    notify(t('mark.noteSaved'), 'ok');
  };
  // Only ever touches annotation records.
  const updateNote = (id, value) => {
    const list = marksRef.current || [];
    const target = list.find((m) => m.id === id);
    if (!target || markKind(target) !== 'note') return;
    const note = String(value == null ? '' : value);
    // An annotation with an empty body is not an annotation: drop the record so
    // the list matches what is drawn (nothing).
    if (!note.trim()) {
      writeMarks(list.filter((m) => m.id !== id));
      return;
    }
    writeMarks(list.map((m) => (m.id === id ? Object.assign({}, m, { note }) : m)));
  };
  // Removing the highlight band leaves the annotation record intact.
  const removeHighlight = (id) => {
    const list = marksRef.current || [];
    const target = list.find((m) => m.id === id);
    if (!target) return;
    if (markKind(target) !== 'hl') return;
    writeMarks(list.filter((m) => m.id !== id));
  };
  // (v23 #1) Clearing an annotation deletes ONLY the annotation record.
  const clearNote = (id) => {
    const list = marksRef.current || [];
    const target = list.find((m) => m.id === id);
    if (!target) return;
    if (markKind(target) !== 'note') return;
    writeMarks(list.filter((m) => m.id !== id));
  };
  const removeMark = (id) => {
    writeMarks((marksRef.current || []).filter((m) => m.id !== id));
  };

  // (v22) Jump the reading view to an annotation.
  //
  // The right-hand panel lists marks whose text is a plain string; nothing
  // records WHERE in the PDF that string lived. So the location is recovered
  // the same way the highlights themselves are painted: by rebuilding the
  // per-page whitespace-stripped text index and searching for the mark text.
  // That keeps the feature correct even for marks restored from localStorage
  // after a reload, when no scroll position was ever saved.
  //
  // Order matters: the page must be switched BEFORE scrolling, because
  // pdf.js only lays out the target page once it is current; scrolling first
  // would land on the old page's coordinates.
  const scrollElementIntoView = (container, element, area) => {
    if (!container || !element) return;
    const box = container.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const y = rect.top + (area ? area.y * rect.height : 0);
    const top = container.scrollTop + y - box.top - Math.max(40, box.height * 0.25);
    let left = container.scrollLeft;
    if (area) {
      const x = rect.left + area.x * rect.width;
      if (x < box.left || x + area.w * rect.width > box.right) {
        left += x - box.left - Math.min(48, box.width * .15);
      }
    }
    scrollWithMotion(container, { top, left });
  };

  const locateMark = (mark, preferVisible = false) => {
    const container = containerRef.current;
    const needle = normText(mark?.text);
    if (!container || !needle) return null;
    const pages = Array.from(container.querySelectorAll('.pdfViewer .page'));
    const anchors = highlightAnchors(mark);
    if (anchors.length) {
      const anchor = anchors[0];
      const el = pages.find((node) => Number(node.dataset.pageNumber) === anchor.page);
      const spans = el?.querySelectorAll('.textLayer span:not(.markedContent)');
      const length = spans?.length ? pageIndexOf(el, spans).pageText.length : 0;
      return { page: anchor.page, offset: anchor.rects[0].y * length, el, anchors };
    }
    const bounds = preferVisible ? container.getBoundingClientRect() : null;
    const ranked = pages.map((el) => {
      const page = Number(el.dataset.pageNumber);
      const box = bounds ? el.getBoundingClientRect() : null;
      const visible = box && box.bottom > bounds.top && box.top < bounds.bottom;
      return { el, page, priority: page === mark.page ? 2 : visible ? 1 : 0 };
    }).sort((a, b) => b.priority - a.priority);
    let fallback = null;
    for (const { el, page } of ranked) {
      const spans = el.querySelectorAll('.textLayer span:not(.markedContent)');
      if (!spans.length) continue;
      const { pageText } = pageIndexOf(el, spans);
      const at = pageText.indexOf(needle);
      if (at !== -1) return { page, offset: at, el, textHit: { at, len: needle.length } };
      if (!fallback && needle.length > 24) {
        const at = pageText.indexOf(needle.slice(0, 24));
        if (at !== -1) fallback = { page, offset: at, el, textHit: { at, len: 24 } };
      }
    }
    return fallback;
  };

  const jumpToMark = (mark) => {
    const container = containerRef.current;
    const viewer = pdfStateRef.current?.viewer;
    const hit = locateMark(mark, true);
    if (!container || !viewer || !hit) {
      notify(t('mark.locateFailed'), 'warn');
      return;
    }
    const sequence = ++markLocateSeq.current;
    const current = () => containerRef.current === container && markLocateSeq.current === sequence;
    const pageNode = (page) => viewer.getPageView(page - 1)?.div;
    const areas = () => {
      if (!hit.anchors) {
        const node = pageNode(hit.page);
        return node ? [{ node, rects: findRectsForPage(node, hit.textHit) || [] }] : [];
      }
      return hit.anchors.flatMap((part) => {
        const node = pageNode(part.page);
        const base = highlightSurface(node, part.legacy)?.getBoundingClientRect();
        if (!base?.width || !base.height) return [];
        const rects = part.rects.map(({ x, y, w, h }) =>
          new DOMRect(base.left + x * base.width, base.top + y * base.height, w * base.width, h * base.height));
        return [{ node, rects }];
      });
    };
    const mergeLineRects = (rects) => {
      const sorted = rects
        .filter((r) => r && r.width > 0 && r.height > 0)
        .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }))
        .sort((a, b) => a.top - b.top || a.left - b.left);
      const merged = [];
      for (const cur of sorted) {
        const prev = merged.find((item) => {
          const ah = item.bottom - item.top;
          const bh = cur.bottom - cur.top;
          const maxH = Math.max(ah, bh);
          const sameLine = Math.abs((item.top + item.bottom) / 2 - (cur.top + cur.bottom) / 2) <= maxH * 0.6
            && Math.min(item.bottom, cur.bottom) > Math.max(item.top, cur.top);
          return sameLine && cur.left <= item.right + maxH * 1.25;
        });
        if (prev) {
          prev.left = Math.min(prev.left, cur.left);
          prev.top = Math.min(prev.top, cur.top);
          prev.right = Math.max(prev.right, cur.right);
          prev.bottom = Math.max(prev.bottom, cur.bottom);
        } else {
          merged.push({ ...cur });
        }
      }
      return merged.map((r) => new DOMRect(r.left, r.top, r.right - r.left, r.bottom - r.top));
    };
    const flash = (targets) => {
      container.querySelectorAll('.elr-mark-location').forEach((layer) => layer.remove());
      for (const { node, rects } of targets) {
        const box = node.getBoundingClientRect();
        const lineRects = mergeLineRects(rects);
        if (!lineRects.length || !box.width || !box.height) continue;
        const layer = document.createElement('div');
        layer.className = 'elr-mark-location';
        layer.setAttribute('aria-hidden', 'true');
        for (const rect of lineRects) {
          const frame = document.createElement('span');
          Object.assign(frame.style, {
            left: (rect.left - box.left - node.clientLeft) / node.clientWidth * 100 + '%',
            top: (rect.top - box.top - node.clientTop) / node.clientHeight * 100 + '%',
            width: rect.width / node.clientWidth * 100 + '%',
            height: rect.height / node.clientHeight * 100 + '%',
          });
          layer.append(frame);
        }
        node.append(layer);
        setTimeout(() => layer.remove(), 1850);
      }
    };
    const targets = areas();
    const bounds = container.getBoundingClientRect();
    const right = bounds.left + container.clientLeft + container.clientWidth;
    const bottom = bounds.top + container.clientTop + container.clientHeight;
    const visible = ({ rects }) => rects.length > 0 && rects.every((rect) =>
      rect.left >= bounds.left - 1 && rect.right <= right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bottom + 1);
    if (showOriginalPdf && targets.some(visible)) {
      flash(targets);
      return;
    }

    pdfReading.showSource();
    if (viewer.currentPageNumber !== hit.page || !showOriginalPdf) {
      viewer.currentPageNumber = hit.page;
      setPageNum(hit.page);
    }
    requestAnimationFrame(() => {
      if (!current()) return;
      const node = pageNode(hit.page);
      if (!node) return;
      const targets = areas();
      const first = targets.find((target) => target.node === node)?.rects[0];
      const box = node.getBoundingClientRect();
      const area = first && box.width && box.height ? {
        x: (first.left - box.left) / box.width, y: (first.top - box.top) / box.height, w: first.width / box.width,
      } : undefined;
      scrollElementIntoView(container, node, area);
      flash(targets);
    });
  };

  const cardWindowBox = (key, rect) => readShared().floatingCards[key] || {
    x: rect.left, y: rect.top,
    w: clampPopup(rect.width, 285, 440),
    h: clampPopup(rect.height, 210, 430),
  };

  const floatFunctionCard = (key, box, bounds, open, expand = false) => {
    setFloatingBounds(bounds);
    setFrontCard(key);
    const state = readShared();
    const previous = state.floatingCards;
    const savedOpen = previous[key]?.dockedOpen;
    const dockedOpen = typeof savedOpen === 'boolean' ? savedOpen : open;
    writeShared({
      floatingCards: { ...previous, [key]: { ...box, dockedOpen } },
      ...(expand ? cardOpenPatch(state, [key], true) : {}),
    });
  };

  const dockFunctionCard = (key, target = null, after = false, column = null) => {
    const state = readShared();
    const { floatingCards: previous, sectionOrder: saved, featureCardColumns: savedColumns } = state;
    const patch = {};
    if (previous[key]) {
      const next = { ...previous };
      delete next[key];
      patch.floatingCards = next;
      if (typeof previous[key].dockedOpen === 'boolean') {
        Object.assign(patch, cardOpenPatch(state, [key], previous[key].dockedOpen));
      }
    }
    if (column === 0 || column === 1) {
      patch.featureCardColumns = {
        ...savedColumns,
        ...Object.fromEntries(workspaceCards.map((card) => [card.key, card.column])),
        [key]: column,
      };
    }
    if (target && target !== key) {
      const order = functionCardOrder(saved).filter((card) => card !== key);
      order.splice(order.indexOf(target) + (after ? 1 : 0), 0, key);
      patch.sectionOrder = order;
    }
    if (Object.keys(patch).length) writeShared(patch);
  };

  const toggleFunctionCardFloat = (key, open, handle) => {
    focusCardHandleRef.current = key;
    if (readShared().floatingCards[key]) {
      dockFunctionCard(key);
      return;
    }
    const rect = handle.closest('.elr-sec').getBoundingClientRect();
    const bounds = popupViewport();
    const size = cardWindowBox(key, rect);
    const box = placeFunctionCard({ ...size, x: (bounds.left + bounds.right - size.w) / 2 }, open && !compactCards[key], bounds);
    floatFunctionCard(key, { ...size, x: box.x, y: box.y }, bounds, open);
  };

  const beginCardDrag = (key, open, onTap) => (event) => {
    if (event.button !== 0 || event.isPrimary === false || cardGestureCancelRef.current) return;
    const handle = event.currentTarget;
    const card = handle.closest('.elr-sec');
    const capture = readerRef.current;
    if (!card || !capture) return;
    const initial = card.getBoundingClientRect();
    const isFloating = card.hasAttribute('data-elr-floating-card');
    const pointer = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const offsetX = startX - initial.left;
    const offsetY = startY - initial.top;
    const bounds = popupViewport();
    const size = cardWindowBox(key, initial);
    const bottomDock = dockRef.current === 'bottom';
    const originColumnNode = card.closest('.elr-feature-column');
    const originColumn = originColumnNode ? Number(originColumnNode.dataset.featureColumn) : null;
    const originCards = originColumnNode
      ? [...originColumnNode.querySelectorAll('[data-elr-docked-card]')].map((n) => n.dataset.elrDockedCard)
      : [];
    const originGapIndex = originCards.indexOf(key);

    const dockColumn = sideTopElRef.current?.querySelector('.elr-feature-column');
    const horizontalCapsule = {
      w: bottomDock && originColumnNode ? size.w : Math.max(170, initial.width),
      h: CARD_HEADER_HEIGHT,
    };
    const verticalCapsule = {
      w: CARD_HEADER_HEIGHT,
      h: Math.max(CARD_HEADER_HEIGHT, originColumnNode?.getBoundingClientRect().height ?? dockColumn?.clientHeight ?? 0),
    };
    const sourceCapsule = bottomDock && originColumnNode ? verticalCapsule : horizontalCapsule;
    const grabX = clampPopup(offsetX / sourceCapsule.w, 0, 1);
    const grabY = clampPopup(offsetY / sourceCapsule.h, 0, 1);
    const containsPoint = (rect, x, y) => Boolean(rect
      && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    let dragCache = null;
    const buildDragCache = () => {
      const panel = workspaceStowed ? null : sideTopElRef.current;
      const panelRect = panel ? panel.getBoundingClientRect() : null;
      const draggedNode = panel ? panel.querySelector('[data-elr-docked-card="' + key + '"]') : null;
      const settled = !draggedNode || draggedNode.classList.contains('dragging');
      const columns = panel ? [...panel.querySelectorAll('.elr-feature-column')].map((colNode) => {
        const colRect = colNode.getBoundingClientRect();
        const candidates = [...colNode.querySelectorAll('[data-elr-docked-card]')]
          .filter((node) => node.dataset.elrDockedCard !== key)
          .map((node) => {
            const start = bottomDock ? colRect.left + node.offsetLeft : colRect.top + node.offsetTop;
            const span = bottomDock ? node.offsetWidth : node.offsetHeight;
            return { key: node.dataset.elrDockedCard, start, end: start + span, mid: start + span / 2 };
          });
        return { column: Number(colNode.dataset.featureColumn), rect: colRect, candidates };
      }) : [];
      const result = { panel, panelRect, columns, settled };
      if (settled) dragCache = result;
      return result;
    };
    const dragLocation = (x, y) => {
      const { panel, panelRect, columns } = dragCache || buildDragCache();
      const inDock = containsPoint(panelRect, x, y);
      const vertical = bottomDock && inDock;
      let capsule = horizontalCapsule;
      if (vertical) {
        capsule = verticalCapsule;
      } else if (inDock && columns.length > 0) {
        const colInfo = columns.find((item) => x <= item.rect.right) || columns.at(-1);
        if (colInfo?.rect?.width) capsule = { w: Math.max(170, colInfo.rect.width), h: CARD_HEADER_HEIGHT };
      }
      // Lift the dragged item off the list so it never hides the landing gap:
      // above a horizontal row, pulled aside and shrunk to 90% in a vertical list,
      // or shrunk gently when carrying a floating card over the reading page.
      const liftX = inDock && !bottomDock ? (sideDock === 'left' ? 18 : -18) : 0;
      const liftY = inDock && bottomDock ? -26 : 0;
      const scale = inDock ? (bottomDock ? 1 : 0.9) : 0.92;
      const box = fitPopupBox({ ...capsule, x: x - grabX * capsule.w + liftX, y: y - grabY * capsule.h + liftY }, bounds);
      return { panel, inDock, vertical, scale, box };
    };
    const dockAt = (x, y, { panel, inDock }) => {
      if (!panel || !inDock) return null;
      const { columns, settled } = dragCache || buildDragCache();
      if (!settled) return null;
      const colInfo = columns.find((item) => x <= item.rect.right) || columns.at(-1);
      if (!colInfo) return null;
      const { column, rect: columnBounds, candidates } = colInfo;
      const position = bottomDock ? x : y;
      let gapIndex = candidates.length;
      for (let i = 0; i < candidates.length; i += 1) {
        if (position < candidates[i].mid) {
          gapIndex = i;
          break;
        }
      }
      if (column === originColumn && gapIndex === originGapIndex) {
        return { column, gapIndex, origin: true, lineRect: null };
      }
      // Compute the faint drop line centered inside the landing gap.
      let lineRect = null;
      if (candidates.length > 0) {
        const prevNode = gapIndex > 0 ? candidates[gapIndex - 1] : null;
        const nextNode = gapIndex < candidates.length ? candidates[gapIndex] : null;
        const pos = prevNode && nextNode ? (prevNode.end + nextNode.start) / 2
          : prevNode ? prevNode.end + 4 : nextNode.start - 4;
        lineRect = bottomDock
          ? { x: pos - 1, y: columnBounds.top + 8, w: 2, h: Math.max(24, columnBounds.height - 16), vertical: true }
          : { x: columnBounds.left + 8, y: pos - 1, w: Math.max(24, columnBounds.width - 16), h: 2, vertical: false };
      } else {
        lineRect = bottomDock
          ? { x: columnBounds.left + 8, y: columnBounds.top + 8, w: 2, h: Math.max(24, columnBounds.height - 16), vertical: true }
          : { x: columnBounds.left + 8, y: columnBounds.top + 8, w: Math.max(24, columnBounds.width - 16), h: 2, vertical: false };
      }
      return {
        column,
        gapIndex,
        origin: false,
        target: (candidates[gapIndex] || candidates.at(-1))?.key,
        after: gapIndex >= candidates.length,
        lineRect,
      };
    };

    const LONG_PRESS_MS = 260;
    let dragArmed = false;
    let holdCancelled = false;
    let lastPointerX = startX;
    let lastPointerY = startY;
    let holdTimer = 0;
    let started = false;
    let hover = null;
    let previewVertical;
    let previewW;
    let previewH;
    let lastBox = null;
    let lastScale = 1;
    let shrinkClone = null;
    let shrinkAnim = null;
    const stopShrink = () => {
      shrinkAnim?.cancel();
      shrinkAnim = null;
      shrinkClone?.remove();
      shrinkClone = null;
    };
    const startDrag = (x, y) => {
      if (started) return;
      started = true;
      document.body.classList.add('elr-card-dragging');
      gestureStart();
      setTermBubble(null);
      const location = dragLocation(x, y);
      lastBox = location.box;
      lastScale = location.scale;
      if (!reduceMotion() && (initial.height > CARD_HEADER_HEIGHT + 8 || initial.width > CARD_HEADER_HEIGHT + 8)) {
        const clone = card.cloneNode(true);
        clone.classList.remove('dragging', 'is-resizing-edge');
        clone.setAttribute('aria-hidden', 'true');
        clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
        Object.assign(clone.style, {
          position: 'fixed',
          left: initial.left + 'px',
          top: initial.top + 'px',
          width: initial.width + 'px',
          height: initial.height + 'px',
          margin: '0',
          zIndex: '199',
          pointerEvents: 'none',
          overflow: 'hidden',
          contain: 'layout style paint',
          backdropFilter: 'none',
          transformOrigin: 'top left',
          willChange: 'transform, opacity',
        });
        floatingHost.appendChild(clone);
        shrinkClone = clone;
        const destX = location.box.x + (location.box.w * (1 - location.scale)) / 2;
        const destY = location.box.y + (location.box.h * (1 - location.scale)) / 2;
        const dx = destX - initial.left;
        const dy = destY - initial.top;
        const sx = (location.box.w * location.scale) / Math.max(1, initial.width);
        const sy = (location.box.h * location.scale) / Math.max(1, initial.height);
        shrinkAnim = clone.animate([
          {
            opacity: 1,
            transform: 'translate3d(0,0,0) scale(1, 1)',
          },
          {
            opacity: 0,
            transform: 'translate3d(' + dx + 'px,' + dy + 'px,0) scale(' + sx + ',' + sy + ')',
          },
        ], { duration: 200, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards' });
        shrinkAnim.onfinish = stopShrink;
      }
      dragCache = null;
      hover = null;
      rememberCardPositions(key);
      setGhost({
        key,
        vertical: location.vertical,
        scale: location.scale,
        liquid: card.dataset.elrLiquid || '',
        liquidInk: card.dataset.elrLiquidInk || '',
        ...location.box,
      });
    };
    handle.classList.add('is-pressed');
    holdTimer = setTimeout(() => {
      holdTimer = 0;
      if (holdCancelled) return;
      dragArmed = true;
      handle.classList.remove('is-pressed');
      startDrag(lastPointerX, lastPointerY);
    }, LONG_PRESS_MS);
    const painter = frameWriter(({ x, y }) => {
      const location = dragLocation(x, y);
      const { vertical, scale, box } = location;
      lastBox = box;
      lastScale = scale;
      const next = dockAt(x, y, location);
      if (next?.column !== hover?.column || next?.origin !== hover?.origin
        || next?.gapIndex !== hover?.gapIndex || next?.target !== hover?.target || next?.after !== hover?.after) {
        hover = next;
        setCardDrop(next);
      }
      const preview = cardGhostRef.current;
      if (!preview) return;
      if (vertical !== previewVertical) {
        previewVertical = vertical;
        preview.classList.toggle('is-vertical', vertical);
      }
      if (box.w !== previewW || box.h !== previewH) {
        previewW = box.w;
        previewH = box.h;
        preview.style.width = box.w + 'px';
        preview.style.height = box.h + 'px';
      }
      preview.style.translate = box.x + 'px ' + box.y + 'px 0';
      preview.style.transform = 'scale(' + scale + ')';
    });
    const cleanup = (settledBox = null, docked = false) => {
      if (cardGestureCancelRef.current !== cleanup) return;
      cardGestureCancelRef.current = null;
      clearTimeout(holdTimer);
      holdTimer = 0;
      handle.classList.remove('is-pressed');
      painter.cancel();
      stopShrink();
      document.body.classList.remove('elr-card-dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKey, true);
      capture.removeEventListener('lostpointercapture', cancel);
      try { if (capture.hasPointerCapture?.(pointer)) capture.releasePointerCapture(pointer); } catch (_) {}
      if (started) {
        const settleSource = settledBox || lastBox;
        if (!docked && isFloating && settleSource) {
          floatingSettleRef.current = { key, from: { ...settleSource, scale: lastScale } };
        }
        rememberCardPositions(key, true, settleSource, lastScale);
        gestureEnd();
        setGhost(null);
        setCardDrop(null);
      }
    };
    const move = (e) => {
      if (e.pointerId !== pointer) return;
      const { clientX: x, clientY: y } = e;
      lastPointerX = x;
      lastPointerY = y;
      if (!dragArmed) {
        if (Math.hypot(x - startX, y - startY) > 8) {
          clearTimeout(holdTimer);
          holdTimer = 0;
          holdCancelled = true;
          handle.classList.remove('is-pressed');
        }
        return;
      }
      if (!started) startDrag(x, y);
      painter.push({ x, y });
    };
    const finish = (e) => {
      if (e.pointerId !== pointer) return;
      const { clientX: x, clientY: y } = e;
      const inside = x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
      let settledBox = null;
      let docked = false;
      if (started && inside) {
        const location = dragLocation(x, y);
        const { box } = location;
        settledBox = box;
        const target = dockAt(x, y, location);
        const readingPane = readingSpaceRef.current ?? capture.querySelector('.elr-main');
        const expand = !location.inDock && containsPoint(readingPane?.getBoundingClientRect(), x, y);
        if (target && !expand) {
          docked = true;
          if (!target.origin) dockFunctionCard(key, target.target, target.after, columnCount === 2 ? target.column : null);
        } else if (expand) {
          const placed = placeFunctionCard({ ...size, x: box.x, y: box.y }, (open || expand) && !compactCards[key], bounds);
          floatingSettleRef.current = { key, from: { ...box, scale: location.scale } };
          floatFunctionCard(key, { ...size, x: placed.x, y: placed.y }, bounds, open, expand);
        }
      }
      cleanup(settledBox, docked);
      if (!started && !dragArmed && !holdCancelled && onTap && handle.isConnected) {
        const target = handle.getBoundingClientRect();
        if (x >= target.left && x <= target.right && y >= target.top && y <= target.bottom) onTap();
      }
    };
    const onBlur = () => cleanup();
    const cancel = (e) => { if (e.pointerId === pointer) cleanup(); };
    const onKey = (e) => {
      if (!started || e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      cleanup();
    };
    cardGestureCancelRef.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKey, true);
    // Capture on the stable reader because React may move the handle as cards reorder.
    capture.addEventListener('lostpointercapture', cancel);
    try { capture.setPointerCapture(pointer); } catch (_) {}
  };

  // (v32 #1, fixed in v32b #2) Per-card left/right edge drag.
  //
  // Two things made the first version dead:
  //   1. the grips were only rendered when `dock === 'bottom'`, so in the
  //      default right-hand dock there was nothing to grab at all;
  //   2. even in the bottom dock only a 5px right-hand strip existed and the
  //      last card's strip was `display: none` — so "拉左右边界" could not work.
  //
  // Now both edges of every card carry a grip. What it resizes depends on the
  // dock, because that is what "the card's width" means in each layout:
  //   • bottom dock  → this card's own width (`cardWidths`); siblings reflow.
  //   • right dock   → the card is full width, so the grip resizes the whole
  //                    card COLUMN (`sideWidth`) — the only meaningful width there.
  //
  // A pointerdown on a descendant of a `draggable` element can start a native
  // drag and steal the subsequent `pointermove`, hence `draggable: false` on the
  // grip plus `stopPropagation` here.
  //
  // Same gesture rule as the pane resizers: paint straight onto the DOM, commit
  // to shared state once on pointerup — one re-render per drag.
  const beginCardResize = (key, side) => (event) => {
    if (event.button !== 0) return;
    const grip = event.currentTarget;
    const card = grip && grip.closest ? grip.closest('.elr-sec') : null;
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    const dir = side === -1 ? -1 : 1;
    const startX = Number(event.clientX) || 0;
    const bottom = dockRef.current === 'bottom';
    const minWidth = bottom ? parseFloat(window.getComputedStyle(card).minWidth) || CARD_MIN_W : CARD_MIN_W;
    const maxWidth = key === 'selection' ? Math.max(minWidth, window.innerWidth - 16) : Infinity;
    const columnEl = bottom ? null : sideElRef.current;
    const startW = bottom
      ? card.getBoundingClientRect().width
      : (columnEl ? columnEl.getBoundingClientRect().width : SIDE_DEFAULT);
    let pending = startW;
    let active = true;
    // (v34 #2) One DOM write per animation frame, not per pointermove.
    const painter = frameWriter((px) => {
      if (bottom) {
        card.style.width = px + 'px';
        card.style.flex = '0 0 auto';
      } else if (columnEl) {
        columnEl.style.width = px + 'px';
      }
    });
    const apply = (px) => {
      pending = px;
      painter.push(px);
    };
    const move = (e) => {
      if (!active) return;
      const dx = ((Number(e.clientX) || 0) - startX) * dir;
      if (bottom) {
        apply(clampPopup(startW + dx, minWidth, maxWidth));
        return;
      }
      const body = card.parentElement;
      const max = body ? Math.max(SIDE_MIN, body.clientWidth - 360) : 900;
      apply(Math.max(SIDE_MIN, Math.min(max, startW + dx)));
    };
    const up = () => {
      if (!active) return;
      active = false;
      grip.classList.remove('is-resizing');
      card.classList.remove('is-resizing-edge');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      gestureEnd();
      painter.cancel();
      try { document.body.style.userSelect = ''; } catch (_) {}
      if (bottom) setCardWidths((prev) => Object.assign({}, prev, { [key]: Math.round(pending) }));
      else setSideWidth(Math.round(pending));
    };
    try { document.body.style.userSelect = 'none'; } catch (_) {}
    grip.classList.add('is-resizing');
    card.classList.add('is-resizing-edge');
    gestureStart();
    try { grip.setPointerCapture(event.pointerId); } catch (_) {}
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // (v38 #1) Per-card BOTTOM edge drag, right dock only.
  //
  // v37 made the stacked cards share the column height evenly
  // (`.elr-side-body > .elr-sec { flex: 1 1 auto }`). That is the right default,
  // but it means "this card is taller" had nowhere to live: an even split is
  // recomputed on every layout. So a stored pixel height pins ONE card
  // (`flex: 0 0 auto`) and lets the others divide the remainder.
  //
  // The gesture follows the same rule as every other resize here: paint straight
  // onto the DOM once per frame, commit to shared state once on pointerup.
  const beginCardHeightResize = (key) => (event) => {
    if (event.button !== 0 || event.isPrimary === false || cardGestureCancelRef.current) return;
    const grip = event.currentTarget;
    const card = grip.closest('.elr-sec');
    const scroller = card?.closest('.elr-feature-grid');
    if (!scroller) return;
    event.preventDefault();
    event.stopPropagation();
    const { pointerId, clientY: startY } = event;
    const minHeight = parseFloat(window.getComputedStyle(card).minHeight) || CARD_MIN_H;
    const maxHeight = displayCardHeightLimit();
    setCardMaxHeight(maxHeight);
    const startHeight = card.getBoundingClientRect().height;
    const startScroll = scroller.scrollTop;
    const edge = scroller.getBoundingClientRect().bottom - CARD_DOCK_BOTTOM_GAP;
    const previousHeight = card.style.height;
    const previousFlex = card.style.flex;
    let pointerY = startY;
    let pending = startHeight;
    let edgeGrowth = 0;
    let frame = 0;
    let moved = false;
    const paint = (extend) => {
      const target = clampPopup(startHeight + Math.min(pointerY, edge) - startY + edgeGrowth, minHeight, maxHeight);
      const edgeSpeed = extend && pointerY > startY ? clampPopup((pointerY - edge + 24) / 32, 0, 1) : 0;
      pending = Math.min(maxHeight, target + Math.ceil(edgeSpeed * 16));
      card.style.height = pending + 'px';
      card.style.flex = '0 0 auto';
      if (pending > target) {
        // Grow the card first so there is room to scroll, even if the column
        // had no overflow when the pointer reached the bottom edge.
        const growth = pending - target;
        edgeGrowth += growth;
        scroller.scrollTop += growth;
      }
      return edgeSpeed > 0 && pending < maxHeight;
    };
    const tick = () => {
      frame = paint(true) ? window.requestAnimationFrame(tick) : 0;
    };
    const move = (e) => {
      if (e.pointerId !== pointerId || (!moved && e.clientY === startY)) return;
      moved = true;
      pointerY = e.clientY;
      if (!frame) frame = window.requestAnimationFrame(tick);
    };
    const cleanup = () => {
      if (cardGestureCancelRef.current !== cancel) return false;
      cardGestureCancelRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', interrupt);
      window.removeEventListener('blur', cancel);
      grip.removeEventListener('lostpointercapture', interrupt);
      if (frame) window.cancelAnimationFrame(frame);
      grip.classList.remove('is-resizing');
      card.classList.remove('is-resizing-edge');
      scroller.classList.remove('is-resizing-card');
      gestureEnd();
      return true;
    };
    const cancel = () => {
      if (!cleanup() || !moved) return;
      card.style.height = previousHeight;
      card.style.flex = previousFlex;
      scroller.scrollTop = startScroll;
    };
    const interrupt = (e) => { if (e.pointerId === pointerId) cancel(); };
    const up = (e) => {
      if (e.pointerId !== pointerId || cardGestureCancelRef.current !== cancel) return;
      if (moved) {
        pointerY = e.clientY;
        paint(false);
        setCardHeights((prev) => ({ ...prev, [key]: Math.round(pending) }));
      }
      cleanup();
    };
    cardGestureCancelRef.current = cancel;
    grip.classList.add('is-resizing');
    card.classList.add('is-resizing-edge');
    scroller.classList.add('is-resizing-card');
    gestureStart();
    try { grip.setPointerCapture(pointerId); } catch (_) {}
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', interrupt);
    window.addEventListener('blur', cancel);
    grip.addEventListener('lostpointercapture', interrupt);
  };

  // (v32 #1) Below this the card content (a textarea, a filename, a URL) is
  // unreadable, so the per-card width drag refuses to go narrower.
  const CARD_MIN_W = 140;
  const cardLabel = (key) => (
    key === 'selection' ? t('selection.title')
      : key === 'recent' ? t('recent.title')
        : key === 'terms' ? t('term.cardTitle')
          : key === 'marks' ? t('mark.title')
            : key === 'summary' ? t('tab.summary')
              : key === 'references' ? t('references.title')
                : key === 'figure' ? t('figure.title')
                  : key === 'album' ? '相册'
                    : key === 'ambient' ? '白噪音'
                      : key === 'clock' ? '时钟'
                        : '阅读助手'
  );
  const cardDesc = (key) => (
    key === 'selection' ? '划词即时译文与编辑'
      : key === 'recent' ? '快速切换最近打开的文献'
        : key === 'terms' ? '文内专业术语解释记录'
          : key === 'marks' ? '管理高亮重点与批注笔记'
            : key === 'summary' ? '全文结构化摘要与要点'
              : key === 'references' ? '提取并跳转参考文献'
                : key === 'figure' ? '截取图表并生成解读'
                  : key === 'album' ? '自定义灵感图片相册'
                    : key === 'ambient' ? '沉浸式阅读白噪音'
                      : key === 'clock' ? '专注计时与时间显示'
                        : '结合原文上下文对话问答'
  );
  const enabledCards = CARD_KEYS.filter((key) => Array.isArray(cards) && cards.indexOf(key) !== -1);
  const setCardEnabled = (key, on) => {
    if (CARD_KEYS.indexOf(key) === -1) return;
    const current = Array.isArray(cards) ? cards : [];
    const has = current.indexOf(key) !== -1;
    if (on === has) return;
    const next = on ? CARD_KEYS.filter((k) => k === key || current.indexOf(k) !== -1)
      : current.filter((k) => k !== key);
    if (on) { writeShared({ cards: next }); return; }
    const detached = { ...readShared().floatingCards };
    delete detached[key];
    writeShared({ cards: next, floatingCards: detached });
  };
  const closeCardMenu = (restoreFocus = false) => {
    setCardMenuOpen(false);
    if (restoreFocus) cardMenuButtonRef.current?.focus({ preventScroll: true });
  };
  const beginMenuCardDrag = (key) => (event) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const tile = event.currentTarget;
    const capture = readerRef.current || tile;
    const pointer = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const tileRect = tile.getBoundingClientRect();
    const menuRect = cardMenuRef.current?.getBoundingClientRect();
    const clampedOffsetX = Math.min(startX - tileRect.left, 180);
    const clampedOffsetY = Math.min(startY - tileRect.top, 28);
    let dragging = false;
    let ended = false;
    let ghostEl = null;
    let badgeEl = null;
    let lastOutside = null;
    let rafId = 0;
    let latestX = startX;
    let latestY = startY;

    const isOutsideMenu = (clientX, clientY) => {
      if (!menuRect) return true;
      return clientX < menuRect.left - 8 || clientX > menuRect.right + 8
        || clientY < menuRect.top - 8 || clientY > menuRect.bottom + 8;
    };

    const ensureGhost = () => {
      if (ghostEl) return;
      const el = document.createElement('div');
      const outside = isOutsideMenu(latestX, latestY);
      lastOutside = outside;
      el.className = 'elr-menu-drag-ghost' + (outside ? ' is-outside' : '') + toneCls;
      el.setAttribute('aria-hidden', 'true');
      el.style.transform = 'translate3d(' + (latestX - clampedOffsetX) + 'px,' + (latestY - clampedOffsetY) + 'px,0)';

      const top = document.createElement('div');
      top.className = 'elr-card-tile-top';

      const name = document.createElement('span');
      name.className = 'elr-card-tile-name';
      name.textContent = cardLabel(key);

      const badge = document.createElement('span');
      badge.className = 'elr-card-tile-float';
      badge.textContent = outside ? '松开悬浮' : '拖出面板';

      const desc = document.createElement('span');
      desc.className = 'elr-card-tile-desc';
      desc.textContent = cardDesc(key);

      top.append(name, badge);
      el.append(top, desc);
      (floatingHost || document.body).appendChild(el);
      ghostEl = el;
      badgeEl = badge;
    };

    const paintGhost = () => {
      rafId = 0;
      if (!ghostEl) return;
      const x = latestX - clampedOffsetX;
      const y = latestY - clampedOffsetY;
      ghostEl.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      const outside = isOutsideMenu(latestX, latestY);
      if (outside !== lastOutside) {
        lastOutside = outside;
        ghostEl.classList.toggle('is-outside', outside);
        badgeEl.textContent = outside ? '松开悬浮' : '拖出面板';
      }
    };

    const onMove = (ev) => {
      if (ev.pointerId !== pointer || ended) return;
      latestX = ev.clientX;
      latestY = ev.clientY;
      if (!dragging) {
        const dx = latestX - startX;
        const dy = latestY - startY;
        if (dx * dx + dy * dy < 36) return;
        dragging = true;
        document.body.classList.add('elr-card-dragging');
        try { document.body.style.userSelect = 'none'; } catch (_) {}
        gestureStart();
        try { capture.setPointerCapture(pointer); } catch (_) {}
        ensureGhost();
        return;
      }
      if (!rafId) rafId = requestAnimationFrame(paintGhost);
    };

    const finish = (ev, cancelled) => {
      if (ended) return;
      if (ev && ev.type !== 'blur' && ev.pointerId !== pointer) return;
      ended = true;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('blur', onCancel);
      capture.removeEventListener('lostpointercapture', onCancel);
      try { if (capture.hasPointerCapture?.(pointer)) capture.releasePointerCapture(pointer); } catch (_) {}
      try { document.body.style.userSelect = ''; } catch (_) {}
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      ghostEl?.remove();
      ghostEl = null;
      badgeEl = null;
      if (!dragging) return;
      document.body.classList.remove('elr-card-dragging');
      gestureEnd();
      menuDragJustEndedRef.current = true;
      setTimeout(() => { menuDragJustEndedRef.current = false; }, 0);
      const dropX = ev?.clientX ?? latestX;
      const dropY = ev?.clientY ?? latestY;
      if (cancelled || !isOutsideMenu(dropX, dropY)) return;

      const bounds = popupViewport();
      const size = cardWindowBox(key, { left: dropX - 150, top: dropY - 24, width: 320, height: 260 });
      const box = placeFunctionCard({
        ...size,
        x: dropX - Math.round(size.w / 2),
        y: dropY - 24,
      }, true, bounds);

      const state = readShared();
      const currentCards = Array.isArray(state.cards) ? state.cards : [];
      const nextCards = currentCards.indexOf(key) !== -1
        ? currentCards
        : CARD_KEYS.filter((k) => k === key || currentCards.indexOf(k) !== -1);
      setFloatingBounds(bounds);
      setFrontCard(key);
      const previous = state.floatingCards || {};
      const savedOpen = previous[key]?.dockedOpen;
      const dockedOpen = typeof savedOpen === 'boolean' ? savedOpen : true;
      writeShared({
        cards: nextCards,
        floatingCards: { ...previous, [key]: { ...box, dockedOpen } },
        ...cardOpenPatch(state, [key], true),
      });
      closeCardMenu();
    };

    const onUp = (ev) => finish(ev, false);
    const onCancel = (ev) => finish(ev, true);
    window.addEventListener('pointermove', onMove, { passive: true, capture: true });
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('blur', onCancel);
    capture.addEventListener('lostpointercapture', onCancel);
  };
  const applyCardLayout = (preset) => {
    cardGestureCancelRef.current?.();
    cancelCardFolds();
    setTermBubble(null);
    writeShared(snapshotCardLayout(preset));
    layoutMenuRef.current?.hidePopover();
  };
  const resetCardLayout = () => {
    applyCardLayout(DEFAULT_SHARED);
    closeCardMenu(true);
  };
  const saveCardLayout = () => {
    const state = readShared();
    const slot = state.customCardLayouts.indexOf(null);
    if (slot < 0) {
      setLayoutLimitReached(true);
      return;
    }
    const layouts = state.customCardLayouts.slice();
    layouts[slot] = structuredClone(snapshotCardLayout(state));
    setCustomCardLayouts(layouts);
    layoutMenuRef.current?.hidePopover();
    notify('已保存自定义布局 ' + (slot + 1) + '。', 'ok');
  };
  const deleteCardLayout = (slot) => {
    setCustomCardLayouts((layouts) => layouts.map((preset, index) => index === slot ? null : preset));
    setLayoutLimitReached(false);
    layoutMenuRef.current?.querySelector('.elr-save-layout')?.focus();
  };
  const setDockedCardsOpen = (open) => {
    rememberCardFold();
    setTermBubble(null);
    writeShared(cardOpenPatch(readShared(), dockedCards, open));
  };
  const toggleWorkspace = () => {
    cardGestureCancelRef.current?.();
    cancelCardFolds();
    setCardContext(null);
    setTermBubble(null);
    closeCardMenu();
    moveWorkspaceFocus.current = true;
    setWorkspaceStowed((previous) => !previous);
  };

  // Ctrl + left drag pans the PDF in both axes. Keeping this gesture implicit
  // avoids a persistent mode switch stealing pointer events from text selection.
  React.useEffect(() => {
    if (mode !== 'pdf') return;
    const el = containerRef.current;
    if (!el) return;
    let ctrl = false;
    let startX = 0, startY = 0, left = 0, top = 0, dragging = false;
    const ctrlDown = (e) => { if (e.key === 'Control' || e.ctrlKey) ctrl = true; };
    const ctrlUp = (e) => { if (e.key === 'Control' || !e.ctrlKey) ctrl = false; };
    const blur = () => { ctrl = false; };
    const canPan = (e) => ctrl || e.ctrlKey || e.metaKey;
    const down = (e) => {
      if (e.button !== 0 || figurePickingRef.current) return;
      if (!canPan(e)) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      left = el.scrollLeft; top = el.scrollTop;
      el.classList.add('panning');
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      e.preventDefault();
      // A Ctrl+drag would otherwise start a text selection in the text layer.
      try { window.getSelection && window.getSelection().removeAllRanges(); } catch (_) {}
    };
    const move = (e) => {
      if (!dragging) return;
      el.scrollLeft = left - (e.clientX - startX);
      el.scrollTop = top - (e.clientY - startY);
    };
    const up = () => { dragging = false; el.classList.remove('panning'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    window.addEventListener('keydown', ctrlDown);
    window.addEventListener('keyup', ctrlUp);
    window.addEventListener('blur', blur);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', ctrlDown);
      window.removeEventListener('keyup', ctrlUp);
      window.removeEventListener('blur', blur);
      el.classList.remove('panning');
    };
  }, [mode, hasPdf]);

  const hasPaper = mode === 'pdf' ? hasPdf : Boolean(text.trim());
  const showPdfStart = mode === 'pdf' && !hasPaper;
  const shownTerm = termBubble?.paper === paperId && hasPaper && termsOpen && !workspaceStowed && dock !== 'bottom'
    && enabledCards.includes('terms') && !floatingCards.terms ? terms.find((item) => item.id === termBubble.id) : null;

  const closeTermBubble = (restoreFocus = false) => {
    setTermBubble(null);
    if (restoreFocus && termBubble?.anchor.isConnected) termBubble.anchor.focus({ preventScroll: true });
  };

  React.useEffect(() => {
    if (!hasPaper || !ownsCardWindows) cardGestureCancelRef.current?.();
  }, [hasPaper, ownsCardWindows]);

  React.useLayoutEffect(() => {
    if (!hasPaper) return;
    cardWindowHosts.add(floatingHost);
    if (!readCardWindowHost()) selectCardWindowHost(floatingHost);
    return () => {
      cardWindowHosts.delete(floatingHost);
      if (readCardWindowHost() === floatingHost) selectCardWindowHost(cardWindowHosts.values().next().value || null);
    };
  }, [hasPaper, floatingHost]);

  React.useLayoutEffect(() => {
    if (ownsCardWindows && Object.keys(readShared().floatingCards).length) setFloatingBounds(popupViewport());
  }, [ownsCardWindows]);

  React.useLayoutEffect(() => {
    const key = focusCardHandleRef.current;
    if (!key) return;
    const isFloating = Boolean(floatingCards[key]);
    const root = isFloating ? floatingHost : sideTopElRef.current;
    const card = root?.querySelector((isFloating ? '[data-elr-floating-card="' : '[data-elr-docked-card="') + key + '"]');
    const handle = card?.querySelector('.elr-card-toggle');
    if (!handle) return;
    focusCardHandleRef.current = null;
    handle.focus({ preventScroll: true });
  }, [floatingCards, floatingHost, ownsCardWindows]);

  React.useLayoutEffect(() => {
    if (!cardContext) return;
    const menu = cardContextRef.current;
    if (!hasPaper || !menu || !cardContext.anchor.isConnected) {
      setCardContext(null);
      return;
    }
    const bounds = popupViewport();
    menu.style.maxWidth = (bounds.right - bounds.left) + 'px';
    const { x, y } = fitPopupBox({ ...cardContext, w: menu.offsetWidth, h: menu.offsetHeight }, bounds);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.querySelector('button')?.focus({ preventScroll: true });
    const dismiss = () => setCardContext(null);
    const outside = (event) => { if (!menu.contains(event.target)) dismiss(); };
    const escape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      dismiss();
      cardContext.anchor.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', outside, true);
    };
  }, [cardContext, hasPaper]);

  React.useLayoutEffect(() => {
    if (!termBubble) return;
    const bubble = termBubbleRef.current;
    const trigger = termBubble.anchor;
    const row = trigger.closest('.elr-term-row');
    const card = row?.closest('.elr-sec');
    const strip = row?.closest('.elr-side-body');
    const list = row?.closest('.elr-terms-list');
    if (!shownTerm || !bubble || !card || !strip || !list) { closeTermBubble(); return; }
    const updatePosition = () => {
      if (!trigger.isConnected) { closeTermBubble(); return; }
      const bounds = popupViewport();
      const stripRect = strip.getBoundingClientRect();
      const anchor = dock === 'bottom' ? trigger : row;
      const clips = [anchor.getBoundingClientRect(), list.getBoundingClientRect(), stripRect, bounds];
      const rect = {
        left: Math.max(...clips.map((box) => box.left)),
        top: Math.max(...clips.map((box) => box.top)),
        right: Math.min(...clips.map((box) => box.right)),
        bottom: Math.min(...clips.map((box) => box.bottom)),
      };
      if (rect.right <= rect.left || rect.bottom <= rect.top) { closeTermBubble(); return; }
      const label = trigger.querySelector('.elr-term-name')?.getBoundingClientRect();
      if (label) {
        rect.anchorX = clampPopup((label.left + label.right) / 2, rect.left, rect.right);
        if (dock === 'bottom') rect.anchorY = clampPopup((label.top + label.bottom) / 2, rect.top, rect.bottom);
      }
      const cardBox = card.getBoundingClientRect();
      const cardRect = {
        left: Math.max(cardBox.left, stripRect.left), right: Math.min(cardBox.right, stripRect.right),
        top: Math.max(cardBox.top, stripRect.top), bottom: Math.min(cardBox.bottom, stripRect.bottom),
      };
      const fit = termPopoverSpace(rect, bounds, cardRect, isLeftSide ? 'left' : dock);
      if (fit.width < 60 || fit.maxHeight < 36) { closeTermBubble(); return; }
      bubble.style.width = fit.width + 'px';
      bubble.style.maxHeight = fit.maxHeight + 'px';
      const height = bubble.getBoundingClientRect().height;
      const side = fit.side === 'left' || fit.side === 'right';
      const y = side ? clampPopup(fit.centerY - height / 2, bounds.top, bounds.bottom - height)
        : fit.edgeY - (fit.side === 'above' ? height : 0);
      const arrow = side ? clampPopup(fit.centerY - y, 10, height - 10)
        : clampPopup(fit.centerX - fit.x, 10, fit.width - 10);
      bubble.style.left = fit.x + 'px';
      bubble.style.top = y + 'px';
      bubble.style.setProperty('--elr-term-arrow', arrow + 'px');
      bubble.dataset.side = fit.side;
    };
    const painter = frameWriter(updatePosition);
    const reflow = (event) => {
      const target = event?.target;
      if (target === list || target === strip) { updatePosition(); return; }
      if (target instanceof Node && bubble.contains(target)) return;
      painter.push(true);
    };
    const dismissOutside = (event) => {
      if (!bubble.contains(event.target) && !trigger.contains(event.target)) closeTermBubble();
    };
    const dismissEscape = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      closeTermBubble(true);
    };
    updatePosition();
    if (termBubble.keyboard && document.activeElement === trigger) bubble.focus({ preventScroll: true });
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissEscape);
    document.addEventListener('fullscreenchange', reflow);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', reflow);
    viewport?.addEventListener('scroll', reflow);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(reflow) : null;
    for (const el of [row, list, strip, card, bubble]) observer?.observe(el);
    return () => {
      painter.cancel();
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', dismissEscape);
      document.removeEventListener('fullscreenchange', reflow);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
      viewport?.removeEventListener('resize', reflow);
      viewport?.removeEventListener('scroll', reflow);
      observer?.disconnect();
    };
  }, [termBubble, shownTerm, dock, terms, sectionOrder, cards, floatingCards]);

  React.useEffect(() => {
    const panel = sideTopElRef.current;
    const strip = panel?.querySelector('.elr-side-body');
    if (!strip) return;
    const hideTimers = new Map();
    const showScrollbar = (event) => {
      const scroller = event.target;
      clearTimeout(hideTimers.get(scroller));
      scroller.classList.add('elr-scrolling');
      hideTimers.set(scroller, setTimeout(() => {
        scroller.classList.remove('elr-scrolling');
        hideTimers.delete(scroller);
      }, 650));
    };
    const scrollAcross = (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.deltaX || !event.deltaY) return;
      const target = event.target;
      if (target.closest?.('input, select, textarea, [contenteditable="true"], .elr-detail-navigation, .elr-detail-content')) return;
      const body = target.closest?.('.elr-out, .elr-agent-feed, .elr-sel-text, .elr-selection-content, .elr-recent-list');
      if (body && body.scrollHeight > body.clientHeight + 1) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1;
      const before = strip.scrollLeft;
      strip.scrollLeft += event.deltaY * unit;
      if (strip.scrollLeft !== before) event.preventDefault();
    };
    strip.addEventListener('scroll', showScrollbar, { capture: true, passive: true });
    if (dock === 'bottom') panel.addEventListener('wheel', scrollAcross, { passive: false });
    return () => {
      strip.removeEventListener('scroll', showScrollbar, true);
      panel.removeEventListener('wheel', scrollAcross);
      for (const [scroller, timer] of hideTimers) {
        clearTimeout(timer);
        scroller.classList.remove('elr-scrolling');
      }
    };
  }, [dock, hasPaper]);

  React.useLayoutEffect(() => {
    if (!cardMenuOpen) return;
    const menu = cardMenuRef.current;
    const trigger = cardMenuButtonRef.current;
    if (!hasPaper || !menu || !trigger) { closeCardMenu(); return; }
    const updatePosition = () => {
      const bounds = popupViewport();
      const anchor = trigger.getBoundingClientRect();
      const width = Math.min(412, bounds.right - bounds.left);
      const belowY = clampPopup(anchor.bottom + 6, bounds.top, bounds.bottom);
      const aboveY = clampPopup(anchor.top - 6, bounds.top, bounds.bottom);
      menu.style.width = width + 'px';
      const spaceBelow = bounds.bottom - belowY;
      const spaceAbove = aboveY - bounds.top;
      const opensUp = menu.scrollHeight + 2 > spaceBelow && spaceAbove > spaceBelow;
      menu.style.maxHeight = (opensUp ? spaceAbove : spaceBelow) + 'px';
      menu.style.left = clampPopup(anchor.right - width, bounds.left, bounds.right - width) + 'px';
      menu.style.top = (opensUp ? aboveY - menu.offsetHeight : belowY) + 'px';
    };
    const dismissOutside = (event) => {
      if (!menu.contains(event.target) && !trigger.contains(event.target)) closeCardMenu();
    };
    const dismissOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeCardMenu(true);
    };
    updatePosition();
    menu.querySelector('input')?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('focusin', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('fullscreenchange', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', updatePosition);
    viewport?.addEventListener('scroll', updatePosition);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updatePosition) : null;
    if (sideTopElRef.current) observer?.observe(sideTopElRef.current);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('focusin', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('fullscreenchange', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      viewport?.removeEventListener('resize', updatePosition);
      viewport?.removeEventListener('scroll', updatePosition);
      observer?.disconnect();
    };
  }, [cardMenuOpen, hasPaper]);

  // Resize both panes together. Keep pointer updates local to the layout and
  // save the user's preferred size once, when they release the divider.
  React.useEffect(() => {
    const handle = resizeRef.current;
    const side = sideElRef.current;
    if (!handle || !side || !handle.parentElement) return;
    const bottom = dock === 'bottom';
    const dimension = bottom ? 'height' : 'width';
    const coordinate = (event) => bottom ? event.clientY : event.clientX;
    const body = handle.parentElement;
    let drag = null;
    const readLimits = () => {
      const total = bottom ? body.clientHeight : body.clientWidth;
      const divider = bottom ? handle.offsetHeight : handle.offsetWidth;
      const start = Math.round(side.getBoundingClientRect()[dimension]);
      if (!total || !start) return null;
      const readerMinimum = bottom ? BOTTOM_READER_MIN_H : Math.min(SIDE_READER_MIN_W, total * SIDE_READER_SHARE);
      const min = bottom ? Math.min(start, SIDE_H_MIN)
        : Math.min(dualColumns ? SIDE_DUAL_MIN : SIDE_MIN, Math.round(total - readerMinimum - divider));
      const layoutMax = bottom || dualColumns ? total : Math.floor(total * 0.7);
      const max = Math.max(start, min, Math.min(layoutMax, total - readerMinimum - divider));
      return { start, min, max };
    };
    const syncValue = (limits, value = limits.start) => {
      handle.setAttribute('aria-valuemin', String(limits.min));
      handle.setAttribute('aria-valuemax', String(limits.max));
      handle.setAttribute('aria-valuenow', String(value));
    };
    const syncCurrent = () => {
      const limits = drag?.limits ?? readLimits();
      if (limits) syncValue(limits, drag?.size ?? limits.start);
    };
    const sizeAt = (value, limits) => Math.round(Math.max(limits.min, Math.min(limits.max, value)));
    const commit = (size, limits) => {
      syncValue(limits, size);
      if (size === limits.start) return;
      side.style[dimension] = size + 'px';
      if (bottom) setSideHeight(size);
      else if (dualColumns) setDualSideWidth(size);
      else setSideWidth(size);
    };
    const buildResizeBadge = (kind, titleText) => {
      const badge = document.createElement('div');
      badge.className = 'elr-resize-pane-badge';
      const iconBox = document.createElement('div');
      iconBox.className = 'elr-resize-pane-icon';
      const svgNs = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNs, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('aria-hidden', 'true');
      const addNode = (tag, attrs) => {
        const node = document.createElementNS(svgNs, tag);
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
        svg.appendChild(node);
      };
      if (kind === 'reader') {
        addNode('rect', { x: '4', y: '3', width: '16', height: '18', rx: '2.5', stroke: 'currentColor', 'stroke-width': '1.7' });
        addNode('path', { d: 'M8 8h8M8 12h8M8 16h5', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round' });
      } else {
        addNode('rect', { x: '3', y: '4', width: '8', height: '7', rx: '2', fill: 'currentColor', 'fill-opacity': '.18', stroke: 'currentColor', 'stroke-width': '1.6' });
        addNode('rect', { x: '13', y: '4', width: '8', height: '7', rx: '2', stroke: 'currentColor', 'stroke-width': '1.6' });
        addNode('rect', { x: '3', y: '13', width: '18', height: '7', rx: '2', stroke: 'currentColor', 'stroke-width': '1.6' });
      }
      iconBox.appendChild(svg);
      const title = document.createElement('span');
      title.className = 'elr-resize-pane-title';
      title.textContent = titleText;
      const sub = document.createElement('span');
      sub.className = 'elr-resize-pane-sub';
      badge.append(iconBox, title, sub);
      return { badge, sub };
    };
    const updateShare = (state, size) => {
      const sidePct = Math.round((size / state.totalSpan) * 100);
      const readerPct = Math.max(0, 100 - sidePct);
      state.readerSub.textContent = '文献正文 · ' + readerPct + '%';
      state.sideSub.textContent = '工具卡片 · ' + sidePct + '%';
    };
    const painter = frameWriter((size) => {
      if (size === drag.size) return;
      drag.size = size;
      drag.sidePane.style[dimension] = Math.max(24, size - 8) + 'px';
      updateShare(drag, size);
      handle.setAttribute('aria-valuenow', String(size));
    });
    const down = (event) => {
      if (event.button !== 0 || event.isPrimary === false || drag) return;
      const limits = readLimits();
      if (!limits) return;
      const bodyRect = body.getBoundingClientRect();
      const divider = (bottom ? handle.offsetHeight : handle.offsetWidth) || PANE_DIVIDER_SIZE;
      const totalSpan = Math.max(1, (bottom ? bodyRect.height : bodyRect.width) - divider);
      const clipEl = document.createElement('div');
      clipEl.className = 'elr-resize-curtain-clip ' + (bottom ? 'is-bottom' : (isLeftSide ? 'is-left' : 'is-right')) + toneCls;
      clipEl.style.left = bodyRect.left + 'px';
      clipEl.style.top = bodyRect.top + 'px';
      clipEl.style.width = bodyRect.width + 'px';
      clipEl.style.height = bodyRect.height + 'px';

      const readerPane = document.createElement('div');
      readerPane.className = 'elr-resize-pane is-reader';
      const readerBadge = buildResizeBadge('reader', '阅读区域');
      readerPane.appendChild(readerBadge.badge);

      const edgeEl = document.createElement('div');
      edgeEl.className = 'elr-resize-curtain-edge';
      if (bottom) edgeEl.style.height = divider + 'px';
      else edgeEl.style.width = divider + 'px';

      const sidePane = document.createElement('div');
      sidePane.className = 'elr-resize-pane is-side';
      sidePane.style[dimension] = Math.max(24, limits.start - 8) + 'px';
      const sideBadge = buildResizeBadge('side', '功能栏');
      sidePane.appendChild(sideBadge.badge);

      clipEl.append(readerPane, edgeEl, sidePane);
      (floatingHost || document.body).appendChild(clipEl);
      drag = {
        id: event.pointerId, origin: coordinate(event), limits, size: limits.start, initialStyle: side.style[dimension],
        clipEl, sidePane, totalSpan, readerSub: readerBadge.sub, sideSub: sideBadge.sub,
      };
      updateShare(drag, limits.start);
      handle.focus({ preventScroll: true });
      handle.classList.add('active');
      body.classList.add('is-resizing-panes');
      gestureStart();
      try { handle.setPointerCapture(event.pointerId); } catch (_) {}
      event.preventDefault();
    };
    const pointerSize = (event) => sizeAt(
      drag.limits.start + (coordinate(event) - drag.origin) * (isLeftSide ? 1 : -1),
      drag.limits,
    );
    const move = (event) => {
      if (drag && event.pointerId === drag.id) painter.push(pointerSize(event));
    };
    const finish = (size) => {
      if (!drag) return;
      const { id, limits, initialStyle, clipEl } = drag;
      drag = null;
      painter.cancel();
      clipEl?.remove();
      if (size === undefined || size === limits.start) {
        side.style[dimension] = initialStyle;
        syncCurrent();
      } else {
        commit(size, limits);
      }
      gestureEnd();
      body.classList.remove('is-resizing-panes');
      handle.classList.remove('active');
      if (handle.hasPointerCapture?.(id)) handle.releasePointerCapture(id);
    };
    const up = (event) => {
      if (drag && event.pointerId === drag.id) finish(pointerSize(event));
    };
    const cancel = (event) => {
      if (drag && (event.pointerId == null || event.pointerId === drag.id)) finish();
    };
    const onViewportResize = (event) => {
      cancel(event);
      syncCurrent();
    };
    const onKey = (event) => {
      if (event.key === 'Escape' && drag) {
        finish();
        event.preventDefault();
        return;
      }
      const towardReader = bottom ? 'ArrowUp' : (isLeftSide ? 'ArrowRight' : 'ArrowLeft');
      const awayFromReader = bottom ? 'ArrowDown' : (isLeftSide ? 'ArrowLeft' : 'ArrowRight');
      if (drag || ![towardReader, awayFromReader, 'Home', 'End'].includes(event.key)) return;
      const limits = readLimits();
      if (!limits) return;
      const step = event.shiftKey ? 48 : 16;
      const size = event.key === 'Home' ? limits.min : event.key === 'End' ? limits.max
        : sizeAt(limits.start + (event.key === towardReader ? step : -step), limits);
      commit(size, limits);
      event.preventDefault();
    };
    syncCurrent();
    handle.addEventListener('pointerdown', down);
    handle.addEventListener('lostpointercapture', cancel);
    handle.addEventListener('focus', syncCurrent);
    handle.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', onViewportResize);
    return () => {
      finish();
      handle.removeEventListener('pointerdown', down);
      handle.removeEventListener('lostpointercapture', cancel);
      handle.removeEventListener('focus', syncCurrent);
      handle.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', onViewportResize);
    };
  }, [dock, sideDock, dualColumns, hasPaper, workspaceStowed, toneCls]);

  // (v8 #6) Splitter between the upper side block (selection card + movable
  // sections) and the translation/analysis area. Without it the two halves
  // were laid out by flexbox alone and could not be resized at all.
  // (v25 #3) The divider follows the dock axis: docked right it splits
  // vertically (a height), docked bottom the two halves sit SIDE BY SIDE and it
  // splits horizontally (a width), which is what the horizontal layout needs.
  // The splitter is mounted with the document tools.
  React.useEffect(() => {
    const handle = splitRef.current;
    if (!handle) return;
    let startX = 0, startY = 0, startSize = 0, active = false, pending = 0;
    // (v32 #3) Same gesture-perf rule as the pane resizer above: paint straight
    // onto the element while dragging, commit to shared state on pointerup.
    // (v34 #2) …and coalesce the painting to one write per animation frame.
    const painter = frameWriter((px) => {
      const el = sideTopElRef.current;
      if (!el) return;
      if (dockRef.current === 'bottom') el.style.width = px + 'px';
      else el.style.height = px + 'px';
    });
    const apply = (px) => {
      pending = px;
      painter.push(px);
    };
    const down = (e) => {
      if (e.button !== 0) return;
      active = true;
      startX = e.clientX;
      startY = e.clientY;
      startSize = dockRef.current === 'bottom' ? sideTopWidthRef.current : sideTopHeightRef.current;
      pending = startSize;
      handle.classList.add('active');
      gestureStart();
      e.preventDefault();
      // (v29 fix) Keep receiving the drag when the pointer leaves the 6px bar,
      // and stop the browser from starting a text selection on the way.
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      try { document.body.style.userSelect = 'none'; } catch (_) {}
    };
    const move = (e) => {
      if (!active) return;
      if (dockRef.current === 'bottom') {
        const pane = handle.parentElement;
        const total = pane ? pane.clientWidth : 900;
        const max = Math.max(SIDE_TOP_MIN + 40, total - 260);
        apply(Math.max(SIDE_TOP_MIN, Math.min(max, startSize + (e.clientX - startX))));
        return;
      }
      const pane = handle.parentElement;
      const total = pane ? pane.clientHeight : 600;
      const max = Math.max(SIDE_TOP_MIN + 40, total - 160);
      apply(Math.max(SIDE_TOP_MIN, Math.min(max, startSize + (e.clientY - startY))));
    };
    const up = () => {
      if (!active) return;
      active = false;
      handle.classList.remove('active');
      gestureEnd();
      painter.cancel();
      try { document.body.style.userSelect = ''; } catch (_) {}
      if (dockRef.current === 'bottom') setSideTopWidth(pending);
      else setSideTopHeight(pending);
      flushSnapshot();
    };
    handle.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      handle.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [mode, dock, hasPaper]);

  const modelSelection = describeModelSelection(bodyRef.current());

  const providers = activeCatalog?.providers || [];
  const emptyModelLabel = t(activeCatalog ? 'models.empty' : 'models.loading');
  const providerRow = providers.find((x) => x.id === selProvider);
  const modelList = providerRow && Array.isArray(providerRow.models) ? providerRow.models : [];
  const effortList = efforts && Array.isArray(efforts.efforts) ? efforts.efforts : [];
  const followLabel = (efforts && efforts.defaultEffort)
    ? t('effort.followNamed').replace('{effort}', efforts.defaultEffort)
    : t('effort.follow');

  const onProviderChange = (e) => {
    const p = e.target.value;
    const row = providers.find((x) => x.id === p);
    const models = row && Array.isArray(row.models) ? row.models : [];
    const m = models.length ? models[0].id : '';
    setSelProvider(p);
    setSelModel(m);
    setSelEffort('');
    persistModel(p, m, '');
  };
  const onModelChange = (e) => {
    const m = e.target.value;
    setSelModel(m);
    setSelEffort('');
    persistModel(selProvider, m, '');
  };
  const onEffortChange = (e) => {
    const v = e.target.value;
    setSelEffort(v);
    persistModel(selProvider, selModel, v);
  };

  const modelControl = (label, select) => h('label', { className: 'elr-head-model' },
    h('span', { className: 'elr-select-label' }, t(label)), select
  );
  // (v46) The panel body is built ONCE and shared by both modes: PDF mode
  // adds the paper-theme row (there is a rendered page to tint), text mode
  // does not, but the other three rows are identical by construction.
  const settingsPanel = (withTheme) => h('div', { ref: settingsPanelRef, className: 'elr-settings-panel', role: 'dialog', 'aria-label': t('settings.panel') },
    h('div', { className: 'elr-settings-head' }, t('settings.title')),
    withTheme
      ? settingsRow('theme', t('theme.label'), h('select', {
          className: 'elr-select',
          value: theme,
          disabled: !hasPdf,
          onChange: (e) => setTheme(e.target.value),
        },
          h('optgroup', { label: t('theme.light') },
            LIGHT_PAGE_THEMES.map((key) => h('option', { key, value: key }, t('theme.' + key)))
          ),
          h('optgroup', { label: t('theme.dark') },
            DARK_PAGE_THEMES.map((key) => h('option', { key, value: key }, t('theme.' + key)))
          )
        ))
      : null,
    settingsRow('tone', t('tone.label'), h('select', {
      className: 'elr-select',
      value: uiTone,
      onChange: (e) => setUiTone(e.target.value),
    },
      Object.entries(UI_TONES).map(([group, tones]) => h('optgroup', { key: group, label: t('tone.' + group) },
        tones.map((tone) => h('option', { key: tone, value: tone }, t('tone.' + tone)))
      ))
    )),
    settingsRow('dock', t('dock.label'), settingsSeg('dock', [
      { value: 'right', label: t('dock.rightShort') },
      { value: 'bottom', label: t('dock.bottomShort') },
    ], dock, (next) => setDock(next))),
    settingsRow('popup', t('popup.label'), settingsSeg('popup', [
      { value: 'off', label: t('popup.offShort') },
      { value: 'on', label: t('popup.onShort') },
    ], popupOn ? 'on' : 'off', (next) => setPopupOn(next === 'on'))),
    settingsRow('albumInterval', '相册轮播', h('select', {
      className: 'elr-settings-select',
      'aria-label': '相册轮播时长',
      value: albumIntervalSec,
      onChange: (e) => setAlbumInterval(normalizeAlbumInterval(e.target.value)),
    }, [
      ...ALBUM_INTERVAL_OPTIONS.map((item) => h('option', { key: item.value, value: item.value }, item.label)),
      ...(!ALBUM_INTERVAL_OPTIONS.some((item) => item.value === albumIntervalSec)
        ? [h('option', { key: 'custom-' + albumIntervalSec, value: albumIntervalSec }, '自定义（' + albumIntervalSec + ' 秒）')]
        : []),
    ]))
  );
  // (v46) The single "appearance" entry point: one button plus, while open,
  // the panel directly beneath it. The panel lives INSIDE the button's span
  // so `settingsBoxRef` containment covers both, and so the absolute
  // positioning is relative to the button rather than the toolbar.
  const settingsWidget = (withTheme, ref) => h('span', {
    ref: ref || undefined,
    className: 'elr-settings' + (settingsOpen ? ' open' : ''),
  },
    h('button', {
      className: 'elr-btn elr-settings-btn' + (settingsOpen ? ' active' : ''),
      title: t('settings.hint'),
      onClick: (e) => { e.preventDefault(); setSettingsOpen((v) => !v); },
    },
      t('settings.title'),
      theme !== 'default' || uiTone !== 'default' ? h('span', { className: 'elr-settings-dot' }) : null
    ),
    settingsOpen ? settingsPanel(withTheme) : null
  );

  const readPagesRef = React.useRef({ paperId: '', pages: new Set() });
  const recordReadPages = (pages) => {
    const id = paperIdRef.current;
    if (!id) return;
    if (readPagesRef.current.paperId !== id) {
      readPagesRef.current = { paperId: id, pages: new Set() };
    }
    const maxPage = pageCountRef.current || Infinity;
    const fresh = (Array.isArray(pages) ? pages : [pages])
      .filter((p) => Number.isSafeInteger(p) && p >= 1 && p <= maxPage && !readPagesRef.current.pages.has(p));
    if (!fresh.length) return;
    for (const p of fresh) readPagesRef.current.pages.add(p);
    markPagesRead(id, fresh);
  };

  React.useEffect(() => {
    const file = lastFileRef.current;
    if (!pdfAnalysisReady || positionReady !== file || !file || file.desktopId !== paperId || !pageNum || !zoomPct) return;
    file.desktopPage = pageNum;
    file.desktopZoom = pdfReading.originalScale || zoomPct / 100;
    savePosition(paperId, file.desktopPage, file.desktopZoom, pageCount);
  }, [paperId, pageNum, pageCount, zoomPct, pdfAnalysisReady, positionReady, pdfReading.mode]);

  React.useEffect(() => {
    const file = lastFileRef.current;
    if (!pdfAnalysisReady || positionReady !== file || !file || file.desktopId !== paperId || !pageNum) return;
    if (readPagesRef.current.paperId !== paperId) {
      readPagesRef.current = { paperId, pages: new Set() };
    }
    const spread = Number(spreadMode) || 0;
    const total = pageCount || Infinity;
    const visiblePages = [pageNum];
    if (spread >= 1 && pageNum + 1 <= total) visiblePages.push(pageNum + 1);
    if (spread >= 2 && pageNum + 2 <= total) visiblePages.push(pageNum + 2);
    if (visiblePages.every((p) => readPagesRef.current.pages.has(p))) return;

    let elapsed = 0;
    let startedAt = document.hidden ? 0 : Date.now();
    let timer = 0;
    const schedule = () => {
      if (timer) { window.clearTimeout(timer); timer = 0; }
      if (document.hidden) return;
      const remaining = Math.max(0, 10000 - elapsed);
      startedAt = Date.now();
      timer = window.setTimeout(() => {
        timer = 0;
        recordReadPages(visiblePages);
      }, remaining);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (startedAt) { elapsed += Date.now() - startedAt; startedAt = 0; }
        if (timer) { window.clearTimeout(timer); timer = 0; }
      } else {
        schedule();
      }
    };
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [paperId, pageNum, pageCount, spreadMode, pdfAnalysisReady, positionReady]);
  const openPdfPicker = () => openPaper(null).then((file) => { if (file) handleFile(file, file.desktopId); }).catch((error) => notify(error.message, 'error'));
  const goHome = () => { closePaper(); changeMode('pdf'); };
  const headGroup = (...children) => h('div', { className: 'elr-head-group' }, ...children);
  const pdfOptionsId = React.useId();
  const pdfOptionsRef = React.useRef(null);
  const pdfOptionsButton = React.useRef(null);
  const choosePdfOption = (action) => {
    pdfOptionsRef.current?.hidePopover();
    action();
  };
  const compareSurface = React.useRef(null);
  const compareMotion = React.useRef(null);
  const compareIntent = React.useRef(null);
  const cancelCompareMotion = () => {
    compareMotion.current?.stop();
    compareMotion.current = null;
    compareIntent.current = null;
  };
  React.useEffect(() => {
    window.addEventListener('resize', cancelCompareMotion);
    return () => { window.removeEventListener('resize', cancelCompareMotion); cancelCompareMotion(); };
  }, [paperId, dock]);
  React.useLayoutEffect(() => {
    const intent = compareIntent.current;
    const pane = compareSurface.current;
    if (pdfReading.mode !== 'compare' || !intent || !pane) return;
    compareIntent.current = null;
    const copy = comparePaneCopy(pane, readingSpaceRef.current);
    if (!copy) return;
    const visual = animateComparePane(copy, intent.keyboard, false, intent.frame);
    const conceal = pane.animate([{ opacity: 0 }, { opacity: 0 }], motionTiming('md', 'enter', intent.keyboard));
    const motion = { copy, stop: () => { copy.remove(); visual.cancel(); conceal.cancel(); } };
    compareMotion.current = motion;
    visual.finished.then(() => {
      conceal.cancel();
      if (compareMotion.current === motion) compareMotion.current = null;
    }, () => {});
  }, [pdfReading.mode]);
  const switchPdfMode = (next, event) => {
    const outgoing = compareMotion.current?.copy;
    const style = outgoing?.isConnected ? getComputedStyle(outgoing) : null;
    const frame = style ? { opacity: style.opacity, clipPath: style.clipPath } : null;
    cancelCompareMotion();
    const keyboard = !event.detail;
    if (next === 'compare') {
      compareIntent.current = { keyboard, frame };
    } else if (compareSurface.current) {
      const copy = comparePaneCopy(compareSurface.current, readingSpaceRef.current);
      if (copy) {
        const visual = animateComparePane(copy, keyboard, true, frame);
        const motion = { copy, stop: () => { copy.remove(); visual.cancel(); } };
        compareMotion.current = motion;
        visual.finished.then(() => {
          if (compareMotion.current === motion) compareMotion.current = null;
        }, () => {});
      }
    }
    cancelFigureWork();
    setFigureActivity(null);
    setFigurePickMode(false);
    pdfReading.changeMode(next);
  };
  const openFromMenu = React.useEffectEvent(openPdfPicker);
  React.useEffect(() => window.reader?.onOpenPaper?.(() => openFromMenu()), []);

  const fullscreenActive = isFullscreen || props.nativeFullscreen;
  const fullscreenLabel = t(fullscreenActive ? 'fullscreen.exit' : 'fullscreen.enter');
  React.useLayoutEffect(() => {
    const capsule = readingCapsuleRef.current;
    const space = readingSpaceRef.current;
    if (!capsule || !space) return;
    const measureCapsule = () => space.style.setProperty('--elr-capsule-space', Math.ceil(capsule.offsetHeight) + 24 + 'px');
    measureCapsule();
    const observer = new ResizeObserver(measureCapsule);
    observer.observe(capsule);
    return () => { observer.disconnect(); space.style.removeProperty('--elr-capsule-space'); };
  }, [hasPdf, capsulePosition]);
  const readingCapsule = hasPdf ? h('div', {
    ref: readingCapsuleRef, className: 'elr-reader-capsule', role: 'group', 'aria-label': 'PDF 阅读工具',
  },
      h('div', { className: 'elr-reader-cluster' },
        h('button', { type: 'button', className: 'elr-btn elr-reader-symbol', title: t('page.prev'),
          'aria-label': t('page.prev'), onClick: () => goPage(-1) }, readerIcon('previous', 16)),
        h('span', { className: 'elr-reader-page' }, pageNum + ' / ' + pageCount),
        h('button', { type: 'button', className: 'elr-btn elr-reader-symbol', title: t('page.next'),
          'aria-label': t('page.next'), onClick: () => goPage(1) }, readerIcon('next', 16))
      ),
      h('div', { className: 'elr-reader-cluster' },
        h('button', { type: 'button', className: 'elr-btn elr-reader-symbol', disabled: !showOriginalPdf,
          title: t('zoom.out'), 'aria-label': t('zoom.out'), onClick: () => zoom(-1) }, readerIcon('zoomOut', 16)),
        // (v28 #3, revised) One merged control: type any percentage, or open the
        // caret for the presets. The native spinner stays suppressed because it
        // duplicated the 缩小 / 放大 buttons beside it.
        h('span', { ref: zoomBoxRef, className: 'elr-zoom' + (zoomMenuOpen ? ' open' : '') },
          h('input', {
            className: 'elr-zoom-input',
            type: 'number',
            min: Math.round(ZOOM_MIN * 100),
            max: Math.round(ZOOM_MAX * 100),
            step: 10,
            value: zoomDraft == null ? String(zoomPct) : zoomDraft,
            disabled: !showOriginalPdf,
            'aria-label': t('zoom.label'),
            title: t('zoom.input'),
            onChange: (e) => setZoomDraft(e.target.value),
            onBlur: commitZoomDraft,
            onKeyDown: (e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitZoomDraft(); setZoomMenuOpen(false); }
              else if (e.key === 'Escape') { e.preventDefault(); setZoomDraft(null); setZoomMenuOpen(false); }
              else if (e.key === 'ArrowDown') { e.preventDefault(); setMenuMotionInput(zoomPopupRef.current, true); setZoomMenuOpen(true); }
            },
          }),
          h('span', { className: 'elr-zoom-suffix' }, '%'),
          h('button', {
            ref: zoomCaretRef, className: 'elr-zoom-caret',
            disabled: !showOriginalPdf,
            'aria-label': t('zoom.label'), title: t('zoom.label'),
            'aria-expanded': zoomMenuOpen,
            onClick: (e) => { e.preventDefault(); setMenuMotionInput(zoomPopupRef.current, !e.detail); setZoomMenuOpen((v) => !v); },
          }, readerIcon(zoomMenuOpen ? 'up' : 'down', '.84em')),
          h('div', { ref: zoomPopupRef, className: 'elr-zoom-menu elr-capsule-popover', popover: 'manual', inert: !zoomMenuOpen,
            onToggle: (e) => setCapsuleMenuOrigin(e, zoomCaretRef.current) },
                h('button', { type: 'button', className: 'elr-zoom-item', onClick: () => {
                  const state = pdfStateRef.current;
                  if (state?.viewer.pdfDocument) fitPdfPage(state);
                  setZoomDraft(null);
                  setZoomMenuOpen(false);
                } }, '适合整页'),
                ZOOM_PRESETS.map((p) => h('button', {
                  key: p,
                  className: 'elr-zoom-item' + (p === zoomPct ? ' active' : ''),
                  onClick: (e) => { e.preventDefault(); setZoomDraft(null); applyZoomPct(p); setZoomMenuOpen(false); },
                }, p + '%'))
              )
        ),
        h('button', { type: 'button', className: 'elr-btn elr-reader-symbol', disabled: !showOriginalPdf,
          title: t('zoom.in'), 'aria-label': t('zoom.in'), onClick: () => zoom(1) }, readerIcon('zoomIn', 16))
      ),
      h('div', { className: 'elr-reader-cluster' },
        pdfAnalysisReady ? h('button', { type: 'button', className: 'elr-btn elr-reader-compare',
          'data-tour': 'compare',
          'aria-pressed': comparison,
          onClick: (event) => switchPdfMode(comparison ? 'pdf' : 'compare', event) }, comparison ? '原文阅读' : '对照翻译') : null,
        h('button', { type: 'button', className: 'elr-btn elr-reader-symbol elr-reader-capture',
          disabled: !pdfAnalysisReady || !showOriginalPdf || Boolean(figureActivity?.busy),
          title: t('figure.screenshot'), 'aria-label': t('figure.screenshot'), 'aria-pressed': figurePicking,
          onClick: toggleFigurePicker }, readerIcon('capture')),
        h('button', { ref: pdfOptionsButton, type: 'button', className: 'elr-btn elr-reader-more', popoverTarget: pdfOptionsId,
          onClick: (e) => setMenuMotionInput(pdfOptionsRef.current, !e.detail),
          'aria-haspopup': 'dialog', 'aria-label': '更多阅读选项', title: '更多阅读选项' }, readerIcon('down', '.87em')),
        h('div', { ref: pdfOptionsRef, id: pdfOptionsId, className: 'elr-reader-options elr-capsule-popover', role: 'dialog',
          'aria-label': '更多阅读选项', popover: 'auto',
          onBeforeToggle: (e) => { e.currentTarget.inert = e.newState === 'closed'; },
          onToggle: (e) => setCapsuleMenuOrigin(e, pdfOptionsButton.current) },
          h('button', { type: 'button', className: 'elr-btn', disabled: !showOriginalPdf || comparison,
            title: comparison ? '对照翻译模式下保持单栏显示' : t('spread.label'),
            onClick: () => choosePdfOption(() => setSpreadMode((value) => (Number(value) + 1) % 3)),
          }, t('spread.label') + ' · ' + t(['spread.one', 'spread.two', 'spread.three'][effectiveSpreadMode])),
          showOriginalPdf ? (() => {
            const offsetVal = pdfOffsetX || 0;
            const offsetPct = (offsetVal + 100) / 2;
            const offsetFillStart = Math.min(50, offsetPct) + '%';
            const offsetFillEnd = Math.max(50, offsetPct) + '%';
            return h('div', { className: 'elr-reader-offset' },
              h('label', null,
                h('span', null, '页面左右位置'),
                h('output', { ref: pdfOffsetOutputRef }, !offsetVal ? '居中' : ((offsetVal < 0 ? '左移 ' : '右移 ') + Math.abs(offsetVal) + '%')),
                h('input', {
                  ref: pdfOffsetInputRef,
                  type: 'range', min: -100, max: 100, step: 1, defaultValue: offsetVal,
                  style: { '--elr-fill-start': offsetFillStart, '--elr-fill-end': offsetFillEnd },
                  'aria-label': '页面左右位置',
                  'aria-valuetext': !offsetVal ? '居中' : ((offsetVal < 0 ? '左移 ' : '右移 ') + Math.abs(offsetVal) + '%'),
                  onPointerDown: () => {
                    if (pdfOffsetDraggingRef.current) return;
                    pdfOffsetDraggingRef.current = true;
                    pdfOffsetWidthRef.current = containerRef.current?.clientWidth || 0;
                    gestureStart();
                    const endDrag = () => {
                      window.removeEventListener('pointerup', endDrag, true);
                      window.removeEventListener('pointercancel', endDrag, true);
                      window.removeEventListener('blur', endDrag);
                      if (!pdfOffsetDraggingRef.current) return;
                      pdfOffsetDraggingRef.current = false;
                      gestureEnd();
                      const finalVal = Number(pdfOffsetInputRef.current?.value ?? (pdfOffsetX || 0));
                      applyOffsetPreview(finalVal, false);
                      setPdfOffsetX(finalVal);
                    };
                    window.addEventListener('pointerup', endDrag, true);
                    window.addEventListener('pointercancel', endDrag, true);
                    window.addEventListener('blur', endDrag);
                  },
                  onInput: (event) => {
                    const val = Number(event.target.value);
                    applyOffsetPreview(val, pdfOffsetDraggingRef.current);
                    if (!pdfOffsetDraggingRef.current) setPdfOffsetX(val);
                  },
                })
              ),
              h('button', {
                ref: pdfOffsetResetRef,
                type: 'button', className: 'elr-btn', disabled: !offsetVal,
                onClick: () => setPdfOffsetX(0),
              }, '居中复位')
            );
          })() : null,
          h('button', { type: 'button', className: 'elr-btn', onClick: () => choosePdfOption(toggleFullscreen) }, fullscreenLabel)
        )
      )
  ) : null;
  const readingControls = mode === 'text' ? headGroup(
      h('button', { className: 'elr-btn', onClick: () => txtFileRef.current && txtFileRef.current.click() }, t('load')),
      // (v25 #1) Same 关闭文献 affordance in text mode: the reader has one way to
      // leave a paper, whether it arrived as a PDF or as pasted text.
      h('button', {
        className: 'elr-btn',
        disabled: !String(text || '').trim(),
        title: t('pdf.closeHint'),
        onClick: closePaper,
      }, t('pdf.close')),
      h('button', { className: 'elr-btn', onClick: () => { resetAnalysisTasks(); resetSelection(); writeShared({ text: '', summary: '', summaryCoverage: null, summaryMeta: null, summaryDetail: null }); notify(''); } }, t('clear')),
      h('span', { className: 'elr-model' }, text.length + ' ' + t('chars'))
  ) : null;

  const head = mode === 'pdf' ? null : h('header', { className: 'elr-head' },
    h('div', { className: 'elr-head-controls' },
      headGroup(
        h('button', { type: 'button', className: 'elr-btn elr-head-settings', onClick: openModelSettings, title: '模型、账号与显示设置' }, '设置'),
        h('button', { type: 'button', className: 'elr-btn', onClick: goHome }, '论文库')
      ),
      readingControls
    ),
    h('div', { className: 'elr-head-actions' },
      h('button', {
        type: 'button', className: 'elr-icon-btn elr-fullscreen-btn',
        'aria-label': fullscreenLabel, title: fullscreenLabel, onClick: toggleFullscreen,
      }, h('span', { className: 'elr-fullscreen-icon' + (fullscreenActive ? ' is-active' : ''), 'aria-hidden': true },
        h('span'), h('span'), h('span'), h('span')
      )),
      props.onMinimize ? h('button', { className: 'elr-icon-btn', onClick: props.onMinimize }, t('minimize')) : null,
      props.onClose ? h('button', { className: 'elr-icon-btn', onClick: props.onClose }, t('close')) : null
    )
  );

  let mainContent;
  if (mode === 'pdf') {
    const pdfjsLayer = h('div', {
      ref: containerRef,
      className: 'elr-pdf-container'
        + (effectiveSpreadMode === 2 ? ' elr-three' : '')
        + (figurePicking ? ' elr-picking-figure' : ''),
      'data-elr-page-theme': theme === 'default' ? undefined : theme,
      'data-elr-page-dark': DARK_PAGE_THEMES.includes(theme) ? 'true' : undefined,
      style: { display: previewMode === 'native' ? 'none' : '', '--elr-pdf-offset-x': String(pdfOffsetX || 0) },
      'aria-hidden': !showOriginalPdf || undefined,
      inert: !showOriginalPdf,
    }, h('div', { ref: viewerElRef, className: 'pdfViewer' }), originalMedia.hover ? h(OriginalPdfMediaAction, {
      hit: originalMedia.hover, container: containerRef.current, label: mediaActionLabel(originalMedia.hover.block.kind),
      onExplain: explainOriginalMedia,
    }) : null);
    const nativeLayer = previewMode === 'native' && nativeUrl
      ? h('iframe', { className: 'elr-pdf-iframe', src: nativeUrl, title: pdfName || 'PDF' })
      : null;
    mainContent = h('div', { className: 'elr-pdf-wrap' + (showPdfStart ? ' is-start' : ''),
      'data-reading-mode': pdfReading.mode,
      onFocusCapture: cancelCompareMotion,
      onWheelCapture: () => { cancelCompareMotion(); cancelCoverFlight(); },
      onPointerDownCapture: () => { cancelCompareMotion(); cancelCoverFlight(); } },
      pdfjsLayer,
      nativeLayer,
      pdfAnalysisReady && paperId ? h(PdfTranslations, {
        key: paperId + ':' + dropSeq, paper: paperId, page: pageNum, pageCount, mode: pdfReading.mode,
        autoTranslatePaper,
        target: pdfReading.target, selectedParagraph: pdfReading.selectedParagraph,
        surfaceRef: compareSurface, loadBlocks: pdfReading.loadBlocks, getChapter: pdfReading.getChapter,
        getAssets: pdfReading.getAssets, hover: pdfReading.hover, onHover: pdfReading.setHover,
        getModel: () => bodyRef.current(), onRead: pdfReading.followTranslation, onUserInput: pdfReading.useTranslation,
        onOriginal: pdfReading.locateSource, onPage: (page) => pdfReading.jump({ page }),
      }) : null,
      pdfAnalysisReady && pdfReading.mode === 'compare' ? h(PdfSplitHandle, {
        stage: readingSpaceRef, ratio: pdfReading.ratio, onChange: pdfReading.setRatio, onInteraction: cancelCompareMotion,
      }) : null,
      showPdfStart ? h(PaperLibrary, {
        onOpen: openRecent, onOpenCover: openFromCover, onCoverReady: coverReady,
        onOpenFile: openPdfPicker, onSettings: openModelSettings,
        version: props.version, availableUpdate: props.availableUpdate, updateState: props.updateState, onOpenUpdate: props.onOpenUpdate, readerError: pdfError, tone: toneCls,
      }) : null,
      hasPdf && pdfError ? h('div', { className: 'elr-retry-bar' },
        h('span', null, t('pdf.failed') + ' ' + pdfError),
        h('button', { className: 'elr-btn', onClick: () => { setPdfError(''); setPreviewMode('pdfjs'); setDropSeq((n) => n + 1); } }, t('retry')),
        h('button', { className: 'elr-btn', onClick: () => releaseNativeUrl() }, t('close'))
      ) : null,
      dragOver ? h('div', { className: 'elr-drag-mask' }, t('pdf.dropHere')) : null
    );
  } else {
    mainContent = h(React.Fragment, null,
      h('textarea', {
        ref: inputRef,
        className: 'elr-input',
        value: text,
        placeholder: t('paste'),
        onChange: (e) => {
          resetAnalysisTasks();
          setText(e.target.value);
          setReferences([]);
        },
        spellCheck: false,
      }),
      h('div', { className: 'elr-hint' }, t('selection.hint'))
    );
  }

  const canStepFind = !findBusy && Boolean(normText(findQuery)) && (!findSearchedRef.current || findHits.length > 0);
  const readingTools = hasPdf ? h('div', { className: 'elr-reading-tools' },
    pdfAnalysisReady ? h('button', {
      type: 'button', className: 'elr-reading-round', title: '目录', 'aria-label': '目录',
      'aria-expanded': pdfReading.outlineOpen, 'aria-controls': outlineId,
      onClick: () => pdfReading.setOutlineOpen((previous) => !previous),
    }, readerIcon('outline')) : null,
    pdfAnalysisReady ? h('div', {
      ref: findBoxRef,
      className: 'elr-find' + (findControl.open ? ' is-open' : '') + (findControl.motion ? ' use-motion' : ''),
      onKeyDown: (event) => {
        if (!findControl.open || event.key !== 'Escape' || event.nativeEvent?.isComposing) return;
        event.preventDefault();
        closeFind(false);
      },
    },
      h('button', {
        type: 'button', ref: findButtonRef, className: 'elr-find-toggle',
        title: t('find.placeholder'), 'aria-label': t('find.placeholder'),
        'aria-expanded': findControl.open, 'aria-controls': findRegionId,
        onClick: (event) => findControl.open ? closeFind(event.detail > 0) : openFind(event.detail > 0),
      }, readerIcon('search')),
      h('div', { id: findRegionId, className: 'elr-find-content', inert: !findControl.open, 'aria-hidden': !findControl.open || undefined,
        role: 'search', 'aria-label': t('find.placeholder') },
          h('input', {
            ref: findInputRef,
            className: 'elr-find-input',
            type: 'search',
            value: findQuery,
            disabled: !pdfAnalysisReady,
            placeholder: t('find.placeholder'),
            'aria-label': t('find.placeholder'),
            title: t('find.hint'),
            spellCheck: false,
            onChange: (event) => {
              const next = event.target.value;
              const changed = normText(next) !== normText(findQueryRef.current);
              findQueryRef.current = next;
              setFindQuery(next);
              if (changed) resetFindResults();
            },
            onKeyDown: (event) => {
              if (event.key !== 'Enter' || event.nativeEvent?.isComposing) return;
              event.preventDefault();
              stepFind(event.shiftKey ? -1 : 1);
            },
          }),
          findQuery ? h('span', { className: 'elr-find-actions' },
            h('output', {
              className: 'elr-find-count',
              role: 'status',
              'aria-label': findBusy ? t('find.searching') : undefined,
            }, findBusy ? '…' : (findSearchedRef.current ? (findAt + 1) + '/' + findHits.length : '')),
            h('button', {
              type: 'button', className: 'elr-find-btn is-prev', disabled: !canStepFind,
              title: t('find.prev'), 'aria-label': t('find.prev'),
              onClick: () => stepFind(-1),
            }),
            h('button', {
              type: 'button', className: 'elr-find-btn is-next', disabled: !canStepFind,
              title: t('find.next'), 'aria-label': t('find.next'),
              onClick: () => stepFind(1),
            }),
            h('button', {
              type: 'button', className: 'elr-find-btn',
              title: t('find.clear'), 'aria-label': t('find.clear'),
              onClick: () => { clearFind(); findInputRef.current?.focus({ preventScroll: true }); },
            }, '×')
          ) : null
      )
    ) : null,
    h('button', {
      type: 'button', className: 'elr-reading-round', title: '模型、账号与显示设置', 'aria-label': '设置', onClick: openModelSettings,
    }, readerIcon('settings')),
    h('button', {
      type: 'button', className: 'elr-reading-round', title: '返回论文库', 'aria-label': '主页', onClick: goHome,
    }, readerIcon('home'))
  ) : null;

  const main = h('div', { className: 'elr-main' },
    mode === 'pdf' ? h('div', { ref: readingSpaceRef, className: 'elr-reading-space', 'data-reading-mode': pdfReading.mode,
      'data-capsule-position': hasPdf ? capsulePosition : undefined,
      'data-tools-side': isLeftSide ? 'right' : 'left',
      style: { '--elr-original-width': pdfReading.ratio + '%' } },
      mainContent,
      readingCapsule,
      readingTools,
      pdfAnalysisReady ? h(PdfOutline, {
        key: paperId, id: outlineId, open: pdfReading.outlineOpen,
        nodes: pdfReading.outline.nodes, current: pdfReading.current, status: pdfReading.outline.status,
        onJump: pdfReading.jump, onRetry: pdfReading.loadOutline,
      }) : null,
    ) : mainContent
  );

  const cardHeader = (key, open) => {
    const toggleOpen = () => {
      const state = readShared();
      const openField = CARD_OPEN_FIELDS[key];
      const currentlyOpen = openField ? state[openField] : state.analysisOpen[key];
      const patch = cardOpenPatch(state, [key], !currentlyOpen);
      const saved = state.floatingCards[key];
      if (currentlyOpen && saved) {
        // Expanded cards may have been clamped upwards by the viewport.
        // Keep their visible top when the smaller collapsed layout fits.
        const card = floatingHost.querySelector('[data-elr-floating-card="' + key + '"]');
        if (card) patch.floatingCards = { ...state.floatingCards, [key]: { ...saved, y: card.getBoundingClientRect().top } };
      }
      rememberCardFold();
      writeShared(patch);
    };
    const openContext = (event, keyboard = false) => {
      event.preventDefault();
      event.stopPropagation();
      const anchor = event.currentTarget;
      const rect = anchor.getBoundingClientRect();
      setCardContext({ key, open, anchor, x: keyboard ? rect.left : event.clientX,
        y: keyboard ? rect.bottom : event.clientY });
    };
    const reorderByKeyboard = (delta, columnShift = 0) => {
      const state = readShared();
      if (state.floatingCards?.[key]) return;
      const currentEntry = workspaceCards.find((item) => item.key === key);
      if (!currentEntry) return;
      const col = currentEntry.column;
      if (columnShift !== 0 && columnCount === 2) {
        const nextCol = col === 0 ? 1 : 0;
        const targetCards = workspaceCards.filter((item) => item.column === nextCol);
        rememberCardPositions(null, true);
        focusCardHandleRef.current = key;
        dockFunctionCard(key, targetCards.at(-1)?.key || null, true, nextCol);
        return;
      }
      const colCards = workspaceCards.filter((item) => item.column === col).map((item) => item.key);
      const pos = colCards.indexOf(key);
      const nextPos = pos + delta;
      if (pos < 0 || nextPos < 0 || nextPos >= colCards.length) return;
      rememberCardPositions(null, true);
      focusCardHandleRef.current = key;
      dockFunctionCard(key, colCards[nextPos], delta > 0, columnCount === 2 ? col : null);
    };
    return h('div', { className: 'elr-function-head' },
      h('button', {
        type: 'button', className: 'elr-card-toggle', 'aria-expanded': open,
        'aria-keyshortcuts': 'Alt+Enter Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Shift+F10',
        onPointerDown: beginCardDrag(key, open, toggleOpen),
        onContextMenu: openContext,
        // Pointer capture resolves taps and drags. Native keyboard activation still produces a click.
        onClick: (event) => { if (event.detail === 0) toggleOpen(); },
        onKeyDown: (event) => {
          if (event.repeat) return;
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openContext(event, true);
          if (event.altKey && event.key === 'Enter') {
            event.preventDefault();
            toggleFunctionCardFloat(key, open, event.currentTarget);
          } else if (event.altKey && dock !== 'bottom' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault();
            reorderByKeyboard(event.key === 'ArrowUp' ? -1 : 1);
          } else if (event.altKey && dock === 'bottom' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault();
            reorderByKeyboard(event.key === 'ArrowLeft' ? -1 : 1);
          } else if (event.altKey && dock !== 'bottom' && columnCount === 2 && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault();
            reorderByKeyboard(0, event.key === 'ArrowLeft' ? -1 : 1);
          }
        },
      }, h('span', { className: 'elr-card-label' }, cardLabel(key)))
    );
  };

  const hasSelectionDraft = Boolean(String(selectionEdit || '').trim());
  const selectionSideBySide = dock === 'bottom' && !floatingCards.selection;
  const paneSplit = selectionSideBySide ? selectionWidthSplit : selectionSplit;
  const selCard = h('div', { className: 'elr-sel-card' },
    cardHeader('selection', selectionCardOpen),
    h('div', { className: 'elr-selection-content elr-card-fold-content', inert: !selectionCardOpen },
      h('div', { className: 'elr-sel-actions' },
        h('button', {
          type: 'button', className: 'elr-btn primary', disabled: !hasSelectionDraft || selectionBusy,
          onClick: () => translateRef.current(),
        }, t('selection.translate')),
        h('button', {
          type: 'button', className: 'elr-btn', disabled: !hasSelectionDraft,
          onClick: () => explainSelectionTerm(selectionSourceRef.current),
        }, t('term.explain')),
        mode === 'pdf' ? h('button', { type: 'button', className: 'elr-btn', disabled: !hasSelectionDraft || !pdfAnalysisReady, onClick: () => addAgentSelection() }, '问阅读助手') : null,
        h('button', { type: 'button', className: 'elr-btn', disabled: !selection, onClick: () => addHighlight() }, t('mark.add')),
        h('button', { type: 'button', className: 'elr-btn', disabled: !selection, onClick: () => addNote() }, t('mark.note'))
      ),
      h('div', {
        className: 'elr-selection-panes' + (selectionSideBySide ? ' is-side-by-side' : ''),
        style: { '--elr-selection-source': selectionPaneSize(paneSplit) },
      },
        h('div', { className: 'elr-selection-pane' },
          h('div', { className: 'elr-selection-pane-head' },
            h('label', { htmlFor: selectionHintId + '-card-source' }, t('popup.original')),
            h('span', { className: 'elr-selection-hint', id: selectionHintId + '-card', title: t('selection.appendHint') }, t('selection.appendHint'))
          ),
          h('textarea', {
            ref: selectionSourceRef,
            className: 'elr-sel-edit', id: selectionHintId + '-card-source', 'aria-describedby': selectionHintId + '-card',
            value: selectionEdit || '', spellCheck: false, placeholder: t('selection.empty'),
            onChange: (e) => setSelectionEdit(e.target.value),
          })
        ),
        selectionPaneGrip(paneSplit, selectionSideBySide ? setSelectionWidthSplit : setSelectionSplit,
          t(selectionSideBySide ? 'selection.resizePaneWidths' : 'selection.resizePanes'), cardGestureCancelRef, selectionSideBySide),
        h('div', { className: 'elr-selection-pane' },
          h('div', { className: 'elr-selection-pane-head' },
            h('span', { id: selectionHintId + '-card-result' }, t('popup.translation')),
            selectionResult ? h('button', {
              type: 'button', className: 'elr-btn elr-selection-copy',
              onClick: () => copyText(selectionResult).then(() => notify(t('selection.copied'), 'ok')),
            }, t('selection.copy')) : null
          ),
          h('div', {
            className: 'elr-sel-text' + (selectionResult ? '' : ' elr-out-empty'), role: 'region',
            'aria-labelledby': selectionHintId + '-card-result', 'aria-busy': selectionBusy, tabIndex: 0,
          }, selectionBusy ? t('selection.working') : selectionResult || (hasSelectionDraft ? t('selection.pending') : null))
        )
      )
    )
  );

  const selectedAnalysisTab = ['figure', 'agent'].includes(analysisTab) && mode !== 'pdf' ? 'summary' : analysisTab;
  const analysisTabItems = [
    { id: 'summary', title: t('tab.summary'), label: t('tab.summary') },
    { id: 'references', title: t('references.title'), label: t('references.title') + (references.length ? ' (' + references.length + ')' : '') },
    ...(mode === 'pdf' ? [
      { id: 'figure', title: t('figure.title'), label: t('figure.title') },
      { id: 'agent', title: '阅读助手', label: '阅读助手' },
    ] : []),
  ];
  const onAnalysisTabKeyDown = (event, index) => {
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % analysisTabItems.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + analysisTabItems.length) % analysisTabItems.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = analysisTabItems.length - 1;
    if (next < 0) return;
    event.preventDefault();
    setAnalysisTab(analysisTabItems[next].id);
    event.currentTarget.parentElement?.children[next]?.focus();
  };
  const analysisTabs = h('div', { className: 'elr-tabs' },
    h('div', { className: 'elr-segment', role: 'tablist', 'aria-label': '研究分析' },
      analysisTabItems.map((item, index) => {
        const selected = selectedAnalysisTab === item.id;
        return h('button', {
          key: item.id,
          type: 'button',
          role: 'tab',
          'aria-selected': selected,
          tabIndex: selected ? 0 : -1,
          className: 'elr-seg' + (selected ? ' active' : ''),
          title: item.title,
          onClick: () => setAnalysisTab(item.id),
          onKeyDown: (event) => onAnalysisTabKeyDown(event, index),
        }, item.label);
      })
    ),
    h('span', { className: 'elr-spacer' })
  );

  const canAnalyze = mode === 'pdf' ? pdfAnalysisReady : Boolean(text.trim());
  const analysisUnavailable = mode === 'pdf' && previewMode === 'native' ? t('pdf.analysisUnavailable') : undefined;
  const coverageLabel = () => {
    if (!summaryCoverage || !summary) return '';
    const ranges = (summaryCoverage.pages || []).map(([from, to]) => from === to ? from : from + '–' + to).join(', ');
    const label = ranges
      ? t('summary.coveragePages', { pages: ranges, total: summaryCoverage.totalPages })
      : t('summary.coverageText', { count: summaryCoverage.analyzedChars, total: summaryCoverage.sourceChars });
    const method = summaryDetail?.mode;
    return [label,
      method === 'direct' && t('summary.fullPass'), method === 'map-reduce' && t('summary.sectionPass'),
      summaryCoverage.failedChunks > 0 && t('summary.coverageFailed', { count: summaryCoverage.failedChunks }),
      summaryCoverage.notes && t('summary.notesOnly')].filter(Boolean).join(' · ');
  };
  const summaryCoverageText = coverageLabel();
  const analysisIconButton = (icon, label, props = {}) => h('button', {
    ...props, type: 'button', className: 'elr-card-control elr-analysis-icon' + (props.className ? ' ' + props.className : ''),
    'aria-label': label, title: props.title || label, 'data-icon': icon,
  }, readerIcon(icon));
  const summaryActions = h('div', { className: 'elr-analysis-actions' },
    analysisIconButton(summary ? 'refresh' : 'play', t(summary ? 'summary.rerun' : 'summary.run'), {
      className: 'elr-analysis-run', title: analysisUnavailable, disabled: summaryBusy || pdfTextBusy || !canAnalyze,
      onClick: () => runWithAnalysisText(doSummary),
    }),
    analysisIconButton('copy', t('summary.copy'), {
      disabled: !summary, onClick: () => copyText(summary).then(() => notify(t('selection.copied'), 'ok')),
    }),
    analysisIconButton('info', t('summary.info'), { disabled: !summary, popoverTarget: summaryInfoId, 'aria-haspopup': 'dialog' }),
    h('div', { id: summaryInfoId, className: 'elr-reader-options elr-analysis-info', popover: 'auto',
      role: 'dialog', 'aria-label': t('summary.info'),
    }, summary ? renderGenerationMetadata(summaryMeta, modelSelection, t) : null,
    summaryCoverageText ? h('p', { className: 'elr-analysis-info-coverage' }, summaryCoverageText) : null)
  );
  const summaryBusyText = (pdfTextBusy || summaryBusy) ? t(pdfTextBusy ? 'pdf.extracting' : 'summary.running') : '';
  const summaryErrorText = summaryIssue || (summaryDetail?.error ? t('summary.synthesisError', { error: summaryDetail.error }) : '');
  const hasSummaryCenter = Boolean(summaryBusyText || summaryErrorText || summaryDetail?.draft);
  const summaryPanel = h('div', { className: 'elr-col' },
    hasSummaryCenter && h('div', { className: 'elr-card-center-status' },
      h('div', {
        className: 'elr-card-center-box' + (summaryErrorText && !summaryBusyText ? ' is-error' : ''),
        role: summaryErrorText && !summaryBusyText ? 'alert' : 'status',
      },
        summaryBusyText ? h('span', { className: 'elr-card-center-msg' }, summaryBusyText) : null,
        summaryErrorText ? h('span', { className: 'elr-card-center-msg' }, summaryErrorText) : null,
        summaryDetail?.draft && !summaryBusyText ? h('div', { className: 'elr-card-center-actions' },
          h('button', {
            className: 'elr-btn primary', type: 'button', disabled: summaryBusy || pdfTextBusy || !canAnalyze,
            onClick: () => runWithAnalysisText(() => doSummary(true)),
          }, t('summary.retrySynthesis'))
        ) : null
      )
    ),
    h('div', { className: 'elr-out elr-analysis-output' + (summary ? ' elr-markdown' : ' elr-out-empty') },
      summary ? renderMarkdown(summary) : (!hasSummaryCenter ? (analysisUnavailable || h(EmptyState, {
        size: 'card',
        icon: 'document',
        title: '还没有论文总结',
        primaryAction: { label: '开始分析', disabled: summaryBusy || pdfTextBusy || !canAnalyze, onClick: () => runWithAnalysisText(doSummary) },
      })) : null)
    )
  );

  const currentFigure = figureActivity?.paper === paperId && figureActivity.category === contentCategory ? figureActivity : null;
  const activeFigureId = expandedFigure ?? figureEntries[0]?.id;
  const removeFigureAnalysis = (id) => {
    if (!paperId) return;
    const entries = loadFigureHistory(paperId).filter((entry) => entry.id !== id);
    if (id === activeFigureId) {
      const index = figureEntries.findIndex((entry) => entry.id === id);
      setExpandedFigure(figureEntries[index + 1]?.id ?? figureEntries[index - 1]?.id ?? '');
    }
    const saved = persistFigureHistory(paperId, entries);
    setFigureArchive({ paper: paperId, entries });
    if (!saved) notify(t('content.removeSaveFailed'), 'warn');
  };
  const currentFormula = formulaCard?.paper === paperId ? formulaCard : null;
  const currentAnalysis = currentFigure ?? (contentCategory === 'formula' ? currentFormula : null);
  const figureStatus = figurePicking && contentCategory === 'visual' ? t('figure.selectHint')
    : currentAnalysis?.busy ? t(contentCategory === 'formula' ? 'formula.working' : 'figure.working') : currentAnalysis?.error;
  const figurePanel = h('div', { className: 'elr-col' },
    h('div', { className: 'elr-content-tools' },
      h('div', { className: 'elr-content-tabs', role: 'group', 'aria-label': t('figure.title') },
        ['visual', 'formula'].map((category) => h('button', {
          key: category, type: 'button', 'aria-pressed': contentCategory === category,
          onClick: () => {
            if (contentCategory === category) return;
            setContentCategory(category);
            if (figureListRef.current) figureListRef.current.scrollTop = 0;
          },
        }, t('content.' + category)))
      ),
      figureEntries.length > 1 ? h('label', { className: 'elr-figure-sort' },
        h('span', null, t('figure.sort')),
        h('select', {
          className: 'elr-select', value: figureSort,
          onChange: (event) => {
            setExpandedFigure(activeFigureId);
            setFigureSort(event.target.value);
            if (figureListRef.current) figureListRef.current.scrollTop = 0;
          },
        }, FIGURE_SORT_ORDERS.map((order) => h('option', { key: order, value: order }, t('figure.sort.' + order))))
      ) : null
    ),
    figureStatus ? h('div', { className: 'elr-card-center-status' },
      h('div', {
        className: 'elr-card-center-box' + (currentAnalysis?.error && !currentAnalysis?.busy ? ' is-error' : ''),
        role: currentAnalysis?.error && !currentAnalysis?.busy ? 'alert' : 'status',
      },
        h('span', { className: 'elr-card-center-msg' }, figureStatus),
        currentAnalysis?.busy ? h('div', { className: 'elr-card-center-actions' },
          h('button', {
            type: 'button', className: 'elr-btn', onClick: () => {
              if (contentCategory === 'formula' && currentAnalysis !== currentFigure) {
                cancelFormulaWork();
                setFormulaCard(null);
              } else {
                cancelFigureWork();
                setFigureActivity(null);
              }
            },
          }, t('figure.cancel'))
        ) : null
      )
    ) : null,
    h('div', { ref: figureListRef, className: 'elr-out elr-figure-out' + (figureEntries.length ? '' : ' elr-out-empty') },
      figureEntries.length ? figureEntries.map((entry) => {
        const open = entry.id === activeFigureId;
        const caption = visualCaptionLabel(entry.label) || visualCaptionLabel(entry.caption);
        const number = entry.number || equationNumber(entry.formula);
        const label = entry.kind === 'formula'
          ? (number ? t('content.numberedFormula', { number }) : t('content.formulaEntry'))
          : caption ? (caption.kind === 'table' ? 'Table ' : 'Figure ') + caption.number
            : t(entry.kind === 'table' ? 'content.tableEntry' : 'figure.entry');
        return h('article', { key: entry.id, ref: open ? openFigureRef : null,
          className: 'elr-figure-entry', 'data-kind': entry.kind || 'figure',
        },
          h('div', { className: 'elr-figure-entry-head' },
            h('button', {
              type: 'button', className: 'elr-figure-entry-toggle', 'aria-expanded': open,
              onClick: () => setExpandedFigure(open ? '' : entry.id),
            }, h('span', { title: label }, label)),
            entry.page ? h('button', {
              type: 'button', className: 'elr-card-control elr-figure-entry-page', disabled: !pdfAnalysisReady,
              'aria-label': t('figure.page', { page: entry.page }), title: t('figure.page', { page: entry.page }),
              onClick: () => {
                const viewer = pdfStateRef.current?.viewer;
                if (viewer) {
                  pdfReading.showSource();
                  viewer.currentPageNumber = entry.page;
                }
              },
            }, entry.page) : null,
            h('button', {
              type: 'button', className: 'elr-card-control elr-figure-entry-remove elr-remove-control',
              'aria-label': t('content.removeEntry') + ' · ' + label, title: t('content.removeEntry'),
              onClick: () => removeFigureAnalysis(entry.id),
            }, h('span', { className: 'elr-trash-icon', 'aria-hidden': true }))
          ),
          open ? h(React.Fragment, null,
            renderGenerationMetadata(entry, modelSelection, t),
            h('div', { className: 'elr-figure-entry-body elr-markdown' },
              entry.caption ? h('blockquote', null, entry.caption) : null,
              entry.formula ? h('div', { className: 'elr-formula-render elr-katex' }, renderFormulaPreview(entry.formula)) : null,
              renderFigureMarkdown(entry.text)
            )
          ) : null
        );
      }) : (!figureStatus ? h(EmptyState, {
        size: 'card',
        icon: 'image',
        title: contentCategory === 'formula' ? '还没有公式解释' : '还没有图解记录',
        primaryAction: contentCategory === 'visual' ? { label: '框选插图', onClick: () => setFigurePickMode(true) } : undefined,
      }) : null))
  );

  const referencesActions = h('div', { className: 'elr-analysis-actions' },
    analysisIconButton(references.length ? 'refresh' : 'play', t(references.length ? 'references.rerun' : 'references.run'), {
      className: 'elr-analysis-run', title: analysisUnavailable, disabled: referencesBusy || pdfTextBusy || !canAnalyze, onClick: doReferences,
    })
  );
  const referencesBusyText = (referencesBusy || pdfTextBusy) ? t('references.running') : '';
  const referencesPanel = h('div', { className: 'elr-col' },
    referencesBusyText ? h('div', { className: 'elr-card-center-status' },
      h('div', { className: 'elr-card-center-box', role: 'status' },
        h('span', { className: 'elr-card-center-msg' }, referencesBusyText)
      )
    ) : null,
    references.length ? h('div', { className: 'elr-out elr-refs-out' },
      h('div', { className: 'elr-refs-list' }, references.map((item, index) => {
        const { id, raw, title, en, zh, authors, venue, year, status, url, number } = item || {};
        const linked = /^https?:\/\//i.test(url || '')
          && (status === 'provided' || status === 'matched');
        const meta = [authors, year, venue].filter(Boolean).join(' · ');
        const citation = /^\[?(\d+)\]?$/.exec(String(number || '').trim())?.[1];
        return h('div', { key: id || ('ref' + index), className: 'elr-ref' },
          h('div', { className: 'elr-ref-body' },
            h('div', { className: 'elr-ref-heading' },
              citation ? h('span', { className: 'elr-ref-index' }, '[' + citation + ']') : null,
              h('span', { className: 'elr-ref-en' }, title || en || raw),
              (title || en) && meta ? h('span', { className: 'elr-ref-meta' }, ' · ' + meta) : null
            ),
            zh ? h('div', { className: 'elr-ref-zh' }, zh) : null,
            linked ? h('a', { className: 'elr-ref-link', href: url, target: '_blank', rel: 'noreferrer noopener' }, url)
              : (!referencesBusy ? h('span', { className: 'elr-ref-missing' }, t('references.missing')) : null)
          )
        );
      }))
    ) : (referencesBusyText
      ? h('div', { className: 'elr-out elr-refs-out elr-out-empty' })
      : h('div', { className: 'elr-out elr-refs-out elr-out-empty' },
        h(EmptyState, {
          size: 'card',
          icon: 'quote',
          title: '还没有参考文献',
          primaryAction: { label: '整理参考文献', disabled: referencesBusy || pdfTextBusy || !canAnalyze, onClick: doReferences },
        })
      ))
  );

  const recentSection = h('div', { className: 'elr-recent' },
    cardHeader('recent', recentOpen),
    recent.length
      ? h('div', { className: 'elr-recent-list elr-card-fold-content', inert: !recentOpen }, recent.map((entry) => h('div', {
          key: entry.id,
          className: 'elr-recent-item' + (entry.id === paperId ? ' current' : ''),
          title: (entry.name || '') + ' · ' + t('recent.hint'),
          onDoubleClick: () => openRecent(entry),
        },
          h('span', { className: 'elr-recent-name' }, entry.name || '(untitled)'),
          h('button', { title: t('recent.open'), onClick: () => openRecent(entry) }, '▸'),
          h('button', { title: t('recent.remove'), onClick: () => removeRecent(entry.id) }, '×')
        )))
      : h('div', { className: 'elr-recent-empty elr-card-fold-content', inert: !recentOpen },
        h(EmptyState, {
          size: 'card',
          icon: 'history',
          title: '还没有最近阅读',
          primaryAction: { label: '打开 PDF', onClick: () => pdfFileRef.current?.click() },
        })
      )
  );

  // (v24 #2) The list respects the filter, and in 'all' mode it follows the
  // document's reading order instead of the order the records happened to be
  // created in. Records whose text cannot be located (PDF closed, page not laid
  // out yet) keep their insertion order after the located ones, so the list never
  // reshuffles on its own while the viewer is loading.
  const listMarks = (() => {
    const all = Array.isArray(marks) ? marks.filter((m) => m && typeof m === 'object') : [];
    const visible = markFilter === 'all' ? all : all.filter((m) => markKind(m) === markFilter);
    // Only the OPEN list needs reading order; skipping it while collapsed keeps a
    // closed section from paying a full-document scan on every re-render.
    if (markFilter !== 'all' || visible.length < 2 || !marksOpen) return visible;
    const located = [];
    const rest = [];
    for (let i = 0; i < visible.length; i++) {
      const at = locateMark(visible[i]);
      if (at) located.push({ mark: visible[i], page: at.page, offset: at.offset, seq: i });
      else rest.push({ mark: visible[i], seq: i });
    }
    located.sort((a, b) => (a.page - b.page) || (a.offset - b.offset) || (a.seq - b.seq));
    rest.sort((a, b) => a.seq - b.seq);
    return located.map((x) => x.mark).concat(rest.map((x) => x.mark));
  })();

  const splitMarks = dock === 'bottom' && !floatingCards.marks;
  const markDetail = splitMarks ? listMarks.find((mark) => mark.id === markDetailId) || listMarks[0] : null;
  const markBadge = (mark) => {
    const isNote = markKind(mark) === 'note';
    return h('span', {
      className: 'elr-mark-badge',
      title: !isNote && mode === 'pdf' && !highlightAnchors(mark).length ? t('mark.reselect') : undefined,
      style: isNote ? undefined : { '--elr-mark-swatch': HIGHLIGHT_COLORS[mark.color]?.dot || HIGHLIGHT_COLORS.yellow.dot },
    }, t(isNote ? 'mark.badgeNote' : 'mark.badgeHl'));
  };
  const setNoteDraft = (id, text) => setInlineNoteDrafts((previous) => {
    const next = new Map(previous);
    if (text === undefined) next.delete(id);
    else next.set(id, text);
    return next;
  });
  const editMarkNote = (mark) => {
    if (!inlineNoteDrafts.has(mark.id)) setNoteDraft(mark.id, mark.note || '');
  };
  const inlineNoteEditor = (mark) => {
    if (!inlineNoteDrafts.has(mark.id)) return null;
    const draft = inlineNoteDrafts.get(mark.id);
    const cancel = () => setNoteDraft(mark.id, undefined);
    return h('form', {
      className: 'elr-note-inline',
      onSubmit: (event) => {
        event.preventDefault();
        if (!draft.trim()) return;
        updateNote(mark.id, draft.trim());
        cancel();
        notify(t('mark.noteSaved'), 'ok');
      },
    },
    h('textarea', {
      autoFocus: true, rows: 4, value: draft, 'aria-label': t('mark.editNote'),
      onChange: (event) => setNoteDraft(mark.id, event.target.value),
      onKeyDown: (event) => {
        if (event.nativeEvent?.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.currentTarget.form.requestSubmit();
        }
      },
    }),
    h('div', { className: 'elr-note-inline-actions' },
      h('button', { type: 'button', className: 'elr-btn', onClick: cancel }, t('mark.cancelEdit')),
      h('button', { type: 'submit', className: 'elr-btn', disabled: !draft.trim() }, t('mark.saveNote'))
    ));
  };
  const markControls = (mark) => {
    const isNote = markKind(mark) === 'note';
    const action = (label, icon, onClick, extraClass = '') => h('button', {
      type: 'button', className: 'elr-card-control' + extraClass, title: t(label), 'aria-label': t(label), onClick,
    }, h('span', { className: icon, 'aria-hidden': true }));
    return [
      action('mark.locate', 'elr-mark-locate-icon', () => jumpToMark(mark)),
      isNote && !inlineNoteDrafts.has(mark.id) ? action('mark.editNote', 'elr-mark-edit-icon', () => editMarkNote(mark)) : null,
      action(isNote ? 'mark.removeNote' : 'mark.removeHl2', 'elr-trash-icon', () => {
        if (inlineNoteDrafts.has(mark.id)) setNoteDraft(mark.id, undefined);
        removeMark(mark.id);
      }, ' elr-remove-control'),
    ];
  };
  const bottomMarkDetails = markDetail ? h('div', { className: 'elr-detail-split' },
    h('div', { ref: marksListRef, className: 'elr-marks-list elr-detail-navigation', 'aria-label': '高亮与批注条目' },
      listMarks.map((mark) => h('button', {
        key: mark.id, type: 'button', title: mark.text, className: 'elr-mark-item elr-mark-select' + (markKind(mark) === 'note' ? ' is-note' : ' is-hl'),
        'aria-pressed': markDetail.id === mark.id, 'aria-controls': markDetailIdForA11y, onClick: () => setMarkDetailId(mark.id),
      }, markBadge(mark), h('span', { className: 'elr-mark-preview' }, mark.text)))
    ),
    h('section', { id: markDetailIdForA11y, key: markDetail.id, className: 'elr-detail-content', 'aria-label': '高亮与批注详情', tabIndex: 0 },
      h('div', { className: 'elr-detail-heading' }, markBadge(markDetail), ...markControls(markDetail)),
      markKind(markDetail) === 'note' && (inlineNoteEditor(markDetail) || h('p', { className: 'elr-note-detail-text' }, markDetail.note || t('mark.notePlaceholder'))),
      h('blockquote', { className: 'elr-note-detail-source' }, markDetail.text)
    )
  ) : null;
  const marksSection = h('div', { className: 'elr-marks' },
    cardHeader('marks', marksOpen),
    h('div', { className: 'elr-card-content elr-card-fold-content', inert: !marksOpen },
      h('div', { className: 'elr-marks-filter', role: 'group', 'aria-label': t('mark.title') },
        ['all', 'hl', 'note'].map((filter) => h('button', {
          key: filter, type: 'button', className: 'elr-seg' + (markFilter === filter ? ' active' : ''),
          'aria-pressed': markFilter === filter, title: t('mark.filter.' + filter), onClick: () => changeMarkFilter(filter),
        }, t('mark.filter.' + filter)))
      ),
      bottomMarkDetails || (listMarks.length ? h('div', { ref: marksListRef, className: 'elr-marks-list' }, listMarks.map((m) => {
        const isNote = markKind(m) === 'note';
        const locate = () => jumpToMark(m);
        return h('article', { key: m.id, className: 'elr-mark-item' + (isNote ? ' is-note' : ' is-hl') },
          h('div', { className: 'elr-mark-row' }, markBadge(m), ...markControls(m)),
          isNote ? (inlineNoteEditor(m) || h('button', { type: 'button', className: 'elr-mark-preview elr-mark-note-preview', title: t('mark.editNote'), onClick: () => editMarkNote(m) },
            h('span', null, m.note || t('mark.notePlaceholder'))
          )) : null,
          h('button', { type: 'button', className: 'elr-mark-preview elr-mark-source', title: t('mark.locate'), onClick: locate },
            h('span', null, m.text)
          )
        );
      })) : h('div', { className: 'elr-marks-empty' }, (marks.length && markFilter !== 'all')
        ? h(EmptyState, {
          size: 'row',
          live: true,
          title: '当前筛选下没有条目',
          primaryAction: { label: '查看全部', onClick: () => changeMarkFilter('all') },
        })
        : h(EmptyState, { size: 'card', icon: 'bookmark', title: '还没有高亮或批注' })))
    )
  );

  const termExplanation = (item, className) => {
    const failed = !item.busy && (item.error || !item.body);
    return h('div', { className: className + ' elr-markdown', tabIndex: 0 },
      item.busy ? h('p', { className: 'elr-terms-busy', role: 'status' }, t('term.runningShort')) : null,
      failed ? h('div', { className: 'elr-term-error' },
        h('p', { role: 'status' }, item.error || t('term.incomplete')),
        h('button', {
          type: 'button', className: 'elr-btn', onClick: () => explainTerm(item.term, item.surrounding),
        }, t('term.retry'))
      ) : null,
      item.body ? renderMarkdown(item.body) : null
    );
  };
  const floatingTerms = Boolean(floatingCards.terms);
  const splitTerms = dock === 'bottom' && !floatingTerms;
  const selectedTerm = splitTerms ? terms.find((item) => item.id === termOpenId) || terms[0] : null;
  const termRemoveButton = (item) => h('button', {
    type: 'button', className: 'elr-card-control elr-remove-control',
    title: t('term.remove'), 'aria-label': t('term.remove') + ' · ' + item.term,
    onClick: () => removeTerm(item.id),
  }, h('span', { className: 'elr-trash-icon', 'aria-hidden': true }));
  const termsList = terms.length ? h('div', {
    ref: termsListRef, className: 'elr-terms-list' + (splitTerms ? ' elr-detail-navigation' : ' elr-card-fold-content'),
    inert: !termsOpen && !splitTerms,
    'aria-label': splitTerms ? '术语列表' : undefined,
  }, terms.map((item) => {
        const open = (splitTerms ? selectedTerm?.id : floatingTerms ? termOpenId : shownTerm?.id) === item.id;
        const failed = !item.busy && (item.error || !item.body);
        const status = item.busy ? t('term.runningShort') : failed ? t('term.incomplete') : '';
        return h('div', { key: item.id, className: 'elr-term-item' + (open ? ' open' : '') },
          h('div', { className: 'elr-term-row' },
            h('button', {
              type: 'button', className: 'elr-term-toggle', 'aria-expanded': splitTerms ? undefined : open,
              'aria-pressed': splitTerms ? open : undefined,
              'aria-haspopup': floatingTerms || splitTerms ? undefined : 'dialog',
              'aria-controls': splitTerms ? termDetailId : !floatingTerms && open ? termBubbleId : undefined,
              title: item.term + ' · ' + (status || t('term.toggle')),
              'aria-label': status ? item.term + ' · ' + status : undefined,
              onClick: (event) => {
                if (splitTerms) setTermOpenId(item.id);
                else if (floatingTerms) setTermOpenId(open ? '' : item.id);
                else if (open) closeTermBubble();
                else setTermBubble({ id: item.id, paper: paperId, anchor: event.currentTarget, keyboard: event.detail === 0 });
              },
            }, status ? h('span', { className: 'elr-term-status-dot' + (failed ? ' is-error' : ''), 'aria-hidden': true }) : null,
            h('span', { className: 'elr-term-name' }, item.term))
          ),
          open && floatingTerms ? h('div', { className: 'elr-term-inline-detail' },
            termRemoveButton(item), termExplanation(item, 'elr-term-body')
          ) : null
        );
  })) : null;
  const termsSection = h('div', { className: 'elr-terms' },
    cardHeader('terms', termsOpen),
    selectedTerm ? h('div', { className: 'elr-detail-split elr-card-fold-content', inert: !termsOpen }, termsList,
      h('section', { key: selectedTerm.id, id: termDetailId, className: 'elr-detail-content elr-term-detail', 'aria-label': '术语详情' },
        h('div', { className: 'elr-detail-heading elr-term-detail-heading' }, h('strong', null, selectedTerm.term), termRemoveButton(selectedTerm)),
        termExplanation(selectedTerm, 'elr-term-body')
      )
    ) : termsList || h('div', { className: 'elr-recent-empty elr-card-fold-content', inert: !termsOpen },
      h(EmptyState, { size: 'card', icon: 'tag', title: '还没有术语记录' })
    )
  );
  const termBubbleNode = shownTerm ? createPortal(h('div', {
    ref: termBubbleRef, id: termBubbleId, className: 'elr-term-popover' + toneCls,
    role: 'dialog', 'aria-label': shownTerm.term, tabIndex: -1,
  },
    h('div', { className: 'elr-term-popover-surface' },
      h('div', { className: 'elr-term-popover-head' },
        h('strong', { title: shownTerm.term }, shownTerm.term),
        h('div', { className: 'elr-term-popover-actions' },
          termRemoveButton(shownTerm),
          h('button', {
            type: 'button', className: 'elr-card-control elr-card-x', title: t('close'), 'aria-label': t('close'),
            onClick: () => closeTermBubble(true),
          })
        )
      ),
      termExplanation(shownTerm, 'elr-term-popover-body')
    )
  ), floatingHost) : null;

  // (#2) Upper side sections scroll in their own box; the analysis/translation
  // area below is a flex column whose .elr-out always keeps its own scrollbar.
  // (v8 #7) The three sections below the selection card are reorderable: the
  // grip in each header starts an HTML5 drag and the drop target decides where
  // the section lands. The resulting order is persisted in `sectionOrder`.
  // (v27) Only ENABLED cards are rendered, and the ⚙ in this header is the
  // manager that enables them again — a card closed years ago is always one
  // click away, which is the whole point of having a manager instead of only
  // the × on each card.
  const activeCardKeys = CARD_KEYS.filter((key) => enabledCards.indexOf(key) !== -1);
  const inactiveCardKeys = CARD_KEYS.filter((key) => enabledCards.indexOf(key) === -1);
  const renderCardTile = (key, on) => h('button', {
    key,
    type: 'button',
    className: 'elr-card-tile ' + (on ? 'is-on' : 'is-off'),
    'aria-pressed': on,
    onPointerDown: !on ? beginMenuCardDrag(key) : undefined,
    onClick: (e) => {
      e.stopPropagation();
      if (menuDragJustEndedRef.current) return;
      setCardEnabled(key, !on);
    },
  },
    h('div', { className: 'elr-card-tile-top' },
      h('span', { className: 'elr-card-tile-name' }, cardLabel(key)),
      on && floatingCards[key] ? h('span', { className: 'elr-card-tile-float' }, '悬浮中') : null,
      h('span', { className: 'elr-card-tile-state', 'aria-hidden': true }, on ? '✓' : '+')
    ),
    h('span', { className: 'elr-card-tile-desc' }, cardDesc(key))
  );
  const cardMenu = cardMenuOpen && hasPaper
    ? createPortal(h('div', {
      ref: cardMenuRef, className: 'elr-card-menu' + toneCls,
      role: 'dialog', 'aria-label': t('card.manage'),
    },
      h('div', { className: 'elr-card-menu-head' },
        h('div', { className: 'elr-card-menu-title-wrap' },
          h('span', { className: 'elr-card-menu-title' }, t('card.manage')),
          h('span', { className: 'elr-card-menu-count' }, '已启用 ' + activeCardKeys.length + ' / ' + CARD_KEYS.length)
        ),
        h('button', { type: 'button', className: 'elr-btn elr-card-menu-reset', onClick: resetCardLayout }, t('card.resetLayout'))
      ),
      h('div', { className: 'elr-card-menu-section' },
        h('div', { className: 'elr-card-menu-section-head' },
          h('span', null, '已启用的卡片'),
          h('span', { className: 'elr-card-menu-section-badge' }, String(activeCardKeys.length))
        ),
        activeCardKeys.length
          ? h('div', { className: 'elr-card-menu-grid' }, activeCardKeys.map((key) => renderCardTile(key, true)))
          : h('div', { className: 'elr-card-menu-empty' }, '暂无已启用的卡片，点击下方卡片即可添加。')
      ),
      h('div', { className: 'elr-card-menu-section' },
        h('div', { className: 'elr-card-menu-section-head' },
          h('span', null, '未启用的卡片'),
          h('span', { className: 'elr-card-menu-section-badge' }, String(inactiveCardKeys.length))
        ),
        inactiveCardKeys.length
          ? h('div', { className: 'elr-card-menu-grid' }, inactiveCardKeys.map((key) => renderCardTile(key, false)))
          : h('div', { className: 'elr-card-menu-empty' }, '全部功能卡片均已启用。')
      )
    ), floatingHost)
    : null;

  const analysisCard = (key, panel, actions) => h('div', { className: 'elr-analysis-card-inner' },
    cardHeader(key, analysisOpen[key]),
    h('div', { className: 'elr-analysis-card-body elr-card-fold-content', inert: !analysisOpen[key] }, actions, panel)
  );
  const agentPanel = mode === 'pdf' && paperId ? h(AgentPanel, {
    key: paperId, active: true, paper: paperId, page: pageNum, ready: pdfAnalysisReady,
    incoming: agentQuote, readPages: readAgentPages, onJump: jumpAgentSource,
    providers: activeCatalog?.providers, defaultModel: modelBody(), modelPreference: agentModel,
    onModelChange: setAgentModel, onModelSettings: openModelSettings,
    renderAnswer: (answer, source) => renderMarkdown(answer, (inline) => renderInline(inline, source)),
  }) : h('div', { className: 'elr-out elr-out-empty' }, '请先打开 PDF。');
  const saveAlbumConfig = React.useCallback((nextFolder, nextImages) => {
    writeShared({ albumFolder: nextFolder, albumImages: nextImages });
  }, []);
  const saveAmbientConfig = React.useCallback((patch) => {
    writeShared(patch);
  }, []);
  const albumCard = h(AlbumCard, {
    folder: albumFolder,
    selectedImages: albumImages,
    intervalSec: albumIntervalSec,
    order: albumOrderMode,
    transition: albumTransitionMode,
    open: albumOpen,
    floatingHost,
    toneCls,
    header: cardHeader('album', albumOpen),
    onSaveAlbum: saveAlbumConfig,
    onContextMenu: (event) => {
      event.preventDefault();
      setCardContext({ key: 'album', open: albumOpen, anchor: event.currentTarget, x: event.clientX, y: event.clientY });
    },
  });
  const ambientCard = h(AmbientCard, {
    folder: ambientFolder,
    track: ambientTrack,
    mix: ambientMix,
    playMode: ambientMode,
    volume: ambientVolume,
    presets: ambientPresets,
    open: ambientOpen,
    header: cardHeader('ambient', ambientOpen),
    onUpdate: saveAmbientConfig,
  });
  const moveFloatingClock = React.useCallback((nextX, nextY) => {
    const state = readShared();
    const prev = state.floatingCards?.clock;
    if (!prev) return;
    writeShared({ floatingCards: { ...state.floatingCards, clock: { ...prev, x: nextX, y: nextY } } });
  }, []);
  const clockCard = h(ClockCard, {
    styleMode: clockStyle,
    use24h: clock24h,
    showSeconds: clockShowSeconds,
    open: clockOpen,
    isFloating: Boolean(floatingCards.clock),
    header: cardHeader('clock', clockOpen),
    onUpdate: saveAmbientConfig,
    onMoveFloating: moveFloatingClock,
  });
  const cardNodes = {
    selection: selCard, recent: recentSection, terms: termsSection, marks: marksSection,
    summary: analysisCard('summary', summaryPanel, summaryActions),
    references: analysisCard('references', referencesPanel, referencesActions),
    figure: analysisCard('figure', figurePanel),
    agent: analysisCard('agent', agentPanel),
    album: albumCard,
    ambient: ambientCard,
    clock: clockCard,
  };
  const openCards = {
    selection: selectionCardOpen, recent: recentOpen, marks: marksOpen, terms: termsOpen,
    summary: analysisOpen.summary, references: analysisOpen.references,
    figure: analysisOpen.figure, agent: analysisOpen.agent,
    album: albumOpen,
    ambient: ambientOpen,
    clock: clockOpen,
  };
  const compactCards = {
    selection: !hasSelectionDraft && !selection && !selectionResult && !selectionBusy,
    recent: !recent.length,
    terms: !terms.length,
    marks: !listMarks.length,
    summary: !summary && !summaryDetail?.draft && !summaryDetail?.error && !summaryIssue && !summaryBusy && !pdfTextBusy,
    references: !references.length && !referencesBusy && !pdfTextBusy,
    figure: !figureEntries.length && !figureStatus,
    agent: mode !== 'pdf' || !paperId,
    album: false,
    ambient: false,
    clock: false,
  };
  const dockedCards = functionCardOrder(sectionOrder).filter((key) => enabledCards.includes(key) && !floatingCards[key]);
  const floatingCardNodes = hasPaper && ownsCardWindows ? enabledCards.filter((key) => floatingCards[key]).map((key) => {
    const open = openCards[key];
    const savedBox = floatingCards[key];
    const minWidth = key === 'clock' ? 248 : 220;
    let minHeight = 130;
    if (key === 'selection') minHeight = CARD_MIN_H;
    else if (key === 'marks') minHeight = MARKS_CARD_MIN_H;
    else if (key === 'agent') minHeight = AGENT_CARD_MIN_H;
    else if (key === 'clock') minHeight = clockStyle === 'analog' ? 276 : 228;
    const box = placeFunctionCard({ ...savedBox, w: Math.max(minWidth, savedBox.w), h: Math.max(minHeight, savedBox.h) }, open, floatingBounds);
    const saveSize = (patch, edge) => setFloatingCards((previous) => {
      const saved = previous[key];
      if (!saved) return previous;
      const next = { ...saved, x: patch.x, y: patch.y };
      if (edge.includes('e') || edge.includes('w')) next.w = patch.w;
      if (edge.includes('n') || edge.includes('s')) next.h = patch.h;
      return { ...previous, [key]: next };
    });
    return createPortal(h('div', {
      className: 'elr-sec elr-floating-card' + toneCls + (frontCard === key ? ' is-front' : '')
        + (open ? ' is-open' : ' is-collapsed')
        + (ghost?.key === key ? ' dragging' : '')
        + (comparison ? ' is-compare-hidden' : ''),
      'data-elr-floating-card': key,
      'aria-hidden': comparison || undefined,
      inert: comparison,
      style: { left: box.x, top: box.y, width: box.w, height: box.h, '--elr-card-font-adjust': cardFontAdjust },
      onPointerDownCapture: () => setFrontCard(key),
      onFocus: () => setFrontCard(key),
    }, cardNodes[key], resizeHandles(saveSize, minWidth, minHeight, popupViewport, {
      edges: open ? RESIZE_EDGES : ['e', 'w'], cancelRef: cardGestureCancelRef, title: t('card.floatResize'),
    })), floatingHost, key);
  }) : [];

  const renderDockCard = (key, column, ripple = null) => {
        const collapsed = !openCards[key];
        const compact = Boolean(compactCards[key]);
        const dragging = ghost?.key === key;
        const baseStyle = dock === 'bottom'
          ? ((!collapsed && !compact && cardWidths[key]) ? { width: cardWidths[key] } : {})
          : ((!collapsed && !compact && cardHeights[key]) ? { height: Math.min(cardHeights[key], cardMaxHeight), flex: '0 0 auto' } : {});
        const rippleStyle = ripple ? {
          '--elr-ripple-x': (dock === 'bottom' ? ripple.shift : 0) + 'px',
          '--elr-ripple-y': (dock === 'bottom' ? 0 : ripple.shift) + 'px',
          '--elr-ripple-delay': ripple.delay + 'ms',
        } : null;
        const combinedStyle = rippleStyle ? { ...baseStyle, ...rippleStyle } : (Object.keys(baseStyle).length ? baseStyle : undefined);
        return h('div', {
          key,
          'data-elr-docked-card': key,
          'data-feature-column': String(column),
          className: 'elr-sec'
            + (collapsed ? ' is-collapsed' : '')
            + (compact ? ' is-compact' : '')
            + (dragging ? ' dragging' : ''),
          style: combinedStyle,
        }, cardNodes[key],
          // Bottom-docked cards with content can be resized horizontally.
          (dock === 'bottom' && !collapsed && !compact) ? h('div', {
            className: 'elr-card-rz is-right',
            draggable: false,
            title: t('card.resize'),
            onPointerDown: beginCardResize(key, 1),
            onDragStart: (e) => { e.preventDefault(); e.stopPropagation(); },
          }) : null,
          (dock === 'bottom' && !collapsed && !compact) ? h('div', {
            className: 'elr-card-rz is-left',
            draggable: false,
            title: t('card.resize'),
            onPointerDown: beginCardResize(key, -1),
            onDragStart: (e) => { e.preventDefault(); e.stopPropagation(); },
          }) : null,
          // (v38 #1) The BOTTOM edge, only where stacking makes a per-card
          // height meaningful (the right dock). In the bottom dock the cards sit
          // in a row whose height is the row's, so a per-card height there would
          // just be a taller box with the same content — hence no grip.
          //
          // A COLLAPSED card gets no grip either: it is header-only, and the
          // stored height is deliberately not applied to it, so dragging here
          // would move a handle that visibly changes nothing.
          (dock !== 'bottom' && !collapsed && !compact) ? h('div', {
            className: 'elr-card-rz is-bottom',
            draggable: false,
            title: t('card.resizeH'),
            onPointerDown: beginCardHeightResize(key),
            // Double-click drops the pin, so the card returns to the even share
            // instead of keeping a stale pixel height forever.
            onDoubleClick: () => {
              setCardHeights((prev) => {
                const next = Object.assign({}, prev);
                delete next[key];
                return next;
              });
            },
            onDragStart: (e) => { e.preventDefault(); e.stopPropagation(); },
          }) : null
        );
  };

  const allDockedCardsCollapsed = dockedCards.length > 0 && dockedCards.every((key) => !openCards[key]);
  const bulkCardLabel = allDockedCardsCollapsed ? '展开所有卡片' : '缩小所有卡片';
  const otherDock = dock === 'bottom' ? 'right' : 'bottom';
  const switchDockLabel = otherDock === 'bottom' ? '切换到页面下方' : ('切换到页面' + (sideDock === 'left' ? '左侧' : '右侧'));
  const columnCount = dualColumns ? 2 : 1;
  const cardColumns = Array.from({ length: columnCount }, () => []);
  const workspaceCards = dockedCards.map((key, index) => {
    const savedColumn = Number(featureCardColumns?.[key]);
    const column = columnCount === 2 && (savedColumn === 0 || savedColumn === 1) ? savedColumn : index % columnCount;
    return { key, column };
  });
  const visibleIndexByCol = Array.from({ length: columnCount }, () => 0);
  workspaceCards.forEach(({ column, key }) => {
    const list = cardColumns[column];
    const isDragging = ghost?.key === key;
    let ripple = null;
    if (!isDragging) {
      const idx = visibleIndexByCol[column];
      visibleIndexByCol[column] = idx + 1;
      if (cardDrop && !cardDrop.origin && cardDrop.column === column) {
        const beforeLine = idx < cardDrop.gapIndex;
        const n = beforeLine ? (cardDrop.gapIndex - 1 - idx) : (idx - cardDrop.gapIndex);
        const dir = beforeLine ? -1 : 1;
        ripple = { shift: Number((dir * 8 * Math.pow(0.7, n)).toFixed(2)), delay: 24 * n };
      }
    }
    list.push(renderDockCard(key, column, ripple));
  });
  const sideTop = h('div', {
    ref: sideTopElRef,
    className: 'elr-side-top elr-feature-workspace' + (ghost ? ' drag-active' : '') + (cardDrop ? ' elr-card-dock-target' : ''),
  },
    h('div', { className: 'elr-col-head elr-card-head elr-workspace-head' },
      h('span', null, t('cards.title')),
      h('button', { type: 'button', className: 'elr-card-control', 'data-tour': 'dock', title: switchDockLabel, 'aria-label': switchDockLabel, onClick: () => setDock(otherDock) }, readerIcon(otherDock === 'right' ? 'dockRight' : 'dockBottom', 20, sideDock === 'left')),
      dock === 'right' ? h('button', { type: 'button', className: 'elr-card-control', 'data-tour': 'columns', title: columnCount === 1 ? '切换为两列' : '切换为一列', 'aria-label': columnCount === 1 ? '切换为两列' : '切换为一列', onClick: () => setFeatureColumns(columnCount === 1 ? 2 : 1) }, h(LayoutIcon, { name: columnCount === 1 ? 'workspaceTwoColumns' : 'workspaceOneColumn' })) : null,
      h('button', { type: 'button', className: 'elr-card-control', 'data-tour': 'font', title: '卡片字号', 'aria-label': '卡片字号',
        'aria-haspopup': 'dialog', popoverTarget: cardFontMenuId }, readerIcon('font')),
      h('div', { id: cardFontMenuId, className: 'elr-reader-options elr-card-font-menu', role: 'dialog', 'aria-label': '卡片字号', popover: 'auto' },
        h('label', null,
          h('span', null, '卡片字号'),
          h('output', null, cardFontSize + ' px'),
          h('input', { type: 'range', min: CARD_FONT_MIN, max: CARD_FONT_MAX, step: 1, value: cardFontSize,
            'aria-label': '字号', 'aria-valuetext': cardFontSize + ' 像素', onChange: (event) => setCardFont(Number(event.target.value)) })
        ),
        h('button', { type: 'button', className: 'elr-btn', disabled: cardFontSize === CARD_FONT_DEFAULT,
          onClick: () => setCardFont(CARD_FONT_DEFAULT) }, '恢复默认')
      ),
      h('button', { type: 'button', className: 'elr-card-control', 'data-tour': 'theme', title: '主题配色', 'aria-label': '主题配色',
        'aria-haspopup': 'dialog', popoverTarget: themeMenuId }, readerIcon('palette')),
      h('div', { id: themeMenuId, className: 'elr-reader-options elr-theme-menu', role: 'dialog', 'aria-label': '主题配色', popover: 'auto' },
        h('div', { className: 'elr-theme-menu-group' },
          h('div', { className: 'elr-theme-menu-label' }, t('theme.label')),
          h('div', { className: 'elr-theme-menu-sublabel' }, t('theme.light')),
          h('div', { className: 'elr-theme-chip-grid' },
            LIGHT_PAGE_THEMES.map((key) => h('button', {
              key,
              type: 'button',
              className: 'elr-theme-chip',
              disabled: !hasPdf,
              'aria-pressed': theme === key,
              onClick: () => setTheme(key),
            }, h('span', { className: 'elr-theme-swatch', 'aria-hidden': true, style: { '--elr-swatch': PAGE_THEME_SWATCHES[key] } }), t('theme.' + key)))
          ),
          h('div', { className: 'elr-theme-menu-sublabel' }, t('theme.dark')),
          h('div', { className: 'elr-theme-chip-grid' },
            DARK_PAGE_THEMES.map((key) => h('button', {
              key,
              type: 'button',
              className: 'elr-theme-chip',
              disabled: !hasPdf,
              'aria-pressed': theme === key,
              onClick: () => setTheme(key),
            }, h('span', { className: 'elr-theme-swatch', 'aria-hidden': true, style: { '--elr-swatch': PAGE_THEME_SWATCHES[key] } }), t('theme.' + key)))
          )
        ),
        h('div', { className: 'elr-theme-menu-group' },
          h('div', { className: 'elr-theme-menu-label' }, t('tone.label')),
          Object.entries(UI_TONES).map(([group, tones]) => h(React.Fragment, { key: group },
            h('div', { className: 'elr-theme-menu-sublabel' }, t('tone.' + group)),
            h('div', { className: 'elr-theme-chip-grid' },
              tones.map((tone) => h('button', {
                key: tone,
                type: 'button',
                className: 'elr-theme-chip',
                'aria-pressed': uiTone === tone,
                onClick: () => setUiTone(tone),
              }, h('span', { className: 'elr-theme-swatch', 'aria-hidden': true, style: { '--elr-swatch': UI_TONE_SWATCHES[tone] } }), t('tone.' + tone)))
            )
          ))
        ),
        h('div', { className: 'elr-theme-menu-group' },
          h('div', { className: 'elr-theme-menu-label' }, 'Bing 每日壁纸'),
          h('div', { className: 'elr-theme-chip-grid' },
            h('button', {
              type: 'button',
              className: 'elr-theme-chip',
              'aria-pressed': Boolean(bingWallpaperEnabled),
              onClick: () => setBingWallpaperEnabled(!bingWallpaperEnabled),
            }, bingWallpaperEnabled ? 'Bing 壁纸：已开启' : '开启 Bing 每日壁纸'),
            bingWallpaperEnabled && bingWallpaper.activeItem && h('button', {
              type: 'button',
              className: 'elr-theme-chip',
              'aria-pressed': isBingFavorited(bingWallpaper.activeItem, bingWallpaper.favorites),
              onClick: () => { toggleBingFavorite(bingWallpaper.activeItem).catch(() => {}); },
            }, isBingFavorited(bingWallpaper.activeItem, bingWallpaper.favorites) ? '★ 已收藏' : '☆ 收藏并下载'),
            openModelSettings && h('button', {
              type: 'button',
              className: 'elr-theme-chip',
              onClick: () => {
                document.getElementById(themeMenuId)?.hidePopover?.();
                openModelSettings({ tab: 'display', section: 'bing-wallpaper' });
              },
            }, '壁纸与历史…')
          )
        )
      ),
      h('span', { className: 'elr-spacer' }),
      h('button', { type: 'button', className: 'elr-card-control', 'data-tour': 'bulk',
        title: bulkCardLabel, 'aria-label': bulkCardLabel, disabled: !dockedCards.length,
        onClick: () => setDockedCardsOpen(allDockedCardsCollapsed),
      }, readerIcon(allDockedCardsCollapsed ? 'expand' : 'collapse')),
      h('button', { type: 'button', className: 'elr-card-control', 'data-tour': 'layout', title: '卡片布局',
        'aria-label': '卡片布局', 'aria-haspopup': 'dialog', popoverTarget: layoutMenuId,
      }, readerIcon('layout')),
      h('div', { ref: layoutMenuRef, id: layoutMenuId, className: 'elr-reader-options elr-card-layout-menu',
        role: 'dialog', 'aria-label': '卡片布局', popover: 'auto',
        onToggle: (event) => { if (event.newState === 'closed') setLayoutLimitReached(false); },
      },
      h('button', { type: 'button', className: 'elr-btn', onClick: () => applyCardLayout(DEFAULT_SHARED) }, '默认布局'),
      customCardLayouts.map((preset, slot) => {
        if (!preset) return null;
        const label = '自定义布局 ' + (slot + 1);
        return h('div', { className: 'elr-card-layout-row', key: slot },
          h('button', { type: 'button', className: 'elr-btn', onClick: () => applyCardLayout(preset) }, label),
          h('button', { type: 'button', className: 'elr-btn elr-layout-delete', title: '删除' + label,
            'aria-label': '删除' + label, onClick: () => deleteCardLayout(slot),
          }, h('span', { className: 'elr-trash-icon', 'aria-hidden': true }))
        );
      }),
      h('button', { type: 'button', className: 'elr-btn elr-save-layout', onClick: saveCardLayout }, '保存布局'),
      layoutLimitReached ? h('div', { className: 'elr-card-layout-limit', role: 'status' }, '自定义布局已达上限（3 个）。') : null
      ),
      h('button', { type: 'button', ref: cardMenuButtonRef, className: 'elr-card-control' + (cardMenuOpen ? ' active' : ''), 'data-tour': 'manage', title: t('card.manage'), 'aria-label': t('card.manage'), 'aria-haspopup': 'dialog', 'aria-expanded': cardMenuOpen, onClick: (e) => { e.stopPropagation(); setCardMenuOpen((v) => !v); } }, readerIcon('settings')),
      h('button', { type: 'button', ref: workspaceCloseRef, className: 'elr-card-control', 'data-tour': 'stow',
        title: t('cards.stow'), 'aria-label': t('cards.stow'), 'aria-controls': workspaceId, onClick: toggleWorkspace,
      }, readerIcon(dock === 'bottom' ? 'stowBottom' : 'stowRight', 20, isLeftSide))
    ),
    h('div', { className: 'elr-side-body elr-feature-grid', 'data-columns': String(columnCount),
      style: { '--elr-card-max-height': cardMaxHeight + 'px', '--elr-card-font-adjust': cardFontAdjust },
    },
      cardColumns.map((items, index) => h('div', { className: 'elr-feature-column', key: index, 'data-feature-column': String(index) }, items)),
      !dockedCards.length ? h('div', { className: 'elr-card-none' }, h(EmptyState, {
        size: 'page',
        wireframe: 'workspace',
        title: enabledCards.length ? '停靠区暂无卡片' : '没有显示的功能卡片',
        description: '开启需要的阅读工具卡片，或将悬浮卡片拖回此处。',
        primaryAction: { label: '管理卡片', onClick: (e) => { e.stopPropagation(); setCardMenuOpen(true); } },
      })) : null
    )
  );

  const side = h('div', {
    ref: sideElRef, id: workspaceId,
    className: 'elr-side' + (workspaceStowed ? ' is-stowed' : ''),
    inert: workspaceStowed,
    'data-dual-columns': dualColumns || undefined,
    style: dock === 'bottom' ? { height: sideHeight } : { width: dualColumns ? dualSideWidth : sideWidth },
  }, sideTop);

  const resizer = h('div', {
    ref: resizeRef,
    className: 'elr-divider elr-resizer' + (dock === 'bottom' ? ' axis-row' : ''),
    role: 'separator',
    tabIndex: 0,
    'aria-orientation': dock === 'bottom' ? 'horizontal' : 'vertical',
    'aria-label': t('resize.panes'),
    title: t('resize.panes'),
  });

  // (v19 #1) The popup has TWO independently grippable inner boxes. `flex-grow`
  // weights are used instead of pixel heights so that resizing the outer card
  // stretches BOTH of them (their ratio stays, their sizes grow), while the grip
  // under either box only rebalances the ratio.
  const popupOW = Math.max(0.15, Number(popup && popup.ow) || 1);
  const popupRW = Math.max(0.15, Number(popup && popup.rw) || 1);
  const rebalance = (selfKey, otherKey, sign, horizontal = false) => (e) => {
    if (e.button !== 0) return;
    const grip = e.currentTarget;
    const body = grip && grip.closest ? grip.closest('.elr-popup-body') : null;
    const total = body ? (horizontal ? body.clientWidth : body.clientHeight) : 0;
    if (!total) return;
    const axis = horizontal ? 'clientX' : 'clientY';
    const start = e[axis];
    const w0 = selfKey === 'ow' ? popupOW : popupRW;
    const w1 = otherKey === 'rw' ? popupRW : popupOW;
    const sum = w0 + w1;
    // (v34 #2) Rebalancing used to call `setPopup` on every pointermove, i.e. a
    // full re-render of the reader (PDF view, cards, portals) per event. The two
    // blocks are flex children, so while dragging the weights are written
    // straight onto them and React only hears about the final ratio.
    const block = (key) => body.querySelector(key === 'ow' ? '.elr-popup-block-original' : '.elr-popup-block-result');
    const selfEl = block(selfKey);
    const otherEl = block(otherKey);
    let pending = w0;
    const painter = frameWriter((next) => {
      if (selfEl && selfEl.style) selfEl.style.flexGrow = String(next);
      if (otherEl && otherEl.style) otherEl.style.flexGrow = String(Math.max(0.15, sum - next));
    });
    const apply = (next) => {
      pending = next;
      painter.push(next);
    };
    const move = (ev) => {
      const distance = (ev[axis] - start) * sign;
      // Pixel change of THIS box, expressed back in flex-weight units.
      apply(Math.min(sum - .15, Math.max(.15, w0 + (distance * sum) / Math.max(40, total))));
    };
    const finish = (commit) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      painter.cancel();
      gestureEnd();
      if (commit) setPopup((prev) => prev ? { ...prev, [selfKey]: pending, [otherKey]: sum - pending } : prev);
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    gestureStart();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    e.preventDefault();
    e.stopPropagation();
  };

  const startTranslationDrag = (event) => {
    if (event.button !== 0 || event.isPrimary === false || event.target?.closest?.('button')) return;
    const handle = event.currentTarget;
    const card = handle.parentElement;
    const origin = card.getBoundingClientRect();
    const bounds = popupViewport();
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const positionAt = (ev) => ({
      x: clampPopup(origin.left + ev.clientX - startX, bounds.left, bounds.right - origin.width),
      y: clampPopup(origin.top + ev.clientY - startY, bounds.top, bounds.bottom - origin.height),
    });
    const painter = frameWriter(({ x, y }) => {
      card.style.transform = 'translate3d(' + (x - origin.left) + 'px,' + (y - origin.top) + 'px,0)';
    });
    const move = (ev) => {
      if (ev.pointerId === pointerId) painter.push(positionAt(ev));
    };
    const finish = (position) => {
      if (popupDragCancelRef.current !== cancel) return;
      popupDragCancelRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', cancel);
      handle.removeEventListener('lostpointercapture', onCancel);
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
      painter.cancel();
      if (position) {
        card.style.left = position.x + 'px';
        card.style.top = position.y + 'px';
        setPopup((previous) => previous && { ...previous, ...position, followsSelection: false });
      }
      card.style.transform = '';
      card.style.willChange = '';
    };
    const cancel = () => finish(null);
    const onCancel = (ev) => { if (ev.pointerId === pointerId) cancel(); };
    const up = (ev) => { if (ev.pointerId === pointerId) finish(positionAt(ev)); };
    popupDragCancelRef.current?.();
    popupDragCancelRef.current = cancel;
    card.style.willChange = 'transform';
    try { handle.setPointerCapture(pointerId); } catch (_) {}
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', cancel);
    handle.addEventListener('lostpointercapture', onCancel);
    event.preventDefault();
    event.stopPropagation();
  };

  const selectionToolNode = mode === 'pdf' && selectionTools ? createPortal((() => {
    const { rect, text, position, anchors } = selectionTools;
    const finishMark = (action) => {
      action();
      window.getSelection()?.removeAllRanges();
      dismissSelectionSurfaces();
    };
    const actionButton = (icon, label, onClick, attributes) => h('button', {
      ...attributes, type: 'button', title: label, 'aria-label': label, onClick,
    }, readerIcon(icon, 18));
    return h('div', {
      className: 'elr-selection-tools' + toneCls, role: 'toolbar', 'aria-label': t('selection.tools'),
      style: { left: position.x, top: position.y, width: position.w },
      onMouseDown: (event) => event.preventDefault(),
      onKeyDown: (event) => {
        const step = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[event.key];
        if (step === undefined) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll('button:enabled'));
        const index = buttons.indexOf(event.target);
        const next = buttons[clampPopup(index + step, 0, buttons.length - 1)];
        event.preventDefault();
        next?.focus();
      },
    },
      ...Object.entries(HIGHLIGHT_COLORS).map(([color, palette]) => h('button', {
        key: color, type: 'button', className: 'elr-selection-swatch',
        title: t('mark.color.' + color), 'aria-label': t('mark.color.' + color),
        style: { '--elr-swatch': palette.dot },
        onClick: () => finishMark(() => addHighlight(text, color, anchors)),
      }, h('span', { 'aria-hidden': true }))),
      h('span', { className: 'elr-selection-divider', 'aria-hidden': true }),
      actionButton('note', t('mark.badgeNote'), (event) => {
        const trigger = { rect: event.currentTarget.getBoundingClientRect(), keyboard: !event.detail };
        if (noteBubbleRef.current && (noteBubbleRef.current.sourceRange === selectionTools.range || noteBubbleRef.current.anchorRange === selectionTools.range)) {
          const node = noteBubbleElement.current;
          if (node) noteBubbleMotion.current = animateSelectionSurface(node, trigger.rect, trigger.keyboard, true, noteBubbleMotion.current);
          closeNoteBubble();
          return;
        }
        noteBubbleTrigger.current = trigger;
        addNote(text, rect, selectionTools);
      }, { 'aria-pressed': Boolean(noteBubble && (noteBubble.sourceRange === selectionTools.range || noteBubble.anchorRange === selectionTools.range)) }),
      actionButton('translate', t('selection.inline'), (event) => {
        const enabled = !popupOn;
        const trigger = { rect: event.currentTarget.getBoundingClientRect(), keyboard: !event.detail };
        setPopupOn(enabled);
        if (!enabled) {
          const node = selectionPopupElement.current;
          if (node) selectionPopupMotion.current = animateSelectionSurface(node, trigger.rect, trigger.keyboard, true, selectionPopupMotion.current);
          closeTranslationPopup();
          return;
        }
        selectionPopupTrigger.current = trigger;
        const { selectionEdit: draft, selectionResult: result } = readShared();
        const nextPosition = openSelectionTranslation(rect, draft, result);
        setSelectionTools({ ...selectionTools, position: nextPosition });
      }, { 'aria-pressed': popupOn, disabled: Boolean(noteBubble) }),
      actionButton('term', t('term.explain'), () => {
        if (text.length > MAX_TERM_CHARS) { notify(t('term.selectShort'), 'warn'); return; }
        explainTerm(text, '', anchors);
      }),
      actionButton('agent', t('selection.quoteAgent'), () => addAgentSelection(selectionTools), { disabled: !pdfAnalysisReady })
    );
  })(), floatingHost) : null;

  const popupNode = popup ? createPortal(
    h('div', {
      className: 'elr-popup elr-resizable' + (popupHorizontal ? ' is-side-by-side' : '')
        + (selectionPopupTransparent === false ? ' is-frosted-blocks' : '')
        + (scheme === 'dark' ? ' elr-popup-dark' : '') + toneCls,
      ref: selectionPopupElement,
      'data-selection-anchored': popup.followsSelection || undefined,
      onPointerDownCapture: () => selectionPopupMotion.current?.cancel(),
      onFocusCapture: () => selectionPopupMotion.current?.cancel(),
      style: { left: popup.x, top: popup.y, width: popup.w, height: popup.h, fontSize: popupFont + 'px' },
      'aria-keyshortcuts': 'Escape',
    },
      h('div', { className: 'elr-popup-head', onPointerDown: popup.followsSelection ? undefined : startTranslationDrag },
        h('span', { className: 'elr-launcher-dot' }),
        h('span', { title: t('popup.dismissHint') }, t('popup.title')),
        h('span', { className: 'elr-spacer' }),
        h('button', {
          type: 'button', className: 'elr-card-control elr-inline-control elr-popup-original-toggle',
          title: popupOriginalVisible ? '隐藏英文原文' : '显示英文原文',
          'aria-label': popupOriginalVisible ? '隐藏英文原文' : '显示英文原文',
          'aria-pressed': popupOriginalVisible,
          onClick: () => setPopupShowOriginal(!popupOriginalVisible),
        }, '原文'),
        h('button', {
          type: 'button', className: 'elr-card-control elr-inline-control elr-popup-translate-btn',
          title: t(selectionBusy ? 'selection.working' : selectionResult ? 'popup.retranslate' : 'popup.translate'),
          'aria-label': t(selectionResult ? 'popup.retranslate' : 'popup.translate'), 'aria-busy': selectionBusy,
          disabled: selectionBusy || !hasSelectionDraft,
          onClick: () => translateRef.current(),
        }, '译'),
        // (v14 #2) Explicit font-size controls. They must NOT start a drag.
        h('button', {
          type: 'button', className: 'elr-card-control elr-inline-control', title: t('popup.fontDec'), 'aria-label': t('popup.fontDec'),
          disabled: popupFont <= POPUP_FONT_MIN,
          onClick: () => changePopupFont(-1),
        }, readerIcon('fontMinus')),
        h('button', {
          type: 'button', className: 'elr-card-control elr-inline-control', title: t('popup.fontInc'), 'aria-label': t('popup.fontInc'),
          disabled: popupFont >= POPUP_FONT_MAX,
          onClick: () => changePopupFont(1),
        }, readerIcon('fontPlus')),
        h('button', {
          type: 'button', className: 'elr-card-control elr-inline-control elr-popup-layout-toggle',
          title: t(popupHorizontal ? 'popup.stack' : 'popup.columns'),
          'aria-label': t(popupHorizontal ? 'popup.stack' : 'popup.columns'),
          'aria-pressed': popupHorizontal,
          disabled: !popupOriginalVisible,
          onClick: () => setPopupLayout(popupHorizontal ? 'stacked' : 'side-by-side'),
        }, h(LayoutIcon, { name: popupHorizontal ? 'popupRows' : 'popupColumns' }))
      ),
      // (v15 #1/#2) Two visually distinct cards. The English original is a
      // controlled <textarea>, and 翻译 re-runs the translation with the
      // corrected text (rect === null keeps the card where the user dragged it).
      // (v17 #1) Both boxes carry their own native `resize: vertical` handle, so
      // the English height and the Chinese height are set INDEPENDENTLY.
      // (v17 #3) A fresh selection only fills the English box (`pending`); the
      // Chinese box shows a hint until 翻译 is pressed.
      // (v18 #4/#5) The textarea is bound to the SHARED `selectionEdit`, and the
      // result to `selectionResult`: the inline card and the side column edit the
      // very same state, so typing in either place changes both, and a
      // translation started here also shows up in the side column.
      h('div', { className: 'elr-popup-body' },
        popupOriginalVisible && h('div', {
          className: 'elr-popup-block elr-popup-block-original',
          style: { flexGrow: popupOW, flexShrink: 1, flexBasis: 0 },
        },
          h('div', { className: 'elr-popup-original-head' },
            h('label', { className: 'elr-popup-label', htmlFor: selectionHintId + '-original' }, t('popup.original')),
            h('span', { className: 'elr-selection-hint', id: selectionHintId + '-popup' }, t('selection.appendHint'))
          ),
          h('textarea', {
            className: 'elr-popup-textarea',
            id: selectionHintId + '-original', 'aria-describedby': selectionHintId + '-popup',
            value: selectionEdit || '',
            spellCheck: false,
            onChange: (e) => setSelectionEdit(e.target.value),
          }),
          // (v19 #1) Drag DOWN to make the English box taller.
          !popupHorizontal && h('div', { className: 'elr-popup-grip', title: t('box.editHint'), onPointerDown: rebalance('ow', 'rw', 1) })
        ),
        popupOriginalVisible && popupHorizontal && h('div', { className: 'elr-popup-column-grip', title: t('box.editHint'), onPointerDown: rebalance('ow', 'rw', 1, true) }),
        h('div', {
          className: 'elr-popup-block elr-popup-block-result',
          style: { flexGrow: popupOriginalVisible ? popupRW : 1, flexShrink: 1, flexBasis: 0, ...(popupOriginalVisible ? {} : { marginTop: 0 }) },
        },
          h('label', { className: 'elr-popup-label' }, t('popup.translation')),
          h('div', {
            className: 'elr-popup-result-box elr-popup-text' + (selectionResult ? '' : ' elr-out-empty'),
          }, selectionResult || (selectionBusy ? t('selection.working') : t('selection.pending'))),
          popupOriginalVisible && !popupHorizontal && h('div', { className: 'elr-popup-grip', title: t('box.editHint'), onPointerDown: rebalance('rw', 'ow', 1) })
        )
      ),
      h('span', { className: 'elr-grip-corner' }),
      // (v18 #3) Grippable edges (N/S/E/W + the four corners), so the card can be
      // resized from any border instead of only the bottom-right corner.
      resizeHandles(
        (patch) => {
          const current = inlinePopupRef.current;
          const tools = selectionToolsRef.current;
          if (!current) return;
          const next = { ...current, ...patch, manualSize: true };
          if (current.followsSelection && tools) {
            const { box, position } = selectionTranslationLayout(tools.rect, next, popupMinimum.h);
            setPopup({ ...next, ...box });
            setSelectionTools((previous) => previous?.range === tools.range ? { ...previous, position } : previous);
          } else setPopup(next);
        },
        popupMinimum.w, popupMinimum.h, popupViewport, {
          edges: popup.followsSelection ? ['e', 's', 'se'] : RESIZE_EDGES, cancelRef: popupDragCancelRef,
        },
      )
    ),
    floatingHost
  ) : null;

  // The formula card floats beside the PDF and can be dragged by its title bar.
  const formulaNode = formulaCard ? createPortal(
    h('div', {
      className: 'elr-formula-card elr-resizable' + toneCls,
      // (v18 #3) Same edge-resize treatment as the popup card: width/height are
      // state, patched by the eight `.elr-rz-*` strips.
      style: {
        left: Math.max(8, Math.min(formulaCard.x, (window.innerWidth || 1200) - 420)),
        top: Math.max(8, Math.min(formulaCard.y, (window.innerHeight || 800) - 240)),
        width: formulaCard.w || 440,
        height: formulaCard.h || undefined,
        minWidth: 260, minHeight: 160, maxHeight: '78vh',
      },
    },
      h('div', {
        className: 'elr-formula-head',
        onPointerDown: (e) => {
          if (e.button !== 0) return;
          if (e.target && e.target.closest && e.target.closest('button')) return;
          const startX = e.clientX, startY = e.clientY;
          const origin = { x: formulaCard.x || 0, y: formulaCard.y || 0 };
          // (v34 #2) Same frame-coalesced drag as the popup: the card is moved
          // through its own DOM style, state is written once on release.
          const cardEl = e.currentTarget && e.currentTarget.parentElement;
          let pending = { x: origin.x, y: origin.y };
          const painter = frameWriter((pos) => {
            if (!cardEl || !cardEl.style) return;
            cardEl.style.left = pos.x + 'px';
            cardEl.style.top = pos.y + 'px';
          });
          const move = (ev) => {
            const maxX = Math.max(8, (window.innerWidth || 1200) - 420);
            const maxY = Math.max(8, (window.innerHeight || 800) - 240);
            pending = {
              x: Math.max(8, Math.min(origin.x + (ev.clientX - startX), maxX)),
              y: Math.max(8, Math.min(origin.y + (ev.clientY - startY), maxY)),
            };
            painter.push(pending);
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            painter.cancel();
            gestureEnd();
            setFormulaCard((prev) => (prev ? Object.assign({}, prev, { x: pending.x, y: pending.y }) : prev));
          };
          gestureStart();
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          window.addEventListener('pointercancel', up);
          e.preventDefault();
        },
      },
        h('span', null, t('formula.title')),
        h('span', { className: 'elr-spacer', style: { flex: 1 } }),
        h('button', { className: 'elr-icon-btn', onClick: () => { cancelFormulaWork(); setFormulaCard(null); } }, t('close'))
      ),
      // (v9 #2) The selection is shown TYPESET, not as raw TeX: the source box
      // keeps the original string for copying, and the rendered copy above it
      // is what the reader actually needs to recognise the expression.
      //
      // A selection copied out of a PDF usually arrives as BARE TeX with no
      // `$…$` delimiters (`X_{(T+1):(T+S)} = F(X_{1:T}, E_{1:T}) \in
      // \mathbb{R}^{M \times S}`), so it cannot be pushed through the Markdown
      // path — that would print the same unreadable source again. Bare TeX is
      // fed straight to KaTeX as display math; only text that already carries
      // its own delimiters or prose goes through the Markdown renderer.
      formulaCard.text ? h('div', { className: 'elr-formula-render elr-katex' }, renderFormulaPreview(formulaCard.text)) : null,
      formulaCard.text ? h('div', { className: 'elr-formula-src' }, formulaCard.text) : null,
      h('div', { className: 'elr-formula-body elr-markdown' + (formulaCard.body ? '' : ' elr-out-empty') },
        formulaCard.busy ? t('formula.working') : (formulaCard.body ? renderMarkdown(formulaCard.body) : t('formula.empty'))),
      h('span', { className: 'elr-grip-corner' }),
      resizeHandles((patch) => setFormulaCard((prev) => (prev ? Object.assign({}, prev, patch) : prev)), 260, 160)
    ),
    floatingHost
  ) : null;

  // (v23 #1) The context menu offers highlight actions and annotation actions
  // as two SEPARATE groups, each keyed by its own record (`menu.markId` for the
  // yellow band, `menu.noteId` for the annotation). Acting on one never touches
  // the other, and the same sentence may legitimately show both groups.
  const menuHasHl = Boolean(menu && menu.markId);
  const menuHasNote = Boolean(menu && menu.noteId);
  const noteTarget = menuHasNote
    ? ((marksRef.current || []).find((m) => m.id === menu.noteId) || null)
    : null;
  const menuNode = menu ? createPortal(
    h('div', {
      className: 'elr-menu' + toneCls,
      style: {
        left: Math.max(8, Math.min(menu.x, (window.innerWidth || 1200) - 200)),
        top: Math.max(8, Math.min(menu.y, (window.innerHeight || 800) - (menu.media ? 48 : 190))),
      },
      onMouseDown: (e) => e.stopPropagation(),
    },
      menu.media ? h('button', {
        type: 'button', className: 'elr-menu-item', onClick: () => explainOriginalMedia(menu.media),
      }, mediaActionLabel(menu.media.block.kind)) : h(React.Fragment, null,
      menu.figure
        ? h('button', {
            className: 'elr-menu-item',
            onClick: () => {
              showContentCategory('visual');
              setAnalysisTab('figure');
              setFigurePickMode(true);
              setMenu(null);
              if (menu.page && pdfStateRef.current?.viewer) {
                try { pdfStateRef.current.viewer.currentPageNumber = menu.page; } catch (_) {}
              }
            },
          }, t('figure.explain'))
        : null,
      !menu.figure && menuHasHl
        ? h('button', {
            className: 'elr-menu-item',
            onClick: () => { removeHighlight(menu.markId); setMenu(null); },
          }, t('mark.removeHl'))
        : null,
      !menu.figure && menuHasNote
        ? h('button', {
            className: 'elr-menu-item',
            onClick: () => {
              if (!noteTarget) { setMenu(null); return; }
              const anchor = menu.rect || { left: menu.x, top: menu.y, bottom: menu.y };
              setNoteBubble(placeNoteBubble(noteTarget.id, noteTarget.text, noteTarget.note || '', anchor));
              setMenu(null);
            },
          }, t('mark.editNote'))
        : null,
      !menu.figure && menuHasNote
        ? h('button', {
            className: 'elr-menu-item',
            onClick: () => {
              clearNote(menu.noteId);
              setMenu(null);
              notify(t('mark.noteCleared'), 'ok');
            },
          }, t('mark.clearNote'))
        : null,
      !menu.figure && (menuHasHl || menuHasNote) ? h('div', { className: 'elr-menu-sep' }) : null,
      // The two add actions are always offered; each one creates or re-opens
      // its OWN record kind and never touches the other.
      !menu.figure && !menuHasHl && menu.anchors?.length
        ? h('button', { className: 'elr-menu-item', onClick: () => addHighlight(menu.text, undefined, menu.anchors) }, t('mark.add'))
        : null,
      !menu.figure && menuHasNote
        ? null
        : h('button', { className: 'elr-menu-item', onClick: () => addNote(menu.text, menu.rect, null, menu.anchors) }, t('mark.note')),
      // (v8 #3) Formula explanation is offered whenever the selection looks
      // like math; it is also always available so an odd formula can still be
      // explained on demand.
      !menu.figure ? h('div', { className: 'elr-menu-sep' }) : null,
      !menu.figure ? h('button', {
        className: 'elr-menu-item',
        onClick: () => { explainFormula(menu.text, menu.rect); setMenu(null); },
      }, t('formula.explain')) : null,
      // (v35 #1) Explain the selected word/short phrase as a professional term
      // of this paper's field, and record it in the 术语解释 card.
      !menu.figure ? h('button', {
        className: 'elr-menu-item',
        onClick: () => {
          explainTerm(menu.text, '', menu.anchors);
          setMenu(null);
        },
      }, t('term.explain')) : null,
      !menu.figure ? h('div', { className: 'elr-menu-sep' }) : null,
      !menu.figure ? h('button', {
        className: 'elr-menu-item',
        onClick: () => { copyText(menu.text); setMenu(null); },
      }, t('selection.copy')) : null)
    ),
    floatingHost
  ) : null;

  const noteSource = String(noteBubble?.text || '').replace(/\s+/g, ' ').trim();
  const noteNode = noteBubble ? createPortal(
    h('div', {
      className: 'elr-note-bubble elr-resizable' + toneCls,
      ref: noteBubbleElement,
      onPointerDownCapture: () => noteBubbleMotion.current?.cancel(),
      // (v18 #3) Edge-resize for the annotation bubble as well, so EVERY floating
      // card can be sized from any border.
      style: {
        left: noteBubble.x, top: noteBubble.y, width: noteBubble.w, height: noteBubble.h,
      },
    },
      h('div', {
        className: 'elr-popup-head elr-note-bubble-head',
        // (v8 #1) Drag the bubble by its title bar. The drag writes into the
        // bubble's own x/y so it stays where it was dropped.
        onPointerDown: (e) => {
          if (e.button !== 0 || e.isPrimary === false) return;
          if (e.target && e.target.closest && e.target.closest('button')) return;
          const startX = e.clientX, startY = e.clientY;
          const node = e.currentTarget.parentNode;
          const origin = node.getBoundingClientRect();
          if (node && node.setPointerCapture) { try { node.setPointerCapture(e.pointerId); } catch (_) {} }
          // (v34 #2) Frame-coalesced drag: write the card's own style per frame,
          // commit `{x, y}` to state only when the pointer is released.
          let pending = { x: origin.left, y: origin.top };
          const painter = frameWriter((pos) => {
            if (!node || !node.style) return;
            node.style.left = pos.x + 'px';
            node.style.top = pos.y + 'px';
          });
          const move = (ev) => {
            if (ev.pointerId !== e.pointerId) return;
            pending = fitPopupBox({
              x: origin.left + ev.clientX - startX, y: origin.top + ev.clientY - startY,
              w: origin.width, h: origin.height,
            }, popupViewport());
            painter.push(pending);
          };
          const up = (ev) => {
            if (ev.pointerId !== e.pointerId) return;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            painter.cancel();
            gestureEnd();
            if (node && node.releasePointerCapture) { try { node.releasePointerCapture(ev.pointerId); } catch (_) {} }
            setNoteBubble((prev) => (prev?.id === noteBubble.id ? { ...prev, ...pending, anchorRange: null } : prev));
          };
          gestureStart();
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          window.addEventListener('pointercancel', up);
          e.preventDefault();
        },
      },
        h('span', null, t('mark.noteTitle')),
        h('span', { className: 'elr-spacer', style: { flex: 1 } }),
        h('button', {
          type: 'button', className: 'elr-icon-btn elr-popup-translate',
          disabled: !noteBubble.note?.trim(), onClick: saveNoteBubble,
        }, t('mark.saveNote')),
        h('button', { type: 'button', className: 'elr-icon-btn', onClick: closeNoteBubble }, t('close'))
      ),
      h('div', { className: 'elr-popup-body elr-note-bubble-body' },
        h('textarea', {
        className: 'elr-note-bubble-textarea',
        autoFocus: true,
        'aria-label': t('mark.noteTitle'),
        placeholder: t('mark.notePlaceholder'),
        value: noteBubble.note || '',
        onChange: (e) => {
          const value = e.target.value;
          setNoteBubble((prev) => (prev ? Object.assign({}, prev, { note: value }) : prev));
        },
        onKeyDown: (event) => {
          if (!event.nativeEvent?.isComposing && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            saveNoteBubble();
          }
        },
        }),
        noteSource ? h('div', { className: 'elr-note-source' }, noteSource.length > 110 ? noteSource.slice(0, 110) + '…' : noteSource) : null
      ),
      resizeHandles((patch) => setNoteBubble((prev) => prev?.id === noteBubble.id ? { ...prev, ...patch, anchorRange: null } : prev),
        NOTE_POPUP_MIN.w, NOTE_POPUP_MIN.h, popupViewport)
    ),
    floatingHost
  ) : null;

  const dropLineNode = (cardDrop && !cardDrop.origin && cardDrop.lineRect) ? createPortal(
    h('div', {
      className: 'elr-drop-line ' + (cardDrop.lineRect.vertical ? 'is-vertical' : 'is-horizontal'),
      'aria-hidden': true,
      style: {
        left: cardDrop.lineRect.x + 'px',
        top: cardDrop.lineRect.y + 'px',
        width: cardDrop.lineRect.w + 'px',
        height: cardDrop.lineRect.h + 'px',
      },
    }),
    floatingHost
  ) : null;

  const ghostNode = ghost ? createPortal(
    h('div', {
      ref: cardGhostRef,
      className: 'elr-drag-ghost is-lifting' + (ghost.vertical ? ' is-vertical' : '') + toneCls,
      'aria-hidden': true,
      'data-elr-liquid': ghost.liquid || undefined,
      'data-elr-liquid-ink': ghost.liquidInk || undefined,
      style: {
        translate: ghost.x + 'px ' + ghost.y + 'px 0',
        transform: 'scale(' + (ghost.scale ?? 1) + ')',
        width: ghost.w,
        height: ghost.h,
        '--elr-card-font-adjust': cardFontAdjust,
      },
    },
      h('span', { className: 'elr-drag-ghost-label' }, cardLabel(ghost.key))
    ),
    floatingHost
  ) : null;

  const bodyClass = 'elr-body' + (dock === 'bottom' ? ' dock-bottom' : (isLeftSide ? ' dock-left' : ''));
  const bodyPanes = [main, hasPaper && !workspaceStowed ? resizer : null, hasPaper ? side : null];

  return h('div', {
    ref: readerRef,
    className: 'elr-view' + (showPdfStart ? ' elr-library-view' : '') + (panMode ? ' elr-pan-on' : '') + toneCls,
    onDragOver,
    onDragLeave,
    onDrop,
    onKeyDown: (event) => {
      if (!pdfAnalysisReady || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f'
        || event.nativeEvent?.isComposing || event.target.closest?.('[popover]')) return;
      event.preventDefault();
      openFind(false);
    },
    onPointerDownCapture: hasPaper ? () => selectCardWindowHost(floatingHost) : undefined,
    onFocusCapture: hasPaper ? () => selectCardWindowHost(floatingHost) : undefined,
  },
    head,
    h('input', { ref: pdfFileRef, type: 'file', accept: '.pdf,application/pdf', hidden: true, onChange: onPdfFile }),
    h('input', { ref: txtFileRef, type: 'file', accept: '.txt,.md,.text,text/plain', hidden: true, onChange: onTxtFile }),
    h('div', { className: bodyClass }, ...bodyPanes,
      hasPaper && workspaceStowed ? h('button', { ref: workspaceTabRef, type: 'button', className: 'elr-workspace-tab',
        title: t('cards.show'), 'aria-controls': workspaceId, 'aria-expanded': false, onClick: toggleWorkspace,
      }, t('cards.title')) : null,
      h('div', { className: 'elr-notice', role: 'status', 'aria-live': 'polite' },
        notice ? h('div', { key: notice.id, className: 'elr-notice-pill' + (notice.kind ? ' is-' + notice.kind : '') }, notice.message) : null
      )
    ),
    selectionToolNode,
    popupNode,
    formulaNode,
    menuNode,
    noteNode,
    floatingCardNodes,
    termBubbleNode,
    dropLineNode,
    ghostNode,
    figurePicking ? createPortal(h(FigurePicker, {
      container: containerRef, onConfirm: confirmFigureBox, onCancel: () => setFigurePickMode(false),
      onTooSmall: () => notify(t('figure.tooSmall'), 'warn'),
      labels: { title: t('figure.screenshot'), cancel: t('figure.cancelCapture'), confirm: t('figure.confirmCapture') },
    }), floatingHost) : null,
    cardMenu,
    cardContext ? createPortal(h('div', {
      ref: cardContextRef, className: 'elr-card-menu elr-card-context' + toneCls,
      role: 'dialog', 'aria-label': cardLabel(cardContext.key),
    },
      h('button', { type: 'button', className: 'elr-menu-item', onClick: () => {
        setCardContext(null);
        toggleFunctionCardFloat(cardContext.key, cardContext.open, cardContext.anchor);
      } }, t(floatingCards[cardContext.key] ? 'card.dock' : 'card.float')),
      cardContext.key === 'album' && openModelSettings ? h('button', { type: 'button', className: 'elr-menu-item', onClick: () => {
        setCardContext(null);
        openModelSettings({ tab: 'display', section: 'album' });
      } }, t('card.settings')) : null,
      h('button', { type: 'button', className: 'elr-menu-item is-destructive', onClick: () => {
        setCardContext(null);
        setCardEnabled(cardContext.key, false);
        cardMenuButtonRef.current?.focus({ preventScroll: true });
      } }, t('card.remove'))
    ), floatingHost) : null
  );
}

const dictionaries = {
  en: {
    launcher: 'CoReader', title: 'CoReader', close: 'Close',
    tabTitle: 'Literature', 'source.pdf': 'PDF', 'source.text': 'Text', 'tab.read': 'Read',
    'fullscreen.enter': 'Fullscreen', 'fullscreen.exit': 'Exit fullscreen', 'fullscreen.failed': 'Could not switch to or from fullscreen.',
    'pdf.drop': 'Open a paper', 'pdf.dropSub': 'Drop a PDF here or choose one from your device.',
    'pdf.dropHere': 'Release to open the PDF', 'pdf.open': 'Open PDF', 'pdf.loading': 'Loading PDF…',
    'pdf.close': 'Close paper', 'pdf.closeHint': 'Close the current paper and go back to the empty view',
    'pdf.loaded': 'PDF ready — select any sentence to translate it.', 'pdf.failed': 'Could not open this PDF.',
    'pdf.nativeFallback': 'Showing the built-in PDF preview.',
    'pdf.textReady': 'Full text extracted — paper analysis is available.',
    'pdf.extracting': 'Extracting PDF text…',
    'pdf.extractFailed': 'Could not extract the PDF text. Retry, or paste the text in the Text tab.',
    'pdf.analysisUnavailable': 'Text extraction is unavailable in the built-in preview. Paste the paper text in the Text tab to analyze it.',
    'page.prev': 'Prev', 'page.next': 'Next', 'zoom.in': 'Zoom +', 'zoom.out': 'Zoom −',
    'tab.summary': 'Paper analysis',
    paste: 'Paste or type an English paper here…', load: 'Load .txt file', clear: 'Clear', chars: 'characters',
    'selection.hint': 'Hold Shift while selecting to add another passage. Press Translate when ready.',
    'selection.appendHint': 'Hold Shift while selecting to add more text.',
    'selection.tools': 'PDF selection tools', 'selection.inline': 'Inline translation', 'selection.quoteAgent': 'Quote in Reading Assistant',
    'mark.color.yellow': 'Yellow highlight', 'mark.color.green': 'Green highlight',
    'mark.color.blue': 'Blue highlight', 'mark.color.red': 'Red highlight',
    'selection.resizePanes': 'Adjust the height of the original and translation panes',
    'selection.resizePaneWidths': 'Adjust the width of the original and translation panes',
    'selection.limit': 'The translation selection is limited to {count} characters. The previous text is still in the editor.',
    'selection.empty': 'Select a sentence or paragraph in the reading pane.',
    'mark.selectPdf': 'Select the text to highlight in the original PDF.',
    'mark.reselect': 'Select the original passage again to restore this highlight.',
    'selection.working': 'Translating selection…', 'selection.title': 'Selection translation',
    // (v17 #3) Selecting text only stages it now, so these two strings tell the
    // reader that the model has not been called yet.
    'selection.pending': 'Text staged — press Translate to translate it.',
    'selection.translate': 'Translate',
    'selection.copy': 'Copy', 'selection.copied': 'Copied',
    'figure.select': 'Explain figure',
    'figure.title': 'Content analysis',
    'content.visual': 'Figures & tables',
    'content.formula': 'Formulas', 'content.removeEntry': 'Delete analysis',
    'content.removeSaveFailed': 'The deletion could not be saved.',
    'content.formulaEntry': 'Formula analysis', 'content.numberedFormula': 'Formula ({number})', 'content.tableEntry': 'Table analysis',
    'content.formulaEmpty': 'Hover over a formula or right-click it to explain it.',
    'figure.explain': 'Explain figure',
    'table.explain': 'Explain table',
    'formula.imageModelRequired': 'This formula is an image. Choose a model with image input to explain it.',
    'figure.sort': 'Sort',
    'figure.sort.document-asc': 'Document order · First to last',
    'figure.sort.document-desc': 'Document order · Last to first',
    'figure.sort.time-asc': 'Analysis time · Oldest first',
    'figure.sort.time-desc': 'Analysis time · Newest first',
    'figure.cancel': 'Cancel',
    'figure.selectHint': 'Draw and adjust a box on one PDF page, then confirm. Press Esc to cancel.',
    'figure.cancelCapture': 'Cancel screenshot', 'figure.confirmCapture': 'Confirm and analyze',
    'figure.empty': 'Hover over a figure or table, or right-click it to analyze it.',
    'figure.working': 'Analyzing the selected figure…',
    'figure.page': 'Page {page}',
    'figure.entry': 'Figure analysis', 'figure.screenshot': 'Analyze a screenshot',
    'generation.model': 'Model {model}',
    'generation.effort': 'Reasoning {effort}',
    'generation.time': 'Generated',
    'generation.unrecorded': 'Unrecorded',
    'generation.currentSetting': '{value} (current setting)',
    'figure.saveFailed': 'Storage is unavailable. The new analysis is available until this browser page closes.',
    'figure.tooSmall': 'Drag a larger box around the figure.',
    'figure.renderFailed': 'Could not capture the selected PDF area.',
    'figure.imageInvalid': 'This image could not be prepared. Try selecting a smaller area.',
    'figure.modelRequired': 'Choose a model with image input, such as DeepSeek Flash, then select the figure again.',
    'figure.attachmentsRequired': 'This Harness profile does not provide image attachments.',
    'figure.failed': 'Could not analyze this figure.',
    'summary.coveragePages': 'Pages examined {pages} of {total}',
    'summary.coverageText': 'Examined {count} of {total} characters',
    'summary.failed': 'Could not analyze the paper.',
    'summary.hostUnavailable': 'The paper analysis service is unavailable. Quit and reopen Harness to load the current plugin.',
    'summary.coverageFailed': '{count} excerpts failed',
    'summary.notesOnly': 'Showing available notes because synthesis failed',
    'summary.fullPass': 'Full text in one call', 'summary.sectionPass': 'Analyzed in sections',
    'summary.retrySynthesis': 'Retry synthesis', 'summary.synthesizing': 'Synthesizing saved notes…',
    'summary.synthesisError': 'Synthesis error: {error}',
    'summary.run': 'Analyze paper', 'summary.running': 'Analyzing innovations and technical approach…',
    'summary.rerun': 'Re-analyze',
    'summary.info': 'Analysis model and time',
    'summary.copy': 'Copy analysis', 'summary.placeholder': 'A structured analysis (innovations, technical approach, experiments, limitations) will appear here.',
    truncated: 'Note: the input was clipped to the model\'s length limit.', chunks: 'segments',
    failedChunks: 'segment(s) failed (marked inline)',
    error: 'Error', retry: 'Retry', model: 'Model', customModel: 'Custom provider / model (optional)',
    providerPlaceholder: 'provider (e.g. workbuddy)', modelPlaceholder: 'model (e.g. hy4free)',
    apply: 'Apply', defaultModel: 'Using the current default model', ready: 'Ready', minimized: 'Expand',
    'models.loading': 'Loading…', 'models.empty': 'No available models', 'models.disconnected': 'Not connected', 'model.provider': 'Provider', 'model.model': 'Model',
    'model.manual': 'Manual', 'effort.label': 'Reasoning',
    'effort.follow': 'Default', 'effort.followNamed': 'Default ({effort})',
    'pan.on': 'Pan: on', 'pan.off': 'Pan: off', 'resize.panes': 'Resize the tools pane by dragging or using the arrow keys',
    'recent.title': 'Recent papers', 'recent.empty': 'No recent papers yet — open a PDF or text file.',
    'recent.remove': 'Remove', 'recent.opened': 'Opened from recent list.',
    'recent.loading': 'Opening the saved PDF…',
    'spread.on': 'Two pages', 'spread.off': 'One page',
    'spread.one': '1 page', 'spread.two': '2 pages', 'spread.three': '3 pages',
    'spread.label': 'Pages per row',
    // (v20 #3) Zoom percentage control.
    'zoom.label': 'Zoom', 'zoom.input': 'Zoom percentage (25–600) — pick a preset or type any value',
    'popup.on': 'Inline translation: on', 'popup.off': 'Inline translation: off',
    // (v46) Appearance controls moved into one settings panel.
    'settings.title': 'Display', 'settings.hint': 'Page theme, interface tone, card column and inline popup',
    'settings.panel': 'Display settings',
    'dock.label': 'Card column', 'dock.rightShort': 'Right', 'dock.bottomShort': 'Bottom',
    'dock.switch': 'Dock cards at {side}',
    'popup.label': 'Inline popup', 'popup.onShort': 'On', 'popup.offShort': 'Off',
    'popup.title': 'Selection translation', 'popup.dismissHint': 'Press Escape to close',
    'popup.stack': 'Stack original and translation', 'popup.columns': 'Show original and translation side by side',
    'popup.fontDec': 'Decrease font size', 'popup.fontInc': 'Increase font size',
    'popup.original': 'English original (editable)', 'popup.translation': '中文译文',
    'popup.retranslate': 'Re-translate', 'popup.translate': 'Translate',
    minimize: 'Minimize', expand: 'Expand', reanalyze: 'Re-analyze',
    'mark.add': 'Highlight', 'mark.note': 'Add note', 'mark.title': 'Highlights & notes',
    'mark.empty': 'Select text to add a highlight or note.',
    'mark.filter.all': 'All', 'mark.filter.hl': 'Highlights', 'mark.filter.note': 'Notes',
    'mark.filterEmpty': 'Nothing in this filter yet.',
    'mark.notePlaceholder': 'Write a note…', 'mark.remove': 'Remove',
    'mark.badgeHl': 'Highlight', 'mark.badgeNote': 'Note',
    'mark.removeHl2': 'Remove highlight', 'mark.removeNote': 'Delete note',
    'mark.locate': 'Jump to this passage', 'mark.locateFailed': 'This passage is not on the current pages — open the PDF first, then try again.',
    'mark.saved': 'Highlight saved.',
    'mark.noteSaved': 'Note saved.',
    'dark.on': 'Dark: on', 'dark.off': 'Dark: off',
    // (v28 #4) The toggle moves the whole function-card column.
    'dock.bottom': 'Card column: bottom', 'dock.right': 'Card column: right',
    'recent.hint': 'Double-click to open',
    'mark.noteTitle': 'Note', 'mark.saveNote': 'Save', 'mark.cancelEdit': 'Cancel', 'mark.clearNote': 'Clear note', 'mark.noteCleared': 'Note cleared',
    'theme.label': 'Page theme', 'theme.default': 'Default',
    'theme.light': 'Light pages', 'theme.dark': 'Dark pages',
    'theme.paper': 'Paper texture', 'theme.eye': 'Eye-care yellow',
    'theme.ivory': 'Soft ivory', 'theme.mist': 'Mist blue', 'theme.sage': 'Pale sage', 'theme.linen': 'Fine linen',
    'theme.dark-slate': 'Slate night', 'theme.dark-midnight': 'Midnight ink',
    'theme.dark-sepia': 'Warm charcoal', 'theme.dark-forest': 'Deep forest', 'theme.dark-oled': 'Pitch black',
    'tone.label': 'Interface tone', 'tone.default': 'Slate Night',
    'tone.light': 'Light themes', 'tone.dark': 'Dark themes', 'tone.duo': 'Two-tone themes',
    'tone.duo-blue': 'White & Blue', 'tone.duo-orange': 'Grey & Orange', 'tone.duo-green': 'Oat & Green', 'tone.duo-purple': 'Mist & Purple',
    'tone.blue': 'Rainwashed Blue', 'tone.green': 'Pine Mist', 'tone.amber': 'Autumn Wheat', 'tone.pink': 'Rose Haze', 'tone.prism-light': 'Sunlit Prism',
    'tone.navy': 'Midnight Sea', 'tone.ink': 'Ink in the Rain', 'tone.forest': 'Nightfall Pines',
    'tone.plum': 'Violet Dusk', 'tone.ember': 'Fireside Stories', 'tone.prism-dark': 'Aurora Night',
    'mark.editNote': 'Edit note', 'mark.removeHl': 'Remove highlight',
    'recent.open': 'Open', 'recent.missing': 'This PDF must be re-opened — pick the file again.',
    'formula.explain': 'Explain formula', 'formula.title': 'Formula explanation',
    // (v35 #1) 术语解释 card.
    'term.cardTitle': 'Terms', 'term.explain': 'Explain this term',
    'term.running': 'Explaining this term from the paper\'s context…',
    'term.runningShort': 'Explaining…', 'term.failed': 'Could not explain this term.',
    'term.empty': 'Use Explain this term in the selection card or the PDF context menu to add a term.',
    'term.selectShort': 'Select a word or short phrase in the source text to explain.',
    'term.incomplete': 'Explanation unfinished', 'term.retry': 'Retry',
    'term.toggle': 'Show or hide the explanation', 'term.remove': 'Remove this term',
    'term.needPaper': 'Open a paper first — the explanation is grounded in its text.',
    'formula.working': 'Explaining this formula in the paper\'s context…',
    'formula.empty': 'No explanation yet.', 'formula.failed': 'Could not explain this formula.',
    'section.drag': 'Drag to reorder or float the card', 'resize.split': 'Drag to resize the two panes',
    // (v27) Function-card manager.
    'card.manage': 'Manage cards', 'card.resetLayout': 'Restore default layout',
    'card.close': 'Close this card', 'card.none': 'All cards are closed — open ⚙ above to enable one.',
    'card.dragHint': 'Drop on the page to float or in the function bar to dock',
    'card.dockEmpty': 'Drag a floating card here to dock it.',
    'card.float': 'Float card', 'card.dock': 'Dock card', 'card.floatingDrag': 'Drag to move or dock the card',
    'card.remove': 'Remove card',
    'card.settings': 'Settings',
  'card.resize': 'Drag to resize this card',
  'card.floatResize': 'Drag to resize the floating card',
  'card.resizeH': 'Drag the bottom edge to change this card\'s height',
  // (v39) In-document search box in the reading toolbar.
  'find.placeholder': 'Search in document',
  'find.hint': 'Enter = next hit, Shift+Enter = previous, Esc = clear',
  'find.prev': 'Previous hit',
  'find.next': 'Next hit',
  'find.clear': 'Clear the search',
  'find.noMatches': 'No matches found in this PDF.',
  'find.searching': 'Searching in document',
    'cards.title': 'Cards',
    'cards.stow': 'Hide tools', 'cards.show': 'Show tools',
    'box.editHint': 'Drag the bar under a box to change its height',
    'references.title': 'References',
    'references.running': 'Processing…',
    'references.run': 'Collect references',
    'references.rerun': 'Collect references again',
    'references.missing': 'Not found',
    'references.noText': 'No selectable text in this PDF. Use OCR or paste the bibliography in the text box.',
    // (v21 #2) Launcher capsule description in the right-hand guide panel.
    'guide.desc': 'Open the literature reader in the right column',
  },
  zh: {
    launcher: 'CoReader', title: 'CoReader', close: '关闭',
    tabTitle: '文献阅读', 'source.pdf': 'PDF', 'source.text': '文本', 'tab.read': '阅读',
    'fullscreen.enter': '全屏', 'fullscreen.exit': '退出全屏', 'fullscreen.failed': '无法切换全屏。',
    'pdf.drop': '打开文献', 'pdf.dropSub': '拖入 PDF 文件，或从本机选择。',
    'pdf.dropHere': '松开即可打开 PDF', 'pdf.open': '打开 PDF', 'pdf.loading': '正在载入 PDF…',
    'pdf.close': '关闭文献', 'pdf.closeHint': '关闭当前文献，回到空白界面',
    'pdf.loaded': 'PDF 已就绪——选中任意句子即可翻译。', 'pdf.failed': '无法打开该 PDF。',
    'pdf.nativeFallback': '已切换为浏览器内置 PDF 预览。',
    'pdf.textReady': '已提取全文——可进行论文分析。',
    'pdf.extracting': '正在提取 PDF 文本…',
    'pdf.extractFailed': '无法提取 PDF 文本。请重试，或将原文粘贴到「文本」页。',
    'pdf.analysisUnavailable': '内置预览无法提取文本。可将论文原文粘贴到「文本」页进行分析。',
    'page.prev': '上一页', 'page.next': '下一页', 'zoom.in': '放大', 'zoom.out': '缩小',
    'tab.summary': '论文分析',
    paste: '在此粘贴或输入英文论文全文…', load: '载入 .txt 文件', clear: '清空', chars: '字符',
    'selection.hint': '按住 Shift 划选可追加选区，再点击「翻译」。',
    'selection.appendHint': '按住 Shift 划选可追加原文',
    'selection.tools': 'PDF 划词工具栏', 'selection.inline': '划词翻译', 'selection.quoteAgent': '引用至阅读助手',
    'mark.color.yellow': '黄色高亮', 'mark.color.green': '绿色高亮',
    'mark.color.blue': '蓝色高亮', 'mark.color.red': '红色高亮',
    'selection.resizePanes': '调整原文和译文区域的高度',
    'selection.resizePaneWidths': '调整原文和译文区域的宽度',
    'selection.limit': '划词翻译最多支持 {count} 个字符，已保留之前的内容。',
    'selection.empty': '请在阅读区选中一个句子或段落。',
    'mark.selectPdf': '请在 PDF 原文中划选要高亮的文字。',
    'mark.reselect': '重新划选原文并高亮，即可恢复这条旧记录的位置。',
    'selection.working': '正在翻译选中内容…', 'selection.title': '划词翻译',
    'selection.pending': '已选中文本，点击「翻译」后再开始翻译。',
    'selection.translate': '翻译',
    'selection.copy': '复制', 'selection.copied': '已复制',
    'figure.select': '插图解释',
    'figure.title': '内容解析',
    'content.visual': '图表解析',
    'content.formula': '公式解析', 'content.removeEntry': '删除解析',
    'content.removeSaveFailed': '暂时无法保存删除操作。',
    'content.formulaEntry': '公式解析', 'content.numberedFormula': '公式({number})', 'content.tableEntry': '表格解析',
    'content.formulaEmpty': '在原文中悬停或右键公式，选择「解释公式」。',
    'figure.explain': '解释图片',
    'table.explain': '解释表格',
    'formula.imageModelRequired': '这条公式是图片，请选择支持图像输入的模型后再解释。',
    'figure.sort': '排序',
    'figure.sort.document-asc': '文中位置 · 正序',
    'figure.sort.document-desc': '文中位置 · 倒序',
    'figure.sort.time-asc': '分析时间 · 最早优先',
    'figure.sort.time-desc': '分析时间 · 最新优先',
    'figure.cancel': '取消',
    'figure.selectHint': '在同一页框选并调整范围，点击对勾后解析。按 Esc 取消。',
    'figure.cancelCapture': '取消截图', 'figure.confirmCapture': '确认并解析',
    'figure.empty': '在原文中悬停或右键图表，选择「解释图片」或「解释表格」。',
    'figure.working': '正在解析所选插图…',
    'figure.page': '第 {page} 页',
    'figure.entry': '插图解读', 'figure.screenshot': '截图内容解析',
    'generation.model': '模型 {model}',
    'generation.effort': '推理强度 {effort}',
    'generation.time': '生成时间',
    'generation.unrecorded': '未记录',
    'generation.currentSetting': '{value}（当前设置）',
    'figure.saveFailed': '暂时无法保存解析记录，这条记录可在当前窗口继续查看。',
    'figure.tooSmall': '请拖动框住更完整的插图区域。',
    'figure.renderFailed': '无法截取所选的 PDF 区域。',
    'figure.imageInvalid': '无法处理该图片，请尝试框选更小的区域。',
    'figure.modelRequired': '请选择支持图像输入的模型（例如 DeepSeek Flash），再框选插图。',
    'figure.attachmentsRequired': '当前 Harness 配置未提供图片附件服务。',
    'figure.failed': '无法解析所选插图。',
    'summary.coveragePages': '已分析第 {pages} 页，共 {total} 页',
    'summary.coverageText': '已分析 {count} / {total} 字符',
    'summary.failed': '论文分析失败。',
    'summary.hostUnavailable': '论文分析服务未就绪。请完全退出并重新打开 Harness，以加载当前插件。',
    'summary.coverageFailed': '{count} 个摘录处理失败',
    'summary.notesOnly': '综合分析失败，已保留成功的分段笔记',
    'summary.fullPass': '一次全文分析', 'summary.sectionPass': '按章节分段分析',
    'summary.retrySynthesis': '仅重试汇总', 'summary.synthesizing': '正在汇总已保存的笔记…',
    'summary.synthesisError': '汇总失败原因：{error}',
    'summary.run': '分析论文', 'summary.running': '正在总结创新点与技术方案…',
    'summary.rerun': '重新分析',
    'summary.info': '查看分析模型与时间',
    'summary.copy': '复制分析', 'summary.placeholder': '结构化分析（创新点、技术方案、实验、局限）将显示在这里。',
    truncated: '提示：输入已按模型长度上限截断。', chunks: '个分段',
    failedChunks: '个分段失败（已在文中标注）',
    error: '错误', retry: '重试', model: '模型', customModel: '自定义服务商 / 模型（可选）',
    providerPlaceholder: '服务商（如 workbuddy）', modelPlaceholder: '模型（如 hy4free）',
    apply: '应用', defaultModel: '使用当前默认模型', ready: '就绪', minimized: '展开',
    'models.loading': '加载中…', 'models.empty': '暂无可用模型', 'models.disconnected': '未连接', 'model.provider': '服务商', 'model.model': '模型',
    'model.manual': '手动输入', 'effort.label': '推理强度',
    'effort.follow': '默认', 'effort.followNamed': '默认（{effort}）',
    'pan.on': '拖动漫游：开', 'pan.off': '拖动漫游：关', 'resize.panes': '拖动或使用方向键调整功能栏大小',
    'recent.title': '近期阅读', 'recent.empty': '暂无记录——打开一个 PDF 或文本文件后会显示在这里。',
    'recent.remove': '移除', 'recent.opened': '已从近期阅读打开。',
    'recent.loading': '正在打开已保存的 PDF…',
    'spread.on': '双栏', 'spread.off': '单栏',
    'spread.one': '单页', 'spread.two': '双页', 'spread.three': '三页',
    'spread.label': '每行页数',
    'zoom.label': '缩放比例', 'zoom.input': '缩放百分比（25–600）——可选常用值或直接输入',
    'popup.on': '内联翻译：开', 'popup.off': '内联翻译：关',
    // (v46) 外观控件统一收进设置面板。
    'settings.title': '显示设置', 'settings.hint': '页面配色、界面配色、功能栏停靠与内联翻译浮层',
    'settings.panel': '显示设置',
    'dock.label': '功能栏停靠', 'dock.rightShort': '右侧', 'dock.bottomShort': '下方',
    'dock.switch': '将功能栏停靠到{side}',
    'popup.label': '内联翻译浮层', 'popup.onShort': '开', 'popup.offShort': '关',
    'popup.title': '划词翻译', 'popup.dismissHint': '按 Esc 收起翻译浮窗',
    'popup.stack': '切换为上下排列', 'popup.columns': '切换为左右排列',
    'popup.fontDec': '缩小字体', 'popup.fontInc': '放大字体',
    'popup.original': '英文原文（可编辑）', 'popup.translation': '中文译文',
    'popup.retranslate': '重新翻译', 'popup.translate': '翻译',
    minimize: '最小化', expand: '展开', reanalyze: '重新分析',
    'mark.add': '高亮', 'mark.note': '批注', 'mark.title': '高亮与批注',
    'mark.empty': '选中文本后可添加高亮或批注。',
    'mark.filter.all': '全部', 'mark.filter.hl': '高亮', 'mark.filter.note': '批注',
    'mark.filterEmpty': '当前筛选下没有记录。',
    'mark.notePlaceholder': '写批注…', 'mark.remove': '移除',
    'mark.badgeHl': '高亮', 'mark.badgeNote': '批注',
    'mark.removeHl2': '移除高亮', 'mark.removeNote': '删除批注',
    'mark.locate': '跳转到该段落', 'mark.locateFailed': '在当前页面中找不到该段落——请先打开 PDF 再试。',
    'mark.saved': '已保存高亮。',
    'mark.noteSaved': '已保存批注。',
    'dark.on': '深色：开', 'dark.off': '深色：关',
    'dock.bottom': '功能栏停靠：下方', 'dock.right': '功能栏停靠：右侧',
    'recent.hint': '双击打开',
    'mark.noteTitle': '批注', 'mark.saveNote': '保存', 'mark.cancelEdit': '取消', 'mark.clearNote': '清除批注', 'mark.noteCleared': '已清除批注',
    'theme.label': '页面配色', 'theme.default': '默认',
    'theme.light': '浅色纸张', 'theme.dark': '深色纸张',
    'theme.paper': '纸张纹理', 'theme.eye': '护眼黄',
    'theme.ivory': '柔白', 'theme.mist': '雾蓝', 'theme.sage': '浅青绿', 'theme.linen': '细麻纹',
    'theme.dark-slate': '玄夜深灰', 'theme.dark-midnight': '深夜靛蓝',
    'theme.dark-sepia': '暖墨褐纸', 'theme.dark-forest': '墨绿夜读', 'theme.dark-oled': '极夜纯黑',
    'tone.label': '界面配色', 'tone.default': '玄灰夜幕',
    'tone.light': '浅色主题', 'tone.dark': '深色主题', 'tone.duo': '双拼主题',
    'tone.duo-blue': '白蓝', 'tone.duo-orange': '灰橘', 'tone.duo-green': '米绿', 'tone.duo-purple': '雾紫',
    'tone.blue': '雨后天青', 'tone.green': '山间松雾', 'tone.amber': '秋日麦穗', 'tone.pink': '蔷薇薄雾', 'tone.prism-light': '晴光流彩',
    'tone.navy': '深海子夜', 'tone.ink': '墨池听雨', 'tone.forest': '松林入夜',
    'tone.plum': '暮紫星河', 'tone.ember': '炉边夜话', 'tone.prism-dark': '极夜流光',
    'mark.editNote': '编辑批注', 'mark.removeHl': '取消高亮',
    'recent.open': '打开', 'recent.missing': '该 PDF 需要重新选择文件才能打开。',
    'formula.explain': '解释公式', 'formula.title': '公式详解',
    // (v35 #1) 术语解释卡片。
    'term.cardTitle': '术语解释', 'term.explain': '解释术语',
    'term.running': '正在结合论文内容与专业领域解释该名词…',
    'term.runningShort': '解释中…', 'term.failed': '无法解释该名词。',
    'term.empty': '在划词翻译卡片或 PDF 右键菜单中点击「解释术语」即可添加。',
    'term.selectShort': '请在原文中选中一个词或短语进行解释。',
    'term.incomplete': '解释未完成', 'term.retry': '重试',
    'term.toggle': '显示或关闭解释', 'term.remove': '删除该术语',
    'term.needPaper': '请先打开一篇论文，解释需要结合论文正文。',
    'formula.working': '正在结合论文内容解释该公式…',
    'formula.empty': '暂无解释。', 'formula.failed': '无法解释该公式。',
    'section.drag': '拖动排序或移出功能栏', 'resize.split': '拖动调整上下两块的高度',
    // (v27) 功能卡片管理。
    'card.manage': '管理功能卡片', 'card.resetLayout': '恢复默认布局',
    'card.close': '关闭这张卡片', 'card.none': '所有功能卡片都已关闭——点上方 ⚙ 启用。',
    'card.dragHint': '松手放在页面上，或拖回功能栏停靠',
    'card.dockEmpty': '把浮动卡片拖回这里即可停靠。',
    'card.float': '浮动卡片', 'card.dock': '停靠到功能栏', 'card.floatingDrag': '拖动移动或停靠卡片',
    'card.remove': '移除卡片',
    'card.settings': '设置',
  'card.resize': '拖动可调整这张卡片的宽度',
  'card.floatResize': '拖动以调整浮动卡片大小',
  'card.resizeH': '拖动下边界可调整这张卡片的高度',
    // (v39) 阅读工具栏中的文中搜索框。
    'find.placeholder': '在文中搜索',
    'find.hint': '回车=下一个，Shift+回车=上一个，Esc=清空',
    'find.prev': '上一个匹配',
    'find.next': '下一个匹配',
    'find.clear': '清空搜索',
    'find.noMatches': '在这份 PDF 中没有找到匹配内容。',
    'find.searching': '正在文中搜索',
    'cards.title': '功能栏',
    'cards.stow': '收起功能栏', 'cards.show': '展开功能栏',
    'box.editHint': '拖动每个框下方的横条可单独调整高度',
    'references.title': '参考文献',
    'references.running': '处理中…',
    'references.run': '整理参考文献',
    'references.rerun': '重新整理参考文献',
    'references.missing': '未找到',
    'references.noText': '该 PDF 没有可提取的文本。请先做 OCR，或将参考文献粘贴到文本框。',
    // (v21 #2) 右侧「开始」面板里的启动入口。
    'guide.desc': '在右栏打开 CoReader',
  },
};
const extra = {
  'desktop.modelSettings': '模型设置',
  'summary.hostUnavailable': '论文分析服务暂不可用，请重新打开文献阅读器。',
  'figure.attachmentsRequired': '当前模型不支持图像输入。',
  'references.statusHint.none': '书目服务中没有找到符合条件的匹配。',
};
function translate(key, values) {
  const raw = extra[key] ?? dictionaries.zh[key] ?? dictionaries.en[key] ?? key;
  return String(raw).replace(/\{(\w+)\}/g, (match, name) => values?.[name] ?? match);
}
window.addEventListener('pagehide', flushSnapshot);
export {
  Reader, installCss, setHostScheme, translate, readReaderSettings, writeReaderSettings, subscribeReaderSettings,
  ALBUM_INTERVAL_MIN, ALBUM_INTERVAL_MAX, ALBUM_INTERVAL_OPTIONS, ALBUM_ORDER_OPTIONS, ALBUM_TRANSITION_OPTIONS,
  normalizeAlbumInterval, normalizeAlbumOrder, normalizeAlbumTransition,
};
