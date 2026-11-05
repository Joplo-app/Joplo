#!/usr/bin/env node
/**
 * 发布脚本（只准备，不发布；见 docs/release.md）。
 *
 *   node scripts/release.mjs version <版本> [--root <仓库>]   统一修改所有包的版本（pnpm release:version）
 *   node scripts/release.mjs pack                             构建并打包到 release/（pnpm release:pack）
 *   node scripts/release.mjs smoke [--keep]                   打包后在仓库外的临时目录只用 tarball 安装并跑通全流程（pnpm release:smoke）
 *
 * 真正发布是 `pnpm release:publish`（pnpm -r publish --access public --tag beta），本脚本从不调用 npm publish。
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..');
/** 发布顺序（依赖在前）。目录名 → 包名见各自 package.json。 */
export const PACKAGES = ['kit', 'core', 'web', 'server', 'cli', 'joplo'];
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
  const files = PACKAGES.map((p) => path.join(root, 'packages', p, 'package.json'));
  for (const f of files) if (!fs.existsSync(f)) die(`缺少 ${f}`);
  // 先全部读出再写入：任何一个读失败都不会留下改了一半的版本
  const pkgs = files.map((f) => [f, readJson(f)]);
  for (const [f, pkg] of pkgs) {
    pkg.version = v;
    fs.writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n');
  }
  log(`✓ ${pkgs.map(([, p]) => p.name).join('、')} → ${v}`);
}

// ---------------------------------------------------------------- pack

const RELEASE = path.join(REPO, 'release');

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { stdio: 'inherit', ...opts });
  if (r.status !== 0) die(`${cmd} ${argv.join(' ')} 失败（退出码 ${r.status}）`);
  return r;
}

