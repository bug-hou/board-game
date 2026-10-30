import { Application, Container } from 'pixi.js';
import { DESIGN_H, DESIGN_W } from './config';
import { loadAtlas } from './core/atlas';
import { BlackjackScene } from './scenes/BlackjackScene';
import { HoldemScene } from './scenes/HoldemScene';
import { ModeSelectScene, type GameMode } from './scenes/ModeSelectScene';
import type { Scene } from './scenes/Scene';

/** 场景切换：同一时刻只挂载一个场景 */
class SceneRouter {
  private layer = new Container();
  private current: Scene | null = null;

  constructor(app: Application) {
    app.stage.addChild(this.layer);
  }

  async go(factory: () => Scene & { start?: () => Promise<void> }) {
    if (this.current) {
      this.current.destroy();
      this.current = null;
    }
    const scene = factory();
    this.layer.addChild(scene.view);
    this.current = scene;
    await scene.start?.();
  }
}

async function main() {
  const app = new Application();
  await app.init({
    background: '#0a2e1f',
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);

  // 设计分辨率等比缩放居中
  const layout = () => {
    const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
    app.stage.scale.set(s);
    app.stage.position.set(
      (window.innerWidth - DESIGN_W * s) / 2,
      (window.innerHeight - DESIGN_H * s) / 2,
    );
  };
  layout();
  window.addEventListener('resize', layout);

  await loadAtlas();

  const router = new SceneRouter(app);
  const toLobby = () => {
    void router.go(() => new ModeSelectScene(app, { onStart }));
  };
  const onStart = (mode: GameMode, aiCount: number) => {
    if (mode === 'blackjack') {
      void router.go(() => new BlackjackScene(app, { onExit: toLobby }));
    } else {
      void router.go(() => new HoldemScene(app, { aiCount, onExit: toLobby }));
    }
  };

  await router.go(() => new ModeSelectScene(app, { onStart }));

  const boot = document.getElementById('boot');
  boot?.classList.add('hidden');
}

main().catch((err) => {
  console.error(err);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = '加载失败，请刷新重试';
});
