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
  fs.writeFileSync(path.join(dir, 'line-local.ts'), `export default {compilers:{wav:{version:'region-1',mime:'audio/wav',inspect:async()=>({durationMs:1000}),compile:()=>({bytes:Uint8Array.from(${JSON.stringify([...wav(1)])}),audio:${JSON.stringify(info)}})}}};`);
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

it('samples video alongside supplied narration and delayed unducked sound across chapters', async () => {
  const dir = fixture();
  fs.symlinkSync(path.resolve('packages/server/node_modules/playwright-core'), path.join(dir, 'node_modules/playwright-core'), 'dir');
  fs.copyFileSync(new URL('./fixtures/numbered-video.mp4', import.meta.url), path.join(dir, 'numbers.mp4'));
  const media = JSON.stringify(path.resolve('plugins/av/src/plugin.ts'));
  fs.writeFileSync(path.join(dir, 'joplo.config.ts'), fixtureConfigSource(`import {config,asset} from '@joplo-app/kit';import {withSoundEffects} from ${media};export default config({name:'Combined media',voice:{profile:'openai'},plugins:[withSoundEffects({cue:asset('./clip.wav')})]});`));
  fs.writeFileSync(path.join(dir, 'works/demo.tsx'), `import {work,chapter,narrate,hold,asset} from '@joplo-app/kit';import {Video,playClip,sfx} from ${media};export default work({title:'Combined media',summary:'One shared clock',pace:{systemLead:.05},stage:<Video id="clip" src={asset('../numbers.mp4')} w={128} h={32}/>,scenarios:{intro:chapter('Intro').system('Long caption '.repeat(30),narrate('Supplied recording',{audio:asset('../clip.wav')}),hold('voice',{pad:.2}),playClip('clip',{from:0,to:.3}),sfx.play('cue',{startDelayMs:200,duck:false})),next:chapter('Next').system('Continue',narrate(false),hold('audio',asset('../clip.wav'),{pad:0}),playClip('clip',{from:.3,to:.6}))}});`);
  const { renderFrames } = await import('../src/film.ts');
  const output = await renderFrames({ projectDir: dir, scenarioId: 'demo.intro', chain: true, voice: 'real', framesOut: path.join(dir, 'frames'), fps: 10, logicalViewport: { width: 256, height: 128 }, crop: '[data-jid="clip"]' });
  const timeline = JSON.parse(fs.readFileSync(output.timeline, 'utf8'));
  const narration = timeline.events.filter((e: any) => e.type === 'narration');
  expect(narration).toHaveLength(1);
  expect(narration[0]).toMatchObject({ provided: true, source: 'clip', durationMs: 600 });
  expect(timeline.mediaEvents).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'play', snapshot: expect.objectContaining({ startDelayMs: 200, duck: false, startEventId: expect.any(String) }) })]));
  expect(new Set(timeline.steps.map((s: any) => s.scenarioId))).toEqual(new Set(['demo.intro', 'demo.next']));
  expect(timeline.assets.map((a: any) => a.kind)).toEqual(expect.arrayContaining(['narration', 'media']));
  expect(timeline.assets.every((a: any) => fs.existsSync(path.resolve(path.dirname(output.timeline), a.file)))).toBe(true);
  expect(JSON.stringify(timeline)).not.toContain('base64');
  expect(output.frames).toBeGreaterThan(10);
  expect(output.durationMs).toBeLessThan(3500);
  const pixels = fs.readdirSync(output.directory).filter(name => name.endsWith('.jpg')).map(name => crypto.createHash('sha256').update(fs.readFileSync(path.join(output.directory, name))).digest('hex'));
  expect(new Set(pixels).size).toBeGreaterThan(3);
}, 120000);


it('mixed cached TTS plus missing provided audio reports failure with zero billable work and no fallback', async () => {
  const dir=fixture(false), project=(await checkWithProject(dir)).project!;
  const store=new ProfileStore(dir,{});store.upsert('openai',{},'offline-test-key');
  const cache=new VoiceCache(dir),resolved=resolveVoices(project.voiceConfig,cache.selection(),store);
  const step=project.scenarios['demo.intro']!.steps[0]!;
  const seg={stepId:step.id,text:step.narrate!,role:null}, plan=cache.plan(seg,resolved)!;
  const bytes=wav(.6),file=`${crypto.createHash('sha256').update(bytes).digest('hex')}.wav`;
  cache.adopt(plan.key,file,bytes,{stepId:step.id,fp:plan.fp,text:seg.text,locale:'und'});
  project.scenarios['demo.intro']!.steps.push({...step,id:'demo.intro#2',narrate:'Missing provided',audio:'joplo-resource:missing'});
  const fetch=vi.fn(()=>{throw new Error('No provider fallback');});
  for(const dryRun of [false,true]){
    const result=await generateProjectVoice({projectDir:dir,home:dir,project,dryRun,fetch});
    expect(result.total).toMatchObject({missing:0,chars:0,generated:0,failed:1});
    expect(result.locales[0]!.failed).toEqual([{stepId:'demo.intro#2',message:expect.stringContaining('no voice provider')}]);
    expect(result.locales[0]!.details!.find(d=>d.stepId==='demo.intro#2')).toMatchObject({audio:'provided',missing:true,chars:0,estimatedBillableChars:0});
  }
  expect(fetch).not.toHaveBeenCalled();
});

it.skipIf(process.env.JOPLO_EXPORT_VIDEO !== '1')('explicit-only real video without BGM records an audio track', async () => {
  const dir=fixture();
  fs.symlinkSync(path.resolve('packages/server/node_modules/playwright-core'),path.join(dir,'node_modules/playwright-core'),'dir');
  const {renderVideo}=await import('../src/film.ts');
  const out=path.join(dir,'provided-only.webm');
  const result=await renderVideo({projectDir:dir,scenarioId:'demo.intro',out,voice:'real',logicalViewport:{width:160,height:90},width:160,height:90});
  expect(result.voice.missing).toEqual([]);
  const {Input,ALL_FORMATS,BufferSource}=await import('mediabunny');
  const input=new Input({formats:ALL_FORMATS,source:new BufferSource(fs.readFileSync(out))});
  try {const audio=await input.getPrimaryAudioTrack();expect(audio).not.toBeNull();expect(await audio!.computeDuration()).toBeGreaterThan(.5);}
  finally {input.dispose();}
},120000);
