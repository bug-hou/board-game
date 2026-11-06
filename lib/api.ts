import type { Family, FamilyDetail, Guest, Invite, InviteInfo, MatchRecord, Room, RoomDetail, User } from './types';
import { apiBase } from './backend-url';

/** 本地走同源代理，Makers 生产环境直连公网后端 */
async function request<T>(path: string, init?: RequestInit & { token?: string | null }): Promise<T> {
  const { token, headers, ...rest } = init ?? {};
  const res = await fetch(`${apiBase}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `请求失败（${res.status}）`);
  return data as T;
}

export const api = {
  register: (username: string, password: string, nickname: string, avatar: string | null) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ username, password, nickname, avatar }),
    }),

  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    }),

  logout: (token: string) => request<{ ok: boolean }>('/auth/logout', { method: 'POST', token }),
  setCredentials: (token: string, username: string, password: string) =>
    request<{ ok: boolean }>('/auth/credentials', {
      method: 'POST', token, body: JSON.stringify({ username, password }),
    }),

  me: (token: string) =>
    request<{ user: User; families: Family[]; hasCredentials: boolean }>('/me', { token }),

  // —— 在线房间 ——
  listRooms: (token: string, familyId: string) =>
    request<{ rooms: RoomDetail[] }>(`/rooms?familyId=${encodeURIComponent(familyId)}`, { token }),

  createRoom: (
    token: string,
    body: { familyId: string; game: string; title?: string; config?: Record<string, unknown> },
  ) =>
    request<{ room: Room }>('/rooms', { method: 'POST', token, body: JSON.stringify(body) }),

  roomDetail: (token: string, roomId: string) =>
    request<{ room: RoomDetail }>(`/rooms/${encodeURIComponent(roomId)}`, { token }),

  joinRoom: (token: string, roomId: string, body: { role?: 'player' | 'spectator'; password?: string }) =>
    request<{ room: RoomDetail; seatIndex: number }>(`/rooms/${encodeURIComponent(roomId)}/join`, {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    }),

  leaveRoom: (token: string, roomId: string) =>
    request<{ ok: boolean }>(`/rooms/${encodeURIComponent(roomId)}/leave`, { method: 'POST', token }),

  setReady: (token: string, roomId: string, ready: boolean) =>
    request<{ room: RoomDetail }>(`/rooms/${encodeURIComponent(roomId)}/ready`, {
      method: 'POST',
      token,
      body: JSON.stringify({ ready }),
    }),

  startRoom: (token: string, roomId: string) =>
    request<{ room: RoomDetail }>(`/rooms/${encodeURIComponent(roomId)}/start`, { method: 'POST', token }),

  createFamily: (token: string, name: string) =>
    request<{ family: Family }>('/families', {
      method: 'POST',
      token,
      body: JSON.stringify({ name }),
    }),

  joinFamily: (token: string, code: string) =>
    request<{ family: Family }>('/families/join', {
      method: 'POST',
      token,
      body: JSON.stringify({ code }),
    }),

  familyDetail: (token: string, familyId: string) =>
    request<FamilyDetail>(`/families/${encodeURIComponent(familyId)}`, { token }),

  history: (token: string, familyId: string, before?: number) =>
    request<{ matches: MatchRecord[] }>(
      `/families/${encodeURIComponent(familyId)}/history${before ? `?before=${before}` : ''}`, { token },
    ),

  createInvite: (token: string, familyId: string, opts: { label?: string; ttlMinutes: number; maxUses: number }) =>
    request<{ invite: Invite }>(`/families/${encodeURIComponent(familyId)}/invites`, {
      method: 'POST',
      token,
      body: JSON.stringify(opts),
    }),

  revokeInvite: (token: string, familyId: string, inviteToken: string) =>
    request<{ ok: boolean }>(
      `/families/${encodeURIComponent(familyId)}/invites/${encodeURIComponent(inviteToken)}`,
      { method: 'DELETE', token },
    ),

  // —— 成员管理 ——
  removeMember: (token: string, familyId: string, userId: string) =>
    request<{ ok: boolean }>(
      `/families/${encodeURIComponent(familyId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE', token },
    ),

  transferOwner: (token: string, familyId: string, userId: string) =>
    request<{ family: Family }>(`/families/${encodeURIComponent(familyId)}/transfer`, {
      method: 'POST',
      token,
      body: JSON.stringify({ userId }),
    }),

  leaveFamily: (token: string, familyId: string) =>
    request<{ ok: boolean; dissolved: boolean }>(`/families/${encodeURIComponent(familyId)}/leave`, {
      method: 'POST',
      token,
    }),

  rotateFamilyCode: (token: string, familyId: string) =>
    request<{ family: Family; code: string }>(`/families/${encodeURIComponent(familyId)}/rotate-code`, {
      method: 'POST',
      token,
    }),

  removeGuest: (token: string, familyId: string, guestId: string) =>
    request<{ ok: boolean }>(
      `/families/${encodeURIComponent(familyId)}/guests/${encodeURIComponent(guestId)}`,
      { method: 'DELETE', token },
    ),

  familyByCode: (code: string) =>
    request<{ name: string; memberCount: number }>(`/families/code/${encodeURIComponent(code)}`),

  inviteInfo: (token: string) => request<InviteInfo>(`/invites/${encodeURIComponent(token)}`),

  guestEnter: (token: string, nickname: string, avatar: string | null) =>
    request<{ token: string; guest: Guest; family: Family }>('/guest/enter', {
      method: 'POST',
      body: JSON.stringify({ token, nickname, avatar }),
    }),
};
