import { afterEach, beforeEach, expect, test } from 'vitest';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalReviewHub } from '../../server/src/local-review.ts';
import { checkWithProject } from '../src/check.ts';
import { runCli } from '../src/cli.ts';
import { boardProjectId, type BoardSettings } from '../src/board.ts';

const token = 'local-board-token';
const voiceKey = 'sk-test-NEVER-PRINT';
let root: string, home: string, base: string, project: string;
let calls: { method: string; path: string; body: any; token?: string }[];
let settings: BoardSettings;
let server: ReturnType<typeof createServer>;
const publicProfile = { id: 'openai', name: 'OpenAI', kind: 'openai', voice: 'marin', voices: [{ id: 'marin', name: 'Marin' }, { id: 'cedar', name: 'Cedar' }], key: { saved: false, hint: null, env: 'OPENAI_API_KEY', envSet: false }, removable: false, unsupported: false };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'joplo-board-cli-')); home = join(root, 'home'); project = join(root, 'invite');
  await mkdir(home); await symlink(resolve('node_modules'), join(root, 'node_modules'));
  await cp('examples/invite', project, { recursive: true, filter: source => !/[/\\](dist|node_modules|\.joplo)([/\\]|$)/.test(source) });
  project = await realpath(project);
  calls = []; settings = { version: 1, theme: 'clean' };
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
    let body: unknown = {}; try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { /* empty editor response */ }
    calls.push({ method: req.method!, path: req.url!, body, token: typeof req.headers['x-joplo-token'] === 'string' ? req.headers['x-joplo-token'] : undefined });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/__joplo/ping') return res.end(JSON.stringify({ joplo: true, pid: process.pid, version: '0.7.3' }));
    if (req.url === '/__joplo/projects' && req.method === 'GET') return res.end(JSON.stringify({ projects: [{ id: boardProjectId(project), dir: project, name: 'Invite', lastOpened: '2026-11-13T10:00:00.000Z', status: 'ok', errors: 0, version: 1 }] }));
    if (req.url === '/__joplo/projects' && req.method === 'POST') return res.end(JSON.stringify({ id: 'invite-added', url: `${base}/#/invite-added` }));
    if (req.url?.startsWith('/__joplo/projects/') && req.method === 'DELETE') return res.end(JSON.stringify({ ok: true }));
    if (req.url === '/__joplo/settings' && req.method === 'GET') return res.end(JSON.stringify({ settings }));
    if (req.url === '/__joplo/settings' && req.method === 'PUT') { settings = (body as any).settings; return res.end(JSON.stringify({ settings })); }
    if (req.url === '/__joplo/voice/profiles' && req.method === 'GET') return res.end(JSON.stringify({ profiles: [publicProfile], file: '~/.joplo/voice/profiles.json' }));
    if (req.url === '/__joplo/voice/profiles/openai' && req.method === 'PUT') return res.end(JSON.stringify({ profile: { ...publicProfile, voice: (body as any).profile?.voice ?? 'marin', key: { ...publicProfile.key, saved: true, hint: '…rint' } } }));
    if (req.url === '/__joplo/voice/profiles/openai' && req.method === 'DELETE') return res.end(JSON.stringify({ profiles: [publicProfile] }));
    if (req.url === '/__joplo/voice/test' && req.method === 'POST') return res.end(JSON.stringify({ ok: true, bytes: 123, contentType: 'audio/mpeg', audio: 'data:audio/mpeg;base64,AAAA' }));
    if (req.url?.endsWith('/voice') && req.method === 'PUT') return res.end(JSON.stringify({ selected: (body as any).profileId, source: 'board' }));
    if (req.url?.endsWith('/open') && req.method === 'POST') { res.setHeader('content-type', 'text/plain'); return res.end(''); }
    if (req.url?.endsWith('/review') && req.method === 'POST') return res.end(JSON.stringify({ session: { id: (body as any).sessionId }, watchers: 1 }));
    res.statusCode = 404; res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Unknown test route' } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await writeFile(join(home, 'server.json'), JSON.stringify({ port: Number(new URL(base).port), pid: process.pid, token }), { mode: 0o600 });
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); });

async function cli(args: string[], opts: { interactive?: boolean; ask?: (question: string) => Promise<boolean>; env?: NodeJS.ProcessEnv } = {}) {
  let stdout = '', stderr = '';
  const code = await runCli(args, { stdout: s => { stdout += s; }, stderr: s => { stderr += s; }, interactive: opts.interactive, ask: opts.ask, cloud: { env: { JOPLO_HOME: home, ...opts.env } } });
  expect(stdout + stderr).not.toContain(token); expect(stdout + stderr).not.toContain(voiceKey);
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}

