/**
 * 看板与发布站资源在哪里（D36）。两种形态：
 *
 * - source：在仓库里从 TS 源码运行（`pnpm joplo …`、测试）。Vite 直接编译 packages/web/src，界面本身也能热更新。
 * - dist：从 npm 安装的包运行。资源是 @tokenroll/joplo-web 发包前预构建的 dist/（见 packages/web/scripts/build-dist.mjs），
 *   运行时不读取 packages/web/src。作者的 className 用 dist/project.css 现场编译（Tailwind，@source 指向项目目录）。
 *
 * 选择规则：本文件以 .ts 运行且 packages/web/src 存在 → source；否则 dist。`JOPLO_WEB=dist` 可在仓库里强制 dist
 * （用于验证预构建产物）。
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Alias } from 'vite';
import { JoploError } from '@tokenroll/joplo-core';

export type SourceWeb = { mode: 'source'; webDir: string; indexCss: string; kitSrc: string };
export type DistWeb = {
  mode: 'dist';
  webDir: string;
  /** 看板 index.html 与发布站 site.html 所在目录（Vite 开发服务的 root）。 */
  appDir: string;
  /** 发布站需要复制的文件（相对 appDir）。 */
  siteFiles: string[];
  /** 作者 className 的 Tailwind 入口。 */
  projectCss: string;
  version: string;
};
export type WebAssets = SourceWeb | DistWeb;

const require = createRequire(import.meta.url);
const FROM_SOURCE = import.meta.filename.endsWith('.ts');
const REPO_WEB = path.resolve(import.meta.dirname, '../../web');
const REPO_KIT = path.resolve(import.meta.dirname, '../../kit/src');

const broken = (webDir: string, what: string) =>
  new JoploError('NOT_FOUND', `@tokenroll/joplo-web（${webDir}）缺少预构建资源：${what}。请重新安装 joplo（npm install），或在 Joplo 仓库里运行 pnpm --filter @tokenroll/joplo-web build`);

/** 读取并校验 @tokenroll/joplo-web 的 dist/manifest.json。 */
export function readWebDist(webDir: string): DistWeb {
  const dist = path.join(webDir, 'dist');
  const manifestFile = path.join(dist, 'manifest.json');
  let manifest: { version?: unknown; format?: unknown; board?: unknown; site?: unknown; siteFiles?: unknown; projectCss?: unknown };
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch {
    throw broken(webDir, 'dist/manifest.json');
  }
  if (manifest.format !== 1) throw broken(webDir, `不认识的清单格式 ${String(manifest.format)}`);
  const inside = (rel: unknown, label: string) => {
    if (typeof rel !== 'string' || !rel) throw broken(webDir, label);
    const abs = path.resolve(dist, rel);
    if (abs !== dist && !abs.startsWith(dist + path.sep)) throw broken(webDir, `${label} 越出了 dist/`);
    if (!fs.existsSync(abs)) throw broken(webDir, `dist/${rel}`);
    return abs;
  };
  const board = inside(manifest.board, 'board');
  inside(manifest.site, 'site');
  const projectCss = inside(manifest.projectCss, 'projectCss');
  const appDir = path.dirname(board);
  let siteFiles: unknown;
  try {
    siteFiles = JSON.parse(fs.readFileSync(inside(manifest.siteFiles, 'siteFiles'), 'utf8'));
  } catch (e) {
    if (e instanceof JoploError) throw e;
    throw broken(webDir, 'site-files.json 不是合法 JSON');
  }
  if (!Array.isArray(siteFiles) || !siteFiles.every((f) => typeof f === 'string' && f && !path.isAbsolute(f) && !f.split(/[\\/]/).includes('..')))
    throw broken(webDir, 'site-files.json 应为 appDir 内的相对路径列表');
  return { mode: 'dist', webDir, appDir, siteFiles, projectCss, version: typeof manifest.version === 'string' ? manifest.version : '' };
}

