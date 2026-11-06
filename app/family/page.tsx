'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Clock3, LockKeyhole, Radio, ShieldCheck, UsersRound } from 'lucide-react';
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
  return <main className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">正在准备…</main>;
}

function FamilyHome() {
  const { token, user, families, loading, currentFamilyId, setCurrentFamilyId } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get('f');
  const family = families.find((item) => item.id === requested) ?? families.find((item) => item.id === currentFamilyId) ?? families[0] ?? null;

  React.useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!family) router.replace('/welcome');
  }, [loading, user, family, router]);

  React.useEffect(() => {
    if (requested && family?.id === requested && requested !== currentFamilyId) setCurrentFamilyId(requested);
  }, [requested, family?.id, currentFamilyId, setCurrentFamilyId]);

  if (loading || !user || !token || !family) return <Booting />;
  return <AppShell family={family}><FamilyBody token={token} familyId={family.id} familyName={family.name} /></AppShell>;
}

function FamilyBody({ token, familyId, familyName }: { token: string; familyId: string; familyName: string }) {
  const router = useRouter();
  const { families, user, hasCredentials } = useSession();
  const family = families.find((item) => item.id === familyId);
  const presence = usePresenceData();
  const [fallbackRooms, setFallbackRooms] = React.useState<RoomDetail[]>([]);
  const [origin, setOrigin] = React.useState('');
  const [roomFilter, setRoomFilter] = React.useState<'all' | 'waiting' | 'playing'>('all');

  React.useEffect(() => setOrigin(window.location.origin), []);
  React.useEffect(() => {
    let live = true;
    api.listRooms(token, familyId).then((data) => { if (live) setFallbackRooms(data.rooms); }).catch(() => { if (live) setFallbackRooms([]); });
    return () => { live = false; };
  }, [token, familyId]);

  const rooms = presence.connected ? presence.rooms : fallbackRooms;
  const activeRooms = rooms.filter((room) => room.familyId === familyId && room.status !== 'ended');
  const waitingRooms = activeRooms.filter((room) => room.status === 'waiting');
  const playingRooms = activeRooms.filter((room) => room.status === 'playing');
  const visibleRooms = roomFilter === 'waiting' ? waitingRooms : roomFilter === 'playing' ? playingRooms : [...waitingRooms, ...playingRooms];

  return <main className="page-container lobby-page">
    <section className="lobby-banner" aria-labelledby="lobby-title">
      <div className="lobby-banner-content">
        <p className="lobby-overline"><span className="lobby-overline-rule" />{familyName} · 游戏大厅</p>
        <h1 id="lobby-title">今晚，<span>开一桌。</span></h1>
        <p className="lobby-banner-copy">{user?.nickname}，选个玩法开一桌，或者加入已有牌桌。</p>
        <div className="lobby-banner-actions">
          <Link href="#tables" className="lobby-banner-primary">查看牌桌 <ArrowRight className="size-4" /></Link>
          <Link href="#games" className="lobby-banner-secondary">创建新牌局 <ArrowRight className="size-4" /></Link>
        </div>
      </div>
      <div className="lobby-banner-art" aria-hidden="true">
        <div className="lobby-art-orbit" />
        <div className="lobby-art-card lobby-art-card-back"><span>六张牌</span><strong>6</strong><span>♦</span></div>
        <div className="lobby-art-card lobby-art-card-front"><span>21 点</span><strong>A</strong><span>♠</span></div>
        <div className="lobby-art-caption">PLAY / TOGETHER</div>
      </div>
    </section>

    {!hasCredentials && <Link href="/family/account" className="lobby-account-notice"><ShieldCheck className="size-5 shrink-0" /><span className="flex-1">为旧身份设置账号密码，换设备也能继续使用。</span><ArrowRight className="size-4 shrink-0" /></Link>}

    <div className="lobby-layout">
      <div className="min-w-0 space-y-10">
        <section id="tables" className="scroll-mt-28" aria-labelledby="tables-title">
          <div className="lobby-section-heading">
            <div><p className="lobby-kicker">01 / 实时牌桌</p><h2 id="tables-title">当前牌桌 <span className="lobby-heading-count">{activeRooms.length.toString().padStart(2, '0')}</span></h2></div>
            <span className={`lobby-connection ${presence.connected ? 'is-online' : ''}`}><Radio className="size-3.5" />{presence.connected ? '实时更新' : '实时连接中'}</span>
          </div>
          <div className="lobby-filter" role="group" aria-label="筛选牌桌状态">
            {([['all', '全部', activeRooms.length], ['waiting', '等待开局', waitingRooms.length], ['playing', '进行中', playingRooms.length]] as const).map(([value, label, count]) =>
              <button key={value} type="button" className={`lobby-filter-button ${roomFilter === value ? 'is-active' : ''}`} aria-pressed={roomFilter === value} onClick={() => setRoomFilter(value)}>{label}<span>{count}</span></button>
            )}
          </div>
          {visibleRooms.length ? <div className="lobby-room-list">{visibleRooms.map((room) => <RoomCard key={room.id} room={room} userId={user?.id} />)}</div> :
            <div className="lobby-empty">
              <div className="lobby-empty-mark" aria-hidden="true"><span>♠</span><span>♦</span></div>
              <h3>{activeRooms.length ? '这个状态下还没有牌桌' : '牌桌空着，等你开场'}</h3>
              <p>{activeRooms.length ? '切换上方筛选，看看其他牌桌。' : '挑一种玩法，创建房间后邀请朋友入座。'}</p>
              {activeRooms.length ? <button type="button" onClick={() => setRoomFilter('all')} className="lobby-empty-action">查看全部牌桌 <ArrowRight className="size-4" /></button> : <Link href="#games" className="lobby-empty-action">选择玩法 <ArrowRight className="size-4" /></Link>}
            </div>}
        </section>

        <section id="games" className="scroll-mt-28" aria-labelledby="games-title">
          <div className="lobby-section-heading"><div><p className="lobby-kicker">02 / 新开一桌</p><h2 id="games-title">选择玩法</h2></div><span className="text-xs text-muted-foreground">{GAMES.length} 种玩法</span></div>
          <div className="lobby-game-grid">{GAMES.map((game) => {
            const gameRooms = waitingRooms.filter((room) => room.game === game.id).length;
            return <article key={game.id} className={`lobby-game-card lobby-game-${game.id}`}>
              <div className="lobby-game-top"><span className="lobby-game-mark" aria-hidden="true">{game.id === 'blackjack' ? '21' : game.id === 'holdem' ? '♠' : '6'}</span><span className="lobby-game-players"><UsersRound className="size-3.5" />{game.minPlayers}–{game.maxPlayers} 人</span></div>
              <h3>{game.name}</h3><p className="lobby-game-desc">{game.desc}</p>
              <div className="lobby-game-footer"><span>{gameRooms ? `${gameRooms} 桌等待开局` : '暂无候场牌桌'}</span><CreateRoomDialog token={token} familyId={familyId} game={game} onCreated={(room) => router.push(`/room/${room.id}`)} /></div>
            </article>;
          })}</div>
        </section>
      </div>
      <aside className="lobby-aside" aria-label="在线玩家与邀请">
        <section className="lobby-side-card"><div className="lobby-side-heading"><div><p className="lobby-kicker">在线状态</p><h2>在线玩家</h2></div><span className="lobby-online-count">{presence.connected ? `${presence.online.length} 在线` : '连接中'}</span></div>
          <div className="mt-5">{presence.connected ? <OnlineStrip online={presence.online} rooms={activeRooms} /> : <p className="lobby-presence-wait">正在连接，稍后显示在线玩家。</p>}</div>
        </section>
        {family && origin && <InviteCard family={family} origin={origin} />}
        <Link href="/family/history" className="lobby-history-link"><Clock3 className="size-4" />查看最近战绩 <ArrowRight className="ml-auto size-4" /></Link>
        <p className="lobby-side-note"><LockKeyhole className="size-3.5" />只有加入游戏组或受邀的玩家能进入牌局</p>
      </aside>
    </div>
  </main>;
}

export default function FamilyPage() {
  return <React.Suspense fallback={<Booting />}><FamilyHome /></React.Suspense>;
}
