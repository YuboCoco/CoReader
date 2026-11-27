import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Reader, installCss, setHostScheme, translate, readReaderSettings, subscribeReaderSettings } from './reader-view.js';
import { installLiquidGlass } from './liquid-glass.mjs';
import { installCustomCursors } from './cursors.mjs';
import { installBingWallpaper } from './bing-wallpaper.mjs';
import { installAuroraIdle } from './aurora-idle.mjs';
import { loadLibrary } from './desktop-runtime.js';
import { ModelCenter } from './model-center.jsx';
import { OnboardingTour, WelcomeDialog, shouldStartOnboarding } from './onboarding-tour.jsx';
import './reader.css';
import './liquid-glass.css';
import './cursors.css';
import { motionTiming, reduceMotion } from './surface-motion.js';

const api = window.reader;
const isMac = api.platform === 'darwin';
if (isMac) document.documentElement.dataset.desktopPlatform = 'darwin';
const fonts = import.meta.glob('../../assets/fonts/MiSansVF.ttf', { eager: true, query: '?url', import: 'default' });
const miSans = fonts['../../assets/fonts/MiSansVF.ttf'];
if (miSans) document.fonts.add(new FontFace('MiSans', 'url("' + miSans + '")', { weight: '100 900', display: 'swap' }));

const STARTUP_HOLD_MS = 1400;

async function finishStartup() {
  const splash = document.getElementById('startup-screen');
  if (!splash) return;
  const dismiss = () => {
    splash.remove();
    const root = document.getElementById('root');
    if (root) root.inert = false;
  };
  try {
    if (!reduceMotion() && !document.hidden) {
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      if (splash.isConnected && !document.hidden) {
        splash.classList.add('is-animating');
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        await Promise.allSettled(splash.getAnimations({ subtree: true }).map((animation) => animation.finished));
      }
    } else {
      splash.classList.add('is-animating');
    }
    if (splash.isConnected && !document.hidden) {
      await new Promise((resolve) => window.setTimeout(resolve, STARTUP_HOLD_MS));
    }
    if (splash.isConnected && !document.hidden) {
      splash.style.pointerEvents = 'none';
      const root = document.getElementById('root');
      if (root) root.inert = false;
      await splash.animate([{ opacity: 1 }, { opacity: 0 }], { ...motionTiming('sm', 'exit'), fill: 'forwards' }).finished;
    }
  } finally {
    dismiss();
  }
}

function PdfPassword({ request, onClose }) {
  const modal = useRef(null);
  const input = useRef(null);
  useEffect(() => { modal.current.showModal(); input.current.focus(); }, []);
  const cancel = () => { onClose(); request.cancel(); };
  return <dialog className="settings pdf-password" ref={modal} onCancel={(event) => { event.preventDefault(); cancel(); }}>
    <form onSubmit={(event) => {
      event.preventDefault();
      const value = input.current.value;
      onClose();
      request.submit(value);
    }}>
      <header className="dialog-head"><h2>解锁 PDF</h2></header>
      <p className="settings-note">{request.text}</p>
      <label>PDF 密码<input type="password" ref={input} required autoComplete="off" /></label>
      <footer className="dialog-actions">
        <button type="button" onClick={cancel}>取消</button>
        <button type="submit" className="primary">打开 PDF</button>
      </footer>
    </form>
  </dialog>;
}

const IGNORED_UPDATE_KEY = 'coreader.ignored-update-version';

function readIgnoredUpdateVersion() {
  try { return localStorage.getItem(IGNORED_UPDATE_KEY) || ''; } catch { return ''; }
}

function writeIgnoredUpdateVersion(version) {
  try {
    if (version) localStorage.setItem(IGNORED_UPDATE_KEY, version);
    else localStorage.removeItem(IGNORED_UPDATE_KEY);
  } catch {}
}

function formatMegabytes(bytes) {
  return (Math.max(0, Number(bytes) || 0) / (1024 * 1024)).toFixed(1);
}

function ReleaseNotes({ notes }) {
  if (!notes) {
    return <p className="update-notes-empty">暂无详细更新日志，可点击下方「前往 Release 页面」查看完整说明。</p>;
  }
  const blocks = [];
  let listItems = [];
  const flushList = (keyBase) => {
    if (!listItems.length) return;
    blocks.push(<ul key={'ul-' + keyBase}>{listItems}</ul>);
    listItems = [];
  };
  notes.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(index);
      return;
    }
    const heading = /^#{1,4}\s+(.+)$/.exec(line);
    if (heading) {
      flushList(index);
      blocks.push(<h4 key={'h-' + index}>{heading[1]}</h4>);
      return;
    }
    const bullet = /^[-*•]\s+(.+)$/.exec(line);
    if (bullet) {
      listItems.push(<li key={'li-' + index}>{bullet[1]}</li>);
      return;
    }
    flushList(index);
    blocks.push(<p key={'p-' + index}>{line}</p>);
  });
  flushList('end');
  return <div className="update-notes-body">{blocks}</div>;
}

