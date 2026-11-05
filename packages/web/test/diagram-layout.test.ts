/**
 * 架构图布局的不变量（D41）：结构相同 → 坐标相同；state / when 变化不移动任何节点；只有结构变化才重新布局；
 * 连线不穿过节点；分组框包住它的节点、不压到别的节点。
 */
import { describe, expect, it } from 'vitest';
import type { SceneNode } from '@tokenroll/joplo-core';
import { diagramStructure, edgePath, layoutDiagram, structureKey, type Box, type Point } from '../src/renderer/diagram-layout';

const N = (id: string, label: string, extra: Record<string, unknown> = {}): SceneNode => ({ id, type: 'Diagram.Node', props: { label, ...extra } });
const E = (from: string, to: string, extra: Record<string, unknown> = {}): SceneNode => ({ id: (extra.id as string) ?? `${from}->${to}`, type: 'Diagram.Edge', props: { from, to, ...extra } });
const G = (id: string, label: string, children: SceneNode[]): SceneNode => ({ id, type: 'Diagram.Group', props: { label }, children });

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

const inside = (pt: Point, b: Box, shrink = 2) => pt.x > b.x + shrink && pt.x < b.x + b.w - shrink && pt.y > b.y + shrink && pt.y < b.y + b.h - shrink;

/** 沿路径采样（与渲染器同一条平滑路径）。 */
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

describe('Diagram 布局', () => {
  it('结构相同 → 坐标完全相同（确定性）', () => {
    const a = layoutDiagram(diagramStructure(fixture()));
    const b = layoutDiagram(diagramStructure(fixture()));
    expect(b).toEqual(a);
    expect(Object.keys(a.nodes)).toHaveLength(8);
    expect(a.width).toBeGreaterThan(0);
    expect(edgePath(a.edges['client->brain']!.points)).toMatch(/^M[\d.]+,[\d.]+/);
  });

  it('state 变化（绑定或字面量）不改变结构键，也不移动任何节点', () => {
    const idle = diagramStructure(fixture());
    const active = diagramStructure(fixture((k) => (k === 'e1' ? 'active' : k === 'brain' ? 'error' : 'ok')));
    const bound = diagramStructure(fixture((k) => `$ui.s_${k}`));
    expect(structureKey(active)).toBe(structureKey(idle));
    expect(structureKey(bound)).toBe(structureKey(idle));
    expect(layoutDiagram(active)).toEqual(layoutDiagram(idle));
    // when 也不参与布局：隐藏的节点保留位置，播放时不跳动
    const withWhen = fixture();
    withWhen.children![0] = { ...withWhen.children![0]!, when: { eq: ['$ui.x', 1] } as never };
    expect(structureKey(diagramStructure(withWhen))).toBe(structureKey(idle));
  });

  it('结构变化（增删节点或连线）才重新布局', () => {
    const base = diagramStructure(fixture());
    const more = diagramStructure(fixture(undefined, [N('cdn', 'CDN', { kind: 'external' }), E('client', 'cdn')]));
    expect(structureKey(more)).not.toBe(structureKey(base));
    expect(Object.keys(layoutDiagram(more).nodes)).toContain('cdn');
  });

  it('连线不穿过任何节点（除了它的两端）；箭头落在目标节点边上', () => {
    for (const dir of ['right', 'down']) {
      const s = diagramStructure(fixture(undefined, [], dir));
      const l = layoutDiagram(s);
      for (const e of s.edges) {
        const route = l.edges[e.id]!.points;
        expect(route.length, e.id).toBeGreaterThanOrEqual(2);
        for (const [id, box] of Object.entries(l.nodes)) {
          if (id === e.from || id === e.to) continue;
          const hit = samples(route).find((pt) => inside(pt, box));
          expect(hit, `${dir}: 连线 ${e.id} 穿过了节点 ${id}`).toBeUndefined();
        }
        const end = route[route.length - 1]!;
        const to = l.nodes[e.to]!;
        expect(end.x >= to.x - 2 && end.x <= to.x + to.w + 2 && end.y >= to.y - 2 && end.y <= to.y + to.h + 2, `${e.id} 的终点应在 ${e.to} 边上`).toBe(true);
      }
    }
  });

  it('分组框包住它的节点（含嵌套分组），且不压住组外的节点', () => {
    const s = diagramStructure(fixture());
    const l = layoutDiagram(s);
    const aws = l.groups.aws!;
    const tools = l.groups.tools!;
    const within = (b: Box, outer: Box) => b.x >= outer.x && b.y >= outer.y && b.x + b.w <= outer.x + outer.w && b.y + b.h <= outer.y + outer.h;
    for (const id of ['brain', 'llm', 'registry']) expect(within(l.nodes[id]!, aws), id).toBe(true);
    expect(within(l.nodes.registry!, tools)).toBe(true);
    expect(within(tools, aws)).toBe(true);
    for (const id of ['client', 'impl', 'biz', 'billing', 'queue']) {
      const b = l.nodes[id]!;
      const overlap = Math.min(b.x + b.w, aws.x + aws.w) - Math.max(b.x, aws.x) > 0 && Math.min(b.y + b.h, aws.y + aws.h) - Math.max(b.y, aws.y) > 0;
      expect(overlap, `组外节点 ${id} 压在 AWS 分组上`).toBe(false);
    }
  });

  it('边界输入：空图、连线指向不存在的节点（编译期已报错）不抛异常', () => {
    expect(layoutDiagram(diagramStructure({ id: 'd', type: 'Diagram' }))).toMatchObject({ width: 0, height: 0 });
    const bad = diagramStructure({ id: 'd', type: 'Diagram', children: [N('a', 'A'), E('a', 'ghost')] });
    expect(Object.keys(layoutDiagram(bad).edges)).toEqual([]);
  });
});

