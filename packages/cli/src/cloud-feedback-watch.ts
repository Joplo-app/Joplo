/** 普通 GET 轮询现有反馈快照；无 SSE / WebSocket，也不写云端或本地评审。 */
import { createHash } from 'node:crypto';
import { JoploError } from '@joplo-app/core';
import { CloudError, terminalText } from './cloud-error.ts';
import { fetchFeedback, SHARE_ID, type Feedback } from './cloud-feedback.ts';
import type { CloudClient } from './cloud.ts';
import { writeFeedbackEvent, type FeedbackStreamEvent, type FeedbackStreamIo } from './feedback-stream.ts';

export const DEFAULT_FEEDBACK_POLL_SECONDS = 15;
export type CloudFeedbackWatchOptions = { option: string; work?: string; version?: number; interval?: number; json?: boolean };
export function validateCloudWatchOptions(options: CloudFeedbackWatchOptions): void {
  if (!/^[A-Za-z][\w-]{0,63}\.[A-Za-z][\w-]{0,63}$/.test(options.option ?? ''))
    throw new JoploError('USAGE', 'Cloud feedback watch requires --work <key|feature.option> so another work cannot finish this review');
  const interval = options.interval ?? DEFAULT_FEEDBACK_POLL_SECONDS;
  if (!Number.isInteger(interval) || interval < 10 || interval > 30) throw new JoploError('USAGE', 'interval must be an integer from 10 to 30 seconds');
  if (options.version !== undefined && (!Number.isSafeInteger(options.version) || options.version < 1)) throw new JoploError('USAGE', 'version must be a positive integer');
}

export type CloudReviewBinding = { server: string; shareId: string; version: number; optionId: string };
export function cloudReviewIdentity(binding: CloudReviewBinding) {
  return {
    source: 'cloud' as const,
    sessionId: `share_${createHash('sha256').update(JSON.stringify([binding.server, binding.shareId, binding.version, binding.optionId])).digest('hex').slice(0, 24)}`,
    server: binding.server, shareId: binding.shareId, version: binding.version,
    revision: String(binding.version), featureId: binding.optionId.split('.')[0]!, optionId: binding.optionId,
  };
}
/** 只输出绑定版本与方案的记录；先反馈／其他决定，再输出结束监听的确认。 */
export function cloudFeedbackEvents(feedback: Feedback, binding: CloudReviewBinding): FeedbackStreamEvent[] {
  const meta = cloudReviewIdentity(binding);
  const events: FeedbackStreamEvent[] = [];
  for (const c of feedback.comments) {
    if (c.version !== binding.version || !c.scenario.startsWith(`${binding.optionId}.`)) continue;
    events.push({ ...meta, eventId: `${meta.sessionId}:comment:${c.id}`, type: 'feedback', createdAt: c.createdAt, body: c.body, author: c.author,
      context: { scenarioId: c.scenario, position: c.step, stepId: c.stepId, element: c.element, sceneId: null, route: null, source: null },
    });
  }
  for (const d of feedback.decisions) {
    if (d.version !== binding.version || d.featureId !== meta.featureId) continue;
    const target = d.targetId.includes('.') ? d.targetId : `${d.featureId}.${d.targetId}`;
    if (d.kind === 'pick' && target !== binding.optionId) continue;
    if (d.kind !== 'pick' && d.targetId.split('.').length >= 3 && !d.targetId.startsWith(`${binding.optionId}.`)) continue;
    events.push({ ...meta, eventId: `${meta.sessionId}:decision:${d.id}`, type: d.kind === 'pick' ? 'approved' : 'decision', createdAt: d.decidedAt, decision: d });
  }
  return events.sort((a, b) => Number(a.type === 'approved') - Number(b.type === 'approved') || Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.eventId.localeCompare(b.eventId));
}

export async function watchCloudFeedback(client: CloudClient, shareId: string, options: CloudFeedbackWatchOptions, io: FeedbackStreamIo, signal?: AbortSignal): Promise<number> {
  validateCloudWatchOptions(options);
  if (!SHARE_ID.test(shareId)) throw new JoploError('USAGE', 'share must be a 10-character share id');
  const intervalMs = (options.interval ?? DEFAULT_FEEDBACK_POLL_SECONDS) * 1000;
  let version = options.version;
  let binding: CloudReviewBinding | null = null;
  let failures = 0;
  const seen = new Set<string>();
  io.err(`Polling ${terminalText(client.server)} share ${shareId} / ${options.work ?? options.option} every ${intervalMs / 1000}s. Ctrl+C stops only this watcher.\n`);
  io.err('The current Cloud API exposes unresolved comments and unapplied decisions, not complete event history. Records resolved/applied between polls may be missed.\n');
  try {
    for (;;) {
      signal?.throwIfAborted();
      let feedback: Feedback;
      try {
        // 单次请求：网络错误也按轮询节奏重试，不使用 1/2/4 秒快速重试。
        feedback = await fetchFeedback(client, shareId, { signal, retry: false });
        failures = 0;
      } catch (e) {
        signal?.throwIfAborted();
        if (!(e instanceof CloudError) || e.code !== 'NETWORK') throw e;
        failures++;
        const delay = Math.max(intervalMs, Math.min(30_000, intervalMs * 2 ** Math.min(failures - 1, 2)), e.retry?.afterMs ?? 0);
        io.err(`Cloud is temporarily unavailable. Retrying in ${Math.ceil(delay / 1000)}s.\n`);
        await client.sleep(delay, signal);
        continue;
      }
      if (feedback.share.version < 1) throw new CloudError('CONFLICT', 'This share has no published version to review');
      version ??= feedback.share.version;
      if (!binding) {
        binding = { server: client.server, shareId, optionId: options.option, version };
        io.err(`Bound to ${shareId} / ${options.work ?? options.option} at version ${version}.\n`);
      }
      if (feedback.share.version !== version) {
        const meta = cloudReviewIdentity(binding);
        writeFeedbackEvent({ ...meta, type: 'closed', eventId: `${meta.sessionId}:version-changed:${feedback.share.version}`, createdAt: new Date(client.now()).toISOString(), reason: 'source_changed' }, !!options.json, io, id => id === options.option ? options.work ?? id : id);
        io.err(`Share version changed from ${version} to ${feedback.share.version}. Review the new version and start a new watcher.\n`);
        return 1;
      }
      const events = cloudFeedbackEvents(feedback, binding);
      for (const event of events) {
        if (seen.has(event.eventId)) continue;
        writeFeedbackEvent(event, !!options.json, io, id => id === options.option ? options.work ?? id : id);
        seen.add(event.eventId);
      }
      if (events.some(e => e.type === 'approved')) {
        io.err(`${options.work && !options.work.includes('.') ? 'Work' : 'Option'} ${options.work ?? options.option} approved for share version ${version}. Watch completed.\n`);
        return 0;
      }
      await client.sleep(intervalMs, signal);
    }
  } catch (e) {
    if (signal?.aborted) { io.err('Stopped polling; no review decision was changed.\n'); return 130; }
    throw e;
  }
}
