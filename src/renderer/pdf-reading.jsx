import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { postReader, readStore, writeStore } from './desktop-runtime.js';
import { blockForAnchor, bodyStyleOfLines, chapterRange, embeddedOutline, flattenOutline, headingOutline, outlineAt, paragraphBlocks,
  sourceScrollOffset } from './pdf-reading.mjs';
import { blockAtPoint, bookmarkWithNumber, insertMedia, lineInsideMedia, pdfGraphics, pdfMedia, protectMath, renderMedia, translationSource, viewportBounds } from './pdf-media.mjs';
import { composeMedia, formulaTextInBounds, readLayout, textOutsideMedia } from './pdf-layout.mjs';
import { EmptySkeleton, EmptyState } from './empty-state.jsx';
import './pdf-reading.css';

const api = window.reader;
const scopes = { page: '翻译本页', chapter: '翻译本章', paper: '翻译全文' };

export function usePdfReading({ paper, edition, ready, page, setPage, pdfState, pdfJob, container, readText, formatLines }) {
  const [mode, setMode] = useState('pdf');
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outline, setOutline] = useState({ status: 'loading', nodes: [] });
  const [target, setTarget] = useState(null);
  const [selectedParagraph, setSelectedParagraph] = useState(null);
  const [hover, setHover] = useState(null);
  const [ratio, setRatio] = useState(() => Math.min(72, Math.max(32, Number(readStore('pdf-compare-width', 52)) || 52)));
  const [translatedRead, setTranslatedRead] = useState(null);
  const outlineRequest = useRef(null);
  const anchor = useRef(null);
  const navigation = useRef(0);
  const owner = useRef('pdf');
  const restore = useRef(null);
  const originalScale = useRef(null);
  const isolatedPage = useRef(null);
  const currentMode = useRef(mode);
  currentMode.current = mode;

  useEffect(() => {
    setMode('pdf');
    setTarget(null);
    setSelectedParagraph(null);
    setHover(null);
    setTranslatedRead(null);
    setOutline({ status: 'loading', nodes: [] });
    anchor.current = null;
    restore.current = null;
    originalScale.current = null;
    owner.current = 'pdf';
    return () => {
      outlineRequest.current?.abort.abort();
      outlineRequest.current = null;
    };
  }, [paper, edition]);

  async function loadMedia(number, job = pdfJob.current) {
    if (!job || job.paper !== paper) throw new Error('PDF 尚未就绪。');
    const contents = await readText(job, number);
    if (job !== pdfJob.current) throw new Error('当前文献已切换。');
    contents.readingMedia ||= (async () => {
      const proxy = await job.pdf.getPage(number);
      const [operators, regions] = await Promise.all([
        proxy.getOperatorList().catch(() => ({ fnArray: [], argsArray: [] })),
        readLayout(proxy, (pixels) => api.parallelLayout(pixels)).catch(() => []),
      ]);
      if (job !== pdfJob.current) throw new Error('当前文献已切换。');
      const { view, items } = contents;
      const positioned = contents.readingLines ||= formatLines(items);
      const graphics = pdfGraphics(operators, pdfState.current.pdfjsLib.OPS, view, positioned.length > 0);
      const inlineMathBounds = positioned.flatMap((line) => line.inlineMathBounds);
      return composeMedia(regions, items, pdfMedia(positioned, items, graphics, view), view, inlineMathBounds).map((asset) => (
        asset.kind === 'formula'
          ? { ...asset, formulaText: asset.layout === 'geometry' ? asset.label : formulaTextInBounds(items, asset.bounds) }
          : asset
      ));
    })();
    return contents.readingMedia;
  }

  async function loadBlocks(number, job = pdfJob.current) {
    if (!job || job.paper !== paper) throw new Error('PDF 尚未就绪。');
    const contents = await readText(job, number);
    if (job !== pdfJob.current) throw new Error('当前文献已切换。');
    contents.readingBlocks ||= (async () => {
      const assets = await loadMedia(number, job);
      const { view, items } = contents;
      const bodyLines = assets.length ? formatLines(textOutsideMedia(items, assets)) : contents.readingLines;
      const paragraphs = paragraphBlocks(bodyLines.filter((line, index) => !lineInsideMedia(line, assets, bodyLines[index - 1])), view)
        .map((block) => ({ ...block, parts: protectMath(block.text, block.inlineMath) }));
      return insertMedia(paragraphs, assets);
    })();
    return contents.readingBlocks;
  }

  async function getAssets(number, blocks, signal) {
    const job = pdfJob.current;
    if (!job || job.paper !== paper) throw new Error('PDF 尚未就绪。');
    const proxy = await job.pdf.getPage(number);
    signal.throwIfAborted();
    return renderMedia(proxy, blocks, signal);
  }

  function loadOutline() {
    const job = pdfJob.current;
    if (!job || job.paper !== paper) return Promise.resolve(null);
    if (outlineRequest.current?.job === job) return outlineRequest.current.result;
    const abort = new AbortController();
    setOutline({ status: 'loading', nodes: [] });
    const result = (async () => {
      const signal = abort.signal;
      let nodes = await embeddedOutline(job.pdf, signal).catch((error) => {
        signal.throwIfAborted();
        return [];
      });
      if (nodes.length) {
        const addNumbers = (entries) => Promise.all(entries.map(async (entry) => {
          signal.throwIfAborted();
          const contents = await readText(job, entry.page).catch(() => null);
          const titled = contents ? bookmarkWithNumber(entry, contents.positioned) : entry;
          return { ...titled, children: await addNumbers(entry.children) };
        }));
        nodes = await addNumbers(nodes);
      } else {
        const pages = [];
        for (let number = 1; number <= job.pdf.numPages; number++) {
          signal.throwIfAborted();
          const contents = await readText(job, number).catch(() => null);
          if (contents) pages.push({ number, ...contents });
          if (number % 3 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const bodyStyle = bodyStyleOfLines(pages.flatMap((page) => page.positioned));
        const headings = [];
        for (const page of pages) {
          for (const block of paragraphBlocks(page.positioned, page.view, bodyStyle)) {
            if (block.heading) headings.push({ ...block, page: page.number });
          }
        }
        nodes = headingOutline(headings);
      }
      signal.throwIfAborted();
      if (job !== pdfJob.current) return null;
      const entries = flattenOutline(nodes);
      const value = { status: 'ready', entries,
        nodes: nodes.length ? nodes : Array.from({ length: job.pdf.numPages }, (_, index) => ({
          title: '第 ' + (index + 1) + ' 页', id: 'page-' + (index + 1), page: index + 1, children: [],
        })) };
      setOutline(value);
      return value;
    })().catch(() => {
      if (abort.signal.aborted || job !== pdfJob.current) return null;
      outlineRequest.current = null;
      setOutline({ status: 'error', nodes: [] });
      return null;
    });
    outlineRequest.current = { job, abort, result };
    return result;
  }

  useEffect(() => {
    if (ready && outlineOpen) loadOutline();
  }, [ready, outlineOpen, paper, edition]);

  function originalLocation() {
    const viewer = pdfState.current?.viewer;
    const page = viewer?.currentPageNumber;
    const frame = container.current;
    const view = page && viewer.getPageView(page - 1);
    if (!view?.div || !frame || !view.viewport) return { page: page || 1 };
    const box = view.div.getBoundingClientRect();
    const bounds = frame.getBoundingClientRect();
    const px = Math.min(view.viewport.width, Math.max(0, bounds.left + bounds.width * .22 - box.left));
    const py = Math.min(view.viewport.height, Math.max(0, bounds.top + 24 - box.top));
    const [x, y] = view.viewport.convertToPdfPoint(px, py);
    return { page, x, y };
  }

  function setAnchor(next) {
    anchor.current = next;
    setTarget(next);
    setTranslatedRead(null);
  }

  function goOriginal(location) {
    const viewer = pdfState.current?.viewer;
    if (!viewer || !location?.page || location.page > viewer.pagesCount) return;
    if (Number.isFinite(location.y)) {
      viewer.scrollPageIntoView({
        pageNumber: location.page, ignoreDestinationZoom: true,
        destArray: [null, { name: 'XYZ' }, Number.isFinite(location.x) ? location.x : null, location.y, null],
      });
    } else {
      viewer.currentPageNumber = location.page;
    }
  }

  function isolateOriginalPage(view) {
    const node = view?.div || null;
    if (isolatedPage.current !== node) {
      isolatedPage.current?.removeAttribute('data-elr-source-page');
      isolatedPage.current = node;
      node?.setAttribute('data-elr-source-page', '');
    }
    container.current?.toggleAttribute('data-elr-single-source', Boolean(node));
  }

  function keepOriginalInView(location, align = false, fitParagraph = false) {
    const frame = container.current;
    const viewer = pdfState.current?.viewer;
    const view = viewer?.getPageView(location.page - 1);
    if (!frame || !view?.viewport || !frame.clientHeight) {
      goOriginal(location);
      return;
    }
    isolateOriginalPage(view);
    const paper = view.div.getBoundingClientRect();
    const viewport = frame.getBoundingClientRect();
    const pageTop = frame.scrollTop + paper.top + view.div.clientTop - viewport.top - frame.clientTop;
    const pageLeft = frame.scrollLeft + paper.left + view.div.clientLeft - viewport.left - frame.clientLeft;
    const height = frame.clientHeight;
    const capsule = frame.closest('.elr-reading-space')?.querySelector('.elr-reader-capsule');
    const inset = Math.min((capsule?.offsetHeight || 32) + 16, height * .18);
    const hasPosition = Number.isFinite(location.y);
    const x = Number.isFinite(location.x) ? location.x : view.viewport.viewBox[0];
    const bounds = hasPosition
      ? viewportBounds(view.viewport, [x, location.bottom ?? location.y, location.right ?? x, location.y])
      : null;
    const focusTop = bounds ? pageTop + Math.min(bounds[1], bounds[3]) : undefined;
    const focusBottom = bounds ? pageTop + Math.max(bounds[1], bounds[3]) : undefined;
    if (fitParagraph && bounds) {
      const factor = Math.min(1, (height - 2 * inset) / Math.max(1, Math.abs(bounds[3] - bounds[1])),
        (frame.clientWidth - 28) / Math.max(1, Math.abs(bounds[2] - bounds[0])));
      if (factor < .995) {
        viewer.currentScale *= Math.max(.05 / viewer.currentScale, factor);
        keepOriginalInView(location, align);
        return;
      }
    }
    const desiredTop = align && bounds ? (focusTop + focusBottom - height) / 2 : frame.scrollTop;
    const top = view.div.clientHeight < height
      ? Math.max(0, pageTop - (height - view.div.clientHeight) / 2)
      : sourceScrollOffset(desiredTop,
          pageTop, pageTop + view.div.clientHeight, height, focusTop, focusBottom, inset);
    if (Math.abs(frame.scrollTop - top) > .5) frame.scrollTop = top;
    if (bounds && Number.isFinite(location.x) && view.div.clientWidth > frame.clientWidth) {
      const left = sourceScrollOffset(frame.scrollLeft, pageLeft, pageLeft + view.div.clientWidth, frame.clientWidth,
        pageLeft + Math.min(bounds[0], bounds[2]), pageLeft + Math.max(bounds[0], bounds[2]), 14);
      if (Math.abs(frame.scrollLeft - left) > .5) frame.scrollLeft = left;
    }
  }

  function jump(location) {
    owner.current = 'navigation';
    setAnchor({ ...location, navigation: ++navigation.current });
    setPage(location.page);
    if (currentMode.current === 'compare') keepOriginalInView(location, true);
    else if (currentMode.current === 'pdf') goOriginal(location);
  }

  function changeMode(next) {
    if (next === mode) return;
    setHover(null);
    setSelectedParagraph(null);
    let location = anchor.current?.page === page ? anchor.current : { page };
    if (['pdf', 'compare'].includes(mode) && owner.current === 'pdf') location = originalLocation();
    restore.current = location;
    owner.current = 'navigation';
    setAnchor(location);
    setPage(location.page);
    setMode(next);
  }

  function showSource(location, keepCompare = true) {
    if (!location && ['pdf', 'compare'].includes(currentMode.current)) {
      owner.current = 'pdf';
      return;
    }
    const next = keepCompare && currentMode.current === 'compare' ? 'compare' : 'pdf';
    if (location) jump(location);
    if (next !== currentMode.current) {
      if (location) restore.current = location;
      else owner.current = 'pdf';
      setMode(next);
    }
  }

  function locateSource(location) {
    if (currentMode.current !== 'compare') {
      showSource(location);
      return;
    }
    owner.current = 'navigation';
    setSelectedParagraph(Number.isInteger(location.index) ? { page: location.page, index: location.index } : null);
    setAnchor({ ...location, navigation: ++navigation.current, preserveTranslationScroll: true });
    setPage(location.page);
    const viewer = pdfState.current?.viewer;
    if (viewer && viewer.currentPageNumber !== location.page) viewer.currentPageNumber = location.page;
    keepOriginalInView(location, true, true);
  }

  useLayoutEffect(() => {
    if (mode !== 'compare' || !ready) isolateOriginalPage();
    return () => isolateOriginalPage();
  }, [mode, ready, paper, edition]);

  useLayoutEffect(() => {
    const viewer = pdfState.current?.viewer;
    if (!viewer || !ready) return;
    if (mode === 'compare' && originalScale.current === null) {
      originalScale.current = viewer.currentScale;
      viewer.currentScaleValue = 'page-width';
    } else if (mode !== 'compare' && originalScale.current !== null) {
      viewer.currentScale = originalScale.current;
      originalScale.current = null;
    }
    if (restore.current && ['pdf', 'compare'].includes(mode)) {
      const location = restore.current;
      restore.current = null;
      if (mode === 'compare') keepOriginalInView(location, true);
      else goOriginal(location);
    } else {
      restore.current = null;
    }
  }, [mode, ready]);

  useEffect(() => {
    if (mode !== 'compare' || !ready) return;
    const frame = container.current;
    const bus = pdfState.current?.eventBus;
    if (!frame || !bus) return;
    let pending = 0;
    const track = () => {
      if (pending || owner.current !== 'translation') return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        if (owner.current === 'translation' && anchor.current) keepOriginalInView(anchor.current);
      });
    };
    const resize = new ResizeObserver(track);
    resize.observe(frame);
    bus.on('scalechanging', track);
    return () => {
      cancelAnimationFrame(pending);
      resize.disconnect();
      bus.off('scalechanging', track);
    };
  }, [mode, ready, edition]);

  useEffect(() => {
    if (!ready || (mode !== 'compare' && (mode !== 'pdf' || !outlineOpen))) return;
    const node = container.current;
    if (!node) return;
    let frame = 0;
    const takeControl = () => { owner.current = 'pdf'; };
    const track = () => {
      if (frame || owner.current !== 'pdf') return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (owner.current !== 'pdf') return;
        const location = originalLocation();
        const prior = anchor.current;
        if (prior?.page === location.page && Math.abs(prior.y - location.y) < 10 && Math.abs(prior.x - location.x) < 12) return;
        setAnchor(location);
      });
    };
    const inputs = ['wheel', 'pointerdown', 'keydown'];
    for (const kind of inputs) node.addEventListener(kind, takeControl, { passive: true });
    node.addEventListener('scroll', track, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      for (const kind of inputs) node.removeEventListener(kind, takeControl);
      node.removeEventListener('scroll', track);
    };
  }, [mode, ready, outlineOpen, edition]);

  useEffect(() => {
    if (mode !== 'compare' || !ready) return;
    const frame = container.current;
    const viewer = pdfState.current?.viewer;
    if (!frame || !viewer) return;
    let request;
    let pending = 0;
    let clickRequest = 0;
    let down;
    const clear = () => {
      cancelAnimationFrame(pending);
      pending = 0;
      setHover(null);
    };
    const hitPoint = (pageElement, page, clientX, clientY) => {
      const view = viewer.getPageView(page - 1);
      const box = pageElement.querySelector('.canvasWrapper')?.getBoundingClientRect();
      if (!view?.viewport || !box?.width || !box.height) return null;
      return view.viewport.convertToPdfPoint((clientX - box.left) * view.viewport.width / box.width,
        (clientY - box.top) * view.viewport.height / box.height);
    };
    const move = (event) => {
      cancelAnimationFrame(pending);
      const pageElement = event.target.closest('.page[data-page-number]');
      if (!pageElement || event.buttons) {
        clear();
        return;
      }
      const page = Number(pageElement.dataset.pageNumber);
      if (request?.page !== page) {
        const entry = { page, blocks: null };
        request = entry;
        loadBlocks(page).then((blocks) => { entry.blocks = blocks; }).catch(() => { if (request === entry) request = null; });
      }
      const { clientX, clientY } = event;
      pending = requestAnimationFrame(() => {
        const point = hitPoint(pageElement, page, clientX, clientY);
        const block = point && request?.page === page && request.blocks && blockAtPoint(request.blocks, ...point);
        setHover((previous) => block ? previous?.page === page && previous.block === block ? previous : { page, block } : null);
      });
    };
    const pointerDown = (event) => {
      clickRequest++;
      down = { x: event.clientX, y: event.clientY };
      clear();
    };
    const click = async (event) => {
      const ticket = ++clickRequest;
      if (event.button !== 0 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey
        || frame.classList.contains('elr-picking-figure') || event.target.closest('a, button, .annotationLayer')
        || (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && frame.contains(selection.anchorNode)) return;
      const pageElement = event.target.closest('.page[data-page-number]');
      if (!pageElement) return;
      const number = Number(pageElement.dataset.pageNumber);
      const point = hitPoint(pageElement, number, event.clientX, event.clientY);
      if (!point) return;
      const blocks = await loadBlocks(number).catch(() => null);
      if (!blocks || ticket !== clickRequest || currentMode.current !== 'compare'
        || frame.classList.contains('elr-picking-figure')) return;
      const block = blockAtPoint(blocks, ...point);
      if (!block || block.kind) return;
      owner.current = 'navigation';
      setSelectedParagraph({ page: number, index: block.index });
      setAnchor({ page: number, index: block.index, x: block.x, y: block.y, right: block.right, bottom: block.bottom,
        centerTranslation: true, navigation: ++navigation.current });
      setPage(number);
    };
    const scrolled = () => { clickRequest++; clear(); };
    frame.addEventListener('pointermove', move, { passive: true });
    frame.addEventListener('pointerleave', clear);
    frame.addEventListener('scroll', scrolled, { passive: true });
    frame.addEventListener('pointerdown', pointerDown, { passive: true });
    frame.addEventListener('click', click);
    const bus = pdfState.current.eventBus;
    bus.on('scalechanging', clear);
    const resize = new ResizeObserver(clear);
    resize.observe(frame);
    return () => {
      clear();
      resize.disconnect();
      bus.off('scalechanging', clear);
      clickRequest++;
      frame.removeEventListener('pointermove', move);
      frame.removeEventListener('pointerleave', clear);
      frame.removeEventListener('scroll', scrolled);
      frame.removeEventListener('pointerdown', pointerDown);
      frame.removeEventListener('click', click);
    };
  }, [paper, edition, mode, ready]);

  useLayoutEffect(() => {
    if (mode !== 'compare' || !hover) return;
    const view = pdfState.current?.viewer.getPageView(hover.page - 1);
    if (!view?.div || !view.viewport) return;
    const layer = document.createElement('div');
    layer.className = 'elr-pdf-hover-layer';
    layer.setAttribute('aria-hidden', 'true');
    for (const rect of hover.block.boxes || [hover.block.bounds]) {
      const [x1, y1, x2, y2] = viewportBounds(view.viewport, rect);
      const marker = document.createElement('span');
      Object.assign(marker.style, {
        left: Math.min(x1, x2) + 'px', top: Math.min(y1, y2) + 'px',
        width: Math.abs(x2 - x1) + 'px', height: Math.abs(y2 - y1) + 'px',
      });
      layer.append(marker);
    }
    view.div.append(layer);
    return () => layer.remove();
  }, [mode, hover]);

  function onOriginalPage(number) {
    if (currentMode.current === 'pdf') setPage(number);
    if (currentMode.current === 'compare' && owner.current === 'pdf') {
      isolateOriginalPage(pdfState.current?.viewer.getPageView(number - 1));
      setPage(number);
    }
  }

  function followTranslation(location) {
    if (owner.current !== 'translation') return;
    anchor.current = location;
    if (location.page !== page) setPage(location.page);
    if (outlineOpen) setTranslatedRead(location);
    if (currentMode.current === 'compare') keepOriginalInView(location);
  }

  async function getChapter() {
    const currentLocation = anchor.current?.page === page ? anchor.current : { page };
    const value = await loadOutline();
    return value ? chapterRange(value.entries, currentLocation, pdfJob.current?.pdf.numPages || page) : null;
  }

  const currentLocation = translatedRead?.page === page ? translatedRead : target?.page === page ? target : { page };
  const current = outline.entries?.length ? outlineAt(outline.entries, currentLocation)?.id : 'page-' + page;
  return { mode, changeMode, showSource, locateSource, outline, outlineOpen, setOutlineOpen, loadOutline, loadBlocks, getChapter,
    target, current, ratio, jump, onOriginalPage, followTranslation, selectedParagraph, hover, setHover, getAssets, loadMedia,
    useTranslation: () => {
      const changed = owner.current !== 'translation';
      owner.current = 'translation';
      return changed;
    },
    setRatio: (value) => { setRatio(value); writeStore('pdf-compare-width', value); }, originalScale: originalScale.current };
}

