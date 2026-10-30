/**
 * 21 点多人共享牌桌引擎（纯逻辑，不含任何渲染 / DOM / Pixi 依赖）。
 *
 * 玩法：多人坐同一张桌，共享一副牌靴与同一个庄家；每人独立对庄家下注、结算。
 * 该模块可同时运行在浏览器（单机模式）与 Cloud Function（服务端权威）。
 *
 * 安全约定：房间完整状态（RoomState）含整副牌靴，**绝不能下发到客户端**，
 * 必须通过 viewFor() 裁剪后再返回，否则客户端可预知后续所有牌。
 */

import { createShoe, type Card } from '../cards';
import { handValue, isBlackjack, isBust, settleRound, type Outcome } from '../rules';

export const DECKS = 6;
/** 牌靴剩余少于该值时，在下一轮开始前重洗 */
export const RESHUFFLE_AT = 52;
export const MAX_SEATS = 5;
export const DEFAULT_START_BALANCE = 1000;

export type Phase = 'lobby' | 'betting' | 'dealing' | 'acting' | 'dealer' | 'settle';

export interface Seat {
  id: string;
  name: string;
  balance: number;
  /** 本轮下注额（下注时即从 balance 扣除） */
  bet: number;
  hand: Card[];
  doubled: boolean;
  /** 本轮是否已结束行动（停牌 / 爆牌 / 加倍 / Blackjack） */
  done: boolean;
  outcome: Outcome | null;
}

/** 房间完整状态：仅服务端持有 */
export interface RoomState {
  code: string;
  /** 乐观锁版本号，每次成功写入 +1 */
  version: number;
  phase: Phase;
  shoe: Card[];
  cursor: number;
  dealer: Card[];
  holeRevealed: boolean;
  seats: Seat[];
  /** 当前行动座位在 seats 中的下标，null 表示无人可行动 */
  turnIndex: number | null;
  hostId: string | null;
  round: number;
  updatedAt: number;
}

/** 下发给某个客户端的裁剪视图 */
export interface RoomView {
  code: string;
  version: number;
  phase: Phase;
  round: number;
  /** 只暴露剩余张数，不暴露牌序 */
  shoeRemaining: number;
  /** 只含可见的庄家牌；暗牌未翻开时长度为 1 */
  dealer: Card[];
  dealerHoleCount: number;
  holeRevealed: boolean;
  seats: PublicSeat[];
  turnSeatId: string | null;
  hostId: string | null;
  you: YouView | null;
}

export interface PublicSeat {
  id: string;
  name: string;
  balance: number;
  bet: number;
  hand: Card[];
  /** 手牌点数，爆牌时仍展示实际点数 */
  total: number;
  done: boolean;
  outcome: Outcome | null;
}

export interface YouView {
  seatId: string;
  canBet: boolean;
  canDeal: boolean;
  canHit: boolean;
  canStand: boolean;
  canDouble: boolean;
  canNext: boolean;
}

export type Action =
  | { type: 'join'; seatId: string; name: string }
  | { type: 'leave'; seatId: string }
  | { type: 'bet'; seatId: string; amount: number }
  | { type: 'clearBet'; seatId: string }
  | { type: 'deal'; seatId: string }
  | { type: 'hit'; seatId: string }
  | { type: 'stand'; seatId: string }
  | { type: 'double'; seatId: string }
  | { type: 'next'; seatId: string };

export type ApplyResult =
  | { ok: true; state: RoomState }
  | { ok: false; reason: string };

const ok = (state: RoomState): ApplyResult => ({ ok: true, state });
const err = (reason: string): ApplyResult => ({ ok: false, reason });

/** 深拷贝，避免污染传入的旧状态 */
function clone(s: RoomState): RoomState {
  return structuredClone(s);
}

