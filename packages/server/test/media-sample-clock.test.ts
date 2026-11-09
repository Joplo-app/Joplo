import {expect,it} from 'vitest';
import {EncodedPacket} from 'mediabunny';
import {audioSampleClock} from '../src/media-mux.ts';
it('uses decoded sample durations instead of jittery recorder packet arrival PTS',()=>{
 const packets=[0,.061,.123,98.8].map(timestamp=>new EncodedPacket(new Uint8Array([1]),'key',timestamp,.061));
 const timed=audioSampleClock(packets,[.06,.06,.06,.06]);
 expect(timed.map(p=>p.timestamp)).toEqual([0,.06,.12,.18]);expect(timed.map(p=>p.duration)).toEqual([.06,.06,.06,.06]);expect(timed[3]!.data).toBe(packets[3]!.data);
 expect(()=>audioSampleClock(packets,[.06])).toThrow(/packet/);
});
