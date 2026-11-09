import { describe, expect, it } from 'vitest';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { flow, config, feature, option, page } from '@joplo-app/kit';
import { compile, compareSteps, featureDiff, stateAt } from '../src/index.ts';
import { diffProject, step } from './fixtures/feature-diff.ts';
import type { AuthoringProject } from '../src/compile.ts';

const scenario = 'invite.main.send';
describe('feature diff matching reliability', () => {
  it('ignores shifted sequence ids after insertion while comparing effects', () => {
    const b = diffProject(), a = structuredClone(b);
    a.scenarios[scenario]!.steps.splice(1, 0, step('Preview', 2));
    a.scenarios[scenario]!.steps.forEach((s, i) => s.id = `${scenario}#${i + 1}`);
    const rows = featureDiff(b, a).scenarios[0]!.steps;
    expect(rows.map(s => s.status)).toEqual(['unchanged', 'added', 'unchanged', 'unchanged']);
    expect(rows[2]).toMatchObject({ before: { position: 2 }, after: { position: 3 } });
    a.scenarios[scenario]!.steps[2]!.effects.push({ type: 'set', path: 'ui.loading', value: true });
    expect(featureDiff(b, a).scenarios[0]!.steps[2]!.reasons).toContain('effects');
  });
  it('never guesses identical repeated occurrences (including changed counts)', () => {
    for (const n of [1, 2, 3]) {
      const rows = compareSteps([step('Retry', 1), step('Retry', 2)], Array.from({ length: n }, (_, i) => step('Retry', i + 1)));
      expect(rows.every(r => r.status === 'uncertain' && !(r.before && r.after))).toBe(true);
    }
  });
  it('uses unique content to distinguish repeated action targets', () => {
    const one = step('Retry', 1), two = step('Retry', 2);
    two.effects.push({ type: 'set', path: 'ui.count', value: 2 });
    expect(compareSteps([one, two], [one, two]).map(s => s.match)).toEqual(['content', 'content']);
  });
  it('keys survive changed actions and detect moves without treating all shifted indices as moves', () => {
    const b = [step('Open', 1, 'open'), step('Send', 2, 'send')];
    const a = [step('Different', 1, 'send'), step('Open', 2, 'open')];
    const rows = compareSteps(b, a);
    expect(rows[0]).toMatchObject({ match: 'key', before: { position: 2 }, after: { position: 1 }, reasons: ['action', 'caption', 'order'] });
    expect(rows[1]!.reasons).toContain('order');
    expect(compareSteps(b, [step('Open', 1, 'renamed'), b[1]!]).some(r => r.before?.key === 'open' && r.after)).toBe(false);
  });
  it('names the presentation fields that changed and carries public captions for readers', () => {
    const b = [step('Open', 1, 'open')], a = [structuredClone(b[0]!)];
    a[0]!.caption = 'Open the invite dialog'; a[0]!.explain = 'Now with a preview'; a[0]!.hold = 2000;
    const [row] = compareSteps(b, a);
    expect(row).toMatchObject({ status: 'modified', reasons: ['caption', 'explain', 'timing'], after: { caption: 'Open the invite dialog' } });
    expect(row!.before!.caption).toBe(b[0]!.caption);
    a[0] = { ...structuredClone(b[0]!), caption: 'x'.repeat(400) };
    expect(compareSteps(b, a)[0]!.after!.caption).toHaveLength(300);
  });
  it('lists the visible result values that changed, with before and after side by side', () => {
    const b = [step('Send', 1, 'send')], a = [structuredClone(b[0]!)];
    b[0]!.effects = [{ type: 'set', path: 'ui.status', value: 'Sent' }, { type: 'set', path: 'ui.count', value: 1 }, { type: 'toast', text: 'Done', tone: 'info' }];
    a[0]!.effects = [{ type: 'set', path: 'ui.status', value: 'Draft' }, { type: 'set', path: 'ui.status', value: 'Sending…' }, { type: 'set', path: 'ui.count', value: 1 }, { type: 'set', path: 'data.invite', value: { to: 'lin@example.com' } }, { type: 'complete', text: 'Invitation sent', outcome: 'success' }];
    const [row] = compareSteps(b, a);
    // Last write wins; unchanged values are omitted; a side that does not write the value is null.
    expect(row!.results).toEqual([
      { kind: 'state', label: 'ui.status', before: 'Sent', after: 'Sending…' },
      { kind: 'state', label: 'data.invite', before: null, after: '{"to":"lin@example.com"}' },
      { kind: 'message', label: 'toast', before: 'Done', after: null },
      { kind: 'outcome', label: 'done', before: null, after: 'Invitation sent' },
    ]);
    a[0]!.effects = [{ type: 'set', path: 'ui.status', value: 'y'.repeat(500) }, ...Array.from({ length: 20 }, (_, i) => ({ type: 'set' as const, path: `ui.f${i}`, value: i }))];
    const capped = compareSteps(b, a)[0]!.results!;
    expect(capped).toHaveLength(12);
    expect(capped[0]!.after).toHaveLength(200);
    // Only result changes carry results; caption-only edits do not.
    const c = [structuredClone(b[0]!)]; c[0]!.caption = 'Send now';
    expect(compareSteps(b, c)[0]!.results).toBeUndefined();
  });
  it.each(['initial', 'scene', 'theme', 'roles'] as const)('detects %s changes without changed actions', input => {
    const b = diffProject(), a = structuredClone(b);
    if (input === 'initial') a.scenarios[scenario]!.initial.ui.status = 'Updated';
    if (input === 'scene') a.scenes['/']!.root.props = { text: 'New screen' };
    if (input === 'theme') a.themes.custom = '.stage { color: red }';
    if (input === 'roles') a.features.invite!.roles = [{ name: 'Reviewer', desc: '', color: '#111' }];
    expect(featureDiff(b, a).scenarios[0]!.status).toBe('modified');
  });
  it('returns distinct new, removed, unchanged, incompatible and no-scenario changes', () => {
    const b = diffProject(), a = structuredClone(b);
    a.scenarios['invite.main.new'] = { ...a.scenarios[scenario]!, id: 'invite.main.new', name: 'Batch invite' };
    delete a.scenarios[scenario];
    expect(featureDiff(b, a).scenarios.map(s => s.status)).toEqual(['added', 'removed']);
    expect(featureDiff(b, b).status).toBe('unchanged');
    expect(featureDiff({ schemaVersion: 99 }, a).status).toBe('incompatible');
    a.scenarios = {}; b.scenarios = {}; a.theme = 'clean';
    expect(featureDiff(b, a).status).toBe('changed');
  });
  it('refuses private review/authoring inputs instead of exposing them', () => {
    const b = diffProject();
    expect(() => featureDiff({ ...b, mode: 'review' }, b)).toThrow(/publish/);
    expect(() => featureDiff({ ...b, source: '/private' }, b)).toThrow();
    b.features.invite!.constraints = [{ id: 'secret', text: 'private', hard: true }];
    expect(() => featureDiff(b, b)).toThrow(/Private/);
  });
  it('rebuilding a change position retains effects of every skipped unchanged step', () => {
    const b = diffProject(), a = structuredClone(b);
    for (const p of [b, a]) p.scenarios[scenario]!.steps[0]!.effects = [{ type: 'set', path: 'ui.open', value: true }];
    a.scenarios[scenario]!.steps[2]!.effects = [{ type: 'set', path: 'ui.sent', value: true }];
    const change = featureDiff(b, a).scenarios[0]!.steps.find(s => s.status === 'modified')!;
    expect(stateAt(a, scenario, change.after!.position).ui).toMatchObject({ open: true, sent: true });
  });
  it('key author API rejects missing/overwritten steps', () => {
    expect(() => flow('Bad').key('first')).toThrow();
    expect(() => flow('Bad').system('x').key('first').key('second')).toThrow();
    expect(flow('Good').system('x').key('first').steps[0]!.key).toBe('first');
  });
});

