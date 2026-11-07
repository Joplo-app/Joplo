import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { compile, localReviewStatus } from '@joplo-app/core';
import { localReviewWatcherCount, readLocalReview, writeLocalReview, localReviewFile } from '@joplo-app/core/node';
import { reviewSource } from '../../core/test/fixtures/review.ts';
import { LocalReviewHub } from '../../server/src/local-review.ts';
import { reviewSessions, watchLocalReview } from '../src/local-review.ts';
import { runCli } from '../src/cli.ts';

const dirs: string[] = [];
const controllers: AbortController[] = [];
afterEach(() => { controllers.splice(0).forEach(c => c.abort()); dirs.splice(0).forEach(d => fs.rmSync(d, { recursive: true, force: true })); });
const setup = () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-watch-'))); dirs.push(dir);
  const project = compile(reviewSource(), 'dev').project!;
  const hub = new LocalReviewHub(() => 'http://127.0.0.1:4790/'); hub.sync(dir, 'test-project', project);
  const session = hub.state(dir, 'f.a').session;
  const context = { scenarioId: 'f.a.main', position: 1, sceneId: project.scenarios['f.a.main']!.initial.sceneId };
  return { dir, project, hub, session, feedback: (body = 'Make the title clearer') => hub.write(dir, project, { sessionId: session.id, requestId: crypto.randomUUID(), type: 'feedback', body, context }), approve: () => hub.write(dir, project, { sessionId: session.id, requestId: crypto.randomUUID(), type: 'approved' }) };
};
const capture = () => { let out = '', err = ''; return { io: { out: (s: string) => { out += s; }, err: (s: string) => { err += s; } }, get out() { return out; }, get err() { return err; } }; };
const until = async (test: () => boolean) => { const end = Date.now() + 4000; while (!test()) { if (Date.now() > end) throw new Error('Timed out'); await new Promise(r => setTimeout(r, 20)); } };
const signal = () => { const c = new AbortController(); controllers.push(c); return c; };

it('streams submitted feedback before approval and returns 0 only after approval', async () => {
  const x = setup(), io = capture(), ac = signal();
  let ended = false;
  const result = watchLocalReview(x.dir, { session: x.session.id, json: true }, io.io, ac.signal).then(code => { ended = true; return code; });
  expect(localReviewWatcherCount(x.dir, x.session.id)).toBe(1);
  x.feedback();
  await until(() => io.out.includes('feedback'));
  expect(ended).toBe(false);
  expect(JSON.parse(io.out.trim())).toMatchObject({ sessionId: x.session.id, seq: 1, type: 'feedback', optionId: 'f.a', context: { route: '/', position: 1 } });
  x.approve();
  expect(await result).toBe(0);
  expect(io.out.trim().split('\n').map(l => JSON.parse(l).type)).toEqual(['feedback', 'approved']);
  expect(io.err).toContain('Watching');
  expect(localReviewWatcherCount(x.dir, x.session.id)).toBe(0);
});

it('reconnects with --after and also reads a completed session after its server stopped', async () => {
  const x = setup(); x.feedback(); x.feedback('Second page feedback'); x.approve();
  x.hub.invalidate(x.dir, 'server_stopped');
  const io = capture();
  expect(await watchLocalReview(x.dir, { session: x.session.id, after: 1, json: true }, io.io)).toBe(0);
  expect(io.out.trim().split('\n').map(l => JSON.parse(l).seq)).toEqual([2, 3]);
  const consumed = capture();
  expect(await watchLocalReview(x.dir, { session: x.session.id, after: 3, json: true }, consumed.io)).toBe(0);
  expect(consumed.out).toBe('');
});

it('refuses ambiguous options across instances and never lets B confirmation finish A', async () => {
  const x = setup(), second = new LocalReviewHub(() => 'http://127.0.0.1:4791/'); second.sync(x.dir, 'test-project', x.project);
  await expect(watchLocalReview(x.dir, { option: 'f.a' }, capture().io)).rejects.toThrow(/Multiple local reviews/);
  const io = capture(), ac = signal();
  let ended = false;
  const result = watchLocalReview(x.dir, { session: x.session.id, json: true }, io.io, ac.signal).then(code => { ended = true; return code; });
  second.write(x.dir, x.project, { sessionId: second.state(x.dir, 'f.a').session.id, requestId: crypto.randomUUID(), type: 'approved' });
  await new Promise(r => setTimeout(r, 550));
  expect(ended).toBe(false); expect(io.out).toBe('');
  x.approve(); expect(await result).toBe(0);
});

