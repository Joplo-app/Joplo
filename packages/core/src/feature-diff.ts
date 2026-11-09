import { projectThemes } from './themes.ts';
import { jsonData } from './plugins/data.ts';
import { adaptPublicInput, legacyDiagnostics } from './plugins/legacy.ts';
/** Public feature comparison. Positional ids are addresses, never cross-version identities. */
import { z } from 'zod';
import { Project, type Effect, type Scenario, type Step } from './schema.ts';
import { JoploError } from './result.ts';

export const GitSha = z.string().regex(/^[a-f0-9]{40}$/);
export const DiffSource = z.strictObject({ sha: GitSha.nullable() });
/** caption is the public step caption, shown so readers can tell which step changed without playing it. */
const Ref = z.strictObject({ id: z.string(), position: z.number().int().positive(), key: z.string().optional(), caption: z.string().max(300).optional() });
/**
 * What a reader can see change when the step runs: state values written by set/stream/append,
 * toast text and the scenario outcome. null = this version's step does not produce it.
 */
const Result = z.strictObject({ kind: z.enum(['state', 'message', 'outcome']), label: z.string().max(120), before: z.string().max(200).nullable(), after: z.string().max(200).nullable() });
const Status = z.enum(['added', 'modified', 'removed', 'unchanged', 'uncertain']);
export const DiffStep = z.strictObject({
  before: Ref.nullable(), after: Ref.nullable(), status: Status,
  match: z.enum(['key', 'content', 'action', 'none', 'uncertain']), reasons: z.array(z.string()),
  results: z.array(Result).max(12).optional(),
});
export const DiffScenario = z.strictObject({
  featureId: z.string(), featureName: z.string(), name: z.string(),
  before: z.string().nullable(), after: z.string().nullable(), status: Status,
  reasons: z.array(z.string()), steps: z.array(DiffStep),
});
export const FeatureDiffManifest = z.strictObject({
  formatVersion: z.literal(1), kind: z.literal('joplo-feature-diff'),
  base: DiffSource, head: DiffSource,
  status: z.enum(['changed', 'unchanged', 'uncertain', 'incompatible']),
  reasons: z.array(z.string()),
  summary: z.strictObject({ added: z.array(z.string().max(200)).max(100), modified: z.array(z.string().max(200)).max(100), removed: z.array(z.string().max(200)).max(100) }),
  scenarios: z.array(DiffScenario),
});
export type FeatureDiffManifest = z.infer<typeof FeatureDiffManifest>;
export type DiffScenario = z.infer<typeof DiffScenario>;
export type DiffStep = z.infer<typeof DiffStep>;

/** Canonical object ordering; arrays preserve execution order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
const stepContent = ({ id: _id, key: _key, source: _source, ruleIds: _rules, ...rest }: Step) => rest;
const identity = (s: Step) => {
  const a = s.action;
  return canonical([s.kind, a.type, ...(a.type === 'plugin' ? [a.name] : []), 'target' in a ? a.target : 'name' in a ? a.name : 'keys' in a ? a.keys : 'title' in a ? a.title : null]);
};
const ref = (s: Step, index: number) => ({ id: s.id, position: index + 1, ...(s.key ? { key: s.key } : {}), caption: s.caption.slice(0, 300) });
/** Presentation-only step fields, grouped into reader-facing reasons. Unlisted content changes fall back to 'presentation'. */
const PRESENTATION: [string, (keyof Step)[]][] = [
  ['caption', ['caption', 'captionAuto']], ['explain', ['explain']], ['camera', ['shots', 'directorLayer']],
  ['annotations', ['marks', 'cues', 'callouts']], ['voice', ['say', 'narrate']], ['timing', ['hold']],
  ['trace', ['traces', 'ext']], ['forks', ['forks']], ['kind', ['kind']],
];
const KIND_ORDER = { state: 0, message: 1, outcome: 2 } as const;
const shown = (v: unknown) => (typeof v === 'string' ? v : canonical(v)).slice(0, 200);
/** Final visible value per result slot; the last write in a step wins, appends and toasts accumulate. */
function resultSlots(effects: Effect[]) {
  const slots = new Map<string, { kind: keyof typeof KIND_ORDER; label: string; value: string }>();
  const add = (key: string, kind: keyof typeof KIND_ORDER, label: string, value: string, accumulate = false) => {
    const prev = slots.get(key);
    slots.set(key, { kind, label, value: (accumulate && prev ? `${prev.value} · ${value}` : value).slice(0, 200) });
  };
  for (const e of effects) {
    if (e.type === 'set' || e.type === 'stream') add(`s:${e.path}`, 'state', e.path, shown(e.value));
    else if (e.type === 'append') add(`a:${e.path}`, 'state', `${e.path} +`, shown(e.value), true);
    else if (e.type === 'toast') add('toast', 'message', 'toast', e.text, true);
    else if (e.type === 'complete') add('done', 'outcome', 'done', e.outcome === 'success' ? e.text : `${e.text} (${e.outcome})`);
  }
  return slots;
}
function resultChanges(before: Effect[], after: Effect[]): NonNullable<DiffStep['results']> {
  const b = resultSlots(before), a = resultSlots(after);
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  return keys
    .map(k => ({ slot: (a.get(k) ?? b.get(k))!, before: b.get(k)?.value ?? null, after: a.get(k)?.value ?? null }))
    .filter(r => r.before !== r.after)
    .sort((x, y) => KIND_ORDER[x.slot.kind] - KIND_ORDER[y.slot.kind])
    .slice(0, 12)
    .map(r => ({ kind: r.slot.kind, label: r.slot.label.slice(0, 120), before: r.before, after: r.after }));
}
const groups = (steps: Step[], fn: (s: Step) => string) => {
  const map = new Map<string, number[]>();
  steps.forEach((s, i) => { const k = fn(s); map.set(k, [...(map.get(k) ?? []), i]); });
  return map;
};