it('compiler preserves legacy ids and keys, rejects duplicate and invalid keys', () => {
  const f = flow('Send').system('Open').key('open').system('Send').key('send');
  const source: AuthoringProject = { root: '.', config: { ...config({ name: 'Keys' }), file: 'joplo.config.ts' }, layouts: {}, routes: { '/': { ...page({ title: 'Keys' }, jsx('ui:Text', {})), file: 'routes/page.tsx' } }, features: { invite: { def: { ...feature({ name: 'Invite', goal: 'Send', cases: {}, pick: 'main' }), file: 'features/invite/feature.ts' }, options: { main: { ...option({ name: 'Email', idea: 'Send', on: { '/': {} }, scenarios: { send: f } }), file: 'features/invite/options/main.tsx' } } } } };
  const good = compile(source, 'publish');
  expect(good.project?.scenarios['invite.main.send']?.steps.map(s => [s.id, s.key])).toEqual([['invite.main.send#1', 'open'], ['invite.main.send#2', 'send']]);
  f.steps[1]!.key = 'open';
  expect(compile(source, 'publish').diagnostics.some(d => d.code === 'STEP_KEY_DUPLICATE')).toBe(true);
  f.steps[1]!.key = 'bad key';
  expect(compile(source, 'publish').diagnostics.some(d => d.code === 'STEP_KEY_INVALID')).toBe(true);
});

