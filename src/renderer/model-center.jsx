import React, { useEffect, useRef, useState } from 'react';
import { connectionNames } from '../model-capabilities.mjs';
import { AccountConnections } from './account-connections.jsx';
import { ModelSettings } from './settings.jsx';
import { readReaderSettings, writeReaderSettings } from './reader-view.js';

const api = window.reader;

export function ModelCenter({ version, availableUpdate, onClose, onSave, onConnectionsChange }) {
  const dialog = useRef(null);
  const mounted = useRef(false);
  const connectionUpdates = useRef({});
  const [value, setValue] = useState(null);
  const [problem, setProblem] = useState('');
  const [connections, setConnections] = useState({});
  const [account, setAccount] = useState(null);
  const [accountPending, setAccountPending] = useState('');
  const [accountProblem, setAccountProblem] = useState(null);
  const [updating, setUpdating] = useState(0);
  const [tab, setTab] = useState('models');
  const [display, setDisplay] = useState(() => readReaderSettings());

  function updateDisplay(patch) {
    writeReaderSettings(patch);
    setDisplay((previous) => ({ ...previous, ...patch }));
  }

  function applyConnection(connection) {
    if (mounted.current) setConnections((previous) => ({ ...previous, [connection.provider]: connection }));
  }

  useEffect(() => {
    mounted.current = true;
    dialog.current.showModal();
    api.getModel().then((config) => {
      if (mounted.current) setValue(config);
    }).catch((error) => {
      if (mounted.current) setProblem(error.message);
    });
    api.chatgptStatus().then((info) => {
      if (mounted.current) setAccount(info);
    }).catch((error) => {
      if (mounted.current) setAccountProblem({ error: true, text: error.message });
    });
    for (const provider of Object.keys(connectionNames)) {
      api.getModelConnection(provider).then((connection) => {
        if (!connectionUpdates.current[provider]) applyConnection(connection);
      }).catch((error) => {
        if (!connectionUpdates.current[provider]) applyConnection({ provider, models: [], problem: error.message });
      });
    }
    return () => { mounted.current = false; };
  }, []);

  async function refresh(provider) {
    connectionUpdates.current[provider] = true;
    setUpdating((count) => count + 1);
    try {
      const connection = await api.getModelConnection(provider, true);
      applyConnection(connection);
      onConnectionsChange();
      return connection;
    } finally {
      if (mounted.current) setUpdating((count) => count - 1);
    }
  }

  async function update(provider, input) {
    connectionUpdates.current[provider] = true;
    setUpdating((count) => count + 1);
    try {
      applyConnection(await api.updateModelConnection(provider, input));
      onConnectionsChange();
    } finally {
      if (mounted.current) setUpdating((count) => count - 1);
    }
  }

  async function useAccount(action, operation) {
    setAccountPending(operation);
    setAccountProblem(null);
    try {
      const info = await action();
      if (!mounted.current) {
        onConnectionsChange();
        return;
      }
      connectionUpdates.current.chatgpt = true;
      setAccount(info);
      applyConnection({ provider: 'chatgpt', connected: info.connected, models: [] });
      if (info.revocationFailed) setAccountProblem({ error: true, text: '本地账号已退出。可在 ChatGPT 设置中撤销远程授权。' });
      else if (operation === 'login' && !info.connected) setAccountProblem({ text: '账号已登录，请允许阅读器使用订阅额度。' });
      await refresh('chatgpt');
    } catch (error) {
      if (mounted.current) setAccountProblem({ error: true, text: error.message });
    } finally {
      if (mounted.current) setAccountPending('');
    }
  }

  function close() {
    api.chatgptCancel().catch(() => {});
    onClose();
  }

  const tone = display.uiTone === 'default' || !display.uiTone ? '' : ' elr-tone-' + display.uiTone;
  return <dialog className={'settings model-center' + tone} ref={dialog} aria-labelledby="model-center-title"
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <div className="model-center-chrome">
      <header className="model-center-header">
        <h2 id="model-center-title">模型设置</h2>
        <div className="model-center-version">
          {version && <span>CoReader {version}</span>}
          {availableUpdate && <a href={availableUpdate.url}>查看新版 {availableUpdate.version}</a>}
          <button type="button" className="quiet" aria-label="关闭设置" onClick={close}>×</button>
        </div>
      </header>
      <nav className="model-center-tabs" aria-label="设置分类">
        <button type="button" aria-pressed={tab === 'models'} onClick={() => setTab('models')}>模型与账号</button>
        <button type="button" aria-pressed={tab === 'display'} onClick={() => setTab('display')}>显示设置</button>
        <button type="button" aria-pressed={tab === 'reading'} onClick={() => setTab('reading')}>阅读设置</button>
      </nav>
    </div>
    <section className="model-center-pane" aria-label="模型配置" hidden={tab !== 'models'}>
      {problem && <p className="model-center-error" role="alert">{problem}</p>}
      <AccountConnections connections={connections} onUpdate={update} onRefresh={(provider) => provider === 'chatgpt'
        ? useAccount(() => api.chatgptStatus(), 'refresh') : refresh(provider)}
        chatgpt={{ account, pending: accountPending, problem: accountProblem,
          onLogin: (id) => useAccount(() => api.chatgptLogin(id), 'login'),
          onCancel: () => api.chatgptCancel().catch(() => {}),
          onSelect: (id) => useAccount(() => api.chatgptSelect(id), 'select'),
          onSignOut: () => useAccount(() => api.chatgptLogout(), 'logout') }} />
      {value ? <ModelSettings value={value} connections={connections} updating={Boolean(updating || accountPending)} onSave={onSave} />
        : !problem && <p className="model-center-loading" role="status">正在读取模型配置…</p>}
    </section>
    <section className="model-center-pane" aria-label="显示设置" hidden={tab !== 'display'}>
      <DisplaySettings value={display} onChange={updateDisplay} />
    </section>
    <section className="model-center-pane" aria-label="阅读设置" hidden={tab !== 'reading'}>
      <ReadingSettings value={display} onChange={updateDisplay} />
    </section>
  </dialog>;
}

