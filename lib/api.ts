import type { Family, FamilyDetail, Guest, Invite, InviteInfo, Room, RoomDetail, User } from './types';


const BASE = '/api';

/** 统一走 /api，开发环境由 Next rewrite 转发到 Node 服务，生产由 Nginx 转发 */
async function request<T>(path: string, init?: RequestInit & { token?: string | null }): Promise<T> {
  const { token, headers, ...rest } = init ?? {};
  const res = await fetch(`${BASE}${path}`, {
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
  login: (nickname: string, avatar: string | null) =>
    request<{ token: string; user: User; recoveryCode?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ nickname, avatar }),
    }),

  me: (token: string) =>
    request<{ user: User; families: Family[] }>('/me', { token }),

  /** 凭恢复码找回身份 */
  recover: (recoveryCode: string) =>
    request<{ token: string; user: User; families: Family[] }>('/auth/recover', {
      method: 'POST',
      body: JSON.stringify({ recoveryCode }),
    }),

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
