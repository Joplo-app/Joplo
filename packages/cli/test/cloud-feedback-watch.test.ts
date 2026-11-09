import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudClient } from '../src/cloud.ts';
import { CloudError } from '../src/cloud-error.ts';
import { cloudFeedbackEvents, cloudReviewIdentity, validateCloudWatchOptions, watchCloudFeedback } from '../src/cloud-feedback-watch.ts';
import { runCli } from '../src/cli.ts';
import type { Feedback, FeedbackComment, FeedbackDecision } from '../src/cloud-feedback.ts';

const key = 'jpk_' + 'A1b2C3d4'.repeat(5);
const shareId = 'Abc1234567';
const binding = { server: 'https://cloud.example', shareId, optionId: 'f.a', version: 3 };
const comment = (id: string, changes: Partial<FeedbackComment> = {}): FeedbackComment => ({ id, version: 3, scenario: 'f.a.main', step: 1, stepId: 'f.a.main#1', element: null, body: `Feedback ${id}`, author: { name: 'Reviewer' }, createdAt: '2026-11-07T10:00:00.000Z', ...changes });
const decision = (id = 'd1', changes: Partial<FeedbackDecision> = {}): FeedbackDecision => ({ id, kind: 'pick', featureId: 'f', targetId: 'a', note: null, decidedAt: '2026-11-07T10:01:00.000Z', version: 3, ...changes });
const snapshot = (comments: FeedbackComment[] = [], decisions: FeedbackDecision[] = [], version = 3): Feedback => ({ share: { id: shareId, version }, comments, decisions });
const capture = () => { let out = '', err = ''; return { io: { out: (s: string) => { out += s; }, err: (s: string) => { err += s; } }, events: () => out.trim() ? out.trim().split('\n').map(l => JSON.parse(l)) : [], get out() { return out; }, get err() { return err; } }; };
function fixture(responses: (Feedback | Error)[], onSleep?: (signal?: AbortSignal) => void) {
  const waits: number[] = [];
  const client = new CloudClient('https://cloud.example', '0.2.11', () => {}, () => {}, { env: { JOPLO_API_KEY: key },
    sleep: async (ms, signal) => { waits.push(ms); onSleep?.(signal); signal?.throwIfAborted(); },
  });
  let count = 0;
  const request = vi.spyOn(client, 'request').mockImplementation(async () => {
    const value = responses[count++];
    if (!value) throw new Error('Unexpected extra polling request');
    if (value instanceof Error) throw value;
    return value;
  });
  return { client, waits, request };
}
afterEach(() => vi.restoreAllMocks());

