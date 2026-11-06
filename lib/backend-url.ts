const backendOrigin = (process.env.NEXT_PUBLIC_API_ORIGIN ||
  (process.env.NODE_ENV === 'production' ? 'https://api.game.convenience.top' : '')).replace(/\/$/, '');

export const apiBase = `${backendOrigin}/api`;

export function wsBase(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL.replace(/\/$/, '');
  if (backendOrigin) return backendOrigin.replace(/^http/, 'ws');
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return window.location.port === '3000'
    ? `${proto}//${window.location.hostname}:8080`
    : `${proto}//${window.location.host}`;
}
