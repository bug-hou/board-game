import { Application, Container, Sprite } from 'pixi.js';
import { CARD_GAP, CARD_W, CHIP_DEFS, DESIGN_W, LAYOUT, START_BALANCE } from '../config';
import { BACK_TEXTURE_NAME, cardTexture } from '../core/atlas';
import { DragManager } from '../core/drag';
import { Easing, TweenManager } from '../core/tween';
import { createShoe, type Card } from '../game/cards';
import { handValue, isBlackjack, isBust, settleRound } from '../game/rules';
import { ButtonView } from '../view/ButtonView';
import { CardView } from '../view/CardView';
import { ChipView } from '../view/ChipView';
import { Hud } from '../view/Hud';
import { Table } from '../view/Table';
import { delay, type Scene } from './Scene';

type State = 'betting' | 'dealing' | 'player' | 'dealer' | 'settle';

interface HandEntry {
  card: Card;
  view: CardView;
}

export interface BlackjackOptions {
  onExit: () => void;
}

/** 21 点场景（由入口页进入） */
export class BlackjackScene implements Scene {
  readonly view = new Container();

  private tweens: TweenManager;
  private drag: DragManager;
  private cardLayer = new Container();
  private chipLayer = new Container();
  private hud!: Hud;

  private shoe: Card[] = createShoe(6);
  private playerHand: HandEntry[] = [];
  private dealerHand: HandEntry[] = [];
  private state: State = 'betting';
  private zCounter = 1;
  private dealerRevealed = false;

  private balance = START_BALANCE;
  private bet = 0;
  private betChips: ChipView[] = [];
  private rackChips: { chip: ChipView; homeX: number; homeY: number }[] = [];

  private dealBtn!: ButtonView;
  private clearBtn!: ButtonView;
  private hitBtn!: ButtonView;
  private standBtn!: ButtonView;
  private doubleBtn!: ButtonView;
  private nextBtn!: ButtonView;
  private exitBtn!: ButtonView;

  private destroyed = false;

  constructor(
    app: Application,
    private opts: BlackjackOptions,
  ) {
    this.tweens = new TweenManager(app.ticker);
    this.drag = new DragManager(this.view);
    this.buildScene();
  }

  // ---------- 场景搭建 ----------

  private buildScene() {
    this.view.addChild(new Table());
    this.cardLayer.sortableChildren = true;
    this.view.addChild(this.cardLayer);
    this.view.addChild(this.chipLayer);

    this.hud = new Hud(this.tweens);
    this.view.addChild(this.hud);

    this.buildShoeVisual();
    this.buildChips();
    this.buildButtons();

    this.exitBtn = new ButtonView({
      label: '返回大厅',
      width: 118,
      height: 40,
      color: 0xb9a06a,
      fontSize: 15,
    });
    this.exitBtn.position.set(DESIGN_W - 96, 34);
    this.exitBtn.on('pointerup', () => this.opts.onExit());
    this.view.addChild(this.exitBtn);

    this.hud.setBalance(this.balance);
    this.hud.setBet(0);
    this.hud.showMessage('拖拽或点击筹码下注');
  }

  private buildShoeVisual() {
    for (let i = 3; i >= 0; i--) {
      const sp = new Sprite(cardTexture(BACK_TEXTURE_NAME));
      sp.anchor.set(0.5);
      sp.scale.set(0.5);
      sp.position.set(LAYOUT.shoe.x + i * 1.5, LAYOUT.shoe.y - i * 1.5);
      sp.rotation = -0.06;
      sp.zIndex = i;
      this.cardLayer.addChild(sp);
    }
  }

