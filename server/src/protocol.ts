import type { RoomView } from '../../src/game/blackjack/engine';

/** 客户端 -> 服务端 */
export type ClientMsg =
  | { t: 'join'; room: string; name: string; seatId?: string }
  | { t: 'bet'; amount: number }
  | { t: 'clearBet' }
  | { t: 'deal' }
  | { t: 'hit' }
  | { t: 'stand' }
  | { t: 'double' }
  | { t: 'next' }
  | { t: 'leave' };

/** 服务端 -> 客户端 */
export type ServerMsg =
  | { t: 'welcome'; seatId: string }
  | { t: 'state'; view: RoomView }
  | { t: 'error'; reason: string };
