import { Mp3Encoder } from '@breezystack/lamejs';
import { MPEGDecoder } from 'mpg123-decoder';
import type { AudioRegion } from '@joplo-app/kit/plugin';
const SAMPLE_RATE=32000;
export const MP3_VERSION='breezystack-lamejs-1.2.7-mpg123-decoder-1.0.3-stereo96-32000-sinc24-phase256-probe1600-silence640-guard3840-correlation-v1-runtime-seam3ms';
/** Fixed anti-aliasing resampler, 24 taps and 256 fractional phases. */
function resample(input:Float32Array) {
 const ratio=32000/44100,cutoff=ratio*.92;
 const weights=Array.from({length:256},(_,phase)=>Float64Array.from({length:24},(_,j)=>{const x=j-11-phase/256;return (Math.abs(x)<1e-9?cutoff:Math.sin(Math.PI*x*cutoff)/(Math.PI*x))*(.5+.5*Math.cos(Math.PI*x/12));}));
 return Float32Array.from({length:Math.round(input.length*ratio)},(_,i)=>{
  const position=i/ratio,base=Math.floor(position),w=weights[Math.min(255,Math.round((position-base)*256))]!;let sum=0,norm=0;
  for(let j=0;j<24;j++){sum+=input[Math.max(0,Math.min(input.length-1,base+j-11))]!*w[j]!;norm+=w[j]!;}return sum/norm;
 });
}
/** A deterministic out-of-band probe measures the decoder's delay; it is excluded from the public playback region. */
export function measureDelay(reference:Float32Array, decoded:Float32Array) {
 let best=-Infinity, lag=0;
 for(let shift=0;shift<=4096;shift++) {
  let dot=0,energy=0;
  for(let i=0;i<reference.length;i++){const x=decoded[i+shift]??0;dot+=reference[i]!*x;energy+=x*x;}
  const score=dot/Math.sqrt(energy||1);if(score>best){best=score;lag=shift;}
 }
 if(best<.5)throw new Error('MP3 delay calibration failed');return lag;
}
export async function encodeMusic(pcm:Float32Array[], cycleFrames:number, loop:boolean):Promise<{bytes:Uint8Array;audio:AudioRegion}> {
 pcm=pcm.map(resample);cycleFrames=Math.round(cycleFrames*32000/44100);
 const probeLength=1600,gap=640,guard=3840,head=probeLength+gap+guard,tail=guard;
 let seed=13919;
 const probe=Float32Array.from({length:probeLength},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed/4294967296-.5)*.3;});
 const frames=pcm[0]!.length;
 const input=pcm.map(ch=>{
  const out=new Float32Array(head+frames+tail);out.set(probe);
  if(loop)for(let i=0;i<guard;i++)out[probeLength+gap+i]=ch[((frames-guard+i)%frames+frames)%frames]!;
  out.set(ch,head);if(loop)for(let i=0;i<tail;i++)out[head+frames+i]=ch[i%frames]!;
  return Int16Array.from(out,x=>Math.round(Math.max(-1,Math.min(1,x))*32767));
 });
 const encoder=new Mp3Encoder(2,SAMPLE_RATE,96),chunks:Uint8Array[]=[];
 for(let i=0;i<input[0]!.length;i+=1152)chunks.push(Uint8Array.from(encoder.encodeBuffer(input[0]!.subarray(i,i+1152),input[1]!.subarray(i,i+1152))));
 chunks.push(Uint8Array.from(encoder.flush()));const bytes=new Uint8Array(Buffer.concat(chunks));
 const decoder=new MPEGDecoder();await decoder.ready;
 try {
  const decoded=decoder.decode(bytes);
  if(decoded.sampleRate!==SAMPLE_RATE||decoded.errors.length)throw new Error('MP3 verification decode failed: '+JSON.stringify({sampleRate:decoded.sampleRate,errors:decoded.errors,samples:decoded.samplesDecoded}));
  const delay=measureDelay(probe,decoded.channelData[0]!);
  const audio={sourceSampleRate:SAMPLE_RATE,cycleFrames,contentStartFrame:head+delay,contentFrames:frames,decodedFrames:decoded.samplesDecoded,encoderDelayFrames:delay,paddingFrames:decoded.samplesDecoded-input[0]!.length-delay,channels:2};
  if(audio.paddingFrames<0||audio.contentStartFrame+frames>audio.decodedFrames)throw new Error('MP3 region exceeds decoded samples');
  return {bytes,audio};
 }finally{decoder.free();}
}