  private buildChips() {
    CHIP_DEFS.forEach((def, i) => {
      const chip = new ChipView(def);
      const homeX = LAYOUT.chipRackX + i * 72;
      const homeY = LAYOUT.chipRackY;
      chip.position.set(homeX, homeY);
      this.chipLayer.addChild(chip);
      this.rackChips.push({ chip, homeX, homeY });

      this.drag.makeDraggable(chip, {
        onDragStart: () => this.state === 'betting',
        onDragEnd: (local) => {
          const inCircle =
            Math.hypot(local.x - LAYOUT.betCircle.x, local.y - LAYOUT.betCircle.y) < 62;
          if (inCircle) {
            if (!this.tryAddBet(def.value)) {
              this.hud.showMessage('筹码不足，无法下注');
            }
          }
          this.tweens.to(chip, { x: homeX, y: homeY, rotation: 0 }, { duration: 260, ease: Easing.backOut });
        },
      });
      this.drag.onClick(chip, () => {
        if (this.state !== 'betting') return;
        if (!this.tryAddBet(def.value)) this.hud.showMessage('筹码不足，无法下注');
      });
    });
  }

  private buildButtons() {
    const { x, y, gap } = LAYOUT.actionButtons;
    const mk = (label: string, row: number, color: number, cb: () => void) => {
      const b = new ButtonView({ label, color });
      b.position.set(x, y + row * gap);
      b.visible = false;
      b.on('pointerup', () => {
        if (b.enabled) cb();
      });
      this.view.addChild(b);
      return b;
    };

    this.dealBtn = mk('发 牌', 0, 0xe8c56a, () => void this.startRound());
    this.clearBtn = mk('清除下注', 1, 0xb9a06a, () => this.clearBet());
    this.hitBtn = mk('要 牌', 0, 0x6fd08c, () => void this.onHit());
    this.standBtn = mk('停 牌', 1, 0xe0a455, () => void this.onStand());
    this.doubleBtn = mk('加 倍', 2, 0x7fb2e0, () => void this.onDouble());
    this.nextBtn = mk('下一局', 0, 0xe8c56a, () => void this.toNextRound());
  }

  // ---------- 下注 ----------

  private tryAddBet(value: number): boolean {
    if (this.state !== 'betting') return false;
    if (this.balance < value) return false;
    this.balance -= value;
    this.bet += value;
    this.hud.setBalance(this.balance);
    this.hud.setBet(this.bet);

    const chip = new ChipView(CHIP_DEFS.find((c) => c.value === value)!);
    const idx = this.betChips.length;
    chip.position.set(LAYOUT.betCircle.x + (Math.random() * 8 - 4), LAYOUT.betCircle.y - 40);
    this.chipLayer.addChild(chip);
    this.betChips.push(chip);
    this.tweens.to(chip, { x: LAYOUT.betCircle.x + (Math.random() * 10 - 5), y: LAYOUT.betCircle.y - idx * 4 }, {
      duration: 240,
      ease: Easing.backOut,
    });
    this.drag.makeDraggable(chip, {
      onDragStart: () => this.state === 'betting',
      onDragEnd: (local) => {
        const inCircle =
          Math.hypot(local.x - LAYOUT.betCircle.x, local.y - LAYOUT.betCircle.y) < 62;
        if (!inCircle) this.removeBet(chip);
        else this.snapBetChip(chip);
      },
    });
    this.dealBtn.setEnabled(this.bet > 0);
    return true;
  }

  private snapBetChip(chip: ChipView) {
    const idx = this.betChips.indexOf(chip);
    const target = {
      x: LAYOUT.betCircle.x + (Math.random() * 10 - 5),
      y: LAYOUT.betCircle.y - Math.max(0, idx) * 4,
    };
    this.tweens.to(chip, { x: target.x, y: target.y }, { duration: 200, ease: Easing.backOut });
  }

  private removeBet(chip: ChipView) {
    const idx = this.betChips.indexOf(chip);
    if (idx < 0) return;
    this.betChips.splice(idx, 1);
    this.bet -= chip.value;
    this.balance += chip.value;
    this.hud.setBalance(this.balance);
    this.hud.setBet(this.bet);
    this.tweens.to(chip, { alpha: 0, y: chip.y - 30 }, {
      duration: 220,
      ease: Easing.quadIn,
      onComplete: () => chip.destroy(),
    });
    this.betChips.forEach((c) => this.snapBetChip(c));
    this.dealBtn.setEnabled(this.bet > 0);
  }

