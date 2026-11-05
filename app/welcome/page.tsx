'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HousePlus, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

const MAX_NAME = 20;

function WelcomePage() {
  const { token, user, families, loading, refresh, setCurrentFamilyId } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const presetCode = (params.get('code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState(presetCode);
  const [busy, setBusy] = React.useState<'create' | 'join' | null>(null);

  React.useEffect(() => {
    if (!loading && !user) router.replace('/login');
    else if (!loading && families.length) router.replace('/family');
  }, [loading, user, families.length, router]);

  const go = (familyId: string) => {
    setCurrentFamilyId(familyId);
    router.replace('/family');
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const familyName = name.trim();
    if (!familyName) return toast.error('给家庭起个名字吧');
    if (familyName.length > MAX_NAME) return toast.error(`家庭名最多 ${MAX_NAME} 个字`);
    setBusy('create');
    try {
      const { family } = await api.createFamily(token, familyName);
      await refresh();
      go(family.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setBusy(null);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const normalized = code.trim().toUpperCase();
    if (normalized.length !== 6) return toast.error('家庭码是 6 位');
    setBusy('join');
    try {
      const { family } = await api.joinFamily(token, normalized);
      await refresh();
      go(family.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加入失败');
    } finally {
      setBusy(null);
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
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-4xl">🏡</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">{user.nickname}，先安个家</h1>
          <p className="mt-2 text-sm text-muted-foreground">创建一个家庭，或者用家人给的码加入</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HousePlus className="size-4 text-primary" />
              创建一个家庭
            </CardTitle>
            <CardDescription>创建后你会拿到一个 6 位家庭码和一个邀请链接</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={create} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="family-name">家庭名</Label>
                <Input
                  id="family-name"
                  value={name}
                  maxLength={MAX_NAME}
                  placeholder="比如：老陈家、我们仨"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy !== null || !name.trim()}>
                {busy === 'create' ? '创建中…' : '创建家庭'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="my-6 flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">或者</span>
          <Separator className="flex-1" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4 text-matcha-deep" />
              用家庭码加入
            </CardTitle>
            <CardDescription>家人把 6 位家庭码念给你听，输进来就行</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={join} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="family-code">家庭码</Label>
                <Input
                  id="family-code"
                  value={code}
                  maxLength={6}
                  autoCapitalize="characters"
                  placeholder="ABC123"
                  className="font-code h-14 text-center text-2xl tracking-[0.35em] uppercase"
                  onChange={(e) =>
                    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
                  }
                />
              </div>
              <Button type="submit" variant="matcha" disabled={busy !== null || code.length !== 6}>
                {busy === 'join' ? '加入中…' : '加入家庭'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function WelcomeRoute() {
  return (
    <React.Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <p className="text-sm tracking-widest text-muted-foreground">正在准备…</p>
        </main>
      }
    >
      <WelcomePage />
    </React.Suspense>
  );
}
