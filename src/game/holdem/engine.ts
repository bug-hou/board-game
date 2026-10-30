import { createShoe, shuffle, type Card } from '../cards';
import { bestOf, compareEval, type HandEval } from './evaluate';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export const STREET_NAME: Record<Street, string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
};

export interface Seat {
  id: number;
  name: string;
  isHuman: boolean;
  stack: number;
  hole: Card[];
  /** 当前下注轮的已下注额 */
  bet: number;
  /** 本局累计投入（用于边池） */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** 筹码输光，已出局 */
  out: boolean;
}

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface Action {
  type: ActionType;
  /** raise 时为「加注到」的总额 */
  amount?: number;
}

export interface LegalActions {
  toCall: number;
  canCheck: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  canRaise: boolean;
}

export interface PotResult {
  amount: number;
  winnerIds: number[];
  best: HandEval | null;
  /** 是否只有一名参与者（其他人弃牌） */
  uncontested: boolean;
}

export interface SettleResult {
  pots: PotResult[];
  payouts: Map<number, number>;
  hands: Map<number, HandEval>;
}

export interface SeatSetup {
  name: string;
  isHuman: boolean;
  stack: number;
}

/**
 * 德州扑克引擎：只负责规则与状态，不含任何渲染/动画。
 * 由场景以「轮询 nextToAct → 取到动作 → applyAction」的方式驱动。
 */
export class HoldemEngine {
  players: Seat[] = [];
  board: Card[] = [];
  pot = 0;
  street: Street = 'preflop';
  currentBet = 0;
  lastRaiseSize: number;
  dealerIdx = 0;

  private deck: Card[] = [];
  private acted = new Set<number>();
  private lastAggressor = -1;
  private firstIdx = 0;

  constructor(
    setup: SeatSetup[],
    readonly smallBlind = 10,
    readonly bigBlind = 20,
  ) {
    this.players = setup.map((s, i) => ({
      id: i,
      name: s.name,
      isHuman: s.isHuman,
      stack: s.stack,
      hole: [],
      bet: 0,
      committed: 0,
      folded: false,
      allIn: false,
      out: false,
    }));
    this.lastRaiseSize = this.bigBlind;
  }

  // ---------- 查询 ----------

  get bigBlindSize() {
    return this.bigBlind;
  }

  /** 台面上的总筹码（含当前轮已下注） */
  potInPlay(): number {
    return this.pot + this.players.reduce((s, p) => s + p.bet, 0);
  }

  /** 尚未弃牌、未出局的玩家 */
  remaining(): Seat[] {
    return this.players.filter((p) => !p.folded && !p.out);
  }

  /** 还有筹码可参与后续手牌的玩家 */
  seated(): Seat[] {
    return this.players.filter((p) => !p.out);
  }

  legalActions(p: Seat): LegalActions {
    const toCall = Math.max(0, this.currentBet - p.bet);
    const canCheck = toCall === 0;
    const maxRaiseTo = p.bet + p.stack;
    const minRaiseTo = this.currentBet + Math.max(this.bigBlind, this.lastRaiseSize);
    // 只有加注额达到最小加注才算「加注」，否则只能全下（不足额全下）
    const canRaise = maxRaiseTo > this.currentBet && p.stack > toCall;
    return { toCall, canCheck, minRaiseTo, maxRaiseTo, canRaise };
  }

  // ---------- 一手牌 ----------

  /** 开始新一手：重置状态、洗牌、发底牌、下大小盲 */
  startHand(): void {
    for (const p of this.players) {
      p.hole = [];
      p.bet = 0;
      p.committed = 0;
      p.folded = false;
      p.allIn = false;
      p.out = p.stack <= 0;
    }
    this.board = [];
    this.pot = 0;
    this.street = 'preflop';
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.acted.clear();
    this.lastAggressor = -1;
    this.deck = shuffle(createShoe(1));

    const alive = this.seated();
    if (alive.length < 2) return;

    // 发牌：从小盲开始，每人一张，共两轮
    const order = this.seatOrder(this.dealerIdx);
    for (let round = 0; round < 2; round++) {
      for (const p of order) p.hole.push(this.deck.pop()!);
    }

    // 盲注（heads-up 时庄家下小盲）
    const sbIdx = this.nextSeated(this.dealerIdx);
    const bbIdx = this.nextSeated(sbIdx);
    this.forceBet(this.players[sbIdx], this.smallBlind);
    this.forceBet(this.players[bbIdx], this.bigBlind);

    this.firstIdx = this.nextSeated(bbIdx);
  }

