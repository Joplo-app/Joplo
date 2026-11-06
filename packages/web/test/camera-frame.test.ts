/**
 * D69 镜头取景保留上下文（不变量 4）：shot 聚焦到节点或卡片时，画面里至少有目标与它的父分组标题；
 * 放得下、看得清时整个父分组（或有框的父容器）都在画面里；trace 涉及多个节点时取能容纳全部节点的视野；
 * 界面元素（非图表）推近不超过 UI_MAX_ZOOM，避免“放大一张卡片、旁边全被裁掉”。
 */
import { describe, expect, it } from 'vitest';
import { CAMERA_PAD, MAX_ZOOM, MIN_NODE_PX, NODE_FONT_PX, UI_MAX_ZOOM, fitCamera, frameBox, project, type Box } from '../src/renderer/camera-math';

const W = 1280;
const H = 720;
const inView = (b: Box) => b.x >= -1e-6 && b.y >= -1e-6 && b.x + b.w <= W + 1e-6 && b.y + b.h <= H + 1e-6;
const contains = (outer: Box, b: Box) => b.x >= outer.x - 1e-6 && b.y >= outer.y - 1e-6 && b.x + b.w <= outer.x + outer.w + 1e-6 && b.y + b.h <= outer.y + outer.h + 1e-6;

/** 一个分组（标题在左上角）里的一个节点，架构图整体缩放 s。 */
const grouped = (group: Box, node: Box, s: number) => ({ box: node, context: group, title: { x: group.x + 6, y: group.y + 4, w: 80, h: 20 }, nodeScale: s });

describe('frameBox：取景框 = 目标 + 上下文', () => {
  it('分组放得下、节点看得清：整个父分组都在画面里，节点主标签 ≥ 16px', () => {
    const group = { x: 100, y: 100, w: 600, h: 300 };
    const node = { x: 400, y: 250, w: 150, h: 46 };
    const it0 = grouped(group, node, 0.8);
    const bbox = frameBox([it0], W, H)!;
    expect(contains(bbox, group)).toBe(true);
    const f = fitCamera({ W, H, mode: 'focus', bbox, nodeScales: [0.8] });
    expect(inView(project(group, f))).toBe(true);
    expect(NODE_FONT_PX * 0.8 * f.k).toBeGreaterThanOrEqual(MIN_NODE_PX - 1e-9);
  });

  it('分组太大（整张图缩得很小）：退到“目标 + 分组标题”，标题仍在画面里，节点仍看得清', () => {
    const group = { x: 0, y: 0, w: 3000, h: 1800 };
    const node = { x: 2400, y: 1500, w: 150, h: 46 };
    const it0 = grouped(group, node, 0.3);
    const bbox = frameBox([it0], W, H)!;
    expect(contains(bbox, it0.title)).toBe(true);
    expect(contains(bbox, node)).toBe(true);
    const f = fitCamera({ W, H, mode: 'focus', bbox, nodeScales: [0.3] });
    expect(inView(project(it0.title, f)), '父分组标题在画面里').toBe(true);
    expect(inView(project(node, f))).toBe(true);
  });

  it('不变量 4（随机）：任何位置、任何缩放，取景后目标与父分组标题都在画面里', () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 200; i++) {
      const gw = 200 + rnd() * 2800;
      const gh = 150 + rnd() * 1600;
      const group = { x: rnd() * 400, y: rnd() * 400, w: gw, h: gh };
      const node = { x: group.x + 12 + rnd() * Math.max(1, gw - 180), y: group.y + 34 + rnd() * Math.max(1, gh - 90), w: 150, h: 46 };
      const s = 0.2 + rnd() * 0.8;
      const it0 = grouped(group, node, s);
      const f = fitCamera({ W, H, mode: 'focus', bbox: frameBox([it0], W, H)!, nodeScales: [s] });
      expect(inView(project(it0.title, f)), `#${i} 标题`).toBe(true);
      expect(inView(project(node, f)), `#${i} 节点`).toBe(true);
    }
  });

  it('trace 涉及多个节点（在不同分组里）：取景容纳全部节点和各自分组的标题', () => {
    const a = grouped({ x: 0, y: 0, w: 400, h: 200 }, { x: 100, y: 80, w: 150, h: 46 }, 0.6);
    const b = grouped({ x: 1200, y: 600, w: 500, h: 300 }, { x: 1300, y: 700, w: 150, h: 46 }, 0.6);
    const bbox = frameBox([a, b], W, H)!;
    const f = fitCamera({ W, H, mode: 'focus', bbox, nodeScales: [0.6, 0.6] });
    for (const x of [a.box, b.box, a.title, b.title]) expect(inView(project(x, f))).toBe(true);
  });

  it('界面元素：父容器在画面里；推近不超过 UI_MAX_ZOOM（截图里放大一张卡片、旁边全被裁掉的情况不再出现）', () => {
    // 两栏布局里右边的面板：父容器是整行
    const row = { x: 28, y: 120, w: 1224, h: 360 };
    const panel = { x: 650, y: 120, w: 602, h: 360 };
    const bbox = frameBox([{ box: panel, context: row, title: null }], W, H)!;
    const f = fitCamera({ W, H, mode: 'focus', bbox, maxZoom: UI_MAX_ZOOM });
    expect(f.k).toBeLessThanOrEqual(UI_MAX_ZOOM + 1e-9);
    expect(inView(project(row, f))).toBe(true);
    // 小按钮没有有框的父容器：只推近到 UI_MAX_ZOOM，四周留着上下文
    const btn = { x: 600, y: 400, w: 90, h: 32 };
    const g = fitCamera({ W, H, mode: 'focus', bbox: frameBox([{ box: btn }], W, H)!, maxZoom: UI_MAX_ZOOM });
    expect(g.k).toBeLessThanOrEqual(UI_MAX_ZOOM + 1e-9);
    expect(project(btn, g).w).toBeLessThan(W / 4);
  });

  it('没有上下文时取景就是目标本身；图表节点的推近上限仍是 MAX_ZOOM 与“看得清”的较大者', () => {
    const node = { x: 500, y: 300, w: 150, h: 46 };
    expect(frameBox([{ box: node }], W, H)).toEqual(node);
    const f = fitCamera({ W, H, mode: 'focus', bbox: node, nodeScales: [1] });
    expect(f.k).toBeLessThanOrEqual(MAX_ZOOM + 1e-9);
    expect(inView(project(node, f))).toBe(true);
    expect(CAMERA_PAD).toBeGreaterThan(0);
  });
});
