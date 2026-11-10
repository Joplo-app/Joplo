import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 步骤时间计划与场景时间线缓存。
 * 不变量：
 * - 一步的时长只有一个出处（stepPlan）：totalMs = leadMs + max(dwellMs, voiceMs)，leadMs = cursorMs + rippleMs + gestureMs；
 *   场景估算、配乐锚点都是它的和，不另算一套。
 * - stateAt / cameraAt / changedAt 读同一条缓存的时间线，结果与从头重放（replayTo / cameraOf）逐位置相同，
 *   返回值是独立副本；回放失败的位置每次抛出同样的错误，失败之前的位置照常可取。
 */
import { describe, expect, it } from 'vitest';
import { $, feature, flow, chapter, say, stream, hold, narrate, work, page, set, shot } from '@joplo-app/kit';
import * as ui from '@joplo-app/plugin-ui';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject } from '../src/compile.ts';
import { cameraAt, cameraOf, changedAt, replayTo, stateAt } from '../src/player.ts';
import { ACTION_TIMING as T, commitGapMs, scenarioPlanMs, stepPlan } from '../src/step-plan.ts';
import { scenarioEstimateMs } from '../src/outline.ts';
import { streamPlan } from '../src/presentation.ts';
import { streamMs, voiceMs } from '../src/pace.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
function build(steps: (f: ReturnType<typeof flow>) => ReturnType<typeof flow>) {
  const home = page({ title: 'Home', layout: false }, h(ui.Stack, null, h(ui.Button, { id: 'go' }, 'Go'), h(ui.TextInput, { id: 'email', label: 'Email' }), h(ui.Checkbox, { id: 'agree', label: 'Agree' })));
  const src: AuthoringProject = {
    root: '/p', config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') }, layouts: {}, routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, works: { a: { ...work({ title: 'A', summary: 'i', state: { ui: { n: 0 } }, scenarios: { s: steps(flow('S', { start: '/' })) } }), ...F('features/f/works/a.tsx') } } } },
  };
  const r = compile(src, 'dev');
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.project!;
}

describe('stepPlan', () => {
  const p = build((f) => f
    .click('go', 'Click it', set($.ui.n, 1))
    .type('email', 'a@b.co', 'Type the address')
    .toggle('agree', true, 'Agree')
    .system('Sent', 'Server replies', hold(5))
    .card('Done', { sub: 'All set' })
    .system('Said', 'x', narrate('这是一段足够长的旁白，读完它要比画面停留更久，所以这一步按朗读的时长算。再补一句让它超过三秒。')));
  const steps = p.scenarios['f.a.s']!.steps;

  it('各类操作的演示分段：点击 = 鼠标 + 波纹；输入按字数；开关、系统事件、过渡卡各有自己的停顿', () => {
    const [click, type, toggle, system, card] = steps.map((s) => stepPlan(p, s));
    expect(click).toMatchObject({ cursorMs: T.cursorMove, rippleMs: T.ripple, gestureMs: 0, settleMs: T.afterStep });
    expect(type!.gestureMs).toBe('a@b.co'.length * T.typeChar);
    expect(toggle!.gestureMs).toBe(T.toggleHold);
    expect(system).toMatchObject({ cursorMs: 0, rippleMs: 0, gestureMs: T.systemHold, dwellMs: 5000 });
    expect(card).toMatchObject({ leadMs: 0 });
    for (const plan of steps.map((s) => stepPlan(p, s))) {
      expect(plan.leadMs).toBe(plan.cursorMs + plan.rippleMs + plan.gestureMs);
      expect(plan.totalMs).toBe(plan.leadMs + Math.max(plan.dwellMs, plan.voiceMs));
      expect(plan.dwellMs).toBeGreaterThanOrEqual(plan.settleMs);
    }
  });

  it('朗读比画面停留长时，这一步按朗读估算', () => {
    const said = stepPlan(p, steps[5]!);
    expect(said.voiceMs).toBe(voiceMs(steps[5]!.narrate));
    expect(said.voiceMs).toBeGreaterThan(said.dwellMs);
    expect(said.totalMs).toBe(said.leadMs + said.voiceMs);
  });

  it('不移动鼠标（观众自己点出来之后接的系统事件）、减少动态效果：演示分段相应变短，hold 保留', () => {
    expect(stepPlan(p, steps[0]!, { cursor: false })).toMatchObject({ cursorMs: 0, rippleMs: T.ripple, settleMs: 0 });
    const reduced = stepPlan(p, steps[0]!, { reduced: true });
    expect(reduced).toMatchObject({ cursorMs: 0, rippleMs: 0, gestureMs: T.reducedStep, settleMs: 0, dwellMs: T.reducedStep });
    expect(stepPlan(p, steps[3]!, { reduced: true }).dwellMs).toBe(5000);
  });

  it('场景估算与配乐锚点都是同一份计划的和', () => {
    const total = steps.reduce((sum, s) => sum + stepPlan(p, s).totalMs, 0);
    expect(scenarioPlanMs(p, steps)).toBe(total);
    expect(scenarioEstimateMs(p, p.scenarios['f.a.s']!)).toBe(total);
    // 从场景开始到播完，逐段的提交间隔加起来 = 整个场景的时长
    let gaps = 0;
    for (let i = -1; i < steps.length; i++) gaps += commitGapMs(p, steps, i);
    expect(gaps).toBe(total);
  });
});

