/**
 * 德州联机会话：服务端持有一份权威引擎状态，客户端只拿裁剪后的视图。
 *
 * 关键约定：
 * - 牌靴、发牌、结算全在服务端，客户端拿不到别人的底牌；
 * - 视图按观众裁剪（viewFor），摊牌后才公开未弃牌者的底牌；
 * - 断线不托管：轮到谁就一直等，只有房主能「本手跳过」某人。
 */
import type { Card } from '../../../src/game/cards';
import {
  HoldemEngine,
  STREET_NAME,
  type Action,
  type LegalActions,
  type SettleResult,
  type Street,
} from '../../../src/game/holdem/engine';

export interface NetPlayerSetup {
  actorId: string;
  name: string;
  avatar: string | null;
  stack: number;
}

export interface HoldemPlayerView {
  id: number;
  /** 座位对应的用户/访客 id，房主「跳过某人」时用 */
  actorId: string;
  name: string;
  avatar: string | null;
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  out: boolean;
  dealer: boolean;
  /** null 表示不可见（别人的底牌） */
  hole: Card[] | null;
  /** 摊牌后才有的牌型说明 */
  handName: string | null;
}

export interface HoldemResultView {
  winners: { id: number; name: string; amount: number; handName: string | null }[];
  /** 每个未弃牌玩家摊出的牌型（展示用） */
  shown: { id: number; name: string; hole: Card[]; handName: string | null }[];
}

export interface HoldemView {
  game: 'holdem';
  handNo: number;
  street: Street;
  streetName: string;
  board: Card[];
  pot: number;
  currentBet: number;
  /** 你的座位号，旁观为 -1 */
  you: number;
  toAct: number | null;
  legal: LegalActions | null;
  players: HoldemPlayerView[];
  log: string[];
  result: HoldemResultView | null;
}

const ACTION_TEXT: Record<Action['type'], string> = {
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  raise: '加注',
  allin: '全下',
};

export class HoldemSession {
  private engine: HoldemEngine;
  private actorBySeat: string[] = [];
  private metaBySeat: { name: string; avatar: string | null }[] = [];
  private result: HoldemResultView | null = null;
  private settleCache: SettleResult | null = null;

  handNo = 0;
  log: string[] = [];

  constructor(setup: NetPlayerSetup[], smallBlind = 10, bigBlind = 20) {
    this.engine = new HoldemEngine(
      setup.map((s) => ({ name: s.name, isHuman: true, stack: s.stack })),
      smallBlind,
      bigBlind,
    );
    this.actorBySeat = setup.map((s) => s.actorId);
    this.metaBySeat = setup.map((s) => ({ name: s.name, avatar: s.avatar }));
  }

  get seatCount(): number {
    return this.engine.players.length;
  }

  seatOf(actorId: string): number {
    return this.actorBySeat.indexOf(actorId);
  }

  actorAt(seatId: number): string | null {
    return this.actorBySeat[seatId] ?? null;
  }

  /** 下一位该行动的人（actorId），没人要动则是 null */
  toActActor(): string | null {
    const idx = this.engine.nextToAct();
    return idx === null ? null : (this.actorAt(idx) ?? null);
  }

  startHand(): void {
    this.result = null;
    this.settleCache = null;
    this.handNo += 1;
    this.engine.startHand();
    this.log = [`第 ${this.handNo} 手开始`];
  }

  nextHand(): void {
    this.engine.dealerIdx = (this.engine.dealerIdx + 1) % this.engine.players.length;
    this.startHand();
  }

  apply(actorId: string, action: Action): { ok: boolean; error?: string } {
    if (this.result) return { ok: false, error: '这手已经结束了，等下一手' };
    const seatId = this.seatOf(actorId);
    if (seatId < 0) return { ok: false, error: '你没坐在这个牌桌上' };
    if (this.engine.nextToAct() !== seatId) return { ok: false, error: '还没轮到你' };

    const seat = this.engine.players[seatId];
    const legal = this.engine.legalActions(seat);
    const checked = this.validate(seat.stack, action, legal);
    if (!checked.ok) return { ok: false, error: checked.error };

    this.engine.applyAction(seat, checked.action);

    const extra = action.type === 'raise' ? ` ${checked.action.amount}` : '';
    this.log.push(`${seat.name} ${ACTION_TEXT[checked.action.type]}${extra}`);
    if (this.log.length > 8) this.log.shift();

    this.pump();
    return { ok: true };
  }

  /** 房主让某个迟迟不动的人「本手先跳过」：本手直接弃牌，下一手自动回来 */
  skipHand(actorId: string): boolean {
    const seatId = this.seatOf(actorId);
    if (seatId < 0) return false;
    const seat = this.engine.players[seatId];
    if (seat.folded || seat.out) return false;
    seat.folded = true;
    this.log.push(`${seat.name} 这手先跳过`);
    this.pump();
    return true;
  }

