/**
 * 家庭体系的 HTTP API。
 *
 * 与 WebSocket 房间服务共用同一个 http.Server（见 index.ts），
 * 路径统一以 /api 开头，方便 Nginx 或 Next.js rewrite 整体转发。
 *
 * 返回值表示「这个请求是否已由本模块处理」，false 则交回上层。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { gameMeta, isGameId } from '../../src/game/registry';
import * as store from './store';
import { listHistory } from './history';
import { familyOnline, notifyFamilyAndRooms } from './presence';
import { dropTable, getSession, startTable } from './games/table';
import {
  dropBlackjackTable,
  getBlackjackSession,
  startBlackjackTable,
} from './games/blackjack-table';
import { dropSixTable, getSixSession, startSixTable } from './games/six-table';

const MAX_BODY = 64 * 1024;

interface UserIdentity {
  kind: 'user';
  user: store.User;
}

interface GuestIdentity {
  kind: 'guest';
  guest: store.Guest & { family: store.Family };
}

/* ---------------- 基础工具 ---------------- */

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function ok(res: ServerResponse, body: unknown): boolean {
  send(res, 200, body);
  return true;
}

function fail(res: ServerResponse, status: number, message: string): boolean {
  send(res, status, { error: message });
  return true;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function bearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7).trim() || null;
}

