import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chapter, feature, layer, work, type WorkDef } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { Text } from '@joplo-app/plugin-ui';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { compile, resolveScope, reviewManifest, REVIEW_LIMITS, type AuthoringProject, type Project, type ReviewManifest } from '../src/index.ts';
import { loadAuthoring } from '../src/load.ts';

const picture = () => jsx(Text, { children: 'Screen' });
const authored = (extra: Partial<WorkDef> = {}) => work({ title: 'Title', summary: 'Summary', stage: picture(), scenarios: { opening: chapter('Opening').system('Start') }, ...extra });
const file = (id: string, extra: Partial<WorkDef> = {}) => ({ ...authored(extra), file: `works/${id}.tsx` });
const featureSource = (id: string, pick: string | null = 'a') => ({
  def: { ...feature({ name: id, goal: 'Goal', cases: {}, pick }), file: `features/${id}/feature.ts` },
  works: { a: file('a'), b: file('b') },
});
const source = (): AuthoringProject => ({
  root: '/p', config: { ...config({ name: 'Mixed' }), file: 'joplo.config.ts' }, layouts: {}, routes: {},
  features: { item10: featureSource('item10'), item2: featureSource('item2', null) },
  works: { item9: file('item9'), item4: file('item4', { scenarios: {} }), item3: file('item3'), item1: file('item1', { draft: true }), priority: file('priority', { order: -1 }) },
});
const built = (src: AuthoringProject, mode: 'dev' | 'publish' | 'review' = 'dev'): Project => {
  const result = compile(src, mode);
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  return result.project!;
};
const assertWorkReferences = (manifest: ReviewManifest) => {
  const metadata = [...manifest.works, ...manifest.features.flatMap(f => f.works)];
  expect(new Set(metadata.map(w => w.id)).size).toBe(metadata.length);
  for (const scenario of manifest.scenarios)
    expect(metadata.filter(w => w.id === scenario.workId), scenario.id).toHaveLength(1);
};

