import { pluginEffect } from '@joplo-app/kit/plugin';
/** Source offset, not a delay; all times use the shared unscaled engine clock. */
export type SfxOptions = { volume?: number; offsetMs?: number; startDelayMs?: number; duck?: boolean };
export const sfx = { play: (name: string, options: SfxOptions = {}) => pluginEffect('media', 'sfx', { name, ...options }) };
/** PCM WAV only: exact duration without codecs, network access or paid generation. */
export function wavInfo(src: unknown): { bytes: Uint8Array; durationMs: number } {
  if (typeof src !== 'string' || !/^data:audio\/(?:wav|wave|x-wav);base64,/i.test(src)) throw new Error('Use asset() with a local PCM WAV file');
  const bytes = Uint8Array.from(Buffer.from(src.slice(src.indexOf(',') + 1), 'base64'));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4));
  if (bytes.length < 44 || text(0) !== 'RIFF' || text(8) !== 'WAVE') throw new Error('Invalid WAV header');
  let rate = 0, block = 0, data = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true), start = at + 8;
    if (start + size > bytes.length) throw new Error('Truncated WAV chunk');
    if (text(at) === 'fmt ') {
      if (size < 16 || view.getUint16(start, true) !== 1) throw new Error('Only PCM WAV is supported');
      rate = view.getUint32(start + 8, true); block = view.getUint16(start + 12, true);
      const channels = view.getUint16(start + 2, true), sampleRate = view.getUint32(start + 4, true), bits = view.getUint16(start + 14, true);
      if (![8,16,24,32].includes(bits) || channels < 1 || channels > 8 || block !== channels * bits / 8 || rate !== sampleRate * block) throw new Error('Invalid PCM format');
    }
    if (text(at) === 'data') data += size;
    at = start + size + size % 2;
  }
  if (!rate || !data || data % block) throw new Error('WAV needs complete PCM samples');
  return { bytes, durationMs: data / rate * 1000 };
}
