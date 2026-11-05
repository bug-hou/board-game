/**
 * 「六张牌」分组玩法规则内核（前后端共用的纯函数，不依赖任何运行时模块）。
 *
 * 每人 6 张牌，自己拆成 1 张 / 2 张 / 3 张三组，全员锁定后同时开牌：
 * - 1 张：只比点数，A > K > Q > … > 2，点数相同判平（不比花色）。
 * - 2 张：十点半。A = 1 点，2~10 按面值，J/Q/K = 0.5 点，超过 10.5 爆牌。
 * - 3 张：炸金花。豹子 > 同花顺 > 金花 > 顺子 > 对子 > 单张；
 *   A23 算最小顺、QKA 最大顺；同牌型同点数判平（不比花色）；
 *   不同花色的 235 是「豹子克星」，见 zjhWinners 的说明。
 *
 * 逐组结算，三组权重分别是 1 / 3 / 5 分：每组输家各付出该组权重，
 * 由该组赢家均分；全员并列或全员爆牌时本组不转移分数。
 * 开牌前所有人可以表态加倍，本局倍率 = 2 × 加倍次数（无人加倍为 1 倍），
 * 三组分数一起乘倍率，因此仍然守恒。
 */
import type { Card } from '../cards';

export const GROUP_KEYS = ['single', 'pair', 'triple'] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

/** 三组各自的分值 */
export const GROUP_WEIGHTS: Record<GroupKey, number> = { single: 1, pair: 3, triple: 5 };
export const GROUP_NAMES: Record<GroupKey, string> = {
  single: '单张比大小',
  pair: '十点半',
  triple: '炸金花',
};

export interface Groups {
  single: Card;
  pair: Card[];
  triple: Card[];
}

/** 一副手牌的固定张数 */
export const HAND_SIZE = 6;

/**
 * 把「槽位顺序」还原成三组。order 是 6 个手牌下标的排列，
 * 顺序为 [单张, 两张×2, 三张×3]。用下标而不是牌面传参，客户端无法伪造手牌。
 */
export function splitByOrder(hand: Card[], order: number[]): Groups | null {
  if (hand.length !== HAND_SIZE || order.length !== HAND_SIZE) return null;
  if (order.some((i) => !Number.isInteger(i) || i < 0 || i >= HAND_SIZE)) return null;
  if (new Set(order).size !== HAND_SIZE) return null;
  const cards = order.map((i) => hand[i]);
  return {
    single: cards[0],
    pair: [cards[1], cards[2]],
    triple: [cards[3], cards[4], cards[5]],
  };
}

/** 房主「本局先跳过」时用的默认分组：按发牌顺序 1 / 2 / 3 切开 */
export function defaultOrder(): number[] {
  return [0, 1, 2, 3, 4, 5];
}

/** A=14 … 2=2 */
export function cardRank(card: Card): number {
  switch (card.rank) {
    case 'a': return 14;
    case 'k': return 13;
    case 'q': return 12;
    case 'j': return 11;
    case '10': return 10;
    default: return Number(card.rank);
  }
}

export function rankLabel(rank: string): string {
  const map: Record<string, string> = { a: 'A', j: 'J', q: 'Q', k: 'K' };
  return map[rank] ?? rank;
}

/* ---------------- 第一组：单张比大小 ---------------- */

export interface SingleEval {
  rank: number;
  label: string;
}

export function evalSingle(card: Card): SingleEval {
  return { rank: cardRank(card), label: `${rankLabel(card.rank)} 单张` };
}

/* ---------------- 第二组：十点半 ---------------- */

/** 半点为整数单位，10.5 点 = 21 半点，避开浮点误差 */
export const HALF_POINT_LIMIT = 21;

export interface HalfEval {
  halfPoints: number;
  total: number;
  busted: boolean;
  label: string;
}

export function evalHalfPoint(cards: Card[]): HalfEval {
  let halfPoints = 0;
  for (const c of cards) {
    if (c.rank === 'j' || c.rank === 'q' || c.rank === 'k') halfPoints += 1;
    else if (c.rank === 'a') halfPoints += 2;
    else halfPoints += Number(c.rank) * 2;
  }
  const total = halfPoints / 2;
  const busted = halfPoints > HALF_POINT_LIMIT;
  return {
    halfPoints,
    total,
    busted,
    label: busted ? `爆牌 ${total} 点` : `${total} 点`,
  };
}

/* ---------------- 第三组：炸金花 ---------------- */

export type ZjhCategory = 'baozi' | 'straightFlush' | 'flush' | 'straight' | 'pair' | 'high';

const CATEGORY_RANK: Record<ZjhCategory, number> = {
  baozi: 6,
  straightFlush: 5,
  flush: 4,
  straight: 3,
  pair: 2,
  high: 1,
};

