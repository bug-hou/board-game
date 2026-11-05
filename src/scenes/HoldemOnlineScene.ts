import { Application, Container, Sprite } from 'pixi.js';
import {
  BIG_BLIND,
  COLORS,
  PENALTY,
  POKER_CHIP_DEFS,
  POKER_LAYOUT,
  SMALL_BLIND,
} from '../config';
import { BACK_TEXTURE_NAME, cardTexture } from '../core/atlas';
import { Easing, TweenManager } from '../core/tween';
import type { Card } from '../game/cards';
import type { Action, LegalActions, Seat } from '../game/holdem/engine';
import { ButtonView } from '../view/ButtonView';
import { CardView } from '../view/CardView';
import { ChipView } from '../view/ChipView';
import { ActionBar } from '../view/holdem/ActionBar';
import { PokerHud } from '../view/holdem/PokerHud';
import { PokerTable } from '../view/holdem/PokerTable';
import { SeatView } from '../view/holdem/SeatView';
import type { Scene } from './Scene';
import type { HoldemView } from '../../lib/types';

/** 记录每个座位当前画的是哪套底牌，用于判断是否需要重画 */
const holeKeys = new WeakMap<SeatView, string>();

export interface HoldemOnlineOptions {
  /** 玩家点了动作，交给外层发给服务端 */
  onAct: (action: Action) => void;
  onExit: () => void;
}

/**
 * 联机德州场景：不持有引擎，只按服务端下发的视图渲染。
 *
 * 规则与判定全在服务端（server/src/games/holdem-session.ts），
 * 这里只做「把视图画出来 + 把玩家操作交出去」两件事。
 */
export class HoldemOnlineScene implements Scene {
  readonly view = new Container();

  private tweens: TweenManager;
  private hud!: PokerHud;
  private bar = new ActionBar();
  private cardLayer = new Container();
  private chipLayer = new Container();
  private seatViews = new Map<number, SeatView>();
  private boardViews: CardView[] = [];
  private raiseChips: ChipView[] = [];
  private exitBtn!: ButtonView;

  /** 布局顺序：第 0 位是「我」，其余按服务端座位号排 */
  private order: number[] = [];
  private current: HoldemView | null = null;
  private raiseMode = false;
  private raiseAmount = 0;
  private raiseLegal: LegalActions | null = null;
  private destroyed = false;

  constructor(
    app: Application,
    private opts: HoldemOnlineOptions,
  ) {
    this.tweens = new TweenManager(app.ticker);
    this.buildScene();
  }

  // ---------- 构建 ----------

  private buildScene() {
    this.view.addChild(new PokerTable());

    this.cardLayer.sortableChildren = true;
    this.view.addChild(this.cardLayer);
    this.view.addChild(this.chipLayer);

    this.hud = new PokerHud(this.tweens);
    this.view.addChild(this.hud);
    this.hud.setBlinds(SMALL_BLIND, BIG_BLIND);

    for (let i = 3; i >= 0; i--) {
      const sp = new Sprite(cardTexture(BACK_TEXTURE_NAME));
      sp.anchor.set(0.5);
      sp.scale.set(0.42);
      sp.position.set(POKER_LAYOUT.deck.x + i * 1.5, POKER_LAYOUT.deck.y - i * 1.5);
      sp.rotation = -0.06;
      this.cardLayer.addChild(sp);
    }

    this.buildChipRack();
    this.view.addChild(this.bar);
    this.wireActionBar();

    this.exitBtn = new ButtonView({
      label: '返回房间',
      width: 118,
      height: 40,
      color: COLORS.wood,
      fontSize: 15,
    });
    this.exitBtn.position.set(POKER_LAYOUT.exit.x, POKER_LAYOUT.exit.y);
    this.exitBtn.on('pointerup', () => this.opts.onExit());
    this.view.addChild(this.exitBtn);
  }

  private buildChipRack() {
    POKER_CHIP_DEFS.forEach((def, i) => {
      const chip = new ChipView(def);
      chip.scale.set(POKER_LAYOUT.chipRack.scale);
      chip.position.set(POKER_LAYOUT.chipRack.x + i * POKER_LAYOUT.chipRack.gap, POKER_LAYOUT.chipRack.y);
      chip.eventMode = 'static';
      chip.cursor = 'pointer';
      chip.on('pointerup', () => this.onChipTap(def.value));
      this.chipLayer.addChild(chip);
    });
  }

