/**
 * Joplo Cloud 朗读（D85）的 CLI 一侧，用本地假服务器验证（云端还没上线，契约见 cloud-voice.ts）。不变量：
 * 1. `GET /api/v1/voice` 只认合法字段；旧云端 404、连不上、格式不对时为 null，whoami / 看板账号卡片不报错，只是不显示；
 * 2. 合成请求带 text / voice / locale / project 与登录令牌（JOPLO_API_KEY 同样可用），响应头的扣费、剩余、缓存命中都读出来；
 * 3. 402 → TTS_QUOTA_EXCEEDED（details: neededChars、remainingChars、usageUrl = 当前 server 的 /usage）；503 按现有重试策略重试；
 * 4. whoami 文本与 JSON 显示朗读剩余；
 * 5. `joplo voice`：已登录、没选过来源时用 Joplo Cloud 朗读；剩余字数来自响应头；402 时已生成的保留、退出码 7；
 *    选着不再支持的旧 profile 时 VOICE_UNSUPPORTED，不发请求；--dry-run 只估算字数。
 */
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createServer, type IncomingMessage } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compile, type Project } from '@joplo-app/core';
import { runCli } from '../src/cli.ts';
import { cloudBridge } from '../src/cloud-bridge.ts';
import { readVoiceInfo } from '../src/cloud-voice.ts';
import { writeCredentials } from '../src/cloud.ts';
import { reviewSource } from '../../core/test/fixtures/review.ts';

const token = 'session-token-NEVER-PRINT';
const apiKey = 'jpk_' + 'A1b2C3d4'.repeat(5);
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64, 7)]);
const ids = ['narrator-warm-f', 'narrator-calm-m', 'bright-f', 'friendly-m', 'clear-f', 'deep-m'];
const quota = { plan: 'free', period: 'trial', allowanceChars: 5000, usedChars: 1800, remainingChars: 3200, resetsAt: null, packs: [], totalRemainingChars: 3200 };
const voiceBody = () => ({
  model: 'joplo-tts-1', quota, defaultVoice: 'narrator-warm-f',
  voices: ids.map((id) => ({ id, gender: id.endsWith('-m') ? 'male' : 'female', labels: { en: `Voice ${id}`, 'zh-CN': `音色 ${id}` }, samples: { en: `https://cdn.example/${id}.mp3`, bad: 'javascript:alert(1)' } })),
  recommended: { 'zh-CN': ['narrator-calm-m', 'nope'], ja: ['bright-f'] },
});
type Call = { path: string; method: string; headers: IncomingMessage['headers']; body: any };
let root: string, home: string, project: string, base: string, server: ReturnType<typeof createServer>, calls: Call[];
let voiceStatus: number, speechPlan: (n: number, body: any) => { status: number; body?: unknown; headers?: Record<string, string> };
let devIr: Project;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'joplo-voice-cli-')); home = join(root, 'home'); project = join(root, 'project');
  await mkdir(project); calls = []; voiceStatus = 200;
  devIr = compile(reviewSource(), 'dev').project!;
  let left = 3200;
  speechPlan = (_n, body) => { left -= Array.from(String(body.text)).length; return { status: 200, headers: { 'X-Joplo-Chars-Charged': String(Array.from(String(body.text)).length), 'X-Joplo-Chars-Remaining': String(left), 'X-Joplo-Cache': 'miss' } }; };
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString(); let body: any = raw; try { body = JSON.parse(raw); } catch { /* 空 */ }
    calls.push({ path: req.url!, method: req.method!, headers: req.headers, body });
    const json = (v: unknown, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(v)); };
    if (req.url === '/api/v1/me') return json({ user: { id: 'u', email: 'lin@example.com', name: 'Lin' }, plan: 'free', limits: { maxUploadBytes: 1, maxTotalBytes: 1, maxFiles: 1, publishesPerHour: 1 }, storage: { usedBytes: 38 * 1024 * 1024, quotaBytes: 100 * 1024 * 1024 } });
    if (req.url === '/api/v1/voice') return voiceStatus === 200 ? json(voiceBody()) : json({ code: 'NOT_FOUND' }, voiceStatus);
    if (req.url === '/api/v1/voice/speech') {
      const r = speechPlan(calls.filter((c) => c.path === '/api/v1/voice/speech').length, body);
      if (r.status !== 200) return json(r.body ?? {}, r.status);
      res.statusCode = 200; res.setHeader('Content-Type', 'audio/mpeg');
      for (const [k, v] of Object.entries(r.headers ?? {})) res.setHeader(k, v);
      return res.end(MP3);
    }
    json({}, 404);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); await rm(root, { recursive: true, force: true }); });

