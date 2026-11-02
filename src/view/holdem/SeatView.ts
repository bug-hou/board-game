import { Container, Graphics, Text } from 'pixi.js';
import { POKER_LAYOUT } from '../../config';
import { Easing, type TweenManager } from '../../core/tween';
import type { Card } from '../../game/cards';
import type { Seat } from '../../game/holdem/engine';
import { CardView } from '../CardView';

const CARD_W0 = 100;
const CARD_H0 = 140;

export interface SeatViewOptions {
  tweens: TweenManager;
  seat: Seat;
  isHero: boolean;
}

/** 一个座位的视图：底牌 + 名牌 + 本轮下注 + 状态 + 庄家位 */
export class SeatView extends Container {
  readonly seat: Seat;
  readonly isHero: boolean;

  private cardLayer = new Container();
  private cards: CardView[] = [];
  private plate = new Container();
  private nameText: Text;
  private stackText: Text;
  private statusText: Text;
  private handText: Text;
  private betBox = new Container();
  private betChip = new Graphics();
  private betText: Text;
  private dealerBtn = new Container();
  private ring = new Graphics();

  private scaleFactor: number;
  private gap: number;
  private plateY: number;
  private homes: { x: number; y: number }[] = [];

  constructor(private opts: SeatViewOptions) {
    super();
    this.seat = opts.seat;
    this.isHero = opts.isHero;
    this.scaleFactor = opts.isHero ? POKER_LAYOUT.hero.scale : POKER_LAYOUT.seat.scale;
    this.gap = opts.isHero ? POKER_LAYOUT.hero.gap : POKER_LAYOUT.seat.gap;
    this.plateY = (CARD_H0 * this.scaleFactor) / 2 + 18;

    this.ring = new Graphics();
    this.addChild(this.ring);

    this.addChild(this.cardLayer);

    // 名牌
    const plateBg = new Graphics();
    plateBg.roundRect(-70, -17, 140, 34, 10).fill({ color: 0x06281a, alpha: 0.88 });
    plateBg.roundRect(-70, -17, 140, 34, 10).stroke({ width: 1.5, color: 0xe8c56a, alpha: 0.5 });
    this.plate.addChild(plateBg);
    this.plate.position.set(0, this.plateY);
    this.nameText = new Text({
      text: opts.seat.name,
      style: {
        fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: opts.isHero ? 16 : 15,
        fontWeight: 'bold',
        fill: 0xf3ecd8,
      },
    });
    this.nameText.anchor.set(0, 0.5);
    this.nameText.position.set(-60, 0);
    this.stackText = new Text({
      text: '$0',
      style: { fontFamily: 'Arial, sans-serif', fontSize: 14, fontWeight: 'bold', fill: 0xe8c56a },
    });
    this.stackText.anchor.set(1, 0.5);
    this.stackText.position.set(60, 0);
    this.plate.addChild(this.nameText, this.stackText);
    this.addChild(this.plate);

    this.statusText = new Text({
      text: '',
      style: {
        fontFamily: '"PingFang SC", sans-serif',
        fontSize: 13,
        fontWeight: 'bold',
        fill: 0xf0c987,
      },
    });
    this.statusText.anchor.set(0.5);
    this.statusText.position.set(0, this.plateY + 24);
    this.addChild(this.statusText);

    this.handText = new Text({
      text: '',
      style: {
        fontFamily: '"PingFang SC", sans-serif',
        fontSize: 14,
        fontWeight: 'bold',
        fill: 0x6fd08c,
      },
    });
    this.handText.anchor.set(0.5);
    this.handText.position.set(0, this.plateY + 44);
    this.addChild(this.handText);

    // 本轮下注：摆在底牌右侧
    this.betChip.circle(0, 0, 13).fill(0xe8c56a);
    this.betChip.circle(0, 0, 13).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
    this.betChip.circle(0, 0, 6).fill(0x9a7d33);
    this.betText = new Text({
      text: '',
      style: { fontFamily: 'Arial, sans-serif', fontSize: 14, fontWeight: 'bold', fill: 0x1a1206 },
    });
    this.betText.anchor.set(0.5);
    this.betText.position.set(0, 24);
    this.betBox.addChild(this.betChip, this.betText);
    const betOffsetX = (CARD_W0 * this.scaleFactor) / 2 + this.gap / 2 + 34;
    this.betBox.position.set(betOffsetX, 0);
    this.betBox.visible = false;
    this.addChild(this.betBox);

    // 庄家位
    const dBg = new Graphics();
    dBg.circle(0, 0, 11).fill(0xf2f2ee);
    dBg.circle(0, 0, 11).stroke({ width: 2, color: 0x33333d, alpha: 0.5 });
    const dt = new Text({
      text: 'D',
      style: { fontFamily: 'Arial, sans-serif', fontSize: 13, fontWeight: 'bold', fill: 0x1a1a1a },
    });
    dt.anchor.set(0.5);
    this.dealerBtn.addChild(dBg, dt);
    const leftX = -((CARD_W0 * this.scaleFactor) / 2 + this.gap / 2 + 24);
    this.dealerBtn.position.set(leftX, 0);
    this.dealerBtn.visible = false;
    this.addChild(this.dealerBtn);

    this.setStack(opts.seat.stack);
    this.drawRing(false);
  }

