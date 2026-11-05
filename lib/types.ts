import type { Card } from '@/src/game/cards';
import type { GroupKey, GroupMark, Groups } from '@/src/game/six-cards/rules';

/** 与 server/src/store.ts 对齐的传输类型 */

export interface User {
  id: string;
  nickname: string;
  avatar: string | null;
}

export interface Family {
  id: string;
  name: string;
  code: string;
  ownerId: string;
  createdAt: number;
}

export interface Member extends User {
  role: 'owner' | 'member';
  joinedAt: number;
}

export interface Invite {
  token: string;
  familyId: string;
  label: string | null;
  expiresAt: number;
  maxUses: number;
  usedCount: number;
  revoked: boolean;
  createdAt: number;
}

export interface Guest {
  id: string;
  familyId: string;
  nickname: string;
  avatar: string | null;
  createdAt: number;
  expiresAt: number;
}

export interface FamilyDetail {
  family: Family;
  members: Member[];
  guests: Guest[];
  invites: Invite[];
  viewer: { kind: 'user' | 'guest'; role: 'owner' | 'member' | null };
}

export type RoomStatus = 'waiting' | 'playing' | 'ended';

export interface Seat {
  seatIndex: number;
  userId: string | null;
  guestId: string | null;
  nickname: string;
  avatar: string | null;
  role: 'player' | 'spectator';
  ready: boolean;
  joinedAt: number;
}

export interface Room {
  id: string;
  familyId: string;
  game: string;
  hostId: string;
  title: string | null;
  status: RoomStatus;
  config: Record<string, unknown>;
  hasPassword?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RoomDetail extends Room {
  seats: Seat[];
}

/** 联机牌桌视图（与 server/src/games/holdem-session.ts 的 HoldemView 对应） */
export interface HoldemPlayerView {
  id: number;
  actorId: string;
  name: string;
  avatar: string | null;
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  out: boolean;
  dealer: boolean;
  hole: Card[] | null;
  handName: string | null;
}

export interface HoldemResultView {
  winners: { id: number; name: string; amount: number; handName: string | null }[];
  shown: { id: number; name: string; hole: Card[]; handName: string | null }[];
}

export interface HoldemView {
  game: 'holdem';
  handNo: number;
  street: string;
  streetName: string;
  board: Card[];
  pot: number;
  currentBet: number;
  you: number;
  toAct: number | null;
  legal: {
    toCall: number;
    canCheck: boolean;
    minRaiseTo: number;
    maxRaiseTo: number;
    canRaise: boolean;
  } | null;
  players: HoldemPlayerView[];
  log: string[];
  result: HoldemResultView | null;
}

/** 21 点联机视图（与 server/src/games/blackjack-session.ts 的 BlackjackView 对应） */
export type BJPhase = 'betting' | 'drawing' | 'showdown';

export type BJAction =
  | { type: 'bet'; amount: number }
  | { type: 'clearBet' }
  | { type: 'confirmBet' }
  | { type: 'hit' }
  | { type: 'confirm' };

export interface BJPlayerView {
  id: number;
  actorId: string;
  name: string;
  avatar: string | null;
  balance: number;
  bet: number;
  cards: Card[];
  total: number | null;
  busted: boolean;
  confirmedBet: boolean;
  confirmed: boolean;
  delta: number | null;
  isWinner: boolean;
}

export interface BJResultView {
  winners: { id: number; name: string; total: number }[];
  text: string;
}

export interface BlackjackView {
  game: 'blackjack';
  roundNo: number;
  phase: BJPhase;
  /** 你的座位号，旁观为 -1 */
  you: number;
  players: BJPlayerView[];
  shoeRemaining: number;
  baseBet: number;
  log: string[];
  result: BJResultView | null;
  legal: {
    canBet: boolean;
    canClearBet: boolean;
    canConfirmBet: boolean;
    canHit: boolean;
    canConfirm: boolean;
  };
}

/** 六张牌联机视图（与 server/src/games/six-session.ts 的 SixView 对应） */
export type SixPhase = 'grouping' | 'doubling' | 'showdown';

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
  doubleDecided: boolean;
  /** 只有自己能看见 6 张手牌 */
  hand: Card[] | null;
  /** 摊牌后公开 */
  groups: Groups | null;
}

export interface SixView {
  game: 'six';
  roundNo: number;
  phase: SixPhase;
  you: number;
  /** 本局头家座位号 */
  leader: number;
  /** 加倍阶段该谁表态 */
  doubleTurn: number | null;
  multiplier: number;
  leaderBonusPending: boolean;
  players: SixPlayerView[];
  shoeRemaining: number;
  weights: Record<GroupKey, number>;
  log: string[];
  result: SixResultView | null;
  legal: { canSubmit: boolean; canDouble: boolean; canPass: boolean };
}

export interface PresenceEntry {
  id: string;
  kind: 'user' | 'guest';
  nickname: string;
  avatar: string | null;
  roomId: string | null;
  game: string | null;
}

export interface InviteInfo {
  valid: boolean;
  expired: boolean;
  family: { name: string } | null;
  label: string | null;
  expiresAt: number;
}
