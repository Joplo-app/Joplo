import { LocalReviewLocation, type LocalReviewSession, type Project } from '@joplo-app/core';

export type ReviewDraft = { sessionId: string; text: string; context: LocalReviewLocation; pageTitle: string; scenarioName: string | null; requestId?: string };
export function captureReviewDraft(session: LocalReviewSession, project: Project, context: LocalReviewLocation, text = ''): ReviewDraft {
  return { sessionId: session.id, text, context, pageTitle: project.scenes[context.sceneId]?.name ?? context.sceneId,
    scenarioName: context.scenarioId ? project.scenarios[context.scenarioId]?.name ?? context.scenarioId : null };
}
export function reviewDraftKey(projectId: string, optionId: string): string { return `joplo.review.draft:${projectId}:${optionId}`; }
export function readReviewDraft(key: string): ReviewDraft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(key) ?? 'null') as ReviewDraft | null;
    return d && typeof d.sessionId === 'string' && typeof d.text === 'string' && typeof d.pageTitle === 'string' && (d.requestId === undefined || typeof d.requestId === 'string') && (d.scenarioName === null || typeof d.scenarioName === 'string') && LocalReviewLocation.safeParse(d.context).success ? d : null;
  } catch { return null; }
}
export function saveReviewDraft(key: string, draft: ReviewDraft | null): void {
  try { if (draft?.text) sessionStorage.setItem(key, JSON.stringify(draft)); else sessionStorage.removeItem(key); }
  catch { /* 存储不可用时，本页内存仍保留草稿。 */ }
}
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
/** 给 Agent 的命令：跟住整个项目（所有方案、改源码后的新一轮），而不是只绑这一轮会话。 */
export function localReviewCommand(session: LocalReviewSession): string {
  return `npx joplo feedback watch ${quote(session.projectDir)} --local --follow --json`;
}
