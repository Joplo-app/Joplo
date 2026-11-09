import { expect, it, vi } from 'vitest';
import { audioMedia } from '../src/runtime/audio-media';
it('handles pause, resumed offset, seek, loop and speed on the host clock',async()=>{
 const nodes:any[]=[];
 const audio:any={currentTime:1,decodeAudioData:vi.fn().mockResolvedValue({duration:4}),createBufferSource(){const s={start:vi.fn(),stop:vi.fn(),connect:vi.fn(),disconnect:vi.fn(),playbackRate:{value:1},loop:false,onended:null};nodes.push(s);return s;}};
 const bytes=new Uint8Array([1,2,3]);
 const driver=await audioMedia({audio,destination:{} as any,bytes});
 const frame={offsetMs:1000,playing:true,loop:true,speed:1,volume:1};
 driver.update(frame);expect(nodes[0].start).toHaveBeenCalledWith(1,1);
 audio.currentTime=1.25;driver.update({...frame,offsetMs:1250});expect(nodes).toHaveLength(1);
 driver.update({...frame,offsetMs:1250,playing:false});expect(nodes[0].stop).toHaveBeenCalled();
 audio.currentTime=2;driver.update({...frame,offsetMs:1250});expect(nodes[1].start).toHaveBeenCalledWith(2,1.25);
 driver.update({...frame,offsetMs:5000,speed:2});expect(nodes[2].start).toHaveBeenCalledWith(2,1);expect(nodes[2].playbackRate.value).toBe(2);
 driver.destroy();expect(nodes[2].stop).toHaveBeenCalled();
 const other=await audioMedia({audio,destination:{} as any,bytes});expect(audio.decodeAudioData).toHaveBeenCalledTimes(2);other.destroy();
});
it.each([44100,48000])('converts calibrated loop/marker regions to native %i Hz and preserves a non-loop tail',async rate=>{
 const info={sourceSampleRate:32000,cycleFrames:64000,contentStartFrame:7200,contentFrames:72000,decodedFrames:80000,encoderDelayFrames:1104,paddingFrames:512,channels:2};
 const pcm=[new Float32Array(Math.round(80000*rate/32000)),new Float32Array(Math.round(80000*rate/32000))];
 const first=Math.round(7200*rate/32000),last=first+rate*2-1;pcm.forEach(x=>{x[first]=.1;x[last]=-.1;});
 const nodes:any[]=[];const audio:any={currentTime:3,decodeAudioData:async()=>({sampleRate:rate,length:pcm[0]!.length,numberOfChannels:2,getChannelData:(c:number)=>pcm[c]}),createBufferSource(){const n={playbackRate:{value:1},connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn()};nodes.push(n);return n;}};
 const driver=await audioMedia({audio,destination:{} as any,bytes:new Uint8Array(),audioInfo:info});
 driver.update({offsetMs:500,playing:true,loop:true,speed:1,volume:1});
 expect(nodes[0].loopStart).toBe(first/rate);expect(nodes[0].loopEnd).toBe(first/rate+2);expect(nodes[0].start).toHaveBeenCalledWith(3,first/rate+.5);expect(pcm[0]![first]).toBe(pcm[0]![last]);
 driver.update({offsetMs:0,playing:true,loop:false,speed:1,volume:1});expect(nodes[1].start).toHaveBeenCalledWith(3,first/rate,2.25);driver.destroy();
});
