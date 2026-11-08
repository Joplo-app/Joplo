/**
 * 第一批云端功能的 CLI 侧（契约 8.1、8.3–8.5），用本地假服务器验证请求与响应。不变量：
 * 1. share 请求体带 review 清单（mode 区分 publish / review），清单不作为文件上传；--review 时构建评审版；超长清单在任何请求之前失败；
 * 2. 设置 JOPLO_API_KEY 时所有云端命令用 Bearer <key>，不读写 credentials.json、不打开浏览器、不进设备登录；
 * 3. --pr 缺 repo 时明确报错且不发请求；Actions 环境变量齐全时 pr 字段正确（PR 事件优先用 PR head）；
 * 4. feedback：决定在前、评论在后；--format json 用结果信封；--applied 调 feedback/applied。
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createServer, type IncomingMessage } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compile, type Project } from '@joplo-app/core';
import { runCli } from '../src/cli.ts';
import { writeCredentials } from '../src/cloud.ts';
import type { CloudPublishRequest } from '../../server/src/cloud.ts';
import { reviewSource } from '../../core/test/fixtures/review.ts';

const token = 'session-token-NEVER-PRINT';
const apiKey = 'jpk_' + 'A1b2C3d4'.repeat(5);
const user = { id: 'user-1', email: 'user@example.com', name: 'User' };
const limits = { maxUploadBytes: 20 * 1024 * 1024, maxTotalBytes: 256 * 1024 * 1024, maxFiles: 2000, publishesPerHour: 30 };
const sha = 'a'.repeat(40);
type Call = { path: string; method: string; headers: IncomingMessage['headers']; body: any };
let root: string, home: string, project: string, base: string, calls: Call[], server: ReturnType<typeof createServer>;
let responses: Map<string, { status?: number; body: unknown }>;
let devIr: Project;
let portfolio: unknown, visibility: unknown;
let plan: 'free' | 'pro', rejectReview: number;
let strictVisibility: boolean;
let reviewErrorMessage: string | undefined;
const browser = vi.fn(async () => true);
const files = { 'index.html': '<html><script type="application/json" id="joplo-ir">{"project":{"mode":"publish","features":{},"options":{},"scenarios":{}}}</script></html>', 'assets/a.css': 'body{}' };
let built: Record<string, string>;
const buildFiles = async ({ outDir, review }: { outDir?: string; review?: boolean }) => {
  const out = review ? { ...built, 'index.html': built['index.html']!.replace('"mode":"publish"', '"mode":"review"') } : built;
  for (const [p, content] of Object.entries(out)) { await mkdir(join(outDir!, p, '..'), { recursive: true }); await writeFile(join(outDir!, p), content); }
  return { outDir: outDir!, files: Object.keys(out), diagnostics: [], routes: [], scenarios: [] };
};
const build = vi.fn(buildFiles);
const checkProject = vi.fn(async (): Promise<any> => ({ name: 'Fixture', diagnostics: [], summary: { error: 0, warning: 0, info: 0 }, verification: {}, project: devIr }));

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'joplo-review-cli-')); home = join(root, 'home'); project = join(root, 'project');
  await mkdir(project); calls = []; responses = new Map(); portfolio = undefined; visibility = undefined; plan = 'free'; rejectReview = 0; strictVisibility = false; reviewErrorMessage = undefined; built = { ...files }; build.mockReset(); build.mockImplementation(buildFiles); checkProject.mockClear(); browser.mockClear();
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
      if (strictVisibility && body.visibility !== undefined) return send({ code: 'BAD_REQUEST', message: 'Unknown field visibility' }, 400);
      if (rejectReview && body.review !== undefined) return send({ code: 'BAD_REQUEST', ...(reviewErrorMessage ? { message: reviewErrorMessage } : {}) }, rejectReview);
      return send({ shareId: body.review?.mode === 'review' ? 'Rev1234567' : 'Abc1234567', uploadId: 'u1', missing: [] });
    }
    if (/^\/api\/v1\/shares\/[A-Za-z0-9]{10}\/finalize$/.test(path)) return send({ shareId: path.split('/')[4], url: base + '/s/' + path.split('/')[4] + '/', expiresAt: null, version: 1, visibility: path.includes('Rev1234567') ? 'private' : visibility, portfolio });
    if (path === '/api/v1/shares/Abc1234567/feedback') return send(feedback);
    if (path === '/api/v1/shares/Abc1234567/feedback/applied') return send({ applied: body.decisionIds });
    send({ code: 'NOT_FOUND' }, 404);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); await rm(root, { recursive: true, force: true }); });

async function cli(args: string[], env: NodeJS.ProcessEnv = {}, interactive = false, choose?: (question: string, choices: readonly string[], initial: number) => Promise<number>, readPassword?: (question: string) => Promise<string>) {
  let stdout = '', stderr = '';
  const code = await runCli(args, { stdout: s => stdout += s, stderr: s => stderr += s, cliVersion: '0.1.3',
    loadServer: async () => ({ buildSite: build, startDev: async () => ({ url: 'http://localhost:4790', attached: true }) }),
    cloud: { env: { JOPLO_HOME: home, JOPLO_CLOUD_URL: base, ...env }, interactive, choose, readPassword, openBrowser: browser, sleep: async () => undefined, now: () => 0, check: checkProject } });
  for (const secret of [token, apiKey]) expect(stdout + stderr).not.toContain(secret);
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}
const login = () => writeCredentials(home, { server: base, accessToken: token, user: { id: user.id, email: user.email }, createdAt: new Date().toISOString() });
const createBody = () => calls.find(c => c.path === '/api/v1/shares')!.body;


test('每次选择：非 TTY、CI、JSON 缺参数均退出 2，构建与网络之前失败', async () => {
  await login();
  await mkdir(join(project, '.joplo'), { recursive: true });
  await writeFile(join(project, '.joplo/cloud.json'), JSON.stringify({server: base, shareId: 'Abc1234567', url: base+'/s/Abc1234567/', visibility: 'public'}));
  for (const [flags, env, tty] of [[[], {}, false], [[], {CI: '1'}, true], [[], {CI: 'false'}, true], [['--json'], {}, true], [['--format=json'], {}, true]] as const) {
    const r = await cli(['share', project, ...flags], env, tty);
    expect(r.code).toBe(2);
    expect(r.stdout+r.stderr).toContain('--public'); expect(r.stdout+r.stderr).toContain('--private');
    expect(r.stdout+r.stderr).toContain('--review'); expect(r.stdout+r.stderr).toContain('--no-review');
    if (flags.length) expect(r.json().error.code).toBe('CHOICE_REQUIRED');
  }
  expect(build).not.toHaveBeenCalled(); expect(checkProject).not.toHaveBeenCalled(); expect(calls).toEqual([]);
});
test('单项缺失、互斥及公开 PR/scoped 均在本地拒绝', async () => {
  for (const flags of [['--private'], ['--no-review'], ['--public','--private','--no-review'], ['--private','--review','--no-review'], ['--public','--pr','1','--no-review'], ['--public','--scenario','f.a.main','--no-review']]) {
    const r = await cli(['share', project, ...flags, '--json']); expect(r.code, r.stdout).toBe(2);
  }
  expect(build).not.toHaveBeenCalled(); expect(calls).toEqual([]);
});
test('模拟 TTY：逐项确认，默认高亮公开和不发评审版', async () => {
  await login(); visibility = 'public';
  const choose = vi.fn(async (_q: string, _options: readonly string[], initial: number) => initial);
  const r = await cli(['share', project], {}, true, choose);
  expect(r.code, r.stderr).toBe(0); expect(choose).toHaveBeenCalledTimes(2);
  expect(choose.mock.calls[0]![1]).toEqual(['Public','Private']); expect(choose.mock.calls[0]![2]).toBe(0);
  expect(choose.mock.calls[1]![1][0]).toBe('Do not publish a review version'); expect(createBody().visibility).toBe('public');
});
test('私密新建请求体完全不加 visibility；公开发送 public，更新私密显式发送 private', async () => {
  await login();
  const r = await cli(['share', project, '--private','--no-review','--json']); expect(r.code, r.stdout).toBe(0);
  expect(Object.keys(createBody()).sort()).toEqual(['files','review','title']);
  calls=[]; visibility='public'; await cli(['share',project,'--public','--no-review','--json']); expect(createBody().visibility).toBe('public');
  calls=[]; await cli(['share',project,'--private','--no-review','--json']); expect(createBody()).toMatchObject({visibility:'private', replaceShareId:'Abc1234567'});
});
test('旧云端拒绝 visibility：明确提示，不按 review 兼容逻辑重试', async () => {
  await login(); responses.set('/api/v1/shares', { status:400, body:{code:'BAD_REQUEST', message:'Unrecognized key: visibility'} });
  const r = await cli(['share',project,'--public','--no-review','--json']);
  expect(r.code).toBe(1); expect(r.json().error.code).toBe('BAD_REQUEST');
  expect(r.json().error.message).toContain('Joplo Cloud 还不支持公开分享，请改用 --private 或稍后再试');
  expect(calls.filter(c=>c.path==='/api/v1/shares')).toHaveLength(1);
});
test('公开成功：作品地址 / 设置用户名提示及 JSON 字段', async () => {
  await login(); visibility='public';
  portfolio={workUrl:'https://show.joplo.app/@author/work',profileUrl:'https://show.joplo.app/@author',needsUsername:false,setupPath:'/settings/profile'};
  let r=await cli(['share',project,'--public','--no-review']); expect(r.stdout).toContain(portfolio.workUrl);
  portfolio={workUrl:null,profileUrl:null,needsUsername:true,setupPath:'/settings/profile'};
  r=await cli(['share',project,'--public','--no-review']); expect(r.stdout).toContain('设置用户名后，这个作品会出现在你的作品集：'+base+'/settings/profile');
  r=await cli(['share',project,'--public','--no-review','--json']); expect(r.json().data).toMatchObject({visibility:'public',portfolio});
});
test('同时发评审版：主分享 public，另一个请求是私密评审版，记录互不覆盖', async () => {
  await login(); const r=await cli(['share',project,'--public','--review','--json']); expect(r.code,r.stdout).toBe(0);
  const creates=calls.filter(c=>c.path==='/api/v1/shares'); expect(creates).toHaveLength(2);
  expect(creates[0]!.body).toMatchObject({visibility:'public',review:{mode:'publish'}});
  expect(creates[1]!.body.visibility).toBeUndefined(); expect(creates[1]!.body.review.mode).toBe('review');
  expect(r.json().data.review.url).toContain('/s/Rev1234567/'); expect(r.json().data.review.visibility).toBe('private'); expect(build).toHaveBeenCalledTimes(2);
});

test('PR/scoped 隐含私密，仍须选评审；显式 public 被拦截', async () => {
 const r=await cli(['share',project,'--pr','42','--repo','owner/repo','--sha',sha,'--no-review','--json']);
 expect(r.code,r.stdout).toBe(3); expect(r.json().error.code).toBe('AUTH_REQUIRED');
 const missing=await cli(['share',project,'--scenario','f.a.main','--json']);
 expect(missing.code).toBe(2); expect(missing.json().error.details.missing).toEqual(['--review / --no-review']);
 expect(build).not.toHaveBeenCalled(); expect(calls).toEqual([]);
});
test('旧 Cloud 缺失字段和 null 用户名兼容；新返回值原样透传并持久化', async () => {
 await login();
 let r=await cli(['whoami','--format=json']); expect(r.code).toBe(0); expect(r.json().data.username).toBeUndefined();
 responses.set('/api/v1/me',{body:{user,plan,limits,username:null,portfolioUrl:null}});
 r=await cli(['whoami','--format=json']); expect(r.json().data).toMatchObject({username:null,portfolioUrl:null});
 visibility='public';
 r=await cli(['share',project,'--public','--no-review','--json']); expect(r.code).toBe(0); expect(r.json().data.portfolio).toBeUndefined();
 expect(JSON.parse(await readFile(join(project,'.joplo/cloud.json'),'utf8')).visibility).toBe('public');
});
test('看板 bridge：本次选择进入请求；portfolio/visibility/评审返回；历史只给 UI 预填', async () => {
 const {cloudBridge}=await import('../src/cloud-bridge.ts');
 await login(); visibility='public'; portfolio={workUrl:null,profileUrl:null,needsUsername:true,setupPath:'/settings/profile'};
 const bridge=cloudBridge({version:'0.2.17',build:build as never,render:async()=>async()=>undefined,deps:{env:{JOPLO_HOME:home,JOPLO_CLOUD_URL:base},check:checkProject,sharedVoice:async()=>undefined}});
 const r=await bridge.publish(project,{visibility:'public',review:true},()=>{});
 expect(createBody().visibility).toBe('public'); expect(r).toMatchObject({visibility:'public',portfolio,review:{shareId:'Rev1234567'}});
 expect(await bridge.links!(project)).toMatchObject({main:{visibility:'public'}});
});


const recordLink = (id: string, v?: 'public' | 'private') => ({ shareId: id, url: `${base}/s/${id}/`, ...(v ? { visibility: v } : {}) });
const saveRecord = async (record: object) => {
  await mkdir(join(project, '.joplo'), { recursive: true });
  await writeFile(join(project, '.joplo/cloud.json'), JSON.stringify({ server: base, ...record }));
};
async function boardPublish(request: CloudPublishRequest = { visibility: 'private', review: false }) {
  const { cloudBridge } = await import('../src/cloud-bridge.ts');
  return cloudBridge({ version: '0.2.17', build: build as never, render: async () => async () => undefined,
    deps: { env: { JOPLO_HOME: home, JOPLO_CLOUD_URL: base }, check: checkProject, sharedVoice: async () => undefined },
  }).publish(project, request, () => undefined);
}
test.each([undefined, 'private', 'public'] as const)('私密更新：只在本地记录为 public 时发送 visibility，记录=%s；CLI/看板一致', async (previous) => {
  await login();
  strictVisibility = previous !== 'public';
  for (const path of ['cli', 'board']) {
    await saveRecord(recordLink('Abc1234567', previous)); calls = [];
    if (path === 'cli') expect((await cli(['share', project, '--private', '--no-review', '--json'])).code).toBe(0);
    else await boardPublish();
    expect(createBody().replaceShareId).toBe('Abc1234567');
    if (previous === 'public') expect(createBody().visibility).toBe('private');
    else expect(createBody()).not.toHaveProperty('visibility');
  }
});
test.each([undefined, 'private', 'public'] as const)('--update 匹配本地目标链接记录时采用相同的兼容规则，记录=%s', async (previous) => {
  await login(); strictVisibility = previous !== 'public';
  // 目标可以记在任意槽位；不能误用主链接或其他链接的可见性。
  await saveRecord({ ...recordLink('Main123456', 'public'), review: recordLink('Abc1234567', previous) });
  const r = await cli(['share', project, '--private', '--no-review', '--update', `${base}/s/Abc1234567/`, '--json']);
  expect(r.code, r.stdout).toBe(0); expect(createBody().replaceShareId).toBe('Abc1234567');
  if (previous === 'public') expect(createBody().visibility).toBe('private');
  else expect(createBody()).not.toHaveProperty('visibility');
});
test('--update 指向无本地记录的链接：私密更新不发送 visibility，旧 strict 云端接受', async () => {
  await login(); strictVisibility = true;
  await saveRecord(recordLink('Main123456', 'public'));
  const r = await cli(['share', project, '--private', '--no-review', '--update', `${base}/s/Abc1234567/`, '--json']);
  expect(r.code, r.stdout).toBe(0); expect(createBody().replaceShareId).toBe('Abc1234567'); expect(createBody()).not.toHaveProperty('visibility');
});

/** build 替身保留真实范围/模式，检查上传清单只含这次允许的场景。 */
const scopedBuild = async ({ outDir, scope, review }: { outDir: string; scope?: { scenarios: string[] }; review?: boolean }) => {
  const ids = scope?.scenarios ?? [];
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'index.html'), `<script type="application/json" id="joplo-ir">${JSON.stringify({ project: { mode: review ? 'review' : 'publish', features: {}, options: {}, scenarios: Object.fromEntries(ids.map(id => [id, {}])) } })}</script>`);
  return { outDir, files: ['index.html'], diagnostics: [], routes: [], scenarios: ids,
    scope: { key: `${review ? 'review:' : ''}${[...ids].sort().join(',')}`, scenarios: ids, features: ['f'], borrowed: [] } };
};
test.each([['--scenario', 'f.b.only'], ['--feature', 'g']] as const)('范围评审 %s %s：没有 picked 内容时只发私密评审，保留普通记录', async (flag, id) => {
  await login(); await saveRecord(recordLink('Main123456', 'private'));
  build.mockImplementationOnce(scopedBuild as never);
  const r = await cli(['share', project, '--private', '--review', flag, id, '--json']);
  expect(r.code, r.stdout).toBe(0); expect(r.json().data).toMatchObject({ mode: 'review', visibility: 'private', url: `${base}/s/Rev1234567/` });
  const creates = calls.filter(c => c.path === '/api/v1/shares'); expect(creates).toHaveLength(1);
  expect(creates[0]!.body.review.mode).toBe('review'); expect(creates[0]!.body).not.toHaveProperty('visibility');
  expect(creates[0]!.body.review.scenarios.map((s: any) => s.id)).toEqual([flag === '--scenario' ? 'f.b.only' : 'g.a.view']);
  expect(JSON.parse(await readFile(join(project, '.joplo/cloud.json'), 'utf8'))).toMatchObject({ shareId: 'Main123456' });
});
test('混合范围评审：普通版只含 picked 子集，评审版包含完整范围，分别记录各自范围', async () => {
  await login(); build.mockImplementationOnce(scopedBuild as never).mockImplementationOnce(scopedBuild as never);
  const r = await cli(['share', project, '--review', '--feature', 'f', '--feature', 'g', '--json']);
  expect(r.code, r.stdout).toBe(0);
  const creates = calls.filter(c => c.path === '/api/v1/shares'); expect(creates).toHaveLength(2);
  expect(creates[0]!.body.review.scenarios.map((s: any) => s.id)).toEqual(['f.a.main']);
  expect(creates[1]!.body.review.scenarios.map((s: any) => s.id)).toEqual(['f.a.main', 'f.b.only', 'g.a.view']);
  expect(r.json().data.scope.scenarios).toEqual(['f.a.main']);
  expect(r.json().data.review.scope.scenarios).toEqual(['f.a.main', 'f.b.only', 'g.a.view']);
  const record = JSON.parse(await readFile(join(project, '.joplo/cloud.json'), 'utf8'));
  expect(Object.keys(record.scoped).sort()).toEqual(['f.a.main', 'review:f.a.main,f.b.only,g.a.view']);
});

