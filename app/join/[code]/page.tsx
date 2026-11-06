'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, HousePlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const router = useRouter();
  const { user, token, loading, refresh, setCurrentFamilyId } = useSession();
  const [info, setInfo] = React.useState<{ name: string; memberCount: number } | null>(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!code) return;
    api.familyByCode(code).then(setInfo).catch((err) => setError(err instanceof Error ? err.message : '加入码无效'));
  }, [code]);

  async function join() {
    if (!token) return;
    setBusy(true);
    try {
      const { family } = await api.joinFamily(token, code);
      await refresh();
      setCurrentFamilyId(family.id);
      toast.success(`已加入 ${family.name}`);
      router.replace(`/family?f=${family.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加入失败');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-screen flex min-h-dvh items-center justify-center px-5 py-12">
    <Card className="w-full max-w-md"><CardHeader>
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent text-matcha-deep"><HousePlus className="size-7" /></div>
      <CardTitle className="text-2xl">{error ? '没有找到游戏组' : info ? `${info.name} 在等你` : '正在查找游戏组…'}</CardTitle>
      <CardDescription>{error || (info ? `已有 ${info.memberCount} 位成员 · 加入码 ${code}` : '请稍等片刻')}</CardDescription>
    </CardHeader><CardContent className="grid gap-3">
      {!error && !loading && info && (user ?
        <Button size="lg" disabled={busy} onClick={join}>{busy ? '加入中…' : `以 ${user.nickname} 的身份加入`}<ArrowRight className="size-4" /></Button> :
        <><Button asChild size="lg"><Link href={`/login?next=${encodeURIComponent(`/join/${code}`)}`}>登录后加入 <ArrowRight className="size-4" /></Link></Button>
        <Button asChild variant="outline"><Link href={`/login?mode=register&next=${encodeURIComponent(`/join/${code}`)}`}>还没有账号？先注册</Link></Button></>)}
      <Button asChild variant="ghost"><Link href="/">回到首页</Link></Button>
    </CardContent></Card>
  </main>;
}