export function createRoom(code: string, seed = Date.now()): RoomState {
  return {
    code,
    version: 1,
    phase: 'betting',
    shoe: createShoe(DECKS, seed),
    cursor: 0,
    dealer: [],
    holeRevealed: false,
    seats: [],
    turnIndex: null,
    hostId: null,
    round: 1,
    updatedAt: Date.now(),
  };
}

function findSeat(s: RoomState, seatId: string): Seat | undefined {
  return s.seats.find((x) => x.id === seatId);
}

function needReshuffle(s: RoomState): boolean {
  return s.shoe.length - s.cursor < RESHUFFLE_AT;
}

/** 从牌靴取牌，推进 cursor */
function draw(s: RoomState, n = 1): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    if (s.cursor >= s.shoe.length) break;
    out.push(s.shoe[s.cursor++]);
  }
  return out;
}

function reshuffle(s: RoomState) {
  s.shoe = createShoe(DECKS, Date.now() + s.round * 7919);
  s.cursor = 0;
}

/** 推进到下一个未结束的座位；全部结束则进入庄家阶段 */
function advanceTurn(s: RoomState) {
  const idx = s.seats.findIndex((x) => x.bet > 0 && !x.done);
  if (idx === -1) {
    s.turnIndex = null;
    dealerPhase(s);
    return;
  }
  s.turnIndex = idx;
  s.phase = 'acting';
}

/**
 * 庄家阶段：亮暗牌后按 S17 规则补牌，然后统一结算。
 * 若所有参与座位都已爆牌或是 Blackjack，庄家无需补牌（无人需要比牌）。
 */
function dealerPhase(s: RoomState) {
  s.holeRevealed = true;
  s.turnIndex = null;

  const active = s.seats.filter((x) => x.bet > 0);
  const needsPlay = active.some((x) => !isBust(x.hand) && !isBlackjack(x.hand));
  if (needsPlay) {
    s.phase = 'dealer';
    while (handValue(s.dealer).total < 17) {
      const c = draw(s, 1);
      if (!c.length) break;
      s.dealer.push(...c);
    }
  }
  settleAll(s);
}

/** 对每个下注座位独立对庄家结算 */
function settleAll(s: RoomState) {
  s.phase = 'settle';
  s.turnIndex = null;
  for (const seat of s.seats) {
    if (seat.bet <= 0) continue;
    const o = settleRound(seat.hand, s.dealer, seat.bet);
    seat.outcome = o;
    switch (o.type) {
      case 'playerBlackjack':
      case 'win':
      case 'dealerBust':
        seat.balance += seat.bet + o.payout;
        break;
      case 'push':
        seat.balance += seat.bet;
        break;
      case 'playerBust':
      case 'lose':
        break;
    }
  }
}

// ---------- 动作 ----------

function join(s: RoomState, seatId: string, name: string): ApplyResult {
  if (findSeat(s, seatId)) return ok(s); // 已加入，幂等
  if (s.seats.length >= MAX_SEATS) return err('牌桌已满');
  if (s.phase !== 'betting' && s.phase !== 'lobby') return err('本轮已开始，请等待下一轮');
  s.seats.push({
    id: seatId,
    name: name.slice(0, 12) || '玩家',
    balance: DEFAULT_START_BALANCE,
    bet: 0,
    hand: [],
    doubled: false,
    done: false,
    outcome: null,
  });
  if (!s.hostId) s.hostId = seatId;
  return ok(s);
}

function leave(s: RoomState, seatId: string): ApplyResult {
  const i = s.seats.findIndex((x) => x.id === seatId);
  if (i === -1) return err('你不在这张牌桌上');
  const wasTurn = s.turnIndex === i;
  s.seats.splice(i, 1);
  if (!s.seats.length) {
    s.hostId = null;
    s.turnIndex = null;
    s.phase = 'betting';
    return ok(s);
  }
  if (s.hostId === seatId) s.hostId = s.seats[0]?.id ?? null;
  // 离座时若正轮到该座位，顺延给下一个人（若无人可行动则进入结算）
  if (wasTurn && (s.phase === 'acting' || s.phase === 'dealing')) advanceTurn(s);
  return ok(s);
}

