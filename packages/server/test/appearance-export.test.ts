/**
 * 外观（D55）的导出透传：看板请求体里的 font / stroke → 服务端校验（exportAppearance）→ 渲染路由的 URL 参数
 * （renderUrl / renderQuery）→ RenderApp 读取后交给舞台、字幕与手机外框。renderStep 缺省时沿用项目主题、不带字体与线条。
 */
import { describe, expect, it } from 'vitest';
import { exportAppearance } from '../src/export.ts';
import { renderQuery } from '../src/render.ts';

describe('exportAppearance：导出请求里的字体与线条', () => {
  it('合法值原样保留；缺省、null、未知值都是 null（跟随主题）', () => {
    expect(exportAppearance({ font: 'serif', stroke: 'clean' })).toEqual({ font: 'serif', stroke: 'clean' });
    expect(exportAppearance({ font: 'hand' })).toEqual({ font: 'hand', stroke: null });
    expect(exportAppearance({ font: null, stroke: null })).toEqual({ font: null, stroke: null });
    expect(exportAppearance({ font: 'Comic Sans', stroke: 'zigzag' })).toEqual({ font: null, stroke: null });
    for (const b of [null, undefined, 'x', 1, [], {}]) expect(exportAppearance(b)).toEqual({ font: null, stroke: null });
  });
});

describe('renderQuery：renderStep 的渲染路由参数', () => {
  const base = { projectId: 'p-1', scenarioId: 's.a', position: 2, theme: 'sketch' };
  it('缺省：只有主题（项目主题），不带 font / stroke', () => {
    const q = new URLSearchParams(renderQuery(base));
    expect(Object.fromEntries(q)).toEqual({ render: '1', project: 'p-1', scenario: 's.a', position: '2', theme: 'sketch' });
  });
  it('指定字体与线条时透传；非法值丢弃', () => {
    expect(Object.fromEntries(new URLSearchParams(renderQuery({ ...base, font: 'kai', stroke: 'rough' })))).toMatchObject({ font: 'kai', stroke: 'rough' });
    const bad = new URLSearchParams(renderQuery({ ...base, font: 'nope' as never, stroke: 'nope' as never }));
    expect(bad.has('font')).toBe(false);
    expect(bad.has('stroke')).toBe(false);
  });
  it('截图尺寸 w / h', () => {
    expect(Object.fromEntries(new URLSearchParams(renderQuery({ ...base, viewport: { width: 800, height: 600 } })))).toMatchObject({ w: '800', h: '600' });
  });
});
