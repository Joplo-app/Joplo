import { LocalReviewLocation, stateAt, type LocalReviewSession, type LocalReviewState, type Project } from '@joplo-app/core/runtime';

/** 只让仍属于当前作品、仍可见的位置成为复审入口；旧反馈位置可能已随源码删除。 */
export function localReviewJump(project: Project, workId: string, location: LocalReviewLocation | null): LocalReviewLocation | null {
  if (!location?.scenarioId) return null;
  const scenario = project.scenarios[location.scenarioId];
  const work = project.works[workId];
  if (!work || !scenario || scenario.workId !== workId || !Number.isSafeInteger(location.position) || location.position < 0 || location.position > scenario.steps.length || !project.scenes[location.sceneId]) return null;
  try {
    return stateAt(project, scenario.id, location.position).sceneId === location.sceneId || Object.values(work.layers).some(l => l.sceneId === location.sceneId) ? location : null;
  } catch { return null; }
}

/** 同一条反馈多次回执时展示最新处理结果，避免同时显示互相冲突的状态。 */
export function localReviewUpdates(project: Project, workId: string, state: LocalReviewState) {
  const receipts = state.session.events.filter(e => e.type === 'receipt');
  const latest = new Map(receipts.map(e => [e.targetEventId, e]));
  const original = new Map([
    ...(state.previousFeedback ?? []).map(e => [e.eventId, e.context] as const),
    ...state.session.events.flatMap(e => e.type === 'feedback' ? [[`${state.session.id}:${e.seq}`, e.context] as const] : []),
  ]);
  return [
    ...[...latest.values()].map(e => ({ eventId: e.targetEventId, body: e.targetBody, status: e.status, note: e.note,
      target: localReviewJump(project, workId, e.target) ?? localReviewJump(project, workId, original.get(e.targetEventId) ?? null) })),
    ...(state.previousFeedback ?? []).filter(e => !latest.has(e.eventId)).map(e => ({ eventId: e.eventId, body: e.body, status: null, note: null,
      target: localReviewJump(project, workId, e.context) })),
  ];
}

export function isReviewLocationValid(project: Project, workId: string, location: LocalReviewLocation): boolean {
  const work = project.works[workId];
  const scene = project.scenes[location.sceneId];
  if (!work || !scene) return false;
  const layerScenes = Object.values(work.layers).map(l => l.sceneId);
  if (location.scenarioId !== null) {
    const scenario = project.scenarios[location.scenarioId];
    if (!scenario || scenario.workId !== workId || !Number.isSafeInteger(location.position) || location.position < 0 || location.position > scenario.steps.length) return false;
    try {
      return stateAt(project, scenario.id, location.position).sceneId === scene.id || layerScenes.includes(scene.id);
    } catch { return false; }
  }
  return location.position === 0 && (scene.workId === workId || layerScenes.includes(scene.id));
}

export type ReviewDraft = { sessionId: string; text: string; context: LocalReviewLocation; pageTitle: string; scenarioName: string | null; requestId?: string };
export function captureReviewDraft(session: LocalReviewSession, project: Project, context: LocalReviewLocation, text = ''): ReviewDraft {
  return { sessionId: session.id, text, context, pageTitle: project.scenes[context.sceneId]?.name ?? context.sceneId,
    scenarioName: context.scenarioId ? project.scenarios[context.scenarioId]?.name ?? context.scenarioId : null };
}
/** Keep continuous review unblocked across hot reloads: empty drafts track the live page, and non-empty drafts auto-rebind when their page/step still exists. */
export function reconcileReviewDraft(draft: ReviewDraft | null, session: LocalReviewSession, project: Project, currentContext: LocalReviewLocation | null): ReviewDraft | null {
  if (!draft || !draft.text.trim()) {
    return currentContext ? captureReviewDraft(session, project, currentContext) : null;
  }
  if (draft.sessionId === session.id) return draft;
  if (isReviewLocationValid(project, session.workId, draft.context)) {
    return captureReviewDraft(session, project, draft.context, draft.text);
  }
  return draft;
}
export function reviewDraftKey(projectId: string, workId: string): string { return `joplo.review.draft:${projectId}:${workId}`; }
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

/** 本地评审的标题：独立作品的会话没有所属功能。 */
export function localReviewTitle(session: { featureName: string | null; workTitle: string }): string {
  return session.featureName ? `${session.featureName} / ${session.workTitle}` : session.workTitle;
}