describe('场景时间线缓存', () => {
  const p = build((f) => f.click('go', 'One', set($.ui.n, 1)).system('Two', 'x', set($.ui.n, 2), shot('go')).system('Three', 'x', set($.ui.n, 3)));
  const n = p.scenarios['f.a.s']!.steps.length;

  it('每个位置与从头重放相同；乱序取、重复取都一样；返回独立副本', () => {
    for (const k of [n, 0, 2, 1, n, 2]) {
      expect(stateAt(p, 'f.a.s', k)).toEqual(replayTo(p, 'f.a.s', k));
      expect(cameraAt(p, 'f.a.s', k)).toEqual(cameraOf(p, 'f.a.s', k));
    }
    const a = stateAt(p, 'f.a.s', 1);
    a.ui.n = 99;
    cameraAt(p, 'f.a.s', 2).perLayer.poisoned = ['x'];
    expect(stateAt(p, 'f.a.s', 1).ui.n).toBe(1);
    expect(stateAt(p, 'f.a.s', 2).ui.n).toBe(2);
    expect(cameraAt(p, 'f.a.s', 2).perLayer.poisoned).toBeUndefined();
  });

  it('changedAt 读同一条时间线', () => {
    expect(changedAt(p, 'f.a.s', 2)).toEqual([{ path: 'ui.n', before: 1, after: 2 }]);
    expect(changedAt(p, 'f.a.s', 0)).toEqual([]);
  });

  it('越界位置报 NOT_FOUND；某一步回放失败时，之前的位置照常可取，之后的位置每次抛出同样的错误', () => {
    expect(() => stateAt(p, 'f.a.s', n + 1)).toThrow(/outside scenario/);
    const broken = structuredClone(p);
    const step = broken.scenarios['f.a.s']!.steps[1]!;
    step.kind = 'user';
    step.action = { type: 'click', target: 'missing' };
    expect(stateAt(broken, 'f.a.s', 1).ui.n).toBe(1);
    let first: unknown, second: unknown;
    try { stateAt(broken, 'f.a.s', 2); } catch (e) { first = e; }
    try { stateAt(broken, 'f.a.s', 3); } catch (e) { second = e; }
    expect(first).toBeInstanceOf(Error);
    expect(second).toBe(first);
    expect(() => replayTo(broken, 'f.a.s', 2)).toThrow((first as Error).message);
    expect(stateAt(broken, 'f.a.s', 1).ui.n).toBe(1);
  });

  it('换了场景的步骤数组或初始状态（另一个对象）时缓存作废', () => {
    const q = structuredClone(p);
    expect(stateAt(q, 'f.a.s', n).ui.n).toBe(3);
    const sc = q.scenarios['f.a.s']!;
    sc.steps = sc.steps.slice(0, 2);
    expect(stateAt(q, 'f.a.s', 2).ui.n).toBe(2);
    expect(() => stateAt(q, 'f.a.s', 3)).toThrow(/outside scenario/);
    sc.initial = { ...sc.initial, ui: { n: 7 } };
    expect(stateAt(q, 'f.a.s', 0).ui.n).toBe(7);
  });
});


describe('作品系统前摇与显式静音', () => {
  const source = (lead?: number) => ({
    root: '/p', config: { ...config({ name: 'Timing' }), ...F('joplo.config.ts') }, layouts: {}, routes: {}, features: {},
    works: { short: { ...work({ title: 'Short', summary: 'Timing', ...(lead === undefined ? {} : { pace: { systemLead: lead } }), stage: h(ui.Text, null, 'Stage'), scenarios: {
      first: chapter('First').system('One', narrate('A spoken sentence.'), hold(2)),
      next: chapter('Next', { from: 'first' }).system('Silent', narrate(false), say('This must not speak'), stream($.ui.text, 'Words', { pace: 'voice' }), hold(2)),
    } }), ...F('works/short.tsx') } },
  } satisfies AuthoringProject);
  it.each([0, 0.125, 30, undefined])('systemLead %s seconds survives chapters and publication', lead => {
    for (const mode of ['dev', 'publish'] as const) {
      const r = compile(source(lead), mode);
      expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      const p = r.project!;
      for (const sc of Object.values(p.scenarios)) expect(stepPlan(p, sc.steps[0]!).leadMs).toBe(lead === undefined ? 900 : lead * 1000);
      const silent = p.scenarios['short.next']!.steps[0]!;
      expect(silent.mute).toBe(true);
      expect(stepPlan(p, silent).voiceMs).toBe(0);
      expect(streamPlan(silent, null)[0]!.ms).toBe(streamMs('Words'));
      if (lead !== undefined) expect(stepPlan(p, silent, { reduced: true }).leadMs).toBe(lead * 1000);
    }
  });
  it.each([-1, 30.001, NaN, Infinity, '0'])('rejects invalid lead %s', lead => {
    const r = compile(source(lead as number), 'dev');
    expect(r.diagnostics.some(d => d.code === 'PACE_INVALID' && d.severity === 'error')).toBe(true);
  });
});
