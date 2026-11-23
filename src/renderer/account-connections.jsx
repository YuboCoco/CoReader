import React, { useEffect, useRef, useState } from 'react';
import { connectionNames } from '../model-capabilities.mjs';
import chatgptIcon from '../../assets/providers/chatgpt.png';
import deepseekIcon from '../../assets/providers/deepseek.ico';
import kimiIcon from '../../assets/providers/kimi.png';
import workbuddyIcon from '../../assets/providers/workbuddy.svg';
import glmIcon from '../../assets/providers/glm.png';
import claudeIcon from '../../assets/providers/claude.png';

const providers = Object.keys(connectionNames);
const icons = { chatgpt: chatgptIcon, deepseek: deepseekIcon, kimi: kimiIcon, glm: glmIcon, claude: claudeIcon, workbuddy: workbuddyIcon };
const usageProviders = ['deepseek', 'kimi', 'claude'];
const clock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const chatgptUsageUrl = 'https://chatgpt.com/settings/usage';
const claudeKeysUrl = 'https://platform.claude.com/settings/keys';

function useUsage(provider, connection, active) {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const requested = useRef(false);
  const supported = usageProviders.includes(provider) && Boolean(connection?.connected);

  useEffect(() => {
    if (!active || !supported) return;
    let current = true;
    setSnapshot((previous) => ({
      connection, data: previous?.connection === connection ? previous.data : null, pending: true,
    }));
    const force = requested.current;
    requested.current = false;
    window.reader.modelUsage(provider, force).then((data) => {
      if (current) setSnapshot({ connection, data });
    }, (error) => {
      if (current) setSnapshot({ connection, problem: error.message });
    });
    return () => { current = false; };
  }, [active, connection, provider, revision, supported]);

  if (!supported) return null;
  const status = snapshot?.connection === connection ? snapshot : null;
  const data = status?.data;
  const limits = data?.requests || data?.tokens;
  const amount = limits ? limits.remaining.toLocaleString('zh-CN') + ' / ' + limits.total.toLocaleString('zh-CN')
    + (data.requests ? ' 次请求' : ' tokens')
    : data?.balances?.map(({ currency, total }) => (currency === 'USD' ? 'US$' : '¥') + total).join(' · ');
  return {
    amount,
    label: provider === 'claude' ? '限流余量' : 'API 余额',
    updated: data?.checkedAt,
    reset: limits?.resetsAt,
    pending: !status || status.pending,
    problem: status?.problem,
    refresh() {
      requested.current = true;
      setRevision((previous) => previous + 1);
    },
  };
}

function UsageDetails({ usage, provider }) {
  if (!usage) return null;
  return <div className="connection-usage">
    <div role="status">
      <span className="usage-label">{provider === 'claude' ? '最近请求的限流余量' : 'API 可用余额'}</span>
      {usage.amount ? <strong>{usage.amount}</strong> : <span>{usage.pending ? '读取中…' : usage.problem
        || (provider === 'claude' ? '发起一次模型请求后可查看' : '暂未返回余额')}</span>}
      {usage.updated && <span className="usage-timestamp">
        {clock.format(usage.updated)} {usage.reset ? '读取 · ' + clock.format(usage.reset) + ' 重置' : '更新'}
      </span>}
    </div>
    <button type="button" disabled={usage.pending} onClick={usage.refresh}>刷新用量</button>
  </div>;
}

function ChatGPTDetails({ account, pending, problem, onLogin, onCancel, onSelect, onSignOut, onRefresh }) {
  const current = account?.accounts.find((entry) => entry.client === account.active);
  return <>
    {account?.accounts.length > 0 && <label>当前账号
      <select aria-label="ChatGPT 账号" value={account.active} disabled={Boolean(pending)} onChange={(event) => onSelect(event.target.value)}>
        {account.accounts.map((item, index) => <option key={item.client} value={item.client}>{item.email || '账号'} · {index + 1}</option>)}
      </select>
    </label>}
    <div className="connection-card-actions">
      {pending === 'login' ? <button type="button" onClick={onCancel}>取消授权</button>
        : account?.connected ? <>
          <button className="primary" type="button" disabled={Boolean(pending)} onClick={onRefresh}>刷新模型</button>
          <button type="button" disabled={Boolean(pending)} onClick={() => onLogin(account.active)}>重新授权</button>
          <button type="button" disabled={Boolean(pending)} onClick={onSignOut}>断开连接</button>
        </> : <button className="primary" type="button" disabled={!account || Boolean(pending)} onClick={() => onLogin(account.active || undefined)}>
          {current ? '允许使用订阅' : '连接 ChatGPT'}
        </button>}
      {current && <button type="button" disabled={Boolean(pending)} onClick={() => onLogin()}>添加账号</button>}
      {account?.connected && <a href={chatgptUsageUrl}>查看 ChatGPT 用量 ↗</a>}
    </div>
    {pending === 'login' && <p className="settings-note" role="status">请在系统浏览器完成授权。</p>}
    {problem && <p className={problem.error ? 'form-error' : 'settings-note'} role={problem.error ? 'alert' : 'status'}>{problem.text}</p>}
  </>;
}

