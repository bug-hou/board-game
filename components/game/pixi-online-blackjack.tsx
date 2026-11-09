'use client';

import * as React from 'react';
import { Application } from 'pixi.js';
import { COLORS, DESIGN_H, DESIGN_W } from '@/src/config';
import { loadAtlas } from '@/src/core/atlas';
import { BlackjackOnlineScene } from '@/src/scenes/BlackjackOnlineScene';
import type { BJAction, BlackjackView } from '@/lib/types';

interface Props {
  view: BlackjackView | null;
  onAct: (action: BJAction) => void;
  onExit: () => void;
  onReady?: () => void;
  onError?: (message: string) => void;
}

/** 21 点联机牌桌容器：负责 Pixi 生命周期，把服务端视图喂给场景。前端不做任何规则判定。 */
export default function PixiOnlineBlackjack({ view, onAct, onExit, onReady, onError }: Props) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const sceneRef = React.useRef<BlackjackOnlineScene | null>(null);
  const readyRef = React.useRef(false);

  const handlers = React.useRef({ onAct, onExit, onReady, onError });
  handlers.current = { onAct, onExit, onReady, onError };

  // 场景异步创建期间视图可能已经在手，记一份最新值，就绪后补渲染
  const viewRef = React.useRef(view);
  viewRef.current = view;

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;
    let onResize: (() => void) | null = null;

    document.body.classList.add('table-mode');

    (async () => {
      const application = new Application();
      await application.init({
        background: `#${COLORS.cream.toString(16).padStart(6, '0')}`,
        resizeTo: window,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (disposed) {
        application.destroy(true, { children: true });
        return;
      }
      app = application;
      host.appendChild(application.canvas);

      const layout = () => {
        const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
        application.stage.scale.set(s);
        application.stage.position.set(
          (window.innerWidth - DESIGN_W * s) / 2,
          (window.innerHeight - DESIGN_H * s) / 2,
        );
      };
      layout();
      onResize = layout;
      window.addEventListener('resize', layout);

      await loadAtlas();
      if (disposed) return;

      const scene = new BlackjackOnlineScene(application, {
        onAct: (a) => handlers.current.onAct(a),
        onExit: () => handlers.current.onExit(),
      });
      application.stage.addChild(scene.view);
      sceneRef.current = scene;
      readyRef.current = true;
      if (viewRef.current) scene.update(viewRef.current);
      handlers.current.onReady?.();
    })().catch((err) => {
      console.error('[pixi] 21 点联机牌桌启动失败', err);
      if (!disposed) handlers.current.onError?.('牌桌画面加载失败，请重新连接。');
    });

    return () => {
      disposed = true;
      readyRef.current = false;
      if (onResize) window.removeEventListener('resize', onResize);
      sceneRef.current?.destroy();
      sceneRef.current = null;
      app?.destroy(true, { children: true });
      document.body.classList.remove('table-mode');
    };
  }, []);

  React.useEffect(() => {
    if (readyRef.current && view) sceneRef.current?.update(view);
  }, [view]);

  return <div ref={hostRef} className="fixed inset-0 overflow-hidden" />;
}
