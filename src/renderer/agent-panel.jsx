import React, { useEffect, useId, useRef, useState } from 'react';
import { readingAgentLimits } from '../reading-agent.mjs';
import { availableEfforts, effortLabels } from '../model-capabilities.mjs';
import './agent-panel.css';

const api = window.reader;
const phases = {
  indexing: '正在读取 PDF 文字…',
  planning: '正在确定检索方向…',
  reading: '正在匹配原文片段…',
  answering: '正在回答…',
  stopping: '正在停止…',
};

function pageLabel(source) {
  if (!source.page) return '选段';
  return source.end > source.page ? '第 ' + source.page + '–' + source.end + ' 页' : '第 ' + source.page + ' 页';
}

function SourceButton({ source, onJump, inline = false }) {
  const label = pageLabel(source);
  return source.page ? <button type="button" className={'elr-agent-cite' + (inline ? ' inline' : '')}
    title={source.text} aria-label={'跳到' + label + ' ' + (source.id || '')}
    onClick={() => onJump(source)}>{label}{!inline && source.id ? ' · ' + source.id : ''}</button>
    : <span className="elr-agent-source-tag" title={source.text}>{label}{source.id ? ' · ' + source.id : ''}</span>;
}

function Answer({ turn, onJump, renderAnswer }) {
  const cited = turn.sources.some((source) => source.cited);
  const shown = cited ? turn.sources.filter((source) => source.cited) : turn.sources;
  const renderSource = (id, key) => {
    const source = turn.sources.find((item) => item.id === id && item.cited);
    return source ? <SourceButton key={key} source={source} onJump={onJump} inline /> : null;
  };
  return <section className="elr-agent-answer">
    <div className="elr-agent-meta">{turn.metadata?.modelName || turn.metadata?.model || 'Agent'}
      {turn.metadata?.reasoningEffort ? ' · ' + turn.metadata.reasoningEffort : ''}
      {turn.scope === 'paper' ? ' · 全文检索' : ' · 当前页'}</div>
    <div className="elr-markdown">{renderAnswer(turn.text, renderSource)}</div>
    {shown.length > 0 && <details className="elr-agent-sources">
      <summary>{cited ? '回答引用' : '查阅的原文'} · {shown.length}</summary>
      {shown.map((source) => <div key={source.id} className="elr-agent-source">
        <SourceButton source={source} onJump={onJump} />
        <p>{source.text}</p>
      </div>)}
    </details>}
    {turn.scope === 'paper' && turn.indexedPages < turn.pageCount &&
      <div className="elr-agent-meta">已检索 {turn.indexedPages} / {turn.pageCount} 页</div>}
  </section>;
}

function QuoteList({ quotes, onJump, onRemove }) {
  return <ul className="elr-agent-quotes" aria-label="引用选段">
    {quotes.map((quote, index) => <li key={index}>
      <SourceButton source={quote} onJump={onJump} />
      <span title={quote.text}>{quote.text}</span>
      {onRemove && <button type="button" className="elr-agent-remove" aria-label={'移除选段 ' + (index + 1)}
        onClick={() => onRemove(index)}>×</button>}
    </li>)}
  </ul>;
}

