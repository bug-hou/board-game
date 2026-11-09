/**
 * 家庭体系的数据访问层：用户、家庭、成员、邀请链接、临时访客。
 *
 * 规则要点：
 * - 家庭成员与访客是两套身份，访客永远不写 members 表；
 * - 邀请链接有过期时间、可用次数上限、可撤销；
 * - 访客有过期时间，房主可随时移除。
 */
import { db, newId, randomFamilyCode, randomToken } from './db';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { gameMeta, isGameId } from '../../src/game/registry';

export type RoomStatus = 'waiting' | 'playing' | 'ended';

export interface Room {
  id: string;
  familyId: string;
  game: string;
  hostId: string;
  title: string | null;
  status: RoomStatus;
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Seat {
  seatIndex: number;
  userId: string | null;
  guestId: string | null;
  nickname: string;
  avatar: string | null;
  role: 'player' | 'spectator';
  ready: boolean;
  joinedAt: number;
}

export interface RoomDetail extends Room {
  seats: Seat[];
}

/** 统一的行动者：家庭成员和临时访客都能坐进房间 */
export interface Actor {
  kind: 'user' | 'guest';
  id: string;
  nickname: string;
  avatar: string | null;
}

export interface User {
  id: string;
  nickname: string;
  avatar: string | null;
}

export interface Family {
  id: string;
  name: string;
  code: string;
  ownerId: string;
  createdAt: number;
}

export interface Member extends User {
  role: 'owner' | 'member';
  joinedAt: number;
}

export interface Invite {
  token: string;
  familyId: string;
  label: string | null;
  expiresAt: number;
  maxUses: number;
  usedCount: number;
  revoked: boolean;
  createdAt: number;
}

export interface Guest {
  id: string;
  familyId: string;
  nickname: string;
  avatar: string | null;
  createdAt: number;
  expiresAt: number;
}

export const MAX_NICKNAME = 16;
export const MAX_FAMILY_NAME = 20;
export const DEFAULT_INVITE_TTL_MIN = 60 * 24; // 默认 24 小时

/** 昵称去空白、限长，空则拒绝 */
export function normalizeNickname(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!s || s.length > MAX_NICKNAME) return null;
  return s;
}

export function normalizeFamilyName(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!s || s.length > MAX_FAMILY_NAME) return null;
  return s;
}

/** emoji 只取前几个码点，防止塞进一堆垃圾字符 */
export function normalizeAvatar(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = [...raw.trim()].slice(0, 4).join('');
  return s || null;
}

/* ---------------- 用户与会话 ---------------- */

export function normalizeUsername(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return /^[a-z0-9_]{3,24}$/.test(value) ? value : null;
}

export function validPassword(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length >= 8 && Buffer.byteLength(raw, 'utf8') <= 128;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function createUser(username: string, password: string, nickname: string, avatar: string | null): User {
  const user: User = { id: newId('u'), nickname, avatar };
  db.prepare('INSERT INTO users (id, username, password_hash, nickname, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(user.id, username, hashPassword(password), nickname, avatar, Date.now());
  return user;
}

export function userByCredentials(username: string, password: string): User | null {
  const row = db.prepare('SELECT id, nickname, avatar, password_hash FROM users WHERE username = ?')
    .get(username) as (User & { password_hash: string }) | undefined;
  if (!row) return null;
  const [salt, expected] = row.password_hash.split(':');
  const actual = scryptSync(password, salt, 64);
  const stored = Buffer.from(expected, 'hex');
  if (stored.length !== actual.length || !timingSafeEqual(stored, actual)) return null;
  return { id: row.id, nickname: row.nickname, avatar: row.avatar };
}

export function hasCredentials(userId: string): boolean {
  const row = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string | null } | undefined;
  return !!row?.username;
}

export function setCredentials(userId: string, username: string, password: string): void {
  db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ? AND username IS NULL')
    .run(username, hashPassword(password), userId);
}

export function revokeSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function updateUser(userId: string, nickname: string, avatar: string | null): void {
  db.prepare('UPDATE users SET nickname = ?, avatar = ? WHERE id = ?').run(nickname, avatar, userId);
}

export function createSession(userId: string): string {
  const token = randomToken();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    Date.now(),
  );
  return token;
}

export function userBySession(token: string): User | null {
  const row = db
    .prepare('SELECT u.id, u.nickname, u.avatar FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?')
    .get(token) as User | undefined;
  return row ?? null;
}

