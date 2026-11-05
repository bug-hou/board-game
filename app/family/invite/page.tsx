'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { GuestList } from '@/components/family/guest-list';
import { InvitePanel } from '@/components/family/invite-panel';
import { CopyField } from '@/components/copy-field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { FamilyDetail } from '@/lib/types';

function InviteHome() {
  const { token, user, families, loading, currentFamilyId } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const familyId = params.get('f') ?? currentFamilyId ?? families[0]?.id ?? null;
  const family = families.find((f) => f.id === familyId) ?? null;

  const [detail, setDetail] = React.useState<FamilyDetail | null>(null);
  const [origin, setOrigin] = React.useState('');

  React.useEffect(() => setOrigin(window.location.origin), []);

  const load = React.useCallback(async () => {
    if (!token || !familyId) return;
    try {
      setDetail(await api.familyDetail(token, familyId));
    } catch {
      setDetail(null);
    }
  }, [token, familyId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!familyId) router.replace('/welcome');
  }, [loading, user, familyId, router]);

  if (loading || !user || !token || !familyId) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-sm tracking-widest text-muted-foreground">正在准备…</p>
      </main>
    );
  }

  return (
    <AppShell family={family}>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-5 pb-24">
        <Link
          href="/family"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          回大厅
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">家庭成员邀请</CardTitle>
            <CardDescription>进来就是正式成员，会出现在成员表里</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-xs text-muted-foreground">家庭码</p>
              {family ? (
                <CopyField
                  value={family.code}
                  label="家庭码"
                  mono
                  className="justify-center py-3 font-code text-xl tracking-[0.35em]"
                />
              ) : (
                <div className="h-12 animate-pulse rounded-xl bg-secondary/60" />
              )}
            </div>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">邀请链接</p>
              <CopyField
                value={family ? `${origin}/join/${family.code}` : ''}
                label="邀请链接"
                mono
                className="text-xs"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">临时来玩的人</CardTitle>
            <CardDescription>
              分享链接进来，不算家庭成员，到期自动离开，房主也能随时请走
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <InvitePanel
              token={token}
              familyId={familyId}
              invites={detail?.invites ?? []}
              origin={origin}
              canManage
              onChanged={load}
            />
            <Separator />
            <GuestList
              token={token}
              familyId={familyId}
              guests={detail?.guests ?? []}
              canRemove={detail?.viewer.role === 'owner'}
              onChanged={load}
            />
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}

export default function InvitePage() {
  return (
    <React.Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <p className="text-sm tracking-widest text-muted-foreground">正在准备…</p>
        </main>
      }
    >
      <InviteHome />
    </React.Suspense>
  );
}
