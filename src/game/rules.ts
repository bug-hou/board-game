import type { Card } from './cards';

export interface HandValue {
  total: number;
  soft: boolean; // 是否存在按 11 计的 A
}

/** 计算 21 点手牌点数，A 自动按 11 或 1 取最优 */
export function handValue(cards: Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'a') {
      aces++;
      total += 11;
    } else if (c.rank === 'j' || c.rank === 'q' || c.rank === 'k' || c.rank === '10') {
      total += 10;
    } else {
      total += Number(c.rank);
    }
  }
  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
    soft = aces > 0;
  }
  return { total, soft };
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: Card[]): boolean {
  return handValue(cards).total > 21;
}

export type Outcome =
  | { type: 'playerBlackjack'; payout: number } // payout 为净赢额（1.5x bet）
  | { type: 'win'; payout: number }
  | { type: 'push' }
  | { type: 'lose' }
  | { type: 'playerBust' }
  | { type: 'dealerBust'; payout: number };

/**
 * 结算一局。bet 为本局实际下注（已含加倍）。
 * 规则：庄家 soft 17 停牌（S17），Blackjack 赔 3:2。
 */
export function settleRound(player: Card[], dealer: Card[], bet: number): Outcome {
  const pv = handValue(player).total;
  const dv = handValue(dealer).total;
  const playerBJ = isBlackjack(player);
  const dealerBJ = isBlackjack(dealer);

  if (playerBJ && dealerBJ) return { type: 'push' };
  if (playerBJ) return { type: 'playerBlackjack', payout: Math.floor(bet * 1.5) };
  if (dealerBJ) return { type: 'lose' };
  if (pv > 21) return { type: 'playerBust' };
  if (dv > 21) return { type: 'dealerBust', payout: bet };
  if (pv > dv) return { type: 'win', payout: bet };
  if (pv < dv) return { type: 'lose' };
  return { type: 'push' };
}
