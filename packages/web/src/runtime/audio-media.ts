import type { MediaDriver } from '@joplo-app/kit/plugin';
const buffers = new WeakMap<AudioContext, WeakMap<Uint8Array, Promise<AudioBuffer>>>();
export function decodeAudio(audio: AudioContext, bytes: Uint8Array) {
  let cache = buffers.get(audio); if (!cache) { cache = new WeakMap(); buffers.set(audio, cache); }
  let pending = cache.get(bytes); if (!pending) { pending = audio.decodeAudioData(Uint8Array.from(bytes).buffer); cache.set(bytes, pending); }
  return pending;
}
/** Generic decoded audio driver: the same media clock/gain/lifecycle used for every media track. */
export async function audioMedia({ audio, destination, bytes }: { audio: AudioContext; destination: AudioNode; bytes: Uint8Array }): Promise<MediaDriver> {
  const buffer = await decodeAudio(audio, bytes);
  let source: AudioBufferSourceNode | undefined, offset = 0, time = 0, speed = 1, ended = false;
  const stop = () => {
    if (!source) return;
    source.onended = null; try { source.stop(); } catch { /* already ended */ }
    source.disconnect(); source = undefined;
  };
  return {
    update(frame) {
      const now = audio.currentTime, seconds = frame.offsetMs / 1000;
      const discontinuity = Math.abs(seconds - (offset + (now - time) * speed)) > .08;
      if (!frame.playing) { stop(); ended = false; offset = seconds; time = now; return; }
      if (source && (discontinuity || frame.speed !== speed || source.loop !== frame.loop)) { stop(); ended = false; }
      if (discontinuity) ended = false;
      if (!source && !ended && (frame.loop || seconds < buffer.duration)) {
        source = audio.createBufferSource(); source.buffer = buffer; source.loop = frame.loop;
        source.playbackRate.value = frame.speed; source.connect(destination);
        source.onended = () => { source?.disconnect(); source = undefined; ended = true; };
        source.start(now, frame.loop ? seconds % buffer.duration : seconds);
      }
      offset = seconds; time = now; speed = frame.speed;
    },
    destroy: stop,
  };
}
