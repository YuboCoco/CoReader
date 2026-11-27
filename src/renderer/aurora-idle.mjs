const PRISM_TONES = new Set(['prism-light', 'prism-dark']);

export function normalizeAuroraMode(mode) {
  if (mode === 'quality' || mode === 'off') return mode;
  return 'smooth';
}

export function installAuroraIdle(readSettings, subscribe) {
  const root = document.documentElement;
  let installed = true;
  let idleTimer = null;
  let sampleTimer = null;
  let sampleRaf = null;
  let lastPointerMove = 0;
  let activePrism = false;
  let mode = 'smooth';
  let idleDelayMs = 1200;

  const clearTimers = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (sampleTimer) {
      clearTimeout(sampleTimer);
      sampleTimer = null;
    }
    if (sampleRaf) {
      cancelAnimationFrame(sampleRaf);
      sampleRaf = null;
    }
  };

  const setPausedForVisibility = () => {
    if (!activePrism) {
      delete root.dataset.elrAuroraPaused;
      return;
    }
    if (document.hidden || !document.hasFocus()) {
      root.dataset.elrAuroraPaused = 'on';
    } else {
      delete root.dataset.elrAuroraPaused;
    }
  };

  const markInteracting = () => {
    if (!activePrism || mode === 'off') return;
    if (root.dataset.elrInteracting !== 'on') {
      root.dataset.elrInteracting = 'on';
    }
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      delete root.dataset.elrInteracting;
    }, idleDelayMs);
  };

  const onPointerMove = () => {
    if (!activePrism) return;
    const now = performance.now();
    if (now - lastPointerMove < 120) return;
    lastPointerMove = now;
    markInteracting();
  };

  const startAdaptiveProbe = () => {
    if (sampleTimer) clearTimeout(sampleTimer);
    if (sampleRaf) cancelAnimationFrame(sampleRaf);
    if (!activePrism || mode !== 'smooth') {
      delete root.dataset.elrAuroraTier;
      idleDelayMs = 1200;
      return;
    }

    sampleTimer = setTimeout(() => {
      sampleTimer = null;
      if (!activePrism || mode !== 'smooth' || document.hidden) return;
      const start = performance.now();
      let prev = start;
      const deltas = [];
      const tick = (now) => {
        if (!activePrism || mode !== 'smooth') return;
        const dt = now - prev;
        prev = now;
        if (dt > 0 && dt < 250) deltas.push(dt);
        if (now - start < 2000) {
          sampleRaf = requestAnimationFrame(tick);
        } else {
          sampleRaf = null;
          if (deltas.length < 10) return;
          const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
          if (avg > 28) {
            root.dataset.elrAuroraTier = '2';
            idleDelayMs = 2500;
          } else if (avg >= 18) {
            root.dataset.elrAuroraTier = '1';
            idleDelayMs = 2500;
          } else {
            root.dataset.elrAuroraTier = '0';
            idleDelayMs = 1200;
          }
        }
      };
      sampleRaf = requestAnimationFrame(tick);
    }, 350);
  };

  const sync = () => {
    if (!installed) return;
    const settings = readSettings?.() || {};
    const tone = settings.uiTone || 'default';
    const nextPrism = PRISM_TONES.has(tone) && !settings.bingWallpaperEnabled;
    const nextMode = normalizeAuroraMode(settings.auroraMode);
    const changed = nextPrism !== activePrism || nextMode !== mode;

    activePrism = nextPrism;
    mode = nextMode;

    if (!activePrism) {
      clearTimers();
      delete root.dataset.elrInteracting;
      delete root.dataset.elrAuroraPaused;
      delete root.dataset.elrAuroraMode;
      delete root.dataset.elrAuroraTier;
      idleDelayMs = 1200;
      return;
    }

    root.dataset.elrAuroraMode = mode;
    setPausedForVisibility();
    if (changed) startAdaptiveProbe();
  };

  sync();
  const unsub = typeof subscribe === 'function' ? subscribe(sync) : () => {};

  const opts = { passive: true, capture: true };
  window.addEventListener('pointerdown', markInteracting, opts);
  window.addEventListener('pointermove', onPointerMove, opts);
  window.addEventListener('wheel', markInteracting, opts);
  document.addEventListener('scroll', markInteracting, opts);
  window.addEventListener('keydown', markInteracting, opts);
  window.addEventListener('touchstart', markInteracting, opts);
  window.addEventListener('touchmove', markInteracting, opts);
  window.addEventListener('blur', setPausedForVisibility);
  window.addEventListener('focus', setPausedForVisibility);
  document.addEventListener('visibilitychange', setPausedForVisibility);

  return () => {
    installed = false;
    clearTimers();
    unsub();
    window.removeEventListener('pointerdown', markInteracting, opts);
    window.removeEventListener('pointermove', onPointerMove, opts);
    window.removeEventListener('wheel', markInteracting, opts);
    document.removeEventListener('scroll', markInteracting, opts);
    window.removeEventListener('keydown', markInteracting, opts);
    window.removeEventListener('touchstart', markInteracting, opts);
    window.removeEventListener('touchmove', markInteracting, opts);
    window.removeEventListener('blur', setPausedForVisibility);
    window.removeEventListener('focus', setPausedForVisibility);
    document.removeEventListener('visibilitychange', setPausedForVisibility);
  };
}
