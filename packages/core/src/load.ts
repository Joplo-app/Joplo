/**
 * 加载项目文件夹（Node 端）：按约定发现源文件，通过注入的 importer 载入其默认导出。
 * CLI 用 tsx 的 tsImport，`joplo dev` 用 Vite 的 ssrLoadModule；两者产出相同的 AuthoringProject。
 *
 *   joplo.config.ts
 *   layouts/<id>.tsx
 *   routes/**\/page.tsx              routes/page.tsx → /，routes/members/page.tsx → /members
 *   features/<f>/feature.ts
 *   features/<f>/options/<o>.tsx
 *   themes/<name>.css               作者主题（D51），按原文读取
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { AuthoringProject } from './compile.ts';
import type { Diagnostic } from './result.ts';

export type Importer = (absPath: string) => Promise<Record<string, unknown>>;

const EXT = ['.tsx', '.ts'];
const findFile = (base: string): string | null => EXT.map((e) => base + e).find((f) => existsSync(f)) ?? null;
const list = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).sort() : []);
const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();
const stem = (f: string) => f.replace(/\.(tsx|ts)$/, '');

/** 返回所有参与编译的源文件（用于 dev 监听与缓存失效）。 */
export function discoverFiles(root: string): string[] {
  const r = resolve(root);
  const files: string[] = [];
  const cfg = findFile(join(r, 'joplo.config'));
  if (cfg) files.push(cfg);
  for (const f of list(join(r, 'layouts'))) if (/\.(tsx|ts)$/.test(f)) files.push(join(r, 'layouts', f));
  const walk = (d: string) => {
    for (const f of list(d)) {
      const p = join(d, f);
      if (isDir(p)) walk(p);
      else if (/^page\.(tsx|ts)$/.test(f)) files.push(p);
    }
  };
  walk(join(r, 'routes'));
  for (const fid of list(join(r, 'features'))) {
    const fd = join(r, 'features', fid);
    if (!isDir(fd)) continue;
    const ff = findFile(join(fd, 'feature'));
    if (ff) files.push(ff);
    for (const o of list(join(fd, 'options'))) if (/\.(tsx|ts)$/.test(o)) files.push(join(fd, 'options', o));
  }
  for (const f of list(join(r, 'themes'))) if (/\.css$/.test(f)) files.push(join(r, 'themes', f));
  return files;
}

/** 作者主题：themes/<name>.css（文件名就是主题名）。 */
export function loadThemes(root: string): Record<string, string> {
  const r = resolve(root);
  const out: Record<string, string> = {};
  for (const f of list(join(r, 'themes'))) {
    const m = /^([A-Za-z][\w-]*)\.css$/.exec(f);
    if (m) out[m[1]!] = readFileSync(join(r, 'themes', f), 'utf8');
  }
  return out;
}

export async function loadAuthoring(root: string, importer: Importer): Promise<{ authoring: AuthoringProject | null; diagnostics: Diagnostic[] }> {
  // 步骤和规则的源位置来自调用栈；开启原生 source map，保证行号指向 TSX 源码而不是转译产物。
  process.setSourceMapsEnabled?.(true);
  const r = resolve(root);
  const diags: Diagnostic[] = [];
  const relp = (p: string) => relative(r, p).split(sep).join('/');
  const fail = (file: string, message: string, code = 'LOAD_FAILED') => diags.push({ severity: 'error', code, message, source: 'schema', at: `${relp(file)}:1:1` });

  const load = async (file: string, kind: string): Promise<any | null> => {
    try {
      const mod = await importer(file);
      const v = (mod.default ?? null) as { kind?: string } | null;
      if (!v || v.kind !== kind) {
        fail(file, `默认导出应为 ${kind}(...)，实际为 ${v?.kind ?? typeof v}`, 'WRONG_EXPORT');
        return null;
      }
      return { ...v, file: relp(file) };
    } catch (e) {
      fail(file, `载入失败：${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };

  const cfgFile = findFile(join(r, 'joplo.config'));
  if (!cfgFile) {
    diags.push({ severity: 'error', code: 'NOT_A_PROJECT', message: '缺少 joplo.config.ts', source: 'schema', at: 'joplo.config.ts:1:1' });
    return { authoring: null, diagnostics: diags };
  }
  const config = await load(cfgFile, 'config');

  const layouts: AuthoringProject['layouts'] = {};
  for (const f of list(join(r, 'layouts'))) {
    if (!/\.(tsx|ts)$/.test(f)) continue;
    const v = await load(join(r, 'layouts', f), 'layout');
    if (v) layouts[stem(f)] = v;
  }

  const routes: AuthoringProject['routes'] = {};
  const walk = async (d: string, prefix: string) => {
    for (const f of list(d)) {
      const p = join(d, f);
      if (isDir(p)) {
        if (/[\[\]]/.test(f)) fail(p, `暂不支持动态路径段「${f}」；请用具体路径，例如 /members/li-lei`, 'UNSUPPORTED_ROUTE');
        else await walk(p, `${prefix}/${f}`);
      } else if (/^page\.(tsx|ts)$/.test(f)) {
        const v = await load(p, 'page');
        if (v) routes[prefix || '/'] = v;
      }
    }
  };
  await walk(join(r, 'routes'), '');

  const features: AuthoringProject['features'] = {};
  for (const fid of list(join(r, 'features'))) {
    const fd = join(r, 'features', fid);
    if (!isDir(fd)) continue;
    const ff = findFile(join(fd, 'feature'));
    if (!ff) {
      fail(fd, `功能目录 ${fid} 缺少 feature.ts`, 'MISSING_FEATURE');
      continue;
    }
    const def = await load(ff, 'feature');
    if (!def) continue;
    const options: Record<string, any> = {};
    for (const o of list(join(fd, 'options'))) {
      if (!/\.(tsx|ts)$/.test(o)) continue;
      const v = await load(join(fd, 'options', o), 'option');
      if (v) options[stem(o)] = v;
    }
    features[fid] = { def, options };
  }

  if (!config) return { authoring: null, diagnostics: diags };
  return { authoring: { root: r, config, layouts, routes, features, themes: loadThemes(r) }, diagnostics: diags };
}
