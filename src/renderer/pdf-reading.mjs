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
const runInAbbrev = /^(?:fig(?:s|ure)?|tab(?:le)?|eq(?:s|uation)?|sec(?:tion)?|ch(?:apter)?|app(?:endix)?|alg(?:orithm)?|ref(?:s)?|no|vol|pp|vs|al|dr|prof|mr|ms|mrs|st|e\.g|i\.e|etc)$/i;
const trailingFunctionWord = /\b(?:and|or|but|nor|of|in|on|at|to|for|with|by|from|as|the|a|an|each|every|is|are|was|were|be|been|whose|which|that|this|these|those)$/i;

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
    const [a, b, , scale, left, y] = transform;
    const size = Math.abs(height || scale);
    if (!size || !Number.isFinite(left) || !Number.isFinite(y)) return [];
    const text = str.normalize('NFC').replace(/[\ufb00-\ufb06]/g, (ligature) => ligature.normalize('NFKC'));
    if (Math.abs(b) > Math.abs(a) && /^\s*arxiv:\d/i.test(text)) return [];
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
    const tail = row?.fragments.at(-1);
    const inMathTail = Boolean(tail && (tail.inline || /[=+−√∑∏∫∂∈∉⊂⊃⊆⊇∪∩∀∃≤≥≈≠±÷∞^_ˆ¯˜([{]\s*$/u.test(tail.text || '') || /^[\p{L}\p{N}∑∏√∫∂=+−×·,^_()[\]{}|¯ˆ˜∈∉⊂⊃⊆⊇∪∩∀∃≤≥≈≠±÷∞.-]{1,4}$/u.test(tail.text.trim())));
    const raisedLead = Boolean(row && row.fragments.length === 1 && row.size <= size * 1.05
      && /^(?:[*†‡§♠♣♥♦]|\d{1,2})$/u.test(row.fragments[0].text.trim())
      && y <= row.y + size * .2 && row.y - y <= size * .65 && gap >= -size * .3 && gap <= size * 1.4);
    const sameBaseline = raisedLead || (row && shift <= Math.min(inMathTail ? 3.2 : 2, row.size * (inMathTail ? .28 : .22)) && gap >= -row.size * (inMathTail ? .8 : .45));
    // PDF.js can insert line endings inside raised fractions or footnote markers.
    // Keep the main baseline fixed while attaching the smaller glyph runs.
    const lowered = row && size <= row.size * .82 && gap >= -row.size * 2.4 && left >= row.left;
    const raisedAccent = row && /^[ˆ¯˜˙¨⃗´`]+$/u.test(run.text.trim())
      && y >= row.y - row.size * .1 && y - row.y <= row.size * .95 && gap >= -row.size * .6 && gap < row.size * 2.2;
    const tallDelimiter = row && /^[()[\]{}|⟨⟩]+$/u.test(run.text.trim())
      && shift <= row.size * .9 && gap >= -row.size * .5 && gap < row.size * 1.8;
    const followsMath = row && size <= row.size * 1.15 && gap >= -row.size && gap <= row.size * 1.1
      && /^[\p{L}\p{N}∑∏√−+._]{1,6}$/u.test(run.text.trim())
      && (inMathTail
        || (/^[PXY∑∏√][\p{L}\p{N}−]*$/u.test(run.text.trim())
          && (runs.slice(index + 1, index + 4).some((next) => Math.abs(next.y - row.y) <= 1.5
            && next.left >= right - 1 && next.left <= right + 1.15 * row.size && /\p{L}{3}/u.test(next.text))
            || /^√/.test(run.text.trim()))));
    const tallMathFrag = row && inMathTail && left >= row.left && gap >= -row.size * 10 && gap < row.size * 2.2
      && shift <= row.size * 1.45
      && (size <= row.size * .92 || /^[\p{L}\p{N}∑∏√∫∂=+−×·,^_()[\]{}|¯ˆ˜∈∉⊂⊃⊆⊇∪∩∀∃≤≥≈≠±÷∞.-]{1,14}$/u.test(run.text.trim()));
    const inline = row && !sameBaseline && ((shift <= row.size * .88 && (lowered || followsMath)) || tallMathFrag || raisedAccent || tallDelimiter);
    const joins = (sameBaseline && gap < (inMathTail ? Math.max(row.size * 2.4, 24) : Math.min(row.size * 1.7, 16)))
      || (inline && gap < (tallMathFrag ? row.size * 2.2 : Math.min(row.size * 1.7, 16)));
    if (!joins) {
      row = { text: '', left, right: left, y, size, inlineMath: [], inlineMathBounds: [], fragments: [] };
      rows.push(row);
    }
    row.fragments.push({ ...run, space: joins && gap > row.size * .11 && !/^[,.;:!?)]/.test(run.text.trimStart()),
      inline: Boolean(joins && inline) });
    row.right = Math.max(row.right, right);
    if (raisedLead) {
      row.y = y;
      row.size = size;
    } else if (!joins || !inline) row.size = Math.max(row.size, size);
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
    if (fragments.length > 1) {
      const sizeWeights = new Map();
      for (const fragment of fragments) {
        const chars = fragment.text.replace(/\s+/g, '').length;
        if (!chars || !fragment.size) continue;
        const key = Math.round(fragment.size * 10) / 10;
        sizeWeights.set(key, (sizeWeights.get(key) || 0) + chars);
      }
      let bestSize = line.size;
      let bestWeight = 0;
      for (const [sz, weight] of sizeWeights) {
        if (weight > bestWeight) {
          bestWeight = weight;
          bestSize = sz;
        }
      }
      if (bestWeight > 0) line.size = bestSize;
    }
    const firstFont = fragments[0].fontName;
    const switchAt = firstFont ? fragments.findIndex((fragment) => fragment.fontName && fragment.fontName !== firstFont) : -1;
    line.fontName = firstFont || '';
    line.uniformFont = Boolean(firstFont) && switchAt < 0;
    if (switchAt > 0) {
      const rawLead = fragments.slice(0, switchAt).map(({ text, space }) => (space ? ' ' : '') + text).join('').trim();
      const body = fragments[switchAt];
      const rawBody = body.text.trimStart();
      const punctAtEnd = /[:：.。]$/.test(rawLead);
      const colonAtStart = /^[:：]\s*/.test(rawBody);
      const hasPunct = punctAtEnd || colonAtStart;
      const lead = rawLead.replace(/[:：.。]$/, '').trim();
      const bodyAfterColon = colonAtStart ? rawBody.replace(/^[:：]\s*/, '') : rawBody;
      const gap = body.left - fragments[switchAt - 1].right;
      const wordCount = lead ? lead.split(/\s+/).length : 0;
      const minWords = hasPunct ? 1 : 2;
      line.runIn = /^[\p{Lu}\p{Script=Han}][\p{L}\p{N} ,&()–-]+$/u.test(lead) && lead.length <= 100
        && wordCount >= minWords && !(wordCount === 1 && runInAbbrev.test(lead))
        && /^[\p{Lu}\p{Script=Han}]/u.test(bodyAfterColon)
        && (hasPunct || gap >= .7 * line.size);
    }
    if (!line.runIn && /^(?:Theorem|Lemma|Proposition|Corollary|Definition|Assumption|Remark|Proof|Example|Claim|Property)(?:\s+(?:\d+(?:\.\d+)*|[A-Z]\.\d+))?(?:\s*\([^)]{1,80}\))?[.:：](?:\s|$)/u.test(line.text)) {
      line.runIn = true;
    }
    return line;
  });
}

export function headingFromLine(line, bodySize = 0, bodyFont = '') {
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
  if (bodySize > 0 && !/[.,?!;。！？–—-]$/.test(text) && !captionPattern.test(text) && !/[=<>≈≠≤≥∑∫*†‡§{}%]/.test(text)
      && !/@|https?:\/\/|www\.|[;；]|\bet al\.|\b(?:19|20)\d{2}\b/i.test(text)
      && !/[.!?。！？]\s+\S/.test(text) && !/\([^)]*\/[^)]*\)/.test(text) && !trailingFunctionWord.test(text)) {
    const plain = title.trim();
    const words = plain.split(/\s+/).filter(Boolean);
    const commaCount = (plain.match(/[,，]/g) || []).length;
    const significantWords = words.filter((w) => w.length >= 4 && /^[A-Za-z]/.test(w));
    const upperSignificant = significantWords.filter((w) => /^[A-Z]/.test(w)).length;
    const titleCased = significantWords.length === 0 || upperSignificant * 2 >= significantWords.length;
    const looksTitle = Boolean(plain) && plain.length >= 4 && plain.length <= 85 && words.length >= 1 && words.length <= 12
      && commaCount <= 1 && /^[\p{Lu}\p{Script=Han}]/u.test(plain) && titleCased;
    if (looksTitle) {
      const larger = line.size >= bodySize * 1.12;
      const distinctFont = Boolean(bodyFont) && line.uniformFont && line.fontName && line.fontName !== bodyFont
        && plain.length <= 75 && words.length <= 10 && line.size >= bodySize * .96;
      if (larger || distinctFont) {
        return { title: text, depth: line.size >= bodySize * 1.15 ? 1 : 2 };
      }
    }
  }
  return null;
}

export function appendReadingLine(text, line) {
  const hyphenated = /\p{L}-$/u.test(text) && /^\p{Ll}/u.test(line);
  if (!hyphenated) return text + ' ' + line;
  return (compoundTail.test(line) ? text : text.slice(0, -1)) + line;
}

export function bodyStyleOfLines(lines) {
  const ordered = lines.filter((line) => line.text.trim() && Number.isFinite(line.y));
  const proseSizes = ordered.filter((line) => line.text.trim().length >= 25).map((line) => line.size).filter((value) => value > 0).sort((a, b) => a - b);
  const allSizes = ordered.map((line) => line.size).filter((value) => value > 0).sort((a, b) => a - b);
  const sizes = proseSizes.length >= 3 ? proseSizes : allSizes;
  const bodySize = sizes[Math.floor(sizes.length / 2)] || 10;
  const fontCounts = new Map();
  for (const line of ordered) {
    if (line.uniformFont && line.fontName && Math.abs((line.size || bodySize) - bodySize) <= bodySize * .15 && line.text.length >= 18) {
      fontCounts.set(line.fontName, (fontCounts.get(line.fontName) || 0) + 1);
    }
  }
  let bodyFont = '';
  let maxFontCount = 0;
  for (const [font, count] of fontCounts) {
    if (count > maxFontCount) { maxFontCount = count; bodyFont = font; }
  }
  return { bodySize, bodyFont };
}

export function paragraphBlocks(lines, view = [], bodyStyle = null) {
  const ordered = lines.filter((line) => line.text.trim() && Number.isFinite(line.y));
  const { bodySize, bodyFont } = bodyStyle && bodyStyle.bodySize > 0 ? bodyStyle : bodyStyleOfLines(ordered);
  const [leftEdge = 0, bottom = 0, rightEdge = 0, top = 0] = view;
  const edge = (top - bottom) * .065;
  const standardGaps = ordered.slice(1).map((line, index) => {
    const previous = ordered[index];
    const gap = previous.y - line.y;
    return Math.abs(line.left - previous.left) <= bodySize * .55 && Math.abs(line.size - previous.size) <= bodySize * .18
      && line.text.length >= 20 && previous.text.length >= 20 && gap >= bodySize * .7 && gap <= bodySize * 1.48 ? gap : 0;
  }).filter(Boolean).sort((a, b) => a - b);
  const leading = standardGaps.length >= 3 ? standardGaps[Math.floor(standardGaps.length / 2)] : 0;
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
    const heading = headingFromLine(line, bodySize, bodyFont);
    const lineSize = line.size || bodySize;
    const left = Number.isFinite(line.left) ? line.left : leftEdge;
    const right = Number.isFinite(line.right) && line.right > left ? line.right : left + text.length * lineSize * .46;
    const box = [left, line.y - lineSize * .27, right, line.y + lineSize * .82];
    const isCaption = Boolean(captionOfLine(line, previous));
    const verticalGap = previous ? previous.y - line.y : 0;
    const prevRight = Number.isFinite(previous?.right)
      ? previous.right
      : (previous ? (Number.isFinite(previous.left) ? previous.left : leftEdge) + previous.text.length * (previous.size || bodySize) * .46 : left);
    const previousEnds = sentenceEnd.test(previous?.text || '');
    const sameBaselineContinuation = Boolean(paragraph && previous)
      && (left > prevRight - lineSize * 1.5 && left - prevRight <= bodySize * 1.8 && !previousEnds
        ? Math.abs(verticalGap) <= bodySize * .95
        : Math.abs(verticalGap) <= bodySize * .35 && left > prevRight - lineSize * 1.5 && left - paragraph.x < Math.max(220, (rightEdge - leftEdge) * .42));
    const indent = paragraph && !sameBaselineContinuation && Number.isFinite(line.left) && line.left - paragraph.x > lineSize * .8;
    const outdent = paragraph && previous && Number.isFinite(line.left) && Number.isFinite(previous.left)
      && previous.left - paragraph.x > lineSize * .5 && previous.left - line.left > lineSize * .6;
    const columnJump = paragraph && !sameBaselineContinuation && Number.isFinite(line.left) && Math.abs(line.left - paragraph.x) > Math.max(50, (rightEdge - leftEdge) * .17);
    const dashContinuation = Boolean(paragraph && !paragraph.listItem && !previousEnds && !indent) && /^[–—]\s+\S/u.test(text);
    const listItem = !dashContinuation && bulletStart.test(text);
    const extraLeading = leading && previousEnds && verticalGap >= Math.max(lineSize * 1.3, leading * 1.42);
    const nearBottom = top > bottom && line.y <= bottom + (top - bottom) * .28;
    const hasProseWords = /(?:[A-Za-z]{4,}.*){2,}/.test(text);
    const hasFootnoteText = /[A-Za-z]{4,}|[\u4e00-\u9fff]{2,}|https?:\/\/|www\./i.test(text);
    const footnoteMarker = /^(?:[*†‡§♠♣♥♦]\s*\S|\d{1,2}\s+(?:Please|http|https|Corresponding|These|This|See|For|Note|The|In|We|Copyright)\b|\d{1,2}https?:\/\/)/u.test(text)
      || (nearBottom && /^(?:[*†‡§♠♣♥♦]\s*\S|\d{1,2}\s*(?:[A-Z][a-z]{2,}|https?:\/\/|www\.))/u.test(text));
    const isFootnote = (footnoteMarker && hasFootnoteText && lineSize <= bodySize * (nearBottom ? .98 : .93))
      || (nearBottom && lineSize <= bodySize * .9 && (hasProseWords || /https?:\/\/|www\.|Copyright/i.test(text))
        && bodySize - lineSize > bodySize * .12
        && !/[=+−]$/.test(previous?.text?.trim() || ''));
    const prevWasFootnote = Boolean(previous?._isFootnote);
    line._isFootnote = isFootnote;
    const isMathFragment = Boolean(paragraph) && !heading && !isCaption && !listItem && !isFootnote
      && Math.abs(verticalGap) <= bodySize * 2.85
      && (Math.abs(left - paragraph.x) <= Math.max(120, (rightEdge - leftEdge) * .35)
        || (left >= paragraph.x && left <= Math.max(paragraph.right, prevRight) + bodySize * 2))
      && !hasProseWords
      && (lineSize <= bodySize * .85
        || (lineSize >= bodySize * 1.25 && /[∑∏√∫∂|]/u.test(text))
        || (text.length <= 45 && /[∑∏√∫∂=+−×^_()[\]{}|~∼\p{Script=Greek}]/u.test(text) && !/[.!?。！？]$/.test(text)));
    const prevWasMath = Boolean(previous?._isMathFragment);
    line._isMathFragment = isMathFragment;
    const hasInlineMath = Boolean(line.inlineMath?.length) || /[∑∏√∫∂=+−×|~∼≈∝∈∉⊂⊃\p{Script=Greek}]|\/\s*[\p{L}\p{N}(]/u.test(text);
    const maxLineGap = !previousEnds && (hasInlineMath || /[=+−~∼]$/.test(previous?.text?.trim() || ''))
      ? lineSize * 3.1 : lineSize * 1.75;
    const continuesFromMath = (prevWasMath || sameBaselineContinuation) && !heading && !isCaption && !listItem && !isFootnote && !line.runIn
      && Math.abs(verticalGap) <= bodySize * 3.1 && !previousEnds;
    if (paragraph && (isFootnote || prevWasFootnote !== isFootnote || (!isMathFragment && !continuesFromMath && (heading || isCaption || listItem || extraLeading || verticalGap < -lineSize * .3 || verticalGap > maxLineGap
      || columnJump || ((indent || outdent || line.runIn) && previousEnds) || Math.abs((previous.size || bodySize) - lineSize) > bodySize * .3)))) save();
    if (!paragraph) paragraph = { text, x: left, right, y: box[3], bottom: box[1], heading, listItem, inlineMath: [...(line.inlineMath || [])], boxes: [box] };
    else {
      paragraph.text = appendReadingLine(paragraph.text, text);
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
  const firstSectionIdx = headings.findIndex((block) => block.page === 1
    && /^(?:(?:1[.)]?\s+)?(?:abstract|introduction|摘要|引言|绪论))$/i.test(block.heading.title.replace(/[:：]$/, '').trim()));
  const filtered = firstSectionIdx > 0 ? headings.slice(firstSectionIdx) : headings;
  const nodes = [];
  const stack = [];
  for (const block of filtered) {
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

export function termContextWindow(text, start, length, limit = 3200) {
  if (text.length <= limit) return text.trim();
  const spare = Math.max(0, limit - length);
  let left = Math.max(0, Math.min(start - Math.floor(spare / 2), text.length - limit));
  let right = left + limit;
  // Trim partial words when there is a nearby boundary, while retaining the selection.
  if (left > 0 && /\S/u.test(text[left - 1])) {
    const boundary = text.slice(left, Math.min(left + 32, start)).search(/\s/u);
    if (boundary >= 0) left += boundary + 1;
  }
  if (right < text.length && /\S/u.test(text[right])) {
    const tail = text.slice(Math.max(start + length, right - 32), right);
    const boundary = tail.search(/\s\S*$/u);
    if (boundary >= 0) right -= tail.length - boundary;
  }
  return text.slice(left, right).trim();
}

export function paragraphTermContext(blocks, index, term) {
  const chosen = blocks[index];
  if (!chosen) return '';
  const preceding = blocks.slice(Math.max(0, index - 2), index).map((block) => block.text).join('\n\n');
  const following = blocks.slice(index + 1, index + 3).map((block) => block.text).join('\n\n');
  const occurrence = chosen.text.toLowerCase().indexOf(term.toLowerCase());
  const start = occurrence >= 0 ? occurrence : Math.floor(chosen.text.length / 2);
  const focused = '选中段落：\n' + termContextWindow(chosen.text, start, term.length, 2200);
  const beforeLabel = preceding ? '\n\n上文：\n' : '';
  const afterLabel = following ? '\n\n下文：\n' : '';
  const spare = 3200 - focused.length - beforeLabel.length - afterLabel.length;
  const beforeLimit = Math.min(preceding.length, Math.max(Math.floor(spare / 2), spare - following.length));
  const afterLimit = spare - beforeLimit;
  return focused + beforeLabel + termContextWindow(preceding, preceding.length, 0, beforeLimit)
    + afterLabel + termContextWindow(following, 0, 0, afterLimit);
}

export function sourceScrollOffset(current, pageStart, pageEnd, viewportSize, focusStart, focusEnd, inset = 0) {
  let next = current;
  if (!Number.isFinite(focusStart)) next = pageStart;
  else if (focusStart < current + inset || focusEnd - focusStart > viewportSize - 2 * inset) next = focusStart - inset;
  else if (focusEnd > current + viewportSize - inset) next = focusEnd - viewportSize + inset;
  return Math.max(pageStart, Math.min(next, pageEnd - viewportSize));
}
