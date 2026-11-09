/**
 * 发布脚本（不触网、不发布）：统一改版本、各包 package.json 的发布配置。
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error release script is an untyped ESM module
import { checkWebBudget, checkSiteBudget, tarList } from '../release.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/release.mjs');
const PACKAGES = ['kit', 'plugin-diagram', 'plugin-alda', 'plugin-content', 'core', 'server', 'web', 'cli', 'joplo'];
const pkgDir = (root: string, name: string) => path.join(root, name.startsWith('plugin-') ? `plugins/${name.slice(7)}` : `packages/${name}`);
const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const dirs: string[] = [];

test.each(['pax', 'gnu', 'ustar'])('tarList 直接读 tar 头：%s 格式下路径（含长路径、空格）与字节数都准确，与平台的 tar -tv 输出无关', (format) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-tar-'));
  dirs.push(d);
  const deep = `dist/${'nested-directory/'.repeat(6)}chunk-with-a-long-name.js`;
  const files: Record<string, string> = { 'package.json': '{}', 'dist/fonts/OFL.txt': 'x'.repeat(1234), 'dist/a b.txt': 'hi', [deep]: 'y'.repeat(700) };
  if (format === 'ustar') delete files[deep]; // ustar 只能放 155+100 字符以内、能在 / 处拆开的路径；这里仍然覆盖前缀字段
  for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, 'package', f)), { recursive: true }); fs.writeFileSync(path.join(d, 'package', f), body); }
  const tgz = path.join(d, 'p.tgz');
  // GNU tar 写 gnu 用 --format=gnu，bsdtar（macOS）叫 gnutar
  const formats = format === 'gnu' ? ['gnu', 'gnutar'] : [format];
  const ok = formats.some((f) => spawnSync('tar', [`--format=${f}`, '-czf', tgz, '-C', d, 'package'], { env: { ...process.env, COPYFILE_DISABLE: '1' } }).status === 0);
  expect(ok).toBe(true);
  const got = Object.fromEntries((tarList(tgz) as { file: string; size: number }[]).map((f) => [f.file, f.size]));
  expect(got).toEqual(Object.fromEntries(Object.entries(files).map(([f, body]) => [f, Buffer.byteLength(body)])));
});

test('font size budgets fail with actionable size details', () => {
  expect(() => checkWebBudget(6_000_000, [])).not.toThrow();
  expect(() => checkWebBudget(6_000_001, [{ file: 'dist/app/assets/a.woff2', size: 6_000_001 }])).toThrow(/dist\/app\/assets/);
  expect(() => checkSiteBudget([{ file: 'a.woff2', size: 1_500_000 }])).not.toThrow();
  expect(() => checkSiteBudget([{ file: 'a.woff2', size: 1_500_001 }])).toThrow(/font/);
  expect(() => checkSiteBudget(Array.from({ length: 151 }, (_, i) => ({ file: `${i}.txt`, size: 0 })))).toThrow(/151/);
});
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

function copyManifests() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-release-')); dirs.push(d);
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(d, 'package.json'));
  for (const p of PACKAGES) {
    fs.mkdirSync(pkgDir(d, p), { recursive: true });
    fs.copyFileSync(path.join(pkgDir(ROOT, p), 'package.json'), path.join(pkgDir(d, p), 'package.json'));
  }
  return d;
}
const run = (args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

describe('各包的发布配置', () => {
  const pkgs = PACKAGES.map((p) => ({ dir: p, pkg: read(path.join(pkgDir(ROOT, p), 'package.json')) }));

  test('同一版本号，全部可发布、公开访问、只发布构建产物', () => {
    const versions = new Set(pkgs.map((p) => p.pkg.version));
    expect([...versions]).toHaveLength(1);
    expect(read(path.join(ROOT, 'plugins/diagram/src/version.json')).version).toBe(pkgs[0]!.pkg.version);
    for (const { dir, pkg } of pkgs) {
      expect(pkg.private, dir).toBeUndefined();
      expect(pkg.publishConfig?.access, dir).toBe('public');
      expect(pkg.files, dir).toBeInstanceOf(Array);
      expect(pkg.engines?.node, dir).toBe('>=22');
    }
  });

  test('许可证统一为 PolyForm Shield（D81），每个包的 LICENSE 与根目录一致', () => {
    const licenses = new Set(pkgs.map((p) => p.pkg.license));
    expect([...licenses]).toEqual(['PolyForm-Shield-1.0.0']);
    const root = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
    expect(root).toMatch(/^Required Notice: /m);
    for (const { dir } of pkgs) expect(fs.readFileSync(path.join(pkgDir(ROOT, dir), 'LICENSE'), 'utf8'), dir).toBe(root);
  });

  test('发布后的 exports 指向 dist 的 JS 与 .d.ts；仓库内仍指向源码', () => {
    for (const { dir, pkg } of pkgs.filter((p) => ['kit', 'plugin-diagram', 'plugin-alda', 'plugin-content', 'core', 'server', 'cli'].includes(p.dir))) {
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

  test('运行时依赖都在 dependencies；Playwright 不是 server 的依赖或 peer（D66：由 setup export 装到 JOPLO_HOME）；web 不带运行时依赖', () => {
    const server = pkgs.find((p) => p.dir === 'server')!.pkg;
    for (const d of ['vite', 'tailwindcss', '@tailwindcss/vite', '@joplo-app/web', '@joplo-app/core', '@joplo-app/kit', 'zod']) expect(server.dependencies[d], d).toBeDefined();
    for (const d of ['playwright', 'playwright-core']) {
      expect(server.dependencies[d], d).toBeUndefined();
      expect(server.peerDependencies?.[d], d).toBeUndefined();
    }
    const cli = pkgs.find((p) => p.dir === 'cli')!.pkg;
    for (const d of ['tsx', 'commander', '@joplo-app/server', '@joplo-app/core']) expect(cli.dependencies[d], d).toBeDefined();
    expect(cli.publishConfig.bin).toEqual({ 'joplo-cli': './dist/bin.js' }); // 不能叫 joplo：会占掉入口包的 .bin/joplo
    const web = pkgs.find((p) => p.dir === 'web')!.pkg;
    expect(web.dependencies ?? {}).toEqual({});
    const joplo = pkgs.find((p) => p.dir === 'joplo')!.pkg;
    expect(joplo.dependencies).toEqual({ '@joplo-app/cli': 'workspace:*' });
    expect(joplo.bin).toEqual({ joplo: './bin/joplo.cjs' });
  });
});

describe('release:version', () => {
  test('统一修改所有包的版本', () => {
    const d = copyManifests();
    const r = run(['version', '0.3.0-beta.1', '--root', d]);
    expect(r.status, r.stderr).toBe(0);
    for (const p of PACKAGES) expect(read(path.join(pkgDir(d, p), 'package.json')).version).toBe('0.3.0-beta.1');
    expect(read(path.join(d, 'plugins/diagram/src/version.json')).version).toBe('0.3.0-beta.1');
    expect(read(path.join(d, 'package.json')).version).toBeUndefined();
    // 官方技能随版本重新生成（D64）
    for (const name of ['joplo', 'joplo-feedback']) expect(fs.readFileSync(path.join(d, 'skills', name, 'SKILL.md'), 'utf8')).toMatch(/<!-- joplo-skill 0\.3\.0-beta\.1 sha256:[a-f0-9]{64} -->\n$/);
  });

  test.each([[[]], [['v1']], [['1.2']], [['1.2.3.4']], [['latest']]])('非法版本 %j 被拒绝，不改任何文件', (args) => {
    const d = copyManifests();
    const before = PACKAGES.map((p) => fs.readFileSync(path.join(pkgDir(d, p), 'package.json'), 'utf8'));
    const r = run(['version', ...args, '--root', d]);
    expect(r.status).not.toBe(0);
    expect(PACKAGES.map((p) => fs.readFileSync(path.join(pkgDir(d, p), 'package.json'), 'utf8'))).toEqual(before);
  });
});

describe('release:verify（发布之后必跑；registry 与 npx 用替身）', () => {
  const names = ['@joplo-app/kit', '@joplo-app/plugin-diagram', '@joplo-app/plugin-alda', '@joplo-app/plugin-content', '@joplo-app/core', '@joplo-app/web', '@joplo-app/server', '@joplo-app/cli', 'joplo'];
  async function verify(opts: Record<string, unknown>) {
    // @ts-expect-error release script is an untyped ESM module
    const { verifyRelease } = await import('../release.mjs');
    const logs: string[] = [], errors: string[] = [];
    const sleep = vi.fn(async () => {});
    const r = await verifyRelease({ root: copyManifests(), version: '0.2.4', sleep, attempts: 3, delayMs: 5, log: (m: string) => logs.push(m), error: (m: string) => errors.push(m), ...opts });
    return { r, logs, errors, sleep };
  }
  test('全部都在 registry 上时实际安装一次 joplo@<版本>，通过', async () => {
    const view = vi.fn(async (_name: string, v: string) => v);
    const install = vi.fn(async () => ({ ok: true, output: 'Usage: joplo' }));
    const { r, errors } = await verify({ view, install });
    expect(r).toMatchObject({ ok: true, version: '0.2.4', missing: [] });
    expect(view.mock.calls.map(c => c[0])).toEqual(names);
    expect(install).toHaveBeenCalledExactlyOnceWith('0.2.4');
    expect(errors).toEqual([]);
  });
  test('registry 有延迟：先查不到、重试后出现，算通过', async () => {
    let n = 0;
    const view = vi.fn(async (name: string, v: string) => (name === '@joplo-app/core' && n++ < 2 ? null : v));
    const { r, sleep } = await verify({ view, install: async () => ({ ok: true, output: '' }) });
    expect(r.ok).toBe(true);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
  test('漏发一个包（0.2.4 的 core）：重试用完后列出缺的包，不安装，提示用 release:publish 重跑', async () => {
    const view = vi.fn(async (name: string, v: string) => (name === '@joplo-app/core' ? null : v));
    const install = vi.fn();
    const { r, errors } = await verify({ view, install });
    expect(r).toMatchObject({ ok: false, missing: ['@joplo-app/core'] });
    expect(view.mock.calls.filter(c => c[0] === '@joplo-app/core')).toHaveLength(3);
    expect(install).not.toHaveBeenCalled();
    expect(errors.join('\n')).toContain('@joplo-app/core@0.2.4');
    expect(errors.join('\n')).toContain('pnpm release:publish');
  });
  test('registry 都在但 npx 安装失败：从 npm 输出里找出缺的包，非 0', async () => {
    const output = 'npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/@joplo-app%2fcore - Not found\nnpm error 404  \'@joplo-app/core@0.2.4\' is not in this registry.';
    const { r, errors } = await verify({ view: async (_: string, v: string) => v, install: async () => ({ ok: false, output }) });
    expect(r).toMatchObject({ ok: false, missing: ['@joplo-app/core'] });
    expect(errors.join('\n')).toContain('npx -y joplo@0.2.4 --help');
    expect(errors.join('\n')).toContain('pnpm release:publish');
  });
  test('命令行入口：缺包时以非 0 退出（不触网的参数错误路径）', () => {
    const r = run(['verify', 'not-a-version']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('release:verify');
  });
  test('missingFromInstallOutput 不把 @joplo-app/… 误认成 joplo', async () => {
    // @ts-expect-error release script is an untyped ESM module
    const { missingFromInstallOutput } = await import('../release.mjs');
    expect(missingFromInstallOutput('npm error 404 Not Found - GET https://registry.npmjs.org/@joplo-app%2fcli - Not found', names)).toEqual(['@joplo-app/cli']);
    expect(missingFromInstallOutput('npm error 404 Not Found - GET https://registry.npmjs.org/joplo - Not found', names)).toEqual(['joplo']);
    expect(missingFromInstallOutput('npm error notarget No matching version found for @joplo-app/kit@0.2.4.', names)).toEqual(['@joplo-app/kit']);
    expect(missingFromInstallOutput('npm error network ETIMEDOUT', names)).toEqual([]);
  });
});

describe('release:publish（先构建打包全部，再按依赖顺序发布 tarball；registry / npm publish / verify 用替身）', () => {
  const names = ['@joplo-app/kit', '@joplo-app/plugin-diagram', '@joplo-app/plugin-alda', '@joplo-app/plugin-content', '@joplo-app/core', '@joplo-app/web', '@joplo-app/server', '@joplo-app/cli', 'joplo'];
  const tarballs = names.map((name) => ({ name, file: `/release/${name.replace('/', '-')}-0.2.7.tgz` }));
  async function publish(opts: Record<string, unknown>) {
    // @ts-expect-error release script is an untyped ESM module
    const { publishRelease } = await import('../release.mjs');
    const logs: string[] = [], errors: string[] = [];
    const prepare = vi.fn(async () => ({ version: '0.2.7', tarballs }));
    const r = await publishRelease({ tag: 'latest', prepare, log: (m: string) => logs.push(m), error: (m: string) => errors.push(m), ...opts });
    return { r, logs, errors, prepare };
  }
  test('中途一个包失败：立刻停止，不发后面的包、不运行 verify，非 0，列出已发布与未发布的包', async () => {
    const order: string[] = [];
    const publishTarball = vi.fn(async (t: { name: string; file: string }, tag: string) => { order.push(`${t.name}@${tag}`); return t.name !== '@joplo-app/web'; });
    const verify = vi.fn(async () => ({ ok: true }));
    const { r, errors, prepare } = await publish({ isPublished: async () => false, publishTarball, verify });
    expect(prepare).toHaveBeenCalledOnce();
    expect(order).toEqual(['@joplo-app/kit@latest', '@joplo-app/plugin-diagram@latest', '@joplo-app/plugin-alda@latest', '@joplo-app/plugin-content@latest', '@joplo-app/core@latest', '@joplo-app/web@latest']);
    expect(publishTarball.mock.calls[0]![0].file).toBe(tarballs[0]!.file); // 发布的是已打好的 tarball
    expect(verify).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, published: ['@joplo-app/kit', '@joplo-app/plugin-diagram', '@joplo-app/plugin-alda', '@joplo-app/plugin-content', '@joplo-app/core'], unpublished: ['@joplo-app/web', '@joplo-app/server', '@joplo-app/cli', 'joplo'] });
    const text = errors.join('\n');
    expect(text).toContain('@joplo-app/web');
    expect(text).toContain('@joplo-app/server、@joplo-app/cli、joplo');
    expect(text).toContain('pnpm release:publish --tag latest');
  });
  test('查询 registry 失败也立刻停止并列出未发布的包', async () => {
    const publishTarball = vi.fn(async () => true);
    const isPublished = vi.fn(async (name: string) => { if (name === '@joplo-app/server') throw new Error('HTTP 503'); return false; });
    const { r } = await publish({ isPublished, publishTarball, verify: vi.fn() });
    expect(publishTarball).toHaveBeenCalledTimes(6);
    expect(r).toMatchObject({ ok: false, unpublished: ['@joplo-app/server', '@joplo-app/cli', 'joplo'] });
  });
  test('全部成功（已发布的跳过）：最后运行 verify，用它的结果作为整体结果', async () => {
    const publishTarball = vi.fn(async () => true);
    const isPublished = async (name: string) => name === '@joplo-app/kit';
    const ok = await publish({ isPublished, publishTarball, verify: vi.fn(async () => ({ ok: true })) });
    expect(publishTarball.mock.calls.map((c) => c[0].name)).toEqual(names.slice(1));
    expect(ok.r).toMatchObject({ ok: true, published: names.slice(1), skipped: ['@joplo-app/kit'], unpublished: [] });
    expect(ok.logs.join('\n')).toContain('git tag v0.2.7');
    const verify = vi.fn(async () => ({ ok: false }));
    const bad = await publish({ isPublished: async () => true, publishTarball: vi.fn(), verify });
    expect(verify).toHaveBeenCalledExactlyOnceWith('0.2.7');
    expect(bad.r.ok).toBe(false);
    expect(bad.logs.join('\n')).not.toContain('git tag v0.2.7');
  });
});
