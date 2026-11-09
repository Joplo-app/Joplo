import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 代码插件（D96 原型）端到端：
 * typeCode / editCode / highlightLines → effect 记下这一步的操作与 holdMs → Step.effectHold → frame 在上一步快照上应用
 * → 每一步每个编辑器的完整快照（ext.code.editors）。跳到任意一步与一步步走到那里一致，只依赖 IR。
 */
import { describe, expect, it } from 'vitest';
import { feature, flow, option, page } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, holdMsOf, type AuthoringProject } from '@joplo-app/core';
import code, { Editor, editCode, highlightLines, typeCode } from '../src/plugin.ts';
import { applyOps, initialFrame, lineDiff, tokenize, typeMs } from '../src/model.ts';

const V1 = `export async function load(url: string) {\n  const res = await fetch(url);\n  return res.json();\n}`;
const V2 = `export async function load(url: string, tries = 3) {\n  const res = await fetch(url);\n  if (!res.ok) throw new Error(res.statusText);\n  return res.json();\n}`;

function project(steps: (f: ReturnType<typeof flow>) => ReturnType<typeof flow>) {
  const file = '/p/a.tsx';
  const src: AuthoringProject = { root: '/p', config: { ...config({ name: 'T', home: '/', plugins: [code] }), file }, layouts: {},
    routes: { '/': { ...page({ title: 'Home', layout: false }, jsx(Editor, { id: 'ed', file: 'load.ts', lang: 'ts', code: V1 })), file } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), file }, options: { a: { ...option({ name: 'A', idea: 'i', scenarios: { s: steps(flow('S', { start: '/' })) } }), file } } } } };
  return compile(src, 'dev');
}
const editorAt = (p: NonNullable<ReturnType<typeof project>['project']>, i: number) => ((i ? p.scenarios['f.a.s']!.steps[i - 1]!.ext : p.scenarios['f.a.s']!.ext) as { code: { editors: Record<string, { code: string; anim: unknown; hl: unknown }> } }).code.editors.ed!;

describe('model', () => {
  it('tokenize 着色并压缩颜色；text 原样', () => {
    const t = tokenize('const a = 1', 'typescript');
    expect(t.lines[0]!.map(([s]) => s).join('')).toBe('const a = 1');
    expect(new Set(t.palette).size).toBe(t.palette.length);
    expect(tokenize('a\n\nb', 'text').lines).toEqual([[['a', 0]], [], [['b', 0]]]);
  });
  it('lineDiff：保留、删除、新增', () => {
    expect(lineDiff(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([{ k: 's', i: 0 }, { k: 'a', i: 1 }, { k: 'd', j: 1 }, { k: 's', i: 2 }]);
  });
  it('type 在第 after 行之后插入整行，记下要逐字打出的行；edit 生成带旧着色的 diff；highlight 只属于这一步', () => {
    const base = initialFrame(V1, 'typescript');
    const typed = applyOps(base, [{ kind: 'type', editor: 'ed', text: '  // retry\n  console.log(1);', after: 1, cps: 28 }]);
    expect(typed.code.split('\n').slice(1, 3)).toEqual(['  // retry', '  console.log(1);']);
    expect(typed.anim).toEqual({ kind: 'type', from: 1, to: 3, cps: 28 });
    const edited = applyOps(base, [{ kind: 'edit', editor: 'ed', code: V2 }, { kind: 'highlight', editor: 'ed', from: 3, to: 3 }]);
    expect(edited.code).toBe(V2);
    expect(edited.hl).toEqual([3, 3]);
    const rows = (edited.anim as { kind: 'diff'; rows: { k: string }[] }).rows;
    expect(rows.filter((r) => r.k === 'd')).toHaveLength(1);
    expect(rows.filter((r) => r.k === 'a')).toHaveLength(2);
    expect(typeMs('abc', 30)).toBe(700);
  });
});

describe('compile', () => {
  it('每一步的快照由上一步 + 这一步的操作决定；effectHold 来自 holdMs', () => {
    const r = project((f) => f
      .system('Look', 'The fetch has no error handling', highlightLines('ed', 2))
      .system('Type', 'Check the status', typeCode('ed', '  if (!res.ok) throw new Error(res.statusText);', { after: 2 }))
      .system('Edit', 'Add retries', editCode('ed', V2))
      .system('Rest', 'Done'));
    expect(r.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`)).toEqual([]);
    const p = r.project!;
    expect(editorAt(p, 0)).toMatchObject({ code: V1, anim: null, hl: null });
    expect(editorAt(p, 1)).toMatchObject({ code: V1, hl: [2, 2] });
    expect(editorAt(p, 2).code.split('\n')[2]).toBe('  if (!res.ok) throw new Error(res.statusText);');
    expect(editorAt(p, 2).hl).toBeNull();
    expect(editorAt(p, 3)).toMatchObject({ code: V2, anim: { kind: 'diff' } });
    expect(editorAt(p, 4)).toMatchObject({ code: V2, anim: null });
    const steps = p.scenarios['f.a.s']!.steps;
    expect(steps[0]!.effectHold).toBeUndefined();
    expect(steps[1]!.effectHold).toBe(typeMs('  if (!res.ok) throw new Error(res.statusText);', 28));
    expect(holdMsOf(steps[2])).toBe(1800);
  });
  it('诊断：未知编辑器、空片段、非法行号与速度、未知语言', () => {
    const bad = project((f) => f.system('A', 'a', typeCode('nope', 'x')).system('B', 'b', typeCode('ed', '  ')).system('C', 'c', highlightLines('ed', 0)).system('D', 'd', typeCode('ed', 'x', { cps: 1 })));
    const codes = bad.diagnostics.map((d) => d.code);
    expect(codes).toContain('CODE_EDITOR_UNKNOWN');
    expect(codes.filter((c) => c === 'CODE_INVALID').length).toBe(3);
  });
});
