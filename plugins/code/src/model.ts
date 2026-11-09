/**
 * 代码插件的纯函数（Node 编译期）：按行应用作者的操作、按行 diff、Shiki 着色。
 * 每一步的编辑器快照只由「上一步快照 + 这一步的操作」决定，跳到任意一步与一步步走到那里一致。
 */
import { createHighlighterCoreSync, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import typescript from 'shiki/langs/typescript.mjs';
import tsx from 'shiki/langs/tsx.mjs';
import javascript from 'shiki/langs/javascript.mjs';
import json from 'shiki/langs/json.mjs';
import python from 'shiki/langs/python.mjs';
import bash from 'shiki/langs/bash.mjs';
import go from 'shiki/langs/go.mjs';
import rust from 'shiki/langs/rust.mjs';
import sql from 'shiki/langs/sql.mjs';
import css from 'shiki/langs/css.mjs';
import html from 'shiki/langs/html.mjs';
import java from 'shiki/langs/java.mjs';
import githubLight from 'shiki/themes/github-light.mjs';

export const LANGS = ['typescript', 'tsx', 'javascript', 'json', 'python', 'bash', 'go', 'rust', 'sql', 'css', 'html', 'java', 'text'] as const;
export type Lang = (typeof LANGS)[number];
const ALIAS: Record<string, Lang> = { ts: 'typescript', js: 'javascript', py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', golang: 'go', rs: 'rust' };
export const langOf = (v: unknown): Lang | null => {
  if (v === undefined) return 'text';
  if (typeof v !== 'string') return null;
  const k = v.toLowerCase();
  return (LANGS as readonly string[]).includes(k) ? (k as Lang) : ALIAS[k] ?? null;
};

/** 一行 = 若干片段 [文字, 颜色在 palette 里的序号]。 */
export type Line = [string, number][];
export type Op =
  | { kind: 'type'; editor: string; text: string; after: number | null; cps: number }
  | { kind: 'edit'; editor: string; code: string }
  | { kind: 'highlight'; editor: string; from: number; to: number }
  | { kind: 'clear'; editor: string };

/** 一个编辑器在某一步结束时的快照（编译成 IR 数据，播放器只读）。 */
export type EditorFrame = {
  lang: Lang;
  /** 当前的完整代码（下一步的操作在它上面应用）。 */
  code: string;
  palette: string[];
  lines: Line[];
  /** 这一步的动画：逐字打出的新行 [起, 止)（0 起），或按行 diff。 */
  anim: { kind: 'type'; from: number; to: number; cps: number } | { kind: 'diff'; rows: DiffRow[] } | null;
  /** 这一步高亮的行 [起, 止]（1 起），只属于这一步。 */
  hl: [number, number] | null;
};
/** diff 行：s = 不变（新代码第 i 行），a = 新增（新代码第 i 行），d = 删除（旧代码的这一行，带着它的着色）。 */
export type DiffRow = { k: 's' | 'a'; i: number } | { k: 'd'; line: Line };

let highlighter: HighlighterCore | null = null;
function hl(): HighlighterCore {
  highlighter ??= createHighlighterCoreSync({ themes: [githubLight], langs: [typescript, tsx, javascript, json, python, bash, go, rust, sql, css, html, java], engine: createJavaScriptRegexEngine() });
  return highlighter;
}

export function tokenize(code: string, lang: Lang): { palette: string[]; lines: Line[] } {
  if (lang === 'text') return { palette: ['#24292E'], lines: code.split('\n').map((l) => (l ? [[l, 0] as [string, number]] : [])) };
  const palette: string[] = [];
  const colorIndex = (c: string | undefined) => {
    const color = (c ?? '#24292E').toUpperCase();
    let i = palette.indexOf(color);
    if (i < 0) { i = palette.length; palette.push(color); }
    return i;
  };
  const tokens = hl().codeToTokensBase(code, { lang, theme: 'github-light' });
  return { palette, lines: tokens.map((line) => line.map((t) => [t.content, colorIndex(t.color)] as [string, number])) };
}

/** 按行 LCS diff（行数受限，示例代码量级足够）。 */
export function lineDiff(before: string[], after: string[]): ({ k: 's' | 'a'; i: number } | { k: 'd'; j: number })[] {
  const n = before.length, m = after.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = before[i] === after[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: ({ k: 's' | 'a'; i: number } | { k: 'd'; j: number })[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && before[i] === after[j]) { out.push({ k: 's', i: j }); i++; j++; }
    else if (j < m && (i >= n || dp[i]![j + 1]! >= dp[i + 1]![j]!)) { out.push({ k: 'a', i: j }); j++; }
    else { out.push({ k: 'd', j: i }); i++; }
  }
  return out;
}

/** 在上一步的快照上应用这一步的操作，得到这一步结束时的快照。 */
export function applyOps(previous: EditorFrame, ops: Op[]): EditorFrame {
  let code = previous.code;
  let anim: EditorFrame['anim'] = null;
  let hlRange: EditorFrame['hl'] = null;
  /** 这一步第一次 editCode 之前的代码（diff 的“旧”）。 */
  let before: string | null = null;
  for (const op of ops) {
    if (op.kind === 'type') {
      const lines = code === '' ? [] : code.split('\n');
      const at = op.after === null ? lines.length : Math.max(0, Math.min(lines.length, op.after));
      const added = op.text.replace(/\n$/, '').split('\n');
      lines.splice(at, 0, ...added);
      code = lines.join('\n');
      anim = { kind: 'type', from: at, to: at + added.length, cps: op.cps };
    } else if (op.kind === 'edit') {
      before ??= code;
      code = op.code.replace(/\n$/, '');
      anim = null;
    } else if (op.kind === 'highlight') hlRange = [op.from, op.to];
    else hlRange = null;
  }
  const { palette, lines } = tokenize(code, previous.lang);
  if (before !== null && before !== code) {
    const oldTok = tokenize(before, previous.lang);
    // 删除行沿用旧代码的着色：颜色并入这一步的 palette
    const remap = (line: Line): Line => line.map(([t, c]) => {
      const color = oldTok.palette[c]!;
      let k = palette.indexOf(color);
      if (k < 0) { k = palette.length; palette.push(color); }
      return [t, k];
    });
    const rows: DiffRow[] = lineDiff(before.split('\n'), code.split('\n')).map((r) => (r.k === 'd' ? { k: 'd', line: remap(oldTok.lines[r.j] ?? []) } : r));
    anim = { kind: 'diff', rows };
  }
  return { lang: previous.lang, code, palette, lines, anim, hl: hlRange };
}

/** 编辑器的初始快照（第 0 步）。 */
export function initialFrame(code: string, lang: Lang): EditorFrame {
  const clean = code.replace(/\n$/, '');
  return { lang, code: clean, ...tokenize(clean, lang), anim: null, hl: null };
}

/** 逐字打出要多久（引擎毫秒）：字数 ÷ 速度，再留 0.6s 看一眼。 */
export const typeMs = (text: string, cps: number) => Math.ceil(([...text.replace(/\s+/g, ' ')].length / cps) * 1000) + 600;
export const DIFF_MS = 1800;
