/**
 * 第一批云端功能的 CLI 侧（契约 8.1、8.3–8.5），用本地假服务器验证请求与响应。不变量：
 * 1. share 请求体带 review 清单（mode 区分 publish / review），清单不作为文件上传；--review 时构建评审版；超长清单在任何请求之前失败；
 * 2. 设置 JOPLO_API_KEY 时所有云端命令用 Bearer <key>，不读写 credentials.json、不打开浏览器、不进设备登录；
 * 3. --pr 缺 repo 时明确报错且不发请求；Actions 环境变量齐全时 pr 字段正确（PR 事件优先用 PR head）；
 * 4. feedback：决定在前、评论在后；--format json 用结果信封；--applied 调 feedback/applied。
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createServer, type IncomingMessage } from 'node:http';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { work, chapter } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, scopeProject, REVIEW_LIMITS, type Project } from '@joplo-app/core';
import { runCli } from '../src/cli.ts';
import { writeCredentials } from '../src/cloud.ts';
import { prContext } from '../src/cloud-pr.ts';
import { publicationSource, PRIVATE } from '../../core/test/fixtures/publication.ts';
import { reviewSource } from '../../core/test/fixtures/review.ts';

const token = 'session-token-NEVER-PRINT';
const apiKey = 'jpk_' + 'A1b2C3d4'.repeat(5);
const user = { id: 'user-1', email: 'user@example.com', name: 'User' };
const limits = { maxUploadBytes: 20 * 1024 * 1024, maxTotalBytes: 256 * 1024 * 1024, maxFiles: 2000, publishesPerHour: 30 };
const sha = 'a'.repeat(40), headSha = 'b'.repeat(40);
type Call = { path: string; method: string; headers: IncomingMessage['headers']; body: any };
let root: string, home: string, project: string, base: string, calls: Call[], server: ReturnType<typeof createServer>;
let responses: Map<string, { status?: number; body: unknown }>;
let devIr: Project;
let plan: 'free' | 'pro', rejectReview: number;
const browser = vi.fn(async () => true);
const files = { 'index.html': '<html><script type="application/json" id="joplo-ir">{"project":{"mode":"publish","features":{},"works":{},"scenarios":{}}}</script></html>', 'assets/a.css': 'body{}' };
let built: Record<string, string>;
const build = vi.fn(async ({ outDir, review }: { outDir?: string; review?: boolean }) => {
  const out = review ? { ...built, 'index.html': built['index.html']!.replace('"mode":"publish"', '"mode":"review"') } : built;
  for (const [p, content] of Object.entries(out)) { await mkdir(join(outDir!, p, '..'), { recursive: true }); await writeFile(join(outDir!, p), content); }
  return { outDir: outDir!, files: Object.keys(out), diagnostics: [], routes: [], scenarios: [] };
});
const checkProject = vi.fn(async (): Promise<any> => ({ name: 'Fixture', diagnostics: [], summary: { error: 0, warning: 0, info: 0 }, verification: {}, project: devIr }));
const feedback = {
  share: { id: 'Abc1234567', version: 3 },
  decisions: [
    { id: 'd1', kind: 'pick', workId: 'f.b', featureId: 'f', targetId: 'f.b', note: null, decidedAt: '2026-11-06T10:00:00.000Z', version: 3 },
    { id: 'd2', kind: 'reject_rule', workId: 'f.a', featureId: 'f', targetId: 'f.a.retry', note: 'Only block repeats within one minute', decidedAt: '2026-11-06T10:01:00.000Z', version: 3 },
    { id: 'd3', kind: 'answer', workId: null, featureId: 'f', targetId: 'f.dup', note: '7 days', decidedAt: '2026-11-06T10:02:00.000Z', version: 2 },
    { id: 'd4', kind: 'confirm_rule', workId: 'f.a', featureId: 'f', targetId: 'f.a.keep', note: null, decidedAt: '2026-11-06T10:03:00.000Z', version: 3 },
  ],
  comments: [
    { id: 'c1', version: 2, workId: 'f.a', scenario: 'f.a.main', step: 1, stepId: 'f.a.main#1', element: { id: 'go', label: 'Go' }, body: 'Button text is unclear\nsecond line', author: { name: 'Alice' }, createdAt: '2026-11-06T09:00:00.000Z' },
  ],
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'joplo-review-cli-')); home = join(root, 'home'); project = join(root, 'project');
  await mkdir(project); calls = []; responses = new Map(); plan = 'free'; rejectReview = 0; built = { ...files }; build.mockClear(); checkProject.mockClear(); browser.mockClear();
  devIr = compile(reviewSource(), 'dev').project!;
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString(); let body: any = raw; try { body = JSON.parse(raw); } catch { /* PUT */ }
    const path = req.url!; calls.push({ path, method: req.method!, headers: req.headers, body });
    res.setHeader('Content-Type', 'application/json');
    const send = (v: unknown, status = 200) => { res.statusCode = status; res.end(JSON.stringify(v)); };
    const r = responses.get(path); if (r) return send(r.body, r.status);
    if (path === '/api/v1/me') return send({ user, plan, limits, credential: req.headers.authorization === `Bearer ${apiKey}` ? { kind: 'api_key', name: 'team-invite CI', prefix: 'jpk_A1b2', scopes: ['shares:publish', 'feedback:read'], expiresAt: '2027-02-04T00:00:00.000Z' } : { kind: 'device' } });
    if (path === '/api/v1/shares') {
      // 旧版 SaaS：严格校验，不认识 review 字段时 400（没有创建任何记录）
      if (rejectReview && body.review !== undefined) return send({ code: 'BAD_REQUEST' }, rejectReview);
      return send({ shareId: body.replaceShareId ?? 'Abc1234567', uploadId: 'u1', missing: [] });
    }
    if (/^\/api\/v1\/shares\/[A-Za-z0-9]{10}\/finalize$/.test(path)) return send({ shareId: path.split('/')[4], url: base + '/s/' + path.split('/')[4] + '/', expiresAt: '2026-11-06T12:00:00.000Z', version: 1 });
    if (path === '/api/v1/shares/Abc1234567/feedback') return send(feedback);
    if (path === '/api/v1/shares/Abc1234567/feedback/applied') return send({ applied: body.decisionIds });
    send({ code: 'NOT_FOUND' }, 404);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); await rm(root, { recursive: true, force: true }); });

