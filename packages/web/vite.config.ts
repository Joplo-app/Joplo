/**
 * 独立的 Vite 配置只用于开发看板界面本身（`pnpm web:dev`，没有项目数据时只显示载入提示）。
 * 真正的看板由 `joplo dev`（@joplo-app/server 的 startDev）以内联配置启动：同一个 Vite 服务还负责编译项目与热更新。
 */
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
