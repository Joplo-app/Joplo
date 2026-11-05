/**
 * 外观（D55）：配色 / 字体 / 线条拆开。端到端流向的每一段：
 *   写入点  外观浮层 → applyAppearance / resetAppearance / setAsDefault → PUT /__joplo/settings（服务端测试见 server/test/settings.test.ts）
 *   存储    settings.json（normalizeSettings，服务端）
 *   读取点  effectiveAppearance：本项目 > 所有项目 > 项目 config；字体、线条为 null 时取主题自己的值；未知主题名回退
 *   消费者  舞台根节点（data-theme / data-stroke / --jp-font）、字幕与手机外框（.jtheme）、渲染路由参数（导出与 renderStep）
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SCHEMA_VERSION, type PlayState, type Project } from '@joplo-app/core';
import { FONT_STACKS, appearanceFromParams, fontStack, resolveLook } from '../src/renderer/appearance';
import { themeCatalog } from '../src/renderer/themes';
import { Stage } from '../src/renderer/Stage';
import { PhoneFrame } from '../src/renderer/components';
import { ThemeContext } from '../src/renderer/rough';
import { Subtitle } from '../src/player/Subtitle';
import { appearanceLabel, applyAppearance, effectiveAppearance, isCellSelected, paletteCells, resetAppearance, setAsDefault, themeLine, themeSwatch, themeToWrite } from '../src/board/appearance-model';

const available = themeCatalog({ brand: ':root { --jp-bg: #FFFBEA; --jp-ink: #1E1E1E; --jp-accent: #FFD23F; --jp-stroke: clean }' }).map((t) => t.name);

describe('读取点：effectiveAppearance', () => {
  it('没有任何设置：项目 config 的主题，字体线条跟随主题（null）', () => {
    for (const s of [null, undefined, { version: 1 as const }, {}]) expect(effectiveAppearance(s, 'p1', 'kraft', available)).toEqual({ theme: 'kraft', font: null, stroke: null });
  });
  it('旧版 settings.json（只有 theme）照常生效', () => {
    expect(effectiveAppearance({ version: 1, theme: 'nord' }, 'p1', 'sketch', available)).toEqual({ theme: 'nord', font: null, stroke: null });
  });
  it('优先级：本项目 > 所有项目 > 项目 config，三个字段分别计算', () => {
    const s = { version: 1 as const, theme: 'nord', font: 'hand' as const, stroke: 'rough' as const, projects: { p1: { font: 'serif' as const } } };
    expect(effectiveAppearance(s, 'p1', 'sketch', available)).toEqual({ theme: 'nord', font: 'serif', stroke: 'rough' });
    expect(effectiveAppearance(s, 'p2', 'sketch', available)).toEqual({ theme: 'nord', font: 'hand', stroke: 'rough' });
    expect(effectiveAppearance(s, null, 'sketch', available)).toEqual({ theme: 'nord', font: 'hand', stroke: 'rough' });
  });
  it('本项目写 null：主题回到项目 config，字体 / 线条跟随主题——即使“所有项目”有选择', () => {
    const s = { version: 1 as const, theme: 'nord', font: 'hand' as const, stroke: 'rough' as const, projects: { p1: { theme: null, font: null, stroke: null } } };
    expect(effectiveAppearance(s, 'p1', 'kraft', available)).toEqual({ theme: 'kraft', font: null, stroke: null });
  });
  it('未知主题名（文件被删、手写错）：回退到项目 config；config 也未知时回退到 sketch', () => {
    expect(effectiveAppearance({ version: 1, theme: 'gone' }, 'p1', 'nord', available).theme).toBe('nord');
    expect(effectiveAppearance({ version: 1, theme: 'gone' }, 'p1', 'also-gone', available).theme).toBe('sketch');
    expect(effectiveAppearance({ version: 1, projects: { p1: { theme: 'brand' } } }, 'p1', 'sketch', available).theme).toBe('brand');
  });
  it('未知字体、未知线条（手改了 settings.json）按跟随主题处理', () => {
    expect(effectiveAppearance({ version: 1, font: 'comic' as never, stroke: 'zig' as never }, 'p1', 'sketch', available)).toEqual({ theme: 'sketch', font: null, stroke: null });
  });
});

describe('写入点：浮层的三种操作', () => {
  it('只改这个项目：写进 projects[id]，与已有字段合并；不改输入对象', () => {
    const s = { version: 1 as const, theme: 'nord', projects: { p1: { font: 'kai' as const }, p2: { theme: 'kraft' } } };
    const frozen = JSON.stringify(s);
    expect(applyAppearance(s, 'project', 'p1', { stroke: 'clean' })).toEqual({ version: 1, theme: 'nord', projects: { p1: { font: 'kai', stroke: 'clean' }, p2: { theme: 'kraft' } } });
    expect(JSON.stringify(s)).toBe(frozen);
  });
  it('所有项目：写顶层；空设置也能写', () => {
    expect(applyAppearance(null, 'all', null, { theme: 'dracula', font: 'mono' })).toEqual({ version: 1, theme: 'dracula', font: 'mono' });
    expect(applyAppearance({ version: 1, theme: 'nord' }, 'all', 'p1', { font: null })).toEqual({ version: 1, theme: 'nord', font: null });
  });
  it('项目范围但没有项目 id：退化为所有项目', () => {
    expect(applyAppearance(null, 'project', null, { theme: 'nord' })).toEqual({ version: 1, theme: 'nord' });
  });
  it('恢复项目默认：本项目三个字段都写 null（回到 joplo.config.ts 的主题）；所有项目范围则清掉顶层的选择', () => {
    expect(resetAppearance({ version: 1, theme: 'nord', projects: { p1: { font: 'kai' } } }, 'project', 'p1')).toEqual({ version: 1, theme: 'nord', projects: { p1: { theme: null, font: null, stroke: null } } });
    expect(resetAppearance({ version: 1, theme: 'nord', font: 'kai', stroke: 'clean', projects: { p1: { font: 'kai' } } }, 'all', null)).toEqual({ version: 1, projects: { p1: { font: 'kai' } } });
  });
  it('设为所有项目的默认：顶层写当前这套外观；本项目的单独设置清掉（之后跟随默认）；其他项目不受影响', () => {
    const s = { version: 1 as const, projects: { p1: { theme: 'nord', font: 'hand' as const }, p2: { theme: 'kraft' } } };
    expect(setAsDefault(s, 'p1', { theme: 'nord', font: 'hand', stroke: null })).toEqual({ version: 1, theme: 'nord', font: 'hand', stroke: null, projects: { p2: { theme: 'kraft' } } });
    expect(setAsDefault({ version: 1, projects: { p1: { theme: 'nord' } } }, 'p1', { theme: 'nord', font: null, stroke: null })).toEqual({ version: 1, theme: 'nord', font: null, stroke: null });
  });
});

describe('配色格', () => {
  const cat = themeCatalog({ brand: ':root { --jp-bg: #FFFBEA }', nord: ':root { --jp-bg: #000000 }' });
  const cells = paletteCells(cat);
  it('sketch 与 clean 合并为一个「纸白」；8 格内置 + 作者主题（标 *）；与内置同名的作者主题也标 *', () => {
    expect(cells.map((c) => c.title)).toEqual(['纸白', '蓝图', 'Nord*', 'Dracula', 'Solarized', '复古终端', '牛皮纸', '高对比', 'brand*']);
    expect(cells.filter((c) => c.builtin).length).toBe(8);
    expect(cells[0]!.names).toEqual(['sketch', 'clean']);
  });
  it('当前是 sketch 或 clean 时「纸白」都显示为选中；再点一次不写入；从别的配色点「纸白」写 sketch', () => {
    const paper = cells[0]!;
    expect(isCellSelected(paper, 'sketch')).toBe(true);
    expect(isCellSelected(paper, 'clean')).toBe(true);
    expect(themeToWrite(paper, 'clean')).toBeNull();
    expect(themeToWrite(paper, 'sketch')).toBeNull();
    expect(themeToWrite(paper, 'nord')).toBe('sketch');
    expect(themeToWrite(cells[2]!, 'sketch')).toBe('nord');
    expect(themeToWrite(cells[2]!, 'nord')).toBeNull();
  });
  it('缩略色块取主题变量；缺变量时用默认值，不报错', () => {
    expect(themeSwatch(':root { --jp-bg: #2e3440; --jp-ink: #eceff4; --jp-accent: #ebcb8b; --jp-line: #4c566a }')).toEqual({ bg: '#2e3440', ink: '#eceff4', accent: '#ebcb8b', line: '#4c566a' });
    expect(themeSwatch('')).toEqual({ bg: '#ffffff', ink: '#1e1e1e', accent: '#e8590c', line: '#dee2e6' });
  });
  it('按钮上的名字与“复制 theme”', () => {
    expect(appearanceLabel({ theme: 'nord', font: null, stroke: null }, cat)).toBe('Nord');
    expect(appearanceLabel({ theme: 'clean', font: 'hand', stroke: null }, cat)).toBe('纸白 · 手写');
    expect(appearanceLabel({ theme: 'gone', font: null, stroke: null }, cat)).toBe('gone');
    expect(themeLine('nord')).toBe("theme: 'nord',");
  });
});

describe('消费者', () => {
  it('fontStack：每种字体都有字体栈；null 与未知值没有（跟随主题）', () => {
    for (const f of Object.keys(FONT_STACKS)) expect(fontStack(f as never)).toBeTruthy();
    expect(fontStack('hand')).toContain('Joplo Excalifont');
    expect(fontStack(null)).toBeNull();
    expect(fontStack('comic' as never)).toBeNull();
  });
  it('resolveLook：线条为 null 时取主题自己的（sketch = rough，clean = clean）；字体覆盖写成 --jp-font', () => {
    expect(resolveLook({ theme: 'sketch', font: null, stroke: null })).toEqual({ theme: 'sketch', stroke: 'rough', font: null, style: {} });
    expect(resolveLook({ theme: 'clean', font: null, stroke: null }).stroke).toBe('clean');
    expect(resolveLook({ theme: 'sketch', font: null, stroke: 'clean' }).stroke).toBe('clean');
    const r = resolveLook({ theme: 'nord', font: 'serif', stroke: 'rough' });
    expect(r.stroke).toBe('rough');
    expect(r.style['--jp-font']).toBe(FONT_STACKS.serif);
    expect(resolveLook({ theme: 'brand', font: null, stroke: null }, { brand: ':root { --jp-stroke: clean }' }).stroke).toBe('clean');
  });
  it('appearanceFromParams：渲染路由读 font / stroke 参数；未知值忽略', () => {
    expect(appearanceFromParams(new URLSearchParams('font=kai&stroke=clean'))).toEqual({ font: 'kai', stroke: 'clean' });
    expect(appearanceFromParams(new URLSearchParams('font=x&stroke='))).toEqual({ font: null, stroke: null });
    expect(appearanceFromParams(new URLSearchParams(''))).toEqual({ font: null, stroke: null });
  });

  const scene = { id: 'sc', optionId: null, route: '/', name: 'x', viewport: 'desktop', root: { id: 'root', type: 'Stack', props: {}, children: [{ id: 't', type: '#text', props: { text: '你好' } }] } };
  const project = { schemaVersion: SCHEMA_VERSION, name: 'p', description: '', theme: 'sketch', themes: {}, mode: 'dev', routes: {}, features: {}, cases: {}, options: {}, rules: {}, scenes: { sc: scene }, scenarios: {}, issues: {} } as unknown as Project;
  const state: PlayState = { scenarioId: '', position: 0, sceneId: 'sc', ui: {}, data: {}, inputs: {}, toasts: [], completed: null, sceneStack: [] };
  it('舞台根节点：data-theme、data-stroke（覆盖主题的线条）、--jp-font（覆盖主题的字体）', () => {
    const html = renderToStaticMarkup(createElement(Stage, { project, state, theme: 'sketch', font: 'serif', stroke: 'clean', mode: 'render', animate: false, viewportOverride: { width: 200, height: 100 } }));
    expect(html).toMatch(/data-theme="sketch"/);
    expect(html).toMatch(/data-stroke="clean"/);
    expect(html).toMatch(/data-font="serif"/);
    expect(html).toContain('--jp-font:');
    const plain = renderToStaticMarkup(createElement(Stage, { project, state, theme: 'sketch', mode: 'render', animate: false, viewportOverride: { width: 200, height: 100 } }));
    expect(plain).toMatch(/data-stroke="rough"/);
    expect(plain).not.toContain('--jp-font:');
  });
  it('字幕区与手机外框（.jtheme）跟随同一套外观', () => {
    const sub = renderToStaticMarkup(createElement(Subtitle, { content: null, theme: 'nord', font: 'kai' }));
    expect(sub).toMatch(/data-theme="nord"/);
    expect(sub).toContain('--jp-font:');
    const phone = renderToStaticMarkup(createElement(ThemeContext.Provider, { value: { theme: 'nord', stroke: 'clean', font: 'mono', registry: null } }, createElement(PhoneFrame, { width: 100, height: 200, children: null })));
    expect(phone).toMatch(/data-stroke="clean"/);
    expect(phone).toContain('--jp-font:');
  });
});
