import { cn } from '@/lib/utils';

/** 头像用 emoji + 暖色底盘表示，不依赖外部图片资源 */
const PALETTE = [
  'bg-[#f6e0d2]',
  'bg-[#e6efe4]',
  'bg-[#f3e6d3]',
  'bg-[#e9e2f0]',
  'bg-[#dbe9f2]',
  'bg-[#f7e6c8]',
];

function paletteOf(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 997;
  return PALETTE[h % PALETTE.length];
}

interface AvatarProps {
  emoji?: string | null;
  name: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'size-8 text-base',
  md: 'size-11 text-xl',
  lg: 'size-16 text-3xl',
} as const;

export function Avatar({ emoji, name, className, size = 'md' }: AvatarProps) {
  const initial = name.trim().slice(0, 1) || '?';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-border/60',
        paletteOf(name || '?'),
        SIZES[size],
        className,
      )}
      aria-label={name}
    >
      <span className="leading-none">{emoji || initial}</span>
    </span>
  );
}
