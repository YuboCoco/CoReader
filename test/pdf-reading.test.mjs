import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockForAnchor, bodyStyleOfLines, chapterRange, embeddedOutline, flattenOutline, headingOutline,
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

test('bold colon run-in titles and hanging-indent contribution lists split into separate paragraphs', () => {
  const item = (str, x, y, width, fontName = 'regular', height = 9.5) => ({
    str, width, height, fontName, transform: [height, 0, 0, height, x, y],
  });
  const items = [
    item('The core contributions of this study are as follows:', 324, 680, 210),
    item('Bridging the Efficiency-Accuracy Gap:', 312, 668, 152, 'bold'),
    item('We address the', 467, 668, 68, 'regular'),
    item('critical challenge in time series forecasting.', 324, 657, 195),
    item('Introducing XLinear, a Novel MLP-Based Model:', 312, 646, 194, 'bold'),
    item('Its', 509, 646, 14, 'regular'),
    item('core innovation lies in a novel gating module.', 324, 635, 196),
    item('Demonstrating Superior Performance:', 312, 624, 150, 'bold'),
    item('Through exten-', 465, 624, 62, 'regular'),
    item('sive tests on 12 diverse datasets.', 324, 613, 155),
  ];
  const lines = readingLines(items, [0, 0, 612, 792]);
  const blocks = paragraphBlocks(lines, [0, 0, 612, 792]);
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].text, 'The core contributions of this study are as follows:');
  assert.match(blocks[1].text, /^Bridging the Efficiency-Accuracy Gap: We address/);
  assert.match(blocks[2].text, /^Introducing XLinear, a Novel MLP-Based Model: Its core/);
  assert.match(blocks[3].text, /^Demonstrating Superior Performance: Through extensive/);
});

test('unnumbered bold section/subsection headings and period run-in titles split into separate blocks', () => {
  const item = (str, x, y, width, fontName = 'regular', height = 10) => ({
    str, width, height, fontName, transform: [height, 0, 0, height, x, y],
  });
  const items = [
    item('Experimental Results and Comparisons', 85, 720, 190, 'bold', 12),
    item('Experimental Settings', 68, 704, 110, 'bold', 11),
    item('Datasets.', 68, 690, 42, 'bold', 10),
    item('We used 7 widely adopted datasets along with five more.', 114, 690, 185, 'regular', 10),
    item('Their metadata are presented in Table 1.', 68, 678, 175, 'regular', 10),
    item('Baselines.', 68, 665, 44, 'bold', 10),
    item('We compare against SOTA models spanning architectures.', 116, 665, 182, 'regular', 10),
    item('Finally, we compare with four leading GNN-based models.', 68, 653, 188, 'regular', 10),
    item('Implementation Details.', 68, 640, 102, 'bold', 10),
    item('We reproduced the baselines based on official repos.', 174, 640, 130, 'regular', 10),
  ];
  const lines = readingLines(items, [0, 0, 612, 792]);
  const blocks = paragraphBlocks(lines, [0, 0, 612, 792]);
  assert.equal(blocks.length, 5);
  assert.equal(blocks[0].text, 'Experimental Results and Comparisons');
  assert.equal(blocks[0].heading?.depth, 1);
  assert.equal(blocks[1].text, 'Experimental Settings');
  assert.equal(blocks[1].heading?.depth, 2);
  assert.match(blocks[2].text, /^Datasets\. We used 7 widely/);
  assert.match(blocks[3].text, /^Baselines\. We compare against/);
  assert.match(blocks[4].text, /^Implementation Details\. We reproduced/);
});

test('tall inline fractions inside a paragraph stay merged with surrounding prose', () => {
  const item = (str, x, y, width, fontName = 'regular', height = 10) => ({
    str, width, height, fontName, transform: [height, 0, 0, height, x, y],
  });
  const items = [
    item('Absolute Percentage Error (MAPE) which are widely em-', 68, 700, 220),
    item('ployed in environmental sciences, enabling a more holis-', 68, 688, 220),
    item('tic assessment of forecast model performance (Gupta et al.', 68, 676, 220),
    item('2009). They are defined as: NSE = 1 −', 68, 660, 140),
    item('∑S i=1 (yi − ŷi)2', 212, 667, 56, 'math', 6.8),
    item('∑S i=1 (yi − ȳ)2', 212, 653, 52, 'math', 6.8),
    item('where', 272, 660, 24),
    item('yi denotes the observed value, and n is the number', 68, 643, 215),
    item('of samples.', 68, 631, 48),
  ];
  const lines = readingLines(items, [0, 0, 612, 792]);
  const blocks = paragraphBlocks(lines, [0, 0, 612, 792]);
  assert.equal(blocks.length, 1);
  assert.match(blocks[0].text, /NSE = 1/);
  assert.match(blocks[0].text, /where yi denotes the observed value/);
});

