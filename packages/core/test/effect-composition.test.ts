import { describe, expect, it } from 'vitest';
import { $, config, done, feature, flow, free, hold, option, page, patch, set } from '@joplo-app/kit';
import ui, { Button } from '@joplo-app/plugin-ui';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, replay } from '../src/index.ts';
import type { AuthoringProject } from '../src/compile.ts';

const enter = () => [patch($.ui, { era: 'next', sent: false }), [hold(4)]];
function source(first: ReturnType<typeof flow>): AuthoringProject {
  return {
    root: '/p', config: { ...config({ name: 'Composition', plugins: [ui] }), file: '/p/joplo.config.ts' }, layouts: {},
    routes: { '/': { ...page({ title: 'Home', layout: false }, jsx(Button, { id: 'send', children: 'Send' })), file: '/p/routes/page.tsx' } },
    features: { story: { def: { ...feature({ name: 'Story', goal: 'Continue', cases: {}, pick: 'a' }), file: '/p/features/story/feature.ts' }, options: {
      a: { ...option({ name: 'A', idea: 'Composable effects', state: { ui: { era: 'old', sent: false } }, scenarios: {
        first, next: flow('Next', { from: 'first' }).click('send', done('Next done')),
      } }), file: '/p/features/story/options/a.tsx' },
    } } },
  };
}

describe('effect helper composition', () => {
  it('recursively composes patch and timing helpers without completing a chapter early', () => {
    const first = flow('First').click('send', enter(), 'Arrive')
      .system('Delivered', set($.ui.sent, true), done('Complete'));
    const result = compile(source(first), 'dev');
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const project = result.project!;
    expect(project.scenarios['story.a.first']!.steps[0]!.hold).toBe(4000);
    expect(replay(project, 'story.a.first').reached).toBe(2);
    expect(project.scenarios['story.a.next']!.initial.ui).toEqual({ era: 'next', sent: true });
  });

  it('applies the same nesting rule to cards and local reactions, preserving effect order', () => {
    const writes = [patch($.ui, { era: 'next', sent: false }), [set($.ui.sent, true)]];
    expect(flow('Card').card('Arrive', { sub: 'Keep context' }, writes).steps[0]).toMatchObject({
      action: { title: 'Arrive', sub: 'Keep context' }, effects: [...patch($.ui, { era: 'next', sent: false }), set($.ui.sent, true)],
    });
    expect(free.click('send', writes).effects).toEqual([...patch($.ui, { era: 'next', sent: false }), set($.ui.sent, true)]);
  });

  it('reports malformed effects instead of silently treating them as completion', () => {
    const first = flow('First').click('send', { kind: 'effect', type: 'typo' } as never).click('send');
    const result = compile(source(first), 'dev');
    expect(result.diagnostics.some(d => d.code === 'EFFECT_INVALID')).toBe(true);
    expect(result.diagnostics.some(d => d.code === 'FROM_FAILED')).toBe(false);
  });
});
