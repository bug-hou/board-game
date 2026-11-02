import { Application, Container, Graphics, Text } from 'pixi.js';
import { COLORS, DESIGN_H, DESIGN_W, FONTS } from '../config';
import { Easing, TweenManager, type TweenHandle } from '../core/tween';
import { ButtonView } from '../view/ButtonView';
import type { Scene } from './Scene';

export type GameMode = 'blackjack' | 'holdem';

export interface HomeOptions {
  onStart: (mode: GameMode, aiCount: number) => void;
}

/** 首页顶部的小图标牌（用文字代替插画，避免额外资源） */
function miniCard(rank: string, suit: string, color: number): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(-30, -42, 60, 84, 8).fill(COLORS.paper);
  g.roundRect(-30, -42, 60, 84, 8).stroke({ width: 2, color: COLORS.wood, alpha: 0.45 });
  const r = new Text({
    text: rank,
    style: { fontFamily: FONTS.serif, fontSize: 27, fontWeight: 'bold', fill: color },
  });
  r.anchor.set(0.5);
  r.position.set(0, -14);
  const s = new Text({
    text: suit,
    style: { fontFamily: FONTS.num, fontSize: 27, fill: color },
  });
  s.anchor.set(0.5);
  s.position.set(0, 18);
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

/** 玩法入口卡：奶油纸卡 + 木质描边 + 珊瑚色按钮 */
class ModeCard extends Container {
  private bg: Graphics;

  constructor(
    private tweens: TweenManager,
    opts: ModeCardOptions,
  ) {
    super();
    const W = 384;
    const H = 380;

    this.bg = new Graphics();
    this.drawBg(W, H, 1);
    this.addChild(this.bg);

    const fan = new Container();
    opts.cards.forEach((c, i) => {
      const m = miniCard(c.rank, c.suit, c.color);
      m.position.set((i - (opts.cards.length - 1) / 2) * 52, 0);
      m.rotation = (i - (opts.cards.length - 1) / 2) * 0.13;
      fan.addChild(m);
    });
    fan.position.set(0, -84);
    this.addChild(fan);

    const title = new Text({
      text: opts.title,
      style: { fontFamily: FONTS.cn, fontSize: 32, fontWeight: 'bold', fill: COLORS.ink },
    });
    title.anchor.set(0.5);
    title.position.set(0, 4);

    const sub = new Text({
      text: opts.subtitle,
      style: { fontFamily: FONTS.serif, fontSize: 16, fill: COLORS.coralDeep, letterSpacing: 3 },
    });
    sub.anchor.set(0.5);
    sub.position.set(0, 40);

    const desc = new Text({
      text: opts.desc,
      style: {
        fontFamily: FONTS.cn,
        fontSize: 14,
        fill: COLORS.inkDim,
        align: 'center',
        lineHeight: 23,
      },
    });
    desc.anchor.set(0.5);
    desc.position.set(0, 104);

    const cta = new Text({
      text: '点击开始',
      style: { fontFamily: FONTS.cn, fontSize: 15, fontWeight: 'bold', fill: COLORS.cream },
    });
    cta.anchor.set(0.5);
    const ctaBg = new Graphics();
    ctaBg.roundRect(-58, -17, 116, 34, 17).fill(COLORS.coral);
    const ctaBox = new Container();
    ctaBox.addChild(ctaBg, cta);
    ctaBox.position.set(0, H / 2 - 44);

    this.addChild(title, sub, desc, ctaBox);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', () => {
      this.drawBg(W, H, 1.6);
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
    this.bg.roundRect(-w / 2, -h / 2, w, h, 22).fill(COLORS.paper);
    this.bg.roundRect(-w / 2, -h / 2, w, h, 22).stroke({
      width: 2.5,
      color: COLORS.wood,
      alpha: 0.45 * glow,
    });
    this.bg.roundRect(-w / 2 + 9, -h / 2 + 9, w - 18, h - 18, 16).stroke({
      width: 1,
      color: COLORS.wood,
      alpha: 0.28 * glow,
    });
  }
}

/** 首页：标题 + 两个玩法入口 + 惩罚池展示 + 联机入口 */
export class HomeScene implements Scene {
  readonly view = new Container();

  private tweens: TweenManager;
  private root = new Container();
  private config = new Container();
  private onlineHint!: Text;
  private hintTimer: TweenHandle | null = null;

  constructor(
    app: Application,
    private opts: HomeOptions,
  ) {
    this.tweens = new TweenManager(app.ticker);
    this.view.addChild(this.background());
    this.view.addChild(this.root);
    this.view.addChild(this.config);
    this.buildModes();
    this.buildOnlineEntry();
    this.buildConfig();
  }

  // ---------- 背景与标题 ----------

