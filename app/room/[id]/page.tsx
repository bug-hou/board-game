'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Crown, Play, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, usePresenceData } from '@/components/app-shell';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
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
  const router = useRouter();

  React.useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <Booting />;

  return (
    <AppShell>
      <RoomBody roomId={roomId} />
    </AppShell>
  );
}

function RoomBody({ roomId }: { roomId: string }) {
  const { token, user, currentFamilyId, setCurrentFamilyId } = useSession();
  const router = useRouter();
  const presence = usePresenceData();

  const [room, setRoom] = React.useState<RoomDetail | null>(null);
  const [missing, setMissing] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.roomDetail(token, roomId);
      setRoom(data.room);
      if (currentFamilyId !== data.room.familyId) setCurrentFamilyId(data.room.familyId);
      setMissing(false);
    } catch {
      setMissing(true);
    }
  }, [token, roomId, currentFamilyId, setCurrentFamilyId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!presence.connected) return;
    const updated = presence.rooms.find((item) => item.id === roomId);
    if (updated) setRoom(updated);
  }, [presence.connected, presence.rooms, roomId]);

  // 进出房间同步在线状态，家人能在大厅看到「在玩什么」
  React.useEffect(() => {
    if (!room) return;
    presence.enterRoom(room.id);
    return () => presence.leaveRoom();
    // 只在房间切换时进出，避免每次刷新重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  const act = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5">
        <BackLink />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">这个房间已经散了</CardTitle>
            <CardDescription>可能人都走光了，回大厅看看还有谁开着</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/family">回大厅</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5">
        <BackLink />
        <div className="h-40 animate-pulse rounded-2xl bg-secondary/60" />
      </main>
    );
  }

  const meta = gameMeta(room.game);
  const players = room.seats.filter((s) => s.role === 'player');
  const spectators = room.seats.filter((s) => s.role === 'spectator');
  const mySeat = room.seats.find((s) => s.userId === user?.id);
  const isHost = room.hostId === user?.id;
  const aiCount = typeof room.config.aiCount === 'number' ? room.config.aiCount : 0;
  const canStart = players.length >= (meta?.minPlayers ?? 2);

  return (
    <main className="page-container max-w-3xl">
      <BackLink />
      <div className="page-heading mt-6"><p className="eyebrow">TABLE ROOM</p><h1>{room.title || `${meta?.name ?? '游戏'}牌桌`}</h1><p>{room.status === 'playing' ? '牌局进行中，可以进入牌桌一起玩或旁观。' : `等待玩家入座 · 至少 ${meta?.minPlayers ?? 2} 人可以开局`}</p></div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="text-lg">{meta?.emoji ?? '🎲'}</span>
            {room.title || meta?.name || '牌桌'}
          </CardTitle>
          <CardDescription>
            {meta?.name ?? room.game} · {players.length} /
            {typeof room.config.maxPlayers === 'number' ? room.config.maxPlayers : meta?.maxPlayers} 人
            {aiCount > 0 && ` · 含 ${aiCount} 个 AI（开发中）`}
            {room.status === 'playing' && ' · 牌局进行中，只能旁观'}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              座位（{players.length}）{spectators.length > 0 && ` · 旁观 ${spectators.length}`}
            </p>
            <ul className="flex flex-col gap-2">
              {room.seats.map((s) => (
                <li
                  key={s.seatIndex}
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2"
                >
                  <Avatar emoji={s.avatar} name={s.nickname} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {s.nickname}
                      {s.userId === user?.id && <span className="ml-1 text-xs text-muted-foreground">（你）</span>}
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
            </ul>
          </div>

          {room.status === 'playing' && (
            <div className="flex flex-col gap-2">
              <Button asChild variant="matcha" size="lg">
                <Link href={`/play/${room.game}?room=${room.id}`}>
                  <Play className="size-4" />
                  进入牌桌
                </Link>
              </Button>
              <p className="rounded-xl bg-matcha/10 px-4 py-2 text-xs text-matcha-deep">
                邀请朋友进入房间，就能一起玩这一桌。
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {!mySeat && room.status !== 'playing' && (
              <>
                {room.hasPassword && (
                  <div className="grid gap-2">
                    <Label htmlFor="room-pwd">房间密码</Label>
                    <Input
                      id="room-pwd"
                      value={password}
                      placeholder="问房主要"
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                )}
                <Button
                  disabled={busy}
                  onClick={() =>
                    act(() => api.joinRoom(token!, room.id, { role: 'player', password }), '坐下了')
                  }
                >
                  <UserPlus className="size-4" />
                  坐下玩
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    act(() => api.joinRoom(token!, room.id, { role: 'spectator', password }), '进来旁观')
                  }
                >
                  <Users className="size-4" />
                  先旁观
                </Button>
              </>
            )}

            {mySeat && mySeat.role === 'player' && room.status !== 'playing' && (
              <Button
                variant={mySeat.ready ? 'secondary' : 'default'}
                disabled={busy}
                onClick={() => act(() => api.setReady(token!, room.id, !mySeat.ready))}
              >
                {mySeat.ready ? '取消准备' : '我准备好了'}
              </Button>
            )}

            {isHost && room.status !== 'playing' && (
              <Button
                variant="matcha"
                disabled={busy || !canStart}
                onClick={() => act(() => api.startRoom(token!, room.id), '开局！')}
              >
                <Play className="size-4" />
                {canStart ? '开局' : `至少 ${meta?.minPlayers ?? 2} 人才能开局`}
              </Button>
            )}

            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                await act(() => api.leaveRoom(token!, room.id));
                router.replace('/family');
              }}
            >
              离开房间
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/family"
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
