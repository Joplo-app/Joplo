import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 手机上像看视频一样看分享（examples/joplo mobile_watch，已确认）：
 * - 舞台按设计尺寸（1280×800）整体等比缩放，像视频一样留黑边，不按手机宽度重新排版；
 * - 手机竖屏 / 横屏的判断；横屏时的手势：点一下 = 显示 / 隐藏控件，左右滑 = 下一步 / 上一步；
 * - 自动播放时一个场景播完接着播下一个（按选定方案的场景顺序），最后一个播完停下；手动一步步看时不自动跳。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui';
import { feature, flow, option, page } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject, type Project } from '@joplo-app/core';
import { DemoController } from '../src/runtime/demo';
import { videoStage } from '../src/player/fit';
import { gestureOf, nextScenarioId, phoneLayout } from '../src/player/watch';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 4000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await sleep(10);
  }
};

describe('videoStage：按设计尺寸等比缩放（留黑边）', () => {
  const base = { width: 1280, height: 800 };
  it('竖屏手机：宽度决定缩放，舞台逻辑尺寸不变', () => {
    expect(videoStage({ w: 390, h: 700 }, base)).toEqual({ width: 1280, height: 800, scale: 390 / 1280 });
  });
  it('横屏手机：高度决定缩放，左右留黑边', () => {
    const s = videoStage({ w: 844, h: 390 }, base);
    expect(s.width).toBe(1280);
    expect(s.scale).toBeCloseTo(390 / 800);
  });
  it('可用区域为 0 时不出现 0 或负数', () => {
    expect(videoStage({ w: 0, h: 0 }, base).scale).toBeGreaterThan(0);
  });
});

describe('phoneLayout：只在手机（粗指针、短边 < 600）上启用视频式布局', () => {
  it('竖着 / 横着', () => {
    expect(phoneLayout({ width: 390, height: 844, coarse: true })).toBe('portrait');
    expect(phoneLayout({ width: 844, height: 390, coarse: true })).toBe('landscape');
  });
  it('平板、电脑窄窗口不算手机', () => {
    expect(phoneLayout({ width: 820, height: 1180, coarse: true })).toBeNull();
    expect(phoneLayout({ width: 390, height: 844, coarse: false })).toBeNull();
  });
});

describe('gestureOf：横屏时的触摸手势', () => {
  it('短促、几乎不动 = 点一下', () => {
    expect(gestureOf({ dx: 3, dy: -2, ms: 180 })).toBe('tap');
  });
  it('水平滑动超过 50px：向左 = 下一步，向右 = 上一步', () => {
    expect(gestureOf({ dx: -90, dy: 10, ms: 250 })).toBe('next');
    expect(gestureOf({ dx: 80, dy: -12, ms: 300 })).toBe('prev');
  });
  it('竖向为主、太慢的拖动、或距离不够：什么都不做', () => {
    expect(gestureOf({ dx: 40, dy: 120, ms: 250 })).toBeNull();
    expect(gestureOf({ dx: -30, dy: 0, ms: 250 })).toBeNull();
    expect(gestureOf({ dx: -120, dy: 0, ms: 1500 })).toBeNull();
    expect(gestureOf({ dx: 2, dy: 2, ms: 900 })).toBeNull(); // 长按不是点一下
  });
});

describe('nextScenarioId', () => {
  it('按顺序取下一个；最后一个、或不在列表里时返回 null', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(nextScenarioId(list, 'a')).toBe('b');
    expect(nextScenarioId(list, 'c')).toBeNull();
    expect(nextScenarioId(list, 'x')).toBeNull();
  });
  it('skips explicitly optional branches without treating return links as exclusions', () => {
    const list = [{ id: 'main' }, { id: 'bonus', autoplay: false }, { id: 'ending', autoplay: true }];
    expect(nextScenarioId(list, 'main')).toBe('ending');
    expect(nextScenarioId(list, 'bonus')).toBeNull();
    expect(nextScenarioId(list, 'ending')).toBeNull();
  });
});

