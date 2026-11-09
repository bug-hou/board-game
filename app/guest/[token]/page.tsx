'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Play } from 'lucide-react';
import { toast } from 'sonner';
import { AvatarPicker } from '@/components/avatar-picker';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { saveGuest } from '@/lib/guest';

/** 临时邀请链接落地页：填个昵称就能一起玩，不进家庭成员表 */
function GuestInner() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? '';
  const router = useRouter();

  const [info, setInfo] = React.useState<{ familyName: string | null } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [nickname, setNickname] = React.useState('');
  const [avatar, setAvatar] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!token) return;
    api
      .inviteInfo(token)
      .then((d) => setInfo({ familyName: d.family?.name ?? null }))
      .catch((err: Error) => setError(err.message));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!name) return toast.error('填个昵称吧，牌桌上好认人');
    setBusy(true);
    try {
      const data = await api.guestEnter(token, name, avatar);
      saveGuest({
        token: data.token,
        id: data.guest.id,
        familyId: data.family.id,
        nickname: data.guest.nickname,
        avatar: data.guest.avatar,
        familyName: data.family.name,
      });
      toast.success(`欢迎来玩，${name}`);
      router.replace('/play');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '进入失败');
    } finally {
      setBusy(false);
    }
  };

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

        <Card>
          <CardHeader>
            <p className="text-3xl">🎲</p>
            <CardTitle className="text-lg">
              {info?.familyName ? `「${info.familyName}」喊你来玩` : '有人喊你来玩'}
            </CardTitle>
            <CardDescription>
              临时加入一起玩，不会成为游戏组成员；链接到期自动失效
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error ? (
              <div className="flex flex-col gap-4">
                <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/">回到首页</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-5">
                <div className="flex flex-col items-center gap-2">
                  <Avatar emoji={avatar} name={nickname.trim() || '?'} size="lg" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="guest-nickname">大家怎么称呼你</Label>
                  <Input
                    id="guest-nickname"
                    value={nickname}
                    maxLength={16}
                    placeholder="比如：小周"
                    onChange={(e) => setNickname(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>选个头像</Label>
                  <AvatarPicker value={avatar} onChange={setAvatar} />
                </div>
                <Button type="submit" size="lg" disabled={busy || !nickname.trim()}>
                  <Play className="size-4" />
                  {busy ? '正在进入…' : '进入牌桌'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function GuestPage() {
  return (
    <React.Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <p className="text-sm tracking-widest text-muted-foreground">正在准备…</p>
        </main>
      }
    >
      <GuestInner />
    </React.Suspense>
  );
}
