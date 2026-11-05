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
