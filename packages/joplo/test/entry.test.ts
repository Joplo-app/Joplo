/**
 * `joplo` 命令入口（D36）：先查 Node 版本（不加载其他模块），再优先转发给项目内安装的 @joplo-app/cli，
 * 否则用自己依赖的那份。这里用假的 @joplo-app/cli 包验证转发，不启动真实 CLI。
 */
import { afterEach, describe, expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PKG = path.resolve(import.meta.dirname, '..');
const BIN = path.join(PKG, 'bin/joplo.cjs');
const { checkNode } = require('../lib/node-check.cjs') as { checkNode: (v: string) => string | null };
const { pickCli } = require('../lib/main.cjs') as { pickCli: (o: { cwd: string; selfDir: string; argv: string[]; env: Record<string, string | undefined> }) => { dir: string; version: string; bin: string; local: boolean; notes: string[] } | null };

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
const temp = () => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-entry-'))); dirs.push(d); return d; };

/** 在 root/node_modules 下放一个假的 @joplo-app/cli（bin 打印参数）和可选的 @joplo-app/kit。 */
function fakeCli(root: string, version: string, kit?: string) {
  const dir = path.join(root, 'node_modules/@joplo-app/cli');
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@joplo-app/cli', version, type: 'module', bin: { 'joplo-cli': './dist/bin.js' } }));
  fs.writeFileSync(path.join(dir, 'dist/bin.js'), `console.log('fake-cli ${version} ' + JSON.stringify(process.argv.slice(2))); process.exitCode = 7;\n`);
  if (kit) {
    fs.mkdirSync(path.join(root, 'node_modules/@joplo-app/kit'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules/@joplo-app/kit/package.json'), JSON.stringify({ name: '@joplo-app/kit', version: kit }));
  }
  return fs.realpathSync(dir);
}
/** 模拟 npx 缓存里的 joplo 包：selfDir 下有自己的 node_modules/@joplo-app/cli。 */
function fakeSelf(version: string) {
  const root = temp();
  const self = path.join(root, 'node_modules/joplo');
  fs.mkdirSync(self, { recursive: true });
  fs.writeFileSync(path.join(self, 'package.json'), JSON.stringify({ name: 'joplo', version }));
  fakeCli(root, version);
  return self;
}

describe('Node 版本检查', () => {
  test.each([['20.11.0', true], ['21.7.3', true], ['18.0.0', true], ['22.0.0', false], ['22.12.0', false], ['24.1.0', false], ['26.13.0', false]])('%s → 拒绝=%s', (v, rejected) => {
    const m = checkNode(v);
    if (!rejected) expect(m).toBeNull();
    else {
      expect(m).toContain(`Joplo 需要 Node.js 22 或更高版本，当前是 ${v}`);
      expect(m).toContain('nvm install 22');
      expect(m).toContain('https://nodejs.org');
    }
  });

  test('无法解析的版本号按过低处理', () => { expect(checkNode('')).toContain('22'); expect(checkNode('abc')).toContain('22'); });

  test('检查代码不使用新语法（旧版 Node 也能解析）', () => {
    for (const f of ['bin/joplo.cjs', 'lib/node-check.cjs']) {
      const code = fs.readFileSync(path.join(PKG, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^#!.*$/m, '');
      for (const bad of [/=>/, /\bconst\b/, /\blet\b/, /`/, /\?\./, /\?\?/, /\bclass\b/, /\basync\b/, /\bawait\b/, /\bimport\b/, /\.\.\.\w/]) expect(code, `${f} 含 ${bad}`).not.toMatch(bad);
    }
  });

  test('真实入口在旧 Node 上退出 1，只打印要求，不加载 CLI', () => {
    const shim = path.join(temp(), 'old-node.cjs');
    fs.writeFileSync(shim, "Object.defineProperty(process.versions, 'node', { value: '20.11.0', configurable: true, enumerable: true });\n");
    const r = spawnSync(process.execPath, ['-r', shim, BIN, 'dev'], { cwd: temp(), encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Joplo 需要 Node.js 22 或更高版本，当前是 20.11.0');
    expect(r.stderr).not.toMatch(/at .*\(/);
    expect(r.stdout).toBe('');
  });
});

describe('选择 CLI', () => {
  test('项目里装了 @joplo-app/cli：优先使用项目内的版本', () => {
    const self = fakeSelf('0.2.0'); const project = temp(); const local = fakeCli(project, '0.1.0', '0.1.0');
    const c = pickCli({ cwd: project, selfDir: self, argv: ['check'], env: {} })!;
    expect(c).toMatchObject({ dir: local, version: '0.1.0', local: true });
    expect(c.notes.join('\n')).toContain('已改用项目内的 joplo 0.1.0 执行（npx 拉到的是 0.2.0）');
    expect(c.notes.join('\n')).toContain('要升级：npm i -D joplo@0.2.0 @joplo-app/kit@0.2.0');
  });

  test('子目录里运行也能找到项目内的版本；版本相同则不提示', () => {
    const self = fakeSelf('0.1.0'); const project = temp(); fakeCli(project, '0.1.0', '0.1.0');
    fs.mkdirSync(path.join(project, 'features/x'), { recursive: true });
    const c = pickCli({ cwd: path.join(project, 'features/x'), selfDir: self, argv: ['check'], env: {} })!;
    expect(c.local).toBe(true); expect(c.notes).toEqual([]);
  });

  test('pnpm 布局：项目只有 node_modules/joplo（链接），从它的真实位置找到 @joplo-app/cli', () => {
    const self = fakeSelf('0.2.0'); const project = temp();
    const store = path.join(project, 'node_modules/.pnpm/joplo@0.1.0/node_modules');
    fs.mkdirSync(path.join(store, 'joplo'), { recursive: true });
    fs.writeFileSync(path.join(store, 'joplo/package.json'), JSON.stringify({ name: 'joplo', version: '0.1.0' }));
    const cli = fakeCli(path.dirname(store), '0.1.0');
    fs.symlinkSync(path.join(store, 'joplo'), path.join(project, 'node_modules/joplo'));
    const c = pickCli({ cwd: project, selfDir: self, argv: ['dev'], env: { npm_config_user_agent: 'pnpm/10 npm/?' } })!;
    expect(c).toMatchObject({ dir: cli, version: '0.1.0', local: true });
    expect(c.notes.join('\n')).toContain('pnpm add -D joplo@0.2.0 @joplo-app/kit@0.2.0');
  });

  test('项目外：使用自己依赖的 @joplo-app/cli，不提示', () => {
    const self = fakeSelf('0.1.0');
    const c = pickCli({ cwd: temp(), selfDir: self, argv: ['check'], env: {} })!;
    expect(c).toMatchObject({ version: '0.1.0', local: false, notes: [] });
  });

  test('init 总是使用 npx 指定的版本（用户写了 joplo@<版本> init）', () => {
    const self = fakeSelf('0.2.0'); const project = temp(); fakeCli(project, '0.1.0');
    expect(pickCli({ cwd: project, selfDir: self, argv: ['init', 'x'], env: {} })).toMatchObject({ version: '0.2.0', local: false });
  });

  test('dev 时说明使用的版本', () => {
    const self = fakeSelf('0.1.0'); const project = temp(); fakeCli(project, '0.1.0', '0.1.0');
    const c = pickCli({ cwd: project, selfDir: self, argv: ['dev', '--port', '1'], env: {} })!;
    expect(c.notes).toEqual(['[joplo] 使用项目内的 joplo 0.1.0（@joplo-app/kit 0.1.0）']);
  });

  test('坏的 package.json、缺 bin 字段：跳过这份，退回下一份', () => {
    const self = fakeSelf('0.1.0'); const project = temp(); const local = fakeCli(project, '0.0.1');
    fs.writeFileSync(path.join(local, 'package.json'), '{oops');
    expect(pickCli({ cwd: project, selfDir: self, argv: ['check'], env: {} })).toMatchObject({ local: false, version: '0.1.0' });
    fs.writeFileSync(path.join(local, 'package.json'), JSON.stringify({ name: '@joplo-app/cli', version: '0.0.1' }));
    expect(pickCli({ cwd: project, selfDir: self, argv: ['check'], env: {} })).toMatchObject({ local: false });
  });

  test('哪里都没有 @joplo-app/cli：返回 null', () => {
    const lonely = temp(); fs.writeFileSync(path.join(lonely, 'package.json'), '{}');
    expect(pickCli({ cwd: temp(), selfDir: lonely, argv: ['check'], env: {} })).toBeNull();
  });
});

describe('真实入口转发', () => {
  test('参数原样转发，退出码来自 CLI，提示写到 stderr', () => {
    const project = temp(); fakeCli(project, '0.0.1', '0.0.1');
    const r = spawnSync(process.execPath, [BIN, 'check', '--format', 'json'], { cwd: project, encoding: 'utf8', env: { ...process.env, npm_config_user_agent: '' } });
    expect(r.stdout).toBe('fake-cli 0.0.1 ["check","--format","json"]\n');
    expect(r.status).toBe(7);
  });

  test('找不到 CLI 时退出 1 并说明', () => {
    const lonely = temp();
    fs.mkdirSync(path.join(lonely, 'bin')); fs.mkdirSync(path.join(lonely, 'lib'));
    for (const f of ['bin/joplo.cjs', 'lib/node-check.cjs', 'lib/main.cjs', 'package.json']) fs.copyFileSync(path.join(PKG, f), path.join(lonely, f));
    const r = spawnSync(process.execPath, [path.join(lonely, 'bin/joplo.cjs'), 'check'], { cwd: temp(), encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('找不到 @joplo-app/cli');
  });
});
