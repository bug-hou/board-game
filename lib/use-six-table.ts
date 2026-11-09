'use client';

import * as React from 'react';
import type { SixAction, SixView } from './types';
import { wsBase } from './backend-url';

interface ServerMsg {
  t: 'view' | 'error';
  view?: SixView;
  reason?: string;
}

export interface SixTableState {
  view: SixView | null;
  error: string | null;
  connectionError: string | null;
  connected: boolean;
  act: (action: SixAction) => void;
  skip: (actorId: string) => void;
}

/** 六张牌牌桌长连接：收服务端视图、发分组动作 */
export function useSixTable(token: string | null, roomId: string | null): SixTableState {
  const [view, setView] = React.useState<SixView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const [connected, setConnected] = React.useState(false);
  const wsRef = React.useRef<WebSocket | null>(null);

  React.useEffect(() => {
    if (!token || !roomId) return;

    let disposed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(
        `${wsBase()}/ws/six?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}`,
      );
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        setConnectionError(null);
        retry = 0;
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as ServerMsg;
          if (msg.t === 'view' && msg.view) {
            setView(msg.view);
            setError(null);
          } else if (msg.t === 'error') {
            setError(msg.reason ?? '操作失败');
          }
        } catch {
          // 忽略非 JSON 帧
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = (ev) => {
        setConnected(false);
        if (disposed) return;
        if (ev.code === 4001 || ev.code === 4003 || ev.code === 4004) {
          setConnectionError(ev.code === 4001 ? '登录信息已失效，请重新登录。' : '无法进入牌桌，请先返回房间确认已经加入。');
          setView(null);
          return;
        }
        setConnectionError('连接中断，正在自动重连…');
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
  }, [token, roomId]);

  const send = React.useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const act = React.useCallback((action: SixAction) => send({ t: 'act', action }), [send]);
  const skip = React.useCallback((actorId: string) => send({ t: 'skip', actorId }), [send]);

  return { view, error, connectionError, connected, act, skip };
}
