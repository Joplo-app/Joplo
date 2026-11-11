import { prepareRegion } from '../src/runtime/audio-media';
import { afterEach, expect, it, vi } from 'vitest';
import { compile } from '@joplo-app/core';
import { reviewSource } from '../../core/test/fixtures/review.ts';
import { DemoController } from '../src/runtime/demo';
import { Narrator } from '../src/runtime/voice';
import { RecordVoice } from '../src/runtime/record-voice';
import { estimatedNarrator } from '../src/RenderApp';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('explicit missing audio and prefetch cannot fall through to ensure/provider', async () => {
  const narrator = new Narrator(); narrator.enabled = true;
  narrator.ensure = vi.fn(() => { throw new Error('Provider must not be called'); });
  const n = narrator.speak('Line', null, 1, '')!;
  await n.done;
  expect(n.failure?.()).toContain('resource is missing');
  narrator.prefetch('Line', null, 'joplo-resource:resource-0');
  expect(narrator.ensure).not.toHaveBeenCalled();
});

it('explicit decoded dialogue uses the recording narrator output and never browser/TTS fallback', async () => {
  const sources: any[] = [], connected: unknown[] = [];
  const audio: any = { currentTime: 0, createBufferSource: () => { const s = { buffer: null, playbackRate: { value: 1 }, start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null }; sources.push(s); return s; } };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
  const fallback = estimatedNarrator(); fallback.speak = vi.fn(() => null);
  const voice = new RecordVoice({ output: () => ({ audio, connect: n => connected.push(n) }), decode: async () => ({ duration: .6 } as AudioBuffer), provided: (_url, info) => { const buffer = { duration: .6 } as AudioBuffer; return { value: Promise.resolve({ buffer, region: prepareRegion(buffer, info), info }), release() {} }; }, fallback });
  await voice.prepare(null, [{ text: 'Actor line', role: 'actor', audio: 'data:audio/wav;base64,fixture' }]);
  const n = voice.narrator.speak('Actor line', 'actor', 2, 'data:audio/wav;base64,fixture')!;
  await Promise.resolve();
  expect(n.source).toBe('clip'); expect(connected).toHaveLength(1); expect(sources[0].playbackRate.value).toBe(2);
  expect(voice.describe('Actor line', 'actor', 'data:audio/wav;base64,fixture')).toMatchObject({ durationMs: 600, source: 'clip' });
  sources[0].onended(); await n.done;
  const missing = voice.narrator.speak('Missing', 'actor', 1, 'missing-asset')!;
  await missing.done; expect(missing.failure?.()).toContain('no voice provider');
  expect(fallback.speak).not.toHaveBeenCalled();
});

it('short actual voice plus pad controls dwell despite long caption, without a second estimate or breath', async () => {
  const project = compile(reviewSource(), 'dev').project!;
  const sc = project.scenarios['f.a.main']!;
  sc.steps = [sc.steps[0]!];
  const st = sc.steps[0]!;
  st.kind = 'system'; st.action = { type: 'event', name: 'Speak' }; st.systemLead = 0;
  st.caption = 'A long caption '.repeat(50); st.narrate = 'A long narration '.repeat(30);
  st.audio = 'joplo-resource:audio-test'; project.mediaAssets = { 'audio-test': 'data:audio/wav;base64,fixture' };
  st.holdFor = { kind: 'voice', padMs: 100, durationMs: 400, durationKey: st.audio };
  const narrator = new Narrator(); narrator.enabled = true;
  const calls: unknown[] = [];
  narrator.speak = (text, role, speed, audio) => { calls.push({ text, role, audio }); let timer: ReturnType<typeof setTimeout>; const done = new Promise<void>(r => { timer = setTimeout(r, 400 / speed); }); return { source: 'clip', done, pause() {}, resume() {}, cancel() { clearTimeout(timer); } }; };
  const ctl = new DemoController(null); ctl.setProject(project, 1, null); ctl.setScenario(sc.id, 0, { quiet: true }); ctl.narrator = narrator;
  const start = performance.now();
  try {
    await ctl.play();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(480);
    expect(elapsed).toBeLessThan(900);
    expect(calls).toEqual([{ text: st.narrate.trim(), role: null, audio: project.mediaAssets['audio-test'] }]);
  } finally { ctl.stop(); }
});

