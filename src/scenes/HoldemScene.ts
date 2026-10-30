import { Application, Container, Sprite } from 'pixi.js';
import {
  BIG_BLIND,
  POKER_CHIP_DEFS,
  POKER_LAYOUT,
  POKER_START_STACK,
  SMALL_BLIND,
} from '../config';
import { BACK_TEXTURE_NAME, cardTexture } from '../core/atlas';
import { Easing, TweenManager } from '../core/tween';
import { aiDecide, pickAiName, randomProfile, type AiProfile } from '../game/holdem/ai';
import {
  HoldemEngine,
  STREET_NAME,
  type Action,
  type LegalActions,
  type Seat,
  type Street,
} from '../game/holdem/engine';
import { ButtonView } from '../view/ButtonView';
import { CardView } from '../view/CardView';
import { ChipView } from '../view/ChipView';
import { ActionBar } from '../view/holdem/ActionBar';
import { PokerHud } from '../view/holdem/PokerHud';
import { PokerTable } from '../view/holdem/PokerTable';
import { SeatView } from '../view/holdem/SeatView';
import { delay, type Scene } from './Scene';

export interface HoldemOptions {
  aiCount: number;
  onExit: () => void;
}

const ACTION_TEXT: Record<Action['type'], string> = {
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  raise: '加注',
  allin: '全下',
};

export class HoldemScene implements Scene {
  readonly view = new Container();

  private tweens: TweenManager;
  private engine: HoldemEngine;
  private profiles = new Map<number, AiProfile>();

  private cardLayer = new Container();
  private chipLayer = new Container();
  private hud!: PokerHud;
  private bar = new ActionBar();
  private seatViews = new Map<number, SeatView>();
  private boardViews: CardView[] = [];
  private rackChips: ChipView[] = [];
  private raiseChips: ChipView[] = [];
  private exitBtn!: ButtonView;

  private zCounter = 1;
  private destroyed = false;
  private humanResolve: ((a: Action) => void) | null = null;
  private raiseMode = false;
  private raiseAmount = 0;
  private raiseLegal: LegalActions | null = null;

  constructor(
    app: Application,
    private opts: HoldemOptions,
  ) {
    this.tweens = new TweenManager(app.ticker);
    this.engine = new HoldemEngine(this.buildSeats(), SMALL_BLIND, BIG_BLIND);
    this.buildScene();
  }

  // ---------- 构建 ----------

  private buildSeats(): { name: string; isHuman: boolean; stack: number }[] {
    const seats = [{ name: '你', isHuman: true, stack: POKER_START_STACK }];
    const used = ['你'];
    for (let i = 0; i < this.opts.aiCount; i++) {
      const name = pickAiName(used);
      used.push(name);
      seats.push({ name, isHuman: false, stack: POKER_START_STACK });
    }
    // 座位顺序：玩家在 index 0，AI 依次往后
    this.profiles.clear();
    for (let i = 1; i < seats.length; i++) this.profiles.set(i, randomProfile());
    return seats;
  }

  /** 座位坐标：玩家在下，AI 沿上半椭圆分布 */
  private seatPosition(id: number): { x: number; y: number } {
    if (id === 0) return { x: POKER_LAYOUT.hero.x, y: POKER_LAYOUT.hero.y };
    const { cx, cy, rx, ry } = POKER_LAYOUT.table;
    const k = this.opts.aiCount;
    const i = id - 1;
    const rad = ((180 + ((i + 1) * 180) / (k + 1)) * Math.PI) / 180;
    return { x: cx + rx * Math.cos(rad), y: cy + ry * Math.sin(rad) };
  }

