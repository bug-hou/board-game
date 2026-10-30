import { Container, FederatedPointerEvent, Rectangle } from 'pixi.js';

export interface DragHandlers {
  /** 按下，返回 false 可取消本次拖拽 */
  onDragStart?: (local: { x: number; y: number }) => boolean | void;
  /** 拖动中（local 为父容器坐标系） */
  onDragMove?: (local: { x: number; y: number }) => void;
  onDragEnd?: (local: { x: number; y: number }) => void;
}

interface DragState {
  target: Container;
  handlers: DragHandlers;
  offsetX: number;
  offsetY: number;
  moved: boolean;
}

/** 统一的全局拖拽管理器：挂在 stage 上监听 move/up，避免逐对象绑定 */
export class DragManager {
  private active: DragState | null = null;

  constructor(stage: Container) {
    stage.eventMode = 'static';
    stage.hitArea = new Rectangle(-10000, -10000, 20000, 20000);
    stage.on('pointermove', this.onMove);
    stage.on('pointerup', this.onUp);
    stage.on('pointerupoutside', this.onUp);
  }

  /** 使一个对象可拖拽 */
  makeDraggable(target: Container, handlers: DragHandlers) {
    target.eventMode = 'static';
    target.cursor = 'grab';
    target.on('pointerdown', (e: FederatedPointerEvent) => {
      const local = target.parent!.toLocal(e.global);
      if (handlers.onDragStart?.(local) === false) return;
      target.cursor = 'grabbing';
      // 置于所属容器顶层
      if (target.parent) {
        target.parent.sortableChildren = true;
        target.zIndex = ++DragManager.zCounter;
      }
      this.active = {
        target,
        handlers,
        offsetX: local.x - target.x,
        offsetY: local.y - target.y,
        moved: false,
      };
    });
  }

  private static zCounter = 1;

  private onMove = (e: FederatedPointerEvent) => {
    const st = this.active;
    if (!st) return;
    const local = st.target.parent!.toLocal(e.global);
    st.target.x = local.x - st.offsetX;
    st.target.y = local.y - st.offsetY;
    st.moved = true;
    st.handlers.onDragMove?.(local);
  };

  private onUp = (e: FederatedPointerEvent) => {
    const st = this.active;
    if (!st) return;
    this.active = null;
    st.target.cursor = 'grab';
    const local = st.target.parent!.toLocal(e.global);
    st.handlers.onDragEnd?.(local);
  };

  /** 点击（与拖拽区分：未发生位移视为点击） */
  onClick(target: Container, cb: () => void) {
    let downPos: { x: number; y: number } | null = null;
    target.eventMode = 'static';
    target.cursor = 'pointer';
    target.on('pointerdown', (e: FederatedPointerEvent) => {
      downPos = { x: e.global.x, y: e.global.y };
    });
    target.on('pointerup', (e: FederatedPointerEvent) => {
      if (!downPos) return;
      const dx = e.global.x - downPos.x;
      const dy = e.global.y - downPos.y;
      downPos = null;
      if (dx * dx + dy * dy < 100) cb();
    });
  }
}
