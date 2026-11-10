/** Node 端本地评审文件：每个会话独占文件，不同进程不能覆盖彼此的会话。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LOCAL_REVIEW_VERSION, LOCAL_REVIEW_MAX_FILE_BYTES, LocalReviewId, LocalReviewSession } from './local-review.ts';
import { JoploError } from './result.ts';

export const localReviewDir = (dir: string) => path.join(dir, '.joplo', 'reviews');
export function localReviewFile(dir: string, sessionId: string): string {
  if (!LocalReviewId.safeParse(sessionId).success) throw new JoploError('USAGE', 'Invalid local review session id');
  return path.join(localReviewDir(dir), `${sessionId}.json`);
}

/** 先完整写入并 fsync，再 rename；读者只会看到完整的新快照。 */
export function writeLocalReview(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(value) + '\n');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(tmp, { force: true });
  }
}

function currentLocalReview(dir: string, sessionId: string): LocalReviewSession | null {
  const file = localReviewFile(dir, sessionId);
  if (fs.statSync(file).size > LOCAL_REVIEW_MAX_FILE_BYTES) throw new JoploError('INVALID_SCHEMA', 'Local review file exceeds 16 MiB');
  const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  // 只读版本号；不解释、不迁移旧记录，当前版本损坏仍照常报错。
  if (value && typeof value === 'object' && 'v' in value && value.v !== LOCAL_REVIEW_VERSION) return null;
  const result = LocalReviewSession.safeParse(value);
  if (!result.success || result.data.id !== sessionId || result.data.projectDir !== fs.realpathSync(dir))
    throw new JoploError('INVALID_SCHEMA', `Invalid local review file: ${file}`);
  return result.data;
}

export function readLocalReview(dir: string, sessionId: string): LocalReviewSession {
  const session = currentLocalReview(dir, sessionId);
  if (!session) throw new JoploError('NOT_FOUND', 'This review session was created by an older version of Joplo; start a new review');
  return session;
}

export function listLocalReviews(dir: string): LocalReviewSession[] {
  let files: string[];
  try { files = fs.readdirSync(localReviewDir(dir)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
  return files.filter(f => /^rv_[a-f0-9]{32}\.json$/.test(f)).flatMap(f => {
    const session = currentLocalReview(dir, f.slice(0, -5));
    return session ? [session] : [];
  })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function localReviewOwnerAlive(session: LocalReviewSession): boolean {
  try { process.kill(session.ownerPid, 0); return true; }
  catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** CLI 的短期租约仅用于显示“正在监听”；评审结果始终由事件文件决定。 */
export const localReviewWatcherDir = (dir: string, id: string) => path.join(localReviewDir(dir), 'watchers', id);
export function localReviewWatcherCount(dir: string, id: string, now = Date.now()): number {
  const folder = localReviewWatcherDir(dir, id);
  let names: string[];
  try { names = fs.readdirSync(folder); } catch { return 0; }
  let count = 0;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const lease = JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8')) as { expiresAt?: number; pid?: number };
      if (typeof lease.expiresAt === 'number' && lease.expiresAt > now && typeof lease.pid === 'number' && Number.isSafeInteger(lease.pid) && lease.pid > 0) {
        process.kill(lease.pid, 0);
        count++;
      }
    } catch { /* 已退出的监听器或不完整的租约不算在线。 */ }
  }
  return count;
}
