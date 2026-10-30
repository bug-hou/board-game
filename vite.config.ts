import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2022',
    // 图集必须保持独立文件，不能被内联成 base64
    assetsInlineLimit: 0,
    // 每次构建清空旧产物，避免废弃分片被一起打包
    emptyOutDir: true,
    // Pixi 按需加载分片较多，调高阈值消除告警噪声
    chunkSizeWarningLimit: 900,
  },
});
