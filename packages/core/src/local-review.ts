/** 本地评审的持久化契约。浏览器、服务端和 CLI 共用；不依赖 Node。 */
import { z } from 'zod';

export const LOCAL_REVIEW_VERSION = 2 as const;
export const LOCAL_REVIEW_MAX_BODY = 10_000;
export const LOCAL_REVIEW_MAX_EVENTS = 1000;
export const LOCAL_REVIEW_MAX_FILE_BYTES = 16 * 1024 * 1024;
export const LocalReviewId = z.string().regex(/^rv_[a-f0-9]{32}$/);
const ref = z.string().min(1).max(300);
export const LocalReviewLocation = z.strictObject({
  scenarioId: ref.nullable(),
  position: z.number().int().min(0).max(10000),
  sceneId: ref,
});
export type LocalReviewLocation = z.infer<typeof LocalReviewLocation>;
export const LocalReviewContext = LocalReviewLocation.extend({
  route: z.string().min(1).max(2000),
  stepId: ref.nullable(),
  source: z.string().max(2000).nullable(),
  pageTitle: z.string().max(2000),
  scenarioName: z.string().max(2000).nullable(),
});
export type LocalReviewContext = z.infer<typeof LocalReviewContext>;
const eventBase = {
  sessionId: LocalReviewId,
  seq: z.number().int().positive(),
  requestId: z.string().uuid(),
  createdAt: z.iso.datetime(),
};
export const LocalReviewEvent = z.discriminatedUnion('type', [
  z.strictObject({ ...eventBase, type: z.literal('feedback'), body: z.string().trim().min(1).max(LOCAL_REVIEW_MAX_BODY), context: LocalReviewContext }),
  z.strictObject({ ...eventBase, type: z.literal('approved') }),
  z.strictObject({ ...eventBase, type: z.literal('closed'), reason: z.enum(['source_changed', 'compile_error', 'work_removed', 'server_stopped']) }),
]);
export type LocalReviewEvent = z.infer<typeof LocalReviewEvent>;
export const LocalReviewSession = z.strictObject({
  v: z.literal(LOCAL_REVIEW_VERSION),
  id: LocalReviewId,
  instanceId: z.string().uuid(),
  ownerPid: z.number().int().positive(),
  projectId: ref,
  projectDir: z.string().min(1),
  projectName: z.string(),
  featureId: ref,
  featureName: z.string(),
  workId: ref,
  workTitle: z.string(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.iso.datetime(),
  url: z.string().url(),
  events: z.array(LocalReviewEvent).max(LOCAL_REVIEW_MAX_EVENTS),
}).superRefine((s, ctx) => {
  const requests = new Set<string>();
  s.events.forEach((e, i) => {
    if (e.sessionId !== s.id || e.seq !== i + 1 || requests.has(e.requestId) || (e.type !== 'feedback' && i !== s.events.length - 1))
      ctx.addIssue({ code: 'custom', message: 'Invalid review event order, session, or request id', path: ['events', i] });
    requests.add(e.requestId);
  });
});
export type LocalReviewSession = z.infer<typeof LocalReviewSession>;
export const LocalReviewWrite = z.discriminatedUnion('type', [
  z.strictObject({ sessionId: LocalReviewId, requestId: z.string().uuid(), type: z.literal('feedback'), body: z.string().trim().min(1).max(LOCAL_REVIEW_MAX_BODY), context: LocalReviewLocation }),
  z.strictObject({ sessionId: LocalReviewId, requestId: z.string().uuid(), type: z.literal('approved') }),
]);
export type LocalReviewWrite = z.infer<typeof LocalReviewWrite>;
export type LocalReviewState = { session: LocalReviewSession; watchers: number };
export function localReviewStatus(session: LocalReviewSession): 'open' | 'approved' | 'closed' {
  const last = session.events.at(-1);
  return last?.type === 'approved' ? 'approved' : last?.type === 'closed' ? 'closed' : 'open';
}
