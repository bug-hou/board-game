const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** 剩余多久过期，用于邀请链接与访客卡片 */
export function timeLeft(expiresAt: number, now = Date.now()): string {
  const diff = expiresAt - now;
  if (diff <= 0) return '已过期';
  if (diff < MIN) return '不到 1 分钟';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时`;
  return `${Math.floor(diff / DAY)} 天`;
}

/** 加入时间，只精确到日 */
export function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}
