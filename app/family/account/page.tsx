'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function AccountPage() {
  const { token, user, loading, hasCredentials, refresh } = useSession();
  const router = useRouter();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    try {
      await api.setCredentials(token, username, password);
      await refresh();
      setPassword('');
      toast.success('账号设置好了，以后可用账号和密码登录');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '设置失败');
    } finally { setBusy(false); }
  }

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center">正在准备…</main>;
  return <AppShell><main className="page-container max-w-2xl">
    <div className="page-heading"><p className="eyebrow">ACCOUNT</p><h1>账号设置</h1><p>你的家庭和战绩都跟着账号走，换设备登录也不会丢。</p></div>
    <section className="surface-card p-7 sm:p-9"><div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-accent text-matcha-deep"><ShieldCheck className="size-6" /></div>
      <h2 className="text-xl font-semibold">{hasCredentials ? '账号已设置' : '为旧身份补设账号'}</h2>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{hasCredentials ? '你已可以用账号和密码在其他设备登录。' : '你之前使用的是免密身份。趁当前设备还在登录状态，为它设置账号和密码，以免换设备时无法登录。'}</p>
      {!hasCredentials && <form onSubmit={submit} className="mt-7 grid gap-5"><div className="grid gap-2"><Label htmlFor="username">登录账号</Label><Input id="username" required autoComplete="username" pattern="[a-zA-Z0-9_]{3,24}" minLength={3} maxLength={24} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3–24 位字母、数字或下划线" /></div>
        <div className="grid gap-2"><Label htmlFor="password">登录密码</Label><Input id="password" type="password" required autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" /></div><Button type="submit" disabled={busy}>{busy ? '保存中…' : '设置账号和密码'}</Button></form>}
    </section>
  </main></AppShell>;
}
