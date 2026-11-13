/** 普通 GET 轮询；优先使用 Cloud 的持久事件游标，旧 Cloud 保留有损快照兼容模式。 */
import { createHash } from 'node:crypto';
import { JoploError } from '@joplo-app/core';
import { CloudError, terminalText } from './cloud-error.ts';
import { fetchFeedback, SHARE_ID, type Feedback } from './cloud-feedback.ts';
import type { CloudClient } from './cloud.ts';
import { writeFeedbackEvent, type FeedbackStreamEvent, type FeedbackStreamIo } from './feedback-stream.ts';

export const DEFAULT_FEEDBACK_POLL_SECONDS = 15;
const PAGE_LIMIT = 200;
export type CloudFeedbackWatchOptions = { workId: string; work?: string; version?: number; interval?: number; json?: boolean; cursor?: string };
export function validateCloudWatchOptions(options: CloudFeedbackWatchOptions): void {
  if (!/^[A-Za-z][\w-]{0,63}(?:\.[A-Za-z][\w-]{0,63})?$/.test(options.workId ?? ''))
    throw new JoploError('USAGE', 'Cloud feedback watch requires --work <key|feature.option> so another work cannot finish this review');
  const interval = options.interval ?? DEFAULT_FEEDBACK_POLL_SECONDS;
  if (!Number.isInteger(interval) || interval < 10 || interval > 30) throw new JoploError('USAGE', 'interval must be an integer from 10 to 30 seconds');
  if (options.version !== undefined && (!Number.isSafeInteger(options.version) || options.version < 1)) throw new JoploError('USAGE', 'version must be a positive integer');
  if (options.cursor !== undefined && !/^(0|[1-9]\d{0,18})$/.test(options.cursor)) throw new JoploError('USAGE', 'cursor must be a non-negative decimal string of at most 19 digits');
}

export type CloudReviewBinding = { server: string; shareId: string; version: number; workId: string; featureId: string | null };
export function cloudReviewIdentity(binding: CloudReviewBinding) {
  return {
    source: 'cloud' as const,
    sessionId: `share_${createHash('sha256').update(JSON.stringify([binding.server, binding.shareId, binding.version, binding.workId])).digest('hex').slice(0, 24)}`,
    server: binding.server, shareId: binding.shareId, version: binding.version,
    revision: String(binding.version), featureId: binding.featureId, workId: binding.workId,
  };
}
/** 只输出绑定版本与方案的记录；先反馈／其他决定，再输出结束监听的确认。 */
export function cloudFeedbackEvents(feedback: Feedback, binding: CloudReviewBinding): FeedbackStreamEvent[] {
  const meta = cloudReviewIdentity(binding);
  const events: FeedbackStreamEvent[] = [];
  for (const c of feedback.comments) {
    if (c.version !== binding.version || c.workId !== binding.workId) continue;
    events.push({ ...meta, eventId: `${meta.sessionId}:comment:${c.id}`, type: 'feedback', createdAt: c.createdAt, body: c.body, author: c.author,
      context: { scenarioId: c.scenario, position: c.step, stepId: c.stepId, element: c.element, sceneId: null, route: null, source: null },
    });
  }
  for (const d of feedback.decisions) {
    if (d.version !== binding.version || d.featureId !== binding.featureId) continue;
    if (d.kind === 'pick' ? d.targetId !== binding.workId : d.workId !== binding.workId && !(d.workId === null && binding.featureId != null && d.featureId === binding.featureId)) continue;
    events.push({ ...meta, eventId: `${meta.sessionId}:decision:${d.id}`, type: d.kind === 'pick' ? 'approved' : 'decision', createdAt: d.decidedAt, decision: d });
  }
  return events.sort((a, b) => Number(a.type === 'approved') - Number(b.type === 'approved') || Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.eventId.localeCompare(b.eventId));
}

type WatchState = { version?: number; binding: CloudReviewBinding | null; seen: Set<string>; mode: 'unknown' | 'incremental' | 'legacy' };
function bind(feedback: Feedback, client: CloudClient, shareId: string, options: CloudFeedbackWatchOptions, state: WatchState, io: FeedbackStreamIo): { ok: true } | { ok: false; code: number } {
  if (feedback.share.version < 1) throw new CloudError('CONFLICT', 'This share has no published version to review');
  state.version ??= feedback.share.version;
  if (!state.binding) {
    const work = feedback.works.find(w => w.id === options.workId);
    if (!work && feedback.share.version === state.version) throw new JoploError('NOT_FOUND', `Work ${options.workId} is not in share version ${state.version}`);
    state.binding = { server: client.server, shareId, workId: options.workId, featureId: work?.featureId ?? null, version: state.version };
    io.err(`Bound to ${shareId} / ${options.work ?? options.workId} at version ${state.version}.\n`);
  }
  if (feedback.share.version !== state.version) {
    const meta = cloudReviewIdentity(state.binding);
    writeFeedbackEvent({ ...meta, type: 'closed', eventId: `${meta.sessionId}:version-changed:${feedback.share.version}`, createdAt: new Date(client.now()).toISOString(), reason: 'source_changed' }, !!options.json, io, id => id === options.workId ? options.work ?? id : id);
    io.err(`Share version changed from ${state.version} to ${feedback.share.version}. Review the new version and start a new watcher.\n`);
    return { ok: false, code: 1 };
  }
  return { ok: true };
}
function emit(events: FeedbackStreamEvent[], state: WatchState, options: CloudFeedbackWatchOptions, io: FeedbackStreamIo, cursor?: string): boolean {
  for (const original of events) {
    if (state.seen.has(original.eventId)) continue;
    const event = cursor === undefined ? original : { ...original, cursor };
    writeFeedbackEvent(event, !!options.json, io, id => id === options.workId ? options.work ?? id : id);
    state.seen.add(original.eventId);
  }
  return events.some(event => event.type === 'approved');
}

