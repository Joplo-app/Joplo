import { mkdtempSync, rmSync } from 'node:fs';

// 只登记本进程创建的临时路径；绝不扫描/删除其他 share 进程的目录。
const pending = new Map<string, boolean>();
function interrupt() {
  for (const [path, recursive] of pending) {
    try { rmSync(path, { recursive, force: true }); } catch { process.stderr.write('Could not clean up cloud temporary files. Check local file permissions.\n'); }
  }
  process.exit(130);
}
export function trackTemporary(path: string, recursive = false): () => void {
  if (pending.size === 0) process.on('SIGINT', interrupt);
  pending.set(path, recursive);
  return () => { pending.delete(path); if (pending.size === 0) process.off('SIGINT', interrupt); };
}
export function temporaryDirectory(prefix: string): { path: string; release: () => void } {
  // 同一同步调用内创建并登记，避免 SIGINT 落在异步 mkdir 与登记之间。
  const path = mkdtempSync(prefix);
  return { path, release: trackTemporary(path, true) };
}
