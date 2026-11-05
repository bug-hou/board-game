'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CopyFieldProps {
  value: string;
  label?: string;
  className?: string;
  mono?: boolean;
}

/** 只读文本 + 一键复制，用于家庭码与邀请链接 */
export function CopyField({ value, label, className, mono }: CopyFieldProps) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // 无剪贴板权限时退回到旧接口
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast.success(label ? `${label}已复制` : '已复制');
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-3 text-left transition-colors hover:bg-secondary/70',
        className,
      )}
    >
      <span className={cn('min-w-0 flex-1 truncate text-sm text-foreground', mono && 'font-code tracking-wider')}>
        {value}
      </span>
      <span className="shrink-0 text-muted-foreground group-hover:text-foreground">
        {copied ? <Check className="size-4 text-matcha-deep" /> : <Copy className="size-4" />}
      </span>
    </button>
  );
}

/** 复制按钮（独立版，用于链接卡片） */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label}已复制`);
    } catch {
      toast.error('复制失败，请手动选择文本');
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      <Copy className="size-3.5" />
      复制
    </Button>
  );
}
