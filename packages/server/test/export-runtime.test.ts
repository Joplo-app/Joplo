/**
 * 导出组件（D65）：托管运行时的解析、安装、卸载。
 * 不变量：① 不修改项目的 package.json / lockfile / node_modules；② 解析从不下载，只有 installExportRuntime 下载；
 * ⑤ 托管运行时与项目里已有的 playwright 都能用（托管优先）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JoploError } from '@joplo-app/core';
import { EXPORT_DOWNLOAD_MB, PLAYWRIGHT_VERSION, exportRuntimeStatus, installExportRuntime, missingError, resolvePlaywright, runCommand, runtimePaths, uninstallExportRuntime, type InstallProgress } from '../src/export-runtime.ts';
import { launchHint } from '../src/render.ts';
import { fakeManaged, fakeProjectPlaywright, fakeRunner, projectSnapshot, type RunCall } from './runtime-fixtures.ts';

let tmp: string;
let home: string;
let project: string;
const env0 = process.env.PLAYWRIGHT_BROWSERS_PATH;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-rt-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  fs.mkdirSync(project, { recursive: true });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  if (env0 === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  else process.env.PLAYWRIGHT_BROWSERS_PATH = env0;
});

describe('版本与状态', () => {
  it('固定版本与 server 的 devDependencies.playwright-core 一致', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8'));
    expect(pkg.devDependencies['playwright-core']).toBe(PLAYWRIGHT_VERSION);
    expect(pkg.dependencies?.playwright).toBeUndefined();
    expect(pkg.dependencies?.['playwright-core']).toBeUndefined();
  });

  it('运行时在 JOPLO_HOME/runtime/playwright-<版本>/，浏览器在它的 browsers/', () => {
    const p = runtimePaths(home);
    expect(p.dir).toBe(path.join(home, 'runtime', `playwright-${PLAYWRIGHT_VERSION}`));
    expect(p.browsers).toBe(path.join(p.dir, 'browsers'));
  });

  it('什么都没有：未就绪，错误码 EXPORT_COMPONENT_MISSING，提示 npx joplo setup export 与下载大小', async () => {
    expect(exportRuntimeStatus({ home, projectDir: project })).toMatchObject({ ready: false, source: null, downloadMB: EXPORT_DOWNLOAD_MB, command: 'npx joplo setup export' });
    const e = await resolvePlaywright({ home, projectDir: project }).catch((x) => x);
    expect(e).toBeInstanceOf(JoploError);
    expect(e.code).toBe('EXPORT_COMPONENT_MISSING');
    expect(e.message).toContain('npx joplo setup export');
    expect(e.message).toContain(`about ${EXPORT_DOWNLOAD_MB} MB`);
    expect(e.message).toContain('Writing demos, dev, check, build, and share do not need it');
    expect(e.message).not.toMatch(/npm i(nstall)? -D playwright/);
    expect(missingError().details).toEqual({ command: 'npx joplo setup export', downloadMB: EXPORT_DOWNLOAD_MB });
  });

  it('浏览器启动失败的提示给出重装命令，不再要求装进项目', () => {
    const m = launchHint(new Error("Executable doesn't exist at /x/chrome\nmore"));
    expect(m).toContain('npx joplo setup export --force');
    expect(m).not.toContain('npm i -D playwright');
    expect(m).not.toContain('\n');
  });
});

describe('解析：托管优先，兼容项目里已有的', () => {
  it('托管运行时就绪：用它，并把 PLAYWRIGHT_BROWSERS_PATH 指向它自己的 browsers/', async () => {
    const p = fakeManaged(home);
    const r = await resolvePlaywright({ home, projectDir: project });
    expect(r.source).toBe('managed');
    expect((r.module.chromium as unknown as { tag: string }).tag).toBe('managed');
    expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBe(p.browsers);
    expect(exportRuntimeStatus({ home, projectDir: project })).toMatchObject({ ready: true, source: 'managed' });
  });

  it('老项目：项目里已有 playwright 时照常可用（只读取，不安装）', async () => {
    fakeProjectPlaywright(project);
    const before = projectSnapshot(project);
    const r = await resolvePlaywright({ home, projectDir: project });
    expect(r.source).toBe('project');
    expect((r.module.chromium as unknown as { tag: string }).tag).toBe('project');
    expect(projectSnapshot(project)).toBe(before);
    expect(fs.existsSync(path.join(home, 'runtime'))).toBe(false);
  });

  it('项目里只有 playwright-core / @playwright/test 也认', async () => {
    fakeProjectPlaywright(project, '@playwright/test');
    expect((await resolvePlaywright({ home, projectDir: project })).source).toBe('project');
  });

  it('两者都有：托管优先', async () => {
    fakeManaged(home);
    fakeProjectPlaywright(project);
    expect((await resolvePlaywright({ home, projectDir: project })).source).toBe('managed');
  });

  it('ready.json 缺失或版本不同（装了一半 / 旧版本）不算就绪', async () => {
    const p = fakeManaged(home);
    fs.rmSync(p.marker);
    expect(exportRuntimeStatus({ home }).ready).toBe(false);
    fs.writeFileSync(p.marker, JSON.stringify({ version: '0.0.1', installedAt: 'x' }));
    expect(exportRuntimeStatus({ home }).ready).toBe(false);
    await expect(resolvePlaywright({ home, projectDir: project })).rejects.toMatchObject({ code: 'EXPORT_COMPONENT_MISSING' });
  });
});

describe('安装与卸载', () => {
  it('npm 与浏览器下载都在运行时目录里执行；项目文件不变；进度从 playwright 的输出解析；可重复运行', async () => {
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"demo","devDependencies":{"joplo":"0.2.6"}}\n');
    fs.writeFileSync(path.join(project, 'package-lock.json'), '{"lockfileVersion":3}\n');
    fs.mkdirSync(path.join(project, 'node_modules/joplo'), { recursive: true });
    fs.writeFileSync(path.join(project, 'node_modules/joplo/package.json'), '{"name":"joplo"}');
    const before = projectSnapshot(project);
    const calls: RunCall[] = [];
    const progress: InstallProgress[] = [];
    const cwd0 = process.cwd();
    process.chdir(project); // 即使从项目目录运行（npx joplo setup export），也不能装进项目
    try {
      const r = await installExportRuntime({ home, onProgress: (x) => progress.push(x), deps: { run: fakeRunner(calls), verify: async () => undefined } });
      expect(r.alreadyInstalled).toBe(false);
    } finally {
      process.chdir(cwd0);
    }
    const p = runtimePaths(home);
    expect(calls.map((c) => c.cmd)).toEqual(['npm', process.execPath]);
    for (const c of calls) expect(c.cwd).toBe(p.dir);
    expect(calls[0]!.args).toEqual(expect.arrayContaining(['install', `playwright-core@${PLAYWRIGHT_VERSION}`, '--prefix', p.dir, '--no-save', '--no-package-lock']));
    expect(calls[1]!.args).toEqual([p.cli, 'install', '--only-shell', 'chromium']);
    expect(calls[1]!.env.PLAYWRIGHT_BROWSERS_PATH).toBe(p.browsers);
    expect(projectSnapshot(project)).toBe(before);
    expect(exportRuntimeStatus({ home, projectDir: project })).toMatchObject({ ready: true, source: 'managed' });
    // 进度：单调不减，最后 100；下载阶段带文件大小
    const pcts = progress.map((x) => x.percent);
    expect([...pcts].sort((a, b) => a - b)).toEqual(pcts);
    expect(progress.at(-1)).toMatchObject({ phase: 'done', percent: 100 });
    expect(progress.find((x) => x.phase === 'browser' && x.totalMB === 95.3)?.message).toBe('Downloading Chrome Headless Shell 156.0.8078.4');
    expect(progress.some((x) => x.phase === 'browser' && x.percent === 90)).toBe(true);
    // ffmpeg 是 Chromium 的一部分：不把大小和标题换成 ffmpeg 的
    expect(progress.filter((x) => x.phase === 'browser' && x.percent >= 90).every((x) => x.totalMB === 95.3 && x.message === 'Downloading Chrome Headless Shell 156.0.8078.4')).toBe(true);
    // 再运行一次：已就绪，不再执行任何命令
    const again = await installExportRuntime({ home, deps: { run: fakeRunner(calls), verify: async () => undefined } });
    expect(again.alreadyInstalled).toBe(true);
    expect(calls).toHaveLength(2);
    expect(fs.existsSync(p.lock)).toBe(false);
  });

  it('npm 子进程不继承把包装到别处的 npm_config_* 设置', async () => {
    const calls: RunCall[] = [];
    process.env.npm_config_global = 'true';
    process.env.npm_config_prefix = project;
    try {
      await installExportRuntime({ home, deps: { run: fakeRunner(calls), verify: async () => undefined } });
    } finally {
      delete process.env.npm_config_global;
      delete process.env.npm_config_prefix;
    }
    expect(calls[0]!.env.npm_config_global).toBeUndefined();
    expect(calls[0]!.env.npm_config_prefix).toBeUndefined();
  });

  it('下载失败：不写 ready.json（仍未就绪），释放锁，错误带原因；重试可以成功', async () => {
    const calls: RunCall[] = [];
    await expect(installExportRuntime({ home, deps: { run: fakeRunner(calls, { failBrowser: true }), verify: async () => undefined } })).rejects.toThrow('ECONNRESET');
    const p = runtimePaths(home);
    expect(fs.existsSync(p.marker)).toBe(false);
    expect(fs.existsSync(p.lock)).toBe(false);
    expect(exportRuntimeStatus({ home }).ready).toBe(false);
    await installExportRuntime({ home, deps: { run: fakeRunner(calls), verify: async () => undefined } });
    expect(exportRuntimeStatus({ home }).ready).toBe(true);
  });

  it('自检失败（Chromium 起不来）也不算就绪', async () => {
    await expect(installExportRuntime({ home, deps: { run: fakeRunner([]), verify: async () => { throw new JoploError('EXPORT_FAILED', 'Chromium was downloaded but failed to start: libnss3.so missing'); } } })).rejects.toThrow('libnss3');
    expect(exportRuntimeStatus({ home }).ready).toBe(false);
  });

  it('另一个存活进程正在安装：报错，不并发安装；持锁进程已退出：视为过期锁', async () => {
    const p = runtimePaths(home);
    fs.mkdirSync(p.root, { recursive: true });
    fs.writeFileSync(p.lock, String(process.ppid));
    await expect(installExportRuntime({ home, deps: { run: fakeRunner([]), verify: async () => undefined } })).rejects.toThrow(/is installing the export component/);
    expect(exportRuntimeStatus({ home }).installingPid).toBe(process.ppid);
    expect(() => uninstallExportRuntime({ home })).toThrow(/is installing/);
    fs.writeFileSync(p.lock, '999999');
    await installExportRuntime({ home, deps: { run: fakeRunner([]), verify: async () => undefined } });
    expect(exportRuntimeStatus({ home }).ready).toBe(true);
  });

  it('安装成功后删掉旧版本的运行时；--force 重新安装；卸载删掉所有版本', async () => {
    const old = path.join(home, 'runtime', 'playwright-1.50.0');
    fs.mkdirSync(path.join(old, 'browsers'), { recursive: true });
    const calls: RunCall[] = [];
    const r = await installExportRuntime({ home, deps: { run: fakeRunner(calls), verify: async () => undefined } });
    expect(r.removedOld).toEqual(['playwright-1.50.0']);
    expect(fs.existsSync(old)).toBe(false);
    await installExportRuntime({ home, force: true, deps: { run: fakeRunner(calls), verify: async () => undefined } });
    expect(calls).toHaveLength(4);
    expect(uninstallExportRuntime({ home }).removed).toEqual([`playwright-${PLAYWRIGHT_VERSION}`]);
    expect(exportRuntimeStatus({ home }).ready).toBe(false);
    expect(uninstallExportRuntime({ home }).removed).toEqual([]);
  });

  it('缺省的命令执行：按行回调，失败时错误里带最后几行输出', async () => {
    const lines: string[] = [];
    await runCommand(process.execPath, ['-e', 'console.log("a\\nb"); console.error("c")'], { cwd: tmp, env: process.env, onLine: (l) => lines.push(l) });
    expect(lines.sort()).toEqual(['a', 'b', 'c']);
    await expect(runCommand(process.execPath, ['-e', 'console.error("npm ERR! 404 Not Found"); process.exit(3)'], { cwd: tmp, env: process.env, onLine: () => undefined })).rejects.toThrow(/exit 3.*404 Not Found/);
  });
});