function userOf(req: IncomingMessage): store.User | null {
  const t = bearer(req);
  return t ? store.userBySession(t) : null;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

type Identity =
  | { kind: 'user'; user: store.User }
  | { kind: 'guest'; guest: NonNullable<ReturnType<typeof store.guestByToken>> };

/** 家庭成员优先，其次是临时访客；两者都能坐进房间，但只有家庭成员能建房 */
function identityOf(req: IncomingMessage): Identity | null {
  const user = userOf(req);
  if (user) return { kind: 'user', user };
  const guest = store.guestByToken(bearer(req) ?? '');
  return guest ? { kind: 'guest', guest } : null;
}

function actorOf(id: Identity): store.Actor {
  return id.kind === 'user'
    ? { kind: 'user', id: id.user.id, nickname: id.user.nickname, avatar: id.user.avatar }
    : { kind: 'guest', id: id.guest.id, nickname: id.guest.nickname, avatar: id.guest.avatar };
}

/** 校验这个人属于这个家庭（成员或被邀访客） */
function belongsTo(id: Identity, familyId: string): boolean {
  return id.kind === 'user' ? store.isMember(familyId, id.user.id) : id.guest.family.id === familyId;
}

/** 极简内存限流：防止刷接口，进程重启即失效 */
const buckets = new Map<string, { n: number; resetAt: number }>();
function rateLimit(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { n: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.n >= limit) return false;
  b.n += 1;
  return true;
}

const GUEST_ERRORS = {
  not_found: '邀请链接无效',
  expired: '邀请链接已过期，让家人重新发一个吧',
  revoked: '邀请链接已被撤销',
  exhausted: '邀请链接使用次数已用完',
} as const;

/* ---------------- 处理函数 ---------------- */

function handleRegister(req: IncomingMessage, res: ServerResponse, body: unknown): boolean {
  if (!rateLimit(`register:${req.socket.remoteAddress ?? '?'}`, 10)) return fail(res, 429, '操作太频繁，稍后再试');
  const b = obj(body);
  const username = store.normalizeUsername(b.username);
  const nickname = store.normalizeNickname(b.nickname);
  if (!username) return fail(res, 400, '账号需为 3–24 位小写字母、数字或下划线');
  if (!store.validPassword(b.password)) return fail(res, 400, '密码至少 8 位，且不超过 128 字节');
  if (!nickname) return fail(res, 400, `昵称不能为空，且不超过 ${store.MAX_NICKNAME} 个字`);
  try {
    const user = store.createUser(username, b.password, nickname, store.normalizeAvatar(b.avatar));
    return ok(res, { token: store.createSession(user.id), user });
  } catch (err) {
    if (String(err).includes('UNIQUE')) return fail(res, 409, '这个账号已经有人用了');
    throw err;
  }
}

function handleLogin(req: IncomingMessage, res: ServerResponse, body: unknown): boolean {
  const b = obj(body);
  const username = store.normalizeUsername(b.username);
  if (!rateLimit(`login:${req.socket.remoteAddress ?? '?'}:${username ?? 'invalid'}`, 10)) return fail(res, 429, '尝试太频繁，稍后再试');
  if (!username || !store.validPassword(b.password)) return fail(res, 401, '账号或密码不正确');
  const user = store.userByCredentials(username, b.password);
  if (!user) return fail(res, 401, '账号或密码不正确');
  return ok(res, { token: store.createSession(user.id), user });
}

function handleCreateFamily(req: IncomingMessage, res: ServerResponse, body: unknown, user: store.User): boolean {
  if (!rateLimit(`family:${req.socket.remoteAddress ?? '?'}`, 20)) {
    return fail(res, 429, '操作太频繁，稍后再试');
  }
  const name = store.normalizeFamilyName(obj(body).name);
  if (!name) return fail(res, 400, `家庭名不能为空，且不超过 ${store.MAX_FAMILY_NAME} 个字`);
  if (store.familiesOfUser(user.id).length >= 5) return fail(res, 409, '一个人最多创建 5 个家庭');
  return ok(res, { family: store.createFamily(user.id, name) });
}

function handleJoinFamily(req: IncomingMessage, res: ServerResponse, body: unknown, user: store.User): boolean {
  if (!rateLimit(`join:${req.socket.remoteAddress ?? '?'}`, 60)) {
    return fail(res, 429, '操作太频繁，稍后再试');
  }
  const code = String(obj(body).code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) return fail(res, 400, '家庭码是 6 位字母和数字');
  const family = store.joinFamilyByCode(user.id, code);
  if (!family) return fail(res, 404, '没找到这个家庭码，检查一下有没有输错');
  return ok(res, { family });
}

/** 家庭详情：访客只拿得到成员昵称，拿不到邀请链接和访客列表 */
function handleFamilyDetail(res: ServerResponse, family: store.Family, user: store.User): boolean {
  const role = store.memberRole(family.id, user.id);
  return ok(res, {
    family,
    members: store.listMembers(family.id),
    guests: store.listGuests(family.id),
    invites: store.listInvites(family.id),
    viewer: { kind: 'user' as const, role },
  });
}

function handleCreateInvite(res: ServerResponse, body: unknown, family: store.Family, user: store.User): boolean {
  if (!rateLimit(`invite:${user.id}`, 30)) return fail(res, 429, '操作太频繁，稍后再试');
  const b = obj(body);
  const label = typeof b.label === 'string' ? b.label.trim().slice(0, 20) || null : null;
  const invite = store.createInvite({
    familyId: family.id,
    createdBy: user.id,
    label,
    ttlMinutes: Number(b.ttlMinutes) || store.DEFAULT_INVITE_TTL_MIN,
    maxUses: Number(b.maxUses) || 0,
  });
  return ok(res, { invite });
}

function handleGuestEnter(req: IncomingMessage, res: ServerResponse, body: unknown): boolean {
  if (!rateLimit(`guest:${req.socket.remoteAddress ?? '?'}`, 30)) {
    return fail(res, 429, '操作太频繁，稍后再试');
  }
  const b = obj(body);
  const token = String(b.token ?? '');
  if (!token) return fail(res, 400, '缺少邀请 token');
  const nickname = store.normalizeNickname(b.nickname);
  if (!nickname) return fail(res, 400, `昵称不能为空，且不超过 ${store.MAX_NICKNAME} 个字`);
  const result = store.enterAsGuest(token, nickname, store.normalizeAvatar(b.avatar));
  if (!result.ok) return fail(res, 400, GUEST_ERRORS[result.reason]);
  return ok(res, { token: result.token, guest: result.guest, family: result.family });
}

function handleInviteInfo(res: ServerResponse, token: string): boolean {
  const invite = store.inviteByToken(token);
  if (!invite) return fail(res, 404, '邀请链接无效');
  const family = store.familyById(invite.familyId);
  const usedUp = invite.maxUses > 0 && invite.usedCount >= invite.maxUses;
  const expired = invite.revoked || invite.expiresAt <= Date.now() || usedUp;
  return ok(res, {
    valid: !expired,
    expired,
    family: family ? { name: family.name } : null,
    label: invite.label,
    expiresAt: invite.expiresAt,
  });
}

/* ---------------- 在线房间 ---------------- */

/** 房间配置白名单：只允许通用键 + 该游戏声明的配置键，其余丢弃 */
const COMMON_CONFIG_KEYS = ['password', 'maxPlayers', 'aiCount'];

function sanitizeConfig(raw: unknown, game: string): Record<string, unknown> {
  const meta = gameMeta(game);
  const allowed = new Set<string>([
    ...COMMON_CONFIG_KEYS,
    ...(meta?.configFields.map((f) => f.key) ?? []),
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj(raw))) {
    if (!allowed.has(k)) continue;
    if (k === 'password') {
      if (typeof v === 'string' && v.trim()) out.password = v.trim().slice(0, 32);
      continue;
    }
    if (k === 'maxPlayers' || k === 'aiCount') {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = Math.max(0, Math.min(20, Math.trunc(n)));
      continue;
    }
    out[k] = v;
  }
  return out;
}

function handleCreateRoom(req: IncomingMessage, res: ServerResponse, body: unknown, user: store.User): boolean {
  if (!rateLimit(`room:${req.socket.remoteAddress ?? '?'}`, 30)) {
    return fail(res, 429, '操作太频繁，稍后再试');
  }
  const b = obj(body);
  const familyId = String(b.familyId ?? '');
  if (!store.isMember(familyId, user.id)) return fail(res, 403, '你不是这个家庭的成员');
  if (store.familiesOfUser(user.id).length === 0) return fail(res, 403, '你不是这个家庭的成员');

  const game = String(b.game ?? '');
  const meta = isGameId(game) ? gameMeta(game) : undefined;
  if (!meta) return fail(res, 400, '未知的游戏');

  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 20) || null : null;
  const room = store.createRoom({
    familyId,
    game,
    host: { kind: 'user', id: user.id, nickname: user.nickname, avatar: user.avatar },
    title,
    config: sanitizeConfig(b.config, game),
  });
  notifyFamilyAndRooms(familyId);
  return ok(res, { room: store.publicRoom(room) });
}