/* ---------------- 家庭 ---------------- */

function rowToFamily(r: {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  created_at: number;
}): Family {
  return { id: r.id, name: r.name, code: r.code, ownerId: r.owner_id, createdAt: r.created_at };
}

export function createFamily(userId: string, name: string): Family {
  const insert = db.prepare(
    'INSERT INTO families (id, name, code, owner_id, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const addMember = db.prepare(
    'INSERT INTO members (family_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
  );
  // 家庭码唯一索引可能撞号，重试几次
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const family: Family = {
      id: newId('f'),
      name,
      code: randomFamilyCode(),
      ownerId: userId,
      createdAt: Date.now(),
    };
    try {
      db.transaction(() => {
        insert.run(family.id, family.name, family.code, family.ownerId, family.createdAt);
        addMember.run(family.id, userId, 'owner', family.createdAt);
      })();
      return family;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('UNIQUE')) throw err;
    }
  }
  throw new Error('家庭码生成失败，请重试');
}

export function familyById(familyId: string): Family | null {
  const r = db.prepare('SELECT * FROM families WHERE id = ?').get(familyId) as
    | Parameters<typeof rowToFamily>[0]
    | undefined;
  return r ? rowToFamily(r) : null;
}

export function familyByCode(code: string): Family | null {
  const r = db.prepare('SELECT * FROM families WHERE code = ?').get(code) as
    | Parameters<typeof rowToFamily>[0]
    | undefined;
  return r ? rowToFamily(r) : null;
}

export function familiesOfUser(userId: string): Family[] {
  const rows = db
    .prepare(
      `SELECT f.* FROM families f
       JOIN members m ON m.family_id = f.id
       WHERE m.user_id = ?
       ORDER BY f.created_at DESC`,
    )
    .all(userId) as Parameters<typeof rowToFamily>[0][];
  return rows.map(rowToFamily);
}

export function isMember(familyId: string, userId: string): boolean {
  const r = db
    .prepare('SELECT 1 AS ok FROM members WHERE family_id = ? AND user_id = ?')
    .get(familyId, userId) as { ok: number } | undefined;
  return !!r;
}

export function memberRole(familyId: string, userId: string): 'owner' | 'member' | null {
  const r = db
    .prepare('SELECT role FROM members WHERE family_id = ? AND user_id = ?')
    .get(familyId, userId) as { role: 'owner' | 'member' } | undefined;
  return r?.role ?? null;
}

/** 用家庭码加入，已是成员则幂等返回 */
export function joinFamilyByCode(userId: string, code: string): Family | null {
  const family = familyByCode(code);
  if (!family) return null;
  db.prepare(
    'INSERT OR IGNORE INTO members (family_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
  ).run(family.id, userId, 'member', Date.now());
  return family;
}

