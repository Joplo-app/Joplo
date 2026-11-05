import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import lockfile from 'proper-lockfile';
import { withProjectLock } from '../src/lock.ts';
vi.mock('proper-lockfile', () => ({ default: { lock: vi.fn() } }));
const dirs: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
async function dir() {
  const d = await mkdtemp(join(tmpdir(), 'joplo-lock-review-'));
  dirs.push(d);
  return d;
}
test('R4 release 失败不能盖掉主错误，也不能将成功报成失败', async () => {
  const d = await dir();
  vi.mocked(lockfile.lock).mockImplementation(async (_dir, options: any) => {
    await mkdir(options.lockfilePath, { recursive: true });
    return async () => {
      throw Object.assign(new Error('released'), { code: 'ERELEASED' });
    };
  });
  await expect(
    withProjectLock(d, async () => {
      throw new Error('主错误');
    }),
  ).rejects.toThrow('主错误');
  expect(await withProjectLock(d, async () => 42)).toBe(42);
});
test('R5 等锁超时应返回可重试 LOCK_BUSY', async () => {
  const d = await dir();
  vi.mocked(lockfile.lock).mockRejectedValue(
    Object.assign(new Error('busy'), { code: 'ELOCKED' }),
  );
  await expect(withProjectLock(d, async () => 42)).rejects.toMatchObject({
    code: 'REVISION_CONFLICT',
    details: { reason: 'LOCK_BUSY' },
  });
}, 20000);
test('过期但未被替换的租约仍释放自己的锁，不留下活跃孤锁', async () => {
  const d = await dir();
  const fs = await import('node:fs/promises');
  const release = vi.fn(async () => {
    await fs.rmdir(join(d, '.joplo/lock'));
  });
  vi.mocked(lockfile.lock).mockImplementation(async (_dir, options: any) => {
    await mkdir(options.lockfilePath, { recursive: true });
    return release;
  });
  await expect(
    withProjectLock(d, async (assertOwned) => {
      await fs.utimes(join(d, '.joplo/lock'), new Date(0), new Date(0));
      assertOwned();
    }),
  ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  expect(release).toHaveBeenCalledOnce();
});
