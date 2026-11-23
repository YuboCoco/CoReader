const sectionWords = /^(?:abstract|keywords|introduction|background|related work|literature review|preliminaries|method(?:s|ology)?|materials and methods|experimental setup|experiments|evaluation|results|discussion|conclusions?|limitations|acknowledg(?:e)?ments?|references|bibliography|appendix(?: [A-Z0-9])?|摘要|引言|绪论|相关工作|研究方法|实验(?:设计|结果)?|结果与讨论|讨论|结论|参考文献|附录)$/i;
const numberedTitle = /^(\d+(?:\.\d+){0,4}|[A-Z](?:\.\d+)+)[.)]?\s+(\S.*)$|^([IVXLC]+|[A-Z])[.)]\s+(\S.*)$/;
const maxBlockChars = 4500;
const bulletStart = /^(?:[•●▪◦‣∙·–—]\s+|(?:\(?\d{1,2}\)|\d{1,2}\.)\s+)\S/u;
const compoundTail = /^(?:based|aware|dependent|free|specific|wise|attention)\b/i;
const captionPattern = /^(?:(fig(?:ure)?\.?|图|algorithm|算法)|(table|表))\s*[A-Z]?\d+(?:[.-]\d+)*(?=\s|[.:：]|$)/i;
export const visualCaptionPattern = /^(figure|fig\.?|table|图|表)\s*((?:[a-z]\.?)?\d+(?:[.-]\d+)*[a-z]?|[ivxlcdm]+)(?=\s|[.:：)]|$)/i;
export const equationNumberPattern = /^\((?:[a-z]\.?)?\d+(?:[.-]\d+)*[a-z]?\)$/i;

export function visualCaptionLabel(text) {
  const match = visualCaptionPattern.exec(String(text || '').trim());
  if (!match) return null;
  return { kind: /^(?:table|表)$/i.test(match[1]) ? 'table' : 'figure', number: match[2] };
}

export function equationNumber(text) {
  const token = String(text || '').trim().match(/(?:^|\s)(\([^()]+\))$/)?.[1];
  return token && equationNumberPattern.test(token) ? token.slice(1, -1) : null;
}

const sentenceEnd = /[.!?。！？:：]$/;

export function captionOfLine(line, previous) {
  const match = captionPattern.exec(line.text);
  if (!match) return null;
  const tail = line.text.slice(match[0].length).trimStart();
  if (/^(?:show|illustrate|list|report|present|compare|summarize|give|contain|display|provide)s?\b/i.test(tail)) return null;
  const size = line.size || 10;
  const gap = previous ? previous.y - line.y : Infinity;
  if (previous && !/^[:：]/.test(tail) && !sentenceEnd.test(previous.text)
    && gap > 0 && gap <= 1.38 * size && Math.abs(line.left - previous.left) < 1.7 * size
    && Math.abs(line.right - previous.right) < 1.7 * size && Math.abs(size - previous.size) < .16 * size) return null;
  return { kind: match[2] ? 'table' : 'figure', label: match[0] };
}

function formatFraction(runs) {
  const radical = runs.findIndex((run) => run.text.trim() === '√');
  if (radical < 1 || radical === runs.length - 1) return '';
  const top = runs.slice(0, radical);
  const bottom = runs.slice(radical + 1);
  const root = runs[radical];
  if (top.some((run) => run.y <= root.y + 1.5) || bottom.some((run) => run.y >= root.y - 1.5)) return '';
  if (top[0].right < root.left || top[0].left >= root.right) return '';
  const scriptText = (parts) => {
    let base;
    return parts.map((part) => {
      const value = part.text.trim();
      const shift = base ? part.y - base.y : 0;
      if (!base || part.size >= base.size * .86 || Math.abs(shift) < .8) { base = part; return value; }
      const scripts = shift > 0 ? ['0123456789T', '⁰¹²³⁴⁵⁶⁷⁸⁹ᵀ'] : ['0123456789ijkmn', '₀₁₂₃₄₅₆₇₈₉ᵢⱼₖₘₙ'];
      if ([...value].every((char) => scripts[0].includes(char))) return [...value].map((char) => scripts[1][scripts[0].indexOf(char)]).join('');
      return (shift > 0 ? '^(' : '_(') + value + ')';
    }).join('');
  };
  return scriptText(top) + '/√(' + scriptText(bottom) + ')';
}

function mathBounds(parts) {
  return parts.reduce(([left, bottom, right, top], run) => [
    Math.min(left, run.left), Math.min(bottom, run.y - run.size * .25),
    Math.max(right, run.right), Math.max(top, run.y + run.size * .82),
  ], [Infinity, Infinity, -Infinity, -Infinity]);
}