async function cli(args: string[], env: NodeJS.ProcessEnv = {}, interactive = false) {
  let stdout = '', stderr = '';
  const code = await runCli(args, { stdout: s => stdout += s, stderr: s => stderr += s, cliVersion: '0.1.3',
    loadServer: async () => ({ buildSite: build, startDev: async () => ({ url: 'http://localhost:4790', attached: true }) }),
    cloud: { env: { JOPLO_HOME: home, JOPLO_CLOUD_URL: base, ...env }, interactive, openBrowser: browser, sleep: async () => undefined, now: () => 0, check: checkProject } });
  for (const secret of [token, apiKey]) expect(stdout + stderr).not.toContain(secret);
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}
const login = () => writeCredentials(home, { server: base, accessToken: token, user: { id: user.id, email: user.email }, createdAt: new Date().toISOString() });
const createBody = () => calls.find(c => c.path === '/api/v1/shares')!.body;

// ---------- 评审清单与评审版 ----------
test('普通 share：构建参数不变（没有 review），请求体带 publish 清单，清单不在上传文件里', async () => {
  await login();
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.code, r.stdout).toBe(0);
  expect(build.mock.calls[0]![0]).toEqual({ projectDir: project, outDir: expect.any(String), voiceDefault: 'cloud' });
  const body = createBody();
  expect(body.review).toMatchObject({ v: 2, mode: 'publish' });
  expect(body.review.features.map((f: any) => f.id)).toEqual(['f']);
  expect(body.review.features[0].works.map((o: any) => o.id)).toEqual(['f.a']);
  expect(body.files.map((f: any) => f.path).sort()).toEqual(['assets/a.css', 'index.html']);
  expect(body.pr).toBeUndefined();
  expect(r.json().data.mode).toBeUndefined();
  expect(JSON.parse(await readFile(join(project, '.joplo/cloud.json'), 'utf8')).shareId).toBe('Abc1234567');
});

test('share --review：构建评审版，清单 mode=review 含所有方案；输出标明评审版', async () => {
  await login();
  const r = await cli(['share', '--private',  project, '--review', '--format=json']); expect(r.code, r.stdout).toBe(0);
  expect(build.mock.calls[1]![0]).toMatchObject({ review: true });
  const body = calls.filter(c => c.path === '/api/v1/shares')[1]!.body;
  expect(body.review.mode).toBe('review');
  expect(body.review.features.map((f: any) => f.id)).toEqual(['f', 'g']);
  expect(body.review.scenarios.map((s: any) => s.id)).toEqual(['f.a.main', 'f.b.only', 'g.a.view']);
  expect(r.json().data.review.mode).toBe('review');
  const text = await cli(['share', '--private',  project, '--review']);
  expect(text.stdout).toContain('Published the review version');
});

test('share --review 遇到不支持评审版的旧 server：主分享成功，评审不上传，提示主链接与重试', async () => {
  await login();
  build.mockImplementationOnce(build.getMockImplementation()!).mockImplementationOnce(async ({ outDir }: { outDir?: string }) => {
    for (const [p, content] of Object.entries(built)) { await mkdir(join(outDir!, p, '..'), { recursive: true }); await writeFile(join(outDir!, p), content); }
    return { outDir: outDir!, files: Object.keys(built), diagnostics: [], routes: [], scenarios: [] };
  });
  const r = await cli(['share', '--private',  project, '--review', '--format=json']);
  expect(r.code).toBe(1); expect(r.json().error.code).toBe('UNSUPPORTED_ACTION');
  expect(calls.filter(c => c.path === '/api/v1/shares')).toHaveLength(1);
  expect(r.stderr).toContain('The main share is already published:');
});

