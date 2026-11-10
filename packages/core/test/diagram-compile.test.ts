import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { diagramStateAt } from '../../../plugins/diagram/src/state.ts';
import { nodeData, frameData } from '../../../plugins/diagram/src/data.ts';
/**
 * D69 编译期：图表的诊断（分组引用 / 成环 / 冲突、连线端点、片段与分组的子元素、按业务域分组的提示）、
 * trace 扩展到分组 / 状态机 / 时序图、布局写进 IR（各步骤共用同一份坐标）、不用新功能的项目 IR 不变。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui'; import * as uiDiagram from '@joplo-app/plugin-diagram';
import { $, feature, flow, layer, option, page, set, shot, type Flow } from '@joplo-app/kit'; import { trace } from '@joplo-app/plugin-diagram';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { cameraAt, compile, type AuthoringProject, type SceneNode } from '../src/index.ts';
import { elkLayout } from '../../../plugins/diagram/src/elk.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
const D = uiDiagram.Diagram;
const SM = uiDiagram.StateMachine;
const Q = uiDiagram.Sequence;

function build(tree: unknown, steps: (f: Flow) => Flow = (f) => f, opts: { layout?: boolean; state?: Record<string, unknown> } = {}) {
  const home = page({ title: 'P', layout: false }, h(ui.Text, { id: 'note' }, 'x'));
  const opt = option({
    name: 'A',
    idea: 'i',
    on: {},
    state: { ui: { show: false }, data: { order: { status: 'created' } }, ...(opts.state ?? {}) },
    layers: { v: layer('视图', tree as never) },
    scenarios: { s: steps(flow('一次', { start: '/' })) },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  return compile(src, 'dev', { pluginOptions: { diagram: { layout: opts.layout === false ? undefined : elkLayout } } });
}
const codes = (r: ReturnType<typeof build>, sev = 'error') => r.diagnostics.filter((d) => d.severity === sev).map((d) => d.code);
const msgs = (r: ReturnType<typeof build>, code: string) => r.diagnostics.filter((d) => d.code === code).map((d) => d.message).join('\n');
const rootOf = (r: ReturnType<typeof build>): SceneNode => Object.values(r.project!.scenes).find((s) => s.layer === 'v')!.root;

describe('诊断：分组、连线、子元素', () => {
  it('group= 指向不存在的分组：UNKNOWN_DIAGRAM_GROUP，列出可用分组', () => {
    const r = build(h(D, { id: 'd' }, h(D.Group, { id: 'runtime', label: '运行时' }), h(D.Node, { id: 'a', label: 'A', group: 'storage' })));
    expect(codes(r)).toContain('UNKNOWN_DIAGRAM_GROUP');
    expect(msgs(r, 'UNKNOWN_DIAGRAM_GROUP')).toContain('group="storage" is not a diagram:Diagram.Group id in this diagram:Diagram (available: runtime)');
  });

  it('分组互相包含（group= 引用成环）：DIAGRAM_GROUP_CYCLE，只报一次', () => {
    const r = build(h(D, { id: 'd' }, h(D.Group, { id: 'a', label: 'A', group: 'b' }), h(D.Group, { id: 'b', label: 'B', group: 'c' }), h(D.Group, { id: 'c', label: 'C', group: 'a' }), h(D.Node, { id: 'n', label: 'N', group: 'a' })));
    expect(codes(r).filter((c) => c === 'DIAGRAM_GROUP_CYCLE')).toHaveLength(1);
    expect(msgs(r, 'DIAGRAM_GROUP_CYCLE')).toMatch(/contain each other/);
  });

  it('嵌套在一个分组里又写了 group= 另一个分组：DIAGRAM_GROUP_CONFLICT', () => {
    const r = build(h(D, { id: 'd' }, h(D.Group, { id: 'x', label: 'X' }, h(D.Node, { id: 'a', label: 'A', group: 'y' })), h(D.Group, { id: 'y', label: 'Y' })));
    expect(codes(r)).toEqual(['DIAGRAM_GROUP_CONFLICT']);
  });

  it('连线端点：可以是节点或分组；都不是时 UNKNOWN_DIAGRAM_NODE；连到包含它的分组：DIAGRAM_EDGE_INTO_OWN_GROUP', () => {
    const ok = build(h(D, { id: 'd' }, h(D.Node, { id: 'a', label: 'A' }), h(D.Group, { id: 'g', label: 'G' }, h(D.Node, { id: 'b', label: 'B' })), h(D.Edge, { from: 'a', to: 'g' })));
    expect(codes(ok)).toEqual([]);
    const bad = build(h(D, { id: 'd' }, h(D.Group, { id: 'g', label: 'G' }, h(D.Node, { id: 'b', label: 'B' })), h(D.Edge, { from: 'b', to: 'g' }), h(D.Edge, { from: 'b', to: 'nope' })));
    expect(codes(bad).sort()).toEqual(['DIAGRAM_EDGE_INTO_OWN_GROUP', 'UNKNOWN_DIAGRAM_NODE']);
  });

  it('icon / tone / pin 写错是 error；节点 kind 写错只是 warning（旧项目兼容）', () => {
    const r = build(h(D, { id: 'd' }, h(D.Group, { id: 'g', label: 'G', icon: 'rocket', tone: 'pink' }, h(D.Node, { id: 'a', label: 'A', pin: 'middle', kind: 'cache' }))));
    expect(codes(r).sort()).toEqual(['ICON_UNKNOWN', 'INVALID_DIAGRAM_PROP', 'INVALID_DIAGRAM_PROP']);
    expect(codes(r, 'warning')).toContain('INVALID_DIAGRAM_PROP');
    expect(msgs(r, 'ICON_UNKNOWN')).toContain('available: client, service');
  });

  it('时序图：消息端点必须是参与者；Group 里不能放消息，Block 里不能放参与者；状态没有 id 报 MISSING_ID', () => {
    const r = build(h(Q, { id: 'q' }, h(Q.Group, { label: '端' }, h(Q.Actor, { id: 'web', label: 'Web' }), h(Q.Message, { from: 'web', to: 'web' })), h(Q.Block, { label: 'x' }, h(Q.Actor, { id: 'api', label: 'API' })), h(Q.Message, { from: 'web', to: 'ghost' })));
    expect(codes(r).sort()).toEqual(['INVALID_DIAGRAM_CHILD', 'INVALID_DIAGRAM_CHILD', 'UNKNOWN_DIAGRAM_NODE']);
    const sm = build(h(SM, { id: 'sm' }, h(SM.State, { label: '无 id' })));
    expect(codes(sm)).toContain('MISSING_ID');
  });

  it('节点多却没有按业务域分组：DIAGRAM_UNGROUPED（info，不影响编译）；有两个以上分组时不提示', () => {
    const nodes = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].map((id) => h(D.Node, { id, label: id }));
    const flat = build(h(D, { id: 'd' }, ...nodes));
    expect(codes(flat, 'info')).toEqual(['DIAGRAM_UNGROUPED']);
    expect(flat.project).not.toBeNull();
    const one = build(h(D, { id: 'd' }, h(D.Group, { id: 'all', label: '全部' }, ...nodes)));
    expect(msgs(one, 'DIAGRAM_UNGROUPED')).toContain('a single group around all of them');
    const two = build(h(D, { id: 'd' }, h(D.Group, { id: 'x', label: 'X' }, ...nodes.slice(0, 3)), h(D.Group, { id: 'y', label: 'Y' }, ...nodes.slice(3))));
    expect(codes(two, 'info')).toEqual([]);
  });

  it('转换与消息没写 id：缺省「from->to」，重复的依次加 ~2、~3（不报 DUPLICATE_ID）', () => {
    const r = build(h(Q, { id: 'q' }, h(Q.Actor, { id: 'a', label: 'A' }), h(Q.Actor, { id: 'b', label: 'B' }), h(Q.Message, { from: 'a', to: 'b' }), h(Q.Message, { from: 'a', to: 'b' }), h(Q.Message, { from: 'a', to: 'b' })));
    expect(codes(r)).toEqual([]);
    const ids = rootOf(r).children!.filter((c) => c.type === 'diagram:Sequence.Message').map((c) => c.id);
    expect(ids).toEqual(['a->b', 'a->b~2', 'a->b~3']);
  });
});

describe('trace：分组、状态机、时序图', () => {
  const arch = h(
    D,
    { id: 'd' },
    h(D.Group, { id: 'gw', label: '网关' }, h(D.Node, { id: 'api', label: 'API' })),
    h(D.Group, { id: 'cloud', label: '云' }, h(D.Group, { id: 'run', label: '运行时' }, h(D.Node, { id: 'svc', label: 'Svc' })), h(D.Group, { id: 'data', label: '存储' }, h(D.Node, { id: 'pg', label: 'PG' }))),
    h(D.Edge, { from: 'api', to: 'svc' }),
    h(D.Edge, { from: 'svc', to: 'pg' }),
    h(D.Edge, { from: 'svc', to: 'data', id: 'to_data' }),
  );

  it('trace() 声明这一步的效果时长：active 连线上的小点至少跑完一圈（编译期按布局算，播放器不查 DOM）', () => {
    const r = build(arch, (f) => f.system('一', trace('api', 'svc')).system('二', trace.fail('svc', 'pg')).system('三', 'x'));
    expect(codes(r)).toEqual([]);
    const [ok, fail, plain] = r.project!.scenarios['f.a.s']!.steps;
    // 一圈至少 0.9 秒，再留 0.2 秒
    expect(ok!.effectHold).toBeGreaterThanOrEqual(1100);
    // 失败的连线不画小点、普通步骤没有效果：都不声明时长
    expect(fail!.effectHold).toBeUndefined();
    expect(plain!.effectHold).toBeUndefined();
  });

  it('组件的显示名与检查抽屉信息来自清单，进 dev IR', () => {
    const dev = build(arch).project!;
    const node = dev.plugins!.diagram!.components['Diagram.Node']!;
    expect(node.label).toMatchObject({ en: expect.any(String), 'zh-CN': expect.any(String) });
    expect(node.inspect!.map((f) => f.props)).toEqual([['description'], ['state']]);
    expect(dev.plugins!.diagram!.components['Diagram.Edge']!.inspect!.some((f) => f.props.join() === 'from,to')).toBe(true);
  });

  it('路径经过的节点所在的各级分组：本步 active，之后 ok；fail 时终点所在的分组 error', () => {
    const r = build(arch, (f) => f.system('一', trace('api', 'svc')).system('二', trace('svc', 'pg')).system('三', trace.fail('svc', 'pg')));
    expect(codes(r)).toEqual([]);
    const s1 = diagramStateAt(r.project!, 'f.a.s', 1);
    expect(s1.gw?.state).toBe('active');
    expect(s1.run?.state).toBe('active');
    expect(s1.cloud?.state).toBe('active');
    expect(s1.data).toBeUndefined();
    const s2 = diagramStateAt(r.project!, 'f.a.s', 2);
    expect(s2.gw?.state).toBe('ok');
    expect(s2.data?.state).toBe('active');
    const s3 = diagramStateAt(r.project!, 'f.a.s', 3);
    expect(s3.data?.state).toBe('error');
    expect(s3.run?.state).toBe('active');
    // 只有最内层分组标红，外层的“云”分组仍是 active
    expect(s3.cloud?.state).toBe('active');
  });

  it('连到分组的连线可以 trace：trace("svc", "data") 走 to_data，分组本身也点亮', () => {
    const r = build(arch, (f) => f.system('写入', trace('svc', 'data')));
    expect(codes(r)).toEqual([]);
    const t = frameData(r.project!.scenarios['f.a.s']!.steps[0]!)!.scenes['f.a~v']!.traces[0]!;
    expect(t.edges).toEqual([{ id: 'to_data', reverse: false }]);
    expect(diagramStateAt(r.project!, 'f.a.s', 1).data?.state).toBe('active');
  });

  it('状态机：trace 状态与转换；写错报 TRACE_UNKNOWN', () => {
    const sm = h(SM, { id: 'sm', value: $.data.order.status }, h(SM.State, { id: 'created', label: '已创建', initial: true }), h(SM.State, { id: 'paid', label: '已支付' }), h(SM.Transition, { from: 'created', to: 'paid', label: '支付' }));
    const r = build(sm, (f) => f.system('支付', set($.data.order.status, 'paid'), trace('created', 'paid')));
    expect(codes(r)).toEqual([]);
    expect(diagramStateAt(r.project!, 'f.a.s', 1)['created->paid']?.state).toBe('active');
    const bad = build(sm, (f) => f.system('x', trace('created', 'shipped')));
    expect(codes(bad)).toEqual(['TRACE_UNKNOWN']);
  });

  it('时序图：trace 消息 id（不要求首尾相接）；镜头对准消息所在的行；同一对参与者多条消息时按节点写报 TRACE_AMBIGUOUS', () => {
    const seq = h(Q, { id: 'q' }, h(Q.Actor, { id: 'web', label: 'Web' }), h(Q.Actor, { id: 'api', label: 'API' }), h(Q.Actor, { id: 'db', label: 'DB' }),
      h(Q.Message, { id: 'm1', from: 'web', to: 'api', label: '请求' }), h(Q.Message, { id: 'm2', from: 'api', to: 'db', label: '查询' }), h(Q.Message, { id: 'm3', from: 'api', to: 'web', label: '响应', reply: true }), h(Q.Message, { id: 'm4', from: 'web', to: 'api', label: '再请求' }));
    const r = build(seq, (f) => f.system('请求', trace('m1')).system('查询并响应', trace('m2', 'm3')));
    expect(codes(r)).toEqual([]);
    expect(cameraAt(r.project!, 'f.a.s', 1).perLayer.v).toEqual(['m1']);
    expect(cameraAt(r.project!, 'f.a.s', 2).perLayer.v).toEqual(['m2', 'm3']);
    const st = diagramStateAt(r.project!, 'f.a.s', 2);
    expect(st.m1?.state).toBe('ok');
    expect(st.m2?.state).toBe('active');
    expect(st.m3?.state).toBe('active');
    const amb = build(seq, (f) => f.system('x', trace('web', 'api')));
    expect(codes(amb)).toEqual(['TRACE_AMBIGUOUS']);
  });
});

describe('布局写进 IR', () => {
  it('每张图表根节点带 layout（ELK）；when 隐藏的元素也在布局里（逐段出现时已有元素不动）', () => {
    const r = build(h(D, { id: 'd' }, h(D.Node, { id: 'a', label: 'A' }), h(D.Node, { id: 'b', label: 'B', when: $.ui.show }), h(D.Edge, { from: 'a', to: 'b', when: $.ui.show })));
    const d = rootOf(r);
    const layout = nodeData(d)!.layout;
    expect(layout.kind).toBe('graph');
    if (layout.kind !== 'graph') throw new Error();
    expect(layout.engine).toBe('elk');
    expect(Object.keys(layout.nodes).sort()).toEqual(['a', 'b']);
    expect(layout.edges['a->b']).toBeDefined();
  });

  it('只有步骤不同的两个项目：图表布局完全相同（坐标只由结构决定）', () => {
    const tree = () => h(D, { id: 'd' }, h(D.Node, { id: 'a', label: 'A' }), h(D.Node, { id: 'b', label: 'B' }), h(D.Node, { id: 'c', label: 'C' }), h(D.Edge, { from: 'a', to: 'b' }), h(D.Edge, { from: 'a', to: 'c' }));
    const one = build(tree(), (f) => f.system('A → B', trace('a', 'b')));
    const two = build(tree(), (f) => f.system('A → C', trace('a', 'c')).system('镜头', shot('a', 'b', 'c')));
    expect(nodeData(rootOf(one))!.layout).toEqual(nodeData(rootOf(two))!.layout);
  });

  it('时序图、状态机都有布局；不传布局引擎时退化为网格（engine = grid），照样不重叠', () => {
    const seq = build(h(Q, { id: 'q' }, h(Q.Actor, { id: 'a', label: 'A' }), h(Q.Actor, { id: 'b', label: 'B' }), h(Q.Message, { from: 'a', to: 'b', label: 'x' })));
    expect(nodeData(rootOf(seq))!.layout?.kind).toBe('sequence');
    const grid = build(h(D, { id: 'd' }, h(D.Node, { id: 'a', label: 'A' }), h(D.Node, { id: 'b', label: 'B' })), (f) => f, { layout: false });
    expect(nodeData(rootOf(grid))!.layout).toMatchObject({ kind: 'graph', engine: 'grid' });
  });

  it('不用新功能的项目：trace 不带 groups / errorGroups / targets（IR 与旧版相同，只多了 layout）', () => {
    const r = build(h(D, { id: 'd' }, h(D.Node, { id: 'a', label: 'A' }), h(D.Node, { id: 'b', label: 'B' }), h(D.Edge, { from: 'a', to: 'b' })), (f) => f.system('x', trace('a', 'b')));
    expect(frameData(r.project!.scenarios['f.a.s']!.steps[0]!)!.scenes['f.a~v']!.traces).toEqual([{ mode: 'ok', nodes: ['a', 'b'], edges: [{ id: 'a->b', reverse: false }] }]);
  });
});