  private clearBet() {
    while (this.betChips.length) this.removeBet(this.betChips[0]);
  }

  /** 结算后筹码飞走（win=true 回收给玩家，false 归庄家，null=平局原地保留） */
  private async sweepBetChips(win: boolean | null) {
    if (win === null) return;
    const target = win ? { x: 120, y: 60 } : { x: LAYOUT.dealer.x, y: 80 };
    const chips = this.betChips;
    this.betChips = [];
    await Promise.all(
      chips.map((c, i) =>
        new Promise<void>((resolve) => {
          this.tweens.delay(i * 40, () => {
            this.tweens.to(c, { x: target.x, y: target.y, alpha: 0 }, {
              duration: 480,
              ease: Easing.quadIn,
              onComplete: () => {
                c.destroy();
                resolve();
              },
            });
          });
        }),
      ),
    );
    this.bet = 0;
    this.hud.setBet(0);
  }

  // ---------- 回合流程 ----------

  private setState(s: State) {
    this.state = s;
    this.dealBtn.visible = s === 'betting';
    this.clearBtn.visible = s === 'betting';
    this.hitBtn.visible = s === 'player';
    this.standBtn.visible = s === 'player';
    this.doubleBtn.visible = s === 'player';
    this.nextBtn.visible = s === 'settle';
    if (s === 'player') {
      this.doubleBtn.setEnabled(this.playerHand.length === 2 && this.balance >= this.bet);
    }
  }

  private toBetting() {
    if (this.destroyed) return;
    this.hud.hideBanner();
    this.setState('betting');
    this.dealBtn.setEnabled(this.bet > 0);
    this.hud.showMessage(this.bet > 0 ? '调整下注后点击发牌' : '拖拽或点击筹码下注');
  }

  private async startRound() {
    if (this.state !== 'betting' || this.bet <= 0) return;
    this.setState('dealing');
    this.hud.showMessage('');

    if (this.shoe.length < 52) {
      this.hud.showMessage('重新洗牌…');
      this.shoe = createShoe(6);
      await this.shuffleAnimation();
    }

    this.playerHand = [];
    this.dealerHand = [];
    this.dealerRevealed = false;

    await this.dealCard(this.playerHand, LAYOUT.player.x, LAYOUT.player.y, true);
    await this.dealCard(this.dealerHand, LAYOUT.dealer.x, LAYOUT.dealer.y, true);
    await this.dealCard(this.playerHand, LAYOUT.player.x, LAYOUT.player.y, true);
    await this.dealCard(this.dealerHand, LAYOUT.dealer.x, LAYOUT.dealer.y, false); // 暗牌
    await delay(200);

    if (isBlackjack(this.dealerHand.map((e) => e.card))) {
      await this.revealHole();
      await delay(400);
      await this.settle();
      return;
    }
    if (isBlackjack(this.playerHand.map((e) => e.card))) {
      this.hud.showMessage('Blackjack！');
      await this.revealHole();
      await delay(400);
      await this.settle();
      return;
    }
    this.setState('player');
    this.hud.showMessage('要牌 / 停牌 / 加倍');
  }

  private async onHit() {
    if (this.state !== 'player') return;
    this.setState('dealing');
    await this.dealCard(this.playerHand, LAYOUT.player.x, LAYOUT.player.y, true);
    if (isBust(this.playerHand.map((e) => e.card))) {
      this.hud.showMessage('爆牌了…');
      await delay(600);
      await this.revealHole();
      await this.settle();
      return;
    }
    this.setState('player');
  }

  private async onStand() {
    if (this.state !== 'player') return;
    await this.dealerTurn();
  }

