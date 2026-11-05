'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, KeyRound, LogOut, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePresence, type PresenceState } from '@/lib/use-presence';
import { useSession } from '@/lib/session';
import type { Family } from '@/lib/types';

const PresenceContext = React.createContext<PresenceState | null>(null);

/** 页面内读取在线状态与房间列表 */
export function usePresenceData(): PresenceState {
  const ctx = React.useContext(PresenceContext);
  if (!ctx) throw new Error('usePresenceData 必须在 AppShell 内使用');
  return ctx;
}

interface AppShellProps {
  children: React.ReactNode;
  /** 当前家庭（页面可传入 URL 指定的家庭） */
  family?: Family | null;
}

/**
 * 全局外壳：顶部一条栏，家庭切换 + 在线成员 + 账号菜单。
 * 在这一层统一订阅在线状态，所有页面看到的名单都是同一份。
 */
export function AppShell({ children, family }: AppShellProps) {
  const { token, user, families, loading, currentFamilyId, setCurrentFamilyId, logout, recoveryCode } =
    useSession();
  const router = useRouter();
  const activeFamily = family ?? families.find((f) => f.id === currentFamilyId) ?? families[0] ?? null;

  const presence = usePresence(token, activeFamily?.id ?? null);
  const { online } = presence;

  const switchFamily = (id: string) => {
    setCurrentFamilyId(id);
    router.push(`/family?f=${id}`);
  };

  return (
    <PresenceContext.Provider value={presence}>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4">
            {/* 家庭切换 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary/60"
                >
                  <span className="truncate font-semibold">{activeFamily?.name ?? '我的家庭'}</span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[12rem]">
                <DropdownMenuLabel>切换家庭</DropdownMenuLabel>
                {families.map((f) => (
                  <DropdownMenuItem key={f.id} onSelect={() => switchFamily(f.id)}>
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    {f.id === activeFamily?.id && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/welcome">创建 / 加入别的家庭</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 在线成员 */}
            <div className="ml-auto flex items-center gap-2">
              {online.length > 0 ? (
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {online.slice(0, 4).map((p) => (
                      <Avatar
                        key={`${p.kind}-${p.id}`}
                        emoji={p.avatar}
                        name={p.nickname}
                        size="sm"
                        className="ring-2 ring-background"
                      />
                    ))}
                  </div>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {online.length} 人在线
                  </span>
                </div>
              ) : (
                <Badge variant="outline" className="hidden sm:inline-flex">
                  没人在线
                </Badge>
              )}

              {/* 账号菜单 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-1.5 rounded-full p-0.5">
                    <Avatar emoji={user?.avatar ?? null} name={user?.nickname ?? '?'} size="sm" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[13rem]">
                  <DropdownMenuLabel>{user?.nickname ?? '未登录'}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/family/members">
                      <Users className="size-4" />
                      成员管理
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/family/recovery">
                      <KeyRound className="size-4" />
                      {recoveryCode ? '查看我的恢复码' : '找回身份'}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      logout();
                      router.replace('/');
                    }}
                  >
                    <LogOut className="size-4" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {loading ? (
          <main className="flex min-h-[60vh] items-center justify-center">
            <p className="text-sm tracking-widest text-muted-foreground">正在准备…</p>
          </main>
        ) : (
          children
        )}
      </div>
    </PresenceContext.Provider>
  );
}
