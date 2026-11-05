/**
 * 无庄家 21 点联机会话：服务端持有全部权威状态，客户端只拿裁剪后的视图。
 *
 * 规则定稿（2026-11-04，替代原先的「玩家轮流坐庄」）：
 * - 没有庄家，所有玩家平等 PK；先各自下注，再各发 2 张牌，各家牌明牌互见。
 * - 要牌阶段不按座位顺序：各自随意点「要牌」（每次 1 张）或「确认」锁定；
 *   爆牌（>21）自动锁定，不能再要牌。
 * - 全员确认后一起比点数：A 按 1/11 取最优，>21 出局，未爆者最接近 21 赢，同点并列。
 * - 结算沿用筹码架的「份」：赢家收、输家赔，1:1 对称、份额守恒；
 *   不实现「份 → 具体惩罚动作」的换算（规则未定稿）。
 * - 摊牌后由上层 8 秒开下一局；断线不托管，房主可「本局先跳过」某人。
 */
import type { Card } from '../../../src/game/cards';
import { createShoe } from '../../../src/game/cards';
import { handValue } from '../../../src/game/rules';

export type BJPhase = 'betting' | 'drawing' | 'showdown';

export interface BJSetup {
  actorId: string;
  name: string;
  avatar: string | null;
  balance: number;
}

export type BJAction =
  | { type: 'bet'; amount: number }
  | { type: 'clearBet' }
  | { type: 'confirmBet' }
  | { type: 'hit' }
  | { type: 'confirm' };

export interface BJPlayerView {
  id: number;
  /** 房主「跳过某人」时用 */
  actorId: string;
  name: string;
  avatar: string | null;
  balance: number;
  bet: number;
  /** 无庄家、无暗牌，所有人的牌都公开 */
  cards: Card[];
  total: number | null;
  busted: boolean;
  confirmedBet: boolean;
  confirmed: boolean;
  /** 结算后相对本局开始时的净变化，未结算为 null */
  delta: number | null;
  isWinner: boolean;
}

export interface BJResultView {
  winners: { id: number; name: string; total: number }[];
  text: string;
}

export interface BlackjackView {
  game: 'blackjack';
  roundNo: number;
  phase: BJPhase;
  /** 你的座位号，旁观为 -1 */
  you: number;
  players: BJPlayerView[];
  shoeRemaining: number;
  baseBet: number;
  log: string[];
  result: BJResultView | null;
  legal: {
    canBet: boolean;
    canClearBet: boolean;
    canConfirmBet: boolean;
    canHit: boolean;
    canConfirm: boolean;
  };
}

interface Player extends BJSetup {
  id: number;
  bet: number;
  cards: Card[];
  confirmedBet: boolean;
  confirmed: boolean;
  delta: number | null;
  isWinner: boolean;
  /** 本局下注前的份额，用来算 delta */
  roundStartBalance: number;
}

const DECKS = 6;
const RESHUFFLE_AT = 52;
const MAX_HAND_CARDS = 12;
const MAX_BET = 1000;

export class BlackjackSession {
  private players: Player[];
  private shoe: Card[] = [];
  private phase: BJPhase = 'betting';
  private roundNo = 0;
  private log: string[] = [];
  private result: BJResultView | null = null;

  constructor(
    setup: BJSetup[],
    private baseBet = 10,
  ) {
    this.players = setup.map((s, i) => ({
      ...s,
      id: i,
      bet: 0,
      cards: [],
      confirmedBet: false,
      confirmed: false,
      delta: null,
      isWinner: false,
      roundStartBalance: s.balance,
    }));
    this.startRound();
  }

  // ---------- 牌靴 ----------

  private ensureShoe(): void {
    if (this.shoe.length >= RESHUFFLE_AT) return;
    this.shoe = createShoe(DECKS);
    if (this.roundNo > 0) this.log.push('牌靴重新洗好了');
  }

  private draw(): Card {
    this.ensureShoe();
    const card = this.shoe.pop();
    if (!card) {
      this.shoe = createShoe(DECKS);
      return this.shoe.pop()!;
    }
    return card;
  }