  private async onDouble() {
    if (this.state !== 'player' || this.playerHand.length !== 2 || this.balance < this.bet) return;
    this.balance -= this.bet;
    this.hud.setBalance(this.balance);
    for (const c of [...this.betChips]) {
      const clone = new ChipView(CHIP_DEFS.find((d) => d.value === c.value)!);
      clone.position.copyFrom(c);
      clone.alpha = 0;
      this.chipLayer.addChild(clone);
      this.betChips.push(clone);
      this.tweens.to(clone, { alpha: 1, y: clone.y - 4 }, { duration: 200 });
    }
    this.bet *= 2;
    this.hud.setBet(this.bet);

    this.setState('dealing');
    await delay(250);
    await this.dealCard(this.playerHand, LAYOUT.player.x, LAYOUT.player.y, true);
    await delay(300);
    if (isBust(this.playerHand.map((e) => e.card))) {
      this.hud.showMessage('加倍后爆牌…');
      await delay(600);
      await this.revealHole();
      await this.settle();
      return;
    }
    await this.dealerTurn();
  }

  private async dealerTurn() {
    this.setState('dealer');
    this.hud.showMessage('庄家行动…');
    await this.revealHole();
    await delay(400);
    while (handValue(this.dealerHand.map((e) => e.card)).total < 17) {
      await this.dealCard(this.dealerHand, LAYOUT.dealer.x, LAYOUT.dealer.y, true);
      await delay(350);
    }
    await delay(300);
    await this.settle();
  }

  private async revealHole() {
    const hole = this.dealerHand[1];
    if (hole && !hole.view.faceUp) {
      await hole.view.flip(true, 380);
      this.dealerRevealed = true;
      this.updateScores();
    }
  }

  // ---------- 结算 ----------

  private async settle() {
    this.setState('settle');
    const outcome = settleRound(
      this.playerHand.map((e) => e.card),
      this.dealerHand.map((e) => e.card),
      this.bet,
    );

    const b = this.bet;
    switch (outcome.type) {
      case 'playerBlackjack':
        this.balance += b + outcome.payout;
        this.hud.showBanner('BLACKJACK!', `赢得 $${outcome.payout}`, 0xffd86a);
        await this.sweepBetChips(true);
        break;
      case 'win':
        this.balance += b + outcome.payout;
        this.hud.showBanner('你赢了', `+$${outcome.payout}`, 0x6fd08c);
        await this.sweepBetChips(true);
        break;
      case 'dealerBust':
        this.balance += b + outcome.payout;
        this.hud.showBanner('庄家爆牌', `+$${outcome.payout}`, 0x6fd08c);
        await this.sweepBetChips(true);
        break;
      case 'push':
        this.balance += b;
        this.hud.showBanner('平 局', '退还下注', 0xd8d0b8);
        break;
      case 'playerBust':
        this.hud.showBanner('爆 牌', `-$${b}`, 0xe05555);
        await this.sweepBetChips(false);
        break;
      case 'lose':
        this.hud.showBanner('你输了', `-$${b}`, 0xe05555);
        await this.sweepBetChips(false);
        break;
    }
    this.hud.setBalance(this.balance);
    this.setState('settle');
  }

  private async toNextRound() {
    this.hud.hideBanner();
    this.setState('dealing');
    const all = [...this.playerHand, ...this.dealerHand];
    this.playerHand = [];
    this.dealerHand = [];
    this.hud.showScore('player', LAYOUT.player.x, LAYOUT.player.y, '');
    this.hud.showScore('dealer', LAYOUT.dealer.x, LAYOUT.dealer.y, '');
    await Promise.all(
      all.map((e, i) =>
        new Promise<void>((resolve) => {
          this.tweens.delay(i * 45, () => {
            this.tweens.to(e.view, {
              x: LAYOUT.shoe.x,
              y: LAYOUT.shoe.y,
              rotation: -0.5,
              alpha: 0,
            }, {
              duration: 340,
              ease: Easing.quadIn,
              onComplete: () => {
                e.view.destroy();
                resolve();
              },
            });
          });
        }),
      ),
    );
    this.toBetting();
  }

  // ---------- 牌与动画 ----------

  private handX(count: number, i: number, baseX: number) {
    return baseX + (i - (count - 1) / 2) * CARD_GAP;
  }

