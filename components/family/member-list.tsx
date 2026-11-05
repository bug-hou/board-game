import { Crown } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import type { Member } from '@/lib/types';

/** 家庭成员表：只有这里出现的才是正式成员，临时访客另算 */
export function MemberList({ members, currentUserId }: { members: Member[]; currentUserId?: string }) {
  return (
    <ul className="divide-y divide-border/70">
      {members.map((m) => (
        <li key={m.id} className="flex items-center gap-3 py-3">
          <Avatar emoji={m.avatar} name={m.nickname} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{m.nickname}</p>
              {m.id === currentUserId && (
                <span className="text-xs text-muted-foreground">（你）</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(m.joinedAt)} 加入</p>
          </div>
          {m.role === 'owner' ? (
            <Badge variant="default">
              <Crown className="size-3" />
              房主
            </Badge>
          ) : (
            <Badge variant="outline">成员</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
