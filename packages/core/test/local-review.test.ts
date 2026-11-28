import crypto from 'node:crypto';
import { expect, it } from 'vitest';
import { LOCAL_REVIEW_MAX_BODY, LOCAL_REVIEW_VERSION, LocalReviewEvent, LocalReviewEventId, LocalReviewReceiptStatus, LocalReviewSession, LocalReviewWrite, localReviewStatus, type LocalReviewEvent as Event } from '../src/local-review.ts';

const id = `rv_${'a'.repeat(32)}`;
const base = () => ({ sessionId: id, seq: 1, requestId: crypto.randomUUID(), createdAt: new Date().toISOString() });
const context = { scenarioId: 'intro.main', position: 1, sceneId: 'intro.page', route: '/', stepId: 'start', source: null, pageTitle: 'Intro', scenarioName: 'Main' };
const receipt = (): Event => ({ ...base(), type: 'receipt', targetEventId: `${id}:1`, targetBody: 'Original feedback', status: 'addressed', note: null, target: context });
const session = (events: Event[]) => ({ v: LOCAL_REVIEW_VERSION, id, instanceId: crypto.randomUUID(), ownerPid: 1, projectId: 'demo', projectDir: '/tmp/demo', projectName: 'Demo', featureId: null, featureName: null,
  workId: 'intro', workTitle: 'Intro', revision: 'a'.repeat(64), createdAt: new Date().toISOString(), url: 'http://localhost:4790/', events: events.map((e, i) => ({ ...e, seq: i + 1 })) });

it('keeps version 2 and permits receipts between feedback and terminal events', () => {
  const feedback: Event = { ...base(), type: 'feedback', body: 'Original feedback', context };
  const approved: Event = { ...base(), type: 'approved' };
  const closed: Event = { ...base(), type: 'closed', reason: 'source_changed' };
  const s = LocalReviewSession.parse(session([feedback, receipt(), receipt(), { ...feedback, requestId: crypto.randomUUID() }, approved]));
  expect(s.v).toBe(2);
  expect(localReviewStatus(s)).toBe('approved');
  expect(localReviewStatus(LocalReviewSession.parse(session([receipt()])))).toBe('open');
  expect(LocalReviewSession.safeParse(session([feedback, receipt(), closed])).success).toBe(true);
  expect(LocalReviewSession.safeParse(session([approved, receipt()])).success).toBe(false);
  expect(LocalReviewSession.safeParse(session([closed, receipt()])).success).toBe(false);
  expect(LocalReviewSession.safeParse(session([])).success).toBe(true);
});

it('validates feedback event ids and all three receipt statuses', () => {
  expect(LocalReviewEventId.parse(`${id}:1000`)).toBe(`${id}:1000`);
  for (const value of [`${id}:0`, `${id}:01`, `${id}:-1`, `${id}:1.5`, `${id}:1:2`, `rv_${'A'.repeat(32)}:1`, '../../secret:1'])
    expect(LocalReviewEventId.safeParse(value).success, value).toBe(false);
  expect(LocalReviewReceiptStatus.options).toEqual(['addressed', 'deferred', 'declined']);
  expect(LocalReviewEvent.safeParse({ ...receipt(), targetBody: ' ' }).success).toBe(false);
  expect(LocalReviewEvent.safeParse({ ...receipt(), note: 'x'.repeat(LOCAL_REVIEW_MAX_BODY + 1) }).success).toBe(false);
  expect(LocalReviewEvent.safeParse({ ...receipt(), status: 'pending' }).success).toBe(false);
});

it('accepts optional write notes and targets, trims text, and requires enriched event fields', () => {
  const input = { sessionId: id, requestId: crypto.randomUUID(), type: 'receipt', targetEventId: `${id}:1`, status: 'deferred' };
  expect(LocalReviewWrite.parse(input)).toEqual(input);
  expect(LocalReviewWrite.parse({ ...input, note: '  Later  ', target: { scenarioId: 'intro.main', position: 0, sceneId: 'intro.page' } })).toMatchObject({ note: 'Later' });
  expect(LocalReviewWrite.safeParse({ ...input, targetBody: 'Forged' }).success).toBe(false);
  expect(LocalReviewWrite.safeParse({ ...input, note: null }).success).toBe(false);
  const { targetBody: _body, ...incomplete } = receipt() as Extract<Event, { type: 'receipt' }>;
  expect(LocalReviewEvent.safeParse(incomplete).success).toBe(false);
});
