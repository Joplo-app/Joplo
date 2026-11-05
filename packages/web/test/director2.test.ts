/**
 * T-director2 中能抽成纯函数的部分：停留时长（stepDwell）、解说卡定位避让（placeCallout / cardReserve）、
 * 自由缩放与平移夹紧（zoomAt / clampPan / wheelFactor）、速度写进 URL、解说卡预留下的镜头拟合。
 * 界面（分段控件不高亮、拖动、解说卡外观）由用户在浏览器里检查。
 */
import { describe, expect, it } from 'vitest';
import { CAMERA_MS, MIN_DWELL, MS_PER_CHAR, asSpeed, readChars, stepDwell } from '../src/runtime/pace';
import { CARD_MARGIN, cardReserve, placeCallout, type Box } from '../src/player/callout';
import { CAMERA_PAD, PAN_KEEP, ZOOM_MAX, ZOOM_MIN, clampPan, fitCamera, project, wheelFactor, zoomAt } from '../src/renderer/camera-math';
import { boardHash, parseBoardHash, parseSiteHash, siteHash } from '../src/runtime/route';

describe('stepDwell（每一步的停留时长）', () => {
  it('约 60ms/字（去掉空白），下限 3 秒', () => {
    expect(readChars('调用 模型\n之前', 'ab c')).toBe(9);
    expect(stepDwell({ texts: ['短'] })).toBe(MIN_DWELL);
    const long = '调'.repeat(100);
    expect(stepDwell({ texts: [long] })).toBe(100 * MS_PER_CHAR);
    // 说明与解说一起算
    expect(stepDwell({ texts: ['调'.repeat(40), '解'.repeat(60)] })).toBe(100 * MS_PER_CHAR);
    expect(stepDwell({ texts: [null, undefined, ''] })).toBe(MIN_DWELL);
  });
  it('速度缩放阅读时间；镜头过渡与连线小点一圈不随速度缩短', () => {
    const t = ['调'.repeat(100)];
    expect(stepDwell({ texts: t, speed: 0.5 })).toBe(12000);
    expect(stepDwell({ texts: t, speed: 1.5 })).toBe(4000);
    expect(stepDwell({ texts: ['短'], speed: 1.5 })).toBe(2000);
    // 小点一圈 3.8 秒：至少等它跑完（加一点余量）
    expect(stepDwell({ texts: ['短'], speed: 1.5, dotMs: 3800 })).toBeGreaterThanOrEqual(3800);
    expect(stepDwell({ texts: ['短'], speed: 1.5, cameraMoved: true })).toBeGreaterThanOrEqual(CAMERA_MS);
    expect(stepDwell({ texts: ['短'], speed: 0 })).toBe(MIN_DWELL); // 非法速度按 1×
  });
  it('只接受 0.5 / 1 / 1.5', () => {
    expect([asSpeed('0.5'), asSpeed(1.5), asSpeed(2), asSpeed(undefined), asSpeed('x')]).toEqual([0.5, 1.5, 1, 1, 1]);
  });
});

describe('placeCallout（解说卡：焦点旁边、带箭头、避开画面边缘）', () => {
  const frame = { W: 1280, H: 800 };
  const card = { w: 400, h: 160 };
  const inFrame = (x: number, y: number) => x >= CARD_MARGIN - 1e-6 && y >= CARD_MARGIN - 1e-6 && x + card.w <= frame.W - CARD_MARGIN + 1e-6 && y + card.h <= frame.H - CARD_MARGIN + 1e-6;
  const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  it('优先放在右侧；右侧放不下换左侧、下方、上方；卡片总在画面内、不压住焦点', () => {
    const cases: [Box, string][] = [
      [{ x: 100, y: 300, w: 200, h: 80 }, 'right'],
      [{ x: 900, y: 300, w: 300, h: 80 }, 'left'],
      [{ x: 100, y: 40, w: 1080, h: 200 }, 'bottom'],
      [{ x: 100, y: 560, w: 1080, h: 200 }, 'top'],
    ];
    for (const [a, side] of cases) {
      const p = placeCallout(a, card, frame);
      expect(p.side, JSON.stringify(a)).toBe(side);
      expect(inFrame(p.x, p.y)).toBe(true);
      expect(overlap(a, { x: p.x, y: p.y, w: card.w, h: card.h })).toBe(0);
      // 箭头尖端贴着焦点的边
      const t = p.arrow!;
      const near = Math.min(Math.abs(t.x - a.x), Math.abs(t.x - (a.x + a.w)), Math.abs(t.y - a.y), Math.abs(t.y - (a.y + a.h)));
      expect(near).toBeLessThanOrEqual(3);
    }
  });
  it('焦点贴着画面边缘时卡片被夹进画面；焦点占满画面时放在空间最大的一侧并仍在画面内', () => {
    const edge = placeCallout({ x: 0, y: 760, w: 120, h: 40 }, card, frame);
    expect(inFrame(edge.x, edge.y)).toBe(true);
    const full = placeCallout({ x: 10, y: 10, w: 1260, h: 780 }, card, frame);
    expect(inFrame(full.x, full.y)).toBe(true);
  });
  it('没有焦点：画面底部居中，没有箭头', () => {
    const p = placeCallout(null, card, frame);
    expect(p.side).toBe('none');
    expect(p.arrow).toBeNull();
    expect(Math.abs(p.x + card.w / 2 - frame.W / 2)).toBeLessThan(1e-6);
    expect(inFrame(p.x, p.y)).toBe(true);
  });
  it('导演模式的镜头给解说卡留位置：聚焦后焦点在剩余区域内，卡片放在右侧不压住焦点', () => {
    const r = cardReserve(1280, 400);
    expect(r.right).toBeGreaterThanOrEqual(400);
    for (const bbox of [{ x: 40, y: 60, w: 120, h: 36 }, { x: 700, y: 120, w: 540, h: 620 }, { x: 0, y: 300, w: 1280, h: 40 }]) {
      const f = fitCamera({ W: 1280, H: 800, mode: 'focus', bbox, reserve: r });
      const b = project(bbox, f);
      expect(b.x + b.w).toBeLessThanOrEqual(1280 - r.right - CAMERA_PAD + 1e-6);
      expect(b.x).toBeGreaterThanOrEqual(CAMERA_PAD - 1e-6);
      const p = placeCallout(b, card, frame);
      expect(p.side).toBe('right');
      expect(overlap(b, { x: p.x, y: p.y, w: card.w, h: card.h })).toBe(0);
    }
    // 窄屏（手机）：留底部
    expect(cardReserve(390, 366)).toEqual({ right: 0, bottom: 220 });
  });
});

