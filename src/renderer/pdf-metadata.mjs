import { appendReadingLine, readingLines } from './pdf-reading.mjs';

const clean = (value) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
const usableTitle = (value) => value && !/^(?:(?:untitled|unknown|document)(?:\s*\d+)?|microsoft word(?:\s*[-–].*)?)$/i.test(value);
const abstractStart = /^(?:abstract|摘要)(?:\s*[:：.—–-]\s*|\s*$)/i;
const abstractEnd = /^(?:keywords?|index terms|introduction|figure|table|关键词|引言)\b|^(?:关键词|引言|图|表)\s*[:：\d]|^\d+(?:\.\d+)*[.)]?\s+\p{Lu}/iu;
const doiPattern = /\b10\.\d{4,9}\/[^\s<>"{}]+/i;
const arxivPattern = /\b(?:arxiv(?:\s*[:=. ]\s*|\.org\/(?:abs|pdf)\/))(\d{4}\.\d{4,5}(?:v\d+)?)(?!\d)/i;
const yearPattern = /\b(?:19|20)\d{2}\b/;

function extractAbstract(lines, start) {
  if (start < 0) return '';
  const label = lines[start];
  const text = label.text.replace(abstractStart, '');
  const body = text ? [text] : [];
  let previous = label;
  for (const line of lines.slice(start + 1)) {
    if (abstractEnd.test(line.text) || line.y >= previous.y
      || (body.length && (previous.y - line.y > line.size * 2.15
        || Math.abs(line.left - previous.left) > 3 * line.size
        || Math.abs(line.size - previous.size) > .32 * previous.size))) break;
    body.push(line.text);
    previous = line;
  }
  return clean(body.reduce((text, line) => text ? appendReadingLine(text, line) : line, '')).slice(0, 10000);
}

export async function extractPaperMetadata(pdf) {
  const [attributes, firstPage] = await Promise.all([
    pdf.getMetadata().catch(() => null),
    pdf.getPage(1).then(async (page) => ({ view: page.view, items: (await page.getTextContent()).items })).catch(() => null),
  ]);
  const info = attributes?.info ?? {};
  const xmp = (key) => clean(attributes?.metadata?.get(key));
  const pdfField = (key) => clean(info.Custom?.get?.(key));
  const lines = firstPage ? readingLines(firstPage.items) : [];
  const start = lines.findIndex((line) => abstractStart.test(line.text));
  const front = lines.slice(0, start >= 0 ? start : 12);
  const prominent = front.filter((line) => {
    const value = clean(line.text);
    return usableTitle(value) && value.length >= 6 && /\p{L}{3}/u.test(value)
      && !/^(?:arxiv:|https?:|doi:|technical report of\b)/i.test(value);
  }).sort((a, b) => b.size - a.size || b.y - a.y);
  const major = prominent[0];
  const titleParts = [];
  if (major && (major.size >= 13 || major === front[0])) {
    titleParts.push(major.text);
    let previous = major;
    for (const line of front.slice(front.indexOf(major) + 1)) {
      if (line.size < major.size * .92 || Math.abs(line.left - major.left) > 5 * major.size
        || line.y >= previous.y || previous.y - line.y > major.size * 1.6) break;
      titleParts.push(line.text);
      previous = line;
    }
  }
  const frontText = front.map(({ text }) => clean(text)).join('\n');
  const doiSource = [xmp('prism:doi'), pdfField('DOI'), frontText.match(/(?:\bdoi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)\S+/i)?.[0] || ''].join(' ');
  const arxivSource = [pdfField('arXivID'), pdfField('arxiv'), xmp('dc:identifier'), doiSource,
    ...(firstPage?.items || []).map(({ str }) => str).filter((value) => /^\s*arxiv:/i.test(value || ''))].join(' ');
  const arxiv = arxivSource.match(arxivPattern)?.[1] || '';
  const year = [xmp('prism:publicationdate'), xmp('dc:date'), pdfField('PublicationDate')]
    .map((value) => value.match(yearPattern)?.[0]).find(Boolean) || (arxiv ? '20' + arxiv.slice(0, 2) : '');
  const abstract = xmp('dc:description') || extractAbstract(lines, start);
  const authors = clean(info.Author) || xmp('dc:creator');
  const venue = xmp('prism:publicationname') || pdfField('Journal') || pdfField('Conference') || (arxiv ? 'arXiv' : '');
  return {
    title: [xmp('dc:title'), clean(info.Title), clean(titleParts.join(' '))].find(usableTitle) || '',
    authors: /^(?:unknown|anonymous|user)$/i.test(authors) ? '' : authors,
    year, venue,
    doi: (doiSource.match(doiPattern)?.[0] || '').replace(/[.,;)\]}]+$/, ''),
    arxiv, abstract,
  };
}
