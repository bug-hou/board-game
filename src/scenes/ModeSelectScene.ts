import { Application, Container, Graphics, Text } from 'pixi.js';
import { COLORS, DESIGN_H, DESIGN_W } from '../config';
import { Easing, TweenManager } from '../core/tween';
import { ButtonView } from '../view/ButtonView';
import type { Scene } from './Scene';

export type GameMode = 'blackjack' | 'holdem';

export interface ModeSelectOptions {
  onStart: (mode: GameMode, aiCount: number) => void;
}

const FONT_CN = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

function miniCard(rank: string, suit: string, color: number): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(-33, -46, 66, 92, 8).fill(0xfdfaf0);
  g.roundRect(-33, -46, 66, 92, 8).stroke({ width: 2, color: 0x3a3a3a, alpha: 0.25 });
  const r = new Text({
    text: rank,
    style: { fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 'bold', fill: color },
  });
  r.anchor.set(0.5);
  r.position.set(0, -16);
  const s = new Text({
    text: suit,
    style: { fontFamily: 'Arial, sans-serif', fontSize: 30, fill: color },
  });
  s.anchor.set(0.5);
  s.position.set(0, 20);
  c.addChild(g, r, s);
  return c;
}

interface ModeCardOptions {
  title: string;
  subtitle: string;
  desc: string;
  cards: { rank: string; suit: string; color: number }[];
  onPick: () => void;
}

class ModeCard extends Container {
  private bg: Graphics;

  constructor(private tweens: TweenManager, opts: ModeCardOptions) {
    super();
    const W = 384;
    const H = 430;

    this.bg = new Graphics();
    this.drawBg(W, H, 1);
    this.addChild(this.bg);

    const fan = new Container();
    opts.cards.forEach((c, i) => {
      const m = miniCard(c.rank, c.suit, c.color);
      m.position.set((i - (opts.cards.length - 1) / 2) * 56, 0);
      m.rotation = (i - (opts.cards.length - 1) / 2) * 0.13;
      fan.addChild(m);
    });
    fan.position.set(0, -92);
    this.addChild(fan);

    const title = new Text({
      text: opts.title,
      style: { fontFamily: FONT_CN, fontSize: 34, fontWeight: 'bold', fill: 0xf3ecd8 },
    });
    title.anchor.set(0.5);
    title.position.set(0, 8);

    const sub = new Text({
      text: opts.subtitle,
      style: { fontFamily: 'Georgia, serif', fontSize: 17, fill: 0xe8c56a, letterSpacing: 3 },
    });
    sub.anchor.set(0.5);
    sub.position.set(0, 44);

    const desc = new Text({
      text: opts.desc,
      style: {
        fontFamily: FONT_CN,
        fontSize: 15,
        fill: 0xbfd8c4,
        align: 'center',
        lineHeight: 24,
      },
    });
    desc.anchor.set(0.5);
    desc.position.set(0, 110);

    const cta = new Text({
      text: '点击开始',
      style: { fontFamily: FONT_CN, fontSize: 15, fontWeight: 'bold', fill: 0x0f2a1c },
    });
    cta.anchor.set(0.5);
    const ctaBg = new Graphics();
    ctaBg.roundRect(-58, -17, 116, 34, 17).fill(0xe8c56a);
    const ctaBox = new Container();
    ctaBox.addChild(ctaBg, cta);
    ctaBox.position.set(0, H / 2 - 44);

    this.addChild(title, sub, desc, ctaBox);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', () => {
      this.drawBg(W, H, 1.25);
      this.tweens.to(this.scale, { x: 1.03, y: 1.03 }, { duration: 200, ease: Easing.quadOut });
    });
    this.on('pointerout', () => {
      this.drawBg(W, H, 1);
      this.tweens.to(this.scale, { x: 1, y: 1 }, { duration: 200, ease: Easing.quadOut });
    });
    this.on('pointerup', opts.onPick);
  }

  private drawBg(w: number, h: number, glow: number) {
    this.bg.clear();
    this.bg.roundRect(-w / 2, -h / 2, w, h, 22).fill({ color: 0x0d3524, alpha: 0.95 });
    this.bg.roundRect(-w / 2, -h / 2, w, h, 22).stroke({ width: 2.5, color: 0xe8c56a, alpha: 0.35 * glow });
    this.bg.roundRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 16).stroke({
      width: 1,
      color: 0xe8c56a,
      alpha: 0.18 * glow,
    });
  }
}

/** 入口页：选择游戏模式；选择德州后可再选人机数量 */
export class ModeSelectScene implements Scene {
  readonly view = new Container();

  private tweens: TweenManager;
  private root = new Container();
  private config = new Container();

  constructor(
    app: Application,
    private opts: ModeSelectOptions,
  ) {
    this.tweens = new TweenManager(app.ticker);
    this.view.addChild(this.background());
    this.view.addChild(this.root);
    this.view.addChild(this.config);
    this.buildModes();
    this.buildConfig();
  }

