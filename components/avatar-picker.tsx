'use client';

import { cn } from '@/lib/utils';

/** 家庭向的 emoji 头像，不涉及任何外部图片资源 */
export const AVATARS = [
  '🐻', '🐰', '🐱', '🐶', '🦊', '🐼',
  '🐨', '🐯', '🦁', '🐮', '🐷', '🐸',
  '🐵', '🐔', '🐧', '🦄', '🐙', '🦉',
];

interface AvatarPickerProps {
  value: string | null;
  onChange: (emoji: string) => void;
}

export function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
      {AVATARS.map((emoji) => {
        const active = value === emoji;
        return (
          <button
            key={emoji}
            type="button"
            aria-label={`选择头像 ${emoji}`}
            aria-pressed={active}
            onClick={() => onChange(emoji)}
            className={cn(
              'flex size-11 items-center justify-center rounded-xl border text-xl transition-all',
              active
                ? 'border-primary bg-primary/12 scale-105 ring-2 ring-primary/30'
                : 'border-border bg-card hover:border-primary/50 hover:bg-secondary/60',
            )}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}
