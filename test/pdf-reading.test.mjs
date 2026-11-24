import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockForAnchor, chapterRange, embeddedOutline, flattenOutline, headingOutline,
  captionOfLine, equationNumber, outlineAt, paragraphBlocks, paragraphTermContext, readingLines,
  sourceScrollOffset, termContextWindow, visualCaptionLabel } from '../src/renderer/pdf-reading.mjs';
import { composeMedia, formulaTextInBounds, textOutsideMedia } from '../src/renderer/pdf-layout.mjs';
import { extractPaperMetadata } from '../src/renderer/pdf-metadata.mjs';
import { blockAtPoint, bookmarkWithNumber, insertMedia, isDisplayMath, lineInsideMedia, pdfMedia, protectMath, translationSource } from '../src/renderer/pdf-media.mjs';

test('term context follows the chosen occurrence and supplies neighboring paragraphs', () => {
  const blocks = [
    { text: 'Attention refers to the opening discussion of user behavior.' },
    { text: 'The introduction describes an independent task.' },
    { text: 'The method first projects the input into query and key vectors.' },
    { text: 'Attention here is a weighted sum of value vectors.' },
    { text: 'The weights come from scaled dot products of queries and keys.' },
  ];
  const context = paragraphTermContext(blocks, 3, 'attention');
  assert.match(context, /^选中段落：\nAttention here is a weighted sum/);
  assert.match(context, /query and key vectors/);
  assert.match(context, /weighted sum of value vectors/);
  assert.match(context, /scaled dot products/);
  assert.doesNotMatch(context, /user behavior/);
});

test('long term context remains bounded and retains the selected occurrence', () => {
  const text = 'earlier sentence. '.repeat(280) + 'selected occurrence' + ' later sentence.'.repeat(280);
  const context = termContextWindow(text, text.indexOf('selected occurrence'), 'selected occurrence'.length);
  assert.ok(context.length <= 3200);
  assert.match(context, /earlier sentence\. selected occurrence later sentence\./);
  assert.match(termContextWindow(text, 0, 'earlier'.length), /^earlier/);
});

test('single-column paragraphs retain inline summation runs and split on extra leading', () => {
  const run = (str, x, y, width, size = 10) => ({ str, width, height: size, transform: [size, 0, 0, size, x, y] });
  const placed = readingLines([
    run('These lines establish the normal body spacing', 72, 710, 390),
    run('for a single-column paper over several baselines,', 72, 699, 390),
    run('with enough text to measure the normal spacing.', 72, 688, 390),
    run('The repeated lines continue the earlier discussion.', 72, 677, 390),
    run('The next paragraph describes the update with h =', 72, 660.5, 257),
    run('∑', 333, 668, 10), run('i', 343, 657.5, 3, 7),
    run('v_i, where the weights depend on depth.', 348, 660.5, 192),
    run('The update uses a single learned vector per layer.', 72, 649.5, 390),
  ]);
  assert.equal(placed.length, 6);
  const blocks = paragraphBlocks(placed, [0, 0, 612, 792]);
  assert.equal(blocks.length, 2);
  assert.match(blocks[1].text, /^The next paragraph.*∑.*where the weights/);
  assert.equal(blocks[1].boxes.length, 2);
});

test('paper details combine PDF fields with the visible abstract', async () => {
  const run = (str, x, y, width, size = 10) => ({ str, width, height: size, transform: [size, 0, 0, size, x, y] });
  const pdf = {
    getMetadata: async () => ({
      info: { Title: 'Untitled', Author: 'Research Team', Custom: new Map([
        ['DOI', 'https://doi.org/10.48550/arXiv.2603.12345'], ['arXivID', 'https://arxiv.org/abs/2603.12345v1'],
      ]) },
    }),
    getPage: async () => ({ view: [0, 0, 612, 792], getTextContent: async () => ({ items: [
      run('Sample Research Title', 145, 710, 290, 22), run('Abstract', 270, 680, 75, 12),
      run('We evaluate an input-', 80, 660, 350), run('dependent approach.', 80, 649, 350),
      run('1 Introduction', 72, 612, 170, 15), run('An unrelated DOI belongs to another paper.', 72, 592, 300),
    ] }) }),
  };
  assert.deepEqual(await extractPaperMetadata(pdf), {
    title: 'Sample Research Title', authors: 'Research Team', year: '2026', venue: 'arXiv',
    doi: '10.48550/arXiv.2603.12345', arxiv: '2603.12345v1', abstract: 'We evaluate an input-dependent approach.',
  });
});

