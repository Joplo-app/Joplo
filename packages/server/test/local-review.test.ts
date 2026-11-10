import { installFixturePlugins } from '../../../scripts/test/fixtures.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { work, chapter } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, LocalReviewWrite, localReviewStatus, type Project } from '@joplo-app/core';
import { listLocalReviews, readLocalReview } from '@joplo-app/core/node';
import { reviewSource } from '../../core/test/fixtures/review.ts';
import { LocalReviewHub, localReviewContext, localReviewRevision } from '../src/local-review.ts';
import { createDev, type InternalDevHandle } from '../src/dev.ts';

const dirs: string[] = [];
const hubs: InternalDevHandle[] = [];
const temp = () => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-review-'))); dirs.push(d); return d; };
afterEach(async () => { for (const h of hubs.splice(0)) await h.close(); for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
const project = () => compile(reviewSource(), 'dev').project!;
const hubFor = (dir: string, p: Project = project()) => { const h = new LocalReviewHub(() => 'http://127.0.0.1:4790/'); h.sync(dir, 'project-a', p); return h; };
const location = (p: Project) => ({ scenarioId: 'f.a.main', position: 1, sceneId: p.scenarios['f.a.main']!.initial.sceneId });
const feedback = (id: string, p: Project, body = 'Keep the form open') => LocalReviewWrite.parse({ sessionId: id, requestId: crypto.randomUUID(), type: 'feedback', body, context: location(p) });
const approve = (id: string) => LocalReviewWrite.parse({ sessionId: id, requestId: crypto.randomUUID(), type: 'approved' });

describe('local review persistence and identity', () => {
  it('persists page context and approval, with private atomic records', () => {
    const dir = temp(), p = project(), h = hubFor(dir, p), session = h.state(dir, 'f.a').session;
    h.write(dir, p, feedback(session.id, p));
    h.write(dir, p, approve(session.id));
    const saved = readLocalReview(dir, session.id);
    expect(saved.events.map(e => [e.seq, e.type])).toEqual([[1, 'feedback'], [2, 'approved']]);
    expect(saved.events[0]).toMatchObject({ context: { route: '/', scenarioId: 'f.a.main', position: 1, stepId: p.scenarios['f.a.main']!.steps[0]!.id } });
    expect(localReviewStatus(saved)).toBe('approved');
    expect(fs.readdirSync(path.join(dir, '.joplo/reviews')).some(n => n.endsWith('.tmp'))).toBe(false);
    expect(fs.statSync(path.join(dir, '.joplo/reviews', `${session.id}.json`)).mode & 0o777).toBe(0o600);
  });
  it('does not duplicate retries or accept reused request ids with changed content', () => {
    const dir = temp(), p = project(), h = hubFor(dir, p), s = h.state(dir, 'f.a').session;
    const f = feedback(s.id, p);
    h.write(dir, p, f);
    h.write(dir, p, f);
    expect(h.state(dir, 'f.a').session.events).toHaveLength(1);
    expect(() => h.write(dir, p, { ...f, type: 'feedback', context: location(p), body: 'Different' })).toThrow(/Request id/);
    const a = approve(s.id);
    h.write(dir, p, a);
    h.write(dir, p, a);
    h.write(dir, p, approve(s.id));
    expect(h.state(dir, 'f.a').session.events).toHaveLength(2);
    expect(() => h.write(dir, p, feedback(s.id, p))).toThrow(/ended/);
  });
  it('isolates instances on the same project and projects in the same instance', () => {
    const dir = temp(), other = temp(), p = project(), a = hubFor(dir, p), b = hubFor(dir, p);
    a.sync(other, 'project-b', p);
    const sa = a.state(dir, 'f.a').session, sb = b.state(dir, 'f.a').session, sc = a.state(other, 'f.a').session;
    expect(new Set([sa.id, sb.id, sc.id]).size).toBe(3);
    expect(sa.instanceId).not.toBe(sb.instanceId);
    expect(() => a.write(dir, p, approve(sb.id))).toThrow(/does not belong/);
    expect(() => a.write(other, p, approve(sa.id))).toThrow(/does not belong/);
    b.write(dir, p, approve(sb.id));
    expect(localReviewStatus(a.state(dir, 'f.a').session)).toBe('open');
    expect(readLocalReview(dir, sa.id).events).toEqual([]);
  });
  it('keeps equivalent IR in the same session, but rejects old versions after changes', () => {
    const dir = temp(), p = project(), h = hubFor(dir, p), old = h.state(dir, 'f.a').session;
    h.sync(dir, 'project-a', structuredClone(p));
    expect(h.state(dir, 'f.a').session.id).toBe(old.id);
    const next = structuredClone(p); next.works['f.a']!.title = 'Changed option';
    h.sync(dir, 'project-a', next);
    expect(h.state(dir, 'f.a').session.id).not.toBe(old.id);
    expect(readLocalReview(dir, old.id).events.at(-1)).toMatchObject({ type: 'closed', reason: 'source_changed' });
    expect(() => h.write(dir, next, approve(old.id))).toThrow(/changed/);
  });
  it('preserves confirmed history when the option changes and does not carry approval forward', () => {
    const dir = temp(), p = project(), h = hubFor(dir, p), old = h.state(dir, 'f.a').session;
    h.write(dir, p, approve(old.id));
    p.works['f.a']!.summary = 'New idea'; h.sync(dir, 'project-a', p);
    expect(localReviewStatus(h.state(dir, 'f.a').session)).toBe('open');
    expect(localReviewStatus(readLocalReview(dir, old.id))).toBe('approved');
  });
  it('closes without approval on compilation errors, removal, or shutdown', () => {
    const dir = temp(), p = project(), h = hubFor(dir, p), old = h.state(dir, 'f.a').session;
    h.invalidate(dir, 'compile_error');
    expect(() => h.state(dir, 'f.a')).toThrow(/No current/);
    expect(readLocalReview(dir, old.id).events.at(-1)).toMatchObject({ type: 'closed', reason: 'compile_error' });
    h.sync(dir, 'project-a', p);
    const newer = h.state(dir, 'f.a').session;
    delete p.works['f.a']; h.sync(dir, 'project-a', p);
    expect(readLocalReview(dir, newer.id).events.at(-1)).toMatchObject({ type: 'closed', reason: 'work_removed' });
    h.invalidate(dir, 'server_stopped');
    expect(listLocalReviews(dir).every(s => localReviewStatus(s) === 'closed')).toBe(true);
  });
  it('binds context to a valid scenario, step, and page rather than trusting client labels', () => {
    const p = project();
    expect(() => localReviewContext(p, 'f.b', location(p))).toThrow(/scenario/);
    expect(() => localReviewContext(p, 'f.a', { ...location(p), position: 500 })).toThrow(/step/);
    expect(() => localReviewContext(p, 'f.a', { ...location(p), sceneId: 'missing' })).toThrow(/page/);
    expect(LocalReviewWrite.safeParse({ ...feedback('rv_' + 'a'.repeat(32), p), body: '   ' }).success).toBe(false);
    expect(LocalReviewWrite.safeParse({ ...feedback('rv_' + 'a'.repeat(32), p), sessionId: '../../secret' }).success).toBe(false);
  });
  it('revision changes for a shared page or theme, but not for another option only', () => {
    const p = project(), hash = localReviewRevision(p, 'f.a');
    p.works['f.b']!.summary = 'Another idea';
    expect(localReviewRevision(p, 'f.a')).toBe(hash);
    p.theme = 'clean'; expect(localReviewRevision(p, 'f.a')).not.toBe(hash);
  });
});

it('HTTP review endpoints enforce token, origin, project ownership, and revision guards', async () => {
  const dir = temp();
  const example = path.resolve('examples/invite');
  fs.cpSync(example, dir, { recursive: true, filter: s => !/[/\\](\.joplo|node_modules|dist)([/\\]|$)/.test(s.slice(example.length)) });
  installFixturePlugins(dir);
  const dev = await createDev({ projectDir: dir, port: 0, watch: false, log: () => {} }); hubs.push(dev);
  const p = dev.payload().project!;
  const option = Object.keys(p.works)[0]!;
  const url = `${dev.url}__joplo/p/${dev.projectId}/review?workId=${encodeURIComponent(option)}`;
  const headers = { 'x-joplo-token': dev.token, 'content-type': 'application/json' };
  expect((await fetch(url)).status).toBe(403);
  expect((await fetch(url, { headers: { ...headers, origin: 'https://untrusted.example' } })).status).toBe(403);
  const current = await (await fetch(url, { headers })).json() as { session: { id: string } };
  const body = JSON.stringify(approve(current.session.id));
  expect((await fetch(url, { method: 'POST', headers: { 'x-joplo-token': dev.token }, body })).status).toBe(415);
  const saved = await fetch(url, { method: 'POST', headers, body });
  expect(saved.status).toBe(200);
  expect(localReviewStatus((await saved.json() as any).session)).toBe('approved');
  const malformed = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ type: 'feedback' }) });
  expect(malformed.status).toBe(400);
});

