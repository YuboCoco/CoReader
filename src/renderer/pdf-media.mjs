import { captionOfLine, equationNumber, equationNumberPattern } from './pdf-reading.mjs';

const mathSymbols = /[=≈≠≤≥±∑∏∫√∞∂∇×÷→←↦∈∉∩∪⊗⊕−^_]/u;
const mathToken = String.raw`(?:\\[a-zA-Z]+(?:\{[^{}\n]+\})*|[\p{L}\p{N}](?:[_^₀-₉⁰-⁹][\p{L}\p{N}{}]*)?|[∑∏∫√∂∇∞]|[a-zA-Z]{1,3}\([^(),.;\n]{1,45}\)|-?\d+(?:\.\d+)?|[xyz]\[[^\]\n]+\])`;
const expression = new RegExp('(?<![A-Za-z0-9])' + mathToken + '(?:\\s*[=≈≠≤≥±+*/×÷−^∈∉⊗⊕-]\\s*' + mathToken + ')+(?![A-Za-z0-9])', 'gu');
const inlineNotation = /\$\$[^$\n]+\$\$|\$[^$\n]+\$|\\\([^\n]+?\\\)|\\\[[^\n]+?\\\]|\\(?:frac|sqrt|sum|int|mathbf|mathbb|mathrm|operatorname)(?:\{[^{}\n]+\})+|(?<![A-Za-z0-9])[a-zA-Z]\([a-zA-Z0-9](?:,\s*[a-zA-Z0-9]){0,3}\)(?![A-Za-z0-9])|[\p{Script=Greek}\p{Sm}\u{1d400}-\u{1d7ff}](?:[_^][\p{L}\p{N}{}]+|[₀-₉⁰-⁹]+)?|[a-zA-Z](?:[_^](?:\{[^{}\n]+\}|[a-zA-Z0-9]+)|[₀-₉⁰-⁹]+)/gu;
const prose = /\p{L}{2}/u;
const sourcePrefix = 'math/v1:';

export function protectMath(text, inline = []) {
  // Match the larger expressions first so a symbol in one cannot split it.
  const geometric = [];
  for (const value of new Set(inline)) {
    if (!value) continue;
    for (let index = text.indexOf(value); index >= 0; index = text.indexOf(value, index + value.length)) {
      geometric.push({ 0: value, index });
    }
  }
  const matches = [...geometric, ...text.matchAll(expression), ...text.matchAll(inlineNotation)]
    .sort((a, b) => a.index - b.index || b[0].length - a[0].length);
  const parts = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.index < cursor) continue;
    if (cursor < match.index) parts.push({ text: text.slice(cursor, match.index) });
    parts.push({ math: true, text: match[0] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}

export function translationSource(block) {
  return block.parts?.some((part) => part.math) ? sourcePrefix + block.text : block.text;
}

export function isDisplayMath(text) {
  if (/^(?:\$\$|\\\[)/.test(text)) return true;
  const unnumbered = text.replace(/\s*\(\d+(?:\.\d+)*[a-z]?\)\s*$/i, '');
  if (!mathSymbols.test(unnumbered) && !/[+*/]/.test(unnumbered) && !/[\u{1d400}-\u{1d7ff}]/u.test(unnumbered)) return false;
  const residue = protectMath(unnumbered).filter((part) => !part.math).map((part) => part.text).join(' ');
  return !prose.test(residue) && !/[\p{Script=Han}]/u.test(residue);
}

function multiply(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}

function transformed([left, bottom, right, top], matrix) {
  const points = [[left, bottom], [right, bottom], [right, top], [left, top]];
  const x = points.map(([x, y]) => matrix[0] * x + matrix[2] * y + matrix[4]);
  const y = points.map(([x, y]) => matrix[1] * x + matrix[3] * y + matrix[5]);
  return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)];
}

function intersection(a, b) {
  const bounds = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return bounds[2] >= bounds[0] && bounds[3] >= bounds[1] ? bounds : null;
}

function union(a, b) {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

function area(bounds) {
  return bounds ? (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]) : 0;
}

function padding(box, width) {
  return box.map((v, i) => i < 2 ? v - width : v + width);
}

