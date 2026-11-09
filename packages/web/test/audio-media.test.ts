import { expect, it, vi } from 'vitest';
import { audioMedia } from '../src/runtime/audio-media';
it('reuses decoded bytes and handles pause, resumed offset, seek, loop and speed on the host clock',async()=>{
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
 const other=await audioMedia({audio,destination:{} as any,bytes});expect(audio.decodeAudioData).toHaveBeenCalledTimes(1);other.destroy();
});
