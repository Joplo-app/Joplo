import { afterEach, expect, it, vi } from 'vitest';
import { compile, type LocalReviewSession } from '@joplo-app/core';
import { reviewSource } from '../../core/test/fixtures/review';
import { captureReviewDraft, localReviewCommand, localReviewTitle, readReviewDraft, reviewDraftKey, saveReviewDraft } from '../src/board/review-model';

afterEach(() => vi.unstubAllGlobals());
const session = { id: 'rv_' + 'a'.repeat(32), projectDir: "/work/a project/it's-a-demo" } as LocalReviewSession;
it('captures the original page and step independently of subsequent navigation', () => {
  const p = compile(reviewSource(), 'dev').project!;
  const original = { scenarioId: 'f.a.main', position: 1, sceneId: p.scenarios['f.a.main']!.initial.sceneId };
  const draft = captureReviewDraft(session, p, original, 'Keep this feedback on the original page');
  const next = captureReviewDraft(session, p, { ...original, scenarioId: 'f.b.only', position: 0 });
  expect(draft.context.scenarioId).toBe('f.a.main');
  expect(draft.context.position).toBe(1);
  expect(next.context.scenarioId).toBe('f.b.only');
  expect(draft.text).toBe('Keep this feedback on the original page');
});
it('preserves pending request identity and text across reloads, with separate option/project drafts', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
  const p = compile(reviewSource(), 'dev').project!;
  const draft = { ...captureReviewDraft(session, p, { scenarioId: 'f.a.main', position: 1, sceneId: p.scenarios['f.a.main']!.initial.sceneId }, 'Unsent draft'), requestId: '4a03cf69-a9da-41ac-b46a-397767b55322' };
  const key = reviewDraftKey('project-a', 'f.a');
  saveReviewDraft(key, draft);
  expect(readReviewDraft(key)).toEqual(draft);
  expect(readReviewDraft(reviewDraftKey('project-b', 'f.a'))).toBeNull();
  expect(readReviewDraft(reviewDraftKey('project-a', 'f.b'))).toBeNull();
  saveReviewDraft(key, null); expect(readReviewDraft(key)).toBeNull();
});
it('survives disabled browser storage and ignores malformed stored context', () => {
  vi.stubGlobal('sessionStorage', { getItem: () => '{"sessionId":"x","text":"draft","context":{}}', removeItem: () => { throw new Error('Blocked'); } });
  expect(readReviewDraft('x')).toBeNull();
  expect(() => saveReviewDraft('x', null)).not.toThrow();
});
it('quotes project paths in the exact-session command without executing their contents', () => {
  // The copied command follows the whole project, so it keeps working across options and new rounds.
  expect(localReviewCommand(session)).toBe("npx joplo feedback watch '/work/a project/it'\\''s-a-demo' --local --follow --json");
});

it('本地评审的独立作品会话只显示作品标题，不显示空功能名或 null', () => {
  const independent = { featureId: null, featureName: null, workId: 'story', workTitle: 'A story' };
  expect(localReviewTitle(independent)).toBe('A story');
  const attached = { featureId: 'invite', featureName: 'Invite', workId: 'invite.a', workTitle: 'A · Dialog' };
  expect(localReviewTitle(attached)).toBe('Invite / A · Dialog');
});
