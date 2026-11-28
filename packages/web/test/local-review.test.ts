import { afterEach, expect, it, vi } from 'vitest';
import { compile, type LocalReviewLocation, type LocalReviewSession, type LocalReviewState } from '@joplo-app/core';
import { reviewSource } from '../../core/test/fixtures/review';
import { captureReviewDraft, isReviewLocationValid, localReviewCommand, localReviewTitle, localReviewJump, localReviewUpdates, readReviewDraft, reconcileReviewDraft, reviewDraftKey, saveReviewDraft } from '../src/board/review-model';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { LocalReviewUpdates } from '../src/board/LocalReview';
import { DemoController } from '../src/runtime/demo';
const jumpClicks = vi.hoisted(() => [] as Array<() => void>);
vi.mock('../src/player/controls', async () => {
  const { createElement } = await import('react');
  return { Btn: (props: { label: string; onClick: () => void; 'data-testid'?: string }) => {
    if (props['data-testid'] === 'local-review-jump') jumpClicks.push(props.onClick);
    return createElement('button', { 'data-testid': props['data-testid'], onClick: props.onClick }, props.label);
  } };
});

afterEach(() => { vi.unstubAllGlobals(); jumpClicks.length = 0; });
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

const updatesFixture = () => {
  const p = compile(reviewSource(), 'dev').project!;
  const context = { scenarioId: 'f.a.main', position: 1, sceneId: p.scenarios['f.a.main']!.initial.sceneId, route: '/', stepId: null, source: null, pageTitle: 'Page', scenarioName: 'Main' };
  const previousId = `rv_${'b'.repeat(32)}`;
  const base = { sessionId: session.id, requestId: '4a03cf69-a9da-41ac-b46a-397767b55322', createdAt: '2026-11-28T00:00:00.000Z' };
  const state: LocalReviewState = { session: { ...session, events: [
    { ...base, seq: 1, type: 'receipt', targetEventId: `${previousId}:1`, targetBody: 'Original suggestion', status: 'deferred', note: 'Later', target: null },
    { ...base, seq: 2, type: 'receipt', targetEventId: `${previousId}:1`, targetBody: 'Original suggestion', status: 'addressed', note: 'Updated the heading', target: { ...context, position: 0 } },
  ] }, watchers: 0, previousFeedback: [
    { eventId: `${previousId}:1`, sessionId: previousId, seq: 1, body: 'Original suggestion', createdAt: base.createdAt, context },
    { eventId: `${previousId}:2`, sessionId: previousId, seq: 2, body: 'Still waiting', createdAt: base.createdAt, context },
  ] };
  return { p, state, context };
};

it('shows the latest receipt once, its note and original feedback, plus unanswered prior feedback', () => {
  const { p, state, context } = updatesFixture();
  expect(localReviewUpdates(p, 'f.a', state)).toEqual([
    { eventId: state.previousFeedback![0]!.eventId, body: 'Original suggestion', status: 'addressed', note: 'Updated the heading', target: { ...context, position: 0 } },
    { eventId: state.previousFeedback![1]!.eventId, body: 'Still waiting', status: null, note: null, target: context },
  ]);
  const ctl = new DemoController(); ctl.setProject(p, 1); ctl.setScenario('f.b.only', 0, { quiet: true });
  const onJump = vi.fn((location: LocalReviewLocation) => { ctl.setScenario(location.scenarioId!, location.position, { quiet: true }); ctl.pause(); });
  const html = renderToStaticMarkup(createElement(I18nProvider, { explicit: 'zh-CN', children: createElement(LocalReviewUpdates, { project: p, workId: 'f.a', state, onJump }) }));
  expect(html).toContain('已处理'); expect(html).toContain('等待处理回执'); expect(html).toContain('Updated the heading');
  expect(html.match(/Original suggestion/g)).toHaveLength(1);
  expect(html).toContain('直达第 0 步复审'); expect(html).toContain('直达第 1 步复审'); expect(html.match(/data-testid="local-review-jump"/g)).toHaveLength(2);
  jumpClicks[0]!(); expect(onJump).toHaveBeenLastCalledWith({ ...context, position: 0 });
  expect(ctl.getSnapshot()).toMatchObject({ scenarioId: context.scenarioId, state: { position: 0 }, playing: false });
  jumpClicks[1]!(); expect(onJump).toHaveBeenLastCalledWith(context);
  expect(ctl.getSnapshot()).toMatchObject({ scenarioId: context.scenarioId, state: { position: 1 }, playing: false });
});

