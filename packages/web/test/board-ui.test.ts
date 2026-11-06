import { createZhCN } from '../src/i18n/zh-CN';
import { createBoardZhCN } from '../src/i18n/board/zh-CN';
const zh = { ...createZhCN(), ...createBoardZhCN() };
/**
 * 看板 UI v1（D55）阶段 1：看板 Token 与控件原语。
 * - 浮层定位（placePopover）：贴着锚点、放不下时翻到另一侧、夹在视口里（浮层用 portal + position: fixed，不受父级 overflow 裁切）；
 * - 覆盖状态（coverageMark）：颜色不单独表意，每种状态都有图标和中文名；
 * - Token 隔离：看板界面只用 --jb-*，舞台只读 --jp-*；浅色每个 --jb-* 在深色里都有对应值。
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { placePopover, portalHostOf } from '../src/player/popover-place';
import { COVERAGE_MARK, coverageMark } from '../src/player/status';

const SRC = path.resolve(import.meta.dirname, '../src');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');
const vp = { width: 1280, height: 800 };

describe('placePopover：浮层贴着锚点、放不下时翻转、不超出视口', () => {
  const anchor = { left: 1100, top: 10, right: 1200, bottom: 42 };
  it('bottom-end：右边与锚点对齐，在锚点下方 6px', () => {
    expect(placePopover(anchor, { width: 300, height: 200 }, vp, 'bottom-end')).toEqual({ x: 900, y: 48, side: 'bottom' });
  });
  it('bottom-start：左边与锚点对齐；右侧放不下时向左夹回视口（留 8px）', () => {
    expect(placePopover(anchor, { width: 300, height: 200 }, vp, 'bottom-start')).toEqual({ x: 1280 - 8 - 300, y: 48, side: 'bottom' });
    expect(placePopover({ left: 20, top: 10, right: 60, bottom: 42 }, { width: 200, height: 100 }, vp, 'bottom-start').x).toBe(20);
  });
  it('下方放不下时翻到上方（播放控制在页面底部，菜单向上展开）', () => {
    const low = { left: 600, top: 760, right: 640, bottom: 792 };
    expect(placePopover(low, { width: 160, height: 120 }, vp, 'bottom-start')).toEqual({ x: 600, y: 760 - 6 - 120, side: 'top' });
    // 指定 top 而上方放不下时翻到下方
    expect(placePopover({ left: 10, top: 20, right: 50, bottom: 52 }, { width: 100, height: 100 }, vp, 'top-start').side).toBe('bottom');
  });
  it('两侧都放不下时选空间大的一侧，并夹在视口内', () => {
    const mid = { left: 100, top: 380, right: 140, bottom: 412 };
    const r = placePopover(mid, { width: 200, height: 780 }, vp, 'bottom-start');
    // 两侧都放不下：取空间大的一侧后夹回视口（上下各留 8px）
    expect(r.y).toBeGreaterThanOrEqual(8);
    expect(r.y + 780).toBeLessThanOrEqual(800 - 8);
    // 浮层比视口还高时贴顶（y = 8）
    expect(placePopover(mid, { width: 200, height: 900 }, vp, 'bottom-start').y).toBe(8);
  });
  it('center：水平居中对齐锚点', () => {
    expect(placePopover({ left: 500, top: 100, right: 540, bottom: 132 }, { width: 100, height: 30 }, vp, 'top-center')).toEqual({ x: 470, y: 64, side: 'top' });
  });
  it('right-start：贴在锚点右侧、顶边对齐（左栏的悬停卡片）；右侧放不下时翻到左侧；纵向夹回视口', () => {
    const row = { left: 12, top: 300, right: 264, bottom: 334 };
    expect(placePopover(row, { width: 260, height: 120 }, vp, 'right-start')).toEqual({ x: 270, y: 300, side: 'right' });
    expect(placePopover({ left: 1100, top: 300, right: 1200, bottom: 334 }, { width: 260, height: 120 }, vp, 'right-start')).toEqual({ x: 1100 - 6 - 260, y: 300, side: 'left' });
    expect(placePopover({ left: 12, top: 760, right: 264, bottom: 794 }, { width: 260, height: 120 }, vp, 'right-start').y).toBe(800 - 8 - 120);
  });
  it('边界输入：锚点或尺寸是 0、视口很小也不产生负坐标', () => {
    const r = placePopover({ left: 0, top: 0, right: 0, bottom: 0 }, { width: 0, height: 0 }, { width: 0, height: 0 }, 'bottom-end');
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });
});

describe('portalHostOf：浮层挂在全屏元素里（全屏时 body 下的内容看不见），否则挂在 body', () => {
  it('有全屏元素时用它', () => {
    const body = { id: 'body' } as unknown as HTMLElement;
    const fs = { id: 'fs' } as unknown as Element;
    expect(portalHostOf({ body, fullscreenElement: fs } as unknown as Document)).toBe(fs);
    expect(portalHostOf({ body, fullscreenElement: null } as unknown as Document)).toBe(body);
  });
});

describe('coverageMark：图标 + 文字（颜色不单独表意）', () => {
  it('四种状态各有图标与中文名；没有覆盖记录（none）按缺失；已排除用不适用的图标', () => {
    expect(coverageMark('expressed', zh)).toEqual({ icon: 'circle-check', tone: 'ok', label: '已表达' });
    expect(coverageMark('missing', zh)).toEqual({ icon: 'circle-x', tone: 'danger', label: '缺失' });
    expect(coverageMark('none', zh)).toEqual({ icon: 'circle-x', tone: 'danger', label: '缺失' });
    expect(coverageMark('undecided', zh)).toEqual({ icon: 'circle-dashed', tone: 'pending', label: '待决定' });
    expect(coverageMark('not_applicable', zh)).toEqual({ icon: 'circle-minus', tone: 'na', label: '不适用' });
    expect(coverageMark('excluded', zh)).toMatchObject({ icon: 'circle-minus', tone: 'na', label: '已排除' });
  });
  it('未知或空的状态按缺失处理（不崩溃）', () => {
    expect(coverageMark(undefined as never, zh)).toEqual(COVERAGE_MARK(zh).missing);
    expect(coverageMark('weird' as never, zh)).toEqual(COVERAGE_MARK(zh).missing);
  });
});

describe('Token 隔离（不变量 6）', () => {
  const css = read('index.css');
  const block = (sel: string) => {
    const i = css.indexOf(`${sel} {`);
    expect(i, `index.css 里没有 ${sel}`).toBeGreaterThanOrEqual(0);
    return css.slice(i, css.indexOf('}', i));
  };
  const names = (s: string) => new Set([...s.matchAll(/(--jb-[\w-]+)\s*:/g)].map((m) => m[1]!));
  it('浅色（:root）的每个 --jb-* 在深色（.jb-dark）里都有值，反之亦然', () => {
    const light = names(block(':root'));
    const dark = names(block('.jb-dark'));
    expect(light.size).toBeGreaterThan(20);
    for (const n of light) if (!/^--jb-(font|mono|radius|shadow|e1|stroke)/.test(n)) expect(dark.has(n), `深色缺少 ${n}`).toBe(true);
    for (const n of dark) expect(light.has(n), `浅色缺少 ${n}`).toBe(true);
  });
  it('设计 Token 的关键值与设计稿一致（暖灰底、黄色当前、墨线）', () => {
    const l = block(':root');
    expect(l).toMatch(/--jb-bg-app:\s*#F4F1EA/i);
    expect(l).toMatch(/--jb-accent:\s*#FFD23F/i);
    expect(l).toMatch(/--jb-accent-press:\s*#E0AE00/i);
    expect(l).toMatch(/--jb-border-strong:\s*#1E1E1E/i);
    expect(l).toMatch(/--jb-bg-selected:\s*#FFF2BF/i);
  });
  it('看板控件原语只用 --jb-* / jb-* 工具类：不读 --jp-*，不写死颜色', () => {
    for (const f of ['player/controls.tsx', 'player/popover.tsx', 'player/StatusIcon.tsx']) {
      const src = read(f);
      expect(src, `${f} 读了舞台变量`).not.toMatch(/--jp-/);
      expect(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), `${f} 写死了颜色`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
  it('舞台（renderer/）不读看板 Token', () => {
    for (const f of fs.readdirSync(path.join(SRC, 'renderer'))) {
      if (!/\.(tsx?|css)$/.test(f)) continue;
      expect(read(`renderer/${f}`), `renderer/${f} 读了看板 Token`).not.toMatch(/--jb-|\bjb-(?!dark)/);
    }
  });
});
