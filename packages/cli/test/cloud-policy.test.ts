import { afterEach, expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import * as cloud from '../src/cloud.ts';
vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, spawn: vi.fn(original.spawn) };
});
afterEach(() => { vi.mocked(spawn).mockReset(); });
test('B7/R2 真实交互判定函数优先遵守 JSON、CI、JOPLO_NONINTERACTIVE 与双 TTY', () => {
  // 不通过 CloudDependencies.interactive 绕过生产判断。
  const decide = (cloud as unknown as { isInteractive: (env: NodeJS.ProcessEnv, format?: string, stdinTTY?: boolean, stdoutTTY?: boolean) => boolean }).isInteractive;
  expect(typeof decide).toBe('function');
  expect(decide({}, 'text', true, true)).toBe(true);
  expect(decide({}, 'json', true, true)).toBe(false);
  expect(decide({ CI: '1' }, 'text', true, true)).toBe(false);
  expect(decide({ CI: '' }, 'text', true, true)).toBe(true);
  for (const CI of ['0', 'false', 'FALSE']) expect(decide({ CI }, 'text', true, true)).toBe(true);
  expect(decide({ JOPLO_NONINTERACTIVE: '1' }, 'text', true, true)).toBe(false);
  expect(decide({}, 'text', false, true)).toBe(false);
  expect(decide({}, 'text', true, false)).toBe(false);
});
test('R3 win32 实际 spawn rundll32，不经过 cmd，允许百分号 URL', async () => {
  vi.mocked(spawn).mockImplementation((() => {
    const child = new EventEmitter(); process.nextTick(() => child.emit('close', 0)); return child;
  }) as typeof spawn);
  const url = 'https://cloud.joplo.app/device?user_code=ABCD%2DEFGH';
  expect(await cloud.openBrowser(url, 'win32')).toBe(true);
  expect(spawn).toHaveBeenCalledWith('rundll32', ['url.dll,FileProtocolHandler', url], expect.objectContaining({ stdio: 'ignore', windowsHide: true }));
});
