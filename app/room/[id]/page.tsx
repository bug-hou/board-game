'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Crown, Loader2, LockKeyhole, Play, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { readGuest, type GuestSession } from '@/lib/guest';
import { useSession } from '@/lib/session';
import { usePresence } from '@/lib/use-presence';
import type { RoomDetail } from '@/lib/types';
import { gameMeta } from '@/src/game/registry';

function Booting() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="text-sm tracking-widest text-muted-foreground">正在准备…</p>
    </main>
  );
}

function RoomHome() {
  const params = useParams<{ id: string }>();
  const roomId = params.id ?? '';
  const { user, loading } = useSession();
  const [guest, setGuest] = React.useState<GuestSession | null>(null);
  const [checkedGuest, setCheckedGuest] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    setGuest(readGuest());
    setCheckedGuest(true);
  }, []);

  React.useEffect(() => {
    if (!loading && checkedGuest && !user && !guest?.token) router.replace('/login');
  }, [loading, checkedGuest, user, guest, router]);

  if (loading || !checkedGuest || (!user && !guest)) return <Booting />;

  if (!user) return <RoomBody roomId={roomId} guest={guest} />;
  return <AppShell><RoomBody roomId={roomId} /></AppShell>;
}

function RoomBody({ roomId, guest }: { roomId: string; guest?: GuestSession | null }) {
  const { token: userToken, user, currentFamilyId, setCurrentFamilyId } = useSession();
  const token = userToken ?? guest?.token ?? null;
  const actorId = user?.id ?? guest?.id;
  const router = useRouter();

  const [room, setRoom] = React.useState<RoomDetail | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [busyLabel, setBusyLabel] = React.useState('');
  const presence = usePresence(token, room?.familyId ?? guest?.familyId ?? currentFamilyId);

  const load = React.useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.roomDetail(token, roomId);
      setRoom(data.room);
      if (user && currentFamilyId !== data.room.familyId) setCurrentFamilyId(data.room.familyId);
      setMissing(false);
      setLoadError(null);
    } catch (err) {
      if ((err as Error & { status?: number }).status === 404) {
        setMissing(true);
      } else {
        setLoadError(err instanceof Error ? err.message : '房间加载失败');
      }
    }
  }, [token, roomId, user, currentFamilyId, setCurrentFamilyId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!presence.connected) return;
    const updated = presence.rooms.find((item) => item.id === roomId);
    if (updated) setRoom(updated);
  }, [presence.connected, presence.rooms, roomId]);

  const joined = !!room?.seats.some((seat) => seat.userId === actorId || seat.guestId === actorId);
  React.useEffect(() => {
    if (!room || !joined) return;
    presence.enterRoom(room.id);
    return () => presence.leaveRoom();
    // 只在入座或切换房间时进出，避免每次视图刷新重复上报
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, joined]);

  const act = async (fn: () => Promise<unknown>, label: string, okMsg?: string): Promise<boolean> => {
    setBusy(true);
    setBusyLabel(label);
    try {
      const result = await fn();
      if (result && typeof result === 'object' && 'room' in result) {
        setRoom((result as { room: RoomDetail }).room);
        setLoadError(null);
      }
      if (okMsg) toast.success(okMsg);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
      return false;
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  if (missing) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5">
        <BackLink href={guest ? '/play' : '/family'} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">这个房间已经散了</CardTitle>
            <CardDescription>可能人都走光了，回大厅看看还有谁开着</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={guest ? '/play' : '/family'}>返回</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-8">
        <BackLink href={guest ? '/play' : '/family'} />
        <Card><CardContent className="flex flex-col items-center gap-4 py-12 text-center" role="status">
          {loadError ? <><p className="font-semibold">房间暂时无法加载</p><p className="text-sm text-muted-foreground">{loadError}</p><Button onClick={() => void load()}>重试</Button></> :
            <><Loader2 className="size-6 animate-spin text-matcha-deep" /><p className="text-sm text-muted-foreground">正在加载房间信息…</p></>}
        </CardContent></Card>
      </main>
    );
  }

  const meta = gameMeta(room.game);
  const players = room.seats.filter((s) => s.role === 'player');
  const spectators = room.seats.filter((s) => s.role === 'spectator');
  const mySeat = room.seats.find((s) => s.userId === actorId || s.guestId === actorId);
  const isHost = !!user && room.hostId === user.id;
  const aiCount = typeof room.config.aiCount === 'number' ? room.config.aiCount : 0;
  const seatLimit = Math.max(meta?.minPlayers ?? 2, Math.min(typeof room.config.maxPlayers === 'number' ? room.config.maxPlayers : meta?.maxPlayers ?? 8, meta?.maxPlayers ?? 8));
  const canStart = players.length >= (meta?.minPlayers ?? 2);

  return (
    <main className="page-container room-page max-w-4xl">
      <BackLink href={guest ? '/play' : '/family'} />
      <section className="room-hero" aria-labelledby="room-title">
        <div className="room-hero-main"><p className="room-hero-kicker">{meta?.name ?? room.game} <span>/</span> 房间 #{room.id.slice(-6).toUpperCase()}</p><h1 id="room-title">{room.title || `${meta?.name ?? '游戏'}牌桌`}</h1><p>{room.status === 'playing' ? (mySeat?.role === 'player' ? '牌局进行中，返回牌桌继续玩。' : '牌局进行中，新加入的玩家可以旁观。') : `等待玩家入座 · 至少 ${meta?.minPlayers ?? 2} 人可以开局`}</p><div className="room-hero-stats"><span className="room-hero-status"><span className="lobby-live-dot" />{room.status === 'playing' ? '正在进行' : '等待开局'}</span><span><Users className="size-4" />{players.length} / {seatLimit} 人</span>{room.hasPassword && <span><LockKeyhole className="size-4" />密码房间</span>}</div></div>
        <div className="room-hero-art" aria-hidden="true"><span>{room.game === 'blackjack' ? '21' : room.game === 'holdem' ? '♠' : '6'}</span><span>{room.game === 'blackjack' ? 'A' : room.game === 'holdem' ? '♥' : '♦'}</span></div>
      </section>

      {loadError && <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"><span>更新房间信息失败：{loadError}</span><Button size="sm" variant="outline" onClick={() => void load()}>重试</Button></div>}
      {busy && <div role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-matcha/10 px-4 py-3 text-sm text-matcha-deep"><Loader2 className="size-4 animate-spin" />{busyLabel}</div>}

      <Card className="room-panel">
        <CardHeader>
          <CardTitle className="text-lg">桌上玩家</CardTitle>
          <CardDescription>{players.length} 人入座{spectators.length > 0 && ` · ${spectators.length} 人旁观`}{aiCount > 0 && ` · ${aiCount} 个 AI（开发中）`}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5 pt-6">
          <div>
            <ul className="room-seat-grid" aria-label="房间座位">
              {room.seats.map((s) => (
                <li
                  key={s.seatIndex}
                  className={`room-seat ${s.userId === actorId || s.guestId === actorId ? 'is-mine' : ''}`}
                >
                  <Avatar emoji={s.avatar} name={s.nickname} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {s.nickname}
                      {(s.userId === actorId || s.guestId === actorId) && <span className="ml-1 text-xs text-muted-foreground">（你）</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.role === 'spectator' ? '旁观中' : s.ready ? '已准备' : '还没准备'}
                    </p>
                  </div>
                  {s.userId === room.hostId && (
                    <Badge variant="default">
                      <Crown className="size-3" />
                      房主
                    </Badge>
                  )}
                </li>
              ))}
              {room.status === 'waiting' && Array.from({ length: seatLimit }, (_, index) => index)
                .filter((index) => !players.some((seat) => seat.seatIndex === index))
                .map((index) => <li key={`empty-${index}`} className="room-seat room-seat-empty"><span className="room-seat-empty-icon">+</span><span>等待玩家入座</span></li>)}
            </ul>
          </div>

          {room.status === 'playing' && mySeat && (
            <div className="room-enter-action flex flex-col gap-2">
              <Button asChild variant="matcha" size="lg">
                <Link href={`/play/${room.game}?room=${room.id}`}>
                  <Play className="size-4" />
                  {mySeat.role === 'spectator' ? '进入牌桌旁观' : '返回牌桌继续玩'}
                </Link>
              </Button>
            </div>
          )}

          <div className="room-actions flex flex-col gap-2">
            {!mySeat && (
              <div className="room-join-box flex flex-col gap-3 rounded-xl border border-matcha/30 bg-matcha/5 p-4">
                <div><p className="font-semibold text-foreground">{room.status === 'playing' ? '加入房间旁观' : '加入这桌游戏'}</p><p className="mt-1 text-xs text-muted-foreground">{room.status === 'playing' ? '牌局已经开始，新加入的玩家只能旁观。' : '入座后等待房主开局，也可以选择旁观。'}</p></div>
                {room.hasPassword && (
                  <div className="grid gap-2">
                    <Label htmlFor="room-pwd" className="flex items-center gap-1.5"><LockKeyhole className="size-4" />此房间需要密码</Label>
                    <Input
                      id="room-pwd"
                      value={password}
                      type="password"
                      autoComplete="off"
                      maxLength={32}
                      placeholder="输入房间密码"
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                )}
                {room.status !== 'playing' && <Button
                  disabled={busy || (room.hasPassword && !password.trim())}
                  onClick={() => void act(() => api.joinRoom(token!, room.id, { role: 'player', password }), '正在加入房间…', '已入座').then((ok) => { if (ok) setPassword(''); })}
                >
                  <UserPlus className="size-4" />
                  坐下玩
                </Button>}
                <Button
                  variant={room.status === 'playing' ? 'matcha' : 'outline'}
                  disabled={busy || (room.hasPassword && !password.trim())}
                  onClick={() => void act(() => api.joinRoom(token!, room.id, { role: 'spectator', password }), '正在加入房间…', '已加入旁观').then((ok) => { if (ok) { setPassword(''); if (room.status === 'playing') router.push(`/play/${room.game}?room=${room.id}`); } })}
                >
                  <Users className="size-4" />
                  {room.status === 'playing' ? '验证并进入旁观' : '先旁观'}
                </Button>
              </div>
            )}

            {user && mySeat && mySeat.role === 'player' && room.status !== 'playing' && (
              <Button
                variant={mySeat.ready ? 'secondary' : 'default'}
                disabled={busy}
                onClick={() => void act(() => api.setReady(token!, room.id, !mySeat.ready), '正在更新准备状态…')}
              >
                {mySeat.ready ? '取消准备' : '我准备好了'}
              </Button>
            )}

            {isHost && room.status !== 'playing' && (
              <Button
                variant="matcha"
                disabled={busy || !canStart}
                onClick={() => void act(() => api.startRoom(token!, room.id), '正在启动牌局…', '牌局已开始').then((ok) => { if (ok) router.push(`/play/${room.game}?room=${room.id}`); })}
              >
                <Play className="size-4" />
                {canStart ? '开局' : `至少 ${meta?.minPlayers ?? 2} 人才能开局`}
              </Button>
            )}

            {mySeat && <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                const ok = await act(() => api.leaveRoom(token!, room.id), '正在离开房间…');
                if (ok) router.replace(guest ? '/play' : '/family');
              }}
            >
              离开房间
            </Button>}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function BackLink({ href = '/family' }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      回大厅
    </Link>
  );
}

export default function RoomPage() {
  return (
    <React.Suspense fallback={<Booting />}>
      <RoomHome />
    </React.Suspense>
  );
}
