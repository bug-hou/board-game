import { db, newId } from './db';
import { roomById } from './store';

export interface MatchPlayer {
  userId: string | null;
  nickname: string;
  avatar: string | null;
  delta: number | null;
  winner: boolean;
}

export interface MatchRecord {
  id: string;
  familyId: string;
  roomId: string;
  game: string;
  roundNo: number;
  title: string | null;
  summary: string;
  players: MatchPlayer[];
  playedAt: number;
}

export function recordMatch(roomId: string, game: string, roundNo: number, summary: string,
  players: { actorId: string; nickname: string; delta: number | null; winner: boolean }[]): void {
  const room = roomById(roomId);
  if (!room || !players.length) return;
  const saved: MatchPlayer[] = players.map((player) => {
    const seat = room.seats.find((item) => item.userId === player.actorId || item.guestId === player.actorId);
    return { userId: seat?.userId ?? null, nickname: player.nickname, avatar: seat?.avatar ?? null,
      delta: player.delta, winner: player.winner };
  });
  try {
    db.prepare(`INSERT OR IGNORE INTO match_history
      (id, family_id, room_id, game, round_no, title, summary, players, played_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      newId('h'), room.familyId, roomId, game, roundNo, room.title, summary, JSON.stringify(saved), Date.now(),
    );
  } catch (error) {
    console.error('[history] 记录结算失败', error);
  }
}

export function listHistory(familyId: string, before: number, limit = 20): MatchRecord[] {
  const rows = db.prepare(`SELECT id, family_id, room_id, game, round_no, title, summary, players, played_at
    FROM match_history WHERE family_id = ? AND played_at < ? ORDER BY played_at DESC, id DESC LIMIT ?`)
    .all(familyId, before, limit) as {
      id: string; family_id: string; room_id: string; game: string; round_no: number;
      title: string | null; summary: string; players: string; played_at: number;
    }[];
  return rows.map((row) => ({ id: row.id, familyId: row.family_id, roomId: row.room_id,
    game: row.game, roundNo: row.round_no, title: row.title, summary: row.summary,
    players: JSON.parse(row.players) as MatchPlayer[], playedAt: row.played_at }));
}
