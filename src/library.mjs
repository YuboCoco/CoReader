import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const documentIdPattern = /^[a-f0-9]{64}$/;
export const defaultModel = { provider: 'deepseek', endpoint: 'https://api.deepseek.com', model: '', effort: 'default' };

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function rectangles(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).filter((rect) => rect
    && [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)
    && rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0
    && rect.x + rect.w <= 1.001 && rect.y + rect.h <= 1.001);
}

export function openLibrary(root) {
  const files = join(root, 'papers');
  mkdirSync(files, { recursive: true });
  const db = new DatabaseSync(join(root, 'library.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(
    'CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL, page INTEGER NOT NULL DEFAULT 1, zoom REAL NOT NULL DEFAULT 1.15, touched INTEGER NOT NULL);' +
    'CREATE TABLE IF NOT EXISTS marks (id TEXT PRIMARY KEY, paper TEXT NOT NULL REFERENCES documents(id), page INTEGER NOT NULL, kind TEXT NOT NULL, quote TEXT NOT NULL, note TEXT NOT NULL, rects TEXT NOT NULL, created INTEGER NOT NULL);' +
    'CREATE INDEX IF NOT EXISTS marks_paper ON marks(paper, page);' +
    'CREATE TABLE IF NOT EXISTS terms (paper TEXT NOT NULL REFERENCES documents(id), key TEXT NOT NULL, term TEXT NOT NULL, context TEXT NOT NULL, body TEXT NOT NULL DEFAULT \'\', status TEXT NOT NULL, error TEXT NOT NULL DEFAULT \'\', request TEXT NOT NULL, touched INTEGER NOT NULL, PRIMARY KEY(paper, key));' +
    'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);' +
    'CREATE TABLE IF NOT EXISTS research (paper TEXT NOT NULL REFERENCES documents(id), kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, touched INTEGER NOT NULL, PRIMARY KEY(paper,kind,id));' +
    'CREATE TABLE IF NOT EXISTS reader_data (paper TEXT NOT NULL REFERENCES documents(id), kind TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(paper,kind));' +
    'CREATE TABLE IF NOT EXISTS agent_turns (paper TEXT NOT NULL REFERENCES documents(id), id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(paper,id));' +
    'CREATE TABLE IF NOT EXISTS parallel_translations (paper TEXT NOT NULL REFERENCES documents(id), page INTEGER NOT NULL, paragraph INTEGER NOT NULL, source TEXT NOT NULL, text TEXT NOT NULL, model TEXT NOT NULL, translated INTEGER NOT NULL, PRIMARY KEY(paper,page,paragraph));'
  );
  db.prepare("UPDATE terms SET status = 'error', error = '上次解释中断，可重新尝试。' WHERE status = 'pending'").run();
  const documentColumns = new Set(db.prepare('PRAGMA table_info(documents)').all().map(({ name }) => name));
  if (!documentColumns.has('opened')) {
    db.exec('BEGIN; ALTER TABLE documents ADD COLUMN opened INTEGER; UPDATE documents SET opened=touched; COMMIT;');
  }
  if (!documentColumns.has('page_count')) {
    db.exec('BEGIN; ALTER TABLE documents ADD COLUMN page_count INTEGER; ALTER TABLE documents ADD COLUMN furthest_page INTEGER NOT NULL DEFAULT 0; UPDATE documents SET furthest_page=page WHERE opened IS NOT NULL; COMMIT;');
  }
  const seedTags = db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='paper_tags'").get() === undefined;
  db.exec(`
    CREATE TABLE IF NOT EXISTS paper_categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      parent TEXT REFERENCES paper_categories(id) ON DELETE CASCADE,
      tags TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS paper_catalog (
      paper TEXT PRIMARY KEY REFERENCES documents(id),
      category TEXT REFERENCES paper_categories(id) ON DELETE SET NULL,
      metadata TEXT NOT NULL DEFAULT '{}'
    );
  `);
  if (seedTags) {
    db.exec(`
      BEGIN;
      CREATE TABLE paper_tags (name TEXT PRIMARY KEY);
      INSERT OR IGNORE INTO paper_tags SELECT value FROM paper_catalog, json_each(metadata, '$.tags') WHERE type='text';
      INSERT OR IGNORE INTO paper_tags SELECT value FROM paper_categories, json_each(tags) WHERE type='text';
      COMMIT;
    `);
  }

  const byId = db.prepare('SELECT id, name, size, page, zoom FROM documents WHERE id = ?');
  const find = (id) => typeof id === 'string' && documentIdPattern.test(id) ? byId.get(id) : undefined;
  const requirePaper = (id) => {
    const item = find(id);
    if (!item) throw new Error('请先打开论文。');
    return item;
  };
  const termList = (id) => db.prepare(
    'SELECT key, term, context, body, status, error FROM terms WHERE paper = ? ORDER BY touched DESC'
  ).all(id);
  const marks = (id) => db.prepare(
    'SELECT id, page, kind, quote, note, rects FROM marks WHERE paper = ? ORDER BY page, created'
  ).all(id).map((record) => ({ ...record, rects: JSON.parse(record.rects) }));
  const categoryById = db.prepare("SELECT id, name, parent FROM paper_categories WHERE id = ? AND tags = '[]'");
  const catalogById = db.prepare('SELECT category, metadata FROM paper_catalog WHERE paper = ?');
  const saveCatalog = db.prepare(`
    INSERT INTO paper_catalog (paper, category, metadata) VALUES (?, ?, ?)
    ON CONFLICT(paper) DO UPDATE SET category=excluded.category, metadata=excluded.metadata
  `);
  const tagsOf = (tags) => [...new Set((Array.isArray(tags) ? tags : [])
    .map((tag) => text(tag, 48).normalize('NFKC').toLowerCase()).filter(Boolean))].slice(0, 64);
  const paperFields = { title: 400, authors: 600, year: 12, venue: 240, doi: 240, arxiv: 80, abstract: 10000 };
  const registerTag = db.prepare('INSERT OR IGNORE INTO paper_tags VALUES (?)');
  const uniquePaperIds = (ids) => {
    if (!Array.isArray(ids) || !ids.length || ids.length > 2000) throw new Error('请选择要操作的论文。');
    return new Set(ids);
  };
  const requireCategory = (id) => {
    if (id == null || id === '') return null;
    const row = typeof id === 'string' && categoryById.get(id);
    if (!row) throw new Error('此分类已不存在。');
    return row;
  };
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    find,
    pathFor: (id) => join(files, id + '.pdf'),
    recent: () => db.prepare('SELECT id, name, size, page, zoom FROM documents WHERE opened IS NOT NULL ORDER BY opened DESC').all(),
    paperLibrary() {
      const categories = db.prepare("SELECT id, name, parent FROM paper_categories WHERE tags = '[]' ORDER BY name COLLATE NOCASE, id").all();
      const papers = db.prepare(`
        SELECT d.id, d.name, d.page, d.page_count AS pageCount, d.furthest_page AS furthestPage, d.touched, d.opened, c.category, c.metadata
        FROM documents d LEFT JOIN paper_catalog c ON c.paper=d.id
        ORDER BY d.touched DESC, d.id
      `).all().map(({ metadata, ...row }) => ({ ...row, ...JSON.parse(metadata || '{}') }));
      const tags = db.prepare('SELECT name FROM paper_tags ORDER BY name COLLATE NOCASE').all().map(({ name }) => name);
      return { categories, papers, tags };
    },
    createPaperTag(input) {
      const [name] = tagsOf([input]);
      if (!name) throw new Error('请输入标签名称。');
      registerTag.run(name);
      return name;
    },
    savePaperCategory(input) {
      const previous = requireCategory(input?.id);
      const parent = requireCategory(input?.parent);
      const name = text(input?.name, 80);
      if (!name) throw new Error('请输入分类名称。');
      if (tagsOf(input?.tags).length) throw new Error('智能分类已停用。');
      for (let node = parent; node; node = requireCategory(node.parent)) {
        if (node.id === previous?.id) throw new Error('不能移动到自身或下级分类。');
      }
      if (db.prepare("SELECT id FROM paper_categories WHERE parent IS ? AND name = ? COLLATE NOCASE AND id <> ? AND tags = '[]'")
        .get(parent?.id ?? null, name, previous?.id ?? '')) throw new Error('同一级已有这个分类。');
      const id = previous?.id ?? randomUUID();
      db.prepare(`
        INSERT INTO paper_categories (id, name, parent) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, parent=excluded.parent
      `).run(id, name, parent?.id ?? null);
      return id;
    },
    removePaperCategory(id) {
      const category = requireCategory(id);
      if (!category) return;
      transaction(() => {
        db.prepare(`
          WITH RECURSIVE subtree(id) AS (
            SELECT ? UNION ALL SELECT c.id FROM paper_categories c JOIN subtree s ON c.parent=s.id
          )
          UPDATE paper_catalog SET category=? WHERE category IN (SELECT id FROM subtree)
        `).run(category.id, category.parent);
        db.prepare('DELETE FROM paper_categories WHERE id=?').run(category.id);
      });
    },
    updatePaperDetails(id, details) {
      requirePaper(id);
      const saved = catalogById.get(id);
      const metadata = JSON.parse(saved?.metadata || '{}');
      for (const [key, max] of Object.entries(paperFields)) {
        if (Object.hasOwn(details ?? {}, key)) metadata[key] = text(details[key], max);
      }
      if (metadata.abstractTranslation?.source !== metadata.abstract) delete metadata.abstractTranslation;
      if (metadata.abstract && typeof details?.abstractTranslation === 'string') {
        const translated = text(details.abstractTranslation, 30000);
        if (translated) metadata.abstractTranslation = { source: metadata.abstract, text: translated };
      }
      metadata.tags = tagsOf(details?.tags);
      metadata.status = ['reading', 'read'].includes(details?.status) ? details.status : 'unread';
      transaction(() => {
        for (const tag of metadata.tags) registerTag.run(tag);
        saveCatalog.run(id, saved?.category ?? null, JSON.stringify(metadata));
      });
    },
    savePaperAbstractTranslation(id, source, translation) {
      requirePaper(id);
      const saved = catalogById.get(id);
      const metadata = JSON.parse(saved?.metadata || '{}');
      const translated = text(translation, 30000);
      if (!translated || !source || source !== metadata.abstract) throw new Error('论文摘要已变更，请重新打开详情。');
      const record = { source, text: translated };
      metadata.abstractTranslation = record;
      saveCatalog.run(id, saved?.category ?? null, JSON.stringify(metadata));
      return record;
    },
    classifyPapers(ids, target) {
      const selected = uniquePaperIds(ids);
      const category = requireCategory(target);
      transaction(() => {
        for (const id of selected) {
          requirePaper(id);
          const saved = catalogById.get(id);
          saveCatalog.run(id, category?.id ?? null, saved?.metadata || '{}');
        }
      });
    },
    removePapersFromCategory(ids, categoryId) {
      const selected = uniquePaperIds(ids);
      const category = requireCategory(categoryId);
      if (!category) throw new Error('请选择要移出的分类。');
      const clear = db.prepare('UPDATE paper_catalog SET category=NULL WHERE paper=? AND category=?');
      transaction(() => {
        for (const id of selected) {
          requirePaper(id);
          clear.run(id, category.id);
        }
      });
    },
    async importFile(filePath, categoryId) {
      if (typeof filePath !== 'string' || !filePath) throw new Error('请选择本地 PDF。');
      const importCategory = requireCategory(categoryId);
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error('请选择本地 PDF 文件。');
      const handle = await open(filePath, 'r');
      try {
        const prefix = Buffer.alloc(1024);
        const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
        if (!prefix.subarray(0, bytesRead).includes('%PDF-')) throw new Error('该文件不是可读取的 PDF。');
      } finally {
        await handle.close();
      }
      const pendingFile = join(files, randomUUID() + '.part');
      const hash = createHash('sha256');
      let size = 0;
      const digest = new Transform({
        transform(bytes, _encoding, done) {
          hash.update(bytes);
          size += bytes.length;
          done(null, bytes);
        },
      });
      try {
        await pipeline(createReadStream(filePath), digest, createWriteStream(pendingFile, { flags: 'wx' }));
        const id = hash.digest('hex');
        const destination = join(files, id + '.pdf');
        const cached = await stat(destination).catch(() => null);
        if (!cached?.isFile() || cached.size !== size) await rename(pendingFile, destination);
        transaction(() => {
          const category = importCategory && categoryById.get(importCategory.id);
          const now = Date.now();
          const insert = db.prepare('INSERT OR IGNORE INTO documents (id, name, size, touched, opened) VALUES (?, ?, ?, ?, ?)')
            .run(id, basename(filePath), size, now, categoryId === undefined ? now : null);
          if (!insert.changes && categoryId === undefined) {
            db.prepare('UPDATE documents SET touched=?, opened=? WHERE id=?').run(now, now, id);
          }
          if (insert.changes && category) saveCatalog.run(id, category.id, '{}');
        });
        return find(id);
      } finally {
        await rm(pendingFile, { force: true }).catch(() => {});
      }
    },
    async seedSamplePaper(filePath, details = {}) {
      if (typeof filePath !== 'string' || !filePath) return null;
      const bytes = await readFile(filePath);
      if (!bytes.subarray(0, Math.min(bytes.length, 1024)).includes('%PDF-')) {
        throw new Error('示例论文不是可读取的 PDF。');
      }
      const id = createHash('sha256').update(bytes).digest('hex');
      const destination = join(files, id + '.pdf');
      const cached = await stat(destination).catch(() => null);
      if (!cached?.isFile() || cached.size !== bytes.length) {
        const pendingFile = join(files, randomUUID() + '.part');
        try {
          await writeFile(pendingFile, bytes);
          await rename(pendingFile, destination);
        } finally {
          await rm(pendingFile, { force: true }).catch(() => {});
        }
      }
      transaction(() => {
        const now = Date.now();
        const insert = db.prepare('INSERT OR IGNORE INTO documents (id, name, size, touched, opened) VALUES (?, ?, ?, ?, ?)')
          .run(id, basename(filePath), bytes.length, now, null);
        if (!insert.changes) return;
        const metadata = {};
        for (const [key, max] of Object.entries(paperFields)) {
          const value = text(details?.[key], max);
          if (value) metadata[key] = value;
        }
        const seedTags = tagsOf(details?.tags);
        if (seedTags.length) metadata.tags = seedTags;
        metadata.status = ['reading', 'read'].includes(details?.status) ? details.status : 'unread';
        for (const tag of seedTags) registerTag.run(tag);
        saveCatalog.run(id, null, JSON.stringify(metadata));
      });
      return find(id);
    },
    reopen(id) {
      const paper = requirePaper(id);
      const now = Date.now();
      db.prepare('UPDATE documents SET touched=?, opened=? WHERE id=?').run(now, now, id);
      return paper;
    },
    position(id, page, zoom, pageCount) {
      requirePaper(id);
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isFinite(zoom) || zoom < 0.25 || zoom > 6
        || (pageCount != null && (!Number.isSafeInteger(pageCount) || pageCount < 1))) {
        throw new Error('无效的阅读位置。');
      }
      db.prepare('UPDATE documents SET page=?, zoom=?, page_count=coalesce(?,page_count), furthest_page=max(furthest_page,?) WHERE id=?')
        .run(page, zoom, pageCount ?? null, page, id);
    },
    savePaperPageCount(id, pageCount) {
      requirePaper(id);
      if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error('无效的论文页数。');
      db.prepare('UPDATE documents SET page_count=? WHERE id=?').run(pageCount, id);
    },
    indexPaper(id, pageCount, details) {
      requirePaper(id);
      if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error('无效的论文页数。');
      return transaction(() => {
        const saved = catalogById.get(id);
        const metadata = JSON.parse(saved?.metadata || '{}');
        const added = {};
        if (!metadata.metadataIndexed) {
          for (const [key, max] of Object.entries(paperFields)) {
            const value = text(details?.[key], max);
            if (value && !metadata[key]) added[key] = value;
          }
          saveCatalog.run(id, saved?.category ?? null, JSON.stringify({ ...metadata, ...added, metadataIndexed: true }));
        }
        db.prepare('UPDATE documents SET page_count=? WHERE id=?').run(pageCount, id);
        return { ...added, pageCount, metadataIndexed: true };
      });
    },
    records(id) {
      requirePaper(id);
      return { marks: marks(id), terms: termList(id) };
    },
    addMark(id, value) {
      requirePaper(id);
      const quote = text(value?.quote, 6000);
      const note = text(value?.note, 8000);
      const rects = rectangles(value?.rects);
      const kind = value?.kind === 'note' ? 'note' : 'highlight';
      if (!Number.isInteger(value?.page) || value.page < 1 || !quote || !rects.length || (kind === 'note' && !note)) {
        throw new Error('请选择原文并填写批注。');
      }
      const key = randomUUID();
      db.prepare('INSERT INTO marks VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(key, id, value.page, kind, quote, note, JSON.stringify(rects), Date.now());
      return marks(id);
    },
    updateMark(id, key, draft) {
      requirePaper(id);
      const note = text(draft, 8000);
      if (!note) throw new Error('请输入批注。');
      const result = db.prepare("UPDATE marks SET note = ? WHERE paper = ? AND id = ? AND kind = 'note'").run(note, id, key);
      if (!result.changes) throw new Error('找不到这条批注。');
      return marks(id);
    },
    deleteMark(id, key) {
      requirePaper(id);
      db.prepare('DELETE FROM marks WHERE paper = ? AND id = ?').run(id, key);
      return marks(id);
    },
    beginTerm(id, term, request, context) {
      requirePaper(id);
      const key = term.toLowerCase();
      db.prepare(
        "INSERT INTO terms (paper, key, term, context, status, request, touched) VALUES (?, ?, ?, ?, 'pending', ?, ?) " +
        "ON CONFLICT(paper, key) DO UPDATE SET term=excluded.term, context=excluded.context, status='pending', error='', request=excluded.request, touched=excluded.touched"
      ).run(id, key, term, context, request, Date.now());
    },
    finishTerm(id, term, request, body, error = '') {
      const status = error ? 'error' : 'ready';
      db.prepare(
        "UPDATE terms SET body = CASE WHEN ? = 'ready' THEN ? ELSE body END, status = ?, error = ? WHERE paper = ? AND key = ? AND request = ?"
      ).run(status, body, status, error, id, term.toLowerCase(), request);
      return termList(id);
    },
    deleteTerm(id, key) {
      requirePaper(id);
      db.prepare('DELETE FROM terms WHERE paper = ? AND key = ?').run(id, key);
      return termList(id);
    },
    readerData(id) {
      requirePaper(id);
      return Object.fromEntries(db.prepare('SELECT kind, payload FROM reader_data WHERE paper=?').all(id)
        .map((row) => [row.kind, JSON.parse(row.payload)]));
    },
    saveReaderData(id, kind, data) {
      requirePaper(id);
      if (!['marks', 'terms', 'result', 'figures'].includes(kind)) throw new Error('无效的记录类型。');
      const payload = JSON.stringify(data);
      if (!payload || payload.length > 24000000) throw new Error('这份文献记录超过保存上限。');
      db.prepare('INSERT INTO reader_data VALUES (?, ?, ?) ON CONFLICT(paper,kind) DO UPDATE SET payload=excluded.payload')
        .run(id, kind, payload);
    },
    parallelPage(id, page) {
      requirePaper(id);
      if (!Number.isSafeInteger(page) || page < 1 || page > 20000) throw new Error('无效的 PDF 页码。');
      return db.prepare('SELECT paragraph AS "index", source, text, model, translated FROM parallel_translations WHERE paper=? AND page=? ORDER BY paragraph').all(id, page);
    },
    saveParallelBlock(id, page, entry) {
      requirePaper(id);
      if (!Number.isSafeInteger(page) || page < 1 || page > 20000 || !Number.isSafeInteger(entry?.index)
        || entry.index < 0 || entry.index > 40001 || typeof entry.source !== 'string' || !entry.source.trim() || entry.source.length > 6000
        || typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 100000) {
        throw new Error('无法保存这段译文。');
      }
      const record = { index: entry.index, source: entry.source, text: entry.text,
        model: typeof entry.model === 'string' ? entry.model.slice(0, 200) : '', translated: Date.now() };
      db.prepare('INSERT INTO parallel_translations VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(paper,page,paragraph) DO UPDATE SET source=excluded.source,text=excluded.text,model=excluded.model,translated=excluded.translated')
        .run(id, page, record.index, record.source, record.text, record.model, record.translated);
      return record;
    },
    agentHistory(id) {
      requirePaper(id);
      return db.prepare('SELECT payload FROM agent_turns WHERE paper=? ORDER BY rowid').all(id)
        .map((row) => JSON.parse(row.payload));
    },
    appendAgentTurn(paper, turn) {
      requirePaper(paper);
      db.prepare('INSERT INTO agent_turns VALUES (?, ?, ?)').run(paper, turn.id, JSON.stringify(turn));
      return turn;
    },
    research(id) {
      requirePaper(id);
      const rows = db.prepare('SELECT kind, payload FROM research WHERE paper = ? ORDER BY touched DESC').all(id);
      const result = { summary: null, references: null, figures: [] };
      for (const row of rows) {
        const value = JSON.parse(row.payload);
        if (row.kind === 'figure') result.figures.push(value);
        else result[row.kind] = value;
      }
      return result;
    },
    saveResearch(paper, kind, id, value) {
      requirePaper(paper);
      db.prepare('INSERT INTO research VALUES (?, ?, ?, ?, ?) ON CONFLICT(paper,kind,id) DO UPDATE SET payload=excluded.payload, touched=excluded.touched')
        .run(paper, kind, id, JSON.stringify(value), Date.now());
    },
    removeFigure(paper, id) {
      requirePaper(paper);
      db.prepare("DELETE FROM research WHERE paper = ? AND kind = 'figure' AND id = ?").run(paper, id);
    },
    getSetting(key, fallback) {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row ? JSON.parse(row.value) : fallback;
    },
    setSetting(key, value) {
      db.prepare('INSERT INTO settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        .run(key, JSON.stringify(value));
    },
    setSettings(values) {
      const update = db.prepare('INSERT INTO settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      db.exec('BEGIN');
      try {
        for (const [key, value] of Object.entries(values)) update.run(key, JSON.stringify(value));
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => db.close(),
  };
}
