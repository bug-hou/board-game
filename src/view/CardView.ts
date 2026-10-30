import { Container, Sprite, Texture } from 'pixi.js';
import { CARD_H, CARD_SCALE, CARD_W } from '../config';
import { BACK_TEXTURE_NAME, cardTexture } from '../core/atlas';
import { Easing, quadBezier, TweenManager } from '../core/tween';
import type { Card } from '../game/cards';

/**
 * 单张扑克牌视图：正面/背面两个 Sprite 叠放，支持弧线飞行与沿 Y 轴翻转。
 */
export class CardView extends Container {
  faceUp = true;
  private front: Sprite;
  private back: Sprite;

  constructor(
    private tweens: TweenManager,
    card: Card | null,
    faceUp: boolean,
  ) {
    super();
    this.front = new Sprite(Texture.EMPTY);
    this.back = new Sprite(cardTexture(BACK_TEXTURE_NAME));
    this.back.scale.set(CARD_SCALE);
    this.back.visible = false;
    this.addChild(this.front, this.back);
    this.pivot.set(CARD_W / 2, CARD_H / 2);
    this.scale.set(CARD_SCALE);
    if (card) this.setCard(card);
    this.showFace(faceUp);
  }

  setCard(card: Card | null) {
    if (card) {
      this.front.texture = cardTexture(`${card.suit}_${card.rank}`);
      this.front.scale.set(CARD_SCALE);
    } else {
      this.front.texture = Texture.EMPTY;
    }
  }

  private showFace(up: boolean) {
    this.faceUp = up;
    this.front.visible = up;
    this.back.visible = !up;
  }

  /** 沿 Y 轴缩放翻转：scaleX 收缩到 0 时切换纹理再展开 */
  flip(faceUp: boolean, duration = 320): Promise<void> {
    if (faceUp === this.faceUp) return Promise.resolve();
    return new Promise((resolve) => {
      const sx = this.scale.x;
      this.tweens.to(this.scale, { x: 0 }, {
        duration: duration / 2,
        ease: Easing.quadIn,
        onComplete: () => {
          this.showFace(faceUp);
          this.tweens.to(this.scale, { x: sx }, {
            duration: duration / 2,
            ease: Easing.quadOut,
            onComplete: resolve,
          });
        },
      });
    });
  }

  /**
   * 弧线飞牌：从当前位置飞到目标点，二次贝塞尔 + 旋转插值。
   * arcY 为控制点相对起终点中点的纵向偏移（负值向上拱起）。
   */
  flyTo(target: { x: number; y: number }, rotation = 0, duration = 480, arcY = -80): Promise<void> {
    return new Promise((resolve) => {
      const sx = this.x;
      const sy = this.y;
      const srot = this.rotation;
      const cx = (sx + target.x) / 2;
      const cy = (sy + target.y) / 2 + arcY;
      const dummy = { t: 0 };
      this.tweens.to(dummy, { t: 1 }, {
        duration,
        ease: Easing.cubicInOut,
        onUpdate: (t) => {
          this.x = quadBezier(sx, cx, target.x, t);
          this.y = quadBezier(sy, cy, target.y, t);
          this.rotation = srot + (rotation - srot) * t;
        },
        onComplete: () => {
          this.x = target.x;
          this.y = target.y;
          this.rotation = rotation;
          resolve();
        },
      });
    });
  }
}