const originalPageSelector = '.pdfViewer .page[data-page-number]';

function mediaHit(page, view, assets, x, y) {
  const { viewport, div } = view;
  const canvas = div.querySelector('.canvasWrapper')?.getBoundingClientRect();
  if (!canvas?.width || !canvas.height) return null;
  const point = viewport.convertToPdfPoint((x - canvas.left) * viewport.width / canvas.width,
    (y - canvas.top) * viewport.height / canvas.height);
  const block = blockAtPoint(assets, ...point);
  if (!block) return null;
  const [x1, y1, x2, y2] = viewportBounds(viewport, block.bounds);
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  const crop = { x: left / viewport.width, y: top / viewport.height, w: width / viewport.width, h: height / viewport.height };
  const rect = { left: canvas.left + crop.x * canvas.width, top: canvas.top + crop.y * canvas.height };
  rect.right = rect.left + crop.w * canvas.width;
  rect.bottom = rect.top + crop.h * canvas.height;
  return { page, node: div, block, rect, crop, rotation: viewport.rotation };
}

export function useOriginalPdfMedia({ enabled, paper, edition, container, pdfState, loadMedia }) {
  const [hover, setHover] = useState(null);
  const pageAt = (target) => {
    const node = target?.closest?.(originalPageSelector);
    const page = Number(node?.dataset.pageNumber);
    const view = node && container.current?.contains(node) && pdfState.current?.viewer.getPageView(page - 1);
    return view?.viewport ? { page, view } : null;
  };
  const find = async (event) => {
    const location = enabled && pageAt(event.target);
    if (!location) return null;
    const { clientX, clientY } = event;
    const assets = await loadMedia(location.page).catch(() => []);
    if (!location.view.div.isConnected) return null;
    return mediaHit(location.page, location.view, assets, clientX, clientY);
  };

  useEffect(() => {
    const frame = container.current;
    const bus = pdfState.current?.eventBus;
    if (!enabled || !frame || !bus) return;
    let latest = null;
    let pending = 0;
    let request = null;
    const clear = () => {
      latest = null;
      cancelAnimationFrame(pending);
      pending = 0;
      setHover(null);
    };
    const paint = () => {
      pending = 0;
      if (!latest) return;
      const { page, view, x, y } = latest;
      if (request?.page !== page) {
        const task = { page, assets: null };
        request = task;
        loadMedia(page).catch(() => []).then((assets) => {
          if (request !== task) return;
          task.assets = assets;
          if (latest?.page === page && !pending) pending = requestAnimationFrame(paint);
        });
      }
      const hit = request.assets && mediaHit(page, view, request.assets, x, y);
      setHover((previous) => hit?.block === previous?.block && hit?.node === previous?.node ? previous : (hit || null));
    };
    const overAction = (event) => event.target?.closest?.('.elr-pdf-media-action');
    const move = (event) => {
      if (overAction(event)) return;
      const location = !event.ctrlKey && !event.buttons && event.pointerType !== 'touch' && pageAt(event.target);
      if (!location) { clear(); return; }
      latest = { ...location, x: event.clientX, y: event.clientY };
      if (!pending) pending = requestAnimationFrame(paint);
    };
    const down = (event) => { if (!overAction(event)) clear(); };
    const resize = new ResizeObserver(clear);
    resize.observe(frame);
    frame.addEventListener('pointermove', move, { passive: true });
    frame.addEventListener('pointerdown', down, { passive: true });
    frame.addEventListener('pointerleave', clear);
    frame.addEventListener('scroll', clear, { passive: true });
    bus.on('scalechanging', clear);
    return () => {
      request = null;
      clear();
      resize.disconnect();
      frame.removeEventListener('pointermove', move);
      frame.removeEventListener('pointerdown', down);
      frame.removeEventListener('pointerleave', clear);
      frame.removeEventListener('scroll', clear);
      bus.off('scalechanging', clear);
    };
  }, [enabled, paper, edition]);
  return { hover: enabled ? hover : null, find };
}

