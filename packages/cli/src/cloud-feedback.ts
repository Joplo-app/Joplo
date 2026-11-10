/**
 * `joplo feedback`（云端契约 8.3）：拉取评审页上的决定和未解决的评论，或标记决定已写回源码。
 *
 * - shareId：`--share <id>`，否则读项目的 `.joplo/cloud.json`（必须属于当前 server）。
 * - GET  /api/v1/shares/{id}/feedback → { share: { id, version }, decisions, comments }（只含未撤回、未写回的决定与未解决的评论）。
 * - POST /api/v1/shares/{id}/feedback/applied { decisionIds, ref? } → { applied }（幂等）。
 * - 远端字符串只做长度与控制字符处理；结构不对时 INVALID_RESPONSE，不回显远端正文。
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { JoploError } from '@joplo-app/core';
import { CloudError, terminalText } from './cloud-error.ts';
import { object, type CloudClient } from './cloud.ts';

export const SHARE_ID = /^[A-Za-z0-9]{10}$/;
const DECISION_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const DECISION_KINDS = ['pick', 'confirm_rule', 'reject_rule', 'answer'] as const;

export type FeedbackDecision = { id: string; kind: string; workId: string | null; featureId: string; targetId: string; note: string | null; decidedAt: string; version: number };
export type FeedbackComment = { id: string; version: number; workId: string; scenario: string; step: number; stepId: string | null; element: { id: string; label: string } | null; body: string; author: { name: string }; createdAt: string };
export type Feedback = { share: { id: string; version: number }; decisions: FeedbackDecision[]; comments: FeedbackComment[] };

const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const iso = (v: unknown): v is string => typeof v === 'string' && v.length <= 64 && Number.isFinite(Date.parse(v));
const int = (v: unknown, min: number): v is number => Number.isSafeInteger(v) && (v as number) >= min;

/** shareId：--share 优先，否则 .joplo/cloud.json（server 必须一致）。 */
export async function feedbackShareId(client: CloudClient, dir: string, explicit?: string): Promise<string> {
  if (explicit !== undefined) {
    if (!SHARE_ID.test(explicit)) throw new JoploError('USAGE', '--share must be a 10-character share id');
    return explicit;
  }
  let record: Record<string, unknown>;
  try {
    record = object(JSON.parse(await readFile(join(resolve(dir), '.joplo/cloud.json'), 'utf8')));
  } catch {
    throw new JoploError('USAGE', 'No share record in .joplo/cloud.json. Run npx joplo share first, or pass --share <id>');
  }
  if (record.server !== client.server) throw new JoploError('USAGE', `The share record belongs to ${typeof record.server === 'string' ? terminalText(record.server).slice(0, 200) : 'another server'}. Pass --server with that address, or --share <id>`);
  // 评审分享优先（评审链接、评论和决定都在它上面），没有时用主链接（契约 8.1）
  const invalid = () => new JoploError('USAGE', 'The share record in .joplo/cloud.json is invalid. Run npx joplo share again, or pass --share <id>');
  if (record.review !== undefined) {
    const id = object(record.review).shareId;
    if (typeof id !== 'string' || !SHARE_ID.test(id)) throw invalid();
    return id;
  }
  if (typeof record.shareId !== 'string' || !SHARE_ID.test(record.shareId)) throw invalid();
  return record.shareId;
}

function readDecision(raw: unknown): FeedbackDecision {
  const d = object(raw);
  if (!str(d.id, 64) || !d.id || !str(d.kind, 32) || !/^[a-z_]+$/.test(d.kind) || !str(d.featureId, 256) || !str(d.targetId, 256) || !(d.workId === null || str(d.workId, 256)) || !(d.note === null || d.note === undefined || str(d.note, 10_000)) || !iso(d.decidedAt) || !int(d.version, 1)) throw new CloudError('INVALID_RESPONSE');
  return { id: d.id, kind: d.kind, workId: d.workId as string | null, featureId: d.featureId, targetId: d.targetId, note: typeof d.note === 'string' ? d.note : null, decidedAt: d.decidedAt, version: d.version };
}

function readComment(raw: unknown): FeedbackComment {
  const c = object(raw), author = object(c.author), element = c.element === null || c.element === undefined ? null : object(c.element);
  if (!str(c.id, 64) || !c.id || !int(c.version, 1) || !str(c.scenario, 256) || !str(c.workId, 256) || !int(c.step, 0) || !(c.stepId === null || c.stepId === undefined || str(c.stepId, 256)) || !str(c.body, 10_000) || !str(author.name, 200) || !iso(c.createdAt)) throw new CloudError('INVALID_RESPONSE');
  if (element && (!str(element.id, 256) || !str(element.label, 200))) throw new CloudError('INVALID_RESPONSE');
  return { id: c.id, version: c.version, workId: c.workId as string, scenario: c.scenario, step: c.step, stepId: typeof c.stepId === 'string' ? c.stepId : null, element: element ? { id: element.id as string, label: element.label as string } : null, body: c.body, author: { name: author.name }, createdAt: c.createdAt };
}

