'use client';

/** 临时访客的本地身份：不进家庭成员表，过期即失效 */
export interface GuestSession {
  token: string;
  id?: string;
  familyId?: string;
  nickname: string;
  avatar: string | null;
  familyName: string;
}

const KEY = 'fgn.guest';

export function saveGuest(g: GuestSession): void {
  localStorage.setItem(KEY, JSON.stringify(g));
}

export function readGuest(): GuestSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GuestSession) : null;
  } catch {
    return null;
  }
}

export function clearGuest(): void {
  localStorage.removeItem(KEY);
}
