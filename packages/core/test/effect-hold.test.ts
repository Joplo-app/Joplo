import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 插件效果声明时长（D98）：效果编译结果可带 holdMs，这一步至少停留这么久（引擎时间）。
 * 端到端：effect 钩子 holdMs → 编译器校验 → Step.effectHold（同一步取最大）→ holdMsOf（自动播放、封面、outline 共用）
 * 与 stepAnchorMs（配乐等媒体锚点）。作者的 hold 仍是唯一“由作者掌握节奏、不套 3 秒下限”的信号。
 */
import { describe, expect, it } from 'vitest';
import { feature, flow, hold, option, page } from '@joplo-app/kit';
import { definePlugin, pluginComponent, pluginEffect } from '@joplo-app/kit/plugin';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject } from '../src/compile.ts';
import { holdMsOf, stepAnchorMs } from '../src/focus.ts';
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
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), file }, options: { a: { ...option({ name: 'A', idea: 'i', on: {}, scenarios: { s: steps(flow('S', { start: '/' })) } }), file } } } } };
}

describe('插件效果时长 holdMs（D98）', () => {
  it('同一步取最大值写进 Step.effectHold；没有 holdMs 的步骤没有这个字段', () => {
    const r = compile(source((f) => f.system('Clip', 'Play a clip', play(4000), play(9000)).system('Plain', 'Nothing timed')), 'dev');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const [a, b] = r.project!.scenarios['f.a.s']!.steps;
    expect(a!.effectHold).toBe(9000);
    expect(b!.effectHold).toBeUndefined();
  });

  it('holdMsOf = max(作者 hold, effectHold)，按速度缩放；作者 hold 的“不套下限”语义不受影响', () => {
    const r = compile(source((f) => f.system('Clip', 'Play a clip', play(9000), hold(2)).system('Long hold', 'x', play(1000), hold(12))), 'dev');
    const [a, b] = r.project!.scenarios['f.a.s']!.steps;
    expect(holdMsOf(a)).toBe(9000);
    expect(holdMsOf(a, 2)).toBe(4500);
    expect(holdMsOf(b)).toBe(12000);
    expect(a!.hold).toBe(2000);
  });

  it('媒体锚点：max(hold ?? 3000, effectHold)', () => {
    expect(stepAnchorMs({})).toBe(3000);
    expect(stepAnchorMs({ hold: 2000 })).toBe(2000);
    expect(stepAnchorMs({ effectHold: 9000 })).toBe(9000);
    expect(stepAnchorMs({ hold: 2000, effectHold: 9000 })).toBe(9000);
  });

  it('outline 的时长估算包含效果时长', () => {
    const plain = compile(source((f) => f.system('Clip', 'Play a clip')), 'dev').project!;
    const clip = compile(source((f) => f.system('Clip', 'Play a clip', play(20000))), 'dev').project!;
    const ms = (p: typeof plain) => outline(p).features[0]!.options[0]!.scenarios[0]!.ms;
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
      features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), file }, options: { a: { ...option({ name: 'A', idea: 'i', on: {}, scenarios: { s: flow('S', { start: '/' }).system('A', 'a', poke()).system('B', 'b', poke()).system('C', 'c', poke()) } }), file } } } } };
    const p = compile(src, 'dev').project!;
    const tl = focusTimeline(p, 'f.a.s');
    for (const i of [1, 2, 3]) {
      expect(tl[i]).toMatchObject({ subject: 'elements', source: 'auto', targets: ['box'] });
      expect(tl[i]!.reveal).toEqual([]);
    }
  });
});
