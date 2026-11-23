import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { readPageText } from './pdf.jsx';

const api = window.reader;
const blank = { summary: null, references: null, figures: [] };
const kinds = { summary: '论文分析', references: '参考文献', figure: '图解' };

async function readPaper(pdf, signal, progress) {
  const pages = [];
  let size = 0;
  for (let number = 1; number <= pdf.numPages; number++) {
    signal.throwIfAborted();
    if (number === 1 || number % 5 === 0) progress('提取 PDF 文字 ' + number + '/' + pdf.numPages);
    const page = await pdf.getPage(number);
    const text = readPageText(await page.getTextContent()).split(/\n/)
      .map((line) => line.replace(/[\t \u00a0]+/g, ' ').trim()).filter(Boolean).join('\n');
    pages.push(text);
    size += text.length + 2;
    if (size > 12000000) throw new Error('论文文字超出可处理的范围。');
  }
  signal.throwIfAborted();
  if (!pages.some(Boolean)) throw new Error('此 PDF 没有可提取的文字层。图解仍可用于框选图片。');
  return {
    text: pages.filter(Boolean).join('\n\n'),
    pageTextLengths: pages.map((text) => text.length),
    pageLineCounts: pages.map((text) => text ? text.split('\n').length : 0),
  };
}

export function useResearch(paper, pdf) {
  const papers = useRef(new Map());
  const jobs = useRef(new Map());
  const extracts = useRef(new WeakMap());
  const [results, setResults] = useState({});
  const [tasks, setTasks] = useState({});
  const id = paper?.id;
  const publish = (owner, change) => {
    const next = { ...(papers.current.get(owner) || blank), ...change };
    papers.current.set(owner, next);
    setResults((previous) => ({ ...previous, [owner]: next }));
  };
  const status = (task, value) => setTasks((previous) => ({ ...previous, [task]: value }));

  useEffect(() => api.onResearchProgress((event) => {
    const key = event.paper + ':' + event.operation;
    if (jobs.current.get(key)?.request !== event.request) return;
    if (event.message) status(key, { pending: true, message: event.message });
    if (event.references) publish(event.paper, { references: event.references });
  }), []);

  useEffect(() => {
    if (!id || papers.current.has(id)) return;
    let alive = true;
    api.research(id).then((saved) => {
      if (alive && !papers.current.has(id)) publish(id, saved);
    }).catch((error) => {
      if (alive) status(id + ':summary', { error: error.message });
    });
    return () => { alive = false; };
  }, [id]);

  const run = async (operation, options = {}) => {
    if (!id || !pdf) return;
    const key = id + ':' + operation;
    if (jobs.current.has(key)) return;
    const job = { request: crypto.randomUUID(), abort: new AbortController(), sent: false };
    jobs.current.set(key, job);
    const update = (message) => status(key, { pending: true, message });
    update('正在准备' + kinds[operation]);
    try {
      let input = { ...options, paper: id, request: job.request, operation };
      if (operation === 'summary' || (operation === 'references' && !options.retry)) {
        let extracted = extracts.current.get(pdf);
        if (!extracted) {
          extracted = await readPaper(pdf, job.abort.signal, update);
          extracts.current.set(pdf, extracted);
        }
        input = { ...input, ...extracted };
      }
      job.abort.signal.throwIfAborted();
      job.sent = true;
      const saved = await api.runResearch(input);
      if (operation === 'figure') publish(id, { figures: saved.figures });
      else publish(id, { [operation]: saved[operation] });
      status(key, { complete: true });
    } catch (error) {
      status(key, { error: job.abort.signal.aborted ? '任务已取消。' : (error.message || '任务失败。') });
    } finally {
      jobs.current.delete(key);
    }
  };
  const cancel = (operation) => {
    const job = jobs.current.get(id + ':' + operation);
    if (!job) return;
    job.abort.abort();
    if (job.sent) api.cancelJob(job.request).catch(() => {});
  };
  const removeFigure = async (entry) => {
    try { publish(id, { figures: await api.removeFigure(id, entry) }); }
    catch (error) { status(id + ':figure', { error: error.message }); }
  };
  return { data: results[id] || blank, run, cancel, removeFigure, task: (key) => tasks[id + ':' + key] || {} };
}

function MarkdownLink({ href, children }) {
  if (!/^https?:\/\//i.test(href || '')) return <span>{children}</span>;
  return <a href={href} onClick={(event) => {
    event.preventDefault();
    api.openLink(href).catch(() => {});
  }}>{children}</a>;
}

function RenderMarkdown({ text }) {
  return <div className="research-markdown"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeKatex]} components={{ a: MarkdownLink }}>{text || ''}</ReactMarkdown></div>;
}

const providerNames = { chatgpt: 'ChatGPT 订阅', openai: 'OpenAI API', deepseek: 'DeepSeek', compatible: '兼容服务' };
function Metadata({ value }) {
  if (!value) return null;
  const model = value.model || value.modelId;
  const modelDetails = [...new Set([value.modelId, value.actualModel].filter((item) => item && item !== model))];
  const date = new Date(value.finishedAt);
  return <div className="research-meta">
    <span>{providerNames[value.provider]} · {model}{modelDetails.length ? '（' + modelDetails.join(' / ') + '）' : ''}</span>
    <span>推理强度 {value.effort === 'default' ? '服务商默认' : value.effort} · {date.toLocaleString()}</span>
  </div>;
}

function ReportDialog({ summary, onClose }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="report-dialog" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="dialog-head"><h2>论文分析</h2><button className="quiet" onClick={onClose} aria-label="关闭报告">×</button></header>
    <Metadata value={summary.metadata} />
    <RenderMarkdown text={summary.text} />
  </dialog>;
}