function ProviderDetails({ provider, connection, onUpdate, onRefresh }) {
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState('');
  const connected = connection?.connected;
  const editingKey = !connected || editing;

  function clearForm() {
    setKey('');
    setModel('');
    setEditing(false);
  }

  async function run(action, clear = false) {
    setPending(true);
    setProblem('');
    try {
      await action();
      if (clear) clearForm();
    } catch (error) {
      setProblem(error.message);
    } finally {
      setPending(false);
    }
  }

  return <>
    {provider === 'workbuddy' ? <div className="connection-card-actions">
      <button className="primary" type="button" disabled={pending || !connection}
        onClick={() => run(() => connected ? onRefresh(provider) : onUpdate(provider, {}))}>{connected ? '刷新模型' : '检测本机账号'}</button>
      <a href="https://www.codebuddy.cn/docs/cli/quickstart">CLI 登录指南 ↗</a>
      {connected && <button type="button" disabled={pending} onClick={() => run(() => onUpdate(provider, { disconnect: true }))}>断开连接</button>}
    </div> : editingKey ? <>
      {provider === 'claude' && <p className="connection-detail-intro">
        <a href={claudeKeysUrl}>在 Claude Console 创建 API Key ↗</a>
      </p>}
      <form className="connection-fields" onSubmit={(event) => {
        event.preventDefault();
        run(() => onUpdate(provider, { key, model }), true);
      }}>
        <label>{connectionNames[provider]} API Key
          <input type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)}
            placeholder="输入 API Key" disabled={pending} />
        </label>
        {provider === 'glm' && <label>GLM 模型 ID（可选）
          <input autoComplete="off" value={model} onChange={(event) => setModel(event.target.value)}
            placeholder="glm-5.3-flash" disabled={pending} />
        </label>}
        <div className="connection-card-actions">
          <button className="primary" type="submit" disabled={!connection || pending || !key.trim()}>
            {pending ? '正在验证…' : editing ? '验证并更新' : '验证并连接'}
          </button>
          {editing && <button type="button" disabled={pending} onClick={() => { clearForm(); setProblem(''); }}>取消</button>}
        </div>
      </form>
      {provider === 'glm' && <p className="settings-note">指定模型或目录不可用时，会发送一次简短请求验证模型。</p>}
    </> : <div className="connection-card-actions">
      <button className="primary" type="button" disabled={pending} onClick={() => run(() => onRefresh(provider))}>刷新模型</button>
      <button type="button" disabled={pending} onClick={() => { setProblem(''); setEditing(true); }}>更换密钥</button>
      <button type="button" disabled={pending} onClick={() => run(() => onUpdate(provider, { disconnect: true }), true)}>断开连接</button>
      {provider === 'claude' && <a href="https://platform.claude.com/usage">查看控制台用量 ↗</a>}
      {provider === 'glm' && <a href="https://bigmodel.cn/">智谱开放平台 ↗</a>}
    </div>}
    {problem && <p className="form-error" role="alert">{problem}</p>}
  </>;
}

function AccountDetails({ provider, connection, usage, chatgpt, onRefresh, onUpdate, onClose }) {
  const modal = useRef(null);
  const name = connectionNames[provider];

  useEffect(() => {
    const dialog = modal.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  function close() {
    if (provider === 'chatgpt' && chatgpt.pending === 'login') chatgpt.onCancel();
    modal.current.close();
    onClose();
  }

  return <dialog ref={modal} className="settings connection-detail" aria-labelledby="connection-detail-title"
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); close(); }}>
    <header className="connection-detail-header">
      <img className="connection-icon" src={icons[provider]} alt="" draggable={false} />
      <h3 id="connection-detail-title">{name} 连接设置</h3>
      <button type="button" className="quiet connection-detail-close" aria-label="关闭连接设置" onClick={close}>×</button>
    </header>
    <div className="connection-detail-body">
      {provider === 'chatgpt' ? <ChatGPTDetails {...chatgpt} onRefresh={() => onRefresh(provider)} />
        : <ProviderDetails provider={provider} connection={connection} onUpdate={onUpdate} onRefresh={onRefresh} />}
      <UsageDetails usage={usage} provider={provider} />
      {connection?.problem && <p className="form-error" role="alert">{connection.problem}</p>}
    </div>
  </dialog>;
}

