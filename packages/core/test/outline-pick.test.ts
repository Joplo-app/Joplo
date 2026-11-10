import { expect, it } from 'vitest';
import { feature, flow, work } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { Text } from '@joplo-app/plugin-ui';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { compile, entryOf, outline, type AuthoringProject } from '../src/index.ts';

const definition = () => work({ title: 'Work', summary: 'Summary', stage: jsx(Text, { children: 'Screen' }), scenarios: { opening: flow('Opening').system('Start') } });

it.each(['null', 'omitted', 'picked', 'independent'] as const)('outline JSON preserves the decision separately from the preview: %s', kind => {
  const source: AuthoringProject = {
    root: '/p', config: { ...config({ name: 'Outline pick' }), file: 'joplo.config.ts' }, layouts: {}, routes: {}, features: {},
  };
  if (kind === 'independent') source.works = { story: { ...definition(), file: 'works/story.tsx' } };
  else source.features.choice = {
    def: { ...feature({ name: 'Choice', goal: 'Goal', cases: {}, ...(kind === 'omitted' ? {} : { pick: kind === 'null' ? null : 'b' }) }), file: 'features/choice/feature.ts' },
    works: { a: { ...definition(), file: 'features/choice/works/a.tsx' }, b: { ...definition(), file: 'features/choice/works/b.tsx' } },
  };
  const result = compile(source, 'dev');
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const project = result.project!;
  const id = kind === 'independent' ? 'story' : 'choice';
  const expectedPick = kind === 'independent' ? 'story' : kind === 'picked' ? 'choice.b' : null;
  const expectedPreview = expectedPick ?? 'choice.a';
  expect(entryOf(project, id)!.workId).toBe(expectedPreview);
  const output = JSON.parse(JSON.stringify(outline(project))).entries[0];
  expect(output).toHaveProperty('pick', expectedPick);
  expect(output.works.filter((w: { picked: boolean }) => w.picked).map((w: { id: string }) => w.id)).toEqual(expectedPick ? [expectedPick] : []);
  if (kind !== 'independent') {
    expect(output.pick).toBe(project.features.choice!.pick);
    // A --work preview filter also cannot turn that work into a design decision.
    expect(outline(project, { workId: 'choice.a' }).entries[0]!.pick).toBe(expectedPick);
  }
});