export function listMembers(familyId: string): Member[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.nickname, u.avatar, m.role, m.joined_at
       FROM members m JOIN users u ON u.id = m.user_id
       WHERE m.family_id = ?
       ORDER BY (m.role = 'owner') DESC, m.joined_at ASC`,
    )
    .all(familyId) as { id: string; nickname: string; avatar: string | null; role: 'owner' | 'member'; joined_at: number }[];
  return rows.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    avatar: r.avatar,
    role: r.role,
    joinedAt: r.joined_at,
  }));
}

export function countMembers(familyId: string): number {
  const r = db.prepare('SELECT COUNT(*) AS c FROM members WHERE family_id = ?').get(familyId) as {
    c: number;
  };
  return r.c;
}

/* ---------------- 成员管理 ---------------- */

/** 房主移除成员，房主自己不能被移除（要先转让） */
export function removeMember(familyId: string, userId: string): boolean {
  const res = db
    .prepare("DELETE FROM members WHERE family_id = ? AND user_id = ? AND role != 'owner'")
    .run(familyId, userId);
  return res.changes > 0;
}

export function transferOwner(familyId: string, toUserId: string): boolean {
  if (!isMember(familyId, toUserId)) return false;
  db.transaction(() => {
    db.prepare("UPDATE members SET role = 'member' WHERE family_id = ? AND role = 'owner'").run(familyId);
    db.prepare("UPDATE members SET role = 'owner' WHERE family_id = ? AND user_id = ?").run(familyId, toUserId);
    db.prepare('UPDATE families SET owner_id = ? WHERE id = ?').run(toUserId, familyId);
  })();
  return true;
}

export type LeaveResult =
  | { ok: true; dissolved: boolean }
  | { ok: false; reason: string };

export function leaveFamily(familyId: string, userId: string): LeaveResult {
  const role = memberRole(familyId, userId);
  if (!role) return { ok: false, reason: '你不是这个家庭的成员' };

  const members = listMembers(familyId);
  if (members.length <= 1) {
    // 最后一个人退出就直接解散，别留下空壳家庭
    db.transaction(() => {
      db.prepare('DELETE FROM members WHERE family_id = ?').run(familyId);
      db.prepare('DELETE FROM families WHERE id = ?').run(familyId);
    })();
    return { ok: true, dissolved: true };
  }

  if (role === 'owner') {
    const heir = members.find((m) => m.id !== userId);
    if (!heir) return { ok: false, reason: '找不到可以接手的人' };
    transferOwner(familyId, heir.id);
  }
  db.prepare('DELETE FROM members WHERE family_id = ? AND user_id = ?').run(familyId, userId);
  return { ok: true, dissolved: false };
}

/** 家庭码泄露了就换一个 */
export function rotateFamilyCode(familyId: string): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomFamilyCode();
    try {
      const res = db.prepare('UPDATE families SET code = ? WHERE id = ?').run(code, familyId);
      if (res.changes > 0) return code;
    } catch (err) {
      if (!String(err).includes('UNIQUE')) throw err;
    }
  }
  throw new Error('家庭码生成失败，请重试');
}

/* ---------------- 邀请链接 ---------------- */

function rowToInvite(r: {
  token: string;
  family_id: string;
  label: string | null;
  expires_at: number;
  max_uses: number;
  used_count: number;
  revoked: number;
  created_at: number;
}): Invite {
  return {
    token: r.token,
    familyId: r.family_id,
    label: r.label,
    expiresAt: r.expires_at,
    maxUses: r.max_uses,
    usedCount: r.used_count,
    revoked: r.revoked === 1,
    createdAt: r.created_at,
  };
}

export function createInvite(opts: {
  familyId: string;
  createdBy: string;
  label: string | null;
  ttlMinutes: number;
  maxUses: number;
}): Invite {
  const now = Date.now();
  const invite: Invite = {
    token: randomToken(),
    familyId: opts.familyId,
    label: opts.label,
    expiresAt: now + Math.max(1, Math.min(opts.ttlMinutes, 60 * 24 * 30)) * 60_000,
    maxUses: Math.max(0, Math.min(opts.maxUses, 99)),
    usedCount: 0,
    revoked: false,
    createdAt: now,
  };
  db.prepare(
    `INSERT INTO invites (token, family_id, created_by, label, expires_at, max_uses, used_count, revoked, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
  ).run(
    invite.token,
    invite.familyId,
    opts.createdBy,
    invite.label,
    invite.expiresAt,
    invite.maxUses,
    invite.createdAt,
  );
  return invite;
}

