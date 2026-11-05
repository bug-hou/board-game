'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Application, Container } from 'pixi.js';
import { COLORS, DESIGN_H, DESIGN_W } from '@/src/config';
import { loadAtlas } from '@/src/core/atlas';
import { BlackjackScene } from '@/src/scenes/BlackjackScene';
import { HoldemScene } from '@/src/scenes/HoldemScene';
import type { Scene } from '@/src/scenes/Scene';

export type GameKind = 'blackjack' | 'holdem';

interface PixiStageProps {
  game: GameKind;
  aiCount?: number;
}

/**
 * 牌桌容器：只负责 Pixi 应用的生命周期与场景挂载。
 * 玩法逻辑完全在 src/game 与 src/scenes 里，这里不做任何规则改动。
 */
export default function PixiStage({ game, aiCount = 3 }: PixiStageProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const exitRef = React.useRef<() => void>(() => router.push('/play'));
  exitRef.current = () => router.push('/play');

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;
    let scene: Scene | null = null;
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

      const layer = new Container();
      application.stage.addChild(layer);

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

      const onExit = () => exitRef.current();
      scene =
        game === 'blackjack'
          ? new BlackjackScene(application, { onExit })
          : new HoldemScene(application, { aiCount, onExit });
      layer.addChild(scene.view);
    })().catch((err) => {
      console.error('[pixi] 启动失败', err);
    });

    return () => {
      disposed = true;
      if (onResize) window.removeEventListener('resize', onResize);
      scene?.destroy();
      app?.destroy(true, { children: true });
      document.body.classList.remove('table-mode');
    };
  }, [game, aiCount]);

  return <div ref={hostRef} className="fixed inset-0 overflow-hidden" />;
}
