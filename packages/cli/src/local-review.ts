/** 本地评审读同一份持久记录；无需云端、网络连接或加载 server/Vite。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { JoploError, localReviewStatus, type LocalReviewSession } from '@joplo-app/core';
import { listLocalReviews, localReviewDir, localReviewFile, localReviewOwnerAlive, localReviewWatcherDir, readLocalReview, writeLocalReview } from '@joplo-app/core/node';
import { terminalText } from './cloud-error.ts';
import { localFeedbackEvent, writeFeedbackEvent, type FeedbackStreamIo } from './feedback-stream.ts';
const terminalLines = (text: string) => text.split('\n').map(line => terminalText(line)).join('\n');

export type ReviewFilter = { session?: string; option?: string; all?: boolean };
export function reviewSessions(dir: string, filter: ReviewFilter = {}): LocalReviewSession[] {
  const root = fs.realpathSync(path.resolve(dir));
  return (filter.session ? [readLocalReview(root, filter.session)] : listLocalReviews(root))
    .filter(s => !filter.option || s.optionId === filter.option)
    .filter(s => filter.all || filter.session || localReviewStatus(s) === 'open' && localReviewOwnerAlive(s));
}
export function reviewSummary(session: LocalReviewSession) {
  return { id: session.id, instanceId: session.instanceId, projectDir: session.projectDir, featureId: session.featureId,
    optionId: session.optionId, revision: session.revision, status: localReviewStatus(session), alive: localReviewOwnerAlive(session),
    events: session.events.length, createdAt: session.createdAt, url: session.url };
}
export function reviewLine(s: LocalReviewSession): string {
  return terminalText(`${s.id}  ${localReviewStatus(s)}  ${s.optionId}  ${s.projectDir}  ${s.url}`);
}

/** fs.watch 唤醒 + 500ms 校验兜底。每个监听器持有自己的游标，不会“消费掉”别人的事件。 */
export async function watchLocalReview(dir: string, opts: ReviewFilter & { after?: number; json?: boolean }, io: FeedbackStreamIo, signal?: AbortSignal): Promise<number> {
  const root = fs.realpathSync(path.resolve(dir));
  const matches = reviewSessions(root, opts);
  if (!matches.length) throw new JoploError('NOT_FOUND', 'No matching local review. Run joplo dev, then joplo review list in this project');
  if (matches.length !== 1) throw new JoploError('USAGE', `Multiple local reviews match. Pass --session <id> (or --option <id>):\n${matches.map(reviewLine).join('\n')}`);
  const first = matches[0]!;
  let cursor = opts.after ?? 0;
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > first.events.length) throw new JoploError('USAGE', `after must be an integer from 0 to ${first.events.length}`);
  io.err(terminalLines(`Watching ${first.id} · ${first.optionId}\nProject: ${root}\nInstance: ${first.instanceId}\nRevision: ${first.revision}\nReview: ${first.url}\n`) + 'Feedback streams to stdout; approval ends this command. Ctrl+C stops only the watcher.\n');

  const file = localReviewFile(root, first.id);
  const lease = path.join(localReviewWatcherDir(root, first.id), `${crypto.randomUUID()}.json`);
  let lastStat = '';
  let lastLease = 0;
  let previousRequest = cursor ? first.events[cursor - 1]!.requestId : null;
  return new Promise<number>((resolve, reject) => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let watcher: fs.FSWatcher | undefined;
    let finished = false;
    const finish = (code: number, error?: unknown) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      watcher?.close();
      signal?.removeEventListener('abort', abort);
      try { fs.rmSync(lease, { force: true }); } catch { /* 短租约会自动失效。 */ }
      if (error) reject(error); else resolve(code);
    };
    const abort = () => { io.err('Stopped watching; the review remains open.\n'); finish(130); };
    const pump = () => {
      if (finished) return;
      try {
        if (signal?.aborted) return abort();
        const stat = fs.statSync(file, { bigint: true });
        const stamp = `${stat.mtimeNs}:${stat.size}`;
        if (stamp !== lastStat) {
          const s = readLocalReview(root, first.id);
          if (s.instanceId !== first.instanceId || s.revision !== first.revision || s.optionId !== first.optionId || s.ownerPid !== first.ownerPid || s.events.length < cursor || (previousRequest && s.events[cursor - 1]?.requestId !== previousRequest))
            throw new JoploError('INVALID_SCHEMA', 'Review identity or event history changed unexpectedly; refusing to switch sessions');
          for (const e of s.events.slice(cursor)) {
            writeFeedbackEvent(localFeedbackEvent(s, e), !!opts.json, io);
            cursor = e.seq;
            previousRequest = e.requestId;
          }
          lastStat = stamp;
          const status = localReviewStatus(s);
          if (status === 'approved') { io.err('Review approved. Watch completed.\n'); return finish(0); }
          if (status === 'closed') { io.err('Review closed without approval. Run joplo review list for the current session.\n'); return finish(1); }
        }
        if (!localReviewOwnerAlive(first)) throw new JoploError('NOT_FOUND', 'The owning Joplo instance stopped without approval. Restart joplo dev and select its new review session');
        if (Date.now() - lastLease > 3000) {
          writeLocalReview(lease, { pid: process.pid, expiresAt: Date.now() + 10_000 });
          lastLease = Date.now();
        }
      } catch (e) { finish(1, e); }
    };
    signal?.addEventListener('abort', abort, { once: true });
    // 先订阅再读，避免恰好在启动时提交反馈而丢失通知。
    try { watcher = fs.watch(localReviewDir(root), { persistent: false }, (_event, name) => { if (!name || name.toString() === path.basename(file)) pump(); }); watcher.on('error', () => { watcher?.close(); }); }
    catch { /* 不支持 fs.watch 的文件系统使用定时校验。 */ }
    timer = setInterval(pump, 500);
    pump();
  });
}
