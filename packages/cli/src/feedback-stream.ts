/** Agent 读取的统一事件格式；本地和云端保留各自真实的身份与游标，不伪造云端事件序号。 */
import type { LocalReviewEvent, LocalReviewSession } from '@joplo-app/core';
import type { FeedbackDecision } from './cloud-feedback.ts';
import { terminalText } from './cloud-error.ts';

export type FeedbackStreamEvent = {
  source: 'local' | 'cloud';
  eventId: string;
  sessionId: string;
  featureId: string | null;
  workId: string;
  revision: string;
  createdAt: string;
  seq?: number;
  requestId?: string;
  instanceId?: string;
  projectDir?: string;
  server?: string;
  shareId?: string;
  version?: number;
  /** Cloud 增量模式：处理完本事件后可用于 --cursor 的服务端游标。 */
  cursor?: string;
} & (
  | { type: 'feedback'; body: string; context: { scenarioId: string | null; position: number; stepId: string | null; sceneId: string | null; route: string | null; source: string | null; pageTitle?: string; scenarioName?: string | null; element?: { id: string; label: string } | null }; author?: { name: string } }
  | { type: 'approved'; decision?: FeedbackDecision }
  | { type: 'decision'; decision: FeedbackDecision }
  | { type: 'closed'; reason: string }
);
export type FeedbackStreamIo = { out: (s: string) => void; err: (s: string) => void };
export function localFeedbackEvent(session: LocalReviewSession, event: LocalReviewEvent): FeedbackStreamEvent {
  return { source: 'local', eventId: `${session.id}:${event.seq}`, instanceId: session.instanceId, projectDir: session.projectDir,
    featureId: session.featureId, workId: session.workId, revision: session.revision, ...event };
}
export function writeFeedbackEvent(event: FeedbackStreamEvent, json: boolean, io: FeedbackStreamIo, label?: (id: string) => string): void {
  if (json) { io.out(JSON.stringify(event) + '\n'); return; }
  const prefix = `[${event.seq ?? event.eventId}] ${event.type}`;
  const body = event.type === 'feedback'
    ? `${prefix} ${event.context.route ?? event.context.scenarioId ?? label?.(event.workId) ?? event.workId} · step ${event.context.position}\n${event.body.split('\n').map(line => `  ${line}`).join('\n')}`
    : event.type === 'decision' ? `${prefix} ${event.decision.kind} ${event.decision.targetId}${event.decision.note ? `: ${event.decision.note}` : ''}`
    : event.type === 'closed' ? `${prefix} (${event.reason})` : `${prefix} ${label?.(event.workId) ?? event.workId} @ ${event.revision}`;
  io.out(body.split('\n').map(line => terminalText(line)).join('\n') + '\n');
}