test('评审清单超过 512 KiB：--review 在构建和任何请求之前失败；普通 share 只警告并省略清单，照常发布', async () => {
  await login();
  for (let i = 0; i < 400; i++) devIr.rules[`f.r${i}`] = { id: `f.r${i}`, featureId: 'f', text: '规'.repeat(REVIEW_LIMITS.text.rule), origin: 'user', confirmation: 'pending', caseIds: [], elementIds: [] };
  let r = await cli(['share', '--private',  project, '--review', '--format=json']);
  expect(r.code).toBe(1); expect(r.json().error).toMatchObject({ code: 'EXPORT_FAILED' }); expect(r.stdout).toContain('512 KiB');
  expect(calls).toEqual([]); expect(build).not.toHaveBeenCalled();
  r = await cli(['share', '--private', '--no-review',  project, '--format=json']);
  expect(r.code, r.stdout).toBe(0); expect(r.stderr).toContain('review manifest');
  expect(createBody().review).toBeUndefined();
});

test('API Key 缺少权限（403 FORBIDDEN）：说明是 Key 的权限范围，不是账号不可用；feedback 的 403 说明只有主人能操作', async () => {
  responses.set('/api/v1/me', { status: 403, body: { code: 'FORBIDDEN' } });
  let r = await cli(['whoami', '--format=json'], { JOPLO_API_KEY: apiKey });
  expect(r.code).toBe(1); expect(r.json().error.code).toBe('FORBIDDEN'); expect(r.json().error.message).toContain('permission'); expect(r.json().error.message).toContain('jpk_A1b2');
  responses.set('/api/v1/shares/Abc1234567/feedback', { status: 403, body: { code: 'FORBIDDEN' } });
  await login();
  r = await cli(['feedback', project, '--share', 'Abc1234567', '--format=json']);
  expect(r.json().error.code).toBe('FORBIDDEN'); expect(r.json().error.message).toContain('owner');
  r = await cli(['feedback', project, '--share', 'Abc1234567', '--format=json'], { JOPLO_API_KEY: apiKey });
  expect(r.json().error.message).toContain('permission');
});

test('检查替身不给 IR 时（旧调用方）普通 share 不带 review 字段，--review 报错', async () => {
  await login();
  checkProject.mockResolvedValue({ name: 'Fixture', diagnostics: [], summary: { error: 0, warning: 0, info: 0 }, verification: {} });
  expect((await cli(['share', '--private', '--no-review',  project])).code).toBe(0);
  expect(createBody().review).toBeUndefined();
  calls = [];
  const r = await cli(['share', '--private',  project, '--review', '--format=json']);
  expect(r.json().error.code).toBe('UNSUPPORTED_ACTION'); expect(calls).toEqual([]);
  checkProject.mockReset(); checkProject.mockImplementation(async () => ({ name: 'Fixture', diagnostics: [], summary: { error: 0, warning: 0, info: 0 }, verification: {}, project: devIr }));
});

// ---------- JOPLO_API_KEY ----------
async function credentialsTrap() {
  // 另一个 server 的凭证 + 不可读的权限：只要读了 credentials.json 就会报错或告警
  await writeCredentials(home, { server: 'https://other.example', accessToken: token, user: { id: user.id, email: user.email }, createdAt: '2026-11-01T00:00:00.000Z' });
  await chmod(join(home, 'credentials.json'), 0o000);
  return (await stat(join(home, 'credentials.json'))).mtimeMs;
}
test('JOPLO_API_KEY：share、whoami、feedback 都用 Bearer <key>，不读写 credentials.json，不打开浏览器', async () => {
  const mtime = await credentialsTrap();
  await mkdir(join(project, '.joplo')); await writeFile(join(project, '.joplo/cloud.json'), JSON.stringify({ server: base, shareId: 'Abc1234567', url: base + '/s/Abc1234567/' }));
  for (const args of [['share', '--private', '--no-review',  project, '--format=json'], ['whoami', '--format=json'], ['feedback', project, '--format=json'], ['feedback', project, '--applied', 'd1']]) {
    const r = await cli(args, { JOPLO_API_KEY: apiKey }, true);
    expect(r.code, `${args.join(' ')}\n${r.stdout}${r.stderr}`).toBe(0);
    expect(r.stderr).not.toMatch(/credentials/i);
  }
  const authed = calls.filter(c => c.path.startsWith('/api/'));
  expect(authed.length).toBeGreaterThan(4);
  for (const c of authed) expect(c.headers.authorization).toBe(`Bearer ${apiKey}`);
  expect(calls.some(c => c.path.startsWith('/api/auth/'))).toBe(false);
  expect(browser).not.toHaveBeenCalled();
  expect((await stat(join(home, 'credentials.json'))).mtimeMs).toBe(mtime);
  await chmod(join(home, 'credentials.json'), 0o600);
});