test('仅评审范围不把 --update 的普通链接改成评审版', async () => {
  await login(); await saveRecord(recordLink('Main123456', 'private'));
  build.mockImplementationOnce(scopedBuild as never);
  const r = await cli(['share', project, '--private', '--review', '--scenario', 'f.b.only', '--update', `${base}/s/Main123456/`, '--json']);
  expect(r.code, r.stdout).toBe(0); expect(createBody()).not.toHaveProperty('replaceShareId');
  expect(r.stderr).toContain('--update target are unchanged');
  expect(JSON.parse(await readFile(join(project, '.joplo/cloud.json'), 'utf8')).shareId).toBe('Main123456');
});

test('看板范围评审：仅评审结果携带 mode，不误显示为普通分享', async () => {
  await login(); build.mockImplementationOnce(scopedBuild as never);
  const result = await boardPublish({ visibility: 'private', review: true, features: ['g'] });
  expect(result).toMatchObject({ mode: 'review', url: `${base}/s/Rev1234567/`, visibility: 'private' });
  expect(calls.filter(c => c.path === '/api/v1/shares')).toHaveLength(1);
});


const password = 'test-only-密🔐码-42';
async function scanFiles(dir: string): Promise<void> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) await scanFiles(join(dir, e.name));
    else expect(await readFile(join(dir, e.name), 'utf8')).not.toContain(password);
  }
}
test('密码设置、保持、去掉：只在明确请求时发送，stdout/JSON/记录及构建参数无明文', async () => {
  await login(); plan = 'pro';
  const final = '/api/v1/shares/Abc1234567/finalize';
  const published = { shareId:'Abc1234567', url:base+'/s/Abc1234567/', expiresAt:null, version:1, passwordProtected:true };
  responses.set(final, { body:published });
  let r = await cli(['share',project,'--private','--no-review','--password','--json'], {JOPLO_SHARE_PASSWORD:password});
  expect(r.code,r.stdout).toBe(0); expect(createBody().password).toBe(password);
  expect(r.json().data.passwordProtected).toBe(true); expect(r.stdout+r.stderr).not.toContain(password);
  expect(JSON.parse(await readFile(join(project,'.joplo/cloud.json'),'utf8')).passwordProtected).toBe(true);
  expect(JSON.stringify(build.mock.calls)).not.toContain(password);
  await scanFiles(root);
  calls=[]; r=await cli(['share',project,'--private','--no-review'], {JOPLO_SHARE_PASSWORD:password});
  expect(r.code).toBe(0); expect(createBody()).not.toHaveProperty('password'); expect(r.stdout).toContain('已加密');
  calls=[]; responses.set(final, {body:{...published,passwordProtected:false}});
  r=await cli(['share',project,'--private','--no-review','--no-password','--json']);
  expect(r.code).toBe(0); expect(createBody().password).toBeNull(); expect(r.json().data.passwordProtected).toBe(false);
  await scanFiles(root);
});
test('密码只能用于私密普通分享；无效输入、非交互缺值、冲突与 PR/对比均退出 2 且无网络', async () => {
  for (const flags of [
    ['--public','--no-review','--password',password], ['--public','--no-review','--no-password'],
    ['--private','--no-review','--password'], ['--private','--no-review','--password','short'],
    ['--private','--no-review','--password','🔐'.repeat(129)],
    ['--private','--no-review','--password',password,'--no-password'],
    ['--private','--no-review','--password',password,'--pr','1'],
    ['--private','--no-review','--no-password','--pr','1'],
  ]) {
    const r=await cli(['share',project,...flags,'--json']); expect(r.code,r.stdout).toBe(2);
    expect(r.stdout+r.stderr).not.toContain(password);
  }
  expect((await cli(['diff','publish',project,'--password',password,'--format=json'])).code).toBe(2);
  expect(calls).toEqual([]); expect(build).not.toHaveBeenCalled();
});
test('Unicode 密码按码点计数，显式参数优先于环境变量，旧 Cloud 缺字段按 false', async () => {
  await login(); const r=await cli(['share',project,'--private','--no-review','--password','🔐'.repeat(8),'--json'], {JOPLO_SHARE_PASSWORD:password});
  expect(r.code,r.stdout).toBe(0); expect(createBody().password).toBe('🔐'.repeat(8)); expect(r.json().data.passwordProtected).toBe(false);
});
test('旧 Cloud 拒绝 password 时提示不支持，不重试删除 review；403 使用服务端升级路径', async () => {
  await login();
  responses.set('/api/v1/shares',{status:400,body:{code:'BAD_REQUEST',message:'Unrecognized key: password '+password}});
  let r=await cli(['share',project,'--private','--no-review','--password',password,'--json']);
  expect(r.code).toBe(1); expect(r.json().error.message).toContain('Joplo Cloud 还不支持密码查看');
  expect(r.stdout+r.stderr).not.toContain(password); expect(calls.filter(c=>c.path==='/api/v1/shares')).toHaveLength(1);
  responses.set('/api/v1/shares',{status:403,body:{code:'PLAN_REQUIRED',data:{upgradePath:'/upgrade/pro'}}});
  r=await cli(['share',project,'--private','--no-review','--password',password,'--json']);
  expect(r.code).toBe(1); expect(r.json().error.code).toBe('PLAN_REQUIRED'); expect(r.json().error.message).toContain(base+'/upgrade/pro');
});
test('评审版与主分享用相同密码，bridge 结果/记录无明文', async () => {
  await login(); plan='pro';
  const {cloudBridge}=await import('../src/cloud-bridge.ts');
  const bridge=cloudBridge({version:'0.2.17',build:build as never,render:async()=>async()=>undefined,deps:{env:{JOPLO_HOME:home,JOPLO_CLOUD_URL:base},check:checkProject,sharedVoice:async()=>undefined}});
  const lines:string[]=[];
  const result=await bridge.publish(project,{visibility:'private',review:true,password},s=>lines.push(s));
  expect(calls.filter(c=>c.path==='/api/v1/shares').map(c=>c.body.password)).toEqual([password,password]);
  expect(lines.join(' ')).toContain('same password'); expect(JSON.stringify({result,lines})).not.toContain(password);
  await scanFiles(root);
});


