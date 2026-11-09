/**
 * 21 点牌桌 WebSocket：/ws/blackjack?roomId=xxx&token=yyy
 *
 * 只负责鉴权与转发动作，规则判定全在 games/blackjack-table.ts 里。
 */
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import type { BJAction } from './games/blackjack-session';
import * as store from './store';
import { act, attachConn, skipHand } from './games/blackjack-table';

interface ClientMsg {
  t?: string;
  action?: BJAction;
  actorId?: string;
}

export function handleBlackjackSocket(ws: WebSocket, req: IncomingMessage): void {
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const token = params.get('token') ?? '';
  const roomId = params.get('roomId') ?? '';

  const access = store.tableAccess(token, roomId, 'blackjack');
  if (!access) {
    ws.close(4003, 'join room first');
    return;
  }
  const actorId = access.actorId;
  const detach = attachConn(roomId, actorId, token, ws);

  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data)) as ClientMsg;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    const current = store.tableAccess(token, roomId, 'blackjack');
    if (!current) { ws.close(4003, 'join room first'); return; }

    if (msg.t === 'act' && msg.action) {
      if (current.role !== 'player') { ws.close(4003, 'spectators cannot play'); return; }
      const res = act(roomId, actorId, msg.action);
      if (!res.ok && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ t: 'error', reason: res.error ?? '动作不合法' }));
      }
      return;
    }

    if (msg.t === 'skip' && msg.actorId) {
      const res = skipHand(roomId, msg.actorId, current.role === 'player' && current.room.hostId === actorId);
      if (!res.ok && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ t: 'error', reason: res.error ?? '跳过失败' }));
      }
    }
  });

  ws.on('close', detach);
  ws.on('error', detach);
}
