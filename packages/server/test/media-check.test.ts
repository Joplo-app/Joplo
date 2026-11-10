import { expect, it } from 'vitest';
import { mediaDiagnostics } from '../src/media-check.ts';
const track = (offsetMs: number, loop = false) => ({ plugin:'music',resource:'r',offsetMs,loop,volume:.3,fadeInMs:0 });
const scene = (loop: boolean, start = 0): any => ({ scenarios:{s:{name:'Chapter',steps:Array.from({length:10},(_,i)=>({kind:'card',action:{type:'card'},caption:'x',effects:[],shots:[],directorLayer:null,hold:4000,source:'film.ts:8:1',media:{bgm:track(start+i*4000,loop)}}))}} });
it('checks continuous spans, accounts for start markers, and avoids per-step warnings',()=>{
 expect(mediaDiagnostics(scene(false),{r:{durationMs:60000}})).toEqual([]);
 expect(mediaDiagnostics(scene(false,50000),{r:{durationMs:60000}})).toMatchObject([{code:'MUSIC_ENDS_EARLY',at:'film.ts:8:1'}]);
 expect(mediaDiagnostics(scene(true),{r:{durationMs:4000}})).toMatchObject([{code:'MUSIC_LOOP_SHORT'}]);
 expect(mediaDiagnostics(scene(true),{r:{durationMs:12000}})).toEqual([]);
 const repeated=scene(true);repeated.scenarios.s.steps.forEach((s:any)=>s.media.bgm.offsetMs=0);
 expect(mediaDiagnostics(repeated,{r:{durationMs:4000}})).toEqual([]);
});
