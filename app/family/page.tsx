'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users } from 'lucide-react';
import { AppShell, usePresenceData } from '@/components/app-shell';
import { InviteCard } from '@/components/family/invite-card';
import { OnlineStrip } from '@/components/family/online-strip';
import { CreateRoomDialog } from '@/components/rooms/create-room-dialog';
import { RoomCard } from '@/components/rooms/room-card';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { RoomDetail } from '@/lib/types';
import { GAMES } from '@/src/game/registry';

function Booting() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="text-sm tracking-widest text-muted-foreground">正在准备…</p>
    </main>
  );
}

function FamilyHome() {
  const { token, user, families, loading, currentFamilyId } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const familyId = params.get('f') ?? currentFamilyId ?? families[0]?.id ?? null;
  const family = families.find((f) => f.id === familyId) ?? null;

  React.useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!familyId) router.replace('/welcome');
  }, [loading, user, familyId, router]);

  if (loading || !user || !token || !familyId) return <Booting />;

  // 内容必须放在 AppShell 里，在线状态的 context 由它提供
  return (
    <AppShell family={family}>
      <FamilyBody token={token} familyId={familyId} />
    </AppShell>
  );
}

function FamilyBody({ token, familyId }: { token: string; familyId: string }) {
  const router = useRouter();
  const { families } = useSession();
  const family = families.find((f) => f.id === familyId) ?? null;
  const presence = usePresenceData();
  const [fallbackRooms, setFallbackRooms] = React.useState<RoomDetail[]>([]);
  const [origin, setOrigin] = React.useState('');

  React.useEffect(() => setOrigin(window.location.origin), []);

  // WS 推送是主通道，这里补一次初始拉取，避免首屏空白
  React.useEffect(() => {
    if (!token || !familyId) return;
    api
      .listRooms(token, familyId)
      .then((d) => setFallbackRooms(d.rooms))
      .catch(() => setFallbackRooms([]));
  }, [token, familyId]);

  const rooms = presence.rooms.length ? presence.rooms : fallbackRooms;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-5 pb-24">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">现在谁在</h2>
          <OnlineStrip online={presence.online} rooms={rooms} />
        </section>

        {GAMES.map((game) => {
          const gameRooms = rooms.filter((r) => r.game === game.id && r.status !== 'ended');
          return (
            <section key={game.id}>
              <div className="mb-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <span className="text-lg">{game.emoji}</span>
                    {game.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {game.desc} · {game.minPlayers}～{game.maxPlayers} 人
                  </p>
                </div>
                {family && (
                  <CreateRoomDialog
                    token={token}
                    familyId={family.id}
                    game={game}
                    onCreated={(room) => router.push(`/room/${room.id}`)}
                  />
                )}
              </div>

              {gameRooms.length ? (
                <div className="flex flex-col gap-2">
                  {gameRooms.map((room) => (
                    <RoomCard key={room.id} room={room} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-sm text-muted-foreground">
                  还没有人开{game.name}的房间
                </p>
              )}
            </section>
          );
        })}

        {family && origin && <InviteCard family={family} origin={origin} />}

        <Link
          href="/family/members"
          className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-4 py-3 text-sm transition-colors hover:bg-secondary/50"
        >
          <Users className="size-4 text-muted-foreground" />
          家庭成员管理
        </Link>
    </main>
  );
}

export default function FamilyPage() {
  return (
    <React.Suspense fallback={<Booting />}>
      <FamilyHome />
    </React.Suspense>
  );
}
