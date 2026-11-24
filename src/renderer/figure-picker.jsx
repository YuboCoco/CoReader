import React, { useLayoutEffect, useRef, useState } from 'react';
import './figure-picker.css';

const minimum = 10;
const corners = ['nw', 'ne', 'sw', 'se'];
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function pageAtPoint(container, x, y) {
  const page = document.elementsFromPoint(x, y)
    .map((node) => node.closest('.pdfViewer .page[data-page-number]'))
    .find((node) => node && container.contains(node));
  if (!page) return null;
  const pageBox = (page.querySelector('.canvasWrapper') || page).getBoundingClientRect();
  const frame = container.getBoundingClientRect();
  const left = Math.max(pageBox.left, frame.left + container.clientLeft, 0);
  const top = Math.max(pageBox.top, frame.top + container.clientTop, 0);
  const right = Math.min(pageBox.right, frame.left + container.clientLeft + container.clientWidth, window.innerWidth);
  const bottom = Math.min(pageBox.bottom, frame.top + container.clientTop + container.clientHeight, window.innerHeight);
  if (right - left < minimum || bottom - top < minimum || x < left || x > right || y < top || y > bottom) return null;
  return { page: Number(page.dataset.pageNumber), pageBox, left, top, right, bottom };
}

function adjustedBox(drag, x, y) {
  const { bounds, start, action } = drag;
  if (action === 'draw') {
    x = clamp(x, bounds.left, bounds.right);
    y = clamp(y, bounds.top, bounds.bottom);
    return { left: Math.min(start.x, x), right: Math.max(start.x, x), top: Math.min(start.y, y), bottom: Math.max(start.y, y) };
  }
  const dx = x - start.x;
  const dy = y - start.y;
  const { left, top, right, bottom } = start.box;
  if (action === 'move') {
    const offsetX = clamp(dx, bounds.left - left, bounds.right - right);
    const offsetY = clamp(dy, bounds.top - top, bounds.bottom - bottom);
    return { left: left + offsetX, top: top + offsetY, right: right + offsetX, bottom: bottom + offsetY };
  }
  return {
    left: action.endsWith('w') ? clamp(left + dx, bounds.left, right - minimum) : left,
    right: action.endsWith('e') ? clamp(right + dx, left + minimum, bounds.right) : right,
    top: action.startsWith('n') ? clamp(top + dy, bounds.top, bottom - minimum) : top,
    bottom: action.startsWith('s') ? clamp(bottom + dy, top + minimum, bounds.bottom) : bottom,
  };
}

export function FigurePicker({ container, onConfirm, onCancel, onTooSmall, labels }) {
  const layer = useRef(null);
  const drag = useRef(null);
  const [selection, setSelection] = useState(null);
  const [dragging, setDragging] = useState(false);
  const box = selection?.box;
  const complete = box && box.right - box.left >= minimum && box.bottom - box.top >= minimum && !dragging;

  useLayoutEffect(() => {
    const node = layer.current;
    const frame = container.current;
    const previousFocus = document.activeElement;
    node.focus({ preventScroll: true });
    const reset = () => {
      const pointer = drag.current?.pointer;
      drag.current = null;
      if (pointer != null && node.hasPointerCapture(pointer)) node.releasePointerCapture(pointer);
      setSelection(null);
      setDragging(false);
    };
    const stopWheel = (event) => event.preventDefault();
    node.addEventListener('wheel', stopWheel, { passive: false });
    window.addEventListener('resize', reset);
    frame?.addEventListener('scroll', reset);
    return () => {
      node.removeEventListener('wheel', stopWheel);
      window.removeEventListener('resize', reset);
      frame?.removeEventListener('scroll', reset);
      if (node.contains(document.activeElement)) previousFocus?.focus({ preventScroll: true });
    };
  }, [container]);

  function begin(event) {
    if (event.button !== 0 || !event.isPrimary || drag.current || event.target.closest('button')) return;
    const { clientX: x, clientY: y, pointerId: pointer } = event;
    const action = event.target.dataset.adjust || 'draw';
    const bounds = action === 'draw' ? container.current && pageAtPoint(container.current, x, y) : selection?.bounds;
    if (!bounds) return;
    drag.current = { pointer, action, bounds, start: { x, y, box }, previous: selection };
    setDragging(true);
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(pointer);
    setSelection({ bounds, box: adjustedBox(drag.current, x, y) });
    event.preventDefault();
  }

  function move(event) {
    const operation = drag.current;
    if (operation?.pointer !== event.pointerId) return;
    setSelection({ bounds: operation.bounds, box: adjustedBox(operation, event.clientX, event.clientY) });
  }

  function finish(event, cancelled = false) {
    const operation = drag.current;
    if (operation?.pointer !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (cancelled) {
      setSelection(operation.previous);
      return;
    }
    const next = adjustedBox(operation, event.clientX, event.clientY);
    if (next.right - next.left < minimum || next.bottom - next.top < minimum) {
      setSelection(operation.previous);
      if (next.right !== next.left || next.bottom !== next.top) onTooSmall();
      return;
    }
    setSelection({ bounds: operation.bounds, box: next });
  }

  function confirm() {
    if (!complete) return;
    const { page, pageBox } = selection.bounds;
    onConfirm(page, {
      x: (box.left - pageBox.left) / pageBox.width,
      y: (box.top - pageBox.top) / pageBox.height,
      w: (box.right - box.left) / pageBox.width,
      h: (box.bottom - box.top) / pageBox.height,
    });
  }

  function keydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'Tab') {
      const buttons = layer.current.querySelectorAll('button');
      const active = document.activeElement;
      if (!buttons.length || (event.shiftKey ? active === buttons[0] : active === buttons[1])) {
        event.preventDefault();
        if (buttons.length) buttons[event.shiftKey ? 1 : 0].focus();
      }
    }
    event.stopPropagation();
  }

  return <div ref={layer} className="elr-figure-mask" role="dialog" aria-modal="true" aria-label={labels.title} tabIndex={-1}
    onPointerDown={begin} onPointerMove={move} onPointerUp={finish}
    onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)}
    onKeyDown={keydown} onContextMenu={(event) => event.preventDefault()}>
    {box && <div className="elr-figure-selection" data-adjust="move" style={{
      left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top,
    }}>
      {(complete || drag.current?.action !== 'draw') && corners.map((direction) =>
        <span key={direction} className="elr-figure-handle" data-adjust={direction} aria-hidden="true" />)}
    </div>}
    {complete && <div className="elr-figure-actions" style={{
      left: Math.max(6, Math.min(box.right - 76, window.innerWidth - 82)),
      top: box.bottom + 44 <= window.innerHeight ? box.bottom + 7 : Math.max(6, box.bottom - 43),
    }}>
      <button type="button" className="elr-figure-cancel" aria-label={labels.cancel} title={labels.cancel} onClick={onCancel}>
        <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" /></svg>
      </button>
      <button type="button" className="elr-figure-confirm" aria-label={labels.confirm} title={labels.confirm} onClick={confirm}>
        <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m4 10 4 4 8-8" /></svg>
      </button>
    </div>}
  </div>;
}