it('live and recorded supplied audio apply the same nonzero content region to progress/pause/resume/end', async () => {
  const { MediaEngine } = await import('../src/runtime/media');
  const info = { sourceSampleRate: 1000, decodedFrames: 1000, contentStartFrame: 200, contentFrames: 400, cycleFrames: 400, encoderDelayFrames: 50, paddingFrames: 350, channels: 1 };
  const buffer = { sampleRate: 1000, length: 1000, duration: 1, numberOfChannels: 1 } as AudioBuffer;
  const sources: any[] = [];
  class Audio {
    currentTime = 0; sampleRate = 1000; destination = {}; state = 'running';
    resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
    decodeAudioData() { return Promise.resolve(buffer); }
    createBufferSource() { const s = { buffer: null, playbackRate: { value: 1 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null }; sources.push(s); return s; }
  }
  vi.stubGlobal('AudioContext', Audio);
  const engine = new MediaEngine(), narrator = new Narrator(); narrator.enabled = true;
  narrator.ensure = vi.fn(() => { throw new Error('Must not synthesize'); });
  narrator.provided = (url, speed, region) => engine.narrate(url, speed, region);
  const live = narrator.speak('Line', 'actor', 1, 'data:audio/wav;base64,UklGRg==', { audioInfo: info })!;
  while (!sources.length) await new Promise(r => setTimeout(r, 0));
  expect(sources[0].start.mock.calls[0][1]).toBeCloseTo(.2);
  expect(sources[0].start.mock.calls[0][2]).toBeCloseTo(.4);
  live.cancel(); await live.done; engine.destroy();
  const audio = new Audio();
  const record = new RecordVoice({ output: () => ({ audio: audio as any, connect: () => {} }), decode: async () => buffer, provided: (_url, info) => ({ value: Promise.resolve({ buffer, region: prepareRegion(buffer, info), info }), release() {} }), fallback: estimatedNarrator() });
  await record.prepare(null, [{ text: 'Line', role: 'actor', audio: 'data:audio/wav;base64,UklGRg==', audioInfo: info }]);
  const n = record.narrator.speak('Line', 'actor', 1, 'data:audio/wav;base64,UklGRg==', { audioInfo: info })!;
  await Promise.resolve();
  expect(record.describe('Line', 'actor', 'data:audio/wav;base64,UklGRg==', info)).toMatchObject({ audioInfo: info, provided: true, file: null });
  expect(record.describe('Line', 'actor', 'data:audio/wav;base64,UklGRg==', info).durationMs).toBeCloseTo(400, 6);
  audio.currentTime = .1; expect(n.progress?.()).toBeCloseTo(.25);
  n.pause(); audio.currentTime = 2; n.resume();
  expect(sources.at(-1).start.mock.calls[0][1]).toBeCloseTo(.3);
  expect(sources.at(-1).start.mock.calls[0][2]).toBeCloseTo(.3);
  sources.at(-1).onended(); await n.done;
  expect(n.progress?.()).toBe(1); expect(narrator.ensure).not.toHaveBeenCalled();
  const missing = record.narrator.speak('Missing', 'actor', 1, 'data:audio/wav;base64,privateBytes')!;
  await missing.done;
  expect(record.missing.at(-1)).toEqual({ text: 'Missing', role: 'actor', provided: true });
  expect(JSON.stringify(record.missing)).not.toContain('privateBytes');
});


it('cancel immediately unpins pending encoded and decoded leases; late results never play', async () => {
  const { MediaEngine } = await import('../src/runtime/media');
  let resolveFetch!: (x: unknown) => void, resolveDecode!: (x: AudioBuffer) => void;
  const decode = vi.fn(() => new Promise<AudioBuffer>(r => { resolveDecode = r; })), start = vi.fn();
  class Audio { sampleRate=1000; currentTime=0; destination={}; resume(){return Promise.resolve();} close(){return Promise.resolve();} decodeAudioData=decode; createBufferSource(){start();throw new Error('Late result played');} }
  vi.stubGlobal('AudioContext', Audio);
  vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolveFetch = r; })));
  const engine = new MediaEngine();
  const fetching = engine.narrate('fixture.wav',1);
  expect(engine.status().cache.encoded.pinned).toBe(1);
  fetching.cancel(); await fetching.done;
  expect(engine.status().cache.encoded.pinned).toBe(0);
  resolveFetch({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});
  await new Promise(r=>setTimeout(r,0)); expect(decode).not.toHaveBeenCalled();
  const decoding=engine.narrate('data:audio/wav;base64,UklGRg==',1);
  while(!decode.mock.calls.length)await new Promise(r=>setTimeout(r,0));
  expect(engine.status().cache.pcm.pinned).toBe(1);
  decoding.cancel(); await decoding.done;
  expect(engine.status().cache.pcm.pinned).toBe(0); expect(engine.status().cache.encoded.pinned).toBe(0);
  resolveDecode({duration:1,sampleRate:1000,length:1000,numberOfChannels:1} as AudioBuffer);
  await new Promise(r=>setTimeout(r,0)); expect(start).not.toHaveBeenCalled(); engine.destroy();
});