describe('cloud snapshot polling', () => {
  it('polls every 15 seconds, deduplicates records, outputs feedback before approval, and exits 0', async () => {
    const { client, waits, request } = fixture([snapshot([comment('c1')]), snapshot([comment('c1')]), snapshot([comment('c1'), comment('c2')], [decision()])]);
    const io = capture();
    expect(await watchCloudFeedback(client, shareId, { option: 'f.a', json: true }, io.io)).toBe(0);
    expect(waits).toEqual([15000, 15000]); expect(request).toHaveBeenCalledTimes(3);
    expect(io.events().map(e => e.type)).toEqual(['feedback', 'feedback', 'approved']);
    expect(io.events()[0]).toMatchObject({ source: 'cloud', shareId, optionId: 'f.a', revision: '3', context: { scenarioId: 'f.a.main', route: null } });
    expect(new Set(io.events().map(e => e.eventId)).size).toBe(3);
    expect(io.err).toContain('not complete event history'); expect(io.out + io.err).not.toContain(key);
    expect(request.mock.calls.every(c => c[0] === `/api/v1/shares/${shareId}/feedback` && c[2] === undefined)).toBe(true);
  });
  it.each([10, 20, 30])('accepts a %i-second interval', async interval => {
    const { client, waits } = fixture([snapshot(), snapshot([], [decision()])]);
    expect(await watchCloudFeedback(client, shareId, { option: 'f.a', interval }, capture().io)).toBe(0);
    expect(waits).toEqual([interval * 1000]);
  });
  it.each([0, 9, 31, 15.5, NaN])('rejects an invalid interval %s before any request', async interval => {
    const { client, request } = fixture([]);
    await expect(watchCloudFeedback(client, shareId, { option: 'f.a', interval }, capture().io)).rejects.toThrow(/10 to 30/);
    expect(request).not.toHaveBeenCalled();
  });
  it('requires a target option and never adopts approval of another option, feature, or version', async () => {
    expect(() => validateCloudWatchOptions({ option: '' })).toThrow(/requires --work/);
    const foreign = snapshot([comment('old', { version: 2 }), comment('other', { scenario: 'f.b.main' }), comment('collision', { scenario: 'f.ab.main' })],
      [decision('old', { version: 2 }), decision('other', { targetId: 'f.b' }), decision('another', { featureId: 'g', targetId: 'g.a' })]);
    const { client, waits } = fixture([foreign, snapshot([comment('mine')], [decision('mine', { targetId: 'f.a' })])]);
    const io = capture();
    expect(await watchCloudFeedback(client, shareId, { option: 'f.a', json: true }, io.io)).toBe(0);
    expect(waits).toHaveLength(1);
    expect(io.events().map(e => e.type)).toEqual(['feedback', 'approved']);
    expect(io.out).not.toContain('collision');
  });
  it('emits rule/answer decisions without treating them as confirmation of the option', async () => {
    const partial = snapshot([], [decision('rule', { kind: 'confirm_rule', targetId: 'f.a.keep' }), decision('answer', { kind: 'answer', targetId: 'f.question', note: 'Seven days' }), decision('other-rule', { kind: 'reject_rule', targetId: 'f.b.rule' })]);
    const { client } = fixture([partial, snapshot([], [...partial.decisions, decision()])]); const io = capture();
    await watchCloudFeedback(client, shareId, { option: 'f.a', json: true }, io.io);
    expect(io.events().map(e => e.type)).toEqual(['decision', 'decision', 'approved']);
    expect(io.out).not.toContain('other-rule');
  });
  it('stops with source_changed instead of following a replaced share version', async () => {
    const { client } = fixture([snapshot([comment('c1')]), snapshot([], [decision('new', { version: 4 })], 4)]); const io = capture();
    expect(await watchCloudFeedback(client, shareId, { option: 'f.a', json: true }, io.io)).toBe(1);
    expect(io.events().map(e => e.type)).toEqual(['feedback', 'closed']);
    expect(io.events()[1]).toMatchObject({ reason: 'source_changed', version: 3 });
  });
  it('honors an explicitly pinned version on the first request', async () => {
    const { client } = fixture([snapshot([], [decision()])]); const io = capture();
    expect(await watchCloudFeedback(client, shareId, { option: 'f.a', version: 2, json: true }, io.io)).toBe(1);
    expect(io.events().map(e => e.type)).toEqual(['closed']);
  });
  it('backs off network failures without overlapping or retrying faster than the polling interval', async () => {
    const { client, waits } = fixture([new CloudError('NETWORK'), new CloudError('NETWORK'), snapshot(), snapshot([], [decision()])]);
    expect(await watchCloudFeedback(client, shareId, { option: 'f.a' }, capture().io)).toBe(0);
    expect(waits).toEqual([15000, 30000, 15000]);
  });
  it.each(['AUTH_EXPIRED', 'FORBIDDEN', 'NOT_FOUND', 'INVALID_RESPONSE'] as const)('stops rather than repeatedly retrying %s', async code => {
    const { client, waits } = fixture([new CloudError(code)]);
    await expect(watchCloudFeedback(client, shareId, { option: 'f.a' }, capture().io)).rejects.toMatchObject({ code });
    expect(waits).toEqual([]);
  });
  it('interrupts polling waits and makes no review mutations', async () => {
    const ac = new AbortController();
    const { client, request } = fixture([snapshot()], () => ac.abort()); const io = capture();
    expect(await watchCloudFeedback(client, shareId, { option: 'f.a', json: true }, io.io, ac.signal)).toBe(130);
    expect(request).toHaveBeenCalledTimes(1); expect(io.out).toBe('');
  });
  it('uses stable event ids across restarts, with server/version/option isolation', () => {
    const feedback = snapshot([comment('c1')], [decision()]);
    expect(cloudFeedbackEvents(feedback, binding)).toEqual(cloudFeedbackEvents(feedback, { version: 3, optionId: 'f.a', shareId, server: 'https://cloud.example' }));
    const id = cloudReviewIdentity(binding).sessionId;
    expect(cloudReviewIdentity({ ...binding, server: 'https://another.example' }).sessionId).not.toBe(id);
    expect(cloudReviewIdentity({ ...binding, version: 4 }).sessionId).not.toBe(id);
    expect(cloudReviewIdentity({ ...binding, optionId: 'f.b' }).sessionId).not.toBe(id);
  });
});

it('Ctrl+C aborts an in-flight HTTP request instead of waiting for its timeout', async () => {
  const ac = new AbortController();
  const server = createServer((_req, _res) => { ac.abort(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new CloudClient(`http://127.0.0.1:${(server.address() as { port: number }).port}`, '0.2.11', () => {}, () => {}, { env: { JOPLO_API_KEY: key } });
  try { expect(await watchCloudFeedback(client, shareId, { option: 'f.a' }, capture().io, ac.signal)).toBe(130); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

it('the unified CLI rejects incompatible modes before auth and streams cloud events on stdout', async () => {
  const invalid = [
    ['--local', '--share', shareId], ['--local', '--version', '2'], ['--local', '--interval', '15'], ['--share', shareId],
    ['--share', shareId, '--work', 'f.a', '--after', '1'], ['--share', shareId, '--work', 'f.a', '--interval', '9'],
  ];
  for (const flags of invalid) {
    const io = capture();
    expect(await runCli(['feedback', 'watch', ...flags, '--json'], { stdout: io.io.out, stderr: io.io.err, cloud: { env: { JOPLO_API_KEY: 'invalid' } } })).toBe(2);
    expect(io.out).toBe(''); expect(JSON.parse(io.err.trim()).error.code).toBe('USAGE');
  }
  const server = createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(snapshot([comment('c1')], [decision()]))); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const io = capture();
    expect(await runCli(['feedback', 'watch', '--share', shareId, '--work', 'f.a', '--server', base, '--json'], {
      stdout: io.io.out, stderr: io.io.err, cloud: { env: { JOPLO_API_KEY: key } },
    })).toBe(0);
    expect(io.events().map(e => e.type)).toEqual(['feedback', 'approved']);
    expect(io.out + io.err).not.toContain(key);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

it('独立作品通过内部播放 id 绑定反馈，面向人的监听与确认输出只用作品键', async () => {
  const { client } = fixture([snapshot([], [decision('d1', { featureId: 'demo', targetId: 'demo.main' })])]);
  const io = capture();
  expect(await watchCloudFeedback(client, shareId, { option: 'demo.main', work: 'demo' }, io.io)).toBe(0);
  expect(io.out + io.err).not.toContain('demo.main');
  expect(io.err).toContain('Work demo approved');
});
