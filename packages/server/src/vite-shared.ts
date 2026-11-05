/**
 * dev / build / render 共用的 Vite 配置片段。
 *
 * - 看板与发布站的界面源码在 packages/web（Vite root）。
 * - 项目源文件（作者的 TSX）只在服务端经 ssrLoadModule 载入：用 automatic JSX、
 *   jsxImportSource '@joplo-app/kit'、development=true 转译，jsxDEV 因此拿到 文件:行:列。
 * - Tailwind 需要编译项目源文件里出现的 className：把项目目录追加为 index.css 的 @source。
 */
import fs from 'node:fs';
import path from 'node:path';
import { transformWithOxc, type Plugin } from 'vite';
import { cssEntry, locateWebAssets, tailwindIndexCss, type WebAssets } from './web-assets.ts';

export { kitAliases, locateWebAssets } from './web-assets.ts';

/** 项目目录统一用真实路径（macOS 的 /tmp → /private/tmp），保证 jsxDEV 与调用栈给出的路径能被 relSource 转成相对路径。 */
export function realProjectDir(dir: string): string {
  const abs = path.resolve(dir);
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs;
  }
}

/** 不参与编译的项目子目录。 */
export const IGNORED_DIRS = ['.joplo', 'dist', 'node_modules', '.git'];

export function isProjectSource(projectDir: string, file: string): boolean {
  if (!file.startsWith(projectDir + path.sep)) return false;
  const rel = file.slice(projectDir.length + 1);
  const first = rel.split(path.sep)[0] ?? '';
  return !IGNORED_DIRS.includes(first);
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

/** 语法错误的位置：从转译器报错里取 `文件:行:列`。 */
export type SourceLoc = { file: string; line: number; column: number };
export class ProjectSyntaxError extends Error {
  readonly loc: SourceLoc;
  constructor(message: string, loc: SourceLoc) {
    super(message);
    this.name = 'ProjectSyntaxError';
    this.loc = loc;
  }
}

export function parseErrorLoc(message: string, file: string): { line: number; column: number } | null {
  const text = stripAnsi(message);
  const base = path.basename(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`${base}:(\\d+):(\\d+)`).exec(text) ?? /:(\d+):(\d+)/.exec(text);
  return m ? { line: Number(m[1]), column: Number(m[2]) } : null;
}

/** 作者 className 的 CSS 入口：追加每个项目目录为 Tailwind @source（看板进程同时服务多个项目）。 */
export function cssSourcePlugin(dirs: () => string[], web: WebAssets = locateWebAssets()): Plugin {
  const entry = cssEntry(web);
  return {
    name: 'joplo:css-sources',
    enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] !== entry) return;
      const css = web.mode === 'dist' ? code.replace(/@import\s+["']tailwindcss["']/, `@import ${JSON.stringify(tailwindIndexCss())}`) : code;
      return { code: `${css}\n${dirs().map((d) => `@source ${JSON.stringify(d)};`).join('\n')}\n`, map: null };
    },
  };
}

/**
 * 转译项目源文件（TSX → 收集数据的 JS）；把 Tailwind @source 指向项目目录。
 * dist 形态下 CSS 入口是 @joplo-app/web/dist/project.css，其中的 `@import "tailwindcss"` 改为从 server 的依赖解析。
 */
export function joploProjectPlugin(projectDir: string, web: WebAssets = locateWebAssets()): Plugin {
  const entry = cssEntry(web);
  return {
    name: 'joplo:project',
    enforce: 'pre',
    async transform(code, id) {
      const file = id.split('?')[0]!;
      if (file === entry) {
        // Tailwind v4：@source 绝对路径；JSON.stringify 负责转义引号与反斜杠
        const css = web.mode === 'dist' ? code.replace(/@import\s+["']tailwindcss["']/, `@import ${JSON.stringify(tailwindIndexCss())}`) : code;
        return { code: `${css}\n@source ${JSON.stringify(projectDir)};\n`, map: null };
      }
      if (!isProjectSource(projectDir, file) || !/\.(tsx|ts|jsx|js|mts)$/.test(file)) return;
      const lang = file.endsWith('.tsx') ? 'tsx' : file.endsWith('.jsx') ? 'jsx' : file.endsWith('.js') ? 'js' : 'ts';
      try {
        const r = await transformWithOxc(code, file, {
          lang,
          jsx: { runtime: 'automatic', importSource: '@joplo-app/kit', development: true },
          sourcemap: true,
        });
        return { code: r.code, map: r.map ?? null };
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        const errs = (e as { errors?: { message?: string }[] }).errors;
        const first = stripAnsi(errs?.[0]?.message ?? raw);
        const loc = parseErrorLoc(first, file) ?? { line: 1, column: 1 };
        const rel = path.relative(projectDir, file).split(path.sep).join('/');
        const brief = (first.split('\n')[0] ?? '').replace(/^\s*\[[A-Z_]+\]\s*/, '').trim();
        throw new ProjectSyntaxError(`${rel}:${loc.line}:${loc.column} 语法错误：${brief || '无法解析'}`, { file, ...loc });
      }
    },
  };
}
