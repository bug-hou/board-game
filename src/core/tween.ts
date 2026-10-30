import { Ticker } from 'pixi.js';

export type EaseFn = (t: number) => number;

export const Easing = {
  linear: (t: number) => t,
  quadIn: (t: number) => t * t,
  quadOut: (t: number) => t * (2 - t),
  quadInOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  cubicOut: (t: number) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  backOut: (t: number) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  elasticOut: (t: number) => {
    if (t === 0 || t === 1) return t;
    const p = 0.36;
    return Math.pow(2, -9 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
  },
};

interface TweenOptions {
  duration: number;
  ease?: EaseFn;
  onUpdate?: (eased: number) => void;
  onComplete?: () => void;
}

interface ActiveTween {
  obj: Record<string, number> & object;
  props: Record<string, number>;
  from: Record<string, number>;
  elapsed: number;
  duration: number;
  ease: EaseFn;
  onUpdate?: (eased: number) => void;
  onComplete?: () => void;
  killed: boolean;
}

interface DelayedCall {
  elapsed: number;
  duration: number;
  cb: () => void;
  killed: boolean;
}

export interface TweenHandle {
  kill(): void;
}

/** 基于 Ticker 的轻量补间系统 */
export class TweenManager {
  private tweens = new Set<ActiveTween>();
  private delayed = new Set<DelayedCall>();

  constructor(private ticker: Ticker) {
    ticker.add(this.update);
  }

  /** 场景销毁时解绑 ticker，避免泄漏 */
  destroy() {
    this.tweens.clear();
    this.delayed.clear();
    this.ticker.remove(this.update);
  }

  private update = (ticker: Ticker) => {
    const dt = Math.min(ticker.deltaMS, 50);
    for (const tw of [...this.tweens]) {
      if (tw.killed) {
        this.tweens.delete(tw);
        continue;
      }
      tw.elapsed += dt;
      const t = Math.min(1, tw.elapsed / tw.duration);
      const e = tw.ease(t);
      for (const k in tw.props) {
        tw.obj[k] = tw.from[k] + (tw.props[k] - tw.from[k]) * e;
      }
      tw.onUpdate?.(e);
      if (t >= 1) {
        this.tweens.delete(tw);
        tw.onComplete?.();
      }
    }
    for (const dc of [...this.delayed]) {
      if (dc.killed) {
        this.delayed.delete(dc);
        continue;
      }
      dc.elapsed += dt;
      if (dc.elapsed >= dc.duration) {
        this.delayed.delete(dc);
        dc.cb();
      }
    }
  };

  to(obj: object, props: Record<string, number>, opts: TweenOptions): TweenHandle {
    // 同一对象重复 tween 先杀旧 tween，避免互相覆盖抖动
    this.kill(obj);
    const record: ActiveTween = {
      obj: obj as Record<string, number> & object,
      props,
      from: {},
      elapsed: 0,
      duration: Math.max(1, opts.duration),
      ease: opts.ease ?? Easing.quadOut,
      onUpdate: opts.onUpdate,
      onComplete: opts.onComplete,
      killed: false,
    };
    for (const k in props) {
      record.from[k] = (obj as Record<string, number>)[k] ?? 0;
    }
    this.tweens.add(record);
    return { kill: () => (record.killed = true) };
  }

  delay(ms: number, cb: () => void): TweenHandle {
    const dc: DelayedCall = { elapsed: 0, duration: ms, cb, killed: false };
    this.delayed.add(dc);
    return { kill: () => (dc.killed = true) };
  }

  /** 终止某个对象上的所有补间 */
  kill(obj: object) {
    for (const tw of this.tweens) {
      if (tw.obj === obj) tw.killed = true;
    }
  }
}

/** 二次贝塞尔插值 */
export function quadBezier(s: number, c: number, e: number, t: number): number {
  const u = 1 - t;
  return u * u * s + 2 * u * t * c + t * t * e;
}
