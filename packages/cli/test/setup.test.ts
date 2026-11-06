/**
 * `joplo setup export` 与 render 缺少导出组件时的行为（D65）。
 * 不变量：① 任何命令都不改项目的 package.json / lockfile / node_modules；② 非交互环境不自动下载；
 * ③ 写演示、check、build 不需要导出组件；⑤ 托管运行时与项目里已有的 playwright 都能 render。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { JoploError } from '@joplo-app/core';
import * as RealServer from '@joplo-app/server';
import { runCli } from '../src/cli.ts';
import { fakeProjectPlaywright, fakeRunner, installFakeLaunch, projectSnapshot, type RunCall } from '../../server/test/runtime-fixtures.ts';

const missing = () => new JoploError('EXPORT_COMPONENT_MISSING', 'Exporting images and video needs the Joplo export component (Playwright 1.64.1 + Chromium, about 100 MB download, kept in the Joplo home directory, not in your project), which is not installed. Run: npx joplo setup export. Writing demos, dev, check, build, and share do not need it.');

type Server = Record<string, unknown>;
async function run(args: string[], server: Server, o: { interactive?: boolean; ask?: (q: string) => Promise<boolean> } = {}) {
  let stdout = '', stderr = '';
  const code = await runCli(args, { stdout: (s) => { stdout += s; }, stderr: (s) => { stderr += s; }, loadServer: async () => server, interactive: o.interactive ?? false, ...(o.ask ? { ask: o.ask } : {}) });
  return { code, stdout, stderr };
}

const status = (ready: boolean, source: 'managed' | 'project' | null = ready ? 'managed' : null) => ({ ready, source, version: '1.64.1', dir: '/home/u/.joplo/runtime/playwright-1.64.1', downloadMB: 100, installingPid: null, command: 'npx joplo setup export' });
function fakeServer(o: { ready?: boolean; renderFailsUntilInstalled?: boolean } = {}) {
  let installed = !!o.ready;
  const installExportRuntime = vi.fn(async (opts: { onProgress?: (p: unknown) => void }) => {
    opts.onProgress?.({ phase: 'package', percent: 1, totalMB: null, message: 'Installing playwright-core 1.64.1' });
    opts.onProgress?.({ phase: 'browser', percent: 47, totalMB: 95.3, message: 'Downloading Chrome Headless Shell' });
    opts.onProgress?.({ phase: 'done', percent: 100, totalMB: null, message: 'Export component is ready' });
    installed = true;
    return { alreadyInstalled: false, dir: status(true).dir, version: '1.64.1', removedOld: [] };
  });
  const renderStep = vi.fn(async (opts: { out: string }) => {
    if (!installed) throw missing();
    return { path: opts.out, elements: [], warnings: [] };
  });
  return {
    server: {
      renderStep,
      installExportRuntime,
      uninstallExportRuntime: vi.fn(() => ({ removed: installed ? ['playwright-1.64.1'] : [] })),
      exportRuntimeStatus: vi.fn(() => status(installed)),
      EXPORT_DOWNLOAD_MB: 100,
      PLAYWRIGHT_VERSION: '1.64.1',
      SETUP_COMMAND: 'npx joplo setup export',
    },
    renderStep,
    installExportRuntime,
  };
}

describe('render 缺少导出组件', () => {
  test('不变量 ②：非交互（Agent / CI）以 EXPORT_COMPONENT_MISSING、退出码 4 结束，提示安装命令，不询问、不下载', async () => {
    const f = fakeServer();
    const ask = vi.fn(async () => true);
    const r = await run(['render', '.', '--scenario-id', 's', '--out', 'a.png'], f.server, { interactive: false, ask });
    expect(r.code).toBe(4);
    expect(r.stdout).toMatch(/^EXPORT_COMPONENT_MISSING {2}.*npx joplo setup export/);
    expect(r.stdout).not.toContain('npm i -D playwright');
    expect(ask).not.toHaveBeenCalled();
    expect(f.installExportRuntime).not.toHaveBeenCalled();
  });

  test('交互终端：询问（默认否）；回答否时不下载，退出码 4', async () => {
    const f = fakeServer();
    const ask = vi.fn(async () => false);
    const r = await run(['render', '.', '--scenario-id', 's', '--out', 'a.png'], f.server, { interactive: true, ask });
    expect(r.code).toBe(4);
    expect(ask).toHaveBeenCalledOnce();
    expect(ask.mock.calls[0]![0]).toMatch(/about 100 MB.*not into your project/);
    expect(f.installExportRuntime).not.toHaveBeenCalled();
  });

  test('交互终端：回答是时安装（显示大小与进度），然后重新 render', async () => {
    const f = fakeServer();
    const r = await run(['render', '.', '--scenario-id', 's', '--out', 'a.png'], f.server, { interactive: true, ask: async () => true });
    expect(r.code).toBe(0);
    expect(f.installExportRuntime).toHaveBeenCalledOnce();
    expect(f.renderStep).toHaveBeenCalledTimes(2);
    expect(r.stderr).toContain('about 100 MB download');
    expect(r.stderr).toContain('Project files are not changed');
    expect(r.stderr).toContain('Downloading Chrome Headless Shell… 47% of 95.3 MiB');
    expect(r.stdout.trim()).toBe(path.resolve('a.png'));
  });

  test('其他错误不询问', async () => {
    const f = fakeServer();
    f.renderStep.mockImplementation(async () => { throw new JoploError('NOT_FOUND', 'Scenario does not exist: s'); });
    const ask = vi.fn(async () => true);
    const r = await run(['render', '.', '--scenario-id', 's', '--out', 'a.png'], f.server, { interactive: true, ask });
    expect(r.code).toBe(1);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('joplo setup export', () => {
  test('安装：显示下载大小与进度；已装时提示已就绪、不重复下载', async () => {
    const f = fakeServer();
    let r = await run(['setup', 'export'], f.server);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('Playwright 1.64.1 + Chromium headless shell, about 100 MB download');
    expect(r.stderr).toContain('Downloading Chrome Headless Shell… 47% of 95.3 MiB');
    expect(r.stdout).toContain('Export component is ready');
    r = await run(['setup', 'export'], f.server);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('already installed');
    expect(f.installExportRuntime).toHaveBeenCalledOnce();
  });

  test('--status：没装时退出码 4（不下载），装了时 0；--format json', async () => {
    const f = fakeServer();
    let r = await run(['setup', 'export', '--status'], f.server);
    expect(r.code).toBe(4);
    expect(r.stdout).toContain('Run: npx joplo setup export (about 100 MB download)');
    r = await run(['setup', 'export', '--status', '--format', 'json'], f.server);
    expect(r.code).toBe(4);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, error: { code: 'EXPORT_COMPONENT_MISSING' }, data: { ready: false } });
    expect(f.installExportRuntime).not.toHaveBeenCalled();
    const g = fakeServer({ ready: true });
    r = await run(['setup', 'export', '--status', '--format', 'json'], g.server);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, data: { ready: true, source: 'managed' } });
  });

  test('--uninstall 删除；未知组件与互斥选项是用法错误', async () => {
    const f = fakeServer({ ready: true });
    expect((await run(['setup', 'export', '--uninstall'], f.server)).stdout).toContain('Removed the export component (playwright-1.64.1)');
    expect((await run(['setup', 'export', '--uninstall'], fakeServer().server)).stdout).toContain('not installed; nothing to remove');
    expect((await run(['setup', 'browsers'], f.server)).code).toBe(2);
    expect((await run(['setup', 'export', '--force', '--uninstall'], f.server)).code).toBe(2);
  });
});

describe('真实 server：项目文件不变（不变量 ① ③ ⑤）', () => {
  const EXAMPLE = path.resolve(import.meta.dirname, '../../../examples/invite');
  let tmp: string, home: string, project: string, out: string;
  const home0 = process.env.JOPLO_HOME;
  const cwd0 = process.cwd();
  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-setup-cli-')));
    home = path.join(tmp, 'home');
    project = path.join(tmp, 'project');
    out = path.join(tmp, 'shots');
    fs.cpSync(EXAMPLE, project, { recursive: true, filter: (s) => !/[/\\](\.joplo|dist|node_modules|exports)([/\\]|$)/.test(s.slice(EXAMPLE.length)) });
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"invite","devDependencies":{"joplo":"0.2.6","@joplo-app/kit":"0.2.6"}}\n');
    fs.writeFileSync(path.join(project, 'package-lock.json'), '{"lockfileVersion":3}\n');
    process.env.JOPLO_HOME = home;
    process.chdir(project); // 像用户那样在项目目录里运行
  });
  afterEach(() => {
    process.chdir(cwd0);
    process.env.JOPLO_HOME = home0;
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const calls: RunCall[] = [];
  /** 真实的 @joplo-app/server，只把下载换成替身（不访问网络）。 */
  const server = (): Server => ({ ...RealServer, installExportRuntime: (o: Parameters<typeof RealServer.installExportRuntime>[0]) => RealServer.installExportRuntime({ ...o, deps: { run: fakeRunner(calls), verify: async () => undefined } }) });

  test('render（没装）→ setup export → render（托管）→ setup export --uninstall；check / build 全程不需要它', async () => {
    const before = projectSnapshot(project);
    const fake = installFakeLaunch();
    const s = server();
    // check 在仓库里的示例上运行（临时副本没有安装 kit）；JOPLO_HOME 是空的，没有任何导出组件
    let r = await run(['check', EXAMPLE], s);
    expect(r.code, r.stdout).toBe(0);
    r = await run(['build', project, '--out-dir', path.join(tmp, 'site')], s);
    expect(r.code, r.stdout).toBe(0);
    r = await run(['render', project, '--scenario-id', 'invite.a-modal.success', '--out', path.join(out, 'a.png')], s, { interactive: false });
    expect(r.code, r.stdout).toBe(4);
    expect(r.stdout).toContain('npx joplo setup export');
    expect(calls).toHaveLength(0);
    r = await run(['setup', 'export'], s);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(calls.every((c) => c.cwd.startsWith(home + path.sep))).toBe(true);
    // 替身安装写的入口换成会记录来源的替身
    fs.writeFileSync(path.join(home, 'runtime/playwright-1.64.1/node_modules/playwright-core/index.mjs'), `export const chromium = { launch: async (o) => globalThis.__joploFakeLaunch('managed', o) };\n`);
    r = await run(['render', project, '--scenario-id', 'invite.a-modal.success', '--out', path.join(out, 'b.png')], s, { interactive: false });
    expect(r.code, r.stdout).toBe(0);
    expect(fs.readFileSync(path.join(out, 'b.png'), 'utf8')).toBe('png:managed');
    expect(fake.tags).toEqual(['managed']);
    r = await run(['setup', 'export', '--uninstall'], s);
    expect(r.stdout).toContain('Removed the export component');
    expect(projectSnapshot(project)).toBe(before);
  }, 120_000);

  test('老项目里已有 playwright：不安装也能 render（只读项目里的包）', async () => {
    fakeProjectPlaywright(project);
    const before = projectSnapshot(project);
    const fake = installFakeLaunch();
    const r = await run(['render', project, '--scenario-id', 'invite.a-modal.success', '--out', path.join(out, 'c.png')], server(), { interactive: false });
    expect(r.code, r.stdout).toBe(0);
    expect(fake.tags).toEqual(['project']);
    expect(fs.existsSync(path.join(home, 'runtime'))).toBe(false);
    expect(projectSnapshot(project)).toBe(before);
  }, 120_000);
});
