import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 视角层级与导演镜头（T-layers：每层一个完全独立的画面）：
 * layer(title, tree) 单独编译成画面；shot 在包含它的层里解析；导演层；cameraAt / displaySceneId 纯函数；
 * 各层共享同一份状态；没有 layers 的方案行为不变；属性值为 undefined 时当作没写。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui'; import * as uiDiagram from '@joplo-app/plugin-diagram';
import { explain, feature, flow, layer, option, page, set, shot, Slot, $ } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { DIRECTOR_LAYER, LAYER_ICONS, PAGE_LAYER, cameraAt, compile, displaySceneId, explainClick, findNode, isNodeVisible, layersOf, layersWithNode, replay, stateAt, stepTouchesLayer, validate, type AuthoringProject } from '../src/index.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
const D = uiDiagram.Diagram;

/** 客户端层：发送按钮与消息；后端层：架构图。两层都有一个同名的 shared 元素。 */
const clientTree = () => h(ui.Paper, { id: 'client_panel' }, h(ui.Button, { id: 'app_send' }, '发送'), h(ui.Text, { id: 'msg_user', when: $.ui.sent }, '你好'), h(ui.Badge, { id: 'shared' }, '共享'));
const backendTree = () => h(D, { id: 'arch' }, h(D.Node, { id: 'biz', label: 'Biz' }), h(D.Node, { id: 'billing', label: 'Billing' }), h(D.Node, { id: 'shared', label: '共享' }), h(D.Edge, { from: 'biz', to: 'billing' }));