function DisplaySettings({ value, onChange }) {
  const tones = {
    light: [['blue', '雨后天青'], ['green', '山间松雾'], ['amber', '秋日麦穗'], ['pink', '蔷薇薄雾']],
    dark: [['default', '深色主题'], ['navy', '深海子夜'], ['ink', '墨池听雨'], ['forest', '松林入夜'], ['plum', '暮紫星河'], ['ember', '炉边夜话']],
    duo: [['duo-blue', '白蓝'], ['duo-orange', '灰橘'], ['duo-green', '米绿'], ['duo-purple', '雾紫']],
  };
  return <div className="display-settings">
    <div className="display-setting-group">
      <h3>界面主题</h3>
      <label>主题
        <select aria-label="界面主题" value={value.uiTone || 'default'} onChange={(event) => onChange({ uiTone: event.target.value })}>
          <optgroup label="浅色主题">{tones.light.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</optgroup>
          <optgroup label="深色主题">{tones.dark.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</optgroup>
          <optgroup label="双拼主题">{tones.duo.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</optgroup>
        </select>
      </label>
      <label>PDF 页面配色
        <select value={value.theme || 'default'} onChange={(event) => onChange({ theme: event.target.value })}>
          <option value="default">默认</option><option value="paper">纸张纹理</option><option value="eye">护眼黄</option>
          <option value="ivory">柔白</option><option value="mist">雾蓝</option><option value="sage">浅青绿</option><option value="linen">细麻纹</option>
        </select>
      </label>
    </div>
    <div className="display-setting-group">
      <h3>功能栏布局</h3>
      <label>停靠位置
        <select value={value.dock || 'right'} onChange={(event) => onChange({ dock: event.target.value })}>
          <option value="right">右侧</option><option value="bottom">下方</option>
        </select>
      </label>
      {value.dock === 'right' ? <label>右侧功能栏列数
        <select value={Number(value.featureColumns) === 2 ? '2' : '1'} onChange={(event) => onChange({ featureColumns: Number(event.target.value) })}>
          <option value="1">一列</option><option value="2">两列</option>
        </select>
      </label> : null}
    </div>
  </div>;
}

function ReadingSettings({ value, onChange }) {
  return <div className="display-settings">
    <div className="display-setting-group">
      <h3>划词翻译</h3>
      <label>划词后自动翻译
        <select value={value.autoTranslateSelection ? 'on' : 'off'}
          onChange={(event) => onChange({ autoTranslateSelection: event.target.value === 'on' })}>
          <option value="off">关闭</option><option value="on">开启</option>
        </select>
      </label>
      <label>选中文本时自动打开翻译浮窗
        <select value={value.popupOn ? 'on' : 'off'} onChange={(event) => onChange({ popupOn: event.target.value === 'on' })}>
          <option value="off">关闭</option><option value="on">开启</option>
        </select>
      </label>
    </div>
    <div className="display-setting-group">
      <h3>阅读操作</h3>
      <p className="settings-note">按住 Ctrl 并拖动鼠标左键移动 PDF 页面。</p>
    </div>
  </div>;
}
