/** Read-only provenance report. Never invokes a resource compiler, build, renderer, uploader or cleanup. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { captureAssetLoads } from '@joplo-app/kit';
import type { ResourceRequest } from '@joplo-app/kit/plugin';
import { compile, JoploError, resolveScope, scopeProject, type Project, type SceneNode } from '@joplo-app/core';
import { discoverFiles, loadAuthoring, type Importer } from '@joplo-app/core/node';
import { publishPayload } from './build.ts';

export type AssetUsageReference = { workId: string | null; scenarioId: string | null; layer: string | null; elementId: string | null; source: string | null; evidence: 'loaded-asset-call' | 'compiled-content' | 'declared-resource'; inSelectedScope?: boolean; stepId?: string };
export type AssetUsageEntry = {
  id: string; path: string | null; kind: string; mime: string | null; bytes: number | null;
  authorReference: 'referenced' | 'not-found-in-loaded-model' | 'unknown';
  publication: 'included-in-selected-ir' | 'not-in-selected-ir' | 'unknown';
  sampledVisibility: 'unknown'; metadata: Record<string, string>; references: AssetUsageReference[];
};
export type AssetUsageReport = {
  schemaVersion: 1; root: string; scope: { authorReferences: 'whole-loaded-project'; work: string | null; scenario: string | null; publicationScenarios: string[]; scan: string[]; sourceFiles: string[] };
  entries: AssetUsageEntry[]; unknowns: { source: string | null; reason: string }[]; limitations: string[];
};
const digest = (bytes: Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');
const strings = (value: unknown, visit: (s: string) => void): void => {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) value.forEach(v => strings(v, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => strings(v, visit));
};
const hashes = (value: unknown): Set<string> => {
  const out = new Set<string>();
  strings(value, s => { for (const m of s.matchAll(/data:[\w.+/-]+;base64,([A-Za-z0-9+/=]+)/g)) out.add(digest(Buffer.from(m[1]!, 'base64'))); });
  return out;
};
const includesId = (value: unknown, id: string) => { let found = false; strings(value, s => { if (s === id) found = true; }); return found; };

export async function assetUsage(opts: { directory: string; importer: Importer; scan?: string[]; work?: string; scenario?: string }): Promise<AssetUsageReport> {
  const root = fs.realpathSync(opts.directory);
  const rel = (value: string) => path.relative(root, value).split(path.sep).join('/');
  const source = (value: string | undefined) => value ? (path.isAbsolute(value.replace(/:\d+:\d+$/, '')) ? rel(value) : value) : null;
  const requests: ResourceRequest[] = [];
  const captured = await captureAssetLoads(async () => {
    const loaded = await loadAuthoring(root, opts.importer);
    if (!loaded.authoring || loaded.diagnostics.some(d => d.severity === 'error')) throw new JoploError('INVALID_SCHEMA', 'Cannot report asset usage until project loading succeeds', { diagnostics: loaded.diagnostics });
    const dev = compile(loaded.authoring, 'dev', { onResource: request => requests.push(request) });
    const published = compile(loaded.authoring, 'publish');
    if (!dev.project || !published.project || [...dev.diagnostics, ...published.diagnostics].some(d => d.severity === 'error')) throw new JoploError('INVALID_SCHEMA', `Cannot report asset usage until project compilation succeeds: ${[...dev.diagnostics, ...published.diagnostics].filter(d => d.severity === 'error').slice(0, 5).map(d => `${d.code}: ${d.message}`).join('; ')}`, { diagnostics: [...dev.diagnostics, ...published.diagnostics] });
    return { dev: dev.project, published: published.project };
  });
  const { dev } = captured.value;
  if (opts.work && !dev.works[opts.work]) throw new JoploError('USAGE', `Unknown work: ${opts.work}`);
  if (opts.scenario && (!dev.scenarios[opts.scenario] || opts.work && dev.scenarios[opts.scenario]?.workId !== opts.work)) throw new JoploError('USAGE', `Unknown scenario or work mismatch: ${opts.scenario}`);
  const selected = new Set(Object.values(dev.scenarios).filter(sc => (!opts.work || sc.workId === opts.work) && (!opts.scenario || sc.id === opts.scenario)).map(sc => sc.id));
  for (const id of selected) if (dev.scenarios[id]?.from) selected.add(dev.scenarios[id]!.from!);
  let published = captured.value.published;
  if (opts.work || opts.scenario) {
    const ids = [...selected].filter(id => published.scenarios[id]);
    // Draft-only author scope is valid for reporting, with no publication payload.
    published = ids.length ? scopeProject(published, resolveScope(published, { scenarios: ids }, 'publish')).project : { ...published, scenarios: {}, scenes: {} };
  }
  const payload = publishPayload(published, null).project;
  const publishedHashes = hashes(payload);
  const unknowns: AssetUsageReport['unknowns'] = [];
  if (!captured.assets.length) unknowns.push({ source: null, reason: 'No asset() evaluations were captured; module caching or helper/kit instances may hide provenance. Unmatched files remain unknown.' });
  const sourceFiles = discoverFiles(root).filter(f => /\.[cm]?[jt]sx?$/.test(f));
  for (const file of sourceFiles) {
    const text = fs.readFileSync(file, 'utf8');
    if (/\b(?:from\s*|import\s*\()(['"])(?:\.|\/)/.test(text)) unknowns.push({ source: rel(file), reason: 'Imported helper modules are not statically traversed; cached modules and hidden branches can carry additional asset references.' });
    if ([...text.matchAll(/\basset\s*\(([^)]*)/g)].some(m => !/^(['"])[\s\S]*\1(?:\s*,|\s*$)/.test(m[1]!.trim()))) unknowns.push({ source: rel(file), reason: 'Potential dynamic asset path; only executed asset() calls are observed. Aliases, imports and unexecuted branches are not statically resolved.' });
  }
  const entries = new Map<string, AssetUsageEntry>();
  const byHash = new Map<string, AssetUsageEntry[]>();
  const addFile = (file: string, mime: string | null) => {
    const real = fs.realpathSync(file), id = rel(real);
    if (entries.has(id)) return entries.get(id)!;
    const size = fs.statSync(real).size, hasher = crypto.createHash('sha256');
    const fd = fs.openSync(real, 'r'), chunk = Buffer.alloc(64 * 1024);
    try { let count: number; while ((count = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) hasher.update(chunk.subarray(0, count)); } finally { fs.closeSync(fd); }
    const hash = hasher.digest('hex');
    const entry: AssetUsageEntry = { id, path: id, kind: mime?.split('/')[0] ?? (path.extname(real).slice(1) || 'file'), mime, bytes: size, authorReference: 'not-found-in-loaded-model', publication: publishedHashes.has(hash) ? 'included-in-selected-ir' : 'not-in-selected-ir', sampledVisibility: 'unknown', metadata: {}, references: [] };
    entries.set(id, entry); byHash.set(hash, [...(byHash.get(hash) ?? []), entry]); return entry;
  };
  for (const load of captured.assets) {
    const entry = addFile(load.file, load.mime);
    entry.references.push({ workId: null, scenarioId: null, layer: null, elementId: null, source: source(load.source), evidence: 'loaded-asset-call' });
    entry.authorReference = 'referenced';
  }
  const scan = (opts.scan ?? []).map(dir => {
    const resolved = path.resolve(root, dir), real = fs.realpathSync(resolved), relative = path.relative(root, real);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new JoploError('USAGE', 'Asset scan directories must be inside the project root');
    return resolved;
  });
  const walkFiles = (directory: string) => {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink()) { unknowns.push({ source: rel(directory), reason: 'Symlink skipped; its target is outside this explicit traversal.' }); return; }
    if (stat.isFile()) { addFile(directory, null); return; }
    for (const name of fs.readdirSync(directory).sort()) walkFiles(path.join(directory, name));
  };
  scan.forEach(walkFiles);
  const addReferences = (value: unknown, ref: AssetUsageReference) => {
    for (const hash of hashes(value)) for (const entry of byHash.get(hash) ?? []) { entry.authorReference = 'referenced'; entry.references.push(ref); }
  };
  for (const scene of Object.values(dev.scenes)) {
    const scenarios = Object.values(dev.scenarios).filter(sc => (scene.workId ? sc.workId === scene.workId : dev.works[sc.workId]?.routes.includes(scene.route)));
    const visit = (node: SceneNode) => {
      for (const sc of scenarios) {
        const layers = Object.entries(dev.works[sc.workId]?.layers ?? {}).filter(([, layer]) => layer.sceneId === scene.id).map(([key]) => key);
        const { children: _children, ...own } = node;
        for (const layer of layers.length ? layers : [null]) addReferences(own, { workId: sc.workId, scenarioId: sc.id, layer, elementId: node.id, source: source(node.source), evidence: 'compiled-content' });
      }
      node.children?.forEach(visit);
    };
    visit(scene.root);
  }
  for (const sc of Object.values(dev.scenarios)) {
    addReferences(sc.initial, { workId: sc.workId, scenarioId: sc.id, layer: null, elementId: null, source: source(sc.source), evidence: 'compiled-content' });
    for (const step of sc.steps) addReferences(step, { workId: sc.workId, scenarioId: sc.id, layer: step.directorLayer, elementId: 'target' in step.action ? step.action.target : null, stepId: step.id, source: source(step.source), evidence: 'compiled-content' });
  }
  for (const request of new Map(requests.map(r => [r.id, r])).values()) {
    const references: AssetUsageReference[] = [];
    for (const sc of Object.values(dev.scenarios)) {
      if (includesId(sc, request.id)) references.push({ workId: sc.workId, scenarioId: sc.id, layer: null, elementId: null, source: source(request.source), evidence: 'declared-resource' });
      for (const scene of Object.values(dev.scenes).filter(scene => scene.workId === sc.workId)) {
        const visit = (node: SceneNode) => { const { children: _children, ...own } = node; if (includesId(own, request.id)) references.push({ workId: sc.workId, scenarioId: sc.id, layer: Object.entries(dev.works[sc.workId]?.layers ?? {}).find(([, l]) => l.sceneId === scene.id)?.[0] ?? null, elementId: node.id, source: source(node.source ?? request.source), evidence: 'declared-resource' }); node.children?.forEach(visit); }; visit(scene.root);
      }
    }
    entries.set(`resource:${request.id}`, { id: request.id, path: null, kind: 'plugin-declared', mime: null, bytes: null, authorReference: references.length ? 'referenced' : 'unknown', publication: includesId(payload, request.id) ? 'included-in-selected-ir' : 'not-in-selected-ir', sampledVisibility: 'unknown', metadata: { plugin: request.plugin, compiler: request.compiler }, references });
    unknowns.push({ source: source(request.source), reason: `Resource ${request.id}: compiler output, binary size and provider metadata were not evaluated (read-only report).` });
  }
  for (const same of byHash.values()) if (same.length > 1) {
    for (const entry of same) entry.metadata.contentMatch = 'ambiguous: multiple source files contain identical bytes; compiled references do not identify an exact source path';
  }
  for (const entry of entries.values()) {
    entry.references.forEach(ref => { if (ref.scenarioId) ref.inSelectedScope = selected.has(ref.scenarioId); });
    entry.references = [...new Map(entry.references.map(ref => [JSON.stringify(ref), ref])).values()];
    if (entry.authorReference === 'not-found-in-loaded-model' && unknowns.length) entry.authorReference = 'unknown';
  }
  return { schemaVersion: 1, root, scope: { authorReferences: 'whole-loaded-project', work: opts.work ?? null, scenario: opts.scenario ?? null, publicationScenarios: Object.keys(published.scenarios), scan: scan.map(rel), sourceFiles: sourceFiles.map(rel) }, entries: [...entries.values()].sort((a, b) => a.id.localeCompare(b.id)), unknowns, limitations: [
    'Author references cover the whole loaded project (including drafts); inSelectedScope marks contextual references inside the requested work/chapter scope. Publication inclusion uses only the selected published IR. Author references describe this module evaluation and loaded model, not all possible executions. Not found never means unused; dynamic/aliased paths, imported helper code and unexecuted branches can remain unknown.',
    'Publication inclusion means content is present in the selected publish IR; no build was run and generated/plugin resources may still require preparation. Equal bytes can identify multiple source paths, so compiled-content references are content matches, not proof of a specific path.',
    'Metadata currently covers only explicit captured MIME/size and declared plugin/compiler identities; author/source/year fields have no generic authoring declaration and remain absent rather than inferred.',
    'No frames were rendered or sampled. Conditions, camera clipping, hidden layers and runtime plugin parsing mean visibility is always unknown. Metadata is reported only when declared; missing author/source/year is not inferred.',
  ] };
}