  private background(): Container {
    const c = new Container();
    const g = new Graphics();
    g.rect(0, 0, DESIGN_W, DESIGN_H).fill(COLORS.feltDark);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.46, 640).fill(COLORS.felt);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.46, 500).fill(COLORS.feltLight);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.46, 470).stroke({ width: 2, color: 0xe8c56a, alpha: 0.22 });
    c.addChild(g);

    const title = new Text({
      text: '牌 桌 游 戏',
      style: {
        fontFamily: FONT_CN,
        fontSize: 46,
        fontWeight: 'bold',
        fill: 0xf3ecd8,
        letterSpacing: 10,
        dropShadow: { color: 0x000000, alpha: 0.5, blur: 6, distance: 3 },
      },
    });
    title.anchor.set(0.5);
    title.position.set(DESIGN_W / 2, 86);

    const sub = new Text({
      text: 'C A R D   T A B L E',
      style: { fontFamily: 'Georgia, serif', fontSize: 16, fill: 0xe8c56a, letterSpacing: 6 },
    });
    sub.anchor.set(0.5);
    sub.alpha = 0.75;
    sub.position.set(DESIGN_W / 2, 132);

    const tip = new Text({
      text: '选择一个模式开始游戏',
      style: { fontFamily: FONT_CN, fontSize: 15, fill: 0xbfd8c4 },
    });
    tip.anchor.set(0.5);
    tip.alpha = 0.7;
    tip.position.set(DESIGN_W / 2, DESIGN_H - 42);
    c.addChild(title, sub, tip);
    return c;
  }

  private buildModes() {
    const bj = new ModeCard(this.tweens, {
      title: '21 点',
      subtitle: 'B L A C K J A C K',
      desc: '拖拽筹码下注，与庄家比大小\n天成 21 点赔 3 : 2，可要牌 / 停牌 / 加倍',
      cards: [
        { rank: 'A', suit: '♠', color: 0x1c1c22 },
        { rank: 'K', suit: '♥', color: 0xc0392b },
      ],
      onPick: () => this.opts.onStart('blackjack', 0),
    });
    bj.position.set(420, 452);

    const holdem = new ModeCard(this.tweens, {
      title: '德州扑克',
      subtitle: "T E X A S   H O L D ' E M",
      desc: '大小盲注 · 翻牌前 / 翻牌 / 转牌 / 河牌四轮下注\n摊牌比牌型，支持 1 ~ 5 个人机对手',
      cards: [
        { rank: 'A', suit: '♠', color: 0x1c1c22 },
        { rank: 'A', suit: '♦', color: 0xc0392b },
      ],
      onPick: () => this.showConfig(),
    });
    holdem.position.set(880, 452);

    this.root.addChild(bj, holdem);
  }

  private buildConfig() {
    const W = 700;
    const H = 320;
    const g = new Graphics();
    g.roundRect(-W / 2, -H / 2, W, H, 22).fill({ color: 0x06281a, alpha: 0.97 });
    g.roundRect(-W / 2, -H / 2, W, H, 22).stroke({ width: 3, color: 0xe8c56a, alpha: 0.85 });

    const title = new Text({
      text: '选择人机对手数量',
      style: { fontFamily: FONT_CN, fontSize: 28, fontWeight: 'bold', fill: 0xf3ecd8 },
    });
    title.anchor.set(0.5);
    title.position.set(0, -H / 2 + 48);

    const sub = new Text({
      text: '德州扑克 · 起始筹码 $1000 · 盲注 10 / 20',
      style: { fontFamily: FONT_CN, fontSize: 15, fill: 0xbfd8c4 },
    });
    sub.anchor.set(0.5);
    sub.position.set(0, -H / 2 + 86);

    const back = new ButtonView({ label: '返 回', width: 120, height: 42, color: 0x9a8f72, fontSize: 16 });
    back.position.set(0, H / 2 - 46);
    back.on('pointerup', () => this.hideConfig());

    this.config.addChild(g, title, sub, back);

    const n = 5;
    const bw = 92;
    const gap = 18;
    const total = n * bw + (n - 1) * gap;
    for (let i = 0; i < n; i++) {
      const count = i + 1;
      const b = new ButtonView({
        label: `${count} 人`,
        width: bw,
        height: 56,
        color: 0xe8c56a,
        fontSize: 19,
      });
      b.position.set(-total / 2 + bw / 2 + i * (bw + gap), 8);
      b.on('pointerup', () => this.opts.onStart('holdem', count));
      this.config.addChild(b);
    }

    this.config.position.set(DESIGN_W / 2, DESIGN_H / 2);
    this.config.visible = false;
    this.config.alpha = 0;
  }

  private showConfig() {
    this.config.visible = true;
    this.root.visible = false;
    this.tweens.to(this.config, { alpha: 1 }, { duration: 220, ease: Easing.quadOut });
    this.config.scale.set(0.94);
    this.tweens.to(this.config.scale, { x: 1, y: 1 }, { duration: 260, ease: Easing.backOut });
  }

  private hideConfig() {
    this.root.visible = true;
    this.tweens.to(this.config, { alpha: 0 }, {
      duration: 180,
      ease: Easing.quadIn,
      onComplete: () => {
        this.config.visible = false;
      },
    });
  }

  destroy() {
    this.tweens.destroy();
    this.view.destroy({ children: true });
  }
}
