import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ChevronRight from 'kubai-icons-react/icons/chevron-right';
import Files from 'kubai-icons-react/icons/files';
import TagPlus from 'kubai-icons-react/icons/tag-plus';
import FileText from 'kubai-icons-react/duotone/icons/file-text';
import Folder from 'kubai-icons-react/duotone/icons/folder';
import FolderOpen from 'kubai-icons-react/duotone/icons/folder-open';
import FolderPlus from 'kubai-icons-react/duotone/icons/folder-plus';
import Grid from 'kubai-icons-react/duotone/icons/grid';
import History from 'kubai-icons-react/duotone/icons/history';
import Inbox from 'kubai-icons-react/duotone/icons/inbox';
import List from 'kubai-icons-react/duotone/icons/list';
import Search from 'kubai-icons-react/duotone/icons/search';
import Table from 'kubai-icons-react/duotone/icons/table';
import { animateSharedDialog, visibleRect } from './surface-motion.js';
import appIcon from '../../assets/coreader-cr.png';
import wordmark from '../../assets/coreader-wordmark-duo.png';
import { ensurePdfJs, indexPaper, postReader, renderPaperCover } from './desktop-runtime.js';
import { EmptySkeleton, EmptyState } from './empty-state.jsx';
import './paper-library.css';

const api = window.reader;
const statuses = { unread: '未读', reading: '在读', read: '已读' };
const scopes = { all: '全部论文', recent: '最近阅读', uncategorized: '未分类' };
const paperMime = 'application/x-elr-paper';
const empty = { papers: [], categories: [], tags: [] };
const paperTitle = (paper) => paper.title || paper.name.replace(/\.pdf$/i, '');
const normalize = (value) => value.normalize('NFKC').toLowerCase();
function readingProgress(paper, indexedPages) {
  const total = paper.pageCount || indexedPages.get(paper.id);
  const readPages = Array.isArray(paper.readPages)
    ? paper.readPages.filter((p) => Number.isInteger(p) && p >= 1 && (!total || p <= total))
    : [];
  const readTo = readPages.length > 0 ? readPages.length : Math.min(total || Infinity, paper.furthestPage || 0);
  const ratio = total ? readTo / total : 0;
  const completed = Boolean(total && (readTo >= total || ratio >= 0.85));
  const status = completed ? 'read' : paper.status || (readTo > 0 || paper.opened ? 'reading' : 'unread');
  const percent = status === 'read' ? 100 : !readTo ? 0 : total ? Math.min(99, Math.round(ratio * 100)) : null;
  return { total, readTo, completed, status, percent };
}

function ReadingProgress({ paper, indexedPages, compact = false }) {
  const { total, readTo, percent } = readingProgress(paper, indexedPages);
  const label = percent == null ? '第 ' + readTo + ' 页' : percent + '%';
  const description = total && readTo > 0 ? '已有效阅读 ' + readTo + ' / ' + total + ' 页' : label;
  return <div className={'pl-reading-progress' + (compact ? ' is-compact' : '')} role="progressbar" aria-label="阅读进度"
    aria-valuenow={percent ?? undefined} aria-valuetext={description === label ? label : label + '，' + description} title={description}>
    {!compact && <span className="pl-progress-track" aria-hidden="true"><span style={{ '--pl-progress': (percent ?? 0) + '%' }} /></span>}
    <span className="pl-progress-value">{label}</span>
  </div>;
}

const libraryIcons = {
  all: Files, recent: History, uncategorized: Inbox, folder: Folder, paper: FileText,
  search: Search, folderPlus: FolderPlus, folderOpen: FolderOpen, tagPlus: TagPlus,
  list: List, table: Table, gallery: Grid, chevron: ChevronRight,
};

function Icon({ name }) {
  const Glyph = libraryIcons[name];
  return <Glyph size={17} trigger="none" style={{ '--kd-b': 'color-mix(in srgb, currentColor 40%, transparent)' }} />;
}

const covers = new Map();
const coverLanes = [Promise.resolve(), Promise.resolve(), Promise.resolve()];
let nextCoverLane = 0;

function PaperCover({ paper, open, onOpenCover, onCoverReady }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(() => covers.get(paper.id) || '');
  useEffect(() => {
    if (src || !ref.current) return;
    let controller;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        controller?.abort();
        return;
      }
      controller = new AbortController();
      const { signal } = controller;
      const lane = nextCoverLane++ % coverLanes.length;
      coverLanes[lane] = coverLanes[lane].then(async () => {
        if (signal.aborted) return;
        const preview = covers.get(paper.id) || await renderPaperCover(paper.id, signal);
        if (!preview || signal.aborted) return;
        covers.set(paper.id, preview);
        if (covers.size > 48) covers.delete(covers.keys().next().value);
        setSrc(preview);
      }).catch(() => {});
    }, { root: ref.current.closest('.pl-results'), rootMargin: '100px' });
    observer.observe(ref.current);
    return () => { observer.disconnect(); controller?.abort(); };
  }, [paper.id, src]);
  const image = useRef(null);
  useLayoutEffect(() => {
    if (image.current?.complete && image.current.naturalWidth) onCoverReady?.(paper.id, image.current);
  }, [paper.id, src, onCoverReady]);
  return <button type="button" ref={ref} className="pl-cover" title={paperTitle(paper)}
    aria-label={'阅读 ' + paperTitle(paper)} onClick={(event) => {
      if (onOpenCover) onOpenCover(paper, image.current, !event.detail);
      else open(paper);
    }}>
    {src ? <img ref={image} src={src} alt="" draggable={false} onLoad={(event) => onCoverReady?.(paper.id, event.currentTarget)} />
      : <Icon name="paper" />}
  </button>;
}

