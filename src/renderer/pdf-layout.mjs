import { inputSize } from '../layout-spec.mjs';
import { equationNumber, equationNumberPattern, readingLines } from './pdf-reading.mjs';

const flowLabels = new Set([
  'abstract', 'aside_text', 'content', 'doc_title', 'figure_title', 'footnote', 'paragraph_title',
  'reference', 'reference_content', 'text', 'vertical_text', 'vision_footnote', 'header', 'footer',
]);

export async function readLayout(page, detect) {
  const viewport = page.getViewport({ scale: 1 });
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = inputSize;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const transform = [inputSize / viewport.width, 0, 0, inputSize / viewport.height, 0, 0];
    await page.render({ canvasContext: context, viewport, transform, background: '#ffffff' }).promise;
    const pixels = context.getImageData(0, 0, inputSize, inputSize).data;
    const regions = await detect(pixels.buffer);
    return toPdfRegions(regions || [], viewport);
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export function toPdfRegions(regions, viewport) {
  return regions.map((region) => {
    const [left, top, right, bottom] = region.bounds;
    const [x1, y1] = viewport.convertToPdfPoint(left * viewport.width, top * viewport.height);
    const [x2, y2] = viewport.convertToPdfPoint(right * viewport.width, bottom * viewport.height);
    return { ...region, bounds: [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)] };
  });
}

const width = (box) => box[2] - box[0];
const height = (box) => box[3] - box[1];
const centerX = (box) => (box[0] + box[2]) / 2;
const centerY = (box) => (box[1] + box[3]) / 2;
const overlapX = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
const overlapY = (a, b) => Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
const shared = (a, b) => Math.max(0, overlapX(a, b)) * Math.max(0, overlapY(a, b));
const area = (box) => width(box) * height(box);
const shares = (a, b) => shared(a, b) / Math.max(1, Math.min(area(a), area(b)));
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const padded = ([x1, y1, x2, y2], amount) => [x1 - amount, y1 - amount, x2 + amount, y2 + amount];

function glyphBounds(item) {
  const x = item.transform?.[4];
  const y = item.transform?.[5];
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const size = Math.max(1, Math.abs(item.height || item.transform[3] || 0));
  return [x, y - size * .22, x + Math.max(1, item.width), y + size * .82];
}

export function textOutsideMedia(items, assets) {
  return items.flatMap((item) => {
    const box = item.str?.trim() && glyphBounds(item);
    if (!box || !assets.some(({ bounds }) => shared(box, bounds) / area(box) >= .55)) return [item];
    // Keep an end-of-line marker even when its last glyph was part of a graphic.
    return item.hasEOL ? [{ str: '', hasEOL: true }] : [];
  });
}

export function formulaTextInBounds(items, bounds) {
  const formula = items.flatMap((item) => {
    const box = item.str?.trim() && glyphBounds(item);
    if (!box || shared(box, bounds) / area(box) < .55) return [];
    return [item.str.trim()];
  }).join(' ');
  return equationNumberPattern.test(formula) ? '' : formula;
}

const captionStart = /^(?:fig(?:ure)?\.?|table|algorithm)\s*[A-Z]?\d+(?:[.-]\d+)*(?:[\s:.)]|$)/i;

function extendDiagram(bounds, glyphs, blockers, pageBox) {
  const pageHeight = height(pageBox);
  const above = glyphs.filter(({ item, box }) => {
    const text = item.str.trim();
    const gap = box[1] - bounds[3];
    return gap >= -2 && gap < Math.min(37, pageHeight * .048) &&
      text.length >= 5 && !captionStart.test(text) &&
      !/[=≈≠≤≥∈∉⊂⊃∑∏∫]|^\(\d+(?:\.\d+)*[a-z]?\)$/u.test(text) &&
      Math.abs(centerX(box) - centerX(bounds)) < width(bounds) * .21 &&
      width(box) <= width(bounds) * .75 &&
      !blockers.some((region) => shared(region.bounds, box) > area(box) * .35);
  });
  if (!above.length) return bounds;
  const nearest = Math.min(...above.map(({ box }) => box[1] - bounds[3]));
  if (nearest > 42) return bounds;
  return above.filter(({ box }) => box[1] - bounds[3] <= nearest + 18).reduce((box, glyph) => union(box, glyph.box), bounds);
}