export function OriginalPdfMediaAction({ hit, container, label, onExplain }) {
  if (!hit || !container || !hit.node.isConnected) return null;
  const bounds = container.getBoundingClientRect();
  const page = hit.node.getBoundingClientRect();
  const size = 26;
  const top = Math.max(bounds.top + 2, page.top + hit.node.clientTop);
  const bottom = Math.min(bounds.top + container.clientHeight - 2, page.bottom);
  const left = Math.max(bounds.left + 2, page.left + hit.node.clientLeft);
  const right = Math.min(bounds.left + container.clientWidth - 2, page.right);
  if (right - left < size || bottom - top < size) return null;
  const anchorY = hit.rect.top - size + 5 >= top ? hit.rect.top - size + 5 : hit.rect.bottom - 5;
  const x = Math.max(left, Math.min(right - size, hit.rect.right - size));
  const y = Math.max(top, Math.min(bottom - size, anchorY));
  const originX = page.left + hit.node.clientLeft;
  const originY = page.top + hit.node.clientTop;
  return createPortal(<div className="elr-pdf-hover-layer elr-pdf-media-layer" data-kind={hit.block.kind}>
    <span aria-hidden="true" style={{
      left: hit.rect.left - originX, top: hit.rect.top - originY,
      width: hit.rect.right - hit.rect.left, height: hit.rect.bottom - hit.rect.top,
    }} />
    <button type="button" className="elr-pdf-media-action" title={label} aria-label={label}
      style={{ left: x - originX, top: y - originY }}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => onExplain(hit)}>
      {hit.block.kind === 'formula' ? <i aria-hidden="true">ƒ</i> : (
        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="3" y="3" width="14" height="14" rx="2" />
          {hit.block.kind === 'table' ? <path d="M3 8h14M3 12h14M9 3v14" /> : <path d="M3 14l5-5 4 4 2-2 3 3" />}
        </svg>
      )}
    </button>
  </div>, hit.node);
}