function PaperAbstract({ paper, onSaved }) {
  const [abstract, setAbstract] = useState(paper.abstract || '');
  const [chinese, setChinese] = useState(false);
  const [translation, setTranslation] = useState(paper.abstractTranslation || null);
  const source = abstract.trim();
  const current = translation?.source === source ? translation : null;
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);

  async function toggle() {
    if (chinese) {
      setChinese(false);
      request.current?.abort();
      request.current = null;
      return;
    }
    setChinese(true);
    if (current?.text) return;

    const controller = new AbortController();
    request.current = controller;
    setTranslation(null);
    try {
      const paragraphs = [];
      const limit = 6000;
      let remaining = source;
      while (remaining) {
        let end = remaining.length;
        if (end > limit) {
          const boundary = remaining.slice(0, limit).search(/\s\S*$/u);
          end = boundary >= limit / 2 ? boundary : limit;
          if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
        }
        const part = remaining.slice(0, end).trim();
        remaining = remaining.slice(end).trimStart();
        const result = await postReader('/translate', { text: part }, 300000, controller.signal);
        if (!result?.ok || typeof result.text !== 'string' || !result.text.trim()) {
          throw new Error(result?.error || '翻译未返回正文。');
        }
        paragraphs.push(result.text.trim());
      }
      controller.signal.throwIfAborted();
      const translated = paragraphs.join('\n\n');
      if (source === paper.abstract) {
        const record = await api.savePaperAbstractTranslation(paper.id, source, translated);
        onSaved(paper.id, record);
      }
      if (!controller.signal.aborted) setTranslation({ source, text: translated });
    } catch (error) {
      if (!controller.signal.aborted) {
        setTranslation({ source, error: error.timeout ? '摘要翻译超时。' : error.message || '摘要翻译失败。' });
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  return <section className="pl-abstract" aria-label="摘要">
    <div className="pl-abstract-heading">
      <label htmlFor="pl-paper-abstract">摘要</label>
      <button type="button" onClick={toggle} disabled={!abstract.trim()} aria-pressed={chinese}>
        {chinese ? '查看原文' : '查看中文'}
      </button>
    </div>
    <textarea id="pl-paper-abstract" name="abstract" maxLength={10000} value={abstract} hidden={chinese}
      onChange={(event) => setAbstract(event.target.value)} />
    {current?.text && source !== paper.abstract && <input type="hidden" name="abstractTranslation" value={current.text} />}
    {chinese && <div className="pl-abstract-translation" lang="zh-CN" tabIndex={0} aria-label="中文摘要"
      aria-busy={!current}>
      {current?.error ? <p className="pl-error" role="alert">{current.error}</p>
        : current?.text || <p role="status">正在翻译摘要…</p>}
    </div>}
  </section>;
}

function PaperTagPicker({ catalog, selected, onChange, onCreate, busy }) {
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [value, setValue] = useState('');
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const full = selected.length >= 64;
  const query = normalize(filter.trim());
  const filtered = query ? catalog.filter((tag) => normalize(tag).includes(query)) : catalog;

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => searchRef.current?.focus());
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) {
        setOpen(false);
        setFilter('');
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  function closePanel(focusTrigger = false) {
    setOpen(false);
    setFilter('');
    if (focusTrigger) triggerRef.current?.focus();
  }

  function toggleTag(tag) {
    if (busy) return;
    if (selected.includes(tag)) {
      onChange(selected.filter((item) => item !== tag));
    } else if (!full) {
      onChange([...selected, tag]);
    }
  }

  function onPanelKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePanel(true);
      return;
    }
    const items = [...(listRef.current?.querySelectorAll('[role="option"]:not(:disabled)') || [])];
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[idx < 0 ? 0 : (idx + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (idx <= 0) searchRef.current?.focus();
      else items[idx - 1]?.focus();
    }
  }

  async function create() {
    if (!value.trim() || busy || full) return;
    if (await onCreate(value)) {
      setValue('');
      setCreating(false);
    }
  }

  const triggerText = selected.length
    ? '已选 ' + selected.length + ' 个标签 · 选择或搜索'
    : catalog.length ? '选择或搜索已有标签' : '暂无已有标签';

  return <fieldset className="pl-tag-picker">
    <legend>标签</legend>
    {selected.length > 0 && <div className="pl-selected-tags">
      {selected.map((tag) => <button type="button" key={tag} disabled={busy} aria-label={'移除标签 ' + tag}
        title={'移除标签 ' + tag} onClick={() => onChange(selected.filter((item) => item !== tag))}>{tag}<span aria-hidden="true">×</span></button>)}
    </div>}
    <div className="pl-tag-controls">
      <div className="pl-tag-menu-wrap" ref={wrapRef}>
        <button ref={triggerRef} type="button" className="pl-tag-menu-trigger" disabled={busy || !catalog.length}
          aria-haspopup="listbox" aria-expanded={open} aria-controls="pl-existing-tag-listbox"
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && !busy && catalog.length) {
              event.preventDefault();
              setOpen(true);
            } else if (event.key === 'Escape' && open) {
              event.preventDefault();
              event.stopPropagation();
              closePanel(true);
            }
          }}>
          <span>{triggerText}</span>
          <span className="pl-menu-caret" aria-hidden="true" />
        </button>
        {open && <div className="pl-tag-combobox" onKeyDown={onPanelKeyDown}>
          <input ref={searchRef} type="search" className="pl-tag-search" value={filter}
            role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="pl-existing-tag-listbox"
            aria-label="搜索已有标签" placeholder="搜索标签…"
            onChange={(event) => setFilter(event.target.value)} />
          <div id="pl-existing-tag-listbox" ref={listRef} className="pl-tag-listbox" role="listbox"
            aria-label="已有标签" aria-multiselectable="true">
            {filtered.length > 0 ? filtered.map((tag) => {
              const checked = selected.includes(tag);
              const disabled = busy || (!checked && full);
              return <button key={tag} type="button" role="option" aria-selected={checked} disabled={disabled}
                className="pl-tag-option" onClick={() => toggleTag(tag)}>
                <input type="checkbox" tabIndex={-1} aria-hidden="true" checked={checked} readOnly />
                <span>{tag}</span>
              </button>;
            }) : <EmptyState size="menu" live title={'没有匹配「' + filter.trim() + '」的标签'} />}
          </div>
        </div>}
      </div>
      <button type="button" disabled={busy || full} aria-expanded={creating} onClick={() => setCreating(!creating)}>
        <Icon name="tagPlus" />创建标签
      </button>
    </div>
    {creating && <div className="pl-tag-controls">
      <input aria-label="标签名称" placeholder="标签名称" maxLength={48} value={value} autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          void create();
        }} />
      <button type="button" className="pl-primary" disabled={busy || !value.trim() || full} onClick={create}>添加</button>
    </div>}
  </fieldset>;
}