it('immediate play binds the stage audio host before any animation frame, including a replaced narrator', async () => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const project=compile(reviewSource(),'dev').project!, sc=project.scenarios['f.a.main']!;
  sc.steps=[sc.steps[0]!]; const st=sc.steps[0]!;
  st.kind='system';st.action={type:'event',name:'Line'};st.systemLead=0;st.narrate='Line';st.audio='joplo-resource:audio-test';
  project.mediaAssets={'audio-test':'data:audio/wav;base64,fixture'};
  const ctl=new DemoController(null);ctl.setProject(project,1,null);ctl.setScenario(sc.id,0,{quiet:true});
  const provided=vi.fn(()=>({source:'clip' as const,done:Promise.resolve(),pause(){},resume(){},cancel(){}}));
  ctl.providedAudio=provided;
  ctl.narrator=new Narrator(); ctl.narrator.enabled=true;
  const playing=ctl.play();
  for(let i=0;i<30&&!provided.mock.calls.length;i++)await Promise.resolve();
  expect(provided).toHaveBeenCalledOnce(); ctl.stop(); await playing;
  const previous=ctl.narrator;ctl.narrator=new Narrator();ctl.narrator.enabled=true;ctl.setScenario(sc.id,0,{quiet:true});
  const again=ctl.play();for(let i=0;i<30&&provided.mock.calls.length<2;i++)await Promise.resolve();
  expect(ctl.narrator).not.toBe(previous);expect(provided).toHaveBeenCalledTimes(2);ctl.stop();await again;
});

it('recording explicit audio enforces the shared encoded/PCM budgets without the legacy decode bypass', async () => {
  const { MediaEngine } = await import('../src/runtime/media');
  const decoded = vi.fn(async () => ({ duration: 100, sampleRate: 1000, length: 9 * 1024 * 1024, numberOfChannels: 1 } as AudioBuffer));
  class Audio { sampleRate=1000;currentTime=0;destination={};resume(){return Promise.resolve();}close(){return Promise.resolve();}decodeAudioData=decoded; }
  vi.stubGlobal('AudioContext',Audio);
  const engine=new MediaEngine(), legacyDecode=vi.fn(async()=>{throw new Error('Explicit bypass');});
  const record=new RecordVoice({output:()=>engine.narrationOutput(),decode:legacyDecode,provided:(url,info)=>engine.prepareNarration(url,info),fallback:estimatedNarrator()});
  const huge='data:audio/wav;base64,'+'A'.repeat(Math.ceil(4*1024*1024/3)*4+4);
  await record.prepare(null,[{text:'Huge encoded',role:null,audio:huge}]);
  const encoded=record.narrator.speak('Huge encoded',null,1,huge)!;await encoded.done;
  expect(encoded.failure?.()).toContain('encoded audio');expect(decoded).not.toHaveBeenCalled();
  await record.prepare(null,[{text:'Huge PCM',role:null,audio:'data:audio/wav;base64,UklGRg=='}]);
  const pcm=record.narrator.speak('Huge PCM',null,1,'data:audio/wav;base64,UklGRg==')!;await pcm.done;
  expect(pcm.failure?.()).toContain('decoded PCM');expect(legacyDecode).not.toHaveBeenCalled();
  expect(record.hasAudio).toBe(false);expect(engine.status().cache.encoded.pinned).toBe(0);expect(engine.status().cache.pcm.pinned).toBe(0);
  expect(JSON.stringify(record.missing)).not.toContain('base64');record.dispose();engine.destroy();
});

