import '../../../scripts/test/render-fixtures.ts';
import { dataRows, stateFlowItems, changeFor } from '../../../plugins/ui/src/story-data.ts';
import { createZhCN } from '../src/i18n/zh-CN';
import { I18nProvider } from '../src/i18n/context';
import { describe, expect, it } from 'vitest';
import type { Scenario } from '@joplo-app/core';
import { keyboardAt, splitKeys } from '../src/renderer/story-data';
import { markGeometry } from '../src/renderer/marks-math';
import { timelineChips } from '../src/player/layout';
import { subtitleFor } from '../src/player/subtitle-content';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Project, stateAt } from '@joplo-app/core';
import { Stage } from '../src/renderer/Stage';
import { Subtitle } from '../src/player/Subtitle';
import { DemoController } from '../src/runtime/demo';
import { markBox } from '../src/renderer/marks-math';
import { playForScenario, resolvePlay } from '../src/player/playRoute';
const sc = { steps: [{ kind: 'user', caption: '输入', action: { type: 'type', target: 'prompt', value: '周末露营' } }, { kind: 'user', caption: '按下 ⌘K', action: { type: 'press', keys: '⌘K' }, forks: [{ label: '另一条路', scenarioId: 'alt', at: 1 }] }, { kind: 'system', caption: '完成', action: { type: 'event', name: '完成' } }] } as unknown as Scenario;
describe('按键记录纯函数', () => {
  it('静态取最近一步；播放取 activeStep 与 preview，不在输入前泄漏全文', () => {
    expect(keyboardAt(sc, 0)).toBeNull();
    expect(keyboardAt(sc, 1)).toEqual({ kind: 'type', text: '周末露营' });
    expect(keyboardAt(sc, 0, 0)).toEqual({ kind: 'type', text: '' });
    expect(keyboardAt(sc, 0, 0, { nodeId: 'prompt', text: '周末' })).toEqual({ kind: 'type', text: '周末' });
    expect(keyboardAt(sc, 1, 1)).toEqual({ kind: 'press', keys: ['⌘', 'K'] });
    expect(keyboardAt(sc, 2)).toEqual({ kind: 'press', keys: ['⌘', 'K'] });
    expect(keyboardAt(sc, 3)).toBeNull();
    expect(keyboardAt(null, 0)).toBeNull();
    expect(keyboardAt({ steps: [] } as unknown as Scenario, 0)).toBeNull();
    expect(splitKeys('Ctrl+Shift+Enter')).toEqual(['Ctrl', 'Shift', 'Enter']);
    expect(splitKeys('⌘⇧K')).toEqual(['⌘', '⇧', 'K']);
    expect(splitKeys('Esc')).toEqual(['Esc']);
    expect(splitKeys('')).toEqual([]);
  });
});
describe('分叉与字幕/时间线', () => {
  it('press 是用户步骤；字幕本步与时间线都有分叉，下一步消失', () => {
    expect(subtitleFor(sc, 2, null)).toMatchObject({ kind: 'user', forks: sc.steps[1]!.forks });
    expect(subtitleFor(sc, 3, null)!.forks).toEqual([]);
    expect(timelineChips(sc.steps, 2, null, null, false, createZhCN())[2]).toMatchObject({ fork: true, system: false, tip: '2 · 按下 ⌘K · 分叉：另一条路' });
  });
});
describe('数据组件展示纯函数', () => {
  it('fields 缺省/空数组、值为空、父对象替换与子路径变化均有确定表现', () => {
    const changes = [{ path: 'data.trip.status', before: 'draft', after: 'shared' }];
    expect(dataRows({ status: 'shared', budget: 500 }, undefined, '$data.trip', changes)).toEqual([{ key: 'status', label: 'status', value: 'shared', change: changes[0] }, { key: 'budget', label: 'budget', value: 500, change: null }]);
    expect(dataRows(null, undefined, '$data.trip', changes)).toEqual([]);
    expect(dataRows({}, [], '$data.trip', changes)).toEqual([]);
    expect(changeFor('$data.trip', changes)).toEqual({ path: 'data.trip', before: { status: 'draft' }, after: { status: 'shared' } });
    expect(changeFor('shared', changes)).toBeNull();
  });
  it('状态顺序决定已完成/当前；未知状态不错误地完成任何一项', () => {
    expect(stateFlowItems('shared', ['draft', 'shared', 'confirmed'], { draft: '草稿' })).toEqual([{ value: 'draft', label: '草稿', state: 'done' }, { value: 'shared', label: 'shared', state: 'current' }, { value: 'confirmed', label: 'confirmed', state: 'todo' }]);
    expect(stateFlowItems('', [], {})).toEqual([]);
    expect(stateFlowItems('missing', ['draft'], {})).toEqual([{ value: 'draft', label: 'draft', state: 'todo' }]);
  });
});
describe('标注几何', () => {
  it('不可见/零面积不画；坐标来自目标，四种图形均有路径，箭头注释放在画面内', () => {
    expect(markGeometry('circle', null, 400, 300)).toBeNull();
    expect(markGeometry('box', { x: 0, y: 0, w: 0, h: 10 }, 400, 300)).toBeNull();
    for (const kind of ['circle', 'underline', 'box', 'arrow'] as const) {
      const g = markGeometry(kind, { x: 240, y: 80, w: 100, h: 40 }, 400, 300)!;
      expect(g.d).toContain('M');
      expect(g.note.x).toBeGreaterThanOrEqual(8);
      expect(g.note.y).toBeGreaterThanOrEqual(8);
    }
  });
});

