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
import { handleHttp } from './http';
import * as store from './store';
import { addConn, dropConn, markAlive, notifyFamilyAndRooms, setRoom, sweepDead } from './presence';
import { handleTableSocket } from './table-ws';
import { handleBlackjackSocket } from './blackjack-ws';
import { handleSixSocket } from './six-ws';

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

// 家庭体系的 HTTP API 与牌桌 WebSocket 共用同一端口：
// /api/* 交给家庭接口，其余（含 /healthz 与 WS 握手）留给房间服务。
const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }
  if (req.url?.startsWith('/api/')) {
    void handleHttp(req, res);
    return;
  }
  res.writeHead(404);
  res.end();
});

// 一个端口五种连接：/ws/presence 在线状态，/ws/table 德州牌桌，
// /ws/blackjack 21 点牌桌，/ws/six 六张牌牌桌，/ws/game 旧版房间（保留待改造）
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
const presenceWss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
const tableWss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
const blackjackWss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
const sixWss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname === '/ws/presence') {
    presenceWss.handleUpgrade(req, socket, head, (ws) => presenceWss.emit('connection', ws, req));
  } else if (pathname === '/ws/table') {
    tableWss.handleUpgrade(req, socket, head, (ws) => tableWss.emit('connection', ws, req));
  } else if (pathname === '/ws/blackjack') {
    blackjackWss.handleUpgrade(req, socket, head, (ws) => blackjackWss.emit('connection', ws, req));
  } else if (pathname === '/ws/six') {
    sixWss.handleUpgrade(req, socket, head, (ws) => sixWss.emit('connection', ws, req));
  } else if (pathname === '/ws/game') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

tableWss.on('connection', (ws, req) => {
  handleTableSocket(ws, req);
});

blackjackWss.on('connection', (ws, req) => {
  handleBlackjackSocket(ws, req);
});

sixWss.on('connection', (ws, req) => {
  handleSixSocket(ws, req);
});

presenceWss.on('connection', (ws, req) => {
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const token = params.get('token') ?? '';
  const familyId = params.get('familyId') ?? '';

  const user = store.userBySession(token);
  const guest = user ? null : store.guestByToken(token);
  if (!user && !guest) {
    ws.close(4001, 'unauthorized');
    return;
  }
  // 家庭成员必须真的属于这个家庭，访客只能进自己被邀的那个家庭
  if (user ? !store.isMember(familyId, user.id) : guest!.family.id !== familyId) {
    ws.close(4003, 'forbidden');
    return;
  }

  const entry = user
    ? { id: user.id, kind: 'user' as const, nickname: user.nickname, avatar: user.avatar, roomId: null, game: null }
    : { id: guest!.id, kind: 'guest' as const, nickname: guest!.nickname, avatar: guest!.avatar, roomId: null, game: null };
  const connId = addConn(ws, familyId, entry);
  notifyFamilyAndRooms(familyId);

  ws.on('pong', () => markAlive(connId));

  ws.on('message', (data) => {
    let msg: { t?: string; roomId?: string | null; game?: string | null };
    try {
      msg = JSON.parse(String(data)) as typeof msg;
    } catch {
      return;
    }
    // 进出房间只更新在线状态，牌桌同步走 /ws/game
    if (msg.t === 'enter_room' && msg.roomId) {
      const room = store.roomById(msg.roomId);
      if (room && room.familyId === familyId) {
        setRoom(connId, msg.roomId, room.game);
        notifyFamilyAndRooms(familyId);
      }
    } else if (msg.t === 'leave_room') {
      setRoom(connId, null, null);
      notifyFamilyAndRooms(familyId);
    }
  });

  ws.on('close', () => {
    dropConn(connId);
    notifyFamilyAndRooms(familyId);
  });

  ws.on('error', () => {
    dropConn(connId);
    notifyFamilyAndRooms(familyId);
  });
});

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
  // 在线状态连接同样巡检，掉线的家庭要立刻从名单里消失
  for (const familyId of sweepDead()) notifyFamilyAndRooms(familyId);
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