test('fallback outline skips page-1 front matter, emails, URLs, and hyphenated prose lines', () => {
  const item = (str, x, y, width, fontName = 'regular', height = 10) => ({
    str, width, height, fontName, transform: [height, 0, 0, height, x, y],
  });
  const items = [
    item('XLinear: A Lightweight and Accurate MLP-Based Model', 90, 740, 380, 'bold', 14),
    item('Xinyang Chen1*, Huidong Jin2*, Yu Huang1,3,4†', 120, 718, 280, 'bold', 10.5),
    item('2 Statistical Machine Learning, Data61, CSIRO, Canberra Australia', 100, 704, 300, 'regular', 9),
    item('Warren.Jin@csiro.au, {Yhuang}@mail.hzau.edu.cn', 130, 692, 260, 'mono', 8.5),
    item('Abstract', 150, 668, 44, 'bold', 11),
    item('Time series forecasting has shown strong value across do-', 68, 654, 215, 'regular', 10),
    item('mains such as energy and weather (Wu et al. 2021).', 68, 642, 210, 'regular', 10),
    item('Code — https://github.com/Zaiwen/XLinear.git', 68, 628, 200, 'mono', 9.5),
    item('Introduction', 142, 608, 62, 'bold', 11),
    item('Jin 2015, 2016; Kokic, Jin, and Crimp 2013; Jin and Hen-', 68, 594, 215, 'regular', 10),
    item('Transformer (Vaswani et al. 2017) emerging as the pre-', 68, 582, 215, 'regular', 10),
    item('Method', 155, 560, 38, 'bold', 11),
    item('Forward Process', 68, 544, 78, 'bold', 10.5),
    item('Given the historical observation sequence of variables.', 68, 530, 210, 'regular', 10),
  ];
  const blocks = paragraphBlocks(readingLines(items, [0, 0, 612, 792]), [0, 0, 612, 792]);
  const headings = blocks.filter((b) => b.heading).map((b) => ({ ...b, page: 1 }));
  const outline = headingOutline(headings);
  assert.deepEqual(outline.map((n) => n.title), ['Abstract', 'Introduction', 'Method']);
  assert.deepEqual(outline[2].children.map((n) => n.title), ['Forward Process']);
});

test('document-wide body style keeps Main Results and Model Analysis at the same level and drops chart labels', () => {
  const item = (str, x, y, width, fontName = 'regular', height = 10) => ({
    str, width, height, fontName, transform: [height, 0, 0, height, x, y],
  });
  const p4 = readingLines([
    item('Experimental Results and Comparisons', 85, 720, 190, 'bold', 12),
    item('Experimental Settings', 68, 704, 110, 'bold', 11),
    item('Datasets. We used 7 widely adopted datasets across domains.', 68, 690, 210, 'regular', 10),
    item('Baselines. We compare against SOTA models spanning architectures.', 68, 676, 210, 'regular', 10),
  ]);
  const p5 = readingLines([
    item('Pn', 90, 720, 14, 'regular', 7.5),
    item('Main Results', 68, 690, 68, 'bold', 11),
    item('Univariate Forecast with Exogenous Inputs. In each', 68, 676, 210, 'regular', 10),
  ]);
  const p7 = readingLines([
    item('Training Time (ms/iter)', 120, 720, 90, 'regular', 8),
    item('MSE', 220, 720, 20, 'regular', 8),
    item('GroundTruth Prediction', 140, 704, 110, 'regular', 8),
    item('Except DLinear and RLinear, whose MSEs are 31.5% and', 68, 680, 210, 'regular', 10),
  ]);
  const p8 = readingLines([
    item('Model Analysis', 68, 700, 78, 'bold', 11),
    item('Comparison with Patch-based Models. To mitigate limitations.', 68, 686, 210, 'regular', 10),
    item('Ablation Study', 68, 640, 76, 'bold', 11),
    item('We evaluate each component carefully across benchmarks.', 68, 626, 210, 'regular', 10),
  ]);
  const pages = [p4, p5, p7, p8];
  const style = bodyStyleOfLines(pages.flat());
  const headings = pages.flatMap((lines, idx) =>
    paragraphBlocks(lines, [0, 0, 612, 792], style).filter((b) => b.heading).map((b) => ({ ...b, page: idx + 4 }))
  );
  const outline = headingOutline(headings);
  assert.deepEqual(outline.map((n) => n.title), ['Experimental Results and Comparisons']);
  assert.deepEqual(
    outline[0].children.map((n) => n.title),
    ['Experimental Settings', 'Main Results', 'Model Analysis', 'Ablation Study'],
  );
});

