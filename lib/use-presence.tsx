'use client';

import * as React from 'react';
import type { PresenceEntry, RoomDetail } from './types';

function wsBase(): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL;
  if (configured) return configured;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // 本地开发时后端在 8080，生产由同域 Nginx 转发
  return window.location.port === '3000'
    ? `${proto}//${window.location.hostname}:8080`
    : `${proto}//${window.location.host}`;
}

interface PresenceMessage {
  t: 'presence' | 'rooms';
  online?: PresenceEntry[];
  rooms?: RoomDetail[];
}

export interface PresenceState {
  online: PresenceEntry[];
  rooms: RoomDetail[];
  connected: boolean;
  enterRoom: (roomId: string) => void;
  leaveRoom: () => void;
}

/** 订阅一个家庭的在线状态与房间列表（WebSocket，断线自动重连） */
export function usePresence(token: string | null, familyId: string | null): PresenceState {
  const [online, setOnline] = React.useState<PresenceEntry[]>([]);
  const [rooms, setRooms] = React.useState<RoomDetail[]>([]);
  const [connected, setConnected] = React.useState(false);
  const wsRef = React.useRef<WebSocket | null>(null);

  React.useEffect(() => {
    if (!token || !familyId) return;

    let disposed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(
        `${wsBase()}/ws/presence?token=${encodeURIComponent(token)}&familyId=${encodeURIComponent(familyId)}`,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retry = 0;
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as PresenceMessage;
          if (msg.t === 'presence' && msg.online) setOnline(msg.online);
          else if (msg.t === 'rooms' && msg.rooms) setRooms(msg.rooms);
        } catch {
          // 忽略非 JSON 帧
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        setConnected(false);
        if (disposed) return;
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
    };
  }, [token, familyId]);

  const send = React.useCallback((payload: { t: string; roomId?: string }) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const enterRoom = React.useCallback((roomId: string) => send({ t: 'enter_room', roomId }), [send]);
  const leaveRoom = React.useCallback(() => send({ t: 'leave_room' }), [send]);

  return { online, rooms, connected, enterRoom, leaveRoom };
}
