import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { compile } from '@joplo-app/core';
import { Text } from '@joplo-app/plugin-ui';
import { work, chapter } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { fixtureConfig } from '../../../scripts/test/fixtures.ts';
import { resolveSelection, writeSelection, readSelection } from '../src/selection.ts';

it('独立作品的选中、磁盘记录均保持 featureId=null 与真实 workId', () => {
  const result = compile({ root: '/p', config: { ...fixtureConfig({ name: 'Selection' }), file: 'joplo.config.ts' }, layouts: {}, routes: {}, features: {},
    works: { intro: { ...work({ title: 'Intro', summary: 'Summary', stage: jsx(Text, { id: 'target', children: 'Welcome' }), scenarios: { start: chapter('Start').system('Begin') } }), file: 'works/intro.tsx' } },
  }, 'dev');
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const project = result.project!;
  const selection = resolveSelection(project, { workId: 'intro', scenarioId: 'intro.start', position: 0, sceneId: project.works.intro!.layers.stage!.sceneId, nodeId: 'target' });
  expect(selection.ok, JSON.stringify(selection)).toBe(true);
  if (!selection.ok) throw new Error(selection.problem);
  expect(selection.selection).toMatchObject({ featureId: null, workId: 'intro', scenarioId: 'intro.start', nodeId: 'target' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-selection-work-'));
  try { writeSelection(dir, selection.selection); expect(readSelection(dir)).toEqual(selection.selection); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
