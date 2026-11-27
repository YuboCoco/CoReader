import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animateSharedDialog } from './surface-motion.js';
import { connectionNames } from '../model-capabilities.mjs';
import { AccountCardRing } from './card-ring.jsx';
import chatgptIcon from '../../assets/providers/chatgpt.png';
import deepseekIcon from '../../assets/providers/deepseek.ico';
import kimiIcon from '../../assets/providers/kimi.png';
import workbuddyIcon from '../../assets/providers/workbuddy.svg';
import glmIcon from '../../assets/providers/glm.png';
import claudeIcon from '../../assets/providers/claude.png';
import arkIcon from '../../assets/providers/volcengine-ark.svg';

const providers = Object.keys(connectionNames).filter((provider) => provider !== 'kimi-code');
const icons = { chatgpt: chatgptIcon, deepseek: deepseekIcon, kimi: kimiIcon, glm: glmIcon, claude: claudeIcon, workbuddy: workbuddyIcon, doubao: arkIcon };
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

function KimiCodeDetails({ connection, onUpdate, onRefresh }) {
  const authorizing = useRef(false);
  const [flow, setFlow] = useState(null);
  const [pending, setPending] = useState('');
  const [problem, setProblem] = useState('');
  const api = window.reader;

  useEffect(() => () => {
    if (authorizing.current) {
      authorizing.current = false;
      api.kimiCodeLogin('cancel').catch(() => {});
    }
  }, [api]);

  async function receive(result) {
    if (!authorizing.current) return;
    if (result.status === 'pending') {
      setFlow(result);
      return;
    }
    authorizing.current = false;
    setFlow(null);
    setPending('');
    if (result.status === 'authenticated') await onRefresh('kimi-code', false);
    else if (result.status !== 'cancelled') setProblem(result.status === 'expired'
      ? '设备授权已过期，请重新登录。' : 'Kimi Code 未完成授权，请重新登录。');
  }

  useEffect(() => {
    if (!flow) return;
    let active = true;
    const remaining = Math.max(0, flow.expiresAt - Date.now());
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.kimiCodeLogin('poll');
        if (active) await receive(result);
      } catch (error) {
        if (!active) return;
        authorizing.current = false;
        setFlow(null);
        setPending('');
        setProblem(error.message);
        api.kimiCodeLogin('cancel').catch(() => {});
      }
    }, Math.min(remaining, flow.interval * 1000));
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [flow]);

  async function login() {
    setProblem('');
    setPending('login');
    authorizing.current = true;
    try {
      await receive(await api.kimiCodeLogin('begin'));
    } catch (error) {
      if (!authorizing.current) return;
      authorizing.current = false;
      setPending('');
      setProblem(error.message);
      api.kimiCodeLogin('cancel').catch(() => {});
    }
  }

  async function cancel() {
    authorizing.current = false;
    setFlow(null);
    setPending('cancel');
    setProblem('');
    try {
      await api.kimiCodeLogin('cancel');
    } catch (error) {
      setProblem(error.message);
    } finally {
      setPending('');
    }
  }

  async function changeConnection(action) {
    setProblem('');
    setPending('update');
    try {
      await action();
    } catch (error) {
      setProblem(error.message);
    } finally {
      setPending('');
    }
  }

  return <>
    <div className="connection-card-actions">
      {pending === 'login' ? <button type="button" onClick={cancel}>取消授权</button>
        : <>
          {!connection?.connected || connection.problem
            ? <button className="primary" type="button" disabled={!connection || Boolean(pending)} onClick={login}>
              {connection?.connected ? '重新登录 Kimi Code' : '登录 Kimi Code'}
            </button>
            : <button className="primary" type="button" disabled={Boolean(pending)}
              onClick={() => changeConnection(() => onRefresh('kimi-code'))}>刷新模型</button>}
          {connection?.connected && <button type="button" disabled={Boolean(pending)}
            onClick={() => changeConnection(() => onUpdate('kimi-code', { disconnect: true }))}>断开连接</button>}
        </>}
      <a href="https://www.kimi.com/code/docs/kimi-code-cli/guides/getting-started.html">Kimi Code CLI 安装指南 ↗</a>
    </div>
    {pending === 'login' && <p className="settings-note" role="status">{flow
      ? <>请在浏览器完成授权。{flow.userCode && <>设备码 <strong>{flow.userCode}</strong>　</>}
        <a href={flow.url}>打开授权页面 ↗</a></>
      : '正在启动 Kimi Code 授权…'}</p>}
    {problem && <p className="form-error" role="alert">{problem}</p>}
  </>;
}