  private wireActionBar() {
    this.bar.onFold = () => this.act({ type: 'fold' });
    this.bar.onCall = () => {
      const l = this.current?.legal;
      if (!l) return;
      this.act({ type: l.canCheck ? 'check' : 'call' });
    };
    this.bar.onAllIn = () => this.act({ type: 'allin' });
    this.bar.onRaise = () => this.enterRaiseMode();
    this.bar.onCancelRaise = () => this.exitRaiseMode();
    this.bar.onConfirmRaise = () => {
      const amount = this.raiseAmount;
      this.raiseMode = false;
      this.raiseLegal = null;
      this.clearRaiseChips();
      this.act({ type: 'raise', amount });
    };
    this.bar.onNext = () => {};
  }

  private act(action: Action) {
    this.bar.hide();
    this.raiseMode = false;
    this.opts.onAct(action);
  }

  // ---------- 布局 ----------

  /** 第 0 位在下方（你自己），其余沿上半椭圆分布 */
  private seatPosition(slot: number, total: number): { x: number; y: number } {
    if (slot === 0) return { x: POKER_LAYOUT.hero.x, y: POKER_LAYOUT.hero.y };
    const { cx, cy, rx, ry } = POKER_LAYOUT.table;
    const k = Math.max(1, total - 1);
    const j = slot - 1;
    const rad = ((180 + ((j + 1) * 180) / (k + 1)) * Math.PI) / 180;
    return { x: cx + rx * Math.cos(rad), y: cy + ry * Math.sin(rad) };
  }

  private buildSeats(view: HoldemView) {
    const you = view.you;
    this.order = [you, ...view.players.map((p) => p.id).filter((id) => id !== you)];

    this.order.forEach((seatId, slot) => {
      const p = view.players.find((x) => x.id === seatId)!;
      const sv = new SeatView({
        tweens: this.tweens,
        seat: {
          id: p.id,
          name: p.name,
          isHuman: seatId === you,
          stack: p.stack,
          hole: [],
          bet: 0,
          committed: 0,
          folded: false,
          allIn: false,
          out: false,
        } as Seat,
        isHero: slot === 0,
      });
      const pos = this.seatPosition(slot, this.order.length);
      sv.position.set(pos.x, pos.y);
      this.seatViews.set(seatId, sv);
      this.view.addChild(sv);
    });
  }

  // ---------- 视图同步 ----------

  /** 收到服务端新视图就调一次 */
  update(view: HoldemView): void {
    if (this.destroyed) return;
    const isNewHand = this.current?.handNo !== view.handNo;
    this.current = view;

    if (!this.seatViews.size) this.buildSeats(view);
    if (isNewHand) this.resetForNewHand(view);

    this.syncSeats(view);
    this.syncBoard(view);
    this.syncHud(view);
    this.syncBar(view);
  }

  private resetForNewHand(view: HoldemView) {
    for (const v of this.boardViews) v.destroy();
    this.boardViews = [];
    this.clearRaiseChips();
    this.raiseMode = false;
    this.hud.hideBanner();
    for (const p of view.players) {
      const sv = this.seatViews.get(p.id);
      sv?.setStatus('');
      sv?.setHandName('');
      sv?.setFolded(false);
      sv?.setBet(0);
    }
  }

  private syncSeats(view: HoldemView) {
    for (const p of view.players) {
      const sv = this.seatViews.get(p.id);
      if (!sv) continue;
      sv.setStack(p.stack);
      sv.setBet(p.bet);
      sv.setDealer(p.dealer);
      sv.setActive(view.toAct === p.id);
      sv.setFolded(p.folded);
      if (p.handName) sv.setHandName(p.handName);

      // 底牌：只有自己和摊牌后公开的才显示正面
      const mine = p.id === view.you;
      const revealed = !!view.result && !p.folded && !!p.hole;
      if (mine || revealed) {
        this.setHole(p.id, p.hole ?? [], true);
      } else {
        this.setHole(p.id, [null, null], false);
      }
      if (p.allIn) sv.setStatus('全下', 0xd8b0e2);
    }
  }

  /** 底牌内容或朝向变了才重建，避免每次刷新都重画 */
  private setHole(seatId: number, cards: (Card | null)[], faceUp: boolean) {
    const sv = this.seatViews.get(seatId);
    if (!sv) return;
    const key = `${faceUp ? 'u' : 'd'}:${cards.map((c) => (c ? `${c.suit}_${c.rank}` : 'x')).join(',')}`;
    const cache = holeKeys.get(sv);
    if (cache === key) return;
    holeKeys.set(sv, key);
    sv.setHole(cards as Card[], faceUp);
  }

  private syncBoard(view: HoldemView) {
    const { x: bx, y: by, gap, scale } = POKER_LAYOUT.board;
    while (this.boardViews.length > view.board.length) {
      this.boardViews.pop()?.destroy();
    }
    for (let i = this.boardViews.length; i < view.board.length; i++) {
      const v = new CardView(this.tweens, view.board[i], false);
      v.scale.set(scale);
      v.position.set(POKER_LAYOUT.deck.x, POKER_LAYOUT.deck.y);
      v.rotation = -0.4;
      this.cardLayer.addChild(v);
      this.boardViews.push(v);
      // 飞入 + 翻开，不阻塞后续刷新
      void v
        .flyTo({ x: bx + (i - 2) * gap, y: by }, 0, 380, -90)
        .then(() => v.flip(true, 220));
    }
  }

