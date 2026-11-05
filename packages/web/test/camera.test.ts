/**
 * 视角层级与导演镜头（D43）、一屏放下、每页只有一种设备（D44）中能抽成纯函数的部分：
 * 镜头拟合 fitCamera、舞台缩放 fitStage、镜头计划 cameraFor、URL 解析。
 * 界面效果（页面不滚动、⌥+单击命中、动画）由用户在浏览器里检查，见交付说明里的清单。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@tokenroll/joplo-kit/ui';
import { config, feature, flow, layer, option, page, set, shot, $ } from '@tokenroll/joplo-kit';
import { jsx } from '@tokenroll/joplo-kit/jsx-runtime';
import { OVERVIEW_LAYER, compile, type AuthoringProject } from '@tokenroll/joplo-core';
import { CAMERA_PAD, MAX_ZOOM, MIN_NODE_PX, NODE_FONT_PX, fitCamera, project, union, type Box } from '../src/renderer/camera-math';
import { fitStage } from '../src/player/fit';
import { cameraFor } from '../src/player/cameraFor';
import { boardHash, parseBoardHash, parseSiteHash } from '../src/runtime/route';

const W = 1280;
const H = 800;
const inside = (b: Box, min: number) => b.x >= min - 1e-6 && b.y >= min - 1e-6 && b.x + b.w <= W - min + 1e-6 && b.y + b.h <= H - min + 1e-6;

describe('fitCamera（镜头拟合）', () => {
  // 各种形状与位置的焦点：小按钮、整列卡片、横跨全宽的条、画面外的元素
  const targets: Box[] = [
    { x: 40, y: 60, w: 120, h: 36 },
    { x: 700, y: 120, w: 540, h: 620 },
    { x: 0, y: 300, w: 1280, h: 40 },
    { x: 200, y: 1400, w: 300, h: 200 },
    { x: 900, y: 500, w: 8, h: 8 },
  ];
  it('聚焦后焦点在画面内完整可见，四周至少留 CAMERA_PAD；推近不超过 MAX_ZOOM', () => {
    for (const bbox of targets) {
      const f = fitCamera({ W, H, mode: 'focus', bbox });
      expect(f.k).toBeLessThanOrEqual(MAX_ZOOM + 1e-9);
      expect(inside(project(bbox, f), CAMERA_PAD), JSON.stringify({ bbox, f })).toBe(true);
      // 焦点居中
      const p = project(bbox, f);
      expect(Math.abs(p.x + p.w / 2 - W / 2)).toBeLessThan(1e-6);
      expect(Math.abs(p.y + p.h / 2 - H / 2)).toBeLessThan(1e-6);
      // 遮罩挖出的洞包住焦点
      const hole = f.hole!;
      expect(hole.x <= bbox.x && hole.y <= bbox.y && hole.x + hole.w >= bbox.x + bbox.w && hole.y + hole.h >= bbox.y + bbox.h).toBe(true);
    }
  });

  it('对准架构图节点：节点主标签在屏幕上 ≥ 16px，节点仍完整可见', () => {
    const node: Box = { x: 820, y: 410, w: 150, h: 46 };
    for (const s of [0.3, 0.45, 0.6, 1]) {
      const f = fitCamera({ W, H, mode: 'focus', bbox: node, nodeScales: [s] });
      expect(NODE_FONT_PX * s * f.k, `架构图缩放 ${s}`).toBeGreaterThanOrEqual(MIN_NODE_PX - 1e-9);
      expect(inside(project(node, f), CAMERA_PAD)).toBe(true);
    }
  });

  it('全景只缩小不放大：内容放得下时不动；内容很长时整体缩进画面', () => {
    expect(fitCamera({ W, H, mode: 'overview', bbox: { x: 0, y: 0, w: W, h: H } })).toEqual({ k: 1, tx: 0, ty: 0, hole: null });
    const long = union([{ x: 0, y: 0, w: W, h: H }, { x: 16, y: 16, w: 1248, h: 2100 }])!;
    const f = fitCamera({ W, H, mode: 'overview', bbox: long });
    expect(f.k).toBeLessThan(1);
    expect(inside(project(long, f), 0)).toBe(true);
    expect(f.hole).toBeNull();
  });

  it('层级（没有焦点时看整层）：整层放进画面并留内边距', () => {
    const col: Box = { x: 16, y: 80, w: 620, h: 1500 };
    const f = fitCamera({ W, H, mode: 'layer', bbox: col });
    expect(inside(project(col, f), CAMERA_PAD)).toBe(true);
  });
});

describe('fitStage（一屏放下：舞台放进剩余空间）', () => {
  it('舞台（含手机外框）总在可用区域内，四周留 12px；可用区域很小时也不撑大', () => {
    for (const avail of [{ w: 960, h: 520 }, { w: 1120, h: 640 }, { w: 400, h: 300 }, { w: 2400, h: 1600 }])
      for (const frame of [{ width: 1280, height: 800 }, { width: 446, height: 934 }]) {
        const s = fitStage(avail, frame);
        if (s > 0.2) {
          expect(frame.width * s).toBeLessThanOrEqual(avail.w - 24 + 1e-9);
          expect(frame.height * s).toBeLessThanOrEqual(avail.h - 24 + 1e-9);
        }
        expect(s).toBeLessThanOrEqual(1.5);
      }
  });
});

// ---------- 镜头计划：与 core 的 cameraAt 一致，切层不改变步骤 ----------
const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
function director() {
  const home = page({ title: '导演', layout: false }, h(ui.SimpleGrid, { cols: 2 }, h(ui.Paper, { id: 'client_panel' }, h(ui.Button, { id: 'send' }, '发送'), h(ui.Text, { id: 'msg' }, '你好')), h(ui.Diagram, { id: 'arch' }, h(ui.Diagram.Node, { id: 'biz', label: 'Biz' }), h(ui.Diagram.Node, { id: 'billing', label: 'Billing' }))));
  const opt = option({
    name: 'A',
    idea: 'i',
    on: {},
    state: { ui: { sent: false } },
    layers: { client: layer('客户端视角', ['client_panel']), backend: layer('后端流转', ['arch']) },
    scenarios: { s: flow('一次', { start: '/' }).click('send', set($.ui.sent, true), shot('msg'), shot('biz')).system('预检', shot('billing')).system('无镜头').system('结束', shot()) },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  const r = compile(src, 'dev');
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.project!;
}

describe('cameraFor（演示页、静态截图、视频共用的镜头计划）', () => {
  const p = director();
  it('导演跟随：每一步取导演层与它的焦点；没有镜头的步骤沿用上一步；shot() 回到全景', () => {
    expect(cameraFor(p, 'f.a.s', 0, null)).toMatchObject({ enabled: true, director: true, viewLayer: OVERVIEW_LAYER, spec: { targets: [], roots: [] } });
    expect(cameraFor(p, 'f.a.s', 1, null)).toMatchObject({ viewLayer: 'client', spec: { targets: ['msg'], roots: ['client_panel'] } });
    expect(cameraFor(p, 'f.a.s', 2, null)).toMatchObject({ viewLayer: 'backend', spec: { targets: ['billing'], roots: ['arch'] } });
    expect(cameraFor(p, 'f.a.s', 3, null).spec).toEqual(cameraFor(p, 'f.a.s', 2, null).spec);
    expect(cameraFor(p, 'f.a.s', 4, null)).toMatchObject({ viewLayer: OVERVIEW_LAYER, spec: { targets: [], roots: [] } });
    expect(cameraFor(p, 'f.a.s', 1, null).layers.map((l) => l.title)).toEqual(['全景', '客户端视角', '后端流转']);
  });
  it('手动选层：导演关闭，用这一层在这一步的镜头；不存在的层级退回导演', () => {
    expect(cameraFor(p, 'f.a.s', 2, 'client')).toMatchObject({ director: false, viewLayer: 'client', spec: { targets: ['msg'] } });
    expect(cameraFor(p, 'f.a.s', 2, 'nope')).toMatchObject({ director: true, viewLayer: 'backend' });
    // 镜头不同但同一步：key 不同（触发高光脉冲），步骤由调用方保持
    expect(cameraFor(p, 'f.a.s', 2, 'client').spec!.key).not.toBe(cameraFor(p, 'f.a.s', 2, null).spec!.key);
  });
  it('没有层级也没有 shot 的场景不用镜头', () => {
    expect(cameraFor(p, null, 0, null)).toMatchObject({ enabled: false, spec: null });
  });
});

describe('URL（D44：没有设备参数；层级 l 只在手动时出现）', () => {
  it('旧链接里的 d=mobile 被忽略；l 往返不变', () => {
    const r = parseBoardHash('#/proj-1/f/agent?s=f.a.s&step=2&d=mobile');
    expect(r).toEqual({ kind: 'play', projectId: 'proj-1', play: { featureId: 'agent', scenarioId: 'f.a.s', step: 2 } });
    const withLayer = { kind: 'play' as const, projectId: 'proj-1', play: { featureId: 'agent', step: 2, layer: 'backend' } };
    expect(boardHash(withLayer)).toBe('#/proj-1/f/agent?step=2&l=backend');
    expect(parseBoardHash(boardHash(withLayer))).toEqual(withLayer);
    expect(parseSiteHash('#/f/agent?l=client&d=desktop')).toEqual({ kind: 'play', play: { featureId: 'agent', layer: 'client' } });
  });
});
