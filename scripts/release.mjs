#!/usr/bin/env node
/**
 * 发布脚本（见 docs/release.md）。
 *
 *   node scripts/release.mjs version <版本> [--root <仓库>]   统一修改所有包的版本（pnpm release:version）
 *   node scripts/release.mjs pack                             构建并打包到 release/（pnpm release:pack）
 *   node scripts/release.mjs smoke [--keep]                   打包后在仓库外的临时目录只用 tarball 安装并跑通全流程（pnpm release:smoke）
 *   node scripts/release.mjs publish [--tag beta]             先构建打包全部包，再按依赖顺序 npm publish 这些 tarball，最后自动 verify（pnpm release:publish）
 *   node scripts/release.mjs verify [<版本>]                  确认每个包都在 registry 上，并实际 npx 安装一次（pnpm release:verify；publish 最后会自动运行）
 *
 * 只有 publish 会调用 npm publish：平时由 .github/workflows/release.yml 在 CI 里运行（npm Trusted Publishing），备用时由维护者在自己的终端运行。
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { writeSkillReadingDemo, verifySkillReadingBrowser } from './skill-reading-smoke.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
/** 发布顺序（依赖在前）。目录名 → 包名见各自 package.json。 */
export const PACKAGES = ['kit', 'plugin-diagram', 'plugin-alda', 'plugin-3d', 'plugin-content', 'plugin-ui', 'core', 'web', 'server', 'cli', 'joplo'];
export const packageDir = (name, root = REPO) => path.join(root, name.startsWith('plugin-') ? `plugins/${name.slice(7)}` : `packages/${name}`);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const LICENSE_PLACEHOLDER = 'UNLICENSED';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const has = (name) => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const log = (s) => console.log(s);

// ---------------------------------------------------------------- version

function version(root, v) {
  if (!v || !SEMVER.test(v)) die(`用法：pnpm release:version <版本>，例如 0.1.1 或 0.2.0-beta.1（收到 ${v ?? '空'}）`);
  const files = PACKAGES.map((p) => path.join(packageDir(p, root), 'package.json'));
  for (const f of files) if (!fs.existsSync(f)) die(`缺少 ${f}`);
  // 先全部读出再写入：任何一个读失败都不会留下改了一半的版本
  const pkgs = files.map((f) => [f, readJson(f)]);
  for (const [f, pkg] of pkgs) {
    pkg.version = v;
    fs.writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n');
  }
  // Runtime version metadata must not pull the workspace manifest into browser bundles.
  for (const name of ['plugin-diagram', 'plugin-alda', 'plugin-3d', 'plugin-content', 'plugin-ui']) {
  const pluginVersion = path.join(packageDir(name, root), 'src/version.json');
  fs.mkdirSync(path.dirname(pluginVersion), { recursive: true });
  fs.writeFileSync(pluginVersion, JSON.stringify({ version: v }, null, 2) + '\n');
  }
  log(`✓ ${pkgs.map(([, p]) => p.name).join('、')} → ${v}`);
  // 技能里写死的可选插件安装命令（npm install @joplo-app/plugin-3d@<版本>）与发布版本一致，否则照着装会配错版本
  const guide = path.join(root, 'packages/core/src/guide.ts');
  if (fs.existsSync(guide)) fs.writeFileSync(guide, fs.readFileSync(guide, 'utf8').replace(/(@joplo-app\/plugin-[a-z0-9-]+@)\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?/g, `$1${v}`));
  // 官方 Agent 技能带版本标记（D64）：随版本一起重新生成，scripts/test/skills.test.ts 保证与 skill install 逐字一致
  const skills = spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/build-skills.ts'), '--root', root], { cwd: REPO, encoding: 'utf8' });
  if (skills.status !== 0) die(`重新生成 skills/ 失败：${skills.stderr || skills.stdout}`);
  log(`✓ skills/ → ${v}（记得一起提交）`);
}

// ---------------------------------------------------------------- pack

const RELEASE = path.join(REPO, 'release');

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { stdio: 'inherit', ...opts });
  if (r.status !== 0) die(`${cmd} ${argv.join(' ')} 失败（退出码 ${r.status}）`);
  return r;
}

/**
 * 列出 tarball 里的文件（路径去掉 package/ 前缀，大小为字节）。
 * 直接读 tar 头，不解析 `tar -tv` 的文字输出：BSD tar（macOS）与 GNU tar（Linux CI）列不一样，
 * 0.2.9 的 CI 发布因此把路径和大小都读错（“缺少字体许可证”、“解包 NaN KB”）。
 * 支持 ustar 前缀、pax 扩展头（path / size）与 GNU 长文件名（L）；只返回普通文件。
 */