function ProviderDetails({ provider, connection, onUpdate, onRefresh }) {
  const [endpoint, setEndpoint] = useState('');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState('');
  const connected = connection?.connected;
  const editingKey = !connected || editing;
  const doubao = provider === 'doubao';
  const custom = provider === 'compatible';
  const modelField = doubao || provider === 'glm';
  const glmKeysUrl = 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys';
  const arkKeysUrl = 'https://ark.volcengine.com/region:cn-beijing/apiKey';

  function clearForm() {
    setEndpoint('');
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
        onClick={() => run(() => connected ? onRefresh(provider) : onUpdate(provider, {}))}>{connected ? '刷新模型' : '检测 CodeBuddy CLI 账号'}</button>
      <a href="https://www.codebuddy.cn/docs/cli/quickstart">CodeBuddy CLI 登录指南 ↗</a>
      {connected && <button type="button" disabled={pending} onClick={() => run(() => onUpdate(provider, { disconnect: true }))}>断开连接</button>}
    </div> : editingKey ? <>
      {provider === 'claude' && <p className="connection-detail-intro">
        <a href={claudeKeysUrl}>在 Claude Console 创建 API Key ↗</a>
      </p>}
      {modelField && <p className="connection-detail-intro">
        <a href={doubao ? arkKeysUrl : glmKeysUrl}>{doubao ? '在火山方舟创建 API Key' : '在智谱开放平台创建 API Key'} ↗</a>
      </p>}
      <form className="connection-fields" onSubmit={(event) => {
        event.preventDefault();
        run(() => onUpdate(provider, { key, model, ...(custom ? { endpoint } : {}) }), true);
      }}>
        {custom && <label>API 地址
          <input type="url" required autoComplete="off" spellCheck={false} value={endpoint}
            placeholder="https://example.com/v1" disabled={pending} onChange={(event) => setEndpoint(event.target.value)} />
        </label>}
        <label>{custom ? 'API Key（可选）' : connectionNames[provider] + ' API Key'}
          <input type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)}
            placeholder={custom ? '留空表示不使用 API Key' : '输入 API Key'} disabled={pending} />
        </label>
        {(modelField || custom) && <label>{doubao ? 'Model ID 或推理接入点 ID（可选）' : custom ? '模型 ID（可选）' : 'GLM 模型 ID（可选）'}
          <input autoComplete="off" value={model} onChange={(event) => setModel(event.target.value)}
            placeholder={custom ? '留空读取模型目录' : doubao ? '留空读取火山方舟模型目录' : 'glm-5.3-flash'} disabled={pending} />
        </label>}
        <div className="connection-card-actions">
          <button className="primary" type="submit" disabled={!connection || pending || (custom ? !endpoint.trim() : !key.trim())}>
            {pending ? '正在验证…' : editing ? '验证并更新' : '验证并连接'}
          </button>
          {editing && <button type="button" disabled={pending} onClick={() => { clearForm(); setProblem(''); }}>取消</button>}
        </div>
      </form>
      {custom && <p className="settings-note">支持 OpenAI 兼容的 Chat Completions 接口。服务未提供模型目录时，请填写模型 ID。</p>}
      {doubao && <p className="settings-note">填写 ID 后会验证并使用该模型。留空时读取当前账号可见的豆包模型。</p>}
      {provider === 'glm' && <p className="settings-note">指定模型或目录不可用时，会发送一次简短请求验证模型。</p>}
    </> : <>
      {custom && <p className="settings-note connection-api-endpoint">{connection.endpoint}</p>}
      <div className="connection-card-actions">
      <button className="primary" type="button" disabled={pending} onClick={() => run(() => onRefresh(provider))}>刷新模型</button>
      <button type="button" disabled={pending} onClick={() => {
        if (custom) {
          setEndpoint(connection.endpoint || '');
          setModel(connection.verifiedModel || '');
        }
        setProblem('');
        setEditing(true);
      }}>{modelField || custom ? '修改 API 配置' : '更换密钥'}</button>
      <button type="button" disabled={pending} onClick={() => run(() => onUpdate(provider, { disconnect: true }), true)}>断开连接</button>
      {provider === 'claude' && <a href="https://platform.claude.com/usage">查看控制台用量 ↗</a>}
      {modelField && <a href={doubao ? arkKeysUrl : glmKeysUrl}>{doubao ? '火山方舟' : '智谱开放平台'} ↗</a>}
      </div>
    </>}
    {problem && <p className="form-error" role="alert">{problem}</p>}
  </>;
}

