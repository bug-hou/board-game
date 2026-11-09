'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, LogOut, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RoomCard } from '@/components/rooms/room-card';
import { api } from '@/lib/api';
import { readGuest, clearGuest } from '@/lib/guest';
import { useSession } from '@/lib/session';
import type { RoomDetail } from '@/lib/types';
import { usePresence } from '@/lib/use-presence';
import { cn } from '@/lib/utils';

const GAMES = [
  {
    key: 'blackjack' as const,
    title: '21 点',
    emoji: '🃏',
    desc: '比谁更接近 21 点，规则简单，长辈也能一把上手',
    href: '/play/blackjack',
  },
  {
    key: 'holdem' as const,
    title: '德州扑克',
    emoji: '🎴',
    desc: '两家底牌配五张公共牌，可以拉上几个电脑对手练手',
    href: '/play/holdem',
  },
];

function Lobby() {
  const router = useRouter();
  const { user, loading } = useSession();
  const [guest, setGuest] = React.useState<ReturnType<typeof readGuest>>(null);
  const [aiCount, setAiCount] = React.useState(3);
  const [guestRooms, setGuestRooms] = React.useState<RoomDetail[] | null>(null);
  const [roomsError, setRoomsError] = React.useState<string | null>(null);
  const presence = usePresence(!user ? guest?.token ?? null : null, guest?.familyId ?? null);

  // 读 guest 与判断跳不跳必须在同一个 effect 里：
  // 分成两个 effect 时，第二个 effect 仍读到本批次旧的 guest=null，会把访客误判成未登录
  React.useEffect(() => {
    const g = readGuest();
    setGuest(g);
    if (loading) return;
    if (!user && !g) router.replace('/login');
  }, [loading, user, router]);

  React.useEffect(() => {
    if (user || !guest?.familyId || !guest.token) return;
    let active = true;
    api.listRooms(guest.token, guest.familyId).then(({ rooms }) => {
      if (active) { setGuestRooms(rooms); setRoomsError(null); }
    }).catch((err: Error & { status?: number }) => {
      if (active) setRoomsError(err.status === 401 || err.status === 403 ? '邀请身份已失效，请联系房主重新邀请。' : err.message);
    });
    return () => { active = false; };
  }, [user, guest?.token, guest?.familyId]);

  if (loading || (!user && !guest)) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-sm tracking-widest text-muted-foreground">正在准备…</p>
      </main>
    );
  }

  const name = user?.nickname ?? guest?.nickname ?? '?';
  const emoji = user?.avatar ?? guest?.avatar ?? null;
  const liveRooms = presence.connected && presence.roomsReady;
  const roomsReady = liveRooms || guestRooms !== null;
  const rooms = (liveRooms ? presence.rooms : guestRooms ?? [])
    .filter((room) => room.familyId === guest?.familyId && room.status !== 'ended');

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <header className="flex items-center justify-between gap-4">
        {user ? (
          <Link
            href="/family"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            回家庭
          </Link>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              clearGuest();
              router.replace('/');
            }}
          >
            <LogOut className="size-4" />
            离开牌桌
          </button>
        )}

        <div className="flex items-center gap-2">
          <Avatar emoji={emoji} name={name} size="sm" />
          <span className="text-sm font-medium">{name}</span>
          {guest && !user && <Badge variant="matcha">临时玩家</Badge>}
        </div>
      </header>

      {!user ? <section className="mt-8" aria-labelledby="guest-rooms-title">
        <p className="lobby-kicker">PLAY TOGETHER</p><h1 id="guest-rooms-title" className="mt-2 text-2xl font-bold tracking-tight">加入一桌游戏</h1>
        <p className="mt-2 text-sm text-muted-foreground">{guest?.familyName} · 选择房间，密码房会在进入前提示输入密码。</p>
        <div className="mt-6">
          {!guest?.familyId ? <div className="lobby-empty">请重新打开邀请链接以继续加入房间。</div> :
            roomsError && !roomsReady ? <div role="alert" className="lobby-empty"><h2>房间加载失败</h2><p>{roomsError}</p><button type="button" className="lobby-empty-action" onClick={() => window.location.reload()}>重新加载</button></div> :
              !roomsReady ? <div className="lobby-empty" role="status"><Loader2 className="size-6 animate-spin text-matcha-deep" /><p>正在获取牌桌…</p></div> :
                rooms.length ? <div className="lobby-room-list">{rooms.map((room) => <RoomCard key={room.id} room={room} userId={guest?.id} />)}</div> :
                  <div className="lobby-empty"><h2>目前没有牌桌</h2><p>请让房主创建房间后再来看看。</p></div>}
        </div>
      </section> : <>
      <div className="mt-8">
        <h1 className="text-2xl font-bold tracking-tight">今晚玩点什么</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {user ? '输了的人要接受惩罚，具体惩罚由家里人现场定' : `你是「${guest?.familyName}」的临时玩家`}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {GAMES.map((g) => (
          <Card key={g.key}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="text-xl">{g.emoji}</span>
                {g.title}
              </CardTitle>
              <CardDescription>{g.desc}</CardDescription>
            </CardHeader>
            <CardContent>
              {g.key === 'holdem' && (
                <div className="mb-4">
                  <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3.5" />
                    几个电脑对手
                  </p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setAiCount(n)}
                        className={cn(
                          'size-9 rounded-lg border text-sm transition-colors',
                          aiCount === n
                            ? 'border-primary bg-primary/12 text-primary'
                            : 'border-border bg-card text-muted-foreground hover:bg-secondary/60',
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Button asChild size="lg" className="w-full">
                <Link href={g.key === 'holdem' ? `${g.href}?ai=${aiCount}` : g.href}>开始</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      </>}
    </main>
  );
}

export default function PlayPage() {
  return <Lobby />;
}