function build(o: { layers?: Record<string, unknown> | null; steps?: (f: ReturnType<typeof flow>) => ReturnType<typeof flow>; pageExtra?: unknown[] } = {}) {
  const home = page({ title: '路径页面', layout: false }, h(ui.Stack, null, h(ui.Text, { id: 'page_only' }, '只在路径页面里'), h(ui.Button, { id: 'page_btn' }, '页面按钮'), ...(o.pageExtra ?? []), h(Slot, { name: 'main' })));
  const fl = (o.steps ?? ((f) =>
    f
      .click('app_send', set($.ui.sent, true), shot('msg_user'), shot('biz'))
      .system('额度预检', shot('biz', 'billing'))
      .system('没有镜头')
      .system('回到整体', shot())
      .click('app_send', '再点一次：没有 shot，导演切到按钮所在的层')))(flow('整理发票', { start: '/' }));
  const opt = option({
    name: 'A',
    idea: 'i',
    on: {},
    state: { ui: { sent: false } },
    ...(o.layers === null ? {} : { layers: (o.layers ?? { client: layer('客户端视角', clientTree()), backend: layer('后端流转', backendTree()) }) as never }),
    scenarios: { happy: fl },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  return { dev: compile(src, 'dev'), publish: compile(src, 'publish') };
}
const sid = 'f.a.happy';

describe('explain()：较长的解说写进 IR（T-director2）', () => {
  it('写进 Step.explain，多个按换行连接；发布模式保留；不是状态变化；没有 explain 的步骤没有这个字段', () => {
    const { dev, publish } = build({
      steps: (f) => f.click('app_send', '发出消息', shot('msg_user'), explain('客户端把消息交给 Biz Server'), explain('  鉴权并写入会话 ')).system('额度预检', shot('billing')),
    });
    for (const r of [dev, publish]) {
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const steps = r.project!.scenarios[sid]!.steps;
      expect(steps[0]!.explain).toBe('客户端把消息交给 Biz Server\n鉴权并写入会话');
      expect(steps[0]!.caption).toBe('发出消息');
      expect(steps[0]!.effects.map((e) => e.type)).toEqual([]);
      expect('explain' in steps[1]!).toBe(false);
    }
  });
});

describe('layer(title, tree)：每层一个独立画面', () => {
  it('每层单独编译成画面（带 layer 键），不从路径页面里裁切；option.layers 指向这些画面', () => {
    const { dev } = build();
    expect(dev.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const p = dev.project!;
    expect(p.options['f.a']!.layers).toEqual({ client: { title: '客户端视角', sceneId: 'f.a~client' }, backend: { title: '后端流转', sceneId: 'f.a~backend' } });
    const client = p.scenes['f.a~client']!;
    expect(client).toMatchObject({ layer: 'client', optionId: 'f.a', viewport: 'desktop' });
    expect(client.root.id).toBe('client_panel');
    expect(findNode(client, 'arch')).toBeNull(); // 客户端层里没有后端的内容
    expect(findNode(client, 'page_only')).toBeNull(); // 也没有路径页面的内容
    expect(findNode(p.scenes['f.a~backend']!, 'biz')).not.toBeNull();
    expect(layersOf(p, sid).map((l) => l.id)).toEqual(['client', 'backend']);
    // 同名 id 可以出现在不同的层（各层是独立页面）
    expect(layersWithNode(p, sid, 'shared')).toEqual(['client', 'backend']);
  });

  it('check：层里的按钮被步骤点到就算绑定（不再按路径页面找目标）', () => {
    const p = build().dev.project!;
    const codes = validate(p, { mode: 'all' }).diagnostics.filter((d) => d.code === 'UNBOUND_INTERACTIVE').map((d) => d.message);
    expect(codes.some((m) => m.includes('app_send'))).toBe(false);
    expect(codes.some((m) => m.includes('page_btn'))).toBe(true); // 路径页面里没被点的按钮照常提示
  });

  it('shot 在包含它的层里解析；第一个 shot 决定导演层；没有 shot 的操作步骤取目标所在层；shot() 让导演层回到整体', () => {
    const p = build().dev.project!;
    const steps = p.scenarios[sid]!.steps;
    expect(steps[0]!).toMatchObject({ shots: [{ layer: 'client', targets: ['msg_user'] }, { layer: 'backend', targets: ['biz'] }], directorLayer: 'client' });
    expect(steps[1]!).toMatchObject({ shots: [{ layer: 'backend', targets: ['biz', 'billing'] }], directorLayer: 'backend' });
    expect(steps[2]!).toMatchObject({ shots: [], directorLayer: null });
    expect(steps[3]!).toMatchObject({ shots: [{ layer: DIRECTOR_LAYER, targets: [] }], directorLayer: null });
    expect(steps[4]!).toMatchObject({ shots: [], directorLayer: 'client' });
    // 自动字幕在目标所在的层里取元素名
    expect(steps[4]!.caption).toBe('再点一次：没有 shot，导演切到按钮所在的层');
  });

  it('多层都有同名 id：各层都生效', () => {
    const p = build({ steps: (f) => f.system('看共享元素', shot('shared')) }).dev.project!;
    expect(p.scenarios[sid]!.steps[0]!.shots).toEqual([
      { layer: 'client', targets: ['shared'] },
      { layer: 'backend', targets: ['shared'] },
    ]);
  });

  it('shot 引用不在任何层里的元素（即使在路径页面里）：SHOT_UNKNOWN；层级没有内容或键不合法：LAYER_UNKNOWN', () => {
    const bad = build({ steps: (f) => f.system('看页面', shot('page_only')) }).dev;
    expect(bad.diagnostics.find((d) => d.code === 'SHOT_UNKNOWN')?.message).toContain('page_only');
    expect(bad.diagnostics.find((d) => d.code === 'SHOT_UNKNOWN')?.at).toMatch(/camera\.test\.ts:\d+:\d+$/);
    const empty = build({ layers: { client: layer('空', []), backend: layer('后端流转', backendTree()) } }).dev;
    expect(empty.diagnostics.find((d) => d.code === 'LAYER_UNKNOWN')?.message).toContain('has no content');
    const key = build({ layers: { '@x': layer('坏键', clientTree()) } }).dev;
    expect(key.diagnostics.find((d) => d.code === 'LAYER_UNKNOWN')).toBeTruthy();
  });

  it('层级图标：作者从预设里选；不写时手机视口是 mobile、其余是 window（IR 只存显式写的）；写错报 ICON_UNKNOWN 并指向源码；发布站保留', () => {
    const { dev, publish } = build({ layers: { client: layer('客户端视角', clientTree(), { icon: 'terminal' }), backend: layer('后端流转', backendTree()), phone: layer('手机', clientTree(), { viewport: 'mobile' }) } });
    expect(dev.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const p = dev.project!;
    expect(p.options['f.a']!.layers.client!.icon).toBe('terminal');
    expect(p.options['f.a']!.layers.backend!.icon).toBeUndefined();
    expect(layersOf(p, sid).map((l) => [l.id, l.icon])).toEqual([['client', 'terminal'], ['backend', 'window'], ['phone', 'mobile']]);
    expect(publish.project!.options['f.a']!.layers.client!.icon).toBe('terminal');
    for (const icon of LAYER_ICONS) expect(build({ layers: { client: layer('c', clientTree(), { icon }) } }).dev.diagnostics.some((d) => d.code === 'ICON_UNKNOWN')).toBe(false);
    const bad = build({ layers: { client: layer('客户端视角', clientTree(), { icon: 'rocket' as never }), backend: layer('后端流转', backendTree()) } }).dev;
    const d = bad.diagnostics.find((x) => x.code === 'ICON_UNKNOWN');
    expect(d?.severity).toBe('error');
    expect(d?.message).toContain('rocket');
    expect(d?.at).toMatch(/camera\.test\.ts:\d+:\d+$/);
    expect(bad.project?.options['f.a']?.layers.client?.icon).toBeUndefined();
  });

  it('发布站保留层级画面与镜头', () => {
    const { publish } = build();
    expect(publish.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const p = publish.project!;
    expect(p.options['f.a']!.layers.client!.sceneId).toBe('f.a~client');
    expect(p.scenes['f.a~client']).toBeTruthy();
    expect(p.scenarios[sid]!.steps[0]!.directorLayer).toBe('client');
  });
});

describe('播放：各层共享同一份状态', () => {
  const p = build().dev.project!;
  it('回放校验在目标所在的层里找目标（不在路径页面里也能通过）；状态与层级无关', () => {
    expect(replay(p, sid).diagnostics).toEqual([]);
    expect(stateAt(p, sid, 1).ui).toEqual({ sent: true });
    // 同一份状态驱动所有层：客户端层里的消息在第 1 步之后可见
    expect(isNodeVisible(p.scenes['f.a~client']!, 'msg_user', stateAt(p, sid, 0))).toBe(false);
    expect(isNodeVisible(p.scenes['f.a~client']!, 'msg_user', stateAt(p, sid, 1))).toBe(true);
  });
  it('点击解释按用户正在看的那一层', () => {
    const s0 = stateAt(p, sid, 0);
    expect(explainClick(p, s0, 'app_send', 'f.a~client').kind).toBe('advance');
    expect(explainClick(p, s0, 'app_send').kind).toBe('static'); // 路径页面里没有这个按钮
  });
  it('目标在某层被隐藏时报 TARGET_HIDDEN', () => {
    const q = build({ steps: (f) => f.click('app_send').click('msg_user'), layers: { client: layer('客户端视角', clientTree()) } }).dev.project!;
    expect(replay(q, sid).diagnostics.map((d) => d.code)).toEqual(['TARGET_HIDDEN']);
  });
});

describe('cameraAt / displaySceneId（纯函数）', () => {
  const p = build().dev.project!;
  it('初始导演层 = 第一个声明的层级；之后按步骤推导；shot() 让当时的导演层回到整体', () => {
    expect(cameraAt(p, sid, 0)).toEqual({ directorLayer: 'client', perLayer: {} });
    expect(cameraAt(p, sid, 1)).toEqual({ directorLayer: 'client', perLayer: { client: ['msg_user'], backend: ['biz'] } });
    expect(cameraAt(p, sid, 2)).toEqual({ directorLayer: 'backend', perLayer: { client: ['msg_user'], backend: ['biz', 'billing'] } });
    expect(cameraAt(p, sid, 3)).toEqual(cameraAt(p, sid, 2));
    expect(cameraAt(p, sid, 4)).toEqual({ directorLayer: 'backend', perLayer: { client: ['msg_user'], backend: [] } });
    expect(cameraAt(p, sid, 5).directorLayer).toBe('client');
    expect(cameraAt(p, sid, 99)).toEqual(cameraAt(p, sid, 5));
  });
  it('用户看到的画面：导演层（或手动选的层）的画面；切层不改变状态', () => {
    expect(displaySceneId(p, sid, 0)).toBe('f.a~client');
    expect(displaySceneId(p, sid, 2)).toBe('f.a~backend');
    expect(displaySceneId(p, sid, 2, 'client')).toBe('f.a~client');
    expect(displaySceneId(p, sid, 2, 'nope')).toBe('f.a~backend');
    expect(stateAt(p, sid, 2)).toEqual(stateAt(p, sid, 2)); // 纯函数
  });
  it('“只重放这一层”：镜头或操作目标在这一层的步骤算有变化', () => {
    expect(stepTouchesLayer(p, sid, 0, 'backend')).toBe(true);
    expect(stepTouchesLayer(p, sid, 2, 'backend')).toBe(false);
    expect(stepTouchesLayer(p, sid, 3, 'backend')).toBe(true); // shot() 作用于当时的导演层（后端）
    expect(stepTouchesLayer(p, sid, 4, 'client')).toBe(true); // 操作目标在客户端层
  });
});

describe('没有声明 layers 的方案：照常显示路径页面', () => {
  it('shot 在路径页面里聚焦（@page），画面就是路径画面', () => {
    const { dev } = build({ layers: null, steps: (f) => f.click('page_btn', shot('page_only')).system('回到整体', shot()) });
    expect(dev.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const p = dev.project!;
    expect(layersOf(p, sid)).toEqual([]);
    expect(p.scenarios[sid]!.steps[0]!.shots).toEqual([{ layer: PAGE_LAYER, targets: ['page_only'] }]);
    expect(cameraAt(p, sid, 1)).toEqual({ directorLayer: PAGE_LAYER, perLayer: { [PAGE_LAYER]: ['page_only'] } });
    expect(displaySceneId(p, sid, 1)).toBe(stateAt(p, sid, 1).sceneId);
    expect(replay(p, sid).diagnostics).toEqual([]);
  });
});

describe('属性值为 undefined', () => {
  it('当作没写这个属性（不报 INVALID_SCHEMA）；数组里的 undefined 变成 null', () => {
    const { dev } = build({ pageExtra: [h(D, { id: 'arch2' }, h(D.Node, { id: 'n1', label: '节点', description: undefined, state: undefined })), h(ui.SegmentedControl, { id: 'seg', data: ['a', undefined], unmodeled: true, value: undefined })] });
    expect(dev.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const scene = dev.project!.scenes['f.a@/']!;
    expect(findNode(scene, 'n1')!.node.props).toEqual({ label: '节点' });
    expect(findNode(scene, 'seg')!.node.props).toEqual({ data: ['a', null] });
  });
});

// kit 的 LayerIcon 与 core 的 LAYER_ICONS 必须一致（pnpm typecheck 检查）
type KitIcon = NonNullable<Parameters<typeof layer>[2]>['icon'];
const iconsInSync: [NonNullable<KitIcon>] extends [(typeof LAYER_ICONS)[number]] ? ([(typeof LAYER_ICONS)[number]] extends [NonNullable<KitIcon>] ? true : false) : false = true;
void iconsInSync;
