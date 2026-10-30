import { createShoe, shuffle, type Card } from '../cards';
import { bestOf, compareEval } from './evaluate';
import type { Action, HoldemEngine, Seat } from './engine';

const ALL_CARDS = createShoe(1);
const keyOf = (c: Card) => `${c.suit}_${c.rank}`;

/** AI 性格 */
export interface AiProfile {
  /** 0~1，越大越紧（只玩强牌） */
  tightness: number;
  /** 0~1，越大越爱加注 */
  aggression: number;
  /** 0~1，诈唬倾向 */
  bluff: number;
}

const AI_NAMES = ['阿瑞斯', '海伦', '奥丁', '路西法', '雅典娜', '波塞冬', '赫拉', '阿波罗'];

export function pickAiName(used: string[]): string {
  const free = AI_NAMES.filter((n) => !used.includes(n));
  return free.length ? free[Math.floor(Math.random() * free.length)] : `玩家${used.length + 1}`;
}

export function randomProfile(): AiProfile {
  return {
    tightness: 0.25 + Math.random() * 0.45,
    aggression: 0.25 + Math.random() * 0.6,
    bluff: Math.random() * 0.35,
  };
}

/**
 * 蒙特卡洛估算胜率：随机补齐公共牌与对手底牌，返回「不输」的比例。
 * iters 越大越准但越慢，80~120 对本游戏足够。
 */
export function estimateEquity(
  hole: Card[],
  board: Card[],
  opponents: number,
  iters = 100,
): number {
  if (opponents <= 0) return 1;
  const known = new Set([...hole, ...board].map(keyOf));
  const pool = ALL_CARDS.filter((c) => !known.has(keyOf(c)));
  const need = 5 - board.length;
  let score = 0;

  for (let it = 0; it < iters; it++) {
    const deck = shuffle(pool);
    let ptr = 0;
    const full = [...board];
    for (let i = 0; i < need; i++) full.push(deck[ptr++]);

    const hero = bestOf([...hole, ...full]);
    let beaten = false;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const oh = [deck[ptr++], deck[ptr++]];
      if (!oh[0] || !oh[1]) break;
      const cmp = compareEval(bestOf([...oh, ...full]), hero);
      if (cmp > 0) {
        beaten = true;
        break;
      }
      if (cmp === 0) ties++;
    }
    if (beaten) continue;
    score += ties > 0 ? 1 / (ties + 1) : 1;
  }
  return score / iters;
}

/** AI 决策 */
export function aiDecide(engine: HoldemEngine, p: Seat, profile: AiProfile): Action {
  const legal = engine.legalActions(p);
  const live = engine.remaining().filter((x) => x.id !== p.id).length;
  const equity = estimateEquity(p.hole, engine.board, Math.max(1, live));

  const pot = engine.potInPlay();
  const toCall = legal.toCall;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  // 相对强度：1.0 表示与同桌平均水平相当（equity 会随人数摊薄，需要归一化）
  const strength = equity * (live + 1);

  // 便宜就跟：跟注额相对底池很小
  const cheapCall = toCall > 0 && toCall <= pot * 0.15;

  // 需要全下才能跟注
  if (toCall >= p.stack) {
    const goForIt = strength > 1.9 + profile.tightness * 0.5 || Math.random() < profile.bluff * 0.2;
    return goForIt ? { type: 'call' } : { type: 'fold' };
  }

  if (toCall === 0) {
    // 可过牌：强牌价值下注，弱牌偶尔诈唬
    if (legal.canRaise) {
      const valueBet = strength > 1.55 + profile.tightness * 0.4;
      const bluffNow = Math.random() < profile.bluff * 0.38;
      if (valueBet || bluffNow) {
        return { type: 'raise', amount: raiseSize(engine, p, strength, profile, pot) };
      }
    }
    return { type: 'check' };
  }

  // 加注：相对强度够高，且性格允许
  if (
    legal.canRaise &&
    strength > 1.95 - profile.aggression * 0.35 &&
    Math.random() < 0.3 + profile.aggression * 0.45
  ) {
    return { type: 'raise', amount: raiseSize(engine, p, strength, profile, pot) };
  }

  // 跟注：底池赔率达标（留出后手风险余量），或足够便宜，或偶尔松跟
  const margin = equity - potOdds;
  const callThreshold = 0.02 + profile.tightness * 0.05;
  if (margin > callThreshold || cheapCall || Math.random() < profile.bluff * 0.1) {
    return { type: 'call' };
  }
  return { type: 'fold' };
}

function raiseSize(
  engine: HoldemEngine,
  p: Seat,
  strength: number,
  profile: AiProfile,
  pot: number,
): number {
  const legal = engine.legalActions(p);
  const frac = 0.35 + Math.min(1, strength / 3) * 0.4 + profile.aggression * 0.1;
  let target = engine.currentBet + Math.max(engine.bigBlindSize, Math.round(pot * frac));
  target = Math.max(target, legal.minRaiseTo);
  return Math.min(target, legal.maxRaiseTo);
}