  private drawRing(active: boolean) {
    const w = (CARD_W0 * this.scaleFactor) / 2 + this.gap / 2 + 12;
    const h = (CARD_H0 * this.scaleFactor) / 2 + 12;
    this.ring.clear();
    if (!active) return;
    this.ring
      .roundRect(-w, -h, w * 2, h * 2, 16)
      .stroke({ width: 3, color: 0xffd86a, alpha: 0.95 });
  }

  // ---------- 状态 ----------

  setStack(v: number) {
    this.stackText.text = `$${v}`;
  }

  setActive(on: boolean) {
    this.drawRing(on);
  }

  setDealer(on: boolean) {
    this.dealerBtn.visible = on;
  }

  setStatus(text: string, color = 0xf0c987) {
    this.statusText.text = text;
    (this.statusText.style as { fill: number }).fill = color;
  }

  setHandName(text: string) {
    this.handText.text = text;
  }

  setBet(v: number) {
    this.betBox.visible = v > 0;
    this.betText.text = `$${v}`;
    if (v > 0) {
      this.betBox.scale.set(0.7);
      this.opts.tweens.to(this.betBox.scale, { x: 1, y: 1 }, { duration: 220, ease: Easing.backOut });
    }
  }

  setFolded(on: boolean) {
    this.alpha = on ? 0.4 : 1;
    if (on) this.setStatus('弃牌', 0xa89b80);
  }

  // ---------- 底牌 ----------

  /**
   * 放置底牌（AI 默认背面）。
   * 传入 from 时底牌先停在发牌点，等待 dealIn 逐张飞入；
   * 不传则直接落在座位上（用于无需发牌动画的场景）。
   */
  setHole(cards: Card[], faceUp: boolean, from?: { x: number; y: number }) {
    this.clearCards();
    cards.forEach((c, i) => {
      const v = new CardView(this.opts.tweens, c, faceUp);
      v.scale.set(this.scaleFactor);
      const home = { x: (i - (cards.length - 1) / 2) * this.gap, y: 0 };
      this.cardLayer.addChild(v);
      this.cards.push(v);
      this.homes.push(home);
      if (from) {
        // 停在发牌点，避免动画开始前底牌就已经出现在座位上
        v.position.set(from.x - this.x, from.y - this.y);
        v.rotation = -0.5;
      } else {
        v.position.set(home.x, home.y);
      }
    });
  }

  /** 从发牌点飞入座位。指定 index 时只飞第 index 张，用于逐张轮转发牌 */
  async dealIn(from: { x: number; y: number }, index?: number): Promise<void> {
    for (let i = 0; i < this.cards.length; i++) {
      if (index !== undefined && i !== index) continue;
      const v = this.cards[i];
      v.position.set(from.x - this.x, from.y - this.y);
      v.rotation = -0.5;
      await v.flyTo(this.homes[i], 0, 340, -80);
    }
  }

  /** 摊牌：逐张翻开底牌 */
  async reveal(): Promise<void> {
    for (const c of this.cards) {
      await c.flip(true, 240);
    }
  }

  clearCards() {
    for (const c of this.cards) c.destroy();
    this.cards = [];
    this.homes = [];
  }

  override destroy(): void {
    this.clearCards();
    super.destroy({ children: true });
  }
}
