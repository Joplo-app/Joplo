import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { fixtureConfigSource, installFixturePlugins } from '../../../scripts/test/fixtures.ts';
import { checkWithProject } from '../../cli/src/check.ts';
import { generateProjectVoice } from '../src/voice-run.ts';
import { audioDuration, readAudioTiming } from '../src/audio-timing.ts';
import { ProfileStore, VoiceCache, resolveVoices } from '../src/voice.ts';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
function wav(seconds: number) {
  const count = Math.round(seconds * 8000), b = Buffer.alloc(44 + count * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(count * 2, 40);
  for (let i=0;i<count;i++) b.writeInt16LE(Math.round(Math.sin(i * 440 * Math.PI * 2 / 8000) * 5000),44+i*2);
  return b;
}
function fixture(provided = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-narration-audio-')); dirs.push(dir);
  installFixturePlugins(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{"compilerOptions":{"jsx":"react-jsxdev","jsxImportSource":"@joplo-app/kit"}}');
  fs.writeFileSync(path.join(dir, 'clip.wav'), wav(.6));
  fs.writeFileSync(path.join(dir, 'joplo.config.ts'), fixtureConfigSource(`import {config} from '@joplo-app/kit'; export default config({name:'Provided audio',voice:{profile:'openai'}});`));
  fs.mkdirSync(path.join(dir, 'works'));
  fs.writeFileSync(path.join(dir, 'works/demo.tsx'), `import {work,chapter,narrate,hold,asset} from '@joplo-app/kit'; export default work({title:'Prepared audio',summary:'Existing recorded line',stage:<div>Stage</div>,scenarios:{intro:chapter('Intro').system('Long caption '.repeat(30),narrate('Existing line'${provided ? ",{audio:asset('../clip.wav')}" : ''}),hold('voice',{pad:.4}))}});`);
  return dir;
}

it('reads actual WAV duration and check uses it without provider calls', async () => {
  expect(await audioDuration(wav(.6))).toBeCloseTo(600, 3);
  const dir = fixture();
  const report = await checkWithProject(dir);
  expect(report.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const step = report.project!.scenarios['demo.intro']!.steps[0]!;
  expect(step.holdFor).toMatchObject({ kind: 'voice', durationMs: 600, padMs: 400, durationKey: step.audio });
  expect(report.diagnostics.some(d => d.code === 'AUDIO_TIMING_MEASURED')).toBe(true);
  expect(JSON.stringify(step)).not.toContain(dir);
  const fetch = vi.fn(() => { throw new Error('Must not synthesize'); });
  const status = vi.fn(() => { throw new Error('Must not need Cloud'); });
  const result = await generateProjectVoice({ projectDir: dir, project: report.project!, fetch, cloud: { status } as any });
  expect(result.total).toMatchObject({ chars: 0, missing: 0, generated: 0 });
  expect(result.locales[0]!.details?.[0]).toMatchObject({ audio: 'provided', chars: 0, estimatedBillableChars: 0 });
  expect(fetch).not.toHaveBeenCalled(); expect(status).not.toHaveBeenCalled();
});

it('binds cached measured timing to the selected clip and drops it for changed text or voice', async () => {
  const dir = fixture(false), report = await checkWithProject(dir);
  expect(report.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const project = report.project!;
  const store = new ProfileStore(process.env.JOPLO_HOME!), cache = new VoiceCache(dir);
  const resolved = resolveVoices(project.voiceConfig, cache.selection(), store);
  const seg = { stepId: 'demo.intro#1', text: 'Existing line', role: null };
  const plan = cache.plan(seg, resolved)!;
  const bytes = wav(1.2), file = `${crypto.createHash('sha256').update(bytes).digest('hex')}.wav`;
  expect(cache.adopt(plan.key, file, bytes, { stepId: seg.stepId, fp: plan.fp, text: seg.text, locale: 'und' })).toBe(true);
  const timing = await readAudioTiming(dir, project);
  expect(timing.voiceDurationFor(seg.stepId)).toMatchObject({ durationMs: 1200, key: expect.stringContaining(plan.key) });
  const changed = structuredClone(project); changed.scenarios['demo.intro']!.steps[0]!.narrate = 'Changed line';
  expect((await readAudioTiming(dir, changed)).voiceDurationFor(seg.stepId)).toBeUndefined();
  const otherVoice = structuredClone(project); otherVoice.voiceConfig = { profile: 'openai', narrator: 'echo' };
  expect((await readAudioTiming(dir, otherVoice)).voiceDurationFor(seg.stepId)).toBeUndefined();
  const otherLocale = structuredClone(project); otherLocale.i18n = { default: 'fr', locales: ['fr'], messages: {} };
  expect((await readAudioTiming(dir, otherLocale)).voiceDurationFor(seg.stepId)).toBeUndefined();
  const badFetch = vi.fn(() => { throw new Error('Must not synthesize explicit audio'); });
  await expect(cache.generateOne({ ...seg, audio: 'joplo-resource:resource-0' }, 'en', resolved, store, { fetch: badFetch })).rejects.toThrow(/existing audio/);
  expect(badFetch).not.toHaveBeenCalled();
});

it('real browser film reuses supplied narration/dialogue on the recorded timeline with measured dwell', async () => {
  const dir = fixture();
  fs.symlinkSync(path.resolve('packages/server/node_modules/playwright-core'), path.join(dir, 'node_modules/playwright-core'), 'dir');
  const source = path.join(dir, 'works/demo.tsx');
  fs.writeFileSync(source, `import {work,chapter,narrate,say,hold,asset,role} from '@joplo-app/kit'; export default work({title:'Recorded lines',summary:'Existing audio only',roles:{actor:role('Actor')},pace:{systemLead:0},stage:<div>Recorded stage</div>,scenarios:{intro:chapter('Intro').system('Long caption '.repeat(30),narrate('Existing narrator',{audio:asset('../clip.wav')}),hold('voice',{pad:.1})).system('Actor line',say('Actor text',{role:'actor',audio:asset('../clip.wav')}),hold('voice',{pad:0})).system('Measured audio hold',narrate(false),hold('audio',asset('../clip.wav'),{pad:0}))}});`);
  const { renderFilm } = await import('../src/film.ts');
  const timelineFile = path.join(dir, 'timeline.json');
  const result = await renderFilm({ projectDir: dir, scenarioId: 'demo.intro', out: path.join(dir, 'film.png'), voice: 'real', timeline: timelineFile, sampleMs: 50, every: 500, logicalViewport: { width: 160, height: 90 } });
  const timeline = JSON.parse(fs.readFileSync(timelineFile, 'utf8'));
  const lines = timeline.events.filter((e: any) => e.type === 'narration');
  expect(lines).toHaveLength(2);
  expect(lines.map((e: any) => e.role)).toEqual([null, 'actor']);
  expect(lines.every((e: any) => e.source === 'clip' && e.provided && Math.abs(e.durationMs - 600) < 1)).toBe(true);
  expect(timeline.assets.filter((a: any) => a.kind === 'narration').length).toBeGreaterThan(0);
  expect(timeline.assets.every((a: any) => fs.existsSync(path.join(dir, a.file)))).toBe(true);
  expect(JSON.stringify(timeline)).not.toContain('base64');
  // Film intentionally includes a 1s final-state tail; assert actual commit gaps, not the sheet tail.
  expect(Math.abs(timeline.steps[1].commitMs - timeline.steps[0].commitMs - 700)).toBeLessThanOrEqual(100);
  expect(Math.abs(timeline.steps[2].commitMs - timeline.steps[1].commitMs - 600)).toBeLessThanOrEqual(100);
  expect(result.durationMs - 1000).toBeGreaterThanOrEqual(1800);
  expect(result.durationMs - 1000).toBeLessThan(2300);
}, 120000);

it('localResource guards stay outside recorded narration, measured hold and offline timeline AudioRegion', async () => {
  const dir = fixture();
  fs.symlinkSync(path.resolve('packages/server/node_modules/playwright-core'), path.join(dir, 'node_modules/playwright-core'), 'dir');
  const info = { sourceSampleRate: 8000, decodedFrames: 8000, contentStartFrame: 1600, contentFrames: 3200, cycleFrames: 3200, encoderDelayFrames: 0, paddingFrames: 3200, channels: 1 };
  fs.writeFileSync(path.join(dir, 'line-runtime.ts'), "import {defineRuntime} from '@joplo-app/kit/plugin';export default defineRuntime({id:'line',components:{}});");
  fs.writeFileSync(path.join(dir, 'line-local.ts'), `export default {compilers:{wav:{version:'region-1',mime:'audio/wav',inspect:async()=>({durationMs:400}),compile:()=>({bytes:Uint8Array.from(${JSON.stringify([...wav(1)])}),audio:${JSON.stringify(info)}})}}};`);
  fs.writeFileSync(path.join(dir, 'joplo.config.ts'), fixtureConfigSource("import {config} from '@joplo-app/kit'; import {definePlugin} from '@joplo-app/kit/plugin'; const line=definePlugin({id:'line',title:'Existing line',runtime:new URL('./line-runtime.ts',import.meta.url),local:new URL('./line-local.ts',import.meta.url),components:{}});export default config({name:'Region',plugins:[line]});"));
  fs.writeFileSync(path.join(dir, 'works/demo.tsx'), "import {work,chapter,say,hold,role} from '@joplo-app/kit';import {localResource} from '@joplo-app/kit/plugin';export default work({title:'Region',summary:'No guards',roles:{actor:role('Actor')},pace:{systemLead:0},stage:<div>Region</div>,scenarios:{intro:chapter('Intro').system('Existing actor',say('Actor text',{role:'actor',audio:localResource('line','wav','prepared')}),hold('voice',{pad:0}))}});");
  const { renderFilm } = await import('../src/film.ts');
  const file = path.join(dir, 'region-timeline.json');
  const result = await renderFilm({ projectDir: dir, scenarioId: 'demo.intro', out: path.join(dir, 'region.png'), voice: 'real', timeline: file, sampleMs: 50, every: 500, logicalViewport: { width: 160, height: 90 } });
  const timeline = JSON.parse(fs.readFileSync(file, 'utf8'));
  const event = timeline.events.find((e: any) => e.type === 'narration');
  expect(event).toMatchObject({ role: 'actor', provided: true, source: 'clip', audioInfo: info });
  expect(event.durationMs).toBeCloseTo(400, 1);
  expect(Math.abs(event.engineEndMs - event.engineMs - 400)).toBeLessThanOrEqual(50);
  expect(result.durationMs - 1000).toBeLessThan(600);
  expect(timeline.assets.find((a: any) => a.kind === 'narration')).toMatchObject({ audioInfo: info });
  expect(JSON.stringify(timeline)).not.toContain('base64');
}, 120000);
