/**
 * 「六张牌」牌桌会话管理：房间 → 对局会话 → 连接广播。
 *
 * 与德州、21 点三套会话完全独立，避免改一个引入另外两个的回归。
 */
import type { WebSocket } from 'ws';
import type { RoomDetail } from '../store';
import { recordMatch } from '../history';
import { SixSession, type SixAction, type SixView } from './six-session';

interface Conn {
  ws: WebSocket;
  actorId: string;
}

const sessions = new Map<string, SixSession>();
const conns = new Map<string, Set<Conn>>();
const nextRoundTimers = new Map<string, NodeJS.Timeout>();

const NEXT_ROUND_DELAY_MS = 8000;

export function getSixSession(roomId: string): SixSession | null {
  return sessions.get(roomId) ?? null;
}

/** 开局：按房间里的座位建会话，房主点开局时调用 */
export function startSixTable(room: RoomDetail): { ok: boolean; error?: string } {
  if (sessions.has(room.id)) return { ok: true };

  const players = room.seats.filter((s) => s.role === 'player');
  if (players.length < 2) return { ok: false, error: '至少 2 个人才能开局' };

  const session = new SixSession(
    players.map((p) => ({
      actorId: p.userId ?? p.guestId ?? '',
      name: p.nickname,
      avatar: p.avatar,
    })),
  );
  sessions.set(room.id, session);
  broadcast(room.id);
  return { ok: true };
}

export function dropSixTable(roomId: string): void {
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
  for (const c of set) send(c, { t: 'view', view: session.viewFor(c.actorId) });
}

/** 摊牌后自动开下一局，留时间给大家看清三组结果 */
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

export function attachConn(roomId: string, actorId: string, ws: WebSocket): () => void {
  const set = conns.get(roomId) ?? new Set<Conn>();
  const conn: Conn = { ws, actorId };
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

export function act(roomId: string, actorId: string, action: SixAction): { ok: boolean; error?: string } {
  const session = sessions.get(roomId);
  if (!session) return { ok: false, error: '这桌还没开局' };
  const wasDone = session.hasResult();
  const res = session.apply(actorId, action);
  broadcast(roomId);
  if (!wasDone && session.hasResult()) {
    const view = session.viewFor(null);
    const best = Math.max(...view.players.map((p) => p.delta ?? 0));
    recordMatch(roomId, 'six', view.roundNo, view.result?.text ?? '本局结束',
      view.players.map((p) => ({ actorId: p.actorId, nickname: p.name, delta: p.delta,
        winner: best > 0 && p.delta === best })));
    scheduleNextRound(roomId);
  }
  return res;
}

/** 房主让某个人「本局先跳过」：替他按默认顺序分组，下一局自动回来 */
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
    const best = Math.max(...view.players.map((p) => p.delta ?? 0));
    recordMatch(roomId, 'six', view.roundNo, view.result?.text ?? '本局结束',
      view.players.map((p) => ({ actorId: p.actorId, nickname: p.name, delta: p.delta,
        winner: best > 0 && p.delta === best })));
    scheduleNextRound(roomId);
  }
  return { ok: true };
}

export function snapshot(roomId: string, actorId: string | null): SixView | null {
  return sessions.get(roomId)?.viewFor(actorId) ?? null;
}
