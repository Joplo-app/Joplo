import { createZhCN } from '../src/i18n/zh-CN';
import { createBoardZhCN } from '../src/i18n/board/zh-CN';
const zh = { ...createZhCN(), ...createBoardZhCN() };
/**
 * T-stage 中能抽成纯函数的部分：舞台铺满可用区域（fillStage）、字幕区自适应高度（subtitleHeight）与结果小标记、
 * 全屏快捷键（isFullscreenKey）。界面（全屏、浮动控制淡出）由用户在浏览器里检查。
 */
import { describe, expect, it } from 'vitest';
import { SUBTITLE_HEIGHT, VIEWPORT_SIZE, type Scenario } from '@joplo-app/core';
import { fillStage } from '../src/player/fit';
import { subtitleFor, subtitleHeight } from '../src/player/subtitle-content';
import { isFullscreenKey } from '../src/player/fullscreen';

const base = VIEWPORT_SIZE.desktop;

describe('fillStage（电脑页面的舞台铺满可用区域）', () => {
  it('任何宽高比都铺满：逻辑尺寸 × 缩放 = 可用区域（误差 < 1px），两侧不再留空白', () => {
    for (const avail of [{ w: 1900, h: 880 }, { w: 1120, h: 640 }, { w: 960, h: 900 }, { w: 2560, h: 1300 }, { w: 700, h: 400 }]) {
      const f = fillStage(avail, base);
      expect(Math.abs(f.width * f.scale - avail.w)).toBeLessThan(1);
      expect(Math.abs(f.height * f.scale - avail.h)).toBeLessThan(1.6);
    }
  });
  it('设计宽度 1280 对齐可用宽度：宽屏时逻辑高度小于 800、窄高的区域逻辑高度大于 800；缩放在 0.35–1.5 之间', () => {
    const wide = fillStage({ w: 1920, h: 880 }, base);
    expect(wide.width).toBe(1280);
    expect(wide.height).toBeLessThan(800);
    const tall = fillStage({ w: 1000, h: 900 }, base);
    expect(tall.width).toBe(1280);
    expect(tall.height).toBeGreaterThan(800);
    const huge = fillStage({ w: 3840, h: 2000 }, base);
    expect(huge.scale).toBeLessThanOrEqual(1.5 + 1e-9);
    expect(huge.width).toBeGreaterThan(1280); // 超过 1.5 倍时逻辑宽度变大，仍然铺满
  });
  it('可用区域很矮时逻辑高度不小于 360（按高度缩放）', () => {
    const f = fillStage({ w: 1600, h: 200 }, base);
    expect(f.height).toBeGreaterThanOrEqual(359);
  });
});

const sc = {
  id: 's',
  description: undefined,
  mock: { label: '模拟成功', outcome: 'success' },
  steps: [
    { id: 'a', kind: 'user', caption: '点击发送' },
    { id: 'b', kind: 'system', caption: '结束', explain: undefined },
  ],
} as unknown as Scenario;

describe('字幕区：自适应高度与结果小标记', () => {
  it('没有 explain 时只占一行；有 explain 时两行；都不超过导出用的固定高度', () => {
    const one = subtitleFor(sc, 1, null, undefined, zh)!;
    const two = subtitleFor({ ...sc, steps: [{ ...sc.steps[0]!, explain: '补充一句' }] } as Scenario, 1, null, undefined, zh)!;
    expect(subtitleHeight(one)).toBeLessThan(subtitleHeight(two));
    expect(subtitleHeight(one)).toBeLessThanOrEqual(56);
    expect(subtitleHeight(two)).toBeLessThanOrEqual(SUBTITLE_HEIGHT);
    expect(subtitleHeight(null)).toBe(subtitleHeight(one));
  });
  it('平时右侧是弱化的“n / m”（D61；读屏仍是“第 n / 共 m 步”）；场景完成后是“场景完成 · 模拟成功”，第二行没有 explain 时显示结果说明（不再在步骤条里重复）', () => {
    expect(subtitleFor(sc, 1, null, undefined, zh)!.badge).toEqual({ kind: 'progress', text: '1 / 2', label: '第 1 / 2 步' });
    const done = subtitleFor(sc, 2, null, { text: '大脑规划，两只手各自执行', outcome: 'success' }, zh)!;
    expect(done.badge).toMatchObject({ kind: 'done', text: '场景完成 · 模拟成功', outcome: 'success' });
    expect(done.explain).toBe('大脑规划，两只手各自执行');
    // 正在播放（还没提交）时不显示完成
    expect(subtitleFor(sc, 2, 1, { text: 'x', outcome: 'success' }, zh)!.badge.kind).toBe('progress');
  });
});

describe('全屏快捷键 F', () => {
  it('F / f 触发；输入框聚焦或按着修饰键时不触发；其他键不触发', () => {
    const plain = { closest: () => null };
    const input = { closest: (s: string) => (s.includes('input') ? {} : null) };
    expect(isFullscreenKey({ key: 'f' }, plain)).toBe(true);
    expect(isFullscreenKey({ key: 'F' }, plain)).toBe(true);
    expect(isFullscreenKey({ key: 'f' }, input)).toBe(false);
    expect(isFullscreenKey({ key: 'f', metaKey: true }, plain)).toBe(false);
    expect(isFullscreenKey({ key: 'g' }, plain)).toBe(false);
    expect(isFullscreenKey({ key: 'f' }, null)).toBe(true);
  });
});
