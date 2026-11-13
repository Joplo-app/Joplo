import { JoploError } from '@joplo-app/core';
import { CloudError } from './cloud-error.ts';
import { nonempty, type CloudClient } from './cloud.ts';
import { DECISION_KINDS, SHARE_ID } from './cloud-feedback.ts';

export type CloudCommentInput = {
  shareId: string;
  reviewId: string;
  body: string;
  version: number;
  workId: string;
  scenario: string;
  position: number;
  stepId?: string;
  layer?: string;
  element?: string;
  elementLabel?: string;
};
export type CloudDecisionInput = {
  shareId: string;
  kind: string;
  featureId?: string;
  workId?: string;
  targetId: string;
  note?: string;
  expectedVersion: number;
};

const id = (value: unknown, name: string, max = 256): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new JoploError('USAGE', `${name} is required and must contain at most ${max} characters`);
  return value;
};
const version = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) throw new JoploError('USAGE', 'version must be a positive integer');
  return value;
};
const share = (value: string) => { if (!SHARE_ID.test(value)) throw new JoploError('USAGE', 'share must be a 10-character share id'); return value; };
async function write(client: CloudClient, path: string, tokenBody: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { token } = await client.requireAuth();
  try { return await client.request(path, token, tokenBody); }
  catch (e) {
    if (e instanceof CloudError && e.code === 'CONFLICT') throw new CloudError('CONFLICT', 'The review changed or already has a decision. Read the current share version and feedback before retrying; no retry was sent');
    throw e;
  }
}

export async function submitCloudComment(client: CloudClient, input: CloudCommentInput): Promise<{ id: string }> {
  share(input.shareId); version(input.version);
  if (!input.body.trim() || input.body.length > 10_000) throw new JoploError('USAGE', 'body must contain 1-10000 characters');
  if (!Number.isSafeInteger(input.position) || input.position < 0) throw new JoploError('USAGE', 'position must be a non-negative integer');
  if (input.position === 0 && input.stepId !== undefined || input.position > 0 && !input.stepId) throw new JoploError('USAGE', 'stepId is required after a step and must be omitted at position 0');
  const data = await write(client, `/api/v1/shares/${input.shareId}/feedback/comments`, {
    shareId: input.shareId,
    reviewId: id(input.reviewId, 'reviewId', 64),
    expectedVersion: input.version,
    body: input.body,
    anchor: {
      version: input.version, workId: id(input.workId, 'workId'), scenario: id(input.scenario, 'scenario'), step: input.position,
      stepId: input.position === 0 ? null : input.stepId!, layer: input.layer ?? null,
      element: input.element ? { id: id(input.element, 'element'), label: input.elementLabel ?? input.element } : null,
    },
  });
  if (!nonempty(data.id) || data.id.length > 64) throw new CloudError('INVALID_RESPONSE');
  return { id: data.id };
}

export async function resolveCloudComment(client: CloudClient, shareId: string, commentId: string, resolved: boolean): Promise<{ success: true }> {
  share(shareId); id(commentId, 'commentId', 64);
  const data = await write(client, `/api/v1/shares/${shareId}/feedback/comments/${encodeURIComponent(commentId)}/resolution`, { shareId, commentId, resolved });
  if (data.success !== true) throw new CloudError('INVALID_RESPONSE');
  return { success: true };
}

export async function submitCloudDecision(client: CloudClient, input: CloudDecisionInput): Promise<{ id: string }> {
  share(input.shareId); version(input.expectedVersion);
  if (!(DECISION_KINDS as readonly string[]).includes(input.kind)) throw new JoploError('USAGE', `kind must be ${DECISION_KINDS.join(', ')}`);
  if (input.note !== undefined && input.note.length > 10_000) throw new JoploError('USAGE', 'note must contain at most 10000 characters');
  if (['answer', 'reject_rule'].includes(input.kind) && !input.note?.trim()) throw new JoploError('USAGE', `${input.kind} requires --note so the decision is actionable`);
  const data = await write(client, `/api/v1/shares/${input.shareId}/feedback/decisions`, {
    shareId: input.shareId, kind: input.kind, featureId: input.featureId ?? null, workId: input.workId ?? null,
    targetId: id(input.targetId, 'targetId'), note: input.note?.trim() || null, expectedVersion: input.expectedVersion,
  });
  if (!nonempty(data.id) || data.id.length > 64) throw new CloudError('INVALID_RESPONSE');
  return { id: data.id };
}

export async function retractCloudDecision(client: CloudClient, shareId: string, decisionId: string): Promise<{ success: true }> {
  share(shareId); id(decisionId, 'decisionId', 64);
  const data = await write(client, `/api/v1/shares/${shareId}/feedback/decisions/${encodeURIComponent(decisionId)}/retract`, { shareId, decisionId });
  if (data.success !== true) throw new CloudError('INVALID_RESPONSE');
  return { success: true };
}

export async function voteCloudReview(client: CloudClient, input: { shareId: string; reviewId: string; featureId: string; workId: string; expectedVersion: number }): Promise<{ success: true }> {
  share(input.shareId); version(input.expectedVersion);
  const data = await write(client, `/api/v1/shares/${input.shareId}/feedback/votes`, { shareId: input.shareId, reviewId: id(input.reviewId, 'reviewId', 64), featureId: id(input.featureId, 'featureId'), workId: id(input.workId, 'workId'), expectedVersion: input.expectedVersion });
  if (data.success !== true) throw new CloudError('INVALID_RESPONSE');
  return { success: true };
}