function inlineFraction(runs, start) {
  const parts = [];
  for (let index = start; index < Math.min(start + 14, runs.length); index++) {
    const run = runs[index];
    const token = run.text.trim();
    if (/^[\p{L}\p{N}√()+−=-]{1,3}$/u.test(token)) { parts.push(run); continue; }
    if (!/\p{L}{3}/u.test(token) || parts.length < 3) return null;
    const text = formatFraction(parts);
    if (!text || parts.some((part) => part.size > run.size * .85 || Math.abs(part.y - run.y) > run.size * 1.03)) return null;
    const bounds = mathBounds(parts);
    if (run.left - bounds[2] < -1 || run.left - bounds[2] > run.size * 1.4 || run.left - bounds[0] > 6 * run.size) return null;
    return { text, left: bounds[0], right: bounds[2], y: run.y, size: run.size, bounds, end: index };
  }
  return null;
}

export function readingLines(items) {
  const runs = items.flatMap(({ str, transform, width, height, fontName }) => {
    if (!str?.trim() || !transform) return [];
    const [, , , scale, left, y] = transform;
    const size = Math.abs(height || scale);
    if (!size || !Number.isFinite(left) || !Number.isFinite(y)) return [];
    const text = str.normalize('NFC').replace(/[\ufb00-\ufb06]/g, (ligature) => ligature.normalize('NFKC'));
    return [{ text, left, right: left + (width || 0), y, size, fontName }];
  });
  const rows = [];
  let row;
  for (let index = 0; index < runs.length; index++) {
    const fraction = inlineFraction(runs, index);
    const run = fraction || runs[index];
    const { left, right, y, size } = run;
    if (fraction) index = fraction.end - 1;
    const shift = row ? Math.abs(y - row.y) : Infinity;
    const gap = row ? left - row.right : Infinity;
    const sameBaseline = row && shift <= Math.min(2, row.size * .22) && gap >= -row.size * .45;
    // PDF.js can insert line endings inside raised fractions or footnote markers.
    // Keep the main baseline fixed while attaching the smaller glyph runs.
    const inline = row && !sameBaseline && size <= row.size * .82 && shift <= row.size * .82
      && gap >= -row.size * 2.4 && left >= row.left;
    const joins = (sameBaseline || inline) && gap < Math.min(row.size * 1.7, 16);
    if (!joins) {
      row = { text: '', left, right: left, y, size, inlineMath: [], inlineMathBounds: [], fragments: [] };
      rows.push(row);
    }
    row.fragments.push({ ...run, space: joins && gap > row.size * .11 && !/^[,.;:!?)]/.test(run.text.trimStart()),
      inline: Boolean(joins && inline) });
    row.right = Math.max(row.right, right);
    if (!joins || !inline) row.size = Math.max(row.size, size);
  }
  return rows.map(({ fragments, ...line }) => {
    let math = [];
    const appendInline = () => {
      if (!math.length) return;
      const raw = math.map((part) => (part.space ? ' ' : '') + part.text).join('');
      const fraction = formatFraction(math);
      const text = fraction || raw.trim();
      if (/[=+√∑∫∂π]/u.test(text)) line.inlineMath.push(text);
      if (fraction) line.inlineMathBounds.push(mathBounds(math));
      line.text += (math[0].space ? ' ' : '') + text;
      math = [];
    };
    for (const fragment of fragments) {
      if (fragment.inline) math.push(fragment);
      else {
        appendInline();
        if (fragment.bounds) {
          line.inlineMath.push(fragment.text);
          line.inlineMathBounds.push(fragment.bounds);
        }
        line.text += (fragment.space ? ' ' : '') + fragment.text;
      }
    }
    appendInline();
    line.text = line.text.replace(/\s+/g, ' ').trim();
    line.inlineMath = line.inlineMath.map((value) => value.replace(/\s+/g, ' ')).filter(Boolean);
    const firstFont = fragments[0].fontName;
    const switchAt = firstFont ? fragments.findIndex((fragment) => fragment.fontName && fragment.fontName !== firstFont) : -1;
    if (switchAt > 0) {
      const lead = fragments.slice(0, switchAt).map(({ text, space }) => (space ? ' ' : '') + text).join('').trim();
      const body = fragments[switchAt];
      line.runIn = /^[\p{Lu}\p{Script=Han}][\p{L}\p{N} –-]+$/u.test(lead) && lead.length <= 100
        && lead.split(/\s+/).length >= 2 && /^[\p{Lu}\p{Script=Han}]/u.test(body.text.trimStart())
        && body.left - fragments[switchAt - 1].right >= .7 * line.size;
    }
    return line;
  });
}