const CATEGORY_NAME: Record<ZjhCategory, string> = {
  baozi: '豹子',
  straightFlush: '同花顺',
  flush: '金花',
  straight: '顺子',
  pair: '对子',
  high: '散牌',
};

export interface ZjhEval {
  category: ZjhCategory;
  /** 6 豹子 … 1 散牌 */
  rank: number;
  /** 同等级逐位比较的键（降序） */
  key: number[];
  label: string;
  /** 不同花色的 235，豹子克星 */
  special235: boolean;
}

export function evalZjh(cards: Card[]): ZjhEval {
  if (cards.length !== 3) throw new Error('炸金花必须正好 3 张牌');
  const rs = cards.map(cardRank).sort((a, b) => b - a);
  const [hi, mid, lo] = rs;
  const flush = cards.every((c) => c.suit === cards[0].suit);

  // A23 是最小顺（高点按 3 算），QKA 是最大顺
  const a23 = hi === 14 && mid === 3 && lo === 2;
  const straight = a23 || (hi - mid === 1 && mid - lo === 1);
  const straightHigh = a23 ? 3 : hi;

  const counts = new Map<number, number>();
  for (const r of rs) counts.set(r, (counts.get(r) ?? 0) + 1);
  const pairs = [...counts.entries()].filter(([, n]) => n === 2).map(([r]) => r);
  const triple = [...counts.entries()].find(([, n]) => n === 3)?.[0];

  let category: ZjhCategory;
  let key: number[];
  if (triple !== undefined) {
    category = 'baozi';
    key = [triple];
  } else if (straight && flush) {
    category = 'straightFlush';
    key = [straightHigh];
  } else if (flush) {
    category = 'flush';
    key = rs;
  } else if (straight) {
    category = 'straight';
    key = [straightHigh];
  } else if (pairs.length === 1) {
    category = 'pair';
    const pairRank = pairs[0];
    key = [pairRank, rs.find((r) => r !== pairRank) ?? 0];
  } else {
    category = 'high';
    key = rs;
  }

  // 「不同花色的 235」：这里按三张不全为同一花色理解，
  // 同花 235 本身是金花，按正常牌型比较，不吃豹子。
  const special235 = category === 'high' && !flush && hi === 5 && mid === 3 && lo === 2;
  const headRank = category === 'high' || category === 'flush'
    ? hi
    : category === 'straight' || category === 'straightFlush'
      ? straightHigh
      : key[0];
  const head = rankLabel(cards.find((c) => cardRank(c) === headRank)?.rank ?? String(headRank));

  return {
    category,
    rank: CATEGORY_RANK[category],
    key,
    label: special235 ? '235 克星' : `${head} ${CATEGORY_NAME[category]}`,
    special235,
  };
}

/** 常规比较：不比花色，完全同值即判平。special235 不参与此处比较 */
export function compareZjh(a: ZjhEval, b: ZjhEval): number {
  if (a.rank !== b.rank) return Math.sign(a.rank - b.rank);
  for (let i = 0; i < Math.min(a.key.length, b.key.length); i++) {
    if (a.key[i] !== b.key[i]) return Math.sign(a.key[i] - b.key[i]);
  }
  return 0;
}

/**
 * 炸金花组赢家。235 是「豹子克星」而不是独立牌型：
 * 场上同时出现 235 与豹子时，豹子全部出局（被吃掉），
 * 剩下的人再按常规牌型比；235 自己仍按最小散牌参与比较。
 *
 * 这样 [豹子, 235] → 235 赢；[豹子, 235, 同花顺] → 同花顺赢，
 * 避免「豹子 > 同花顺 > 235 > 豹子」的循环比较导致无人获胜。
 */
export function zjhWinners(evals: ZjhEval[]): number[] {
  if (!evals.length) return [];
  const hasKiller = evals.some((e) => e.special235);
  const hasBaozi = evals.some((e) => e.category === 'baozi');
  const candidates = evals.flatMap((e, i) =>
    hasKiller && hasBaozi && e.category === 'baozi' ? [] : [{ e, i }],
  );
  if (!candidates.length) return [];

  let best = [candidates[0].i];
  let bestEval = candidates[0].e;
  for (let k = 1; k < candidates.length; k++) {
    const { e, i } = candidates[k];
    const cmp = compareZjh(e, bestEval);
    if (cmp > 0) {
      best = [i];
      bestEval = e;
    } else if (cmp === 0) {
      best.push(i);
    }
  }
  return best;
}

/* ---------------- 逐组结算 ---------------- */

export type GroupMark = 'win' | 'lose' | 'push';

