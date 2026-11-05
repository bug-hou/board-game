'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Crown, LogOut, RefreshCw, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { FamilyDetail } from '@/lib/types';

function MembersHome() {
  const { token, user, families, loading, currentFamilyId, refresh } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const familyId = params.get('f') ?? currentFamilyId ?? families[0]?.id ?? null;
  const family = families.find((f) => f.id === familyId) ?? null;

  const [detail, setDetail] = React.useState<FamilyDetail | null>(null);
  const [pending, setPending] = React.useState<
    null | { kind: 'remove' | 'transfer' | 'leave' | 'rotate'; userId?: string; nickname?: string }
  >(null);
  const [busy, setBusy] = React.useState(false);

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

  const confirm = async () => {
    if (!token || !familyId || !pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'remove' && pending.userId) {
        await api.removeMember(token, familyId, pending.userId);
        toast.success(`已把 ${pending.nickname} 移出家庭`);
      } else if (pending.kind === 'transfer' && pending.userId) {
        await api.transferOwner(token, familyId, pending.userId);
        toast.success(`房主已交给 ${pending.nickname}`);
      } else if (pending.kind === 'rotate') {
        const data = await api.rotateFamilyCode(token, familyId);
        toast.success(`新的家庭码是 ${data.code}`);
        await refresh();
      } else if (pending.kind === 'leave') {
        const data = await api.leaveFamily(token, familyId);
        toast.success(data.dissolved ? '家庭已解散' : '已退出这个家庭');
        await refresh();
        router.replace('/family');
        return;
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  if (loading || !user || !token || !familyId) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-sm tracking-widest text-muted-foreground">正在准备…</p>
      </main>
    );
  }

  const members = detail?.members ?? [];
  const isOwner = detail?.viewer.role === 'owner';

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
            <CardTitle className="text-base">家庭成员</CardTitle>
            <CardDescription>
              共 {members.length} 人
              {isOwner ? ' · 你可以移除成员和转让房主' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/70">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-3">
                  <Avatar emoji={m.avatar} name={m.nickname} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{m.nickname}</p>
                      {m.id === user.id && <span className="text-xs text-muted-foreground">（你）</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(m.joinedAt)} 加入</p>
                  </div>

                  {m.role === 'owner' ? (
                    <Badge variant="default">
                      <Crown className="size-3" />
                      房主
                    </Badge>
                  ) : (
                    isOwner && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-primary"
                          title="转让房主"
                          onClick={() =>
                            setPending({ kind: 'transfer', userId: m.id, nickname: m.nickname })
                          }
                        >
                          <Crown className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          title="移出家庭"
                          onClick={() =>
                            setPending({ kind: 'remove', userId: m.id, nickname: m.nickname })
                          }
                        >
                          <UserMinus className="size-4" />
                        </Button>
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">危险操作</CardTitle>
            <CardDescription>换家庭码会让旧码立刻失效，已经发出的链接不受影响</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {isOwner && (
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => setPending({ kind: 'rotate' })}
              >
                <RefreshCw className="size-4" />
                换一个新的家庭码
              </Button>
            )}
            <Button
              variant="outline"
              className="justify-start text-destructive hover:bg-destructive/10"
              onClick={() => setPending({ kind: 'leave' })}
            >
              <LogOut className="size-4" />
              {isOwner && members.length > 1 ? '退出家庭（房主会转给其他人）' : '退出家庭'}
            </Button>
          </CardContent>
        </Card>
      </main>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === 'remove' && `把 ${pending.nickname} 移出家庭？`}
              {pending?.kind === 'transfer' && `把房主交给 ${pending.nickname}？`}
              {pending?.kind === 'rotate' && '换一个新的家庭码？'}
              {pending?.kind === 'leave' && '退出这个家庭？'}
            </DialogTitle>
            <DialogDescription>
              {pending?.kind === 'remove' && '他会立刻看不到这个家庭的房间，需要重新用家庭码加入。'}
              {pending?.kind === 'transfer' && '转让后你就变成普通成员了，这一步没法撤回。'}
              {pending?.kind === 'rotate' && '旧的家庭码马上失效，记得把新的告诉家里人。'}
              {pending?.kind === 'leave' &&
                (isOwner && members.length > 1
                  ? '你是房主，退出后房主会自动交给最早加入的成员。'
                  : '退出后要用家庭码才能回来。')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              再想想
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={busy}>
              {busy ? '处理中…' : '确定'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default function MembersPage() {
  return (
    <React.Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <p className="text-sm tracking-widest text-muted-foreground">正在准备…</p>
        </main>
      }
    >
      <MembersHome />
    </React.Suspense>
  );
}