export function pdfGraphics(operators, ops, pageBox, hasText) {
  const stack = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  let clip = pageBox;
  const pictures = [];
  const drawings = [];
  const forms = new Set([ops.paintFormXObjectBegin, ops.beginGroup]);
  const ends = new Set([ops.restore, ops.paintFormXObjectEnd, ops.endGroup]);
  const images = new Set([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject]);
  const unit = [0, 0, 1, 1];
  const add = (collection, box, transform = matrix) => {
    if (!box || !clip) return;
    const bounds = intersection(transformed(box, transform), clip);
    if (!bounds || !bounds.every(Number.isFinite)) return;
    const width = bounds[2] - bounds[0];
    const height = bounds[3] - bounds[1];
    if (area(bounds) > area(pageBox) * .88 && (hasText || collection === drawings)) return;
    if (collection === pictures ? width >= 16 && height >= 14 : Math.max(width, height) >= 8) collection.push(bounds);
  };
  for (let i = 0; i < operators.fnArray.length; i++) {
    const fn = operators.fnArray[i];
    const args = operators.argsArray[i] || [];
    if (fn === ops.save || forms.has(fn)) {
      stack.push({ matrix, clip });
      const transform = fn === ops.beginGroup ? args[0]?.matrix : args[0];
      const bbox = fn === ops.beginGroup ? args[0]?.bbox : args[1];
      if (forms.has(fn) && transform) matrix = multiply(matrix, transform);
      if (forms.has(fn) && bbox && clip) clip = intersection(clip, transformed(bbox, matrix));
    } else if (ends.has(fn)) {
      const state = stack.pop();
      if (state) ({ matrix, clip } = state);
    } else if (fn === ops.transform) matrix = multiply(matrix, args);
    else if (images.has(fn)) add(pictures, unit);
    else if (fn === ops.paintInlineImageXObjectGroup || fn === ops.paintImageMaskXObjectGroup) {
      for (const item of (fn === ops.paintInlineImageXObjectGroup ? args[1] : args[0]) || []) {
        if (item.transform) add(pictures, unit, multiply(matrix, item.transform));
      }
    } else if (fn === ops.paintImageXObjectRepeat) {
      const [, xScale, yScale, positions] = args;
      for (let offset = 0; offset < positions.length; offset += 2) {
        add(pictures, unit, multiply(matrix, [xScale, 0, 0, yScale, positions[offset], positions[offset + 1]]));
      }
    } else if (fn === ops.constructPath && args[0] !== ops.endPath) add(drawings, args[2]);
  }
  return { pictures, drawings };
}

function lineBox(line) {
  return [line.left, line.y - line.size * .27, line.right, line.y + line.size * .82];
}

function groupBoxes(boxes, gap) {
  const groups = [];
  for (const box of boxes) {
    let bounds = box;
    let count = 1;
    for (let i = groups.length - 1; i >= 0; i--) {
      if (!intersection(padding(bounds, gap), groups[i].bounds)) continue;
      bounds = union(bounds, groups[i].bounds);
      count += groups[i].count;
      groups.splice(i, 1);
      i = groups.length;
    }
    groups.push({ bounds, count });
  }
  return groups;
}

function tableRows(items) {
  const rows = new Map();
  for (const item of items) {
    if (!item.str?.trim() || !item.transform || !item.width || !item.height) continue;
    const y = Math.round(item.transform[5] / 2) * 2;
    const left = item.transform[4];
    const cell = { left, right: left + item.width, y, size: item.height, numeric: /^[+\-−]?\d+(?:[.,]\d+)?%?$/.test(item.str.trim()) };
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(cell);
  }
  return [...rows.values()].flatMap((cells) => {
    cells.sort((a, b) => a.left - b.left);
    const parts = cells.filter((cell, i) => i === 0 || cell.left - cells[i - 1].right > Math.max(12, cell.size * 1.3));
    if (parts.length < 2) return [];
    return [{ columns: parts.map((item) => item.left), numeric: cells.some((cell) => cell.numeric),
      bounds: lineBox({ ...cells[0], right: Math.max(...cells.map((cell) => cell.right)) }) }];
  }).sort((a, b) => b.bounds[3] - a.bounds[3]);
}

function hasColumns(a, b) {
  return a.columns.filter((x) => b.columns.some((other) => Math.abs(x - other) < 10)).length >= 2;
}

function unlabeledTables(rows, drawings) {
  const tables = [];
  for (let index = 0; index + 2 < rows.length; index++) {
    const first = rows[index];
    let last = first;
    let bounds = first.bounds;
    let numeric = Number(first.numeric);
    let next = index + 1;
    for (; next < rows.length; next++) {
      const row = rows[next];
      const gap = last.bounds[1] - row.bounds[3];
      if (gap < -2 || gap > 20 || !hasColumns(first, row)) break;
      last = row;
      bounds = union(bounds, row.bounds);
      numeric += Number(row.numeric);
    }
    if (next - index < 3 || numeric < 2) continue;
    const rules = drawings.filter((rule) => rule[3] - rule[1] <= 2 && rule[0] <= bounds[0] + 8 &&
      rule[0] >= bounds[0] - 25 && rule[2] >= bounds[2] - 8 && rule[2] <= bounds[2] + 50 &&
      rule[1] > bounds[1] - 20 && rule[3] < bounds[3] + 20);
    if (first.columns.length < 3 && rules.length < 2) continue;
    for (const rule of rules) bounds = union(bounds, rule);
    tables.push(bounds);
    index = next - 1;
  }
  return tables;
}

