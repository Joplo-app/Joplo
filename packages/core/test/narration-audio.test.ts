import { expect, it } from 'vitest';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { feature, flow, hold, narrate, say, work, page, type EffectDef } from '@joplo-app/kit';
import { definePlugin, localResource } from '@joplo-app/kit/plugin';
import * as ui from '@joplo-app/plugin-ui';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, spokenLine, stepPlan, nodeResourceIds, pruneMediaAssets, validate, outline, resolveScope, scopeProject, type AuthoringProject, type CompileOptions } from '../src/index.ts';

const audio = 'data:audio/wav;base64,UklGRg==';
const at = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
function source(effects: EffectDef[], other?: EffectDef[]): AuthoringProject {
  const definition = (xs: EffectDef[]) => ({ ...work({ title: 'A', summary: 'A', scenarios: { main: flow('Main', { start: '/' }).system('A very long caption '.repeat(20), ...xs) } }), ...at('features/f/works/a.tsx') });
  const resource = definePlugin({ id: 'line', title: 'Existing lines', runtime: '/runtime', local: '/local', components: {} });
  return { root: '/p', config: { ...config({ name: 'Audio', plugins: [...config({ name: 'T' }).plugins!, resource] }), ...at('joplo.config.ts') }, layouts: {}, routes: { '/': { ...page({ title: 'Home', layout: false }, jsx(ui.Stack, { children: 'Home' })), ...at('routes/page.tsx') } }, features: { f: { def: { ...feature({ name: 'F', goal: 'G', pick: 'a', cases: {} }), ...at('features/f/feature.ts') }, works: { a: definition(effects), ...(other ? { b: definition(other) } : {}) } } } };
}
function build(effects: EffectDef[], opts: CompileOptions = {}) {
  const result = compile(source(effects), 'dev', opts);
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  return result.project!;
}

it('keeps only a controlled selected-audio reference in Step; bytes use mediaAssets', () => {
  const p = build([say('A line', { audio })]);
  const st = p.scenarios['f.a.main']!.steps[0]!;
  expect(st.audio).toMatch(/^joplo-resource:audio-/);
  expect(JSON.stringify(st)).not.toContain('base64');
  expect(p.mediaAssets?.[st.audio!.slice(15)]).toBe(audio);
  expect(spokenLine(st, st.caption, null)).toMatchObject({ text: 'A line', audio: st.audio });
  expect(nodeResourceIds(p).has(st.audio!.slice(15))).toBe(true);
  const captionOnly = { ...st }; delete captionOnly.narrate; delete captionOnly.say;
  expect(spokenLine(captionOnly, 'Fallback text', null).audio).toBe(st.audio);
});

it('narration priority and silence never retain overridden dialogue resources', () => {
  for (const effects of [[say('Actor', { audio }), narrate('Presenter')], [say('Actor', { audio }), narrate(false)]]) {
    const p = build(effects), st = p.scenarios['f.a.main']!.steps[0]!;
    expect(st.audio).toBeUndefined();
    expect(p.mediaAssets).toBeUndefined();
  }
  const r = compile(source([narrate('First', { audio }), narrate('Second')]), 'dev');
  expect(r.diagnostics.some(d => d.code === 'SPEECH_AUDIO_CONFLICT')).toBe(true);
  expect(r.project).toBeNull();
});

it('uses measured duration plus pad once and replaces caption-reading floors', () => {
  const p = build([narrate('A short line', { audio }), hold('voice', { pad: .4 })], { audioDurationFor: () => 600 });
  const st = p.scenarios['f.a.main']!.steps[0]!;
  expect(st.holdFor).toMatchObject({ durationMs: 600, padMs: 400, durationKey: st.audio });
  expect(stepPlan(p, st)).toMatchObject({ dwellMs: 1000, voiceMs: 1000, timingSource: 'measured' });
  expect(stepPlan(p, { ...st, effectHold: 2500 }).dwellMs).toBe(2500);
  expect(stepPlan(p, st, { voiceActive: true }).dwellMs).toBeLessThan(1000);
  expect(validate(p).diagnostics.some(d => d.code === 'AUDIO_TIMING_MEASURED')).toBe(true);
  expect(outline(p).entries[0]!.works[0]!.scenarios[0]!.audioTiming).toEqual({ measured: 1, estimated: 0 });
});

it('marks unavailable durations estimated and keeps legacy numeric hold behavior', () => {
  const p = build([narrate('Hello'), hold('voice', { pad: 0 })]);
  const st = p.scenarios['f.a.main']!.steps[0]!;
  expect(stepPlan(p, st)).toMatchObject({ timingSource: 'estimated', audioMs: 375 });
  expect(stepPlan(p, build([narrate('Hello'), hold(1)]).scenarios['f.a.main']!.steps[0]!).dwellMs).toBeGreaterThan(1000);
});

it('collects hold(audio) localResource refs through existing metadata and prunes other assets', () => {
  const p = build([hold('audio', localResource('line', 'speak', 'private input'), { pad: .2 })], { resourceInfo: { 'resource-0': { durationMs: 700 } } });
  const st = p.scenarios['f.a.main']!.steps[0]!;
  expect(st.holdFor).toMatchObject({ audio: 'joplo-resource:resource-0', durationMs: 700, padMs: 200 });
  expect(JSON.stringify(p)).not.toContain('private input');
  expect(nodeResourceIds(p).has('resource-0')).toBe(true);
  expect(pruneMediaAssets({ ...p, mediaAssets: { 'resource-0': audio, unrelated: 'private bytes' } }).mediaAssets).toEqual({ 'resource-0': audio });
});

it('rejects remote audio and invalid pads rather than fetching or weakening old defaults', () => {
  for (const effect of [narrate('Line', { audio: 'https://example.com/audio.wav' }), hold('voice', { pad: NaN }), hold('voice', { pad: -1 }), hold('voice', { pad: 31 })]) {
    expect(compile(source([effect]), 'dev').project).toBeNull();
  }
});


it('work/scenario scope includes selected narration and hold audio but excludes other work bytes', () => {
  const other = 'data:audio/wav;base64,V0FWRQ==';
  const compiled = compile(source([narrate('Selected', { audio }), hold('audio', audio)], [narrate('Other', { audio: other })]), 'dev');
  expect(compiled.project).not.toBeNull();
  const p = compiled.project!;
  const selected = p.scenarios['f.a.main']!.steps[0]!.audio!.slice(15);
  const otherId = p.scenarios['f.b.main']!.steps[0]!.audio!.slice(15);
  expect(p.mediaAssets?.[otherId]).toBe(other);
  const scoped = scopeProject(p, resolveScope(p, { scenarios: ['f.a.main'] }, 'publish'), 'publish').project;
  expect(scoped.mediaAssets).toEqual({ [selected]: audio });
  expect(nodeResourceIds(scoped).has(otherId)).toBe(false);
});
