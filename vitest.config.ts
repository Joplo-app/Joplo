import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// 测试一律不读写真实的 ~/.joplo（看板进程注册表、server.json）
const JOPLO_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-home-vitest-'));

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/test/**/*.test.ts'],
    env: { JOPLO_HOME },
  },
});