test('page-bottom footnotes separate from prose and hatted inline symbols do not split lines', () => {
  const item = (str, x, y, width, fontName = 'regular', height = 10) => ({
    str, width, height, fontName, transform: [height, 0, 0, height, x, y],
  });
  const items = [
    item('Implementation Details. We reproduced the baselines.', 68, 260, 210, 'regular', 10),
    item('1', 68, 120, 4, 'regular', 6.5),
    item('Please contact Warren Jin for data sets (Huang et al. 2025).', 73, 118, 190, 'regular', 8),
    item('2', 68, 108, 4, 'regular', 6.5),
    item('https://github.com/thuml/Time-Series-Library', 73, 106, 160, 'regular', 8),
    item('yi denotes the observed value,', 312, 660, 120, 'regular', 10),
    item('ˆ', 436, 662, 4, 'math', 10),
    item('y', 435, 660, 6, 'math', 10),
    item('i', 441, 658, 3, 'math', 7),
    item('represents the predicted', 448, 660, 96, 'regular', 10),
    item('value, and n is the number of samples.', 312, 648, 160, 'regular', 10),
  ];
  const lines = readingLines(items, [0, 0, 612, 792]);
  const blocks = paragraphBlocks(lines, [0, 0, 612, 792]);
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].text, 'Implementation Details. We reproduced the baselines.');
  assert.match(blocks[1].text, /^1\s*Please contact Warren Jin/);
  assert.match(blocks[2].text, /^2\s*https:\/\/github\.com\/thuml/);
  assert.match(blocks[3].text, /^yi denotes the observed value,.*represents the predicted value/);
});

test('tall inline fractions on a new line after equals and trailing radical expressions stay in paragraph', () => {
  const item = (str, x, y, width, fontName = 'regular', height = 10) => ({
    str, width, height, fontName, transform: [height, 0, 0, height, x, y],
  });
  const mapeItems = [
    item('means of the predicted and the observed values; MAPE =', 68, 660, 220),
    item('1', 68, 644, 5, 'math', 7),
    item('n', 68, 634, 5, 'math', 7),
    item('∑n i=1', 78, 639, 24, 'math', 9),
    item('× 100%. Higher NSE and KGE values in-', 130, 639, 158),
    item('dicate better performance.', 68, 626, 110),
  ];
  const mapeBlocks = paragraphBlocks(readingLines(mapeItems, [0, 0, 612, 792]), [0, 0, 612, 792]);
  assert.equal(mapeBlocks.length, 1);
  assert.match(mapeBlocks[0].text, /MAPE =.*100%\. Higher NSE/);

  const sqrtItems = [
    item('linear transformation, similar to [30]. In the embedding layers, we multiply those weights by', 68, 560, 390),
    item('√', 462, 562, 8, 'math', 10.5),
    item('d', 470, 560, 6, 'math', 10),
    item('model', 476, 558, 22, 'math', 7),
    item('.', 499, 560, 3, 'regular', 10),
  ];
  const sqrtBlocks = paragraphBlocks(readingLines(sqrtItems, [0, 0, 612, 792]), [0, 0, 612, 792]);
  assert.equal(sqrtBlocks.length, 1);
  assert.match(sqrtBlocks[0].text, /weights by\s+√dmodel\.$/);
  assert.equal(sqrtBlocks[0].boxes.length, 1);
});