function KimiDetails({ connection, codeConnection, usage, onRefresh, onUpdate }) {
  const [mode, setMode] = useState(() => codeConnection?.connected && !connection?.connected ? 'kimi-code' : 'kimi');
  const modes = [
    { id: 'kimi', label: 'Kimi API', panelId: 'kimi-api-panel' },
    { id: 'kimi-code', label: 'Kimi Code', panelId: 'kimi-code-panel' },
  ];

  function onTabKeyDown(event, index) {
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = (index + 1) % modes.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = modes.length - 1;
    if (next < 0) return;
    event.preventDefault();
    setMode(modes[next].id);
    event.currentTarget.parentElement?.children[next]?.focus();
  }

  return <>
    <div className="kimi-connection-tabs" role="tablist" aria-label="Kimi 接入方式">
      {modes.map((item, index) => {
        const selected = mode === item.id;
        return <button key={item.id} id={'kimi-tab-' + item.id} type="button" role="tab"
          aria-selected={selected} aria-controls={item.panelId} tabIndex={selected ? 0 : -1}
          onClick={() => setMode(item.id)} onKeyDown={(event) => onTabKeyDown(event, index)}>
          {item.label}
        </button>;
      })}
    </div>
    <div id="kimi-api-panel" role="tabpanel" aria-labelledby="kimi-tab-kimi" className="kimi-connection-panel" hidden={mode !== 'kimi'}>
      <ProviderDetails provider="kimi" connection={connection} onUpdate={onUpdate} onRefresh={onRefresh} />
      <UsageDetails provider="kimi" usage={usage} />
      {connection?.problem && <p className="form-error" role="alert">{connection.problem}</p>}
    </div>
    <div id="kimi-code-panel" role="tabpanel" aria-labelledby="kimi-tab-kimi-code" className="kimi-connection-panel" hidden={mode !== 'kimi-code'}>
      <KimiCodeDetails connection={codeConnection} onUpdate={onUpdate} onRefresh={onRefresh} />
      {codeConnection?.problem && <p className="form-error" role="alert">{codeConnection.problem}</p>}
    </div>
  </>;
}

function ConnectionIcon({ provider }) {
  if (provider === 'compatible') return <span className="connection-icon connection-code-icon" aria-hidden="true">{'</>'}</span>;
  return <img className="connection-icon" src={icons[provider]} alt="" draggable={false} />;
}