test('JOPLO_API_KEY：whoami 显示 Key 的名字和前缀；服务端没给时容错，只显示本地前缀', async () => {
  let r = await cli(['whoami'], { JOPLO_API_KEY: apiKey });
  expect(r.stdout).toContain('API key "team-invite CI" jpk_A1b2…'); expect(r.stdout).toContain('shares:publish, feedback:read');
  r = await cli(['whoami', '--format=json'], { JOPLO_API_KEY: apiKey });
  expect(r.json().data.apiKey).toEqual({ name: 'team-invite CI', prefix: 'jpk_A1b2', scopes: ['shares:publish', 'feedback:read'], expiresAt: '2027-02-04T00:00:00.000Z' });
  responses.set('/api/v1/me', { body: { user, plan: 'free', limits, credential: { kind: 'api_key', name: 42, prefix: '<bad>' } } });
  r = await cli(['whoami', '--format=json'], { JOPLO_API_KEY: apiKey });
  expect(r.code).toBe(0); expect(r.json().data.apiKey).toEqual({ name: null, prefix: 'jpk_A1b2', scopes: null, expiresAt: null });
  // credential 不是 api_key（设备会话）或缺失时同样容错
  responses.set('/api/v1/me', { body: { user, plan: 'free', limits, credential: { kind: 'device' } } });
  r = await cli(['whoami', '--format=json'], { JOPLO_API_KEY: apiKey });
  expect(r.json().data.apiKey).toEqual({ name: null, prefix: 'jpk_A1b2', scopes: null, expiresAt: null });
  responses.delete('/api/v1/me');
  // 没有 Key 时输出与原来一致（没有 apiKey 字段，即使服务端返回 credential）
  await login(); r = await cli(['whoami', '--format=json']);
  expect(r.json().data).toEqual({ user, plan: 'free', limits });
});

test('JOPLO_API_KEY：login 只提示已经在用环境变量，不联网、不写凭证、不开浏览器；logout 不删凭证', async () => {
  let r = await cli(['login'], { JOPLO_API_KEY: apiKey }, true);
  expect(r.code).toBe(0); expect(r.stdout).toContain('JOPLO_API_KEY is set');
  expect(calls).toEqual([]); expect(browser).not.toHaveBeenCalled();
  await expect(stat(join(home, 'credentials.json'))).rejects.toThrow();
  await login();
  r = await cli(['logout'], { JOPLO_API_KEY: apiKey });
  expect(r.code).toBe(0); expect(calls).toEqual([]);
  expect((await stat(join(home, 'credentials.json'))).isFile()).toBe(true);
});

test('JOPLO_API_KEY：无效或过期返回 AUTH_EXPIRED，指向 API Key 设置页；格式不对时不发请求', async () => {
  responses.set('/api/v1/me', { status: 401, body: { code: 'AUTH_EXPIRED', message: apiKey } });
  let r = await cli(['whoami', '--format=json'], { JOPLO_API_KEY: apiKey });
  expect(r.code).toBe(3); expect(r.json().error.code).toBe('AUTH_EXPIRED'); expect(r.json().error.message).toContain('API keys'); expect(r.json().error.message).toContain('jpk_A1b2');
  calls = [];
  r = await cli(['whoami', '--format=json'], { JOPLO_API_KEY: 'not-a-key' });
  expect(r.code).toBe(2); expect(r.json().error.code).toBe('USAGE'); expect(calls).toEqual([]);
});

// ---------- --pr ----------
test('--pr 不在 Actions 里且没有 --repo：USAGE，不登录、不构建、不发请求', async () => {
  await login();
  const r = await cli(['share', '--private', '--no-review',  project, '--pr', '42', '--format=json']);
  expect(r.code).toBe(2); expect(r.json().error).toMatchObject({ code: 'USAGE' }); expect(r.json().error.message).toContain('--repo owner/name');
  expect(calls).toEqual([]); expect(build).not.toHaveBeenCalled(); expect(checkProject).not.toHaveBeenCalled();
  for (const bad of [['--repo', 'not a repo'], ['--repo', 'o/..']]) {
    const b = await cli(['share', '--private', '--no-review',  project, '--pr', '42', ...bad, '--sha', sha, '--format=json']);
    expect(b.code).toBe(2);
  }
  expect((await cli(['share', '--private', '--no-review',  project, '--pr', '0'])).code).toBe(2);
  expect((await cli(['share', '--private', '--no-review',  project, '--repo', 'o/r'])).code).toBe(2);
  expect(calls).toEqual([]);
});

const actionsEnv = async (event: unknown) => {
  const file = join(root, 'event.json'); await writeFile(file, JSON.stringify(event));
  return { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'acme/app', GITHUB_SHA: sha, GITHUB_EVENT_PATH: file, GITHUB_SERVER_URL: 'https://github.com', GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '1', JOPLO_API_KEY: apiKey };
};
test('--pr 在 GitHub Actions 里：repo、PR head、runUrl 从环境补全；不写 cloud.json；skipped 时打印原因和安装地址', async () => {
  responses.set('/api/v1/shares/Abc1234567/finalize', { body: { shareId: 'Abc1234567', url: base + '/s/Abc1234567/', expiresAt: null, version: 1, pr: { comment: 'skipped', reason: 'app_not_installed', installUrl: 'https://cloud.joplo.app/settings/github' } } });
  const env = await actionsEnv({ pull_request: { number: 42, head: { sha: headSha } } });
  const r = await cli(['share', '--private', '--no-review',  project, '--new', '--pr', '42'], env);
  expect(r.code, r.stdout + r.stderr).toBe(0);
  expect(createBody().pr).toEqual({ provider: 'github', repo: 'acme/app', number: 42, headSha, runUrl: 'https://github.com/acme/app/actions/runs/123456' });
  expect(r.stdout).toMatch(/PR comment skipped: .*not installed.*https:\/\/cloud\.joplo\.app\/settings\/github/);
  expect(r.stdout.split('\n').filter(l => l.startsWith('PR comment'))).toHaveLength(1);
  await expect(stat(join(project, '.joplo/cloud.json'))).rejects.toThrow();
  const j = await cli(['share', '--private', '--no-review',  project, '--new', '--pr', '42', '--format=json'], env);
  expect(j.json().data.pr).toEqual({ comment: 'skipped', reason: 'app_not_installed', installUrl: 'https://cloud.joplo.app/settings/github' });
});

