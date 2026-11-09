import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 视角层级与导演镜头（D43 / T-layers：每层是独立画面）、一屏放下、每页只有一种设备（D44）中能抽成纯函数的部分：
 * 镜头拟合 fitCamera、可见矩形 visibleRect、滚动露出 revealScroll、舞台缩放 fitStage、镜头计划 cameraFor、URL 解析。
 * 界面效果（页面不滚动、⌥+单击命中、动画）由用户在浏览器里检查，见交付说明里的清单。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui'; import * as uiDiagram from '@joplo-app/plugin-diagram';
import { feature, flow, layer, option, page, set, shot, $ } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { PAGE_LAYER, compile, displaySceneId, type AuthoringProject } from '@joplo-app/core';
import { CAMERA_PAD, MAX_ZOOM, MIN_NODE_PX, NODE_FONT_PX, fitCamera, highlightRect, project, revealScroll, union, visibleRect, type Box } from '../src/renderer/camera-math';
import { fitStage } from '../src/player/fit';
import { cameraFor } from '../src/player/cameraFor';
import { DemoController } from '../src/runtime/demo';
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
    expect(fitCamera({ W, H, mode: 'overview', bbox: { x: 0, y: 0, w: W, h: H } })).toEqual({ k: 1, tx: 0, ty: 0 });
    const long = union([{ x: 0, y: 0, w: W, h: H }, { x: 16, y: 16, w: 1248, h: 2100 }])!;
    const f = fitCamera({ W, H, mode: 'overview', bbox: long });
    expect(f.k).toBeLessThan(1);
    expect(inside(project(long, f), 0)).toBe(true);
  });

  it('给了内容范围：靠边的焦点不再露出内容以外的空白，但焦点四周的内边距不变', () => {
    const bounds: Box = { x: 0, y: 0, w: W, h: H };
    // 右下角的小卡片：居中会露出右侧和下方的空白
    const card: Box = { x: 1000, y: 600, w: 240, h: 160 };
    const f = fitCamera({ W, H, mode: 'focus', bbox: card, bounds });
    expect(inside(project(card, f), CAMERA_PAD)).toBe(true);
    const view = project(bounds, f);
    // 画面右边与下边仍在内容里（没有露出空白）
    expect(view.x + view.w).toBeGreaterThanOrEqual(W - 1e-6);
    expect(view.y + view.h).toBeGreaterThanOrEqual(H - 1e-6);
    // 紧贴内容边缘的目标：内边距优先（允许露出一点空白）
    const edge: Box = { x: 0, y: 0, w: 200, h: 60 };
    const g = fitCamera({ W, H, mode: 'focus', bbox: edge, bounds });
    expect(inside(project(edge, g), CAMERA_PAD)).toBe(true);
  });
});

describe('visibleRect / 高光（错位的根因：被容器裁掉的部分不算焦点）', () => {
  it('与裁切它的祖先求交；完全被裁掉时没有可见部分', () => {
    // 固定高度的架构图（overflow hidden）里，节点下半截被裁掉
    const diagram: Box = { x: 640, y: 80, w: 600, h: 400 };
    const node: Box = { x: 800, y: 440, w: 150, h: 80 };
    expect(visibleRect(node, [diagram])).toEqual({ x: 800, y: 440, w: 150, h: 40 });
    // 在滚动区可视范围之外
    expect(visibleRect({ x: 800, y: 900, w: 150, h: 80 }, [diagram])).toBeNull();
    // 多层裁切
    expect(visibleRect({ x: 0, y: 0, w: 500, h: 500 }, [{ x: 100, y: 0, w: 1000, h: 300 }, { x: 0, y: 50, w: 300, h: 1000 }])).toEqual({ x: 100, y: 50, w: 200, h: 250 });
  });
  it('高光框与目标渲染后的可见包围盒对齐（误差 ≤ 2px），并在镜头变换下与目标一起移动', () => {
    const target: Box = { x: 812.4, y: 233.7, w: 151.2, h: 46.6 };
    const hl = highlightRect(target);
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(hl[k] - target[k])).toBeLessThanOrEqual(2);
    // 高光与目标处在同一个镜头容器里：经过任意镜头变换后仍然重合
    const f = fitCamera({ W, H, mode: 'focus', bbox: target, nodeScales: [0.5] });
    const a = project(hl, f);
    const b = project(target, f);
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(2);
  });
});

