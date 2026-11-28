import { describe, expect, it } from 'vitest';
import {
  measureLabelWidth,
  polylineLength,
  routeBoardEdges,
  samplePolyline,
  segmentIntersectsRect,
  segmentsCross,
  type BoardNode,
  type EdgeSpec,
  type SoftObstacle,
} from '../src/board/edge-routing.ts';
import { pulseLapDurationMs } from '../src/board/tokens.ts';

describe('board/edge-routing programmatic FlowEdge router', () => {
  it('measures CJK & arrow labels wider than Latin so Chinese pills never overflow', () => {
    const cjk = measureLabelWidth('写规则 + 反查 7 处');
    const latin = measureLabelWidth('gRPC');
    expect(cjk).toBeGreaterThanOrEqual(115);
    expect(latin).toBeGreaterThanOrEqual(46);
    expect(cjk).toBeGreaterThan(latin * 2);
  });

  it('spreads multiple edges sharing the same rectangular node side while keeping diamond tips centered', () => {
    const nodes: BoardNode[] = [
      { id: 'worker', rect: { x: 240, y: 80, w: 200, h: 70 }, shape: 'box' },
      { id: 'rules', rect: { x: 40, y: 300, w: 180, h: 70 }, shape: 'box' },
      { id: 'zero', rect: { x: 560, y: 300, w: 146, h: 86 }, shape: 'decision' },
      { id: 'pr', rect: { x: 560, y: 80, w: 146, h: 86 }, shape: 'decision' },
    ];
    const edges: EdgeSpec[] = [
      { id: 'e_mem_w', from: 'rules', to: 'worker', route: 'ortho', fromSide: 'top', toSide: 'bottom', label: '后续必读' },
      { id: 'e_out_back', from: 'zero', to: 'worker', route: 'ortho', fromSide: 'left', toSide: 'bottom', label: '未归零→打回' },
      { id: 'e_pr_zero', from: 'pr', to: 'zero', route: 'straight', fromSide: 'bottom', toSide: 'top', label: '通过' },
    ];
    const res = routeBoardEdges({ nodes, edges });
    const endMem = res.get('e_mem_w')!.headTo;
    const endBack = res.get('e_out_back')!.headTo;
    // Two edges arriving at worker.bottom spread apart horizontally in topological order (rules left < zero right)
    expect(endMem.x).toBeLessThan(endBack.x);
    expect(endBack.x - endMem.x).toBeGreaterThanOrEqual(14);
    // Diamond tips remain exact center
    expect(res.get('e_pr_zero')!.startTo.x).toBeCloseTo(560 + 73, 1);
    expect(res.get('e_pr_zero')!.headTo.x).toBeCloseTo(560 + 73, 1);
  });

  it('automatically separates opposing A->B and B->A curved edges without explicit bend', () => {
    const nodes: BoardNode[] = [
      { id: 'a', rect: { x: 40, y: 120, w: 160, h: 64 } },
      { id: 'b', rect: { x: 320, y: 120, w: 160, h: 64 } },
    ];
    const edges: EdgeSpec[] = [
      { id: 'e_ab', from: 'a', to: 'b', route: 'curve', fromSide: 'right', toSide: 'left', label: '请求' },
      { id: 'e_ba', from: 'b', to: 'a', route: 'curve', fromSide: 'left', toSide: 'right', label: '响应' },
    ];
    const res = routeBoardEdges({ nodes, edges });
    const abMid = res.get('e_ab')!.quad!;
    const baMid = res.get('e_ba')!.quad!;
    // Control points bow in opposite vertical directions (one above, one below)
    expect(Math.abs(abMid.cy - baMid.cy)).toBeGreaterThanOrEqual(36);
    expect(Math.abs(res.get('e_ab')!.labelPos.y - res.get('e_ba')!.labelPos.y)).toBeGreaterThanOrEqual(16);
  });

  it('routes ortho/elbow edges around blocking intermediate nodes and cluster header badges', () => {
    const nodes: BoardNode[] = [
      { id: 'src', rect: { x: 40, y: 100, w: 140, h: 60 } },
      { id: 'blocker', rect: { x: 260, y: 80, w: 180, h: 100 } },
      { id: 'dst', rect: { x: 520, y: 100, w: 140, h: 60 } },
    ];
    const softObstacles: SoftObstacle[] = [
      { rect: { x: 240, y: 40, w: 220, h: 24 }, kind: 'header' },
    ];
    const edges: EdgeSpec[] = [
      { id: 'e1', from: 'src', to: 'dst', route: 'ortho', fromSide: 'right', toSide: 'left', label: '绕行通道' },
    ];
    const res = routeBoardEdges({ nodes, edges, softObstacles });
    const routed = res.get('e1')!;
    expect(routed.points.length).toBeGreaterThanOrEqual(4);
    expect(routed.d).toContain('Q '); // rounded corners
    // None of the orthogonal segments cut through the blocker node
    for (let i = 1; i < routed.points.length; i++) {
      expect(segmentIntersectsRect(routed.points[i - 1]!, routed.points[i]!, nodes[1]!.rect)).toBe(false);
    }
    // Arc-length sampler returns endpoints cleanly
    expect(samplePolyline(routed.points, 0)).toEqual(routed.points[0]);
    expect(samplePolyline(routed.points, 1)).toEqual(routed.points.at(-1));
  });

  it('keeps long feedback labels clear of other edges and each other on a 2-row cluster board', () => {
    const nodes: BoardNode[] = [
      { id: 'worker', rect: { x: 340, y: 90, w: 210, h: 68 } },
      { id: 'local', rect: { x: 640, y: 90, w: 210, h: 68 } },
      { id: 'pr', rect: { x: 980, y: 90, w: 146, h: 86 }, shape: 'decision' },
      { id: 'rules', rect: { x: 80, y: 310, w: 220, h: 68 } },
      { id: 'sweep', rect: { x: 330, y: 310, w: 240, h: 68 } },
      { id: 'zero', rect: { x: 980, y: 310, w: 146, h: 86 }, shape: 'decision' },
    ];
    const softObstacles: SoftObstacle[] = [
      { rect: { x: 320, y: 30, w: 560, h: 26 }, kind: 'header' },
      { rect: { x: 320, y: 30, w: 560, h: 155 }, kind: 'border' },
      { rect: { x: 60, y: 262, w: 820, h: 26 }, kind: 'header' },
      { rect: { x: 60, y: 262, w: 820, h: 140 }, kind: 'border' },
    ];
    const edges: EdgeSpec[] = [
      { id: 'e_to_pr', from: 'local', to: 'pr', route: 'straight', fromSide: 'right', toSide: 'left', label: '提交 PR' },
      { id: 'e_pr_out', from: 'pr', to: 'zero', route: 'straight', fromSide: 'bottom', toSide: 'top', label: '批准上影子' },
      { id: 'e_out_back', from: 'zero', to: 'worker', route: 'ortho', fromSide: 'left', toSide: 'bottom', label: '未归零→打回内环' },
      { id: 'e_pr_mem', from: 'pr', to: 'rules', route: 'ortho', fromSide: 'left', toSide: 'top', label: '写规则 + 反查 7 处' },
    ];
    const res = routeBoardEdges({ nodes, edges, softObstacles });
    const outBack = res.get('e_out_back')!;
    const prMem = res.get('e_pr_mem')!;

    // Neither label pill overlaps the other label pill
    const boxOf = (r: { labelPos: { x: number; y: number }; pillW: number }) => ({
      x: r.labelPos.x - r.pillW / 2,
      y: r.labelPos.y - 11,
      w: r.pillW,
      h: 22,
    });
    const b1 = boxOf(outBack);
    const b2 = boxOf(prMem);
    const pillsOverlap = b1.x < b2.x + b2.w && b2.x < b1.x + b1.w && b1.y < b2.y + b2.h && b2.y < b1.y + b1.h;
    expect(pillsOverlap).toBe(false);

    // Neither orthogonal feedback edge passes through any unrelated node
    for (const edge of [outBack, prMem]) {
      for (const n of nodes) {
        if (n.id === (edge.id === 'e_out_back' ? 'zero' : 'pr') || n.id === (edge.id === 'e_out_back' ? 'worker' : 'rules')) continue;
        for (let i = 1; i < edge.points.length; i++) {
          expect(segmentIntersectsRect(edge.points[i - 1]!, edge.points[i]!, n.rect)).toBe(false);
        }
      }
    }
    // Sanity check segmentsCross helper
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });

  it('prefers spacious corridor centerlines over hugging ClusterBox borders or node edges', () => {
    const nodes: BoardNode[] = [
      { id: 'user', rect: { x: 20, y: 200, w: 90, h: 90 } },
      { id: 'py_in', rect: { x: 220, y: 100, w: 180, h: 64 } },
      { id: 'claude', rect: { x: 480, y: 100, w: 170, h: 64 } },
      { id: 'rs_in', rect: { x: 220, y: 310, w: 180, h: 64 } },
    ];
    const softObstacles: SoftObstacle[] = [
      { rect: { x: 196, y: 52, w: 480, h: 132 }, kind: 'border' }, // bottom = 184
      { rect: { x: 196, y: 266, w: 480, h: 126 }, kind: 'border' }, // top = 266 -> corridor center y = 225
    ];
    const edges: EdgeSpec[] = [
      { id: 'e_u_py', from: 'user', to: 'py_in', route: 'ortho', fromSide: 'right', toSide: 'left', label: '主请求' },
      { id: 'e_rs_claude', from: 'rs_in', to: 'claude', route: 'ortho', fromSide: 'top', toSide: 'bottom', label: '已关闭双跑' },
    ];
    const res = routeBoardEdges({ nodes, edges, softObstacles });
    // Vertical segment of e_u_py should run in the open corridor between user (right=110) and cluster (left=196), not hugging x=196
    const uPyVert = res.get('e_u_py')!.points.find((p, i, arr) => i > 0 && Math.abs(p.x - arr[i - 1]!.x) < 1 && Math.abs(p.y - arr[i - 1]!.y) > 20)!;
    expect(uPyVert.x).toBeGreaterThan(125);
    expect(uPyVert.x).toBeLessThan(180);
    // Horizontal segment of e_rs_claude should cruise near the corridor center (y ~ 225) instead of hugging y=184 or y=266
    const rsHoriz = res.get('e_rs_claude')!.points.find((p, i, arr) => i > 0 && Math.abs(p.y - arr[i - 1]!.y) < 1 && Math.abs(p.x - arr[i - 1]!.x) > 40)!;
    expect(rsHoriz.y).toBeGreaterThan(202);
    expect(rsHoriz.y).toBeLessThan(248);
  });

  it('automatically lengthens horizontal wires when a long label exceeds a 72px gap, and offsets cramped 36px vertical labels', () => {
    const nodes: BoardNode[] = [
      { id: 'arch_ui', rect: { x: 26, y: 120, w: 296, h: 70 } },
      { id: 'arch_node', rect: { x: 394, y: 120, w: 280, h: 70 } }, // 72px horizontal gap!
      { id: 'arch_frame', rect: { x: 394, y: 226, w: 280, h: 70 } }, // 36px vertical gap!
    ];
    const edges: EdgeSpec[] = [
      { id: 'fe_ui_node', from: 'arch_ui', to: 'arch_node', route: 'curve', fromSide: 'right', toSide: 'left', bend: -14, label: '移出 RatioBar / Bar / Line' },
      { id: 'fe_node_frame', from: 'arch_node', to: 'arch_frame', route: 'straight', fromSide: 'bottom', toSide: 'top', label: '校验后降级' },
    ];
    const res = routeBoardEdges({ nodes, edges });
    const uiEdge = res.get('fe_ui_node')!;
    // Lengthened bridge: polyline with >= 4 vertices and pill box completely clear of BOTH arch_ui and arch_node
    expect(uiEdge.kind).toBe('polyline');
    expect(uiEdge.points.length).toBeGreaterThanOrEqual(4);
    const pillBox = {
      x: uiEdge.labelPos.x - uiEdge.pillW / 2,
      y: uiEdge.labelPos.y - uiEdge.pillH / 2,
      w: uiEdge.pillW,
      h: uiEdge.pillH,
    };
    for (const n of nodes) {
      const overlapsNode = pillBox.x < n.rect.x + n.rect.w && n.rect.x < pillBox.x + pillBox.w && pillBox.y < n.rect.y + n.rect.h && n.rect.y < pillBox.y + pillBox.h;
      expect(overlapsNode).toBe(false);
    }
    // Short 36px vertical arrow offsets its pill neatly beside the arrow with a hairline tick
    const vertEdge = res.get('fe_node_frame')!;
    expect(vertEdge.labelTick).toBeDefined();
    expect(Math.abs(vertEdge.labelPos.x - (394 + 140))).toBeGreaterThan(20);
  });

  it('handles node IDs containing ::, invalid side strings, vertex-on-segment crossings, and blocked opposing auto routes', () => {
    const nodes: BoardNode[] = [
      { id: 'svc::a', rect: { x: 40, y: 120, w: 140, h: 64 } },
      { id: 'mid::blocker', rect: { x: 240, y: 100, w: 120, h: 104 } },
      { id: 'svc::b', rect: { x: 420, y: 120, w: 140, h: 64 } },
    ];
    const edges: EdgeSpec[] = [
      { id: 'e1', from: 'svc::a', to: 'svc::b', route: 'auto', fromSide: 'invalid-side' as never, toSide: 'auto', label: '去程' },
      { id: 'e2', from: 'svc::b', to: 'svc::a', route: 'auto', fromSide: 'auto', toSide: 'auto', label: '返程' },
    ];
    expect(() => routeBoardEdges({ nodes, edges })).not.toThrow();
    const res = routeBoardEdges({ nodes, edges });
    for (const id of ['e1', 'e2']) {
      const e = res.get(id)!;
      for (let i = 1; i < e.points.length; i++) {
        expect(segmentIntersectsRect(e.points[i - 1]!, e.points[i]!, nodes[1]!.rect)).toBe(false);
      }
    }
    // Vertex landing directly on interior of perpendicular segment still counts as a crossing
    expect(segmentsCross({ x: 200, y: 40 }, { x: 200, y: 160 }, { x: 40, y: 100 }, { x: 200, y: 100 })).toBe(true);
  });

  it('scales FlowEdge pulse lap duration linearly with routed wire length at constant visual speed (~220 px/s)', () => {
    const shortLen = polylineLength([{ x: 0, y: 0 }, { x: 120, y: 0 }]);
    const longLen = polylineLength([{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 500 }]);
    expect(shortLen).toBe(120);
    expect(longLen).toBe(1100);
    // Short edges floor gently at 900ms; long 1100px corridor wires take ~5000ms instead of zooming in 760ms
    expect(pulseLapDurationMs(shortLen)).toBe(900);
    expect(pulseLapDurationMs(longLen)).toBe(5000);
    // Explicit author durationMs still wins verbatim
    expect(pulseLapDurationMs(longLen, 2000)).toBe(2000);
  });
});