test('TTY 省略值隐藏输入并确认一次；不一致则取消；CI/JSON 不读取终端', async () => {
  await login();
  const read=vi.fn(async()=>password);
  let r=await cli(['share',project,'--private','--no-review','--password'],{},true,undefined,read);
  expect(r.code,r.stderr).toBe(0); expect(read).toHaveBeenCalledTimes(2); expect(createBody().password).toBe(password);
  expect(r.stdout+r.stderr).not.toContain(password);
  calls=[]; const mismatch=vi.fn().mockResolvedValueOnce(password).mockResolvedValueOnce('different-password');
  r=await cli(['share',project,'--private','--no-review','--password'],{},true,undefined,mismatch);
  expect(r.code).toBe(2); expect(calls).toEqual([]); expect(r.stdout+r.stderr).not.toContain(password);
  read.mockClear();
  for (const [flags,env] of [[[],{CI:'1',JOPLO_SHARE_PASSWORD:password}],[['--json'],{JOPLO_SHARE_PASSWORD:password}]] as const) {
    r=await cli(['share',project,'--private','--no-review','--password',...flags],env,true,undefined,read);
    expect(r.code,r.stdout).toBe(0); expect(createBody().password).toBe(password);
  }
  expect(read).not.toHaveBeenCalled();
});
test('远端把含引号/反斜线密码放进返回字段时，拒绝写盘与输出；解析失败也脱敏', async () => {
  await login(); const secret='test-only-"\\-password';
  responses.set('/api/v1/shares/Abc1234567/finalize',{body:{shareId:'Abc1234567',url:base+'/s/Abc1234567/',version:1,expiresAt:null,portfolio:{workUrl:'https://show.example/work',profileUrl:null,needsUsername:true,setupPath:'/settings/'+secret}}});
  const r=await cli(['share',project,'--private','--no-review','--password',secret,'--json']);
  expect(r.code).toBe(1); expect(r.json().error.code).toBe('INVALID_RESPONSE');
  expect(r.stdout+r.stderr).not.toContain(secret); expect(r.stdout+r.stderr).not.toContain(JSON.stringify(secret).slice(1,-1));
  await expect(readFile(join(project,'.joplo/cloud.json'),'utf8')).rejects.toThrow();
});