describe('revealScroll（滚动区里的目标先滚到可见处）', () => {
  it('目标在可视区下方/上方时滚到刚好可见并留边距；已可见时不动；不超出滚动范围', () => {
    expect(revealScroll(100, 40, 400, 0, 1000)).toBe(0);
    expect(revealScroll(600, 40, 400, 0, 1000)).toBe(600 + 40 - 400 + 12);
    expect(revealScroll(-200, 40, 400, 500, 1000)).toBe(500 - 200 - 12);
    expect(revealScroll(5000, 40, 400, 0, 1000)).toBe(1000);
    // 目标比可视区还高：对齐到顶部
    expect(revealScroll(300, 600, 400, 0, 1000)).toBe(300 - 12);
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
  const home = page({ title: '导演', layout: false }, h(ui.Text, { id: 'route_only' }, '路径页面'));
  // 每层是独立画面：自己的 JSX 树，按自己的布局占满舞台
  const client = h(ui.Paper, { id: 'client_panel' }, h(ui.Button, { id: 'send' }, '发送'), h(ui.Text, { id: 'msg' }, '你好'));
  const arch = h(uiDiagram.Diagram, { id: 'arch' }, h(uiDiagram.Diagram.Node, { id: 'biz', label: 'Biz' }), h(uiDiagram.Diagram.Node, { id: 'billing', label: 'Billing' }));
  const opt = option({
    name: 'A',
    idea: 'i',
    on: {},
    state: { ui: { sent: false } },
    layers: { client: layer('客户端视角', client as never), backend: layer('后端流转', arch as never) },
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
  it('导演跟随：每一步取导演层的画面与它的焦点；没有镜头的步骤沿用上一步；shot() 让导演层回到整层', () => {
    const scene = (id: string) => p.options['f.a']!.layers[id]!.sceneId;
    expect(cameraFor(p, 'f.a.s', 0, null)).toMatchObject({ enabled: true, director: true, viewLayer: 'client', sceneId: scene('client'), spec: { targets: [] } });
    // 第 1 步 shot('msg') 在客户端层、shot('biz') 在后端层；第一个 shot 所在的层是导演层
    expect(cameraFor(p, 'f.a.s', 1, null)).toMatchObject({ viewLayer: 'client', sceneId: scene('client'), spec: { targets: ['msg'] } });
    expect(cameraFor(p, 'f.a.s', 1, 'backend')).toMatchObject({ director: false, viewLayer: 'backend', sceneId: scene('backend'), spec: { targets: ['biz'] } });
    expect(cameraFor(p, 'f.a.s', 2, null)).toMatchObject({ viewLayer: 'backend', spec: { targets: ['billing'] } });
    expect(cameraFor(p, 'f.a.s', 3, null).spec).toEqual(cameraFor(p, 'f.a.s', 2, null).spec);
    expect(cameraFor(p, 'f.a.s', 4, null)).toMatchObject({ viewLayer: 'backend', spec: { targets: [] } });
    // 没有自动全景层：只有作者声明的层
    expect(cameraFor(p, 'f.a.s', 1, null).layers.map((l) => l.title)).toEqual(['客户端视角', '后端流转']);
    // 每层是独立画面，和路径页面不是同一个画面；renderStep / 视频用同一个画面
    expect(scene('client')).not.toBe(scene('backend'));
    expect(p.scenes[scene('client')]!.layer).toBe('client');
    expect(displaySceneId(p, 'f.a.s', 2)).toBe(cameraFor(p, 'f.a.s', 2, null).sceneId);
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
  it('没有层级的方案：仍显示路径页面（sceneId = null），shot 写在路径页面上', () => {
    const home = page({ title: '无层级', layout: false }, h(ui.Paper, { id: 'card' }, h(ui.Button, { id: 'go' }, '去')));
    const opt = option({ name: 'B', idea: 'i', on: {}, state: { ui: {} }, scenarios: { s: flow('一次', { start: '/' }).click('go', shot('card')) } });
    const src: AuthoringProject = {
      root: '/p',
      config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
      layouts: {},
      routes: { '/': { ...home, ...F('routes/page.tsx') } },
      features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'b' }), ...F('features/f/feature.ts') }, options: { b: { ...opt, ...F('features/f/options/b.tsx') } } } },
    };
    const q = compile(src, 'dev').project!;
    expect(cameraFor(q, 'f.b.s', 0, null)).toMatchObject({ enabled: true, layers: [], viewLayer: PAGE_LAYER, sceneId: null, spec: { targets: [] } });
    expect(cameraFor(q, 'f.b.s', 1, null)).toMatchObject({ viewLayer: PAGE_LAYER, sceneId: null, spec: { targets: ['card'] } });
  });
});

describe('先切层再操作（导演跟随时，操作目标不在当前层里）', () => {
  it('控制器先请求切到目标所在的层，再执行这一步；提交后清空；手动选层时不切', async () => {
    const p = director();
    const scene = (id: string) => p.options['f.a']!.layers[id]!.sceneId;
    const run = async (directorOn: boolean) => {
      const c = new DemoController(null);
      c.reducedMotion = true;
      c.setProject(p, 1, null);
      c.setScenario('f.a.s', 0, { quiet: true });
      c.setStageView(scene('backend'), directorOn); // 正在看后端层，下一步要点客户端层的「发送」
      const seen: (string | null)[] = [];
      const off = c.subscribe(() => seen.push(c.getSnapshot().leadLayer));
      await c.next();
      off();
      return { seen, snap: c.getSnapshot() };
    };
    const on = await run(true);
    expect(on.seen).toContain('client');
    expect(on.snap.leadLayer).toBeNull();
    expect(on.snap.state!.position).toBe(1);
    expect(on.snap.state!.ui.sent).toBe(true);
    const off = await run(false);
    expect(off.seen.filter(Boolean)).toEqual([]);
    expect(off.snap.state!.position).toBe(1);
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
