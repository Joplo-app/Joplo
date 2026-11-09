import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { compile, replay, type Project } from '../src/index.ts';

import { loadAuthoring } from '../src/load.ts';

const dir = resolve(import.meta.dirname, '../../../examples/joplo');
const original = JSON.parse(await readFile(new URL('./fixtures/self-design-original-ids.json', import.meta.url), 'utf8')) as { featureIds: string[]; options: string[]; scenarios: string[] };
const order = ['workbench_origin', 'authoring_model', 'home', 'player', 'views', 'frames', 'npm', 'skill', 'voice', 'review', 'share_scope', 'feature_diff', 'mobile_watch', 'content_i18n', 'storage_quota', 'cloud_usage', 'share_visibility', 'model_assets', 'music'];
let dev: Project, published: Project;
beforeAll(async () => {
  const source = await loadAuthoring(dir, file => tsImport(file, { parentURL: import.meta.url, tsconfig: join(dir, 'tsconfig.json') }));
  expect(source.diagnostics).toEqual([]);
  for (const mode of ['dev', 'publish'] as const) {
    const result = compile(source.authoring!, mode);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    if (mode === 'dev') dev = result.project!;
    else published = result.project!;
  }
}, 60_000);

describe('one real Joplo design workspace', () => {
  it('preserves every original feature, alternative and scenario ID through migration', () => {
    for (const id of original.featureIds) expect(dev.features[id], id).toBeDefined();
    for (const id of original.options) expect(dev.options[id], id).toBeDefined();
    for (const id of original.scenarios) expect(dev.scenarios[id], id).toBeDefined();
    // film_form 保留稳定 ID；D102 修订已选定左栏章节清单，进入公开设计记录。
    expect(dev.featureIds).toEqual([...order, 'film_form']);
  });
  it('publishes every feature with a visible design journey while keeping unpicked alternatives private', () => {
    expect(published.featureIds).toEqual([...order, 'film_form']);
    expect(published.features.film_form!.pick).toBe('film_form.a-chapters');
    expect(published.options['film_form.b-timeline']).toBeUndefined();
    expect(Object.keys(published.options)).toHaveLength(order.length + 1);
    expect(published.options['workbench_origin.a-fold']).toBeUndefined();
    expect(published.options['authoring_model.a-data']).toBeUndefined();
    for (const feature of [...original.featureIds, 'mobile_watch', 'content_i18n', 'storage_quota', 'cloud_usage', 'share_visibility']) {
      const picked = Object.values(published.options).find(o => o.featureId === feature)!;
      const story = published.scenarios[`${picked.id}.design_journey`];
      expect(story, feature).toBeDefined();
      expect(story!.steps[0]!.action.type).toBe('card');
      expect(story!.steps.at(-1)!.key).toBe('design-current-boundary');
      expect(story!.steps.some(s => s.kind === 'user')).toBe(true);
      const result = replay(published, story!.id);
      expect(result.diagnostics, feature).toEqual([]);
      expect(result.reached).toBe(story!.steps.length);
    }
    for (const id of ['workbench_origin.b-mode.history', 'authoring_model.b-tsx.evolution', 'feature_diff.a-immutable.rationale'])
      expect(published.scenarios[id], id).toBeDefined();
  });
  it('replays every scenario to completion after route and layout namespacing', () => {
    for (const project of [dev, published]) for (const scenario of Object.values(project.scenarios)) {
      const result = replay(project, scenario.id);
      expect(result.diagnostics, `${project.mode}:${scenario.id}`).toEqual([]);
      expect(result.reached, scenario.id).toBe(scenario.steps.length);
    }
  });
});