function placeBet(s: RoomState, seatId: string, amount: number): ApplyResult {
  if (s.phase !== 'betting') return err('当前不是下注阶段');
  const seat = findSeat(s, seatId);
  if (!seat) return err('请先加入牌桌');
  if (!Number.isFinite(amount) || amount <= 0) return err('下注额无效');
  if (amount > seat.balance) return err('余额不足');
  seat.balance -= amount;
  seat.bet += amount;
  return ok(s);
}

function clearBet(s: RoomState, seatId: string): ApplyResult {
  if (s.phase !== 'betting') return err('当前不是下注阶段');
  const seat = findSeat(s, seatId);
  if (!seat) return err('请先加入牌桌');
  seat.balance += seat.bet;
  seat.bet = 0;
  return ok(s);
}

/** 发牌：每位下注座位各 2 张，庄家 2 张（第 2 张为暗牌） */
function deal(s: RoomState, seatId: string): ApplyResult {
  if (s.phase !== 'betting') return err('当前不是下注阶段');
  if (!findSeat(s, seatId)) return err('请先加入牌桌');
  const active = s.seats.filter((x) => x.bet > 0);
  if (!active.length) return err('还没有人下注');

  if (needReshuffle(s)) reshuffle(s);

  s.dealer = [];
  s.holeRevealed = false;
  for (const seat of s.seats) {
    seat.hand = [];
    seat.doubled = false;
    seat.done = false;
    seat.outcome = null;
  }
  // 未下注的座位本轮不参与
  for (const seat of s.seats) {
    if (seat.bet <= 0) seat.done = true;
  }

  // 第一轮：各座位 1 张 + 庄家 1 张明牌
  for (const seat of active) seat.hand.push(...draw(s, 1));
  s.dealer.push(...draw(s, 1));
  // 第二轮：各座位 1 张 + 庄家 1 张暗牌
  for (const seat of active) seat.hand.push(...draw(s, 1));
  s.dealer.push(...draw(s, 1));

  // 庄家 Blackjack：立即亮牌并结算所有人
  if (isBlackjack(s.dealer)) {
    for (const seat of active) seat.done = true;
    dealerPhase(s);
    return ok(s);
  }
  // 座位 Blackjack：该座位无需行动
  for (const seat of active) {
    if (isBlackjack(seat.hand)) seat.done = true;
  }
  advanceTurn(s);
  return ok(s);
}

function requireTurn(s: RoomState, seatId: string): Seat | ApplyResult {
  if (s.phase !== 'acting') return err('当前不是行动阶段');
  const seat = findSeat(s, seatId);
  if (!seat) return err('请先加入牌桌');
  if (seat.done) return err('你本轮已结束行动');
  const cur = s.turnIndex === null ? undefined : s.seats[s.turnIndex];
  if (!cur || cur.id !== seatId) return err('还没轮到你');
  return seat;
}

function hit(s: RoomState, seatId: string): ApplyResult {
  const r = requireTurn(s, seatId);
  if (!('id' in r)) return r;
  const seat = r;
  const c = draw(s, 1);
  if (!c.length) return err('牌靴已空');
  seat.hand.push(...c);
  if (isBust(seat.hand)) {
    seat.done = true;
    advanceTurn(s);
  }
  return ok(s);
}

function stand(s: RoomState, seatId: string): ApplyResult {
  const r = requireTurn(s, seatId);
  if (!('id' in r)) return r;
  r.done = true;
  advanceTurn(s);
  return ok(s);
}