  private syncHud(view: HoldemView) {
    this.hud.setPot(view.pot);
    const me = view.players.find((p) => p.id === view.you);
    if (me) this.hud.setStack(me.stack);

    const last = view.log[view.log.length - 1];
    if (view.result) {
      const w = view.result.winners;
      this.hud.setMessage(w.length ? `${w.map((x) => `${x.name} 赢 ${x.amount}`).join('、')}` : '这手没人收池');
      const top = w[0];
      if (top) {
        this.hud.showBanner(`${top.name} 收池 ${top.amount}`, top.handName ?? '', COLORS.gold);
      }
    } else if (view.toAct === view.you) {
      this.hud.setMessage('轮到你了');
    } else if (view.toAct !== null) {
      const who = view.players.find((p) => p.id === view.toAct);
      this.hud.setMessage(`等 ${who?.name ?? '下一位'} 决定…`);
    } else if (last) {
      this.hud.setMessage(last);
    }
  }

  private syncBar(view: HoldemView) {
    const legal = view.legal;
    const me = view.players.find((p) => p.id === view.you);
    if (!legal || !me || view.result) {
      if (!this.raiseMode) this.bar.hide();
      return;
    }
    if (this.raiseMode) return;
    this.bar.showMain(legal, me.stack);
  }

  // ---------- 加注 ----------

  private enterRaiseMode() {
    const legal = this.current?.legal;
    const me = this.current?.players.find((p) => p.id === this.current?.you);
    if (!legal || !me) return;
    this.raiseMode = true;
    this.raiseLegal = legal;
    this.raiseAmount = Math.max(
      Math.min(legal.minRaiseTo, legal.maxRaiseTo),
      Math.min(legal.maxRaiseTo, (this.current?.currentBet ?? 0) + BIG_BLIND),
    );
    this.clearRaiseChips();
    this.bar.showRaiseMode(this.raiseAmount <= legal.maxRaiseTo);
    this.updateRaiseInfo();
  }

  private exitRaiseMode() {
    this.raiseMode = false;
    this.raiseLegal = null;
    this.clearRaiseChips();
    const legal = this.current?.legal;
    const me = this.current?.players.find((p) => p.id === this.current?.you);
    if (legal && me) this.bar.showMain(legal, me.stack);
  }

  private onChipTap(value: number) {
    if (!this.raiseMode || !this.raiseLegal) {
      this.hud.setMessage(`先点「加注」，再点${PENALTY.label}设置加注额`);
      return;
    }
    const legal = this.current?.legal;
    if (!legal) return;
    this.raiseAmount = Math.min(this.raiseAmount + value, legal.maxRaiseTo);
    this.spawnRaiseChip(value);
    this.bar.showRaiseMode(this.raiseAmount <= legal.maxRaiseTo);
    this.updateRaiseInfo();
  }

  private updateRaiseInfo() {
    const legal = this.current?.legal;
    if (!legal) return;
    const capped = this.raiseAmount >= legal.maxRaiseTo;
    this.hud.setMessage(
      `加注至 ${this.raiseAmount}${capped ? '（全下）' : ` · 最少 ${legal.minRaiseTo}`} · 点${PENALTY.label}加额`,
    );
  }

  private spawnRaiseChip(value: number) {
    const def = POKER_CHIP_DEFS.find((d) => d.value === value)!;
    const chip = new ChipView(def);
    chip.scale.set(POKER_CHIP_DEFS.length > 0 ? POKER_LAYOUT.chipRack.scale : 1);
    const i = this.raiseChips.length;
    chip.position.set(
      POKER_LAYOUT.raiseStack.x + (Math.random() * 8 - 4),
      POKER_LAYOUT.raiseStack.y - 26 - i * 4,
    );
    chip.alpha = 0;
    this.chipLayer.addChild(chip);
    this.raiseChips.push(chip);
    this.tweens.to(chip, { alpha: 1, y: POKER_LAYOUT.raiseStack.y - i * 4 }, {
      duration: 240,
      ease: Easing.backOut,
    });
  }

  private clearRaiseChips() {
    for (const c of this.raiseChips) c.destroy();
    this.raiseChips = [];
  }

  destroy(): void {
    this.destroyed = true;
    for (const v of this.boardViews) v.destroy();
    for (const sv of this.seatViews.values()) {
      holeKeys.delete(sv);
      sv.destroy();
    }
    this.seatViews.clear();
    this.view.destroy({ children: true });
  }
}