export function compareSteps(before: Step[], after: Step[]): DiffStep[] {
  const pairs = new Map<number, { index: number; match: DiffStep['match'] }>();
  const used = new Set<number>();
  const uncertainBefore = new Set<number>(), uncertainAfter = new Set<number>();
  // Shared keys are authoritative. Different explicit keys never fall back to each other.
  for (const [key, bs] of groups(before, s => s.key ?? '')) {
    if (!key) continue;
    const as = groups(after, s => s.key ?? '').get(key) ?? [];
    if (bs.length === 1 && as.length === 1) { pairs.set(as[0]!, { index: bs[0]!, match: 'key' }); used.add(bs[0]!); }
    else if (bs.length > 1 || as.length > 1) { bs.forEach(i => uncertainBefore.add(i)); as.forEach(i => uncertainAfter.add(i)); }
  }
  for (const [key, as] of groups(after, s => s.key ?? '')) if (key && as.length > 1) as.forEach(i => uncertainAfter.add(i));
  for (const [fn, match] of [[(s: Step) => canonical(stepContent(s)), 'content'], [identity, 'action']] as const) {
    const bg = groups(before, fn), ag = groups(after, fn);
    for (const [key, bs] of bg) {
      const as = ag.get(key) ?? [];
      const b = bs.filter(i => !used.has(i));
      const a = as.filter(i => !pairs.has(i));
      // Count original candidates too: matching another occurrence must not make an ambiguous one unique.
      if (b.length === 1 && a.length === 1 && bs.length === 1 && as.length === 1 && !(before[b[0]!]!.key && after[a[0]!]!.key)) {
        pairs.set(a[0]!, { index: b[0]!, match }); used.add(b[0]!);
      }
    }
  }
  const bg = groups(before, identity), ag = groups(after, identity);
  before.forEach((s, i) => { if (!used.has(i) && (ag.get(identity(s)) ?? []).some(j => !(s.key && after[j]!.key) && !pairs.has(j))) uncertainBefore.add(i); });
  after.forEach((s, i) => { if (!pairs.has(i) && (bg.get(identity(s)) ?? []).some(j => !(s.key && before[j]!.key) && !used.has(j))) uncertainAfter.add(i); });
  const rows: DiffStep[] = [];
  const removed = new Set<number>();
  const addBefore = (i: number) => {
    if (used.has(i) || removed.has(i)) return;
    removed.add(i);
    const uncertain = uncertainBefore.has(i);
    rows.push({ before: ref(before[i]!, i), after: null, status: uncertain ? 'uncertain' : 'removed', match: uncertain ? 'uncertain' : 'none', reasons: uncertain ? ['ambiguous-match'] : ['step-removed'] });
  };
  after.forEach((s, j) => {
    const pair = pairs.get(j);
    if (!pair) {
      const uncertain = uncertainAfter.has(j);
      rows.push({ before: null, after: ref(s, j), status: uncertain ? 'uncertain' : 'added', match: uncertain ? 'uncertain' : 'none', reasons: uncertain ? ['ambiguous-match'] : ['step-added'] });
      return;
    }
    for (let i = 0; i < pair.index; i++) addBefore(i);
    const old = before[pair.index]!;
    const reasons: string[] = [];
    if (canonical(old.action) !== canonical(s.action)) reasons.push('action');
    if (canonical(old.effects) !== canonical(s.effects)) reasons.push('effects');
    const presentation = PRESENTATION.filter(([, fields]) => fields.some(f => canonical(old[f]) !== canonical(s[f]))).map(([reason]) => reason);
    reasons.push(...presentation);
    if (canonical(stepContent(old)) !== canonical(stepContent(s)) && !reasons.length) reasons.push('presentation');
    if ([...pairs].some(([otherJ, other]) => (otherJ - j) * (other.index - pair.index) < 0)) reasons.push('order');
    const results = reasons.includes('effects') ? resultChanges(old.effects, s.effects) : [];
    rows.push({ before: ref(old, pair.index), after: ref(s, j), status: reasons.length ? 'modified' : 'unchanged', match: pair.match, reasons, ...(results.length ? { results } : {}) });
  });
  before.forEach((_, i) => addBefore(i));
  return rows;
}

