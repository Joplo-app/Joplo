/**
 * 编译期图表布局（D67，ELK layered + 层级处理）的不变量：
 * - 确定：同一结构 → 同一坐标（同一进程、另一个进程都一样）；state / when / trace 不参与结构，不移动任何节点；
 * - 分组包含它的全部子节点（含嵌套分组），分组之间、节点之间不重叠，组外节点不压在分组上；
 * - 连线不穿过别的节点，终点落在目标（节点或分组）边上；回边按源码顺序决定，往返连线分开；
 * - 连线标签互不重叠，不压住节点；状态机的起点圆点指向初始状态。
 * 由 web 端 diagram-layout.test.ts / diagram-route.test.ts（浏览器 dagre 布局，已移除）移植而来。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { START, graphStructure, layoutSequence, sequenceStructure, structureKey, type Box, type GraphLayout, type Point, type SceneNode } from '../src/index.ts';
import { elkLayout } from '../src/node.ts';

const N = (id: string, label: string, extra: Record<string, unknown> = {}): SceneNode => ({ id, type: 'Diagram.Node', props: { label, ...extra } });
const E = (from: string, to: string, extra: Record<string, unknown> = {}): SceneNode => ({ id: (extra.id as string) ?? `${from}->${to}`, type: 'Diagram.Edge', props: { from, to, ...extra } });
const G = (id: string, label: string, children: SceneNode[], extra: Record<string, unknown> = {}): SceneNode => ({ id, type: 'Diagram.Group', props: { label, ...extra }, children });
const layout = (n: SceneNode) => elkLayout(graphStructure(n));

/** 夹具：8 个节点、两个分组（其中一个嵌套）、同步与异步连线。state 用参数注入。 */
function fixture(state: (k: string) => string = () => 'idle', extra: SceneNode[] = [], direction = 'right'): SceneNode {
  return {
    id: 'arch',
    type: 'Diagram',
    props: { direction, h: 520 },
    children: [
      N('client', '客户端', { kind: 'client', state: state('client') }),
      G('aws', 'AWS', [
        N('brain', 'Agent 大脑', { kind: 'service', description: '推理循环，只发出工具调用', state: state('brain') }),
        N('llm', 'Bedrock', { kind: 'model', state: state('llm') }),
        G('tools', '工具定义', [N('registry', '工具注册表', { kind: 'storage' })]),
      ]),
      N('impl', '工具实现', { kind: 'tool' }),
      N('biz', 'Biz Server', { kind: 'service' }),
      N('billing', 'Billing', { kind: 'database' }),
      N('queue', '用量队列', { kind: 'queue' }),
      E('client', 'brain', { label: '发送消息', state: state('e1') }),
      E('brain', 'llm', { label: '推理' }),
      E('brain', 'registry', { label: '查工具定义' }),
      E('brain', 'impl', { label: '工具调用' }),
      E('impl', 'biz', { label: '业务 API' }),
      E('brain', 'queue', { label: '用量事件', async: true }),
      E('queue', 'billing', { async: true }),
      ...extra,
    ],
  };
}

