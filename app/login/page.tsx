'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { AvatarPicker } from '@/components/avatar-picker';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/lib/session';

const MAX = 16;

export default function LoginPage() {
  const { user, families, loading, login } = useSession();
  const router = useRouter();
  const [nickname, setNickname] = React.useState('');
  const [avatar, setAvatar] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (loading || !user) return;
    router.replace(families.length ? '/family' : '/welcome');
  }, [loading, user, families.length, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!name) return toast.error('先给自己起个名字吧');
    if (name.length > MAX) return toast.error(`名字最多 ${MAX} 个字`);
    setBusy(true);
    try {
      const code = await login(name, avatar);
      if (code) {
        toast.success(`你的恢复码是 ${code}`, {
          description: '换手机或清缓存就靠它找回，记得截图存好',
          duration: 12_000,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          返回
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">你是谁呀</CardTitle>
            <CardDescription>填个家里人认得出的名字，选个头像就行，不用手机号</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={submit} className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-3">
                <Avatar emoji={avatar} name={nickname.trim() || '?'} size="lg" />
                <p className="text-xs text-muted-foreground">
                  {avatar ? '头像已选好' : '不选手也可以，默认用名字首字'}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="nickname">昵称</Label>
                <Input
                  id="nickname"
                  value={nickname}
                  maxLength={MAX}
                  autoFocus
                  placeholder="比如：妈妈、小妹、阿橙"
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label>选个头像</Label>
                <AvatarPicker value={avatar} onChange={setAvatar} />
              </div>

              <Button type="submit" size="lg" disabled={busy || !nickname.trim()} className="w-full">
                <Sparkles className="size-4" />
                {busy ? '正在进入…' : '进入'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