it('独立作品评审保留空功能归属，反馈、revision 与关闭均使用作品身份', () => {
  const source = reviewSource();
  const result = compile({ ...source, features: {}, works: { intro: {
    ...work({ title: 'Intro', summary: 'Summary', stage: jsx('div', { children: 'Welcome' }), scenarios: { start: chapter('Start').system('Begin') } }),
    file: 'works/intro.tsx',
  } } }, 'dev');
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const p = result.project!;
  const dir = temp(), h = hubFor(dir, p), session = h.state(dir, 'intro').session;
  expect(session).toMatchObject({ v: 2, featureId: null, featureName: null, workId: 'intro', workTitle: 'Intro' });
  expect(readLocalReview(dir, session.id)).toEqual(session);
  h.sync(dir, 'project-a', structuredClone(p));
  expect(h.state(dir, 'intro').session.id).toBe(session.id);
  h.write(dir, p, { sessionId: session.id, requestId: crypto.randomUUID(), type: 'feedback', body: 'Keep the opening',
    context: { scenarioId: 'intro.start', position: 1, sceneId: p.scenarios['intro.start']!.initial.sceneId } });
  h.write(dir, p, approve(session.id));
  expect(readLocalReview(dir, session.id)).toMatchObject({ featureId: null, featureName: null, events: [{ type: 'feedback' }, { type: 'approved' }] });
  p.works.intro!.summary = 'Updated summary';
  h.sync(dir, 'project-a', p);
  const next = h.state(dir, 'intro').session;
  expect(next.id).not.toBe(session.id);
  expect(next).toMatchObject({ featureId: null, featureName: null, workId: 'intro' });
  expect(localReviewStatus(readLocalReview(dir, session.id))).toBe('approved');
  h.invalidate(dir, 'server_stopped');
  expect(readLocalReview(dir, next.id)).toMatchObject({ featureId: null, events: [{ type: 'closed', reason: 'server_stopped' }] });
});