function project(autoplay?: boolean, mode: 'dev' | 'publish' = 'dev'): Project {
  const home = page({ title: 'Home', layout: false }, h(ui.Group, null, h(ui.Button, { id: 'go' }, 'Go')));
  const opt = option({
    name: 'A',
    idea: 'i',
    scenarios: {
      one: flow('One', { start: '/' }).click('go', 'First chapter'),
      two: flow('Two', { start: '/', autoplay }).click('go', 'Second chapter'),
    },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  return compile(src, mode).project!;
}

it('preserves the explicit autoplay choice in both author and publish IR', () => {
  expect(project(false).scenarios['f.a.two']!.autoplay).toBe(false);
  expect(project(false, 'publish').scenarios['f.a.two']!.autoplay).toBe(false);
  expect(project().scenarios['f.a.one']!.autoplay).toBeUndefined();
});

function setup() {
  const c = new DemoController(null);
  c.reducedMotion = true;
  c.setProject(project(), 1, null);
  c.setScenario('f.a.one', 0, { quiet: true });
  c.autoNextDelay = 20;
  c.autoNext = (id) => nextScenarioId([{ id: 'f.a.one' }, { id: 'f.a.two' }], id);
  return c;
}

describe('DemoController.autoNext：自动播放时接着播下一个场景', () => {
  it('第一个播完自动进入第二个并播放；最后一个播完停下', async () => {
    const c = setup();
    void c.play();
    await until(() => c.getSnapshot().scenarioId === 'f.a.two' && c.getSnapshot().playing);
    await until(() => !c.getSnapshot().playing && c.getSnapshot().state?.position === 1);
    expect(c.getSnapshot().scenarioId).toBe('f.a.two');
    await sleep(80);
    expect(c.getSnapshot().scenarioId).toBe('f.a.two');
  });
  it('手动一步步走到结尾：不自动跳', async () => {
    const c = setup();
    await c.next();
    await until(() => c.getSnapshot().state?.position === 1);
    await sleep(80);
    expect(c.getSnapshot().scenarioId).toBe('f.a.one');
  });
  it('等待跳转时暂停 / 停止：不再跳', async () => {
    const c = setup();
    c.autoNextDelay = 200;
    void c.play();
    await until(() => c.getSnapshot().state?.position === 1 && !c.getSnapshot().busy);
    c.stop();
    await sleep(300);
    expect(c.getSnapshot().scenarioId).toBe('f.a.one');
  });
});

describe('Phone landscape：横放的手机外框（画 mobile_watch 原型用到的正式组件能力）', () => {
  it('内容区 772×358；外框尺寸按横放的安全区计算；core 的子区域宽度按横屏宽度算', async () => {
    const { phoneFrameSize, PHONE_LANDSCAPE } = await import('../../../plugins/ui/src/runtime.tsx');
    const {components} = await import('../../../plugins/ui/src/plugin.ts');
    const { childWidth } = await import('@joplo-app/core');
    expect(PHONE_LANDSCAPE).toEqual({ width: 772, height: 358 });
    const land = phoneFrameSize(772, 358, true);
    const port = phoneFrameSize(390, 844);
    expect(land.width).toBeGreaterThan(land.height);
    expect(port.height).toBeGreaterThan(port.width);
    expect(childWidth({traits:components.Phone!.traits}, 1280, { landscape: true })).toBe(772);
    expect(childWidth({traits:components.Phone!.traits}, 1280)).toBe(390);
    expect(childWidth({}, 1280, { landscape: true })).toBe(1280);
  });
});

describe('unrotate：转了 90° 的播放区里，把屏幕坐标换回旋转前的布局坐标', () => {
  it('容器左上角的元素、靠右下的元素都换算正确，宽高对调', async () => {
    const { unrotate } = await import('../src/renderer/rect');
    // 竖着的手机 390×844：容器旋转前是 844 宽、390 高，转完占满屏幕 → 屏幕上的外框是 (0,0,390,844)
    const host = { left: 0, top: 0, width: 390, height: 844, right: 390, bottom: 844 };
    // 旋转前位于 (0,0)、100×50 的元素：屏幕上在右上角，宽 50、高 100
    expect(unrotate({ left: 340, top: 0, width: 50, height: 100, right: 390, bottom: 100 }, host)).toMatchObject({ x: 0, y: 0, width: 100, height: 50 });
    // 旋转前位于 (600, 200)、80×40 的元素：屏幕上 left = 390 − 200 − 40 = 150，top = 600
    expect(unrotate({ left: 150, top: 600, width: 40, height: 80, right: 190, bottom: 680 }, host)).toMatchObject({ x: 600, y: 200, width: 80, height: 40, right: 680, bottom: 240 });
  });
});

describe('DemoController 下一章倒计时（upNext）', () => {
  it('两章之间显示下一章与剩余秒数；倒计时结束自动播放', async () => {
    const c = setup();
    c.autoNextDelay = 1500;
    void c.play();
    await until(() => !!c.getSnapshot().upNext);
    expect(c.getSnapshot().upNext).toMatchObject({ scenarioId: 'f.a.two', left: 2 });
    await until(() => c.getSnapshot().scenarioId === 'f.a.two', 5000);
    expect(c.getSnapshot().upNext).toBeNull();
  });
  it('立即播放：不等倒计时', async () => {
    const c = setup();
    c.autoNextDelay = 60_000;
    void c.play();
    await until(() => !!c.getSnapshot().upNext);
    c.playNextNow();
    await until(() => c.getSnapshot().scenarioId === 'f.a.two' && c.getSnapshot().playing);
    expect(c.getSnapshot().upNext).toBeNull();
  });
  it('取消：停在这一章的结尾，不再跳', async () => {
    const c = setup();
    c.autoNextDelay = 400;
    void c.play();
    await until(() => !!c.getSnapshot().upNext);
    c.cancelNext();
    expect(c.getSnapshot().upNext).toBeNull();
    expect(c.getSnapshot().playing).toBe(false);
    await sleep(600);
    expect(c.getSnapshot().scenarioId).toBe('f.a.one');
  });
});

describe('DemoController 接力（flow({ from })，D92）：一镜到底，不倒计时、不重置', () => {
  function relay(): Project {
    const home = page({ title: 'Home', layout: false }, h(ui.Group, null, h(ui.Button, { id: 'go' }, 'Go')));
    const opt = option({ name: 'A', idea: 'i', scenarios: {
      one: flow('One', { start: '/' }).click('go', 'First chapter'),
      two: flow('Two', { from: 'one' }).click('go', 'Second chapter'),
    } });
    const src: AuthoringProject = { root: '/p', config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') }, layouts: {}, routes: { '/': { ...home, ...F('routes/page.tsx') } },
      features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } } };
    return compile(src, 'dev').project!;
  }
  it('接力的下一章：没有 upNext、播放不停、跳转计数 seek 不变，状态从上一章结尾继续', async () => {
    const c = new DemoController(null);
    c.reducedMotion = true;
    c.setProject(relay(), 1, null);
    c.setScenario('f.a.one', 0, { quiet: true });
    c.autoNextDelay = 60_000;
    c.autoNext = (id) => nextScenarioId([{ id: 'f.a.one' }, { id: 'f.a.two' }], id);
    const seen: { upNext: boolean; playing: boolean; seek: number }[] = [];
    c.subscribe(() => { const s = c.getSnapshot(); seen.push({ upNext: !!s.upNext, playing: s.playing, seek: s.seek }); });
    const seek = c.getSnapshot().seek;
    void c.play();
    await until(() => c.getSnapshot().scenarioId === 'f.a.two' && c.getSnapshot().state?.position === 1);
    await until(() => !c.getSnapshot().playing);
    expect(seen.some(s => s.upNext)).toBe(false);
    // 开播后第一次停下就是全片结束：换章时没有任何一刻 playing=false
    const start = seen.findIndex(s => s.playing);
    const stopAt = seen.findIndex((s, i) => i > start && !s.playing);
    expect(stopAt).toBe(seen.length - 1);
    expect(c.getSnapshot().state?.position).toBe(1);
    expect([...new Set(seen.map(s => s.seek))]).toEqual([seek]);
  });
});