function tarList(tgz) {
  const r = spawnSync('tar', ['-tvzf', tgz], { encoding: 'utf8' });
  if (r.status !== 0) die(`无法读取 ${tgz}`);
  return r.stdout.trim().split('\n').map((l) => {
    const parts = l.trim().split(/\s+/);
    return { size: Number(parts[4]), file: parts.slice(8).join(' ').replace(/^package\//, '') };
  });
}

const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`);

function pack() {
  const pkgs = PACKAGES.map((p) => ({ dir: path.join(REPO, 'packages', p), pkg: readJson(path.join(REPO, 'packages', p, 'package.json')) }));
  const versions = new Set(pkgs.map((p) => p.pkg.version));
  if (versions.size !== 1) die(`各包版本不一致：${pkgs.map((p) => `${p.pkg.name}@${p.pkg.version}`).join('、')}。先运行 pnpm release:version <版本>`);
  const v = [...versions][0];

  log('— 构建（pnpm -r build，按依赖顺序）');
  run('pnpm', ['-r', '--filter', './packages/*', 'run', 'build'], { cwd: REPO });

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

async function smoke() {
  const t0 = Date.now();
  const { version: v, tarballs } = pack();
  const tgz = Object.fromEntries(tarballs.map((t) => [t.name, `file:${t.file}`]));
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-smoke-')));
  assert(!base.startsWith(REPO), '临时目录必须在仓库之外');
  const npm = 'npm';
  const npmFlags = ['--no-audit', '--no-fund', '--prefer-offline', '--loglevel=error'];
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
    assert(fs.realpathSync(npxJoplo) === fs.realpathSync(path.join(tool, 'node_modules/joplo/bin/joplo.cjs')), `.bin/joplo 应指向 joplo 入口包，实际 ${fs.realpathSync(npxJoplo)}`);

    // Node 版本过低：只打印要求，退出 1
    const oldNode = path.join(base, 'old-node.cjs');
    fs.writeFileSync(oldNode, "Object.defineProperty(process.versions, 'node', { value: '20.11.0', configurable: true, enumerable: true });\n");
    const old = sh(process.execPath, ['-r', oldNode, fs.realpathSync(npxJoplo), 'init', 'x'], base, { expect: 1 });
    assert(old.stderr.includes('Joplo 需要 Node.js 22 或更高版本，当前是 20.11.0'), `Node 版本提示：${old.stderr}`);

    // 2. init
    const ua = { npm_config_user_agent: `npm/11.0.0 node/${process.version} ${process.platform} ${process.arch} workspaces/false` };
    const init = sh(npxJoplo, ['init', 'my-demo'], base, { env: ua });
    const lastLine = init.stdout.trim().split('\n').at(-1);
    assert(lastLine === '下一步：cd my-demo && npm install && npx joplo dev', `init 最后一行：${lastLine}`);
    const project = path.join(base, 'my-demo');
    const pkg = readJson(path.join(project, 'package.json'));
    assert(pkg.devDependencies?.joplo === v && pkg.devDependencies?.['@joplo-app/kit'] === v, `init 应写入精确版本 ${v}：${JSON.stringify(pkg.devDependencies)}`);
    sh(npxJoplo, ['init', 'my-demo'], base, { env: ua, expect: 1 });
    log(`  ✓ init 写入 "joplo": "${v}", "@joplo-app/kit": "${v}"；非空目录拒绝`);

    // 作者 className：Tailwind 要编译它
    const pageFile = path.join(project, 'routes/page.tsx');
    fs.writeFileSync(pageFile, fs.readFileSync(pageFile, 'utf8').replace('<Title order={2}>开始设计</Title>', '<Title order={2} className="tracking-[0.137em]">开始设计</Title>'));

    // 3. npm install：registry 上还没有这些版本，改用 tarball（版本号已在上面断言）
    pkg.devDependencies = { joplo: tgz.joplo, '@joplo-app/kit': tgz['@joplo-app/kit'] };
    pkg.overrides = overrides;
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    sh(npm, ['install', ...npmFlags], project);
    const joplo = path.join(project, 'node_modules/.bin/joplo');
    assert(fs.realpathSync(joplo) === fs.realpathSync(path.join(project, 'node_modules/joplo/bin/joplo.cjs')), '项目的 .bin/joplo 应指向 joplo 入口包');
    for (const n of ['joplo', '@joplo-app/cli', '@joplo-app/core', '@joplo-app/kit', '@joplo-app/server', '@joplo-app/web']) {
      const p = path.join(project, 'node_modules', n);
      assert(fs.existsSync(p) && !fs.lstatSync(p).isSymbolicLink(), `${n} 应从 tarball 安装（不是链接）`);
      assert(readJson(path.join(p, 'package.json')).version === v, `${n} 版本应为 ${v}`);
    }
    assert(!fs.existsSync(path.join(project, 'node_modules/playwright')), 'playwright 不应被默认安装');

    // 4. check
    const check = sh(joplo, ['check'], project);
    assert(/0 error/.test(check.stdout), `check 输出：${check.stdout}`);
    assert(!check.stderr.includes('!'), `check 不应有版本提示：${check.stderr}`);

    // 5. skill（T-skill）
    const skill = sh(joplo, ['skill'], project);
    assert(skill.stdout.includes(`Joplo ${v}`), `skill 应显示 CLI 版本 ${v}：${skill.stdout.split('\n')[0]}`);
    sh(joplo, ['skill', 'authoring'], project);
    sh(joplo, ['skill', 'install'], project);
    const skillMd = fs.readFileSync(path.join(project, '.claude/skills/joplo/SKILL.md'), 'utf8');
    assert(skillMd.includes(`joplo-skill ${v}`), `SKILL.md 应记录版本 ${v}`);

    // 6. build
    const build = sh(joplo, ['build'], project);
    const index = path.join(project, 'dist/index.html');
    assert(fs.existsSync(index), `build 没有生成 dist/index.html：${build.out}`);
    const html = fs.readFileSync(index, 'utf8');
    assert(html.includes('id="joplo-ir"') && html.includes('<script type="module">'), '发布站应内联 IR 与入口脚本');
    const css = fs.readdirSync(path.join(project, 'dist/assets')).filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(project, 'dist/assets', f), 'utf8')).join('\n');
    assert(css.includes('.137em'), '发布站 CSS 应包含作者 className（tracking-[0.137em]）');
    assert(fs.readdirSync(path.join(project, 'dist/assets')).some((f) => f.endsWith('.woff2')), '发布站应带手绘字体');

    // 7. render：没有 Playwright 时只有 render 失败，并给出安装命令
    const render = sh(joplo, ['render', '--scenario-id', 'example.a.happy', '--out', 'shot.png'], project, { expect: 1 });
    assert(render.out.includes('npx playwright install chromium') && render.out.includes('dev、check、build 不需要它'), `render 提示：${render.out}`);

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
      assert(home.text.includes('<title>Joplo · 看板</title>') && home.text.includes('<div id="root">'), 'GET / 应是看板 HTML');
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
      assert(projectCss.status === 200 && projectCss.text.includes('.137em'), `project.css 应包含作者 className（${projectCss.status}）`);
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
      const body = JSON.stringify({ selection: { optionId, scenarioId: null, position: 0, sceneId, nodeId: 'start' } });
      const put = await request(port, { method: 'PUT', path: `/__joplo/p/${pid}/selection`, body, headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json', 'x-joplo-token': token, 'content-length': Buffer.byteLength(body) } });
      assert(put.status === 200, `PUT selection 返回 ${put.status}：${put.text}`);
      const at = JSON.parse(put.text).selection?.at;
      assert(/^features\/example\/options\/a\.tsx:\d+:\d+$/.test(at ?? ''), `selection.at 应为项目相对的 文件:行:列，实际 ${at}`);
      log(`  ✓ joplo dev --port ${port}：GET / 200 看板 HTML，IR ok，选中 start → ${at}`);

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
      assert(hotCss.text.includes('.211em'), '热更新后 project.css 应包含新的 className');
      log(`  ✓ 热更新：IR 重新编译，新 className 已编译（${Date.now() - tHot} ms）`);

      // 一个进程、多个项目（D39）：在另一个目录再运行 joplo dev → 注册到已运行的看板并退出（不启动第二个进程）
      const second = path.join(base, 'second');
      sh(joplo, ['init', 'second'], base);
      const t2 = Date.now();
      const again = sh(joplo, ['dev', '--port', String(await freePort())], second, { env: { JOPLO_HOME: joploHome }, timeout: 30000 });
      assert(again.stdout.includes(`http://127.0.0.1:${port}/#/`), `第二次 joplo dev 应输出已运行看板的链接：${again.out}`);
      assert(again.out.includes('已加入正在运行的看板'), `第二次 joplo dev 应说明已加入：${again.out}`);
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

    log(`\n✓ release:smoke 通过（${((Date.now() - t0) / 1000).toFixed(1)}s）：init → npm install → check → skill → build → render 提示 → dev → selection`);
  } finally {
    if (has('--keep')) log(`保留临时目录：${base}`);
    else fs.rmSync(base, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- publish

/** registry 上是否已有这个版本（直接查 registry，绕过本地缓存）。网络错误时直接失败，不猜。 */
async function isPublished(name, version) {
  const url = `https://registry.npmjs.org/${name.replace('/', '%2f')}?t=${Date.now()}`;
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache', accept: 'application/json' } });
  if (res.status === 404) return false;
  if (!res.ok) die(`查询 ${name} 失败：HTTP ${res.status}`);
  const doc = await res.json();
  return Boolean(doc.versions?.[version]);
}

/**
 * 可续跑的发布：按依赖顺序（PACKAGES）逐个检查，只发布 registry 上还没有的版本。
 * 中途失败后重新运行同一条命令即可从断点继续。dist-tag 用 --tag（默认 beta）。
 */
async function publish(tag) {
  const pkgs = PACKAGES.map((p) => ({ dir: path.join(REPO, 'packages', p), pkg: readJson(path.join(REPO, 'packages', p, 'package.json')) }));
  const versions = new Set(pkgs.map((p) => p.pkg.version));
  if (versions.size !== 1) die(`各包版本不一致：${[...versions].join('、')}；先运行 release:version`);
  let published = 0;
  for (const { dir, pkg } of pkgs) {
    if (await isPublished(pkg.name, pkg.version)) {
      log(`跳过 ${pkg.name}@${pkg.version}：registry 上已存在`);
      continue;
    }
    log(`发布 ${pkg.name}@${pkg.version}（--tag ${tag}）`);
    run('pnpm', ['publish', '--access', 'public', '--tag', tag], { cwd: dir });
    published++;
  }
  log(published ? `✓ 本次发布 ${published} 个包` : '✓ 所有包都已在 registry 上，无需发布');
}

// ---------------------------------------------------------------- main

const cmd = args.shift();
if (cmd === 'version') {
  const root = path.resolve(flag('--root') ?? REPO);
  version(root, args[0]);
} else if (cmd === 'pack') pack();
else if (cmd === 'smoke') await smoke();
else if (cmd === 'publish') await publish(flag('--tag') ?? 'beta');
else die('用法：node scripts/release.mjs version <版本> | pack | smoke [--keep] | publish [--tag beta]');
