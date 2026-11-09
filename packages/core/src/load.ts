/**
 * 加载项目文件夹（Node 端）：按约定发现源文件，通过注入的 importer 载入其默认导出。
 * CLI 用 tsx 的 tsImport，`joplo dev` 用 Vite 的 ssrLoadModule；两者产出相同的 AuthoringProject。
 *
 *   joplo.config.ts
 *   layouts/<id>.tsx
 *   routes/**\/page.tsx              routes/page.tsx → /，routes/members/page.tsx → /members
 *   features/<f>/feature.ts
 *   features/<f>/options/<o>.tsx
 *   films/<key>.tsx                影片 → 章节 → 步骤
 *   themes/<name>.css               作者主题（D51），按原文读取
 *   locales/<语言>.json             作者内容译文（D84）：原文 → 译文
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
  for (const f of list(join(r, 'films'))) if (/\.(tsx|ts)$/.test(f) && !isDir(join(r, 'films', f))) files.push(join(r, 'films', f));
  for (const f of list(join(r, 'themes'))) if (/\.css$/.test(f)) files.push(join(r, 'themes', f));
  for (const f of list(join(r, 'locales'))) if (/\.json$/.test(f)) files.push(join(r, 'locales', f));
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

/**
 * 作者内容译文（D84）：locales/<语言>.json，一个扁平对象（原文 → 译文，值是字符串）。
 * 文件名不是语言标签、JSON 写错、值不是字符串时报 LOCALE_FILE_INVALID，这个文件不参与编译。
 */
export function loadLocales(root: string): { locales: Record<string, Record<string, string>>; files: Record<string, string>; diagnostics: Diagnostic[] } {
  const r = resolve(root);
  const locales: Record<string, Record<string, string>> = {};
  const files: Record<string, string> = {};
  const diagnostics: Diagnostic[] = [];
  for (const f of list(join(r, 'locales'))) {
    if (!/\.json$/.test(f)) continue;
    const rel = `locales/${f}`;
    const bad = (message: string) => diagnostics.push({ severity: 'error', code: 'LOCALE_FILE_INVALID', message: `${rel}: ${message}`, source: 'schema', at: `${rel}:1:1` });
    const tag = f.slice(0, -5);
    if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(tag)) { bad('the file name must be a language tag such as ja.json or zh-CN.json'); continue; }
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(join(r, 'locales', f), 'utf8')); }
    catch (e) { bad(`not valid JSON (${e instanceof Error ? e.message : String(e)})`); continue; }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { bad('must be one object of "source text": "translation"'); continue; }
    const nonString = Object.entries(raw as Record<string, unknown>).find(([, v]) => typeof v !== 'string');
    if (nonString) { bad(`the value of ${JSON.stringify(nonString[0])} must be a string (write "" while it is not translated yet)`); continue; }
    locales[tag] = raw as Record<string, string>;
    files[tag] = rel;
  }
  return { locales, files, diagnostics };
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
        fail(file, `Default export must be ${kind}(...); got ${v?.kind ?? typeof v}`, kind === 'film' ? 'FILM_INVALID' : 'WRONG_EXPORT');
        return null;
      }
      return { ...v, file: relp(file) };
    } catch (e) {
      fail(file, `Load failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };

  const cfgFile = findFile(join(r, 'joplo.config'));
  if (!cfgFile) {
    diags.push({ severity: 'error', code: 'NOT_A_PROJECT', message: 'Missing joplo.config.ts', source: 'schema', at: 'joplo.config.ts:1:1' });
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
        if (/[\[\]]/.test(f)) fail(p, `Dynamic route segment "${f}" is not supported; use a concrete route such as /members/li-lei`, 'UNSUPPORTED_ROUTE');
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
      fail(fd, `Feature directory ${fid} is missing feature.ts`, 'MISSING_FEATURE');
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

  const films: NonNullable<AuthoringProject['films']> = {};
  for (const f of list(join(r, 'films'))) {
    if (!/\.(tsx|ts)$/.test(f) || isDir(join(r, 'films', f))) continue;
    const v = await load(join(r, 'films', f), 'film');
    if (v) films[stem(f)] = v;
  }

  if (!config) return { authoring: null, diagnostics: diags };
  const loc = loadLocales(r);
  diags.push(...loc.diagnostics);
  return { authoring: { root: r, config, layouts, routes, features, ...(Object.keys(films).length ? { films } : {}), themes: loadThemes(r), ...(Object.keys(loc.files).length ? { locales: loc.locales, localeFiles: loc.files } : {}) }, diagnostics: diags };
}
