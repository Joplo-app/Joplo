import { diagramFit } from '../../../plugins/diagram/src/render-layout.ts';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { diagramStateAt } from '../../../plugins/diagram/src/state.ts';
import { nodeData, frameData } from '../../../plugins/diagram/src/data.ts';
/**
 * 调用链 trace()（D48）：编译进 IR 的 frameData(Step)!.scenes['f.a~backend']!.traces、TRACE_UNKNOWN / TRACE_AMBIGUOUS、diagramStateAt 的推算规则、
 * trace 相当于 shot（导演层、镜头目标、与 shot 合并）、发布站保留，以及旧写法（$.ui 绑定 + set）结果不变。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui'; import * as uiDiagram from '@joplo-app/plugin-diagram';
import { $, feature, flow, layer, work, page, set, shot, type Flow } from '@joplo-app/kit'; import { trace } from '@joplo-app/plugin-diagram';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { cameraAt, compile, resolveProps, stateAt, type AuthoringProject, type Project } from '../src/index.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
const D = uiDiagram.Diagram;

/** 客户端层：发送按钮；后端层：app → biz → billing / brain，biz ⇄ brain 往返，brain → llm，queue → billing。 */
function build(steps: (f: Flow) => Flow, opts: { edgeState?: boolean; extraEdges?: unknown[] } = {}) {
  const home = page({ title: 'P', layout: false }, h(ui.Text, { id: 'note' }, '路径页面'));
  const st = (k: string) => (opts.edgeState ? { state: $.ui[k as 'x'] } : {});
  const client = h(ui.Stack, null, h(ui.Button, { id: 'send' }, '发送'));
  const backend = h(
    D,
    { id: 'arch' },
    h(D.Node, { id: 'app', label: 'App', ...st('n_app') }),
    h(D.Node, { id: 'biz', label: 'Biz', ...st('n_biz') }),
    h(D.Node, { id: 'billing', label: 'Billing', ...st('n_billing') }),
    h(D.Node, { id: 'brain', label: 'Brain' }),
    h(D.Node, { id: 'llm', label: 'LLM' }),
    h(D.Node, { id: 'queue', label: 'SQS' }),
    h(D.Edge, { id: 'e_app_biz', from: 'app', to: 'biz', ...st('e_app_biz') }),
    h(D.Edge, { id: 'e_biz_billing', from: 'biz', to: 'billing' }),
    h(D.Edge, { id: 'e_biz_brain', from: 'biz', to: 'brain' }),
    h(D.Edge, { id: 'e_brain_biz', from: 'brain', to: 'biz' }),
    h(D.Edge, { from: 'brain', to: 'llm' }),
    h(D.Edge, { id: 'e_q1', from: 'queue', to: 'billing' }),
    h(D.Edge, { id: 'e_q2', from: 'queue', to: 'billing' }),
    ...((opts.extraEdges ?? []) as never[]),
  );
  const opt = work({
    title: 'A',
    summary: 'i',
    on: {},
    state: { ui: { n_app: 'idle', n_biz: 'idle', n_billing: 'idle', e_app_biz: 'idle' } },
    layers: { client: layer('客户端视角', client as never), backend: layer('后端流转', backend as never) },
    scenarios: { s: steps(flow('一次', { start: '/' })) },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, works: { a: { ...opt, ...F('features/f/works/a.tsx') } } } },
  };
  return { dev: compile(src, 'dev'), publish: compile(src, 'publish') };
}
const sid = 'f.a.s';
const errors = (r: ReturnType<typeof build>['dev']) => r.diagnostics.filter((d) => d.severity === 'error');

/** 五步示例：与 authoring 主题里的示例一致。 */
const five = (f: Flow) =>
  f
    .click('send', '用户发出任务', trace('app', 'biz'))
    .system('额度预检', '调用模型之前，先向 Billing 预检额度', trace('biz', 'billing'))
    .system('交给大脑', trace('biz', 'brain', 'llm'), trace.skip('queue'))
    .system('工具调用', trace('e_brain_biz'))
    .system('扣费失败', trace.fail('biz', 'billing'));

