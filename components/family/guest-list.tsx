'use client';

import * as React from 'react';
import { UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { timeLeft } from '@/lib/format';
import type { Guest } from '@/lib/types';

interface GuestListProps {
  token: string;
  familyId: string;
  guests: Guest[];
  canRemove: boolean;
  onChanged: () => void;
}

/** 临时访客：不占家庭成员名额，到期自动消失，房主可随时请走 */
export function GuestList({ token, familyId, guests, canRemove, onChanged }: GuestListProps) {
  const [removing, setRemoving] = React.useState<string | null>(null);

  const remove = async (g: Guest) => {
    setRemoving(g.id);
    try {
      await api.removeGuest(token, familyId, g.id);
      toast.success(`已请走 ${g.nickname}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '移除失败');
    } finally {
      setRemoving(null);
    }
  };

  if (!guests.length) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        暂时没有临时玩家，需要时用上面的链接喊人来玩
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/70">
      {guests.map((g) => (
        <li key={g.id} className="flex items-center gap-3 py-3">
          <Avatar emoji={g.avatar} name={g.nickname} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{g.nickname}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">还剩 {timeLeft(g.expiresAt)}</p>
          </div>
          <Badge variant="matcha">临时</Badge>
          {canRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              disabled={removing === g.id}
              onClick={() => remove(g)}
              aria-label={`移除访客 ${g.nickname}`}
            >
              <UserMinus className="size-4" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
