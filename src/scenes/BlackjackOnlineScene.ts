import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import {
  CARD_SCALE,
  CHIP_DEFS,
  COLORS,
  DESIGN_H,
  DESIGN_W,
  FONTS,
  LAYOUT,
  PENALTY,
} from '../config';
import { BACK_TEXTURE_NAME, cardTexture } from '../core/atlas';
import { TweenManager } from '../core/tween';
import { ButtonView } from '../view/ButtonView';
import { CardView } from '../view/CardView';
import { ChipView } from '../view/ChipView';
import { Hud } from '../view/Hud';
import type { Scene } from './Scene';
import type { BJAction, BlackjackView, BJPlayerView } from '../../lib/types';

export interface BlackjackOnlineOptions {
  onAct: (action: BJAction) => void;
  onExit: () => void;
}

interface SeatPanel {
  root: Container;
  nameText: Text;
  infoText: Text;
  cards: CardView[];
  /** 当前画的是哪套牌，避免重复刷新造成闪烁 */
  cardKey: string;
}

/** 一位玩家在桌面上的锚点（设计分辨率） */
interface SeatAnchor {
  x: number;
  y: number;
  scale: number;
}

const SEAT_CARD_GAP = 46;
const HERO_ANCHOR: SeatAnchor = { x: 640, y: 618, scale: 0.46 };
const OTHER_RX = 452;
const OTHER_RY = 208;
const OTHER_CY = 380;
const OTHER_SCALE = 0.38;

/**
 * 21 点联机场景：不持有引擎，只按服务端下发的视图渲染。
 *
 * 规则与判定全在服务端（server/src/games/blackjack-session.ts），
 * 这里只做「把各家明牌画出来 + 把玩家操作交出去」两件事。
 */
export class BlackjackOnlineScene implements Scene {
  readonly view = new Container();

  private tweens: TweenManager;
  private hud!: Hud;
  private cardLayer = new Container();
  private chipLayer = new Container();
  private seatLayer = new Container();
  private panels = new Map<number, SeatPanel>();
  private buttons = new Map<string, ButtonView>();
  private betChip!: ChipView;
  private betChipTip!: Text;
  private exitBtn!: ButtonView;
  /** 正在飞牌的视图，位置校准要跳过它们，否则动画会被打断 */
  private flying = new Set<CardView>();
  private lastMessage = '';
  private lastBanner = '';

  /** 布局顺序：第 0 位是「我」，其余按服务端座位号排 */
  private order: number[] = [];
  private current: BlackjackView | null = null;
  private destroyed = false;

  constructor(
    app: Application,
    private opts: BlackjackOnlineOptions,
  ) {
    this.tweens = new TweenManager(app.ticker);
    this.buildScene();
  }

  // ---------- 构建 ----------

  private buildScene() {
    this.view.addChild(this.buildTable());

    this.cardLayer.sortableChildren = true;
    this.view.addChild(this.cardLayer);
    this.view.addChild(this.chipLayer);
    this.view.addChild(this.seatLayer);

    this.hud = new Hud(this.tweens);
    this.view.addChild(this.hud);

    this.buildShoeVisual();
    this.buildBetChip();
    this.buildButtons();

    this.exitBtn = new ButtonView({
      label: '返回房间',
      width: 118,
      height: 40,
      color: COLORS.wood,
      fontSize: 15,
    });
    this.exitBtn.position.set(DESIGN_W - 96, 34);
    this.exitBtn.on('pointerup', () => this.opts.onExit());
    this.view.addChild(this.exitBtn);
  }

