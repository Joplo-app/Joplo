import { entriesOf, projectThemes } from '@joplo-app/core';
import crypto from 'node:crypto';
import { JoploError, LOCAL_REVIEW_VERSION, LOCAL_REVIEW_MAX_EVENTS, LOCAL_REVIEW_MAX_FILE_BYTES, LocalReviewEventId, LocalReviewSession, localReviewStatus, stateAt, type LocalReviewContext, type LocalReviewEvent, type LocalReviewLocation, type LocalReviewState, type LocalReviewWrite, type Project } from '@joplo-app/core';
import { listLocalReviews, readLocalReview, localReviewFile, localReviewWatcherCount, writeLocalReview } from '@joplo-app/core/node';

/** 对象键的插入顺序不构成新版本；数组顺序属于方案内容。 */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
export function localReviewRevision(project: Project, workId: string): string {
  const option = project.works[workId]!;
  const feature = option.featureId ? project.features[option.featureId] : undefined;
  const own = <T extends { workId?: string | null; featureId?: string }>(values: Record<string, T>) =>
    Object.fromEntries(Object.entries(values).filter(([, v]) => v.workId === workId || (v.workId == null && (v.featureId == null || v.featureId === option.featureId))));
  const value = { name: project.name, description: project.description, theme: project.theme, themes: projectThemes(project), autoFocus: project.autoFocus,
    feature, work: option, scenes: own(project.scenes), scenarios: own(project.scenarios), rules: own(project.rules), issues: own(project.issues),
    cases: Object.fromEntries(Object.entries(project.cases).filter(([, c]) => c.featureId === option.featureId)),
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function localReviewContext(project: Project, workId: string, input: LocalReviewLocation): LocalReviewContext {
  const option = project.works[workId];
  const scene = project.scenes[input.sceneId];
  if (!option || !scene) throw new JoploError('INVALID_REFERENCE', 'Review page or option no longer exists');
  const layerScenes = Object.values(option.layers).map(l => l.sceneId);
  let stepId: string | null = null;
  let source = scene.root.source ?? option.source ?? null;
  let scenarioName: string | null = null;
  if (input.scenarioId !== null) {
    const scenario = project.scenarios[input.scenarioId];
    if (!scenario || scenario.workId !== workId || input.position > scenario.steps.length)
      throw new JoploError('INVALID_REFERENCE', 'Review scenario or step does not belong to this option');
    const state = stateAt(project, scenario.id, input.position);
    if (state.sceneId !== scene.id && !layerScenes.includes(scene.id)) throw new JoploError('INVALID_REFERENCE', 'Review page is not visible at this step');
    const step = scenario.steps[input.position - 1];
    stepId = step?.id ?? null;
    source = step?.source ?? source;
    scenarioName = scenario.name;
  } else if (input.position !== 0 || (scene.workId !== workId && !layerScenes.includes(scene.id))) {
    throw new JoploError('INVALID_REFERENCE', 'Review page does not belong to this option');
  }
  return { ...input, route: scene.route, pageTitle: scene.name, stepId, source, scenarioName };
}

/** 一个 Hub 是一个不可复用的实例身份；不同 Hub 即使打开同一项目，也写不同的会话文件。 */
export class LocalReviewHub {
  readonly instanceId = crypto.randomUUID();
  private current = new Map<string, LocalReviewSession>();
  private sessions = new Map<string, LocalReviewSession>();
  constructor(private baseUrl: () => string) {}
  private key(dir: string, option: string) { return `${dir}\0${option}`; }
  private persist(session: LocalReviewSession) {
    if (!LocalReviewSession.safeParse(session).success) throw new JoploError('INVALID_SCHEMA', 'Invalid local review record');
    if (Buffer.byteLength(JSON.stringify(session)) > LOCAL_REVIEW_MAX_FILE_BYTES - (localReviewStatus(session) === 'open' ? 16_384 : 0))
      throw new JoploError('USAGE', 'Local review storage limit reached. Confirm this review before starting another');
    writeLocalReview(localReviewFile(session.projectDir, session.id), session);
    this.sessions.set(session.id, session);
    this.current.set(this.key(session.projectDir, session.workId), session);
    return session;
  }
  private closeSession(session: LocalReviewSession, reason: Extract<LocalReviewEvent, { type: 'closed' }>['reason']) {
    if (localReviewStatus(session) !== 'open') return;
    this.persist({ ...session, events: [...session.events, { sessionId: session.id, seq: session.events.length + 1, requestId: crypto.randomUUID(), createdAt: new Date().toISOString(), type: 'closed', reason }] });
  }
  sync(dir: string, projectId: string, project: Project) {
    for (const s of [...this.current.values()]) if (s.projectDir === dir && !project.works[s.workId]) {
      this.closeSession(s, 'work_removed');
      this.current.delete(this.key(dir, s.workId));
    }
    for (const entry of entriesOf(project)) for (const workId of entry.featureId === null ? [entry.workId] : project.features[entry.featureId]!.workIds) {
      const option = workId ? project.works[workId] : undefined;
      if (!option) continue;
      const revision = localReviewRevision(project, option.id);
      const old = this.current.get(this.key(dir, option.id));
      if (old?.revision === revision && localReviewStatus(old) !== 'closed') continue;
      if (old) this.closeSession(old, 'source_changed');
      const id = `rv_${crypto.randomBytes(16).toString('hex')}`;
      this.persist({ v: LOCAL_REVIEW_VERSION, id, instanceId: this.instanceId, ownerPid: process.pid, projectId, projectDir: dir, projectName: project.name,
        featureId: entry.featureId, featureName: entry.featureId === null ? null : entry.title, workId: option.id, workTitle: option.title,
        revision, createdAt: new Date().toISOString(), url: `${this.baseUrl()}#/${encodeURIComponent(projectId)}/f/${encodeURIComponent(entry.id)}?o=${encodeURIComponent(option.id)}`,
        events: [],
      });
    }
  }
  invalidate(dir: string, reason: 'source_changed' | 'compile_error' | 'server_stopped') {
    for (const session of [...this.current.values()]) if (session.projectDir === dir) {
      this.closeSession(session, reason);
      this.current.delete(this.key(dir, session.workId));
    }
  }
  state(dir: string, workId: string): LocalReviewState {
    const session = this.current.get(this.key(dir, workId));
    if (!session) throw new JoploError('NOT_FOUND', 'No current review for this option. Wait for a successful compilation');
    const older = listLocalReviews(dir).filter(s => s.id !== session.id && s.workId === workId && s.createdAt <= session.createdAt && s.events.some(e => e.type === 'feedback'));
    const previous = older.find(s => localReviewStatus(s) !== 'open') ?? older[0];
    const previousFeedback = previous?.events.flatMap(e => e.type === 'feedback'
      ? [{ eventId: `${previous.id}:${e.seq}`, sessionId: previous.id, seq: e.seq, body: e.body, createdAt: e.createdAt, context: e.context }] : []);
    return { session, watchers: localReviewWatcherCount(dir, session.id), ...(previousFeedback ? { previousFeedback } : {}) };
  }
  write(dir: string, project: Project, input: LocalReviewWrite): LocalReviewState {
    const session = this.sessions.get(input.sessionId);
    if (!session || session.projectDir !== dir) throw new JoploError('NOT_FOUND', 'Review session does not belong to this project and instance');
    const previous = session.events.find(e => e.requestId === input.requestId);
    if (previous) {
      const sameLocation = (a: LocalReviewLocation | null, b: LocalReviewLocation | null) => a === null || b === null ? a === b : a.sceneId === b.sceneId && a.scenarioId === b.scenarioId && a.position === b.position;
      const same = previous.type === input.type && (previous.type === 'feedback'
        ? input.type === 'feedback' && previous.body === input.body && sameLocation(previous.context, input.context)
        : previous.type === 'receipt' ? input.type === 'receipt' && previous.targetEventId === input.targetEventId && previous.status === input.status && previous.note === (input.note ?? null) && sameLocation(previous.target, input.target ?? null)
        : true);
      if (!same) throw new JoploError('IDEMPOTENCY_MISMATCH', 'Request id was already used for different feedback');
      return this.current.get(this.key(dir, session.workId))?.id === session.id
        ? this.state(dir, session.workId) : { session, watchers: localReviewWatcherCount(dir, session.id) };
    }
    if (this.current.get(this.key(dir, session.workId))?.id !== session.id || localReviewRevision(project, session.workId) !== session.revision)
      throw new JoploError('REVISION_CONFLICT', 'The option changed. Open its current review before submitting');
    if (input.type === 'approved' && localReviewStatus(session) === 'approved') return this.state(dir, session.workId);
    if (localReviewStatus(session) !== 'open') throw new JoploError('REVISION_CONFLICT', 'This review has ended');
    if (input.type !== 'approved' && session.events.length >= LOCAL_REVIEW_MAX_EVENTS - 1)
      throw new JoploError('USAGE', 'This review has reached its feedback limit. Confirm it before starting a new review');
    const base = { sessionId: session.id, seq: session.events.length + 1, requestId: input.requestId, createdAt: new Date().toISOString() };
    let receipt: Extract<LocalReviewEvent, { type: 'receipt' }> | undefined;
    if (input.type === 'receipt') {
      if (!LocalReviewEventId.safeParse(input.targetEventId).success) throw new JoploError('INVALID_REFERENCE', 'Invalid feedback event id');
      const [sourceSessionId, seq] = input.targetEventId.split(':');
      let source: LocalReviewSession;
      try { source = readLocalReview(dir, sourceSessionId!); }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT' || e instanceof JoploError && e.code === 'NOT_FOUND')
          throw new JoploError('INVALID_REFERENCE', 'Referenced feedback was not found in this project');
        throw e;
      }
      const feedback = source.events.find(e => e.seq === Number(seq));
      if (source.workId !== session.workId || feedback?.type !== 'feedback') throw new JoploError('INVALID_REFERENCE', 'Referenced event must be feedback for the same work');
      receipt = { ...base, type: 'receipt', targetEventId: input.targetEventId, targetBody: feedback.body, status: input.status, note: input.note ?? null,
        target: input.target ? localReviewContext(project, session.workId, input.target) : null };
    }
    const event: LocalReviewEvent = receipt ?? (input.type === 'feedback'
      ? { ...base, type: 'feedback', body: input.body, context: localReviewContext(project, session.workId, input.context) }
      : { ...base, type: 'approved' });
    this.persist({ ...session, events: [...session.events, event] });
    return this.state(dir, session.workId);
  }
}