function ConnectionCard({ provider, connection, active, open, chatgpt, onOpen, onClose, onUpdate, onRefresh }) {
  const usage = useUsage(provider, connection, active);
  const name = connectionNames[provider];
  const count = connection?.models?.length || 0;
  const state = count ? '已连接 · ' + count + ' 个模型' : connection?.problem ? '连接异常'
    : connection?.connected ? '暂无可用模型' : connection ? '未连接' : '正在检查';
  return <>
    <button className="connection-card" type="button" data-connected={count > 0}
      aria-label={'管理 ' + name + ' 连接'} aria-describedby={'connection-status-' + provider} aria-haspopup="dialog" onClick={onOpen}>
      <img className="connection-icon" src={icons[provider]} alt="" draggable={false} />
      <span className="connection-identity">
        <strong>{name}</strong>
        <span className="connection-status" id={'connection-status-' + provider}>{state}</span>
      </span>
      {usage?.amount && <span className="connection-usage-summary" title={usage.label + ' ' + usage.amount}>
        <span>{usage.label}</span><strong>{usage.amount}</strong>
      </span>}
      <span className="connection-card-chevron" aria-hidden="true" />
    </button>
    {open && <AccountDetails provider={provider} connection={connection} usage={usage} chatgpt={chatgpt}
      onRefresh={onRefresh} onUpdate={onUpdate} onClose={onClose} />}
  </>;
}

export function AccountConnections({ connections, chatgpt, onUpdate, onRefresh }) {
  const [slide, setSlide] = useState({ index: 0, previous: -1, direction: 1 });
  const [details, setDetails] = useState('');

  function move(direction) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSlide((current) => ({
      index: (current.index + direction + providers.length) % providers.length,
      previous: reducedMotion ? -1 : current.index,
      direction,
    }));
  }

  function navigate(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  }

  return <section className="model-connections" aria-labelledby="model-connections-title">
    <div className="model-section-title"><h3 id="model-connections-title">账号连接</h3></div>
    <div className="connection-carousel" role="group" aria-label="切换账号卡片">
      <button type="button" className="connection-arrow" data-direction="previous" aria-label="上一个账号卡片"
        aria-controls="connection-cards" onClick={() => move(-1)} onKeyDown={navigate} />
      <div className="connection-viewport" id="connection-cards" style={{ '--connection-shift': slide.direction * 100 + '%' }}>
        {providers.map((provider, position) => {
          const active = position === slide.index;
          const outgoing = position === slide.previous;
          const motion = outgoing ? 'outgoing' : active && slide.previous >= 0 ? 'incoming' : undefined;
          return <div className="connection-slide" id={'connection-' + provider} key={provider}
            hidden={!active && !outgoing} inert={!active} aria-hidden={!active} data-motion={motion}
            onAnimationEnd={outgoing ? (event) => {
              if (event.target !== event.currentTarget) return;
              setSlide((current) => current.previous === position ? { ...current, previous: -1 } : current);
            } : undefined}>
            <ConnectionCard provider={provider} connection={connections[provider]} active={active} open={details === provider}
              chatgpt={chatgpt} onOpen={() => setDetails(provider)} onClose={() => setDetails('')}
              onUpdate={onUpdate} onRefresh={onRefresh} />
          </div>;
        })}
      </div>
      <button type="button" className="connection-arrow" data-direction="next" aria-label="下一个账号卡片"
        aria-controls="connection-cards" onClick={() => move(1)} onKeyDown={navigate} />
    </div>
    <div className="connection-pagination" aria-hidden="true">
      {providers.map((provider, position) => <span key={provider} data-active={position === slide.index} />)}
    </div>
    <span className="connection-announcement" role="status">
      {connectionNames[providers[slide.index]]} · {slide.index + 1} / {providers.length}
    </span>
  </section>;
}
