import { expect, it } from 'vitest';
import { parseMidi } from '../../../plugins/alda/src/midi.ts';
const midi = (track: number[]) => new Uint8Array([77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,0,0,0,track.length,...track]);
it('reads tempo, running status, pitch, duration and instrument', () => {
 const score = parseMidi(midi([0,255,81,3,7,161,32,0,192,10,0,144,69,100,131,96,69,0,0,255,47,0]));
 expect(score.notes).toEqual([{start:0,end:500,pitch:69,velocity:100/127,program:10,channel:0}]);
 expect(score.duration).toBe(500);
});
it('rejects malformed and SMPTE files with bounded parsing', () => {
 expect(() => parseMidi(new Uint8Array([1,2,3]))).toThrow();
 expect(() => parseMidi(midi([128,128,128,128,128]))).toThrow();
});
it('preserves trailing rests as part of the loop duration', () => {
 const score=parseMidi(midi([0,144,60,90,131,96,128,60,0,131,96,255,47,0]));
 expect(score.notes[0]!.end).toBe(500);expect(score.duration).toBe(1000);
});