  private buildScene() {
    this.view.addChild(new PokerTable());

    this.cardLayer.sortableChildren = true;
    this.view.addChild(this.cardLayer);
    this.view.addChild(this.chipLayer);

    this.hud = new PokerHud(this.tweens);
    this.view.addChild(this.hud);
    this.hud.setBlinds(SMALL_BLIND, BIG_BLIND);

    // 发牌堆
    for (let i = 3; i >= 0; i--) {
      const sp = new Sprite(cardTexture(BACK_TEXTURE_NAME));
      sp.anchor.set(0.5);
      sp.scale.set(0.42);
      sp.position.set(POKER_LAYOUT.deck.x + i * 1.5, POKER_LAYOUT.deck.y - i * 1.5);
      sp.rotation = -0.06;
      this.cardLayer.addChild(sp);
    }

    for (const p of this.engine.players) {
      const pos = this.seatPosition(p.id);
      const sv = new SeatView({ tweens: this.tweens, seat: p, isHero: p.isHuman });
      sv.position.set(pos.x, pos.y);
      this.seatViews.set(p.id, sv);
      this.view.addChild(sv);
    }

    this.buildChipRack();
    this.view.addChild(this.bar);
    this.wireActionBar();

    this.exitBtn = new ButtonView({
      label: '返回大厅',
      width: 118,
      height: 40,
      color: 0xb9a06a,
      fontSize: 15,
    });
    this.exitBtn.position.set(POKER_LAYOUT.exit.x, POKER_LAYOUT.exit.y);
    this.exitBtn.on('pointerup', () => this.opts.onExit());
    this.view.addChild(this.exitBtn);

    this.refreshStacks();
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
      this.rackChips.push(chip);
    });
  }

  private wireActionBar() {
    this.bar.onFold = () => this.submit({ type: 'fold' });
    this.bar.onCall = () => {
      const l = this.engine.legalActions(this.hero);
      this.submit({ type: l.canCheck ? 'check' : 'call' });
    };
    this.bar.onAllIn = () => this.submit({ type: 'allin' });
    this.bar.onRaise = () => this.enterRaiseMode();
    this.bar.onCancelRaise = () => this.exitRaiseMode();
    this.bar.onConfirmRaise = () => {
      const amount = this.raiseAmount;
      this.raiseMode = false;
      this.raiseLegal = null;
      this.submit({ type: 'raise', amount });
    };
    this.bar.onNext = () => this.submit({ type: 'fold' });
  }

  private get hero(): Seat {
    return this.engine.players[0];
  }

  // ---------- 生命周期 ----------

  async start() {
    this.hud.setMessage('牌局开始，祝好运');
    await delay(500);
    while (!this.destroyed) {
      const withChips = this.engine.players.filter((p) => p.stack > 0);
      if (withChips.length < 2) {
        await this.gameOver(withChips[0]?.isHuman ?? false);
        return;
      }
      await this.playHand();
      if (this.destroyed) return;
      this.engine.moveDealer();
      await this.delay(400);
    }
  }

  async playHand() {
    this.clearTable();
    this.engine.startHand();
    this.refreshStacks();
    this.hud.setMessage(`${STREET_NAME.preflop} · 下大小盲`);
    this.updateDealer();

    await this.dealHoleCards();
    if (this.destroyed) return;

    let alive = this.engine.remaining().length;
    await this.bettingRound('preflop');
    if (this.destroyed) return;

    for (const street of ['flop', 'turn', 'river'] as Street[]) {
      alive = this.engine.remaining().length;
      if (alive <= 1) break;
      await this.dealBoard();
      if (this.destroyed) return;
      await this.bettingRound(street);
      if (this.destroyed) return;
      if (this.engine.remaining().length <= 1) break;
    }

    if (this.engine.remaining().length > 1) await this.showdown();
    else await this.finishEarly();
    if (this.destroyed) return;

    this.bar.showNext();
    this.hud.setMessage('点击「下一手」继续');
    await this.waitNext();
  }

  // ---------- 下注轮 ----------

  private async bettingRound(street: Street) {
    this.hud.setMessage(`${STREET_NAME[street]} · 下注`);
    this.bar.hide();
    this.clearRaiseChips();
    for (const p of this.engine.players) {
      this.seatViews.get(p.id)?.setStatus('');
      this.seatViews.get(p.id)?.setHandName('');
    }
    await this.delay(260);

    while (!this.destroyed) {
      if (this.engine.remaining().length <= 1) break;
      const idx = this.engine.nextToAct();
      if (idx === null) break;
      const p = this.engine.players[idx];
      const sv = this.seatViews.get(p.id)!;
      sv.setActive(true);

      const action = p.isHuman ? await this.humanAction(p) : await this.aiAction(p);
      sv.setActive(false);
      if (this.destroyed) return;

      this.engine.applyAction(p, action);
      this.showAction(p, action);
      this.refreshStacks();
      this.updatePot();
      await this.delay(420);
    }

    this.engine.collectBets();
    this.updatePot();
    for (const p of this.engine.players) this.seatViews.get(p.id)?.setBet(0);
    await this.delay(200);
  }

  private showAction(p: Seat, action: Action) {
    const sv = this.seatViews.get(p.id)!;
    let text = ACTION_TEXT[action.type];
    if (action.type === 'call') text = `跟注 $${Math.min(this.engine.currentBet, p.bet)}`;
    if (action.type === 'raise') text = `加注至 $${p.bet}`;
    sv.setStatus(text, action.type === 'fold' ? 0xa89b80 : 0xffd86a);
    if (action.type === 'fold') sv.setFolded(true);
    if (action.type === 'allin') sv.setStatus('全下', 0xd08fe0);
    this.hud.setMessage(`${p.name} ${text}`);
  }

  // ---------- 玩家操作 ----------

  private humanAction(p: Seat): Promise<Action> {
    const legal = this.engine.legalActions(p);
    this.bar.showMain(legal, p.stack);
    this.hud.setMessage(legal.canCheck ? '轮到你：过牌 / 加注' : `轮到你：跟注 $${legal.toCall} / 加注`);
    return new Promise<Action>((resolve) => {
      this.humanResolve = resolve;
    });
  }

  private submit(action: Action) {
    if (!this.humanResolve) return;
    const resolve = this.humanResolve;
    this.humanResolve = null;
    this.bar.hide();
    this.raiseMode = false;
    this.raiseLegal = null;
    resolve(action);
  }

  private enterRaiseMode() {
    const p = this.hero;
    const legal = this.engine.legalActions(p);
    this.raiseMode = true;
    this.raiseLegal = legal;
    this.raiseAmount = Math.max(
      Math.min(legal.minRaiseTo, legal.maxRaiseTo),
      Math.min(legal.maxRaiseTo, this.engine.currentBet + this.engine.bigBlindSize),
    );
    this.clearRaiseChips();
    this.bar.showRaiseMode(this.raiseAmount <= legal.maxRaiseTo);
    this.updateRaiseInfo();
  }

  private exitRaiseMode() {
    this.raiseMode = false;
    this.raiseLegal = null;
    this.clearRaiseChips();
    const legal = this.engine.legalActions(this.hero);
    this.bar.showMain(legal, this.hero.stack);
  }

  private onChipTap(value: number) {
    if (!this.raiseMode || !this.raiseLegal) {
      this.hud.setMessage('先点「加注」，再点筹码设置加注额');
      return;
    }
    const legal = this.engine.legalActions(this.hero);
    this.raiseAmount = Math.min(this.raiseAmount + value, legal.maxRaiseTo);
    this.spawnRaiseChip(value);
    this.bar.showRaiseMode(this.raiseAmount <= legal.maxRaiseTo);
    this.updateRaiseInfo();
  }

  private updateRaiseInfo() {
    const legal = this.engine.legalActions(this.hero);
    const capped = this.raiseAmount >= legal.maxRaiseTo;
    this.hud.setMessage(
      `加注至 $${this.raiseAmount}${capped ? '（全下）' : ` · 最少 $${legal.minRaiseTo}`} · 点筹码加额`,
    );
  }

  private spawnRaiseChip(value: number) {
    const def = POKER_CHIP_DEFS.find((d) => d.value === value)!;
    const chip = new ChipView(def);
    chip.scale.set(POKER_LAYOUT.chipRack.scale);
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

  private waitNext(): Promise<void> {
    this.bar.showNext();
    return new Promise<void>((resolve) => {
      this.humanResolve = () => {
        this.humanResolve = null;
        resolve();
      };
    });
  }

  // ---------- AI ----------

  private async aiAction(p: Seat): Promise<Action> {
    const sv = this.seatViews.get(p.id)!;
    sv.setStatus('思考中…', 0x9fd8b4);
    await this.delay(420 + Math.random() * 520);
    if (this.destroyed) return { type: 'fold' };
    const profile = this.profiles.get(p.id) ?? randomProfile();
    return aiDecide(this.engine, p, profile);
  }

  // ---------- 发牌 ----------

  private async dealHoleCards() {
    const order = this.dealOrder();
    for (let round = 0; round < 2; round++) {
      for (const p of order) {
        if (this.destroyed) return;
        const sv = this.seatViews.get(p.id)!;
        if (round === 0) sv.setHole(p.hole.slice(), p.isHuman);
        await sv.dealIn(POKER_LAYOUT.deck);
      }
    }
    // 盲注展示
    for (const p of this.engine.players) {
      if (p.bet > 0) this.seatViews.get(p.id)?.setBet(p.bet);
    }
    this.updatePot();
    await this.delay(240);
  }

  /** 从庄家下一位开始的发牌顺序 */
  private dealOrder(): Seat[] {
    const n = this.engine.players.length;
    const out: Seat[] = [];
    for (let i = 1; i <= n; i++) {
      const p = this.engine.players[(this.engine.dealerIdx + i) % n];
      if (!p.out) out.push(p);
    }
    return out;
  }

  private async dealBoard() {
    const dealt = this.engine.dealNextStreet();
    const { x: bx, y: by, gap, scale } = POKER_LAYOUT.board;
    this.hud.setMessage(`${STREET_NAME[this.engine.street]} 发出`);
    for (const card of dealt) {
      const idx = this.boardViews.length;
      const v = new CardView(this.tweens, card, false);
      v.scale.set(scale);
      v.position.set(POKER_LAYOUT.deck.x, POKER_LAYOUT.deck.y);
      v.rotation = -0.4;
      v.zIndex = ++this.zCounter;
      this.cardLayer.addChild(v);
      this.boardViews.push(v);
      await v.flyTo({ x: bx + (idx - 2) * gap, y: by }, 0, 380, -90);
      await v.flip(true, 220);
    }
    await this.delay(260);
  }

  // ---------- 摊牌与结算 ----------

  private async showdown() {
    this.hud.setMessage('摊牌！');
    this.bar.hide();
    for (const p of this.engine.remaining()) {
      const sv = this.seatViews.get(p.id)!;
      await sv.reveal();
      if (this.destroyed) return;
    }
    await this.delay(300);

    const result = this.engine.settle();
    for (const [id, hand] of result.hands) {
      this.seatViews.get(id)?.setHandName(hand.name);
    }
    for (const pot of result.pots) {
      for (const id of pot.winnerIds) {
        this.seatViews.get(id)?.setStatus('赢', 0x6fd08c);
      }
    }
    this.refreshStacks();
    this.updatePot();

    const gain = result.payouts.get(0) ?? 0;
    const invested = this.engine.players[0].committed;
    if (gain > 0) {
      const net = gain - invested;
      this.hud.showBanner('你赢了！', `+$${net >= 0 ? net : gain}`, 0x6fd08c);
    } else if (this.hero.folded) {
      this.hud.showBanner('已弃牌', `-$${invested}`, 0xe05555);
    } else {
      const names = result.pots
        .filter((p) => p.winnerIds.length)
        .map((p) => this.engine.players[p.winnerIds[0]].name);
      this.hud.showBanner(`${[...new Set(names)].join(' / ')} 获胜`, `-$${invested}`, 0xe0a455);
    }
    await this.delay(600);
  }

  private async finishEarly() {
    this.bar.hide();
    const res = this.engine.awardToLastPlayer();
    const winner = res.winnerIds.length ? this.engine.players[res.winnerIds[0]] : null;
    this.refreshStacks();
    this.updatePot();
    if (!winner) return;
    this.seatViews.get(winner.id)?.setStatus('赢', 0x6fd08c);
    if (winner.isHuman) {
      this.hud.showBanner('你赢了！', `+$${res.amount - this.hero.committed}`, 0x6fd08c);
    } else if (this.hero.folded) {
      this.hud.showBanner(`${winner.name} 获胜`, `-$${this.hero.committed}`, 0xe05555);
    } else {
      this.hud.showBanner(`${winner.name} 获胜`, ``, 0xe0a455);
    }
    await this.delay(500);
  }

  private async gameOver(win: boolean) {
    this.bar.hide();
    if (win) this.hud.showBanner('通杀全场！', '所有对手都已出局', 0x6fd08c);
    else this.hud.showBanner('筹码用尽', '返回大厅再来一局', 0xe05555);
    await this.delay(1600);
    if (!this.destroyed) this.opts.onExit();
  }

  // ---------- 辅助 ----------

  private updatePot() {
    this.hud.setPot(this.engine.potInPlay());
    for (const p of this.engine.players) {
      this.seatViews.get(p.id)?.setBet(p.bet);
    }
  }

  private updateDealer() {
    for (const p of this.engine.players) {
      this.seatViews.get(p.id)?.setDealer(p.id === this.engine.dealerIdx);
    }
  }

  private refreshStacks() {
    for (const p of this.engine.players) this.seatViews.get(p.id)?.setStack(p.stack);
    this.hud.setStack(this.hero.stack);
  }

  private clearTable() {
    for (const v of this.boardViews) v.destroy();
    this.boardViews = [];
    this.clearRaiseChips();
    this.hud.hideBanner();
    this.hud.setPot(0);
    for (const p of this.engine.players) {
      const sv = this.seatViews.get(p.id)!;
      sv.clearCards();
      sv.setFolded(false);
      sv.setBet(0);
      sv.setStatus('');
      sv.setHandName('');
      sv.setActive(false);
    }
  }

  private async delay(ms: number) {
    await delay(ms);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.humanResolve) {
      const r = this.humanResolve;
      this.humanResolve = null;
      r({ type: 'fold' });
    }
    this.tweens.destroy();
    this.view.destroy({ children: true });
  }
}