const states = {
  provided: '原文提供', matched: '已匹配', confirm: '待确认', pending: '待处理', none: '无匹配', retry: '暂时失败',
};
const stateHints = {
  confirm: '候选条目的标题、作者或年份不足以确认同一文献。',
  pending: '书目信息或链接尚未处理完。',
  none: '书目服务中未找到符合条件的条目。',
  retry: '书目服务暂时不可用，可以重试。',
};

export function ResearchPanel({ operation, research, ready, picking, onPick, onPage }) {
  const [expanded, setExpanded] = useState(false);
  const [sort, setSort] = useState('time-desc');
  const { data } = research;
  const task = research.task(operation);
  const summary = data.summary;
  const references = data.references;
  const figures = [...data.figures].sort((a, b) => {
    const order = sort.startsWith('time') ? a.metadata.finishedAt.localeCompare(b.metadata.finishedAt)
      : a.page - b.page || a.position.y - b.position.y || a.position.x - b.position.x;
    return sort.endsWith('desc') ? -order : order;
  });
  return <div className="research-panel">
    <div className="research-toolbar">
      {operation === 'summary' && <>
        <button className="primary" disabled={!ready || task.pending} onClick={() => research.run('summary')}>分析论文</button>
        {summary?.canRetry && <button disabled={!ready || task.pending} onClick={() => research.run('summary', { retry: true })}>仅重试汇总</button>}
        {summary?.text && <button onClick={() => setExpanded(true)}>展开报告</button>}
      </>}
      {operation === 'references' && <>
        <button className="primary" disabled={!ready || task.pending} onClick={() => research.run('references')}>整理参考文献</button>
        {references?.entries.some((item) => ['pending', 'retry'].includes(item.status)) &&
          <button disabled={!ready || task.pending} onClick={() => research.run('references', { retry: true })}>重试未完成</button>}
      </>}
      {operation === 'figure' && <>
        <button className="primary" disabled={!ready || task.pending} onClick={onPick}>{picking ? '取消框选' : '插图解释'}</button>
        {figures.length > 0 && <select aria-label="图解排序" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="document-asc">文中位置 · 正序</option><option value="document-desc">文中位置 · 倒序</option>
          <option value="time-asc">分析时间 · 正序</option><option value="time-desc">分析时间 · 倒序</option>
        </select>}
      </>}
      {task.pending && <button onClick={() => research.cancel(operation)}>取消任务</button>}
    </div>
    {task.pending && <p role="status" className="research-progress">{task.message}…</p>}
    {task.error && <p role="alert" className="form-error">{task.error}</p>}
    {operation === 'summary' && (summary ? <>
      <Metadata value={summary.metadata} />
      {summary.coverage?.totalPages > 0 && <p className="research-meta">
        {summary.mode === 'direct' ? '一次全文分析' : '全文分段分析'} · 已覆盖 {summary.coverage.pages.map(([a, b]) => a === b ? a : a + '–' + b).join('、')} / {summary.coverage.totalPages} 页
      </p>}
      {summary.failedChunks > 0 && <p className="form-error">{summary.failedChunks} 个分段未完成，结果覆盖范围见上方。</p>}
      {summary.canRetry && <p className="form-error">汇总失败，已保留分段笔记，可单独重试汇总。</p>}
      <RenderMarkdown text={summary.text} />
      {expanded && <ReportDialog summary={summary} onClose={() => setExpanded(false)} />}
    </> : <p className="empty">使用所选模型分析论文的方法、实验、局限与复现细节。</p>)}
    {operation === 'references' && (references ? <>
      {references.skipped > 0 && <p className="form-error">{references.skipped} 个书目区段未完整识别，可重新整理。</p>}
      <div className="research-meta">{references.entries.length} 条参考文献</div>
      <div className="reference-list">{references.entries.map((item) => (
        <article className="record reference" key={item.id}>
          <h3>{item.number ? '[' + item.number + '] ' : ''}{item.title || item.raw}</h3>
          {item.title && <div className="research-meta">{[item.authors, item.venue, item.year].filter(Boolean).join(' · ')}</div>}
          <div className="reference-actions">
            {item.url ? <MarkdownLink href={item.url}>{states[item.status] || '打开文献'}</MarkdownLink> :
              <span title={stateHints[item.status]}>{states[item.status] || '待处理'}</span>}
            {item.pages && <button className="location" onClick={() => onPage(parseInt(item.pages, 10))}>第 {item.pages} 页</button>}
          </div>
          {item.title && <details className="reference-source"><summary>查看引文原文</summary><p>{item.raw}</p></details>}
        </article>
      ))}</div>
    </> : <p className="empty">识别论文书目中的引文，并核对原文链接、DOI 或数据库匹配结果。</p>)}
    {operation === 'figure' && <>
      <p className="empty">{picking ? '在当前 PDF 页拖动框选插图，按 Esc 取消。' : !figures.length ? '框选一幅图表，使用支持图像输入的模型解释。' : ''}</p>
      {figures.map((item) => <article className="record figure-record" key={item.id}>
        <div className="record-head">
          <button className="location" onClick={() => onPage(item.page)}>第 {item.page} 页</button>
          <button className="quiet" onClick={() => research.removeFigure(item.id)} aria-label={'删除第 ' + item.page + ' 页图解'}>删除</button>
        </div>
        {item.preview && <img src={item.preview} alt={'第 ' + item.page + ' 页插图选区'} />}
        <Metadata value={item.metadata} />
        <RenderMarkdown text={item.text} />
      </article>)}
    </>}
  </div>;
}
