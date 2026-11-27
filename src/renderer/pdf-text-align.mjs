function mulMat(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyMat(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function normalizeToken(text) {
  return String(text || '')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .trim();
}

function matrixArg(a) {
  if (!a) return null;
  if (a.length === 1 && (Array.isArray(a[0]) || ArrayBuffer.isView(a[0]))) return a[0];
  return a;
}

export function extractPdfWordRuns(operators, OPS, viewport) {
  if (!operators?.fnArray?.length || !OPS || !viewport?.transform || !viewport.width || !viewport.height) return [];
  const { fnArray, argsArray } = operators;
  const vt = viewport.transform;
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = [1, 0, 0, 1, 0, 0];
  let fontSize = 1;
  let charSpacing = 0;
  let wordSpacing = 0;
  let hScale = 1;
  let leading = 0;
  const runs = [];

  const emitShowText = (glyphs) => {
    if (!Array.isArray(glyphs)) return;
    const trm = mulMat(ctm, tm);
    const totalTrm = mulMat(vt, trm);
    const horizontal = Math.abs(totalTrm[1]) < 0.01 && Math.abs(totalTrm[2]) < 0.01 && totalTrm[0] > 0;
    let curX = 0;
    let buf = '';
    let dx = 0;
    const flush = (endX) => {
      if (!buf) return;
      if (horizontal) {
        const [vx0, vy0] = applyMat(totalTrm, curX, 0);
        const [vx1] = applyMat(totalTrm, endX, 0);
        const w = Math.abs(vx1 - vx0);
        if (w > 0) {
          runs.push({
            text: buf,
            norm: normalizeToken(buf),
            leftPct: (Math.min(vx0, vx1) / pageWidth) * 100,
            widthPct: (w / pageWidth) * 100,
            topPct: (vy0 / pageHeight) * 100,
          });
        }
      }
      buf = '';
    };
    for (const g of glyphs) {
      if (typeof g === 'number') {
        const adv = (-g / 1000) * fontSize * hScale;
        if (g < -135) {
          flush(dx);
          dx += adv;
          curX = dx;
        } else {
          dx += adv;
        }
      } else if (g && typeof g === 'object') {
        const str = g.unicode || '';
        const isSpace = g.isSpace || str === ' ' || str === '\u00a0';
        if (isSpace) {
          flush(dx);
        } else if (str) {
          if (!buf) curX = dx;
          buf += str;
        }
        const w = ((Number(g.width) || 0) / 1000) * fontSize;
        dx += (w + charSpacing + (isSpace ? wordSpacing : 0)) * hScale;
        if (isSpace) curX = dx;
      }
    }
    flush(dx);
    tm = mulMat(tm, [1, 0, 0, 1, dx, 0]);
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const a = argsArray[i];
    if (fn === OPS.save) {
      stack.push({ ctm: [...ctm], charSpacing, wordSpacing, hScale, leading, fontSize });
    } else if (fn === OPS.restore) {
      const saved = stack.pop();
      if (saved) ({ ctm, charSpacing, wordSpacing, hScale, leading, fontSize } = saved);
    } else if (fn === OPS.transform) {
      const m = matrixArg(a);
      if (m && m.length >= 6) ctm = mulMat(ctm, m);
    } else if (fn === OPS.paintFormXObjectBegin) {
      stack.push({ ctm: [...ctm], charSpacing, wordSpacing, hScale, leading, fontSize });
      if (a?.[0] && a[0].length >= 6) ctm = mulMat(ctm, a[0]);
    } else if (fn === OPS.paintFormXObjectEnd) {
      const saved = stack.pop();
      if (saved) ({ ctm, charSpacing, wordSpacing, hScale, leading, fontSize } = saved);
    } else if (fn === OPS.beginText) {
      tm = [1, 0, 0, 1, 0, 0];
      tlm = [1, 0, 0, 1, 0, 0];
    } else if (fn === OPS.setFont) {
      if (a && Number.isFinite(Number(a[1]))) fontSize = Number(a[1]);
    } else if (fn === OPS.setCharSpacing) {
      if (a && Number.isFinite(Number(a[0]))) charSpacing = Number(a[0]);
    } else if (fn === OPS.setWordSpacing) {
      if (a && Number.isFinite(Number(a[0]))) wordSpacing = Number(a[0]);
    } else if (fn === OPS.setHScale) {
      if (a && Number.isFinite(Number(a[0]))) hScale = Number(a[0]) / 100;
    } else if (fn === OPS.setLeading) {
      if (a && Number.isFinite(Number(a[0]))) leading = Number(a[0]);
    } else if (fn === OPS.setTextMatrix) {
      const m = matrixArg(a);
      if (m && m.length >= 6) { tm = [...m]; tlm = [...m]; }
    } else if (fn === OPS.moveText) {
      tlm = mulMat(tlm, [1, 0, 0, 1, a[0], a[1]]);
      tm = [...tlm];
    } else if (fn === OPS.setLeadingMoveText) {
      leading = -a[1];
      tlm = mulMat(tlm, [1, 0, 0, 1, a[0], a[1]]);
      tm = [...tlm];
    } else if (fn === OPS.nextLine) {
      tlm = mulMat(tlm, [1, 0, 0, 1, 0, -leading]);
      tm = [...tlm];
    } else if (fn === OPS.showText || fn === OPS.showSpacedText) {
      emitShowText(a?.[0]);
    } else if (fn === OPS.nextLineShowText) {
      tlm = mulMat(tlm, [1, 0, 0, 1, 0, -leading]);
      tm = [...tlm];
      emitShowText(a?.[0]);
    } else if (fn === OPS.nextLineSetSpacingShowText) {
      wordSpacing = a?.[0] ?? wordSpacing;
      charSpacing = a?.[1] ?? charSpacing;
      tlm = mulMat(tlm, [1, 0, 0, 1, 0, -leading]);
      tm = [...tlm];
      emitShowText(a?.[2]);
    }
  }
  return runs;
}

export function splitSpanTokens(text) {
  const tokens = [];
  const re = /\S+|\s+/g;
  let match;
  while ((match = re.exec(text))) {
    tokens.push({ text: match[0], space: /^\s+$/.test(match[0]) });
  }
  return tokens;
}

export function matchSpanToRuns(spanText, spanLeftPct, spanTopPct, fontHeightPct, runs, startHint = 0) {
  const tokens = splitSpanTokens(spanText);
  const words = tokens.filter((t) => !t.space);
  if (!words.length) return null;

  // TextLayer sets `span.style.top` to `baselineY - fontAscent` (~0.75..0.85 * fontHeight).
  const expectedBaselinePct = spanTopPct + fontHeightPct * 0.78;
  const yTol = Math.max(1.0, fontHeightPct * 0.9);
  const xTol = Math.max(3.0, fontHeightPct * 2.0);

  let bestStart = -1;
  let bestDelta = Infinity;
  const firstNorm = normalizeToken(words[0].text);
  for (let i = Math.max(0, startHint); i < runs.length; i++) {
    const r = runs[i];
    if (Math.abs(r.topPct - expectedBaselinePct) > yTol) continue;
    if (Math.abs(r.leftPct - spanLeftPct) > xTol) continue;
    if (r.norm === firstNorm || firstNorm.startsWith(r.norm)) {
      const d = Math.abs(r.leftPct - spanLeftPct) + Math.abs(r.topPct - expectedBaselinePct) * 2;
      if (d < bestDelta) {
        bestDelta = d;
        bestStart = i;
      }
    }
  }
  if (bestStart < 0 && startHint > 0) {
    for (let i = 0; i < startHint; i++) {
      const r = runs[i];
      if (Math.abs(r.topPct - expectedBaselinePct) > yTol) continue;
      if (Math.abs(r.leftPct - spanLeftPct) > xTol) continue;
      if (r.norm === firstNorm || firstNorm.startsWith(r.norm)) {
        const d = Math.abs(r.leftPct - spanLeftPct) + Math.abs(r.topPct - expectedBaselinePct) * 2;
        if (d < bestDelta) {
          bestDelta = d;
          bestStart = i;
        }
      }
    }
  }
  if (bestStart < 0) return null;

  const matchedWords = [];
  let cursor = bestStart;
  for (let wIdx = 0; wIdx < words.length; wIdx++) {
    const target = normalizeToken(words[wIdx].text);
    if (!target || cursor >= runs.length) return null;
    while (cursor < runs.length && Math.abs(runs[cursor].topPct - expectedBaselinePct) > yTol) cursor++;
    if (cursor >= runs.length) return null;

    let combined = '';
    const startRun = runs[cursor];
    let endRun = startRun;
    let consumed = 0;
    while (cursor + consumed < runs.length && combined.length < target.length) {
      const next = runs[cursor + consumed];
      if (Math.abs(next.topPct - startRun.topPct) > yTol) break;
      combined += next.norm;
      endRun = next;
      consumed += 1;
      if (combined === target) break;
    }
    if (combined !== target) return null;
    const leftPct = startRun.leftPct;
    const rightPct = endRun.leftPct + endRun.widthPct;
    const widthPct = rightPct - leftPct;
    if (widthPct <= 0) return null;
    if (matchedWords.length && leftPct < matchedWords.at(-1).leftPct - 0.1) return null;
    matchedWords.push({ text: words[wIdx].text, leftPct, widthPct, baselinePct: startRun.topPct });
    cursor += consumed;
  }

  return { tokens, words: matchedWords, nextCursor: cursor };
}

function normalizeTextLayerFont(fontFamily) {
  const family = String(fontFamily || '').trim();
  const lower = family.toLowerCase();
  if (!lower || lower === 'sans-serif') return 'Arial, sans-serif';
  if (lower === 'serif') return 'Times New Roman, serif';
  if (lower === 'monospace') return 'Consolas, monospace';
  return family;
}

let measureCtx = null;
function measureTextAt30(text, fontFamily) {
  if (!measureCtx && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d');
  }
  if (!measureCtx) return 0;
  measureCtx.font = '30px ' + (fontFamily || 'sans-serif');
  return measureCtx.measureText(text).width || 0;
}

export function alignPageTextLayer(pageEl, operators, OPS, viewport) {
  const layer = pageEl?.querySelector?.('.textLayer');
  if (!layer || !operators?.fnArray?.length || !viewport?.width || !viewport?.height) return false;
  const originalSpans = [...layer.children].filter((node) => node.tagName === 'SPAN' && !node.classList.contains('markedContent'));
  if (!originalSpans.length) return false;
  if (layer.dataset.elrWordAligned === '1') return false;

  const runs = extractPdfWordRuns(operators, OPS, viewport);
  if (!runs.length) {
    layer.dataset.elrWordAligned = '1';
    return false;
  }

  let runCursor = 0;
  let changed = false;
  for (const span of originalSpans) {
    if (span.children.length > 0) continue;
    const rotate = span.style.getPropertyValue('--rotate');
    if (rotate && parseFloat(rotate) !== 0) continue;
    const rawText = span.textContent || '';
    const leftStr = span.style.left;
    const topStr = span.style.top;
    if (!leftStr.endsWith('%') || !topStr.endsWith('%')) continue;
    const spanLeftPct = parseFloat(leftStr);
    const spanTopPct = parseFloat(topStr);
    const fontHeight = parseFloat(span.style.getPropertyValue('--font-height')) || 10;
    if (!Number.isFinite(spanLeftPct) || !Number.isFinite(spanTopPct) || fontHeight <= 0) continue;

    const fontHeightPct = (fontHeight / viewport.height) * 100;
    const matched = matchSpanToRuns(rawText, spanLeftPct, spanTopPct, fontHeightPct, runs, runCursor);
    if (!matched) continue;
    runCursor = matched.nextCursor;

    const fontFamily = normalizeTextLayerFont(span.style.fontFamily || 'sans-serif');
    const expectedTopPct = matched.words[0].baselinePct - fontHeightPct * 0.78;
    const alignedTop = Math.abs(spanTopPct - expectedTopPct) > fontHeightPct * 0.15
      ? expectedTopPct.toFixed(4) + '%'
      : span.style.top;
    if (matched.words.length === 1) {
      span.style.fontFamily = fontFamily;
      span.style.top = alignedTop;
      changed = true;
      continue;
    }

    const baseTop = alignedTop;
    const baseFontHeight = span.style.getPropertyValue('--font-height');
    const dir = span.dir;

    const fragment = document.createDocumentFragment();
    let wordIdx = 0;
    for (let tIdx = 0; tIdx < matched.tokens.length; tIdx++) {
      const tok = matched.tokens[tIdx];
      if (tok.space) {
        const prevWord = wordIdx > 0 ? matched.words[wordIdx - 1] : null;
        const nextWord = wordIdx < matched.words.length ? matched.words[wordIdx] : null;
        if (!prevWord && !nextWord) continue;
        const spaceSpan = document.createElement('span');
        spaceSpan.setAttribute('role', 'presentation');
        spaceSpan.className = 'elr-tl-space';
        if (dir) spaceSpan.dir = dir;
        spaceSpan.textContent = tok.text;
        const leftPct = prevWord ? prevWord.leftPct + prevWord.widthPct : Math.max(0, nextWord.leftPct - 0.3);
        const gapPct = prevWord && nextWord ? Math.max(0.12, nextWord.leftPct - (prevWord.leftPct + prevWord.widthPct)) : 0.28;
        const measured = measureTextAt30(tok.text, fontFamily);
        const unscaledWidth = (gapPct / 100) * viewport.width;
        const rawWidthAtHeight = (measured / 30) * fontHeight;
        const scaleX = rawWidthAtHeight > 0 ? unscaledWidth / rawWidthAtHeight : 1;
        spaceSpan.style.left = leftPct.toFixed(4) + '%';
        spaceSpan.style.top = baseTop;
        spaceSpan.style.fontFamily = fontFamily;
        if (baseFontHeight) spaceSpan.style.setProperty('--font-height', baseFontHeight);
        spaceSpan.style.setProperty('--scale-x', String(Number.isFinite(scaleX) ? Math.max(0.15, Math.min(4, scaleX)) : 1));
        fragment.appendChild(spaceSpan);
        continue;
      }

      const word = matched.words[wordIdx++];
      const wordSpan = document.createElement('span');
      wordSpan.setAttribute('role', 'presentation');
      if (dir) wordSpan.dir = dir;
      wordSpan.textContent = word.text;
      const measured = measureTextAt30(word.text, fontFamily);
      const unscaledWidth = (word.widthPct / 100) * viewport.width;
      const rawWidthAtHeight = (measured / 30) * fontHeight;
      const scaleX = rawWidthAtHeight > 0 ? unscaledWidth / rawWidthAtHeight : 1;
      wordSpan.style.left = word.leftPct.toFixed(4) + '%';
      wordSpan.style.top = baseTop;
      wordSpan.style.fontFamily = fontFamily;
      if (baseFontHeight) wordSpan.style.setProperty('--font-height', baseFontHeight);
      wordSpan.style.setProperty('--scale-x', String(Number.isFinite(scaleX) ? Math.max(0.25, Math.min(3, scaleX)) : 1));
      fragment.appendChild(wordSpan);
    }
    span.replaceWith(fragment);
    changed = true;
  }

  layer.dataset.elrWordAligned = '1';
  return changed;
}