test('prContext：push 事件用 GITHUB_SHA，重试的 run 带 attempts，GHE 的 runUrl 为 null；Actions 外读 git HEAD', async () => {
  const env = await actionsEnv({ ref: 'refs/heads/main' });
  expect(await prContext({ pr: 7 }, { ...env, GITHUB_RUN_ATTEMPT: '2' }, project)).toEqual({ provider: 'github', repo: 'acme/app', number: 7, headSha: sha, runUrl: 'https://github.com/acme/app/actions/runs/123456/attempts/2' });
  expect((await prContext({ pr: 7 }, { ...env, GITHUB_SERVER_URL: 'https://ghe.example.com' }, project)).runUrl).toBeNull();
  expect((await prContext({ pr: 7 }, { ...env, GITHUB_EVENT_PATH: join(root, 'missing.json') }, project)).headSha).toBe(sha);
  expect(await prContext({ pr: 7, repo: 'o/r' }, {}, project, { gitHead: async () => headSha.toUpperCase() })).toEqual({ provider: 'github', repo: 'o/r', number: 7, headSha, runUrl: null });
  await expect(prContext({ pr: 7, repo: 'o/r' }, {}, project, { gitHead: async () => null })).rejects.toMatchObject({ code: 'USAGE' });
  await expect(prContext({ pr: 7 }, { GITHUB_ACTIONS: 'true' }, project)).rejects.toMatchObject({ code: 'USAGE' });
});

// ---------- feedback ----------
test('feedback 文本输出：决定在前（选定方案、否决规则：理由、问题的回答），评论带场景、步骤、元素', async () => {
  await login(); await mkdir(join(project, '.joplo')); await writeFile(join(project, '.joplo/cloud.json'), JSON.stringify({ server: base, shareId: 'Abc1234567', url: base + '/s/Abc1234567/' }));
  const r = await cli(['feedback', project]); expect(r.code, r.stdout).toBe(0);
  const out = r.stdout;
  expect(out).toContain('Pick option f.b for feature f');
  expect(out).toContain('Reject rule f.a.retry: Only block repeats within one minute');
  expect(out).toContain('Answer to question f.dup: 7 days');
  expect(out).toContain('Confirm rule f.a.keep');
  expect(out).toContain('scenario f.a.main · step 1 (f.a.main#1) · element go "Go" — Alice');
  expect(out.indexOf('Decisions')).toBeLessThan(out.indexOf('Unresolved comments'));
  expect(out).toContain('--applied d1,d2,d3,d4');
  expect(calls.map(c => [c.method, c.path])).toEqual([['GET', '/api/v1/shares/Abc1234567/feedback']]);
  expect(calls[0]!.headers.authorization).toBe(`Bearer ${token}`);
});

test('feedback --format json 沿用结果信封；--share 覆盖 cloud.json；--applied/--ref 调 feedback/applied', async () => {
  await login();
  let r = await cli(['feedback', project, '--share', 'Abc1234567', '--format=json']);
  expect(r.json()).toMatchObject({ ok: true, summary: '4 decision(s), 1 unresolved comment(s)', data: feedback, diagnostics: [] });
  r = await cli(['feedback', project, '--share', 'Abc1234567', '--applied', 'd1, d2,d1', '--ref', 'abc123', '--format=json']);
  expect(r.json()).toMatchObject({ ok: true, data: { shareId: 'Abc1234567', applied: ['d1', 'd2'] } });
  expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/api/v1/shares/Abc1234567/feedback/applied', body: { decisionIds: ['d1', 'd2'], ref: 'abc123' } });
  r = await cli(['feedback', project, '--share', 'Abc1234567', '--applied', 'd3']);
  expect(calls.at(-1)!.body).toEqual({ decisionIds: ['d3'] }); expect(r.stdout).toContain('Marked 1 decision(s) as applied: d3');
});

test('feedback 错误：没有记录或 --share 不合法、--ref 单独使用 → USAGE 不发请求；未登录 AUTH_REQUIRED；坏响应 INVALID_RESPONSE；404 说明', async () => {
  for (const args of [['feedback', project], ['feedback', project, '--share', 'bad'], ['feedback', project, '--share', 'Abc1234567', '--ref', 'x'], ['feedback', project, '--share', 'Abc1234567', '--applied', 'a b']]) {
    const r = await cli([...args, '--format=json']); expect(r.code, args.join(' ')).toBe(2); expect(r.json().error.code).toBe('USAGE');
  }
  await mkdir(join(project, '.joplo')); await writeFile(join(project, '.joplo/cloud.json'), JSON.stringify({ server: 'https://other.example', shareId: 'Abc1234567' }));
  expect((await cli(['feedback', project, '--format=json'])).json().error.message).toContain('belongs to https://other.example');
  expect(calls).toEqual([]);
  let r = await cli(['feedback', project, '--share', 'Abc1234567', '--format=json']);
  expect(r.code).toBe(3); expect(r.json().error.code).toBe('AUTH_REQUIRED'); expect(calls).toEqual([]);
  await login();
  responses.set('/api/v1/shares/Abc1234567/feedback', { body: { share: { id: 'Abc1234567', version: 1 }, decisions: [{ id: 'x' }], comments: [] } });
  r = await cli(['feedback', project, '--share', 'Abc1234567', '--format=json']); expect(r.json().error.code).toBe('INVALID_RESPONSE');
  r = await cli(['feedback', project, '--share', 'Zzz1234567', '--format=json']); expect(r.json().error.code).toBe('NOT_FOUND'); expect(r.json().error.message).toContain('no review data');
});

