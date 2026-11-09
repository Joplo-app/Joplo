import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 手动单步（下一步）也要把这一步的画面过渡走完（D97 补充）：
 * 引擎时钟只在执行这一步时走；镜头补间（content camera 默认 1.2s）比操作动画长，时钟一停就卡在半路。
 * 不变量：手动单步结束时，引擎时间至少走过 VISUAL_SETTLE_MS，之后时钟停下、不再 busy；reduced motion 不额外等待。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui';
import { feature, flow, option, page } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject, type Project } from '@joplo-app/core';
import { DemoController, VISUAL_SETTLE_MS } from '../src/runtime/demo';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

function build(): Project {
  const home = page({ title: 'Home', layout: false }, h(ui.Group, null, h(ui.Button, { id: 'go' }, 'Go')));
  const opt = option({ name: 'A', idea: 'i', scenarios: { s: flow('S', { start: '/' }).click('go', 'First').click('go', 'Second') } });
  const src: AuthoringProject = { root: '/p', config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') }, layouts: {}, routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } } };
  return compile(src, 'dev').project!;
}

function setup(reducedMotion: boolean) {
  const c = new DemoController(null);
  c.reducedMotion = reducedMotion;
  c.setProject(build(), 1, null);
  c.setScenario('f.a.s', 0, { quiet: true });
  return c;
}

describe('手动单步：画面过渡走完再停（D97）', () => {
  it('next() 结束时引擎时间至少走过 VISUAL_SETTLE_MS，然后时钟停下', async () => {
    const c = setup(false);
    const t0 = c.clock.getSnapshot().timeMs;
    await c.next();
    expect(c.getSnapshot().state?.position).toBe(1);
    expect(c.clock.getSnapshot().timeMs - t0).toBeGreaterThanOrEqual(VISUAL_SETTLE_MS);
    expect(c.getSnapshot().busy).toBe(false);
    expect(c.clock.getSnapshot().running).toBe(false);
  }, 15_000);

  it('收尾期间再按下一步：立刻执行下一步（不用等收尾结束）', async () => {
    const c = setup(false);
    void c.next();
    await new Promise((r) => setTimeout(r, 50));
    while (c.getSnapshot().state?.position !== 1) await new Promise((r) => setTimeout(r, 10));
    const started = performance.now();
    await c.next();
    expect(c.getSnapshot().state?.position).toBe(2);
    expect(performance.now() - started).toBeLessThan(VISUAL_SETTLE_MS + 3000);
  }, 15_000);

  it('reduced motion：没有过渡，不额外等待', async () => {
    const c = setup(true);
    const t0 = c.clock.getSnapshot().timeMs;
    await c.next();
    expect(c.getSnapshot().state?.position).toBe(1);
    expect(c.clock.getSnapshot().timeMs - t0).toBeLessThan(VISUAL_SETTLE_MS);
  }, 15_000);
});
