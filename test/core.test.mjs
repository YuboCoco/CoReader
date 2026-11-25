import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { openLibrary } from '../src/library.mjs';
import { complete, makeMessages, modelSelection } from '../src/model.mjs';

test('the library deduplicates a PDF and persists page position, notes and term requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'english-lit-reader-unit-'));
  let library;
  try {
    library = openLibrary(directory);
    const file = join(directory, '测试.pdf');
    const copy = join(directory, '另一份.pdf');
    await writeFile(file, '%PDF-1.7 sample');
    await writeFile(copy, '%PDF-1.7 sample');
    const { id } = await library.importFile(file);
    assert.equal((await library.importFile(copy)).id, id);
    assert.equal(library.recent().length, 1);
    library.position(id, 3, 1.5, 12);
    library.position(id, 2, 1.5);
    library.addMark(id, { page: 3, kind: 'note', note: '我的批注', quote: 'paper', rects: [{ x: 0, y: 0, w: 0.3, h: 0.1 }] });
    library.beginTerm(id, 'Paper', 'first', 'paper context');
    assert.equal(library.records(id).terms[0].status, 'pending');
    library.beginTerm(id, 'paper', 'second', 'new context');
    assert.equal(library.finishTerm(id, 'paper', 'first', '旧结果')[0].status, 'pending');
    assert.equal(library.finishTerm(id, 'paper', 'second', '术语解释')[0].body, '术语解释');
    library.beginTerm(id, 'second term', 'interrupted', '');
    library.close();
    library = openLibrary(directory);
    assert.deepEqual(library.recent().map((item) => [item.page, item.zoom]), [[2, 1.5]]);
    assert.deepEqual(library.paperLibrary().papers.map((item) => [item.furthestPage, item.pageCount]), [[3, 12]]);
    assert.equal(library.records(id).marks[0].note, '我的批注');
    assert.equal(library.records(id).terms.find((item) => item.key === 'paper').context, 'new context');
    assert.equal(library.records(id).terms.find((item) => item.key === 'second term').status, 'error');
  } finally {
    library?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('paper categories preserve documents and hide retired tag rules', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elr-paper-library-'));
  let library;
  try {
    const former = join(directory, 'Previously read.pdf');
    const incoming = join(directory, 'Forecasting.pdf');
    await writeFile(former, '%PDF-1.7 existing');
    await writeFile(incoming, '%PDF-1.7 new');
    library = openLibrary(directory);
    const existing = await library.importFile(former);
    library.position(existing.id, 4, 1.25);
    const parent = library.savePaperCategory({ name: '机器学习' });
    const child = library.savePaperCategory({ name: '时间序列', parent });
    const retired = 'legacy-smart';
    const db = new DatabaseSync(join(directory, 'library.sqlite'));
    try { db.prepare('INSERT INTO paper_categories VALUES (?, ?, ?, ?)').run(retired, '重点论文', null, '["重点"]'); }
    finally { db.close(); }
    assert.throws(() => library.savePaperCategory({ name: '标签规则', tags: ['重点'] }), /智能分类已停用/);
    assert.ok(!library.paperLibrary().categories.some(({ id }) => id === retired));
    assert.throws(() => library.savePaperCategory({ id: parent, name: '机器学习', parent: child }), /下级/);
    const paper = await library.importFile(incoming, child);
    assert.deepEqual(library.recent().map(({ id }) => id), [existing.id]);
    assert.equal(library.paperLibrary().papers.find(({ id }) => id === paper.id).category, child);
    library.updatePaperDetails(paper.id, { title: 'Time-series forecasting', tags: ['实验'], status: 'read' });
    await assert.rejects(library.importFile(incoming, retired), /分类已不存在/);
    assert.deepEqual(library.paperLibrary().papers.find(({ id }) => id === paper.id).tags, ['实验']);
    assert.throws(() => library.classifyPapers([paper.id], retired), /分类已不存在/);
    assert.throws(() => library.classifyPapers([paper.id, 'missing'], parent));
    library.close();
    library = openLibrary(directory);
    const saved = library.paperLibrary().papers.find(({ id }) => id === paper.id);
    assert.equal(saved.category, child);
    assert.equal(saved.status, 'read');
    assert.deepEqual(saved.tags, ['实验']);
    assert.throws(() => library.removePapersFromCategory([paper.id], retired), /分类已不存在/);
    assert.equal(library.paperLibrary().papers.find(({ id }) => id === paper.id).category, child);
    assert.throws(() => library.removePapersFromCategory([paper.id, 'missing'], child));
    assert.equal(library.paperLibrary().papers.find(({ id }) => id === paper.id).category, child);
    library.removePapersFromCategory([paper.id], child);
    assert.equal(library.paperLibrary().papers.find(({ id }) => id === paper.id).category, null);
    library.classifyPapers([paper.id], child);
    library.removePaperCategory(parent);
    assert.equal(library.paperLibrary().papers.find(({ id }) => id === paper.id).category, null);
    assert.equal(library.find(existing.id).page, 4);
    assert.equal(library.paperLibrary().categories.length, 0);
    library.reopen(paper.id);
    assert.ok(library.recent().some(({ id }) => id === paper.id));
  } finally {
    library?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('abstract translations persist immediately and follow the exact source abstract', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elr-abstract-translation-'));
  let library;
  try {
    const file = join(directory, 'Abstract.pdf');
    await writeFile(file, '%PDF-1.7 abstract');
    library = openLibrary(directory);
    const { id } = await library.importFile(file);
    library.indexPaper(id, 1, { abstract: 'Original abstract' });
    const record = library.savePaperAbstractTranslation(id, 'Original abstract', '中文摘要');
    assert.deepEqual(record, { source: 'Original abstract', text: '中文摘要' });
    library.close();
    library = openLibrary(directory);
    const current = () => library.paperLibrary().papers.find((paper) => paper.id === id);
    assert.equal(current().abstract, 'Original abstract');
    assert.deepEqual(current().abstractTranslation, record);
    library.updatePaperDetails(id, { title: 'Edited title' });
    assert.deepEqual(current().abstractTranslation, record);
    library.updatePaperDetails(id, { abstract: 'Edited abstract' });
    assert.equal(current().abstractTranslation, undefined);
    assert.throws(() => library.savePaperAbstractTranslation(id, 'Original abstract', '过期译文'), /已变更/);
    library.updatePaperDetails(id, { abstract: 'New abstract', abstractTranslation: '新译文' });
    assert.deepEqual(current().abstractTranslation, { source: 'New abstract', text: '新译文' });
  } finally {
    library?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('an older paper library recovers reading positions and retains reusable tags', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elr-catalog-migration-'));
  let library;
  try {
    const file = join(directory, '旧论文.pdf');
    await writeFile(file, '%PDF-1.7 legacy');
    library = openLibrary(directory);
    const { id } = await library.importFile(file);
    library.position(id, 8, 1);
    library.updatePaperDetails(id, { tags: ['预测'] });
    library.close();
    library = null;
    const db = new DatabaseSync(join(directory, 'library.sqlite'));
    try {
      db.prepare('INSERT INTO paper_categories VALUES (?, ?, ?, ?)').run('old-auto', '自动收录', null, '["基线"]');
      db.exec('DROP TABLE paper_tags; ALTER TABLE documents DROP COLUMN page_count; ALTER TABLE documents DROP COLUMN furthest_page;');
    } finally { db.close(); }
    library = openLibrary(directory);
    const { papers, categories, tags } = library.paperLibrary();
    assert.deepEqual(categories, []);
    assert.equal(papers[0].furthestPage, 8);
    assert.equal(papers[0].pageCount, null);
    assert.deepEqual(new Set(tags), new Set(['预测', '基线']));
    library.savePaperPageCount(id, 20);
    assert.equal(library.paperLibrary().papers[0].pageCount, 20);
    assert.equal(library.createPaperTag(' Ｎｅｗ '), 'new');
    library.updatePaperDetails(id, { tags: [] });
    assert.deepEqual(new Set(library.paperLibrary().tags), new Set(['预测', '基线', 'new']));
  } finally {
    library?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('the provider adapter validates the endpoint and streams only visible response text', async () => {
  let request;
  const server = createServer(async (incoming, response) => {
    let text = '';
    for await (const chunk of incoming) text += chunk;
    request = { address: incoming.url, key: incoming.headers.authorization, payload: JSON.parse(text) };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: {"choices":[{"delta":{"reasoning_content":"internal"}}]}\r\n\r\n');
    response.write('data: {"choices":[{"delta":{"content":"译"}}]}\n\n');
    response.end('data: {"choices":[{"delta":{"content":"文"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    assert.throws(() => modelSelection({ provider: 'compatible', endpoint: 'http://example.com', model: 'mock' }));
    const config = modelSelection({
      provider: 'compatible', endpoint: 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions/',
      model: 'mock', effort: 'medium',
    });
    const text = [];
    const result = await complete(config, 'fixture-key', makeMessages('translation', 'Test'), { onText: (chunk) => text.push(chunk) });
    assert.deepEqual(text, ['译', '译文']);
    assert.equal(result, '译文');
    assert.equal(request.address, '/v1/chat/completions');
    assert.equal(request.key, 'Bearer fixture-key');
    assert.equal(request.payload.reasoning_effort, 'medium');
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('seedSamplePaper preloads the bundled Attention Is All You Need PDF idempotently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elr-sample-paper-'));
  let library;
  try {
    const samplePdf = join(process.cwd(), 'assets', 'samples', 'Attention Is All You Need.pdf');
    library = openLibrary(directory);
    const seeded = await library.seedSamplePaper(samplePdf, {
      title: 'Attention Is All You Need',
      authors: 'Ashish Vaswani et al.',
      year: '2017',
      venue: 'NeurIPS',
      arxiv: '1706.03762',
      tags: ['示例论文', 'transformer'],
      status: 'unread',
    });
    assert.ok(seeded?.id);
    assert.equal(library.recent().length, 0);
    const papers = library.paperLibrary().papers;
    assert.equal(papers.length, 1);
    assert.equal(papers[0].title, 'Attention Is All You Need');
    assert.equal(papers[0].year, '2017');
    assert.deepEqual(papers[0].tags, ['示例论文', 'transformer']);
    // User edits should survive a repeated seed attempt without duplicating the document.
    library.updatePaperDetails(seeded.id, { title: 'Custom Title', tags: ['已修改'], status: 'reading' });
    const repeated = await library.seedSamplePaper(samplePdf, { title: 'Attention Is All You Need' });
    assert.equal(repeated.id, seeded.id);
    assert.equal(library.paperLibrary().papers.length, 1);
    assert.equal(library.paperLibrary().papers[0].title, 'Custom Title');
  } finally {
    library?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
