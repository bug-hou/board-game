'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { GameMeta } from '@/src/game/registry';
import type { Room } from '@/lib/types';
import { cn } from '@/lib/utils';

interface CreateRoomDialogProps {
  token: string;
  familyId: string;
  game: GameMeta;
  onCreated: (room: Room) => void;
}

function ChoiceGroup({
  options,
  value,
  onChange,
}: {
  options: number[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            'size-9 rounded-lg border text-sm transition-colors',
            value === n
              ? 'border-primary bg-primary/12 text-primary'
              : 'border-border bg-card text-muted-foreground hover:bg-secondary/60',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** 开一间房：配置只放通用的，各游戏专属配置先置灰占位 */
export function CreateRoomDialog({ token, familyId, game, onCreated }: CreateRoomDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [maxPlayers, setMaxPlayers] = React.useState(Math.min(game.maxPlayers, 6));
  const [aiCount, setAiCount] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const { room } = await api.createRoom(token, {
        familyId,
        game: game.id,
        title: title.trim() || undefined,
        config: {
          ...(password.trim() ? { password: password.trim() } : {}),
          maxPlayers,
          aiCount,
        },
      });
      toast.success('房间开好了，喊人来吧');
      setOpen(false);
      setTitle('');
      setPassword('');
      onCreated(room);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建房间失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          开一间
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>开一间{game.name}</DialogTitle>
          <DialogDescription>
            {game.minPlayers} 人就能开局，最多 {game.maxPlayers} 人，家人可以旁观
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          <div className="grid gap-2">
            <Label htmlFor="room-title">房间名（可不填）</Label>
            <Input
              id="room-title"
              value={title}
              maxLength={20}
              placeholder="比如：饭后一把"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="room-password">密码（可不填）</Label>
            <Input
              id="room-password"
              value={password}
              maxLength={32}
              type="text"
              placeholder="留空就是谁都能进"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>最多几个人</Label>
            <ChoiceGroup
              options={Array.from({ length: game.maxPlayers - game.minPlayers + 1 }, (_, i) => game.minPlayers + i)}
              value={maxPlayers}
              onChange={setMaxPlayers}
            />
          </div>

          <div className="grid gap-2">
            <Label className="flex items-center gap-2">
              AI 补位
              <Badge variant="outline">默认 0</Badge>
            </Label>
            <ChoiceGroup options={[0, 1, 2, 3]} value={aiCount} onChange={setAiCount} />
            <p className="text-xs text-muted-foreground">
              只在开局前凑人数用，开局后座位就固定了。人齐了就别开，省得家里混进电脑玩家
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? '创建中…' : '开房间'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