/** 与 examples/agent-arch/shared/arch.tsx 相同的结构（v = a：混合的手；v = b：全云端）。 */
export function agentArch(v: 'a' | 'b', direction: 'right' | 'down'): SceneNode {
  const n = (id: string, label: string, kind: string, description: string) => N(id, label, { kind, description, state: `$ui.n_${id}` });
  return {
    id: 'arch',
    type: 'Diagram',
    props: { direction, h: 640 },
    children: [
      G('g_device', '用户设备', [n('app', '客户端界面', 'client', '对话、确认弹窗'), ...(v === 'a' ? [n('local', '端侧执行器', 'tool', '手：read_files、delete_files')] : [])], { icon: 'device' }),
      G('g_aws', 'AWS', [
        G('g_ctrl', '控制面', [n('biz', 'Biz Server', 'service', '鉴权 · 会话 · 审计 · 转发'), n('registry', 'Tool Registry', 'database', '工具定义：名称 · schema · 危险级别 · 单价'), n('db', 'DynamoDB', 'database', '会话与审计日志')]),
        G('g_brain', '大脑', [n('brain', 'Agent 大脑', 'service', 'ECS：规划，只产出工具调用'), n('llm', 'Bedrock', 'model', 'Claude 模型')]),
        G('g_hands', '云端的手', [n('sandbox', '云端沙箱', 'tool', v === 'a' ? 'Fargate：make_sheet 等云端工具' : 'Fargate：所有工具'), ...(v === 'b' ? [n('s3', 'S3 上传区', 'storage', '用户上传的本机文件')] : [])]),
        G('g_bill', '计费', [n('queue', 'SQS', 'queue', '用量事件'), n('billing', 'Billing', 'service', '额度 · 计量 · 扣费')]),
      ], { icon: 'cloud' }),
      E('app', 'biz', { id: 'e_app_biz', label: '消息 ⇄ 回答' }),
      E('biz', 'billing', { id: 'e_biz_billing', label: '① 额度预检' }),
      E('biz', 'registry', { id: 'e_biz_registry', label: '② 取工具定义' }),
      E('biz', 'db', { id: 'e_biz_db', label: '会话 · 审计', async: true }),
      E('biz', 'brain', { id: 'e_biz_brain', label: '③ 任务 + 工具定义' }),
      E('brain', 'llm', { id: 'e_brain_llm', label: '④ 推理' }),
      E('brain', 'biz', { id: 'e_brain_biz', label: '⑤ 工具调用（只发出）' }),
      ...(v === 'a'
        ? [E('biz', 'local', { id: 'e_biz_local', label: '下发端侧工具' })]
        : [E('app', 's3', { id: 'e_app_s3', label: '上传本机文件' }), E('sandbox', 's3', { id: 'e_sandbox_s3', label: '读取' })]),
      E('biz', 'sandbox', { id: 'e_biz_sandbox', label: '下发云端工具' }),
      E('brain', 'queue', { id: 'e_brain_queue', label: '用量事件', async: true }),
      E('queue', 'billing', { id: 'e_queue_billing', label: '入账（幂等）', async: true }),
    ],
  };
}

const inside = (pt: Point, b: Box, shrink = 2) => pt.x > b.x + shrink && pt.x < b.x + b.w - shrink && pt.y > b.y + shrink && pt.y < b.y + b.h - shrink;
const within = (b: Box, outer: Box) => b.x >= outer.x - 0.01 && b.y >= outer.y - 0.01 && b.x + b.w <= outer.x + outer.w + 0.01 && b.y + b.h <= outer.y + outer.h + 0.01;
const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
function samples(points: Point[], step = 4): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}
const distToPolyline = (p: Point, pts: Point[]) => {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y))));
  }
  return best;
};

/** 分组几何不变量：包住全部后代，组外节点不压上去，不相关的分组互不交叠。 */
function checkGroups(n: SceneNode, l: GraphLayout) {
  const s = graphStructure(n);
  const parentOf = new Map<string, string | null>([...s.nodes.map((x) => [x.id, x.parent] as const), ...s.groups.map((g) => [g.id, g.parent] as const)]);
  const ancestors = (id: string): string[] => {
    const out: string[] = [];
    for (let q = parentOf.get(id) ?? null; q; q = parentOf.get(q) ?? null) out.push(q);
    return out;
  };
  for (const gr of s.groups) {
    const gb = l.groups[gr.id]!;
    expect(gb, gr.id).toBeDefined();
    if (l.titles[gr.id]) expect(within(l.titles[gr.id]!, gb), `${gr.id} 的标题在分组框内`).toBe(true);
    for (const [id, b] of Object.entries(l.nodes)) {
      if (ancestors(id).includes(gr.id)) expect(within(b, gb), `${id} 应在 ${gr.id} 内`).toBe(true);
      else expect(area(b, gb), `组外节点 ${id} 压在 ${gr.id} 上`).toBe(0);
    }
    for (const other of s.groups) {
      if (other.id === gr.id || ancestors(other.id).includes(gr.id) || ancestors(gr.id).includes(other.id)) continue;
      expect(area(gb, l.groups[other.id]!), `${gr.id} 与 ${other.id} 交叠`).toBe(0);
    }
  }
  const ids = Object.keys(l.nodes);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expect(area(l.nodes[ids[i]!]!, l.nodes[ids[j]!]!), `${ids[i]} 与 ${ids[j]} 重叠`).toBe(0);
}

