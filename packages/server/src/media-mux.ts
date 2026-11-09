import fs from 'node:fs/promises';
import { Input, ALL_FORMATS, BufferSource, BufferTarget, Output, WebMOutputFormat, EncodedPacketSink, EncodedAudioPacketSource, EncodedVideoPacketSource, type EncodedPacket } from 'mediabunny';
/** MediaRecorder packet arrival PTS can jitter. Keep the exact continuous decoded-sample clock. */
export function audioSampleClock(packets:readonly EncodedPacket[],durations:readonly number[]) {
  if(packets.length!==durations.length)throw new Error('Audio packet/decode count mismatch');
  let time=0;
  return packets.map((packet,i)=>{
    const duration=durations[i]!;if(!Number.isFinite(duration)||duration<=0)throw new Error('Invalid decoded audio packet duration');
    const result=packet.clone({timestamp:time,duration});time+=duration;return result;
  });
}
/** Packet copy only (VP8/VP9 and Opus): no native codec, ffmpeg executable, decode or re-encode. */
export async function muxRecordedAudio(videoFile: string, audio: Uint8Array, offsetSeconds: number, trim?:{videoEnd:number;audioEnd:number;audioDurations?:number[]}) {
  const video = new Input({ formats: ALL_FORMATS, source: new BufferSource(await fs.readFile(videoFile)) });
  const sound = new Input({ formats: ALL_FORMATS, source: new BufferSource(audio) });
  try {
    const v = await video.getPrimaryVideoTrack(), a = await sound.getPrimaryAudioTrack();
    if (!v || !a) throw new Error('Video export did not produce both a video and an audio track');
    const vc = await v.getCodec(), ac = await a.getCodec();
    if (!vc || !ac) throw new Error('Unknown recorded media codec');
    const target = new BufferTarget(), output = new Output({ format: new WebMOutputFormat(), target });
    const vs = new EncodedVideoPacketSource(vc), as = new EncodedAudioPacketSource(ac);
    output.addVideoTrack(vs); output.addAudioTrack(as);
    await output.start();
    const copyVideo = async () => {
      const decoderConfig = await v.getDecoderConfig(); if (!decoderConfig) throw new Error('Missing video decoder configuration');
      for await (const packet of new EncodedPacketSink(v).packets()) {if(trim&&packet.timestamp>=trim.videoEnd)break;await vs.add(packet,{decoderConfig});}
      vs.close();
    };
    const copyAudio = async () => {
      const decoderConfig = await a.getDecoderConfig(); if (!decoderConfig) throw new Error('Missing audio decoder configuration');
      const packets=[];for await(const packet of new EncodedPacketSink(a).packets())packets.push(packet);
      for (const packet of trim?.audioDurations?audioSampleClock(packets,trim.audioDurations):packets) {if(trim&&packet.timestamp+packet.duration>trim.audioEnd)break;if(packet.timestamp+offsetSeconds<0)continue;await as.add(packet.clone({timestamp:packet.timestamp+offsetSeconds}),{decoderConfig});}
      as.close();
    };
    await Promise.all([copyVideo(), copyAudio()]); await output.finalize();
    await fs.writeFile(videoFile, new Uint8Array(target.buffer!));
  } finally { video.dispose(); sound.dispose(); }
}