describe('trace() 编译进 IR', () => {
  it('requested design scale enlarges the whole diagram while respecting its frame', () => {
    expect(diagramFit({ width: 500, height: 200 }, 1920, 1080, 2).scale).toBe(2);
    expect(diagramFit({ width: 500, height: 200 }, 508, 208, 2).scale).toBe(1);
    expect(diagramFit({ width: 500, height: 200 }, 1920, 1080).scale).toBe(1);
  });
  it('focus:false keeps trace state and timing without a host shot', () => {
    const { dev } = build(f => f.system('Only highlight', trace('app', 'biz', { focus: false })));
    expect(errors(dev)).toEqual([]);
    const step = dev.project!.scenarios[sid]!.steps[0]!;
    expect(step.shots ?? []).toEqual([]);
    expect(frameData(step)!.scenes['f.a~backend']!.traces).toHaveLength(1);
  });

  it('多段路径解析成节点与连线；没写 id 的连线用缺省的 from->to；写连线 id 时取它两端；参数顺序就是节点顺序', () => {
    const { dev } = build(five);
    expect(errors(dev)).toEqual([]);
    const steps = dev.project!.scenarios[sid]!.steps;
    expect(frameData(steps[0]!)!.scenes['f.a~backend']!.traces).toEqual([{ mode: 'ok', nodes: ['app', 'biz'], edges: [{ id: 'e_app_biz', reverse: false }] }]);
    expect(frameData(steps[2]!)!.scenes['f.a~backend']!.traces).toEqual([
      { mode: 'ok', nodes: ['biz', 'brain', 'llm'], edges: [{ id: 'e_biz_brain', reverse: false }, { id: 'brain->llm', reverse: false }] },
      { mode: 'skip', nodes: ['queue'], edges: [] },
    ]);
    expect(frameData(steps[3]!)!.scenes['f.a~backend']!.traces).toEqual([{ mode: 'ok', nodes: ['brain', 'biz'], edges: [{ id: 'e_brain_biz', reverse: false }] }]);
    expect(frameData(steps[4]!)!.scenes['f.a~backend']!.traces[0]).toMatchObject({ mode: 'fail', nodes: ['biz', 'billing'] });
    // trace 不是状态变化
    expect(steps.every((s) => s.effects.length === 0)).toBe(true);
  });
  it('反向也算：trace(billing, biz) 沿 e_biz_billing 逆向走；同向优先（biz⇄brain 各有一条时不算歧义）', () => {
    const { dev } = build((f) => f.system('回调', trace('billing', 'biz')).system('往返', trace('brain', 'biz')));
    expect(errors(dev)).toEqual([]);
    const steps = dev.project!.scenarios[sid]!.steps;
    expect(frameData(steps[0]!)!.scenes['f.a~backend']!.traces[0]!.edges).toEqual([{ id: 'e_biz_billing', reverse: true }]);
    expect(frameData(steps[1]!)!.scenes['f.a~backend']!.traces[0]!.edges).toEqual([{ id: 'e_brain_biz', reverse: false }]);
  });
  it('找不到连线、未知 id、不在同一个 Diagram：TRACE_UNKNOWN（带 at）；同一方向有多条连线：TRACE_AMBIGUOUS', () => {
    const { dev } = build((f) => f.system('a', trace('app', 'billing')).system('b', trace('nope')).system('c', trace('queue', 'billing')).system('d', trace()));
    const codes = dev.diagnostics.map((d) => [d.code, d.at?.replace(/:\d+:\d+$/, '')]);
    expect(codes.filter(([c]) => c === 'TRACE_UNKNOWN')).toHaveLength(3);
    expect(codes.filter(([c]) => c === 'TRACE_AMBIGUOUS')).toHaveLength(1);
    for (const d of dev.diagnostics.filter((x) => x.code.startsWith('TRACE_'))) {
      expect(d.severity).toBe('error');
      expect(d.at).toBeTruthy();
    }
    expect(dev.diagnostics.find((d) => d.code === 'TRACE_AMBIGUOUS')!.message).toContain('e_q1');
    // 写连线 id 就不歧义
    expect(errors(build((f) => f.system('a', trace('e_q2'))).dev)).toEqual([]);
  });
  it('发布模式保留 trace 数据', () => {
    const { publish } = build(five);
    expect(frameData(publish.project!.scenarios[sid]!.steps[1]!)!.scenes['f.a~backend']!.traces).toEqual([{ mode: 'ok', nodes: ['biz', 'billing'], edges: [{ id: 'e_biz_billing', reverse: false }] }]);
  });
});

