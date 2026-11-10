import { afterEach, expect, it, vi } from 'vitest';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { feature, flow, work, page, hold } from '@joplo-app/kit';
import { definePlugin, pluginEffect, type MediaSnapshot } from '@joplo-app/kit/plugin';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject } from '../../core/src/compile.ts';
import { MediaEngine } from '../src/runtime/media';
// A second plugin deliberately has no custom media driver: the host must supply calibrated audio.
vi.mock('../src/renderer/plugins', () => ({ pluginStatus: () => ({ state: 'ready', runtime: {} }) }));
const region = {sourceSampleRate:48000,cycleFrames:96000,contentStartFrame:1000,contentFrames:96000,decodedFrames:98000,encoderDelayFrames:100,paddingFrames:900,channels:2};
const buffer=()=>{const channels=[new Float32Array(98000),new Float32Array(98000)];return {duration:98000/48000,length:98000,sampleRate:48000,numberOfChannels:2,getChannelData:(i:number)=>channels[i]};};
class Device {
 static current:Device;
 currentTime=0;sampleRate=48000;state='suspended';destination={};gains:any[]=[];nodes:any[]=[];
 constructor(){Device.current=this;}
 resume(){this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
 decodeAudioData=vi.fn(async()=>buffer());
 createGain(){const g={gain:{value:0,setTargetAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()};this.gains.push(g);return g;}
 createBufferSource(){const n={playbackRate:{value:1},connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),onended:null};this.nodes.push(n);return n;}
}
afterEach(()=>vi.unstubAllGlobals());
const flush=()=>new Promise(r=>setTimeout(r,0));
const frame={playing:true,enabled:true,speed:1,elapsedMs:0,timeMs:0,duck:false,identity:'continuous-seek'};
function chapters(){
 const plugin=definePlugin({id:'audio',title:'Audio',components:{},runtime:'/runtime.js',local:'/local.js',compile:{effect(e,c){return {media:[{track:'bgm',action:'play' as const,resource:c.resource({compiler:'mp3',input:String(e.payload)}),volume:.8,loop:true,fadeMs:e.name==='cross'?2000:0}]};}}});
 const play=(name:string,cross=false)=>pluginEffect('audio',cross?'cross':'play',name),file='/p/music.ts';
 const source:AuthoringProject={root:'/p',config:{...config({name:'Relay',plugins:[plugin]}),file},layouts:{},routes:{'/':{...page({title:'P'},jsx('div',{})),file}},features:{f:{def:{...feature({name:'F',goal:'G',pick:'a',cases:{}}),file},works:{a:{...work({title:'A',summary:'I',on:{},scenarios:{one:flow('One',{start:'/'}).system('A',play('a'),hold(3)).system('Same A',play('a'),hold(2)).system('B',play('b',true),hold(4)),two:flow('Two',{from:'one'}).system('Keep B',hold(1))}}),file}}}}};
 const requests:any[]=[];const result=compile(source,'publish',{onResource:r=>requests.push(r)});expect(result.diagnostics).toEqual([]);
 return {project:result.project!,assets:Object.fromEntries(requests.map((r,i)=>[r.id,'data:audio/mpeg;base64,'+btoa(String(i))])),info:Object.fromEntries(requests.map(r=>[r.id,region]))};
}
it('runs compiled same-song steps, crossfade and from relay through two generic drivers with leased PCM and one ducking gain',async()=>{
 vi.stubGlobal('AudioContext',Device);const {project,assets,info}=chapters(),one=project.scenarios['f.a.one']!,two=project.scenarios['f.a.two']!;
 const engine=new MediaEngine();engine.unlock();const audio=Device.current;
 const tick=(snapshot:MediaSnapshot,timeMs:number,duck=false)=>{audio.currentTime=timeMs/1000;engine.update(snapshot,assets,{...frame,timeMs,duck},info);};
 tick(one.steps[0]!.media!,0);await flush();tick(one.steps[0]!.media!,0);
 const first=audio.nodes[0];tick(one.steps[1]!.media!,1000);expect(audio.decodeAudioData).toHaveBeenCalledTimes(1);expect(audio.nodes[0]).toBe(first);expect(first.stop).not.toHaveBeenCalled();
 tick(one.steps[2]!.media!,2000);await flush();tick(one.steps[2]!.media!,2500,true);
 expect(audio.decodeAudioData).toHaveBeenCalledTimes(2);expect(engine.status().tracks).toBe(2);expect(engine.status().cache.pcm.pinned).toBe(2);
 expect(audio.gains[0].gain.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(.8*.75*.25);expect(audio.gains[1].gain.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(.8*.25*.25);
 // The relay snapshot has already dropped the old key by estimated hold time; its actual fade must finish first.
 const second=audio.nodes[1];tick(two.media!,3000);expect(audio.decodeAudioData).toHaveBeenCalledTimes(2);expect(audio.nodes[1]).toBe(second);expect(engine.status().cache.pcm.pinned).toBe(2);
 tick(two.steps[0]!.media!,4100);expect(engine.status().tracks).toBe(1);expect(first.stop).toHaveBeenCalled();expect(second.stop).not.toHaveBeenCalled();expect(engine.status().cache.pcm.pinned).toBe(1);expect(engine.status().cache.encoded.pinned).toBe(1);
 engine.destroy();expect(engine.status().cache.pcm.bytes).toBe(0);
});
it('anchors a marker fade once on engine time and rebuilds the generic source at a non-zero seek',async()=>{
 vi.stubGlobal('AudioContext',Device);const engine=new MediaEngine();engine.unlock();const audio=Device.current;
 const assets={a:'data:audio/mpeg;base64,QQ=='},info={a:region};const track={plugin:'audio',resource:'a',offsetMs:12500,startOffsetMs:12500,volume:.8,loop:true,fadeInMs:1000};
 const tick=(timeMs:number,identity=frame.identity,offsetMs=12500)=>{audio.currentTime=timeMs/1000;engine.update({'audio:bgm':{...track,offsetMs}},assets,{...frame,timeMs,identity,duck:true},info);};
 tick(10000);await flush();tick(10000);expect(audio.gains[0].gain.setTargetAtTime.mock.lastCall[0]).toBe(0);expect(audio.nodes[0].start).toHaveBeenCalledWith(10,1000/48000+.5);
 tick(10500);expect(audio.gains[0].gain.setTargetAtTime.mock.lastCall[0]).toBeCloseTo(.8*.5*.25);
 tick(11000,'seek',13250);await flush();tick(11000,'seek',13250);expect(audio.nodes[0].stop).toHaveBeenCalled();expect(audio.nodes[1].start).toHaveBeenCalledWith(11,1000/48000+1.25);expect(audio.decodeAudioData).toHaveBeenCalledTimes(1);engine.destroy();
});
it.each([0,12500])('explicit marker %i on the same resource reanchors only that driver and reuses decoded PCM',async marker=>{
 vi.stubGlobal('AudioContext',Device);const engine=new MediaEngine();engine.unlock();const audio=Device.current,assets={a:'data:audio/mpeg;base64,QQ=='},info={a:region};
 const track={plugin:'audio',resource:'a',offsetMs:0,volume:.8,loop:true,fadeInMs:0};
 engine.update({'audio:bgm':track},assets,frame,info);await flush();engine.update({'audio:bgm':track},assets,frame,info);
 audio.currentTime=10;const next={'audio:bgm':{...track,offsetMs:marker,startOffsetMs:marker,fadeInMs:1000}};
 engine.update(next,assets,{...frame,timeMs:10000},info);await flush();engine.update(next,assets,{...frame,timeMs:10000},info);
 expect(audio.nodes[0].stop).toHaveBeenCalled();expect(audio.nodes[1].start).toHaveBeenCalledWith(10,1000/48000+(marker%2000)/1000);expect(audio.decodeAudioData).toHaveBeenCalledTimes(1);expect(audio.gains[1].gain.setTargetAtTime.mock.lastCall[0]).toBe(0);engine.destroy();
});
it('releases a decode lease that finishes after its seek identity has already left',async()=>{
 vi.stubGlobal('AudioContext',Device);const engine=new MediaEngine();engine.unlock();const audio=Device.current;let finish!:(b:ReturnType<typeof buffer>)=>void;
 audio.decodeAudioData.mockImplementationOnce(()=>new Promise(r=>finish=r));
 engine.update({'audio:bgm':{plugin:'audio',resource:'a',offsetMs:0,volume:1,loop:true,fadeInMs:0}},{a:'data:audio/mpeg;base64,QQ=='},frame,{a:region});await flush();
 engine.update({}, {}, {...frame,identity:'departed'});finish(buffer());await flush();expect(engine.status().tracks).toBe(0);expect(engine.status().cache.pcm.pinned).toBe(0);expect(engine.status().cache.encoded.pinned).toBe(0);expect(audio.nodes).toHaveLength(0);engine.destroy();
});
