/**
 * 发布脚本（不触网、不发布）：统一改版本、各包 package.json 的发布配置。
 */
import { afterEach, describe, expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/release.mjs');
const PACKAGES = ['kit', 'core', 'server', 'web', 'cli', 'joplo'];
const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

function copyManifests() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-release-')); dirs.push(d);
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(d, 'package.json'));
  for (const p of PACKAGES) {
    fs.mkdirSync(path.join(d, 'packages', p), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'packages', p, 'package.json'), path.join(d, 'packages', p, 'package.json'));
  }
  return d;
}
const run = (args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

describe('各包的发布配置', () => {
  const pkgs = PACKAGES.map((p) => ({ dir: p, pkg: read(path.join(ROOT, 'packages', p, 'package.json')) }));

  test('同一版本号，全部可发布、公开访问、只发布构建产物', () => {
    const versions = new Set(pkgs.map((p) => p.pkg.version));
    expect([...versions]).toHaveLength(1);
    for (const { dir, pkg } of pkgs) {
      expect(pkg.private, dir).toBeUndefined();
      expect(pkg.publishConfig?.access, dir).toBe('public');
      expect(pkg.files, dir).toBeInstanceOf(Array);
      expect(pkg.engines?.node, dir).toBe('>=22');
    }
  });

  test('许可证是统一的占位（待用户决定）', () => {
    const licenses = new Set(pkgs.map((p) => p.pkg.license));
    expect([...licenses]).toEqual(['UNLICENSED']);
  });

  test('发布后的 exports 指向 dist 的 JS 与 .d.ts；仓库内仍指向源码', () => {
    for (const { dir, pkg } of pkgs.filter((p) => ['kit', 'core', 'server', 'cli'].includes(p.dir))) {
      const pub = pkg.publishConfig.exports as Record<string, { types: string; default: string }>;
      expect(Object.keys(pub), dir).toEqual(expect.arrayContaining(Object.keys(pkg.exports)));
      for (const [k, v] of Object.entries(pub)) {
        if (k === './package.json') continue;
        expect(v.default, `${dir} ${k}`).toMatch(/^\.\/dist\/.+\.js$/);
        expect(v.types, `${dir} ${k}`).toMatch(/^\.\/dist\/.+\.d\.ts$/);
        expect(String((pkg.exports as Record<string, string>)[k]), `${dir} ${k}`).toMatch(/^\.\/src\//);
      }
    }
  });

  test('运行时依赖都在 dependencies；Playwright 是可选 peer；web 不带运行时依赖', () => {
    const server = pkgs.find((p) => p.dir === 'server')!.pkg;
    for (const d of ['vite', 'tailwindcss', '@tailwindcss/vite', '@joplo/web', '@joplo/core', '@joplo/kit', 'zod']) expect(server.dependencies[d], d).toBeDefined();
    expect(server.dependencies.playwright).toBeUndefined();
    expect(server.peerDependenciesMeta?.playwright?.optional).toBe(true);
    const cli = pkgs.find((p) => p.dir === 'cli')!.pkg;
    for (const d of ['tsx', 'commander', '@joplo/server', '@joplo/core']) expect(cli.dependencies[d], d).toBeDefined();
    expect(cli.publishConfig.bin).toEqual({ 'joplo-cli': './dist/bin.js' }); // 不能叫 joplo：会占掉入口包的 .bin/joplo
    const web = pkgs.find((p) => p.dir === 'web')!.pkg;
    expect(web.dependencies ?? {}).toEqual({});
    const joplo = pkgs.find((p) => p.dir === 'joplo')!.pkg;
    expect(joplo.dependencies).toEqual({ '@joplo/cli': 'workspace:*' });
    expect(joplo.bin).toEqual({ joplo: './bin/joplo.cjs' });
  });
});

describe('release:version', () => {
  test('统一修改所有包的版本', () => {
    const d = copyManifests();
    const r = run(['version', '0.3.0-beta.1', '--root', d]);
    expect(r.status, r.stderr).toBe(0);
    for (const p of PACKAGES) expect(read(path.join(d, 'packages', p, 'package.json')).version).toBe('0.3.0-beta.1');
    expect(read(path.join(d, 'package.json')).version).toBeUndefined();
  });

  test.each([[[]], [['v1']], [['1.2']], [['1.2.3.4']], [['latest']]])('非法版本 %j 被拒绝，不改任何文件', (args) => {
    const d = copyManifests();
    const before = PACKAGES.map((p) => fs.readFileSync(path.join(d, 'packages', p, 'package.json'), 'utf8'));
    const r = run(['version', ...args, '--root', d]);
    expect(r.status).not.toBe(0);
    expect(PACKAGES.map((p) => fs.readFileSync(path.join(d, 'packages', p, 'package.json'), 'utf8'))).toEqual(before);
  });
});
