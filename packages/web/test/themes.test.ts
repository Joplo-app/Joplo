import { createZhCN } from '../src/i18n/zh-CN';
import { createBoardZhCN } from '../src/i18n/board/zh-CN';
const zh = { ...createZhCN(), ...createBoardZhCN() };
/**
 * 主题（D51）的纯计算：变量映射、作用范围前缀、主题解析（内置 + 作者，同名用作者的）、看板实际使用的主题。
 */
import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES } from '@joplo-app/core';
import { BUILTIN, THEME_VARS, allThemesCss, builtinCss, effectiveTheme, isDark, parseThemeVars, scopeThemeCss, strokeOf, strokeOfTheme, themeCatalog, themeScope } from '../src/renderer/themes';

describe('内置主题', () => {
  it('与 core 的 BUILTIN_THEMES 一致；每个主题都写全了约定的变量', () => {
    expect(BUILTIN(zh).map((b) => b.name)).toEqual([...BUILTIN_THEMES]);
    for (const b of BUILTIN(zh)) {
      const vars = parseThemeVars(builtinCss(b.name, zh)!);
      for (const v of THEME_VARS) expect(vars[v], `${b.name} 缺少 ${v}`).toBeTruthy();
    }
  });
  it('sketch / clean 只有字体、字号、阴影与描边方式不同（颜色与之前一致）', () => {
    const s = parseThemeVars(builtinCss('sketch', zh)!);
    const c = parseThemeVars(builtinCss('clean', zh)!);
    expect(s['--jp-ink']).toBe('#1e1e1e');
    expect(s['--jp-accent']).toBe('#e8590c');
    expect(s['--jp-info']).toBe('#1c7ed6');
    for (const k of ['--jp-ink', '--jp-bg', '--jp-surface', '--jp-accent', '--jp-info', '--jp-ok', '--jp-danger']) expect(c[k]).toBe(s[k]);
    expect([strokeOf(builtinCss('sketch', zh)!), strokeOf(builtinCss('clean', zh)!)]).toEqual(['rough', 'clean']);
  });
  it('深色主题：连线状态（active / ok / error / dim）、高光与文字和底色有足够对比（WCAG 对比度 ≥ 3）', () => {
    const lum = (hex: string) => {
      const h = hex.replace('#', '');
      const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
      return (x + 0.05) / (y + 0.05);
    };
    for (const b of BUILTIN(zh)) {
      const v = parseThemeVars(builtinCss(b.name, zh)!);
      for (const k of ['--jp-ink', '--jp-info', '--jp-ok', '--jp-danger', '--jp-annot', '--jp-accent', '--jp-muted']) {
        for (const bg of ['--jp-bg', '--jp-surface']) expect(ratio(v[k]!, v[bg]!), `${b.name}: ${k} 与 ${bg}`).toBeGreaterThanOrEqual(3);
      }
      // dim 状态要能和 idle 区分（idle 用 ink，dim 用 line-strong）
      expect(v['--jp-line-strong']).not.toBe(v['--jp-ink']);
      expect(isDark(builtinCss(b.name, zh)!)).toBe(b.dark);
    }
  });
});

describe('scopeThemeCss（作用范围前缀）', () => {
  const S = themeScope('nord');
  it(':root / html / body / .jstage 指向舞台根，其余选择器变成舞台里的后代；逗号列表逐个处理', () => {
    const out = scopeThemeCss(':root { --jp-ink: #fff; }\n.jbox, h1 { color: red }\n.jstage .jcard:hover { color: blue }', 'nord');
    expect(out).toContain(`${S} { --jp-ink: #fff; }`);
    expect(out).toContain(`${S} .jbox, ${S} h1 {`);
    expect(out).toContain(`${S} .jcard:hover {`);
    expect(out).not.toMatch(/(^|\n)\.jbox/);
  });
  it('@media 里的规则递归加前缀；@keyframes、@font-face、@import 原样保留；注释去掉；括号里的逗号不拆', () => {
    const css = `/* x */ @import url(a.css);\n@media (max-width: 600px) { .a { color: red } }\n@keyframes blink { from { opacity: 0 } to { opacity: 1 } }\n@font-face { font-family: X; src: url(x.woff2); }\n:is(.a, .b) { color: green }`;
    const out = scopeThemeCss(css, 'nord');
    expect(out).toContain('@import url(a.css);');
    expect(out).toMatch(new RegExp(`@media \\(max-width: 600px\\) \\{\\n${S.replace(/[()[\]".:*+?^${}|\\]/g, '\\$&')} \\.a`));
    expect(out).toContain('@keyframes blink { from { opacity: 0 } to { opacity: 1 } }');
    expect(out).toContain('@font-face { font-family: X;');
    expect(out).toContain(`${S} :is(.a, .b) {`);
    expect(out).not.toContain('/* x */');
  });
  it('所有主题注入后，每条规则都在某个主题的作用范围里（不影响看板本身）', () => {
    const css = allThemesCss({ mine: '.jbox { border-color: hotpink }' }, zh);
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter((r) => r.includes('{'));
    for (const r of rules) {
      const sel = r.slice(0, r.indexOf('{')).trim();
      if (sel.startsWith('@') || /^(from|to|\d+%)/.test(sel)) continue;
      for (const s of sel.split(/,(?![^(]*\))/)) expect(s.trim().startsWith(':is(.jstage, .jtheme)[data-theme='), s).toBe(true);
    }
  });
});

describe('主题解析与实际使用的主题', () => {
  it('作者主题与内置同名时用作者的；新名字追加在后面；描边方式按 --jp-stroke，没写时与默认（手绘）一致', () => {
    const cat = themeCatalog({ nord: ':root { --jp-bg: #000; --jp-stroke: rough }', brand: ':root { --jp-accent: #f0f; --jp-stroke: clean }', plain: '.jbox { color: red }' }, zh);
    const nord = cat.find((t) => t.name === 'nord')!;
    expect(nord).toMatchObject({ builtin: false, stroke: 'rough', dark: true });
    expect(cat.map((t) => t.name).slice(-2)).toEqual(['brand', 'plain']);
    expect(strokeOfTheme('brand', { brand: ':root { --jp-stroke: clean }' }, zh)).toBe('clean');
    expect(strokeOfTheme('plain', { plain: '.jbox { color: red }' }, zh)).toBe('rough');
    expect(strokeOfTheme('nope', undefined, zh)).toBe('rough');
    expect(cat.length).toBe(BUILTIN(zh).length + 2);
  });
  it('看板实际使用的主题：本项目覆盖 > 全局选择 > 项目默认；“恢复为项目默认”（null）即使有全局选择也用项目默认', () => {
    expect(effectiveTheme(null, 'p1', 'sketch')).toBe('sketch');
    expect(effectiveTheme({ theme: 'nord' }, 'p1', 'sketch')).toBe('nord');
    expect(effectiveTheme({ theme: 'nord', projects: { p1: { theme: 'dracula' } } }, 'p1', 'sketch')).toBe('dracula');
    expect(effectiveTheme({ theme: 'nord', projects: { p1: { theme: null } } }, 'p1', 'kraft')).toBe('kraft');
    expect(effectiveTheme({ theme: 'nord', projects: { p1: { theme: 'dracula' } } }, 'p2', 'sketch')).toBe('nord');
  });
});