// ---------- 评审版是单独的分享（契约 8.1） ----------
const record = async () => JSON.parse(await readFile(join(project, '.joplo/cloud.json'), 'utf8'));
const writeRecord = async (v: unknown) => { await mkdir(join(project, '.joplo'), { recursive: true }); await writeFile(join(project, '.joplo/cloud.json'), JSON.stringify(v)); };

test('Pro share --review 不覆盖主链接：评审版另存 review 记录，只用 review.shareId 作 replaceShareId；普通 share 只用主 shareId', async () => {
  plan = 'pro'; await login();
  await writeRecord({ server: base, shareId: 'Main123456', url: base + '/s/Main123456/' });
  expect((await cli(['share', '--private',  project, '--review'])).code).toBe(0);
  expect(calls.filter(c => c.path === '/api/v1/shares').map(c => c.body.replaceShareId)).toEqual(['Main123456', undefined]);
  expect(await record()).toEqual({ server: base, shareId: 'Main123456', url: base + '/s/Main123456/', passwordProtected: false, review: { shareId: 'Abc1234567', url: base + '/s/Abc1234567/', passwordProtected: false } });
  calls = [];
  expect((await cli(['share', '--private',  project, '--review'])).code).toBe(0);
  expect(calls.filter(c => c.path === '/api/v1/shares').map(c => c.body.replaceShareId)).toEqual(['Main123456', 'Abc1234567']);
  calls = [];
  responses.set('/api/v1/shares', { body: { shareId: 'Main123456', uploadId: 'u1', missing: [] } });
  responses.set('/api/v1/shares/Main123456/finalize', { body: { shareId: 'Main123456', url: base + '/s/Main123456/', expiresAt: null, version: 2 } });
  expect((await cli(['share', '--private', '--no-review',  project])).code).toBe(0);
  expect(createBody().replaceShareId).toBe('Main123456');
  expect(createBody().review.mode).toBe('publish');
  expect(await record()).toEqual({ server: base, shareId: 'Main123456', url: base + '/s/Main123456/', passwordProtected: false, review: { shareId: 'Abc1234567', url: base + '/s/Abc1234567/', passwordProtected: false } });
  // --new 两种都不带 replaceShareId
  calls = []; responses.clear();
  expect((await cli(['share', '--private',  project, '--review', '--new'])).code).toBe(0);
  expect(createBody().replaceShareId).toBeUndefined();
});

test('只有评审版记录时普通 share 新建主链接；其他 server 的旧记录被整体替换', async () => {
  plan = 'pro'; await login();
  await writeRecord({ server: base, review: { shareId: 'Rev1234567', url: base + '/s/Rev1234567/' } });
  expect((await cli(['share', '--private', '--no-review',  project])).code).toBe(0);
  expect(createBody().replaceShareId).toBeUndefined();
  expect(await record()).toEqual({ server: base, shareId: 'Abc1234567', url: base + '/s/Abc1234567/', passwordProtected: false, review: { shareId: 'Rev1234567', url: base + '/s/Rev1234567/', passwordProtected: false } });
  await writeRecord({ server: 'https://other.example', shareId: 'Old1234567', url: 'https://other.example/s/Old1234567/', review: { shareId: 'Rev1234567', url: 'https://other.example/s/Rev1234567/' } });
  calls = [];
  expect((await cli(['share', '--private',  project, '--review'])).code).toBe(0);
  expect(createBody().replaceShareId).toBeUndefined();
  expect(await record()).toEqual({ server: base, shareId: 'Abc1234567', url: base + '/s/Abc1234567/', passwordProtected: false, review: { shareId: 'Abc1234567', url: base + '/s/Abc1234567/', passwordProtected: false } });
});

test('feedback 默认读评审分享，没有时读主分享；--share 仍可指定', async () => {
  await login();
  responses.set('/api/v1/shares/Main123456/feedback', { body: { ...feedback, share: { id: 'Main123456', version: 1 } } });
  await writeRecord({ server: base, shareId: 'Main123456', url: base + '/s/Main123456/', review: { shareId: 'Abc1234567', url: base + '/s/Abc1234567/' } });
  expect((await cli(['feedback', project])).code).toBe(0);
  expect(calls.at(-1)!.path).toBe('/api/v1/shares/Abc1234567/feedback');
  expect((await cli(['feedback', project, '--share', 'Main123456'])).code).toBe(0);
  expect(calls.at(-1)!.path).toBe('/api/v1/shares/Main123456/feedback');
  await writeRecord({ server: base, shareId: 'Main123456', url: base + '/s/Main123456/' });
  expect((await cli(['feedback', project])).code).toBe(0);
  expect(calls.at(-1)!.path).toBe('/api/v1/shares/Main123456/feedback');
  await writeRecord({ server: base, shareId: 'Main123456', review: { shareId: 'bad' } });
  const r = await cli(['feedback', project, '--format=json']);
  expect(r.code).toBe(2); expect(r.json().error.code).toBe('USAGE');
});

