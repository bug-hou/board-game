'use client';

import Link from 'next/link';
import { ArrowUpRight, LockKeyhole, UsersRound } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import type { RoomDetail } from '@/lib/types';
import { gameMeta } from '@/src/game/registry';

/** 大厅牌桌入口：在点击前明确玩法、座位、权限及下一步。 */
export function RoomCard({ room, userId }: { room: RoomDetail; userId?: string }) {
  const players = room.seats.filter((seat) => seat.role === 'player').length;
  const spectators = room.seats.filter((seat) => seat.role === 'spectator').length;
  const host = room.seats.find((seat) => seat.userId === room.hostId);
  const max = typeof room.config.maxPlayers === 'number' ? room.config.maxPlayers : gameMeta(room.game)?.maxPlayers;
  const game = gameMeta(room.game);
  const isSeated = room.seats.some((seat) => seat.userId === userId && seat.role === 'player');
  const isPlaying = room.status === 'playing';
  const isFull = max !== undefined && players >= max;
  const action = isSeated ? (isPlaying ? '返回牌桌' : '返回房间') : isPlaying ? '查看牌局' : isFull ? '旁观牌桌' : '加入牌桌';

  return (
    <Link href={`/room/${room.id}`} className="lobby-room-card" aria-label={`${room.title || `${game?.name ?? '游戏'}牌桌`}，${game?.name ?? room.game}，${players}/${max ?? '?'} 人，${action}`}>
      <div className={`lobby-room-icon lobby-room-icon-${room.game}`} aria-hidden="true">{room.game === 'blackjack' ? '21' : room.game === 'holdem' ? '♠' : '6'}</div>
      <div className="lobby-room-main">
        <div className="lobby-room-title-line"><span className={`lobby-room-status ${isPlaying ? 'is-playing' : ''}`}><span className="lobby-status-dot" />{isPlaying ? '进行中' : '等待开局'}</span><span className="lobby-room-game">{game?.name ?? room.game}</span>{room.hasPassword && <span className="lobby-room-lock" title="需要房间密码"><LockKeyhole className="size-3.5" /><span className="sr-only">需要房间密码</span></span>}</div>
        <h3 className="lobby-room-title">{room.title || `${game?.name ?? '游戏'}牌桌`}</h3>
        <div className="lobby-room-details"><span className="lobby-room-host"><Avatar emoji={host?.avatar ?? null} name={host?.nickname ?? '?'} size="sm" />{host?.nickname ?? '房主'} 发起</span><span className="lobby-room-seats"><UsersRound className="size-3.5" />{players}/{max ?? '—'} 人{isFull && !isPlaying ? ' · 已满' : ''}</span>{spectators > 0 && <span>{spectators} 人旁观</span>}</div>
      </div>
      <span className="lobby-room-action">{action}<ArrowUpRight className="size-4" /></span>
    </Link>
  );
}
