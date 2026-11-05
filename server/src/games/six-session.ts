/**
 * 「六张牌」联机会话：服务端持有全部权威状态，客户端只拿裁剪后的视图。
 *
 * 一局的流程：
 * 1. grouping  每人发 6 张暗牌（只有自己看得见）→ 各自分进单张/两张/三张并提交。
 * 2. doubling  全员分好组后，从头家开始按座位依次表态「加倍 / 不加倍」。
 *    头家不加倍也不影响后面的人各自表态；若所有人都加倍过，头家再获得一次
 *    加倍机会（可以选择不用）。
 * 3. showdown  三组分别结算（1 / 3 / 5 分），整体乘以本局倍率后一起开牌。
 *    倍率 = 2 × 加倍次数（无人加倍为 1 倍）。下一局头家 = 本局净分最高者，
 *    并列时座位号靠前者。8 秒后自动下一局。
 *
 * 客户端用「手牌下标的排列」提交分组，服务端据此还原三组，
 * 因此客户端无法伪造或替换手牌。分组草稿只存在客户端，服务端不存。
 */
import { createShoe, type Card } from '../../../src/game/cards';
import {
  GROUP_KEYS,
  GROUP_NAMES,
  GROUP_WEIGHTS,
  defaultOrder,
  multiplierOf,
  settleRound,
  splitByOrder,
  type GroupKey,
  type GroupMark,
  type Groups,
} from '../../../src/game/six-cards/rules';

export type SixPhase = 'grouping' | 'doubling' | 'showdown';

export interface SixSetup {
  actorId: string;
  name: string;
  avatar: string | null;
}

/** order 为 6 个手牌下标的排列：[单张, 两张×2, 三张×3] */
export type SixAction =
  | { type: 'submit'; order: number[] }
  | { type: 'double' }
  | { type: 'pass' };

export interface SixGroupView {
  key: GroupKey;
  name: string;
  weight: number;
  winners: number[];
  push: boolean;
  labels: string[];
  marks: GroupMark[];
  note: string;
}

export interface SixResultView {
  groups: SixGroupView[];
  text: string;
  multiplier: number;
  doubleCount: number;
  /** 下一局头家的座位号 */
  nextLeader: number;
}

export interface SixPlayerView {
  id: number;
  actorId: string;
  name: string;
  avatar: string | null;
  score: number;
  delta: number | null;
  submitted: boolean;
  /** 本局加倍次数，头家最多 2 次 */
  doubles: number;
  /** 加倍阶段是否已经表过态 */
  doubleDecided: boolean;
  /** 只有自己能看见 6 张手牌；别人的牌摊牌前一律不下发 */
  hand: Card[] | null;
  /** 摊牌后公开；摊牌前只有自己提交后能看到自己的 */
  groups: Groups | null;
}

export interface SixView {
  game: 'six';
  roundNo: number;
  phase: SixPhase;
  /** 你的座位号，旁观为 -1 */
  you: number;
  /** 本局头家座位号 */
  leader: number;
  /** 加倍阶段当前该谁表态，null 表示不在加倍阶段或已表态完 */
  doubleTurn: number | null;
  /** 当前本局倍率（表态过程中会实时变化） */
  multiplier: number;
  /** 全员加倍后头家是否还有第二次机会 */
  leaderBonusPending: boolean;
  players: SixPlayerView[];
  shoeRemaining: number;
  weights: Record<GroupKey, number>;
  log: string[];
  result: SixResultView | null;
  legal: { canSubmit: boolean; canDouble: boolean; canPass: boolean };
}

interface Player extends SixSetup {
  id: number;
  hand: Card[];
  groups: Groups | null;
  submitted: boolean;
  score: number;
  delta: number | null;
  roundStartScore: number;
  doubles: number;
  doubleDecided: boolean;
}

const DECKS = 6;
const RESHUFFLE_AT = 52;

export class SixSession {
  private players: Player[];
  private shoe: Card[] = [];
  private phase: SixPhase = 'grouping';
  private roundNo = 0;
  private log: string[] = [];
  private result: SixResultView | null = null;
  /** 本局头家；下一局头家结算时算出来，开局时生效 */
  private leader = 0;
  private nextLeader = 0;
  /** 加倍表态顺序：头家 → 按座位号绕一圈 */
  private doubleOrder: number[] = [];
  private doubleIndex = 0;
  private leaderBonusUsed = false;

