/**
 * `joplo i18n add <语言>`（D83）：给项目加一种内容语言，或补齐已有语言缺的条目。
 *
 * 1. 把语言写进 joplo.config.ts 的 locales（第一次加时用 --source 说明源文件是哪种语言）；改不了时打印要加的那一行。
 * 2. 编译 dev IR，收集要翻译的原文，写入 locales/<语言>.json：已有的译文原样保留，新的原文值为 ""，交给 Agent 翻译。
 *    原文改过的旧条目默认保留（check 用它提示最接近的旧译文）；--prune 删掉没人用的条目。
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { CONTENT_LOCALES, collectMessages, compile, isContentLocale, JoploError } from '@joplo-app/core';
import { loadAuthoring } from '@joplo-app/core/node';

export type I18nAddResult = {
  locale: string;
  file: string;
  locales: string[];
  /** true = 改了 config；false = 已经有这种语言；string = 没能自动改，要手动加的写法。 */
  config: boolean | string;
  total: number;
  added: number;
  untranslated: number;
  kept: number;
  pruned: number;
};

/** 在 config({ … }) 里加上 locales：已有 locales 数组时追加；没有时插在 name 那一行后面。改不了时返回 null。 */
export function addLocaleToConfig(text: string, locales: string[], locale: string): string | null {
  const arr = /(\blocales\s*:\s*\[)([^\]]*)(\])/.exec(text);
  if (arr) {
    const body = arr[2]!.trim();
    const quote = /"/.test(body) && !/'/.test(body) ? '"' : "'";
    // 空数组（locales: []）：写完整列表，源语言在第一个
    const next = body ? `${body.replace(/,\s*$/, '')}, ${quote}${locale}${quote}` : locales.map((l) => `${quote}${l}${quote}`).join(', ');
    return text.slice(0, arr.index) + arr[1] + next + arr[3] + text.slice(arr.index + arr[0].length);
  }
  const name = /^([ \t]*)name\s*:.*,[ \t]*$/m.exec(text);
  if (!name) return null;
  const end = name.index + name[0].length;
  return `${text.slice(0, end)}\n${name[1]}locales: [${locales.map((l) => `'${l}'`).join(', ')}],${text.slice(end)}`;
}

