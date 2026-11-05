'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, LockKeyhole, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { AvatarPicker } from '@/components/avatar-picker';
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
  const [nickname, setNickname] = React.useState('');
  const [avatar, setAvatar] = React.useState<string | null>(null);
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
      if (mode === 'register') await register(username, password, nickname, avatar);
      else await login(username, password);
      toast.success(mode === 'register' ? '账号创建好了' : '欢迎回来');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen min-h-dvh px-5 py-10">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-4xl border border-border bg-card shadow-[0_28px_100px_-48px_rgba(74,59,42,.5)] md:min-h-160 md:grid-cols-2">
        <div className="relative flex flex-col justify-between overflow-hidden bg-[#e5ebdb] p-8 md:p-12">
          <div className="relative z-10">
            <Link href="/" className="text-sm font-bold tracking-[.16em] text-matcha-deep">GOOD EVENING · 家庭游戏夜</Link>
            <h1 className="mt-16 max-w-sm text-4xl font-semibold leading-[1.3] tracking-tight text-[#304e3c] md:mt-24 md:text-5xl">隔着屏幕，<br />也能坐在同一桌。</h1>
            <p className="mt-5 max-w-xs text-sm leading-7 text-[#637665]">一个账号，记住家人、房间和每次相聚。今晚，从这里开始。</p>
          </div>
          <div className="relative z-10 mt-14 flex items-center gap-3 text-sm text-[#4e6854]"><UsersRound className="size-5" /> 只属于你们的小天地</div>
          <div aria-hidden className="absolute -bottom-24 -right-24 size-80 rounded-full border-40 border-white/30" />
        </div>
        <div className="flex flex-col justify-center px-7 py-12 sm:px-12">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">WELCOME HOME</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">{mode === 'login' ? '欢迎回来' : '加入游戏夜'}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{mode === 'login' ? '登录后直接回到你的家庭。' : '注册一个账号，和家人随时凑一桌。'}</p>
          </div>
          <div className="mb-7 flex rounded-xl bg-secondary/60 p-1" role="tablist" aria-label="账号操作">
            {(['login', 'register'] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={mode === item}
                className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all ${mode === item ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setMode(item)}>{item === 'login' ? '登录' : '注册'}</button>
            ))}
          </div>
          <form onSubmit={submit} className="grid gap-5">
            <div className="grid gap-2"><Label htmlFor="username">账号</Label><Input id="username" autoComplete="username" required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]{3,24}" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="字母、数字或下划线" /></div>
            <div className="grid gap-2"><Label htmlFor="password">密码</Label><Input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" /></div>
            {mode === 'register' && <>
              <div className="grid gap-2"><Label htmlFor="nickname">家人怎么称呼你</Label><Input id="nickname" autoComplete="nickname" required maxLength={16} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="比如：小妹、妈妈" /></div>
              <div className="grid gap-2"><Label>选个头像 · 可选</Label><AvatarPicker value={avatar} onChange={setAvatar} /></div>
            </>}
            <Button size="lg" type="submit" disabled={busy} className="mt-2 w-full">{busy ? '请稍候…' : mode === 'login' ? '登录，回到家' : '创建账号'}<ArrowRight className="size-4" /></Button>
          </form>
          <p className="mt-7 flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-4" />密码只用于登录，不需要手机号。</p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <React.Suspense fallback={<main className="auth-screen min-h-dvh" />}><LoginContent /></React.Suspense>;
}