let cached: WebAssets | null = null;
/** 看板与发布站资源。结果按进程缓存（env 只在首次调用时生效；测试可传入 env 绕过缓存）。 */
export function locateWebAssets(env?: Record<string, string | undefined>): WebAssets {
  if (!env && cached) return cached;
  const e = env ?? process.env;
  let out: WebAssets;
  if (FROM_SOURCE && e.JOPLO_WEB !== 'dist' && fs.existsSync(path.join(REPO_WEB, 'src/main.tsx')))
    out = { mode: 'source', webDir: REPO_WEB, indexCss: path.join(REPO_WEB, 'src/index.css'), kitSrc: REPO_KIT };
  else {
    let pkg: string;
    try {
      pkg = require.resolve('@tokenroll/joplo-web/package.json');
    } catch {
      throw new JoploError('NOT_FOUND', '找不到 @tokenroll/joplo-web（看板与发布站资源）。请重新安装 joplo（npm install）');
    }
    out = readWebDist(path.dirname(fs.realpathSync(pkg)));
  }
  if (!env) cached = out;
  return out;
}

/** 作者 className 的 CSS 入口（source：packages/web/src/index.css；dist：@tokenroll/joplo-web/dist/project.css）。 */
export const cssEntry = (web: WebAssets) => (web.mode === 'source' ? web.indexCss : web.projectCss);

/** Tailwind 的 index.css，从 server 自己的依赖解析（pnpm 严格布局下 @tokenroll/joplo-web 没有 tailwindcss 依赖）。 */
export function tailwindIndexCss(): string {
  return require.resolve('tailwindcss/index.css');
}

/** 从 dir 起向上找 node_modules/<name>/package.json（与 Node 的包解析顺序一致，不依赖 exports）。 */
export function findPackageJson(dir: string, name: string): string | null {
  let cur = path.resolve(dir);
  for (;;) {
    const f = path.join(cur, 'node_modules', name, 'package.json');
    if (fs.existsSync(f)) return f;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

const KIT_SUBPATHS = ['ui', 'node', 'jsx-runtime', 'jsx-dev-runtime'] as const;

/**
 * 项目源文件里的 `@tokenroll/joplo-kit` 怎样解析：
 * - source：指向仓库里的 kit 源码（项目可在任意目录，不需要自己的 node_modules）；`@/` 指向 web 源码。
 * - dist：项目装了 @tokenroll/joplo-kit 就按项目依赖解析（与 `joplo check` 用的 tsx 一致）；没装则退回 CLI 自带的 kit。
 */
export function kitAliases(web: WebAssets, projectDir: string): Alias[] {
  if (web.mode === 'source')
    return [
      { find: /^@tokenroll\/joplo-kit$/, replacement: path.join(web.kitSrc, 'index.ts') },
      { find: /^@tokenroll\/joplo-kit\/(ui|node|jsx-runtime|jsx-dev-runtime)$/, replacement: path.join(web.kitSrc, '$1.ts') },
      { find: /^@\//, replacement: path.join(web.webDir, 'src') + '/' },
    ];
  if (findPackageJson(projectDir, '@tokenroll/joplo-kit')) return [];
  const main = fileURLToPath(import.meta.resolve('@tokenroll/joplo-kit'));
  const sub = fileURLToPath(import.meta.resolve(`@tokenroll/joplo-kit/${KIT_SUBPATHS[0]}`));
  if (path.dirname(main) !== path.dirname(sub)) throw new JoploError('NOT_FOUND', `@tokenroll/joplo-kit 的入口不在同一目录：${main}、${sub}`);
  const ext = path.extname(main);
  return [
    { find: /^@tokenroll\/joplo-kit$/, replacement: main },
    { find: /^@tokenroll\/joplo-kit\/(ui|node|jsx-runtime|jsx-dev-runtime)$/, replacement: path.join(path.dirname(main), `$1${ext}`) },
  ];
}