it('two listeners have independent cursors and both receive approval', async () => {
  const x = setup(), a = capture(), b = capture(), ac = signal(); x.feedback();
  const one = watchLocalReview(x.dir, { session: x.session.id, json: true }, a.io, ac.signal);
  const two = watchLocalReview(x.dir, { session: x.session.id, after: 1, json: true }, b.io, ac.signal);
  x.approve(); expect(await Promise.all([one, two])).toEqual([0, 0]);
  expect(a.out.trim().split('\n')).toHaveLength(2); expect(b.out.trim().split('\n')).toHaveLength(1);
});

it('aborting exits 130 and leaves the review open', async () => {
  const x = setup(), ac = signal(), io = capture();
  const result = watchLocalReview(x.dir, { session: x.session.id }, io.io, ac.signal);
  ac.abort(); expect(await result).toBe(130);
  expect(localReviewStatus(readLocalReview(x.dir, x.session.id))).toBe('open');
  expect(localReviewWatcherCount(x.dir, x.session.id)).toBe(0);
});

it('source changes exit nonzero and keep the new session separate', async () => {
  const x = setup(), ac = signal(), io = capture();
  const result = watchLocalReview(x.dir, { session: x.session.id, json: true }, io.io, ac.signal);
  x.project.options['f.a']!.name = 'Revised'; x.hub.sync(x.dir, 'test-project', x.project);
  expect(await result).toBe(1);
  expect(JSON.parse(io.out.trim())).toMatchObject({ type: 'closed', reason: 'source_changed' });
  expect(reviewSessions(x.dir, { option: 'f.a' })[0]!.id).not.toBe(x.session.id);
});

it('validates cursors, corrupt records, and paths before streaming', async () => {
  const x = setup();
  await expect(watchLocalReview(x.dir, { session: x.session.id, after: -1 }, capture().io)).rejects.toThrow(/after/);
  await expect(watchLocalReview(x.dir, { session: x.session.id, after: 1 }, capture().io)).rejects.toThrow(/after/);
  await expect(watchLocalReview(x.dir, { session: '../../other' }, capture().io)).rejects.toThrow(/Invalid/);
  writeLocalReview(localReviewFile(x.dir, x.session.id), { ...x.session, projectDir: '/another-project' });
  expect(() => reviewSessions(x.dir, { session: x.session.id })).toThrow(/Invalid local review file/);
});

it('CLI errors stay on stderr and approved replay is pure NDJSON on stdout', async () => {
  const x = setup(); let out = '', err = '';
  const deps = { stdout: (s: string) => { out += s; }, stderr: (s: string) => { err += s; } };
  expect(await runCli(['review', 'watch', x.dir, '--json'], deps)).toBe(2);
  expect(out).toBe(''); expect(JSON.parse(err.trim()).error.code).toBe('USAGE');
  x.feedback(); x.approve(); out = ''; err = '';
  expect(await runCli(['review', 'watch', x.dir, '--session', x.session.id, '--json'], deps)).toBe(0);
  expect(out.trim().split('\n').map(l => JSON.parse(l).type)).toEqual(['feedback', 'approved']);
});

it('feedback watch --local is compatible with review watch and never needs cloud credentials', async () => {
  const x = setup(); x.feedback(); x.approve();
  const primary = capture(), alias = capture();
  expect(await runCli(['feedback', 'watch', x.dir, '--local', '--session', x.session.id, '--json'], {
    stdout: primary.io.out, stderr: primary.io.err, cloud: { env: { JOPLO_API_KEY: 'invalid-on-purpose' } },
  })).toBe(0);
  expect(await runCli(['review', 'watch', x.dir, '--session', x.session.id, '--json'], { stdout: alias.io.out, stderr: alias.io.err })).toBe(0);
  expect(primary.out).toBe(alias.out);
  expect(JSON.parse(primary.out.split('\n')[0]!)).toMatchObject({ source: 'local', eventId: `${x.session.id}:1` });
});
