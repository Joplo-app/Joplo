/**
 * npm 分发相关的 CLI 行为（D36）：包管理器识别、init 写入的 package.json / tsconfig、
 * 下一步命令、不覆盖已有文件、项目内 @tokenroll/joplo-kit 与 CLI 版本不一致时的提示。
 */
import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { detectPackageManager, pmCommands } from '../src/pm.ts';
import { cliVersion, projectNotes } from '../src/startup.ts';
import { initProject, nextStepLine } from '../src/init.ts';
import { runCli } from '../src/cli.ts';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
const temp = async () => { const d = await realpath(await mkdtemp(join(tmpdir(), 'joplo-npm-'))); dirs.push(d); return d; };
const VERSION = JSON.parse(await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8')).version as string;

async function fakeKit(project: string, version: string) {
  await mkdir(join(project, 'node_modules/@tokenroll/joplo-kit'), { recursive: true });
  await writeFile(join(project, 'node_modules/@tokenroll/joplo-kit/package.json'), JSON.stringify({ name: '@tokenroll/joplo-kit', version }));
}

describe('包管理器', () => {
  test.each([
    ['npm/11.2.0 node/v22.12.0 darwin arm64 workspaces/false', 'npm'],
    ['pnpm/10.4.1 npm/? node/v22.12.0 darwin arm64', 'pnpm'],
    ['yarn/1.22.22 npm/? node/v22.12.0 darwin arm64', 'yarn'],
    ['bun/1.2.0 npm/? node/v22.12.0 darwin arm64', 'bun'],
    [undefined, 'npm'],
    ['', 'npm'],
    ['something/1.0', 'npm'],
  ])('user agent %j → %s', (ua, pm) => {
    expect(detectPackageManager({ npm_config_user_agent: ua })).toBe(pm);
  });

  test('没有 user agent 时按项目里的锁文件识别', async () => {
    const d = await temp();
    expect(detectPackageManager({}, d)).toBe('npm');
    await writeFile(join(d, 'pnpm-lock.yaml'), '');
    expect(detectPackageManager({}, d)).toBe('pnpm');
  });

  test('每种包管理器的安装、运行、对齐版本命令', () => {
    expect(pmCommands('npm')).toMatchObject({ install: 'npm install', run: 'npx joplo', addDev: 'npm i -D' });
    expect(pmCommands('pnpm')).toMatchObject({ install: 'pnpm install', run: 'pnpm joplo', addDev: 'pnpm add -D' });
    expect(pmCommands('yarn')).toMatchObject({ install: 'yarn', run: 'yarn joplo', addDev: 'yarn add -D' });
    expect(pmCommands('bun')).toMatchObject({ install: 'bun install', run: 'bunx joplo', addDev: 'bun add -d' });
  });
});

describe('init', () => {
  test('package.json 锁定 joplo 与 @tokenroll/joplo-kit 的精确版本；tsconfig 指向 @tokenroll/joplo-kit', async () => {
    const d = join(await temp(), 'my-demo');
    await initProject(d);
    const pkg = JSON.parse(await readFile(join(d, 'package.json'), 'utf8'));
    expect(pkg).toMatchObject({ name: 'my-demo', private: true, type: 'module', devDependencies: { joplo: VERSION, '@tokenroll/joplo-kit': VERSION } });
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    expect(pkg.scripts).toMatchObject({ dev: 'joplo dev', check: 'joplo check', build: 'joplo build' });
    const ts = JSON.parse(await readFile(join(d, 'tsconfig.json'), 'utf8'));
    expect(ts.compilerOptions).toMatchObject({ jsx: 'react-jsxdev', jsxImportSource: '@tokenroll/joplo-kit', moduleResolution: 'Bundler', allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true });
  });

  test('包名从目录名推导为合法 npm 名', async () => {
    const d = join(await temp(), 'My Demo_项目');
    await initProject(d);
    const name = JSON.parse(await readFile(join(d, 'package.json'), 'utf8')).name as string;
    expect(name).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
  });

  test('目标目录非空：不写入任何文件，说明已有几个文件和怎么办', async () => {
    const d = await temp();
    await writeFile(join(d, 'a.txt'), 'x'); await writeFile(join(d, 'b.txt'), 'y'); await mkdir(join(d, 'c'));
    const e = await initProject(d).catch(x => x);
    expect(e.message).toContain('不是空目录（已有 3 个文件）');
    expect(e.message).toContain('没有写入任何内容');
    expect(e.message).toContain('init . --keep');
    expect((await readdir(d)).sort()).toEqual(['a.txt', 'b.txt', 'c']);
  });

  test('--keep 只补缺失的文件，已有文件一字不改', async () => {
    const d = await temp();
    await writeFile(join(d, 'package.json'), '{"name":"mine"}\n');
    const r = await initProject(d, undefined, { keep: true });
    expect(await readFile(join(d, 'package.json'), 'utf8')).toBe('{"name":"mine"}\n');
    expect(r.skipped).toEqual(['package.json']);
    expect(r.written).toContain('tsconfig.json');
    expect(r.written).not.toContain('package.json');
  });

  test.each([
    ['npm', 'my-demo', '下一步：cd my-demo && npm install && npx joplo dev'],
    ['pnpm', 'my-demo', '下一步：cd my-demo && pnpm install && pnpm joplo dev'],
    ['yarn', 'my-demo', '下一步：cd my-demo && yarn && yarn joplo dev'],
    ['bun', 'my-demo', '下一步：cd my-demo && bun install && bunx joplo dev'],
    ['npm', '.', '下一步：npm install && npx joplo dev'],
    ['npm', 'my demo', "下一步：cd 'my demo' && npm install && npx joplo dev"],
  ] as const)('%s 在 %j 下的下一步命令', (pm, rel, expected) => {
    expect(nextStepLine(pm, rel)).toBe(expected);
  });

  test('CLI 输出：创建内容、锁定版本、tsconfig、与包管理器一致的下一步', async () => {
    const base = await temp(); const prev = process.cwd(); const ua = process.env.npm_config_user_agent;
    let out = '';
    try {
      process.chdir(base); process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v22.12.0';
      expect(await runCli(['init', 'my-demo'], { stdout: s => { out += s; }, stderr: () => {} })).toBe(0);
    } finally { process.chdir(prev); if (ua === undefined) delete process.env.npm_config_user_agent; else process.env.npm_config_user_agent = ua; }
    expect(out).toContain('✓ 已创建 my-demo/');
    expect(out).toContain(`"joplo": "${VERSION}", "@tokenroll/joplo-kit": "${VERSION}"`);
    expect(out).toContain('jsxImportSource: "@tokenroll/joplo-kit"');
    expect(out.trim().split('\n').at(-1)).toBe('下一步：cd my-demo && pnpm install && pnpm joplo dev');
  });
});

describe('版本一致性', () => {
  test('CLI 版本取自自己的 package.json', () => { expect(cliVersion()).toBe(VERSION); });

  test('项目里的 @tokenroll/joplo-kit 与 CLI 相同：没有提示', async () => {
    const d = await temp(); await fakeKit(d, VERSION);
    expect(projectNotes(d, 'check', { cli: VERSION, env: {} })).toEqual([]);
  });

  test('版本不同：一行警告，给出对齐命令（按包管理器）', async () => {
    const d = await temp(); await fakeKit(d, '0.0.9');
    const [n, ...rest] = projectNotes(d, 'check', { cli: '0.1.0', env: {} });
    expect(rest).toEqual([]);
    expect(n).toContain('项目里的 @tokenroll/joplo-kit 是 0.0.9，当前 CLI 是 0.1.0');
    expect(n).toContain('npm i -D joplo@0.1.0 @tokenroll/joplo-kit@0.1.0');
    const [p] = projectNotes(d, 'build', { cli: '0.1.0', env: { npm_config_user_agent: 'pnpm/10 npm/?' } });
    expect(p).toContain('pnpm add -D joplo@0.1.0 @tokenroll/joplo-kit@0.1.0');
  });

  test('父目录的 node_modules 也算（与 Node 的解析一致）', async () => {
    const d = await temp(); await fakeKit(d, '0.0.9'); await mkdir(join(d, 'sub'));
    expect(projectNotes(join(d, 'sub'), 'dev', { cli: '0.1.0', env: {} })[0]).toContain('0.0.9');
  });

  test('声明了 @tokenroll/joplo-kit 但没安装：提示先安装；没有 package.json：不提示', async () => {
    const d = await temp();
    expect(projectNotes(d, 'check', { cli: '0.1.0', env: {} })).toEqual([]);
    await writeFile(join(d, 'package.json'), JSON.stringify({ devDependencies: { '@tokenroll/joplo-kit': '0.1.0' } }));
    expect(projectNotes(d, 'check', { cli: '0.1.0', env: {} })[0]).toContain('还没有安装依赖，先运行：npm install');
  });

  test('不读项目的命令（init、selection、guide）不检查', async () => {
    const d = await temp(); await fakeKit(d, '0.0.9');
    for (const c of ['init', 'selection', 'guide', undefined]) expect(projectNotes(d, c, { cli: '0.1.0', env: {} })).toEqual([]);
  });

  test('坏的 package.json 不让 CLI 崩溃', async () => {
    const d = await temp(); await mkdir(join(d, 'node_modules/@tokenroll/joplo-kit'), { recursive: true });
    await writeFile(join(d, 'node_modules/@tokenroll/joplo-kit/package.json'), '{oops');
    await writeFile(join(d, 'package.json'), '{oops');
    expect(projectNotes(d, 'check', { cli: '0.1.0', env: {} })).toEqual([]);
  });

  test('runCli：项目命令前把警告写到 stderr，stdout 不受影响', async () => {
    const d = await temp(); await fakeKit(d, '0.0.9');
    let out = '', err = '';
    const code = await runCli(['selection', d], { stdout: s => { out += s; }, stderr: s => { err += s; }, cliVersion: '0.1.0' });
    expect(code).toBe(0); expect(err).toBe('');
    const startDev = async () => ({ url: 'http://127.0.0.1:1/', close: async () => {} });
    out = ''; err = '';
    expect(await runCli(['dev', d], { stdout: s => { out += s; }, stderr: s => { err += s; }, loadServer: async () => ({ startDev }), cliVersion: '0.1.0' })).toBe(0);
    expect(err).toContain('! 项目里的 @tokenroll/joplo-kit 是 0.0.9，当前 CLI 是 0.1.0');
    expect(out).toBe('http://127.0.0.1:1/\n');
  });
});
