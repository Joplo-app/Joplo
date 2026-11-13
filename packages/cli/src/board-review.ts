import { randomUUID } from 'node:crypto';
import { LocalReviewWrite, stateAt, JoploError, type Project } from '@joplo-app/core';
import { checkWithProject } from './check.ts';
import { resolveWorkId } from './work.ts';
import { reviewSessions } from './local-review.ts';
import type { BoardClient } from './board.ts';

export type LocalReviewWriteOptions = {
  work?: string;
  session?: string;
  body?: string;
  scenario?: string;
  position?: number;
  scene?: string;
  requestId?: string;
  approve?: boolean;
};

async function projectAndWork(dir: string, work: string | undefined, sessionWork: string | undefined): Promise<{ project: Project; workId: string }> {
  const result = await checkWithProject(dir);
  if (!result.project) throw new JoploError('INVALID_SCHEMA', 'The project must compile before writing a local review');
  const requested = work ?? sessionWork;
  if (!requested) throw new JoploError('USAGE', '--work <key|feature.option> is required unless --session identifies the work');
  return { project: result.project, workId: resolveWorkId(result.project, requested) };
}

export async function writeBoardReview(client: BoardClient, dir: string, options: LocalReviewWriteOptions): Promise<{ sessionId: string; requestId: string; type: 'feedback' | 'approved'; state: unknown }> {
  const listed = reviewSessions(dir, { session: options.session });
  if (options.session && listed.length !== 1) throw new JoploError('NOT_FOUND', 'The requested local review session was not found in this project');
  const { project, workId } = await projectAndWork(dir, options.work, listed[0]?.workId);
  const matches = reviewSessions(dir, { session: options.session, workId });
  if (!matches.length) throw new JoploError('NOT_FOUND', 'No active local review matches. Run npx joplo feedback list --local --all, or restart joplo dev');
  if (matches.length !== 1) throw new JoploError('USAGE', `Multiple local reviews match. Pass --session <id>:\n${matches.map(session => session.id).join('\n')}`);
  const session = matches[0]!;
  const requestId = options.requestId ?? randomUUID();
  let input: unknown;
  if (options.approve) {
    for (const key of ['body', 'scenario', 'position', 'scene'] as const) if (options[key] !== undefined) throw new JoploError('USAGE', `--${key} cannot be used when approving a review`);
    input = { sessionId: session.id, requestId, type: 'approved' };
  } else {
    if (!options.body?.trim() || options.body.length > 10_000) throw new JoploError('USAGE', '--body must contain 1-10000 characters');
    if (!options.scenario || options.position === undefined) throw new JoploError('USAGE', 'Local feedback requires --scenario <id> and --position <n>; these describe the reviewed position, not playback control');
    const scenario = project.scenarios[options.scenario];
    if (!scenario || scenario.workId !== workId) throw new JoploError('INVALID_REFERENCE', `Scenario ${options.scenario} does not belong to ${workId}`);
    if (!Number.isSafeInteger(options.position) || options.position < 0 || options.position > scenario.steps.length) throw new JoploError('USAGE', `--position must be an integer from 0 to ${scenario.steps.length}`);
    input = { sessionId: session.id, requestId, type: 'feedback', body: options.body, context: { scenarioId: scenario.id, position: options.position, sceneId: options.scene ?? stateAt(project, scenario.id, options.position).sceneId } };
  }
  const parsed = LocalReviewWrite.safeParse(input);
  if (!parsed.success) throw new JoploError('USAGE', 'Invalid local review request; requestId must be a UUID');
  const state = await client.review(dir, parsed.data);
  return { sessionId: session.id, requestId, type: parsed.data.type, state };
}
