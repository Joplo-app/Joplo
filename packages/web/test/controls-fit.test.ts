import { createZhCN } from '../src/i18n/zh-CN';
import { createBoardZhCN } from '../src/i18n/board/zh-CN';
const zh = { ...createZhCN(), ...createBoardZhCN() };
/**
 * 全屏控制条按宽度收起（T-polish）：1280×800、1440×900、1920×1080 三种宽度，控件区不换行、不重叠、不溢出；
 * （非全屏的演示页布局见 board-page.test.ts）
 * 宽度不够时按优先级收起：① 上一步 / 播放 / 下一步 → 图标，② 速度 → 「…」，③ 层级切换 → 下拉菜单。
 * （不换行由 white-space: nowrap 保证；这里检查收起之后的总宽度放得下。）
 */
import { describe, expect, it } from 'vitest';
import { SPEEDS } from '../src/runtime/pace';
import { CTRL, buttonW, collapseToFit, fullscreenBarCollapse, navGroup, rowWidth, segmentedW, speedGroup, layersGroup, directorW, textW } from '../src/player/controls-fit';

const layers = ['客户端视角', '后端流转', '核心块说明'];
const playLabels = ['播放', '暂停', '继续', '重新播放'];
/** 全屏控制条可用宽度 = 视口 − 48。 */
const barW = (vw: number) => vw - 48;

describe('尺寸估算', () => {
  it('文字宽度：中文按字号，英文数字按 0.6；按钮 = 左右 12 + 图标 16 + 间距 4 + 文字；只有图标时是正方形', () => {
    expect(textW('上一步')).toBe(42);
    expect(textW('1.5×')).toBe(Math.ceil(14 * 0.6 * 4));
    expect(buttonW('上一步', 36)).toBe(24 + 20 + 42);
    expect(buttonW('上一步', 32, true)).toBe(32);
    expect(segmentedW(['a', 'b'])).toBe(8 + 2 * (24 + 9) + 2);
  });
});

describe('三种宽度：全屏控制条放得下、不收起', () => {
  for (const vw of [1280, 1440, 1920])
    for (const pl of playLabels)
      for (const director of [true, false])
        it(`${vw}px · ${pl} · 导演${director ? '跟随' : '暂停'}`, () => {
          expect([...fullscreenBarCollapse(barW(vw), pl, SPEEDS, layers, director, '核心块说明', zh)]).toEqual([]);
        });
});

describe('窄的时候按优先级收起，收起后放得下；任何宽度都不会“放不下又不收”', () => {
  it('全屏控制条：先收三件套，再收速度，最后收层级切换', () => {
    const full = fullscreenBarCollapse(2000, '重新播放', SPEEDS, layers, true, '后端流转', zh);
    expect(full.size).toBe(0);
    const order: string[] = [];
    let prev = new Set<string>();
    for (let w = 1400; w >= 300; w -= 10) {
      const c = fullscreenBarCollapse(w, '重新播放', SPEEDS, layers, true, '后端流转', zh);
      for (const id of c) if (!prev.has(id)) order.push(id);
      prev = c;
    }
    expect(order).toEqual(['nav', 'speed', 'layers']);
  });
  it('从 320 到 2400 的每个宽度：收起之后总宽度 ≤ 可用宽度，或者已经全部收起（容器横向裁切，不换行）', () => {
    const groups = [navGroup(CTRL.sm, '重新播放', zh), speedGroup(SPEEDS, CTRL.sm), layersGroup(layers, CTRL.sm, zh)];
    const fixed = 16 + CTRL.sm + 2 * 9 + directorW(true, '后端流转', zh);
    for (let w = 320; w <= 2400; w += 8) {
      const c = collapseToFit(w, fixed, groups, CTRL.gap, 2);
      expect(rowWidth(fixed, groups, c, CTRL.gap, 2) <= w || c.size === groups.length, `宽度 ${w}`).toBe(true);
    }
  });
});
