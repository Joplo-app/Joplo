import {expect,it} from 'vitest';
import {encodeMusic} from '../src/mp3.ts';
it('encodes deterministic 96kbps MP3 with measured delay and numeric cycle/trim metadata',async()=>{
 const n=44100*2;const pcm=[0,1].map(c=>Float32Array.from({length:n},(_,i)=>.12*Math.sin(i*.071+c)*(.7+.3*Math.sin(i*.009))));
 const a=await encodeMusic(pcm,n,true),b=await encodeMusic(pcm,n,true);
 expect(a.bytes).toEqual(b.bytes);expect(a.audio.cycleFrames).toBe(64000);expect(a.audio.encoderDelayFrames).toBeGreaterThan(0);expect(a.audio.contentStartFrame).toBeGreaterThan(a.audio.encoderDelayFrames);
 expect(a.bytes.length).toBeLessThan(30000);expect(a.audio.contentFrames).toBe(64000);expect(a.audio.decodedFrames).toBeGreaterThan(64000);
});
it('ships the exact verified SoundFont license with self-contained local compiler data',async()=>{
 const {readFile}=await import('node:fs/promises');const {createHash}=await import('node:crypto');
 const {default:license}=await import('../src/soundfont-license.ts');const {SOUNDFONT}=await import('../src/soundfont.ts');
 const bytes=await readFile(new URL('../src/soundfont-license.txt',import.meta.url));
 expect(createHash('sha256').update(bytes).digest('hex')).toBe(SOUNDFONT.licenseSha256);
 expect(Buffer.from(license)).toEqual(bytes);
});