function handleJoinRoom(res: ServerResponse, body: unknown, room: store.RoomDetail, id: Identity): boolean {
  if (!belongsTo(id, room.familyId)) return fail(res, 403, '这个房间不是你家的');
  const b = obj(body);
  const password = typeof b.password === 'string' ? b.password : '';
  const alreadyJoined = room.seats.some((seat) => id.kind === 'user' ? seat.userId === id.user.id : seat.guestId === id.guest.id);
  if (!alreadyJoined && !rateLimit(`room-join:${room.id}:${actorOf(id).id}`, 12)) return fail(res, 429, '密码尝试太频繁，请稍后再试');
  if (!alreadyJoined && !store.verifyRoomPassword(room, password)) {
    return fail(res, 401, '房间密码不对');
  }
  const role = b.role === 'spectator' ? 'spectator' : 'player';
  const result = store.joinRoom(room, actorOf(id), role);
  if (!result.ok) return fail(res, 409, result.reason);
  notifyFamilyAndRooms(room.familyId);
  return ok(res, { room: store.publicRoom(result.room), seatIndex: result.seatIndex });
}

function handleStartRoom(res: ServerResponse, room: store.RoomDetail, id: Identity): boolean {
  if (id.kind !== 'user' || room.hostId !== id.user.id) return fail(res, 403, '只有房主能开局');
  // 按 game 分流到各自的会话；服务重启后会话会丢，
  // 这种「空壳进行中」允许重新开局，否则房间就卡死了
  const alive = room.game === 'blackjack'
    ? getBlackjackSession(room.id)
    : room.game === 'six'
      ? getSixSession(room.id)
      : getSession(room.id);
  if (room.status === 'playing' && alive) return fail(res, 409, '已经开局了');
  const meta = gameMeta(room.game);
  const players = room.seats.filter((s) => s.role === 'player').length;
  const min = meta?.minPlayers ?? 2;
  if (players < min) return fail(res, 409, `至少要 ${min} 个人才能开局，现在只有 ${players} 个`);
  const started = room.game === 'blackjack'
    ? startBlackjackTable(room)
    : room.game === 'six'
      ? startSixTable(room)
      : startTable(room);
  if (!started.ok) return fail(res, 409, started.error ?? '开局失败');
  store.setRoomStatus(room.id, 'playing');
  notifyFamilyAndRooms(room.familyId);
  return ok(res, { room: store.publicRoom(store.roomById(room.id)!) });
}

