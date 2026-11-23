import React, { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, PasswordResponses, TextLayer } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';

GlobalWorkerOptions.workerSrc = workerUrl;
const asset = (name) => new URL('/pdf-assets/' + name + '/', location.href).href;

export function loadPaper(id) {
  return getDocument({
    url: new URL('/documents/' + id, location.href).href,
    cMapUrl: asset('cmaps'), cMapPacked: true,
    standardFontDataUrl: asset('standard_fonts'), wasmUrl: asset('wasm'), iccUrl: asset('iccs'),
    disableAutoFetch: true, disableStream: true, isEvalSupported: false,
  });
}

export function requestPassword(task, onRequest) {
  task.onPassword = (submit, reason) => onRequest({
    submit,
    message: reason === PasswordResponses.INCORRECT_PASSWORD ? '密码有误，请重试。' : '此 PDF 受密码保护。',
  });
}

export function normalise(text) {
  return text.replace(/\u00ad/g, '').replace(/([a-zA-Z])-\s*\n([a-z])/g, '$1$2')
    .replace(/\s+/g, ' ').trim();
}

export function readPageText(content) {
  return content.items.map((item) => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
}

function excerpt(text, selection) {
  const source = normalise(text);
  const index = source.toLowerCase().indexOf(selection.toLowerCase());
  return index < 0 ? '' : source.slice(Math.max(0, index - 420), Math.min(source.length, index + selection.length + 420));
}

function cropFromPage(canvas, area) {
  const left = Math.round(area.x * canvas.width);
  const top = Math.round(area.y * canvas.height);
  const width = Math.max(1, Math.min(canvas.width - left, Math.round(area.w * canvas.width)));
  const height = Math.max(1, Math.min(canvas.height - top, Math.round(area.h * canvas.height)));
  const scale = Math.min(1, 1480 / Math.max(width, height));
  const crop = document.createElement('canvas');
  crop.width = Math.max(1, Math.round(width * scale));
  crop.height = Math.max(1, Math.round(height * scale));
  crop.getContext('2d', { alpha: false }).drawImage(canvas, left, top, width, height, 0, 0, crop.width, crop.height);
  return crop.toDataURL('image/jpeg', 0.88);
}

function nearbyText(layer, area) {
  const size = layer.getBoundingClientRect();
  const x = size.left + area.x * size.width;
  const y = size.top + area.y * size.height;
  const right = x + area.w * size.width;
  const bottom = y + area.h * size.height;
  return [...layer.querySelectorAll('span')].filter((span) => !span.firstElementChild && span.textContent.trim()).flatMap((span) => {
    const rect = span.getBoundingClientRect();
    return rect.right >= x - 20 && rect.left <= right + 20 && rect.bottom >= y - 120 && rect.top <= bottom + 150
      ? [{ text: span.textContent.trim(), top: rect.top, left: rect.left }] : [];
  }).sort((a, b) => Math.abs(a.top - b.top) <= 3 ? a.left - b.left : a.top - b.top)
    .map((line) => line.text).join(' ').slice(0, 2600);
}

function FigureSurface({ onFinish }) {
  const gesture = useRef(null);
  const [box, setBox] = useState(null);
  const position = (event, origin) => {
    const x = Math.max(0, Math.min(1, (event.clientX - origin.left) / origin.width));
    const y = Math.max(0, Math.min(1, (event.clientY - origin.top) / origin.height));
    return { x, y };
  };
  const area = (event, active) => {
    const { x, y } = position(event, active.bounds);
    return { x: Math.min(x, active.x), y: Math.min(y, active.y), w: Math.abs(x - active.x), h: Math.abs(y - active.y) };
  };
  return <div className="figure-surface" aria-label="插图框选区域" onPointerDown={(event) => {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    gesture.current = { ...position(event, bounds), bounds, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }} onPointerMove={(event) => {
    if (gesture.current?.id === event.pointerId) setBox(area(event, gesture.current));
  }} onPointerCancel={() => { gesture.current = null; setBox(null); }} onPointerUp={(event) => {
    const active = gesture.current;
    if (active?.id !== event.pointerId) return;
    const selected = area(event, active);
    gesture.current = null;
    setBox(null);
    if (selected.w * active.bounds.width >= 12 && selected.h * active.bounds.height >= 12) onFinish(selected);
  }}>
    {box && <span className="figure-outline" style={{
      left: box.x * 100 + '%', top: box.y * 100 + '%', width: box.w * 100 + '%', height: box.h * 100 + '%',
    }} />}
  </div>;
}

export function PdfPage({ pdf, page, zoom, marks, onSelect, figurePicking, onFigure }) {
  const sheet = useRef(null);
  const canvas = useRef(null);
  const textLayer = useRef(null);
  const pageText = useRef('');
  const [issue, setIssue] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    let paint;
    let layer;
    const textContainer = textLayer.current;
    pageText.current = '';
    setReady(false);
    setIssue('');
    textContainer.replaceChildren();
    (async () => {
      const source = await pdf.getPage(page);
      if (!alive) return;
      const viewport = source.getViewport({ scale: zoom });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12000000 / (viewport.width * viewport.height)));
      const surface = canvas.current;
      sheet.current.style.width = viewport.width + 'px';
      sheet.current.style.height = viewport.height + 'px';
      sheet.current.style.setProperty('--total-scale-factor', viewport.scale * (viewport.userUnit || 1));
      sheet.current.style.setProperty('--scale-round-x', '1px');
      sheet.current.style.setProperty('--scale-round-y', '1px');
      surface.width = Math.max(1, Math.round(viewport.width * outputScale));
      surface.height = Math.max(1, Math.round(viewport.height * outputScale));
      surface.style.width = viewport.width + 'px';
      surface.style.height = viewport.height + 'px';
      paint = source.render({
        canvas: surface, viewport,
        transform: [surface.width / viewport.width, 0, 0, surface.height / viewport.height, 0, 0],
      });
      const placeText = source.getTextContent().then((content) => {
        if (!alive) return;
        pageText.current = readPageText(content);
        layer = new TextLayer({ textContentSource: content, container: textContainer, viewport });
        return layer.render();
      });
      await Promise.all([paint.promise, placeText]);
      if (alive) setReady(true);
    })().catch((error) => {
      if (alive) setIssue(error?.message || '页面无法显示。');
    });
    return () => {
      alive = false;
      paint?.cancel();
      layer?.cancel();
    };
  }, [pdf, page, zoom]);

  useEffect(() => {
    if (!ready) return;
    let frame;
    const readSelection = () => {
      frame = undefined;
      const selection = window.getSelection();
      const layer = textLayer.current;
      const bounds = layer?.getBoundingClientRect();
      if (!selection || selection.isCollapsed || !selection.rangeCount || !bounds?.width
        || !layer.contains(selection.anchorNode) || !layer.contains(selection.focusNode)) return;
      const quote = normalise(selection.toString()).slice(0, 6000);
      if (!quote) return;
      const rects = Array.from(selection.getRangeAt(0).getClientRects()).flatMap((rect) => {
        const left = Math.max(rect.left, bounds.left);
        const top = Math.max(rect.top, bounds.top);
        const right = Math.min(rect.right, bounds.right);
        const bottom = Math.min(rect.bottom, bounds.bottom);
        if (right - left < 0.5 || bottom - top < 0.5) return [];
        return [{
          x: (left - bounds.left) / bounds.width, y: (top - bounds.top) / bounds.height,
          w: (right - left) / bounds.width, h: (bottom - top) / bounds.height,
        }];
      }).slice(0, 500);
      onSelect({ quote, page, rects, context: excerpt(pageText.current, quote) });
    };
    const schedule = () => {
      if (frame === undefined) frame = requestAnimationFrame(readSelection);
    };
    document.addEventListener('selectionchange', schedule);
    return () => {
      document.removeEventListener('selectionchange', schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [ready, page, onSelect]);

  return (
    <div className="pdf-sheet" ref={sheet} aria-label={'PDF 第 ' + page + ' 页'} data-ready={ready}>
      <canvas ref={canvas} aria-hidden="true" />
      <div className="mark-layer" aria-hidden="true">
        {marks.filter((item) => item.page === page).flatMap((mark) => mark.rects.map((rect, index) => (
          <span key={mark.id + ':' + index} className={mark.kind} style={{
            left: rect.x * 100 + '%', top: rect.y * 100 + '%',
            width: rect.w * 100 + '%', height: rect.h * 100 + '%',
          }} />
        )))}
      </div>
      <div className="textLayer" ref={textLayer} />
      {ready && figurePicking && <FigureSurface onFinish={(position) => {
        const image = cropFromPage(canvas.current, position);
        if (image.startsWith('data:image/jpeg;')) onFigure({ image, position, page, context: nearbyText(textLayer.current, position) });
      }} />}
      {!ready && <div className="pdf-loading" role={issue ? 'alert' : 'status'}>
        {issue ? '页面加载失败。' + issue : '正在绘制页面…'}
      </div>}
    </div>
  );
}