export async function i18nAdd(dir: string, locale: string, opts: { source?: string; prune?: boolean } = {}): Promise<I18nAddResult> {
  const supported = CONTENT_LOCALES.join(', ');
  if (!isContentLocale(locale)) throw new JoploError('USAGE', `Unsupported language "${locale}"; use one of ${supported}`);
  if (opts.source !== undefined && !isContentLocale(opts.source)) throw new JoploError('USAGE', `--source "${opts.source}" is not supported; use one of ${supported}`);
  const root = await realpath(resolve(dir));
  const tsconfig = join(root, 'tsconfig.json');
  const loaded = await loadAuthoring(root, (p) => tsImport(p, { parentURL: import.meta.url, tsconfig: existsSync(tsconfig) ? tsconfig : false }));
  const fatal = loaded.diagnostics.filter((d) => d.severity === 'error' && d.code !== 'LOCALE_FILE_INVALID');
  if (!loaded.authoring || fatal.length) throw new JoploError('INVALID_SCHEMA', 'The project does not load; run npx joplo check and fix the errors first', { diagnostics: loaded.diagnostics });
  const authoring = loaded.authoring;

  const declared = authoring.config.locales;
  let locales: string[];
  if (Array.isArray(declared) && declared.length) {
    if (opts.source !== undefined && opts.source !== declared[0]) throw new JoploError('USAGE', `config locales already starts with ${declared[0]} (the source language); --source ${opts.source} does not match`);
    if (declared[0] === locale) throw new JoploError('USAGE', `${locale} is the source language of this project (the first in config locales); add another language`);
    locales = declared.includes(locale) ? [...declared] : [...declared, locale];
  } else {
    if (!opts.source) throw new JoploError('USAGE', `joplo.config.ts has no locales yet. Say which language the source files are written in: npx joplo i18n add ${locale} --source <language> (one of ${supported})`);
    if (opts.source === locale) throw new JoploError('USAGE', `--source and the new language are both ${locale}; add a different language`);
    locales = [opts.source, locale];
  }

  // 1. 收集原文（用加上语言之后的 config 在内存里编译；收集与语言无关）
  const compiled = compile({ ...authoring, config: { ...authoring.config, locales } }, 'dev');
  if (!compiled.project) throw new JoploError('INVALID_SCHEMA', 'The project has compile errors; run npx joplo check and fix them first', { diagnostics: compiled.diagnostics });
  const uses = collectMessages(compiled.project);

  // 写 config（编译通过之后才改文件，失败时什么都不动）
  let configState: boolean | string = false;
  if (!(Array.isArray(declared) && declared.includes(locale))) {
    const cfgFile = authoring.config.file ? join(root, authoring.config.file) : join(root, 'joplo.config.ts');
    const text = await readFile(cfgFile, 'utf8');
    const next = addLocaleToConfig(text, locales, locale);
    if (next) {
      await writeFile(cfgFile, next);
      configState = true;
    } else configState = `locales: [${locales.map((l) => `'${l}'`).join(', ')}],`;
  }

  // 2. locales/<语言>.json：保留已有译文，新原文写 ""
  const dirL = join(root, 'locales');
  const file = join(dirL, `${locale}.json`);
  let old: Record<string, string> = {};
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(await readFile(file, 'utf8'));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not an object');
      old = Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'string' ? v : '']));
    } catch (e) {
      throw new JoploError('INVALID_SCHEMA', `${relative(root, file)} is not a JSON object (${e instanceof Error ? e.message : String(e)}); fix or delete it first`);
    }
  }
  const table: Record<string, string> = {};
  let added = 0;
  for (const u of uses) {
    if (Object.hasOwn(old, u.text)) table[u.text] = old[u.text]!;
    else {
      table[u.text] = '';
      added++;
    }
  }
  const leftover = Object.keys(old).filter((k) => !Object.hasOwn(table, k));
  if (!opts.prune) for (const k of leftover) table[k] = old[k]!;
  await mkdir(dirL, { recursive: true });
  await writeFile(file, `${JSON.stringify(table, null, 2)}\n`);
  return {
    locale,
    file: relative(root, file),
    locales,
    config: configState,
    total: uses.length,
    added,
    untranslated: uses.filter((u) => !table[u.text]).length,
    kept: opts.prune ? 0 : leftover.length,
    pruned: opts.prune ? leftover.length : 0,
  };
}

/** 文本输出：Agent 读完就知道下一步做什么。 */
export function i18nAddText(r: I18nAddResult): string[] {
  const lines: string[] = [];
  if (r.config === true) lines.push(`joplo.config.ts: locales = ${r.locales.join(', ')} (${r.locales[0]} is the source language)`);
  else if (typeof r.config === 'string') lines.push(`Could not edit joplo.config.ts; add this line inside config({ … }): ${r.config}`);
  lines.push(`${r.file}: ${r.total} texts, ${r.untranslated} to translate${r.added ? ` (${r.added} new)` : ''}${r.kept ? `, ${r.kept} old entries kept for npx joplo check to compare` : ''}${r.pruned ? `, ${r.pruned} unused entries removed` : ''}`);
  if (r.untranslated)
    lines.push(`Next: replace every "" in ${r.file} with the ${r.locale} translation of its key (the key is the ${r.locales[0]} source text). Translate whole sentences, keep names of on-screen buttons the same wherever they are quoted, and write narration as people speak in ${r.locale}. Then run npx joplo check.`);
  else lines.push('Every text has a translation. Run npx joplo check.');
  return lines;
}
