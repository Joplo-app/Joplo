/**
 * T-director2 中能抽成纯函数的部分：停留时长（stepDwell）、
 * 自由缩放与平移夹紧（zoomAt / clampPan / wheelFactor）、速度写进 URL。
 * 界面（分段控件不高亮、拖动、解说卡外观）由用户在浏览器里检查。
 */
import { describe, expect, it } from 'vitest';
import { CAMERA_MS, MIN_DWELL, MS_PER_CHAR, asSpeed, readChars, stepDwell } from '../src/runtime/pace';
import { PAN_KEEP, ZOOM_MAX, ZOOM_MIN, clampPan, wheelFactor, zoomAt } from '../src/renderer/camera-math';
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