  private async dealCard(hand: HandEntry[], baseX: number, baseY: number, faceUp: boolean) {
    const card = this.shoe.pop()!;
    const view = new CardView(this.tweens, card, false);
    view.position.set(LAYOUT.shoe.x, LAYOUT.shoe.y);
    view.rotation = -0.45;
    view.zIndex = ++this.zCounter;
    this.cardLayer.addChild(view);

    const idx = hand.length;
    hand.push({ card, view });
    const tx = this.handX(hand.length, idx, baseX);
    await view.flyTo({ x: tx, y: baseY }, 0, 460, -120);
    hand.forEach((e, i) => {
      if (e.view === view) return;
      this.tweens.to(e.view, { x: this.handX(hand.length, i, baseX), y: baseY }, {
        duration: 220,
        ease: Easing.cubicOut,
      });
    });
    if (faceUp) await view.flip(true, 240);
    this.updateScores();
  }

  private updateScores() {
    const pcards = this.playerHand.map((e) => e.card);
    if (pcards.length) {
      const pv = handValue(pcards);
      const x = this.handX(pcards.length, 0, LAYOUT.player.x) - CARD_W / 2 - 44;
      this.hud.showScore('player', x, LAYOUT.player.y, `${pv.total}`, pv.total > 21);
    } else {
      this.hud.showScore('player', LAYOUT.player.x, LAYOUT.player.y, '');
    }
    const dcards = this.dealerHand.map((e) => e.card);
    if (dcards.length) {
      const x = this.handX(dcards.length, 0, LAYOUT.dealer.x) - CARD_W / 2 - 44;
      if (this.dealerRevealed) {
        const dv = handValue(dcards);
        this.hud.showScore('dealer', x, LAYOUT.dealer.y, `${dv.total}`, dv.total > 21);
      } else {
        const up = handValue([dcards[0]]);
        this.hud.showScore('dealer', x, LAYOUT.dealer.y, `${up.total} + ?`);
      }
    } else {
      this.hud.showScore('dealer', LAYOUT.dealer.x, LAYOUT.dealer.y, '');
    }
  }

  /** 洗牌动画：一叠背面牌散开旋转再合拢 */
  private async shuffleAnimation() {
    const n = 12;
    const temps: Sprite[] = [];
    for (let i = 0; i < n; i++) {
      const sp = new Sprite(cardTexture(BACK_TEXTURE_NAME));
      sp.anchor.set(0.5);
      sp.scale.set(0.5);
      sp.position.set(LAYOUT.shoe.x, LAYOUT.shoe.y);
      sp.rotation = -0.45;
      sp.zIndex = 100 + i;
      this.cardLayer.addChild(sp);
      temps.push(sp);
    }

    await Promise.all(
      temps.map((sp, i) =>
        new Promise<void>((resolve) => {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
          const dist = 90 + Math.random() * 130;
          this.tweens.delay(i * 28, () => {
            this.tweens.to(sp, {
              x: LAYOUT.shoe.x + Math.cos(angle) * dist,
              y: LAYOUT.shoe.y + Math.sin(angle) * dist,
              rotation: (Math.random() - 0.5) * 1.6,
            }, {
              duration: 360,
              ease: Easing.cubicOut,
              onComplete: resolve,
            });
          });
        }),
      ),
    );
    await delay(120);
    await Promise.all(
      temps.map((sp, i) =>
        new Promise<void>((resolve) => {
          this.tweens.delay(i * 22, () => {
            this.tweens.to(sp, {
              x: LAYOUT.shoe.x,
              y: LAYOUT.shoe.y,
              rotation: -0.45,
              alpha: 0,
            }, {
              duration: 300,
              ease: Easing.quadIn,
              onComplete: () => {
                sp.destroy();
                resolve();
              },
            });
          });
        }),
      ),
    );
    this.hud.showMessage('已洗好牌，开始发牌');
    await delay(200);
  }

  /** 开场：洗牌表演后进入下注阶段 */
  async start() {
    await this.shuffleAnimation();
    this.toBetting();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.tweens.destroy();
    this.view.destroy({ children: true });
  }
}