  /** 21 点牌桌背景：与单机同色的圆形毛毡，但不带「发牌方 / 我」的旧标签 */
  private buildTable(): Container {
    const box = new Container();
    const g = new Graphics();
    g.rect(0, 0, DESIGN_W, DESIGN_H).fill(COLORS.feltDark);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 620).fill(COLORS.felt);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 500).fill(COLORS.feltLight);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 470).stroke({ width: 3, color: COLORS.gold, alpha: 0.35 });
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 456).stroke({ width: 1.5, color: COLORS.gold, alpha: 0.22 });
    box.addChild(g);

    const slogan = new Text({
      text: '越接近 21 点越好 · 全员确认后一起比牌',
      style: {
        fontFamily: FONTS.cn,
        fontSize: 21,
        fontWeight: 'bold',
        fill: COLORS.gold,
        letterSpacing: 3,
      },
    });
    slogan.anchor.set(0.5);
    slogan.alpha = 0.45;
    slogan.position.set(DESIGN_W / 2, 356);
    box.addChild(slogan);

    // 牌靴底座（纯装饰）
    const shoe = new Graphics();
    shoe.roundRect(LAYOUT.shoe.x - 62, LAYOUT.shoe.y - 78, 116, 152, 10)
      .fill({ color: COLORS.feltDark, alpha: 0.85 });
    shoe.roundRect(LAYOUT.shoe.x - 62, LAYOUT.shoe.y - 78, 116, 152, 10)
      .stroke({ width: 2, color: COLORS.gold, alpha: 0.4 });
    box.addChild(shoe);
    return box;
  }

  private buildShoeVisual() {
    for (let i = 3; i >= 0; i--) {
      const sp = new Sprite(cardTexture(BACK_TEXTURE_NAME));
      sp.anchor.set(0.5);
      sp.scale.set(CARD_SCALE);
      sp.position.set(LAYOUT.shoe.x + i * 1.5, LAYOUT.shoe.y - i * 1.5);
      sp.rotation = -0.06;
      sp.zIndex = i;
      this.cardLayer.addChild(sp);
    }
  }

  private buildBetChip() {
    const def = CHIP_DEFS[0];
    this.betChip = new ChipView(def);
    this.betChip.scale.set(0.9);
    this.betChip.position.set(300, 726);
    this.betChip.eventMode = 'static';
    this.betChip.cursor = 'pointer';
    this.betChip.on('pointerup', () => {
      if (!this.current?.legal.canBet) return;
      this.opts.onAct({ type: 'bet', amount: def.value });
    });
    this.chipLayer.addChild(this.betChip);

    const tip = new Text({
      text: `点一下加 ${def.value} ${PENALTY.unit}`,
      style: { fontFamily: FONTS.cn, fontSize: 14, fill: COLORS.textDim },
    });
    tip.anchor.set(0.5);
    tip.position.set(300, 772);
    this.chipLayer.addChild(tip);
    this.betChipTip = tip;
  }

  private buildButtons() {
    const mk = (key: string, label: string, color: number, action: BJAction) => {
      const b = new ButtonView({ label, color, width: 132, height: 46, fontSize: 19 });
      b.visible = false;
      b.on('pointerup', () => {
        if (!b.enabled) return;
        this.opts.onAct(action);
      });
      this.buttons.set(key, b);
      this.view.addChild(b);
    };
    mk('clearBet', '清 空', COLORS.wood, { type: 'clearBet' });
    mk('confirmBet', '确认下注', COLORS.gold, { type: 'confirmBet' });
    mk('hit', '要 牌', COLORS.success, { type: 'hit' });
    mk('confirm', '确认牌', COLORS.warn, { type: 'confirm' });
  }

  // ---------- 布局 ----------

  /** 第 0 位在下方（你自己），其余沿上半椭圆分布 */
  private seatPosition(slot: number, total: number): SeatAnchor {
    if (slot === 0) return HERO_ANCHOR;
    const k = Math.max(1, total - 1);
    const j = slot - 1;
    const rad = ((180 + ((j + 1) * 180) / (k + 1)) * Math.PI) / 180;
    return {
      x: DESIGN_W / 2 + OTHER_RX * Math.cos(rad),
      y: OTHER_CY + OTHER_RY * Math.sin(rad),
      scale: OTHER_SCALE,
    };
  }

  private buildSeats(view: BlackjackView) {
    const ids = view.players.map((p) => p.id);
    // 观众（you = -1）没有自己的座位，按服务端顺序摆就好
    this.order = view.you >= 0
      ? [view.you, ...ids.filter((id) => id !== view.you)]
      : ids;

    for (const panel of this.panels.values()) {
      for (const c of panel.cards) c.destroy();
      panel.root.destroy({ children: true });
    }
    this.panels.clear();

    this.order.forEach((seatId, slot) => {
      const p = view.players.find((x) => x.id === seatId);
      if (!p) return;
      const anchor = this.seatPosition(slot, this.order.length);
      const root = new Container();
      root.position.set(anchor.x, anchor.y);

      const nameText = new Text({
        text: p.name,
        style: {
          fontFamily: FONTS.cn,
          fontSize: slot === 0 ? 20 : 17,
          fontWeight: 'bold',
          fill: COLORS.text,
        },
      });
      nameText.anchor.set(0.5);
      nameText.position.set(0, -74);

      const infoText = new Text({
        text: '',
        style: { fontFamily: FONTS.cn, fontSize: 14, fill: COLORS.textDim },
      });
      infoText.anchor.set(0.5);
      infoText.position.set(0, -52);

      root.addChild(nameText, infoText);
      this.seatLayer.addChild(root);
      this.panels.set(seatId, { root, nameText, infoText, cards: [], cardKey: '' });
    });
  }

  // ---------- 视图同步 ----------

  /** 收到服务端新视图就调一次 */
  update(view: BlackjackView): void {
    if (this.destroyed) return;
    const isNewRound = this.current?.roundNo !== view.roundNo;
    this.current = view;

    if (!this.panels.size || this.order.length !== view.players.length) this.buildSeats(view);
    if (isNewRound) this.resetForNewRound(view);

    this.syncSeats(view);
    this.syncHud(view);
    this.syncButtons(view);
  }

  private resetForNewRound(view: BlackjackView) {
    this.hud.hideBanner();
    this.lastMessage = '';
    this.lastBanner = '';
    this.flying.clear();
    for (const panel of this.panels.values()) {
      for (const c of panel.cards) c.destroy();
      panel.cards = [];
      panel.cardKey = '';
    }
    for (const p of view.players) this.hud.hideScore(`bj-${p.id}`);
  }

  private syncSeats(view: BlackjackView) {
    for (const p of view.players) {
      const panel = this.panels.get(p.id);
      if (!panel) continue;
      const slot = this.order.indexOf(p.id);
      const anchor = this.seatPosition(slot, this.order.length);
      panel.root.position.set(anchor.x, anchor.y);

      panel.nameText.text = p.id === view.you ? `${p.name}（你）` : p.name;
      panel.infoText.text = this.seatInfo(p, view);
      this.syncCards(panel, p, anchor.scale, view.phase === 'showdown');

      const totalText = p.total === null ? '' : p.busted ? `${p.total} 爆牌` : `${p.total} 点`;
      this.hud.showScore(`bj-${p.id}`, anchor.x, anchor.y + 52, totalText, p.busted);
    }
  }

  private seatInfo(p: BJPlayerView, view: BlackjackView): string {
    const bits = [`下注 ${p.bet} ${PENALTY.unit}`, `余 ${p.balance}`];
    if (view.phase === 'betting') {
      bits.push(p.confirmedBet ? '下注已确认' : '还在下注');
    } else if (view.phase === 'drawing') {
      bits.push(p.busted ? '出局' : p.confirmed ? '牌已确认' : '还能要牌');
    } else if (p.delta !== null) {
      bits.push(p.delta > 0 ? `+${p.delta} ${PENALTY.unit}` : p.delta < 0 ? `${p.delta} ${PENALTY.unit}` : '不进不出');
    }
    if (p.isWinner) bits.push('赢家');
    return bits.join(' · ');
  }

  /** 牌内容变了才重建；追加的牌做飞入 + 翻开，飞行途中不校准位置 */
  private syncCards(panel: SeatPanel, p: BJPlayerView, scale: number, revealed: boolean) {
    const key = p.cards.map((c) => `${c.suit}_${c.rank}`).join(',');
    const appended =
      panel.cardKey.length > 0 && key.startsWith(panel.cardKey) && p.cards.length > panel.cards.length;

    if (key !== panel.cardKey) {
      const start = appended ? panel.cards.length : 0;
      if (!appended) {
        for (const c of panel.cards) {
          this.flying.delete(c);
          c.destroy();
        }
        panel.cards = [];
      }
      const count = p.cards.length;
      for (let i = start; i < count; i++) {
        const animate = appended && !revealed;
        const cv = new CardView(this.tweens, p.cards[i], !animate);
        cv.scale.set(scale);
        this.cardLayer.addChild(cv);
        panel.cards.push(cv);
        if (animate) {
          cv.position.set(LAYOUT.shoe.x, LAYOUT.shoe.y);
          const target = this.cardTarget(panel, i, count, scale);
          this.flying.add(cv);
          void cv.flyTo(target, 0, 380, -90)
            .then(() => cv.flip(true, 220))
            .finally(() => this.flying.delete(cv));
        }
      }
      panel.cardKey = key;
    }

    panel.cards.forEach((cv, i) => {
      if (this.flying.has(cv)) return;
      const target = this.cardTarget(panel, i, p.cards.length, scale);
      cv.position.set(target.x, target.y);
      cv.scale.set(scale);
    });
  }

  private cardTarget(panel: SeatPanel, i: number, count: number, scale: number) {
    const gap = SEAT_CARD_GAP * (scale / HERO_ANCHOR.scale);
    return {
      x: panel.root.x + (i - (count - 1) / 2) * gap,
      y: panel.root.y,
    };
  }

  private syncHud(view: BlackjackView) {
    const me = view.players.find((p) => p.id === view.you);
    if (me) {
      this.hud.setBalance(me.balance);
      this.hud.setBet(me.bet);
    }

    if (view.result) {
      if (this.lastBanner !== view.result.text) {
        this.hud.showBanner(view.result.text, '下一局马上开始', COLORS.gold);
        this.lastBanner = view.result.text;
        this.hud.showMessage('本局结束');
        this.lastMessage = '本局结束';
      }
      return;
    }
    this.lastBanner = '';
    const waitingBet = view.players.filter((p) => !p.confirmedBet).length;
    const waitingCards = view.players.filter((p) => !p.confirmed).length;
    const message = view.phase === 'betting'
      ? `各自下注，还有 ${waitingBet} 人没确认`
      : view.phase === 'drawing'
        ? `随意要牌，还有 ${waitingCards} 人没确认`
        : '';
    if (message && this.lastMessage !== message) {
      this.hud.showMessage(message);
      this.lastMessage = message;
    }
  }

  private syncButtons(view: BlackjackView) {
    const legal = view.legal;
    const visible: string[] = [];
    if (view.phase === 'betting') {
      if (legal.canClearBet) visible.push('clearBet');
      if (legal.canConfirmBet) visible.push('confirmBet');
    } else if (view.phase === 'drawing') {
      if (legal.canHit) visible.push('hit');
      if (legal.canConfirm) visible.push('confirm');
    }

    const w = 132;
    const gap = 16;
    const total = visible.length * w + Math.max(0, visible.length - 1) * gap;
    visible.forEach((key, i) => {
      const b = this.buttons.get(key)!;
      b.visible = true;
      b.position.set(DESIGN_W / 2 - total / 2 + w / 2 + i * (w + gap), 740);
    });
    for (const [key, b] of this.buttons) {
      if (!visible.includes(key)) b.visible = false;
    }
    this.betChip.visible = legal.canBet;
    this.betChipTip.visible = legal.canBet;
  }

  destroy(): void {
    this.destroyed = true;
    for (const panel of this.panels.values()) {
      for (const c of panel.cards) c.destroy();
    }
    this.panels.clear();
    this.view.destroy({ children: true });
  }
}
