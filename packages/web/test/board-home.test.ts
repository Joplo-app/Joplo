import { createZhCN } from '../src/i18n/zh-CN';
import { createBoardZhCN } from '../src/i18n/board/zh-CN';
const zh = { ...createZhCN(), ...createBoardZhCN() };
/**
 * 看板 UI v1（D55）阶段 5：首页（design/png/20-首页.png）、发布站（50 / 51）的纯计算。
 * - 首页左栏：项目路径缩写、编译出错 / 找不到目录的徽标、↑↓ 移动选中；
 * - 首页右侧：项目摘要（N 个功能 · 已选定 a / n）、功能卡片（选定方案、方案数、覆盖小结、整张可点打开的目标、缩略图用哪个画面）；
 * - 发布站左栏：选定方案的场景列表（当前场景、步数）。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/kit/ui';
import { config, feature, flow, option, page } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject, type Project } from '@joplo-app/core';
import { featureCard, moveSelection, projectBadge, projectMeta, shortPath } from '../src/board/home-model';
import { siteScenarioRows } from '../src/site/site-model';

describe('首页左栏', () => {
  it('路径缩写：家目录写 ~；层级多时只留最后两段', () => {
    expect(shortPath('/Users/djj/.paradev/projects/Joplo/examples/agent-arch')).toBe('…/examples/agent-arch');
    expect(shortPath('/Users/djj/Desktop/old-demo')).toBe('~/Desktop/old-demo');
    expect(shortPath('/home/u/x')).toBe('~/x');
    expect(shortPath('/srv/a')).toBe('/srv/a');
    expect(shortPath('')).toBe('');
  });
  it('徽标：编译出错写错误数；目录不存在写“找不到”；正常没有', () => {
    expect(projectBadge({ status: 'error', errors: 2 } as never, zh)).toEqual({ text: '2 错误', tone: 'danger' });
    expect(projectBadge({ status: 'error', errors: 0 } as never, zh)).toEqual({ text: '出错', tone: 'danger' });
    expect(projectBadge({ status: 'missing', errors: 0 } as never, zh)).toEqual({ text: '找不到', tone: 'na' });
    expect(projectBadge({ status: 'ok', errors: 0 } as never, zh)).toBeNull();
  });
  it('↑↓ 移动选中：到头停住；没有选中时从第一个开始；空列表返回 null', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never[];
    expect(moveSelection(list, 'a', 1)).toBe('b');
    expect(moveSelection(list, 'c', 1)).toBe('c');
    expect(moveSelection(list, 'a', -1)).toBe('a');
    expect(moveSelection(list, null, 1)).toBe('a');
    expect(moveSelection(list, 'zzz', 1)).toBe('a');
    expect(moveSelection([], 'a', 1)).toBeNull();
  });
});

// ---------- 首页右侧（用真实编译的小项目：缩略图要用到画面 id） ----------
const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
function proj(): Project {
  const home = page({ title: '首页', layout: false }, h(ui.Group, { id: 'row' }, h(ui.Button, { id: 'go' }, '去')));
  const a = option({ name: 'A · 记住打开过的项目', idea: 'i', on: {}, state: { ui: {} }, scenarios: { s: flow('一次', { start: '/', cases: ['ok'] }).click('go') } });
  const b = option({ name: 'B · 另一种', idea: 'i', on: {}, state: { ui: {} }, scenarios: { t: flow('两次', { start: '/' }).click('go') } });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: {
      f: { def: { ...feature({ name: '首页', goal: '打开看板就能看到最近的项目', cases: { ok: { title: '正常', dimension: 'main' }, bad: { title: '出错', dimension: 'input' } }, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...a, ...F('features/f/options/a.tsx') }, b: { ...b, ...F('features/f/options/b.tsx') } } },
      g: { def: { ...feature({ name: '空功能', goal: 'g', cases: {} }), ...F('features/g/feature.ts') }, options: {} },
    },
  };
  const r = compile(src, 'dev');
  if (!r.project) throw new Error(JSON.stringify(r.diagnostics));
  return r.project;
}

describe('首页右侧', () => {
  const p = proj();
  it('项目摘要：N 个功能 · 已选定 a / n', () => {
    expect(projectMeta(p, zh)).toBe('2 个功能 · 已选定 1 / 2');
  });
  it('功能卡片：选定方案的字母与名字、方案数、覆盖小结；整张可点，打开选定方案；缩略图用选定方案第一个场景的初始画面', () => {
    const c = featureCard(p, 'f')!;
    expect(c).toMatchObject({ name: '首页', goal: '打开看板就能看到最近的项目', pick: { letter: 'A', title: '记住打开过的项目' }, optionCount: 2, coverage: { missing: 1, undecided: 0, allExpressed: false }, open: { featureId: 'f', optionId: 'f.a' } });
    expect(c.thumb).toMatchObject({ scenarioId: 'f.a.s' });
    expect(p.scenes[c.thumb!.sceneId]).toBeTruthy();
  });
  it('没有方案的功能：不能打开，没有缩略图；没有选定方案时打开第一个方案', () => {
    expect(featureCard(p, 'g')).toMatchObject({ pick: null, optionCount: 0, open: null, thumb: null });
    const noPick = { ...p, features: { ...p.features, f: { ...p.features.f!, pick: null } } } as Project;
    expect(featureCard(noPick, 'f')).toMatchObject({ pick: null, open: { featureId: 'f', optionId: 'f.a' } });
    expect(featureCard(p, 'nope')).toBeNull();
  });
});

describe('发布站左栏：选定方案的场景', () => {
  it('每个场景的名字与步数；当前场景高亮', () => {
    const p = proj();
    expect(siteScenarioRows(p, 'f.a', 'f.a.s', zh)).toEqual([{ id: 'f.a.s', name: '一次', steps: '1 步', current: true }]);
    expect(siteScenarioRows(p, null, null, zh)).toEqual([]);
  });
});
