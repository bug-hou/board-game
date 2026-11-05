'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Heart, Shuffle, Users } from 'lucide-react';
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
    <main className="auth-screen min-h-dvh px-6 py-12">
      <div className="mx-auto w-full max-w-lg text-center">
        <p className="eyebrow">A LITTLE CLOSER, EVERY NIGHT</p>
        <p className="mt-7 text-5xl">🕯️</p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground">远一点，也能玩在一起。</h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">家庭游戏夜 · 邀上家人，开一桌只属于你们的小游戏。</p>

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

        <div className="mt-8 grid gap-3 sm:grid-cols-2"><Button asChild size="lg"><Link href="/login?mode=register"><Heart className="size-4" />创建账号</Link></Button><Button asChild size="lg" variant="outline"><Link href="/login">已有账号，登录 <ArrowRight className="size-4" /></Link></Button></div>

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