function UpdateDialog({ update, currentVersion, onIgnore, onClose }) {
  const modal = useRef(null);
  const [stage, setStage] = useState('idle'); // 'idle' | 'downloading' | 'installing' | 'error'
  const [progress, setProgress] = useState({ received: 0, total: 0, percent: 0 });
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    modal.current?.showModal();
    return api.onUpdateProgress((payload) => {
      if (!payload) return;
      if (payload.stage === 'downloading') {
        setStage('downloading');
        setProgress({
          received: payload.received || 0,
          total: payload.total || 0,
          percent: payload.percent || 0,
        });
      } else if (payload.stage === 'installing') {
        setStage('installing');
        setProgress((prev) => ({ ...prev, percent: 100 }));
      }
    });
  }, []);

  async function startUpdate() {
    if (stage === 'downloading' || stage === 'installing') return;
    setErrorText('');
    setStage('downloading');
    setProgress({ received: 0, total: 0, percent: 0 });
    try {
      const result = await api.installUpdate(update);
      if (result?.started) return;
      if (result?.reason === 'canceled') {
        setStage('idle');
        return;
      }
      setStage('error');
      setErrorText(result?.message || '当前环境不支持自动更新，请前往 Release 页面手动下载。');
    } catch (error) {
      setStage('error');
      setErrorText(error?.message || '更新下载失败，请重试或前往 Release 页面下载。');
    }
  }

  function handleIgnore() {
    if (stage === 'downloading') {
      api.cancelUpdateDownload().catch(() => {});
    }
    onIgnore();
  }

  const busy = stage === 'downloading' || stage === 'installing';

  return <dialog className="settings update-dialog" ref={modal} aria-labelledby="update-dialog-title"
    onCancel={(event) => {
      event.preventDefault();
      if (!busy) handleIgnore();
    }}>
    <header className="dialog-head">
      <div className="update-dialog-heading">
        <h2 id="update-dialog-title">检测到新版本 v{update.version}</h2>
        <p className="update-version-meta">
          {currentVersion ? `当前版本 v${currentVersion} → 最新版本 v${update.version}` : `最新版本 v${update.version}`}
        </p>
      </div>
      {!busy && <button type="button" className="quiet" aria-label="忽略此版本" onClick={handleIgnore}>×</button>}
    </header>
    <div className="update-notes-box">
      <ReleaseNotes notes={update.notes} />
    </div>
    {busy && (
      <div className="update-progress-box" role="status">
        <div className="update-progress-label">
          <span>{stage === 'installing' ? '正在安装更新并准备重启…' : '正在下载安装包…'}</span>
          <span>
            {progress.total > 0
              ? `${formatMegabytes(progress.received)} / ${formatMegabytes(progress.total)} MB (${progress.percent}%)`
              : `${formatMegabytes(progress.received)} MB`}
          </span>
        </div>
        <progress className="update-progress-bar" max={100} value={progress.percent} />
      </div>
    )}
    {errorText && <p className="form-error" role="alert">{errorText}</p>}
    <footer className="update-dialog-footer">
      <button type="button" className="quiet update-release-link" onClick={() => {
        api.openLink(update.url).catch(() => {});
        onClose();
      }}>前往 Release 页面</button>
      <div className="dialog-actions">
        {stage === 'downloading' ? (
          <button type="button" onClick={() => api.cancelUpdateDownload().catch(() => {})}>取消下载</button>
        ) : (
          <button type="button" disabled={busy} onClick={handleIgnore}>忽略</button>
        )}
        <button type="button" className="primary" disabled={busy} onClick={startUpdate}>
          {stage === 'installing' ? '正在安装…' : stage === 'downloading' ? '下载中…' : '更新'}
        </button>
      </div>
    </footer>
  </dialog>;
}

