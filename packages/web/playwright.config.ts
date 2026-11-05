import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

// e2e 一律不读写真实的 ~/.joplo
process.env.JOPLO_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-home-e2e-'));

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1600, height: 1000 },
    trace: 'retain-on-failure',
  },
});