// ---------- 可读性与紧凑（examples/agent-arch 的真实结构，D41 复审） ----------
import { diagramScale, MIN_SCALE, NODE_FONT, DESC_FONT, EDGE_FONT, type DLayout } from '../src/renderer/diagram-layout';

/** 与 examples/agent-arch/shared/arch.tsx 相同的结构（v = a：混合的手；v = b：全云端）。 */
function agentArch(v: 'a' | 'b', direction: 'right' | 'down'): SceneNode {
  const n = (id: string, label: string, kind: string, description: string) => N(id, label, { kind, description, state: `$ui.n_${id}` });
  return {
    id: 'arch',
    type: 'Diagram',
    props: { direction, h: 640 },
    children: [
      G('g_device', '用户设备', [n('app', '客户端界面', 'client', '对话、确认弹窗'), ...(v === 'a' ? [n('local', '端侧执行器', 'tool', '手：read_files、delete_files')] : [])]),
      G('g_aws', 'AWS', [
        G('g_ctrl', '控制面', [n('biz', 'Biz Server', 'service', '鉴权 · 会话 · 审计 · 转发'), n('registry', 'Tool Registry', 'database', '工具定义：名称 · schema · 危险级别 · 单价'), n('db', 'DynamoDB', 'database', '会话与审计日志')]),
        G('g_brain', '大脑', [n('brain', 'Agent 大脑', 'service', 'ECS：规划，只产出工具调用'), n('llm', 'Bedrock', 'model', 'Claude 模型')]),
        G('g_hands', '云端的手', [n('sandbox', '云端沙箱', 'tool', v === 'a' ? 'Fargate：make_sheet 等云端工具' : 'Fargate：所有工具'), ...(v === 'b' ? [n('s3', 'S3 上传区', 'storage', '用户上传的本机文件')] : [])]),
        G('g_bill', '计费', [n('queue', 'SQS', 'queue', '用量事件'), n('billing', 'Billing', 'service', '额度 · 计量 · 扣费')]),
      ]),
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

const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
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

describe('可读性与紧凑：examples/agent-arch 的结构', () => {
  for (const v of ['a', 'b'] as const)
    for (const dir of ['right', 'down'] as const) {
      const s = diagramStructure(agentArch(v, dir));
      const l: DLayout = layoutDiagram(s);
      it(`${v}/${dir}：约 1000px 宽的容器里，节点主标签 ≥ 12px、description ≥ 10px（放不下时滚动而不是继续缩小）`, () => {
        const { scale, scroll } = diagramScale(l, 1000, 640);
        expect(scale * NODE_FONT).toBeGreaterThanOrEqual(12);
        expect(scale * DESC_FONT).toBeGreaterThanOrEqual(10);
        expect(scale * EDGE_FONT).toBeGreaterThanOrEqual(10);
        if (scroll) expect(scale).toBe(MIN_SCALE);
        // 很窄的容器也不低于下限
        expect(diagramScale(l, 300, 200).scale).toBe(MIN_SCALE);
      });
      it(`${v}/${dir}：连线标签互不重叠，也不压住节点和分组标题`, () => {
        const labels = Object.entries(l.edges).filter(([, e]) => e.label).map(([id, e]) => [id, e.label!] as const);
        expect(labels.length).toBe(s.edges.filter((e) => e.label).length);
        for (let i = 0; i < labels.length; i++) {
          for (let j = i + 1; j < labels.length; j++) expect(area(labels[i]![1], labels[j]![1]), `${labels[i]![0]} 与 ${labels[j]![0]}`).toBe(0);
          for (const [id, b] of Object.entries(l.nodes)) expect(area(labels[i]![1], b), `${labels[i]![0]} 压住节点 ${id}`).toBe(0);
          for (const [id, b] of Object.entries(l.titles)) expect(area(labels[i]![1], b), `${labels[i]![0]} 压住分组标题 ${id}`).toBe(0);
        }
      });
      it(`${v}/${dir}：连线不穿过节点和分组标题；往返连线 biz⇄brain 分开`, () => {
        for (const e of s.edges) {
          const route = l.edges[e.id]!.points;
          for (const [id, box] of Object.entries(l.nodes)) {
            if (id === e.from || id === e.to) continue;
            expect(samples(route).find((pt) => inside(pt, box)), `${e.id} 穿过节点 ${id}`).toBeUndefined();
          }
          for (const [id, box] of Object.entries(l.titles)) expect(samples(route).find((pt) => inside(pt, box, 0)), `${e.id} 压住分组标题 ${id}`).toBeUndefined();
        }
        const go = l.edges.e_biz_brain!.points;
        const back = l.edges.e_brain_biz!.points;
        // 叠在一起 = 两条线相距不到 4px（通道之间至少 8px，只有在同一节点的出入口附近会靠近）
        const close = samples(go).filter((pt) => distToPolyline(pt, back) < 4).length / samples(go).length;
        expect(close, "往返连线叠在一起").toBeLessThan(0.05);
      });
      it(`${v}/${dir}：分组框包住成员，不压住组外节点；分组之间不交叠（嵌套除外）`, () => {
        const parentOf = (id: string) => s.nodes.find((n) => n.id === id)?.parent ?? null;
        const ancestors = (gid: string | null): string[] => (gid ? [gid, ...ancestors(s.groups.find((g) => g.id === gid)!.parent)] : []);
        for (const gr of s.groups) {
          const gb = l.groups[gr.id]!;
          for (const [id, b] of Object.entries(l.nodes)) {
            const mine = ancestors(parentOf(id)).includes(gr.id);
            if (mine) expect(b.x >= gb.x && b.y >= gb.y && b.x + b.w <= gb.x + gb.w && b.y + b.h <= gb.y + gb.h, `${id} 应在 ${gr.id} 内`).toBe(true);
            else expect(area(b, gb), `组外节点 ${id} 压在 ${gr.id} 上`).toBe(0);
          }
          for (const other of s.groups) {
            if (other.id === gr.id || ancestors(other.id).includes(gr.id) || ancestors(gr.id).includes(other.id)) continue;
            expect(area(gb, l.groups[other.id]!), `${gr.id} 与 ${other.id} 交叠`).toBe(0);
          }
        }
      });
    }
});
