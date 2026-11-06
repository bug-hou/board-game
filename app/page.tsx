'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
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
      <div className="mx-auto flex min-h-[70dvh] w-full max-w-lg flex-col items-center justify-center text-center">
        <p className="text-sm font-semibold text-matcha-deep">游戏夜</p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground">想玩，就开一桌。</h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">选个玩法，邀请朋友一起玩。</p>
        <div className="mt-8 grid w-full gap-3 sm:grid-cols-2"><Button asChild size="lg"><Link href="/login?mode=register">创建账号 <ArrowRight className="size-4" /></Link></Button><Button asChild size="lg" variant="outline"><Link href="/login">登录</Link></Button></div>
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