  /** 按庄家之后的顺序返回座位 */
  private seatOrder(from: number): Seat[] {
    const n = this.players.length;
    const out: Seat[] = [];
    for (let i = 1; i <= n; i++) {
      const p = this.players[(from + i) % n];
      if (!p.out) out.push(p);
    }
    return out;
  }

  private nextSeated(from: number): number {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      if (!this.players[idx].out) return idx;
    }
    return from;
  }

  private forceBet(p: Seat, amount: number) {
    const a = Math.min(p.stack, amount);
    p.stack -= a;
    p.bet += a;
    p.committed += a;
    if (p.stack === 0) p.allIn = true;
    if (p.bet > this.currentBet) this.currentBet = p.bet;
  }

  private putIn(p: Seat, amount: number) {
    const a = Math.max(0, Math.min(amount, p.stack));
    p.stack -= a;
    p.bet += a;
    p.committed += a;
    if (p.stack === 0) p.allIn = true;
    if (p.bet > this.currentBet) this.currentBet = p.bet;
  }

  // ---------- 行动 ----------

  /** 下一个需要行动的座位下标，没有则返回 null */
  nextToAct(): number | null {
    const n = this.players.length;
    const start = this.lastAggressor >= 0 ? this.lastAggressor : this.firstIdx;
    for (let i = 1; i <= n; i++) {
      const idx = (start + i) % n;
      if (this.needsAction(this.players[idx])) return idx;
    }
    return null;
  }

  private needsAction(p: Seat): boolean {
    if (p.out || p.folded || p.allIn) return false;
    return !this.acted.has(p.id);
  }

  applyAction(p: Seat, action: Action): void {
    switch (action.type) {
      case 'fold':
        p.folded = true;
        this.acted.add(p.id);
        break;
      case 'check':
        this.acted.add(p.id);
        break;
      case 'call': {
        const need = Math.min(this.currentBet - p.bet, p.stack);
        this.putIn(p, need);
        this.acted.add(p.id);
        break;
      }
      case 'raise': {
        const target = Math.min(action.amount ?? this.currentBet, p.bet + p.stack);
        const prevBet = this.currentBet;
        this.putIn(p, target - p.bet);
        if (p.bet > prevBet) {
          this.lastRaiseSize = Math.max(this.bigBlind, p.bet - prevBet);
          this.acted.clear();
          this.lastAggressor = p.id;
        }
        this.acted.add(p.id);
        break;
      }
      case 'allin': {
        const prevBet = this.currentBet;
        this.putIn(p, p.stack);
        if (p.bet > prevBet) {
          this.lastRaiseSize = Math.max(this.bigBlind, p.bet - prevBet);
          this.acted.clear();
          this.lastAggressor = p.id;
        }
        this.acted.add(p.id);
        break;
      }
    }
  }

  /** 一轮下注结束：把各人 bet 收进底池，并重置下注轮状态 */
  collectBets(): void {
    for (const p of this.players) {
      this.pot += p.bet;
      p.bet = 0;
    }
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.acted.clear();
    this.lastAggressor = -1;
    // 后续各街由庄家后第一位开始
    this.firstIdx = this.nextSeated(this.dealerIdx);
  }

  /** 进入下一条街并发公共牌，返回新发出的牌 */
  dealNextStreet(): Card[] {
    this.deck.pop(); // burn
    const count = this.street === 'preflop' ? 3 : 1;
    const dealt: Card[] = [];
    for (let i = 0; i < count; i++) {
      const c = this.deck.pop();
      if (c) {
        dealt.push(c);
        this.board.push(c);
      }
    }
    this.street = this.street === 'preflop' ? 'flop' : this.street === 'flop' ? 'turn' : 'river';
    return dealt;
  }

  // ---------- 结算 ----------

  /** 未摊牌的提前结束（只剩一人） */
  awardToLastPlayer(): PotResult {
    const alive = this.remaining();
    const amount = this.pot + this.players.reduce((s, p) => s + p.bet, 0);
    for (const p of this.players) p.bet = 0;
    this.pot = 0;
    const winner = alive[0];
    if (winner) winner.stack += amount;
    return { amount, winnerIds: winner ? [winner.id] : [], best: null, uncontested: true };
  }

  settle(): SettleResult {
    // 先把当前轮的下注并进 pot，便于统一计算
    for (const p of this.players) {
      this.pot += p.bet;
      p.bet = 0;
    }
    this.street = 'showdown';

    const contributors = this.players.filter((p) => p.committed > 0);
    const levels = [...new Set(contributors.map((p) => p.committed))].sort((a, b) => a - b);

    const raw: { amount: number; eligible: Seat[] }[] = [];
    let prev = 0;
    for (const lvl of levels) {
      const amount = (lvl - prev) * contributors.filter((p) => p.committed >= lvl).length;
      prev = lvl;
      if (amount <= 0) continue;
      let eligible = this.players.filter((p) => !p.folded && p.committed >= lvl);
      if (eligible.length === 0) {
        // 该层所有人都弃牌：退给未弃牌者（并入上一层，没有则单独成池）
        const alive = this.remaining();
        if (raw.length) raw[raw.length - 1].amount += amount;
        else raw.push({ amount, eligible: alive });
        continue;
      }
      raw.push({ amount, eligible });
    }

    // 合并参与者相同的相邻池
    const merged: { amount: number; eligible: Seat[] }[] = [];
    for (const pot of raw) {
      const last = merged[merged.length - 1];
      if (last && last.eligible.length === pot.eligible.length &&
        last.eligible.every((p) => pot.eligible.includes(p))) {
        last.amount += pot.amount;
      } else {
        merged.push({ amount: pot.amount, eligible: pot.eligible });
      }
    }

    const hands = new Map<number, HandEval>();
    for (const p of this.remaining()) {
      hands.set(p.id, bestOf([...p.hole, ...this.board]));
    }

    const pots: PotResult[] = [];
    const payouts = new Map<number, number>();
    const n = this.players.length;

    for (const pot of merged) {
      if (pot.amount <= 0 || pot.eligible.length === 0) continue;
      let winners: Seat[];
      let best: HandEval | null = null;
      if (pot.eligible.length === 1) {
        winners = [pot.eligible[0]];
      } else {
        best = pot.eligible
          .map((p) => hands.get(p.id)!)
          .reduce((a, b) => (compareEval(b, a) > 0 ? b : a));
        winners = pot.eligible.filter((p) => compareEval(hands.get(p.id)!, best!) === 0);
      }
      // 平分，余数按庄家后顺序先给
      const sorted = [...winners].sort(
        (a, b) => (a.id - this.dealerIdx + n) % n - (b.id - this.dealerIdx + n) % n,
      );
      const share = Math.floor(pot.amount / sorted.length);
      const rem = pot.amount - share * sorted.length;
      sorted.forEach((p, i) => {
        const got = share + (i < rem ? 1 : 0);
        p.stack += got;
        payouts.set(p.id, (payouts.get(p.id) ?? 0) + got);
      });
      pots.push({
        amount: pot.amount,
        winnerIds: sorted.map((p) => p.id),
        best,
        uncontested: pot.eligible.length === 1,
      });
    }

    this.pot = 0;
    return { pots, payouts, hands };
  }

  /** 庄家位顺移到下一个仍在场的座位 */
  moveDealer(): void {
    this.dealerIdx = this.nextSeated(this.dealerIdx);
  }
}