test('密码与协议字段名前缀相同时仍输出合法 JSON 和 passwordProtected 布尔值', async()=>{
 await login(); responses.set('/api/v1/shares/Abc1234567/finalize',{body:{shareId:'Abc1234567',url:base+'/s/Abc1234567/',version:1,expiresAt:null,passwordProtected:true}});
 const r=await cli(['share',project,'--private','--no-review','--password','password','--json']);
 expect(r.code,r.stdout).toBe(0); expect(r.json().data.passwordProtected).toBe(true); expect(r.json().data).not.toHaveProperty('password');
});


test('保留 #37 私密分享对旧 strict review 字段的兼容重试，密码字段不会被丢弃', async()=>{
 await login(); rejectReview=400; reviewErrorMessage='Unrecognized key: review';
 for(const flags of [[],['--password',password]]) {
   calls=[];
   const r=await cli(['share',project,'--private','--no-review',...flags,'--json']);
   expect(r.code,r.stdout).toBe(0);
   const bodies=calls.filter(c=>c.path==='/api/v1/shares').map(c=>c.body);
   expect(bodies).toHaveLength(2); expect(bodies[0]).toHaveProperty('review'); expect(bodies[1]).not.toHaveProperty('review');
   if(flags.length) expect(bodies.map(b=>b.password)).toEqual([password,password]);
   else for(const body of bodies) expect(body).not.toHaveProperty('password');
 }
});