const p = Project.parse({ schemaVersion: 2, name: '原型', mode: 'publish', scenes: { s: { id: 's', optionId: 'f.a', route: '/', name: '画面', root: { id: 'root', type: 'ui:Stack', children: [
  { id: 'email', type: 'ui:Email', props: { from: '营地助手', to: '阿杰', subject: '行程有更新', time: '周五 20:05' }, children: [{ id: 'open', type: 'ui:Button', children: [{ id: 'body', type: '#text', props: { text: '查看行程' } }] }] },
  { id: 'data', type: 'ui:DataCard', props: { title: '行程', value: '$data.trip', fields: [{ key: 'budget', label: '预算' }] } },
  { id: 'status', type: 'ui:StateFlow', props: { value: '$data.trip.status', states: ['draft', 'shared'], labels: { draft: '草稿', shared: '已分享' } } },
] } } }, scenarios: { s: { id: 's', optionId: 'f.a', name: '主线', mock: { label: '模拟成功', outcome: 'success' }, initial: { sceneId: 's', data: { trip: { status: 'draft', budget: 500 } } }, steps: [
  { id: 's#1', kind: 'user', caption: '按下 ⌘K', action: { type: 'press', keys: '⌘K' }, forks: [{ label: '另一条路', scenarioId: 'alt', at: 0 }], effects: [{ type: 'set', path: 'data.trip.status', value: 'shared' }, { type: 'set', path: 'data.trip.budget', value: 280 }] },
  { id: 's#2', kind: 'system', caption: '结束', action: { type: 'event', name: '结束' } },
] }, alt: { id: 'alt', optionId: 'f.a', name: '另一条路', mock: { label: '模拟', outcome: 'other' }, initial: { sceneId: 's' }, steps: [] } } });
describe('IR → 静态组件与控制器（无浏览器）', () => {
  it('邮件头部与正文按钮、数据行变化和状态前后值、键帽都由同一 IR 渲染', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, {explicit:'zh-CN', children:createElement(Stage, { project: p, state: stateAt(p, 's', 1), theme: 'sketch', mode: 'render', animate: false })}));
    for (const text of ['营地助手', '收件人：', '阿杰', '行程有更新', '周五 20:05', 'data-jid="open"', 'data-changed=""', '500', '280', '状态变化：', '草稿', '已分享', 'data-jlayer="keyboard"', '<kbd']) expect(html).toContain(text);
    const after = renderToStaticMarkup(createElement(I18nProvider, {explicit:'zh-CN', children:createElement(Stage, { project: p, state: stateAt(p, 's', 2), theme: 'sketch', mode: 'render', animate: false })}));
    expect(after).not.toContain('data-changed=""');
    expect(after).not.toContain('data-state-change=""');
    expect(after).not.toContain('data-jlayer="keyboard"');
    const subtitle = renderToStaticMarkup(createElement(Subtitle, { content: subtitleFor(p.scenarios.s, 1, null), theme: 'sketch', onFork: () => {} }));
    expect(subtitle).toContain('↳ 另一条路');
    expect(subtitle).toContain('<button');
  });
  it('控制器的 press 下一步与跳转状态一致；分叉只按需切换，自动播放不会跟随', async () => {
    const c = new DemoController(null);
    c.reducedMotion = true;
    c.setProject(p, 1, null);
    c.setScenario('s', 0, { quiet: true });
    await c.next();
    expect(c.getSnapshot().state).toEqual(stateAt(p, 's', 1));
    await c.next();
    expect(c.getSnapshot().state?.scenarioId).toBe('s');
    c.setScenario('s', 0, { quiet: true });
    await c.play({ fast: () => true });
    expect(c.getSnapshot().state?.scenarioId).toBe('s');
    expect(c.getSnapshot().state?.position).toBe(2);
    const f = p.scenarios.s!.steps[0]!.forks[0]!;
    c.setScenario(f.scenarioId, f.at, { quiet: true });
    expect(c.getSnapshot().state).toEqual(stateAt(p, 'alt', 0));
    c.stop();
  });
  it('标注坐标会消除镜头缩放/位移，画面外或被祖先裁切的目标不画', () => {
    expect(markBox({ x: 300, y: 200, w: 100, h: 60 }, { x: 100, y: 100 }, 2, [])).toEqual({ x: 100, y: 50, w: 50, h: 30 });
    expect(markBox({ x: 300, y: 200, w: 100, h: 60 }, { x: 100, y: 100 }, 2, [{ x: 0, y: 0, w: 200, h: 200 }])).toBeNull();
    expect(markBox({ x: 100, y: 100, w: 100, h: 100 }, { x: 100, y: 100 }, 2, [{ x: 100, y: 100, w: 40, h: 40 }])).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    expect(markBox({ x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0 }, 0, [])).toBeNull();
  });
});


