'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock3, RotateCcw, Trophy } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { MatchRecord } from '@/lib/types';
import { GAMES, gameMeta } from '@/src/game/registry';

export default function HistoryPage() {
  const { token, user, families, currentFamilyId, loading } = useSession();
  const router = useRouter();
  const family = families.find((item) => item.id === currentFamilyId) ?? families[0];
  const [matches, setMatches] = React.useState<MatchRecord[]>([]);
  const [fetching, setFetching] = React.useState(true);
  const [error, setError] = React.useState('');
  const [more, setMore] = React.useState(false);
  const [filter, setFilter] = React.useState('all');
  const [mine, setMine] = React.useState(false);
  const [retry, setRetry] = React.useState(0);

  React.useEffect(() => {
    if (!loading && !user) router.replace('/login');
    else if (!loading && !family) router.replace('/welcome');
  }, [loading, user, family, router]);

  React.useEffect(() => {
    if (!token || !family) return;
    setFetching(true);
    let live = true;
    api.history(token, family.id).then(({ matches: items }) => {
      if (live) { setMatches(items); setMore(items.length === 20); setError(''); setFetching(false); }
    }).catch((err) => { if (live) { setMatches([]); setError(err instanceof Error ? err.message : '获取记录失败'); setFetching(false); } });
    return () => { live = false; };
  }, [token, family?.id, retry]);

  async function loadMore() {
    if (!token || !family || !matches.length) return;
    setFetching(true);
    try {
      const { matches: items } = await api.history(token, family.id, matches[matches.length - 1].playedAt);
      setMatches((previous) => [...previous, ...items]);
      setMore(items.length === 20);
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : '加载失败'); }
    finally { setFetching(false); }
  }

  if (loading || !user || !family) return <main className="flex min-h-dvh items-center justify-center">正在准备…</main>;
  const visible = matches.filter((item) => (filter === 'all' || item.game === filter) && (!mine || item.players.some((p) => p.userId === user.id)));
  const own = matches.filter((item) => item.players.some((p) => p.userId === user.id));
  const wins = own.filter((item) => item.players.some((p) => p.userId === user.id && p.winner)).length;

  return <AppShell family={family}><main className="page-container">
    <div className="page-heading"><p className="eyebrow">OUR LITTLE MOMENTS</p><h1>每一局，都值得记住。</h1><p>「{family.name}」的联机对局记录。新结束的牌局会自动出现在这里。</p></div>
    <div className="grid gap-4 sm:grid-cols-3"><div className="surface-card p-6"><Clock3 className="size-5 text-matcha-deep" /><p className="mt-5 text-3xl font-semibold">{matches.length}</p><p className="mt-1 text-sm text-muted-foreground">已加载的对局</p></div><div className="surface-card p-6"><Trophy className="size-5 text-primary" /><p className="mt-5 text-3xl font-semibold">{own.length}</p><p className="mt-1 text-sm text-muted-foreground">我参与的对局</p></div><div className="surface-card p-6"><span className="text-xl text-matcha-deep">✳</span><p className="mt-5 text-3xl font-semibold">{wins}</p><p className="mt-1 text-sm text-muted-foreground">我的获胜局数</p></div></div>
    <div className="mt-10 flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">MATCH HISTORY</p><h2 className="mt-1 text-xl font-semibold">历史记录</h2></div><button type="button" aria-pressed={mine} onClick={() => setMine(!mine)} className={`rounded-full border px-4 py-2 text-sm ${mine ? 'border-matcha bg-accent text-matcha-deep' : 'border-border bg-card text-muted-foreground'}`}>只看我的</button></div>
    <div className="mt-5 flex flex-wrap gap-2" aria-label="筛选玩法">{[{ id: 'all', name: '全部' }, ...GAMES].map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`rounded-full px-4 py-2 text-sm transition ${filter === item.id ? 'bg-matcha-deep text-white' : 'border border-border bg-card hover:bg-accent'}`}>{item.name}</button>)}</div>
    {error && <div role="alert" className="mt-5 flex items-center gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}<button type="button" onClick={() => { setFetching(true); setRetry((value) => value + 1); }} aria-label="重试"><RotateCcw className="size-4" /></button></div>}
    {visible.length ? <div className="mt-6 grid gap-3">{visible.map((item) => <article key={item.id} className="surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-xs font-medium text-matcha-deep">{gameMeta(item.game)?.emoji} {gameMeta(item.game)?.name ?? item.game} · 第 {item.roundNo} 局</span><h3 className="mt-2 font-semibold">{item.title || `${gameMeta(item.game)?.name ?? '游戏'}牌桌`}</h3><p className="mt-1 text-sm text-muted-foreground">{item.summary}</p></div><time dateTime={new Date(item.playedAt).toISOString()} className="text-xs text-muted-foreground">{new Date(item.playedAt).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div>
      <div className="mt-5 flex flex-wrap gap-2">{item.players.map((player, index) => <div key={`${player.userId ?? player.nickname}-${index}`} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${player.winner ? 'bg-accent text-matcha-deep' : 'bg-secondary/50 text-muted-foreground'}`}><Avatar emoji={player.avatar} name={player.nickname} size="sm" /><span>{player.nickname}</span>{player.winner && <Trophy className="size-3" />}{player.delta !== null && <span className="font-semibold">{player.delta > 0 ? '+' : ''}{player.delta}{item.game === 'six' ? ' 分' : ' 份'}</span>}</div>)}</div>
    </article>)}</div> : !fetching && !error && <div className="surface-card mt-6 flex flex-col items-center p-12 text-center"><span className="text-4xl">📖</span><h3 className="mt-4 font-semibold">{matches.length ? '没有符合筛选的对局' : '还没有对局记录'}</h3><p className="mt-2 text-sm text-muted-foreground">{matches.length ? '换个玩法或关闭“只看我的”试试。' : '完成第一局后，战绩会自动保存在这里。'}</p>{!matches.length && <Link href="/family" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-matcha-deep">去开一桌 <ArrowRight className="size-4" /></Link>}</div>}
    {more && <div className="mt-6 flex justify-center"><Button variant="outline" disabled={fetching} onClick={loadMore}>{fetching ? '加载中…' : '加载更早的记录'}</Button></div>}
  </main></AppShell>;
}