function AgentModelMenu({ providers, model, entry, custom, onChange, onSettings }) {
  const id = useId();
  const menu = useRef(null);
  const efforts = availableEfforts(model.provider, entry?.id, entry);
  const levels = ['default', ...efforts.ids];
  const level = Math.max(0, levels.indexOf(model.reasoningEffort));
  const effort = levels[level];
  const strengthLabel = effort === 'default' && efforts.defaultId
    ? '默认（' + effortLabels[efforts.defaultId] + '）' : effortLabels[effort];
  const modelName = entry?.name || '选择模型';

  return <>
    <button type="button" className="elr-btn elr-agent-model-trigger" popoverTarget={id} aria-haspopup="dialog"
      title={modelName + (entry ? ' · ' + effortLabels[effort] : '')} aria-label={'Agent 模型：' + modelName}>
      <span>{modelName}</span><i aria-hidden="true" />
    </button>
    <div id={id} ref={menu} popover="auto" role="dialog" aria-label="阅读助手模型" className="elr-agent-model-menu">
      {providers?.length ? <>
        <div className="elr-agent-model-choice">
          <span aria-hidden="true">{modelName}<i /></span>
          <select aria-label="模型" value={custom ? model.provider + ':' + model.model : ''}
            onChange={(event) => {
              const key = event.target.value;
              if (!key) { onChange(null); return; }
              const divider = key.indexOf(':');
              onChange({ provider: key.slice(0, divider), model: key.slice(divider + 1), reasoningEffort: 'default' });
            }}>
            <option value="">跟随问答设置</option>
            {providers.map(({ id, name, models }) => <optgroup key={id} label={name}>
              {models.map((item) => <option value={id + ':' + item.id} key={item.id}>{item.name || item.id}</option>)}
            </optgroup>)}
          </select>
        </div>
        {entry && <div className="elr-agent-strength">
          <div className="elr-agent-strength-value"><span>推理强度</span><strong>{strengthLabel}</strong></div>
          {efforts.ids.length > 0 && <div className="elr-agent-strength-track"
            style={{ '--elr-strength': (level * 100 / efforts.ids.length) + '%' }}>
            <div className="elr-agent-strength-marks" aria-hidden="true">{levels.map((value) => <span key={value} />)}</div>
            <input type="range" min="0" max={efforts.ids.length} step="1" value={level}
              aria-label="推理强度" aria-valuetext={strengthLabel}
              onChange={(event) => onChange({ provider: model.provider, model: model.model,
                reasoningEffort: levels[Number(event.target.value)] })} />
          </div>}
        </div>}
      </> : <p>{providers ? '请先连接模型服务商。' : '正在读取可用模型…'}</p>}
      <button type="button" className="elr-btn" onClick={() => { menu.current.hidePopover(); onSettings(); }}>
        管理模型与账号
      </button>
    </div>
  </>;
}

