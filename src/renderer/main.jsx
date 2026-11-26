import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Reader, installCss, setHostScheme, translate, readReaderSettings, subscribeReaderSettings } from './reader-view.js';
import { installLiquidGlass } from './liquid-glass.mjs';
import { loadLibrary } from './desktop-runtime.js';
import { ModelCenter } from './model-center.jsx';
import { OnboardingTour, WelcomeDialog, shouldStartOnboarding } from './onboarding-tour.jsx';
import './reader.css';
import './liquid-glass.css';
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

function App({ issue: startupIssue }) {
  const [modelCenter, setModelCenter] = useState(null);
  const [tourStage, setTourStage] = useState(''); // '' | 'welcome' | 'tour'
  const [password, setPassword] = useState(null);
  const [revision, setRevision] = useState(0);
  const [issue, setIssue] = useState(startupIssue);
  const [version, setVersion] = useState('');
  const [update, setUpdate] = useState(null);
  const [dismissed, setDismissed] = useState(false);
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
      if (active && shouldStartOnboarding()) setTourStage('welcome');
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

  return <div className="desktop-app">
    {isMac && !nativeFullscreen && <div className="desktop-mac-toolbar" aria-hidden="true">CoReader</div>}
    {issue && <aside className="desktop-error" role="alert">
      <span>{issue}</span><button className="quiet" aria-label="关闭提示" onClick={() => setIssue('')}>×</button>
    </aside>}
    {update && !dismissed && <aside className="desktop-update" aria-label="软件更新">
      <strong role="status">发现 CoReader {update.version}，可以更新</strong>
      <a href={update.url}>查看发布</a>
      <button type="button" aria-label="关闭更新提示" onClick={() => setDismissed(true)}>×</button>
    </aside>}
    <Reader t={translate} version={version} nativeFullscreen={nativeFullscreen} modelRevision={revision} onModelSettings={openModelCenter} onPdfPassword={setPassword} />
    {password && <PdfPassword request={password} onClose={() => setPassword(null)} />}
    {modelCenter && <ModelCenter version={version} availableUpdate={update}
      initialTab={modelCenter.tab} initialSection={modelCenter.section} navigationKey={modelCenter.nonce}
      onUpdateFound={(next) => { setUpdate(next); if (next) setDismissed(false); }}
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

loadLibrary().then(() => '', (error) => error.message).then((issue) => {
  createRoot(document.getElementById('root')).render(<App issue={issue} />);
});
