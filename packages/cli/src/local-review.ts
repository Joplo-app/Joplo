/** 本地评审读同一份持久记录；无需云端、网络连接或加载 server/Vite。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { JoploError, localReviewStatus, type LocalReviewSession } from '@joplo-app/core';
import { listLocalReviews, localReviewDir, localReviewFile, localReviewOwnerAlive, localReviewWatcherDir, readLocalReview, writeLocalReview } from '@joplo-app/core/node';
import { terminalText } from './cloud-error.ts';
import { localFeedbackEvent, writeFeedbackEvent, type FeedbackStreamIo } from './feedback-stream.ts';
const terminalLines = (text: string) => text.split('\n').map(line => terminalText(line)).join('\n');

export type ReviewFilter = { session?: string; workId?: string; all?: boolean; labels?: Record<string, string> };
export function reviewSessions(dir: string, filter: ReviewFilter = {}): LocalReviewSession[] {
  const root = fs.realpathSync(path.resolve(dir));
  return (filter.session ? [readLocalReview(root, filter.session)] : listLocalReviews(root))
    .filter(s => !filter.workId || s.workId === filter.workId)
    .filter(s => filter.all || filter.session || localReviewStatus(s) === 'open' && localReviewOwnerAlive(s));
}
export function reviewSummary(session: LocalReviewSession) {
  return { id: session.id, instanceId: session.instanceId, projectDir: session.projectDir, featureId: session.featureId,
    workId: session.workId, revision: session.revision, status: localReviewStatus(session), alive: localReviewOwnerAlive(session),
    events: session.events.length, createdAt: session.createdAt, url: session.url };
}
export function reviewLine(s: LocalReviewSession, labels: Record<string, string> = {}): string {
  return terminalText(`${s.id}  ${localReviewStatus(s)}  ${labels[s.workId] ?? s.workId}  ${s.projectDir}  ${s.url}`);
}

/** fs.watch 唤醒 + 500ms 校验兜底。每个监听器持有自己的游标，不会“消费掉”别人的事件。 */
export async function watchLocalReview(dir: string, opts: ReviewFilter & { after?: number; json?: boolean }, io: FeedbackStreamIo, signal?: AbortSignal): Promise<number> {
  const root = fs.realpathSync(path.resolve(dir));
  const matches = reviewSessions(root, opts);
  if (!matches.length) throw new JoploError('NOT_FOUND', 'No matching local review. Run joplo dev, then joplo review list in this project');
  if (matches.length !== 1) throw new JoploError('USAGE', `Multiple local reviews match. Pass --session <id> (or --work <id>):\n${matches.map(s => reviewLine(s, opts.labels)).join('\n')}`);
  const first = matches[0]!;
  let cursor = opts.after ?? 0;
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > first.events.length) throw new JoploError('USAGE', `after must be an integer from 0 to ${first.events.length}`);
  io.err(terminalLines(`Watching ${first.id} · ${opts.labels?.[first.workId] ?? first.workId}\nProject: ${root}\nInstance: ${first.instanceId}\nRevision: ${first.revision}\nReview: ${first.url}\n`) + 'Feedback streams to stdout; approval ends this command. Ctrl+C stops only the watcher.\n');

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
          if (s.instanceId !== first.instanceId || s.revision !== first.revision || s.workId !== first.workId || s.ownerPid !== first.ownerPid || s.events.length < cursor || (previousRequest && s.events[cursor - 1]?.requestId !== previousRequest))
            throw new JoploError('INVALID_SCHEMA', 'Review identity or event history changed unexpectedly; refusing to switch sessions');
          for (const e of s.events.slice(cursor)) {
            writeFeedbackEvent(localFeedbackEvent(s, e), !!opts.json, io, id => opts.labels?.[id] ?? id);
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

/**
 * `--follow`：跟住整个项目的本地评审，而不是某一个会话。
 * - 每个方案各有一个评审会话；改源码会关闭旧会话、开新会话。这里自动挂上所有正在进行的会话和之后新开的会话，
 *   事件自带 sessionId / workId / eventId，Agent 不用先 list 再选。
 * - 某个方案确认（approved）不结束监听，其他方案和下一轮仍会到达；只有看板进程全部停止（1）或中断（130）才结束。
 * - 每个会话各自的游标与身份校验与单会话监听相同；正在跟的会话都写“正在监听”的租约。
 */
export async function followLocalReviews(dir: string, opts: ReviewFilter & { after?: number; json?: boolean; once?: boolean; since?: string }, io: FeedbackStreamIo, signal?: AbortSignal): Promise<number> {
  if (opts.session || opts.after) throw new JoploError('USAGE', '--follow watches every review round of the project; it cannot be combined with --session or --after');
  const since = opts.since === undefined ? null : Date.parse(opts.since);
  if (since !== null && (!Number.isFinite(since) || !/^\d{4}-\d{2}-\d{2}T/.test(opts.since!)))
    throw new JoploError('USAGE', `--since takes an ISO time such as 2026-11-08T17:08:09.192Z (the createdAt of the last event you handled); got "${opts.since}"`);
  const root = fs.realpathSync(path.resolve(dir));
  const startedAt = new Date().toISOString();
  const wanted = (s: LocalReviewSession) => !opts.workId || s.workId === opts.workId;
  const initial = listLocalReviews(root).filter(s => wanted(s) && localReviewStatus(s) === 'open' && localReviewOwnerAlive(s));
  if (!initial.length) throw new JoploError('NOT_FOUND', 'No active local review in this project. Start joplo dev for it first, then run this command again');
  type Tracked = { session: LocalReviewSession; cursor: number; previousRequest: string | null; stamp: string; lease: string };
  const tracked = new Map<string, Tracked>();
  const done = new Set<string>();
  // Directory scan cache: only files whose size/mtime changed are parsed again.
  const known = new Map<string, { stamp: string; session: LocalReviewSession }>();
  const scan = () => {
    let files: string[];
    try { files = fs.readdirSync(localReviewDir(root)); } catch { files = []; }
    const out: LocalReviewSession[] = [];
    for (const f of files) {
      if (!/^rv_[a-f0-9]{32}\.json$/.test(f)) continue;
      const id = f.slice(0, -5);
      let stat: fs.BigIntStats;
      try { stat = fs.statSync(path.join(localReviewDir(root), f), { bigint: true }); } catch { continue; }
      const stamp = `${stat.mtimeNs}:${stat.size}`;
      const hit = known.get(id);
      let session: LocalReviewSession;
      try { session = hit?.stamp === stamp ? hit.session : readLocalReview(root, id); }
      catch (e) {
        if (e instanceof JoploError && e.code === 'NOT_FOUND' || (e as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw e;
      }
      known.set(id, { stamp, session });
      out.push(session);
    }
    return out;
  };
  const track = (s: LocalReviewSession) => {
    tracked.set(s.id, { session: s, cursor: 0, previousRequest: null, stamp: '', lease: path.join(localReviewWatcherDir(root, s.id), `${crypto.randomUUID()}.json`) });
  };
  initial.forEach(track);
  io.err(terminalLines(`Following ${initial.length} review round(s) in ${root}\n${initial.map(s => `  ${opts.labels?.[s.workId] ?? s.workId}  ${s.url}`).join('\n')}\n`)
    + (opts.once
      ? 'Exits as soon as new feedback or an approval arrives (--once), so a host that wakes the agent when a background command ends delivers it.\n'
      : 'New rounds after source edits and other options are picked up automatically. Feedback streams to stdout; Ctrl+C stops only the watcher.\n'));
  // --once：本轮 pump 里写出的事件；有就退出 0，并告诉 Agent 怎样接着听（--since 最后一条的时间：不重放、不遗漏）
  let emitted: { createdAt: string }[] = [];
  let lastLease = 0;
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
      for (const t of tracked.values()) { try { fs.rmSync(t.lease, { force: true }); } catch { /* 短租约会自动失效。 */ } }
      if (error) reject(error); else resolve(code);
    };
    const abort = () => { io.err('Stopped following; reviews remain open.\n'); finish(130); };
    const drain = (t: Tracked) => {
      const file = localReviewFile(root, t.session.id);
      const stat = fs.statSync(file, { bigint: true });
      const stamp = `${stat.mtimeNs}:${stat.size}`;
      if (stamp === t.stamp) return;
      const s = readLocalReview(root, t.session.id);
      if (s.instanceId !== t.session.instanceId || s.revision !== t.session.revision || s.workId !== t.session.workId || s.events.length < t.cursor || (t.previousRequest && s.events[t.cursor - 1]?.requestId !== t.previousRequest))
        throw new JoploError('INVALID_SCHEMA', 'Review identity or event history changed unexpectedly; refusing to switch sessions');
      for (const e of s.events.slice(t.cursor)) {
        // --since：已经处理过的事件（重新启动时会重放开着的轮次）只推进游标，不再输出
        if (since === null || Date.parse(e.createdAt) > since) {
          writeFeedbackEvent(localFeedbackEvent(s, e), !!opts.json, io, id => opts.labels?.[id] ?? id);
          // --once 只为评审人的动作退出：feedback / approved。改源码带来的 closed 是 Agent 自己的工作，照常输出但不唤醒
          if (e.type === 'feedback' || e.type === 'approved') emitted.push({ createdAt: e.createdAt });
        }
        t.cursor = e.seq;
        t.previousRequest = e.requestId;
      }
      t.stamp = stamp;
      t.session = s;
      if (localReviewStatus(s) !== 'open') {
        try { fs.rmSync(t.lease, { force: true }); } catch { /* 短租约会自动失效。 */ }
        tracked.delete(s.id);
        done.add(s.id);
      }
    };
    const pump = () => {
      if (finished) return;
      try {
        if (signal?.aborted) return abort();
        // 新一轮（改源码后）与之后才出现的会话：只要是开着的，或在开始监听之后创建的，都挂上。
        const sessions = scan().filter(wanted);
        for (const s of sessions) {
          if (tracked.has(s.id) || done.has(s.id)) continue;
          if ((localReviewStatus(s) === 'open' && localReviewOwnerAlive(s)) || s.createdAt >= startedAt) track(s);
        }
        emitted = [];
        for (const t of [...tracked.values()]) drain(t);
        if (opts.once && emitted.length) {
          const last = emitted.map(e => e.createdAt).sort().at(-1)!;
          io.err(`Received ${emitted.length} reviewer event(s); exiting (--once). Handle them, then listen again with:\n  npx joplo feedback watch ${dir} --local --follow --once --since ${last} --json\n`);
          return finish(0);
        }
        // The board is gone once no review of this project (open, approved or closed) has a live owner process.
        if (!sessions.some(localReviewOwnerAlive)) {
          io.err('The board stopped. Restart joplo dev, then run this command again.\n');
          return finish(1);
        }
        if (Date.now() - lastLease > 3000) {
          for (const t of tracked.values()) writeLocalReview(t.lease, { pid: process.pid, expiresAt: Date.now() + 10_000 });
          lastLease = Date.now();
        }
      } catch (e) { finish(1, e); }
    };
    signal?.addEventListener('abort', abort, { once: true });
    try { watcher = fs.watch(localReviewDir(root), { persistent: false }, () => pump()); watcher.on('error', () => { watcher?.close(); }); }
    catch { /* 不支持 fs.watch 的文件系统使用定时校验。 */ }
    timer = setInterval(pump, 500);
    pump();
  });
}
