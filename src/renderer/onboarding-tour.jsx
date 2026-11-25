import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { readReaderSettings, subscribeReaderSettings, writeReaderSettings } from './reader-view.js';
import './onboarding-tour.css';

export const ONBOARDING_STORAGE_KEY = 'coreader:onboarding-v1';

export function shouldStartOnboarding() {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'done';
  } catch {
    return false;
  }
}

export function markOnboardingDone() {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'done');
  } catch {}
}

const STEPS = [
  {
    id: 'views',
    surface: 'library',
    title: '切换文献库视图',
    body: '点击顶栏的「列表 / 表格 / 视图」分段按钮，可按习惯切换论文展示方式。已内置示例论文《Attention Is All You Need》，稍后可直接打开体验。',
    selector: '.pl-views',
    actionHint: '点击「列表 / 表格 / 视图」任意一项即可完成',
  },
  {
    id: 'workspace',
    surface: 'reader',
    title: '认识阅读功能栏',
    body: '这里是阅读功能栏，汇集了划词翻译、阅读助手、论文分析、术语、批注与参考文献等工具；顶栏按钮还可切换停靠位置、列数、字号、管理卡片或收起功能栏。',
    selector: '.elr-feature-workspace',
    actionHint: '了解功能栏区域后点击「下一步」，也可先点顶栏按钮探索',
  },
  {
    id: 'columns',
    surface: 'reader',
    title: '功能栏单 / 双栏切换',
    body: '在右侧停靠时，点击功能栏顶部的列数按钮，可在单列与双列布局之间快速切换，同屏查看多个工具。',
    selector: '[data-tour="columns"]',
    actionHint: '点击单 / 双列切换按钮试试',
  },
  {
    id: 'dock',
    surface: 'reader',
    title: '切换功能栏停靠位置',
    body: '点击功能栏顶部的停靠位置按钮，可以将整个功能栏在「页面右侧」与「页面底部」之间自由切换。',
    selector: '[data-tour="dock"]',
    actionHint: '点击停靠位置按钮体验右侧 / 底部切换',
  },
  {
    id: 'drag',
    surface: 'reader',
    title: '拖拽功能卡片排序与悬浮',
    body: '功能栏内的每个模块都是独立卡片。按住卡片标题栏上下（或左右）拖动即可重排顺序；拖到阅读区松手可变为独立悬浮窗口。',
    selector: '.elr-feature-column .elr-card-toggle',
    actionHint: '试着拖动一张卡片调整顺序（也支持聚焦后按 Alt + 方向键）',
  },
  {
    id: 'compare',
    surface: 'reader',
    title: '开启双语对照翻译',
    body: '点击阅读工具栏的「对照翻译」按钮即可进入双语对照模式，段落与译文自动对齐并支持悬停联动高亮。',
    selector: '[data-tour="compare"]',
    actionHint: '点击「对照翻译」按钮体验对照阅读',
  },
];

