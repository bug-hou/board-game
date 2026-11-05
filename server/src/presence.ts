/**
 * 在线状态（presence）：谁在线、在哪个房间。
 *
 * 连接即在线，断开即离线。房间或家庭的变动由 HTTP 接口调用 notify* 触发广播，
 * 这样前端不用轮询就能看到「妈妈在玩 21 点」。
 */
import type { WebSocket } from 'ws';
import * as store from './store';

export interface PresenceEntry {
  id: string;
  kind: 'user' | 'guest';
  nickname: string;
  avatar: string | null;
  roomId: string | null;
  game: string | null;
}

interface Conn {
  ws: WebSocket;
  entry: PresenceEntry;
  familyId: string;
  alive: boolean;
}

const conns = new Map<number, Conn>();
let seq = 0;

export function addConn(
  ws: WebSocket,
  familyId: string,
  entry: PresenceEntry,
): number {
  seq += 1;
  conns.set(seq, { ws, familyId, entry, alive: true });
  return seq;
}

export function dropConn(id: number): { familyId: string } | null {
  const c = conns.get(id);
  if (!c) return null;
  conns.delete(id);
  return { familyId: c.familyId };
}

export function markAlive(id: number): void {
  const c = conns.get(id);
  if (c) c.alive = true;
}

/** 心跳巡检：踢掉没响应的连接，返回受影响的需要刷新的家庭 */
export function sweepDead(): string[] {
  const affected = new Set<string>();
  for (const [id, c] of conns) {
    if (!c.alive) {
      affected.add(c.familyId);
      c.ws.terminate();
      conns.delete(id);
    } else {
      c.alive = false;
      c.ws.ping();
    }
  }
  return [...affected];
}

export function setRoom(id: number, roomId: string | null, game: string | null): void {
  const c = conns.get(id);
  if (!c) return;
  c.entry.roomId = roomId;
  c.entry.game = game;
}

function send(c: Conn, payload: unknown): void {
  if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(payload));
}

/** 同一个人可能开多个页面/同时连牌桌，按 id 去重后才是「几个人在线」 */
function uniqueOnline(familyId: string): PresenceEntry[] {
  const seen = new Set<string>();
  const out: PresenceEntry[] = [];
  for (const c of conns.values()) {
    if (c.familyId !== familyId) continue;
    if (seen.has(c.entry.id)) continue;
    seen.add(c.entry.id);
    out.push(c.entry);
  }
  return out;
}

/** 把一个家庭的在线名单推给该家庭所有在线连接 */
export function notifyFamily(familyId: string): void {
  const online = uniqueOnline(familyId);
  for (const c of conns.values()) {
    if (c.familyId === familyId) send(c, { t: 'presence', online });
  }
}

/** 房间有变动：通知该家庭刷新房间列表 */
export function notifyRooms(familyId: string): void {
  const rooms = store.listRooms(familyId);
  for (const c of conns.values()) {
    if (c.familyId === familyId) send(c, { t: 'rooms', rooms });
  }
}

export function notifyFamilyAndRooms(familyId: string): void {
  notifyFamily(familyId);
  notifyRooms(familyId);
}

export function familyOnline(familyId: string): PresenceEntry[] {
  return uniqueOnline(familyId);
}