const env = (extra: NodeJS.ProcessEnv = {}) => ({ JOPLO_HOME: home, JOPLO_CLOUD_URL: base, ...extra });
const login = () => writeCredentials(home, { server: base, accessToken: token, user: { id: 'u', email: 'lin@example.com' }, createdAt: new Date().toISOString() });
const bridge = (extra: NodeJS.ProcessEnv = {}) => cloudBridge({ version: '0.2.18', build: (async () => { throw new Error('no'); }) as never, render: async () => async () => undefined, deps: { env: env(extra), sleep: async () => undefined, now: () => 0 } });
async function cli(args: string[], extra: NodeJS.ProcessEnv = {}) {
  let stdout = '', stderr = '';
  const code = await runCli(args, { stdout: (s) => { stdout += s; }, stderr: (s) => { stderr += s; }, cliVersion: '0.2.18', cloud: { env: env(extra), sleep: async () => undefined, now: () => 0, interactive: false, check: async () => ({ name: 'Review fixture', diagnostics: [], summary: { error: 0, warning: 0, info: 0 }, verification: {}, project: devIr }) } });
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}
const speechCalls = () => calls.filter((c) => c.path === '/api/v1/voice/speech');

test('readVoiceInfo：只认合法字段（样音只要 http(s)，推荐里只留认识的音色）；缺 quota 或音色为 null', () => {
  const info = readVoiceInfo(voiceBody())!;
  expect(info.quota.totalRemainingChars).toBe(3200);
  expect(info.voices).toHaveLength(6);
  expect(info.voices[0]!.samples).toEqual({ en: 'https://cdn.example/narrator-warm-f.mp3' });
  expect(info.recommended).toEqual({ 'zh-CN': ['narrator-calm-m'], ja: ['bright-f'] });
  expect(readVoiceInfo({ ...voiceBody(), quota: { ...quota, period: 'week' } })).toBeNull();
  expect(readVoiceInfo({ ...voiceBody(), voices: [] })).toBeNull();
  expect(readVoiceInfo(null)).toBeNull();
});

test('bridge.voice.status：没登录给登录命令；已登录带额度与音色；旧云端 404 时 voice 为 null，不报错', async () => {
  expect(await bridge().voice!.status()).toEqual({ signedIn: false, server: base, loginCommand: `JOPLO_HOME=${home} npx joplo login --server ${base}` });
  await login();
  const s = await bridge().voice!.status();
  expect(s).toMatchObject({ signedIn: true, voice: { defaultVoice: 'narrator-warm-f', quota: { totalRemainingChars: 3200 } } });
  expect(JSON.stringify(s)).not.toContain(token);
  voiceStatus = 404;
  expect(await bridge().voice!.status()).toEqual({ signedIn: true, server: base, voice: null });
  // 账号卡片：朗读额度跟账号一起来；旧云端没有时只是没有这一项
  expect(await bridge().account()).not.toHaveProperty('voice');
  voiceStatus = 200;
  expect(await bridge().account()).toMatchObject({ signedIn: true, storage: { usedBytes: 38 * 1024 * 1024 }, voice: { totalRemainingChars: 3200, period: 'trial' } });
});

