import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Reader, installCss, setHostScheme, translate } from './reader-view.js';
import { loadLibrary } from './desktop-runtime.js';
import { ModelCenter } from './model-center.jsx';
import './reader.css';

const api = window.reader;
const fonts = import.meta.glob('../../assets/fonts/MiSansVF.ttf', { eager: true, query: '?url', import: 'default' });
const miSans = fonts['../../assets/fonts/MiSansVF.ttf'];
if (miSans) document.fonts.add(new FontFace('MiSans', 'url("' + miSans + '")', { weight: '100 900', display: 'swap' }));

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

  useEffect(() => {
    api.windowReady().catch(() => {});
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
      window.removeEventListener('reader-storage-error', showError);
      document.removeEventListener('click', linkClick, true);
    };
  }, []);

  return <div className="desktop-app">
    {issue && <aside className="desktop-error" role="alert">
      <span>{issue}</span><button className="quiet" aria-label="关闭提示" onClick={() => setIssue('')}>×</button>
    </aside>}
    <Reader t={translate} modelRevision={revision} onModelSettings={() => setShowModelCenter(true)} onPdfPassword={setPassword} />
    {password && <PdfPassword request={password} onClose={() => setPassword(null)} />}
    {showModelCenter && <ModelCenter onClose={() => setShowModelCenter(false)}
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