describe('自由缩放与平移（zoomAt / clampPan / wheelFactor）', () => {
  it('以鼠标位置为中心缩放：鼠标下的内容点不动；总缩放夹在 0.25–4', () => {
    const v = { k: 1.3, tx: -120, ty: 40 };
    const pt = { x: 500, y: 333 };
    const content = { x: (pt.x - v.tx) / v.k, y: (pt.y - v.ty) / v.k };
    const z = zoomAt(v, 1.7, pt);
    expect(z.tx + z.k * content.x).toBeCloseTo(pt.x, 6);
    expect(z.ty + z.k * content.y).toBeCloseTo(pt.y, 6);
    expect(zoomAt(v, 100, pt).k).toBe(ZOOM_MAX);
    expect(zoomAt(v, 0.001, pt).k).toBe(ZOOM_MIN);
    // 到了上限再放大：位置不变
    const top = zoomAt({ k: ZOOM_MAX, tx: 10, ty: 20 }, 2, pt);
    expect(top).toEqual({ k: ZOOM_MAX, tx: 10, ty: 20 });
  });
  it('平移夹紧：内容至少露出 80px，不会被拖到看不见；范围内的平移不变', () => {
    const W = 1280, H = 800, b = { x: 0, y: 0, w: 1280, h: 800 };
    expect(clampPan({ k: 2, tx: -300, ty: -200 }, W, H, b)).toEqual({ k: 2, tx: -300, ty: -200 });
    const far = clampPan({ k: 2, tx: -99999, ty: 99999 }, W, H, b);
    expect(far.tx + 2 * (b.x + b.w)).toBeCloseTo(PAN_KEEP, 6); // 右边缘留在画面左侧 80px 处
    expect(far.ty + 2 * b.y).toBeCloseTo(H - PAN_KEEP, 6); // 上边缘留在画面底部 80px 处
    // 缩得很小：内容可以在画面里任意移动，但不出画面边界以外太多
    const small = clampPan({ k: 0.25, tx: 5000, ty: -5000 }, W, H, b);
    expect(small.tx + 0.25 * b.x).toBeLessThanOrEqual(W - PAN_KEEP + 1e-6);
    expect(small.ty + 0.25 * (b.y + b.h)).toBeGreaterThanOrEqual(PAN_KEEP - 1e-6);
  });
  it('滚轮倍数：向上放大、向下缩小；捏合（ctrl）更灵敏；按行滚动换算成像素；单次不超过 2 倍', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-10, { ctrlKey: true })).toBeGreaterThan(wheelFactor(-10));
    expect(wheelFactor(-3, { deltaMode: 1 })).toBeCloseTo(wheelFactor(-48), 9);
    expect(wheelFactor(-100000)).toBe(2);
    expect(wheelFactor(100000)).toBe(0.5);
  });
});

describe('URL：速度 speed 记在 URL 里（1× 不写）', () => {
  it('往返不变；非法值忽略', () => {
    const r = { kind: 'play' as const, projectId: 'p', play: { featureId: 'agent', step: 3, speed: 1.5 } };
    expect(boardHash(r)).toBe('#/p/f/agent?step=3&speed=1.5');
    expect(parseBoardHash(boardHash(r))).toEqual(r);
    expect(parseBoardHash('#/p/f/agent?speed=3')).toEqual({ kind: 'play', projectId: 'p', play: { featureId: 'agent' } });
    expect(siteHash({ kind: 'play', play: { featureId: 'agent', speed: 1 } })).toBe('#/f/agent');
    expect(parseSiteHash('#/f/agent?speed=0.5&l=backend')).toEqual({ kind: 'play', play: { featureId: 'agent', layer: 'backend', speed: 0.5 } });
  });
});
