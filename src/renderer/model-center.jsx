import React, { useEffect, useRef, useState } from 'react';
import { connectionNames } from '../model-capabilities.mjs';
import { AccountConnections } from './account-connections.jsx';
import { ModelSettings } from './settings.jsx';
import { glassTintPreference } from './liquid-glass.mjs';
import {
  ALBUM_INTERVAL_MAX,
  ALBUM_INTERVAL_MIN,
  ALBUM_INTERVAL_OPTIONS,
  ALBUM_ORDER_OPTIONS,
  ALBUM_TRANSITION_OPTIONS,
  normalizeAlbumInterval,
  normalizeAlbumOrder,
  normalizeAlbumTransition,
  readReaderSettings,
  writeReaderSettings,
} from './reader-view.js';
import { reduceMotion } from './surface-motion.js';

const api = window.reader;

export function ModelCenter({ version, availableUpdate, initialTab = 'models', initialSection = '', navigationKey = 0, onUpdateFound, onClose, onSave, onConnectionsChange, onReplayTour }) {
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
  const [tab, setTab] = useState(() => (['models', 'display', 'reading'].includes(initialTab) ? initialTab : 'models'));
  const [highlightedSection, setHighlightedSection] = useState('');
  const [display, setDisplay] = useState(() => readReaderSettings());
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');

  async function checkUpdateNow() {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    setUpdateMessage('');
    try {
      const next = await api.checkForUpdate(true);
      if (!mounted.current) return;
      onUpdateFound?.(next);
      setUpdateMessage(next ? '' : '已是最新版本');
    } catch (error) {
      if (mounted.current) setUpdateMessage(error?.message || '检查更新失败');
    } finally {
      if (mounted.current) setCheckingUpdate(false);
    }
  }

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

  useEffect(() => {
    const nextTab = ['models', 'display', 'reading'].includes(initialTab) ? initialTab : 'models';
    setTab(nextTab);
    if (!initialSection) {
      setHighlightedSection('');
      return undefined;
    }
    let timer = null;
    const raf = window.requestAnimationFrame(() => {
      const target = dialog.current?.querySelector(`[data-setting-section="${initialSection}"]`);
      if (target) {
        target.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
        setHighlightedSection(initialSection);
        timer = window.setTimeout(() => {
          if (mounted.current) setHighlightedSection('');
        }, 1600);
      }
    });
    return () => {
      window.cancelAnimationFrame(raf);
      if (timer) window.clearTimeout(timer);
    };
  }, [initialTab, initialSection, navigationKey]);

  async function refresh(provider, force = true) {
    connectionUpdates.current[provider] = true;
    setUpdating((count) => count + 1);
    try {
      const connection = await api.getModelConnection(provider, force);
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

  const tabs = [
    { id: 'models', label: '模型与账号', panelId: 'model-center-panel-models' },
    { id: 'display', label: '显示设置', panelId: 'model-center-panel-display' },
    { id: 'reading', label: '阅读设置', panelId: 'model-center-panel-reading' },
  ];

  function onTabKeyDown(event, index) {
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    setTab(tabs[next].id);
    event.currentTarget.parentElement?.children[next]?.focus();
  }

  const tone = display.uiTone === 'default' || !display.uiTone ? '' : ' elr-tone-' + display.uiTone;
  return <dialog className={'settings model-center' + tone} ref={dialog} aria-labelledby="model-center-title"
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <div className="model-center-chrome">
      <header className="model-center-header">
        <h2 id="model-center-title">模型设置</h2>
        <div className="model-center-version">
          {version && <span>CoReader {version}</span>}
          {availableUpdate ? (
            <a href={availableUpdate.url}>查看新版 {availableUpdate.version}</a>
          ) : (
            <button type="button" className="model-center-update-check" disabled={checkingUpdate} onClick={checkUpdateNow}>
              {checkingUpdate ? '检查中…' : '检查更新'}
            </button>
          )}
          {!availableUpdate && updateMessage && (
            <span className="model-center-update-status" role="status">{updateMessage}</span>
          )}
          <button type="button" className="quiet" aria-label="关闭设置" onClick={close}>×</button>
        </div>
      </header>
      <div className="model-center-tabs" role="tablist" aria-label="设置分类">
        {tabs.map((item, index) => {
          const selected = tab === item.id;
          return <button key={item.id} id={'model-center-tab-' + item.id} type="button" role="tab"
            aria-selected={selected} aria-controls={item.panelId} tabIndex={selected ? 0 : -1}
            onClick={() => setTab(item.id)} onKeyDown={(event) => onTabKeyDown(event, index)}>{item.label}</button>;
        })}
      </div>
    </div>
    <section id="model-center-panel-models" role="tabpanel" aria-labelledby="model-center-tab-models" className="model-center-pane" hidden={tab !== 'models'}>
      {problem && <p className="model-center-error" role="alert">{problem}</p>}
      <AccountConnections connections={connections} onUpdate={update} onRefresh={(provider, force) => provider === 'chatgpt'
        ? useAccount(() => api.chatgptStatus(), 'refresh') : refresh(provider, force)}
        chatgpt={{ account, pending: accountPending, problem: accountProblem,
          onLogin: (id) => useAccount(() => api.chatgptLogin(id), 'login'),
          onCancel: () => api.chatgptCancel().catch(() => {}),
          onSelect: (id) => useAccount(() => api.chatgptSelect(id), 'select'),
          onSignOut: () => useAccount(() => api.chatgptLogout(), 'logout') }} />
      {value ? <ModelSettings value={value} connections={connections} updating={Boolean(updating || accountPending)} onSave={onSave} />
        : !problem && <p className="model-center-loading" role="status">正在读取模型配置…</p>}
    </section>
    <section id="model-center-panel-display" role="tabpanel" aria-labelledby="model-center-tab-display" className="model-center-pane" hidden={tab !== 'display'}>
      <DisplaySettings value={display} onChange={updateDisplay} highlightedSection={highlightedSection} />
    </section>
    <section id="model-center-panel-reading" role="tabpanel" aria-labelledby="model-center-tab-reading" className="model-center-pane" hidden={tab !== 'reading'}>
      <ReadingSettings value={display} onChange={updateDisplay} onReplayTour={onReplayTour} />
    </section>
  </dialog>;
}

function DisplaySettings({ value, onChange, highlightedSection = '' }) {
  const glassEnabled = value.glassEnabled !== false;
  const albumInterval = normalizeAlbumInterval(value.albumInterval);
  const isPresetInterval = ALBUM_INTERVAL_OPTIONS.some((item) => item.value === albumInterval);
  const [customIntervalMode, setCustomIntervalMode] = useState(() => !isPresetInterval);
  const [customDraft, setCustomDraft] = useState(() => String(albumInterval));
  const customInputRef = useRef(null);
  const albumOrder = normalizeAlbumOrder(value.albumOrder);
  const albumTransition = normalizeAlbumTransition(value.albumTransition);

  useEffect(() => {
    if (!isPresetInterval) setCustomIntervalMode(true);
    setCustomDraft(String(albumInterval));
  }, [albumInterval, isPresetInterval]);

  const handleIntervalSelect = (event) => {
    const raw = event.target.value;
    if (raw === 'custom') {
      setCustomIntervalMode(true);
      setCustomDraft(String(albumInterval));
      window.requestAnimationFrame(() => {
        customInputRef.current?.focus();
        customInputRef.current?.select();
      });
      return;
    }
    setCustomIntervalMode(false);
    onChange({ albumInterval: normalizeAlbumInterval(raw) });
  };

  const commitCustomInterval = (rawText) => {
    const parsed = Math.round(Number(rawText));
    if (Number.isFinite(parsed) && parsed >= ALBUM_INTERVAL_MIN) {
      const clamped = Math.min(ALBUM_INTERVAL_MAX, parsed);
      onChange({ albumInterval: clamped });
      setCustomDraft(String(clamped));
    } else {
      setCustomDraft(String(albumInterval));
    }
  };

  const tones = {
    light: [['blue', '雨后天青'], ['green', '山间松雾'], ['amber', '秋日麦穗'], ['pink', '蔷薇薄雾'], ['prism-light', '晴光流彩']],
    dark: [['default', '玄灰夜幕'], ['navy', '深海子夜'], ['ink', '墨池听雨'], ['forest', '松林入夜'], ['plum', '暮紫星河'], ['ember', '炉边夜话'], ['prism-dark', '极夜流光']],
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
          <optgroup label="浅色纸张">
            <option value="default">默认</option><option value="paper">纸张纹理</option><option value="eye">护眼黄</option>
            <option value="ivory">柔白</option><option value="mist">雾蓝</option><option value="sage">浅青绿</option><option value="linen">细麻纹</option>
          </optgroup>
          <optgroup label="深色纸张">
            <option value="dark-slate">玄夜深灰</option><option value="dark-midnight">深夜靛蓝</option>
            <option value="dark-sepia">暖墨褐纸</option><option value="dark-forest">墨绿夜读</option><option value="dark-oled">极夜纯黑</option>
          </optgroup>
        </select>
      </label>
    </div>
    <div className="display-setting-group">
      <h3>液态玻璃</h3>
      <label>启用液态玻璃
        <input className="elr-glass-switch" type="checkbox" role="switch" checked={glassEnabled}
          onChange={(event) => onChange({ glassEnabled: event.target.checked })} />
      </label>
      {[['glassTintLight', '浅色玻璃着色强度'], ['glassTintDark', '深色玻璃着色强度']].map(([key, label]) => {
        const tint = glassTintPreference(value[key]);
        const percent = Math.round(tint * 100) + '%';
        return <label key={key}>{label}
          <span className="elr-glass-slider">
            <input type="range" min="0" max="1.5" step="0.05" value={tint} disabled={!glassEnabled} aria-label={label} aria-valuetext={percent}
              onChange={(event) => onChange({ [key]: event.target.valueAsNumber })} />
            <output aria-hidden="true">{percent}</output>
          </span>
        </label>;
      })}
    </div>
    <div className="display-setting-group">
      <h3>功能栏布局</h3>
      <div className="display-setting-row">
        <span id="setting-dock-label">停靠位置</span>
        <div className="elr-segmented-control" role="group" aria-labelledby="setting-dock-label">
          <button type="button" aria-pressed={(value.dock || 'right') !== 'bottom'} onClick={() => onChange({ dock: 'right' })}>侧边</button>
          <button type="button" aria-pressed={value.dock === 'bottom'} onClick={() => onChange({ dock: 'bottom' })}>下方</button>
        </div>
      </div>
      <div className="display-setting-row">
        <span id="setting-side-dock-label">常驻位置（含目录与工具按钮）</span>
        <div className="elr-segmented-control" role="group" aria-labelledby="setting-side-dock-label">
          <button type="button" aria-pressed={value.sideDock === 'left'} onClick={() => onChange({ sideDock: 'left', ...(value.dock === 'bottom' ? { dock: 'right' } : {}) })}>常驻左侧</button>
          <button type="button" aria-pressed={(value.sideDock || 'right') !== 'left'} onClick={() => onChange({ sideDock: 'right', ...(value.dock === 'bottom' ? { dock: 'right' } : {}) })}>常驻右侧</button>
        </div>
      </div>
      {(value.dock || 'right') === 'right' ? <div className="display-setting-row">
        <span id="setting-columns-label">侧边功能栏列数</span>
        <div className="elr-segmented-control" role="group" aria-labelledby="setting-columns-label">
          <button type="button" aria-pressed={Number(value.featureColumns) !== 2} onClick={() => onChange({ featureColumns: 1 })}>一列</button>
          <button type="button" aria-pressed={Number(value.featureColumns) === 2} onClick={() => onChange({ featureColumns: 2 })}>两列</button>
        </div>
      </div> : null}
    </div>
    <div className={'display-setting-group' + (highlightedSection === 'album' ? ' is-highlighted' : '')}
      id="setting-section-album" data-setting-section="album">
      <h3>相册卡片</h3>
      <div className="display-setting-row">
        <label htmlFor="setting-album-interval">相册轮播时长</label>
        <div className="settings-album-interval">
          <select id="setting-album-interval" aria-label="相册轮播时长"
            value={customIntervalMode || !isPresetInterval ? 'custom' : String(albumInterval)}
            onChange={handleIntervalSelect}>
            {ALBUM_INTERVAL_OPTIONS.map((item) => <option key={item.value} value={String(item.value)}>{item.label}</option>)}
            <option value="custom">自定义…</option>
          </select>
          {(customIntervalMode || !isPresetInterval) && (
            <div className="settings-custom-interval">
              <input ref={customInputRef} type="number" min={ALBUM_INTERVAL_MIN} max={ALBUM_INTERVAL_MAX} step="1"
                aria-label="自定义轮播时长（秒）" value={customDraft}
                onChange={(event) => {
                  const nextText = event.target.value;
                  setCustomDraft(nextText);
                  const parsed = Math.round(Number(nextText));
                  if (Number.isFinite(parsed) && parsed >= ALBUM_INTERVAL_MIN && parsed <= ALBUM_INTERVAL_MAX) {
                    onChange({ albumInterval: parsed });
                  }
                }}
                onBlur={(event) => commitCustomInterval(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitCustomInterval(event.currentTarget.value);
                  }
                }} />
              <span className="settings-input-unit">秒</span>
            </div>
          )}
        </div>
      </div>
      <div className="display-setting-row">
        <span id="setting-album-order-label">轮播顺序</span>
        <div className="elr-segmented-control" role="group" aria-labelledby="setting-album-order-label">
          {ALBUM_ORDER_OPTIONS.map((item) => (
            <button key={item.value} type="button" aria-pressed={albumOrder === item.value}
              onClick={() => onChange({ albumOrder: item.value })}>{item.label}</button>
          ))}
        </div>
      </div>
      <label>照片切换方式
        <select aria-label="照片切换方式" value={albumTransition}
          onChange={(event) => onChange({ albumTransition: normalizeAlbumTransition(event.target.value) })}>
          {ALBUM_TRANSITION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
    </div>
  </div>;
}

function ReadingSettings({ value, onChange, onReplayTour }) {
  return <div className="display-settings">
    <div className="display-setting-group">
      <h3>划词翻译</h3>
      <label>划词后自动翻译
        <input className="elr-glass-switch" type="checkbox" role="switch" checked={Boolean(value.autoTranslateSelection)}
          onChange={(event) => onChange({ autoTranslateSelection: event.target.checked })} />
      </label>
      <label>选中文本时自动打开翻译浮窗
        <input className="elr-glass-switch" type="checkbox" role="switch" checked={Boolean(value.popupOn)}
          onChange={(event) => onChange({ popupOn: event.target.checked })} />
      </label>
    </div>
    <div className="display-setting-group">
      <h3>对照阅读</h3>
      <label>打开文章后自动翻译全文
        <input className="elr-glass-switch" type="checkbox" role="switch" checked={Boolean(value.autoTranslatePaper)}
          onChange={(event) => onChange({ autoTranslatePaper: event.target.checked })} />
      </label>
    </div>
    <div className="display-setting-group">
      <h3>阅读操作</h3>
      <div className="display-setting-row">
        <span id="setting-capsule-label">阅读工具栏位置</span>
        <div className="elr-segmented-control" role="group" aria-labelledby="setting-capsule-label">
          <button type="button" aria-pressed={(value.capsulePosition || 'top') === 'top'} onClick={() => onChange({ capsulePosition: 'top' })}>页面顶部</button>
          <button type="button" aria-pressed={value.capsulePosition === 'bottom'} onClick={() => onChange({ capsulePosition: 'bottom' })}>页面底部</button>
        </div>
      </div>
      {onReplayTour && <div className="display-setting-row">
        <span>新手引导</span>
        <button type="button" onClick={onReplayTour}>重新查看新手引导</button>
      </div>}
      <p className="settings-note">按住 Ctrl 并拖动鼠标左键移动 PDF 页面。</p>
    </div>
  </div>;
}
