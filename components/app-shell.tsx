'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronDown, Clock3, Home, LogOut, Plus, Settings2, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePresence, type PresenceState } from '@/lib/use-presence';
import { useSession } from '@/lib/session';
import type { Family } from '@/lib/types';

const PresenceContext = React.createContext<PresenceState | null>(null);

export function usePresenceData(): PresenceState {
  const ctx = React.useContext(PresenceContext);
  if (!ctx) throw new Error('usePresenceData 必须在 AppShell 内使用');
  return ctx;
}

export function AppShell({ children, family }: { children: React.ReactNode; family?: Family | null }) {
  const { token, user, families, loading, currentFamilyId, setCurrentFamilyId, logout, hasCredentials } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const activeFamily = family ?? families.find((f) => f.id === currentFamilyId) ?? families[0] ?? null;
  const presence = usePresence(token, activeFamily?.id ?? null);

  function switchFamily(id: string) {
    setCurrentFamilyId(id);
    router.push(`/family?f=${encodeURIComponent(id)}`);
  }

  const nav = [
    { href: '/family', label: '游戏大厅', icon: Home, active: pathname === '/family' || pathname.startsWith('/room/') },
    { href: '/family/history', label: '战绩记录', icon: Clock3, active: pathname.startsWith('/family/history') },
    { href: '/family/members', label: '家庭成员', icon: Users, active: pathname.startsWith('/family/members') },
  ];

  return <PresenceContext.Provider value={presence}>
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-18 w-full max-w-6xl items-center gap-4 px-5">
          <Link href="/family" className="mr-2 hidden items-center gap-2 text-sm font-bold tracking-wide text-matcha-deep sm:flex"><span className="flex size-8 items-center justify-center rounded-xl bg-matcha-deep text-card">✳</span> 家庭游戏夜</Link>
          <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-left font-semibold hover:bg-secondary/60"><span className="max-w-36 truncate">{activeFamily?.name ?? '选择家庭'}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52"><DropdownMenuLabel>我的家庭</DropdownMenuLabel>{families.map((item) => <DropdownMenuItem key={item.id} onSelect={() => switchFamily(item.id)}><span className="flex-1 truncate">{item.name}</span>{item.id === activeFamily?.id && <Check className="size-4 text-matcha-deep" />}</DropdownMenuItem>)}<DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/welcome"><Plus className="size-4" /> 创建 / 加入家庭</Link></DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
          <nav aria-label="家庭导航" className="ml-auto hidden items-center gap-1 md:flex">{nav.map(({ href, label, icon: Icon, active }) => <Link key={href} href={href} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${active ? 'bg-accent font-semibold text-matcha-deep' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}><Icon className="size-4" />{label}</Link>)}</nav>
          <div className="ml-auto flex items-center gap-3 md:ml-4"><span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><span className="size-2 rounded-full bg-matcha" />{presence.online.length} 人在线</span>
            <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="账号菜单" className="rounded-full ring-offset-2 transition hover:ring-2 hover:ring-matcha"><Avatar emoji={user?.avatar ?? null} name={user?.nickname ?? '?'} size="sm" /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48"><DropdownMenuLabel>{user?.nickname ?? '未登录'}</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/family/account"><Settings2 className="size-4" />账号设置{!hasCredentials && ' · 请补设密码'}</Link></DropdownMenuItem><DropdownMenuItem onSelect={() => { logout(); router.replace('/'); }}><LogOut className="size-4" />退出登录</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <nav aria-label="家庭导航" className="mx-auto flex max-w-6xl justify-around border-t border-border/50 px-3 py-1 md:hidden">{nav.map(({ href, label, icon: Icon, active }) => <Link key={href} href={href} className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] ${active ? 'font-semibold text-matcha-deep' : 'text-muted-foreground'}`}><Icon className="size-4" />{label}</Link>)}</nav>
      </header>
      {loading ? <main className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">正在准备…</main> : children}
    </div>
  </PresenceContext.Provider>;
}
