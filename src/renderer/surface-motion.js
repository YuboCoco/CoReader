const curveByRole = { enter: 'out', exit: 'in', move: 'in-out', response: 'out-strong', settle: 'spring' };
const motionToken = (name) => getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export function motionDuration(size) {
  const value = motionToken('duration-' + size);
  // CSS minification can serialize the duration in seconds.
  return parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
}
export const motionEasing = (role) => motionToken('ease-' + curveByRole[role]);

export function motionTiming(size, role, keyboard = false) {
  const reduced = reduceMotion();
  const fadeOnly = reduced || keyboard;
  const duration = reduced ? motionDuration('reduced') : keyboard ? motionDuration('keyboard')
    : motionDuration(role === 'exit' ? 'exit-' + size : size) * (role === 'settle' ? 1.5 : 1);
  return { fadeOnly, duration, easing: motionEasing(fadeOnly && role !== 'exit' ? 'enter' : role) };
}

const scrollMotions = new WeakMap();

function bezierProgress(progress, [x1, y1, x2, y2]) {
  const coordinate = (time, first, second) => {
    const remaining = 1 - time;
    return 3 * remaining ** 2 * time * first + 3 * remaining * time ** 2 * second + time ** 3;
  };
  let low = 0;
  let high = 1;
  for (let step = 0; step < 14; step++) {
    const time = (low + high) / 2;
    if (coordinate(time, x1, x2) < progress) low = time;
    else high = time;
  }
  return coordinate((low + high) / 2, y1, y2);
}