test('following a translation keeps the source viewport inside its page and reveals the paragraph', () => {
  assert.equal(sourceScrollOffset(1120, 1000, 2300, 600, 1300, 1450, 44), 1120);
  assert.equal(sourceScrollOffset(1100, 1000, 2300, 600, 1720, 1890, 44), 1334);
  assert.equal(sourceScrollOffset(1550, 1000, 2300, 600, 2170, 2295, 44), 1700);
  assert.equal(sourceScrollOffset(2150, 1000, 2300, 600, 2170, 2295, 44), 1700);
  assert.equal(sourceScrollOffset(1610, 2310, 3400, 600, 2350, 2460, 44), 2310);
  assert.equal(sourceScrollOffset(1000, 2310, 2620, 600, 2350, 2460, 44), 2310);
});

test('content analysis recognizes document captions and displayed equation numbers', () => {
  assert.deepEqual(visualCaptionLabel('Fig. A.2b: Ablation'), { kind: 'figure', number: 'A.2b' });
  assert.deepEqual(visualCaptionLabel('Table IV. Results'), { kind: 'table', number: 'IV' });
  assert.equal(visualCaptionLabel('Figure about a method'), null);
  assert.equal(equationNumber('Y = F(X) (4a)'), '4a');
  assert.equal(equationNumber('(A.3)'), 'A.3');
  assert.equal(equationNumber('F(x)'), null);
});

test('formula explanation uses glyphs within the formula and falls back when only its number is selectable', () => {
  const glyph = (str, x, width) => ({ str, transform: [1, 0, 0, 10, x, 60], width, height: 10 });
  const items = [glyph('outside', 15, 27), glyph('α = β', 60, 24), glyph('(4)', 103, 11)];
  assert.equal(formulaTextInBounds(items, [55, 55, 120, 75]), 'α = β (4)');
  assert.equal(formulaTextInBounds(items, [100, 55, 120, 75]), '');
});

test('PDF paragraphs retain heading hierarchy, wrap across lines, and locate the correct column', () => {
  const line = (text, y, left, size = 10) => ({ text, y, left, size });
  const blocks = paragraphBlocks([
    line('1. Introduction', 733, 40, 14),
    line('A multi-', 711, 40),
    line('scale result.', 700, 40),
    line('2. Results', 663, 40, 14),
    line('2.1 Evaluation', 644, 40, 13),
    line('This is the left column.', 624, 40),
    line('This is the right column.', 624, 310),
    line('1', 23, 280),
  ], [0, 0, 600, 800]);
  assert.equal(blocks[1].text, 'A multiscale result.');
  assert.equal(blocks.at(-1).text, 'This is the right column.');
  assert.equal(blockForAnchor(blocks, { x: 312, y: 626 }).text, 'This is the right column.');
  const headings = headingOutline(blocks.filter((block) => block.heading).map((block) => ({ ...block, page: 1 })));
  assert.deepEqual(headings.map(({ title }) => title), ['1. Introduction', '2. Results']);
  assert.equal(headings[1].children[0].title, '2.1 Evaluation');
  const entries = flattenOutline(headings);
  assert.equal(outlineAt(entries, { page: 1, y: 648 }).title, '2.1 Evaluation');
  assert.equal(chapterRange(entries, { page: 1, y: 718 }, 3).end.title, '2. Results');
});

test('PDF reading joins prose across inline formula fragments and separates hanging list items', () => {
  const run = (str, x, y, width, height = 10, hasEOL = false) =>
    ({ str, width, height, hasEOL, transform: [height, 0, 0, height, x, y] });
  const blocks = paragraphBlocks(readingLines([
    run('The proposed CASA module', 50, 200, 131),
    run('approximates', 40, 189, 65),
    run('QK', 110, 193, 11, 7, true),
    run('T', 122, 197, 4, 5, true),
    run('√d', 110, 185, 11, 7, true),
    run('rather than', 132, 189, 53, 10, true),
    run('computing it directly.', 40, 175, 94),
    run('Our key contributions are as follows:', 50, 164, 147),
    run('•', 52, 150, 3.5),
    run('An autoencoder-', 62, 150, 75),
    run('based module.', 62, 139, 65),
    run('• A scalable implementation', 52, 125, 130),
    run('for long input sequences.', 62, 114, 123),
    run('• A competitive result.', 52, 100, 108),
  ]), [0, 0, 300, 300]);
  assert.equal(blocks.length, 5);
  assert.equal(blocks[0].boxes.length, 3);
  assert.match(blocks[0].text, /approximates .+ rather than computing it directly\.$/);
  assert.equal(protectMath(blocks[0].text, blocks[0].inlineMath).filter((part) => part.math).length, 1);
  assert.deepEqual(blocks.filter(({ listItem }) => listItem).map(({ text }) => text), [
    '• An autoencoder-based module.', '• A scalable implementation for long input sequences.', '• A competitive result.',
  ]);
});

