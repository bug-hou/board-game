'use client';

import * as React from 'react';
import { api } from './api';
import type { Family, User } from './types';

const TOKEN_KEY = 'fgn.token';
const FAMILY_KEY = 'fgn.family';

interface SessionValue {
  token: string | null;
  user: User | null;
  families: Family[];
  hasCredentials: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname: string, avatar: string | null) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setCurrentFamilyId: (id: string) => void;
  currentFamilyId: string | null;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [families, setFamilies] = React.useState<Family[]>([]);
  const [currentFamilyId, setFamilyId] = React.useState<string | null>(null);
  const [hasCredentials, setHasCredentials] = React.useState(true);
  const [loading, setLoading] = React.useState(true);

  const setCurrentFamilyId = React.useCallback((id: string) => {
    localStorage.setItem(FAMILY_KEY, id);
    setFamilyId(id);
  }, []);

  const refresh = React.useCallback(async () => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setToken(null);
      setUser(null);
      setFamilies([]);
      setFamilyId(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.me(saved);
      setToken(saved);
      setUser(data.user);
      setFamilies(data.families);
      setHasCredentials(data.hasCredentials);
      setFamilyId((previous) => {
        const preferred = previous ?? localStorage.getItem(FAMILY_KEY);
        const id = data.families.find((family) => family.id === preferred)?.id ?? data.families[0]?.id ?? null;
        if (id) localStorage.setItem(FAMILY_KEY, id);
        else localStorage.removeItem(FAMILY_KEY);
        return id;
      });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(FAMILY_KEY);
      setToken(null);
      setUser(null);
      setFamilies([]);
      setFamilyId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    localStorage.removeItem('fgn.recovery');
    void refresh();
  }, [refresh]);

  const login = React.useCallback(async (username: string, password: string) => {
    const data = await api.login(username, password);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.removeItem(FAMILY_KEY);
    setFamilyId(null);
    await refresh();
  }, [refresh]);

  const register = React.useCallback(async (username: string, password: string, nickname: string, avatar: string | null) => {
    const data = await api.register(username, password, nickname, avatar);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.removeItem(FAMILY_KEY);
    setFamilyId(null);
    await refresh();
  }, [refresh]);

  const logout = React.useCallback(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) void api.logout(saved).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(FAMILY_KEY);
    localStorage.removeItem('fgn.recovery');
    setToken(null);
    setUser(null);
    setFamilies([]);
    setFamilyId(null);
  }, []);

  return <SessionContext.Provider value={{ token, user, families, hasCredentials, loading, login, register,
    logout, refresh, currentFamilyId, setCurrentFamilyId }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error('useSession 必须在 SessionProvider 内使用');
  return ctx;
}

export function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}