it.each(['deferred', 'declined'] as const)('renders %s receipts with a valid original position when no new target was supplied', status => {
  const { p, state, context } = updatesFixture();
  const receipt = state.session.events[1]!; if (receipt.type !== 'receipt') throw new Error('Expected receipt');
  state.session.events = [{ ...receipt, status, target: null }];
  expect(localReviewUpdates(p, 'f.a', state)[0]!.target).toEqual(context);
  const html = renderToStaticMarkup(createElement(I18nProvider, { explicit: 'zh-CN', children: createElement(LocalReviewUpdates, { project: p, workId: 'f.a', state, onJump: () => {} }) }));
  expect(html).toContain(status === 'deferred' ? '暂缓' : '不采纳');
});

it('offers no jump for deleted, out of range, or other-work positions and accepts old states', () => {
  const { p, state, context } = updatesFixture();
  for (const location of [null, { ...context, scenarioId: null }, { ...context, scenarioId: 'missing' }, { ...context, position: 999 }, { ...context, position: -1 }, { ...context, position: 0.5 }, { ...context, sceneId: 'missing' }])
    expect(localReviewJump(p, 'f.a', location)).toBeNull();
  expect(localReviewJump(p, 'f.b', context)).toBeNull();
  delete p.scenarios['f.a.main'];
  expect(localReviewUpdates(p, 'f.a', state).every(e => e.target === null)).toBe(true);
  const html = renderToStaticMarkup(createElement(LocalReviewUpdates, { project: p, workId: 'f.a', state, onJump: () => {} }));
  expect(html).not.toContain('local-review-jump'); expect(html).toContain('Still waiting');
  expect(localReviewUpdates(p, 'f.a', { session: { ...session, events: [] }, watchers: 0 })).toEqual([]);
});

it('hot-reload draft reconciliation seamlessly rebinds empty and still-valid drafts while flagging deleted targets', () => {
  const p = compile(reviewSource(), 'dev').project!;
  const loc = { scenarioId: 'f.a.main', position: 1, sceneId: p.scenarios['f.a.main']!.initial.sceneId };
  const s1 = { ...session, id: 'rv_' + '1'.repeat(32), workId: 'f.a' } as LocalReviewSession;
  const s2 = { ...session, id: 'rv_' + '2'.repeat(32), workId: 'f.a' } as LocalReviewSession;

  // Empty draft automatically follows the new session and current step
  const empty = captureReviewDraft(s1, p, { ...loc, position: 0 }, '');
  const emptyNext = reconcileReviewDraft(empty, s2, p, loc);
  expect(emptyNext).toMatchObject({ sessionId: s2.id, text: '', context: loc });

  // Non-empty draft whose target still exists after hot reload rebinds smoothly without blocking submission
  const typing = { ...captureReviewDraft(s1, p, loc, 'Still typing my second note'), requestId: 'old-req' };
  const rebound = reconcileReviewDraft(typing, s2, p, { ...loc, position: 0 });
  expect(rebound).toMatchObject({ sessionId: s2.id, text: 'Still typing my second note', context: loc });
  expect(rebound?.requestId).toBeUndefined();
  expect(isReviewLocationValid(p, 'f.a', loc)).toBe(true);

  // Non-empty draft whose scenario was removed stays stale so the reviewer sees the explicit rebase prompt
  const deleted = structuredClone(p);
  delete deleted.scenarios['f.a.main'];
  const keptStale = reconcileReviewDraft(typing, s2, deleted, null);
  expect(keptStale?.sessionId).toBe(s1.id);
  expect(isReviewLocationValid(deleted, 'f.a', loc)).toBe(false);
});
