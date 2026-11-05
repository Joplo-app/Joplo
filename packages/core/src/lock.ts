import { lstat, mkdir, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import lockfile from 'proper-lockfile';
import { JoploError } from './result.ts';
/** 只操作绑定项目内部的普通文件/目录；拒绝内部符号链接。 */
export async function safePath(
  dir: string,
  ...parts: string[]
): Promise<string> {
  const root = await realpath(dir);
  const target = resolve(root, ...parts);
  const rel = relative(root, target);
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new JoploError('PERMISSION_DENIED', '路径超出项目目录');
  let cursor = root;
  for (const part of rel.split('/').filter(Boolean)) {
    cursor = resolve(cursor, part);
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw new JoploError('PERMISSION_DENIED', '项目内部不允许符号链接');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  return target;
}
export async function withProjectLock<T>(
  dir: string,
  run: (assertOwned: () => void) => Promise<T>,
): Promise<T> {
  const meta = await safePath(dir, '.joplo');
  await mkdir(meta, { recursive: true });
  const lockPath = await safePath(dir, '.joplo', 'lock');
  let compromised: Error | undefined;
  const release = await lockfile.lock(await realpath(dir), {
    lockfilePath: lockPath,
    realpath: false,
    stale: 10000,
    update: 2000,
    retries: { retries: 150, factor: 1, minTimeout: 100, maxTimeout: 100 },
    onCompromised: (e) => {
      compromised = e;
    },
  });
  try {
    return await run(() => {
      if (compromised)
        throw new JoploError('REVISION_CONFLICT', '写锁失效，请重读项目后重试');
    });
  } finally {
    await release();
  }
}
