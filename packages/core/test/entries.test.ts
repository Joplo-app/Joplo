import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 作品投影（D102）。不变量：任何形态的作品都投影成同一个 Entry；首页卡片与封面只读它。
 * - 形态只由 Feature.standalone 决定（缺省 demo）；
 * - 播放用的方案：选定的方案，没有选定时取第一个；
 * - 切片先是连续播放顺序里的（from 链优先、autoplay:false 不进），再是支线；总时长只算顺序里的，等于各切片 stepPlan 之和。
 */
import { describe, expect, it } from 'vitest';
import { feature, flow, option, page } from '@joplo-app/kit';
import * as ui from '@joplo-app/plugin-ui';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject } from '../src/compile.ts';
import { scenarioPlanMs } from '../src/step-plan.ts';
import { playSequence, entryOf, entriesOf } from '../src/entries.ts';

const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
function build(pick: string | null = 'a') {
  const home = page({ title: 'Home', layout: false }, jsx(ui.Button, { id: 'go', children: 'Go' }));
  const scenarios = () => ({
    one: flow('One', { start: '/' }).click('go', 'First'),
    side: flow('Side', { start: '/', autoplay: false }).click('go', 'Aside'),
    two: flow('Two', { from: 'one', description: 'continues' }).system('Next', 'x'),
  });
  const src: AuthoringProject = {
    root: '/p', config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') }, layouts: {}, routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'Invite', goal: 'Invite teammates', roles: ['Admin', 'Member'], cases: {}, pick }), ...F('features/f/feature.ts') }, options: {
      a: { ...option({ name: 'A', idea: 'i', scenarios: scenarios() }), ...F('features/f/options/a.tsx') },
      b: { ...option({ name: 'B', idea: 'i', scenarios: { only: flow('Only', { start: '/' }).click('go', 'x') } }), ...F('features/f/options/b.tsx') },
    } } },
  };
  const r = compile(src, 'dev');
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.project!;
}

describe('works', () => {
  it('projects a demo: picked option, slices in play order with side branches last, duration from the step plan', () => {
    const p = build();
    const w = entryOf(p, 'f')!;
    expect(w).toMatchObject({ id: 'f', featureId: 'f', sequencing: 'independent', title: 'Invite', summary: 'Invite teammates', audience: null, roles: ['Admin', 'Member'], draft: false, workId: 'f.a' });
    expect(w.slices.map((s) => [s.key, s.inSequence])).toEqual([['one', true], ['two', true], ['side', false]]);
    expect(w.slices[1]).toMatchObject({ id: 'f.a.two', title: 'Two', description: 'continues', steps: 1 });
    expect(playSequence(p, 'f.a').map((s) => s.id)).toEqual(['f.a.one', 'f.a.two']);
    const inSequence = ['f.a.one', 'f.a.two'].reduce((sum, id) => sum + scenarioPlanMs(p, p.scenarios[id]!.steps), 0);
    expect(w.ms).toBe(inSequence);
    expect(w.slices.find((s) => s.key === 'side')!.ms).toBe(scenarioPlanMs(p, p.scenarios['f.a.side']!.steps));
    expect(entriesOf(p).map((x) => x.id)).toEqual(['f']);
    expect(entryOf(p, 'nope')).toBeNull();
  });

  it('falls back to the first option when nothing is picked', () => {
    expect(entryOf(build(null), 'f')!.workId).toBe('f.a');
    expect(entryOf(build('b'), 'f')!.slices.map((s) => s.key)).toEqual(['only']);
  });

  it('projects standalone, audience and draft independently of sequencing', () => {
    const p = structuredClone(build());
    expect(entryOf(p, 'f')!.featureId).toBe('f');
    Object.assign(p.features.f!, { standalone: true, audience: 'Curious readers', draft: true });
    expect(entryOf(p, 'f')).toMatchObject({ featureId: null, audience: 'Curious readers', draft: true });
  });
});