function addEquations(regions, glyphs, flow, visuals, pageBox) {
  const formulas = regions.filter(({ label, bounds }) => label === 'display_formula' &&
    !visuals.some((visual) => shares(visual.bounds, bounds) > .22));
  const blocks = [];
  for (const formula of formulas) {
    let bounds = formula.bounds;
    const candidates = glyphs.filter(({ item, box }) => equationNumberPattern.test(item.str.trim()) &&
      Math.abs(centerY(box) - centerY(bounds)) < Math.max(6, height(bounds) * .75) &&
      box[0] >= bounds[0] && box[0] - bounds[2] <= width(pageBox) * .3);
    const number = candidates.sort((a, b) => a.box[0] - b.box[0])[0];
    if (number) bounds = union(bounds, number.box);
    const modelNumber = regions.find((region) => region.label === 'formula_number' &&
      Math.abs(centerY(region.bounds) - centerY(bounds)) < 6 &&
      region.bounds[0] >= bounds[0] && region.bounds[0] <= bounds[2] + (number ? 4 : width(pageBox) * .22));
    if (modelNumber) bounds = union(bounds, modelNumber.bounds);
    const merged = { ...formula, kind: 'formula', bounds, layout: 'model', number: equationNumber(number?.item.str) };
    for (let index = blocks.length - 1; index >= 0; index--) {
      const other = blocks[index];
      const xGap = -overlapX(merged.bounds, other.bounds);
      const yGap = -overlapY(merged.bounds, other.bounds);
      const alignedRow = Math.abs(centerY(merged.bounds) - centerY(other.bounds)) <= 8 && xGap < width(pageBox) * .16;
      const adjacentRow = yGap <= 8 && overlapX(merged.bounds, other.bounds) > 4;
      if (!alignedRow && !adjacentRow) continue;
      const joined = union(merged.bounds, other.bounds);
      if (height(joined) > 100 || flow.some((region) => shared(region.bounds, joined) >
        Math.min(area(region.bounds), area(joined)) * .2)) continue;
      merged.bounds = joined;
      if (other.order < merged.order && other.number) merged.number = other.number;
      merged.number ??= other.number;
      merged.order = Math.min(merged.order, other.order);
      blocks.splice(index, 1);
      index = blocks.length;
    }
    blocks.push(merged);
  }
  return blocks;
}

function mergeCompositeVisuals(visuals, flow, glyphs, pageBox) {
  const pageHeight = height(pageBox);
  const pageWidth = width(pageBox);
  const items = [...visuals];
  const betweenBox = (a, b, vertical) => vertical
    ? [Math.min(a[0], b[0]), Math.min(a[3], b[3]), Math.max(a[2], b[2]), Math.max(a[1], b[1])]
    : [Math.min(a[2], b[2]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[3], b[3])];
  const hasBlocker = (a, b, vertical) => {
    const gapBox = betweenBox(a, b, vertical);
    if (width(gapBox) <= 0 || height(gapBox) <= 0) return false;
    const blockedByFlow = flow.some((region) => {
      if (shares(region.bounds, a) > .4 || shares(region.bounds, b) > .4) return false;
      const inGap = overlapX(region.bounds, gapBox) > 8 && overlapY(region.bounds, gapBox) > 4;
      if (!inGap) return false;
      return region.label === 'figure_title' || region.label === 'paragraph_title'
        || width(region.bounds) > width(gapBox) * .45 || height(region.bounds) > 14;
    });
    if (blockedByFlow) return true;
    return glyphs.some(({ item, box }) => captionStart.test(item.str.trim())
      && overlapX(box, gapBox) > 4 && overlapY(box, gapBox) > 2);
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < items.length && !changed; i++) {
      if (items[i].kind !== 'figure' && items[i].kind !== 'table') continue;
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].kind !== items[i].kind) continue;
        const a = items[i].bounds;
        const b = items[j].bounds;
        const xRatio = overlapX(a, b) / Math.max(1, Math.min(width(a), width(b)));
        const yRatio = overlapY(a, b) / Math.max(1, Math.min(height(a), height(b)));
        const wRatio = Math.min(width(a), width(b)) / Math.max(1, Math.max(width(a), width(b)));
        const hRatio = Math.min(height(a), height(b)) / Math.max(1, Math.max(height(a), height(b)));
        const vGap = -overlapY(a, b);
        const hGap = -overlapX(a, b);
        const isTable = items[i].kind === 'table';
        const verticalStack = isTable
          ? xRatio >= .7 && wRatio >= .7 && vGap >= -8 && vGap <= Math.min(28, pageHeight * .04)
          : xRatio >= .55 && wRatio >= .55 && vGap >= -8 && vGap <= Math.min(48, pageHeight * .065);
        const horizontalPair = !isTable && yRatio >= .55 && hRatio >= .55 && hGap >= -8 && hGap <= Math.min(36, pageWidth * .06);
        if (!verticalStack && !horizontalPair) continue;
        if (hasBlocker(a, b, verticalStack)) continue;
        items[i] = {
          ...items[i],
          bounds: union(a, b),
          order: Math.min(items[i].order ?? Infinity, items[j].order ?? Infinity),
          captionLabel: items[i].captionLabel || items[j].captionLabel,
        };
        items.splice(j, 1);
        changed = true;
        break;
      }
    }
  }
  return items;
}