test('large inline summation with small fraction limits stays in single paragraph', () => {
  const item = (str, x, y, width, fontName = 'regular', height = 10) => ({
    str, width, height, fontName, transform: [height, 0, 0, height, x, y],
  });
  const items = [
    item('means of the predicted and the observed values; MAPE =', 68, 660, 230),
    item('1', 68, 646, 5, 'math', 6.8),
    item('n', 68, 636, 5, 'math', 6.8),
    item('∑', 78, 637, 10, 'math', 14),
    item('n', 90, 648, 5, 'math', 6.8),
    item('i=1', 90, 634, 11, 'math', 6.8),
    item('|', 103, 638, 3, 'math', 10),
    item('yi − ˆyi', 107, 645, 22, 'math', 6.8),
    item('yi', 114, 635, 8, 'math', 6.8),
    item('|', 130, 638, 3, 'math', 10),
    item('× 100%. Higher NSE and KGE values in-', 136, 639, 170),
    item('dicate better performance, while lower values are preferred.', 68, 626, 220),
  ];
  const blocks = paragraphBlocks(readingLines(items, [0, 0, 612, 792]), [0, 0, 612, 792]);
  assert.equal(blocks.length, 1);
  assert.match(blocks[0].text, /MAPE =.*100%\. Higher NSE and KGE values indicate better performance/);

  // Same formula placed near the bottom of the page (y <= 28% of page height) must not be misclassified as a footnote.
  const bottomItems = items.map((entry) => ({
    ...entry,
    transform: [entry.transform[0], 0, 0, entry.transform[3], entry.transform[4], entry.transform[5] - 500],
  }));
  const bottomBlocks = paragraphBlocks(readingLines(bottomItems, [0, 0, 612, 792]), [0, 0, 612, 792]);
  assert.equal(bottomBlocks.length, 1);
  assert.match(bottomBlocks[0].text, /MAPE =.*100%\. Higher NSE and KGE values indicate better performance/);
});

test('inline hatted formula across full width stays in single paragraph and bottom symbol footnotes separate', () => {
  const item = (str, x, y, width, fontName = 'regular', height = 10) => ({
    str, width, height, fontName, transform: [height, 0, 0, height, x, y],
  });
  const items = [
    item('Problem Statement.', 68, 660, 88, 'bold', 10),
    item('We address the problem of predicting future values in a time series: given', 162, 660, 350),
    item('objective is to forecast the next H time steps, i.e.,', 68, 646, 220),
    item('ˆ', 298, 649, 4, 'math', 10),
    item('X', 295, 646, 8, 'math', 10),
    item('T+1:T+H', 303, 644, 34, 'math', 7),
    item('= f', 340, 646, 16, 'math', 10),
    item('θ', 356, 644, 5, 'math', 7),
    item('(X1:T ) ∈', 362, 646, 40, 'math', 10),
    item('RH', 405, 646, 14, 'math', 10),
    item('. Here, fθ', 420, 646, 42, 'regular', 10),
    item('represents a time series model, where T is the context length.', 68, 632, 260),
    item('against computational budget.', 68, 130, 140),
    item('*', 68, 114, 5, 'math', 7.5),
    item('Equal contribution', 78, 112, 70, 'regular', 8),
    item('♠', 152, 114, 6, 'math', 7.5),
    item('Project lead', 162, 112, 46, 'regular', 8),
    item('†', 212, 114, 5, 'math', 7.5),
    item('Corresponding author', 220, 112, 85, 'regular', 8),
  ];
  const blocks = paragraphBlocks(readingLines(items, [0, 0, 612, 792]), [0, 0, 612, 792]);
  assert.match(blocks[0].text, /^Problem Statement\..*ˆXT\+1:T\+H = fθ\(X1:T \) ∈ RH\. Here, fθ represents a time series model, where T is the context length\.$/);
  assert.equal(blocks[1].text, 'against computational budget.');
  assert.ok(blocks.slice(2).every((block) => /Equal contribution|Project lead|Corresponding author/.test(block.text)));
});

test('inline en-dash or em-dash wrapped to line start stays in prose paragraph', () => {
  const line = (text, y, left = 68, size = 10) => ({ text, y, left, size });
  const blocks = paragraphBlocks([
    line('Iterated approaches utilize one-step-ahead prediction models.', 660, 82),
    line('that the values of all variables excluding the target are known at forecast time', 646, 68),
    line('– such that only the target needs to be recursively fed into future inputs.', 632, 68),
    line('future-known) time-varying inputs.', 618, 68),
    line('We summarize our contributions as follows:', 590, 68),
    line('– First contribution item.', 576, 68),
    line('– Second contribution item.', 562, 68),
  ], [0, 0, 612, 792]);
  assert.equal(blocks.length, 4);
  assert.match(blocks[0].text, /known at forecast time – such that only the target/);
  assert.equal(blocks[1].text, 'We summarize our contributions as follows:');
  assert.equal(blocks[2].text, '– First contribution item.');
  assert.equal(blocks[3].text, '– Second contribution item.');
});

