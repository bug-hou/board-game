'use client';

import Link from 'next/link';
import { ChevronRight, UserPlus } from 'lucide-react';
import { CopyField } from '@/components/copy-field';
import type { Family } from '@/lib/types';

/** 首页的邀请入口：家庭码直接抄，更多操作进邀请页 */
export function InviteCard({ family, origin }: { family: Family; origin: string }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-2">
        <UserPlus className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">把家人请进来</h2>
        <Link
          href="/family/invite"
          className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          临时访客 / 更多
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">家庭码念给家人听，或者把链接甩过去</p>

      <CopyField
        value={family.code}
        label="家庭码"
        mono
        className="mt-3 justify-center py-3 font-code text-xl tracking-[0.35em]"
      />
      <div className="mt-2">
        <CopyField value={`${origin}/join/${family.code}`} label="邀请链接" mono className="text-xs" />
      </div>
    </section>
  );
}
