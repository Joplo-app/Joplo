/**
 * 视角层级与导演镜头（D43）：layer() / shot() 的编译、SHOT_UNKNOWN / LAYER_UNKNOWN、cameraAt 纯函数；
 * 以及属性值为 undefined 时当作没写。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@tokenroll/joplo-kit/ui';
import { config, feature, flow, layer, option, page, set, shot, $ } from '@tokenroll/joplo-kit';
import { jsx } from '@tokenroll/joplo-kit/jsx-runtime';
import { OVERVIEW_LAYER, cameraAt, compile, findNode, layersOf, replay, stateAt, stepTouchesLayer, type AuthoringProject } from '../src/index.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string, line = 1) => ({ file: `/p/${file}`, source: `/p/${file}:${line}:1` });
const D = ui.Diagram;

function build(o: { layers?: Record<string, unknown>; steps?: (f: ReturnType<typeof flow>) => ReturnType<typeof flow>; extra?: unknown[] } = {}) {
  const home = page(
    { title: '演示', layout: false },
    h(ui.SimpleGrid, { cols: 2 },
      h(ui.Paper, { id: 'client_panel' }, h(ui.Button, { id: 'app_send' }, '发送'), h(ui.Text, { id: 'msg_user', when: $.ui.sent }, '你好')),
      h(D, { id: 'arch' }, h(D.Node, { id: 'app', label: '客户端' }), h(D.Node, { id: 'biz', label: 'Biz' }), h(D.Node, { id: 'billing', label: 'Billing' }), h(D.Edge, { from: 'app', to: 'biz' })),
      h(ui.Text, { id: 'free_text' }, '不在任何层级里'),
      ...(o.extra ?? []),
    ),
  );
  const f0 = flow('整理发票', { start: '/' });
  const fl = (o.steps ?? ((f) =>
    f
      .click('app_send', set($.ui.sent, true), shot('msg_user'), shot('app', 'biz'))
      .system('额度预检', shot('biz', 'billing'))
      .system('没有镜头')
      .system('回到全景', shot())
      .system('全景里的元素', shot('free_text'))))(f0);
  const opt = option({
    name: 'A',
    idea: 'i',
    on: {},
    state: { ui: { sent: false } },
    layers: (o.layers ?? { client: layer('客户端视角', ['client_panel']), backend: layer('后端流转', ['arch']) }) as never,
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

describe('layer() / shot() 编译', () => {
  it('镜头按层级归类：一步里可以有多个 shot；第一个 shot 决定导演层；没有 shot 的步骤为空；shot() 回到全景', () => {
    const { dev } = build();
    expect(dev.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const p = dev.project!;
    expect(p.options['f.a']!.layers).toEqual({ client: { title: '客户端视角', roots: ['client_panel'] }, backend: { title: '后端流转', roots: ['arch'] } });
    const steps = p.scenarios['f.a.happy']!.steps;
    expect(steps[0]!.shots).toEqual([
      { layer: 'client', targets: ['msg_user'] },
      { layer: 'backend', targets: ['app', 'biz'] },
    ]);
    expect(steps[0]!.directorLayer).toBe('client');
    expect(steps[1]!).toMatchObject({ shots: [{ layer: 'backend', targets: ['biz', 'billing'] }], directorLayer: 'backend' });
    expect(steps[2]!).toMatchObject({ shots: [], directorLayer: null });
    expect(steps[3]!).toMatchObject({ shots: [{ layer: OVERVIEW_LAYER, targets: [] }], directorLayer: OVERVIEW_LAYER });
    // 不在任何层级里的元素归到全景层
    expect(steps[4]!).toMatchObject({ shots: [{ layer: OVERVIEW_LAYER, targets: ['free_text'] }], directorLayer: OVERVIEW_LAYER });
    // 镜头不是状态变化：不进入 effects
    for (const s of steps) expect(s.effects.some((e) => (e as { type: string }).type === 'shot')).toBe(false);
    expect(layersOf(p, 'f.a.happy').map((l) => l.id)).toEqual([OVERVIEW_LAYER, 'client', 'backend']);
  });

  it('同时属于多个层级的元素：各层都生效', () => {
    const { dev } = build({
      layers: { client: layer('客户端视角', ['client_panel']), send: layer('发送按钮', ['app_send']) },
      steps: (f) => f.click('app_send', shot('app_send')),
    });
    expect(dev.project!.scenarios['f.a.happy']!.steps[0]!.shots).toEqual([
      { layer: 'client', targets: ['app_send'] },
      { layer: 'send', targets: ['app_send'] },
    ]);
  });

  it('shot 引用不存在的元素：SHOT_UNKNOWN（带 at）；layer 的根不存在：LAYER_UNKNOWN', () => {
    const bad = build({ steps: (f) => f.click('app_send', shot('nope')) }).dev;
    const d = bad.diagnostics.find((x) => x.code === 'SHOT_UNKNOWN')!;
    expect(d.severity).toBe('error');
    expect(d.message).toContain('nope');
    expect(d.at).toMatch(/camera\.test\.ts:\d+:\d+$/);
    const noRoot = build({ layers: { ghost: layer('不存在', ['ghost_root']) } }).dev;
    expect(noRoot.diagnostics.find((x) => x.code === 'LAYER_UNKNOWN')?.message).toContain('ghost_root');
  });

  it('发布站保留层级与镜头（它们属于演示）', () => {
    const { publish } = build();
    expect(publish.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(Object.keys(publish.project!.options['f.a']!.layers)).toEqual(['client', 'backend']);
    expect(publish.project!.scenarios['f.a.happy']!.steps[0]!.directorLayer).toBe('client');
  });
});

describe('cameraAt（纯函数）', () => {
  const p = build().dev.project!;
  const sid = 'f.a.happy';

  it('初始为全景；有 shot 的步骤更新对应层级；没有 shot 的步骤沿用上一步', () => {
    expect(cameraAt(p, sid, 0)).toEqual({ directorLayer: OVERVIEW_LAYER, perLayer: {} });
    expect(cameraAt(p, sid, 1)).toEqual({ directorLayer: 'client', perLayer: { client: ['msg_user'], backend: ['app', 'biz'] } });
    expect(cameraAt(p, sid, 2)).toEqual({ directorLayer: 'backend', perLayer: { client: ['msg_user'], backend: ['biz', 'billing'] } });
    expect(cameraAt(p, sid, 3)).toEqual(cameraAt(p, sid, 2));
    expect(cameraAt(p, sid, 4)).toEqual({ directorLayer: OVERVIEW_LAYER, perLayer: { client: ['msg_user'], backend: ['biz', 'billing'], [OVERVIEW_LAYER]: [] } });
    expect(cameraAt(p, sid, 99)).toEqual(cameraAt(p, sid, 5));
    expect(cameraAt(p, 'nope', 1)).toEqual({ directorLayer: OVERVIEW_LAYER, perLayer: {} });
  });

  it('与逐步推导一致；不进入 ui / data / inputs，回放结果不受镜头影响', () => {
    const steps = p.scenarios[sid]!.steps;
    let acc = { directorLayer: OVERVIEW_LAYER, perLayer: {} as Record<string, string[]> };
    for (let k = 1; k <= steps.length; k++) {
      const st = steps[k - 1]!;
      acc = { directorLayer: st.directorLayer ?? acc.directorLayer, perLayer: { ...acc.perLayer, ...Object.fromEntries(st.shots.map((s) => [s.layer, s.targets])) } };
      expect(cameraAt(p, sid, k)).toEqual(acc);
      expect(JSON.stringify(stateAt(p, sid, k))).not.toContain('backend');
    }
    expect(replay(p, sid).diagnostics).toEqual([]);
    expect(stateAt(p, sid, 1).ui).toEqual({ sent: true });
    // 第 1 步改变了两个层级，第 3 步（没有镜头）不改变任何层级
    expect(stepTouchesLayer(p, sid, 0, 'backend')).toBe(true);
    expect(stepTouchesLayer(p, sid, 2, 'backend')).toBe(false);
  });
});

describe('属性值为 undefined', () => {
  it('当作没写这个属性（不报 INVALID_SCHEMA）；数组里的 undefined 变成 null', () => {
    const { dev } = build({
      extra: [h(D, { id: 'arch2' }, h(D.Node, { id: 'n1', label: '节点', description: undefined, state: undefined })), h(ui.SegmentedControl, { id: 'seg', data: ['a', undefined], unmodeled: true, value: undefined })],
    });
    expect(dev.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const scene = dev.project!.scenes['f.a@/']!;
    const n1 = findNode(scene, 'n1')!.node;
    expect(n1.props).toEqual({ label: '节点' });
    expect(findNode(scene, 'seg')!.node.props).toEqual({ data: ['a', null] });
  });
});
