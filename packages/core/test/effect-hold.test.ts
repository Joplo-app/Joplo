import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 插件效果声明时长（D98）：效果编译结果可带 holdMs，这一步至少停留这么久（引擎时间）。
 * 端到端：effect 钩子 holdMs → 编译器校验 → Step.effectHold（同一步取最大）→ stepPlan 的 dwellMs（自动播放、封面、outline 共用）
 * 与 commitGapMs（配乐等媒体锚点）。作者的 hold 仍是唯一“由作者掌握节奏、不套 3 秒下限”的信号。
 */
import { describe, expect, it } from 'vitest';
import { feature, flow, hold, work, page } from '@joplo-app/kit';
import { definePlugin, pluginComponent, pluginEffect } from '@joplo-app/kit/plugin';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject } from '../src/compile.ts';
import { ACTION_TIMING, commitGapMs, stepPlan } from '../src/step-plan.ts';
import { outline } from '../src/outline.ts';
import { focusTimeline } from '../src/focus.ts';

const h = (type: unknown, props: Record<string, unknown> = {}) => jsx(type, props);
const timed = definePlugin({ id: 'timed', title: 'Timed', runtime: '/timed.js', components: { Box: { doc: 'box', selfEvident: true } }, compile: {
  effect(e) {
    const ms = (e.payload as { ms: unknown }).ms;
    return { holdMs: ms } as never;
  },
} });
const play = (ms: unknown) => pluginEffect('timed', 'play', { ms });

function source(steps: (f: ReturnType<typeof flow>) => ReturnType<typeof flow>): AuthoringProject {
  const file = '/p/test.tsx';
  return { root: '/p', config: { ...config({ name: 'Test', plugins: [timed] }), file }, layouts: {}, routes: { '/': { ...page({ title: 'Home' }, h(pluginComponent(timed, 'Box'), { id: 'box' })), file } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), file }, works: { a: { ...work({ title: 'A', summary: 'i', on: {}, scenarios: { s: steps(flow('S', { start: '/' })) } }), file } } } } };
}

describe('插件效果时长 holdMs（D98）', () => {
  it('同一步取最大值写进 Step.effectHold；没有 holdMs 的步骤没有这个字段', () => {
    const r = compile(source((f) => f.system('Clip', 'Play a clip', play(4000), play(9000)).system('Plain', 'Nothing timed')), 'dev');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const [a, b] = r.project!.scenarios['f.a.s']!.steps;
    expect(a!.effectHold).toBe(9000);
    expect(b!.effectHold).toBeUndefined();
  });

  it('时间计划的停留 = max(作者 hold, effectHold, 阅读)；作者 hold 的“不套下限”语义不受影响', () => {
    const r = compile(source((f) => f.system('Clip', 'Play a clip', play(9000), hold(2)).system('Long hold', 'x', play(1000), hold(12)).system('Short', 'x', hold(1))), 'dev');
    const p = r.project!;
    const [a, b, c] = p.scenarios['f.a.s']!.steps;
    expect(stepPlan(p, a!).dwellMs).toBe(9000);
    expect(stepPlan(p, b!).dwellMs).toBe(12000);
    // 写了 hold：不套 3 秒阅读下限
    expect(stepPlan(p, c!).dwellMs).toBe(1000);
    expect(a!.hold).toBe(2000);
    // 减少动态效果时 hold 与效果时长同样保留（它是看的时间，不是动画）
    expect(stepPlan(p, a!, { reduced: true }).dwellMs).toBe(9000);
  });

  it('媒体锚点 = 两次提交之间的计划时长：上一步的停留（与朗读估算取较长者）+ 下一步的操作演示', () => {
    const p = compile(source((f) => f.system('Clip', 'Play a clip', play(9000)).system('Plain', 'x', hold(2))), 'dev').project!;
    const steps = p.scenarios['f.a.s']!.steps;
    // 场景开始 → 第 1 步提交：只有第 1 步的系统事件停顿
    expect(commitGapMs(p, steps, -1)).toBe(ACTION_TIMING.systemHold);
    expect(commitGapMs(p, steps, 0)).toBe(9000 + ACTION_TIMING.systemHold);
    // 最后一步之后 = 到场景播完
    expect(commitGapMs(p, steps, 1)).toBe(2000);
    expect(commitGapMs(p, [], -1)).toBe(0);
  });

  it('outline 的时长估算包含效果时长', () => {
    const plain = compile(source((f) => f.system('Clip', 'Play a clip')), 'dev').project!;
    const clip = compile(source((f) => f.system('Clip', 'Play a clip', play(20000))), 'dev').project!;
    const ms = (p: typeof plain) => outline(p).entries[0]!.works[0]!.scenarios[0]!.ms;
    expect(ms(clip)).toBeGreaterThanOrEqual(20000);
    expect(ms(clip)).toBeGreaterThan(ms(plain));
  });

  it('非法 holdMs（负数、非数字、超过 60s）报插件输出无效，不写进步骤', () => {
    for (const bad of [-1, 'x', 60_001, Number.NaN]) {
      const r = compile(source((f) => f.system('Clip', 'Play', play(bad))), 'dev');
      expect(r.diagnostics.some((d) => d.severity === 'error'), String(bad)).toBe(true);
      expect(r.project?.scenarios['f.a.s']?.steps[0]?.effectHold).toBeUndefined();
    }
  });
});

describe('插件效果引用的元素是这一步的焦点对象（D98，代码插件示例反推）', () => {
  const touch = definePlugin({ id: 'touch', title: 'Touch', runtime: '/touch.js', components: { Box: { doc: 'box', selfEvident: true } }, compile: {
    effect() { return { references: ['box'] }; },
  } });
  const poke = () => pluginEffect('touch', 'poke', {});
  it('只改插件画面的系统步骤不再算“画面没变”，也不加默认脉冲', () => {
    const file = '/p/test.tsx';
    const src: AuthoringProject = { root: '/p', config: { ...config({ name: 'Test', plugins: [touch] }), file }, layouts: {}, routes: { '/': { ...page({ title: 'Home' }, h(pluginComponent(touch, 'Box'), { id: 'box' })), file } },
      features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), file }, works: { a: { ...work({ title: 'A', summary: 'i', on: {}, scenarios: { s: flow('S', { start: '/' }).system('A', 'a', poke()).system('B', 'b', poke()).system('C', 'c', poke()) } }), file } } } } };
    const p = compile(src, 'dev').project!;
    const tl = focusTimeline(p, 'f.a.s');
    for (const i of [1, 2, 3]) {
      expect(tl[i]).toMatchObject({ subject: 'elements', source: 'auto', targets: ['box'] });
      expect(tl[i]!.reveal).toEqual([]);
    }
  });
});
