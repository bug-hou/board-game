'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { CopyField } from '@/components/copy-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/lib/session';

export default function RecoveryPage() {
  const { user, loading, recoveryCode, recover } = useSession();
  const router = useRouter();
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return toast.error('把恢复码填进来');
    setBusy(true);
    try {
      await recover(code.trim());
      toast.success('身份找回来了');
      router.replace('/family');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '找回失败');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-sm tracking-widest text-muted-foreground">正在准备…</p>
      </main>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-5">
        <Link
          href="/family"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          回大厅
        </Link>

        {recoveryCode ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4 text-primary" />
                我的恢复码
              </CardTitle>
              <CardDescription>
                换手机或者清了缓存，就靠它把身份和家庭找回来。只显示这一次，记得截图存好。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CopyField
                value={recoveryCode}
                label="恢复码"
                mono
                className="justify-center py-3 font-code text-lg tracking-[0.3em]"
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">找回我的身份</CardTitle>
              <CardDescription>
                这台设备上没有恢复码（可能是在别的手机注册的），把当时保存的恢复码填进来
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="recovery">恢复码</Label>
                  <Input
                    id="recovery"
                    value={code}
                    autoCapitalize="characters"
                    placeholder="ABCD-EFGH"
                    className="font-code tracking-widest uppercase"
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                </div>
                <Button type="submit" disabled={busy || !code.trim()}>
                  {busy ? '找回中…' : '找回身份'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
    </AppShell>
  );
}