function trimTableTop(bounds, flow, textLines) {
  let top = bounds[3];
  const minTop = bounds[1] + height(bounds) * .35;
  for (const region of flow) {
    if (region.label !== 'figure_title' && region.label !== 'text') continue;
    if (overlapX(region.bounds, bounds) > width(bounds) * .25 && region.bounds[3] > top - 4
      && region.bounds[1] < top && region.bounds[1] > minTop) {
      top = Math.min(top, region.bounds[1] - 3);
    }
  }
  const overlappingLines = textLines
    .filter((line) => Math.min(line.right, bounds[2]) - Math.max(line.left, bounds[0]) > 12)
    .sort((a, b) => b.y - a.y || a.left - b.left);
  const tableCaption = /^(?:table|表)\s*[A-Z]?\d+(?:[.-]\d+)*(?:[\s.:：]|$)/i;
  for (let i = 0; i < overlappingLines.length; i++) {
    const start = overlappingLines[i];
    if (!tableCaption.test(start.text.trim())) continue;
    const startBottom = start.y - (start.size || 10) * .25;
    if (startBottom < minTop || startBottom > bounds[3] + 95) continue;
    if (Math.min(start.right, bounds[2]) - Math.max(start.left, bounds[0]) < Math.min(width(bounds), start.right - start.left) * .2) continue;
    let prev = start;
    let captionBottom = startBottom;
    for (let j = i + 1; j < overlappingLines.length; j++) {
      const next = overlappingLines[j];
      const gap = prev.y - next.y;
      if (gap < 0) continue;
      if (gap < (prev.size || 10) * .35) {
        captionBottom = Math.min(captionBottom, next.y - (next.size || 10) * .25);
        continue;
      }
      if (gap > (prev.size || 10) * 2.1) break;
      if (Math.abs(next.left - start.left) > 24) break;
      const proseLike = /(?:[A-Za-z]{4,}.*){2,}/.test(next.text) || /[.。]$/.test(next.text.trim());
      if (!proseLike) break;
      captionBottom = next.y - (next.size || 10) * .25;
      prev = next;
    }
    if (captionBottom < top && captionBottom > minTop) top = Math.min(top, captionBottom - 3);
  }
  const proseFunctionWord = /\b(?:the|are|is|in|of|for|with|over|shown|reported|denotes|replaces|averaged)\b/i;
  for (const line of overlappingLines) {
    const lineBottom = line.y - (line.size || 10) * .25;
    if (line.y < top - 42 || lineBottom >= top || lineBottom <= minTop) continue;
    const trimmed = line.text.trim();
    const numericTokens = (trimmed.match(/\b\d+(?:\.\d+)?%?\b/g) || []).length;
    const wordTokens = (trimmed.match(/[A-Za-z]{2,}/g) || []).length;
    const proseSentence = /(?:[A-Za-z]{4,}.*){2,}/.test(trimmed)
      && (/[.!?。！？]$/.test(trimmed) || proseFunctionWord.test(trimmed))
      && numericTokens <= wordTokens;
    if (!proseSentence) break;
    top = Math.min(top, lineBottom - 3);
  }
  return top < bounds[3] ? [bounds[0], bounds[1], bounds[2], top] : bounds;
}

