'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, Shuffle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';

function Booting() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="text-sm tracking-widest text-muted-foreground">正在准备…</p>
    </main>
  );
}

function Landing() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <p className="text-5xl">🕯️</p>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-foreground">家庭游戏夜</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          建一个只属于家人的小房间，
          <br />
          隔开几百公里也能凑一桌牌。
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/80 p-4 text-left">
            <Users className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">家庭码 · 只让自家人进来</p>
              <p className="mt-0.5 text-xs text-muted-foreground">6 位口令，报给家人就能加入</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/80 p-4 text-left">
            <Shuffle className="mt-0.5 size-5 shrink-0 text-matcha-deep" />
            <div>
              <p className="text-sm font-medium">分享链接 · 临时拉朋友来玩</p>
              <p className="mt-0.5 text-xs text-muted-foreground">设个有效期，过期自动作废</p>
            </div>
          </div>
        </div>

        <Button asChild size="lg" className="mt-8 w-full">
          <Link href="/login">
            <Heart className="size-4" />
            进入家庭游戏夜
          </Link>
        </Button>

        <p className="mt-4 text-xs text-muted-foreground">
          收到家人发来的邀请链接？直接点开就能玩，不用注册
        </p>
      </div>
    </main>
  );
}

export default function HomePage() {
  const { user, families, loading } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (loading || !user) return;
    router.replace(families.length ? '/family' : '/welcome');
  }, [loading, user, families.length, router]);

  if (loading || user) return <Booting />;
  return <Landing />;
}