  /** 校验合法性：模型或客户端都可能给出非法动作，一律挡回去 */
  private validate(
    stack: number,
    action: Action,
    legal: LegalActions,
  ): { ok: true; action: Action } | { ok: false; error: string } {
    switch (action.type) {
      case 'fold':
        return { ok: true, action: { type: 'fold' } };
      case 'check':
        if (!legal.canCheck) return { ok: false, error: '现在不能过牌，得跟注' };
        return { ok: true, action: { type: 'check' } };
      case 'call':
        if (legal.toCall <= 0) return { ok: false, error: '没人下注，直接过牌就行' };
        return { ok: true, action: { type: 'call' } };
      case 'raise': {
        if (!legal.canRaise) return { ok: false, error: '现在不能加注' };
        const want = Number(action.amount ?? 0);
        if (!Number.isFinite(want)) return { ok: false, error: '加注额不合法' };
        const target = Math.round(want);
        if (target > legal.maxRaiseTo) return { ok: false, error: '加注超过你有的筹码' };
        if (target < legal.minRaiseTo && target < legal.maxRaiseTo) {
          return { ok: false, error: `最少要加到 ${legal.minRaiseTo}` };
        }
        return { ok: true, action: { type: 'raise', amount: target } };
      }
      case 'allin':
        if (stack <= 0) return { ok: false, error: '你没有筹码了' };
        return { ok: true, action: { type: 'allin' } };
      default:
        return { ok: false, error: '不认识的动作' };
    }
  }

  /** 推进：没人要动就收注、发下一街，到河牌就摊牌 */
  private pump(): void {
    let guard = 0;
    while (this.engine.nextToAct() === null && !this.result) {
      if (guard++ > 8) break;

      const alive = this.engine.remaining();
      if (alive.length <= 1) {
        const pot = this.engine.awardToLastPlayer();
        const winner = this.engine.players[pot.winnerIds[0] ?? -1];
        this.result = {
          winners: winner
            ? [{ id: winner.id, name: winner.name, amount: pot.amount, handName: null }]
            : [],
          shown: [],
        };
        this.log.push(`${winner?.name ?? '没人'} 收下底池 ${pot.amount}`);
        return;
      }

      if (this.engine.street === 'river') {
        this.settleCache = this.engine.settle();
        this.result = this.toResultView(this.settleCache);
        this.log.push('摊牌');
        return;
      }

      this.engine.collectBets();
      const dealt = this.engine.dealNextStreet();
      if (dealt.length) this.log.push(`${STREET_NAME[this.engine.street]}发出`);
    }
  }

  private toResultView(settle: SettleResult): HoldemResultView {
    const payouts = new Map<number, number>();
    for (const [id, amount] of settle.payouts) {
      if (amount > 0) payouts.set(id, (payouts.get(id) ?? 0) + amount);
    }
    const winners = [...payouts.entries()].map(([id, amount]) => ({
      id,
      name: this.engine.players[id]?.name ?? '?',
      amount,
      handName: settle.hands.get(id)?.name ?? null,
    }));

    const shown = this.engine.remaining().map((p) => ({
      id: p.id,
      name: p.name,
      hole: p.hole,
      handName: settle.hands.get(p.id)?.name ?? null,
    }));

    return { winners, shown };
  }

  viewFor(actorId: string | null): HoldemView {
    const mySeat = actorId ? this.seatOf(actorId) : -1;
    const toActIdx = this.engine.nextToAct();
    const mySeatObj = mySeat >= 0 ? this.engine.players[mySeat] : null;

    return {
      game: 'holdem',
      handNo: this.handNo,
      street: this.engine.street,
      streetName: STREET_NAME[this.engine.street],
      board: [...this.engine.board],
      pot: this.engine.potInPlay(),
      currentBet: this.engine.currentBet,
      you: mySeat,
      toAct: toActIdx,
      legal: mySeatObj && toActIdx === mySeat ? this.engine.legalActions(mySeatObj) : null,
      players: this.engine.players.map((p) => {
        // 摊牌后公开未弃牌者的底牌，其余时间只给自己看
        const revealed = !!this.result && !p.folded;
        const mine = p.id === mySeat;
        return {
          id: p.id,
          actorId: this.actorBySeat[p.id] ?? '',
          name: p.name,
          avatar: this.metaBySeat[p.id]?.avatar ?? null,
          stack: p.stack,
          bet: p.bet,
          folded: p.folded,
          allIn: p.allIn,
          out: p.out,
          dealer: p.id === this.engine.dealerIdx,
          hole: mine || revealed ? [...p.hole] : null,
          handName: revealed ? (this.settleCache?.hands.get(p.id)?.name ?? null) : null,
        };
      }),
      log: [...this.log],
      result: this.result,
    };
  }
}