describe('diagramStateAt（推算规则）', () => {
  const p = build(five).dev.project!;
  const at = (pos: number) => diagramStateAt(p, sid, pos);
  it('从未涉及：idle（不在结果里）；本步 trace 到：active；之前 trace 过、本步没再 trace：ok', () => {
    expect(at(0)).toEqual({});
    expect(at(1)).toEqual({ app: { state: 'active' }, biz: { state: 'active' }, e_app_biz: { state: 'active' } });
    const s2 = at(2);
    expect(s2.app).toEqual({ state: 'ok' });
    expect(s2.e_app_biz).toEqual({ state: 'ok' });
    expect(s2.biz).toEqual({ state: 'active' }); // 本步又被 trace
    expect(s2.billing).toEqual({ state: 'active' });
    expect(s2.llm).toBeUndefined();
  });
  it('trace.skip：dim；trace.fail：连线与终点 error，起点 active；error 保持到场景结束', () => {
    expect(at(3).queue).toEqual({ state: 'dim' });
    expect(at(3)['brain->llm']).toEqual({ state: 'active' });
    const s5 = at(5);
    expect(s5.billing).toEqual({ state: 'error' });
    expect(s5.e_biz_billing).toEqual({ state: 'error' });
    expect(s5.biz).toEqual({ state: 'active' });
    expect(s5.queue).toEqual({ state: 'dim' });
    expect(at(99)).toEqual(s5);
  });
  it('trace.skip 的参数是一组节点，不是路径：彼此没有连线也不报错，全部标为 dim', () => {
    const r = build((f) => f.system('拦下', trace.fail('biz', 'billing'), trace.skip('brain', 'llm', 'queue')).system('结束'));
    expect(r.dev.diagnostics.filter((d) => d.code === 'TRACE_UNKNOWN')).toEqual([]);
    const s = diagramStateAt(r.dev.project!, sid, 1);
    expect(s.brain).toEqual({ state: 'dim' });
    expect(s.llm).toEqual({ state: 'dim' });
    expect(s.queue).toEqual({ state: 'dim' });
    expect(s['brain->llm']).toBeUndefined(); // skip 不点亮任何连线
  });
  it('error 之后又被 trace 成功：回到 active（之后 ok）；逆向走的连线带 reverse', () => {
    const q = build((f) => f.system('失败', trace.fail('biz', 'billing')).system('没事').system('重试', trace('billing', 'biz')).system('结束')).dev.project!;
    expect(diagramStateAt(q, sid, 2).billing).toEqual({ state: 'error' });
    expect(diagramStateAt(q, sid, 3).e_biz_billing).toEqual({ state: 'active', reverse: true });
    expect(diagramStateAt(q, sid, 4).e_biz_billing).toEqual({ state: 'ok' });
    expect(diagramStateAt(q, null, 3)).toEqual({});
  });
});

describe('trace 相当于 shot', () => {
  it('节点作为镜头目标、所在层参与导演层的选择；参数顺序有意义；与同一步的 shot 合并（先写的先算）', () => {
    const p = build((f) => f.system('a', trace('biz', 'billing')).system('b', shot('send'), trace('brain', 'llm')).system('c', trace.skip('queue'))).dev.project!;
    const st = p.scenarios[sid]!.steps;
    expect(st[0]!.directorLayer).toBe('backend');
    expect(st[0]!.shots).toEqual([{ layer: 'backend', targets: ['biz', 'billing'] }]);
    // shot('send') 在前：导演层是客户端；trace 的节点合并到后端层的镜头里
    expect(st[1]!.directorLayer).toBe('client');
    expect(st[1]!.shots).toEqual([{ layer: 'client', targets: ['send'] }, { layer: 'backend', targets: ['brain', 'llm'] }]);
    expect(cameraAt(p, sid, 2).perLayer.backend).toEqual(['brain', 'llm']);
    // trace.skip 不移动镜头
    expect(st[2]!.shots).toEqual([]);
  });
});

describe('旧写法不变：$.ui 绑定 + set 驱动 state', () => {
  it('没有 trace 时推算为空；显式 state 绑定照常由 set 改变（与之前的结果一致）', () => {
    const p: Project = build((f) => f.system('预检', set($.ui.n_biz, 'active'), set($.ui.e_app_biz, 'active')).system('完成', set($.ui.n_biz, 'ok')), { edgeState: true }).dev.project!;
    expect(diagramStateAt(p, sid, 2)).toEqual({});
    const scene = p.scenes[p.works['f.a']!.layers.backend!.sceneId]!;
    const find = (n: typeof scene.root, id: string): typeof scene.root | undefined => (n.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean));
    const biz = find(scene.root, 'biz')!;
    const edge = find(scene.root, 'e_app_biz')!;
    expect(resolveProps(biz, stateAt(p, sid, 1)).state).toBe('active');
    expect(resolveProps(edge, stateAt(p, sid, 1)).state).toBe('active');
    expect(resolveProps(biz, stateAt(p, sid, 2)).state).toBe('ok');
    expect(resolveProps(biz, stateAt(p, sid, 0)).state).toBe('idle');
    // 没写 state 的节点：属性里没有 state，渲染器用推算值（这里是 idle）
    expect(resolveProps(find(scene.root, 'brain')!, stateAt(p, sid, 2)).state).toBeUndefined();
  });
});