/* ---------------- 入口 ---------------- */

export async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  if (!path.startsWith('/api/')) return false;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    });
    res.end();
    return true;
  }

  const method = req.method ?? 'GET';
  let body: unknown = {};
  if (method === 'POST') {
    try {
      body = await readBody(req);
    } catch (err) {
      return fail(res, 400, err instanceof Error ? err.message : '请求体解析失败');
    }
  }

  try {
    if (path === '/api/auth/register' && method === 'POST') return handleRegister(req, res, body);
    if (path === '/api/auth/login' && method === 'POST') return handleLogin(req, res, body);

    if (path === '/api/guest/enter' && method === 'POST') return handleGuestEnter(req, res, body);

    // —— 在线房间：家庭成员与临时访客都能进 ——
    if (path === '/api/rooms' && method === 'GET') {
      const id = identityOf(req);
      if (!id) return fail(res, 401, '请先登录');
      const familyId = url.searchParams.get('familyId') ?? '';
      if (!belongsTo(id, familyId)) return fail(res, 403, '你不是这个家庭的成员');
      return ok(res, {
        rooms: store.listRooms(familyId).map(store.publicRoom),
        online: familyOnline(familyId),
      });
    }

    if (path === '/api/rooms' && method === 'POST') {
      const user = userOf(req);
      if (!user) return fail(res, 401, '请先登录');
      return handleCreateRoom(req, res, body, user);
    }

    const roomMatch = /^\/api\/rooms\/([^/]+)(\/.*)?$/.exec(path);
    if (roomMatch) {
      const id = identityOf(req);
      if (!id) return fail(res, 401, '请先登录');
      const room = store.roomById(decodeURIComponent(roomMatch[1]));
      if (!room) return fail(res, 404, '房间不存在或已解散');
      if (!belongsTo(id, room.familyId)) return fail(res, 403, '这个房间不是你家的');

      const sub = roomMatch[2] ?? '';
      if (!sub && method === 'GET') return ok(res, { room: store.publicRoom(room) });

      if (sub === '/join' && method === 'POST') return handleJoinRoom(res, body, room, id);

      if (sub === '/leave' && method === 'POST') {
        store.leaveRoom(room.id, actorOf(id));
        // 人走光了就把牌桌会话一起收掉
        if (store.roomById(room.id)?.seats.length === 0) {
          dropTable(room.id);
          dropBlackjackTable(room.id);
          dropSixTable(room.id);
        }
        notifyFamilyAndRooms(room.familyId);
        return ok(res, { ok: true });
      }

      if (sub === '/ready' && method === 'POST') {
        if (id.kind !== 'user') return fail(res, 403, '访客不能点准备');
        store.setReady(room.id, actorOf(id), obj(body).ready === true);
        notifyFamilyAndRooms(room.familyId);
        return ok(res, { room: store.publicRoom(store.roomById(room.id)!) });
      }

      if (sub === '/start' && method === 'POST') return handleStartRoom(res, room, id);
    }

    if (path.startsWith('/api/invites/') && method === 'GET') {
      return handleInviteInfo(res, decodeURIComponent(path.slice('/api/invites/'.length)));
    }

    // 家庭码查名：给邀请落地页用，家庭码本身就是凭证，只暴露家庭名和人数
    if (path.startsWith('/api/families/code/') && method === 'GET') {
      const code = decodeURIComponent(path.slice('/api/families/code/'.length))
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6);
      const family = store.familyByCode(code);
      if (!family) return fail(res, 404, '没找到这个家庭码');
      return ok(res, { name: family.name, memberCount: store.countMembers(family.id) });
    }

    // 以下接口需要登录用户
    const user = userOf(req);
    if (!user) return fail(res, 401, '请先登录');

    if (path === '/api/me' && method === 'GET') {
      return ok(res, { user, families: store.familiesOfUser(user.id), hasCredentials: store.hasCredentials(user.id) });
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      store.revokeSession(bearer(req)!);
      return ok(res, { ok: true });
    }

    if (path === '/api/auth/credentials' && method === 'POST') {
      if (store.hasCredentials(user.id)) return fail(res, 409, '账号已设置');
      const username = store.normalizeUsername(obj(body).username);
      const password = obj(body).password;
      if (!username || !store.validPassword(password)) return fail(res, 400, '账号需 3–24 位字母数字或下划线，密码至少 8 位');
      try {
        store.setCredentials(user.id, username, password);
        return ok(res, { ok: true });
      } catch (err) {
        if (String(err).includes('UNIQUE')) return fail(res, 409, '这个账号已经有人用了');
        throw err;
      }
    }

    if (path === '/api/families' && method === 'POST') {
      return handleCreateFamily(req, res, body, user);
    }

    if (path === '/api/families/join' && method === 'POST') {
      return handleJoinFamily(req, res, body, user);
    }

    const m = /^\/api\/families\/([^/]+)(\/.*)?$/.exec(path);
    if (m) {
      const family = store.familyById(decodeURIComponent(m[1]));
      if (!family) return fail(res, 404, '家庭不存在');
      const role = store.memberRole(family.id, user.id);
      if (!role) return fail(res, 403, '你不是这个家庭的成员');

      const sub = m[2] ?? '';
      if (!sub && method === 'GET') return handleFamilyDetail(res, family, user);
      if (sub === '/history' && method === 'GET') {
        const raw = Number(url.searchParams.get('before'));
        const before = Number.isSafeInteger(raw) && raw > 0 ? raw : Date.now() + 1;
        return ok(res, { matches: listHistory(family.id, before) });
      }

      if (sub === '/invites' && method === 'POST') {
        return handleCreateInvite(res, body, family, user);
      }

      // 撤销邀请链接：房主可以撤销任意链接
      if (sub.startsWith('/invites/') && method === 'DELETE') {
        if (role !== 'owner') return fail(res, 403, '只有房主可以撤销邀请链接');
        const token = decodeURIComponent(sub.slice('/invites/'.length));
        const invite = store.inviteByToken(token);
        if (!invite || invite.familyId !== family.id) return fail(res, 404, '邀请链接不存在');
        return ok(res, { ok: store.revokeInvite(family.id, token) });
      }

      // 成员管理：移除成员（仅房主，且不能移除房主自己）
      if (sub.startsWith('/members/') && method === 'DELETE') {
        if (role !== 'owner') return fail(res, 403, '只有房主可以移除成员');
        const targetId = decodeURIComponent(sub.slice('/members/'.length));
        if (targetId === user.id) return fail(res, 409, '房主不能移除自己，可以先转让房主');
        if (!store.removeMember(family.id, targetId)) return fail(res, 404, '成员不存在');
        notifyFamilyAndRooms(family.id);
        return ok(res, { ok: true });
      }

      // 转让房主
      if (sub === '/transfer' && method === 'POST') {
        if (role !== 'owner') return fail(res, 403, '只有房主可以转让');
        const toUserId = String(obj(body).userId ?? '');
        if (!store.transferOwner(family.id, toUserId)) return fail(res, 404, '对方不是这个家庭的成员');
        return ok(res, { family: store.familyById(family.id) });
      }

      // 自己退出家庭
      if (sub === '/leave' && method === 'POST') {
        const result = store.leaveFamily(family.id, user.id);
        if (!result.ok) return fail(res, 409, result.reason);
        notifyFamilyAndRooms(family.id);
        return ok(res, { ok: true, dissolved: result.dissolved });
      }

      // 重置家庭码
      if (sub === '/rotate-code' && method === 'POST') {
        if (role !== 'owner') return fail(res, 403, '只有房主可以换家庭码');
        const code = store.rotateFamilyCode(family.id);
        return ok(res, { family: store.familyById(family.id), code });
      }

      // 移除访客：仅房主
      if (sub.startsWith('/guests/') && method === 'DELETE') {
        if (role !== 'owner') return fail(res, 403, '只有房主可以移除访客');
        const guestId = decodeURIComponent(sub.slice('/guests/'.length));
        return ok(res, { ok: store.removeGuest(family.id, guestId) });
      }
    }

    return fail(res, 404, '接口不存在');
  } catch (err) {
    console.error('[api] 处理失败', err);
    return fail(res, 500, '服务器开小差了');
  }
}

export type { UserIdentity, GuestIdentity };
