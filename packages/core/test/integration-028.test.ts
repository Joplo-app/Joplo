import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { nodeData } from '../../../plugins/diagram/src/data.ts';
/**
 * 集成 0.2.8：关系类图表 v2（D69）× 叙事焦点（D70）的组合规则。
 * 1. 看哪里由焦点决定：trace 的焦点对象与镜头目标相同（时序图是消息那一行，不是参与者）；
 * 2. 取景一定带上的归属信息（最内层父分组、时序图两端参与者）算“在镜头里”：给它们的提示不补整层镜头、不报 FOCUS_CONFLICT；
 *    同一分组里的兄弟节点不算（可能被调暗），照旧补整层镜头 / 报 FOCUS_CONFLICT；
 * 3. 图表自己呈现变化（淡入、沿路径画出、trace / value 点亮），默认的结果揭晓不叠加；界面元素照常揭晓；
 * 4. 焦点与镜头都是步骤的纯函数，任意顺序取同一位置结果相同；IR 里的图表布局不随步骤变化。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui'; import * as uiDiagram from '@joplo-app/plugin-diagram';
import { $, callout, feature, flow, highlight, layer, option, page, set, shot, spotlight, type Flow } from '@joplo-app/kit'; import { trace } from '@joplo-app/plugin-diagram';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { cameraAt, compile, focusAt, inShotFrame, validate, type AuthoringProject, type Project, type SceneNode } from '../src/index.ts';
import { elkLayout } from '../../../plugins/diagram/src/elk.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
const D = uiDiagram.Diagram;
const Q = uiDiagram.Sequence;
const SM = uiDiagram.StateMachine;
const SID = 'f.a.s';

const arch = () =>
  h(
    D,
    { id: 'arch', direction: 'right', h: 480 },
    h(D.Group, { id: 'g_gw', label: 'Gateway', icon: 'gateway', tone: 'blue' }, h(D.Node, { id: 'api', label: 'API' })),
    h(D.Group, { id: 'g_run', label: 'Runtime', icon: 'service', tone: 'purple' }, h(D.Node, { id: 'kernel', label: 'Kernel' }), h(D.Node, { id: 'tools', label: 'Tools', kind: 'tool' })),
    h(D.Group, { id: 'g_data', label: 'Storage', icon: 'database' }, h(D.Node, { id: 'pg', label: 'PostgreSQL', kind: 'database' })),
    h(D.Edge, { from: 'api', to: 'kernel', label: 'run' }),
    h(D.Edge, { from: 'kernel', to: 'tools', label: 'call' }),
    h(D.Edge, { from: 'kernel', to: 'pg', label: 'commit' }),
  );
const seq = () =>
  h(
    Q,
    { id: 'login' },
    h(Q.Actor, { id: 'web', label: 'Web', kind: 'client' }),
    h(Q.Actor, { id: 'gw', label: 'API' }),
    h(Q.Actor, { id: 'db', label: 'DB', kind: 'database' }),
    h(Q.Message, { id: 'm_req', from: 'web', to: 'gw', label: 'POST /login' }),
    h(Q.Message, { id: 'm_q', from: 'gw', to: 'db', label: 'find user' }),
  );

/** 有层级的项目：界面层、架构层、时序层。 */
function layered(steps: (f: Flow) => Flow, extra: Record<string, unknown> = {}): { dev: ReturnType<typeof compile>; p: Project } {
  const home = page({ title: 'P', layout: false }, h(ui.Text, { id: 'note' }, 'x'));
  const opt = option({
    name: 'A',
    idea: 'i',
    on: {},
    state: { ui: {}, data: {} },
    layers: {
      app: layer('界面', h(ui.Stack, { id: 'app' }, h(ui.Button, { id: 'run' }, 'Run'), h(ui.Text, { id: 'hint' }, 'hint')) as never),
      backend: layer('后端', arch() as never),
      calls: layer('调用时序', seq() as never),
    },
    scenarios: { s: steps(flow('一次', { start: '/' })) },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/', ...extra }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  const dev = compile(src, 'dev', { pluginOptions: { diagram: { layout: elkLayout } } });
  expect(dev.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return { dev, p: dev.project! };
}

/** 没有层级的项目：一页里有架构图（D 逐段出现）、状态机（value 绑定）和一个界面提示。 */
function paged(steps: (f: Flow) => Flow): Project {
  const tree = h(
    ui.Stack,
    { id: 'root' },
    h(ui.Alert, { id: 'done_alert', title: 'Saved', when: $.ui.saved }, 'ok'),
    h(
      D,
      { id: 'arch2', h: 320 },
      h(D.Group, { id: 'g2_run', label: 'Runtime' }, h(D.Node, { id: 'k2', label: 'Kernel' })),
      h(D.Group, { id: 'g2_data', label: 'Storage' }, h(D.Node, { id: 'd2', label: 'DB', kind: 'database', when: $.ui.showD })),
      h(D.Edge, { id: 'k2_d2', from: 'k2', to: 'd2', when: $.ui.showD }),
    ),
    h(SM, { id: 'task_sm', value: $.data.task.status }, h(SM.State, { id: 'created', label: 'Created', initial: true }), h(SM.State, { id: 'paid', label: 'Paid' }), h(SM.Transition, { from: 'created', to: 'paid', label: 'pay' })),
  );
  const home = page({ title: 'P', layout: false }, tree);
  const opt = option({ name: 'A', idea: 'i', on: {}, state: { ui: { showD: false, saved: false }, data: { task: { status: 'created' } } }, scenarios: { s: steps(flow('一次', { start: '/' })) } });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  const r = compile(src, 'dev', { pluginOptions: { diagram: { layout: elkLayout } } });
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.project!;
}

const codes = (p: Project) => validate(p, { mode: 'all' }).diagnostics.filter((d) => /^(FOCUS_|CALLOUT_)/.test(d.code)).map((d) => d.code);
const layoutOf = (p: Project, id: string): unknown => {
  const find = (n: SceneNode): SceneNode | null => (n.id === id ? n : (n.children ?? []).map(find).find(Boolean) ?? null);
  for (const s of Object.values(p.scenes)) { const f = find(s.root); if (f) return nodeData(f)?.layout; }
  return undefined;
};

describe('组合规则：焦点决定看哪个对象，D69 取景保证带上归属', () => {
  const { p } = layered((f) =>
    f
      .click('run', '点运行')
      .system('一次调用', trace('api', 'kernel', 'pg'))
      .system('父分组的说明', callout('g_run', '运行时在这里'))
      .system('兄弟节点', highlight('tools'))
      .system('推近 kernel，聚光它的分组', shot('kernel'), spotlight('g_run'))
      .system('时序：请求', trace('m_req'), callout('gw', '网关先收到'))
      .system('时序：查询', trace('m_q')),
  );
  const steps = p.scenarios[SID]!.steps;

  it('trace 的焦点对象 = 镜头目标（架构图是路径上的节点，时序图是消息那一行，不是参与者）', () => {
    const f2 = focusAt(p, SID, 2);
    expect(f2).toMatchObject({ subject: 'elements', source: 'explicit', layer: 'backend', targets: ['api', 'kernel', 'pg'] });
    expect(cameraAt(p, SID, 2)).toMatchObject({ directorLayer: 'backend', perLayer: { backend: ['api', 'kernel', 'pg'] } });
    const f7 = focusAt(p, SID, 7);
    expect(f7.layer).toBe('calls');
    expect(f7.targets).toEqual(['m_q']);
    expect(cameraAt(p, SID, 7).perLayer.calls).toEqual(['m_q']);
  });

  it('提示指向镜头目标的最内层父分组：不补整层镜头，镜头保持对准调用链', () => {
    expect(steps[2]!.shots).toEqual([]);
    expect(cameraAt(p, SID, 3).perLayer.backend).toEqual(['api', 'kernel', 'pg']);
    expect(focusAt(p, SID, 3)).toMatchObject({ source: 'explicit', targets: ['g_run'], callouts: [{ target: 'g_run', text: '运行时在这里' }] });
  });

  it('提示指向同一分组里不在镜头里的兄弟节点：补整层镜头（与 D70 原规则一致）', () => {
    expect(steps[3]!.shots).toEqual([{ layer: 'backend', targets: [] }]);
    expect(cameraAt(p, SID, 4).perLayer.backend).toEqual([]);
  });

  it('shot 节点 + 聚光它的父分组、时序图消息 + 标注它的参与者：都不报 FOCUS_CONFLICT；整个场景没有焦点提示', () => {
    expect(steps[5]!.shots).toEqual([{ layer: 'calls', targets: ['m_req'] }]);
    expect(codes(p)).toEqual([]);
  });

  it('镜头与焦点是步骤的纯函数：倒序、跳着取同一位置结果相同；图表布局写在 IR 里，不随步骤变化', () => {
    const n = steps.length;
    const forward = Array.from({ length: n + 1 }, (_, k) => [focusAt(p, SID, k), cameraAt(p, SID, k)]);
    const backward = Array.from({ length: n + 1 }, (_, i) => n - i).map((k) => [focusAt(p, SID, k), cameraAt(p, SID, k)]).reverse();
    expect(backward).toEqual(forward);
    const before = JSON.stringify(layoutOf(p, 'arch'));
    for (let k = 0; k <= n; k++) focusAt(p, SID, k);
    expect(JSON.stringify(layoutOf(p, 'arch'))).toBe(before);
    expect((layoutOf(p, 'arch') as { kind: string }).kind).toBe('graph');
  });

  it('同一步 shot 一个节点、提示指向别的分组里的节点：仍然报 FOCUS_CONFLICT', () => {
    const { p: q } = layered((f) => f.system('推近 kernel', shot('kernel'), callout('pg', '提交到数据库')));
    expect(codes(q)).toEqual(['FOCUS_CONFLICT']);
    const { p: s } = layered((f) => f.system('推近 kernel', shot('kernel'), spotlight('tools')));
    expect(codes(s)).toEqual(['FOCUS_CONFLICT']);
  });

  it('inShotFrame：目标本身、子元素、最内层父分组、时序图两端参与者在镜头里；外层与兄弟不在', () => {
    const backend = Object.values(p.scenes).find((s) => s.layer === 'backend')!.root;
    const calls = Object.values(p.scenes).find((s) => s.layer === 'calls')!.root;
    expect(inShotFrame(backend, 'kernel', ['kernel'])).toBe(true);
    expect(inShotFrame(backend, 'g_run', ['kernel'])).toBe(true);
    expect(inShotFrame(backend, 'kernel', ['g_run'])).toBe(true);
    expect(inShotFrame(backend, 'tools', ['kernel'])).toBe(false);
    expect(inShotFrame(backend, 'g_data', ['kernel'])).toBe(false);
    expect(inShotFrame(backend, 'arch', ['kernel'])).toBe(false);
    expect(inShotFrame(calls, 'web', ['m_req'])).toBe(true);
    expect(inShotFrame(calls, 'db', ['m_req'])).toBe(false);
    expect(inShotFrame(backend, 'kernel', [])).toBe(false);
  });
});

describe('图表自己呈现变化：默认结果揭晓不叠加在图表上', () => {
  const p = paged((f) =>
    f
      .system('状态机前进', set($.data.task.status, 'paid'))
      .system('存储出现', set($.ui.showD, true))
      .system('界面提示出现', set($.ui.saved, true)),
  );

  it('状态机 value 变化、图表节点与连线逐段出现：焦点对象照常推导，但不画揭晓', () => {
    const f1 = focusAt(p, SID, 1);
    expect(f1.source).toBe('auto');
    expect(f1.targets).toContain('task_sm');
    expect(f1.reveal).toEqual([]);
    const f2 = focusAt(p, SID, 2);
    expect(f2.targets.some((id) => id === 'd2' || id === 'k2_d2' || id === 'g2_data')).toBe(true);
    expect(f2.reveal).toEqual([]);
  });

  it('界面元素照常揭晓（默认行为没有被一并关掉）', () => {
    expect(focusAt(p, SID, 3).reveal).toEqual(['done_alert']);
  });
});

describe('autoFocus 关闭：图表与镜头的结果与默认开启时相同，只少了默认呈现', () => {
  it('镜头、导演层、步骤镜头都一样；reveal 恒为空', () => {
    const steps = (f: Flow) => f.click('run').system('一次调用', trace('api', 'kernel', 'pg')).system('时序', trace('m_req')).system('回到整层', shot());
    const on = layered(steps).p;
    const off = layered(steps, { autoFocus: false }).p;
    expect(off.autoFocus).toBe(false);
    const n = on.scenarios[SID]!.steps.length;
    for (let k = 0; k <= n; k++) {
      expect(cameraAt(off, SID, k)).toEqual(cameraAt(on, SID, k));
      expect(focusAt(off, SID, k).reveal).toEqual([]);
      expect({ ...focusAt(off, SID, k), reveal: [] }).toEqual({ ...focusAt(on, SID, k), reveal: [] });
    }
    expect(off.scenarios[SID]!.steps.map((s) => s.shots)).toEqual(on.scenarios[SID]!.steps.map((s) => s.shots));
  });
});
