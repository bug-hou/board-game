'use client';

import * as React from 'react';
import type { PresenceEntry, RoomDetail } from './types';
import { wsBase } from './backend-url';

interface PresenceMessage {
  t: 'presence' | 'rooms';
  online?: PresenceEntry[];
  rooms?: RoomDetail[];
}

export interface PresenceState {
  online: PresenceEntry[];
  rooms: RoomDetail[];
  connected: boolean;
  roomsReady: boolean;
  connectionError: string | null;
  enterRoom: (roomId: string) => void;
  leaveRoom: () => void;
}

/** 订阅一个家庭的在线状态与房间列表（WebSocket，断线自动重连） */
export function usePresence(token: string | null, familyId: string | null): PresenceState {
  const [online, setOnline] = React.useState<PresenceEntry[]>([]);
  const [rooms, setRooms] = React.useState<RoomDetail[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [roomsReady, setRoomsReady] = React.useState(false);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const wsRef = React.useRef<WebSocket | null>(null);
  const desiredRoomRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!token || !familyId) return;

    let disposed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (disposed) return;
      setRoomsReady(false);
      const ws = new WebSocket(
        `${wsBase()}/ws/presence?token=${encodeURIComponent(token)}&familyId=${encodeURIComponent(familyId)}`,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setConnectionError(null);
        retry = 0;
        if (desiredRoomRef.current) ws.send(JSON.stringify({ t: 'enter_room', roomId: desiredRoomRef.current }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as PresenceMessage;
          if (msg.t === 'presence' && msg.online) setOnline(msg.online);
          else if (msg.t === 'rooms' && msg.rooms) { setRooms(msg.rooms); setRoomsReady(true); }
        } catch {
          // 忽略非 JSON 帧
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = (ev) => {
        setConnected(false);
        if (disposed) return;
        if (ev.code === 4001 || ev.code === 4003) {
          setConnectionError('实时连接无权限，请重新登录或刷新页面。');
          return;
        }
        setConnectionError('实时连接中断，正在重连…');
        retry = Math.min(retry + 1, 5);
        timer = setTimeout(connect, retry * 1000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
      desiredRoomRef.current = null;
      setConnected(false);
      setRoomsReady(false);
      setConnectionError(null);
    };
  }, [token, familyId]);

  const send = React.useCallback((payload: { t: string; roomId?: string }) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const enterRoom = React.useCallback((roomId: string) => {
    desiredRoomRef.current = roomId;
    send({ t: 'enter_room', roomId });
  }, [send]);
  const leaveRoom = React.useCallback(() => {
    desiredRoomRef.current = null;
    send({ t: 'leave_room' });
  }, [send]);

  return { online, rooms, connected, roomsReady, connectionError, enterRoom, leaveRoom };
}