function categoryTree(categories) {
  const children = new Map();
  for (const item of categories) {
    const group = children.get(item.parent) || [];
    group.push(item);
    children.set(item.parent, group);
  }
  function walk(parent, depth, path) {
    return (children.get(parent) || []).flatMap((item) => {
      const fullPath = path ? path + ' / ' + item.name : item.name;
      return [{ ...item, depth, path: fullPath, hasChildren: children.has(item.id) },
        ...walk(item.id, depth + 1, fullPath)];
    });
  }
  return walk(null, 0, '');
}

function LibraryDialog({ title, cancel, submit, busy, issue, children, action = '保存', destructive, details, tone, origin }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    if (!origin) return undefined;
    const source = origin.button.closest('li, tr');
    const titleParts = [source?.querySelector('.pl-paper-title')];
    const titleInput = [dialog.querySelector('input[name="title"]')];
    const last = origin.running.current;
    const previous = last?.source === source ? last.stop?.capture() : null;
    last?.stop?.();
    const stop = animateSharedDialog(dialog, source, titleParts, titleInput, origin.keyboard, false, previous);
    return () => {
      const frame = stop?.capture();
      const results = origin.button.closest('.pl-results');
      stop?.();
      if (dialog.open && origin.button.isConnected) {
        origin.running.current = { source, stop: animateSharedDialog(dialog, source, titleParts, titleInput, origin.keyboard, true, frame) };
        dialog.close();
        queueMicrotask(() => {
          if (!results?.isConnected || document.querySelector('dialog:modal')) return;
          const active = document.activeElement;
          if ((active === document.body || active === origin.button) && !visibleRect(origin.button, results.getBoundingClientRect())) {
            results.focus({ preventScroll: true });
          }
        });
      }
    };
  }, [origin]);
  return <dialog ref={ref} className={'pl-dialog' + (details ? ' is-details' : '') + tone} aria-label={title}
    onCancel={(event) => { event.preventDefault(); if (!busy) cancel(); }}
    onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation(); }}>
    <form onSubmit={submit}>
      <h2>{title}</h2>
      {children}
      {issue && <p className="pl-error" role="alert">{issue}</p>}
      <footer>
        <button type="button" disabled={busy} onClick={cancel}>取消</button>
        <button type="submit" disabled={busy} className={destructive ? 'pl-danger' : 'pl-primary'}>{action}</button>
      </footer>
    </form>
  </dialog>;
}