  // ---------- 一局流程 ----------

  startRound(): void {
    this.roundNo++;
    this.result = null;
    this.phase = 'betting';
    this.log = [`第 ${this.roundNo} 局开始，各自下注`];
    this.ensureShoe();
    for (const p of this.players) {
      p.roundStartBalance = p.balance;
      // 默认帮每人放一份基础注，点「确认下注」就能开局，不用人人先翻筹码架
      const stake = Math.max(0, Math.min(this.baseBet, p.balance));
      p.balance -= stake;
      p.bet = stake;
      p.cards = [];
      p.confirmedBet = false;
      p.confirmed = false;
      p.delta = null;
      p.isWinner = false;
    }
  }

  private deal(): void {
    this.phase = 'drawing';
    for (let round = 0; round < 2; round++) {
      for (const p of this.players) p.cards.push(this.draw());
    }
    this.log.push('每人 2 张牌，随时可以要牌或确认');
    // 起手就爆牌（理论上 2 张最多 21，留个兜底）
    for (const p of this.players) {
      if (handValue(p.cards).total > 21) p.confirmed = true;
    }
    this.maybeSettle();
  }

  private maybeSettle(): void {
    if (this.phase !== 'drawing') return;
    if (this.players.every((p) => p.confirmed)) this.settle();
  }