it('recording prepare abort/cancel releases pending leases immediately and late results cannot populate facts', async () => {
  const { MediaEngine } = await import('../src/runtime/media');
  let resolveFetch!:(value:unknown)=>void,resolveDecode!:(value:AudioBuffer)=>void;
  const decode=vi.fn(()=>new Promise<AudioBuffer>(r=>{resolveDecode=r;})),start=vi.fn();
  class Audio {sampleRate=1000;currentTime=0;destination={};resume(){return Promise.resolve();}close(){return Promise.resolve();}decodeAudioData=decode;createBufferSource(){start();throw new Error('Late play');}}
  vi.stubGlobal('AudioContext',Audio);vi.stubGlobal('fetch',vi.fn(()=>new Promise(r=>{resolveFetch=r;})));
  const engine=new MediaEngine(),legacyDecode=vi.fn(async()=>{throw new Error('Explicit bypass');});
  const record=new RecordVoice({output:()=>engine.narrationOutput(),decode:legacyDecode,provided:(url,info)=>engine.prepareNarration(url,info),fallback:estimatedNarrator()});
  const abort=new AbortController();
  const pendingFetch=record.prepare(null,[{text:'Pending',role:null,audio:'pending.wav'}],abort.signal);
  expect(engine.status().cache.encoded.pinned).toBe(1);abort.abort();await pendingFetch;
  expect(engine.status().cache.encoded.pinned).toBe(0);
  resolveFetch({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});await new Promise(r=>setTimeout(r,0));expect(decode).not.toHaveBeenCalled();
  const pendingDecode=record.prepare(null,[{text:'Pending PCM',role:null,audio:'data:audio/wav;base64,UklGRg=='}]);
  while(!decode.mock.calls.length)await new Promise(r=>setTimeout(r,0));
  expect(engine.status().cache.pcm.pinned).toBe(1);record.cancelPrepare();await pendingDecode;
  expect(engine.status().cache.pcm.pinned).toBe(0);expect(engine.status().cache.encoded.pinned).toBe(0);
  resolveDecode({duration:1,sampleRate:1000,length:1000,numberOfChannels:1} as AudioBuffer);await new Promise(r=>setTimeout(r,0));
  expect(record.hasAudio).toBe(false);expect(record.identity().clips).toEqual([]);expect(start).not.toHaveBeenCalled();expect(legacyDecode).not.toHaveBeenCalled();record.dispose();engine.destroy();
});

it('explicit-only preparation keeps content/region facts, releases PCM, and reacquires/relinquishes the shared playback lease', async () => {
  const { MediaEngine } = await import('../src/runtime/media');
  const info={sourceSampleRate:1000,decodedFrames:1000,contentStartFrame:200,contentFrames:400,cycleFrames:400,encoderDelayFrames:50,paddingFrames:350,channels:1};
  const sources:any[]=[];
  class Audio {sampleRate=1000;currentTime=0;destination={};resume(){return Promise.resolve();}close(){return Promise.resolve();}decodeAudioData(){return Promise.resolve({duration:1,sampleRate:1000,length:1000,numberOfChannels:1} as AudioBuffer);}createBufferSource(){const s={buffer:null,playbackRate:{value:1},connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),onended:null};sources.push(s);return s;}}
  vi.stubGlobal('AudioContext',Audio);const engine=new MediaEngine();
  const record=new RecordVoice({output:()=>engine.narrationOutput(),decode:async()=>{throw new Error('Explicit bypass');},provided:(url,region)=>engine.prepareNarration(url,region),fallback:estimatedNarrator()});
  const url='data:audio/wav;base64,UklGRg==';await record.prepare(null,[{text:'Only explicit',role:'actor',audio:url,audioInfo:info}]);
  expect(record.hasAudio).toBe(true);expect(engine.status().cache.pcm.pinned).toBe(0);expect(engine.status().cache.encoded.pinned).toBe(0);
  expect(record.describe('Only explicit','actor',url,info).durationMs).toBeCloseTo(400,6);expect(record.identity().clips).toHaveLength(1);
  const identity=JSON.stringify(record.identity());expect(identity).not.toContain('base64');
  const playing=record.narrator.speak('Only explicit','actor',1,url,{audioInfo:info})!;
  while(!sources.length)await new Promise(r=>setTimeout(r,0));expect(engine.status().cache.pcm.pinned).toBe(1);
  record.dispose();await playing.done;expect(engine.status().cache.pcm.pinned).toBe(0);expect(engine.status().cache.encoded.pinned).toBe(0);expect(sources[0].stop).toHaveBeenCalled();engine.destroy();
});
