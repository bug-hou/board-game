'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/lib/session';

function LoginContent() {
  const { user, families, loading, login, register } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = React.useState<'login' | 'register'>(params.get('mode') === 'register' ? 'register' : 'login');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const next = params.get('next');
  const destination = next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : null;

  React.useEffect(() => {
    if (!loading && user) router.replace(destination ?? (families.length ? '/family' : '/welcome'));
  }, [loading, user, families.length, destination, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'register' && password.length < 8) return toast.error('密码至少需要 8 位');
    setBusy(true);
    try {
      if (mode === 'register') await register(username, password, username.trim(), null);
      else await login(username, password);
      toast.success(mode === 'register' ? '账号创建好了' : '欢迎回来');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card px-7 py-10 shadow-[0_28px_100px_-48px_rgba(74,59,42,.5)] sm:px-10">
        <Link href="/" className="text-sm font-semibold text-matcha-deep">游戏夜</Link>
        <div className="mb-8 mt-9">
          <h1 className="text-3xl font-semibold tracking-tight">{mode === 'login' ? '登录' : '创建账号'}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{mode === 'login' ? '登录后继续游戏。' : '注册后就能创建房间、邀请朋友。'}</p>
        </div>
          <div className="mb-7 flex rounded-xl bg-secondary/60 p-1" role="tablist" aria-label="账号操作">
            {(['login', 'register'] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={mode === item}
                className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all ${mode === item ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setMode(item)}>{item === 'login' ? '登录' : '注册'}</button>
            ))}
          </div>
          <form onSubmit={submit} className="grid gap-5">
            <div className="grid gap-2"><Label htmlFor="username">用户名</Label><Input id="username" autoComplete="username" required minLength={3} maxLength={mode === 'register' ? 16 : 24} pattern={mode === 'register' ? '[a-zA-Z0-9_]{3,16}' : '[a-zA-Z0-9_]{3,24}'} value={username} onChange={(e) => setUsername(e.target.value)} placeholder={mode === 'register' ? '3–16 位字母、数字或下划线' : '用户名'} /></div>
            <div className="grid gap-2"><Label htmlFor="password">密码</Label><Input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" /></div>
            <Button size="lg" type="submit" disabled={busy} className="mt-2 w-full">{busy ? '请稍候…' : mode === 'login' ? '登录' : '创建账号'}<ArrowRight className="size-4" /></Button>
          </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <React.Suspense fallback={<main className="auth-screen min-h-dvh" />}><LoginContent /></React.Suspense>;
}