describe('U2 默认无缝接下一个场景（D92）：看板与发布站同一条规则', () => {
  function chain(): Project {
    const home = page({ title: 'Home', layout: false }, h(ui.Group, null, h(ui.Button, { id: 'go' }, 'Go')));
    const opt = option({ name: 'A', idea: 'i', scenarios: {
      one: flow('One', { start: '/' }).click('go', 'First'),
      side: flow('Side', { start: '/', autoplay: false }).click('go', 'Side branch'),
      two: flow('Two', { from: 'one' }).click('go', 'Second'),
      three: flow('Three', { start: '/' }).click('go', 'Third'),
    } });
    const src: AuthoringProject = { root: '/p', config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') }, layouts: {}, routes: { '/': { ...home, ...F('routes/page.tsx') } },
      features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } } };
    return compile(src, 'dev').project!;
  }
  const fresh = (id = 'f.a.one') => { const c = new DemoController(null); c.reducedMotion = true; c.setProject(chain(), 1, null); c.setScenario(id, 0, { quiet: true }); return c; };
  it('没有任何设置：播完接着播下一个场景，不出倒计时；跳过 autoplay:false 的支线；整条链播完才停', async () => {
    const c = fresh();
    const seen = new Set<string>();
    let upNext = false;
    c.subscribe(() => { const s = c.getSnapshot(); if (s.scenarioId) seen.add(s.scenarioId); if (s.upNext) upNext = true; });
    void c.play();
    await until(() => c.getSnapshot().scenarioId === 'f.a.three' && !c.getSnapshot().playing, 8000);
    expect([...seen]).toEqual(['f.a.one', 'f.a.two', 'f.a.three']);
    expect(upNext).toBe(false);
    expect(c.getSnapshot().state?.completed || c.getSnapshot().state?.position === 1).toBe(true);
  });
  it('支线播完就停；暂停中、手动一步步走到结尾都不接', async () => {
    const side = fresh('f.a.side');
    void side.play();
    await until(() => !side.getSnapshot().playing && side.getSnapshot().state?.position === 1);
    await sleep(80);
    expect(side.getSnapshot().scenarioId).toBe('f.a.side');
    const manual = fresh();
    await manual.next();
    await until(() => manual.getSnapshot().state?.position === 1);
    await sleep(80);
    expect(manual.getSnapshot().scenarioId).toBe('f.a.one');
    const paused = fresh();
    void paused.play();
    await until(() => paused.getSnapshot().state?.position === 1);
    paused.pause();
    await sleep(800);
    expect(paused.getSnapshot().scenarioId).toBe('f.a.one');
    paused.stop();
  });
});
