import React, { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { CardRingEngine, RING_DEFAULTS } from './card-ring-engine.mjs';
import './card-ring.css';

export const AccountCardRing = React.forwardRef(function AccountCardRing(
  { items, onFrontChange, onCardActivate },
  ref
) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const itemsRef = useRef(items);
  const callbacksRef = useRef({ onFrontChange, onCardActivate });
  const [webglError, setWebglError] = useState(false);

  itemsRef.current = items;
  callbacksRef.current = { onFrontChange, onCardActivate };

  useImperativeHandle(ref, () => ({
    stepBy(delta) {
      engineRef.current?.stepBy(delta);
    },
    goToProvider(providerIndex) {
      engineRef.current?.goToProvider(providerIndex);
    },
  }), []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const schemeMq = window.matchMedia('(prefers-color-scheme: dark)');

    const readBgColor = () => {
      const host = stage.closest('dialog') || document.documentElement;
      return getComputedStyle(host).getPropertyValue('--dsw-alias-bg-overlay').trim()
        || getComputedStyle(host).backgroundColor;
    };

    let engine;
    try {
      engine = new CardRingEngine(canvas, {
        items: itemsRef.current,
        initialView: 'outside',
        params: RING_DEFAULTS,
        reducedMotion: reducedMq.matches,
        bgColor: readBgColor(),
        onFrontChange: (cardIndex, item) => callbacksRef.current.onFrontChange?.(cardIndex, item),
        onCardClick: (item, cardIndex) => callbacksRef.current.onCardActivate?.(item, cardIndex),
      });
    } catch {
      setWebglError(true);
      return;
    }
    engineRef.current = engine;

    const resizeObserver = new ResizeObserver(() => {
      engine.resize();
      engine.setBgColor(readBgColor());
    });
    resizeObserver.observe(stage);

    const onReducedChange = (event) => engine.setReducedMotion(event.matches);
    const onSchemeChange = () => engine.setBgColor(readBgColor());
    reducedMq.addEventListener('change', onReducedChange);
    schemeMq.addEventListener('change', onSchemeChange);

    const themeObserver = new MutationObserver(() => engine.setBgColor(readBgColor()));
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-desktop-scheme', 'class', 'style'],
    });
    const hostDialog = stage.closest('dialog');
    if (hostDialog) {
      themeObserver.observe(hostDialog, {
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    }

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      reducedMq.removeEventListener('change', onReducedChange);
      schemeMq.removeEventListener('change', onSchemeChange);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.updateItems(items);
  }, [items]);

  function onKeyDown(event) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      engineRef.current?.stepBy(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      engineRef.current?.stepBy(1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const idx = engineRef.current?.lastFront ?? 0;
      const list = itemsRef.current;
      if (list.length) callbacksRef.current.onCardActivate?.(list[idx % list.length], idx);
    }
  }

  return <div
    ref={stageRef}
    className="connection-ring-stage"
    tabIndex={0}
    role="region"
    aria-roledescription="卡片环"
    aria-label="账号连接卡片环，使用左右方向键或拖拽切换，点击或按回车打开当前账号设置"
    onKeyDown={onKeyDown}
  >
    {webglError
      ? <div className="connection-ring-fallback">当前环境不支持 WebGL 2，无法渲染账号卡片环。</div>
      : <canvas ref={canvasRef} className="connection-ring-canvas" />}
  </div>;
});
