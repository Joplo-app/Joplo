import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { encodeMusic } from '../../../plugins/alda/src/mp3.ts';
import { clipKey } from '@joplo-app/core';
import { renderFrames, renderStep, renderFilm, renderVideo } from '../src/index.ts';
import { frameTime, playbackTimeline } from '../src/timeline.ts';
import { ProfileStore, VoiceCache, resolveVoices } from '../src/voice.ts';
import { installFixturePlugins, fixtureConfigSource } from '../../../scripts/test/fixtures.ts';

// Controlled benchmark only: switch just screenshot transport, keeping geometry/quality/clock equal.
vi.mock('../src/capture.ts',async importOriginal=>{
  const actual=await importOriginal<typeof import('../src/capture.ts')>();
  if(process.env.JOPLO_CAPTURE_BASELINE!=='1')return actual;
  return {...actual,capture:async(page:any,root:string,_crop:unknown,type='png',quality?:number)=>{await page.locator(root).boundingBox();return page.locator(root).screenshot({type,...(quality?{quality}:{})});}};
});

/** CC0 synthetic PCM. Different durations/frequencies make omissions and drift observable offline. */
function wav(seconds: number, hz: number) {
  const rate = 16000, count = Math.round(rate * seconds), b = Buffer.alloc(44 + count * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) b.writeInt16LE(Math.round(Math.sin(i * hz * Math.PI * 2 / rate) * 6000), 44 + i * 2);
  return b;
}
it('30fps accumulates rounded targets without fractional runFor drift', () => {
  expect(frameTime(18000, 30)).toBe(600000);
  expect([1, 2, 3].map(i => frameTime(i, 30))).toEqual([33, 67, 100]);
});
it('timeline uses actual observed commits, preserves generic media fields and output offsets', () => {
  const raw = { schemaVersion: 1 as const, startedAt: 100, events: [
    { at: 100, engineMs: 0, scenarioId: 'a', position: 0 },
    { at: 200, engineMs: 100, scenarioId: 'a', stepId: 'a#1', position: 1, media: { sfx: { endAfterMs: 200 } } },
    { at: 450, engineMs: 350, scenarioId: 'b', position: 0 },
  ] };
  const t = playbackTimeline(raw, 90);
  expect(t.steps[0]).toMatchObject({ commitMs: 100, endMs: 350, outputCommitMs: 110, media: { sfx: { endAfterMs: 200 } } });
  expect(t.chapters.map(c => c.scenarioId)).toEqual(['a', 'b']);
});