export function pdfMedia(lines, items, graphics, pageBox) {
  const width = pageBox[2] - pageBox[0];
  const height = pageBox[3] - pageBox[1];
  const captions = lines.flatMap((line, index) => {
    const caption = captionOfLine(line, lines[index - 1]);
    return caption ? [{ ...caption, line }] : [];
  });
  const captionLines = new Set(captions.map(({ line }) => line));
  const rows = tableRows(items);
  const drawings = groupBoxes(graphics.drawings, 9).filter(({ bounds }) =>
    (bounds[2] - bounds[0]) > 23 && (bounds[3] - bounds[1]) > 12);
  const media = [];
  const add = (kind, bounds, label = '', number) => {
    const clipped = intersection(padding(bounds, kind === 'formula' ? 2 : 3), pageBox);
    if (!clipped || area(clipped) < 25) return;
    if (media.some((item) => area(intersection(item.bounds, clipped)) / Math.min(area(item.bounds), area(clipped)) > .82)) return;
    media.push({ kind, bounds: clipped, label, number });
  };

  for (const { kind, line, label } of captions) {
    const box = lineBox(line);
    const maxGap = Math.min(118, height * .16);
    const candidates = [...graphics.pictures, ...drawings.map(({ bounds }) => bounds)]
      .map((bounds) => {
        const overlap = Math.min(bounds[2], box[2]) - Math.max(bounds[0], box[0]);
        const gap = kind === 'table' ? box[1] - bounds[3] : bounds[1] - box[3];
        const crossesCaption = bounds[1] < box[3] && bounds[3] > box[1];
        const reverseGap = kind === 'table' ? bounds[1] - box[3] : box[1] - bounds[3];
        return { bounds, overlap, gap: gap < -2 ? reverseGap + 25 : gap, crossesCaption };
      })
      .filter(({ gap, overlap, crossesCaption }) => !crossesCaption && gap >= -2 && gap <= maxGap && overlap > 4)
      .sort((a, b) => a.gap - b.gap);
    let bounds = candidates[0]?.bounds;
    if (kind === 'table') {
      let picked = null;
      for (const row of rows) {
        if (row.bounds[3] > box[1] || box[1] - row.bounds[3] > height * .49 ||
          row.bounds[2] < box[0] || row.bounds[0] > box[2]) continue;
        const gap = (picked?.last.bounds[1] ?? box[1]) - row.bounds[3];
        if (gap > (picked ? 26 : 42)) break;
        if (picked && !hasColumns(picked.first, row)) continue;
        picked = picked ? { ...picked, bounds: union(picked.bounds, row.bounds), count: picked.count + 1, last: row }
          : { first: row, last: row, bounds: row.bounds, count: 1 };
      }
      if (picked?.count >= 2) bounds = bounds && intersection(padding(picked.bounds, 12), bounds) ? union(bounds, picked.bounds) : picked.bounds;
      if (!bounds) {
        const rules = graphics.drawings.filter((rule) => rule[2] - rule[0] >= 38 && rule[3] - rule[1] <= 2
          && rule[3] <= box[1] && box[1] - rule[3] < height * .46
          && Math.min(rule[2], box[2]) - Math.max(rule[0], box[0]) > 12)
          .sort((a, b) => b[3] - a[3]);
        if (rules.length >= 2 && box[1] - rules[0][3] < 36) {
          const compatible = rules.slice(1).filter((rule) => Math.abs(rule[0] - rules[0][0]) < 8 && Math.abs(rule[2] - rules[0][2]) < 8);
          if (compatible.length) bounds = union(rules[0], compatible.at(-1));
        }
      }
      if (bounds) {
        const horizontal = graphics.drawings.filter((rule) => rule[3] - rule[1] <= 2
          && rule[2] - rule[0] > (bounds[2] - bounds[0]) * .65
          && rule[0] <= bounds[0] + 8 && rule[0] >= bounds[0] - 40
          && rule[2] >= bounds[2] - 12 && rule[2] <= bounds[2] + 60
          && rule[1] >= bounds[1] - 18 && rule[3] <= Math.min(box[1] - 1, bounds[3] + 18));
        for (const rule of horizontal) bounds = union(bounds, rule);
      }
    }
    if (bounds) add(kind, bounds, label);
  }
  for (const bounds of unlabeledTables(rows, graphics.drawings)) add('table', bounds);
  for (const bounds of graphics.pictures) add('figure', bounds);
  // Connected vector strokes and fills without captions can still be plots or diagrams.
  for (const { bounds, count } of drawings) {
    if (count >= 3 && bounds[2] - bounds[0] > width * .13 && bounds[3] - bounds[1] > height * .038
      && !lines.some((line) => !captionLines.has(line) && line.text.length > 68 &&
        area(intersection(lineBox(line), bounds)) > area(lineBox(line)) * .7)) add('figure', bounds);
  }
  for (const line of lines) {
    if (!isDisplayMath(line.text)) continue;
    const number = lines.find((other) => Math.abs(other.y - line.y) < line.size * .35 && other.left > line.right &&
      equationNumberPattern.test(other.text.trim()));
    const bounds = number ? union(lineBox(line), lineBox(number)) : lineBox(line);
    add('formula', bounds, number ? line.text + ' ' + number.text : line.text, equationNumber(number?.text ?? line.text));
  }
  return media;
}