test('a line-leading fraction stays in its paragraph and only standalone equations become crops', () => {
  const run = (str, x, y, width, height = 10) => ({ str, width, height, transform: [height, 0, 0, height, x, y] });
  const items = [
    run('Instead of directly computing', 54, 209, 243),
    run('Q', 55, 199, 6, 7), run('i', 61, 198, 3, 5),
    run('K', 65, 199, 7, 7), run('T', 72, 202, 4, 5), run('i', 72, 197, 3, 5),
    run('√', 59, 195, 6, 7), run('d', 65, 190, 4, 7), run('k', 69, 189, 4, 5),
    run(', we designed a score network.', 79, 194, 218),
    run('The modified structure is as follows:', 54, 181, 180),
    run('x = y', 63, 151, 29), run('(8)', 270, 151, 16),
  ];
  const view = [0, 0, 612, 792];
  const lines = readingLines(items);
  const inline = lines.flatMap((line) => line.inlineMathBounds);
  const assets = composeMedia([
    { label: 'display_formula', bounds: [54, 187, 76, 207], score: .9 },
    { label: 'display_formula', bounds: [62, 145, 95, 160], score: .9 },
  ], items, [], view, inline);
  assert.equal(inline.length, 1);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].kind, 'formula');
  const body = paragraphBlocks(readingLines(textOutsideMedia(items, assets)), view);
  assert.equal(body.length, 1);
  const fraction = 'QᵢKᵀᵢ/√(dₖ)';
  assert.equal(body[0].text, 'Instead of directly computing ' + fraction + ', we designed a score network. The modified structure is as follows:');
  assert.deepEqual(protectMath(body[0].text, body[0].inlineMath).filter(({ math }) => math).map(({ text }) => text), [fraction]);
});

test('wrapped cross-references stay in prose and run-in titles start a new paragraph', () => {
  const run = (str, x, y, width, fontName = 'body') => ({ str, width, height: 10, fontName, transform: [10, 0, 0, 10, x, y] });
  const lines = readingLines([
    run('The results on seven benchmark datasets are presented in', 325, 222, 233),
    run('Table 3. With the exception of two specific cases, CASA improves metrics.', 315, 211, 243),
    run('It handles different architectures.', 315, 200, 192),
    run('Robustness of CASA under varying conditions', 315, 189, 204, 'bold'),
    run('To val-', 529, 189, 29),
    run('idate the robustness, we change the input length.', 315, 178, 220),
    run('Table 4. Forecasting accuracy', 315, 130, 146),
  ]);
  assert.equal(captionOfLine(lines[1], lines[0]), null);
  assert.deepEqual(captionOfLine(lines.at(-1), lines.at(-2)), { kind: 'table', label: 'Table 4' });
  const blocks = paragraphBlocks(lines, [0, 0, 612, 792]);
  assert.equal(blocks.length, 3);
  assert.match(blocks[0].text, /presented in Table 3\. With .+ different architectures\.$/);
  assert.equal(blocks[1].text, 'Robustness of CASA under varying conditions To validate the robustness, we change the input length.');
  assert.equal(blocks[2].text, 'Table 4. Forecasting accuracy');
});

test('PDF outline resolves named and explicit destinations, and skips external-only items', async () => {
  const ref = { num: 7, gen: 0 };
  const pdf = {
    numPages: 2,
    getOutline: async () => [{ title: 'Introduction', dest: 'intro', items: [
      { title: 'Method', dest: [ref, { name: 'FitH' }, 600], items: [] },
    ] }, { title: 'External', url: 'https://example.test/', items: [] }],
    getDestination: async (name) => name === 'intro' ? [0, { name: 'XYZ' }, 15, 720, null] : null,
    getPageIndex: async (value) => { assert.equal(value, ref); return 1; },
  };
  const outline = await embeddedOutline(pdf);
  assert.equal(outline.length, 1);
  assert.equal(outline[0].page, 1);
  assert.equal(outline[0].y, 720);
  assert.equal(outline[0].children[0].page, 2);
  assert.equal(outline[0].children[0].y, 600);
});

test('PDF comparison restores numbers printed in the headings without guessing missing numbers', () => {
  const bookmark = { title: 'Evaluation', y: 540 };
  assert.equal(bookmarkWithNumber(bookmark, [{ text: '2.1 Evaluation', y: 534 }]).title, '2.1 Evaluation');
  assert.equal(bookmarkWithNumber({ title: 'II. Methods' }, [{ text: '3 Methods', y: 534 }]).title, 'II. Methods');
  assert.equal(bookmarkWithNumber(bookmark, [{ text: '2.1 Other Text', y: 534 }]), bookmark);
});

