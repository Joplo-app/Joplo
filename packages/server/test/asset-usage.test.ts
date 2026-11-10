import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config, work, chapter, asset, captureAssetLoads } from '@joplo-app/kit';
import ui, { Text } from '@joplo-app/plugin-ui';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { assetUsage } from '../src/asset-usage.ts';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-asset-usage-')); directories.push(root);
  fs.mkdirSync(path.join(root, 'works')); fs.mkdirSync(path.join(root, 'photos'));
  fs.writeFileSync(path.join(root, 'joplo.config.ts'), '// fixture module');
  for (const file of ['wide', 'tall', 'draft']) fs.writeFileSync(path.join(root, 'works', `${file}.tsx`), '// fixture module');
  fs.writeFileSync(path.join(root, 'photos', 'shared.png'), 'same photo');
  fs.writeFileSync(path.join(root, 'photos', 'draft.png'), 'draft photo');
  fs.writeFileSync(path.join(root, 'photos', 'unused.png'), 'not referenced');
  const importer = async (file: string) => {
    if (file.endsWith('joplo.config.ts')) return { default: config({ name: 'Assets', plugins: [ui] }) };
    const key = path.basename(file, '.tsx');
    const url = asset(`../photos/${key === 'draft' ? 'draft' : 'shared'}.png`, file);
    return { default: work({ title: key, summary: key, draft: key === 'draft', stage: jsx(Text, { id: 'picture', style: { backgroundImage: `url(${url})` }, children: key }), scenarios: { one: chapter('Opening').system('Show') } }) };
  };
  return { root, importer };
}
it('reports shared references, draft-only publication exclusion and explicitly scanned not-found files without writing', async () => {
  const { root, importer } = fixture();
  const before = fs.readdirSync(root);
  const report = await assetUsage({ directory: root, importer, scan: ['photos'] });
  const shared = report.entries.find(e => e.path === 'photos/shared.png')!;
  expect(new Set(shared.references.map(r => r.workId).filter(Boolean))).toEqual(new Set(['tall', 'wide']));
  expect(shared.references).toContainEqual(expect.objectContaining({ workId: 'wide', scenarioId: 'wide.one', layer: 'stage', elementId: 'picture' }));
  expect(shared.publication).toBe('included-in-selected-ir');
  expect(report.entries.find(e => e.path === 'photos/draft.png')).toMatchObject({ authorReference: 'referenced', publication: 'not-in-selected-ir', sampledVisibility: 'unknown' });
  expect(report.entries.find(e => e.path === 'photos/unused.png')!.authorReference).toBe('not-found-in-loaded-model');
  expect(fs.readdirSync(root)).toEqual(before); expect(fs.existsSync(path.join(root, '.joplo'))).toBe(false);
});
it('scopes publication while retaining honestly labelled whole-project author references', async () => {
  const { root, importer } = fixture();
  const report = await assetUsage({ directory: root, importer, work: 'wide', scenario: 'wide.one', scan: ['photos'] });
  expect(report.scope).toMatchObject({ authorReferences: 'whole-loaded-project', publicationScenarios: ['wide.one'] });
  const refs = report.entries.find(e => e.path === 'photos/shared.png')!.references;
  expect(refs).toContainEqual(expect.objectContaining({ workId: 'wide', inSelectedScope: true }));
  expect(refs).toContainEqual(expect.objectContaining({ workId: 'tall', inSelectedScope: false }));
  expect((await assetUsage({ directory: root, importer, work: 'draft' })).entries.find(e => e.path === 'photos/draft.png')!.publication).toBe('not-in-selected-ir');
});
it('keeps dynamic paths and cached module provenance unknown, and identifies equal-content ambiguity', async () => {
  const { root, importer } = fixture();
  fs.appendFileSync(path.join(root, 'works/wide.tsx'), '\n// asset(dynamicPath)');
  fs.copyFileSync(path.join(root, 'photos/shared.png'), path.join(root, 'photos/copy.png'));
  const report = await assetUsage({ directory: root, importer, scan: ['photos'] });
  expect(report.entries.find(e => e.path === 'photos/unused.png')!.authorReference).toBe('unknown');
  expect(report.entries.find(e => e.path === 'photos/copy.png')!.metadata.contentMatch).toContain('ambiguous');
  const modules = new Map<string, Record<string, unknown>>();
  const cached = async (file: string) => { if (!modules.has(file)) modules.set(file, await importer(file)); return modules.get(file)!; };
  await assetUsage({ directory: root, importer: cached, scan: ['photos'] });
  const repeated = await assetUsage({ directory: root, importer: cached, scan: ['photos'] });
  expect(repeated.unknowns.some(u => u.reason.includes('module caching'))).toBe(true);
  expect(repeated.entries.find(e => e.path === 'photos/unused.png')!.authorReference).toBe('unknown');
});
it('isolates concurrent capture and duplicate kit instances by the global async-local context', async () => {
  const a = fixture(), b = fixture();
  const reports = await Promise.all([a, b].map(f => assetUsage({ directory: f.root, importer: f.importer, scan: ['photos'] })));
  expect(reports.map(r => r.root)).toEqual([fs.realpathSync(a.root), fs.realpathSync(b.root)]);
  for (const report of reports) expect(report.entries.every(e => !e.path?.includes('..'))).toBe(true);
  const captured = await captureAssetLoads(async () => {
    const modulePath = '../../kit/src/asset.ts?duplicate';
    const second = await import(/* @vite-ignore */ modulePath);
    second.asset('./photos/shared.png', path.join(a.root, 'source.ts'));
  });
  expect(captured.assets).toHaveLength(1); expect(captured.assets[0]!.file).toBe(path.join(a.root, 'photos/shared.png'));
});
it('does not follow top-level or nested symlinks and rejects traversal outside the project', async () => {
  const a = fixture(), b = fixture();
  fs.symlinkSync(b.root, path.join(a.root, 'photos/external'));
  fs.symlinkSync(b.root, path.join(a.root, 'external'));
  const report = await assetUsage({ directory: a.root, importer: a.importer, scan: ['photos'] });
  expect(report.unknowns.some(u => u.reason.includes('Symlink skipped'))).toBe(true);
  await expect(assetUsage({ directory: a.root, importer: a.importer, scan: ['external/photos'] })).rejects.toMatchObject({ code: 'USAGE' });
  await expect(assetUsage({ directory: a.root, importer: a.importer, scan: ['../'] })).rejects.toMatchObject({ code: 'USAGE' });
});
it('inventories plugin-declared binaries without importing or running the local compiler', async () => {
  const { definePlugin, pluginEffect } = await import('@joplo-app/kit/plugin');
  const f = fixture();
  const plugin = definePlugin({ id: 'report-test', title: 'Report', version: '1.0.0', runtime: new URL(import.meta.url), local: path.join(f.root, 'must-not-load.mjs'), components: {}, schemas: { step: { safeParse: () => ({ success: true }) } }, data: { step: { scope: 'global' } }, compile: { effect: (_effect, ctx) => ({ data: { resource: ctx.resource({ compiler: 'audio', input: 'private composition' }) } }) } });
  const report = await assetUsage({ directory: f.root, importer: async file => {
    if (file.endsWith('joplo.config.ts')) return { default: config({ name: 'Declared', plugins: [ui, plugin] }) };
    return { default: work({ title: path.basename(file), summary: 'Resource', stage: jsx(Text, { children: 'Stage' }), scenarios: { one: chapter('One').system('Sound', pluginEffect('report-test', 'sound', {})) } }) };
  } });
  const resource = report.entries.find(entry => entry.kind === 'plugin-declared')!;
  expect(resource).toMatchObject({ authorReference: 'referenced', publication: 'included-in-selected-ir', bytes: null, mime: null, metadata: { plugin: 'report-test', compiler: 'audio' } });
  expect(resource.references.map(ref => ref.workId)).toContain('wide');
  expect(fs.existsSync(path.join(f.root, '.joplo'))).toBe(false);
  expect(JSON.stringify(report)).not.toContain('private composition');
});
it('includes continuing predecessors by scenario identity rather than splitting chapter ids', async () => {
  const f = fixture();
  const report = await assetUsage({ directory: f.root, scenario: 'wide.next', importer: async file => {
    const mod = await f.importer(file);
    if (mod.default.kind === 'work') mod.default.scenarios.next = chapter('Next', { from: 'one' }).system('Continue');
    return mod;
  } });
  expect(report.scope.publicationScenarios.sort()).toEqual(['wide.next', 'wide.one']);
});