test('服务端因 review 字段返回 400：普通 share 去掉 review 重试一次并提示；--review 仍报错；其他状态不重试', async () => {
  await login(); rejectReview = 400;
  let r = await cli(['share', '--private', '--no-review',  project, '--format=json']);
  expect(r.code, r.stdout).toBe(0);
  const creates = calls.filter(c => c.path === '/api/v1/shares');
  expect(creates).toHaveLength(2);
  expect(creates[0]!.body.review).toBeDefined(); expect(creates[1]!.body.review).toBeUndefined();
  expect({ ...creates[1]!.body, review: undefined }).toEqual({ ...creates[0]!.body, review: undefined });
  expect(r.stderr.split('\n').filter(l => /review manifest/i.test(l))).toHaveLength(1);
  calls = [];
  r = await cli(['share', '--private',  project, '--review', '--format=json']);
  expect(r.code).toBe(1); expect(r.json().error.code).toBe('BAD_REQUEST');
  expect(calls.filter(c => c.path === '/api/v1/shares')).toHaveLength(3);
  for (const status of [413, 422, 403]) {
    calls = []; rejectReview = status;
    r = await cli(['share', '--private', '--no-review',  project, '--format=json']);
    expect(r.code, String(status)).not.toBe(0);
    expect(calls.filter(c => c.path === '/api/v1/shares'), String(status)).toHaveLength(1);
  }
});

// ---------- 按场景保密分享（D75） ----------
/** 假的范围构建：产物 IR 只有范围内的场景，并返回 scope（与 @joplo-app/server 的 buildSite 一致）。 */
const scopedBuild = (borrowed: unknown[] = []) => async ({ outDir, scope }: { outDir?: string; scope?: { scenarios?: string[] } }) => {
  const ids = scope?.scenarios ?? [];
  const html = `<html><script type="application/json" id="joplo-ir">${JSON.stringify({ project: { mode: 'publish', features: { f: {} }, works: {}, scenarios: Object.fromEntries(ids.map(id => [id, {}])) }, home: null, scoped: true })}</script></html>`;
  await mkdir(outDir!, { recursive: true }); await writeFile(join(outDir!, 'index.html'), html);
  return { outDir: outDir!, files: ['index.html'], diagnostics: [], routes: [], scenarios: ids, scope: { key: [...ids].sort().join(','), scenarios: ids, entryIds: ['f'], borrowed } };
};

test('share --scenario：构建带范围；清单只含范围内；标题带场景名；记在 scoped，不动主链接', async () => {
  await login();
  await mkdir(join(project, '.joplo'), { recursive: true });
  await writeFile(join(project, '.joplo/cloud.json'), JSON.stringify({ server: base, shareId: 'Main123456', url: base + '/s/Main123456/' }));
  build.mockImplementationOnce(scopedBuild([{ kind: 'element', entryId: 'g', entryTitle: 'Audit', workId: 'g.a', elementId: 'seat', route: '/', refs: ['seat'], scenarios: ['f.a.main'] }]));
  const r = await cli(['share', '--private', '--no-review',  project, '--scenario', 'f.a.main', '--format=json']); expect(r.code, r.stdout).toBe(0);
  expect(build.mock.calls[0]![0]).toEqual({ projectDir: project, outDir: expect.any(String), scope: { scenarios: ['f.a.main'] }, voiceDefault: 'cloud' });
  const body = createBody();
  expect(body.title).toBe('Fixture · Main');
  expect(body.review.features.map((f: any) => f.id)).toEqual(['f']);
  expect(body.review.scenarios.map((s: any) => s.id)).toEqual(['f.a.main']);
  expect(r.stderr).toContain('Borrowed from another feature: Audit › element "seat" on /');
  expect(r.json().data.scope).toMatchObject({ key: 'f.a.main', scenarios: ['f.a.main'] });
  const record = JSON.parse(await readFile(join(project, '.joplo/cloud.json'), 'utf8'));
  expect(record.shareId).toBe('Main123456');
  expect(record.scoped).toEqual({ 'f.a.main': { shareId: 'Abc1234567', url: base + '/s/Abc1234567/', passwordProtected: false } });
});

test('Pro 重新分享同一范围：只替换这个范围的分享，不用主链接', async () => {
  await login(); plan = 'pro';
  await mkdir(join(project, '.joplo'), { recursive: true });
  await writeFile(join(project, '.joplo/cloud.json'), JSON.stringify({ server: base, shareId: 'Main123456', url: base + '/s/Main123456/', scoped: { 'f.a.main': { shareId: 'Scop123456', url: base + '/s/Scop123456/' } } }));
  build.mockImplementationOnce(scopedBuild());
  const r = await cli(['share', '--private', '--no-review',  project, '--work', 'f', '--format=json']); expect(r.code, r.stdout).toBe(0);
  // --work f = 选定方案 a 的全部场景 = f.a.main，与上次是同一个范围
  expect(createBody().replaceShareId).toBe('Scop123456');
  const record = JSON.parse(await readFile(join(project, '.joplo/cloud.json'), 'utf8'));
  expect(record.shareId).toBe('Main123456');
});

