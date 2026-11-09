import fs from 'node:fs/promises';
import {Input,ALL_FORMATS,BufferSource,EncodedPacketSink} from 'mediabunny';
import type {Page} from 'playwright-core';
/** Read actual recorded PTS, independent of page creation, wall clocks and recorder start latency. */
export async function recordedCalibration(page:Page,videoFile:string,audioBytes:Uint8Array) {
 const video=new Input({formats:ALL_FORMATS,source:new BufferSource(await fs.readFile(videoFile))});
 const audio=new Input({formats:ALL_FORMATS,source:new BufferSource(audioBytes)});
 try {
  const v=await video.getPrimaryVideoTrack(),a=await audio.getPrimaryAudioTrack();if(!v||!a)throw new Error('Calibration tracks missing');
  const vc=await v.getDecoderConfig(),ac=await a.getDecoderConfig();if(!vc||!ac)throw new Error('Calibration decoder configuration missing');
  const vs=new EncodedPacketSink(v),as=new EncodedPacketSink(a);
  const vp=[],ap=[];
  const first=await vs.getKeyPacket(Math.max(0,(await v.computeDuration())-2));
  for await(const p of vs.packets(first??undefined))vp.push({type:p.type,timestamp:Math.round(p.timestamp*1e6),duration:Math.round(p.duration*1e6),data:Array.from(p.data)});
  for await(const p of as.packets())ap.push({type:p.type,timestamp:Math.round(p.timestamp*1e6),duration:Math.round(p.duration*1e6),data:Array.from(p.data)});
  return await page.evaluate(async({vc,ac,vp,ap,audioFloor})=>{
   let videoPTS=Infinity,audioPTS=Infinity;let audioTime=0;const audioDurations:number[]=[];
   const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const ctx=canvas.getContext('2d')!;
   const decoder=new VideoDecoder({output(frame){ctx.drawImage(frame,0,0,1,1);const c=ctx.getImageData(0,0,1,1).data;if(c[0]!>220&&c[2]!>220&&c[1]!<40)videoPTS=Math.min(videoPTS,frame.timestamp/1e6);frame.close();},error(e){throw e;}});
   decoder.configure({...vc,description:vc.description?new Uint8Array(vc.description):undefined});
   for(const p of vp){decoder.decode(new EncodedVideoChunk({...p,data:new Uint8Array(p.data)}));if(decoder.decodeQueueSize>20)await new Promise(r=>setTimeout(r,0));}await decoder.flush();decoder.close();
   const sound=new AudioDecoder({output(frame){const data=new Float32Array(frame.numberOfFrames);frame.copyTo(data,{planeIndex:0,format:'f32-planar'});const origin=audioTime,duration=frame.numberOfFrames/frame.sampleRate;audioDurations.push(duration);audioTime+=duration;for(let i=0;i<data.length;i++)if(origin+i/frame.sampleRate>=audioFloor&&Math.abs(data[i]!)>.3){audioPTS=Math.min(audioPTS,origin+i/frame.sampleRate);break;}frame.close();},error(e){throw e;}});
   sound.configure({...ac,description:ac.description?new Uint8Array(ac.description):undefined});for(const p of ap){sound.decode(new EncodedAudioChunk({...p,data:new Uint8Array(p.data)}));if(sound.decodeQueueSize>20)await new Promise(r=>setTimeout(r,0));}await sound.flush();sound.close();if(audioDurations.length!==ap.length)throw new Error('Unexpected audio calibration decoder batching');
   if(!Number.isFinite(videoPTS)||!Number.isFinite(audioPTS))throw new Error('Recorded calibration signal was not found');
   // A color change becomes visible in the next recorded frame. Center that
   // quantization interval instead of introducing a systematic full-frame delay.
   const durations=vp.map(p=>p.duration/1e6).filter(d=>d>0&&d<.1).sort((a,b)=>a-b);
   const halfFrame=(durations[Math.floor(durations.length/2)]??.04)/2;
   return {videoPTS,audioPTS,audioDurations,offsetSeconds:videoPTS-halfFrame-audioPTS};
  },{vc:{...vc,description:vc.description?Array.from(new Uint8Array(vc.description as ArrayBuffer)):undefined},ac:{...ac,description:ac.description?Array.from(new Uint8Array(ac.description as ArrayBuffer)):undefined},vp,ap,audioFloor:Math.max(0,ap.reduce((n,p)=>n+p.duration/1e6,0)-.6)});
 }finally{video.dispose();audio.dispose();}
}