export function headingFromLine(line, bodySize = 0) {
  const text = line.text.trim();
  if (!text || text.length > 105 || /[?!;。]$/.test(text) || /^\[\d+\]/.test(text)) return null;
  const numbered = numberedTitle.exec(text);
  const prefix = numbered?.[1] || numbered?.[3];
  const title = (numbered?.[2] || numbered?.[4] || text).replace(/[:：]$/, '');
  if (sectionWords.test(title)) return { title: text, depth: prefix?.split('.').length || 1 };
  if (numbered && /^\p{Lu}/u.test(title) && !/[.,]$/.test(title) && title.split(/\s+/).length <= 12
      && (prefix.includes('.') || line.size >= bodySize * 1.09)) {
    return { title: text, depth: prefix.split('.').length };
  }
  return null;
}

export function paragraphBlocks(lines, view = []) {
  const ordered = lines.filter((line) => line.text.trim() && Number.isFinite(line.y));
  const sizes = ordered.map((line) => line.size).filter((value) => value > 0).sort((a, b) => a - b);
  const bodySize = sizes[Math.floor(sizes.length / 2)] || 10;
  const [leftEdge = 0, bottom = 0, rightEdge = 0, top = 0] = view;
  const edge = (top - bottom) * .065;
  const result = [];
  let paragraph = null;
  let previous = null;
  const save = () => {
    if (!paragraph) return;
    const chunks = splitParagraph(paragraph.text);
    for (const text of chunks) result.push({ ...paragraph, text, index: result.length });
    paragraph = null;
  };
  for (const line of ordered) {
    const text = line.text.trim();
    if (/^\d{1,5}$/.test(text) && (line.y < bottom + edge || line.y > top - edge)) continue;
    const heading = headingFromLine(line, bodySize);
    const lineSize = line.size || bodySize;
    const left = Number.isFinite(line.left) ? line.left : leftEdge;
    const right = Number.isFinite(line.right) && line.right > left ? line.right : left + text.length * lineSize * .46;
    const box = [left, line.y - lineSize * .27, right, line.y + lineSize * .82];
    const isCaption = Boolean(captionOfLine(line, previous));
    const verticalGap = previous ? previous.y - line.y : 0;
    const indent = paragraph && Number.isFinite(line.left) && line.left - paragraph.x > lineSize * .8;
    const columnJump = paragraph && Number.isFinite(line.left) && Math.abs(line.left - paragraph.x) > Math.max(50, (rightEdge - leftEdge) * .17);
    const previousEnds = sentenceEnd.test(previous?.text || '');
    const listItem = bulletStart.test(text);
    if (paragraph && (heading || isCaption || listItem || verticalGap < -lineSize * .3 || verticalGap > lineSize * 1.75
      || columnJump || ((indent || line.runIn) && previousEnds) || Math.abs((previous.size || bodySize) - lineSize) > bodySize * .3)) save();
    if (!paragraph) paragraph = { text, x: left, right, y: box[3], bottom: box[1], heading, listItem, inlineMath: [...(line.inlineMath || [])], boxes: [box] };
    else {
      const hyphenated = /\p{L}-$/u.test(paragraph.text) && /^\p{Ll}/u.test(text);
      if (hyphenated && !compoundTail.test(text)) paragraph.text = paragraph.text.slice(0, -1);
      paragraph.text += (hyphenated ? '' : ' ') + text;
      paragraph.x = Math.min(paragraph.x, left);
      paragraph.right = Math.max(paragraph.right, right);
      paragraph.y = Math.max(paragraph.y, box[3]);
      paragraph.bottom = Math.min(paragraph.bottom, box[1]);
      paragraph.boxes.push(box);
      if (line.inlineMath?.length) paragraph.inlineMath.push(...line.inlineMath);
    }
    if (heading) save();
    previous = line;
  }
  save();
  return result;
}

function splitParagraph(text) {
  const parts = [];
  let left = text;
  while (left.length > maxBlockChars) {
    const space = left.lastIndexOf(' ', maxBlockChars);
    const split = space >= maxBlockChars / 2 ? space : maxBlockChars;
    parts.push(left.slice(0, split).trim());
    left = left.slice(split).trim();
  }
  if (left) parts.push(left);
  return parts;
}