export function tarList(tgz) {
  let buf;
  try { buf = zlib.gunzipSync(fs.readFileSync(tgz)); } catch { die(`无法读取 ${tgz}`); }
  const str = (b) => { const i = b.indexOf(0); return (i < 0 ? b : b.subarray(0, i)).toString('utf8'); };
  const files = [];
  let pax = {}, longName = null;
  for (let off = 0; off + 512 <= buf.length;) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const size = parseInt(str(h.subarray(124, 136)).trim() || '0', 8);
    const type = String.fromCharCode(h[156]);
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      // pax 记录："<长度> <键>=<值>\n"
      for (let i = 0, text = body.toString('utf8'); i < text.length;) {
        const sp = text.indexOf(' ', i), len = Number(text.slice(i, sp));
        if (!(len > 0)) break;
        const rec = text.slice(sp + 1, i + len - 1), eq = rec.indexOf('=');
        pax[rec.slice(0, eq)] = rec.slice(eq + 1);
        i += len;
      }
      continue;
    }
    if (type === 'L') { longName = str(body); continue; }
    if (type === 'g') continue;
    const prefix = str(h.subarray(257, 262)) === 'ustar' ? str(h.subarray(345, 500)) : '';
    const name = pax.path ?? longName ?? (prefix ? `${prefix}/${str(h.subarray(0, 100))}` : str(h.subarray(0, 100)));
    if (type === '0' || type === '\0' || type === '7') files.push({ size: pax.size !== undefined ? Number(pax.size) : size, file: name.replace(/^package\//, '') });
    pax = {}; longName = null;
  }
  return files;
}

const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`);

/** Decimal byte limits, matching the documented 6 MB / 1.5 MB budgets. */
export function checkWebBudget(tarballBytes, files) {
  if (tarballBytes <= 6_000_000) return;
  const dirs = new Map();
  for (const { file, size } of files) {
    const dir = path.posix.dirname(file);
    dirs.set(dir, (dirs.get(dir) ?? 0) + size);
  }
  const largest = [...dirs].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([dir, size]) => `  ${dir}: ${size} bytes`).join('\n');
  throw new Error(`@joplo-app/web tarball exceeds 6000000 bytes: ${tarballBytes} bytes. Largest unpacked directories:\n${largest}`);
}

export function checkSiteBudget(files) {
  const fonts = files.filter((f) => /\.(?:woff2?|ttf|otf)$/i.test(f.file)).reduce((n, f) => n + f.size, 0);
  if (fonts > 1_500_000 || files.length > 150) throw new Error(`Published site budget exceeded: ${fonts} font bytes (limit 1500000), ${files.length} files (limit 150)`);
  return { fonts, files: files.length };
}

function siteFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const file = path.join(dir, e.name);
    return e.isDirectory() ? siteFiles(file, base) : [{ file: path.relative(base, file), size: fs.statSync(file).size }];
  });
}

function pack() {
  const pkgs = PACKAGES.map((p) => ({ dir: packageDir(p), pkg: readJson(path.join(packageDir(p), 'package.json')) }));
  const versions = new Set(pkgs.map((p) => p.pkg.version));
  if (versions.size !== 1) die(`各包版本不一致：${pkgs.map((p) => `${p.pkg.name}@${p.pkg.version}`).join('、')}。先运行 pnpm release:version <版本>`);
  const v = [...versions][0];

  log('— 构建公开包（含第一方插件，按依赖顺序）');
  run('pnpm', ['-r', '--filter', './packages/*', '--filter', './plugins/*', 'run', 'build'], { cwd: REPO });

  log('— 打包到 release/');
  fs.rmSync(RELEASE, { recursive: true, force: true });
  fs.mkdirSync(RELEASE, { recursive: true });
  const tarballs = [];
  for (const { dir, pkg } of pkgs) {
    const before = new Set(fs.readdirSync(RELEASE));
    run('pnpm', ['pack', '--pack-destination', RELEASE], { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] });
    const made = fs.readdirSync(RELEASE).filter((f) => f.endsWith('.tgz') && !before.has(f));
    if (made.length !== 1) die(`${pkg.name} 打包结果异常：${made.join(', ') || '没有 tarball'}`);
    tarballs.push({ name: pkg.name, file: path.join(RELEASE, made[0]) });
  }

  log('— 检查 tarball');
  const check = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-pack-check-'));
  let warnLicense = false;
  try {
    for (const t of tarballs) {
      const files = tarList(t.file);
      const out = path.join(check, t.name.replace('/', '__'));
      fs.mkdirSync(out);
      run('tar', ['-xzf', t.file, '-C', out]);
      const text = fs.readFileSync(path.join(out, 'package/package.json'), 'utf8');
      const pkg = JSON.parse(text);
      if (text.includes('workspace:')) die(`${t.name} 的 package.json 仍含 workspace: 协议`);
      if (pkg.version !== v) die(`${t.name} 版本是 ${pkg.version}，应为 ${v}`);
      for (const [dep, range] of Object.entries(pkg.dependencies ?? {})) if ((dep === 'joplo' || dep.startsWith('@joplo-app/')) && range !== v) die(`${t.name} 依赖 ${dep}@${range}，应锁定为 ${v}`);
      const targets = (x) => (typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(targets) : []);
      for (const target of [...targets(pkg.exports), ...targets(pkg.bin)]) if (!fs.existsSync(path.join(out, 'package', target))) die(`${t.name} 的 ${target} 不在 tarball 里`);
      if (files.some((f) => /(^|\/)src\/.*\.tsx?$/.test(f.file) || f.file.startsWith('test/'))) die(`${t.name} 带上了源码或测试`);
      if (t.name === '@joplo-app/web' && !files.some((f) => f.file === 'dist/fonts/OFL.txt')) die('@joplo-app/web 缺少字体许可证 dist/fonts/OFL.txt');
      if (t.name === '@joplo-app/web') checkWebBudget(fs.statSync(t.file).size, files);
      if (pkg.license === LICENSE_PLACEHOLDER) warnLicense = true;
      const total = files.reduce((s, f) => s + f.size, 0);
      log(`  ${t.name.padEnd(14)} ${path.basename(t.file).padEnd(26)} ${String(files.length).padStart(4)} 个文件  解包 ${kb(total).padStart(8)}  tarball ${kb(fs.statSync(t.file).size).padStart(8)}`);
    }
  } finally {
    fs.rmSync(check, { recursive: true, force: true });
  }
  if (warnLicense) log(`! 许可证仍是占位 "${LICENSE_PLACEHOLDER}"：发布前需要用户决定许可证（docs/release.md）`);
  log(`✓ ${tarballs.length} 个包已打包到 release/（版本 ${v}）`);
  return { version: v, tarballs };
}

// ---------------------------------------------------------------- smoke

/** 子进程环境：去掉 pnpm 注入的 npm_config_* 等变量和仓库里的 .bin，保证不借用 workspace。 */
function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(npm_|pnpm_|PNPM_|JOPLO_|NODE_OPTIONS$|INIT_CWD$)/i.test(k)) continue;
    env[k] = v;
  }
  env.PATH = (process.env.PATH ?? '').split(path.delimiter).filter((p) => !p.startsWith(REPO)).join(path.delimiter);
  return { ...env, ...extra };
}

function sh(cmd, argv, cwd, opts = {}) {
  const t = Date.now();
  const r = spawnSync(cmd, argv, { cwd, encoding: 'utf8', env: cleanEnv(opts.env), timeout: opts.timeout ?? 600000 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const label = `${path.basename(cmd)} ${argv.join(' ')}`.replace(/\/[^ ]*\/release\//g, 'release/');
  if (opts.expect !== undefined ? r.status !== opts.expect : r.status !== 0) {
    console.error(out);
    die(`${label} 退出码 ${r.status}（期望 ${opts.expect ?? 0}）`);
  }
  log(`  ✓ ${label}  (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', out };
}

const freePort = () =>
  new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

function request(port, { method = 'GET', path: p, headers = {}, body }) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...headers } }, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => res({ status: resp.statusCode, headers: resp.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', rej);
    if (body) r.write(body);
    r.end();
  });
}

const assert = (cond, msg) => {
  if (!cond) die(`冒烟断言失败：${msg}`);
};

function textFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(p);
      else if (/\.(m?js|cjs|ts|json|html|css|md|txt)$/.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

export function addSmokeClassName(source) {
  const anchor = /<Title\b(?=[^>]*\bid="welcome")([^>]*)>/g;
  if ([...source.matchAll(anchor)].length !== 1) throw new Error('Expected one Title with id="welcome"');
  return source.replace(anchor, '<Title$1 className="tracking-[0.137em]">');
}

async function smoke() {
  const t0 = Date.now();
  const { version: v, tarballs } = pack();
  const tgz = Object.fromEntries(tarballs.map((t) => [t.name, `file:${t.file}`]));
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-smoke-')));
  assert(!base.startsWith(REPO), '临时目录必须在仓库之外');
  const npm = 'npm';
  const npmFlags = ['--no-audit', '--no-fund', has('--offline') ? '--offline' : '--prefer-offline', '--loglevel=error'];
  const overrides = Object.fromEntries(Object.entries(tgz).filter(([n]) => n !== 'joplo'));
  log(`\n— 冒烟：${base}`);

  try {
    // 1. 相当于 npx joplo@<版本>：在独立目录只用 tarball 安装 joplo
    const tool = path.join(base, 'npx-cache');
    fs.mkdirSync(tool);
    fs.writeFileSync(path.join(tool, 'package.json'), JSON.stringify({ private: true, dependencies: { joplo: tgz.joplo }, overrides }, null, 2));
    sh(npm, ['install', ...npmFlags], tool);
    const npxJoplo = path.join(tool, 'node_modules/.bin/joplo');
    assert(fs.existsSync(npxJoplo), 'joplo 的 bin 没有安装');
    for(const name of ['ui','diagram','content','alda'])assert(!fs.existsSync(path.join(tool,'node_modules/@joplo-app',`plugin-${name}`)),`CLI alone must not install plugin-${name}`);
    assert(fs.realpathSync(npxJoplo) === fs.realpathSync(path.join(tool, 'node_modules/joplo/bin/joplo.cjs')), `.bin/joplo 应指向 joplo 入口包，实际 ${fs.realpathSync(npxJoplo)}`);

    // Node 版本过低：只打印要求，退出 1
    const oldNode = path.join(base, 'old-node.cjs');
    fs.writeFileSync(oldNode, "Object.defineProperty(process.versions, 'node', { value: '20.11.0', configurable: true, enumerable: true });\n");
    const old = sh(process.execPath, ['-r', oldNode, fs.realpathSync(npxJoplo), 'init', 'x'], base, { expect: 1 });
    assert(old.stderr.includes('Joplo requires Node.js 22 or later; current version is 20.11.0'), `Node 版本提示：${old.stderr}`);

    // 2. init
    const ua = { npm_config_user_agent: `npm/11.0.0 node/${process.version} ${process.platform} ${process.arch} workspaces/false` };
    const init = sh(npxJoplo, ['init', 'my-demo', '--template', path.join(REPO,'templates/starter')], base, { env: ua });
    const lastLine = init.stdout.trim().split('\n').at(-1);
    assert(lastLine === 'Next: cd my-demo && npm install && npx joplo dev', `init 最后一行：${lastLine}`);
    const project = path.join(base, 'my-demo');
    const pkg = readJson(path.join(project, 'package.json'));
    assert(pkg.devDependencies?.joplo === v && pkg.devDependencies?.['@joplo-app/kit'] === v, `init 应写入精确版本 ${v}：${JSON.stringify(pkg.devDependencies)}`);
    sh(npxJoplo, ['init', 'my-demo', '--template', path.join(REPO,'templates/starter')], base, { env: ua, expect: 1 });
    // init 默认安装 Agent 技能与 AGENTS.md 托管段（D64），与仓库 skills/ 逐字一致
    for (const name of ['joplo', 'joplo-feedback']) assert(fs.readFileSync(path.join(base, 'my-demo/.claude/skills', name, 'SKILL.md'), 'utf8') === fs.readFileSync(path.join(REPO, 'skills', name, 'SKILL.md'), 'utf8'), `init 应写入与 skills/${name} 相同的技能`);
    assert(fs.readFileSync(path.join(base, 'my-demo/AGENTS.md'), 'utf8').includes('<!-- joplo:start -->'), 'init 应写入 AGENTS.md 托管段');
    assert(init.stdout.includes('Agent skills') && init.stdout.includes('--no-skill'), `init 输出应说明安装的技能：${init.stdout}`);
    log(`  ✓ init 写入 "joplo": "${v}", "@joplo-app/kit": "${v}"；非空目录拒绝`);

    assert(!pkg.dependencies?.['@joplo-app/plugin-3d'] && !pkg.devDependencies?.['@joplo-app/plugin-3d'], 'Starter must omit optional 3D');
    assert(!fs.readFileSync(path.join(project,'joplo.config.ts'),'utf8').includes('plugin-3d'), 'Starter must not enable 3D');

    // 作者 className：Tailwind 要编译它
    const pageFile = path.join(project, 'routes/page.tsx');
    fs.writeFileSync(pageFile, addSmokeClassName(fs.readFileSync(pageFile, 'utf8')));

    // 3. npm install：registry 上还没有这些版本，改用 tarball（版本号已在上面断言）
    for(const name of ['joplo','@joplo-app/kit',...['ui','diagram','content','alda'].map(p=>`@joplo-app/plugin-${p}`)])assert(pkg.devDependencies[name]===v,`Template must pin ${name} to ${v}`);
    pkg.devDependencies = Object.fromEntries(Object.keys(pkg.devDependencies).map(name=>[name,tgz[name]??pkg.devDependencies[name]]));
    pkg.devDependencies['@joplo-app/plugin-3d'] = tgz['@joplo-app/plugin-3d'];
    pkg.overrides = overrides;
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    sh(npm, ['install', ...npmFlags], project);
    const joplo = path.join(project, 'node_modules/.bin/joplo');
    assert(fs.realpathSync(joplo) === fs.realpathSync(path.join(project, 'node_modules/joplo/bin/joplo.cjs')), '项目的 .bin/joplo 应指向 joplo 入口包');
    for (const n of ['joplo', '@joplo-app/cli', '@joplo-app/core', '@joplo-app/kit', '@joplo-app/plugin-diagram', '@joplo-app/plugin-alda', '@joplo-app/plugin-3d', '@joplo-app/plugin-content', '@joplo-app/plugin-ui', '@joplo-app/server', '@joplo-app/web']) {
      const p = path.join(project, 'node_modules', n);
      assert(fs.existsSync(p) && !fs.lstatSync(p).isSymbolicLink(), `${n} 应从 tarball 安装（不是链接）`);
      assert(readJson(path.join(p, 'package.json')).version === v, `${n} 版本应为 ${v}`);
    }
    assert(!fs.existsSync(path.join(project, 'node_modules/playwright')), 'playwright 不应被默认安装');

    // Optional plugin is installed explicitly; its author/local/runtime exports must work without workspace tools.
    const probe = sh(process.execPath, ['--input-type=module', '-e', `
      globalThis.fetch = () => { throw new Error('Network forbidden during import smoke'); };
      const {default:scene3d,model,Scene3D,Model} = await import('@joplo-app/plugin-3d');
      const {default:modelsLocal} = await import('@joplo-app/plugin-3d/local');
      const {default:modelsRuntime} = await import('@joplo-app/plugin-3d/runtime');
      if (scene3d.id !== 'scene3d' || !scene3d.local.endsWith('/local.js') || model('A red apple').plugin !== scene3d.id || !Scene3D || !Model || !modelsLocal.compilers.glb.persistent || !modelsRuntime.components.Scene || modelsRuntime.id !== scene3d.id || !scene3d.keys.length) process.exit(1);
      import alda, { music } from '@joplo-app/plugin-alda';
      import local from '@joplo-app/plugin-alda/local';
      import runtime from '@joplo-app/plugin-alda/runtime';
      const p = alda({ theme: 'piano: c4' });
      if (p.id !== 'alda' || !p.local.endsWith('/local.js') || !p.skill.includes('music.play') || !local.compilers.audio.version || runtime.media || music.play('theme').plugin !== 'alda') process.exit(1);
    `], project);

    // Real rendering from the installed tarball, not workspace sources. No fake success when Alda is absent.
    const aldaVersion = spawnSync('alda', ['version'], { encoding: 'utf8', timeout: 25000 });
    if (aldaVersion.status === 0 && aldaVersion.stdout.trim() === 'alda 2.4.8') {
      sh(process.execPath, ['--input-type=module', '-e', `
        import fs from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path';
        import local from '@joplo-app/plugin-alda/local';
        const directory=await fs.mkdtemp(path.join(os.tmpdir(),'joplo-music-smoke-'));
        try {
          const input=JSON.stringify({score:'piano: (tempo! 120) %start o3 c2/e2/g2 | %end r2 | midi-percussion: @start o2 c4 c+4 @end r2',loop:true});
          const info=await local.compilers.audio.inspect(input,{directory});
          if(info.markers.end!==1000 || info.durationMs!==2000 || !Object.values(info.parts).every(n=>n>0))throw new Error('Music inspection failed');
          const artifact=await local.compilers.audio.compile(input,{directory,maxBytes:8*1024*1024});
          const bytes=artifact.bytes;
          if(!(bytes instanceof Uint8Array)||bytes[0]!==255||(bytes[1]&224)!==224||bytes.length<1024||artifact.audio.sourceSampleRate!==32000||artifact.audio.cycleFrames!==64000||!artifact.credit||!artifact.license.includes('MIT'))throw new Error('Real SoundFont render failed');
          console.log('Real SoundFont render:',bytes.length,'bytes,',info.durationMs,'ms');
        } finally {await fs.rm(directory,{recursive:true,force:true});}
      `], project, { timeout: 180000 });
      log('  ✓ installed plugin: real MIDI → SoundFont → MP3 96kbps rendering');
    } else log('  SKIP real SoundFont rendering: Alda 2.4.8 is unavailable; install it and rerun release:smoke. Plugin imports were checked, audio rendering was not.');

    sh(process.execPath, ['--input-type=module', '-e', `
      import ui from '@joplo-app/plugin-ui';
      import content, { Canvas, camera } from '@joplo-app/plugin-content';
      import runtime from '@joplo-app/plugin-content/runtime';
      import { skill } from '@joplo-app/plugin-content/guide';
      import { config, feature, flow, option, page } from '@joplo-app/kit';
      import { jsx } from '@joplo-app/kit/jsx-runtime';
      import { compile, stateAt } from '@joplo-app/core';
      if (content.id !== 'content' || typeof Canvas !== 'function' || camera('target').plugin !== 'content' || !content.themes.studio || !runtime.observe || !runtime.components.Canvas.react || !skill.includes('motion')) process.exit(1);
      const file = '/smoke/source.tsx';
      const r = compile({ root:'/smoke', config:{...config({name:'Content smoke',theme:'content:studio',plugins:[ui,content]}),file}, layouts:{}, routes:{'/':{...page({title:'World'},jsx(Canvas,{children:jsx('div',{id:'target',motion:'piece',children:'Target'})})),file}}, features:{f:{def:{...feature({name:'F',goal:'G',cases:{},pick:'a'}),file},options:{a:{...option({name:'A',idea:'I',scenarios:{s:flow('S',{start:'/'}).system('Aim',camera('target'))}}),file}}}} }, 'publish');
      if (!r.project || r.diagnostics.some(d=>d.severity==='error') || stateAt(r.project,'f.a.s',1).ui.__plugins.content.camera.targets[0] !== 'target' || !r.project.scenarios['f.a.s'].steps[0].ext.content) process.exit(1);
    `], project);
    const contentGuide = sh(joplo, ['skill', 'content'], project);
    assert(contentGuide.stdout.includes('content:studio') && contentGuide.stdout.includes('camera('), 'Installed content guide must match its plugin API');

    // Default UI must work solely from production tarballs, including runtime and catalog exports.
    sh(process.execPath, ['--input-type=module', '-e', `
      import ui from '@joplo-app/plugin-ui';
      import runtime from '@joplo-app/plugin-ui/runtime';
      import { COMPONENT_TYPES } from '@joplo-app/plugin-ui/catalog';
      import { skill } from '@joplo-app/plugin-ui/guide';
      import { TextInput } from '@joplo-app/plugin-ui';
      import { config, feature, flow, option, page } from '@joplo-app/kit';
      import { jsx } from '@joplo-app/kit/jsx-runtime';
      import { compile, stateAt } from '@joplo-app/core';
      if (!ui.runtime.endsWith('/runtime.js') || !skill.includes('ui:') || COMPONENT_TYPES.some(name => !runtime.components[name]?.react) || !runtime.viewports.mobile) process.exit(1);
      const file='/smoke/source.tsx';
      const r=compile({root:'/smoke',config:{...config({name:'UI smoke',plugins:[ui]}),file},layouts:{},routes:{'/':{...page({title:'UI'},jsx('div',{children:jsx(TextInput,{id:'field'})})),file}},features:{f:{def:{...feature({name:'F',goal:'G',cases:{},pick:'a'}),file},options:{a:{...option({name:'A',idea:'I',scenarios:{s:flow('S',{start:'/'}).type('field','value')}}),file}}}}},'publish');
      if (!r.project || Object.values(r.project.scenes).some(s=>s.root.type!=='ui:div') || stateAt(r.project,'f.a.s',1).inputs.field!=='value') process.exit(1);
    `], project);
    const uiGuide=sh(joplo,['components','Button'],project);
    assert(uiGuide.stdout.includes('ui:Button') && uiGuide.stdout.includes('interactive'), 'Installed default UI catalog must come from the plugin');

    // 4. check
    const check = sh(joplo, ['check'], project);
    assert(/0 error/.test(check.stdout), `check 输出：${check.stdout}`);
    assert(!check.stderr.includes('!'), `check 不应有版本提示：${check.stderr}`);

    // 5. skill（T-skill）
    const skill = sh(joplo, ['skill'], project);
    assert(skill.stdout.includes(`Joplo ${v}`), `skill 应显示 CLI 版本 ${v}：${skill.stdout.split('\n')[0]}`);
    sh(joplo, ['skill', 'authoring'], project);
    const reviewGuide = sh(joplo, ['skill', 'review'], project);
    assert(reviewGuide.stdout.includes('feedback watch') && reviewGuide.stdout.includes('Share'), '安装包应提供本地与 Share 评审指南');
    sh(joplo, ['skill', 'install'], project);
    const skillMd = fs.readFileSync(path.join(project, '.claude/skills/joplo/SKILL.md'), 'utf8');
    assert(skillMd.includes(`joplo-skill ${v}`), `SKILL.md 应记录版本 ${v}`);
    // 官方技能与 tarball 里 CLI 写出的技能逐字一致（D64，同一份模板）
    for (const name of ['joplo', 'joplo-feedback']) {
      const installed = fs.readFileSync(path.join(project, `.claude/skills/${name}/SKILL.md`), 'utf8');
      assert(installed === fs.readFileSync(path.join(REPO, 'skills', name, 'SKILL.md'), 'utf8'), `skill install 写出的 ${name}/SKILL.md 应与仓库 skills/${name}/SKILL.md 逐字一致（运行 pnpm skills:build）`);
    }

    writeSkillReadingDemo(project);
    const readingCheck=sh(joplo,['check'],project);
    assert(/0 error/.test(readingCheck.stdout),'Demo authored from installed skills must pass check');

    // 6. build
    const build = sh(joplo, ['build'], project);
    const index = path.join(project, 'dist/index.html');
    assert(fs.existsSync(index), `build 没有生成 dist/index.html：${build.out}`);
    const html = fs.readFileSync(index, 'utf8');
    assert(html.includes('id="joplo-ir"') && html.includes('<script type="module">'), '发布站应内联 IR 与入口脚本');
    const css = fs.readdirSync(path.join(project, 'dist/assets')).filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(project, 'dist/assets', f), 'utf8')).join('\n');
    assert(/letter-spacing:\s*0?\.137em(?:[;}])/.test(css), '发布站 CSS 应包含作者 className（tracking-[0.137em]）');
    assert(fs.readdirSync(path.join(project, 'dist/assets')).some((f) => f.endsWith('.woff2')), '发布站应带手绘字体');
    const budget = checkSiteBudget(siteFiles(path.join(project, 'dist')));
    log(`  ✓ Published site budget: ${budget.fonts} font bytes / 1500000, ${budget.files} files / 150`);

    // Feature diff must work from packed CLI/server assets, without importing workspace sources.
    const diffGuide = sh(joplo, ['skill', 'diff'], project);
    assert(diffGuide.stdout.includes('joplo-step-keys'), '安装包应提供稳定身份兼容指南');
    const diffDir = path.join(project, 'feature-diff');
    sh(joplo, ['diff', 'dist', 'dist', '--out', diffDir, '--format', 'json'], project);
    const diffManifest = readJson(path.join(diffDir, 'feature-diff.json'));
    assert(diffManifest.formatVersion === 1 && diffManifest.status !== 'incompatible', '打包后的 diff 应识别真实发布播放器');
    for (const rel of ['index.html', 'before/index.html', 'after/index.html']) assert(fs.existsSync(path.join(diffDir, rel)), `diff 缺少 ${rel}`);
    const diffHtml = fs.readFileSync(path.join(diffDir, 'index.html'), 'utf8');
    assert(diffHtml.includes('joplo-feature-diff') && diffHtml.includes('joplo:goto') && diffHtml.includes('joplo-diff-locales'), 'tarball 应包含独立 diff runtime 和 UI 词典');
    assert(!diffHtml.includes('__name'), 'diff runtime 不应依赖源码转译器 helper');
    log('  ✓ Packed feature diff: two public builds, viewer runtime, manifest, and skill');

    // 7. render：没有导出组件（D66）时非交互环境以退出码 4 结束，提示 setup export，不下载、不改项目依赖文件
    const exportHome = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-smoke-export-home-'));
    const depFiles = () => ['package.json', 'package-lock.json'].map((f) => (fs.existsSync(path.join(project, f)) ? fs.readFileSync(path.join(project, f), 'utf8') : '-')).join('\n') + '\n' + fs.readdirSync(path.join(project, 'node_modules')).sort().join(',');
    const depsBefore = depFiles();
    const render = sh(joplo, ['render', '--scenario-id', 'example.a.happy', '--out', 'shot.png'], project, { expect: 4, env: { JOPLO_HOME: exportHome, CI: '1' } });
    assert(render.out.includes('EXPORT_COMPONENT_MISSING') && render.out.includes('npx joplo setup export') && render.out.includes('Writing demos, dev, check, build, and share do not need it'), `render 提示：${render.out}`);
    assert(!render.out.includes('npm i -D playwright'), `render 不应再要求把 Playwright 装进项目：${render.out}`);
    const status = sh(joplo, ['setup', 'export', '--status'], project, { expect: 4, env: { JOPLO_HOME: exportHome } });
    assert(status.out.includes('not installed'), `setup export --status：${status.out}`);
    assert(!fs.existsSync(path.join(exportHome, 'runtime')), 'render / setup --status 不应下载导出组件');
    assert(depFiles() === depsBefore, 'render 不应修改项目的 package.json、lockfile 或 node_modules');
    fs.rmSync(exportHome, { recursive: true, force: true });

    // 8. dev：随机端口，GET / 返回看板 HTML；选中一个元素，随后 selection 读出 文件:行
    const port = await freePort();
    const served = [];
    // 看板进程的注册表与 server.json 放在临时目录（不读写真实的 ~/.joplo）
    const joploHome = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-smoke-home-'));
    const dev = spawn(joplo, ['dev', '--port', String(port)], { cwd: project, env: cleanEnv({ JOPLO_HOME: joploHome }), stdio: ['ignore', 'pipe', 'pipe'] });
    let devOut = '';
    dev.stdout.on('data', (c) => (devOut += c));
    dev.stderr.on('data', (c) => (devOut += c));
    const exited = new Promise((res) => dev.on('exit', res));
    try {
      const tDev = Date.now();
      while (!devOut.includes(`http://127.0.0.1:${port}/`)) {
        if (dev.exitCode !== null || Date.now() - tDev > 60000) die(`joplo dev 没有启动：\n${devOut}`);
        await new Promise((r) => setTimeout(r, 100));
      }
      const home = await request(port, { path: '/' });
      served.push(home.text);
      assert(home.status === 200, `GET / 返回 ${home.status}`);
      assert(/<title>Joplo[^<]*<\/title>/.test(home.text) && home.text.includes('<div id="root">'), 'GET / 应是看板 HTML');
      assert(!home.text.includes('__JOPLO_TOKEN__'), '看板 HTML 应注入本地令牌');
      assert(home.text.includes('createHotContext'), 'dist 看板应注入 HMR 句柄');
      const token = /name="joplo-token" content="([^"]+)"/.exec(home.text)?.[1];
      const script = /src="\.?(\/assets\/[^"]+\.js)"/.exec(home.text)?.[1];
      assert(token && script, '看板 HTML 缺少令牌或入口脚本');
      const js = await request(port, { path: script });
      assert(js.status === 200 && js.text.includes('__JOPLO_HOT__'), `看板脚本 ${script} 返回 ${js.status}`);
      const cssPath = /import "(\/@fs\/[^"]+project\.css)"/.exec(home.text)?.[1];
      assert(cssPath, '看板 HTML 应导入 project.css');
      const projectCss = await request(port, { path: cssPath });
      assert(projectCss.status === 200 && /letter-spacing:\s*0?\.137em(?:[;}])/.test(projectCss.text), `project.css 应包含作者 className（${projectCss.status}）`);
      served.push(projectCss.text);
      const listed = JSON.parse((await request(port, { path: '/__joplo/projects' })).text).projects;
      assert(listed.length === 1 && listed[0].dir === fs.realpathSync(project), `首页项目列表：${JSON.stringify(listed)}`);
      const pid = listed[0].id;
      assert(devOut.includes(`#/${pid}`), 'joplo dev 应输出项目的看板链接');
      const info = JSON.parse(fs.readFileSync(path.join(joploHome, 'server.json'), 'utf8'));
      assert(info.port === port && (fs.statSync(path.join(joploHome, 'server.json')).mode & 0o777) === 0o600, 'server.json 应记录端口且权限为 0600');
      const irRes = await request(port, { path: `/__joplo/p/${pid}/ir` });
      served.push(irRes.text);
      const ir = JSON.parse(irRes.text);
      assert(ir.ok === true && ir.project, `IR：${irRes.text.slice(0, 300)}`);
      const sceneId = Object.keys(ir.project.scenes).find((id) => JSON.stringify(ir.project.scenes[id]).includes('"id":"start"'));
      const optionId = Object.keys(ir.project.options)[0];
      assert(sceneId && optionId, '找不到包含按钮 start 的画面');
      await verifySkillReadingBrowser(REPO,project,`http://127.0.0.1:${port}/#/${pid}/f/example?s=example.a.happy&step=0`);
      log('  ✓ Installed skills → ui + diagram + content → check → dev Chromium → built site over HTTP steps 1/2/1');
      const body = JSON.stringify({ selection: { optionId, scenarioId: null, position: 0, sceneId, nodeId: 'start' } });
      const put = await request(port, { method: 'PUT', path: `/__joplo/p/${pid}/selection`, body, headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json', 'x-joplo-token': token, 'content-length': Buffer.byteLength(body) } });
      assert(put.status === 200, `PUT selection 返回 ${put.status}：${put.text}`);
      const at = JSON.parse(put.text).selection?.at;
      assert(/^features\/example\/options\/a\.tsx:\d+:\d+$/.test(at ?? ''), `selection.at 应为项目相对的 文件:行:列，实际 ${at}`);
      log(`  ✓ joplo dev --port ${port}：GET / 200 看板 HTML，IR ok，选中 start → ${at}`);

      // 本地评审必须在真正安装的 tarball 中工作：保存反馈 → stdout 先输出 → 确认后退出，再按游标补读。
      const reviews = JSON.parse(sh(joplo, ['feedback', 'list', '--local', '--json'], project).stdout);
      const review = reviews.find((s) => s.optionId === optionId);
      assert(review && review.projectDir === fs.realpathSync(project), 'feedback list 应返回当前项目、当前方案的评审会话');
      const listener = spawn(joplo, ['feedback', 'watch', '--local', '--session', review.id, '--json'], { cwd: project, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
      let listenerOut = '', listenerErr = '';
      listener.stdout.on('data', c => { listenerOut += c; });
      listener.stderr.on('data', c => { listenerErr += c; });
      const listenerExit = new Promise(resolve => listener.on('exit', resolve));
      const submitReview = (data) => {
        const body = JSON.stringify({ sessionId: review.id, requestId: crypto.randomUUID(), ...data });
        return request(port, { method: 'POST', path: `/__joplo/p/${pid}/review`, body, headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json', 'x-joplo-token': token, 'content-length': Buffer.byteLength(body) } });
      };
      let listenerTimeout;
      try {
        const scenario = Object.values(ir.project.scenarios).find(s => s.optionId === optionId);
        assert(scenario, '评审冒烟应有可定位的场景');
        const feedback = await submitReview({ type: 'feedback', body: 'Smoke-test feedback', context: { scenarioId: scenario.id, position: 0, sceneId: scenario.initial.sceneId } });
        assert(feedback.status === 200, `提交本地反馈失败：${feedback.status}`);
        const tFeedback = Date.now();
        while (!listenerOut.includes('"type":"feedback"')) {
          assert(listener.exitCode === null && Date.now() - tFeedback < 10000, `监听没有及时输出反馈：${listenerErr}`);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert(listener.exitCode === null, '收到反馈后必须继续等待确认');
        const approval = await submitReview({ type: 'approved' });
        assert(approval.status === 200, `确认本地方案失败：${approval.status}`);
        const exitCode = await Promise.race([listenerExit, new Promise(resolve => { listenerTimeout = setTimeout(() => resolve('timeout'), 10000); })]);
        clearTimeout(listenerTimeout);
        assert(exitCode === 0, `确认后监听应退出 0，实际 ${exitCode}：${listenerErr}`);
        const events = listenerOut.trim().split('\n').map(line => JSON.parse(line));
        assert(JSON.stringify(events.map(e => e.type)) === '["feedback","approved"]' && events.every(e => e.source === 'local' && e.sessionId === review.id), 'stdout 应为同一会话的纯 NDJSON 反馈和确认事件');
        const replay = sh(joplo, ['feedback', 'watch', '--local', '--session', review.id, '--after', '1', '--json'], project, { timeout: 10000 });
        assert(JSON.parse(replay.stdout.trim()).type === 'approved', '--after 1 应只补收确认，并退出 0');
        log('  ✓ 本地评审：反馈即时输出、确认后 exit 0、游标补收、随包 review skill');
      } finally {
        clearTimeout(listenerTimeout);
        if (listener.exitCode === null) listener.kill('SIGTERM');
      }

      // 热更新：改作者文件 → 重新编译（IR 版本递增）→ 新 className 进入 project.css
      fs.writeFileSync(pageFile, fs.readFileSync(pageFile, 'utf8').replace('tracking-[0.137em]', 'tracking-[0.211em]'));
      const tHot = Date.now();
      for (;;) {
        const now = JSON.parse((await request(port, { path: `/__joplo/p/${pid}/ir` })).text);
        if (now.version > ir.version) break;
        if (Date.now() - tHot > 15000) die('改动作者文件后 IR 没有重新编译');
        await new Promise((r) => setTimeout(r, 100));
      }
      const hotCss = await request(port, { path: cssPath });
      assert(/letter-spacing:\s*0?\.211em(?:[;}])/.test(hotCss.text), '热更新后 project.css 应包含新的 className');
      log(`  ✓ 热更新：IR 重新编译，新 className 已编译（${Date.now() - tHot} ms）`);

      // 一个进程、多个项目（D39）：在另一个目录再运行 joplo dev → 注册到已运行的看板并退出（不启动第二个进程）
      const second = path.join(base, 'second');
      sh(joplo, ['init', 'second', '--template', path.join(REPO,'templates/starter')], base);
      const secondPkg=readJson(path.join(second,'package.json'));
      secondPkg.devDependencies={...pkg.devDependencies};secondPkg.overrides=overrides;
      fs.writeFileSync(path.join(second,'package.json'),JSON.stringify(secondPkg,null,2));
      sh(npm,['install',...npmFlags],second);
      const t2 = Date.now();
      const again = sh(joplo, ['dev', '--port', String(await freePort())], second, { env: { JOPLO_HOME: joploHome }, timeout: 30000 });
      assert(again.stdout.includes(`http://127.0.0.1:${port}/#/`), `第二次 joplo dev 应输出已运行看板的链接：${again.out}`);
      assert(again.out.includes('Joined the running board'), `第二次 joplo dev 应说明已加入：${again.out}`);
      assert(again.out.includes(`Joplo ${v}, started in ${fs.realpathSync(project)}`) && !again.out.includes('[joplo] !'), `加入时应写出看板的版本与启动目录、版本一致时不警告：${again.out}`);
      const both = JSON.parse((await request(port, { path: '/__joplo/projects' })).text).projects.map((p) => p.dir).sort();
      assert(both.length === 2 && both.includes(fs.realpathSync(second)), `首页应有两个项目：${JSON.stringify(both)}`);
      log(`  ✓ 再次 joplo dev：加入同一个看板（端口 ${port}）后退出，首页有 2 个项目（${Date.now() - t2} ms）`);
    } finally {
      dev.kill('SIGTERM');
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
      if (dev.exitCode === null) dev.kill('SIGKILL');
    }

    // 9. selection
    const sel = sh(joplo, ['selection'], project);
    assert(/features\/example\/options\/a\.tsx:\d+:\d+/.test(sel.stdout) && sel.stdout.includes('<Button id="start">'), `selection 输出：${sel.stdout}`);

    // 10. 产物与运行时不引用仓库路径、不含 workspace: 协议
    const needles = [...new Set([REPO, fs.realpathSync(REPO)])];
    const extract = path.join(base, 'tarballs');
    fs.mkdirSync(extract);
    for (const t of tarballs) {
      const out = path.join(extract, t.name.replace('/', '__'));
      fs.mkdirSync(out);
      run('tar', ['-xzf', t.file, '-C', out]);
    }
    const scanned = [
      ...textFiles(extract),
      ...['joplo', '@joplo-app'].flatMap((n) => textFiles(path.join(project, 'node_modules', n))),
      ...textFiles(path.join(project, 'dist')),
      ...textFiles(path.join(project, '.claude')),
    ];
    const hits = [];
    for (const f of scanned) {
      const text = fs.readFileSync(f, 'utf8');
      for (const n of needles) if (text.includes(n)) hits.push(`${f}：仓库路径`);
      if (/"workspace:/.test(text) || /workspace:\*/.test(text)) hits.push(`${f}：workspace: 协议`);
    }
    for (const [i, text] of served.entries()) for (const n of needles) if (text.includes(n)) hits.push(`dev 响应 #${i}：仓库路径`);
    for (const n of needles) if (devOut.includes(n)) hits.push('dev 日志：仓库路径');
    assert(hits.length === 0, `发现仓库路径或 workspace: 引用：\n${hits.join('\n')}`);
    log(`  ✓ 扫描 ${scanned.length} 个文件与 ${served.length} 个 dev 响应：没有仓库绝对路径、没有 workspace: 协议`);

    log(`\n✓ release:smoke 通过（${((Date.now() - t0) / 1000).toFixed(1)}s）：init → npm install → check → skill → build → render 提示 → dev → feedback → selection`);
  } finally {
    if (has('--keep')) log(`保留临时目录：${base}`);
    else fs.rmSync(base, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- publish

/** registry 上是否已有这个版本（直接查 registry，绕过本地缓存）。网络错误时抛错，不猜。 */
async function isPublished(name, version) {
  const url = `https://registry.npmjs.org/${name.replace('/', '%2f')}?t=${Date.now()}`;
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache', accept: 'application/json' } });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`查询 ${name} 失败：HTTP ${res.status}`);
  const doc = await res.json();
  return Boolean(doc.versions?.[version]);
}

/**
 * 发布一个已打好的 tarball。npm publish <tarball> 不运行任何生命周期脚本（不会再逐包构建；2026-11-06 用 --dry-run 实测）。
 * 必须是绝对路径：npm 会把 release/x.tgz 这种相对路径当成 GitHub 简写（git ls-remote github.com/release/…）。
 */
function npmPublishTarball(t, tag) {
  const r = spawnSync('npm', ['publish', path.resolve(t.file), '--access', 'public', '--tag', tag], { stdio: 'inherit' });
  return r.status === 0;
}

/**
 * 可续跑的发布（0.2.4 漏了 core、0.2.6 漏了 web：以前每个包 publish 前各自跑 prepublishOnly 构建，
 * web 构建最慢，输入 OTP 之后中间的包容易失败）。现在：
 * 1. prepare：先一次性构建并打包全部包（即 release:pack，含全部 tarball 检查），失败时一个都不发；
 * 2. 按依赖顺序（PACKAGES）逐个发布已打好的 tarball，registry 上已有的版本跳过；
 *    任何一个包失败（含查询 registry 失败）立刻停止，列出已发布 / 未发布的包，提示重跑；
 * 3. 全部发完后运行 release:verify，用它的结果作为整体结果（主入口据此决定退出码）。
 * 依赖（prepare / isPublished / publishTarball / verify / log）可注入替身，测试不触网。
 */
export async function publishRelease(opts = {}) {
  const tag = opts.tag ?? 'beta';
  const prepare = opts.prepare ?? (async () => pack());
  const onRegistry = opts.isPublished ?? isPublished;
  const publishOne = opts.publishTarball ?? npmPublishTarball;
  const verify = opts.verify ?? ((v) => verifyRelease({ version: v }));
  const out = opts.log ?? log;
  const err = opts.error ?? ((m) => console.error(m));
  const { version: v, tarballs } = await prepare();
  const published = [], skipped = [];
  for (let i = 0; i < tarballs.length; i++) {
    const t = tarballs[i];
    let reason = null;
    try {
      if (await onRegistry(t.name, v)) {
        out(`跳过 ${t.name}@${v}：registry 上已存在`);
        skipped.push(t.name);
        continue;
      }
      out(`发布 ${t.name}@${v}（${path.basename(t.file)}，--tag ${tag}）`);
      if (!(await publishOne(t, tag))) reason = 'npm publish 失败';
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
    if (reason) {
      const unpublished = tarballs.slice(i).map((x) => x.name);
      err(`✗ ${t.name}@${v} 没有发布（${reason}），已停止，后面的包都没有发。`);
      err(`  本次已发布：${published.join('、') || '无'}${skipped.length ? `；registry 上原本就有：${skipped.join('、')}` : ''}`);
      err(`  还没发布：${unpublished.join('、')}`);
      err(`修复：处理登录、网络或 OTP 问题后重跑 pnpm release:publish --tag ${tag}（已发布的会跳过，只补发缺的）。`);
      return { ok: false, version: v, published, skipped, unpublished };
    }
    published.push(t.name);
  }
  out(published.length ? `✓ 本次发布 ${published.length} 个包：${published.join('、')}` : '✓ 所有包都已在 registry 上，无需发布');
  out('— 运行 release:verify');
  const verified = await verify(v);
  if (verified?.ok) out(`✓ 发布完成：${v}（CI 由 v${v} tag 触发；本地手动发布时再补 git tag v${v} && git push origin v${v}，会顺带生成 GitHub Release）`);
  else err("✗ release:verify 没有通过（见上面的输出）：修好后重跑同一条命令（CI 上 Re-run），已发布的包会跳过。");
  return { ok: Boolean(verified?.ok), version: v, published, skipped, unpublished: [] };
}

// ---------------------------------------------------------------- verify

/** npm view <名字>@<版本> version：有这个版本时返回版本号，没有（E404 等）时返回 null。 */
function npmView(name, v) {
  const r = spawnSync('npm', ['view', `${name}@${v}`, 'version', '--prefer-online'], { encoding: 'utf8', env: cleanEnv() });
  const out = (r.stdout ?? '').trim().split('\n').at(-1)?.replace(/^'|'$/g, '') ?? '';
  return r.status === 0 && out === v ? out : null;
}

/** 在系统临时目录、用全新的 npm 缓存实际安装并运行一次 npx -y joplo@<版本> --help。 */
function npxInstall(v) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-verify-'));
  try {
    const r = spawnSync('npx', ['-y', `joplo@${v}`, '--help'], { cwd: dir, encoding: 'utf8', env: cleanEnv({ npm_config_cache: path.join(dir, '.npm'), npm_config_update_notifier: 'false' }), timeout: 300_000 });
    return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** npx 安装失败输出里提到的缺失包（npm 的 E404 / ETARGET 两种写法）。 */
export function missingFromInstallOutput(output, names) {
  return names.filter((name) => {
    const encoded = name.replace('/', '%2f');
    // 包名两侧不能紧挨着名字字符：joplo 不应匹配 @joplo-app/…
    const exact = (n) => `(?<![\\w@%-])${escapeRe(n)}(?![\\w%/-])`;
    return new RegExp(`404[^\\n]*(?:${exact(name)}|${exact(encoded)})|'${escapeRe(name)}@[^']*' is not in this registry|No matching version found for ${escapeRe(name)}@`, 'i').test(output);
  });
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * 发布之后的验证（0.2.4 时 @joplo-app/core 漏发，joplo → cli → core 是精确依赖，所有人 npx joplo 都装不上）：
 * 1. 对 PACKAGES 每个包 npm view <名字>@<版本> version，registry 有几十秒延迟，每个包最多试 attempts 次，间隔 delayMs；
 * 2. 全部都在时，在临时目录实际运行 npx -y joplo@<版本> --help。
 * 任何一步失败都列出缺的包并返回 ok: false（主入口以非 0 退出），提示用 pnpm release:publish 重跑。
 * 依赖（view / install / sleep / log）可注入替身，测试不触网。
 */
export async function verifyRelease(opts = {}) {
  const root = opts.root ?? REPO;
  const view = opts.view ?? npmView;
  const install = opts.install ?? npxInstall;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  // 大包（web 约 2.5 MB）发布后 npm 会“processing”几分钟（0.2.9 CI 发布实测 60 秒不够），所以最多等约 5 分钟
  const attempts = opts.attempts ?? 21;
  const delayMs = opts.delayMs ?? 15_000;
  const out = opts.log ?? log;
  const err = opts.error ?? ((m) => console.error(m));
  const pkgs = PACKAGES.map((p) => readJson(path.join(packageDir(p, root), 'package.json')));
  const versions = new Set(pkgs.map((p) => p.version));
  const v = opts.version ?? (versions.size === 1 ? [...versions][0] : null);
  if (!v || !SEMVER.test(v)) return fail([], `各包版本不一致或版本不合法（${[...versions].join('、')}）；用 pnpm release:verify <版本> 指定`);
  const names = pkgs.map((p) => p.name);
  const missing = [];
  for (const name of names) {
    let found = false;
    for (let i = 0; i < attempts && !found; i++) {
      if (i > 0) await sleep(delayMs);
      found = (await view(name, v)) === v;
    }
    if (found) out(`  ✓ ${name}@${v} 在 registry 上`);
    else { missing.push(name); err(`  ✗ ${name}@${v} 不在 registry 上（试了 ${attempts} 次）`); }
  }
  if (missing.length) return fail(missing, `registry 上缺少 ${missing.map((n) => `${n}@${v}`).join('、')}`);
  const installed = await install(v);
  if (!installed.ok) {
    const inOutput = missingFromInstallOutput(installed.output, names);
    return fail(inOutput, `npx -y joplo@${v} --help 安装失败${inOutput.length ? `，缺少 ${inOutput.map((n) => `${n}@${v}`).join('、')}` : ''}：\n${installed.output.trim().split('\n').slice(-15).join('\n')}`);
  }
  out(`✓ release:verify 通过：${names.length} 个包都在 registry 上，npx -y joplo@${v} --help 安装运行成功`);
  return { ok: true, version: v, missing: [] };

  function fail(list, message) {
    err(`✗ ${message}`);
    if (list.length) err(`缺少的包：${list.join('、')}`);
    err('修复：重跑 pnpm release:publish --tag <同一标签>（已发布的包会跳过，只补发缺的），等几十秒后再运行 pnpm release:verify。');
    return { ok: false, version: v, missing: list, message };
  }
}

// ---------------------------------------------------------------- main

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
const cmd = args.shift();
if (cmd === 'version') {
  const root = path.resolve(flag('--root') ?? REPO);
  version(root, args[0]);
} else if (cmd === 'pack') pack();
else if (cmd === 'smoke') await smoke();
else if (cmd === 'publish') { if (!(await publishRelease({ tag: flag('--tag') ?? 'beta' })).ok) process.exit(1); }
else if (cmd === 'verify') { if (!(await verifyRelease({ version: args[0] })).ok) process.exit(1); }
else die('用法：node scripts/release.mjs version <版本> | pack | smoke [--keep] | publish [--tag beta] | verify [<版本>]');
}
