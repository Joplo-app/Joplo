import { StbVorbis } from 'stb-vorbis';
import { BasicSoundBank, BasicMIDI, SoundBankLoader, SpessaLog, SpessaSynthProcessor, SpessaSynthSequencer } from 'spessasynth_core';
import * as FlacModule from 'libflacjs/dist/libflac.js';
export const SAMPLE_RATE = 44100;
// Also embedded in the host bundle/cache key. Bump for ANY signal processing change.
export const RENDER_VERSION = 'spessasynth_core-4.4.9-stb-vorbis-0.0.7-libflacjs-5.6.0-flac16-44100-v2';
/** Add every release/reverb sample into the following cycle, never append a silent tail to a loop. */
export function wrapTail(pcm: Float32Array, cycle: number): Float32Array {
  const out = pcm.slice(0, cycle);
  for (let i = cycle; i < pcm.length; i++) out[i % cycle]! += pcm[i]!;
  // A 3ms endpoint correction removes the jump without a silence-producing crossfade.
  const window = Math.min(128, Math.floor(cycle / 2));
  const first = out[0]!, last = out[cycle - 1]!, mid = (first + last) / 2;
  for (let i = 0; i < window; i++) {
    const weight = .5 + .5 * Math.cos(Math.PI * i / window);
    out[i]! += (mid - first) * weight;
    out[cycle - 1 - i]! += (mid - last) * weight;
  }
  return out;
}
export async function renderPCM(midiBytes: Uint8Array, bankBytes: Uint8Array, durationMs: number, loop: boolean) {
  SpessaLog.setLogLevel(false, false, false);
  // Upstream declares a floating decoder range. Refuse a second decoder instance/version instead of changing bytes silently.
  if (BasicSoundBank.ready !== StbVorbis.ready) throw new Error('SpessaSynth resolved a different SF3 decoder. Pin its stb-vorbis dependency to 0.0.7 using your package manager overrides, reinstall, and retry.');
  await BasicSoundBank.ready;
  const midi = BasicMIDI.fromArrayBuffer(Uint8Array.from(midiBytes).buffer);
  const bank = SoundBankLoader.fromArrayBuffer(Uint8Array.from(bankBytes).buffer);
  const synth = new SpessaSynthProcessor(SAMPLE_RATE, { eventsEnabled: false, effectsEnabled: true });
  synth.soundBankManager.addSoundBank(bank, 'gm');
  await synth.ready;
  synth.setSystemParameter('autoAllocateVoices', true);
  const seq = new SpessaSynthSequencer(synth);
  seq.loadNewSongList([midi]); seq.loopCount = 0; seq.play();
  const cycle = Math.max(1, Math.round(durationMs * SAMPLE_RATE / 1000));
  if (cycle > SAMPLE_RATE * 600) throw new Error('Music exceeds 10 minutes; split the score into named pieces');
  const count = cycle + SAMPLE_RATE * 12;
  const left = new Float32Array(count), right = new Float32Array(count);
  let silent = 0, end = count;
  for (let i = 0; i < count; i += 128) {
    seq.processTick();
    const size = Math.min(128, count - i);
    synth.process(left, right, i, size);
    if (i >= cycle) {
      let peak = 0;
      for (let j = i; j < i + size; j++) peak = Math.max(peak, Math.abs(left[j]!), Math.abs(right[j]!));
      silent = peak < .0001 ? silent + size : 0;
      if (silent >= SAMPLE_RATE / 4) { end = i + size; break; }
    }
  }
  const channels: Float32Array[] = [left.slice(0, end), right.slice(0, end)];
  for (let c = 0; c < channels.length; c++) {
    let pcm: Float32Array = channels[c]!;
    if (loop) pcm = wrapTail(pcm, cycle);
    else {
      // Includes all release/reverb down to -80dB, with a 20ms guard fade (also bounds pathological sustained presets).
      const fade = Math.min(882, pcm.length);
      for (let i = 0; i < fade; i++) pcm[pcm.length - 1 - i]! *= i / fade;
    }
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.tanh(pcm[i]! * .7) * .95;
    channels[c] = pcm;
  }
  // Normalize musical energy once per piece, preserving its internal dynamics and stereo balance.
  // Sparse GM presets otherwise land around -40 LUFS before track gain/ducking.
  let energy = 0, peak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) {
    peak = Math.max(peak, Math.abs(ch[i]!));
    if (i < cycle) energy += ch[i]! * ch[i]!;
  }
  const rms = Math.sqrt(energy / (cycle * channels.length));
  const gain = rms > .000001 ? Math.min(.1 / rms, .891 / peak) : 1;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i]! *= gain;
  return channels;
}
export async function encodeFlac(channels: Float32Array[]) {
  // Standalone asm.js variant has no WASM/mem sidecar to relocate into disposable resource jobs.
  const Flac = ('default' in FlacModule ? FlacModule.default : FlacModule) as typeof FlacModule;
  if (!Flac.isReady()) await new Promise<void>(resolve => Flac.on('ready', () => resolve()));
  const samples = channels[0]!.length, chunks: Uint8Array[] = [];
  const encoder = Flac.create_libflac_encoder(SAMPLE_RATE, channels.length, 16, 5, samples, true);
  if (!encoder) throw new Error('FLAC encoder allocation failed');
  let md5 = '';
  try {
    if (Flac.init_encoder_stream(encoder, bytes => { chunks.push(Uint8Array.from(bytes)); }, meta => { md5 = meta?.md5sum ?? ''; }) !== 0) throw new Error('FLAC encoder initialization failed');
    for (let start = 0; start < samples; start += 16384) {
      const chunk = channels.map(ch => Int32Array.from(ch.subarray(start, start + 16384), x => Math.round(Math.max(-1, Math.min(1, x)) * 32767)));
      if (!Flac.FLAC__stream_encoder_process(encoder, chunk, chunk[0]!.length)) throw new Error('FLAC PCM encoding failed');
    }
    if (!Flac.FLAC__stream_encoder_finish(encoder)) throw new Error('FLAC finalization failed');
    const bytes = Buffer.concat(chunks);
    // A streaming sink cannot seek back: finalize native FLAC STREAMINFO length and PCM MD5.
    bytes.writeBigUInt64BE((bytes.readBigUInt64BE(18) & ~0xfffffffffn) | BigInt(samples), 18);
    if (md5.length === 32) bytes.set(Buffer.from(md5, 'hex'), 26);
    return new Uint8Array(bytes);
  } finally { Flac.FLAC__stream_encoder_delete(encoder); }
}