function destinationPoint(value) {
  const mode = value?.[1]?.name;
  if (mode === 'XYZ') return { x: value[2], y: value[3] };
  if (['FitH', 'FitBH'].includes(mode)) return { y: value[2] };
  if (mode === 'FitR') return { x: value[2], y: value[5] };
  return {};
}

export async function embeddedOutline(pdf, signal) {
  const raw = await pdf.getOutline();
  signal?.throwIfAborted();
  let count = 0;
  const visit = async (entries, prefix = '', depth = 0) => {
    if (depth >= 32 || !Array.isArray(entries)) return [];
    const result = [];
    for (const [index, entry] of entries.entries()) {
      signal?.throwIfAborted();
      if (++count > 5000) break;
      const id = prefix + String(index);
      const children = await visit(entry.items, id + '.', depth + 1);
      let target = children.find((item) => item.page);
      if (entry.dest) {
        try {
          const dest = typeof entry.dest === 'string' ? await pdf.getDestination(entry.dest) : entry.dest;
          if (Array.isArray(dest) && dest[0] != null) {
            const page = (Number.isInteger(dest[0]) ? dest[0] : await pdf.getPageIndex(dest[0])) + 1;
            if (page > 0 && page <= pdf.numPages) target = { page, ...destinationPoint(dest) };
          }
        } catch { signal?.throwIfAborted(); }
      }
      const title = typeof entry.title === 'string' ? entry.title.trim().slice(0, 320) : '';
      if (target && title) result.push({ page: target.page, x: target.x, y: target.y, id: 'bookmark-' + id, title, children });
      else result.push(...children);
    }
    return result;
  };
  return visit(raw);
}

export function headingOutline(headings) {
  const nodes = [];
  const stack = [];
  for (const block of headings) {
    const depth = block.heading.depth;
    while (stack.length && stack.at(-1).depth >= depth) stack.pop();
    const node = { page: block.page, x: block.x, y: block.y, title: block.heading.title,
      id: 'heading-' + block.page + '-' + block.index, children: [] };
    (stack.at(-1)?.node.children || nodes).push(node);
    stack.push({ node, depth });
  }
  return nodes;
}

export function flattenOutline(nodes, depth = 1) {
  return nodes.flatMap((node) => [{ ...node, depth }, ...flattenOutline(node.children, depth + 1)]);
}

export function outlineAt(entries, anchor) {
  let match;
  for (const row of entries) {
    if (row.page > anchor.page || (row.page === anchor.page && Number.isFinite(anchor.y)
      && Number.isFinite(row.y) && row.y < anchor.y - 9)) continue;
    if (!match || row.page > match.page || (row.page === match.page && (row.y ?? Infinity) <= (match.y ?? Infinity))) match = row;
  }
  return match || entries[0] || null;
}

export function chapterRange(entries, anchor, lastPage) {
  const section = outlineAt(entries, anchor);
  if (!section) return null;
  const after = entries.slice(entries.findIndex(({ id }) => id === section.id) + 1);
  const end = after.find((entry) => entry.depth <= section.depth && (entry.page > section.page
    || (entry.page === section.page && Number.isFinite(entry.y) && (!Number.isFinite(section.y) || entry.y < section.y))));
  const endPage = end ? end.page - (Number.isFinite(end.y) ? 0 : 1) : lastPage;
  return { start: section, end, firstPage: section.page, lastPage: Math.min(lastPage, Math.max(section.page, endPage)) };
}

export function blockForAnchor(blocks, anchor) {
  if (!blocks.length) return null;
  if (Number.isInteger(anchor?.index)) {
    const direct = blocks.find(({ index }) => index === anchor.index);
    if (direct) return direct;
  }
  if (!Number.isFinite(anchor?.y)) return blocks[0];
  let best = blocks[0];
  let bestDistance = Infinity;
  for (const block of blocks) {
    const vertical = Math.max(0, anchor.y - block.y, block.bottom - anchor.y);
    const horizontal = Number.isFinite(anchor.x) ? Math.abs(anchor.x - block.x) * .24 : 0;
    const distance = vertical + horizontal;
    if (distance < bestDistance) {
      best = block;
      bestDistance = distance;
    }
  }
  return best;
}

export function sourceScrollOffset(current, pageStart, pageEnd, viewportSize, focusStart, focusEnd, inset = 0) {
  let next = current;
  if (!Number.isFinite(focusStart)) next = pageStart;
  else if (focusStart < current + inset || focusEnd - focusStart > viewportSize - 2 * inset) next = focusStart - inset;
  else if (focusEnd > current + viewportSize - inset) next = focusEnd - viewportSize + inset;
  return Math.max(pageStart, Math.min(next, pageEnd - viewportSize));
}