test('near-body-size bottom footnote with asterisk separates and stacked subfigures merge into one figure', () => {
  const item = (str, x, y, width, fontName = 'regular', height = 10) => ({
    str, width, height, fontName, transform: [height, 0, 0, height, x, y],
  });
  const fnItems = [
    item('term repetitive patterns. Time series often exhibit repetitive patterns at different timescales [Lai', 68, 145, 420),
    item('*', 76, 118, 4, 'math', 7.5),
    item('Corresponding author', 81, 116, 86, 'regular', 9.2),
  ];
  const fnBlocks = paragraphBlocks(readingLines(fnItems, [0, 0, 612, 792]), [0, 0, 612, 792], { bodySize: 10, bodyFont: 'regular' });
  assert.equal(fnBlocks.length, 2);
  assert.match(fnBlocks[0].text, /timescales \[Lai$/);
  assert.match(fnBlocks[1].text, /^\*\s*Corresponding author$/);

  const subfigures = [
    { label: 'chart', score: 0.9, order: 1, bounds: [60, 520, 540, 660] },
    { label: 'chart', score: 0.9, order: 2, bounds: [60, 355, 540, 495] },
    { label: 'chart', score: 0.9, order: 3, bounds: [60, 190, 540, 330] },
  ];
  const composed = composeMedia(subfigures, [], [], [0, 0, 612, 792]);
  assert.equal(composed.filter((item) => item.kind === 'figure').length, 1);
  assert.deepEqual(composed[0].bounds, [57, 187, 543, 663]);

  const separateWithCaption = composeMedia(
    [
      { label: 'chart', score: 0.9, order: 1, bounds: [60, 520, 540, 660] },
      { label: 'figure_title', score: 0.85, order: 2, bounds: [60, 498, 540, 514] },
      { label: 'chart', score: 0.9, order: 3, bounds: [60, 340, 540, 480] },
    ],
    [item('Figure 1: First plot.', 60, 502, 120)],
    [],
    [0, 0, 612, 792],
  );
  assert.equal(separateWithCaption.filter((item) => item.kind === 'figure').length, 2);
});

test('extendDiagram ignores equations/tables above figures, split tables merge, and tall delimiters stay in paragraph', () => {
  const item = (str, x, y, width, fontName = 'regular', height = 10) => ({
    str, width, height, fontName, transform: [height, 0, 0, height, x, y],
  });
  // Diagram below display_formula (2) must not absorb the equation into the figure.
  const diagramWithFormula = composeMedia(
    [
      { label: 'display_formula', score: 0.9, order: 1, bounds: [180, 560, 420, 590] },
      { label: 'formula_number', score: 0.9, order: 2, bounds: [470, 565, 490, 582] },
      { label: 'image', score: 0.9, order: 3, bounds: [140, 380, 520, 520] },
    ],
    [
      item('Y = LinearDecode(HL) · Qo', 220, 570, 140),
      item('(2)', 472, 570, 14),
      item('Time Domain', 220, 530, 60),
    ],
    [],
    [0, 0, 612, 792],
  );
  const fig = diagramWithFormula.find((a) => a.kind === 'figure');
  assert.ok(fig.bounds[3] < 555);
  assert.equal(diagramWithFormula.filter((a) => a.kind === 'formula').length, 1);

  // Split table header + body merge into a single table.
  const splitTable = composeMedia(
    [
      { label: 'table', score: 0.9, order: 1, bounds: [50, 560, 560, 610] },
      { label: 'table', score: 0.9, order: 2, bounds: [50, 420, 560, 552] },
    ],
    [],
    [],
    [0, 0, 612, 792],
  );
  assert.equal(splitTable.filter((a) => a.kind === 'table').length, 1);
  assert.deepEqual(splitTable[0].bounds, [47, 417, 563, 613]);

  // Tall delimiters and right-half inline fraction stay in one paragraph.
  const mathItems = [
    item('selected from', 68, 660, 56),
    item('{', 128, 656, 6, 'math', 13),
    item('10−4, 2 × 10−4, 5 × 10−4}', 135, 660, 110, 'math', 10),
    item('. The model dimension D is chosen from {128, 256, 512},', 246, 660, 230),
    item('while the embedding size d is set to 16.', 68, 646, 180),
    item('Pearson correlation matrix CorrMat of {s}, whose (p, q)-th entry is', 68, 590, 270),
    item('Cov(sp,sq)', 346, 596, 48, 'math', 7.5),
    item('√Var(sp)·Var(sq)', 342, 583, 58, 'math', 7.5),
    item(', p, q ∈', 404, 590, 32, 'math', 10),
    item('{0, · · · , T − 1}.', 68, 574, 80, 'math', 10),
  ];
  const mathBlocks = paragraphBlocks(readingLines(mathItems, [0, 0, 612, 792]), [0, 0, 612, 792]);
  assert.equal(mathBlocks.length, 2);
  assert.match(mathBlocks[0].text, /^selected from \{10−4.*embedding size d is set to 16\.$/);
  assert.match(mathBlocks[1].text, /^Pearson correlation matrix.*\{0, · · · , T − 1\}\.$/);
});

test('theorem lead-in starts a new paragraph, inline matrix stays merged, and model figure/table tops trim external equations and captions', () => {
  const item = (str, x, y, width, fontName = 'regular', height = 10) => ({
    str, width, height, fontName, transform: [height, 0, 0, height, x, y],
  });
  const thmItems = [
    item('following time step y ∈ R. We now present the following theorem.', 68, 680, 290),
    item('Theorem 1', 68, 662, 52, 'bold', 10),
    item('(Expected value of y).', 124, 662, 92, 'regular', 10),
    item('We assume that x ∼ N (µx, Σx), and the joint', 220, 662, 220, 'italic', 10),
    item('distribution [x, y] ∼ N ([µx, µy], [Σx Σxy]). Here, N (·, ·) denotes a Gaussian distribution', 68, 636, 390, 'italic', 10),
    item('with the specified mean vector and covariance matrix.', 68, 622, 240, 'italic', 10),
  ];
  const thmBlocks = paragraphBlocks(readingLines(thmItems, [0, 0, 612, 792]), [0, 0, 612, 792]);
  assert.equal(thmBlocks.length, 2);
  assert.match(thmBlocks[0].text, /We now present the following theorem\.$/);
  assert.match(thmBlocks[1].text, /^Theorem 1 \(Expected value of y\)\..*covariance matrix\.$/);

  // Oversized model figure box extending upward over equation (2) gets trimmed below the equation.
  const eqItems = [
    item('Hl+1 = ISL(CSL(Hl)), l = 0, · · · , L − 1,', 60, 560, 250),
    item('(2)', 470, 560, 14),
    item('Y = LinearDecode(HL) · Qo ∈ RN×d×τ .', 80, 540, 230),
    item('Time Domain', 190, 505, 60),
  ];
  const trimmedFig = composeMedia(
    [
      { label: 'image', score: 0.9, order: 2, bounds: [150, 360, 500, 575] },
      { label: 'display_formula', score: 0.85, order: 1, bounds: [55, 535, 320, 572] },
    ],
    eqItems,
    [],
    [0, 0, 612, 792],
  );
  const fig = trimmedFig.find((a) => a.kind === 'figure');
  assert.ok(fig.bounds[3] < 540);
  assert.equal(trimmedFig.filter((a) => a.kind === 'formula').length, 1);

  // Oversized model table box extending upward into multi-line Table 6 caption (with split link fragments) gets trimmed below caption.
  const tblItems = [
    item('Table 6: Ablations on the CSL and ISL design. NormLin replaces the linear layer in', 50, 654, 440),
    item('Eq.', 50, 640, 14),
    item('5', 66, 640, 6),
    item('with the NormLin layer, and Linear replaces the NormLin layer in Eq.', 75, 640, 320),
    item('standard linear layer. Results are averaged over four', 50, 626, 360),
    item('prediction lengths. Full results are shown in Table 20.', 50, 612, 320),
    item('Variate  Temp.  ECL  Traffic', 56, 588, 300),
    item('NormLin  Linear  0.159  0.451', 56, 572, 300),
  ];
  const trimmedTbl = composeMedia(
    [{ label: 'table', score: 0.9, order: 1, bounds: [45, 480, 520, 632] }],
    tblItems,
    [],
    [0, 0, 612, 792],
  );
  const tbl = trimmedTbl.find((a) => a.kind === 'table');
  assert.ok(tbl.bounds[3] < 612);
});