describe('offline export fixture: two orientations, continuing chapters, three cached real-duration clips', () => {
  const root = path.resolve(`scratch/output/export-contract-fixture-${process.pid}`);
  beforeAll(async () => {
    fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
    const write = (name: string, value: string) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
    installFixturePlugins(root);
    fs.symlinkSync(path.resolve('packages/server/node_modules/playwright-core'), path.join(root, 'node_modules/playwright-core'), 'dir');
    write('audio-runtime.ts', "import {defineRuntime} from '@joplo-app/kit/plugin'; export default defineRuntime({id:'fixture-audio',components:{}});");
    write('audio-local.ts', "export default {compilers:{wav:{version:'cc0-calibrated-mp3-1',mime:'audio/mpeg',compile(input){const data=JSON.parse(input);return {bytes:new Uint8Array(Buffer.from(data.bytes,'base64')),audio:data.audio};}}}};");
    const n=44100*2,pcm=Float32Array.from({length:n},(_,i)=>Math.sin(i*220*Math.PI*2/44100)*.18);
    const encoded=await encodeMusic([pcm,pcm],n,true);
    const music=JSON.stringify({bytes:Buffer.from(encoded.bytes).toString('base64'),audio:encoded.audio});
    write('joplo.config.ts', fixtureConfigSource(`import {config} from '@joplo-app/kit'; import {definePlugin} from '@joplo-app/kit/plugin'; const audio=definePlugin({id:'fixture-audio',title:'CC0 synthetic music',components:{},runtime:new URL('./audio-runtime.ts',import.meta.url),local:new URL('./audio-local.ts',import.meta.url),compile:{effect(e,ctx){if(e.name==='stop')return {media:[{track:'bgm',action:'stop',fadeMs:400}]};return {media:[{track:'bgm',action:'play',resource:ctx.resource({compiler:'wav',input:${JSON.stringify(music)}}),loop:true,volume:.3,fadeMs:100}]};}}}); export default config({name:'Offline export',home:'/',plugins:[audio]});`));
    write('routes/page.tsx', `import {$,page} from '@joplo-app/kit'; import {Box} from '@joplo-app/plugin-ui'; export default page({title:'Geometry',layout:false},<Box id="frame" style={{width:'100%',height:'100%',background:'#cc3355'}}><Box id="signal">{$.ui.signal}</Box></Box>);`);
    write('features/export/feature.ts', "import {feature} from '@joplo-app/kit'; export default feature({name:'Export',goal:'Offline regression',cases:{},pick:'a'});");
    write('features/export/works/a.tsx', `import {$,work,chapter,set,narrate,hold} from '@joplo-app/kit'; import {pluginEffect} from '@joplo-app/kit/plugin'; export default work({title:'Offline',summary:'Three signals',state:{ui:{signal:'start'}},scenarios:{one:chapter('First',{start:'/'}).system('one','First signal',set($.ui.signal,'one'),narrate('Signal one'),pluginEffect('fixture-audio','play',{}),hold(0.5)).system('two','Second signal',set($.ui.signal,'two'),narrate('Signal two'),hold(0.5)),two:chapter('Second').system('three','Third signal',set($.ui.signal,'three'),narrate('Signal three'),pluginEffect('fixture-audio','stop',{}),hold(0.5))}});`);
    const store = new ProfileStore(process.env.JOPLO_HOME!, {}); store.upsert('openai', {}, 'offline-unused-key');
    const cache = new VoiceCache(root); cache.select('openai');
    const fp = resolveVoices(undefined, 'openai', store).voices.narrator!;
    ['Signal one', 'Signal two', 'Signal three'].forEach((text, i) => { const bytes = wav([0.35, 0.55, 0.75][i]!, 440 + i * 220); const file = `${crypto.createHash('sha256').update(bytes).digest('hex')}.wav`; expect(cache.adopt(clipKey(fp, text), file, bytes, { stepId: `export.a.${i < 2 ? 'one' : 'two'}#${i < 2 ? i + 1 : 1}`, fp, text, locale: 'en' })).toBe(true); });
  });
  it('reuses chapter checkpoints, rejects changed inputs, and concurrent exports complete successfully', async () => {
    const common = { projectDir: root, scenarioId: 'export.a.one', chain: true, sampleMs: 100, every: 1000, logicalViewport: { width: 160, height: 90 } };
    const checkpoint = path.join(root, 'checkpoint.json');
    const first = await renderFilm({ ...common, out: path.join(root, 'resume.png'), checkpoint });
    const resumed = await renderFilm({ ...common, out: path.join(root, 'resume.png'), checkpoint, resume: true, overwrite: true });
    expect(resumed.measurement!.resumedSamples).toBeGreaterThan(1);
    expect(Math.abs(resumed.durationMs - first.durationMs)).toBeLessThanOrEqual(100);
    expect(resumed.cuts).toEqual(first.cuts);
    const shifted=JSON.parse(fs.readFileSync(checkpoint,'utf8'));
    shifted.commits=shifted.commits.map((c: any)=>({...c,commitMs:c.commitMs+16}));
    fs.writeFileSync(checkpoint,JSON.stringify(shifted));
    const again=await renderFilm({...common,out:path.join(root,'resume.png'),checkpoint,resume:true,overwrite:true});
    expect(again.measurement!.resumedSamples).toBeGreaterThan(1);
    expect(again.cuts).toEqual(first.cuts);
    await expect(renderFilm({ ...common, sampleMs: 250, out: path.join(root, 'changed.png'), checkpoint, resume: true })).rejects.toThrow('Checkpoint source');
    const concurrent = await Promise.all([1, 2].map(i => renderFilm({ ...common, out: path.join(root, `concurrent-${i}.png`) })));
    expect(concurrent.every(r => r.files.length === 2)).toBe(true);
  }, 120000);
  it('film layout audit uses the existing capture clock and JPEG evidence at actual commits', async()=>{
    const out=path.join(root,'audited.png'),timelineFile=path.join(root,'audited-timeline.json');
    const result=await renderFilm({projectDir:root,scenarioId:'export.a.one',out,voice:'off',sampleMs:50,every:250,logicalViewport:{width:160,height:90},timeline:timelineFile,auditLayout:{content:{x:0,y:0,width:5,height:5},important:['[data-jid="signal"]']}});
    expect(result.audit).toBeDefined();
    const audit=JSON.parse(fs.readFileSync(result.audit!.path,'utf8')),timeline=JSON.parse(fs.readFileSync(timelineFile,'utf8'));
    expect(audit.sampleToleranceMs).toBe(50);
    for(const step of timeline.steps){const sample=audit.samples.find((s:any)=>s.stepId===step.stepId&&s.phases.includes('post-commit'));expect(sample).toBeDefined();expect(Math.abs(sample.atMs-step.commitMs)).toBeLessThanOrEqual(50);}
    expect(audit.samples.some((s:any)=>s.findings.some((f:any)=>f.code==='TEXT_OUTSIDE_CONTENT'))).toBe(true);
    expect(audit.samples.filter((s:any)=>s.evidence).every((s:any)=>fs.existsSync(s.evidence))).toBe(true);
  },120000);
  it.skipIf(process.env.JOPLO_EXPORT_VIDEO !== '1')('captures all real-duration narration in portrait and landscape videos with measured sync', async () => {
    for (const [width, height, ext] of [[180, 320, 'webm'], [320, 180, 'mp4']] as const) {
      const file = path.join(root, `video-${width}.${ext}`), timelineFile = path.join(root, `video-${width}.json`);
      const result = await renderVideo({ projectDir: root, scenarioId: 'export.a.one', chain: true, out: file, width, height, logicalViewport: { width, height }, noFrame: true, hide: ['cover','cursor','title','subtitles'], timeline: timelineFile });
      expect(result.voice.missing).toEqual([]); expect(result.sync).toBeDefined();
      const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_streams','-of','json',file], { encoding: 'utf8' }));
      const video = probe.streams.find((s: any) => s.codec_type === 'video');
      expect([video.width, video.height]).toEqual([width, height]);
      expect(probe.streams.some((s: any) => s.codec_type === 'audio')).toBe(true);
      if (ext === 'mp4') { expect(video.codec_name).toBe('h264'); expect(probe.streams.find((s: any) => s.codec_type === 'audio').codec_name).toBe('aac'); }
      const timeline = JSON.parse(fs.readFileSync(timelineFile, 'utf8'));
      const narration = timeline.events.filter((e: any) => e.type === 'narration');
      expect(narration.map((e: any) => Math.round(e.durationMs))).toEqual([350,550,750]);
      const pcm = execFileSync('ffmpeg', ['-v','error','-i',file,'-vn','-ac','1','-ar','16000','-f','f32le','pipe:1']);
      const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
      const toneEnergy = (atMs: number, hz: number) => { let sin = 0, cos = 0; const start = Math.round(atMs * 16), n = 1600; for (let i = 0; i < n && start + i < samples.length; i++) { const phase = i * hz * Math.PI * 2 / 16000; sin += samples[start + i]! * Math.sin(phase); cos += samples[start + i]! * Math.cos(phase); } return Math.hypot(sin, cos) / n; };
      const beforeFade = toneEnergy(narration[1].outputMs + 100, 220);
      const afterFade = toneEnergy(narration[2].outputMs + 600, 220);
      expect(beforeFade).toBeGreaterThan(0.002);
      expect(afterFade).toBeLessThan(beforeFade / 3);
      const offsets: number[] = [];
      for (let k = 0; k < narration.length; k++) {
        const hz = 440 + k * 220, size = 160;
        let detected: number | null = null;
        for (let start = 0; start + size < samples.length; start += size) {
          let sin = 0, cos = 0;
          for (let i = 0; i < size; i++) { const phase = i * hz * Math.PI * 2 / 16000; sin += samples[start + i]! * Math.sin(phase); cos += samples[start + i]! * Math.cos(phase); }
          if (Math.hypot(sin, cos) / size > 0.04) { detected = start / 16; break; }
        }
        expect(detected).not.toBeNull();
        const offset = detected! - narration[k].outputMs; offsets.push(offset);
        expect(Math.abs(offset)).toBeLessThanOrEqual(80);
      }
      fs.writeFileSync(path.join(root, `audio-sync-${width}.json`), JSON.stringify({ offsets, sync: result.sync }, null, 2));
    }
  }, 180000);
  it.skipIf(process.env.JOPLO_EXPORT_COMPARE !== '1')('measures a representative short export at the same 50ms interval', async () => {
    const result=await renderFilm({projectDir:root,scenarioId:'export.a.one',out:path.join(root,'compare.png'),voice:'off',sampleMs:50,every:250,logicalViewport:{width:160,height:90}});
    fs.writeFileSync(path.join(root,'compare-report.json'),JSON.stringify(result,null,2));
    expect(result.sampleMs).toBe(50);
  },120000);
  it.skipIf(process.env.JOPLO_EXPORT_VIDEO !== '1')('supports an explicit entirely silent video', async () => {
    const out = path.join(root, 'silent.webm');
    await renderVideo({ projectDir: root, scenarioId: 'export.a.one', out, audio: false, width: 160, height: 90 });
    const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_streams','-of','json',out], { encoding: 'utf8' }));
    expect(probe.streams.some((s: any) => s.codec_type === 'audio')).toBe(false);
  }, 120000);
  it.skipIf(process.env.JOPLO_EXPORT_VIDEO !== '1')('preserves an existing MP4 when the encoder leaves a partial temporary file then fails', async () => {
    const out=path.join(root,'previous.mp4'),bin=path.join(root,'fake-encoder');fs.mkdirSync(bin);fs.writeFileSync(out,'previous complete result');
    fs.writeFileSync(path.join(bin,'ffmpeg'),'#!/bin/sh\nfor destination do :; done\nprintf partial > "$destination"\nprintf "fixture encoder failure" >&2\nexit 9\n',{mode:0o755});
    const previousPath=process.env.PATH;process.env.PATH=bin;
    try {await expect(renderVideo({projectDir:root,scenarioId:'export.a.one',out,overwrite:true,audio:false,width:160,height:90})).rejects.toThrow('fixture encoder failure');}
    finally {process.env.PATH=previousPath;}
    expect(fs.readFileSync(out,'utf8')).toBe('previous complete result');
    expect(fs.readdirSync(root).some(n=>n.startsWith('.joplo-video-'))).toBe(false);
  },120000);
  it.skipIf(process.env.JOPLO_EXPORT_LONG !== '1')('measures a five-minute engine chain without real-time waiting', async () => {
    const file = path.join(root, 'features/export/works/long.tsx');
    const steps = Array.from({ length: 5 }, (_, i) => `.system('event${i}', 'signal ${i}', set($.ui.signal,'${i}'), hold(30))`).join('');
    fs.writeFileSync(file, `import {$,work,chapter,set,hold} from '@joplo-app/kit'; export default work({title:'Long',summary:'Benchmark',state:{ui:{signal:'start'}},scenarios:{one:chapter('First half',{start:'/'})${steps},two:chapter('Second half')${steps}}});`);
    const result = await renderFilm({ projectDir: root, scenarioId: 'export.long.one', chain: true, out: path.join(root, 'benchmark.png'), voice: 'off', chapterTimeoutMs: 360000, sampleMs: 250, every: 30000, logicalViewport: { width: 160, height: 90 }, checkpoint: path.join(root, 'benchmark-checkpoint.json') });
    expect(result.durationMs).toBeGreaterThanOrEqual(300000);
    fs.writeFileSync(path.join(root, 'benchmark-report.json'), JSON.stringify(result, null, 2));
    if(process.env.JOPLO_EXPORT_MAX_WALL_MS)expect(result.measurement!.wallMs).toBeLessThan(Number(process.env.JOPLO_EXPORT_MAX_WALL_MS));
  }, 360000);
  afterAll(() => { /* Preserve evidence under scratch/output for debugging. */ });
  it('logical viewport and crop produce the requested real pixels', async () => {
    for (const [width, height] of [[360, 640], [640, 360]]) {
      const file = path.join(root, `${width}.png`);
      await renderStep({ projectDir: root, scenarioId: 'export.a.one', out: file, logicalViewport: { width, height }, noFrame: true, crop: '[data-jid="frame"]' });
      const png = fs.readFileSync(file); expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([width, height]);
    }
  }, 120000);
  it('public frame export records actual clip durations and both chapters without paid TTS', async () => {
    const result = await renderFrames({ projectDir: root, scenarioId: 'export.a.one', chain: true, out: path.join(root, 'ignored.png'), framesOut: path.join(root, 'frames'), fps: 10, logicalViewport: { width: 180, height: 320 }, noFrame: true });
    const timeline = JSON.parse(fs.readFileSync(result.timeline, 'utf8'));
    expect(timeline.chapters.map((c: any) => c.scenarioId)).toEqual(['export.a.one', 'export.a.two']);
    expect(timeline.steps).toHaveLength(3);
    expect(timeline.steps[0].endMs).toBeLessThan(timeline.steps[1].commitMs);
    const tracks = timeline.steps.map((s: any) => Object.values(s.media) as any[]);
    expect(tracks[0][0].resource).toBe(tracks[1][0].resource);
    expect(tracks[2][0].stopAfterMs).toBe(400);
    expect(timeline.mediaEvents.map((e: any) => e.action)).toEqual(['play','stop']);
    expect(timeline.assets.filter((a: any) => a.kind === 'narration')).toHaveLength(3);
    const music=timeline.assets.find((a: any)=>a.kind==='media');
    expect(music.audioInfo.cycleFrames).toBe(64000);
    expect(music.audioInfo.contentStartFrame).toBeGreaterThan(6080);
    expect(music.audioInfo.sourceSampleRate).toBe(32000);
    expect(music.file.endsWith('.mp3')).toBe(true);
    expect(timeline.assets.every((a: any) => fs.existsSync(path.join(path.dirname(result.timeline), a.file)))).toBe(true);
    expect(timeline.events.some((e: any) => e.scenarioId === 'export.a.two' && e.position === 0 && Object.keys(e.media ?? {}).length)).toBe(true);
    const narration = timeline.events.filter((e: any) => e.type === 'narration');
    expect(narration.map((e: any) => Math.round(e.durationMs))).toEqual([350, 550, 750]);
    expect(narration.every((e: any) => e.source === 'clip' && e.endAt >= e.at && e.outputEndMs >= e.outputMs)).toBe(true);
    expect(result.frames).toBeGreaterThan(20);
    const repeat = await renderFrames({ projectDir: root, scenarioId: 'export.a.one', chain: true, framesOut: path.join(root, 'frames-repeat'), fps: 10, logicalViewport: { width: 180, height: 320 }, noFrame: true });
    const repeated = JSON.parse(fs.readFileSync(repeat.timeline, 'utf8'));
    expect(repeated.steps.map((s: any, i: number) => Math.abs(s.commitMs - timeline.steps[i].commitMs)).every((n: number) => n <= 50)).toBe(true);
  }, 120000);
});
