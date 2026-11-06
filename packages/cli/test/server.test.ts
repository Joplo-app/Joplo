import { expect, test, vi } from 'vitest';
import { resolve } from 'node:path';
import { runCli } from '../src/cli.ts';
async function run(args: string[], server: Record<string, unknown> = {}) {
  let stdout = '', stderr = '';
  const loadServer = vi.fn(async () => server);
  const code = await runCli(args, { stdout: s => { stdout += s; }, stderr: s => { stderr += s; }, loadServer });
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
test('dev 参数与日志输出', async () => {
  const startDev = vi.fn(async (opts: any) => { opts.log('服务日志'); return { url: 'http://127.0.0.1:12345', close: async () => {} }; });
  const r = await run(['dev', 'project', '--port', '12345', '--open'], { startDev });
  expect(r.code).toBe(0); expect(startDev).toHaveBeenCalledWith({ projectDir: resolve('project'), port: 12345, open: true, log: expect.any(Function) });
  expect(r.stdout).toContain('http://127.0.0.1:12345'); expect(r.stderr).toBe('服务日志\n');
});
test.each(['--out-dir', '--out'])('build 参数 %s', async (flag) => {
  const buildSite = vi.fn(async () => ({ outDir: resolve('output'), files: ['index.html'], routes: ['/'], scenarios: [], diagnostics: [] }));
  const r = await run(['build', 'project', flag, 'output', '--overwrite'], { buildSite });
  expect(r.code).toBe(0); expect(buildSite).toHaveBeenCalledWith({ projectDir: resolve('project'), outDir: resolve('output'), overwrite: true });
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
