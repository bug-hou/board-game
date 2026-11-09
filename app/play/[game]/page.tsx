'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { readGuest } from '@/lib/guest';
import { useSession } from '@/lib/session';
import { usePresence } from '@/lib/use-presence';
import { useTable } from '@/lib/use-table';
import { useBlackjackTable } from '@/lib/use-blackjack-table';
import { useSixTable } from '@/lib/use-six-table';
import type { RoomDetail } from '@/lib/types';
import type { GameKind } from '@/components/game/pixi-stage';

// Pixi 依赖浏览器 canvas，只能在客户端加载
const PixiStage = dynamic(() => import('@/components/game/pixi-stage'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="text-sm tracking-widest text-muted-foreground">正在摆牌桌…</p>
    </div>
  ),
});

const PixiOnlineTable = dynamic(() => import('@/components/game/pixi-online-table'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="text-sm tracking-widest text-muted-foreground">正在摆牌桌…</p>
    </div>
  ),
});

const PixiOnlineBlackjack = dynamic(() => import('@/components/game/pixi-online-blackjack'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="text-sm tracking-widest text-muted-foreground">正在摆牌桌…</p>
    </div>
  ),
});

const PixiOnlineSix = dynamic(() => import('@/components/game/pixi-online-six'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="text-sm tracking-widest text-muted-foreground">正在摆牌桌…</p>
    </div>
  ),
});

