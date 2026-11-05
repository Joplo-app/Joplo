/**
 * T-director3 中能抽成纯函数的部分：解说卡锚点（cardAnchors）与位置避让（placeCallout + obstacles）、卡片尺寸（cardSize）、
 * 镜头时序（cameraPosition）、导演层的选取（协调者报告的 agent-arch 第 10 步）。界面由用户在浏览器里检查。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@tokenroll/joplo-kit/ui';
import { config, feature, flow, layer, option, page, set, shot, $ } from '@tokenroll/joplo-kit';
import { jsx } from '@tokenroll/joplo-kit/jsx-runtime';
import { cameraAt, compile, type AuthoringProject } from '@tokenroll/joplo-core';
import { CARD_MARGIN, cardMaxWidth, cardSize, placeCallout, type Box } from '../src/player/callout';
import { cameraFor, cameraPosition, cardAnchors, cardPlan } from '../src/player/cameraFor';

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const onEdge = (t: { x: number; y: number }, a: Box) =>
  ((Math.abs(t.x - a.x) < 0.01 || Math.abs(t.x - (a.x + a.w)) < 0.01) && t.y >= a.y - 0.01 && t.y <= a.y + a.h + 0.01) ||
  ((Math.abs(t.y - a.y) < 0.01 || Math.abs(t.y - (a.y + a.h)) < 0.01) && t.x >= a.x - 0.01 && t.x <= a.x + a.w + 0.01);

describe('placeCallout：锚定主目标、箭头尖端落在它的边上、不压住本步任何焦点', () => {
  const frame = { W: 1280, H: 800 };
  const card = { w: 620, h: 150 };
  it('第 10 步那样两个焦点（Biz 在上、沙箱在左下）：卡片放在主目标旁边的空白处，箭头指到主目标的边上，不压住另一个焦点', () => {
    const biz: Box = { x: 520, y: 180, w: 260, h: 90 };
    const sandbox: Box = { x: 60, y: 500, w: 280, h: 110 };
    const p = placeCallout(biz, card, frame, [biz, sandbox]);
    expect(onEdge(p.arrow!, biz)).toBe(true);
    expect(overlap({ x: p.x, y: p.y, ...card }, biz)).toBe(0);
    expect(overlap({ x: p.x, y: p.y, ...card }, sandbox)).toBe(0);
    // 箭头从卡片的边出发
    const t = p.tail!;
    expect(t.x >= p.x - 0.01 && t.x <= p.x + card.w + 0.01 && t.y >= p.y - 0.01 && t.y <= p.y + card.h + 0.01).toBe(true);
  });
  it('各种位置的锚点与多个焦点：卡片在画面内；放得下时不压住任何焦点；箭头尖端总在锚点边上', () => {
    const boxes: Box[] = [
      { x: 40, y: 40, w: 200, h: 60 },
      { x: 1000, y: 60, w: 240, h: 80 },
      { x: 500, y: 650, w: 300, h: 100 },
      { x: 300, y: 300, w: 680, h: 200 },
      { x: 1100, y: 700, w: 150, h: 60 },
    ];
    for (const a of boxes) {
      const others = boxes.filter((b) => b !== a && overlap(b, a) === 0);
      const p = placeCallout(a, card, frame, others);
      expect(p.x).toBeGreaterThanOrEqual(CARD_MARGIN - 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(CARD_MARGIN - 1e-6);
      expect(p.x + card.w).toBeLessThanOrEqual(frame.W - CARD_MARGIN + 1e-6);
      expect(p.y + card.h).toBeLessThanOrEqual(frame.H - CARD_MARGIN + 1e-6);
      expect(onEdge(p.arrow!, a), JSON.stringify(a)).toBe(true);
      expect(overlap({ x: p.x, y: p.y, ...card }, a), JSON.stringify(a)).toBe(0);
    }
  });
  it('右侧放不下：换到下方或上方；左右上下都被焦点占满：取压住最少的位置，仍在画面内', () => {
    const a: Box = { x: 900, y: 300, w: 300, h: 80 };
    const p = placeCallout(a, card, frame);
    expect(['left', 'bottom', 'top']).toContain(p.side);
    const crowd = placeCallout({ x: 20, y: 20, w: 1240, h: 760 }, card, frame);
    expect(crowd.x + card.w).toBeLessThanOrEqual(frame.W - CARD_MARGIN + 1e-6);
  });
  it('没有锚点：底部居中；底部有焦点时换到上方', () => {
    const p = placeCallout(null, card, frame);
    expect(p.arrow).toBeNull();
    const q = placeCallout(null, card, frame, [{ x: 0, y: 560, w: 1280, h: 240 }]);
    expect(q.y + card.h).toBeLessThan(560);
  });
});

describe('cardSize：宽度自适应文字，最大约为舞台 60%（不小于 480）；一般一到两行', () => {
  it('短说明一行、卡片随文字变窄；长说明最多到上限宽度并折成两行左右', () => {
    expect(cardMaxWidth(1280)).toBe(768);
    expect(cardMaxWidth(700)).toBe(480);
    expect(cardMaxWidth(390)).toBe(366);
    const short = cardSize('沙箱执行完成', null, 1280);
    expect(short.w).toBeLessThan(400);
    const long = cardSize('在「让 Agent 做点什么…」中输入“帮我把桌面「报销」文件夹里的发票整理成一张汇总表”', null, 1280);
    expect(long.w).toBe(768);
    expect(long.h).toBeLessThan(2 * 26 * 1.35 + 2 * 16 + 10); // 两行以内
    const both = cardSize('大脑汇总结果，回答经 Biz Server 回到客户端', '同一个大脑，另一只手：不需要本机的工具交给云端沙箱，每个任务一个隔离环境，用完即销毁。', 1280);
    expect(both.h).toBeGreaterThan(long.h);
  });
});

// ---------- 导演层与镜头时序（协调者报告：第 10 步 shot('tc_sheet') 在前，导演层应是客户端） ----------
const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
function arch() {
  const home = page({ title: 'A', layout: false }, h(ui.Text, { id: 'note' }, '路径页面'));
  const client = h(ui.Stack, null, h(ui.ToolCall, { id: 'tc_sheet', title: 'make_sheet' }, '生成'), h(ui.Button, { id: 'send' }, '发送'));
  const backend = h(ui.Diagram, { id: 'arch' }, h(ui.Diagram.Node, { id: 'biz', label: 'Biz' }), h(ui.Diagram.Node, { id: 'sandbox', label: '沙箱' }), h(ui.Diagram.Edge, { id: 'e', from: 'biz', to: 'sandbox' }));
  const opt = option({
    name: 'A',
    idea: 'i',
    on: {},
    state: { ui: { t: 'idle' } },
    layers: { client: layer('客户端视角', client as never), backend: layer('后端流转', backend as never) },
    scenarios: {
      s: flow('一次', { start: '/' })
        .click('send', '发出')
        .system('工具调用 make_sheet', shot('biz', 'sandbox'), shot('tc_sheet'))
        .system('沙箱执行完成', shot('tc_sheet'), shot('sandbox'), set($.ui.t, 'done')),
    },
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

describe('导演层的选取与镜头时序', () => {
  const p = arch();
  const sc = p.scenarios['f.a.s']!;
  it('“沙箱执行完成”第一个 shot 是只在客户端层的 tc_sheet：导演层是客户端；cameraAt 在这一步之后对准客户端的 tc_sheet，后端层对准 sandbox', () => {
    expect(sc.steps[2]!.directorLayer).toBe('client');
    expect(sc.steps[1]!.directorLayer).toBe('backend');
    const cam = cameraAt(p, sc.id, 3);
    expect(cam.directorLayer).toBe('client');
    expect(cam.perLayer).toMatchObject({ client: ['tc_sheet'], backend: ['sandbox'] });
    expect(cameraFor(p, sc.id, 3, null)).toMatchObject({ viewLayer: 'client', spec: { targets: ['tc_sheet'] } });
  });
  it('系统步骤一开始播放就用这一步的镜头（此前停在上一步的 biz + sandbox）；用户操作在提交之后才切', () => {
    // 第 3 步（下标 2）正在播放、尚未提交：position = 2
    expect(cameraPosition(sc, 2, 2)).toBe(3);
    expect(cameraFor(p, sc.id, cameraPosition(sc, 2, 2), null)).toMatchObject({ viewLayer: 'client', spec: { targets: ['tc_sheet'] } });
    expect(cameraPosition(sc, 0, 0)).toBe(0); // 用户点击：先在当前画面里点到目标
    expect(cameraPosition(sc, 2, null)).toBe(2);
    expect(cameraPosition(null, 2, 2)).toBe(2);
  });
  it('解说卡锚点：导演层本步第一个 shot 的第一个 id；没有 shot 时是被操作的元素', () => {
    expect(cardAnchors(p, sc.id, 2, 'client')).toEqual(['tc_sheet']);
    expect(cardAnchors(p, sc.id, 2, 'backend')).toEqual(['sandbox']);
    expect(cardAnchors(p, sc.id, 1, 'backend')[0]).toBe('biz');
    expect(cardAnchors(p, sc.id, 0, 'client')[0]).toBe('send');
    const plan = cameraFor(p, sc.id, 3, null);
    const card = cardPlan(p, sc.id, plan, true, 2, 1280)!;
    expect(card.step.caption).toBe('沙箱执行完成');
    expect(card.anchors[0]).toBe('tc_sheet');
    // 手动选层（导演关闭）不显示解说卡
    expect(cardPlan(p, sc.id, cameraFor(p, sc.id, 3, 'backend'), false, 2, 1280)).toBeNull();
  });
});
