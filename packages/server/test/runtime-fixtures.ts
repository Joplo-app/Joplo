/** 导出组件测试的替身：托管运行时、项目里的 playwright、npm / playwright install、项目文件快照。 */
import fs from 'node:fs';
import path from 'node:path';
import { JoploError } from '@joplo-app/core';
import { PLAYWRIGHT_VERSION, runtimePaths, type CommandRunner } from '../src/export-runtime.ts';

export type RunCall = { cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv };

/** 一个已就绪的托管运行时（入口是替身模块）。 */
export function fakeManaged(h: string, tag = 'managed') {
  const p = runtimePaths(h);
  fs.mkdirSync(path.dirname(p.entry), { recursive: true });
  fs.writeFileSync(p.entry, `export const chromium = { tag: ${JSON.stringify(tag)}, launch: async (o) => globalThis.__joploFakeLaunch(${JSON.stringify(tag)}, o) };\n`);
  fs.writeFileSync(p.cli, '');
  fs.writeFileSync(p.marker, JSON.stringify({ version: PLAYWRIGHT_VERSION, installedAt: new Date().toISOString() }));
  return p;
}

/** 项目里已有的 playwright（老项目，CommonJS 替身）。 */
export function fakeProjectPlaywright(dir: string, name = 'playwright') {
  const d = path.join(dir, 'node_modules', name);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name, version: '1.50.0', main: 'index.js' }));
  fs.writeFileSync(path.join(d, 'index.js'), `module.exports = { chromium: { tag: 'project', launch: async (o) => globalThis.__joploFakeLaunch('project', o) } };\n`);
}

/** 项目里与依赖有关的文件快照（不变量 ①）。 */
export function projectSnapshot(dir: string): string {
  const out: string[] = [];
  const walk = (p: string) => {
    if (!fs.existsSync(p)) return;
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) out.push(`${path.relative(dir,p)}:symlink:${fs.readlinkSync(p)}`);
    else if (st.isDirectory()) for (const n of fs.readdirSync(p).sort()) walk(path.join(p, n));
    else out.push(`${path.relative(dir, p)}:${fs.readFileSync(p, 'utf8')}`);
  };
  for (const f of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'node_modules']) walk(path.join(dir, f));
  return out.join('\n');
}

/** 替身 npm / playwright install：记录命令，按真实工具的方式在 cwd 下写文件、打印进度。 */
export function fakeRunner(calls: RunCall[], o: { failBrowser?: boolean; gate?: Promise<void> } = {}): CommandRunner {
  return async (cmd, args, opt) => {
    calls.push({ cmd, args, cwd: opt.cwd, env: opt.env });
    if (cmd === 'npm') {
      const prefix = args[args.indexOf('--prefix') + 1]!;
      const d = path.join(prefix, 'node_modules/playwright-core');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'cli.js'), '');
      fs.writeFileSync(path.join(d, 'index.mjs'), 'export const chromium = { tag: "installed" };\n');
      return;
    }
    await o.gate;
    if (o.failBrowser) throw new JoploError('EXPORT_FAILED', 'download failed: ECONNRESET');
    opt.onLine('Downloading Chrome Headless Shell 156.0.8078.4 (playwright chromium-headless-shell v1248) from https://cdn.playwright.dev/x.zip');
    for (const pct of [0, 10, 50, 100]) opt.onLine(`|■■■■■■■■| ${String(pct).padStart(3)}% of 95.3 MiB`);
    opt.onLine('Downloading FFmpeg (playwright ffmpeg v1013) from https://cdn.playwright.dev/ffmpeg.zip');
    for (const pct of [0, 100]) opt.onLine(`|■■■■■■■■| ${String(pct).padStart(3)}% of 1.2 MiB`);
    fs.mkdirSync(path.join(opt.env.PLAYWRIGHT_BROWSERS_PATH!, 'chromium_headless_shell-1248'), { recursive: true });
  };
}


/** 替身 chromium.launch 用的浏览器：记录是哪一个来源启动的，截图返回固定字节。 */
export function installFakeLaunch(): { tags: string[] } {
  const rec = { tags: [] as string[] };
  (globalThis as { __joploFakeLaunch?: unknown }).__joploFakeLaunch = async (tag: string) => {
    rec.tags.push(tag);
    const page = {
      goto: async () => undefined,
      waitForFunction: async () => undefined,
      evaluate: async (arg: unknown) => (typeof arg === 'string' ? { elements: [], warnings: [] } : null),
      locator: () => ({ boundingBox: async () => ({ x: 0, y: 0, width: 1280, height: 800 }), screenshot: async () => Buffer.from(`png:${tag}`) }),
      screenshot: async () => Buffer.from(`png:${tag}`),
    };
    return { newPage: async () => page, close: async () => undefined };
  };
  return rec;
}
