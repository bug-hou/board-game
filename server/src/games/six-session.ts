/**
 * 「六张牌」联机会话：服务端持有全部权威状态，客户端只拿裁剪后的视图。
 *
 * 流程：开局每人发 6 张暗牌（只有自己看得见）→ 各自把 6 张牌分进
 * 单张 / 两张 / 三张三个槽位并提交 → 全员提交后一起开牌 → 三组分别结算
 * （1 / 3 / 5 分）→ 8 秒后自动下一局。
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
  settleRound,
  splitByOrder,
  type GroupKey,
  type GroupMark,
  type Groups,
} from '../../../src/game/six-cards/rules';

export type SixPhase = 'grouping' | 'showdown';

export interface SixSetup {
  actorId: string;
  name: string;
  avatar: string | null;
}

/** order 为 6 个手牌下标的排列：[单张, 两张×2, 三张×3] */
export type SixAction = { type: 'submit'; order: number[] };

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
}

export interface SixPlayerView {
  id: number;
  actorId: string;
  name: string;
  avatar: string | null;
  score: number;
  delta: number | null;
  submitted: boolean;
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
  players: SixPlayerView[];
  shoeRemaining: number;
  weights: Record<GroupKey, number>;
  log: string[];
  result: SixResultView | null;
  legal: { canSubmit: boolean };
}

interface Player extends SixSetup {
  id: number;
  hand: Card[];
  groups: Groups | null;
  submitted: boolean;
  score: number;
  delta: number | null;
  roundStartScore: number;
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
    this.phase = 'grouping';
    this.log = [`第 ${this.roundNo} 局开始，每人 6 张牌`];
    this.ensureShoe();
    for (const p of this.players) {
      p.roundStartScore = p.score;
      p.hand = [];
      p.groups = null;
      p.submitted = false;
      p.delta = null;
    }
    // 一轮一张地发，和线下发牌顺序一致
    for (let i = 0; i < 6; i++) {
      for (const p of this.players) p.hand.push(this.draw());
    }
    this.log.push('把 6 张牌分成 1 张 / 2 张 / 3 张，锁好等大家一起开');
  }

  private maybeSettle(): void {
    if (this.phase !== 'grouping') return;
    if (this.players.every((p) => p.submitted)) this.settle();
  }

  private settle(): void {
    this.phase = 'showdown';
    const r = settleRound(this.players.map((p) => p.groups));
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

    const best = Math.max(...r.delta);
    const leaders = r.delta.flatMap((d, i) => (d === best ? [this.players[i].name] : []));
    const text = best > 0 ? `${leaders.join('、')} 本局 +${best} 分` : '这局打平了';
    this.result = { groups, text };

    for (const g of groups) this.log.push(g.note);
    this.log.push(text);
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
        this.maybeSettle();
        return { ok: true };
      }
    }
  }

  /** 房主让某人「本局先跳过」：按发牌顺序自动 1/2/3 分组，不是代打 */
  skipHand(targetActorId: string): boolean {
    const seat = this.seatOf(targetActorId);
    if (seat < 0) return false;
    if (this.phase !== 'grouping' || this.players[seat].submitted) return false;
    return this.apply(targetActorId, { type: 'submit', order: defaultOrder() }).ok;
  }

  hasResult(): boolean {
    return this.phase === 'showdown';
  }

  // ---------- 视图 ----------

  viewFor(actorId: string | null): SixView {
    const you = actorId === null ? -1 : this.seatOf(actorId);
    const me = you >= 0 ? this.players[you] : null;
    const revealed = this.phase === 'showdown';

    return {
      game: 'six',
      roundNo: this.roundNo,
      phase: this.phase,
      you,
      shoeRemaining: this.shoe.length,
      weights: { ...GROUP_WEIGHTS },
      log: [...this.log],
      result: this.result,
      legal: { canSubmit: !revealed && !!me && !me.submitted },
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
          // 别人的暗牌永不下发，摊牌后靠 groups 公开
          hand: self ? [...p.hand] : null,
          groups: revealed ? p.groups : self && p.submitted ? p.groups : null,
        };
      }),
    };
  }
}