describe('确定性与稳定', () => {
  it('结构相同 → 坐标完全相同；引擎是 ELK', () => {
    const a = layout(fixture());
    const b = layout(fixture());
    expect(b).toEqual(a);
    expect(a.engine).toBe('elk');
    expect(Object.keys(a.nodes)).toHaveLength(8);
  });

  it('另一个进程（全新的 ELK 实例）算出完全相同的坐标', () => {
    const n = agentArch('a', 'down');
    const file = join(tmpdir(), `joplo-elk-${process.pid}.json`);
    writeFileSync(file, JSON.stringify(graphStructure(n)));
    const script = `import { readFileSync } from 'node:fs'; import { elkLayout } from ${JSON.stringify(join(import.meta.dirname, '../src/node.ts'))}; process.stdout.write(JSON.stringify(elkLayout(JSON.parse(readFileSync(${JSON.stringify(file)}, 'utf8')))));`;
    const out = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8', cwd: join(import.meta.dirname, '..') });
    expect(JSON.parse(out)).toEqual(layout(n));
  });

  it('state（字面量或绑定）、when 不改变结构键，也不移动任何节点', () => {
    const idle = graphStructure(fixture());
    const active = graphStructure(fixture((k) => (k === 'e1' ? 'active' : k === 'brain' ? 'error' : 'ok')));
    const bound = graphStructure(fixture((k) => `$ui.s_${k}`));
    expect(structureKey(active)).toBe(structureKey(idle));
    expect(structureKey(bound)).toBe(structureKey(idle));
    const grouped = fixture();
    grouped.children = grouped.children!.map((c) => ({ ...c, when: { not: '$ui.hide' } as never }));
    expect(structureKey(graphStructure(grouped))).toBe(structureKey(idle));
    expect(layout(grouped)).toEqual(layout(fixture()));
  });

  it('结构变化（增删节点或连线）才重新布局', () => {
    const more = graphStructure(fixture(undefined, [N('cdn', 'CDN', { kind: 'external' }), E('client', 'cdn')]));
    expect(structureKey(more)).not.toBe(structureKey(graphStructure(fixture())));
    expect(Object.keys(elkLayout(more).nodes)).toContain('cdn');
  });

  it('边界输入：空图、连线指向不存在的节点、只有空分组都不抛异常', () => {
    expect(layout({ id: 'd', type: 'Diagram' })).toMatchObject({ width: 0, height: 0 });
    expect(Object.keys(layout({ id: 'd', type: 'Diagram', children: [N('a', 'A'), E('a', 'ghost')] }).edges)).toEqual([]);
    const l = layout({ id: 'd', type: 'Diagram', children: [G('g', '空分组', []), N('a', 'A')] });
    expect(l.groups.g).toBeDefined();
  });
});

