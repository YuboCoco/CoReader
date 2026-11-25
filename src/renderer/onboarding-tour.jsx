import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import appIcon from '../../assets/coreader-cr.png';
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

const WORKSPACE_HEAD_BUTTONS = [
  { selector: '[data-tour="dock"]', name: '停靠位置', desc: '在「侧边」与「底部」间切换功能栏（可在设置中切换左右）' },
  { selector: '[data-tour="columns"]', name: '单 / 双列', desc: '侧边停靠时切换单列或双列并排显示' },
  { selector: '[data-tour="font"]', name: '卡片字号', desc: '调节功能卡片内的文字大小或恢复默认' },
  { selector: '[data-tour="bulk"]', name: '折叠 / 展开', desc: '一键全部缩小或展开栏内所有卡片' },
  { selector: '[data-tour="layout"]', name: '卡片布局', desc: '应用默认布局，或保存/切换自定义布局' },
  { selector: '[data-tour="manage"]', name: '管理卡片', desc: '开关、显示或隐藏各类功能卡片' },
  { selector: '[data-tour="stow"]', name: '收起功能栏', desc: '将功能栏贴边收起，随时点击边缘展开' },
];

const STEPS = [
  {
    id: 'library-sidebar',
    surface: 'library',
    title: '左侧：分类导航与导入区',
    body: '左侧边栏用于按「全部论文 / 最近阅读 / 未分类」或自定义分类管理文献，也可将论文拖入左侧分类整理；底部可随时打开单个 PDF、导入文件夹或进入设置。',
    selector: '.pl-sidebar',
    actionHint: '了解左侧区域后点击「下一步」，也可先点一下分类或按钮试试',
  },
  {
    id: 'library-main',
    surface: 'library',
    title: '右侧：论文展示与操作区',
    body: '右侧主区域用于浏览全部文献、查看阅读进度与标签、管理详情，点击任意一篇论文即可进入阅读界面。',
    selector: '.pl-main',
    actionHint: '了解右侧区域后点击「下一步」，也可以点击列表或勾选框试试',
  },
  {
    id: 'library-search',
    surface: 'library',
    title: '搜索与筛选论文',
    body: '在搜索框输入标题、作者、DOI / arXiv 号或标签，即可实时检索论文；右侧还搭配了标签、阅读状态筛选与排序下拉菜单。',
    selector: '.pl-search',
    actionHint: '点击搜索框输入关键词体验，或直接点击「下一步」',
  },
  {
    id: 'views',
    surface: 'library',
    title: '切换文献库视图',
    body: '点击顶栏的「列表 / 表格 / 视图」分段按钮，可按习惯在精简列表、详细表格或首页封面平铺三种模式之间切换。',
    selector: '.pl-views',
    actionHint: '点击「列表 / 表格 / 视图」任意一项即可完成',
  },
  {
    id: 'reader-space',
    surface: 'reader',
    title: '认识阅读区域',
    body: '这里是 PDF 原文与双语对照的主阅读区：选中文本可立即划词翻译、解释术语、高亮批注或引用提问；悬停插图与公式可直接解析；角落的四个按钮可打开目录、文内搜索、设置与返回论文库。',
    selector: '.elr-reading-space',
    actionHint: '了解阅读主区后点击「下一步」',
  },
  {
    id: 'reader-capsule',
    surface: 'reader',
    title: '认识顶栏阅读工具',
    body: '顶部悬浮工具栏集成了常用阅读操作（从左到右）：翻页与页码、缩放比例与预设菜单、「对照翻译」（开启双语并排与段落联动）、框选截图解析，以及更多单双三栏排版与全屏选项。',
    selector: '.elr-reader-capsule',
    actionHint: '试着点击「对照翻译」或顶栏任意功能按钮体验',
  },
  {
    id: 'reader-workspace',
    surface: 'reader',
    title: '认识功能栏区域',
    body: '这一侧是阅读功能栏工作区，集中承载所有辅助阅读工具。拖动阅读区与功能栏之间的分隔条可调节宽度或高度。',
    selector: '.elr-feature-workspace',
    actionHint: '了解功能栏区域后点击「下一步」',
  },
  {
    id: 'workspace-head',
    surface: 'reader',
    title: '功能栏顶部按钮（从左到右）',
    body: '鼠标悬停下方任意一项可单独定位到对应按钮：',
    selector: '.elr-workspace-head',
    items: WORKSPACE_HEAD_BUTTONS,
    actionHint: '悬停查看位置，或直接点击顶栏任意按钮体验',
  },
  {
    id: 'workspace-cards',
    surface: 'reader',
    title: '认识功能卡片',
    body: '功能栏由多张独立工具卡片组成，包括划词翻译、阅读助手、论文分析、参考文献、内容解析、术语与高亮批注。点击卡片标题即可折叠或展开，拖动卡片下边缘或左右边线可调节单卡尺寸。',
    selector: '.elr-feature-grid',
    actionHint: '试着点击任意卡片标题栏折叠/展开，或直接点击「下一步」',
  },
  {
    id: 'drag',
    surface: 'reader',
    title: '拖拽卡片排序与悬浮窗口',
    body: '按住任意卡片标题栏拖动即可调整排列顺序；拖到阅读区松手，卡片会变为自由移动、四边与四角均可拉动缩放的独立悬浮窗口（也支持聚焦后按 Alt + 方向键排序）。',
    selector: '.elr-feature-column .elr-card-toggle',
    actionHint: '试着拖动一张卡片调整顺序或拖出为悬浮窗口',
  },
];

