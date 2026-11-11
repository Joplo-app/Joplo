import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({missing:false}));
vi.mock('node:child_process',()=>({execFile:(_cmd:string,args:string[],options:any,callback:any)=>{
 queueMicrotask(()=>{
  if(state.missing)return callback(Object.assign(new Error('missing'),{code:'ENOENT'}),'','');
  if(args[0]==='version')return callback(null,'alda 2.4.8','');
  if(args[0]==='parse')return callback(null,JSON.stringify({parts:{p:{name:'piano','current-offset':1000}},events:[{part:'p','midi-note':60}],markers:{cue:250}}),'');
  fs.writeFileSync(path.join(options.cwd,'score.mid'),'fixture MIDI');callback(null,'','');
 });return {};
}}));
vi.mock('../src/soundfont.ts',async original=>({...await original<any>(),soundfont:vi.fn(async(_cacheDir?:string)=>new Uint8Array([1]))}));
vi.mock('../src/render.ts',async original=>({...await original<any>(),renderPCM:async(_m:unknown,_s:unknown,_d:number,loop:boolean)=>{
 const pcm=Float32Array.from({length:loop?44100:50000},(_,i)=>Math.sin(i/31)*.1);return [pcm,pcm];
}}));
import {soundfont} from '../src/soundfont.ts';
import local,{renderLossless} from '../src/local.ts';
const roots:string[]=[];
afterEach(()=>{state.missing=false;for(const p of roots.splice(0))fs.rmSync(p,{recursive:true,force:true});});
const setup=()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'alda-lossless-'));roots.push(root);return {root,options:{directory:path.join(root,'work'),cacheDir:path.join(root,'bank')}};};
it('exports exact zero-padding FLAC from the same master pipeline and keeps non-loop tails/markers',async()=>{
 const {root,options}=setup(),a=await renderLossless('piano: c1',{...options,loop:false});
 expect(Buffer.from(a.bytes).subarray(0,4).toString()).toBe('fLaC');
 expect(a.audio).toMatchObject({sourceSampleRate:44100,contentStartFrame:0,decodedFrames:50000,contentFrames:50000,cycleFrames:44100,encoderDelayFrames:0,paddingFrames:0,channels:2});
 expect(a.info.markers).toEqual({cue:250});expect(a.credit).toBeTruthy();expect(a.license).toBeTruthy();
 await local.compilers.audio.compile(JSON.stringify({score:'piano: c1',loop:false}),{...options,projectDir:root,keys:{},maxBytes:1024*1024});
 const masters=path.join(root,'.joplo/music-masters'),master=fs.readFileSync(path.join(masters,fs.readdirSync(masters)[0]!));
 expect(master).toEqual(Buffer.from(a.bytes));expect(fs.readdirSync(options.directory)).toEqual([]);
 const loop=await renderLossless('piano: c1',{...options,loop:true});expect(loop.audio.contentFrames).toBe(loop.audio.cycleFrames);expect(loop.audio.contentFrames).toBe(44100);
});
it('bounds bytes, validates options and explains missing pinned Alda without leaving job files',async()=>{
 const {options}=setup();await expect(renderLossless('piano: c1',{...options,maxBytes:1})).rejects.toThrow('maxBytes');
 state.missing=true;await expect(renderLossless('piano: c1',options)).rejects.toThrow('Install Alda 2.4.8');
 expect(fs.readdirSync(options.directory)).toEqual([]);
 await expect(renderLossless('',options)).rejects.toThrow('nonempty');
});

it('preserves legacy compiler calls without cacheDir while the new file API requires it explicitly',async()=>{
 const {options}=setup();
 const artifact=await local.compilers.audio.compile(JSON.stringify({score:'piano: c1',loop:false}),{directory:options.directory,maxBytes:1024*1024} as any);
 expect(artifact.bytes.length).toBeGreaterThan(0);
 expect(vi.mocked(soundfont)).toHaveBeenLastCalledWith(undefined);
 const {cacheDir:_cacheDir,...withoutCache}=options;
 await expect(renderLossless('piano: c1',withoutCache as any)).rejects.toThrow('explicit plugin cacheDir');
});
