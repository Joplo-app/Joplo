import type { MediaDriver, AudioRegion } from '@joplo-app/kit/plugin';
import { MediaCache } from './media-cache';
export function decodedLease(audio:AudioContext,bytes:Uint8Array,key:string,cache:MediaCache<AudioBuffer>,info?:AudioRegion) {
 const estimate=info?Math.ceil(info.decodedFrames/info.sourceSampleRate*audio.sampleRate)*info.channels*4:0;
 return cache.acquire(key,async()=>{const buffer=await audio.decodeAudioData(Uint8Array.from(bytes).buffer);return {value:buffer,bytes:buffer.length*buffer.numberOfChannels*4};},estimate);
}
/** Region metadata is numeric only. Native decoders that trim unexpectedly fail rather than play the calibration guard. */
export function prepareRegion(buffer:AudioBuffer,info?:AudioRegion) {
 if(!info)return {start:0,end:buffer.duration,cycle:buffer.duration};
 const scale=buffer.sampleRate/info.sourceSampleRate;
 if(Math.abs(buffer.length-Math.round(info.decodedFrames*scale))>2)throw new Error('Audio decoder trim mismatch; this browser cannot play the calibrated MP3 region');
 const first=Math.round(info.contentStartFrame*scale),end=Math.round((info.contentStartFrame+info.contentFrames)*scale),cycle=Math.round(info.cycleFrames*scale);
 if(first<0||end>buffer.length||cycle<=0)throw new Error('Invalid audio playback region');
 return {start:first/buffer.sampleRate,end:end/buffer.sampleRate,cycle:cycle/buffer.sampleRate};
}
function smoothLoop(buffer:AudioBuffer,start:number,cycle:number) {
 const first=Math.round(start*buffer.sampleRate),count=Math.round(cycle*buffer.sampleRate),window=Math.min(Math.round(buffer.sampleRate*.003),Math.floor(count/2));
 for(let c=0;c<buffer.numberOfChannels;c++){const x=buffer.getChannelData(c),a=x[first]!,b=x[first+count-1]!,mid=(a+b)/2;
  for(let i=0;i<window;i++){const w=.5+.5*Math.cos(Math.PI*i/window);x[first+i]!+=(mid-a)*w;x[first+count-1-i]!+=(mid-b)*w;}
 }
}
export async function audioMedia({audio,destination,bytes,audioInfo,cache,key='audio'}:{audio:AudioContext;destination:AudioNode;bytes:Uint8Array;audioInfo?:AudioRegion;cache?:MediaCache<AudioBuffer>;key?:string}):Promise<MediaDriver> {
 const lease=cache?decodedLease(audio,bytes,key,cache,audioInfo):undefined;
 const buffer=await (lease?.value??audio.decodeAudioData(Uint8Array.from(bytes).buffer)).catch(e=>{lease?.release();throw e;});
 let region:ReturnType<typeof prepareRegion>;
 try{region=prepareRegion(buffer,audioInfo);}catch(e){lease?.release();throw e;}
 let source:AudioBufferSourceNode|undefined,offset=0,time=0,speed=1,ended=false,smoothed=false;
 const stop=()=>{if(!source)return;source.onended=null;try{source.stop();}catch{}source.disconnect();source=undefined;};
 return {update(frame){const now=audio.currentTime,seconds=frame.offsetMs/1000;
  const discontinuity=Math.abs(seconds-(offset+(now-time)*speed))>.08;
  if(!frame.playing){stop();ended=false;offset=seconds;time=now;return;}
  if(source&&(discontinuity||frame.speed!==speed||source.loop!==frame.loop)){stop();ended=false;}
  if(discontinuity)ended=false;
  const length=region.end-region.start;
  if(!source&&!ended&&(frame.loop||seconds<length)){
   if(frame.loop&&audioInfo&&!smoothed){smoothLoop(buffer,region.start,region.cycle);smoothed=true;}
   source=audio.createBufferSource();source.buffer=buffer;source.loop=frame.loop;
   source.loopStart=region.start;source.loopEnd=region.start+region.cycle;source.playbackRate.value=frame.speed;source.connect(destination);
   source.onended=()=>{source?.disconnect();source=undefined;ended=true;};
   const position=frame.loop?seconds%region.cycle:seconds;
   if(frame.loop)source.start(now,region.start+position);else source.start(now,region.start+position,Math.max(0,length-position));
  }
  offset=seconds;time=now;speed=frame.speed;
 },destroy(){stop();lease?.release();}};
}