test('写错场景、没选定方案：在构建和任何云端请求之前失败', async () => {
  await login();
  let r = await cli(['share', '--private', '--no-review',  project, '--scenario', 'f.main', '--format=json']);
  expect(r.code).toBe(1); expect(r.json().error.code).toBe('NOT_FOUND'); expect(r.stdout).toContain('f.a.main');
  // 没选定方案属于用法错误（USAGE，退出码 2）
  r = await cli(['share', '--private', '--no-review',  project, '--scenario', 'f.b.only', '--format=json']);
  expect(r.code).toBe(2); expect(r.json().error.message).toMatch(/not the picked work/);
  r = await cli(['share', '--private', '--no-review',  project, '--work', 'g', '--format=json']);
  expect(r.code).toBe(2); expect(r.json().error.message).toMatch(/no picked work/);
  expect(build).not.toHaveBeenCalled(); expect(calls).toEqual([]);
});

test('范围分享遇到忽略 scope 的旧 server（产物里有范围外场景）：失败，不上传', async () => {
  await login();
  const r = await cli(['share', '--private', '--no-review',  project, '--scenario', 'f.a.main', '--format=json']);
  expect(r.code).toBe(1); expect(r.json().error.code).toBe('UNSUPPORTED_ACTION');
  expect(calls.some(c => c.path === '/api/v1/shares')).toBe(false);
});

/** 独立作品同样通过范围解析、清单和构建链路，绝不因草稿而上传空内容。 */
test('share --work：独立作品范围、摘要与草稿拒绝；评审版不泄露旧稿', async () => {
  const source = reviewSource();
  source.works = Object.fromEntries(['demo', 'old'].map(key => [key, {
    ...work({ title: key, summary: 'Standalone', draft: key === 'old', stage: jsx('div', { children: key }),
      scenarios: { intro: chapter('Introduction').system('Begin') } }), file: `/p/works/${key}.tsx`,
  }]));
  devIr = compile(source, 'dev').project!;
  expect(devIr).not.toBeNull();
  build.mockImplementationOnce(async opts => ({ ...await scopedBuild()(opts as any),
    entries: [{ id: 'demo', title: 'demo', slices: 1, sequencing: 'linear' }],
    diagnostics: [{ code: 'WORK_DRAFT_SKIPPED', severity: 'info', source: 'structure', message: 'Draft work "old" was skipped' }],
  }) as any);
  const r = await cli(['share', project, '--work', 'demo', '--no-review', '--format=json'], { JOPLO_API_KEY: apiKey });
  expect(r.code, r.stdout + r.stderr).toBe(0);
  expect(build.mock.calls[0]![0]).toMatchObject({ scope: { scenarios: ['demo.intro'] } });
  expect(r.json().data.entries).toEqual([{ id: 'demo', title: 'demo', slices: 1, sequencing: 'linear' }]);
  expect(r.stderr).toContain('Works: 1 · demo (demo)'); expect(r.stderr).toContain('WORK_DRAFT_SKIPPED');
  expect(calls.find(c => c.path === '/api/v1/shares')!.body.review.works.map((w: any) => w.id)).toEqual(['demo']);
  for (const review of ['--no-review', '--review']) {
    calls = []; build.mockClear();
    const draft = await cli(['share', project, '--work', 'old', review, '--format=json'], { JOPLO_API_KEY: apiKey });
    expect(draft.code).toBe(2); expect(draft.json().error.message).toMatch(/draft/i);
    expect(build).not.toHaveBeenCalled(); expect(calls).toEqual([]);
  }
});

test.each(['stage','on','routes','translated'] as const)('分享请求的全部 JSON 不含 %s 草稿，普通/评审/范围分享均覆盖',async kind=>{
  devIr=compile(publicationSource(kind),'dev').project!;
  const original=build.getMockImplementation()!;
  build.mockImplementation(async opts=>{
    const baseResult=await original(opts);
    const publicProject=compile(publicationSource(kind),opts.review?'review':'publish').project!;
    const request=(opts as typeof opts & {scope?:{scenarios:string[]}}).scope;
    const scoped=request?scopeProject(publicProject,request.scenarios,opts.review?'review':'publish'):undefined;
    await writeFile(join(baseResult.outDir,'index.html'),`<script type="application/json" id="joplo-ir">${JSON.stringify({project:scoped?.project??publicProject})}</script>`);
    return {...baseResult,...(scoped?{scope:scoped.info}:{})};
  });
  try {
    for(const review of ['--review','--no-review'])for(const scoped of [false,true]){
      const r=await cli(['share','--private',review,project,...(scoped?['--work','live']:[]),'--format=json'],{JOPLO_API_KEY:apiKey});
      expect(r.code,r.stdout).toBe(0);
      const sent=JSON.stringify(calls.filter(c=>c.path==='/api/v1/shares').map(c=>c.body));
      for(const secret of PRIVATE)expect(sent).not.toContain(secret);
    }
  } finally {build.mockImplementation(original);}
});
