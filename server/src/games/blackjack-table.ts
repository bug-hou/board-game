/**
 * 21 点牌桌会话管理：房间 → 对局会话 → 连接广播。
 *
 * 与德州的 games/table.ts 完全独立，两套会话互不干扰。
 * 服务端是唯一权威：牌靴、发牌、结算都在 BlackjackSession 里跑。
 */
import type { WebSocket } from 'ws';
import { tableAccess, type RoomDetail } from '../store';
import { recordMatch } from '../history';
import {
  BlackjackSession,
  type BJAction,
  type BlackjackView,
} from './blackjack-session';

interface Conn {
  ws: WebSocket;
  actorId: string;
  token: string;
}

const sessions = new Map<string, BlackjackSession>();
const conns = new Map<string, Set<Conn>>();
const nextRoundTimers = new Map<string, NodeJS.Timeout>();

const START_BALANCE = 1000;
const BASE_BET = 10;
const NEXT_ROUND_DELAY_MS = 8000;

export function getBlackjackSession(roomId: string): BlackjackSession | null {
  return sessions.get(roomId) ?? null;
}

/** 开局：按房间里的座位建会话，房主点开局时调用 */
export function startBlackjackTable(room: RoomDetail): { ok: boolean; error?: string } {
  if (sessions.has(room.id)) return { ok: true };

  const players = room.seats.filter((s) => s.role === 'player');
  if (players.length < 2) return { ok: false, error: '至少 2 个人才能开局' };

  const baseBet = typeof room.config.baseBet === 'number' ? room.config.baseBet : BASE_BET;
  const session = new BlackjackSession(
    players.map((p) => ({
      actorId: p.userId ?? p.guestId ?? '',
      name: p.nickname,
      avatar: p.avatar,
      balance: START_BALANCE,
    })),
    baseBet,
  );
  sessions.set(room.id, session);
  broadcast(room.id);
  return { ok: true };
}

export function dropBlackjackTable(roomId: string): void {
  const timer = nextRoundTimers.get(roomId);
  if (timer) clearTimeout(timer);
  nextRoundTimers.delete(roomId);
  sessions.delete(roomId);
}

function send(conn: Conn, payload: unknown): void {
  if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(payload));
}

function broadcast(roomId: string): void {
  const session = sessions.get(roomId);
  const set = conns.get(roomId);
  if (!session || !set) return;
  for (const c of set) {
    const access = tableAccess(c.token, roomId, 'blackjack');
    if (!access || access.actorId !== c.actorId) { c.ws.close(4003, 'join room first'); set.delete(c); continue; }
    send(c, { t: 'view', view: session.viewFor(access.role === 'player' ? c.actorId : null) });
  }
}

/** 摊牌后自动开下一局，留时间给大家看清结果 */
function scheduleNextRound(roomId: string): void {
  const existing = nextRoundTimers.get(roomId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    nextRoundTimers.delete(roomId);
    const session = sessions.get(roomId);
    if (!session) return;
    session.startRound();
    broadcast(roomId);
  }, NEXT_ROUND_DELAY_MS);
  nextRoundTimers.set(roomId, timer);
}

export function attachConn(roomId: string, actorId: string, token: string, ws: WebSocket): () => void {
  const set = conns.get(roomId) ?? new Set<Conn>();
  const conn: Conn = { ws, actorId, token };
  set.add(conn);
  conns.set(roomId, set);

  const session = sessions.get(roomId);
  const access = tableAccess(token, roomId, 'blackjack');
  if (session && access) send(conn, { t: 'view', view: session.viewFor(access.role === 'player' ? actorId : null) });
  else send(conn, { t: 'error', reason: '这桌还没开局' });

  return () => {
    set.delete(conn);
    if (set.size === 0) conns.delete(roomId);
  };
}

export function act(roomId: string, actorId: string, action: BJAction): { ok: boolean; error?: string } {
  const session = sessions.get(roomId);
  if (!session) return { ok: false, error: '这桌还没开局' };
  const wasDone = session.hasResult();
  const res = session.apply(actorId, action);
  broadcast(roomId);
  if (!wasDone && session.hasResult()) {
    const view = session.viewFor(null);
    recordMatch(roomId, 'blackjack', view.roundNo, view.result?.text ?? '本局结束',
      view.players.map((p) => ({ actorId: p.actorId, nickname: p.name, delta: p.delta, winner: p.isWinner })));
    scheduleNextRound(roomId);
  }
  return res;
}

/** 房主让某个人「本局先跳过」：替他确认，下一局自动回来 */
export function skipHand(
  roomId: string,
  targetActorId: string,
  isHost: boolean,
): { ok: boolean; error?: string } {
  const session = sessions.get(roomId);
  if (!session) return { ok: false, error: '这桌还没开局' };
  if (!isHost) return { ok: false, error: '只有房主能让人跳过' };
  const wasDone = session.hasResult();
  if (!session.skipHand(targetActorId)) return { ok: false, error: '这个人不需要跳过' };
  broadcast(roomId);
  if (!wasDone && session.hasResult()) {
    const view = session.viewFor(null);
    recordMatch(roomId, 'blackjack', view.roundNo, view.result?.text ?? '本局结束',
      view.players.map((p) => ({ actorId: p.actorId, nickname: p.name, delta: p.delta, winner: p.isWinner })));
    scheduleNextRound(roomId);
  }
  return { ok: true };
}

export function snapshot(roomId: string, actorId: string | null): BlackjackView | null {
  return sessions.get(roomId)?.viewFor(actorId) ?? null;
}
