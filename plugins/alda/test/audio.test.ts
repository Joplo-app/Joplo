import { expect, it } from 'vitest';
import alda, { music } from '../src/index.ts';
import { RENDER_VERSION, wrapTail } from '../src/render.ts';
import local from '../src/local.ts';
import { SOUNDFONT } from '../src/soundfont.ts';
it('declares the pinned bank, renderer, SF3 decoder and encoder in the actual host cache identity', () => {
  expect(local.compilers.audio.version).toContain(SOUNDFONT.sha256);
  expect(local.compilers.audio.version).toContain(RENDER_VERSION);
  expect(RENDER_VERSION).toMatch(/spessasynth_core-4.4.9-stb-vorbis-0.0.7-libflacjs-5.6.0/);
});
it('wraps release tails into an exact cycle and removes the boundary jump', () => {
  const cycle = 44100, pcm = Float32Array.from({ length: cycle + 5000 }, (_, i) => Math.sin(i * .037) * Math.exp(-i / 20000));
  const wrapped = wrapTail(pcm, cycle);
  expect(wrapped.length).toBe(cycle);
  expect(Math.abs(wrapped[cycle - 1]! - wrapped[0]!)).toBeLessThan(1 / 32768);
  const rms = Math.sqrt(wrapped.slice(0, 441).reduce((s, x) => s + x * x, 0) / 441);
  expect(rms).toBeGreaterThan(.05);
});
it('lowers marker playback to numeric media offset; rejects unknown marker', () => {
  const plugin = alda({ film: 'piano: c1 %chapter d1' });
  const diagnostics: any[] = [];
  const ctx: any = { report: (...d: any[]) => diagnostics.push(d), resource: () => 'r', resourceInfo: () => ({ durationMs: 4000, markers: { chapter: 2000 }, parts: { piano: 2 } }) };
  const result = plugin.compile!.effect!(music.play('film', { from: 'chapter' }), ctx);
  expect(result?.media?.[0]).toMatchObject({ offsetMs: 2000 });
  expect(JSON.stringify(result)).not.toContain('chapter');
  plugin.compile!.effect!(music.play('film', { from: 'typo' }), ctx);
  plugin.compile!.effect!(music.play('film', { from: 'toString' }), ctx);
  expect(diagnostics.filter(d => d[0] === 'MUSIC_MARKER_MISSING' && d[3] === 'error')).toHaveLength(2);
});
it('encodes exact sample count and loop endpoint without delay/padding, deterministically', async () => {
  const { encodeFlac } = await import('../src/render.ts');
  const Flac = (await import('libflacjs/dist/libflac.js')).default;
  const { Decoder } = await import('libflacjs/lib/decoder.js');
  const pcm = wrapTail(Float32Array.from({length: 5000}, (_, i) => Math.sin(i / 9) * .2), 4096);
  const bytes = await encodeFlac([pcm, pcm]);
  expect(bytes).toEqual(await encodeFlac([pcm, pcm]));
  const decoder = new Decoder(Flac);
  try {
    expect(decoder.decode(Uint8Array.from(bytes))).toBe(true);
    expect(decoder.metadata?.total_samples).toBe(4096);
    const out = Buffer.from(decoder.getSamples(true));
    expect(out.length).toBe(4096 * 2 * 2);
    expect(out.readInt16LE(0)).toBe(out.readInt16LE(out.length - 4));
    for (let i = 0; i < pcm.length; i++) expect(out.readInt16LE(i * 4)).toBe(Math.round(pcm[i]! * 32767) || 0);
  } finally { decoder.destroy(); }
});

it('reports every part end and sorts markers by score time', () => {
  const plugin = alda({ piece: 'piano: c1' });
  const reports: any[] = [];
  plugin.compile!.effect!(music.play('piece'), {
    report: (...args: any[]) => reports.push(args), resource: () => 'r',
    resourceInfo: () => ({ durationMs: 10000, parts: { piano: 4, bass: 3 }, partDurationsMs: { piano: 10000, bass: 7500 }, markers: { end: 10000, start: 0, middle: 5000 } }),
  } as any);
  const message = reports.find(r => r[0] === 'MUSIC_SCORE')[1];
  expect(message).toContain('part ends piano=10.000 s, bass=7.500 s');
  expect(message).toContain('markers %start=0.000 s, %middle=5.000 s, %end=10.000 s');
});

it('validates and exposes per-track delay, duck exemption and retiring limits without changing marker offsets',()=>{
 const plugin=alda({film:'piano: c1'}),errors:string[]=[];const ctx:any={report:(code:string)=>errors.push(code),resource:()=> 'r',resourceInfo:()=>({durationMs:4000,markers:{chapter:2000},parts:{piano:2}})};
 expect(plugin.compile!.effect!(music.play('film',{from:'chapter',startDelayMs:300,duck:false,maxRetiring:1}),ctx)).toMatchObject({media:[{offsetMs:2000,startDelayMs:300,duck:false,maxRetiring:1}]});
 for(const options of [{startDelayMs:-1},{startDelayMs:60001},{duck:'false'},{maxRetiring:33},{maxRetiring:1.5}])plugin.compile!.effect!(music.play('film',options as never),ctx);
 expect(errors.filter(c=>c==='MUSIC_OPTIONS_INVALID')).toHaveLength(5);
});