/** Refuse private IR instead of projecting potentially private unknown fields into a public comparison. */
export function readPublicProject(value: unknown): Project {
  let input: unknown;
  try { input = adaptPublicInput(jsonData(value)); } catch { throw new JoploError('INVALID_SCHEMA', 'Invalid public playback IR; expected finite JSON and valid legacy geometry'); }
  if (legacyDiagnostics(input).some(d => d.message.includes('ui:'))) throw new JoploError('INVALID_SCHEMA', 'Incompatible pre-plugin UI IR; rebuild both versions with the current kit before comparison. Existing shares retain their own runtime.');
  const parsed = Project.safeParse(input);
  if (!parsed.success) throw new JoploError('INVALID_SCHEMA', 'Invalid public playback IR; rebuild both versions with a compatible CLI');
  const p = parsed.data;
  if (p.mode !== 'publish') throw new JoploError('INVALID_SCHEMA', 'Feature diff requires two publish builds, not dev or review IR');
  const nodePrivate = (n: Project['scenes'][string]['root']): boolean => n.source !== undefined || n.note !== undefined || (n.children ?? []).some(nodePrivate);
  if (Object.keys(p.rules).length || Object.keys(p.cases).length || Object.keys(p.issues).length || p.voiceConfig ||
      Object.values(p.routes).some(r => r.source) || Object.values(p.scenes).some(s => nodePrivate(s.root)) ||
      Object.values(p.features).some(f => f.source || f.constraints.length || f.caseIds.length) ||
      Object.values(p.options).some(o => o.source || o.decisionFocus || o.tradeoffs.length || Object.keys(o.coverage).length) ||
      Object.values(p.scenarios).some(s => s.source || s.caseIds.length || s.steps.some(st => st.source || st.ruleIds.length)))
    throw new JoploError('INVALID_SCHEMA', 'Private authoring data found; rebuild both sites with joplo build');
  for (const [id, sc] of Object.entries(p.scenarios)) {
    const op = p.options[sc.optionId];
    if (sc.id !== id || !op || !p.features[op.featureId] || !p.scenes[sc.initial.sceneId] ||
        Object.values(op.layers).some(l => !p.scenes[l.sceneId]) ||
        sc.steps.some(st => st.effects.some(e => e.type === 'navigate' && !p.scenes[e.sceneId])) ||
        new Set(sc.steps.map(st => st.id)).size !== sc.steps.length)
      throw new JoploError('INVALID_REFERENCE', 'Public build contains missing or ambiguous playback references; rebuild that version');
  }
  return p;
}
function sceneInputs(p: Project, s: Scenario) {
  const ids = new Set([s.initial.sceneId, ...Object.values(p.options[s.optionId]?.layers ?? {}).map(l => l.sceneId)]);
  for (const st of s.steps) for (const e of st.effects) if (e.type === 'navigate') ids.add(e.sceneId);
  return [...ids].sort().map(id => p.scenes[id] ?? { missing: id });
}
function actionContracts(p: Project, s: Scenario) {
  const actions = [...s.steps.map(st => st.action), ...Object.values(p.options[s.optionId]?.free ?? {}).map(r => r.action)];
  const names = [...new Set(actions.flatMap(a => a.type === 'plugin' ? [a.name] : []))].sort();
  return names.map(name => { const [id, key] = name.split(':'); return [name, p.plugins?.[id!]?.actions?.[key!]]; });
}
export function featureDiff(before: unknown, after: unknown, source: { baseSha?: string; headSha?: string } = {}): FeatureDiffManifest {
  if ([source.baseSha, source.headSha].some(sha => sha !== undefined && !GitSha.safeParse(sha).success)) throw new JoploError('USAGE', 'Source SHAs must be normalized 40-character hexadecimal git commits');
  const base = DiffSource.parse({ sha: source.baseSha ?? null }), head = DiffSource.parse({ sha: source.headSha ?? null });
  const result: FeatureDiffManifest = { formatVersion: 1, kind: 'joplo-feature-diff', base, head, status: 'unchanged', reasons: [], summary: { added: [], modified: [], removed: [] }, scenarios: [] };
  if ((before as Project)?.schemaVersion !== 2 || (after as Project)?.schemaVersion !== 2) return { ...result, status: 'incompatible', reasons: ['schema-version'] };
  if ([before, after].some(p => legacyDiagnostics(p).some(d => d.message.includes('ui:')))) return {...result, status:'incompatible', reasons:['plugin-vocabulary: rebuild both versions with the current kit']};
  const b = readPublicProject(before), a = readPublicProject(after);
  for (const id of new Set([...Object.keys(a.scenarios), ...Object.keys(b.scenarios)])) {
    const old = b.scenarios[id], next = a.scenarios[id], s = next ?? old!, p = next ? a : b;
    const option = p.options[s.optionId], feature = p.features[option?.featureId ?? ''];
    if (!feature) throw new JoploError('INVALID_SCHEMA', 'Scenario references a missing public feature');
    const steps = compareSteps(old?.steps ?? [], next?.steps ?? []), reasons: string[] = [];
    let status: DiffScenario['status'] = !old ? 'added' : !next ? 'removed' : 'unchanged';
    if (old && next) {
      const bo = b.options[old.optionId], bf = b.features[bo!.featureId];
      if (canonical([old.initial, old.ext]) !== canonical([next.initial, next.ext])) reasons.push('initial-state');
      if (canonical(sceneInputs(b, old)) !== canonical(sceneInputs(a, next))) reasons.push('scenes');
      if (canonical([b.theme, projectThemes(b), b.autoFocus]) !== canonical([a.theme, projectThemes(a), a.autoFocus])) reasons.push('theme');
      if (canonical(bo?.free) !== canonical(option?.free)) reasons.push('free-reactions');
      if (canonical(actionContracts(b, old)) !== canonical(actionContracts(a, next))) reasons.push('action-contracts');
      if (canonical([bo?.layers, bf?.roles]) !== canonical([option?.layers, feature.roles])) reasons.push('layers-roles');
      if (canonical([old.name, old.description, old.expected, old.mock, bf?.name, bf?.goal, bo?.name, bo?.idea]) !== canonical([next.name, next.description, next.expected, next.mock, feature.name, feature.goal, option?.name, option?.idea])) reasons.push('description');
      status = steps.some(st => st.status === 'uncertain') ? 'uncertain' : reasons.length || steps.some(st => st.status !== 'unchanged') ? 'modified' : 'unchanged';
    }
    result.scenarios.push({ featureId: feature.id, featureName: feature.name, name: s.name, before: old?.id ?? null, after: next?.id ?? null, status, reasons, steps });
    const group = status === 'uncertain' ? 'modified' : status;
    if (group !== 'unchanged' && result.summary[group].length < 100) result.summary[group].push(`${feature.name} / ${s.name}`.slice(0, 200));
  }
  // Project metadata / unused shared scenes still changed even when no scenario can display it.
  if (canonical([b.name, b.description, b.features, b.options, b.scenes, b.theme, projectThemes(b), b.routes, b.featureIds, b.autoFocus]) !== canonical([a.name, a.description, a.features, a.options, a.scenes, a.theme, projectThemes(a), a.routes, a.featureIds, a.autoFocus])) result.reasons.push('project-presentation');
  result.status = result.scenarios.some(s => s.status === 'uncertain') ? 'uncertain' : result.reasons.length || result.scenarios.some(s => s.status !== 'unchanged') ? 'changed' : 'unchanged';
  return FeatureDiffManifest.parse(result);
}