export function AgentPanel({ active, paper, page, ready, incoming, readPages, providers, defaultModel,
  modelPreference, onModelChange, onModelSettings, onJump, renderAnswer }) {
  const [turns, setTurns] = useState(null);
  const [retryLoad, setRetryLoad] = useState(0);
  const [question, setQuestion] = useState('');
  const [scope, setScope] = useState('paper');
  const [quotes, setQuotes] = useState([]);
  const [pending, setPending] = useState(null);
  const [issue, setIssue] = useState('');
  const conversation = useRef(null);
  const follow = useRef(true);
  const running = useRef(null);
  const lastIncoming = useRef(null);
  const findModel = (model) => providers?.find((provider) => provider.id === model?.provider)?.models
    .find((entry) => entry.id === model?.model);
  const override = findModel(modelPreference);
  const model = override ? modelPreference : defaultModel;
  const modelEntry = override || findModel(defaultModel);
  const canSend = ready && turns !== null && !pending && Boolean(modelEntry);

  useEffect(() => {
    if (!active || turns !== null) return;
    let alive = true;
    api.agentHistory(paper).then((history) => {
      if (alive) setTurns(history);
    }).catch((error) => {
      if (alive) setIssue(error.message || '读取 Agent 对话失败。');
    });
    return () => { alive = false; };
  }, [active, paper, retryLoad, turns]);

  useEffect(() => {
    if (!incoming || incoming.paper !== paper || lastIncoming.current === incoming) return;
    lastIncoming.current = incoming;
    setQuotes((previous) => {
      const next = [...previous];
      for (const quote of incoming.quotes) {
        if (next.length >= readingAgentLimits.maxQuotes) break;
        if (!next.some((item) => item.text === quote.text && item.page === quote.page && item.end === quote.end)) next.push(quote);
      }
      return next;
    });
  }, [incoming, paper]);

  useEffect(() => {
    const unsubscribe = api.onAgentProgress(({ request, phase, text }) => {
      if (running.current?.id !== request || running.current.controller.signal.aborted) return;
      setPending((previous) => previous?.id === request ? { ...previous, phase, text: text || previous.text } : previous);
    });
    return () => {
      unsubscribe();
      const job = running.current;
      running.current = null;
      if (job) {
        job.controller.abort();
        api.cancelJob(job.id).catch(() => {});
      }
    };
  }, [paper]);

  useEffect(() => {
    const feed = conversation.current;
    if (feed && active && follow.current) feed.scrollTop = feed.scrollHeight;
  }, [active, turns, pending]);

  const stop = () => {
    const job = running.current;
    if (!job) return;
    job.controller.abort();
    setPending((previous) => ({ ...previous, phase: 'stopping' }));
    api.cancelJob(job.id).catch(() => {});
  };

  async function ask(value, selectedScope) {
    const command = value.trim();
    if (!canSend || !command || running.current) return;
    const controller = new AbortController();
    const job = { id: crypto.randomUUID(), controller };
    running.current = job;
    const attached = [...quotes];
    setIssue('');
    follow.current = true;
    setPending({ id: job.id, phase: 'indexing', question: command, text: '' });
    try {
      const source = await readPages(selectedScope, page, controller.signal);
      controller.signal.throwIfAborted();
      const response = await api.readerRequest('/agent', {
        ...model, ...source, paper, request: job.id, page, scope: selectedScope, question: command, quotes: attached,
      });
      controller.signal.throwIfAborted();
      if (!response.ok) throw new Error(response.error || 'Agent 问答失败。');
      if (running.current !== job) return;
      setTurns((previous) => [...previous, response.turn]);
      setQuotes((previous) => previous.filter((quote) => !attached.includes(quote)));
      setQuestion((previous) => previous.trim() === command ? '' : previous);
    } catch (error) {
      if (running.current === job && !controller.signal.aborted) setIssue(error.message || 'Agent 问答失败。');
    } finally {
      if (running.current === job) {
        running.current = null;
        setPending(null);
      }
    }
  }

  const send = (event) => { event.preventDefault(); ask(question, scope); };
  return <section className="elr-agent-slot" hidden={!active} aria-label="阅读助手">
    <div className="elr-agent-feed" ref={conversation}
      onScroll={(event) => {
        const feed = event.currentTarget;
        follow.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 72;
      }}>
      {turns?.length === 0 && !pending && <div className="elr-agent-empty">
        <p>围绕当前论文提问，或从选区加入原文。回答中的页码可跳回 PDF。</p>
      </div>}
      {turns === null && !issue && <p className="elr-agent-meta">正在读取对话…</p>}
      {turns?.map((turn) => <article className="elr-agent-turn" key={turn.id}>
        <div className="elr-agent-question">{turn.question}</div>
        {turn.quotes.length > 0 && <details className="elr-agent-sources elr-agent-sent-quotes">
          <summary>提问选段 · {turn.quotes.length}</summary>
          <QuoteList quotes={turn.quotes} onJump={onJump} />
        </details>}
        <Answer turn={turn} onJump={onJump} renderAnswer={renderAnswer} />
      </article>)}
      {pending && <article className="elr-agent-turn" aria-busy="true">
        <div className="elr-agent-question">{pending.question}</div>
        <div className="elr-agent-meta" role="status">{phases[pending.phase]}</div>
        {pending.text && <div className="elr-agent-stream">{pending.text}</div>}
      </article>}
      {issue && <div className="elr-agent-error" role="alert">
        {issue}
        {turns === null && <button type="button" className="elr-btn" onClick={() => { setIssue(''); setRetryLoad((attempt) => attempt + 1); }}>重试</button>}
      </div>}
    </div>
    <form className="elr-agent-compose" onSubmit={send}>
      {quotes.length > 0 && <QuoteList quotes={quotes} onJump={onJump}
        onRemove={(index) => setQuotes((previous) => previous.filter((_, i) => i !== index))} />}
      <textarea value={question} maxLength={readingAgentLimits.maxQuestionChars} rows={2}
        aria-label="向论文提问" placeholder="例如，这篇论文怎样验证方法有效？"
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
            event.preventDefault();
            ask(question, scope);
          }
        }} />
      <div className="elr-agent-actions">
        <select aria-label="检索范围" value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="paper">全文检索</option>
          <option value="page">当前页</option>
        </select>
        <button type="button" className="elr-btn" disabled={!canSend}
          onClick={() => ask('请总结当前页的主要内容，并保留关键术语和数据。', 'page')}>总结本页</button>
        <div className="elr-agent-send">
          <AgentModelMenu providers={providers} model={model} entry={modelEntry} custom={Boolean(override)}
            onChange={onModelChange} onSettings={onModelSettings} />
          {pending ? <button type="button" className="elr-btn" disabled={pending.phase === 'stopping'} onClick={stop}>停止</button>
            : <button type="submit" className="elr-btn primary" disabled={!canSend || !question.trim()}>发送</button>}
        </div>
      </div>
    </form>
  </section>;
}
