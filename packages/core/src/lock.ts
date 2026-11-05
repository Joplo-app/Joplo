import { lstat, mkdir, realpath } from 'node:fs/promises';
import {
  statSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { tryLock, unlock } from 'fs-native-extensions';
import lockfile from 'proper-lockfile';
import { JoploError } from './result.ts';
import { randomUUID } from 'node:crypto';
export async function safePath(
  dir: string,
  ...parts: string[]
): Promise<string> {
  let root: string;
  try {
    root = await realpath(dir);
  } catch (e) {
    if (['ENOENT', 'ENOTDIR'].includes((e as NodeJS.ErrnoException).code ?? ''))
      throw new JoploError('NOT_FOUND', '项目目录不存在');
    throw e;
  }
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
export const lockBusy = () =>
  new JoploError('REVISION_CONFLICT', '项目正被其他写入占用，请重试', {
    details: { reason: 'LOCK_BUSY' },
  });
/** 内核锁保护租约命名空间和同步发布/恢复；文件 inode 永不删除。 */
export async function withCommitGuard<T>(
  dir: string,
  run: () => T | Promise<T>,
): Promise<T> {
  const path = await safePath(dir, '.joplo', 'commit.guard');
  const fd = openSync(path, 'a+', 0o600);
  let granted = false;
  try {
    const deadline = Date.now() + 15000;
    while (!(granted = tryLock(fd))) {
      if (Date.now() >= deadline) throw lockBusy();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return await run();
  } finally {
    try {
      if (granted) unlock(fd);
    } catch {}
    try {
      closeSync(fd);
    } catch {}
  }
}
export async function withProjectLock<T>(
  dir: string,
  run: (assertOwned: () => void) => Promise<T>,
): Promise<T> {
  const meta = await safePath(dir, '.joplo');
  await mkdir(meta, { recursive: true });
  const lockPath = await safePath(dir, '.joplo', 'lock');
  const tokenPath = await safePath(dir, '.joplo', 'lease.token');
  const token = randomUUID();
  let compromised = false;
  let acquired:
    | {
        release: () => Promise<void>;
        identity: NonNullable<ReturnType<typeof statSync>>;
      }
    | undefined;
  const deadline = Date.now() + 15000;
  for (let attempt = 0; attempt <= 150; attempt++) {
    try {
      acquired = await withCommitGuard(dir, async () => {
        const release = await lockfile.lock(await realpath(dir), {
          lockfilePath: lockPath,
          realpath: false,
          stale: 10000,
          update: 2000,
          retries: 0,
          onCompromised: () => {
            compromised = true;
          },
        });
        try {
          writeFileSync(tokenPath, token, { flush: true });
          return { release, identity: statSync(lockPath) };
        } catch (e) {
          try {
            await release();
          } catch {}
          throw e;
        }
      });
      break;
    } catch (e) {
      const busy =
        (e as NodeJS.ErrnoException).code === 'ELOCKED' ||
        (e instanceof JoploError &&
          (e.details as { reason?: string })?.reason === 'LOCK_BUSY');
      if (!busy) throw e;
      if (attempt === 150 || Date.now() >= deadline) throw lockBusy();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  const { release, identity } = acquired!;
  const sameIdentity = () => {
    try {
      const now = statSync(lockPath);
      return (
        now.dev === identity.dev &&
        now.ino === identity.ino &&
        readFileSync(tokenPath, 'utf8') === token
      );
    } catch {
      return false;
    }
  };
  const owned = () => {
    try {
      const now = statSync(lockPath);
      return (
        !compromised &&
        now.dev === identity.dev &&
        now.ino === identity.ino &&
        readFileSync(tokenPath, 'utf8') === token &&
        Date.now() - now.mtimeMs <= 10000
      );
    } catch {
      return false;
    }
  };
  const assertOwned = () => {
    if (!owned())
      throw new JoploError(
        'REVISION_CONFLICT',
        '写锁已失效，请重新读取后重试',
        { details: { reason: 'LOCK_LOST' } },
      );
  };
  try {
    return await run(assertOwned);
  } finally {
    // 与新租约的获取共用内核锁；失去 inode 所有权后绝不释放新持有者的锁。
    try {
      await withCommitGuard(dir, async () => {
        if (sameIdentity() || compromised)
          try {
            await release();
          } catch {}
      });
    } catch {}
  }
}