describe('ir-core review corrections', () => {
  it.each(['publish', 'review'] as const)('retains independent work metadata in entry order, excluding drafts and empty works (%s)', mode => {
    const src = source();
    src.works!.priority!.title = '题'.repeat(REVIEW_LIMITS.text.name + 2);
    src.works!.priority!.summary = '介'.repeat(REVIEW_LIMITS.text.summary + 2);
    const project = built(src);
    // Registry enumeration is deliberately different from the entry order.
    project.works = Object.fromEntries(Object.entries(project.works).reverse());
    const manifest = reviewManifest(project, mode);
    expect(manifest.works.map(w => w.id)).toEqual(['priority', 'item3', 'item9']);
    expect(manifest.works[0]).toEqual({ id: 'priority', key: 'priority', title: `${'题'.repeat(REVIEW_LIMITS.text.name - 1)}…`, summary: `${'介'.repeat(REVIEW_LIMITS.text.summary - 1)}…` });
    expect(manifest.works[1]).toEqual({ id: 'item3', key: 'item3', title: 'Title', summary: 'Summary' });
    expect(manifest.features.map(f => f.id)).toEqual(mode === 'publish' ? ['item10'] : ['item2', 'item10']);
    expect(manifest.features.find(f => f.id === 'item10')!.works.map(w => w.id)).toEqual(mode === 'publish' ? ['item10.a'] : ['item10.a', 'item10.b']);
    expect(manifest.scenarios.filter(s => s.featureId === null).map(s => s.workId)).toEqual(['priority', 'item3', 'item9']);
    for (const absent of ['item1', 'item4']) expect(manifest.scenarios.some(s => s.workId === absent)).toBe(false);
    assertWorkReferences(manifest);
  });

  it('applies metadata count limits before including their scenarios', () => {
    const src = source(); src.features = {}; src.works = {};
    for (let i = 0; i <= REVIEW_LIMITS.features; i++) {
      src.features[`feature${i}`] = featureSource(`feature${i}`);
      src.works[`work${i}`] = file(`work${i}`);
    }
    for (let i = 0; i <= REVIEW_LIMITS.works; i++) src.features.feature0!.works[`extra${i}`] = file(`extra${i}`);
    const project = built(src);
    for (const mode of ['publish', 'review'] as const) {
      const manifest = reviewManifest(project, mode);
      expect(manifest.works).toHaveLength(REVIEW_LIMITS.features);
      expect(manifest.features).toHaveLength(REVIEW_LIMITS.features);
      expect(manifest.features[0]!.works).toHaveLength(mode === 'publish' ? 1 : REVIEW_LIMITS.works);
      expect(manifest.works.map(w => w.id)).not.toContain('work100');
      expect(manifest.features.map(f => f.id)).not.toContain('feature100');
      assertWorkReferences(manifest);
    }
  });

  it.each([NaN, Infinity, -Infinity, '1', null])('preserves an owner ref for invalid order: %s', order => {
    for (const owner of ['feature', 'work'] as const) {
      const src = source();
      Object.assign(owner === 'feature' ? src.features.item10!.def : src.works!.priority!, { order });
      const result = compile(src, 'dev');
      expect(result.project).toBeNull();
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: owner === 'feature' ? 'FEATURE_ORDER_INVALID' : 'WORK_INVALID', ref: { kind: owner, id: owner === 'feature' ? 'item10' : 'priority' } }));
    }
  });

  it.each([
    [{ title: '' }, /requires a non-empty title/i],
    [{ summary: '' }, /requires a non-empty summary/i],
    [{ scenarios: null }, /scenarios must be an object/i],
    [{ stage: undefined }, /requires stage, layers, on or routes.*no pages/i],
    [{ layers: { world: layer('World', picture()) } }, /stage and layers cannot be combined/i],
    [{ stage: 'invalid' }, /stage must be.*element/i],
    [{ stage: undefined, layers: [] }, /layers must be an object/i],
  ] as const)('explains the specific invalid work field: %j', (extra, message) => {
    const src = source(); src.features = {}; src.works = { invalid: file('invalid', extra as never) };
    const result = compile(src, 'dev');
    expect(result.project).toBeNull();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'WORK_INVALID', message: expect.stringMatching(message) }));
  });

  it('keeps repair instructions and the original bare-project load error', async () => {
    const root = mkdtempSync(join(tmpdir(), 'joplo-module-error-'));
    try {
      writeFileSync(join(root, 'joplo.config.ts'), '');
      for (const reason of ['React is not defined', 'Cannot find package missing-dependency', 'Author failure']) {
        const result = await loadAuthoring(root, async () => { throw new Error(reason); });
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0]).toMatchObject({ code: 'PROJECT_MODULE_CONFIG', message: expect.stringMatching(/tsconfig.json.*jsxImportSource.*package.json/) });
        expect(result.diagnostics[0]!.message).toContain(`(underlying error: ${reason})`);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('uses entry scope for entry errors and scenario scope for slice errors', () => {
    const project = built(source());
    for (const [request, scope, id] of [
      [{ entryIds: ['missing'] }, 'entry', 'missing'],
      [{ entryIds: ['item2'] }, 'entry', 'item2'],
      [{ scenarios: ['missing'] }, 'scenario', 'missing'],
      [{ scenarios: ['item10.b.opening'] }, 'scenario', 'item10.b.opening'],
    ] as const) {
      expect(() => resolveScope(project, request, 'publish')).toThrow();
      try { resolveScope(project, request, 'publish'); } catch (error) { expect(error).toMatchObject({ details: { scope, id } }); }
    }
  });

  it.each(['dev', 'review', 'publish'] as const)('orders mixed entries once and excludes non-public entries on publish (%s)', mode => {
    expect(built(source(), mode).entryIds).toEqual(mode === 'publish'
      ? ['priority', 'item3', 'item9', 'item10']
      : mode === 'review' ? ['priority', 'item2', 'item3', 'item9', 'item10']
      : ['priority', 'item1', 'item2', 'item3', 'item4', 'item9', 'item10']);
  });
});