export function scrollWithMotion(container, { top, left }) {
  scrollMotions.get(container)?.();
  const startLeft = container.scrollLeft;
  const startTop = container.scrollTop;
  const targetLeft = Math.max(0, Math.min(left, container.scrollWidth - container.clientWidth));
  const targetTop = Math.max(0, Math.min(top, container.scrollHeight - container.clientHeight));
  const write = (x, y) => container.scrollTo({ left: x, top: y, behavior: 'instant' });
  if (reduceMotion()) {
    write(targetLeft, targetTop);
    return;
  }
  if (targetLeft === startLeft && targetTop === startTop) return;

  const controlPoints = motionEasing('move').slice('cubic-bezier('.length, -1).split(',').map(Number);
  const duration = motionDuration('md');
  const inputs = new AbortController();
  let lastLeft = startLeft;
  let lastTop = startTop;
  let started;
  let frame;
  const stop = () => {
    cancelAnimationFrame(frame);
    inputs.abort();
    scrollMotions.delete(container);
  };
  scrollMotions.set(container, stop);
  for (const event of ['wheel', 'pointerdown', 'keydown', 'resize']) {
    window.addEventListener(event, stop, { capture: true, passive: true, signal: inputs.signal });
  }
  const tick = (now) => {
    if (!container.isConnected || container.scrollLeft !== lastLeft || container.scrollTop !== lastTop) {
      stop();
      return;
    }
    started ??= now;
    const progress = Math.min(1, (now - started) / duration);
    if (progress === 1) {
      write(targetLeft, targetTop);
      stop();
      return;
    }
    const eased = bezierProgress(progress, controlPoints);
    write(startLeft + (targetLeft - startLeft) * eased, startTop + (targetTop - startTop) * eased);
    lastLeft = container.scrollLeft;
    lastTop = container.scrollTop;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

function revealContent(element, timing) {
  const delay = motionDuration('feedback');
  return element.animate([{ opacity: 0 }, { opacity: 1 }], {
    delay, duration: timing.duration - delay, easing: motionEasing('response'), fill: 'backwards',
  });
}

export function visibleRect(node, viewport = document.documentElement.getBoundingClientRect()) {
  if (!node?.isConnected) return null;
  const rect = node.getBoundingClientRect();
  return rect.width && rect.height && rect.right > viewport.left && rect.left < viewport.right
    && rect.bottom > viewport.top && rect.top < viewport.bottom ? rect : null;
}

export function boxTransform(from, to) {
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
}

export function visualCopy(source, rect, parent = document.body, deep = true) {
  const copy = source.cloneNode(deep);
  copy.inert = true;
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('data-elr-motion-copy', '');
  for (const node of [copy, ...copy.querySelectorAll('[id], [autofocus]')]) {
    node.removeAttribute('id');
    node.removeAttribute('autofocus');
  }
  Object.assign(copy.style, {
    position: 'fixed', inset: 'auto', left: rect.left + 'px', top: rect.top + 'px',
    width: rect.width + 'px', height: rect.height + 'px', boxSizing: 'border-box',
    margin: '0', pointerEvents: 'none', zIndex: '150',
  });
  parent.append(copy);
  return copy;
}

export function playVisualCopy(copy, frames, timing) {
  const animation = copy.animate(frames, timing);
  animation.finished.then(() => copy.remove(), () => copy.remove());
  return animation;
}


function motionPart(node) {
  if (!node) return null;
  const style = getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  const input = node instanceof HTMLInputElement;
  const image = node.querySelector('img') || (node instanceof HTMLImageElement ? node : null);
  if (image) return { rect: image.getBoundingClientRect(), image: image.currentSrc || image.src };
  if (input) {
    const x = parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
    return {
      rect: new DOMRect(rect.left + x, rect.top, Math.max(1, rect.width - x), rect.height), text: node.value,
      color: style.color, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
    };
  }
  return { rect, text: node.textContent.trim(), color: style.color,
    fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight };
}

export function animateSharedDialog(dialog, source, fromParts, toParts, keyboard, exiting = false, previous = null) {
  const sourceBox = visibleRect(source, source?.closest('.pl-results')?.getBoundingClientRect());
  const destination = dialog.getBoundingClientRect();
  if (!destination.width || !destination.height) return null;
  const timing = motionTiming('md', exiting ? 'exit' : 'enter', keyboard);
  if (!exiting && (timing.fadeOnly || !sourceBox)) {
    const animation = dialog.animate([{ opacity: previous?.opacity ?? 0 }, { opacity: 1 }], { ...timing, duration: timing.fadeOnly ? timing.duration : motionDuration('exit-sm') });
    const stop = () => animation.cancel();
    stop.capture = () => animation.playState === 'running' ? { opacity: getComputedStyle(dialog).opacity } : null;
    return stop;
  }

  const style = getComputedStyle(dialog);
  const sourceStyle = sourceBox ? getComputedStyle(source) : style;
  const overlay = document.createElement('div');
  overlay.popover = 'manual';
  overlay.inert = true;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('data-elr-motion-copy', '');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', padding: '0', margin: '0', width: '100%', height: '100%',
    maxWidth: 'none', maxHeight: 'none', border: '0', background: 'transparent',
    overflow: 'hidden', pointerEvents: 'none',
  });
  document.body.append(overlay);
  overlay.showPopover();
  const frame = document.createElement('div');
  Object.assign(frame.style, {
    position: 'absolute', left: destination.left + 'px', top: destination.top + 'px',
    width: destination.width + 'px', height: destination.height + 'px', boxSizing: 'border-box',
    border: style.border, borderRadius: style.borderRadius, boxShadow: style.boxShadow,
    background: style.getPropertyValue('--dsw-alias-bg-layer-1').trim() || style.backgroundColor,
    transformOrigin: 'top left',
  });
  overlay.append(frame);

  const moving = sourceBox && !timing.fadeOnly;
  const near = moving
    ? { transform: boxTransform(sourceBox, destination), borderRadius: sourceStyle.borderRadius, opacity: 1 }
    : { opacity: 0 };
  const far = { transform: 'none', borderRadius: style.borderRadius, opacity: 1 };
  const interrupted = previous?.box && !timing.fadeOnly
    ? { transform: boxTransform(previous.box, destination), borderRadius: previous.radius, opacity: previous.opacity }
    : previous ? { opacity: previous.opacity } : null;
  const frameFrames = exiting ? [interrupted || far, { ...near, opacity: 0 }]
    : [interrupted || near, { ...far, offset: .7 }, { ...far, opacity: 0 }];
  const animation = frame.animate(frameFrames, { ...timing, fill: 'both' });
  if (exiting) {
    const outgoing = visualCopy(dialog, destination, overlay);
    Object.assign(outgoing.style, { position: 'absolute', zIndex: 'auto', transformOrigin: 'top left' });
    const originalNodes = [...dialog.querySelectorAll('*')];
    const copiedNodes = [...outgoing.querySelectorAll('*')];
    originalNodes.forEach((node, index) => {
      const copy = copiedNodes[index];
      if (node.scrollTop) copy.scrollTop = node.scrollTop;
      if (node.scrollLeft) copy.scrollLeft = node.scrollLeft;
      if (moving && toParts.includes(node)) copy.style.visibility = 'hidden';
    });
    outgoing.animate([{ transform: interrupted?.transform || 'none' }, { transform: near.transform || 'none' }], timing);
    playVisualCopy(outgoing, [{ opacity: previous?.dialogOpacity ?? 1 }, { opacity: 0 }], {
      ...timing, duration: moving ? timing.duration * .3 : timing.duration,
    });
  }
  const parts = [];
  if (moving) for (let index = 0; index < fromParts.length; index += 1) {
    const from = motionPart(fromParts[index]);
    const to = motionPart(toParts[index]);
    if (!from || !to || !from.rect.width || !to.rect.width) continue;
    const part = document.createElement(to.image ? 'img' : 'span');
    if (to.image) part.src = to.image;
    else part.textContent = exiting ? to.text : from.text;
    Object.assign(part.style, {
      position: 'absolute', left: to.rect.left + 'px', top: to.rect.top + 'px',
      width: to.rect.width + 'px', height: to.rect.height + 'px',
      color: to.color, fontFamily: to.fontFamily, fontSize: to.fontSize, fontWeight: to.fontWeight,
      display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
      objectFit: 'contain', transformOrigin: 'top left',
    });
    overlay.append(part);
    const fontScale = to.image ? from.rect.width / to.rect.width : parseFloat(from.fontSize) / parseFloat(to.fontSize);
    const small = { opacity: 1, transform: `translate(${from.rect.left - to.rect.left}px,${from.rect.top + (from.rect.height - to.rect.height * fontScale) / 2 - to.rect.top}px) scale(${fontScale})` };
    const large = { opacity: 1, transform: 'none' };
    const snapshot = previous?.parts?.[index];
    const position = snapshot ? { transform: boxTransform(snapshot.rect, to.rect), opacity: snapshot.opacity } : null;
    parts[index] = part;
    part.animate(exiting ? [position || large, { ...small, opacity: 0 }]
      : [position || small, { ...large, offset: .8 }, { ...large, opacity: 0 }], { ...timing, fill: 'both' });
  }

  const reveal = exiting ? null : revealContent(dialog, timing);
  const remove = () => { overlay.remove(); reveal?.cancel(); };
  animation.finished.then(remove, remove);
  const stop = () => { animation.cancel(); remove(); };
  stop.capture = () => {
    if (!overlay.isConnected) return null;
    const current = getComputedStyle(frame);
    return { box: frame.getBoundingClientRect(), radius: current.borderRadius, opacity: current.opacity,
      dialogOpacity: getComputedStyle(dialog).opacity,
      parts: parts.map((part) => ({ rect: part.getBoundingClientRect(), opacity: getComputedStyle(part).opacity })) };
  };
  return stop;
}