test('bridge.voice.speech：带 text / voice / locale / project 与令牌；读出响应头；JOPLO_API_KEY 也可用', async () => {
  await login();
  const r = await bridge().voice!.speech({ text: '你好 👋', voice: 'bright-f', locale: 'zh-CN', project: 'Team space' });
  expect(Buffer.from(r.audio).subarray(0, 3).toString()).toBe('ID3');
  expect(r).toMatchObject({ charged: 4, remaining: 3196, cache: 'miss', sha256: null });
  const call = speechCalls()[0]!;
  expect(call.body).toEqual({ text: '你好 👋', voice: 'bright-f', locale: 'zh-CN', project: 'Team space' });
  expect(call.headers.authorization).toBe(`Bearer ${token}`);
  expect(call.headers['x-joplo-client']).toBe('joplo-cli/0.2.18');
  await bridge({ JOPLO_API_KEY: apiKey }).voice!.speech({ text: 'Hi', voice: 'deep-m' });
  expect(speechCalls()[1]!.headers.authorization).toBe(`Bearer ${apiKey}`);
  expect(speechCalls()[1]!.body).toEqual({ text: 'Hi', voice: 'deep-m' });
});

test('bridge.voice.speech：402 → TTS_QUOTA_EXCEEDED（用量页拼当前 server）；503 重试后成功；401 → AUTH_EXPIRED；没登录 → AUTH_REQUIRED', async () => {
  await expect(bridge().voice!.speech({ text: 'Hi', voice: 'deep-m' })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  await login();
  speechPlan = () => ({ status: 402, body: { code: 'TTS_QUOTA_EXCEEDED', message: 'x', data: { neededChars: 45, remainingChars: 3, usagePath: '/usage' } } });
  await expect(bridge().voice!.speech({ text: 'Hi', voice: 'deep-m' })).rejects.toMatchObject({ code: 'TTS_QUOTA_EXCEEDED', data: { neededChars: 45, remainingChars: 3, usageUrl: `${base}/usage` } });
  let n = 0;
  speechPlan = () => (++n < 3 ? { status: 503, body: { code: 'TTS_UNAVAILABLE' } } : { status: 200, headers: { 'X-Joplo-Chars-Remaining': '10', 'X-Joplo-Cache': 'hit', 'X-Joplo-Chars-Charged': '0' } });
  const ok = await bridge().voice!.speech({ text: 'Hi', voice: 'deep-m' });
  expect(ok).toMatchObject({ remaining: 10, cache: 'hit', charged: 0 });
  expect(n).toBe(3);
  speechPlan = () => ({ status: 503, body: { code: 'TTS_UNAVAILABLE' } });
  await expect(bridge().voice!.speech({ text: 'Hi', voice: 'deep-m' })).rejects.toMatchObject({ code: 'TTS_UNAVAILABLE' });
  speechPlan = () => ({ status: 401, body: {} });
  await expect(bridge().voice!.speech({ text: 'Hi', voice: 'deep-m' })).rejects.toMatchObject({ code: 'AUTH_EXPIRED' });
  speechPlan = () => ({ status: 403, body: { code: 'EMAIL_UNVERIFIED' } });
  await expect(bridge().voice!.speech({ text: 'Hi', voice: 'deep-m' })).rejects.toMatchObject({ code: 'EMAIL_UNVERIFIED' });
});

test('whoami：文本与 JSON 都显示朗读剩余；旧云端没有 /api/v1/voice 时照常', async () => {
  await login();
  let r = await cli(['whoami']);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('Narration: 3,200 characters left (3,200 of 5,000 free trial)');
  expect(r.stdout).toContain('Storage: 38 MB of 100 MB used');
  r = await cli(['whoami', '--format=json']);
  expect(r.json().data.voice).toMatchObject({ totalRemainingChars: 3200, period: 'trial' });
  voiceStatus = 404;
  r = await cli(['whoami', '--format=json']);
  expect(r.code).toBe(0);
  expect(r.json().data.voice).toBeUndefined();
});

test('joplo voice：已登录、没选过来源时用 Joplo Cloud 朗读；剩余字数来自响应头；再跑一次不再请求', async () => {
  await login();
  let r = await cli(['voice', project, '--format=json']);
  expect(r.code, r.stdout + r.stderr).toBe(0);
  const data = r.json().data;
  expect(data).toMatchObject({ profile: { id: 'cloud' }, source: 'default' });
  expect(data.total.generated).toBe(data.total.missing);
  expect(data.total.generated).toBeGreaterThan(0);
  const sent = speechCalls();
  expect(sent.every((c) => c.body.project === 'Review fixture' && c.body.voice === 'narrator-warm-f' && !('locale' in c.body))).toBe(true);
  const chars = sent.reduce((n, c) => n + Array.from(String(c.body.text)).length, 0);
  expect(data.total.chars).toBe(chars);
  expect(data.quota.totalRemainingChars).toBe(3200 - chars);
  r = await cli(['voice', project]);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('Every step already has audio');
  expect(speechCalls()).toHaveLength(sent.length);
});

test('joplo voice --dry-run：只估算段数与字数，不请求；写出生成后还剩多少', async () => {
  await login();
  const r = await cli(['voice', project, '--dry-run']);
  expect(r.code).toBe(0);
  expect(speechCalls()).toHaveLength(0);
  expect(r.stdout).toMatch(/\d+ clip\(s\) to generate for \d+ step\(s\), about \d+ characters/);
  expect(r.stdout).toMatch(/After generating: about [\d,]+ characters left/);
});

test('joplo voice：402 时已生成的保留，TTS_QUOTA_EXCEEDED、退出码 7，details 写需要 / 剩余 / 用量页', async () => {
  await login();
  speechPlan = (n) => (n === 1 ? { status: 200, headers: { 'X-Joplo-Chars-Remaining': '2' } } : { status: 402, body: { code: 'TTS_QUOTA_EXCEEDED', data: { neededChars: 9, remainingChars: 2, usagePath: '/usage' } } });
  const r = await cli(['voice', project, '--format=json']);
  expect(r.code).toBe(7);
  expect(r.json().error).toMatchObject({ code: 'TTS_QUOTA_EXCEEDED', details: { neededChars: 9, remainingChars: 2, usageUrl: `${base}/usage`, generated: 1 } });
  const text = await cli(['voice', project]);
  expect(text.code).toBe(7);
  expect(text.stdout).toContain('TTS_QUOTA_EXCEEDED');
  // 已生成的那一段还在：再跑时只请求剩下的
  const index = JSON.parse(await readFile(join(project, '.joplo', 'voice', 'index.json'), 'utf8'));
  expect(Object.keys(index.clips)).toHaveLength(1);
});

test('joplo voice：选着不再支持的旧 profile 时 VOICE_UNSUPPORTED 并给换用提示，不发请求；没登录也没选时 VOICE_NO_SOURCE', async () => {
  let r = await cli(['voice', project, '--format=json']);
  expect(r.code).toBe(1);
  expect(r.json().error.code).toBe('VOICE_NO_SOURCE');
  expect(r.json().error.message).toContain('npx joplo login');
  await mkdir(join(home, 'voice'), { recursive: true });
  await writeFile(join(home, 'voice', 'profiles.json'), JSON.stringify({ version: 1, profiles: [{ id: 'my-http', name: 'My HTTP', kind: 'http', baseUrl: 'https://tts.example/api', model: '', voice: 'v', response: 'audio', body: '{"q":"{{text}}"}' }] }));
  await mkdir(join(project, '.joplo', 'voice'), { recursive: true });
  await writeFile(join(project, '.joplo', 'voice', 'index.json'), JSON.stringify({ version: 1, profileId: 'my-http', clips: {}, failures: {} }));
  await login();
  r = await cli(['voice', project, '--format=json']);
  expect(r.code).toBe(1);
  expect(r.json().error.code).toBe('VOICE_UNSUPPORTED');
  expect(r.json().error.message).toMatch(/no longer supported.*Joplo Cloud narration/);
  expect(speechCalls()).toHaveLength(0);
});