function isElementVisible(el) {
  if (!el || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function queryVisible(selector) {
  const nodes = document.querySelectorAll(selector);
  for (const node of nodes) {
    if (isElementVisible(node)) return node;
  }
  return null;
}

function findPaperToOpen() {
  const items = document.querySelectorAll('.pl-list li, .pl-gallery li, .pl-table tbody tr');
  let firstVisible = null;
  for (const item of items) {
    if (!isElementVisible(item)) continue;
    if (!firstVisible) firstVisible = item;
    if (/attention is all you need/i.test(item.textContent || '')) return item;
  }
  return firstVisible || queryVisible('.pl-sidebar-actions');
}

function detectEnvironment() {
  const inLibrary = Boolean(queryVisible('.pl-home'));
  const hasReader = Boolean(queryVisible('.elr-reading-space'));
  return { inLibrary, inReader: !inLibrary && hasReader };
}

function computeTooltipPosition(targetRect, cardW, cardH) {
  const pad = 16;
  const gap = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!targetRect) {
    return {
      left: Math.max(pad, (vw - cardW) / 2),
      top: Math.max(pad, Math.min(vh - cardH - pad, vh * 0.28)),
    };
  }

  // Try placing below, above, left, right in order of best fit without covering targetRect.
  const candidates = [
    // Below
    { left: targetRect.left + targetRect.width / 2 - cardW / 2, top: targetRect.bottom + gap },
    // Above
    { left: targetRect.left + targetRect.width / 2 - cardW / 2, top: targetRect.top - cardH - gap },
    // Left
    { left: targetRect.left - cardW - gap, top: targetRect.top + targetRect.height / 2 - cardH / 2 },
    // Right
    { left: targetRect.right + gap, top: targetRect.top + targetRect.height / 2 - cardH / 2 },
  ];

  for (const c of candidates) {
    const clampedLeft = Math.max(pad, Math.min(vw - cardW - pad, c.left));
    const clampedTop = Math.max(pad, Math.min(vh - cardH - pad, c.top));
    const overlapsX = clampedLeft < targetRect.right + 6 && clampedLeft + cardW > targetRect.left - 6;
    const overlapsY = clampedTop < targetRect.bottom + 6 && clampedTop + cardH > targetRect.top - 6;
    if (!(overlapsX && overlapsY)) {
      return { left: clampedLeft, top: clampedTop };
    }
  }

  return {
    left: Math.max(pad, Math.min(vw - cardW - pad, targetRect.left)),
    top: Math.max(pad, Math.min(vh - cardH - pad, targetRect.bottom + gap)),
  };
}

export function OnboardingTour({ active, onFinish }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState(() => new Set());
  const [targetRect, setTargetRect] = useState(null);
  const [env, setEnv] = useState(() => detectEnvironment());
  const [waitingMode, setWaitingMode] = useState(''); // '' | 'need-paper' | 'need-library' | 'need-right-dock' | 'need-expand-workspace'
  const cardRef = useRef(null);
  const [cardPos, setCardPos] = useState({ left: 24, top: 24 });

  const step = STEPS[stepIndex] || STEPS[0];
  const isDone = completed.has(step.id);

  // Reset state whenever tour is restarted.
  useEffect(() => {
    if (!active) return;
    const currentEnv = detectEnvironment();
    setEnv(currentEnv);
    setCompleted(new Set());
    // If replayed while already reading a PDF, jump straight to reader step 2 (index 1) or start from 0.
    setStepIndex(currentEnv.inReader ? 1 : 0);
  }, [active]);

  // Mark step completed helper.
  function markStepDone(id) {
    setCompleted((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  // Track target rect & current screen state continuously while tour is active.
  useEffect(() => {
    if (!active) return;
    let raf = 0;

    const locate = () => {
      raf = 0;
      const currentEnv = detectEnvironment();
      setEnv(currentEnv);

      let el = null;
      let mode = '';

      if (step.surface === 'library' && !currentEnv.inLibrary) {
        mode = 'need-library';
        el = queryVisible('.elr-home-btn, button[aria-label*="主页"], button[title*="论文库"]');
      } else if (step.surface === 'reader' && !currentEnv.inReader) {
        mode = 'need-paper';
        el = findPaperToOpen();
      } else {
        el = queryVisible(step.selector);
        if (!el && step.id === 'columns') {
          const settings = readReaderSettings();
          if (settings.dock === 'bottom') {
            mode = 'need-right-dock';
            el = queryVisible('[data-tour="dock"]');
          } else {
            const stowedTab = queryVisible('.elr-workspace-tab');
            if (stowedTab) {
              mode = 'need-expand-workspace';
              el = stowedTab;
            }
          }
        } else if (!el && (step.id === 'workspace' || step.id === 'drag' || step.id === 'dock')) {
          const stowedTab = queryVisible('.elr-workspace-tab');
          if (stowedTab) {
            mode = 'need-expand-workspace';
            el = stowedTab;
          }
        }
      }

      setWaitingMode(mode);
      if (el) {
        const r = el.getBoundingClientRect();
        setTargetRect((prev) => {
          if (prev && Math.abs(prev.left - r.left) < 1 && Math.abs(prev.top - r.top) < 1
            && Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1) {
            return prev;
          }
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        });
      } else {
        setTargetRect(null);
      }
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(locate);
    };

    locate();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'style', 'aria-pressed', 'data-columns'],
    });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const interval = window.setInterval(schedule, 300);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.clearInterval(interval);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [active, step]);

  // Listen for actual user interactions corresponding to each step!
  useEffect(() => {
    if (!active) return;

    const initialSettings = readReaderSettings();
    let prevDock = initialSettings.dock;
    let prevCols = initialSettings.featureColumns;
    let prevOrder = JSON.stringify(initialSettings.sectionOrder || []);
    let prevFloating = JSON.stringify(Object.keys(initialSettings.floatingCards || {}));

    const unsubscribe = subscribeReaderSettings(() => {
      const cur = readReaderSettings();
      if (cur.dock !== prevDock) {
        prevDock = cur.dock;
        if (step.id === 'dock') markStepDone('dock');
      }
      if (cur.featureColumns !== prevCols) {
        prevCols = cur.featureColumns;
        if (step.id === 'columns') markStepDone('columns');
      }
      const nextOrder = JSON.stringify(cur.sectionOrder || []);
      const nextFloating = JSON.stringify(Object.keys(cur.floatingCards || {}));
      if (nextOrder !== prevOrder || nextFloating !== prevFloating) {
        prevOrder = nextOrder;
        prevFloating = nextFloating;
        if (step.id === 'drag') markStepDone('drag');
      }
    });

    const onClickCapture = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (step.id === 'views' && target.closest('.pl-views button')) {
        markStepDone('views');
      } else if (step.id === 'workspace' && target.closest('.elr-feature-workspace')) {
        markStepDone('workspace');
      } else if (step.id === 'columns' && target.closest('[data-tour="columns"]')) {
        markStepDone('columns');
      } else if (step.id === 'dock' && target.closest('[data-tour="dock"]')) {
        markStepDone('dock');
      } else if (step.id === 'compare' && target.closest('[data-tour="compare"]')) {
        markStepDone('compare');
      }
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        markOnboardingDone();
        onFinish();
      }
    };

    document.addEventListener('click', onClickCapture, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      unsubscribe();
      document.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [active, step, onFinish]);

  // Position tooltip card relative to spotlight target.
  useLayoutEffect(() => {
    if (!active) return;
    const card = cardRef.current;
    const cardW = card?.offsetWidth || 320;
    const cardH = card?.offsetHeight || 180;
    setCardPos(computeTooltipPosition(targetRect, cardW, cardH));
  }, [active, targetRect, stepIndex, waitingMode, isDone]);

  if (!active) return null;

  function finishTour() {
    markOnboardingDone();
    onFinish();
  }

  function goNext() {
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
    else finishTour();
  }

  function goPrev() {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  const pad = 6;
  const displayTitle = waitingMode === 'need-paper'
    ? '打开一篇论文以继续引导'
    : waitingMode === 'need-right-dock'
      ? '先将功能栏切回右侧'
      : waitingMode === 'need-expand-workspace'
        ? '先展开功能栏'
        : step.title;

  const displayBody = waitingMode === 'need-paper'
    ? '点击已内置的示例论文《Attention Is All You Need》（或任意本地 PDF）进入阅读界面，随后将依次引导体验功能栏、单双栏、停靠位置、卡片拖拽与对照翻译。'
    : waitingMode === 'need-right-dock'
      ? '单 / 双列切换仅在功能栏停靠在右侧时可用。点击下方按钮或高亮图标切回右侧即可体验。'
      : waitingMode === 'need-expand-workspace'
        ? '当前功能栏处于收起状态，点击高亮的「功能栏」标签展开后即可继续。'
        : step.body;

  const lastStep = stepIndex === STEPS.length - 1;

  return createPortal(
    <div className="elr-tour-layer" role="region" aria-label="新手功能引导">
      {targetRect && (
        <div
          className="elr-tour-spotlight"
          aria-hidden="true"
          style={{
            transform: `translate3d(${Math.max(0, targetRect.left - pad)}px, ${Math.max(0, targetRect.top - pad)}px, 0)`,
            width: targetRect.width + pad * 2,
            height: targetRect.height + pad * 2,
          }}
        />
      )}
      <aside
        ref={cardRef}
        className="elr-tour-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="elr-tour-title"
        style={{ transform: `translate3d(${Math.round(cardPos.left)}px, ${Math.round(cardPos.top)}px, 0)` }}
      >
        <div className="elr-tour-head">
          <span className="elr-tour-step">新手引导 · {stepIndex + 1} / {STEPS.length}</span>
          <button type="button" className="elr-tour-skip" onClick={finishTour}>跳过</button>
        </div>
        <h3 id="elr-tour-title" className="elr-tour-title">{displayTitle}</h3>
        <p className="elr-tour-body">{displayBody}</p>
        {waitingMode === 'need-right-dock' ? (
          <div className="elr-tour-quick">
            <button type="button" className="elr-tour-btn primary" onClick={() => writeReaderSettings({ dock: 'right' })}>
              切换到右侧停靠
            </button>
          </div>
        ) : !waitingMode && (
          <div className={'elr-tour-status' + (isDone ? ' is-done' : '')} role="status" aria-live="polite">
            {isDone ? '✓ 已体验此功能' : step.actionHint}
          </div>
        )}
        <div className="elr-tour-foot">
          <div className="elr-tour-dots" aria-hidden="true">
            {STEPS.map((item, idx) => (
              <span key={item.id} data-active={idx === stepIndex} data-done={completed.has(item.id)} />
            ))}
          </div>
          <div className="elr-tour-actions">
            {stepIndex > 0 && <button type="button" className="elr-tour-btn" onClick={goPrev}>上一步</button>}
            <button type="button" className="elr-tour-btn primary" onClick={goNext}>
              {lastStep ? '完成引导' : '下一步'}
            </button>
          </div>
        </div>
      </aside>
    </div>,
    document.body
  );
}
