/**
 * 导出组件（D66）：图片 / 视频导出、`joplo render` 截图、`joplo share` 预览图用到的 Playwright + Chromium，
 * 由 Joplo 自己装在 `<JOPLO_HOME>/runtime/playwright-<版本>/`，绝不写用户项目的 package.json、lockfile 或 node_modules。
 *
 * 目录（runtimePaths）：
 * - `node_modules/playwright-core/`：`npm install` 的 cwd 与 --prefix 都是这个目录（不是项目）；
 * - `browsers/`：`PLAYWRIGHT_BROWSERS_PATH`，只装 Chromium headless shell（+ 录视频用的 ffmpeg）；
 * - `ready.json`：最后一步写入；只有它在、版本一致、入口存在才算“已就绪”（中途失败的目录不算）。
 * - `<runtime>/playwright-<版本>.lock`：安装锁（内容是 pid），CLI 与看板进程不会同时安装；持锁进程已退出时视为过期。
 *
 * 解析顺序（resolvePlaywright）：托管运行时 → 项目里已有的 playwright / playwright-core / @playwright/test（兼容老项目，
 * 只读取、不安装）→ 都没有时抛 EXPORT_COMPONENT_MISSING（带安装命令）。任何解析都不会触发下载；只有 installExportRuntime 下载，
 * 而它只由 `joplo setup export`、交互终端里用户确认后的 render、本机看板的已授权安装请求调用。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JoploError } from '@joplo-app/core';
import { joploHome, pidAlive } from './home.ts';

export type PlaywrightModule = typeof import('playwright-core');

/** 固定版本：与 server 的 devDependencies.playwright-core 一致（测试校验）。 */
export const PLAYWRIGHT_VERSION: string = '1.64.1';
/** 下载量估计（MB，十进制）：playwright-core 包 + Chromium headless shell + ffmpeg（macOS arm64 实测，见 D66）。 */
export const EXPORT_DOWNLOAD_MB: number = 100;
export const SETUP_COMMAND: string = 'npx joplo setup export';
export const NOT_NEEDED = 'Writing demos, dev, check, build, and share do not need it.';

export type RuntimePaths = { root: string; dir: string; browsers: string; marker: string; lock: string; entry: string; cli: string };

export function runtimePaths(home: string = joploHome()): RuntimePaths {
  const root = path.join(home, 'runtime');
  const dir = path.join(root, `playwright-${PLAYWRIGHT_VERSION}`);
  return {
    root,
    dir,
    browsers: path.join(dir, 'browsers'),
    marker: path.join(dir, 'ready.json'),
    lock: path.join(root, `playwright-${PLAYWRIGHT_VERSION}.lock`),
    entry: path.join(dir, 'node_modules/playwright-core/index.mjs'),
    cli: path.join(dir, 'node_modules/playwright-core/cli.js'),
  };
}

type Marker = { version: string; installedAt: string };

