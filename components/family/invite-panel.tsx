'use client';

import * as React from 'react';
import { Link2, Link2Off, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { CopyField } from '@/components/copy-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { timeLeft } from '@/lib/format';
import type { Invite } from '@/lib/types';
import { cn } from '@/lib/utils';

const TTL_OPTIONS = [
  { label: '1 小时', minutes: 60 },
  { label: '6 小时', minutes: 360 },
  { label: '1 天', minutes: 1440 },
  { label: '7 天', minutes: 10080 },
];

const USES_OPTIONS = [
  { label: '不限人数', value: 0 },
  { label: '1 人', value: 1 },
  { label: '3 人', value: 3 },
  { label: '10 人', value: 10 },
];

interface InvitePanelProps {
  token: string;
  familyId: string;
  invites: Invite[];
  origin: string;
  canManage: boolean;
  onChanged: () => void;
}

function ChoiceGroup<T extends number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg border px-3 py-1.5 text-xs transition-colors',
            value === o.value
              ? 'border-primary bg-primary/12 text-primary'
              : 'border-border bg-card text-muted-foreground hover:bg-secondary/60',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 临时邀请链接：生成、展示、撤销 */
export function InvitePanel({ token, familyId, invites, origin, canManage, onChanged }: InvitePanelProps) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState('');
  const [ttl, setTtl] = React.useState(1440);
  const [maxUses, setMaxUses] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [fresh, setFresh] = React.useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      const { invite } = await api.createInvite(token, familyId, {
        label: label.trim() || undefined,
        ttlMinutes: ttl,
        maxUses,
      });
      setFresh(`${origin}/guest/${invite.token}`);
      setOpen(false);
      setLabel('');
      toast.success('链接已生成，发给朋友吧');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (inviteToken: string) => {
    try {
      await api.revokeInvite(token, familyId, inviteToken);
      toast.success('链接已作废');
      if (fresh?.endsWith(inviteToken)) setFresh(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const active = invites.filter((i) => !i.revoked && i.expiresAt > Date.now());

  return (
    <div className="flex flex-col gap-4">
      {fresh && (
        <div className="rounded-xl border border-matcha/40 bg-matcha/8 p-4">
          <p className="text-sm font-medium text-matcha-deep">新链接已生成</p>
          <p className="mt-1 text-xs text-muted-foreground">
            发出去对方点开填个昵称就能一起玩，不会进家庭成员表
          </p>
          <CopyField value={fresh} label="邀请链接" className="mt-3 border-matcha/40 bg-card" mono />
        </div>
      )}

      {canManage && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="matcha" className="w-full">
              <Plus className="size-4" />
              生成临时邀请链接
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>喊个朋友来玩</DialogTitle>
              <DialogDescription>
                临时玩家不进家庭成员表，到期自动失效，你也可以随时作废
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-5 py-2">
              <div className="grid gap-2">
                <Label htmlFor="invite-label">备注（可不填）</Label>
                <Input
                  id="invite-label"
                  value={label}
                  maxLength={20}
                  placeholder="比如：给小周的"
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label>有效期</Label>
                <ChoiceGroup options={TTL_OPTIONS.map((o) => ({ label: o.label, value: o.minutes }))} value={ttl} onChange={setTtl} />
              </div>

              <div className="grid gap-2">
                <Label>最多能进几个人</Label>
                <ChoiceGroup options={USES_OPTIONS} value={maxUses} onChange={setMaxUses} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button onClick={generate} disabled={busy}>
                {busy ? '生成中…' : '生成链接'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {active.length > 0 && (
        <ul className="flex flex-col gap-2">
          {active.map((i) => (
            <li
              key={i.token}
              className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5"
            >
              <Link2 className="size-4 shrink-0 text-matcha-deep" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{i.label || '临时邀请链接'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {timeLeft(i.expiresAt)}后过期 · 已进 {i.usedCount}
                  {i.maxUses > 0 ? `/${i.maxUses}` : ''} 人
                </p>
              </div>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => revoke(i.token)}
                  aria-label="作废这个链接"
                >
                  <Link2Off className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {active.length === 0 && !fresh && (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-5 text-sm text-muted-foreground">
          <Badge variant="outline">暂无生效中的链接</Badge>
        </p>
      )}
    </div>
  );
}