it('versioned identity validates shape, real references, key uniqueness, and never mutates legacy IR', async () => {
  const { applyStepIdentity } = await import('../src/step-identity.ts');
  const p = diffProject(), id = 'invite.main.send';
  const metadata = { formatVersion: 1, scenarios: { [id]: { [`${id}#1`]: 'open' } } };
  expect(applyStepIdentity(p, metadata).scenarios[id]!.steps[0]!.key).toBe('open');
  expect(p.scenarios[id]!.steps[0]!.key).toBeUndefined();
  expect(() => applyStepIdentity(p, { ...metadata, formatVersion: 2 })).toThrow();
  expect(() => applyStepIdentity(p, { ...metadata, unexpected: true })).toThrow();
  expect(() => applyStepIdentity(p, { formatVersion: 1, scenarios: { missing: {} } })).toThrow(/missing scenario/);
  expect(() => applyStepIdentity(p, { formatVersion: 1, scenarios: { [id]: { [`${id}#1`]: 'open', [`${id}#2`]: 'open' } } })).toThrow(/unique/);
});

it('treats renamed scenario keys as explicit additions/removals, without guessing a rename', () => {
  const b = diffProject(), a = structuredClone(b), old = a.scenarios['invite.main.send']!;
  delete a.scenarios[old.id]; a.scenarios['invite.main.renamed'] = { ...old, id: 'invite.main.renamed' };
  expect(featureDiff(b, a).scenarios.map(s => [s.status, s.before, s.after])).toEqual([['added', null, 'invite.main.renamed'], ['removed', 'invite.main.send', null]]);
});

it('adopting keys on one side preserves unique legacy semantic matches but not repeated guesses', () => {
  const b = [step('Open', 1), step('Send', 2)];
  const a = [step('Open', 1, 'open'), step('Send', 2, 'send')];
  expect(compareSteps(b, a).map(r => [r.match, r.status])).toEqual([['content', 'unchanged'], ['content', 'unchanged']]);
  a[1]!.effects.push({ type: 'set', path: 'ui.loading', value: true });
  expect(compareSteps(b, a)[1]).toMatchObject({ match: 'action', status: 'modified', reasons: ['effects'] });
  const repeated = compareSteps([step('Retry', 1), step('Retry', 2)], [step('Retry', 1, 'first'), step('Retry', 2, 'second')]);
  expect(repeated.every(r => r.status === 'uncertain' && !(r.before && r.after))).toBe(true);
});