  private background(): Container {
    const c = new Container();
    const g = new Graphics();
    g.rect(0, 0, DESIGN_W, DESIGN_H).fill(COLORS.cream);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.52, 620).fill(COLORS.creamDeep);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.52, 600).stroke({
      width: 2,
      color: COLORS.wood,
      alpha: 0.35,
    });
    g.circle(DESIGN_W / 2, DESIGN_H * 0.52, 586).stroke({
      width: 1,
      color: COLORS.wood,
      alpha: 0.2,
    });
    c.addChild(g);

    const title = new Text({
      text: '家 庭 游 戏 夜',
      style: {
        fontFamily: FONTS.cn,
        fontSize: 44,
        fontWeight: 'bold',
        fill: COLORS.ink,
        letterSpacing: 8,
        dropShadow: { color: 0x000000, alpha: 0.12, blur: 6, distance: 2 },
      },
    });
    title.anchor.set(0.5);
    title.position.set(DESIGN_W / 2, 72);

    const sub = new Text({
      text: 'FAMILY GAME NIGHT',
      style: { fontFamily: FONTS.serif, fontSize: 15, fill: COLORS.coralDeep, letterSpacing: 6 },
    });
    sub.anchor.set(0.5);
    sub.alpha = 0.85;
    sub.position.set(DESIGN_W / 2, 116);

    const tip = new Text({
      text: '不在同一个城市，也能一起玩一局',
      style: { fontFamily: FONTS.cn, fontSize: 14, fill: COLORS.inkDim },
    });
    tip.anchor.set(0.5);
    tip.alpha = 0.8;
    tip.position.set(DESIGN_W / 2, 146);

    const footer = new Text({
      text: '输的人做惩罚，赢的人负责监督',
      style: { fontFamily: FONTS.cn, fontSize: 14, fill: COLORS.inkDim },
    });
    footer.anchor.set(0.5);
    footer.alpha = 0.7;
    footer.position.set(DESIGN_W / 2, DESIGN_H - 34);

    c.addChild(title, sub, tip, footer);
    return c;
  }

  // ---------- 玩法入口 ----------

  private buildModes() {
    const bj = new ModeCard(this.tweens, {
      title: '21 点',
      subtitle: 'B L A C K J A C K',
      desc: '和发牌方比谁更接近 21 点\n越界就爆牌，可以要牌 / 停牌 / 加倍',
      cards: [
        { rank: 'A', suit: '♠', color: 0x2f2a24 },
        { rank: 'K', suit: '♥', color: 0xc0553f },
      ],
      onPick: () => this.opts.onStart('blackjack', 0),
    });
    bj.position.set(420, 422);

    const holdem = new ModeCard(this.tweens, {
      title: '德州扑克',
      subtitle: "T E X A S   H O L D ' E M",
      desc: '两张底牌 + 五张公共牌，凑最大牌型\n支持 1 ~ 5 位家人同桌',
      cards: [
        { rank: 'A', suit: '♠', color: 0x2f2a24 },
        { rank: 'A', suit: '♦', color: 0xc0553f },
      ],
      onPick: () => this.showConfig(),
    });
    holdem.position.set(860, 422);

    this.root.addChild(bj, holdem);
  }

  // ---------- 联机入口（预留，后端未接） ----------

  private buildOnlineEntry() {
    const cx = 1090;
    const panel = new Container();
    panel.position.set(cx, 86);

    const g = new Graphics();
    g.roundRect(-160, -44, 320, 88, 16).fill(COLORS.paper);
    g.roundRect(-160, -44, 320, 88, 16).stroke({ width: 1.5, color: COLORS.wood, alpha: 0.5 });
    panel.addChild(g);

    const caption = new Text({
      text: '联机一起玩',
      style: { fontFamily: FONTS.cn, fontSize: 13, fill: COLORS.inkDim, letterSpacing: 2 },
    });
    caption.anchor.set(0.5);
    caption.position.set(0, -26);
    panel.addChild(caption);

    const create = new ButtonView({
      label: '创建房间',
      width: 124,
      height: 38,
      color: COLORS.matcha,
      fontSize: 15,
    });
    create.position.set(-66, 12);
    const join = new ButtonView({
      label: '加入房间',
      width: 124,
      height: 38,
      color: COLORS.matchaDeep,
      fontSize: 15,
    });
    join.position.set(66, 12);
    panel.addChild(create, join);

    this.onlineHint = new Text({
      text: '联机功能开发中，先在同一个屏幕上玩吧',
      style: { fontFamily: FONTS.cn, fontSize: 13, fill: COLORS.coralDeep },
    });
    this.onlineHint.anchor.set(0.5);
    this.onlineHint.position.set(cx, 148);
    this.onlineHint.visible = false;
    this.onlineHint.alpha = 0;

    const flashHint = () => this.flashHint();
    create.on('pointerup', flashHint);
    join.on('pointerup', flashHint);

    this.root.addChild(panel, this.onlineHint);
  }

  private flashHint() {
    this.hintTimer?.kill();
    this.onlineHint.visible = true;
    this.tweens.to(this.onlineHint, { alpha: 1 }, { duration: 180, ease: Easing.quadOut });
    this.hintTimer = this.tweens.delay(2400, () => {
      this.tweens.to(this.onlineHint, { alpha: 0 }, {
        duration: 320,
        ease: Easing.quadIn,
        onComplete: () => {
          this.onlineHint.visible = false;
        },
      });
    });
  }

  // ---------- 德州人数选择 ----------

  private buildConfig() {
    const W = 700;
    const H = 320;
    const g = new Graphics();
    g.roundRect(-W / 2, -H / 2, W, H, 22).fill(COLORS.paper);
    g.roundRect(-W / 2, -H / 2, W, H, 22).stroke({ width: 3, color: COLORS.wood, alpha: 0.85 });

    const title = new Text({
      text: '今晚几位一起玩？',
      style: { fontFamily: FONTS.cn, fontSize: 28, fontWeight: 'bold', fill: COLORS.ink },
    });
    title.anchor.set(0.5);
    title.position.set(0, -H / 2 + 48);

    const sub = new Text({
      text: '德州扑克 · 起始份额 1000 · 盲注 10 / 20',
      style: { fontFamily: FONTS.cn, fontSize: 15, fill: COLORS.inkDim },
    });
    sub.anchor.set(0.5);
    sub.position.set(0, -H / 2 + 86);

    const back = new ButtonView({ label: '返 回', width: 120, height: 42, color: COLORS.wood, fontSize: 16 });
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
        color: COLORS.coral,
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
    this.hintTimer?.kill();
    this.tweens.destroy();
    this.view.destroy({ children: true });
  }
}