function TableConnectionState({ roomId, connected, hasView, error, connectionError, loadingAuth = false, onRestart }: {
  roomId: string;
  connected: boolean;
  hasView: boolean;
  error: string | null;
  connectionError: string | null;
  loadingAuth?: boolean;
  onRestart?: () => Promise<void>;
}) {
  const [restarting, setRestarting] = React.useState(false);
  const [restartError, setRestartError] = React.useState<string | null>(null);
  const [waitingLong, setWaitingLong] = React.useState(false);
  React.useEffect(() => {
    if (connected && hasView) {
      setWaitingLong(false);
      return;
    }
    const timer = setTimeout(() => setWaitingLong(true), 12000);
    return () => clearTimeout(timer);
  }, [connected, hasView]);

  if (connected && hasView) return null;
  const reconnecting = connectionError?.includes('自动重连') ?? false;
  const problem = restartError ?? (error && error !== '这桌还没开局' ? error : reconnecting ? null : connectionError ?? error);
  const needsRestart = problem === '这桌还没开局';
  const canRestart = needsRestart && !!onRestart;
  return <div role={problem ? 'alert' : 'status'} className="fixed inset-0 z-20 flex items-center justify-center bg-background/95 px-5 backdrop-blur-sm">
    <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-border bg-card px-7 py-9 text-center shadow-xl">
      {problem ? <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">!</span> : <Loader2 className="size-8 animate-spin text-matcha-deep" />}
      <div><h2 className="text-lg font-semibold">{restarting ? '正在恢复牌局' : needsRestart ? '牌局需要恢复' : problem ? '无法进入牌桌' : loadingAuth ? '正在验证身份' : reconnecting ? '正在重新连接' : connected ? '正在同步牌局' : '正在连接牌桌'}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{restartError ?? (needsRestart ? canRestart ? '牌局中断了，点击下方按钮重新开局。' : '牌局中断了，请联系房主重新开局。' : problem ?? connectionError ?? (waitingLong ? '加载时间较长，可尝试重新连接或返回房间。' : connected ? '正在加载牌桌画面与当前牌局，请稍等。' : '正在建立实时连接，请稍等。'))}</p></div>
      {canRestart && <Button className="w-full" disabled={restarting} onClick={async () => {
        setRestarting(true);
        setRestartError(null);
        try { await onRestart(); } catch (err) { setRestartError(err instanceof Error ? err.message : '重新开局失败'); setRestarting(false); }
      }}>{restarting ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{restarting ? '正在恢复…' : '重新开局'}</Button>}
      <div className="flex w-full gap-2"><Button variant="outline" asChild className="flex-1"><Link href={`/room/${roomId}`}><ArrowLeft className="size-4" />返回房间</Link></Button><Button variant={canRestart ? 'outline' : 'default'} className="flex-1" onClick={() => window.location.reload()}><RefreshCw className="size-4" />重新连接</Button></div>
    </div>
  </div>;
}

/** 联机牌桌：房间 id 由 /play/holdem?room=xxx 带进来 */
function OnlineHoldem({ roomId }: { roomId: string }) {
  const { token: userToken, user, loading } = useSession();
  const router = useRouter();
  const [guestToken, setGuestToken] = React.useState<string | null>(null);
  const [checkedGuest, setCheckedGuest] = React.useState(false);
  const [room, setRoom] = React.useState<RoomDetail | null>(null);
  const [roomError, setRoomError] = React.useState<string | null>(null);
  const [sceneReady, setSceneReady] = React.useState(false);
  const [sceneError, setSceneError] = React.useState<string | null>(null);
  const token = userToken ?? guestToken;

  React.useEffect(() => { setGuestToken(readGuest()?.token ?? null); setCheckedGuest(true); }, []);

  React.useEffect(() => {
    if (!token) return;
    api
      .roomDetail(token, roomId)
      .then((d) => { setRoom(d.room); setRoomError(null); })
      .catch((err: Error) => setRoomError(err.message));
  }, [token, roomId]);

  const table = useTable(token, roomId);
  // 牌桌页也上报一次在线位置，家人看到的就不是干巴巴的「在线」
  const presence = usePresence(token, room?.familyId ?? null);
  const isHost = !!user && !!room && room.hostId === user.id;

  // 等人太久时给房主一个「本手先跳过」的出口（不是托管，只是本手弃牌）
  const [waited, setWaited] = React.useState(0);
  const toAct = table.view?.toAct ?? null;
  React.useEffect(() => {
    setWaited(0);
    if (toAct === null) return;
    const timer = setInterval(() => setWaited((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [toAct, table.view?.handNo]);

  const acting =
    table.view && toAct !== null ? table.view.players.find((p) => p.id === toAct) ?? null : null;
  const canSkip = isHost && !!acting && acting.id !== table.view?.you && waited >= 60;

  React.useEffect(() => {
    if (!room) return;
    presence.enterRoom(room.id);
    return () => presence.leaveRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  React.useEffect(() => {
    if (table.error) {
      toast.error(table.error);
      // 错误提示只弹一次，避免连续刷屏
      queueMicrotask(() => {});
    }
  }, [table.error]);

  if (!token) return <TableConnectionState roomId={roomId} connected={false} hasView={false} error={loading || !checkedGuest ? null : '未找到登录身份，请先登录或通过邀请链接加入房间。'} connectionError={null} loadingAuth={loading || !checkedGuest} />;

  return (
    <main className="relative min-h-dvh">
      {/* 连接状态浮在牌桌上方，牌桌本身由 Pixi 全屏接管 */}
      <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2">
        <span className="flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          {table.connected ? (
            <>
              <span className="size-1.5 rounded-full bg-matcha" />
              已连接
            </>
          ) : (
            <>
              <Loader2 className="size-3 animate-spin" />
              连接中
            </>
          )}
        </span>
      </div>

      {table.view && (
        <PixiOnlineTable
          view={table.view}
          onAct={table.act}
          onExit={() => router.push(`/room/${roomId}`)}
          onReady={() => setSceneReady(true)}
          onError={setSceneError}
        />
      )}
      <TableConnectionState roomId={roomId} connected={table.connected} hasView={!!table.view && sceneReady} error={sceneError ?? roomError ?? table.error} connectionError={table.connectionError} onRestart={isHost && token && table.error === '这桌还没开局' ? async () => { await api.startRoom(token, roomId); window.location.reload(); } : undefined} />

      {canSkip && acting && (
        <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
          <Button size="sm" variant="outline" onClick={() => table.skip(acting.actorId)}>
            让 {acting.name} 这手先跳过（已等 {waited} 秒）
          </Button>
        </div>
      )}
    </main>
  );
}

/** 联机 21 点：/play/blackjack?room=xxx */
function OnlineBlackjack({ roomId }: { roomId: string }) {
  const { token: userToken, user, loading } = useSession();
  const router = useRouter();
  const [guestToken, setGuestToken] = React.useState<string | null>(null);
  const [checkedGuest, setCheckedGuest] = React.useState(false);
  const [room, setRoom] = React.useState<RoomDetail | null>(null);
  const [roomError, setRoomError] = React.useState<string | null>(null);
  const [sceneReady, setSceneReady] = React.useState(false);
  const [sceneError, setSceneError] = React.useState<string | null>(null);
  const token = userToken ?? guestToken;

  React.useEffect(() => { setGuestToken(readGuest()?.token ?? null); setCheckedGuest(true); }, []);

  React.useEffect(() => {
    if (!token) return;
    api
      .roomDetail(token, roomId)
      .then((d) => { setRoom(d.room); setRoomError(null); })
      .catch((err: Error) => setRoomError(err.message));
  }, [token, roomId]);

  const table = useBlackjackTable(token, roomId);
  const presence = usePresence(token, room?.familyId ?? null);
  const isHost = !!user && !!room && room.hostId === user.id;
  const view = table.view;

  // 「各自确认」没有轮次，卡住的是迟迟不确认的人；房主等满 60 秒可替他确认本局
  const pending = React.useMemo(() => {
    if (!view || view.phase === 'showdown') return null;
    return (
      view.players.find((p) =>
        p.id !== view.you && (view.phase === 'betting' ? !p.confirmedBet : !p.confirmed),
      ) ?? null
    );
  }, [view]);

  const [waited, setWaited] = React.useState(0);
  const waitingKey = pending ? `${view?.roundNo}-${view?.phase}-${pending.id}` : null;
  React.useEffect(() => {
    setWaited(0);
    if (!waitingKey) return;
    const timer = setInterval(() => setWaited((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [waitingKey]);

  React.useEffect(() => {
    if (!room) return;
    presence.enterRoom(room.id);
    return () => presence.leaveRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  React.useEffect(() => {
    if (table.error) toast.error(table.error);
  }, [table.error]);

  if (!token) return <TableConnectionState roomId={roomId} connected={false} hasView={false} error={loading || !checkedGuest ? null : '未找到登录身份，请先登录或通过邀请链接加入房间。'} connectionError={null} loadingAuth={loading || !checkedGuest} />;

  return (
    <main className="relative min-h-dvh">
      <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2">
        <span className="flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          {table.connected ? (
            <>
              <span className="size-1.5 rounded-full bg-matcha" />
              已连接
            </>
          ) : (
            <>
              <Loader2 className="size-3 animate-spin" />
              连接中
            </>
          )}
        </span>
      </div>

      <PixiOnlineBlackjack
        view={view}
        onAct={table.act}
        onExit={() => router.push(`/room/${roomId}`)}
        onReady={() => setSceneReady(true)}
        onError={setSceneError}
      />

      <TableConnectionState roomId={roomId} connected={table.connected} hasView={!!view && sceneReady} error={sceneError ?? roomError ?? table.error} connectionError={table.connectionError} onRestart={isHost && token && table.error === '这桌还没开局' ? async () => { await api.startRoom(token, roomId); window.location.reload(); } : undefined} />

      {isHost && pending && waited >= 60 && (
        <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
          <Button size="sm" variant="outline" onClick={() => table.skip(pending.actorId)}>
            让 {pending.name} 这局先确认（已等 {waited} 秒）
          </Button>
        </div>
      )}
    </main>
  );
}

/** 联机六张牌：/play/six?room=xxx */
function OnlineSix({ roomId }: { roomId: string }) {
  const { token: userToken, user, loading } = useSession();
  const router = useRouter();
  const [guestToken, setGuestToken] = React.useState<string | null>(null);
  const [checkedGuest, setCheckedGuest] = React.useState(false);
  const [room, setRoom] = React.useState<RoomDetail | null>(null);
  const [roomError, setRoomError] = React.useState<string | null>(null);
  const [sceneReady, setSceneReady] = React.useState(false);
  const [sceneError, setSceneError] = React.useState<string | null>(null);
  const token = userToken ?? guestToken;

  React.useEffect(() => { setGuestToken(readGuest()?.token ?? null); setCheckedGuest(true); }, []);

  React.useEffect(() => {
    if (!token) return;
    api
      .roomDetail(token, roomId)
      .then((d) => { setRoom(d.room); setRoomError(null); })
      .catch((err: Error) => setRoomError(err.message));
  }, [token, roomId]);

  const table = useSixTable(token, roomId);
  const presence = usePresence(token, room?.familyId ?? null);
  const isHost = !!user && !!room && room.hostId === user.id;
  const view = table.view;

  // 分组阶段卡在没锁分组的人；加倍阶段卡在轮到却迟迟不表态的人
  const pending = React.useMemo(() => {
    if (!view || view.phase === 'showdown') return null;
    if (view.phase === 'grouping') {
      return view.players.find((p) => p.id !== view.you && !p.submitted) ?? null;
    }
    if (view.doubleTurn === null || view.doubleTurn === view.you) return null;
    return view.players.find((p) => p.id === view.doubleTurn) ?? null;
  }, [view]);

  const [waited, setWaited] = React.useState(0);
  const waitingKey = pending ? `${view?.roundNo}-${view?.phase}-${pending.id}` : null;
  React.useEffect(() => {
    setWaited(0);
    if (!waitingKey) return;
    const timer = setInterval(() => setWaited((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [waitingKey]);

  React.useEffect(() => {
    if (!room) return;
    presence.enterRoom(room.id);
    return () => presence.leaveRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  React.useEffect(() => {
    if (table.error) toast.error(table.error);
  }, [table.error]);

  if (!token) return <TableConnectionState roomId={roomId} connected={false} hasView={false} error={loading || !checkedGuest ? null : '未找到登录身份，请先登录或通过邀请链接加入房间。'} connectionError={null} loadingAuth={loading || !checkedGuest} />;

  return (
    <main className="relative min-h-dvh">
      <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2">
        <span className="flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          {table.connected ? (
            <>
              <span className="size-1.5 rounded-full bg-matcha" />
              已连接
            </>
          ) : (
            <>
              <Loader2 className="size-3 animate-spin" />
              连接中
            </>
          )}
        </span>
      </div>

      <PixiOnlineSix
        view={view}
        onAct={table.act}
        onExit={() => router.push(`/room/${roomId}`)}
        onReady={() => setSceneReady(true)}
        onError={setSceneError}
      />

      <TableConnectionState roomId={roomId} connected={table.connected} hasView={!!view && sceneReady} error={sceneError ?? roomError ?? table.error} connectionError={table.connectionError} onRestart={isHost && token && table.error === '这桌还没开局' ? async () => { await api.startRoom(token, roomId); window.location.reload(); } : undefined} />

      {isHost && pending && waited >= 60 && (
        <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
          <Button size="sm" variant="outline" onClick={() => table.skip(pending.actorId)}>
            让 {pending.name} 这局先跳过（已等 {waited} 秒）
          </Button>
        </div>
      )}
    </main>
  );
}

function Route() {
  const params = useParams<{ game: string }>();
  const search = useSearchParams();
  const roomId = search.get('room');
  const game = params.game;
  const aiRaw = Number(search.get('ai'));
  const aiCount = Number.isFinite(aiRaw) ? Math.min(5, Math.max(1, Math.trunc(aiRaw))) : 3;

  // 带房间号 → 走联机牌桌；否则还是原来的单机 Pixi 牌桌
  if (roomId && game === 'holdem') return <OnlineHoldem roomId={roomId} />;
  if (roomId && game === 'blackjack') return <OnlineBlackjack roomId={roomId} />;
  if (roomId && game === 'six') return <OnlineSix roomId={roomId} />;

  // 单机牌桌只有德州和 21 点两种
  const local: GameKind = game === 'holdem' ? 'holdem' : 'blackjack';
  return <PixiStage game={local} aiCount={aiCount} />;
}

export default function GamePage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <p className="text-sm tracking-widest text-muted-foreground">正在摆牌桌…</p>
        </div>
      }
    >
      <Route />
    </React.Suspense>
  );
}