export async function watchCloudFeedback(client: CloudClient, shareId: string, options: CloudFeedbackWatchOptions, io: FeedbackStreamIo, signal?: AbortSignal): Promise<number> {
  validateCloudWatchOptions(options);
  if (!SHARE_ID.test(shareId)) throw new JoploError('USAGE', 'share must be a 10-character share id');
  const intervalMs = (options.interval ?? DEFAULT_FEEDBACK_POLL_SECONDS) * 1000;
  const state: WatchState = { version: options.version, binding: null, seen: new Set(), mode: 'unknown' };
  let failures = 0;
  let legacyWarned = false;
  let cursor = options.cursor ?? '0';
  io.err(`Polling ${terminalText(client.server)} share ${shareId} / ${options.work ?? options.workId} every ${intervalMs / 1000}s. Ctrl+C stops only this watcher.\n`);
  try {
    for (;;) {
      signal?.throwIfAborted();
      try {
        // 单次请求：网络错误也按轮询节奏重试，不使用 1/2/4 秒快速重试。
        const first = await fetchFeedback(client, shareId, { signal, retry: false, ...(state.mode === 'legacy' ? {} : { cursor, limit: PAGE_LIMIT }) });
        failures = 0;
        const incremental = typeof first.nextCursor === 'string' && typeof first.hasMore === 'boolean';
        if (!incremental) state.mode = 'legacy';
        else if (state.mode !== 'incremental') {
          state.mode = 'incremental';
          io.err('Using Cloud event history: resolved comments and applied/retracted decisions are recoverable by cursor.\n');
        }
        const bound = bind(first, client, shareId, options, state, io);
        if (!bound.ok) return bound.code;
        const binding = state.binding!;
        if (state.mode === 'legacy') {
          if (!legacyWarned) { io.err('The current Cloud API exposes unresolved comments and unapplied decisions, not complete event history. Records resolved/applied between polls may be missed.\n'); legacyWarned = true; }
          const events = cloudFeedbackEvents(first, binding);
          if (emit(events, state, options, io)) {
            io.err(`${binding.featureId === null ? 'Work' : 'Option'} ${options.work ?? options.workId} approved for share version ${state.version}. Watch completed.\n`);
            return 0;
          }
        } else {
          const pages = [first];
          let next = first.nextCursor!;
          let hasMore = first.hasMore!;
          while (hasMore) {
            signal?.throwIfAborted();
            const requested = next;
            const page = await fetchFeedback(client, shareId, { signal, retry: false, cursor: requested, limit: PAGE_LIMIT });
            if (typeof page.nextCursor !== 'string' || typeof page.hasMore !== 'boolean' || page.hasMore && page.nextCursor === requested) throw new CloudError('INVALID_RESPONSE', 'Cloud feedback cursor did not advance');
            const pageBound = bind(page, client, shareId, options, state, io);
            if (!pageBound.ok) return pageBound.code;
            pages.push(page); next = page.nextCursor; hasMore = page.hasMore;
          }
          const comments = new Map<string, Feedback['comments'][number]>();
          const decisions = new Map<string, Feedback['decisions'][number]>();
          for (const page of pages) {
            for (const comment of page.comments) if (comment.version === state.version && comment.workId === options.workId) comments.set(comment.id, comment);
            for (const decision of page.decisions) if (decision.version === state.version && decision.featureId === binding.featureId) decisions.set(decision.id, decision);
          }
          const activeDecisions = [...decisions.values()].filter(decision => decision.change !== 'retracted' && !decision.retractedAt);
          const events = cloudFeedbackEvents({ ...first, comments: [...comments.values()], decisions: activeDecisions }, binding);
          const approved = emit(events, state, options, io, next);
          cursor = next;
          if (pages.some(page => page.comments.length || page.decisions.length)) io.err(`Cloud cursor: ${cursor}\n`);
          if (approved) {
            io.err(`${binding.featureId === null ? 'Work' : 'Option'} ${options.work ?? options.workId} approved for share version ${state.version}. Watch completed.\n`);
            return 0;
          }
        }
      } catch (e) {
        signal?.throwIfAborted();
        if (!(e instanceof CloudError) || e.code !== 'NETWORK') throw e;
        failures++;
        const delay = Math.max(intervalMs, Math.min(30_000, intervalMs * 2 ** Math.min(failures - 1, 2)), e.retry?.afterMs ?? 0);
        io.err(`Cloud is temporarily unavailable. Retrying in ${Math.ceil(delay / 1000)}s.\n`);
        await client.sleep(delay, signal);
        continue;
      }
      await client.sleep(intervalMs, signal);
    }
  } catch (e) {
    if (signal?.aborted) { io.err('Stopped polling; no review decision was changed.\n'); return 130; }
    throw e;
  }
}