  private settle(): void {
    this.phase = 'showdown';
    const scored = this.players.map((p) => ({ p, total: handValue(p.cards).total }));
    const alive = scored.filter((s) => s.total <= 21);
    const best = alive.length ? Math.max(...alive.map((s) => s.total)) : null;
    const winners = best === null ? [] : scored.filter((s) => s.total === best);

    for (const { p } of scored) p.isWinner = winners.some((w) => w.p === p);

    // 份额守恒：下注时已从各自的 balance 扣掉 bet，结算只决定这笔注归谁。
    // 有赢家时：赢家拿回自己的本金，每位输家的注均分给赢家（输家净 -bet）。
    // 没有赢家（全员爆牌）或全员并列的平局：本金原样退回，不产生转移。
    const winnerPlayers = winners.map((w) => w.p);
    const losers = this.players.filter((p) => !p.isWinner);
    if (winnerPlayers.length && losers.length) {
      for (const w of winnerPlayers) w.balance += w.bet;
      for (const l of losers) {
        const share = Math.floor(l.bet / winnerPlayers.length);
        for (const w of winnerPlayers) w.balance += share;
        const rest = l.bet - share * winnerPlayers.length;
        if (rest > 0) winnerPlayers[0].balance += rest;
      }
    } else {
      for (const p of this.players) p.balance += p.bet;
    }

    for (const p of this.players) p.delta = p.balance - p.roundStartBalance;

    const winnerViews = winnerPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      total: handValue(p.cards).total,
    }));
    const text = winnerViews.length
      ? `${winnerViews.map((w) => w.name).join('、')} ${winnerViews[0].total} 点赢`
      : '这局都爆牌了';
    this.result = { winners: winnerViews, text };
    this.log.push(text);
  }

  // ---------- 动作 ----------

  seatOf(actorId: string): number {
    return this.players.findIndex((p) => p.actorId === actorId);
  }

  apply(actorId: string, action: BJAction): { ok: boolean; error?: string } {
    const seat = this.seatOf(actorId);
    if (seat < 0) return { ok: false, error: '你没坐在这张牌桌上' };
    const p = this.players[seat];

    switch (action.type) {
      case 'bet': {
        if (this.phase !== 'betting') return { ok: false, error: '现在不是下注的时候' };
        if (p.confirmedBet) return { ok: false, error: '你已经确认下注了' };
        const amount = Number(action.amount);
        if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0 || amount > MAX_BET) {
          return { ok: false, error: '下注份数不合法' };
        }
        if (amount > p.balance) return { ok: false, error: '份额不够啦' };
        p.balance -= amount;
        p.bet += amount;
        this.log.push(`${p.name} 加到 ${p.bet} 份`);
        return { ok: true };
      }
      case 'clearBet': {
        if (this.phase !== 'betting') return { ok: false, error: '现在不是下注的时候' };
        if (p.confirmedBet) return { ok: false, error: '你已经确认下注了' };
        p.balance += p.bet;
        p.bet = 0;
        this.log.push(`${p.name} 清空了本局下注`);
        return { ok: true };
      }
      case 'confirmBet': {
        if (this.phase !== 'betting') return { ok: false, error: '现在不是下注的时候' };
        if (p.confirmedBet) return { ok: false, error: '你已经确认下注了' };
        if (p.bet <= 0) return { ok: false, error: '先放几份再确认' };
        p.confirmedBet = true;
        this.log.push(`${p.name} 下注 ${p.bet} 份`);
        if (this.players.every((x) => x.confirmedBet)) this.deal();
        return { ok: true };
      }
      case 'hit': {
        if (this.phase !== 'drawing') return { ok: false, error: '现在不能要牌' };
        if (p.confirmed) return { ok: false, error: '你已经确认牌了' };
        if (p.cards.length >= MAX_HAND_CARDS) return { ok: false, error: '手牌太多啦' };
        p.cards.push(this.draw());
        const total = handValue(p.cards).total;
        this.log.push(`${p.name} 要了一张，现在 ${total} 点`);
        if (total > 21) {
          p.confirmed = true;
          this.log.push(`${p.name} 爆牌了`);
        }
        this.maybeSettle();
        return { ok: true };
      }
      case 'confirm': {
        if (this.phase !== 'drawing') return { ok: false, error: '现在不用确认' };
        if (p.confirmed) return { ok: false, error: '你已经确认牌了' };
        p.confirmed = true;
        this.log.push(`${p.name} 确认牌`);
        this.maybeSettle();
        return { ok: true };
      }
    }
  }

  /** 房主让某人「本局先跳过」：按当前阶段替他确认，不是代打 */
  skipHand(targetActorId: string): boolean {
    const seat = this.seatOf(targetActorId);
    if (seat < 0) return false;
    const p = this.players[seat];
    if (this.phase === 'betting' && !p.confirmedBet) {
      // 他把注清空了的话，代他放一份基础注，否则「确认下注」会被拒
      if (p.bet <= 0 && p.balance > 0) {
        this.apply(targetActorId, { type: 'bet', amount: Math.min(this.baseBet, p.balance) });
      }
      return this.apply(targetActorId, { type: 'confirmBet' }).ok;
    }
    if (this.phase === 'drawing' && !p.confirmed) return this.apply(targetActorId, { type: 'confirm' }).ok;
    return false;
  }

  hasResult(): boolean {
    return this.phase === 'showdown';
  }

  // ---------- 视图 ----------

  viewFor(actorId: string | null): BlackjackView {
    const you = actorId === null ? -1 : this.seatOf(actorId);
    const me = you >= 0 ? this.players[you] : null;
    const betting = this.phase === 'betting';
    const drawing = this.phase === 'drawing';

    return {
      game: 'blackjack',
      roundNo: this.roundNo,
      phase: this.phase,
      you,
      shoeRemaining: this.shoe.length,
      baseBet: this.baseBet,
      log: [...this.log],
      result: this.result,
      legal: {
        canBet: betting && !!me && !me.confirmedBet,
        canClearBet: betting && !!me && !me.confirmedBet && me.bet > 0,
        canConfirmBet: betting && !!me && !me.confirmedBet && me.bet > 0,
        canHit: drawing && !!me && !me.confirmed && handValue(me.cards).total <= 21,
        canConfirm: drawing && !!me && !me.confirmed,
      },
      players: this.players.map((p) => {
        const total = p.cards.length ? handValue(p.cards).total : null;
        return {
          id: p.id,
          actorId: p.actorId,
          name: p.name,
          avatar: p.avatar,
          balance: p.balance,
          bet: p.bet,
          cards: [...p.cards],
          total,
          busted: total !== null && total > 21,
          confirmedBet: p.confirmedBet,
          confirmed: p.confirmed,
          delta: p.delta,
          isWinner: p.isWinner,
        };
      }),
    };
  }
}
