import { expect, it } from 'vitest';
import { mediaDiagnostics } from '../src/media-check.ts';
const track = (offsetMs: number, loop = false) => ({ plugin:'music',resource:'r',offsetMs,loop,volume:.3,fadeInMs:0 });
const scene = (loop: boolean, start = 0): any => ({ scenarios:{s:{name:'Chapter',steps:Array.from({length:10},(_,i)=>({kind:'card',action:{type:'card'},caption:'x',effects:[],shots:[],directorLayer:null,hold:4000,source:'film.ts:8:1',media:{bgm:track(start+i*4000,loop)}}))}} });
it('checks continuous spans, accounts for start markers, and avoids per-step warnings',()=>{
 expect(mediaDiagnostics(scene(false),{r:{durationMs:40000}})).toEqual([]);
 expect(mediaDiagnostics(scene(false,30000),{r:{durationMs:40000}})).toMatchObject([{code:'MUSIC_ENDS_EARLY',at:'film.ts:8:1'}]);
 expect(mediaDiagnostics(scene(true),{r:{durationMs:4000}})).toMatchObject([{code:'MUSIC_LOOP_SHORT'}]);
 expect(mediaDiagnostics(scene(true),{r:{durationMs:12000}})).toEqual([]);
 const repeated=scene(true);repeated.scenarios.s.steps.forEach((s:any)=>s.media.bgm.offsetMs=0);
 expect(mediaDiagnostics(repeated,{r:{durationMs:4000}})).toEqual([]);
});

it('reports simultaneous decoded buffers including fades, with source locations and device-rate headroom', async () => {
 const {mediaBudgetDiagnostics}=await import('../src/media-check.ts');
 const A={...track(0,true),resource:'a'},B={...track(0,true),resource:'b'};
 const project:any={scenarios:{s:{id:'s',steps:[{source:'works/music.tsx:8:1',media:{old:{...A,stopAfterMs:2500},fresh:B}}]}}};
 const info={a:{durationMs:80000},b:{durationMs:50000}};
 expect(mediaBudgetDiagnostics(project,info)).toMatchObject([{code:'MEDIA_DECODE_BUDGET',at:'works/music.tsx:8:1'}]);
 expect(mediaBudgetDiagnostics(project,info)[0]!.message).toContain('a, b');
 project.scenarios.s.steps[0].media={old:{...A,stopAfterMs:0},fresh:B};
 expect(mediaBudgetDiagnostics(project,info).some(d=>d.code==='MEDIA_DECODE_BUDGET')).toBe(false);
 project.scenarios.s.steps[0].media={one:A,two:A};
 expect(mediaBudgetDiagnostics(project,{a:{durationMs:40000}})).toEqual([]); // same decoded resource is shared
 const region={sourceSampleRate:32000,decodedFrames:32000*90,channels:2};
 expect(mediaBudgetDiagnostics(project,{a:region} as any)[0]?.code).toBe('MEDIA_DECODE_BUDGET');
});