  constructor(setup: SixSetup[]) {
    this.players = setup.map((s, i) => ({
      ...s,
      id: i,
      hand: [],
      groups: null,
      submitted: false,
      score: 0,
      delta: null,
      roundStartScore: 0,
      doubles: 0,
      doubleDecided: false,
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
    this.leader = this.nextLeader % this.players.length;
    this.result = null;
    this.phase = 'grouping';
    this.doubleOrder = [];
    this.doubleIndex = 0;
    this.leaderBonusUsed = false;
    this.log = [
      `第 ${this.roundNo} 局开始，每人 6 张牌`,
      `这局由 ${this.players[this.leader].name} 第一个表态`,
    ];
    this.ensureShoe();
    for (const p of this.players) {
      p.roundStartScore = p.score;
      p.hand = [];
      p.groups = null;
      p.submitted = false;
      p.delta = null;
      p.doubles = 0;
      p.doubleDecided = false;
    }
    // 一轮一张地发，和线下发牌顺序一致
    for (let i = 0; i < 6; i++) {
      for (const p of this.players) p.hand.push(this.draw());
    }
    this.log.push('把 6 张牌分成 1 张 / 2 张 / 3 张，锁好等大家一起开');
  }

  private maybeStartDoubling(): void {
    if (this.phase !== 'grouping') return;
    if (!this.players.every((p) => p.submitted)) return;
    this.phase = 'doubling';
    this.doubleOrder = this.players.map(
      (_, k) => (this.leader + k) % this.players.length,
    );
    this.doubleIndex = 0;
    this.log.push(`都分好组了，从 ${this.players[this.leader].name} 开始依次表态加倍`);
  }

  private totalDoubles(): number {
    return this.players.reduce((n, p) => n + p.doubles, 0);
  }

  private allDoubled(): boolean {
    return this.players.every((p) => p.doubles >= 1);
  }

  private leaderBonusPending(): boolean {
    return this.phase === 'doubling' && !this.leaderBonusUsed && this.allDoubled();
  }

  /** 当前该谁表态；null 表示加倍阶段结束 */
  private currentDoubleSeat(): number | null {
    if (this.phase !== 'doubling') return null;
    if (this.doubleIndex < this.doubleOrder.length) return this.doubleOrder[this.doubleIndex];
    if (this.leaderBonusPending()) return this.leader;
    return null;
  }

  private advanceDouble(): void {
    if (this.doubleIndex < this.doubleOrder.length) {
      this.doubleIndex++;
      if (this.doubleIndex < this.doubleOrder.length) return;
      if (this.allDoubled()) {
        this.log.push(`所有人都加倍了，${this.players[this.leader].name} 还有一次加倍机会`);
        return;
      }
    } else {
      this.leaderBonusUsed = true;
    }
    this.settle();
  }

  private settle(): void {
    this.phase = 'showdown';
    const doubleCount = this.totalDoubles();
    const multiplier = multiplierOf(doubleCount);
    const r = settleRound(this.players.map((p) => p.groups), multiplier);
    this.players.forEach((p, i) => {
      p.score += r.delta[i];
      p.delta = r.delta[i];
    });

    const groups: SixGroupView[] = GROUP_KEYS.map((key) => {
      const g = r.groups[key];
      return {
        key,
        name: GROUP_NAMES[key],
        weight: g.weight,
        winners: g.winners,
        push: g.push,
        labels: g.labels,
        marks: g.marks,
        note: g.note,
      };
    });

    // 净分最高者接任下一局头家；并列取座位号靠前的
    let next = 0;
    for (let i = 1; i < r.delta.length; i++) {
      if (r.delta[i] > r.delta[next]) next = i;
    }
    this.nextLeader = next;

    const best = Math.max(...r.delta);
    const leaders = r.delta.flatMap((d, i) => (d === best ? [this.players[i].name] : []));
    const text = best > 0
      ? `${leaders.join('、')} 本局 +${best} 分（${multiplier} 倍）`
      : `这局打平了（${multiplier} 倍）`;
    this.result = { groups, text, multiplier, doubleCount, nextLeader: next };

    for (const g of groups) this.log.push(g.note);
    this.log.push(text);
    this.log.push(`下一局由 ${this.players[next].name} 第一个表态`);
  }

  // ---------- 动作 ----------

  seatOf(actorId: string): number {
    return this.players.findIndex((p) => p.actorId === actorId);
  }

  apply(actorId: string, action: SixAction): { ok: boolean; error?: string } {
    const seat = this.seatOf(actorId);
    if (seat < 0) return { ok: false, error: '你没坐在这张牌桌上' };
    const p = this.players[seat];

    switch (action.type) {
      case 'submit': {
        if (this.phase !== 'grouping') return { ok: false, error: '现在不能提交分组' };
        if (p.submitted) return { ok: false, error: '你已经锁定分组了' };
        if (!Array.isArray(action.order)) return { ok: false, error: '分组格式不对' };
        const groups = splitByOrder(p.hand, action.order);
        if (!groups) return { ok: false, error: '每张牌都要分进一个位置' };
        p.groups = groups;
        p.submitted = true;
        this.log.push(`${p.name} 锁好了分组`);
        this.maybeStartDoubling();
        return { ok: true };
      }
      case 'double':
      case 'pass': {
        if (this.phase !== 'doubling') return { ok: false, error: '现在不是加倍的时候' };
        const turn = this.currentDoubleSeat();
        if (turn === null) return { ok: false, error: '加倍表态已经结束' };
        if (seat !== turn) return { ok: false, error: '还没轮到你表态' };
        const yes = action.type === 'double';
        if (yes) p.doubles += 1;
        p.doubleDecided = true;
        this.log.push(`${p.name} ${yes ? '加倍' : '不加倍'} · 当前 ${multiplierOf(this.totalDoubles())} 倍`);
        this.advanceDouble();
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知动作' };
    }
  }

  /** 房主让某人「本局先跳过」：分组阶段替他按默认顺序分组，加倍阶段替他选不加倍 */
  skipHand(targetActorId: string): boolean {
    const seat = this.seatOf(targetActorId);
    if (seat < 0) return false;
    if (this.phase === 'grouping' && !this.players[seat].submitted) {
      return this.apply(targetActorId, { type: 'submit', order: defaultOrder() }).ok;
    }
    if (this.phase === 'doubling' && this.currentDoubleSeat() === seat) {
      return this.apply(targetActorId, { type: 'pass' }).ok;
    }
    return false;
  }

  hasResult(): boolean {
    return this.phase === 'showdown';
  }

  // ---------- 视图 ----------

  viewFor(actorId: string | null): SixView {
    const you = actorId === null ? -1 : this.seatOf(actorId);
    const me = you >= 0 ? this.players[you] : null;
    const revealed = this.phase === 'showdown';
    const turn = this.currentDoubleSeat();
    const canDouble = this.phase === 'doubling' && !!me && turn === you;

    return {
      game: 'six',
      roundNo: this.roundNo,
      phase: this.phase,
      you,
      leader: this.leader,
      doubleTurn: turn,
      multiplier: multiplierOf(this.totalDoubles()),
      leaderBonusPending: this.leaderBonusPending(),
      shoeRemaining: this.shoe.length,
      weights: { ...GROUP_WEIGHTS },
      log: [...this.log],
      result: this.result,
      legal: {
        canSubmit: this.phase === 'grouping' && !!me && !me.submitted,
        canDouble,
        canPass: canDouble,
      },
      players: this.players.map((p) => {
        const self = p.id === you;
        return {
          id: p.id,
          actorId: p.actorId,
          name: p.name,
          avatar: p.avatar,
          score: p.score,
          delta: p.delta,
          submitted: p.submitted,
          doubles: p.doubles,
          doubleDecided: p.doubleDecided,
          // 别人的暗牌永不下发，摊牌后靠 groups 公开
          hand: self ? [...p.hand] : null,
          groups: revealed ? p.groups : self && p.submitted ? p.groups : null,
        };
      }),
    };
  }
}
