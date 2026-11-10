import { expect, it } from 'vitest';
import diagram from '../src/plugin.ts';
import { diagramFit } from '../src/render-layout.ts';
it('enlarges the complete diagram only as far as the frame allows', () => {
  expect(diagramFit({ width: 500, height: 200 }, 1920, 1080, 2).scale).toBe(2);
  expect(diagramFit({ width: 500, height: 200 }, 508, 208, 2).scale).toBe(1);
  expect(diagramFit({ width: 500, height: 200 }, 1920, 1080).scale).toBe(1);
});
it.each([0, -1, NaN, Infinity, '2'])('diagnoses invalid scale %s', scale => {
  const errors: string[] = [];
  diagram.compile!.node!({ type: 'diagram:Diagram', props: { id: 'graph', scale }, children: [] } as never, { ids: new Set(), report: (code: string) => errors.push(code) } as never);
  expect(errors).toContain('DIAGRAM_SCALE_INVALID');
});