describe('几何：分组、连线、标签', () => {
  it('连线不穿过任何节点（除了它的两端）；终点落在目标节点边上', () => {
    for (const dir of ['right', 'down']) {
      const s = graphStructure(fixture(undefined, [], dir));
      const l = elkLayout(s);
      for (const e of s.edges) {
        const route = l.edges[e.id]!.points;
        expect(route.length, e.id).toBeGreaterThanOrEqual(2);
        for (const [id, box] of Object.entries(l.nodes)) {
          if (id === e.from || id === e.to) continue;
          expect(samples(route).find((pt) => inside(pt, box)), `${dir}: 连线 ${e.id} 穿过了节点 ${id}`).toBeUndefined();
        }
        const end = route[route.length - 1]!;
        const to = l.nodes[e.to]!;
        expect(end.x >= to.x - 2 && end.x <= to.x + to.w + 2 && end.y >= to.y - 2 && end.y <= to.y + to.h + 2, `${e.id} 的终点应在 ${e.to} 边上`).toBe(true);
      }
      checkGroups(fixture(undefined, [], dir), l);
    }
  });

  for (const v of ['a', 'b'] as const)
    for (const dir of ['right', 'down'] as const) {
      const n = agentArch(v, dir);
      const s = graphStructure(n);
      const l = elkLayout(s);
      it(`agent-arch ${v}/${dir}：分组包住成员，不压组外节点；分组之间、节点之间不交叠`, () => checkGroups(n, l));
      it(`agent-arch ${v}/${dir}：连线不穿过别的节点；标签互不重叠、不压节点；往返连线 biz⇄brain 分开`, () => {
        for (const e of s.edges) {
          const route = l.edges[e.id]!.points;
          for (const [id, box] of Object.entries(l.nodes)) if (id !== e.from && id !== e.to) expect(samples(route).find((pt) => inside(pt, box)), `${e.id} 穿过节点 ${id}`).toBeUndefined();
        }
        const labels = Object.entries(l.edges).filter(([, e]) => e.label).map(([id, e]) => [id, e.label!] as const);
        expect(labels.length).toBe(s.edges.filter((e) => e.label).length);
        for (let i = 0; i < labels.length; i++) {
          for (let j = i + 1; j < labels.length; j++) expect(area(labels[i]![1], labels[j]![1]), `${labels[i]![0]} 与 ${labels[j]![0]}`).toBe(0);
          for (const [id, b] of Object.entries(l.nodes)) expect(area(labels[i]![1], b), `${labels[i]![0]} 压住节点 ${id}`).toBe(0);
        }
        const go = l.edges.e_biz_brain!.points;
        const back = l.edges.e_brain_biz!.points;
        const close = samples(go).filter((pt) => distToPolyline(pt, back) < 4).length / samples(go).length;
        expect(close, '往返连线叠在一起').toBeLessThan(0.05);
      });
      it(`agent-arch ${v}/${dir}：回边按源码顺序（biz → brain 先写，brain → biz 是回边），箭头方向保持作者写的方向`, () => {
        const back = l.edges.e_brain_biz!.points;
        const brain = l.nodes.brain!;
        const biz = l.nodes.biz!;
        const at = (p: Point, b: Box) => p.x >= b.x - 2 && p.x <= b.x + b.w + 2 && p.y >= b.y - 2 && p.y <= b.y + b.h + 2;
        expect(at(back[0]!, brain), '起点在 brain').toBe(true);
        expect(at(back[back.length - 1]!, biz), '终点在 biz').toBe(true);
        // 主流向：客户端在 Biz Server 的上游（down：在上面；right：在左边）
        const app = l.nodes.app!;
        if (dir === 'down') expect(app.y).toBeLessThan(biz.y);
        else expect(app.x).toBeLessThan(biz.x);
      });
    }

  it('连线可以连到分组：终点落在分组框的边上', () => {
    const n: SceneNode = { id: 'd', type: 'Diagram', props: { direction: 'right' }, children: [N('api', 'API'), G('data', '存储', [N('pg', 'PostgreSQL', { kind: 'database' }), N('redis', 'Redis', { kind: 'database' })]), E('api', 'data', { id: 'e', label: '读写' })] };
    const l = layout(n);
    const pts = l.edges.e!.points;
    const end = pts[pts.length - 1]!;
    const g = l.groups.data!;
    const onEdge = Math.min(Math.abs(end.x - g.x), Math.abs(end.x - g.x - g.w), Math.abs(end.y - g.y), Math.abs(end.y - g.y - g.h));
    expect(onEdge).toBeLessThanOrEqual(2);
    checkGroups(n, l);
  });

  it('group="…" 引用与嵌套得到同一个布局', () => {
    const nested: SceneNode = { id: 'd', type: 'Diagram', children: [G('g', 'G', [N('a', 'A'), N('b', 'B')]), N('c', 'C'), E('a', 'c'), E('b', 'c')] };
    const flat: SceneNode = { id: 'd', type: 'Diagram', children: [G('g', 'G', []), N('a', 'A', { group: 'g' }), N('b', 'B', { group: 'g' }), N('c', 'C'), E('a', 'c'), E('b', 'c')] };
    const ln = layout(nested);
    const lf = layout(flat);
    for (const id of ['a', 'b', 'c']) expect(lf.nodes[id]).toBeDefined();
    checkGroups(flat, lf);
    expect(within(lf.nodes.a!, lf.groups.g!) && within(lf.nodes.b!, lf.groups.g!)).toBe(true);
    expect(Object.keys(ln.groups)).toEqual(Object.keys(lf.groups));
  });

  it('pin="end"：节点放到所在分组的最后一层', () => {
    const n = (pin?: string): SceneNode => ({ id: 'd', type: 'Diagram', props: { direction: 'right' }, children: [G('g', 'G', [N('a', 'A'), N('b', 'B'), N('c', 'C'), N('x', 'X', pin ? { pin } : {})]), E('a', 'b'), E('b', 'c'), E('a', 'x')] });
    const free = layout(n());
    const pinned = layout(n('end'));
    expect(free.nodes.x!.x).toBeLessThan(free.nodes.c!.x);
    expect(pinned.nodes.x!.x).toBeCloseTo(pinned.nodes.c!.x, 0);
  });

  it('随机结构（20 张，确定的生成器）：分组与节点几何不变量都成立', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let k = 0; k < 20; k++) {
      const groups: SceneNode[] = [];
      const loose: SceneNode[] = [];
      const ids: string[] = [];
      const gn = 1 + Math.floor(rnd() * 4);
      for (let g = 0; g < gn; g++) {
        const kids: SceneNode[] = [];
        const nn = 1 + Math.floor(rnd() * 4);
        for (let i = 0; i < nn; i++) {
          const id = `n${g}_${i}`;
          ids.push(id);
          kids.push(N(id, `节点 ${id}`, { description: rnd() > 0.5 ? '说明文字' : undefined }));
        }
        if (rnd() > 0.6 && groups.length) groups[groups.length - 1]!.children!.push(G(`g${g}`, `分组 ${g}`, kids));
        else groups.push(G(`g${g}`, `分组 ${g}`, kids));
      }
      for (let i = 0; i < 2; i++) {
        ids.push(`x${i}`);
        loose.push(N(`x${i}`, `独立 ${i}`));
      }
      const edges: SceneNode[] = [];
      const en = ids.length + Math.floor(rnd() * ids.length);
      for (let i = 0; i < en; i++) {
        const a = ids[Math.floor(rnd() * ids.length)]!;
        const b = ids[Math.floor(rnd() * ids.length)]!;
        if (a !== b) edges.push(E(a, b, { id: `e${i}`, label: rnd() > 0.5 ? `调用 ${i}` : undefined }));
      }
      const n: SceneNode = { id: 'd', type: 'Diagram', props: { direction: rnd() > 0.5 ? 'down' : 'right' }, children: [...groups, ...loose, ...edges] };
      const l = layout(n);
      checkGroups(n, l);
      for (const e of edges) expect(l.edges[e.id]!.points.length, `${k}: ${e.id}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('状态机与时序图的布局', () => {
  it('状态机：起点圆点在初始状态的上游，连线指向初始状态；终态尺寸更大（双线）', () => {
    const S = (id: string, extra: Record<string, unknown> = {}): SceneNode => ({ id, type: 'StateMachine.State', props: { label: id, ...extra } });
    const T = (from: string, to: string): SceneNode => ({ id: `${from}->${to}`, type: 'StateMachine.Transition', props: { from, to, label: `${from} 到 ${to}` } });
    const n: SceneNode = { id: 'sm', type: 'StateMachine', props: { direction: 'right' }, children: [S('created', { initial: true }), S('paid'), S('closed', { final: true }), T('created', 'paid'), T('paid', 'closed'), T('created', 'closed')] };
    const l = layout(n);
    expect(l.starts?.created).toBeDefined();
    expect(l.starts!.created!.x).toBeLessThan(l.nodes.created!.x);
    const startEdge = l.edges[`${START}created`]!.points;
    const end = startEdge[startEdge.length - 1]!;
    expect(Math.abs(end.x - l.nodes.created!.x)).toBeLessThanOrEqual(2);
    expect(l.nodes.closed!.h).toBeGreaterThan(l.nodes.paid!.h);
  });

  it('时序图：参与者按源码顺序成列，消息按源码顺序成行并编号；标签放得下；片段框包住它的消息', () => {
    const A = (id: string, extra: Record<string, unknown> = {}): SceneNode => ({ id, type: 'Sequence.Actor', props: { label: id, ...extra } });
    const Msg = (id: string, from: string, to: string, label: string, extra: Record<string, unknown> = {}): SceneNode => ({ id, type: 'Sequence.Message', props: { from, to, label, ...extra } });
    const n: SceneNode = {
      id: 'seq',
      type: 'Sequence',
      children: [
        { id: 'g', type: 'Sequence.Group', props: { label: '客户端' }, children: [A('web', { kind: 'client' })] },
        A('api'),
        A('db', { kind: 'database' }),
        Msg('m1', 'web', 'api', 'POST /orders（很长的标签用来撑开列间距）'),
        { id: 'b1', type: 'Sequence.Block', props: { kind: 'alt', label: '库存不足' }, children: [Msg('m2', 'api', 'db', '查询库存'), Msg('m3', 'api', 'api', '自检')] },
        Msg('m4', 'api', 'web', '201 Created', { reply: true }),
      ],
    };
    const l = layoutSequence(sequenceStructure(n));
    expect(l.actors.web!.x).toBeLessThan(l.actors.api!.x);
    expect(l.actors.api!.x).toBeLessThan(l.actors.db!.x);
    const y = (id: string) => l.messages[id]!.points[0]!.y;
    expect(y('m1')).toBeLessThan(y('m2'));
    expect(y('m2')).toBeLessThan(y('m3'));
    expect(y('m3')).toBeLessThan(y('m4'));
    expect(['m1', 'm2', 'm3', 'm4'].map((id) => l.messages[id]!.n)).toEqual([1, 2, 3, 4]);
    expect(l.messages.m3!.self).toBe(true);
    // 标签放得下：m1 的标签在两条生命线之间
    const lb = l.messages.m1!.label!;
    expect(lb.x).toBeGreaterThanOrEqual(l.lifelines.web!.x);
    expect(lb.x + lb.w).toBeLessThanOrEqual(l.lifelines.api!.x);
    // 片段框包住 m2、m3（含自调用的回环与标签）
    const blk = l.blocks.b1!;
    for (const id of ['m2', 'm3']) for (const p of l.messages[id]!.points) expect(inside(p, blk, -1), id).toBe(true);
    expect(within(l.messages.m3!.label!, blk)).toBe(true);
    // 分组框包住它的参与者
    expect(within(l.actors.web!, l.groups.g!)).toBe(true);
    // 确定
    expect(layoutSequence(sequenceStructure(n))).toEqual(l);
  });
});
