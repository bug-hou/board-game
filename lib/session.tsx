'use client';

import * as React from 'react';
import { api } from './api';
import type { Family, User } from './types';

const TOKEN_KEY = 'fgn.token';
const RECOVERY_KEY = 'fgn.recovery';

interface SessionValue {
  token: string | null;
  user: User | null;
  families: Family[];
  /** 免密登录的找回凭证，只在注册那一次拿到 */
  recoveryCode: string | null;
  loading: boolean;
  /** 返回本次注册拿到的恢复码（老用户找回时是 null） */
  login: (nickname: string, avatar: string | null) => Promise<string | null>;
  recover: (code: string) => Promise<void>;
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
  const [currentFamilyId, setCurrentFamilyId] = React.useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setToken(null);
      setUser(null);
      setFamilies([]);
      setLoading(false);
      return;
    }
    try {
      const data = await api.me(saved);
      setToken(saved);
      setUser(data.user);
      setFamilies(data.families);
      setCurrentFamilyId((prev) => prev ?? data.families[0]?.id ?? null);
    } catch {
      // token 失效（服务端重启或数据清空），清掉本地重新登录
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
      setFamilies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setRecoveryCode(localStorage.getItem(RECOVERY_KEY));
    void refresh();
  }, [refresh]);

  const applyToken = React.useCallback((t: string, rc?: string | null) => {
    localStorage.setItem(TOKEN_KEY, t);
    if (rc) {
      localStorage.setItem(RECOVERY_KEY, rc);
      setRecoveryCode(rc);
    }
  }, []);

  const login = React.useCallback(
    async (nickname: string, avatar: string | null) => {
      const data = await api.login(nickname, avatar);
      applyToken(data.token, data.recoveryCode ?? null);
      // 登录后立刻拉取家庭列表，决定是进家庭还是去创建
      await refresh();
      return data.recoveryCode ?? null;
    },
    [refresh, applyToken],
  );

  /** 凭恢复码找回：换设备或清缓存后用 */
  const recover = React.useCallback(
    async (code: string) => {
      const data = await api.recover(code);
      applyToken(data.token, null);
      await refresh();
    },
    [refresh, applyToken],
  );

  const logout = React.useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setFamilies([]);
    setCurrentFamilyId(null);
  }, []);

  const value: SessionValue = {
    token,
    user,
    families,
    recoveryCode,
    loading,
    login,
    recover,
    logout,
    refresh,
    currentFamilyId,
    setCurrentFamilyId,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
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