export function PdfOutline({ id, open = true, nodes, current, status, onJump, onRetry }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  function toggle(id) {
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function render(entries) {
    return <ul>{entries.map((entry) => <li key={entry.id}>
      <div className="elr-outline-row">
        {entry.children.length ? <button className="elr-outline-toggle" type="button" onClick={() => toggle(entry.id)}
          aria-expanded={!collapsed.has(entry.id)} aria-label={(collapsed.has(entry.id) ? '展开 ' : '折叠 ') + entry.title}>
          {collapsed.has(entry.id) ? '▸' : '▾'}
        </button> : <span className="elr-outline-toggle" />}
        <button type="button" className="elr-outline-link" onClick={() => onJump(entry)}
          aria-current={current === entry.id ? 'location' : undefined} title={entry.title}>
          <span>{entry.title}</span><small>{entry.page}</small>
        </button>
      </div>
      {!collapsed.has(entry.id) && entry.children.length > 0 && render(entry.children)}
    </li>)}</ul>;
  }
  return <aside id={id} className={'elr-pdf-outline' + (open ? ' is-open' : ' is-closed')}
    aria-label="文献目录" aria-hidden={!open || undefined} inert={!open}>
    <header><h2>目录</h2></header>
    <nav aria-label="章节导航">
      {status === 'loading' && <EmptySkeleton variant="outline" rows={6} label="正在读取目录…" />}
      {status === 'error' && <EmptyState size="card" icon="alert" title="无法读取目录"
        primaryAction={{ label: '重试', retry: true, onClick: onRetry }} />}
      {status === 'ready' && (nodes.length > 0 ? render(nodes)
        : <EmptyState size="card" icon="list" title="这篇 PDF 没有目录" />)}
    </nav>
  </aside>;
}

export function PdfSplitHandle({ stage, ratio, onChange, onInteraction }) {
  const drag = useRef(null);
  const clampRatio = (value) => Math.max(32, Math.min(72, Math.round(value)));
  const move = (event) => {
    const pointer = drag.current;
    if (pointer?.id !== event.pointerId) return;
    pointer.pending = clampRatio((event.clientX - pointer.left) * 100 / pointer.width);
    if (!pointer.frame) pointer.frame = requestAnimationFrame(() => {
      pointer.frame = 0;
      stage.current?.style.setProperty('--elr-original-width', pointer.pending + '%');
    });
  };
  const end = (event) => {
    const pointer = drag.current;
    if (pointer?.id !== event.pointerId) return;
    cancelAnimationFrame(pointer.frame);
    drag.current = null;
    stage.current?.style.setProperty('--elr-original-width', pointer.pending + '%');
    onChange(pointer.pending);
  };
  return <div className="elr-pdf-parallel-divider" role="separator" aria-label="调整原文和译文宽度"
    aria-orientation="vertical" aria-valuemin={32} aria-valuemax={72} aria-valuenow={ratio} tabIndex={0}
    onPointerDown={(event) => {
      const box = stage.current?.getBoundingClientRect();
      if (event.button !== 0 || !box?.width) return;
      onInteraction?.();
      drag.current = { id: event.pointerId, left: box.left, width: box.width, pending: ratio, frame: 0 };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    }} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
    onKeyDown={(event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      onInteraction?.();
      onChange(clampRatio(ratio + (event.key === 'ArrowLeft' ? -3 : 3)));
    }} />;
}

function translationIndex(block) {
  return 30001 + block.index;
}

function savedTranslation(page, block) {
  const source = translationSource(block);
  const record = page.translations.get(translationIndex(block));
  return record?.source === source ? record : page.bySource.get(source);
}

export function PdfTranslations({ paper, page, pageCount, mode, autoTranslatePaper = false, target, selectedParagraph, surfaceRef, loadBlocks, getChapter, getModel,
  onRead, onUserInput, onOriginal, onPage, getAssets, hover, onHover }) {
  const scroll = useRef(null);
  const actions = useRef(null);
  const latest = useRef(null);
  const pendingFrame = useRef(0);
  const cache = useRef(new Map());
  const operation = useRef(null);
  const mounted = useRef(false);
  const autoStarted = useRef(false);
  const lastTarget = useRef(null);
  const sheetHeights = useRef(new Map());
  const centeredLayout = useRef(null);
  const [results, setResults] = useState({});
  const [task, setTask] = useState(null);
  const [problem, setProblem] = useState('');
  const [failure, setFailure] = useState(null);
  const [, setRevision] = useState(0);
  const hasParagraphs = results[page]?.data?.blocks.some((block) => !block.kind);
  const targetPage = target?.page || page;
  const centerTranslation = mode === 'compare' && Boolean(target?.centerTranslation);
  const targetView = results[targetPage]?.data;
  const currentBlock = useMemo(() => targetView && blockForAnchor(targetView.blocks, target), [targetView, target]);

  function load(pageNumber) {
    const pages = cache.current;
    if (pages.has(pageNumber)) return pages.get(pageNumber);
    const request = Promise.all([loadBlocks(pageNumber), api.parallelPage(paper, pageNumber)]).then(([blocks, stored]) => ({
      blocks, translations: new Map(stored.map((item) => [item.index, item])),
      bySource: new Map(stored.map((item) => [item.source, item])),
    }));
    pages.set(pageNumber, request);
    if (pages.size > 32) pages.delete(pages.keys().next().value);
    request.catch(() => { if (pages.get(pageNumber) === request) pages.delete(pageNumber); });
    return request;
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
      cancelAnimationFrame(pendingFrame.current);
    };
  }, []);

  useEffect(() => {
    if (task || failure || !problem) return;
    const timer = setTimeout(() => setProblem(''), 4500);
    return () => clearTimeout(timer);
  }, [task, failure, problem]);

  useEffect(() => {
    if (mode === 'pdf') {
      lastTarget.current = null;
      latest.current = null;
      return;
    }
    let active = true;
    const nearby = [page, page + 1, page - 1].filter((number) => number >= 1 && number <= pageCount);
    setResults((previous) => Object.fromEntries(nearby.filter((number) => previous[number]).map((number) => [number, previous[number]])));
    async function prepare() {
      for (const number of nearby) {
        if (!active) break;
        const result = await load(number).then((data) => ({ data }), (error) => ({ error: error.message }));
        if (active) setResults((previous) => previous[number]?.data && previous[number].data === result.data
          ? previous : { ...previous, [number]: result });
      }
    }
    prepare();
    return () => { active = false; };
  }, [mode === 'pdf', page, pageCount]);

  useLayoutEffect(() => {
    const node = scroll.current;
    if (!node || (mode === 'compare' && target?.preserveTranslationScroll)) return;
    const sheet = node.children[targetPage - 1];
    const row = currentBlock && sheet?.querySelector('[data-pdf-paragraph="' + currentBlock.index + '"]');
    const previous = lastTarget.current;
    const id = [mode, targetPage, target?.navigation, currentBlock?.index].join(':');
    if (previous?.id === id || (previous?.target === target && previous?.ready && previous?.page !== page)) return;
    lastTarget.current = { id, target, page: targetPage, ready: Boolean(targetView) };
    latest.current = targetPage + ':' + (currentBlock?.index ?? '');
    const destination = target && (Number.isFinite(target.y) || Number.isInteger(target.index)) ? row || sheet : sheet;
    if (destination === sheet && sheet) node.scrollTop = sheet.offsetTop - 4;
    if (destination === row && row && !centerTranslation) {
      const controls = actions.current?.getBoundingClientRect();
      const inset = controls ? Math.min(controls.bottom - node.getBoundingClientRect().top + 8, node.clientHeight * .38) : 10;
      node.scrollTop = Math.max(sheet.offsetTop - 4, row.offsetTop - inset);
    }
  }, [mode, page, target, targetPage, currentBlock, targetView, centerTranslation]);

  useLayoutEffect(() => {
    const node = scroll.current;
    const sheet = node?.children[targetPage - 1];
    if (!centerTranslation || !currentBlock) return;
    const row = sheet?.querySelector('[data-pdf-paragraph="' + currentBlock.index + '"]');
    if (!row) return;
    const align = () => {
      const pane = node.getBoundingClientRect();
      const bounds = row.getBoundingClientRect();
      const delta = bounds.top + bounds.height / 2 - (pane.top + node.clientTop + node.clientHeight / 2);
      if (Math.abs(delta) > 1) node.scrollTop += delta;
    };
    align();
    const resize = new ResizeObserver(align);
    resize.observe(node);
    resize.observe(sheet);
    resize.observe(row);
    if (sheet.previousElementSibling) resize.observe(sheet.previousElementSibling);
    centeredLayout.current = resize;
    return () => {
      resize.disconnect();
      centeredLayout.current = null;
    };
  }, [centerTranslation, targetPage, currentBlock, target?.navigation]);

  function scrollChanged() {
    onHover(null);
    if (pendingFrame.current) return;
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = 0;
      const node = scroll.current;
      if (!node) return;
      const top = node.scrollTop;
      const line = top + Math.min(56, node.clientHeight * .15);
      // Page shells stay in the scroll flow even when their text and images are unloaded.
      let low = 0;
      let high = node.children.length - 1;
      if (top > 0 && top + node.clientHeight >= node.scrollHeight - 1) low = high;
      while (low < high) {
        const middle = (low + high + 1) >> 1;
        // Advance only when the next sheet reaches the top of the translation pane.
        if (node.children[middle].offsetTop <= top + 1) low = middle;
        else high = middle - 1;
      }
      const sheet = node.children[low];
      if (!sheet) return;
      const page = Number(sheet.dataset.pdfSheet);
      const rows = sheet.querySelectorAll('[data-pdf-paragraph]');
      const nearest = Array.from(rows).find((row) => row.offsetTop + row.offsetHeight > line) || rows[rows.length - 1];
      const index = nearest ? Number(nearest.dataset.pdfParagraph) : undefined;
      const key = page + ':' + (index ?? '');
      if (latest.current === key) return;
      latest.current = key;
      const block = results[page]?.data?.blocks[index];
      onRead(block ? { page, x: block.x, y: block.y, right: block.right, bottom: block.bottom, index } : { page });
    });
  }

  function takeTranslationControl() {
    centeredLayout.current?.disconnect();
    if (onUserInput()) latest.current = null;
  }

  async function translateBlock(block, selectedModel, signal) {
    const parts = block.parts || [{ text: block.text }];
    let model = '';
    let text = '';
    for (const part of parts) {
      signal.throwIfAborted();
      if (part.math || !/\p{L}{2}/u.test(part.text)) {
        text += part.text;
        continue;
      }
      const translated = await postReader('/translate', {
        ...selectedModel, text: part.text.trim(),
      }, 300000, signal);
      if (!translated?.ok || typeof translated.text !== 'string' || !translated.text.trim()) {
        throw new Error(translated?.error || '翻译未返回正文。');
      }
      model = translated.modelName || translated.model || model;
      text += (part.text.match(/^\s+/)?.[0] || '') + translated.text.trim() + (part.text.match(/\s+$/)?.[0] || '');
    }
    return { text: text.trim(), model };
  }

  async function translate(scope, only, startPage = page, { auto = false } = {}) {
    if (operation.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    operation.current = controller;
    const selectedModel = getModel();
    setProblem('');
    setFailure(null);
    setTask({ page: startPage, index: only?.index, done: 0 });
    let total = 0;
    let location = { page: startPage, index: only?.index };
    try {
      const range = scope === 'paper' ? { firstPage: 1, lastPage: pageCount }
        : scope === 'chapter' ? await getChapter() : { firstPage: startPage, lastPage: startPage };
      signal.throwIfAborted();
      if (!range) throw new Error('此 PDF 没有可用章节，可选择翻译本页或全文。');
      for (let number = range.firstPage; number <= range.lastPage; number++) {
        signal.throwIfAborted();
        location = { page: number };
        const data = await load(number);
        const start = range.start?.page === number ? blockForAnchor(data.blocks, range.start)?.index : undefined;
        const end = range.end?.page === number ? blockForAnchor(data.blocks, range.end)?.index : undefined;
        const blocks = only ? [only] : data.blocks.slice(start ?? 0, end ?? data.blocks.length).filter((block) => !block.kind);
        for (const block of blocks) {
          signal.throwIfAborted();
          if (!only && savedTranslation(data, block)) continue;
          location = { page: number, index: block.index };
          setTask({ ...location, done: total, last: range.lastPage });
          const translated = await translateBlock(block, selectedModel, signal);
          signal.throwIfAborted();
          const record = await api.saveParallelBlock(paper, number, {
            index: translationIndex(block), source: translationSource(block), ...translated,
          });
          data.translations.set(record.index, record);
          data.bySource.set(record.source, record);
          if (mounted.current) { total++; setRevision((previous) => previous + 1); }
        }
      }
      if (mounted.current && (total || !auto)) {
        setProblem(total ? '已保存 ' + total + ' 段译文。' : '所选范围没有待翻译的段落。');
      }
    } catch (error) {
      if (mounted.current) {
        if (signal.aborted) setProblem('已暂停，可以继续翻译剩余段落。');
        else {
          setFailure({ ...location, text: error.message });
          setProblem('第 ' + location.page + ' 页未完成。已保留成功的译文。');
        }
      }
    } finally {
      if (operation.current === controller) operation.current = null;
      if (mounted.current) setTask(null);
    }
  }

  useEffect(() => {
    if (!autoTranslatePaper) {
      autoStarted.current = false;
      return;
    }
    if (autoStarted.current || !pageCount || operation.current) return;
    autoStarted.current = true;
    void translate('paper', null, page, { auto: true });
  }, [autoTranslatePaper, pageCount]);

  if (mode === 'pdf') return null;
  const loading = !results[page];
  return <section ref={surfaceRef} className={'elr-pdf-translations' + (mode === 'compare' ? ' is-parallel' : '')} aria-label="PDF 对照译文">
    <div ref={actions} className="elr-parallel-actions" role="group" aria-label="翻译范围">
      {task ? <button type="button" className="elr-btn" aria-label="暂停翻译" title="暂停翻译" onClick={() => operation.current?.abort()}>
        <span className="elr-parallel-label">暂停翻译</span><span className="elr-parallel-short" aria-hidden="true">暂停</span>
      </button> : Object.entries(scopes).map(([scope, label]) => <button type="button" className={'elr-btn' + (scope === 'page' ? ' primary' : '')}
        key={scope} aria-label={label} title={label} disabled={loading || (scope === 'page' && !hasParagraphs)} onClick={() => translate(scope)}>
        <span className="elr-parallel-label">{label}</span><span className="elr-parallel-short" aria-hidden="true">{label.slice(2)}</span>
      </button>)}
    </div>
    {(task || problem) && <div className="elr-parallel-status" role="status">
      {task ? '正在翻译第 ' + task.page + ' 页' + (task.last > task.page ? ' / ' + task.last : '') + ' · 已完成 ' + task.done + ' 段' : problem}
      {failure && failure.page !== page && <button type="button" className="elr-btn" onClick={() => onPage(failure.page)}>查看</button>}
    </div>}
    <div className="elr-parallel-scroll" data-center-target={centerTranslation || undefined}
      ref={scroll} onScroll={scrollChanged} onWheel={takeTranslationControl}
      onPointerDown={takeTranslationControl} onKeyDown={takeTranslationControl} onPointerLeave={() => onHover(null)} tabIndex={0} aria-label="译文段落">
      {Array.from({ length: pageCount }, (_, i) => {
        const number = i + 1;
        const result = results[number];
        return <section className="elr-parallel-sheet" key={number} data-pdf-sheet={number} aria-label={'第 ' + number + ' 页'}
          style={result ? undefined : { minHeight: sheetHeights.current.get(number) || 'max(280px, 68cqh)' }}>
          <h3 className="elr-parallel-sheet-label">第 {number} 页</h3>
          {result ? <TranslationSheet page={number} result={result} mode={mode} getAssets={getAssets}
            sheetHeights={sheetHeights} selectedIndex={selectedParagraph?.page === number ? selectedParagraph.index : undefined}
            task={task} failure={failure} onOriginal={onOriginal} translate={translate} hover={hover} onHover={onHover} />
            : Math.abs(page - number) <= 1 && <EmptySkeleton variant="sheet" rows={3} label="正在提取段落…" />}
        </section>;
      })}
    </div>
  </section>;
}