function double(s: RoomState, seatId: string): ApplyResult {
  const r = requireTurn(s, seatId);
  if (!('id' in r)) return r;
  const seat = r;
  if (seat.hand.length !== 2) return err('加倍只能在拿到两张牌时进行');
  if (seat.balance < seat.bet) return err('余额不足，无法加倍');
  seat.balance -= seat.bet;
  seat.bet *= 2;
  seat.doubled = true;
  const c = draw(s, 1);
  if (!c.length) return err('牌靴已空');
  seat.hand.push(...c);
  // 加倍后只发一张牌，无论是否爆牌都结束行动
  seat.done = true;
  advanceTurn(s);
  return ok(s);
}

function next(s: RoomState, seatId: string): ApplyResult {
  if (s.phase !== 'settle') return err('本轮还没结束');
  if (s.hostId && s.hostId !== seatId) return err('只有房主可以开始下一轮');
  s.round += 1;
  for (const seat of s.seats) {
    seat.bet = 0;
    seat.hand = [];
    seat.doubled = false;
    seat.done = false;
    seat.outcome = null;
  }
  s.dealer = [];
  s.holeRevealed = false;
  s.turnIndex = null;
  if (needReshuffle(s)) reshuffle(s);
  s.phase = 'betting';
  return ok(s);
}

/**
 * 应用一个动作。纯函数：不修改传入的 state，成功时返回新状态。
 * 调用方（服务端）据此实现 read → apply → write 的乐观锁。
 */
export function applyAction(s: RoomState, action: Action): ApplyResult {
  const draft = clone(s);
  let r: ApplyResult;
  switch (action.type) {
    case 'join': r = join(draft, action.seatId, action.name); break;
    case 'leave': r = leave(draft, action.seatId); break;
    case 'bet': r = placeBet(draft, action.seatId, action.amount); break;
    case 'clearBet': r = clearBet(draft, action.seatId); break;
    case 'deal': r = deal(draft, action.seatId); break;
    case 'hit': r = hit(draft, action.seatId); break;
    case 'stand': r = stand(draft, action.seatId); break;
    case 'double': r = double(draft, action.seatId); break;
    case 'next': r = next(draft, action.seatId); break;
  }
  if (!r.ok) return r;
  r.state.version = s.version + 1;
  r.state.updatedAt = Date.now();
  return r;
}

/** 裁剪出可安全下发到客户端的视图：隐藏牌靴与庄家暗牌 */
export function viewFor(s: RoomState, seatId: string | null): RoomView {
  const dealer = s.holeRevealed ? [...s.dealer] : s.dealer.slice(0, 1);
  const cur = s.turnIndex === null ? null : s.seats[s.turnIndex];
  const you = seatId ? findSeat(s, seatId) : undefined;

  return {
    code: s.code,
    version: s.version,
    phase: s.phase,
    round: s.round,
    shoeRemaining: s.shoe.length - s.cursor,
    dealer,
    dealerHoleCount: s.holeRevealed ? 0 : Math.max(0, s.dealer.length - 1),
    holeRevealed: s.holeRevealed,
    turnSeatId: cur?.id ?? null,
    hostId: s.hostId,
    seats: s.seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      balance: seat.balance,
      bet: seat.bet,
      hand: s.phase === 'betting' ? [] : [...seat.hand],
      total: seat.hand.length ? handValue(seat.hand).total : 0,
      done: seat.done,
      outcome: seat.outcome,
    })),
    you: you
      ? {
          seatId: you.id,
          canBet: s.phase === 'betting',
          canDeal: s.phase === 'betting' && you.bet > 0,
          canHit: s.phase === 'acting' && cur?.id === you.id && !you.done,
          canStand: s.phase === 'acting' && cur?.id === you.id && !you.done,
          canDouble:
            s.phase === 'acting' &&
            cur?.id === you.id &&
            !you.done &&
            !you.doubled &&
            you.hand.length === 2 &&
            you.balance >= you.bet,
          canNext: s.phase === 'settle' && (s.hostId === null || s.hostId === you.id),
        }
      : null,
  };
}
