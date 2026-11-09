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
  expect(r.code).toBe(0); expect(startDev).toHaveBeenCalledWith({ projectDir: resolve('project'), port: 12345, open: true, log: expect.any(Function), cloud: { account: expect.any(Function), publish: expect.any(Function), voice: { status: expect.any(Function), speech: expect.any(Function) } } });
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
test('无服务端命令不触发动态 import；无效参数先拒绝', async () => {
  expect((await run(['guide'])).loadServer).not.toHaveBeenCalled();
  const r = await run(['dev', '--port', '65536']); expect(r.code).toBe(2); expect(r.loadServer).not.toHaveBeenCalled();
});
