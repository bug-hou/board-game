import type { Card } from '../cards';

/**
 * 牌型等级：
 * 1 高牌 · 2 一对 · 3 两对 · 4 三条 · 5 顺子 · 6 同花 · 7 葫芦 · 8 四条 · 9 同花顺
 */
export interface HandEval {
  rank: number;
  /** 用于同等级比大小（降序，依次比较） */
  values: number[];
  name: string;
}

export const RANK_NAMES: Record<number, string> = {
  1: '高牌',
  2: '一对',
  3: '两对',
  4: '三条',
  5: '顺子',
  6: '同花',
  7: '葫芦',
  8: '四条',
  9: '同花顺',
};

/** A=14, K=13 ... 2=2 */
export function rankValue(card: Card): number {
  switch (card.rank) {
    case 'a':
      return 14;
    case 'k':
      return 13;
    case 'q':
      return 12;
    case 'j':
      return 11;
    case '10':
      return 10;
    default:
      return Number(card.rank);
  }
}

const SUIT_INDEX: Record<Card['suit'], number> = { spade: 0, heart: 1, diamond: 2, club: 3 };
export function suitIndex(card: Card): number {
  return SUIT_INDEX[card.suit];
}

// 复用的计数缓冲，避免每次评估都分配
const cnt = new Int8Array(15);
const suitCnt = new Int8Array(4);

function findStraightHigh(uniqDesc: number[]): number {
  if (uniqDesc.length < 5) return 0;
  for (let i = 0; i + 4 < uniqDesc.length; i++) {
    const h = uniqDesc[i];
    if (uniqDesc[i + 4] === h - 4) return h;
    // A 可作 1：A 5 4 3 2
    if (h === 14 && uniqDesc[i + 1] === 5 && uniqDesc[i + 4] === 2 && i + 4 === uniqDesc.length - 1) {
      return 5;
    }
    break;
  }
  return 0;
}

/** 评估恰好 5 张牌 */
export function evaluate5(ranks: number[], suits: number[]): HandEval {
  cnt.fill(0);
  suitCnt.fill(0);
  for (let i = 0; i < 5; i++) {
    cnt[ranks[i]]++;
    suitCnt[suits[i]]++;
  }

  const desc: number[] = [];
  for (let r = 14; r >= 2; r--) {
    for (let k = 0; k < cnt[r]; k++) desc.push(r);
  }
  const uniqDesc = [...new Set(desc)];

  const flush = suitCnt[0] === 5 || suitCnt[1] === 5 || suitCnt[2] === 5 || suitCnt[3] === 5;
  const straightHigh = findStraightHigh(uniqDesc);

  if (flush && straightHigh > 0) {
    return {
      rank: 9,
      values: [straightHigh],
      name: straightHigh === 14 ? '皇家同花顺' : '同花顺',
    };
  }

  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 14; r >= 2; r--) {
    if (cnt[r] === 4) quads.push(r);
    else if (cnt[r] === 3) trips.push(r);
    else if (cnt[r] === 2) pairs.push(r);
  }

  if (quads.length) {
    const kicker = desc.find((r) => r !== quads[0]) ?? 0;
    return { rank: 8, values: [quads[0], kicker], name: RANK_NAMES[8] };
  }
  if (trips.length && (pairs.length > 0 || trips.length > 1)) {
    const pair = pairs[0] ?? trips[1];
    return { rank: 7, values: [trips[0], pair], name: RANK_NAMES[7] };
  }
  if (flush) {
    return { rank: 6, values: desc.slice(), name: RANK_NAMES[6] };
  }
  if (straightHigh > 0) {
    return { rank: 5, values: [straightHigh], name: straightHigh === 14 ? 'A高顺子' : RANK_NAMES[5] };
  }
  if (trips.length) {
    const kickers = desc.filter((r) => r !== trips[0]).slice(0, 2);
    return { rank: 4, values: [trips[0], ...kickers], name: RANK_NAMES[4] };
  }
  if (pairs.length >= 2) {
    const kicker = desc.filter((r) => r !== pairs[0] && r !== pairs[1]).slice(0, 1);
    return { rank: 3, values: [pairs[0], pairs[1], ...kicker], name: RANK_NAMES[3] };
  }
  if (pairs.length === 1) {
    const kickers = desc.filter((r) => r !== pairs[0]).slice(0, 3);
    return { rank: 2, values: [pairs[0], ...kickers], name: RANK_NAMES[2] };
  }
  return { rank: 1, values: desc.slice(0, 5), name: RANK_NAMES[1] };
}

const COMBOS7: number[][] = (() => {
  const out: number[][] = [];
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 7; d++)
          for (let e = d + 1; e < 7; e++) out.push([a, b, c, d, e]);
  return out;
})();

const bufR = [0, 0, 0, 0, 0];
const bufS = [0, 0, 0, 0, 0];

/** 从 5~7 张牌中取最优 5 张 */
export function bestOf(cards: Card[]): HandEval {
  if (cards.length === 5) {
    for (let i = 0; i < 5; i++) {
      bufR[i] = rankValue(cards[i]);
      bufS[i] = suitIndex(cards[i]);
    }
    return evaluate5(bufR, bufS);
  }
  const n = cards.length;
  const ranks = cards.map(rankValue);
  const suits = cards.map(suitIndex);
  let best: HandEval | null = null;
  const combos = n === 7 ? COMBOS7 : combinations(n);
  for (const combo of combos) {
    for (let i = 0; i < 5; i++) {
      bufR[i] = ranks[combo[i]];
      bufS[i] = suits[combo[i]];
    }
    const e = evaluate5(bufR, bufS);
    if (!best || compareEval(e, best) > 0) best = e;
  }
  return best!;
}

const comboCache = new Map<number, number[][]>();
function combinations(n: number): number[][] {
  const cached = comboCache.get(n);
  if (cached) return cached;
  const out: number[][] = [];
  const pick: number[] = [];
  const walk = (start: number) => {
    if (pick.length === 5) {
      out.push([...pick]);
      return;
    }
    for (let i = start; i < n; i++) {
      pick.push(i);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  comboCache.set(n, out);
  return out;
}

/** a 优于 b 返回正数，相等返回 0 */
export function compareEval(a: HandEval, b: HandEval): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const len = Math.min(a.values.length, b.values.length);
  for (let i = 0; i < len; i++) {
    if (a.values[i] !== b.values[i]) return a.values[i] - b.values[i];
  }
  return 0;
}
