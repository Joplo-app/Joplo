import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // 开发模式：/api 代理到已运行的本地服务（JOPLO_API，缺省 http://127.0.0.1:4790）。写接口需要令牌，请优先用 joplo serve。
  server: { host: '127.0.0.1', proxy: { '/api': { target: process.env.JOPLO_API ?? 'http://127.0.0.1:4790', changeOrigin: true } } },
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
