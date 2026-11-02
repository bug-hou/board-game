/**
 * 21 点联机服务端：WebSocket + 权威房间状态。
 *
 * 规则完全复用前端的 src/game/blackjack/engine.ts，前后端共用同一份实现。
 * 房间状态只存在于本进程内存中，进程重启即清空（小规模场景可接受）。
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import {
  applyAction,
  createRoom,
  viewFor,
  type Action,
  type RoomState,
} from '../../src/game/blackjack/engine';
import type { ClientMsg, ServerMsg } from './protocol';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 8080);

/** 轮到某座位后多久不操作就自动停牌 */
const TURN_TIMEOUT_MS = 30_000;
/** 掉线后保留座位多久，超时则接管（正在行动就自动停牌，否则离座） */
const DROP_GRACE_MS = 30_000;
/** 单条消息上限，防止恶意超大包 */
const MAX_PAYLOAD = 64 * 1024;

interface Client {
  ws: WebSocket;
  seatId: string;
  room: string | null;
  alive: boolean;
}

const clients = new Set<Client>();
const rooms = new Map<string, RoomState>();
const turnTimers = new Map<string, NodeJS.Timeout>();
const dropTimers = new Map<string, Map<string, NodeJS.Timeout>>();

function send(c: Client, msg: ServerMsg): void {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

/** 给房间内每个客户端推送裁剪后的视图（隐藏牌靴与庄家暗牌） */
function broadcast(room: RoomState): void {
  for (const c of clients) {
    if (c.room === room.code) send(c, { t: 'state', view: viewFor(room, c.seatId) });
  }
}

function normalizeRoomCode(raw: string): string {
  const s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return s || 'AAAA';
}

function getRoom(code: string): RoomState {
  let r = rooms.get(code);
  if (!r) {
    r = createRoom(code);
    rooms.set(code, r);
  }
  return r;
}

// ---------- 行动超时 ----------

function clearTurnTimer(code: string): void {
  const t = turnTimers.get(code);
  if (t) {
    clearTimeout(t);
    turnTimers.delete(code);
  }
}

function scheduleTurnTimer(room: RoomState): void {
  clearTurnTimer(room.code);
  if (room.phase !== 'acting' || room.turnIndex === null) return;
  const seat = room.seats[room.turnIndex];
  if (!seat) return;

  const timer = setTimeout(() => {
    const cur = rooms.get(room.code);
    if (!cur || cur.phase !== 'acting' || cur.turnIndex === null) return;
    const s = cur.seats[cur.turnIndex];
    if (!s || s.id !== seat.id || s.done) return;
    console.log(`[room ${room.code}] ${seat.name} 超时未操作，自动停牌`);
    commit(room.code, { type: 'stand', seatId: seat.id });
  }, TURN_TIMEOUT_MS);

  turnTimers.set(room.code, timer);
}

// ---------- 掉线宽限 ----------

function scheduleDrop(code: string, seatId: string): void {
  let m = dropTimers.get(code);
  if (!m) {
    m = new Map();
    dropTimers.set(code, m);
  }
  const old = m.get(seatId);
  if (old) clearTimeout(old);

  const timer = setTimeout(() => {
    m?.delete(seatId);
    const room = rooms.get(code);
    if (!room) return;
    const seat = room.seats.find((s) => s.id === seatId);
    if (!seat) return;
    // 宽限期结束仍未回来：正在行动就替他停牌，否则退出本轮
    if (!seat.done && room.phase === 'acting') {
      console.log(`[room ${code}] ${seat.name} 掉线超时，自动停牌`);
      commit(code, { type: 'stand', seatId });
    } else {
      console.log(`[room ${code}] ${seat.name} 掉线超时，离座`);
      commit(code, { type: 'leave', seatId });
    }
  }, DROP_GRACE_MS);

  m.set(seatId, timer);
}

function cancelDrop(code: string, seatId: string): void {
  const m = dropTimers.get(code);
  const t = m?.get(seatId);
  if (t) {
    clearTimeout(t);
    m?.delete(seatId);
  }
}

// ---------- 状态变更 ----------

/** 应用一个动作，成功则广播并重排超时；失败时把原因交给调用方回给发起者 */
function commit(code: string, action: Action): { ok: true } | { ok: false; reason: string } {
  const room = rooms.get(code);
  if (!room) return { ok: false, reason: '房间不存在' };

  const res = applyAction(room, action);
  if (!res.ok) return { ok: false, reason: res.reason };

  rooms.set(code, res.state);
  broadcast(res.state);
  scheduleTurnTimer(res.state);
  return { ok: true };
}

function requireRoom(c: Client, build: (seatId: string) => Action): void {
  if (!c.room || !c.seatId) {
    send(c, { t: 'error', reason: '尚未加入房间' });
    return;
  }
  const r = commit(c.room, build(c.seatId));
  if (!r.ok) send(c, { t: 'error', reason: r.reason });
}

// ---------- 消息处理 ----------

function handle(c: Client, msg: ClientMsg): void {
  switch (msg.t) {
    case 'join': {
      const code = normalizeRoomCode(msg.room);
      const room = getRoom(code);
      // 带原 seatId 且房间中仍保留该座位，视为重连
      const seatId =
        msg.seatId && room.seats.some((s) => s.id === msg.seatId) ? msg.seatId : randomUUID();
      cancelDrop(code, seatId);
      c.seatId = seatId;
      c.room = code;

      const res = applyAction(room, { type: 'join', seatId, name: msg.name });
      if (res.ok) {
        rooms.set(code, res.state);
        broadcast(res.state);
        scheduleTurnTimer(res.state);
      } else {
        send(c, { t: 'error', reason: res.reason });
      }
      send(c, { t: 'welcome', seatId });
      return;
    }
    case 'bet':
      return requireRoom(c, (seatId) => ({ type: 'bet', seatId, amount: msg.amount }));
    case 'clearBet':
      return requireRoom(c, (seatId) => ({ type: 'clearBet', seatId }));
    case 'deal':
      return requireRoom(c, (seatId) => ({ type: 'deal', seatId }));
    case 'hit':
      return requireRoom(c, (seatId) => ({ type: 'hit', seatId }));
    case 'stand':
      return requireRoom(c, (seatId) => ({ type: 'stand', seatId }));
    case 'double':
      return requireRoom(c, (seatId) => ({ type: 'double', seatId }));
    case 'next':
      return requireRoom(c, (seatId) => ({ type: 'next', seatId }));
    case 'leave': {
      if (!c.room || !c.seatId) return;
      commit(c.room, { type: 'leave', seatId: c.seatId });
      c.room = null;
      return;
    }
  }
}

// ---------- 启动 ----------

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD });

wss.on('connection', (ws) => {
  const c: Client = { ws, seatId: '', room: null, alive: true };
  clients.add(c);

  ws.on('pong', () => {
    c.alive = true;
  });

  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data)) as ClientMsg;
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    handle(c, msg);
  });

  ws.on('close', () => {
    clients.delete(c);
    if (c.room && c.seatId) scheduleDrop(c.room, c.seatId);
  });

  ws.on('error', () => {
    ws.close();
  });
});

// 心跳：清理僵死连接
const heartbeat = setInterval(() => {
  for (const c of clients) {
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, 30_000);

// 回收空房间（座位已被掉线接管清空且无人在线）
const pruner = setInterval(() => {
  for (const [code, room] of rooms) {
    const online = [...clients].some((c) => c.room === code);
    if (!online && room.seats.length === 0) {
      rooms.delete(code);
      clearTurnTimer(code);
      console.log(`[room ${code}] 已回收`);
    }
  }
}, 60_000);

server.listen(PORT, HOST, () => {
  console.log(`[bj-server] listening on http://${HOST}:${PORT}`);
  console.log(`[bj-server] 行动超时 ${TURN_TIMEOUT_MS}ms，掉线宽限 ${DROP_GRACE_MS}ms`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    clearInterval(heartbeat);
    clearInterval(pruner);
    server.close(() => process.exit(0));
  });
}