function readMarker(p: RuntimePaths): Marker | null {
  try {
    const v = JSON.parse(fs.readFileSync(p.marker, 'utf8')) as Marker;
    return v && v.version === PLAYWRIGHT_VERSION && typeof v.installedAt === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** 托管运行时是否已就绪（ready.json 版本一致、入口存在）。 */
export function managedReady(home?: string): boolean {
  const p = runtimePaths(home);
  return !!readMarker(p) && fs.existsSync(p.entry);
}

const PROJECT_PACKAGES = ['playwright', 'playwright-core', '@playwright/test'] as const;

/** 项目里已有的 Playwright（从项目目录按 Node 的解析顺序找；只读取，不安装）。 */
export function projectPlaywright(projectDir: string | undefined): { name: string; file: string } | null {
  if (!projectDir) return null;
  // 只沿项目目录向上找 node_modules/<包>（不走 NODE_PATH 等全局路径：pnpm 的 bin 包装会设置 NODE_PATH）
  let cur = path.resolve(projectDir);
  for (;;) {
    for (const name of PROJECT_PACKAGES) {
      if (!fs.existsSync(path.join(cur, 'node_modules', name, 'package.json'))) continue;
      try {
        return { name, file: createRequire(path.join(cur, '__joplo_resolve__.js')).resolve(name) };
      } catch {
        // 包不完整：继续找
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

/** 正在安装的进程（锁里的 pid 仍存活）；没有时为 null。 */
export function installingPid(home?: string): number | null {
  try {
    const pid = Number(fs.readFileSync(runtimePaths(home).lock, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 && pidAlive(pid) ? pid : null;
  } catch {
    return null;
  }
}

export type ExportRuntimeStatus = {
  /** 能导出：托管运行时已就绪，或项目里已有 Playwright。 */
  ready: boolean;
  source: 'managed' | 'project' | null;
  version: string;
  dir: string;
  downloadMB: number;
  installingPid: number | null;
  command: string;
};

export function exportRuntimeStatus(o: { home?: string; projectDir?: string } = {}): ExportRuntimeStatus {
  const p = runtimePaths(o.home);
  const source = managedReady(o.home) ? 'managed' : projectPlaywright(o.projectDir) ? 'project' : null;
  return { ready: source !== null, source, version: PLAYWRIGHT_VERSION, dir: p.dir, downloadMB: EXPORT_DOWNLOAD_MB, installingPid: installingPid(o.home), command: SETUP_COMMAND };
}

export function missingError(): JoploError {
  return new JoploError(
    'EXPORT_COMPONENT_MISSING',
    `Exporting images and video needs the Joplo export component (Playwright ${PLAYWRIGHT_VERSION} + Chromium, about ${EXPORT_DOWNLOAD_MB} MB download, kept in the Joplo home directory, not in your project), which is not installed. Run: ${SETUP_COMMAND}. ${NOT_NEEDED}`,
    { details: { command: SETUP_COMMAND, downloadMB: EXPORT_DOWNLOAD_MB } },
  );
}

const normalize = (m: unknown): PlaywrightModule | null => {
  const x = m as { chromium?: unknown; default?: { chromium?: unknown } } | null;
  if (x && x.chromium) return x as PlaywrightModule;
  if (x?.default?.chromium) return x.default as PlaywrightModule;
  return null;
};

export type LoadOptions = {
  home?: string;
  projectDir?: string;
  /** 测试注入：载入一个模块文件（缺省 import(file URL)）。 */
  importFile?: (file: string) => Promise<unknown>;
};

/**
 * 解析 Playwright：托管运行时优先，其次项目里已有的；都没有时抛 EXPORT_COMPONENT_MISSING。
 * 托管运行时载入前把 PLAYWRIGHT_BROWSERS_PATH 指向它自己的 browsers/（playwright-core 在初始化时读取）。
 */
export async function resolvePlaywright(o: LoadOptions = {}): Promise<{ source: 'managed' | 'project'; module: PlaywrightModule }> {
  const load = o.importFile ?? ((file: string) => import(pathToFileURL(file).href));
  const p = runtimePaths(o.home);
  if (managedReady(o.home)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = p.browsers;
    const m = normalize(await load(p.entry));
    if (!m) throw new JoploError('RENDER_FAILED', `The Joplo export component at ${p.dir} is damaged. Run: ${SETUP_COMMAND} --force`);
    return { source: 'managed', module: m };
  }
  const found = projectPlaywright(o.projectDir);
  if (found) {
    const m = normalize(await load(found.file));
    if (m) return { source: 'project', module: m };
  }
  throw missingError();
}

export async function loadPlaywright(o: LoadOptions = {}): Promise<PlaywrightModule> {
  return (await resolvePlaywright(o)).module;
}

// ---------- 安装与卸载 ----------

export type InstallPhase = 'package' | 'browser' | 'verify' | 'done';
export type InstallProgress = { phase: InstallPhase; /** 0–100（整体）。 */ percent: number; /** 正在下载的文件大小（MiB），playwright 报告后才有。 */ totalMB: number | null; message: string };

export type CommandRunner = (cmd: string, args: string[], o: { cwd: string; env: NodeJS.ProcessEnv; onLine: (line: string) => void; signal?: AbortSignal }) => Promise<void>;

export type InstallDeps = {
  run: CommandRunner;
  /** 装好后的自检：能载入、能启动 Chromium。 */
  verify: (p: RuntimePaths) => Promise<void>;
};

const lastLines = (lines: string[]) => lines.slice(-6).join(' | ').slice(0, 600);

/** 缺省的命令执行：stdout / stderr 按行回调；非 0 退出时抛错（带最后几行输出）。 */
export const runCommand: CommandRunner = (cmd, args, o) =>
  new Promise((resolve, reject) => {
    // Windows 上 npm 是 npm.cmd，只能经 shell 启动：带空格的参数（例如用户目录）要加引号
    const viaShell = process.platform === 'win32' && cmd === 'npm';
    const argv = viaShell ? args.map((a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a)) : args;
    const child = spawn(viaShell ? 'npm.cmd' : cmd, argv, { cwd: o.cwd, env: o.env, stdio: ['ignore', 'pipe', 'pipe'], shell: viaShell, windowsHide: true });
    const tail: string[] = [];
    let buf = '';
    const feed = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let i: number;
      while ((i = buf.search(/[\r\n]/)) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        tail.push(line);
        if (tail.length > 20) tail.shift();
        o.onLine(line);
      }
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    const onAbort = () => child.kill();
    o.signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (e) => {
      o.signal?.removeEventListener('abort', onAbort);
      reject((e as NodeJS.ErrnoException).code === 'ENOENT' ? new JoploError('EXPORT_FAILED', `${cmd} was not found; installing the export component needs ${cmd === 'npm' ? 'npm (it ships with Node.js)' : cmd}`) : e);
    });
    child.on('close', (code, sig) => {
      o.signal?.removeEventListener('abort', onAbort);
      if (o.signal?.aborted) return reject(new JoploError('EXPORT_FAILED', 'Installation was cancelled'));
      if (code === 0) return resolve();
      reject(new JoploError('EXPORT_FAILED', `${path.basename(cmd)} ${args[0] ?? ''} failed (${sig ?? `exit ${code}`}): ${lastLines(tail) || 'no output'}`));
    });
  });

/** 缺省的自检：以托管方式载入并启动一次 Chromium。 */
async function defaultVerify(p: RuntimePaths): Promise<void> {
  process.env.PLAYWRIGHT_BROWSERS_PATH = p.browsers;
  const m = normalize(await import(pathToFileURL(p.entry).href));
  if (!m) throw new JoploError('EXPORT_FAILED', 'The installed playwright-core does not provide chromium');
  const browser = await m.chromium.launch({ headless: true }).catch((e: unknown) => {
    throw new JoploError('EXPORT_FAILED', `Chromium was downloaded but failed to start: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  });
  await browser.close();
}

/** 取得安装锁；已有存活进程在安装时报错。返回释放函数。 */
function acquireLock(p: RuntimePaths): () => void {
  fs.mkdirSync(p.root, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(p.lock, String(process.pid), { flag: 'wx' });
      return () => {
        try {
          if (fs.readFileSync(p.lock, 'utf8').trim() === String(process.pid)) fs.rmSync(p.lock, { force: true });
        } catch {
          // 忽略
        }
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const pid = Number(fs.readFileSync(p.lock, 'utf8').trim());
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && pidAlive(pid)) throw new JoploError('UNSUPPORTED_ACTION', `Another Joplo process (pid ${pid}) is installing the export component; wait for it to finish`);
      fs.rmSync(p.lock, { force: true }); // 过期的锁
    }
  }
  throw new JoploError('UNSUPPORTED_ACTION', 'Could not acquire the export component install lock');
}

/** 安装命令只能在运行时目录里运行（不变量：绝不在项目目录里执行 npm）。 */
function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  // npx 父进程可能带着全局 / 工作区配置，避免 npm 把包装到别处
  for (const k of Object.keys(env)) if (/^npm_config_(global|location|prefix|workspaces?|include_workspace_root|save.*)$/i.test(k)) delete env[k];
  return env;
}

export type InstallResult = { alreadyInstalled: boolean; dir: string; version: string; removedOld: string[] };

/**
 * 安装托管运行时：npm 装 playwright-core（cwd 与 --prefix 都是运行时目录）→ playwright-core 的 CLI 下载 Chromium headless shell
 * 到运行时的 browsers/ → 自检 → 写 ready.json → 删掉旧版本的运行时目录。已就绪且没有 force 时直接返回。
 */
export async function installExportRuntime(o: { home?: string; force?: boolean; onProgress?: (p: InstallProgress) => void; signal?: AbortSignal; deps?: Partial<InstallDeps> } = {}): Promise<InstallResult> {
  const p = runtimePaths(o.home);
  if (!o.force && managedReady(o.home)) return { alreadyInstalled: true, dir: p.dir, version: PLAYWRIGHT_VERSION, removedOld: [] };
  const run = o.deps?.run ?? runCommand;
  const verify = o.deps?.verify ?? defaultVerify;
  const progress = (x: InstallProgress) => o.onProgress?.(x);
  const release = acquireLock(p);
  try {
    if (o.force) fs.rmSync(p.dir, { recursive: true, force: true });
    fs.rmSync(p.marker, { force: true });
    fs.mkdirSync(p.dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(p.dir, 'package.json'), JSON.stringify({ name: 'joplo-export-runtime', private: true, description: `Managed by Joplo. Remove with: ${SETUP_COMMAND} --uninstall` }, null, 2) + '\n');

    progress({ phase: 'package', percent: 1, totalMB: null, message: `Installing playwright-core ${PLAYWRIGHT_VERSION}` });
    await run('npm', ['install', `playwright-core@${PLAYWRIGHT_VERSION}`, '--prefix', p.dir, '--no-global', '--no-save', '--no-package-lock', '--no-audit', '--no-fund', '--ignore-scripts', '--loglevel=error'], { cwd: p.dir, env: childEnv({}), onLine: () => undefined, signal: o.signal });
    if (!fs.existsSync(p.cli)) throw new JoploError('EXPORT_FAILED', `npm finished, but ${p.cli} is missing`);

    // 浏览器：只装 headless shell（截图与录视频都用无头模式）；ffmpeg 由 playwright 一起装
    let segment = 0;
    let title = 'Chromium';
    let totalMB: number | null = null;
    progress({ phase: 'browser', percent: 5, totalMB, message: 'Downloading Chromium' });
    await run(process.execPath, [p.cli, 'install', '--only-shell', 'chromium'], {
      cwd: p.dir,
      env: childEnv({ PLAYWRIGHT_BROWSERS_PATH: p.browsers }),
      signal: o.signal,
      onLine: (line) => {
        const d = /^Downloading (.+?)(?:\s+from\s|\s*$)/.exec(line);
        if (d) {
          segment++;
          // 之后的小文件（ffmpeg）算作 Chromium 的一部分：标题和大小保持第一个下载的
          if (segment === 1) title = d[1]!.replace(/\s*\(playwright.*$/i, '').trim();
          return;
        }
        const m = /(\d+)% of ([\d.]+) MiB/.exec(line);
        if (!m) return;
        const pct = Math.min(100, Number(m[1]));
        if (segment <= 1) totalMB = Number(m[2]);
        // 第一个下载（Chromium，绝大部分体积）占 5–90，之后的小文件（ffmpeg）占 90–95
        const overall = segment <= 1 ? 5 + pct * 0.85 : 90 + pct * 0.05;
        progress({ phase: 'browser', percent: Math.round(overall), totalMB, message: `Downloading ${title}` });
      },
    });

    progress({ phase: 'verify', percent: 96, totalMB: null, message: 'Checking that Chromium starts' });
    await verify(p);
    fs.writeFileSync(p.marker, JSON.stringify({ version: PLAYWRIGHT_VERSION, installedAt: new Date().toISOString() } satisfies Marker, null, 2) + '\n');

    // 旧版本的运行时（升级 Joplo 后 Playwright 版本变了）不再使用
    const removedOld: string[] = [];
    for (const name of fs.readdirSync(p.root)) {
      const full = path.join(p.root, name);
      if (full === p.dir || !/^playwright-[\w.-]+$/.test(name) || !fs.statSync(full).isDirectory()) continue;
      fs.rmSync(full, { recursive: true, force: true });
      removedOld.push(name);
    }
    progress({ phase: 'done', percent: 100, totalMB: null, message: 'Export component is ready' });
    return { alreadyInstalled: false, dir: p.dir, version: PLAYWRIGHT_VERSION, removedOld };
  } finally {
    release();
  }
}

/** 删除托管运行时（所有版本）；有进程正在安装时报错。只动 `<JOPLO_HOME>/runtime/playwright-*`。 */
export function uninstallExportRuntime(o: { home?: string } = {}): { removed: string[] } {
  const p = runtimePaths(o.home);
  const pid = installingPid(o.home);
  if (pid !== null && pid !== process.pid) throw new JoploError('UNSUPPORTED_ACTION', `Another Joplo process (pid ${pid}) is installing the export component; wait for it to finish`);
  const removed: string[] = [];
  let names: string[] = [];
  try {
    names = fs.readdirSync(p.root);
  } catch {
    return { removed };
  }
  for (const name of names) {
    if (!/^playwright-[\w.-]+$/.test(name) || name.endsWith('.lock')) continue;
    fs.rmSync(path.join(p.root, name), { recursive: true, force: true });
    removed.push(name);
  }
  if (process.env.PLAYWRIGHT_BROWSERS_PATH === p.browsers) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  return { removed };
}
