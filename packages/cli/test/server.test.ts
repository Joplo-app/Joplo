import { expect, test, vi } from 'vitest';
import { resolve } from 'node:path';
import { runCli } from '../src/cli.ts';
async function run(args: string[], server: Record<string, unknown> = {}) {
  let stdout = '', stderr = '';
  const loadServer = vi.fn(async () => server);
  // 不读本机真实登录：build 按“已登录就默认 cloud”（D85）决定 voiceDefault
  const code = await runCli(args, { stdout: s => { stdout += s; }, stderr: s => { stderr += s; }, loadServer, cloud: { env: { JOPLO_HOME: resolve('.no-such-joplo-home') } } });
  return { code, stdout, stderr, loadServer };
}
test.each([
  ['dev', 'startDev', []], ['build', 'buildSite', []], ['render', 'renderStep', ['--scenario-id', 's', '--out', 'a.png']],
] as const)('%s 动态导出缺失时明确失败', async (cmd, name, args) => {
  const r = await run([cmd, '.', ...args]);
  expect(r.code).toBe(1); expect(r.stdout).toContain(name); expect(r.stdout).toContain('@joplo-app/server'); expect(r.loadServer).toHaveBeenCalledOnce();
});
test('动态 import 失败说明服务端不可用', async () => {
  let output = '';
  const code = await runCli(['dev'], { stdout: s => { output += s; }, stderr: () => {}, loadServer: async () => { throw Error('module missing'); } });
  expect(code).toBe(1); expect(output).toContain('@joplo-app/server'); expect(output).toContain('module missing');
});
// cloud：看板直接发布到云端（D76），由 CLI 注入登录与 share()
test('dev 参数与日志输出', async () => {
  const startDev = vi.fn(async (opts: any) => { opts.log('服务日志'); return { url: 'http://127.0.0.1:12345', close: async () => {} }; });
  const r = await run(['dev', 'project', '--port', '12345', '--open'], { startDev });
  expect(r.code).toBe(0); expect(startDev).toHaveBeenCalledWith({ projectDir: resolve('project'), port: 12345, open: true, log: expect.any(Function), cloud: { account: expect.any(Function), links: expect.any(Function), publish: expect.any(Function), voice: { status: expect.any(Function), speech: expect.any(Function) } } });
  expect(r.stdout).toBe('http://127.0.0.1:12345\n');
  // stdout stays the URL only; stderr tells agents the one command that follows every review round of this project.
  expect(r.stderr).toBe('服务日志\nAgents: stream reviewer feedback from this board with\n  npx joplo feedback watch project --local --follow --json\nIf you end your response while the user tests and your host wakes you when a background command ends, add --once (it prints how to resume with --since).\n');
  const spaced = await run(['dev', 'my demo'], { startDev });
  expect(spaced.stderr).toContain(`npx joplo feedback watch 'my demo' --local --follow --json`);
});
test.each(['--out-dir', '--out'])('build 参数 %s', async (flag) => {
  const buildSite = vi.fn(async () => ({ outDir: resolve('output'), files: ['index.html'], routes: ['/'], scenarios: [], diagnostics: [] }));
  const r = await run(['build', 'project', flag, 'output', '--overwrite'], { buildSite });
  expect(r.code).toBe(0); expect(buildSite).toHaveBeenCalledWith({ projectDir: resolve('project'), outDir: resolve('output'), overwrite: true, voiceDefault: null });
});
test('render 参数', async () => {
  const renderStep = vi.fn(async () => ({ path: resolve('a.png'), elements: [], warnings: [] }));
  const r = await run(['render', 'project', '--scenario-id', 'f.a.s', '--step-id', 'f.a.s.1', '--theme', 'clean', '--out', 'a.png', '--width', '1280', '--height', '720', '--scale', '2', '--overwrite'], { renderStep });
  expect(r.code).toBe(0); expect(renderStep).toHaveBeenCalledWith({ projectDir: resolve('project'), scenarioId: 'f.a.s', stepId: 'f.a.s.1', theme: 'clean', out: resolve('a.png'), viewport: { width: 1280, height: 720 }, scale: 2, overwrite: true });
});
test('render --film / --video：参数、摘要与互斥（D92）', async () => {
  const film = { path: resolve('f-1.png'), files: [resolve('f-1.png'), resolve('f-2.png')], durationMs: 12500, sampleMs: 50, every: 250, samples: 251, maxDiff: .12,
    cuts: [{ atMs: 4000, diff: .2, changed: .55, scenarioId: 'f.a.s', position: 3 }], stills: [{ fromMs: 6000, toMs: 8000, scenarioId: 'f.a.s', position: 4 }],
    boundaries: [{ atMs: 9000, scenarioId: 'f.a.t', position: 0, chapter: true, maxDiff: .03, maxChanged: .08 }], warnings: [] };
  const renderFilm = vi.fn(async () => film);
  const r = await run(['render', 'project', '--scenario-id', 'f.a.s', '--film', '--chain', '--every', '500', '--out', 'f.png', '--overwrite'], { renderFilm });
  expect(r.code).toBe(0);
  expect(renderFilm).toHaveBeenCalledWith({ projectDir: resolve('project'), scenarioId: 'f.a.s', theme: undefined, out: resolve('f.png'), overwrite: true, chain: true, every: 500 });
  expect(r.stdout).toContain('chapter → f.a.t at 9.00s: max adjacent diff 3.0%');
  expect(r.stdout).toContain('CUT 4.00s f.a.s step 3');
  expect(r.stdout).toContain('STILL 6.00s–8.00s (2.00s)');
  const renderVideo = vi.fn(async () => ({ path: resolve('v.webm'), durationMs: 1, size: { width: 1280, height: 800 }, srt: null, voice: { mode: 'real' as const, missing: [] } }));
  expect((await run(['render', 'project', '--scenario-id', 'f.a.s', '--video', '--chain', '--out', 'v.webm'], { renderVideo })).stdout).toBe(`${resolve('v.webm')}\n1280×800 · voice real\n`);
  // 发布用的视频（#55 #56 #59）：分辨率、旁白、干净画面与字幕文件都传给 renderVideo；没有音频的旁白列出来
  const missing = vi.fn(async () => ({ path: resolve('v.webm'), durationMs: 1, size: { width: 1080, height: 1920 }, srt: resolve('v.srt'), voice: { mode: 'real' as const, missing: [{ text: 'No clip yet', role: null }] } }));
  const v = await run(['render', 'project', '--scenario-id', 'f.a.s', '--video', '--width', '1080', '--height', '1920', '--clean', '--srt', 'v.srt', '--out', 'v.webm'], { renderVideo: missing });
  expect(missing).toHaveBeenCalledWith(expect.objectContaining({ width: 1080, height: 1920, hide: ['cover', 'cursor', 'title', 'subtitles'], srt: resolve('v.srt') }));
  expect(v.stdout).toContain(resolve('v.srt'));
  expect(v.stdout).toContain('1 narration line(s) had no generated audio');
  expect(v.stdout).toContain('  - No clip yet');
  expect((await run(['render', 'project', '--scenario-id', 'f.a.s', '--film', '--width', '1080', '--height', '1920', '--viewport', '720x1280', '--no-frame', '--out', 'f.png'], { renderFilm })).code).toBe(0);
  expect(renderFilm).toHaveBeenLastCalledWith(expect.objectContaining({ width: 1080, height: 1920, logicalViewport: { width: 720, height: 1280 }, noFrame: true }));
  expect((await run(['render', 'project', '--scenario-id', 'f.a.s', '--film', '--width', '1080', '--out', 'f.png'])).code).toBe(2);
  expect((await run(['render', 'project', '--scenario-id', 'f.a.s', '--clean', '--out', 'f.png'])).code).toBe(2);
  expect((await run(['render', 'project', '--scenario-id', 'f.a.s', '--film', '--sheet', '--out', 'f.png'])).code).toBe(2);
  expect((await run(['render', 'project', '--scenario-id', 'f.a.s', '--chain', '--out', 'f.png'])).code).toBe(2);
  expect((await run(['render', 'project', '--scenario-id', 'f.a.s', '--film', '--step-id', 'x', '--out', 'f.png'])).code).toBe(2);
});
test('无服务端命令不触发动态 import；无效参数先拒绝', async () => {
  expect((await run(['guide'])).loadServer).not.toHaveBeenCalled();
  const r = await run(['dev', '--port', '65536']); expect(r.code).toBe(2); expect(r.loadServer).not.toHaveBeenCalled();
});