function TranslationSheet({ page, result, mode, getAssets, sheetHeights, selectedIndex, task, failure,
  onOriginal, translate, hover, onHover }) {
  const label = useRef(null);
  const [media, setMedia] = useState(null);
  const view = result.data;
  useLayoutEffect(() => {
    const sheet = label.current?.closest('[data-pdf-sheet]');
    if (!sheet) return;
    const measure = () => sheetHeights.current.set(page, sheet.offsetHeight);
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(sheet);
    return () => resize.disconnect();
  }, [page, result]);
  useEffect(() => {
    const blocks = view?.blocks.filter((block) => block.kind);
    if (!blocks?.length) return;
    const request = new AbortController();
    const { signal } = request;
    getAssets(page, blocks, signal).then((images) => {
      if (!signal.aborted) setMedia({ view, images });
    }).catch(() => {
      if (!signal.aborted) setMedia({ view, error: true });
    });
    return () => request.abort();
  }, [page, view]);
  return <>
    <span ref={label} hidden />
    {result.error ? <EmptyState size="card" icon="alert" title="此页暂时无法解析"
        primaryAction={{ label: '查看原文', onClick: () => onOriginal({ page }) }} />
      : !view?.blocks.length ? <EmptyState size="card" icon="pageImage" title="本页没有可提取文字"
        primaryAction={{ label: '查看原文', onClick: () => onOriginal({ page }) }} />
      : view.blocks.map((block) => {
            const anchor = { page, x: block.x, y: block.y, right: block.right, bottom: block.bottom, index: block.index };
            const hovered = hover?.page === page && hover.block.index === block.index;
            const track = () => {
              if (mode === 'compare') onHover((previous) => previous?.page === page && previous.block === block ? previous : { page, block });
            };
            if (block.kind) {
              const asset = media?.view === view ? media : null;
              const image = asset?.images?.get(block.index);
              const label = block.kind === 'formula' ? '原文公式' : block.kind === 'table' ? '原文表格' : '原文插图';
              return <figure className={'elr-paragraph elr-parallel-media is-' + block.kind} key={block.index}
                data-pdf-paragraph={block.index} data-kind={block.kind} data-layout-source={block.layout} data-hovered={hovered || undefined}
                onPointerMove={track} onPointerEnter={track} onPointerLeave={() => onHover(null)}>
                {image ? <img src={image.url} alt={(block.layout !== 'model' && block.label) || label} width={image.width} height={image.height}
                  style={{ width: image.naturalWidth + 'px' }} draggable={false} />
                  : asset?.error ? <p>{block.label || label} <button type="button" className="elr-btn" onClick={() => onOriginal(anchor)}>查看原文</button></p>
                    : <div className="elr-media-placeholder" aria-label={label} style={{ aspectRatio: (block.right - block.x) / (block.y - block.bottom) }} />}
              </figure>;
            }
            const saved = savedTranslation(view, block);
            const busy = task?.page === page && task.index === block.index;
            const error = failure?.page === page && failure.index === block.index ? failure.text : '';
            const compare = mode === 'compare';
            const selected = compare && selectedIndex === block.index;
            const locate = (event) => {
              if (event.target.closest('button, a')) return;
              const selection = window.getSelection();
              if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;
              onOriginal(anchor);
            };
            return <article className={'elr-paragraph' + (block.heading ? ' is-heading' : block.listItem ? ' is-list-item' : '')} key={block.index}
              data-pdf-paragraph={block.index} data-focused={selected || undefined} data-hovered={hovered || undefined}
              tabIndex={compare ? 0 : undefined} aria-keyshortcuts={compare ? 'Enter Space' : undefined}
              onClick={compare ? locate : undefined} onKeyDown={compare ? (event) => {
                if (event.currentTarget !== event.target || !['Enter', ' '].includes(event.key)) return;
                event.preventDefault();
                onOriginal(anchor);
              } : undefined}
              onPointerMove={track} onPointerEnter={track} onPointerLeave={() => onHover(null)}>
              {mode === 'reflow' && <div className="elr-parallel-original" lang="en">{block.text}</div>}
              <div className="elr-paragraph-meta">
                {saved?.model && <small title={saved.model}>{saved.model}</small>}
                {!compare && <button type="button" className="elr-btn" onClick={() => onOriginal(anchor)}>定位原文</button>}
                <button type="button" className="elr-btn" disabled={Boolean(task)} onClick={() => translate('page', block, page)}>
                  {saved ? '重译此段' : '翻译此段'}
                </button>
              </div>
              {saved ? <div className="elr-paragraph-translation" lang="zh-CN">{saved.text}</div>
                : (busy || mode !== 'compare') && <p className="elr-paragraph-placeholder">{busy ? '翻译中…' : '待翻译'}</p>}
              {!saved && mode === 'compare' && <p className="elr-paragraph-excerpt" lang="en">{block.text}</p>}
              {error && <p className="elr-paragraph-error" role="alert">{error}</p>}
            </article>;
      })}
  </>;
}