test('board projects/add/appearance/open call the real local routes with the saved token', async () => {
  const listed = await cli(['board', 'projects', '--format', 'json']); expect(listed.code, listed.stdout + listed.stderr).toBe(0);
  expect(listed.json().data.projects).toHaveLength(1);
  expect((await cli(['board', 'add', project, '--format', 'json'])).json().data.id).toBe('invite-added');
  const appearance = await cli(['board', 'appearance', project, '--font', 'sans', '--format', 'json']);
  expect(appearance.code, appearance.stdout).toBe(0);
  expect(settings.projects?.[boardProjectId(project)]).toEqual({ font: 'sans' }); expect(settings.theme).toBe('clean');
  expect((await cli(['board', 'open', project, '--at', 'features/invite/feature.ts:2:1', '--format', 'json'])).code).toBe(0);
  expect(calls.filter(call => call.path !== '/__joplo/ping').every(call => call.token === token)).toBe(true);
});

test('board remove is non-interactively safe and --yes removes only the registry record', async () => {
  expect((await cli(['board', 'remove', project, '--format', 'json'])).code).toBe(2); expect(calls).toEqual([]);
  const r = await cli(['board', 'remove', project, '--yes', '--format', 'json']);
  expect(r.code).toBe(0); expect(r.json().data.filesDeleted).toBe(false);
  expect(calls.at(-1)).toMatchObject({ method: 'DELETE', path: `/__joplo/projects/${boardProjectId(project)}` });
});

test('voice profiles, source, narrator, and key operations never expose secrets or test audio', async () => {
  expect((await cli(['voice', 'profiles', '--format', 'json'])).json().data.profiles).toHaveLength(1);
  expect((await cli(['voice', 'select', project, '--browser', '--format', 'json'])).json().data.selected).toBeNull();
  expect((await cli(['voice', 'narrator', 'openai', 'cedar', '--format', 'json'])).json().data.profile.voice).toBe('cedar');
  const saved = await cli(['voice', 'key', 'set', 'openai', '--format', 'json'], { env: { JOPLO_VOICE_KEY: voiceKey } });
  expect(saved.code, saved.stdout).toBe(0); expect(saved.json().data.profile.key).toMatchObject({ saved: true, hint: '…rint' });
  expect(calls.at(-1)!.body.key).toBe(voiceKey);
  const tested = await cli(['voice', 'key', 'test', 'openai', '--format', 'json'], { env: { JOPLO_VOICE_KEY: voiceKey } });
  expect(tested.code).toBe(0); expect(tested.json().data).toEqual({ ok: true, contentType: 'audio/mpeg', bytes: 123 }); expect(tested.stdout).not.toContain('base64');
  expect((await cli(['voice', 'key', 'delete', 'openai', '--format', 'json'])).code).toBe(2);
  expect((await cli(['voice', 'key', 'delete', 'openai', '--yes', '--format', 'json'])).code).toBe(0);
});

test('local feedback submit and approve bind the exact session and explicit reviewed position', async () => {
  const ir = (await checkWithProject(project)).project!;
  const hub = new LocalReviewHub(() => `${base}/`); hub.sync(project, 'invite', ir);
  const session = hub.state(project, 'invite.a-modal').session;
  const submitted = await cli(['feedback', 'submit', project, '--local', '--work', 'invite.a-modal', '--body', 'Make recovery clearer', '--scenario', 'invite.a-modal.success', '--position', '1', '--format', 'json']);
  expect(submitted.code, submitted.stdout + submitted.stderr).toBe(0);
  expect(submitted.json().data).toMatchObject({ sessionId: session.id, type: 'feedback' });
  expect(calls.at(-1)!.body).toMatchObject({ sessionId: session.id, type: 'feedback', body: 'Make recovery clearer', context: { scenarioId: 'invite.a-modal.success', position: 1 } });
  const approved = await cli(['feedback', 'approve', project, '--local', '--session', session.id, '--format', 'json']);
  expect(approved.code, approved.stdout + approved.stderr).toBe(0);
  expect(calls.at(-1)!.body).toMatchObject({ sessionId: session.id, type: 'approved' });
  expect(JSON.parse(await readFile(join(home, 'server.json'), 'utf8')).token).toBe(token);
});
