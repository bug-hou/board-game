'use client';

import { Avatar } from '@/components/ui/avatar';
import { gameMeta } from '@/src/game/registry';
import type { PresenceEntry, Room } from '@/lib/types';

/** 谁在线、在玩什么：家庭首页顶部那一条 */
export function OnlineStrip({ online, rooms }: { online: PresenceEntry[]; rooms: Room[] }) {
  if (!online.length) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
目前没有其他玩家在线。创建房间后，邀请朋友加入吧。
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {online.map((p) => {
        const room = p.roomId ? rooms.find((r) => r.id === p.roomId) : null;
        const game = room ? gameMeta(room.game) : null;
        return (
          <div
            key={`${p.kind}-${p.id}`}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2"
          >
            <Avatar emoji={p.avatar} name={p.nickname} size="sm" />
            <div className="min-w-0">
              <p className="text-sm leading-tight font-medium">
                {p.nickname}
                {p.kind === 'guest' && <span className="ml-1 text-xs text-muted-foreground">临时</span>}
              </p>
              <p className="text-xs leading-tight text-muted-foreground">
                {game ? `在玩 ${game.name}` : '在线'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
