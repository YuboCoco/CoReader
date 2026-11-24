import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Reader, installCss, setHostScheme, translate } from './reader-view.js';
import { loadLibrary } from './desktop-runtime.js';
import { ModelCenter } from './model-center.jsx';
import './reader.css';

const api = window.reader;
const isMac = api.platform === 'darwin';
if (isMac) document.documentElement.dataset.desktopPlatform = 'darwin';
const fonts = import.meta.glob('../../assets/fonts/MiSansVF.ttf', { eager: true, query: '?url', import: 'default' });
const miSans = fonts['../../assets/fonts/MiSansVF.ttf'];
if (miSans) document.fonts.add(new FontFace('MiSans', 'url("' + miSans + '")', { weight: '100 900', display: 'swap' }));

async function finishStartup() {
  const splash = document.getElementById('startup-screen');
  if (!splash) return;
  try {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden) {
      await Promise.allSettled(splash.getAnimations({ subtree: true }).map((animation) => animation.finished));
      if (!document.hidden) {
        await splash.animate([{ opacity: 1 }, { opacity: 0 }], {
          delay: 2000,
          duration: 160,
          easing: 'cubic-bezier(.23, 1, .32, 1)',
          fill: 'forwards',
        }).finished;
      }
    }
  } finally {
    splash.remove();
    document.getElementById('root').inert = false;
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
  const [showModelCenter, setShowModelCenter] = useState(false);
  const [password, setPassword] = useState(null);
  const [revision, setRevision] = useState(0);
  const [issue, setIssue] = useState(startupIssue);
  const [version, setVersion] = useState('');
  const [update, setUpdate] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);

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
    finishStartup().catch(() => {});
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
    <Reader t={translate} version={version} nativeFullscreen={nativeFullscreen} modelRevision={revision} onModelSettings={() => setShowModelCenter(true)} onPdfPassword={setPassword} />
    {password && <PdfPassword request={password} onClose={() => setPassword(null)} />}
    {showModelCenter && <ModelCenter version={version} availableUpdate={update} onClose={() => setShowModelCenter(false)}
      onConnectionsChange={() => setRevision((previous) => previous + 1)} onSave={() => {
      setShowModelCenter(false);
      setRevision((previous) => previous + 1);
    }} />}
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

loadLibrary().then(() => '', (error) => error.message).then((issue) => {
  createRoot(document.getElementById('root')).render(<App issue={issue} />);
});
