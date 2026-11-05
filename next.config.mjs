import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:8080';

const nextConfig = {
  reactStrictMode: true,
  // 仓库里还有 server/ 的独立 lockfile，显式锁定工作区根目录
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // 图集与音效等 public 资源保持独立文件，不要内联
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // 浏览器只认 /api，由 Next 转发到 Node 服务（生产环境由 nginx 承担同样的转发）
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_BASE}/api/:path*` }];
  },
};

export default nextConfig;