function App({ issue: startupIssue }) {
  const [modelCenter, setModelCenter] = useState(null);
  const [tourStage, setTourStage] = useState(''); // '' | 'welcome' | 'tour'
  const [password, setPassword] = useState(null);
  const [revision, setRevision] = useState(0);
  const [issue, setIssue] = useState(startupIssue);
  const [version, setVersion] = useState('');
  const [update, setUpdate] = useState(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [startupDone, setStartupDone] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);

  const openModelCenter = (target) => {
    const opts = target && typeof target === 'object' && ('tab' in target || 'section' in target) ? target : {};
    setModelCenter({ tab: opts.tab || 'models', section: opts.section || '', nonce: Date.now() });
  };

  useEffect(() => {
    if (!isMac) return;
    return api.onWindowFullscreen((active) => {
      document.documentElement.toggleAttribute('data-native-fullscreen', active);
      setNativeFullscreen(active);
    });
  }, []);

  useEffect(() => {
    let active = true;
    api.windowReady().catch(() => {});
    finishStartup().catch(() => {}).finally(() => {
      if (!active) return;
      setStartupDone(true);
      if (shouldStartOnboarding()) setTourStage('welcome');
    });
    api.appVersion().then((value) => { if (active) setVersion(value); }).catch(() => {});
    api.checkForUpdate().then((value) => { if (active) setUpdate(value); }).catch(() => {});
    const showError = (event) => setIssue(event.detail);
    const linkClick = (event) => {
      const link = event.target.closest?.('a[href]');
      if (!link || !/^https?:\/\//i.test(link.href)) return;
      event.preventDefault();
      api.openLink(link.href).catch((error) => setIssue(error.message));
    };
    window.addEventListener('reader-storage-error', showError);
    document.addEventListener('click', linkClick, true);
    return () => {
      active = false;
      window.removeEventListener('reader-storage-error', showError);
      document.removeEventListener('click', linkClick, true);
    };
  }, []);

  useEffect(() => {
    if (!startupDone || tourStage || !update?.version) return;
    if (readIgnoredUpdateVersion() === update.version) return;
    setUpdateModalOpen(true);
  }, [startupDone, tourStage, update?.version]);

  return <div className="desktop-app">
    {isMac && !nativeFullscreen && <div className="desktop-mac-toolbar" aria-hidden="true">CoReader</div>}
    {issue && <aside className="desktop-error" role="alert">
      <span>{issue}</span><button className="quiet" aria-label="关闭提示" onClick={() => setIssue('')}>×</button>
    </aside>}
    <Reader t={translate} version={version} availableUpdate={update} nativeFullscreen={nativeFullscreen} modelRevision={revision} onModelSettings={openModelCenter} onPdfPassword={setPassword} />
    {password && <PdfPassword request={password} onClose={() => setPassword(null)} />}
    {update && updateModalOpen && <UpdateDialog
      update={update}
      currentVersion={version}
      onIgnore={() => {
        writeIgnoredUpdateVersion(update.version);
        setUpdateModalOpen(false);
      }}
      onClose={() => setUpdateModalOpen(false)}
    />}
    {modelCenter && <ModelCenter version={version} availableUpdate={update}
      initialTab={modelCenter.tab} initialSection={modelCenter.section} navigationKey={modelCenter.nonce}
      onUpdateFound={(next) => {
        setUpdate(next);
        if (next) {
          writeIgnoredUpdateVersion('');
          setModelCenter(null);
          setUpdateModalOpen(true);
        }
      }}
      onClose={() => setModelCenter(null)}
      onReplayTour={() => { setModelCenter(null); setTourStage('tour'); }}
      onConnectionsChange={() => setRevision((previous) => previous + 1)} onSave={() => {
      setModelCenter(null);
      setRevision((previous) => previous + 1);
    }} />}
    <WelcomeDialog
      active={tourStage === 'welcome'}
      onStart={() => setTourStage('tour')}
      onSkip={() => setTourStage('')}
    />
    <OnboardingTour active={tourStage === 'tour'} onFinish={() => setTourStage('')} />
  </div>;
}

const system = matchMedia('(prefers-color-scheme: dark)');
const updateScheme = () => {
  const scheme = system.matches ? 'dark' : 'light';
  document.documentElement.dataset.desktopScheme = scheme;
  setHostScheme(scheme);
};
system.addEventListener('change', updateScheme);
updateScheme();
installCss();
installLiquidGlass(readReaderSettings, subscribeReaderSettings);
installCustomCursors(readReaderSettings, subscribeReaderSettings);
installBingWallpaper(readReaderSettings, subscribeReaderSettings);
installAuroraIdle(readReaderSettings, subscribeReaderSettings);

loadLibrary().then(() => '', (error) => error.message).then((issue) => {
  createRoot(document.getElementById('root')).render(<App issue={issue} />);
});