export function PaperLibrary({ onOpen, onOpenCover, onCoverReady, onOpenFile, onSettings, version, readerError, tone }) {
  const [data, setData] = useState(empty);
  const [indexedPages, setIndexedPages] = useState(() => new Map());
  const indexedPapers = useRef(new Set());
  const [scope, setScope] = useState(() => localStorage.getItem('elr.library-scope') || 'all');
  const [layout, setLayout] = useState(() => localStorage.getItem('elr.library-view') === 'table' ? 'table' : 'list');
  const [gallery, setGallery] = useState(() => localStorage.getItem('elr.library-gallery') === 'true');
  useEffect(() => {
    if (gallery && data.papers.length) void ensurePdfJs().catch(() => {});
  }, [gallery, data.papers.length]);
  const [coverWidth, setCoverWidth] = useState(() => {
    const saved = Number(localStorage.getItem('elr.library-cover-width'));
    return saved >= 128 && saved <= 340 ? saved : 176;
  });
  const resultsRef = useRef(null);
  const [collapsed, setCollapsed] = useState(new Set());
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('recent');
  const [selected, setSelected] = useState(new Set());
  const [editor, setEditor] = useState(null);
  const detailMotion = useRef(null);
  useEffect(() => () => detailMotion.current?.stop?.(), []);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState('loading');
  const [drop, setDrop] = useState(null);
  const inFlight = useRef(false);
  const alive = useRef(false);

  function loadPaperLibrary() {
    setBusy('loading');
    setLoadFailed(false);
    setError('');
    api.paperLibrary().then((value) => {
      if (alive.current) {
        setData(value);
        setLoadFailed(false);
      }
    }).catch(() => {
      if (alive.current) setLoadFailed(true);
    }).finally(() => {
      if (alive.current) setBusy('');
    });
  }

  useEffect(() => {
    alive.current = true;
    loadPaperLibrary();
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    const pending = data.papers.filter((paper) => (!paper.metadataIndexed || !paper.pageCount) && !indexedPapers.current.has(paper.id));
    if (!pending.length) return;
    const controller = new AbortController();
    const { signal } = controller;
    const timer = setTimeout(async () => {
      for (const { id } of pending) {
        if (signal.aborted) break;
        const result = await indexPaper(id, signal).catch(() => null);
        if (signal.aborted) break;
        indexedPapers.current.add(id);
        if (result) {
          setIndexedPages((previous) => new Map(previous).set(id, result.pageCount));
          setData((previous) => ({ ...previous, papers: previous.papers.map((paper) => {
            if (paper.id !== id) return paper;
            const missing = Object.fromEntries(Object.entries(result).filter(([key]) => !paper[key]));
            return { ...paper, ...missing };
          }) }));
        }
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [data.papers]);
  useEffect(() => {
    if (!gallery) return;
    const results = resultsRef.current;
    const zoom = (event) => {
      if ((!event.ctrlKey && !event.metaKey) || !event.deltaY) return;
      event.preventDefault();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1);
      const step = Math.round(Math.max(-120, Math.min(120, pixels)) / 4);
      setCoverWidth((width) => Math.max(128, Math.min(340, width - (step || Math.sign(pixels)))));
    };
    results.addEventListener('wheel', zoom, { passive: false });
    return () => results.removeEventListener('wheel', zoom);
  }, [gallery]);
  useEffect(() => { localStorage.setItem('elr.library-cover-width', String(coverWidth)); }, [coverWidth]);
  const categories = useMemo(() => categoryTree(data.categories), [data.categories]);
  const categoryById = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const active = categoryById.get(scope);
  const current = active?.id || (Object.hasOwn(scopes, scope) ? scope : 'all');
  const categoryCount = (category) => data.papers.filter((paper) => paper.category === category.id).length;
  const paperStatus = (paper) => readingProgress(paper, indexedPages).status;
  const recentCount = data.papers.filter((paper) => paper.opened).length;
  const rootCount = current === 'uncategorized' ? data.papers.filter((paper) => !paper.category).length
    : current === 'recent' ? recentCount : data.papers.length;
  const tags = useMemo(() => data.tags.slice().sort((a, b) => a.localeCompare(b, 'zh-CN')), [data.tags]);
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const rows = data.papers.filter((paper) => {
    if (current === 'recent' && !paper.opened) return false;
    if (current === 'uncategorized' && paper.category) return false;
    if (active && paper.category !== active.id) return false;
    if (tag && !paper.tags?.includes(tag)) return false;
    if (status && paperStatus(paper) !== status) return false;
    const text = normalize([paperTitle(paper), paper.name, paper.authors, paper.venue, paper.year, paper.doi, paper.arxiv,
      ...(paper.tags || [])].join(' '));
    return terms.every((term) => text.includes(term));
  }).sort((a, b) => {
    if (sort === 'title') return paperTitle(a).localeCompare(paperTitle(b), 'zh-CN');
    if (sort === 'year') return (Number(b.year) || 0) - (Number(a.year) || 0) || b.touched - a.touched;
    return (b.opened || 0) - (a.opened || 0) || b.touched - a.touched;
  });
  const visible = current === 'recent' ? rows.slice(0, 20) : rows;
  const picked = visible.filter((paper) => selected.has(paper.id)).map((paper) => paper.id);
  const title = active?.name || scopes[current];
  const nextLayout = layout === 'list' ? 'table' : 'list';

  function navigate(key) {
    setScope(key);
    localStorage.setItem('elr.library-scope', key);
    setSelected(new Set());
  }

  function showGallery(enabled) {
    setGallery(enabled);
    localStorage.setItem('elr.library-gallery', String(enabled));
  }

  function selectViewMode(mode) {
    if (mode === 'gallery') {
      if (gallery) return;
      showGallery(true);
      return;
    }
    if (!gallery && layout === mode) return;
    if (gallery) {
      setGallery(false);
      localStorage.setItem('elr.library-gallery', 'false');
    }
    if (layout !== mode) {
      setLayout(mode);
      localStorage.setItem('elr.library-view', mode);
    }
  }

  async function mutate(action, after, label = 'save') {
    if (inFlight.current || busy === 'loading') return;
    inFlight.current = true;
    setBusy(label);
    setError('');
    setNotice('');
    try {
      const result = await action();
      const next = await api.paperLibrary();
      if (alive.current) {
        setData(next);
        after?.(result);
      }
      return result;
    } catch (err) {
      if (alive.current) setError(err.message);
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy('');
    }
  }

  function importFiles(files, category) {
    const pdfs = files && [...files].filter((file) => /\.pdf$/i.test(file.name) || file.type === 'application/pdf');
    if (pdfs && !pdfs.length) { setError('请选择 PDF 文件。'); return; }
    void mutate(() => pdfs ? api.dropLibraryPapers(pdfs, category) : api.chooseLibraryFolder(category), (result) => {
      if (result.count) setNotice('已收录 ' + result.count + ' 篇论文。');
      else if (result.empty) setNotice('此文件夹内没有 PDF 文件。');
      if (result.errors.length) setError(result.errors.join('；'));
    }, 'import');
  }

  function dragOver(event, key) {
    const { types } = event.dataTransfer;
    if (!types.includes('Files') && !(key && types.includes(paperMime))) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = types.includes(paperMime) ? 'move' : 'copy';
    setDrop(key || 'all');
  }

  function acceptDrop(event, key) {
    if (!event.dataTransfer.types.includes('Files') && !event.dataTransfer.types.includes(paperMime)) return;
    event.preventDefault();
    event.stopPropagation();
    setDrop(null);
    if (event.dataTransfer.files.length) importFiles(event.dataTransfer.files, key === 'uncategorized' ? null : key);
    else if (key) {
      const ids = event.dataTransfer.getData(paperMime).split(',').filter(Boolean);
      if (ids.length) void mutate(() => api.classifyPapers(ids, key === 'uncategorized' ? null : key), () => setSelected(new Set()));
    }
  }

  function startDrag(event, paper) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(paperMime, (selected.has(paper.id) ? picked : [paper.id]).join(','));
  }

  function togglePaper(id) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function rememberAbstractTranslation(id, translation) {
    if (!alive.current) return;
    setData((previous) => ({ ...previous, papers: previous.papers.map((paper) =>
      paper.id === id && paper.abstract === translation.source ? { ...paper, abstractTranslation: translation } : paper) }));
  }

  function showEditor(value) {
    setError('');
    setEditor(value.kind === 'details' ? { ...value, tags: value.paper.tags || [] } : value);
  }

  function updateDetailTags(tags) {
    setEditor((previous) => previous?.kind === 'details' ? { ...previous, tags } : previous);
  }

  function createTag(name) {
    return mutate(() => api.createPaperTag(name), (tag) => updateDetailTags([...new Set([...editor.tags, tag])]));
  }

  function removeFromCategory() {
    void mutate(() => api.removePapersFromCategory(picked, active.id), () => {
      setSelected(new Set());
      setNotice('已移出 ' + picked.length + ' 篇论文。');
    });
  }

  function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (editor.kind === 'details') {
      const initial = { ...editor.paper, title: paperTitle(editor.paper) };
      const changed = Object.fromEntries(Object.entries(values).filter(([key, value]) => key === 'status' || value !== (initial[key] || '')));
      void mutate(() => api.updatePaperDetails(editor.paper.id, { ...changed, tags: editor.tags }), () => setEditor(null));
      return;
    }
    if (editor.kind === 'move') {
      void mutate(() => api.classifyPapers(editor.ids, values.category || null), () => {
        setSelected(new Set());
        setEditor(null);
      });
      return;
    }
    if (editor.kind === 'remove') {
      void mutate(() => api.removePaperCategory(editor.category.id), () => {
        navigate(editor.category.parent || 'uncategorized');
        setEditor(null);
      });
      return;
    }
    void mutate(() => api.savePaperCategory({
      id: editor.category?.id, name: values.name, parent: values.parent || null,
    }), (id) => {
      setCollapsed(new Set());
      navigate(id);
      setEditor(null);
    });
  }

  const categoryOptions = (parentOnly = false) => categories.filter((item) => {
    if (!parentOnly) return true;
    const edited = editor?.category?.id;
    for (let node = item; node; node = categoryById.get(node.parent)) if (node.id === edited) return false;
    return true;
  }).map((item) => <option key={item.id} value={item.id}>{item.path}</option>);
  const isHidden = (item) => {
    for (let parent = categoryById.get(item.parent); parent; parent = categoryById.get(parent.parent)) {
      if (collapsed.has(parent.id)) return true;
    }
    return false;
  };
  const link = (key, name, icon, count, depth = 0, expandable = false) => <div key={key}
    className={'pl-nav-row' + (drop === key ? ' is-drop' : '')}
    style={{ '--pl-depth': Math.min(depth, 8) }}
    onDragOver={(event) => dragOver(event, ['all', 'recent'].includes(key) ? null : key)}
    onDrop={(event) => {
      if (key === 'all' || key === 'recent') {
        if (event.dataTransfer.types.includes('Files')) acceptDrop(event, null);
      } else acceptDrop(event, key);
    }}>
    {expandable && <button type="button" className={'pl-expand' + (collapsed.has(key) ? '' : ' is-open')}
      aria-expanded={!collapsed.has(key)} aria-label={(collapsed.has(key) ? '展开 ' : '收起 ') + name}
      onClick={() => setCollapsed((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      })}><Icon name="chevron" /></button>}
    <button type="button" className="pl-nav-button" aria-current={current === key ? 'page' : undefined}
      onClick={() => navigate(key)} title={name}>
      <Icon name={icon} /><span>{name}</span>{count != null && <small>{count}</small>}
    </button>
  </div>;

  const tagButtons = (paper) => (paper.tags || []).slice(0, 6).map((value) => <button type="button" key={value}
    className="pl-tag" title={value} onClick={() => setTag(value)}>{value}</button>);
  const openTitle = (paper) => <button type="button" className="pl-paper-title" onClick={() => onOpen(paper)}
    title={paperTitle(paper)}>{paperTitle(paper)}</button>;
  const selectPaper = (paper) => <input type="checkbox" checked={selected.has(paper.id)}
    aria-label={'选择 ' + paperTitle(paper)} onChange={() => togglePaper(paper.id)} />;
  const details = (paper) => <button type="button" className="pl-plain" title="论文详情"
    aria-label={'编辑 ' + paperTitle(paper)} onClick={(event) => showEditor({
      kind: 'details', paper, origin: { button: event.currentTarget, keyboard: !event.detail, running: detailMotion },
    })}>详情</button>;

  return <div className={'pl-home' + (drop === 'all' ? ' is-drop' : '')}
    onDragOver={(event) => dragOver(event, null)}
    onDrop={(event) => { if (event.dataTransfer.types.includes('Files')) acceptDrop(event, active?.id || null); }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDrop(null); }}
    onDragEnd={() => setDrop(null)}>
    <aside className="pl-sidebar" aria-label="论文分类">
      <div className="pl-brand">
        <img src={appIcon} alt="" width={29} height={29} />
        <span className="pl-wordmark" role="img" aria-label="CoReader" style={{ maskImage: 'url("' + wordmark + '")' }} />
      </div>
      <nav aria-label="论文视图">
        {link('all', scopes.all, 'all', data.papers.length)}
        {link('recent', scopes.recent, 'recent', recentCount)}
        {link('uncategorized', scopes.uncategorized, 'uncategorized', data.papers.filter((paper) => !paper.category).length)}
      </nav>
      <div className="pl-section-heading"><span>分类</span><button type="button" className="pl-icon" title="新建分类"
        aria-label="新建分类" onClick={() => showEditor({ kind: 'category', parent: active?.id || null })}><Icon name="folderPlus" /></button></div>
      <nav className="pl-folders" aria-label="自定义分类">
        {categories.filter((item) => !isHidden(item)).map((item) => link(item.id, item.name,
          'folder', categoryCount(item), item.depth, item.hasChildren))}
      </nav>
      <footer className="pl-sidebar-footer">
        <div className="pl-sidebar-actions" role="group" aria-label="导入论文">
          <button type="button" onClick={onOpenFile}>打开 PDF</button>
          <button type="button" className="pl-primary" disabled={Boolean(busy)} onClick={() => importFiles(null, active?.id || null)}>
            <Icon name="folderOpen" />{busy === 'import' ? '导入中…' : '从文件夹导入'}
          </button>
        </div>
        <div className="pl-sidebar-utility">
          <button type="button" onClick={onSettings}>设置</button>
          {version && <span title="当前版本">v{version}</span>}
        </div>
      </footer>
    </aside>
    <section className="pl-main" aria-label={title}>
      <header className="pl-masthead">
        <div className="pl-title"><h1 title={active?.path}>{title}</h1><span>{active ? categoryCount(active) : rootCount} 篇</span></div>
        {active && <button type="button" onClick={() => showEditor({ kind: 'category', category: active })}>管理分类</button>}
      </header>
      <div className="pl-controls">
        <label className="pl-search"><Icon name="search" /><input type="search" aria-label="搜索论文" placeholder="搜索标题、作者、标签…"
          value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select aria-label="标签筛选" value={tag} onChange={(event) => setTag(event.target.value)}>
          <option value="">全部标签</option>{tags.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="阅读状态" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">全部状态</option>{Object.entries(statuses).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select aria-label="论文排序" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="recent">最近打开</option><option value="title">标题顺序</option><option value="year">年份倒序</option>
        </select>
        <div className="pl-views" role="group" aria-label="论文显示方式">
          <button type="button" className="pl-view-button" aria-pressed={!gallery && layout === 'list'}
            onClick={(event) => selectViewMode('list', !event.detail)}>
            <Icon name="list" />列表
          </button>
          <button type="button" className="pl-view-button" aria-pressed={!gallery && layout === 'table'}
            onClick={(event) => selectViewMode('table', !event.detail)}>
            <Icon name="table" />表格
          </button>
          <button type="button" className="pl-view-button" aria-pressed={gallery} title="平铺显示论文首页"
            onClick={(event) => selectViewMode('gallery', !event.detail)}>
            <Icon name="gallery" />视图
          </button>
        </div>
      </div>
      {notice && <div className="pl-feedback" role="status">{notice}</div>}
      {(error && !editor || readerError) && <div className="pl-error pl-feedback" role="alert">{error && !editor ? error : readerError}</div>}
      {visible.length > 0 && <div className="pl-selection">
        <label><input type="checkbox" checked={picked.length === visible.length}
          ref={(node) => { if (node) node.indeterminate = picked.length > 0 && picked.length !== visible.length; }}
          onChange={(event) => setSelected(new Set(event.target.checked ? visible.map((paper) => paper.id) : []))} />全选</label>
        {picked.length > 0 && <><span>已选 {picked.length} 篇</span>
          <button type="button" disabled={Boolean(busy)} onClick={() => showEditor({ kind: 'move', ids: picked })}>分类到…</button>
          {active && <button type="button" disabled={Boolean(busy)} onClick={removeFromCategory}>移出分类</button>}</>}
      </div>}
      <div className="pl-results" ref={resultsRef} tabIndex={-1}>
        {busy === 'loading' && visible.length === 0 ? (
          <EmptySkeleton variant="library" rows={5} label="正在读取论文库…" />
        ) : loadFailed && visible.length === 0 ? (
          <EmptyState
            size="page"
            icon="alert"
            title="无法读取论文库"
            description="本地文献库暂时无法访问，原有论文文件未受影响。"
            primaryAction={{ label: '重试', variant: 'secondary', retry: true, spinning: busy === 'loading', onClick: loadPaperLibrary }}
          />
        ) : visible.length === 0 ? (query || tag || status ? (
          <EmptyState
            size="page"
            wireframe="search"
            live
            title={query.trim() ? '没有匹配「' + query.trim() + '」的论文' : '当前筛选下没有论文'}
            description="检查关键词拼写，或清除筛选条件查看全部论文。"
            primaryAction={{
              label: query.trim() && !tag && !status ? '清除搜索' : '清除筛选',
              variant: 'secondary',
              onClick: () => { setQuery(''); setTag(''); setStatus(''); },
            }}
            secondaryAction={active ? { label: '搜索全部论文', variant: 'ghost', onClick: () => selectScope('all') } : undefined}
          />
        ) : (
          <EmptyState
            size="page"
            wireframe="library"
            title={active ? '此分类还没有论文' : '还没有收录论文'}
            description={'将 PDF 拖到这里，或点击下方按钮导入第一篇文献' + (active ? '到当前分类' : '') + '。'}
            primaryAction={{ label: '导入 PDF', onClick: onOpenFile }}
            secondaryAction={{ label: '导入文件夹', variant: 'secondary', onClick: () => importFiles(null, active?.id || null) }}
          />
        )) : gallery ? <ul className="pl-gallery" style={{ '--pl-cover-width': coverWidth + 'px' }}>
          {visible.map((paper) => <li key={paper.id} draggable onDragStart={(event) => startDrag(event, paper)}>
            <PaperCover paper={paper} open={onOpen} onOpenCover={onOpenCover} onCoverReady={onCoverReady} />
            <div className="pl-gallery-caption">
              {openTitle(paper)}
              <div className="pl-gallery-actions">
                {selectPaper(paper)}
                <ReadingProgress paper={paper} indexedPages={indexedPages} />
                {details(paper)}
              </div>
            </div>
          </li>)}
        </ul> : layout === 'list' ? <ul className="pl-list">
          {visible.map((paper) => <li key={paper.id} draggable onDragStart={(event) => startDrag(event, paper)}>
            {selectPaper(paper)}
            <div className="pl-document-icon"><Icon name="paper" /></div>
            <div className="pl-paper-copy">
              {openTitle(paper)}
              <div className="pl-meta">{[paper.year, paper.venue, categoryById.get(paper.category)?.path]
                .filter(Boolean).join(' · ') || paper.name}</div>
              {paper.tags?.length > 0 && <div className="pl-tags">{tagButtons(paper)}</div>}
              <ReadingProgress paper={paper} indexedPages={indexedPages} />
            </div>
            <span className={'pl-state is-' + paperStatus(paper)}>{statuses[paperStatus(paper)]}</span>
            {details(paper)}
          </li>)}
        </ul> : <table className="pl-table">
          <colgroup>
            <col className="pl-col-select" /><col className="pl-col-title" /><col className="pl-col-authors" />
            <col className="pl-col-year" /><col className="pl-col-category" /><col className="pl-col-tags" />
            <col className="pl-col-status" /><col className="pl-col-progress" /><col className="pl-col-actions" />
          </colgroup>
          <thead><tr><th aria-label="选择" /><th><button type="button" onClick={() => setSort('title')}>标题</button></th>
            <th>作者</th><th><button type="button" onClick={() => setSort('year')}>年份</button></th>
            <th>分类</th><th>标签</th><th>状态</th><th>进度</th><th aria-label="操作" /></tr></thead>
          <tbody>{visible.map((paper) => <tr key={paper.id} draggable onDragStart={(event) => startDrag(event, paper)}>
            <td>{selectPaper(paper)}</td><td>{openTitle(paper)}</td>
            <td><span className="pl-table-authors" title={paper.authors || undefined}>{paper.authors || '—'}</span></td>
            <td>{paper.year || '—'}</td>
            <td>{categoryById.get(paper.category)?.path || '—'}</td>
            <td>{paper.tags?.length ? paper.tags.join('；') : '—'}</td>
            <td>{statuses[paperStatus(paper)]}</td>
            <td><ReadingProgress paper={paper} indexedPages={indexedPages} compact /></td>
            <td>{details(paper)}</td>
          </tr>)}</tbody>
        </table>}
      </div>
    </section>
    {editor && <LibraryDialog key={editor.kind + (editor.paper?.id || '')} tone={tone} busy={Boolean(busy)}
      details={editor.kind === 'details'} origin={editor.origin} issue={error} submit={submit}
      cancel={() => { setEditor(null); setError(''); }}
      title={editor.kind === 'details' ? '论文详情' : editor.kind === 'move' ? '分类论文' : editor.kind === 'remove' ? '删除分类'
        : editor.category ? '编辑分类' : '新建分类'}
      action={editor.kind === 'remove' ? '删除分类' : editor.kind === 'move' ? '确认分类' : '保存'}
      destructive={editor.kind === 'remove'}>
      {editor.kind === 'details' ? <>
        <div className="pl-fields pl-title-fields">
          <label>标题<input name="title" maxLength={400} defaultValue={paperTitle(editor.paper)} autoFocus required /></label>
          <label>作者<input name="authors" maxLength={600} defaultValue={editor.paper.authors} /></label>
        </div>
        <div className="pl-fields pl-publication-fields">
          <label>出处<input name="venue" maxLength={240} defaultValue={editor.paper.venue} /></label>
          <label>年份<input name="year" maxLength={12} defaultValue={editor.paper.year} /></label>
          <label>状态{readingProgress(editor.paper, indexedPages).completed
            ? <><input value={statuses.read} readOnly /><input type="hidden" name="status" value="read" /></>
            : <select name="status" defaultValue={paperStatus(editor.paper)}>{Object.entries(statuses)
                .map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}</label>
        </div>
        <div className="pl-fields">
          <label>DOI<input name="doi" maxLength={240} defaultValue={editor.paper.doi} /></label>
          <label>arXiv<input name="arxiv" maxLength={80} defaultValue={editor.paper.arxiv} /></label>
        </div>
        <PaperTagPicker catalog={tags} selected={editor.tags} onChange={updateDetailTags} onCreate={createTag} busy={Boolean(busy)} />
        <PaperAbstract paper={editor.paper} onSaved={rememberAbstractTranslation} />
      </> : editor.kind === 'move' ? <>
        <label>将 {editor.ids.length} 篇论文分类到<select name="category" defaultValue={active?.id || ''} autoFocus>
          <option value="">未分类</option>{categoryOptions()}
        </select></label>
      </> : editor.kind === 'remove' ? <p>删除「{editor.category.name}」及其子分类。论文和阅读记录会保留，所属论文归到上级分类。</p>
        : <>
          <label>分类名称<input name="name" required maxLength={80} defaultValue={editor.category?.name} autoFocus /></label>
          <label>上级分类<select name="parent" defaultValue={editor.category?.parent || editor.parent || ''}>
            <option value="">顶级分类</option>{categoryOptions(true)}
          </select></label>
          {editor.category && <button type="button" className="pl-remove-category"
            onClick={() => showEditor({ kind: 'remove', category: editor.category })}>删除分类…</button>}
        </>}
    </LibraryDialog>}
  </div>;
}