export async function fetchFeedback(client: CloudClient, shareId: string, options: { signal?: AbortSignal; retry?: boolean } = {}): Promise<Feedback> {
  options.signal?.throwIfAborted();
  const { token } = await client.requireAuth();
  const request = () => feedbackRequest(client, `/api/v1/shares/${shareId}/feedback`, token, undefined, options.signal);
  const d = options.retry === false ? await request() : await client.retry(request, { signal: options.signal });
  const share = object(d.share);
  if (share.id !== shareId || !int(share.version, 0) || !Array.isArray(d.decisions) || !Array.isArray(d.comments) || d.decisions.length > 1000 || d.comments.length > 5000) throw new CloudError('INVALID_RESPONSE');
  const out = { share: { id: shareId, version: share.version }, decisions: d.decisions.map(readDecision), comments: d.comments.map(readComment) };
  if (JSON.stringify(out).includes(token)) throw new CloudError('INVALID_RESPONSE');
  return out;
}

/** 解析 --applied 的逗号列表：去重、去空白，格式不对时 USAGE。 */
export function decisionIds(text: string): string[] {
  const ids = [...new Set(text.split(',').map((s) => s.trim()).filter(Boolean))];
  if (!ids.length || ids.length > 200 || ids.some((id) => !DECISION_ID.test(id))) throw new JoploError('USAGE', '--applied must be a comma-separated list of 1-200 decision ids (letters, digits, _ or -)');
  return ids;
}

export async function markApplied(client: CloudClient, shareId: string, ids: string[], ref?: string): Promise<{ applied: string[] }> {
  if (ref !== undefined && (!ref.trim() || ref.trim().length > 200 || /[\x00-\x1f\x7f]/.test(ref))) throw new JoploError('USAGE', '--ref must contain 1-200 printable characters');
  const { token } = await client.requireAuth();
  const d = await client.retry(() => feedbackRequest(client, `/api/v1/shares/${shareId}/feedback/applied`, token, { decisionIds: ids, ...(ref !== undefined ? { ref: ref.trim() } : {}) }));
  if (!Array.isArray(d.applied) || d.applied.some((id) => typeof id !== 'string' || !DECISION_ID.test(id))) throw new CloudError('INVALID_RESPONSE');
  return { applied: d.applied as string[] };
}

/** 404 在这里是“分享不存在或没有评审数据”，不是 share 的“用 --new 新建”。 */
async function feedbackRequest(client: CloudClient, path: string, token: string, body?: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  try {
    return await client.request(path, token, body, { signal });
  } catch (e) {
    if (e instanceof CloudError && e.code === 'NOT_FOUND') throw new CloudError('NOT_FOUND', 'The share does not exist or has no review data. Check --share, or run npx joplo share again');
    if (e instanceof CloudError && (e.code === 'FORBIDDEN' || e.code === 'ACCOUNT_UNAVAILABLE') && !token.startsWith('jpk_')) throw new CloudError('FORBIDDEN', 'Only the owner of the share can read or apply its feedback');
    throw e;
  }
}

const line = (s: string, max = 300) => {
  const t = terminalText(s.replace(/[\r\n\t]+/g, ' ')).trim();
  return [...t].length > max ? `${[...t].slice(0, max - 1).join('')}…` : t;
};
/** pick 的 targetId 是方案 id（`功能.方案`）；只写方案键时补上功能。 */
const optionLabel = (d: FeedbackDecision) => (d.targetId.includes('.') ? d.targetId : `${d.featureId}.${d.targetId}`);

export function decisionLine(d: FeedbackDecision): string {
  const note = d.note?.trim() ? line(d.note) : '';
  switch (d.kind) {
    case 'pick':
      return `Pick option ${line(optionLabel(d))} for feature ${line(d.featureId)}${note ? ` (note: ${note})` : ''}`;
    case 'confirm_rule':
      return `Confirm rule ${line(d.targetId)}${note ? ` (note: ${note})` : ''}`;
    case 'reject_rule':
      return `Reject rule ${line(d.targetId)}: ${note || 'no reason given; ask the user'}`;
    case 'answer':
      return `Answer to question ${line(d.targetId)}: ${note || '(empty)'}`;
    default:
      return `${line(d.kind)} ${line(d.targetId)}${note ? `: ${note}` : ''}`;
  }
}

export function commentLines(c: FeedbackComment): string[] {
  const where = [`scenario ${line(c.scenario)}`, `step ${c.step}${c.stepId ? ` (${line(c.stepId)})` : ''}`, ...(c.element ? [`element ${line(c.element.id)} "${line(c.element.label, 80)}"`] : [])].join(' · ');
  return [`  [${line(c.id)}] ${where} — ${line(c.author.name, 80)}, version ${c.version}, ${line(c.createdAt)}`, ...c.body.split(/\r?\n/).slice(0, 20).map((l) => `      ${line(l, 500)}`)];
}

/** 文本输出：决定在前（Agent 按它们改源码），再是未解决评论（只作参考），最后提示下一步。 */
export function feedbackText(f: Feedback): string[] {
  const out = [`Share ${f.share.id} · version ${f.share.version}`];
  out.push(f.decisions.length ? `Decisions not yet applied (${f.decisions.length}):` : 'Decisions not yet applied: none');
  for (const d of f.decisions) out.push(`  [${line(d.id)}] ${decisionLine(d)} — version ${d.version}, ${line(d.decidedAt)}`);
  out.push(f.comments.length ? `Unresolved comments (${f.comments.length}):` : 'Unresolved comments: none');
  for (const c of f.comments) out.push(...commentLines(c));
  if (f.decisions.length) out.push(`Next: update the source as decided (npx joplo skill publish), run npx joplo check, then npx joplo feedback --applied ${f.decisions.map((d) => d.id).join(',')}`);
  return out;
}
