'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, HousePlus } from 'lucide-react';
import { toast } from 'sonner';
import { AvatarPicker } from '@/components/avatar-picker';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

/**
 * 家庭邀请链接落地页：/join/ABC123
 * 已登录一键加入，没登录就先起个名字再进。
 */
function JoinInner() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const router = useRouter();
  const { user, token, loading, login, refresh, setCurrentFamilyId } = useSession();

  const [info, setInfo] = React.useState<{ name: string; memberCount: number } | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [nickname, setNickname] = React.useState('');
  const [avatar, setAvatar] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!code) return;
    api.familyByCode(code).then(setInfo).catch(() => setNotFound(true));
  }, [code]);

  const doJoin = async (sessionToken: string) => {
    const { family } = await api.joinFamily(sessionToken, code);
    await refresh();
    setCurrentFamilyId(family.id);
    toast.success(`已加入 ${family.name}`);
    router.replace(`/family?f=${family.id}`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!name) return toast.error('先给自己起个名字吧');
    setBusy(true);
    try {
      await login(name, avatar);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '进入失败');
      setBusy(false);
      return;
    }
    // login 之后 token 会在下一次渲染更新，这里直接读 localStorage 更稳
    try {
      const saved = localStorage.getItem('fgn.token');
      if (saved) await doJoin(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加入失败');
    } finally {
      setBusy(false);
    }
  };

  const joinNow = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await doJoin(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加入失败');
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">这个家庭码没找到</CardTitle>
            <CardDescription>可能是输错了，或者家庭已经解散。找家人再要一次吧。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/">回到首页</Link>
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {info ? `加入「${info.name}」` : '加入家庭'}
          </CardTitle>
          <CardDescription>
            家庭码 <span className="font-code tracking-widest">{code}</span>
            {info ? ` · 现在有 ${info.memberCount} 位成员` : ''}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="h-24 animate-pulse rounded-xl bg-secondary/60" />
          ) : user ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-secondary/30 p-3">
                <Avatar emoji={user.avatar} name={user.nickname} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.nickname}</p>
                  <p className="text-xs text-muted-foreground">用这个身份加入</p>
                </div>
              </div>
              <Button size="lg" className="w-full" disabled={busy} onClick={joinNow}>
                <HousePlus className="size-4" />
                {busy ? '加入中…' : '加入这个家庭'}
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-5">
              <div className="flex flex-col items-center gap-2">
                <Avatar emoji={avatar} name={nickname.trim() || '?'} size="lg" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nickname">家人怎么称呼你</Label>
                <Input
                  id="nickname"
                  value={nickname}
                  maxLength={16}
                  placeholder="比如：小妹"
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>选个头像</Label>
                <AvatarPicker value={avatar} onChange={setAvatar} />
              </div>
              <Separator />
              <Button type="submit" size="lg" disabled={busy || !nickname.trim()}>
                {busy ? '正在加入…' : '起好名字，直接加入'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          返回
        </Link>
        {children}
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <React.Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <p className="text-sm tracking-widest text-muted-foreground">正在准备…</p>
        </main>
      }
    >
      <JoinInner />
    </React.Suspense>
  );
}