function isElementVisible(el) {
  if (!el || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function queryVisible(selector) {
  if (!selector) return null;
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

function computeTooltipPosition(targetRect, cardW, cardH, centerInViewport = false) {
  const pad = 16;
  const gap = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (centerInViewport) {
    return {
      left: Math.max(pad, (vw - cardW) / 2),
      top: Math.max(pad, Math.min(vh - cardH - pad, (vh - cardH) / 2)),
    };
  }

  if (!targetRect) {
    return {
      left: Math.max(pad, (vw - cardW) / 2),
      top: Math.max(pad, Math.min(vh - cardH - pad, vh * 0.28)),
    };
  }

  // Try placing below, above, left, right in order of best fit without covering targetRect.
  const candidates = [
    { left: targetRect.left + targetRect.width / 2 - cardW / 2, top: targetRect.bottom + gap },
    { left: targetRect.left + targetRect.width / 2 - cardW / 2, top: targetRect.top - cardH - gap },
    { left: targetRect.left - cardW - gap, top: targetRect.top + targetRect.height / 2 - cardH / 2 },
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

  // Fallback for full-pane targets (.pl-main / .elr-reading-space): float cleanly inside the center open area.
  const centerInsideLeft = targetRect.left + (targetRect.width - cardW) / 2;
  const openInsideTop = targetRect.top + Math.max(120, (targetRect.height - cardH) * 0.44);
  return {
    left: Math.max(pad, Math.min(vw - cardW - pad, centerInsideLeft)),
    top: Math.max(pad, Math.min(vh - cardH - pad, openInsideTop)),
  };
}

export function OnboardingTour({ active, onFinish }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState(() => new Set());
  const [targetRect, setTargetRect] = useState(null);
  const [hoveredSubSelector, setHoveredSubSelector] = useState('');
  const [waitingMode, setWaitingMode] = useState(''); // '' | 'need-paper' | 'need-library' | 'need-expand-workspace'
  const cardRef = useRef(null);
  const [cardPos, setCardPos] = useState({ left: 24, top: 24 });

  const step = STEPS[stepIndex] || STEPS[0];
  const isDone = completed.has(step.id);

  // Reset state whenever tour is restarted.
  useEffect(() => {
    if (!active) return;
    const currentEnv = detectEnvironment();
    setCompleted(new Set());
    setHoveredSubSelector('');
    const firstReaderIdx = STEPS.findIndex((item) => item.surface === 'reader');
    setStepIndex(currentEnv.inReader && firstReaderIdx >= 0 ? firstReaderIdx : 0);
  }, [active]);

  useEffect(() => {
    setHoveredSubSelector('');
  }, [stepIndex]);

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
      let el = null;
      let mode = '';

      if (step.surface === 'library' && !currentEnv.inLibrary) {
        mode = 'need-library';
        el = queryVisible('.elr-home-btn, button[aria-label*="主页"], button[title*="论文库"]');
      } else if (step.surface === 'reader' && !currentEnv.inReader) {
        mode = 'need-paper';
        el = findPaperToOpen();
      } else {
        const subEl = hoveredSubSelector ? queryVisible(hoveredSubSelector) : null;
        el = subEl || queryVisible(step.selector);
        if (!el && ['reader-workspace', 'workspace-head', 'workspace-cards', 'drag'].includes(step.id)) {
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
  }, [active, step, hoveredSubSelector]);

  // Listen for actual user interactions corresponding to each step.
  useEffect(() => {
    if (!active) return;

    const initialSettings = readReaderSettings();
    let prevOrder = JSON.stringify(initialSettings.sectionOrder || []);
    let prevFloating = JSON.stringify(Object.keys(initialSettings.floatingCards || {}));

    const unsubscribe = subscribeReaderSettings(() => {
      const cur = readReaderSettings();
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
      if (step.id === 'library-sidebar' && target.closest('.pl-sidebar')) {
        markStepDone('library-sidebar');
      } else if (step.id === 'library-main' && target.closest('.pl-main')) {
        markStepDone('library-main');
      } else if (step.id === 'library-search' && target.closest('.pl-search')) {
        markStepDone('library-search');
      } else if (step.id === 'views' && target.closest('.pl-views button')) {
        markStepDone('views');
      } else if (step.id === 'reader-space' && target.closest('.elr-reading-space')) {
        markStepDone('reader-space');
      } else if (step.id === 'reader-capsule' && target.closest('.elr-reader-capsule button, .elr-reader-capsule input')) {
        markStepDone('reader-capsule');
      } else if (step.id === 'reader-workspace' && target.closest('.elr-feature-workspace')) {
        markStepDone('reader-workspace');
      } else if (step.id === 'workspace-head' && target.closest('.elr-workspace-head button')) {
        markStepDone('workspace-head');
      } else if (step.id === 'workspace-cards' && target.closest('.elr-feature-grid .elr-sec')) {
        markStepDone('workspace-cards');
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

  // Position tooltip card relative to spotlight target (keep card steady when sub-hovering buttons inside workspace-head).
  useLayoutEffect(() => {
    if (!active) return;
    if (hoveredSubSelector && step.id === 'workspace-head') return;
    const card = cardRef.current;
    const centerDemo = step.id === 'drag' && !waitingMode;
    const cardW = card?.offsetWidth || (centerDemo ? 500 : 352);
    const cardH = card?.offsetHeight || (centerDemo ? 340 : 220);
    setCardPos(computeTooltipPosition(targetRect, cardW, cardH, centerDemo));
  }, [active, targetRect, stepIndex, waitingMode, isDone, hoveredSubSelector, step.id]);

  if (!active) return null;

  const waitingBlocked = waitingMode === 'need-paper' || waitingMode === 'need-library' || waitingMode === 'need-expand-workspace';
  const showDragDemo = step.id === 'drag' && !waitingMode;

  function finishTour() {
    markOnboardingDone();
    onFinish();
  }

  function goNext() {
    if (waitingBlocked) return;
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
    else finishTour();
  }

  function goPrev() {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  const pad = 6;
  const displayTitle = waitingMode === 'need-paper'
    ? '打开一篇论文以继续引导'
    : waitingMode === 'need-library'
      ? '先返回论文库'
      : waitingMode === 'need-expand-workspace'
        ? '先展开功能栏'
        : step.title;

  const displayBody = waitingMode === 'need-paper'
    ? '点击已内置的示例论文《Attention Is All You Need》（或任意本地 PDF）进入阅读界面，随后将依次引导阅读区、顶栏工具、功能栏与卡片操作。'
    : waitingMode === 'need-library'
      ? '当前步骤位于论文库界面，点击左下角高亮的「返回论文库」图标即可继续。'
      : waitingMode === 'need-expand-workspace'
        ? '当前功能栏处于收起状态，点击高亮的「功能栏」标签展开后即可继续。'
        : step.body;

  const lastStep = stepIndex === STEPS.length - 1;
  let spotStyle = null;
  if (targetRect) {
    const spotLeft = Math.max(4, targetRect.left - pad);
    const spotTop = Math.max(4, targetRect.top - pad);
    const spotRight = Math.min(window.innerWidth - 4, targetRect.right + pad);
    const spotBottom = Math.min(window.innerHeight - 4, targetRect.bottom + pad);
    spotStyle = {
      transform: `translate3d(${spotLeft}px, ${spotTop}px, 0)`,
      width: Math.max(16, spotRight - spotLeft),
      height: Math.max(16, spotBottom - spotTop),
    };
  }

  return createPortal(
    <div className="elr-tour-layer" role="region" aria-label="新手功能引导">
      {spotStyle && (
        <div
          className="elr-tour-spotlight"
          aria-hidden="true"
          style={spotStyle}
        />
      )}
      <aside
        ref={cardRef}
        className={'elr-tour-card' + (showDragDemo ? ' is-demo-stage' : '')}
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
        {showDragDemo && (
          <div className="elr-drag-demo-grid" aria-hidden="true">
            <div className="elr-drag-demo-scene">
              <div className="elr-drag-demo-stage is-float-stage">
                <div className="elr-demo-pdf">
                  <span className="elr-demo-page-tag">阅读页面</span>
                  <div className="elr-demo-lines"><i /><i /><i /><i /></div>
                  <div className="elr-demo-float-result">
                    <div className="elr-demo-mini-head">阅读助手 · 悬浮窗</div>
                    <div className="elr-demo-mini-lines"><i /><i /></div>
                  </div>
                </div>
                <div className="elr-demo-dock">
                  <div className="elr-demo-mini-card is-a">划词翻译</div>
                  <div className="elr-demo-mini-card is-b is-dragged-to-pdf">阅读助手</div>
                  <div className="elr-demo-mini-card is-c">论文分析</div>
                </div>
                <span className="elr-demo-pointer is-float-pointer" />
              </div>
              <span className="elr-drag-demo-caption">1. 拖到阅读页面 → 独立悬浮窗</span>
            </div>
            <div className="elr-drag-demo-scene">
              <div className="elr-drag-demo-stage is-reorder-stage">
                <div className="elr-demo-reorder-col">
                  <div className="elr-demo-slot is-card-a">卡片 A · 拖动</div>
                  <div className="elr-demo-slot is-card-b">卡片 B</div>
                  <div className="elr-demo-drop-line" />
                  <div className="elr-demo-slot is-card-c">卡片 C</div>
                </div>
                <span className="elr-demo-pointer is-reorder-pointer" />
              </div>
              <span className="elr-drag-demo-caption">2. 卡片之间拖拽 → 互相换位</span>
            </div>
          </div>
        )}
        {!waitingMode && step.items && (
          <ol className="elr-tour-items" onMouseLeave={() => setHoveredSubSelector('')}>
            {step.items.map((item, idx) => (
              <li
                key={item.selector}
                className={hoveredSubSelector === item.selector ? 'is-focused' : undefined}
                onMouseEnter={() => setHoveredSubSelector(item.selector)}
                onFocus={() => setHoveredSubSelector(item.selector)}
                onBlur={() => setHoveredSubSelector('')}
                tabIndex={0}
              >
                <span className="elr-tour-num" aria-hidden="true">{idx + 1}</span>
                <span><strong>{item.name}：</strong>{item.desc}</span>
              </li>
            ))}
          </ol>
        )}
        <div className={'elr-tour-status' + (isDone ? ' is-done' : '')} role="status" aria-live="polite">
          {waitingMode === 'need-paper'
            ? '请先点击高亮的论文进入阅读界面，才能继续下一步'
            : waitingMode === 'need-library'
              ? '请先点击左下角返回论文库，才能继续下一步'
              : waitingMode === 'need-expand-workspace'
                ? '请先点击「功能栏」标签展开工作区，才能继续下一步'
                : (isDone ? '✓ 已体验此功能' : step.actionHint)}
        </div>
        <div className="elr-tour-foot">
          <div className="elr-tour-dots" aria-hidden="true">
            {STEPS.map((item, idx) => (
              <span key={item.id} data-active={idx === stepIndex} data-done={completed.has(item.id)} />
            ))}
          </div>
          <div className="elr-tour-actions">
            {stepIndex > 0 && <button type="button" className="elr-tour-btn" onClick={goPrev}>上一步</button>}
            <button type="button" className="elr-tour-btn primary" disabled={waitingBlocked} onClick={goNext}>
              {lastStep ? '完成引导' : '下一步'}
            </button>
          </div>
        </div>
      </aside>
    </div>,
    document.body
  );
}

export function WelcomeDialog({ active, onStart, onSkip }) {
  const startRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    startRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        markOnboardingDone();
        onSkip();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, onSkip]);

  if (!active) return null;

  function handleSkip() {
    markOnboardingDone();
    onSkip();
  }

  return createPortal(
    <div className="elr-welcome-backdrop" role="presentation">
      <section
        className="elr-welcome-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="elr-welcome-title"
        aria-describedby="elr-welcome-blessing"
      >
        <div className="elr-welcome-head">
          <img className="elr-welcome-icon" src={appIcon} alt="" width={46} height={46} draggable={false} />
          <div className="elr-welcome-titles">
            <span className="elr-welcome-eyebrow">初次见面 · CoReader</span>
            <h2 id="elr-welcome-title" className="elr-welcome-title">欢迎开启你的文献阅读之旅</h2>
          </div>
        </div>
        <blockquote id="elr-welcome-blessing" className="elr-welcome-blessing">
          愿你在英文文献的字里行间从容前行，每一次翻阅都有灵感落笔，每一次追问都更近所求。愿这份安静专注的阅读体验，陪你把好想法一点点读透、写实。
        </blockquote>
        <p className="elr-welcome-note">
          我们已在论文库中为你预置经典示例论文《Attention Is All You Need》。花约 1 分钟跟随新手引导，即可熟悉论文库搜索与视图、阅读主区、顶栏工具、功能栏按钮与卡片拖拽。
        </p>
        <div className="elr-welcome-actions">
          <button type="button" className="elr-welcome-btn" onClick={handleSkip}>跳过</button>
          <button ref={startRef} type="button" className="elr-welcome-btn primary" onClick={onStart}>开始新手引导</button>
        </div>
        <p className="elr-welcome-footnote">后续可随时在「设置 → 阅读设置」中重新查看引导</p>
      </section>
    </div>,
    document.body
  );
}