export function comparePaneCopy(pane, parent) {
  const box = pane.getBoundingClientRect();
  if (!parent || !box.width || !box.height) return null;
  const copy = visualCopy(pane, box, parent, false);
  const style = getComputedStyle(pane);
  const stage = parent.getBoundingClientRect();
  Object.assign(copy.style, {
    position: 'absolute', left: box.left - stage.left + 'px', top: box.top - stage.top + 'px',
    background: style.backgroundColor, overflow: 'hidden', zIndex: '12',
  });
  const append = (node, target, bounds, deep) => {
    const rect = node.getBoundingClientRect();
    const visual = node.cloneNode(deep);
    for (const part of [visual, ...visual.querySelectorAll('[id]')]) part.removeAttribute('id');
    Object.assign(visual.style, {
      position: 'absolute', inset: 'auto', left: rect.left - bounds.left + 'px', top: rect.top - bounds.top + 'px',
      margin: '0', width: rect.width + 'px', height: rect.height + 'px', boxSizing: 'border-box', overflow: 'hidden',
    });
    target.append(visual);
    return visual;
  };
  for (const child of pane.children) {
    if (!child.classList.contains('elr-parallel-scroll')) {
      append(child, copy, box, true);
      continue;
    }
    const viewport = child.getBoundingClientRect();
    const scrollCopy = append(child, copy, box, false);
    for (const sheet of child.children) {
      const rect = sheet.getBoundingClientRect();
      if (rect.top >= viewport.bottom) break;
      if (rect.bottom > viewport.top) append(sheet, scrollCopy, viewport, true);
    }
  }
  return copy;
}

