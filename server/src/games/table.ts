/**
 * 牌桌会话管理：房间 → 对局会话 → 连接广播。
 *
 * 服务端是唯一权威：牌靴、发牌、结算都在内存里的 session 上跑，
 * 客户端只收到按自己身份裁剪过的视图。
 */
import type { WebSocket } from 'ws';
import type { Action } from '../../../src/game/holdem/engine';
import type { RoomDetail } from '../store';
import { HoldemSession, type HoldemView } from './holdem-session';

interface Conn {
  ws: WebSocket;
  actorId: string;
  alive: boolean;
}

const sessions = new Map<string, HoldemSession>();
const conns = new Map<string, Set<Conn>>();
const nextHandTimers = new Map<string, NodeJS.Timeout>();

const START_STACK = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const NEXT_HAND_DELAY_MS = 8000;

export function getSession(roomId: string): HoldemSession | null {
  return sessions.get(roomId) ?? null;
}

/** 开局：按房间里的座位建会话，房主点开局时调用 */
export function startTable(room: RoomDetail): { ok: boolean; error?: string } {
  if (sessions.has(room.id)) return { ok: true };

  const players = room.seats.filter((s) => s.role === 'player');
  if (players.length < 2) return { ok: false, error: '至少 2 个人才能开局' };

  const stack = typeof room.config.startStack === 'number' ? room.config.startStack : START_STACK;
  const session = new HoldemSession(
    players.map((p) => ({
      actorId: p.userId ?? p.guestId ?? '',
      name: p.nickname,
      avatar: p.avatar,
      stack,
    })),
    typeof room.config.smallBlind === 'number' ? room.config.smallBlind : SMALL_BLIND,
    typeof room.config.bigBlind === 'number' ? room.config.bigBlind : BIG_BLIND,
  );
  session.startHand();
  sessions.set(room.id, session);
  broadcast(room.id);
  return { ok: true };
}

export function dropTable(roomId: string): void {
  const timer = nextHandTimers.get(roomId);
  if (timer) clearTimeout(timer);
  nextHandTimers.delete(roomId);
  sessions.delete(roomId);
}

function send(conn: Conn, payload: unknown): void {
  if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(payload));
}

function broadcast(roomId: string): void {
  const session = sessions.get(roomId);
  const set = conns.get(roomId);
  if (!session || !set) return;
  for (const c of set) send(c, { t: 'view', view: session.viewFor(c.actorId) });
}

/** 摊牌后自动开下一手，留时间给大家看清结果 */
function scheduleNextHand(roomId: string): void {
  const existing = nextHandTimers.get(roomId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    nextHandTimers.delete(roomId);
    const session = sessions.get(roomId);
    if (!session) return;
    session.nextHand();
    broadcast(roomId);
  }, NEXT_HAND_DELAY_MS);
  nextHandTimers.set(roomId, timer);
}

export function attachConn(roomId: string, actorId: string, ws: WebSocket): () => void {
  const set = conns.get(roomId) ?? new Set<Conn>();
  const conn: Conn = { ws, actorId, alive: true };
  set.add(conn);
  conns.set(roomId, set);

  const session = sessions.get(roomId);
  if (session) send(conn, { t: 'view', view: session.viewFor(actorId) });
  else send(conn, { t: 'error', reason: '这桌还没开局' });

  return () => {
    set.delete(conn);
    if (set.size === 0) conns.delete(roomId);
  };
}

export function markConnAlive(roomId: string, ws: WebSocket): void {
  const c = [...(conns.get(roomId) ?? [])].find((x) => x.ws === ws);
  if (c) c.alive = true;
}

export function act(roomId: string, actorId: string, action: Action): { ok: boolean; error?: string } {
  const session = sessions.get(roomId);
  if (!session) return { ok: false, error: '这桌还没开局' };
  const res = session.apply(actorId, action);
  broadcast(roomId);
  if (session.viewFor(null).result) scheduleNextHand(roomId);
  return res;
}

/** 房主让某个人「本手先跳过」：本手弃牌，下一手自动回来 */
export function skipHand(
  roomId: string,
  targetActorId: string,
  isHost: boolean,
): { ok: boolean; error?: string } {
  const session = sessions.get(roomId);
  if (!session) return { ok: false, error: '这桌还没开局' };
  if (!isHost) return { ok: false, error: '只有房主能让人跳过' };
  if (!session.skipHand(targetActorId)) return { ok: false, error: '这个人不需要跳过' };
  broadcast(roomId);
  if (session.viewFor(null).result) scheduleNextHand(roomId);
  return { ok: true };
}

/** 供 HTTP 侧查询当前牌局是否结束（决定房间状态） */
export function snapshot(roomId: string, actorId: string | null): HoldemView | null {
  const session = sessions.get(roomId);
  return session ? session.viewFor(actorId) : null;
}

export function viewerSeat(roomId: string, actorId: string): number {
  return sessions.get(roomId)?.seatOf(actorId) ?? -1;
}