it('分叉切换同步 URL 的情况键，避免原 happy 情况把目标 cant_go 切回主线', () => {
  const project = Project.parse({ ...p,
    features: { f: { id: 'f', name: '功能', goal: '演示', pick: 'f.a' } },
    options: { 'f.a': { id: 'f.a', featureId: 'f', key: 'a', name: '方案', idea: '说明', coverage: { 'f.happy': { status: 'expressed', scenarioIds: ['s'] }, 'f.alt': { status: 'expressed', scenarioIds: ['alt'] } } } },
    cases: { 'f.happy': { id: 'f.happy', featureId: 'f', title: '主线', dimension: 'main' }, 'f.alt': { id: 'f.alt', featureId: 'f', title: '其他情况', dimension: 'main' } },
    scenarios: { ...p.scenarios, s: { ...p.scenarios.s, caseIds: ['f.happy'] }, alt: { ...p.scenarios.alt, caseIds: ['f.alt'] } },
  });
  const route = playForScenario({ featureId: 'f', caseId: 'f.happy', scenarioId: 's', step: 1 }, project.scenarios.alt!, 0);
  expect(route.caseId).toBe('f.alt');
  expect(resolvePlay(project, route).scenarioId).toBe('alt');
  expect(playForScenario({ featureId: 'f', caseId: 'f.happy' }, p.scenarios.alt!, 0).caseId).toBeUndefined();
});
