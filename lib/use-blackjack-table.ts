'use client';

import * as React from 'react';
import type { BJAction, BlackjackView } from './types';
import { wsBase } from './backend-url';

interface ServerMsg {
  t: 'view' | 'error';
  view?: BlackjackView;
  reason?: string;
}

export interface BlackjackTableState {
  view: BlackjackView | null;
  error: string | null;
  connected: boolean;
  act: (action: BJAction) => void;
  skip: (actorId: string) => void;
}

/** 21 点牌桌长连接：收服务端视图、发动作 */
export function useBlackjackTable(token: string | null, roomId: string | null): BlackjackTableState {
  const [view, setView] = React.useState<BlackjackView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
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
        `${wsBase()}/ws/blackjack?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}`,
      );
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
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
  }, [token, roomId]);

  const send = React.useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const act = React.useCallback((action: BJAction) => send({ t: 'act', action }), [send]);
  const skip = React.useCallback((actorId: string) => send({ t: 'skip', actorId }), [send]);

  return { view, error, connected, act, skip };
}