export function listInvites(familyId: string): Invite[] {
  const rows = db
    .prepare('SELECT * FROM invites WHERE family_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(familyId) as Parameters<typeof rowToInvite>[0][];
  return rows.map(rowToInvite);
}

export function inviteByToken(token: string): Invite | null {
  const r = db.prepare('SELECT * FROM invites WHERE token = ?').get(token) as
    | Parameters<typeof rowToInvite>[0]
    | undefined;
  return r ? rowToInvite(r) : null;
}

export function revokeInvite(familyId: string, token: string): boolean {
  const res = db
    .prepare('UPDATE invites SET revoked = 1 WHERE token = ? AND family_id = ? AND revoked = 0')
    .run(token, familyId);
  return res.changes > 0;
}

/* ---------------- 临时访客 ---------------- */

export function purgeExpired(): void {
  const now = Date.now();
  db.prepare('DELETE FROM guests WHERE expires_at <= ?').run(now);
  db.prepare('DELETE FROM invites WHERE expires_at <= ?').run(now);
}

export function listGuests(familyId: string): Guest[] {
  purgeExpired();
  const rows = db
    .prepare(
      'SELECT id, family_id, nickname, avatar, created_at, expires_at FROM guests WHERE family_id = ? AND expires_at > ? ORDER BY created_at DESC',
    )
    .all(familyId, Date.now()) as {
    id: string;
    family_id: string;
    nickname: string;
    avatar: string | null;
    created_at: number;
    expires_at: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    nickname: r.nickname,
    avatar: r.avatar,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}

export type EnterResult =
  | { ok: true; guest: Guest; family: Family; token: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'revoked' | 'exhausted' };

/** 通过分享链接以访客身份进入：不写成员表，可重复进入（同一 token 多次进入累加使用次数） */
export function enterAsGuest(token: string, nickname: string, avatar: string | null): EnterResult {
  purgeExpired();
  const invite = inviteByToken(token);
  if (!invite) return { ok: false, reason: 'not_found' };
  if (invite.revoked) return { ok: false, reason: 'revoked' };
  if (invite.expiresAt <= Date.now()) return { ok: false, reason: 'expired' };
  if (invite.maxUses > 0 && invite.usedCount >= invite.maxUses) return { ok: false, reason: 'exhausted' };

  const family = familyById(invite.familyId);
  if (!family) return { ok: false, reason: 'not_found' };

  const now = Date.now();
  const guest: Guest = {
    id: newId('g'),
    familyId: family.id,
    nickname,
    avatar,
    createdAt: now,
    expiresAt: Math.min(invite.expiresAt, now + 24 * 60 * 60_000),
  };
  const guestToken = randomToken();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO guests (id, token, family_id, invite_token, nickname, avatar, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(guest.id, guestToken, guest.familyId, invite.token, guest.nickname, guest.avatar, guest.createdAt, guest.expiresAt);
    db.prepare('UPDATE invites SET used_count = used_count + 1 WHERE token = ?').run(invite.token);
  })();
  return { ok: true, guest, family, token: guestToken };
}

/** 访客 token 换身份，用于访客调用接口时鉴权 */
export function guestByToken(token: string): (Guest & { family: Family }) | null {
  purgeExpired();
  const r = db
    .prepare(
      `SELECT g.id, g.family_id, g.nickname, g.avatar, g.created_at, g.expires_at, f.id AS f_id, f.name, f.code, f.owner_id, f.created_at AS f_created
       FROM guests g JOIN families f ON f.id = g.family_id
       WHERE g.token = ? AND g.expires_at > ?`,
    )
    .get(token, Date.now()) as
    | {
        id: string;
        family_id: string;
        nickname: string;
        avatar: string | null;
        created_at: number;
        expires_at: number;
        f_id: string;
        name: string;
        code: string;
        owner_id: string;
        f_created: number;
      }
    | undefined;
  if (!r) return null;
  return {
    id: r.id,
    familyId: r.family_id,
    nickname: r.nickname,
    avatar: r.avatar,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    family: { id: r.f_id, name: r.name, code: r.code, ownerId: r.owner_id, createdAt: r.f_created },
  };
}

/** 房主移除访客 */
export function removeGuest(familyId: string, guestId: string): boolean {
  const res = db.prepare('DELETE FROM guests WHERE id = ? AND family_id = ?').run(guestId, familyId);
  return res.changes > 0;
}

/* ---------------- 在线房间 ---------------- */

function rowToRoom(r: {
  id: string;
  family_id: string;
  game: string;
  host_id: string;
  title: string | null;
  status: string;
  config: string;
  created_at: number;
  updated_at: number;
}): Room {
  let config: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(r.config) as unknown;
    if (parsed && typeof parsed === 'object') config = parsed as Record<string, unknown>;
  } catch {
    config = {};
  }
  return {
    id: r.id,
    familyId: r.family_id,
    game: r.game,
    hostId: r.host_id,
    title: r.title,
    status: r.status as RoomStatus,
    config,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToSeat(r: {
  seat_index: number;
  user_id: string | null;
  guest_id: string | null;
  nickname: string;
  avatar: string | null;
  role: string;
  ready: number;
  joined_at: number;
}): Seat {
  return {
    seatIndex: r.seat_index,
    userId: r.user_id,
    guestId: r.guest_id,
    nickname: r.nickname,
    avatar: r.avatar,
    role: r.role as Seat['role'],
    ready: r.ready === 1,
    joinedAt: r.joined_at,
  };
}

function seatsOf(roomId: string): Seat[] {
  const rows = db
    .prepare('SELECT * FROM room_seats WHERE room_id = ? ORDER BY seat_index ASC')
    .all(roomId) as Parameters<typeof rowToSeat>[0][];
  return rows.map(rowToSeat);
}

export function roomById(roomId: string): RoomDetail | null {
  const r = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as
    | Parameters<typeof rowToRoom>[0]
    | undefined;
  return r ? { ...rowToRoom(r), seats: seatsOf(r.id) } : null;
}

/** 所有 HTTP / WebSocket 的房间视图都通过这里脱敏。 */
export function publicRoom(room: RoomDetail): RoomDetail & { hasPassword: boolean } {
  const { password, passwordHash, ...config } = room.config;
  return { ...room, config, hasPassword: !!password || !!passwordHash };
}

/** 旧房间仍允许明文密码校验；新建房间只持久化加盐哈希。 */
export function verifyRoomPassword(room: RoomDetail, supplied: string): boolean {
  if (supplied.length > 32) return false;
  const hash = room.config.passwordHash;
  if (typeof hash === 'string') {
    const [salt, expected] = hash.split(':');
    if (!salt || !expected || !/^[a-f0-9]{128}$/.test(expected)) return false;
    const actual = scryptSync(supplied, salt, 64);
    const stored = Buffer.from(expected, 'hex');
    return timingSafeEqual(stored, actual);
  }
  return typeof room.config.password !== 'string' || !room.config.password || room.config.password === supplied;
}

/** 只有有效身份且已经入座/加入旁观者，才能接收进行中的牌桌视图。 */
export function tableAccess(token: string, roomId: string, game: string): {
  room: RoomDetail; actorId: string; role: 'player' | 'spectator';
} | null {
  const user = userBySession(token);
  const guest = user ? null : guestByToken(token);
  if (!user && !guest) return null;
  const room = roomById(roomId);
  if (!room || room.status !== 'playing' || room.game !== game) return null;
  if (user ? !isMember(room.familyId, user.id) : guest!.family.id !== room.familyId) return null;
  const seat = room.seats.find((s) => user ? s.userId === user.id : s.guestId === guest!.id);
  if (!seat) return null;
  return { room, actorId: user?.id ?? guest!.id, role: seat.role };
}

/** 家庭内的房间列表，只包含家庭成员和被邀访客可见的范围（同一家庭） */
export function listRooms(familyId: string): RoomDetail[] {
  const rows = db
    .prepare('SELECT * FROM rooms WHERE family_id = ? AND status != ? ORDER BY updated_at DESC LIMIT 50')
    .all(familyId, 'ended') as Parameters<typeof rowToRoom>[0][];
  return rows.map((r) => ({ ...rowToRoom(r), seats: seatsOf(r.id) }));
}

export function createRoom(opts: {
  familyId: string;
  game: string;
  host: Actor;
  title: string | null;
  config: Record<string, unknown>;
}): RoomDetail {
  if (!isGameId(opts.game)) throw new Error('未知的游戏');
  const { password, ...otherConfig } = opts.config;
  const config = typeof password === 'string' && password
    ? { ...otherConfig, passwordHash: hashPassword(password) }
    : otherConfig;
  const now = Date.now();
  const room: Room = {
    id: newId('r'),
    familyId: opts.familyId,
    game: opts.game,
    hostId: opts.host.id,
    title: opts.title,
    status: 'waiting',
    config,
    createdAt: now,
    updatedAt: now,
  };
  db.transaction(() => {
    db.prepare(
      `INSERT INTO rooms (id, family_id, game, host_id, title, status, config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      room.id,
      room.familyId,
      room.game,
      room.hostId,
      room.title,
      room.status,
      JSON.stringify(room.config),
      room.createdAt,
      room.updatedAt,
    );
    // 房主直接坐 0 号位
    db.prepare(
      `INSERT INTO room_seats (room_id, seat_index, user_id, guest_id, nickname, avatar, role, ready, joined_at)
       VALUES (?, 0, ?, ?, ?, ?, 'player', 0, ?)`,
    ).run(
      room.id,
      opts.host.kind === 'user' ? opts.host.id : null,
      opts.host.kind === 'guest' ? opts.host.id : null,
      opts.host.nickname,
      opts.host.avatar,
      now,
    );
  })();
  return roomById(room.id)!;
}

export type JoinResult = { ok: true; room: RoomDetail; seatIndex: number } | { ok: false; reason: string };

/** 找最小空座位号 */
function nextSeatIndex(room: RoomDetail): number | null {
  const meta = gameMeta(room.game);
  const configured = room.config.maxPlayers;
  const limit = typeof configured === 'number' && Number.isInteger(configured)
    ? Math.max(meta?.minPlayers ?? 2, Math.min(configured, meta?.maxPlayers ?? 8))
    : meta?.maxPlayers ?? 8;
  const taken = new Set(room.seats.map((s) => s.seatIndex));
  for (let i = 0; i < limit; i += 1) {
    if (!taken.has(i)) return i;
  }
  return null;
}

export function joinRoom(room: RoomDetail, actor: Actor, role: 'player' | 'spectator' = 'player'): JoinResult {
  const existing = room.seats.find((s) =>
    actor.kind === 'user' ? s.userId === actor.id : s.guestId === actor.id,
  );
  if (existing) {
    db.prepare('UPDATE room_seats SET nickname = ?, avatar = ? WHERE room_id = ? AND seat_index = ?').run(
      actor.nickname,
      actor.avatar,
      room.id,
      existing.seatIndex,
    );
    return { ok: true, room: roomById(room.id)!, seatIndex: existing.seatIndex };
  }

  // 牌局进行中只能旁观
  const effectiveRole = room.status === 'playing' ? 'spectator' : role;
  if (effectiveRole === 'player') {
    const index = nextSeatIndex(room);
    if (index === null) return { ok: false, reason: '座位满了，先进来旁观吧' };
    db.prepare(
      `INSERT INTO room_seats (room_id, seat_index, user_id, guest_id, nickname, avatar, role, ready, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      room.id,
      index,
      actor.kind === 'user' ? actor.id : null,
      actor.kind === 'guest' ? actor.id : null,
      actor.nickname,
      actor.avatar,
      effectiveRole,
      Date.now(),
    );
    db.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').run(Date.now(), room.id);
    return { ok: true, room: roomById(room.id)!, seatIndex: index };
  }

  // 观战不占座位号，用负数索引避免和真实座位冲突
  const spectatorIndex = -1 - room.seats.filter((s) => s.seatIndex < 0).length;
  db.prepare(
    `INSERT INTO room_seats (room_id, seat_index, user_id, guest_id, nickname, avatar, role, ready, joined_at)
     VALUES (?, ?, ?, ?, ?, ?, 'spectator', 0, ?)`,
  ).run(
    room.id,
    spectatorIndex,
    actor.kind === 'user' ? actor.id : null,
    actor.kind === 'guest' ? actor.id : null,
    actor.nickname,
    actor.avatar,
    Date.now(),
  );
  return { ok: true, room: roomById(room.id)!, seatIndex: spectatorIndex };
}

export function leaveRoom(roomId: string, actor: Actor): void {
  db.prepare(
    actor.kind === 'user'
      ? 'DELETE FROM room_seats WHERE room_id = ? AND user_id = ?'
      : 'DELETE FROM room_seats WHERE room_id = ? AND guest_id = ?',
  ).run(roomId, actor.id);

  const left = seatsOf(roomId);
  if (!left.length) {
    db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
    return;
  }
  // 房主走了就把房主交给最早加入的玩家
  const room = roomById(roomId);
  if (room && !left.some((s) => s.userId === room.hostId)) {
    const heir = left.find((s) => s.role === 'player' && s.userId);
    if (heir?.userId) {
      db.prepare('UPDATE rooms SET host_id = ?, updated_at = ? WHERE id = ?').run(heir.userId, Date.now(), roomId);
    } else {
      db.prepare("UPDATE rooms SET status = 'ended', updated_at = ? WHERE id = ?").run(Date.now(), roomId);
    }
  } else {
    db.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').run(Date.now(), roomId);
  }
}

export function setReady(roomId: string, actor: Actor, ready: boolean): void {
  db.prepare(
    actor.kind === 'user'
      ? 'UPDATE room_seats SET ready = ? WHERE room_id = ? AND user_id = ?'
      : 'UPDATE room_seats SET ready = ? WHERE room_id = ? AND guest_id = ?',
  ).run(ready ? 1 : 0, roomId, actor.id);
}

export function setRoomStatus(roomId: string, status: RoomStatus): void {
  db.prepare('UPDATE rooms SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), roomId);
}

/** 房间所属家庭，用于越权校验 */
export function familyIdOfRoom(roomId: string): string | null {
  const r = db.prepare('SELECT family_id FROM rooms WHERE id = ?').get(roomId) as
    | { family_id: string }
    | undefined;
  return r?.family_id ?? null;
}