export function animateComparePane(copy, keyboard, exiting, from) {
  const timing = motionTiming('md', exiting ? 'exit' : 'enter', keyboard);
  const closed = { opacity: 0, ...(timing.fadeOnly ? {} : { clipPath: 'inset(0 100% 0 0)' }) };
  const opened = { opacity: 1, ...(timing.fadeOnly ? {} : { clipPath: 'inset(0 0% 0 0)' }) };
  const start = from ? { opacity: from.opacity, ...(timing.fadeOnly ? {} : { clipPath: from.clipPath }) } : exiting ? opened : closed;
  const frames = exiting || timing.fadeOnly ? [start, exiting ? closed : opened] : [start, { opacity: 1, offset: .85 }, opened];
  return playVisualCopy(copy, frames, timing);
}


export function fittedImageRect(image) {
  if (!image?.complete || !image.naturalWidth || !visibleRect(image)) return null;
  const box = image.getBoundingClientRect();
  const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  return new DOMRect(box.left + (box.width - width) / 2, box.top + (box.height - height) / 2, width, height);
}

export function coverVisual(image, box, parent) {
  const sprite = document.createElement('img');
  sprite.src = image;
  sprite.alt = '';
  sprite.inert = true;
  sprite.setAttribute('aria-hidden', 'true');
  sprite.className = 'elr-cover-motion';
  Object.assign(sprite.style, {
    left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px',
  });
  parent.append(sprite);
  return sprite;
}

export function cornerReveal(box, anchor, shift = 8) {
  const above = anchor.top + anchor.height / 2 > box.top + box.height / 2;
  const right = anchor.left + anchor.width / 2 > box.left + box.width / 2;
  return { transform: `translate(${right ? shift : -shift}px, ${above ? shift : -shift}px)`,
    clipPath: `inset(${above ? '65%' : '0%'} ${right ? '0%' : '55%'} ${above ? '0%' : '65%'} ${right ? '55%' : '0%'} round 16px)` };
}

export function animateSelectionSurface(node, anchor, keyboard, exiting, previous) {
  const box = node.getBoundingClientRect();
  const timing = motionTiming('md', exiting ? 'exit' : 'enter', keyboard);
  const previousElement = previous?.copy?.isConnected ? previous.copy : previous?.node?.isConnected ? previous.node : null;
  const style = previousElement ? getComputedStyle(previousElement) : null;
  const current = style ? { opacity: style.opacity, transform: style.transform, clipPath: style.clipPath } : null;
  previous?.cancel();

  const shown = { opacity: 1, transform: 'none', clipPath: 'inset(0% 0% 0% 0% round 16px)' };
  const collapsed = { opacity: 0, ...(timing.fadeOnly ? {} : cornerReveal(box, anchor)) };
  if (timing.fadeOnly) {
    const target = exiting ? visualCopy(node, box, node.parentElement) : node;
    if (!exiting) document.dispatchEvent(new CustomEvent('reader-glass-sync', { detail: target }));
    const frames = [{ opacity: current?.opacity ?? (exiting ? 1 : 0) }, { opacity: exiting ? 0 : 1 }];
    const animation = exiting ? playVisualCopy(target, frames, timing) : target.animate(frames, timing);
    return { copy: exiting ? target : null, node: exiting ? null : target, cancel: () => animation.cancel() };
  }

  if (!exiting) {
    // Sync liquid-glass tokens before frame 0 and animate the live node directly
    // so backdrop-filter glass renders throughout the expansion instead of popping in at the end.
    document.dispatchEvent(new CustomEvent('reader-glass-sync', { detail: node }));
    const frames = [current || collapsed, { opacity: 1, offset: .45 }, shown];
    const animations = [node.animate(frames, timing)];
    const body = node.querySelector('.elr-popup-body');
    if (body) animations.push(revealContent(body, timing));
    return { node, cancel: () => { for (const animation of animations) animation.cancel(); } };
  }

  const copy = visualCopy(node, box, node.parentElement);
  const frames = [current || shown, collapsed];
  const animations = [playVisualCopy(copy, frames, timing)];
  return { copy, cancel: () => { copy.remove(); for (const animation of animations) animation.cancel(); } };
}