export function lineInsideMedia(line, media, previous) {
  const box = lineBox(line);
  const size = area(box);
  return !captionOfLine(line, previous) && size > 0 && media.some(({ bounds }) => area(intersection(box, bounds)) / size > .63);
}

export function insertMedia(blocks, media) {
  const ordered = [...blocks];
  for (const asset of [...media].sort((a, b) => b.bounds[3] - a.bounds[3] || a.bounds[0] - b.bounds[0])) {
    const [x, bottom, right, y] = asset.bounds;
    const index = ordered.findIndex((block) => block.y < y && (block.x < right + 12 && (block.right ?? block.x) > x - 12));
    const item = { ...asset, x, right, y, bottom, text: asset.label };
    if (index < 0) ordered.push(item);
    else ordered.splice(index, 0, item);
  }
  return ordered.map((block, index) => ({ ...block, index }));
}

export function blockAtPoint(blocks, x, y) {
  return blocks.find((block) => (block.boxes || [block.bounds]).some((box) => box && intersection(box, [x, y, x, y])));
}

export function viewportBounds(viewport, [left, bottom, right, top]) {
  return [...viewport.convertToViewportPoint(left, bottom), ...viewport.convertToViewportPoint(right, top)];
}

export async function renderMedia(page, blocks, signal) {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.4, 1800 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const sheet = document.createElement('canvas');
  sheet.width = Math.ceil(viewport.width);
  sheet.height = Math.ceil(viewport.height);
    const task = page.render({ canvasContext: sheet.getContext('2d'), viewport, background: '#ffffff' });
  const cancel = () => task.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    await task.promise;
    signal.throwIfAborted();
    return new Map(blocks.map((block) => {
      const [x1, y1, x2, y2] = viewportBounds(viewport, block.bounds);
      const x = Math.max(0, Math.floor(Math.min(x1, x2)));
      const y = Math.max(0, Math.floor(Math.min(y1, y2)));
      const crop = document.createElement('canvas');
      crop.width = Math.max(1, Math.min(sheet.width, Math.ceil(Math.max(x1, x2))) - x);
      crop.height = Math.max(1, Math.min(sheet.height, Math.ceil(Math.max(y1, y2))) - y);
      crop.getContext('2d').drawImage(sheet, x, y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      const image = { url: crop.toDataURL('image/png'), width: crop.width, height: crop.height,
        naturalWidth: crop.width / scale };
      crop.width = 0;
      crop.height = 0;
      return [block.index, image];
    }));
  } finally {
    signal.removeEventListener('abort', cancel);
    sheet.width = 0;
    sheet.height = 0;
  }
}

export function bookmarkWithNumber(bookmark, lines) {
  const prefix = /^(?:\d+(?:\.\d+)*[.)]?|[IVXLC]+[.)]|[A-Z](?:\.\d+)+\.?|[A-Z][.)])\s+/u;
  if (prefix.test(bookmark.title)) return bookmark;
  const normalize = (value) => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu, '');
  const title = normalize(bookmark.title);
  if (!title) return bookmark;
  const matches = lines.filter((line) => prefix.test(line.text) && normalize(line.text.replace(prefix, '')) === title);
  if (!matches.length) return bookmark;
  const nearby = Number.isFinite(bookmark.y)
    ? matches.filter((line) => Math.abs(line.y - bookmark.y) <= 52).sort((a, b) => Math.abs(a.y - bookmark.y) - Math.abs(b.y - bookmark.y))
    : matches;
  const match = nearby[0] || (matches.length === 1 ? matches[0] : null);
  return match ? { ...bookmark, title: match.text } : bookmark;
}
