'use client';

import Link from 'next/link';
import { Crown, Lock, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { RoomDetail } from '@/lib/types';

/** 大厅里的房间卡：房主、人数、状态、有没有密码 */
export function RoomCard({ room }: { room: RoomDetail }) {
  const players = room.seats.filter((s) => s.role === 'player').length;
  const spectators = room.seats.filter((s) => s.role === 'spectator').length;
  const host = room.seats.find((s) => s.userId === room.hostId);
  const max = typeof room.config.maxPlayers === 'number' ? room.config.maxPlayers : undefined;
  const aiCount = typeof room.config.aiCount === 'number' ? room.config.aiCount : 0;

  return (
    <Link
      href={`/room/${room.id}`}
      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 transition-colors hover:bg-secondary/50"
    >
      <Avatar emoji={host?.avatar ?? null} name={host?.nickname ?? '?'} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{room.title || '牌桌'}</p>
          {room.hasPassword && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
          {room.status === 'playing' && <Badge variant="matcha">进行中</Badge>}
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Crown className="size-3" />
          {host?.nickname ?? '房主'}
          <span className="mx-1">·</span>
          <Users className="size-3" />
          {players}
          {max ? `/${max}` : ''} 人
          {aiCount > 0 && <span className="ml-1">（含 {aiCount} 个 AI）</span>}
          {spectators > 0 && <span className="ml-1">· {spectators} 人旁观</span>}
        </p>
      </div>

      <span className="shrink-0 text-xs text-primary">
        {room.status === 'playing' ? '看看' : '进去'}
      </span>
    </Link>
  );
}
