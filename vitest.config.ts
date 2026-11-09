import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// 测试一律不读写真实的 ~/.joplo（看板进程注册表、server.json）
const JOPLO_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-home-vitest-'));

export default defineConfig({
  // web 包的 `@/` 别名（与 packages/web/vite.config.ts 一致）：组件的渲染测试需要
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'packages/web/src') } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['plugins/*/test/**/*.test.{ts,tsx}', 'packages/*/test/**/*.test.{ts,tsx}', 'scripts/test/**/*.test.ts'],
    env: { JOPLO_HOME },
  },
});