function trimFigureTop(bounds, formulaRegions, textLines) {
  let top = bounds[3];
  const minTop = bounds[1] + height(bounds) * .45;
  for (const region of formulaRegions) {
    const overlapsTop = overlapX(region.bounds, bounds) > 8 && region.bounds[1] < top && region.bounds[1] > minTop;
    const sticksOut = region.bounds[0] < bounds[0] - 8 || region.bounds[2] > bounds[2] + 8 || region.bounds[3] > top - 4;
    if (overlapsTop && sticksOut) top = Math.min(top, region.bounds[1] - 2);
  }
  for (const line of textLines) {
    const lineBottom = line.y - (line.size || 10) * .25;
    if (lineBottom >= top || lineBottom <= minTop) continue;
    if (Math.min(line.right, bounds[2]) - Math.max(line.left, bounds[0]) <= 8) continue;
    const sticksOut = line.left < bounds[0] - 12 || line.right > bounds[2] + 12;
    const isExternal = /[=≈≠≤≥∈∉⊂⊃∑∏∫]|\(\d+(?:\.\d+)*[a-z]?\)$|(?:[A-Za-z]{4,}.*){2,}/u.test(line.text);
    if (sticksOut && isExternal) top = Math.min(top, lineBottom - 2);
  }
  return top < bounds[3] ? [bounds[0], bounds[1], bounds[2], top] : bounds;
}

export function composeMedia(regions, items, fallback, pageBox, inlineMathBounds = []) {
  const flow = regions.filter(({ label }) => flowLabels.has(label));
  const formulaRegions = regions.filter(({ label }) => label === 'display_formula' || label === 'formula_number');
  const diagramBlockers = regions.filter(({ label }) => flowLabels.has(label) || ['table', 'display_formula', 'formula_number'].includes(label));
  const textLines = readingLines(items);
  const glyphs = items.flatMap((item) => {
    const box = item.str?.trim() && glyphBounds(item);
    return box ? [{ item, box }] : [];
  });
  const visuals = [];
  for (const region of [...regions].sort((a, b) => b.score - a.score)) {
    const { bounds, label } = region;
    const kind = label === 'table' ? 'table' : ['image', 'chart', 'algorithm'].includes(label) ? 'figure' : '';
    if (!kind || visuals.some((asset) => shares(asset.bounds, bounds) > .7)) continue;
    const refined = kind === 'figure'
      ? extendDiagram(trimFigureTop(bounds, formulaRegions, textLines), glyphs, diagramBlockers, pageBox)
      : trimTableTop(bounds, flow, textLines);
    visuals.push({ ...region, kind, layout: 'model', bounds: refined });
  }
  for (const asset of fallback.filter(({ kind }) => kind !== 'formula')) {
    const matching = visuals.find((visual) => shares(visual.bounds, asset.bounds) > .2);
    if (matching) {
      if (asset.kind === matching.kind && asset.label && !matching.captionLabel) matching.captionLabel = asset.label;
      continue;
    }
    if (flow.some((region) => shares(region.bounds, asset.bounds) > .62)) continue;
    visuals.push({ ...asset, layout: 'geometry' });
  }
  const mergedVisuals = mergeCompositeVisuals(visuals, flow, glyphs, pageBox).map((asset) =>
    asset.kind === 'table' && asset.layout === 'geometry' ? { ...asset, bounds: trimTableTop(asset.bounds, flow, textLines) } : asset);
  const inline = (bounds) => inlineMathBounds.some((box) => shares(bounds, box) > .55);
  const equationRegions = regions.filter(({ label, bounds }) => label !== 'display_formula' || !inline(bounds));
  const formulas = addEquations(equationRegions, glyphs, flow, mergedVisuals, pageBox);
  for (const asset of fallback.filter(({ kind }) => kind === 'formula')) {
    if (inline(asset.bounds)) continue;
    if ([...mergedVisuals, ...formulas].some((area) => shares(area.bounds, asset.bounds) > .14)) continue;
    if (flow.some((region) => shares(region.bounds, asset.bounds) > .58)) continue;
    formulas.push({ ...asset, layout: 'geometry' });
  }
  return [...mergedVisuals, ...formulas].map((asset) => {
    const expanded = padded(asset.bounds, asset.layout === 'model' ? 3 : 0);
    return { ...asset, bounds: [Math.max(pageBox[0], expanded[0]), Math.max(pageBox[1], expanded[1]),
      Math.min(pageBox[2], expanded[2]), Math.min(pageBox[3], expanded[3])] };
  });
}
