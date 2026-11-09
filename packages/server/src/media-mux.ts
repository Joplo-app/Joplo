import fs from 'node:fs/promises';
import { Input, ALL_FORMATS, BufferSource, BufferTarget, Output, WebMOutputFormat, EncodedPacketSink, EncodedAudioPacketSource, EncodedVideoPacketSource } from 'mediabunny';
/** Packet copy only (VP8/VP9 and Opus): no native codec, ffmpeg executable, decode or re-encode. */
export async function muxRecordedAudio(videoFile: string, audio: Uint8Array, offsetSeconds: number) {
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
      for await (const packet of new EncodedPacketSink(v).packets()) await vs.add(packet, { decoderConfig });
      vs.close();
    };
    const copyAudio = async () => {
      const decoderConfig = await a.getDecoderConfig(); if (!decoderConfig) throw new Error('Missing audio decoder configuration');
      for await (const packet of new EncodedPacketSink(a).packets()) await as.add(packet.clone({ timestamp: packet.timestamp + Math.max(0, offsetSeconds) }), { decoderConfig });
      as.close();
    };
    await Promise.all([copyVideo(), copyAudio()]); await output.finalize();
    await fs.writeFile(videoFile, new Uint8Array(target.buffer!));
  } finally { video.dispose(); sound.dispose(); }
}