export interface GroupOutcome {
  key: GroupKey;
  weight: number;
  /** 本组赢家的玩家下标 */
  winners: number[];
  /** 全员并列 / 全员爆牌时本组不记分 */
  push: boolean;
  /** 每位玩家该组的牌型说明 */
  labels: string[];
  marks: GroupMark[];
  note: string;
}

export interface RoundSettlement {
  groups: Record<GroupKey, GroupOutcome>;
  /** 每位玩家本局净分，总和恒为 0 */
  delta: number[];
}

/** 数值型分组（单张、十点半）的赢家：最大值的全体 */
function numericWinners(values: number[]): number[] {
  if (!values.length) return [];
  const best = Math.max(...values);
  return values.flatMap((v, i) => (v === best ? [i] : []));
}

function finish(
  key: GroupKey,
  labels: string[],
  winners: number[],
  delta: number[],
  extraNote = '',
): GroupOutcome {
  const n = labels.length;
  const winSet = new Set(winners);
  const push = winners.length === 0 || winners.length === n;
  const weight = GROUP_WEIGHTS[key];
  const marks: GroupMark[] = labels.map((_, i) =>
    push ? 'push' : winSet.has(i) ? 'win' : 'lose',
  );

  if (!push) {
    // 每个输家各付一份该组权重，全部由赢家均分；余数给第一位赢家，保证守恒
    const losers = labels.flatMap((_, i) => (winSet.has(i) ? [] : [i]));
    const payout = weight * losers.length;
    const share = Math.floor(payout / winners.length);
    const rest = payout - share * winners.length;
    for (const l of losers) delta[l] -= weight;
    for (const w of winners) delta[w] += share;
    if (rest > 0) delta[winners[0]] += rest;
  }

  const note = push
    ? `${GROUP_NAMES[key]}平局，不记分`
    : `${GROUP_NAMES[key]}：${winners.length} 人赢，每组 ${weight} 分${extraNote}`;
  return { key, weight, winners, push, labels, marks, note };
}

/**
 * 加倍次数 → 本局倍率：无人加倍 1 倍，1 次 2 倍、2 次 4 倍、3 次 6 倍……
 * 头家在全员加倍后的第二次机会也算一次加倍。
 */
export function multiplierOf(doubleCount: number): number {
  if (!Number.isFinite(doubleCount) || doubleCount <= 0) return 1;
  return 2 * Math.trunc(doubleCount);
}

/** 结算一整局。groups[i] 为 null 表示此人未提交分组，三组都按最差处理 */
export function settleRound(allGroups: (Groups | null)[], multiplier = 1): RoundSettlement {
  const n = allGroups.length;
  const delta = new Array<number>(n).fill(0);
  const outcomes = {} as Record<GroupKey, GroupOutcome>;

  // 第一组：单张点数，A 最大
  {
    const evals = allGroups.map((g) => (g ? evalSingle(g.single) : null));
    const labels = evals.map((e) => e?.label ?? '未分组');
    const winners = numericWinners(evals.map((e) => e?.rank ?? -1));
    outcomes.single = finish('single', labels, winners, delta);
  }

  // 第二组：十点半，爆牌视为最低分（-1）
  {
    const evals = allGroups.map((g) => (g ? evalHalfPoint(g.pair) : null));
    const labels = evals.map((e) => e?.label ?? '未分组');
    const winners = numericWinners(evals.map((e) => (e && !e.busted ? e.halfPoints : -1)));
    outcomes.pair = finish('pair', labels, winners, delta);
  }

  // 第三组：炸金花（含 235 吃豹子）
  {
    const evals = allGroups.map((g) => (g ? evalZjh(g.triple) : null));
    const labels = evals.map((e) => e?.label ?? '未分组');
    const present = evals.flatMap((e, i) => (e ? [i] : []));
    const typed = evals.filter((e): e is ZjhEval => e !== null);
    const winners = zjhWinners(typed);
    // 未分组的人不参与赢家候选，把下标映射回全体座位
    const realWinners = winners.map((i) => present[i]).filter((i) => i !== undefined);
    const killerPlayed = typed.some((e) => e.special235) && typed.some((e) => e.category === 'baozi');
    outcomes.triple = finish(
      'triple',
      labels,
      realWinners,
      delta,
      killerPlayed ? '（235 淘汰豹子）' : '',
    );
  }

  // 倍率对三组一视同仁，统一缩放后分数仍守恒
  const factor = Number.isFinite(multiplier) ? Math.max(1, Math.trunc(multiplier)) : 1;
  if (factor > 1) {
    for (let i = 0; i < delta.length; i++) delta[i] *= factor;
  }
  return { groups: outcomes, delta };
}
