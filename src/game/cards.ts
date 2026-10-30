export type Suit = 'spade' | 'heart' | 'diamond' | 'club';

export interface Card {
  suit: Suit;
  rank: string; // a 2 3 4 5 6 7 8 9 10 j q k
}

export const SUITS: Suit[] = ['spade', 'heart', 'diamond', 'club'];
export const RANKS = ['a', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k'];

/** 图集帧名 */
export function cardTextureName(card: Card): string {
  return `${card.suit}_${card.rank}`;
}

/**
 * 可复现随机数发生器（mulberry32）。
 * 联机时牌靴由服务端用 seed 生成，保证所有客户端拿到同一副牌。
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates 洗牌。不传 rng 时沿用 Math.random，保持单机行为不变 */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 6 副牌的牌靴。传入 seed 时洗牌结果可复现 */
export function createShoe(decks = 6, seed?: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ suit, rank });
      }
    }
  }
  return shuffle(cards, seed === undefined ? Math.random : makeRng(seed));
}

export function cardLabel(card: Card): string {
  const suitChar: Record<Suit, string> = { spade: '♠', heart: '♥', diamond: '♦', club: '♣' };
  const rankLabel = { a: 'A', j: 'J', q: 'Q', k: 'K' } as Record<string, string>;
  return `${suitChar[card.suit]}${rankLabel[card.rank] ?? card.rank}`;
}