function AccountDetails({ provider, connection, codeConnection, usage, chatgpt, onRefresh, onUpdate, onClose, origin }) {
  const modal = useRef(null);
  const name = connectionNames[provider];

  useLayoutEffect(() => {
    const dialog = modal.current;
    dialog.showModal();
    const source = origin.current?.button;
    const from = [source?.querySelector('.connection-icon'), source?.querySelector('.connection-identity strong')];
    const to = [dialog.querySelector('.connection-icon'), dialog.querySelector('.connection-motion-name')];
    const trigger = origin.current;
    const stop = animateSharedDialog(dialog, source, from, to, trigger?.keyboard, false, trigger?.frame);
    if (trigger) trigger.stop = stop;
    return () => {
      stop?.();
      if (dialog.open) dialog.close();
    };
  }, [origin]);

  function close() {
    if (provider === 'chatgpt' && chatgpt.pending === 'login') chatgpt.onCancel();
    const dialog = modal.current;
    const trigger = origin.current;
    const source = trigger?.button;
    if (source?.isConnected) {
      const previous = trigger.stop?.capture();
      trigger.stop?.();
      trigger.stop = animateSharedDialog(dialog, source,
        [source.querySelector('.connection-icon'), source.querySelector('.connection-identity strong')],
        [dialog.querySelector('.connection-icon'), dialog.querySelector('.connection-motion-name')], trigger.keyboard, true, previous);
    }
    dialog.close();
    onClose();
  }

  return <dialog ref={modal} className="settings connection-detail" aria-labelledby="connection-detail-title"
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); close(); }}>
    <header className="connection-detail-header">
      <ConnectionIcon provider={provider} />
      <h3 id="connection-detail-title"><span className="connection-motion-name">{name}</span> 连接设置</h3>
      <button type="button" className="quiet connection-detail-close" aria-label="关闭连接设置" onClick={close}>×</button>
    </header>
    <div className="connection-detail-body">
      {provider === 'kimi' ? <KimiDetails connection={connection} codeConnection={codeConnection} usage={usage}
        onUpdate={onUpdate} onRefresh={onRefresh} /> : <>
        {provider === 'chatgpt' ? <ChatGPTDetails {...chatgpt} onRefresh={() => onRefresh(provider)} />
          : <ProviderDetails provider={provider} connection={connection} onUpdate={onUpdate} onRefresh={onRefresh} />}
        <UsageDetails usage={usage} provider={provider} />
        {connection?.problem && <p className="form-error" role="alert">{connection.problem}</p>}
      </>}
    </div>
  </dialog>;
}

function ActiveAccountDetails({ provider, connection, codeConnection, chatgpt, onClose, onUpdate, onRefresh }) {
  const usage = useUsage(provider, connection, true);
  const origin = useRef(null);
  return <AccountDetails provider={provider} connection={connection} codeConnection={codeConnection} usage={usage}
    chatgpt={chatgpt} origin={origin} onRefresh={onRefresh} onUpdate={onUpdate} onClose={onClose} />;
}

export function AccountConnections({ connections, chatgpt, onUpdate, onRefresh }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [details, setDetails] = useState('');
  const ringRef = useRef(null);

  const ringItems = useMemo(() => providers.map((provider) => {
    const connection = connections[provider];
    const codeConnection = provider === 'kimi' ? connections['kimi-code'] : undefined;
    const count = (connection?.models?.length || 0) + (codeConnection?.models?.length || 0);
    const hasProblem = connection?.problem || codeConnection?.problem;
    const connected = Boolean(connection?.connected || codeConnection?.connected);
    const checked = Boolean(connection && (provider !== 'kimi' || codeConnection));
    const badge = count ? '已连接' : hasProblem ? '连接异常' : connected ? '暂无模型' : checked ? '未连接' : '检查中';
    const subtitle = count ? count + ' 个可用模型' : hasProblem ? '点击检查配置' : '点击卡片管理连接';
    return {
      provider,
      name: connectionNames[provider],
      icon: icons[provider] || '',
      connected: count > 0 || connected,
      badge,
      subtitle,
    };
  }), [connections]);

  const activeProvider = providers[activeIndex] || providers[0];

  return <section className="model-connections" aria-labelledby="model-connections-title">
    <div className="model-section-title"><h3 id="model-connections-title">账号连接</h3></div>

    <AccountCardRing
      ref={ringRef}
      items={ringItems}
      onFrontChange={(cardIndex) => setActiveIndex(cardIndex % providers.length)}
      onCardActivate={(item) => {
        if (item?.provider) setDetails(item.provider);
      }}
    />

    <span className="connection-announcement" role="status">
      {connectionNames[activeProvider]} · {activeIndex + 1} / {providers.length}
    </span>

    {details && <ActiveAccountDetails
      provider={details}
      connection={connections[details]}
      codeConnection={details === 'kimi' ? connections['kimi-code'] : undefined}
      chatgpt={chatgpt}
      onClose={() => setDetails('')}
      onUpdate={onUpdate}
      onRefresh={onRefresh}
    />}
  </section>;
}