test('embedded and inline math survives exactly, and only standalone math becomes an image', () => {
  const source = 'Using x = y and $\\alpha_i$ improves results.';
  const parts = protectMath(source);
  assert.deepEqual(parts.filter((part) => part.math).map((part) => part.text), ['x = y', '$\\alpha_i$']);
  assert.equal(parts.map(({ text }) => text).join(''), source);
  assert.notEqual(translationSource({ text: source, parts }), source);
  assert.equal(isDisplayMath('h = x + y (1)'), true);
  assert.equal(isDisplayMath('x + y'), true);
  assert.equal(isDisplayMath('The score x = y increases.'), false);
});

test('PDF vector figure, table cells, and a display formula remain in reading order', () => {
  const line = (text, left, y, right = left + text.length * 5) => ({ text, left, y, right, size: 11 });
  const lines = [
    line('Prose starts here.', 43, 600),
    line('Figure 1. Results', 90, 455),
    line('Table 1. Data', 90, 399),
    line('Existing 0.72', 91, 370, 241),
    line('New 0.95', 91, 350, 241),
    line('h = x + y (1)', 120, 308),
    line('Prose ends here.', 43, 261),
  ];
  const items = [350, 370].flatMap((y) => [90, 215].map((x) => ({
    str: 'cell', width: 25, height: 11, transform: [1, 0, 0, 1, x, y],
  })));
  const graphics = { pictures: [], drawings: [[89, 480, 259, 550], [100, 480, 117, 532]] };
  const media = pdfMedia(lines, items, graphics, [0, 0, 520, 640]);
  assert.deepEqual(media.map(({ kind }) => kind), ['figure', 'table', 'formula']);
  assert.equal(lineInsideMedia(lines[3], media), true);
  assert.equal(lineInsideMedia(lines[2], media), false);
  const blocks = insertMedia(paragraphBlocks(lines.filter((entry) => !lineInsideMedia(entry, media)), [0, 0, 520, 640]), media);
  assert.deepEqual(blocks.map(({ text, kind }) => kind || text), [
    'Prose starts here.', 'figure', 'Figure 1. Results', 'Table 1. Data', 'table', 'formula', 'Prose ends here.',
  ]);
  assert.equal(blockAtPoint(blocks, 180, 310)?.kind, 'formula');
  assert.equal(blockAtPoint(blocks, 10, 310), undefined);
});

test('model-defined diagram keeps its title and suppresses embedded formula crops', () => {
  const region = (label, bounds, order = 1) => ({ label, bounds, order, score: .9 });
  const glyph = (str, x, y, width = 15, height = 9) => ({ str, width, height, transform: [1, 0, 0, 1, x, y] });
  const items = [
    glyph('Diagram title', 235, 708, 107), glyph('with its explanatory subtitle', 210, 696, 178),
    glyph('x_t', 139, 585), glyph('Figure 1: Overview.', 72, 519, 100),
    glyph('(1a)', 204, 374), glyph('(2a)', 350, 374), glyph('(3a)', 540, 374),
    glyph('(1b)', 204, 358), glyph('(2b)', 350, 358), glyph('(3b)', 540, 358),
    glyph('Prose between the formula groups', 72, 327, 250), glyph('(4)', 548, 287),
  ];
  const boxes = [
    region('image', [72, 538, 562, 677]),
    region('figure_title', [71, 470, 562, 528]),
    region('display_formula', [98, 372, 216, 386]), region('display_formula', [255, 371, 327, 385]),
    region('display_formula', [396, 371, 523, 386]), region('display_formula', [105, 354, 151, 369]),
    region('display_formula', [252, 354, 293, 368]), region('display_formula', [398, 353, 447, 367]),
    region('text', [70, 303, 561, 342]), region('display_formula', [210, 280, 417, 293]),
  ];
  const fallback = [{ kind: 'formula', bounds: [138, 581, 156, 594] }];
  const assets = composeMedia(boxes, items, fallback, [0, 0, 612, 792]);
  assert.deepEqual(assets.map(({ kind }) => kind), ['figure', 'formula', 'formula']);
  assert.ok(assets[0].bounds[3] >= 715);
  assert.ok(assets[1].bounds[1] <= 354 && assets[1].bounds[2] > 550);
  assert.ok(assets[2].bounds[2] > 550);
  assert.deepEqual(textOutsideMedia(items, assets).map((item) => item.str), [
    'Figure 1: Overview.', 'Prose between the formula groups',
  ]);
});
