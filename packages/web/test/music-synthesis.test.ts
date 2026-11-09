import { expect, it } from 'vitest';
import { voiceProfile, envelopeAt, cutoffAt } from '../../../plugins/alda/src/synth.ts';
it('gives piano a struck attack and decaying body instead of a sustained pure tone', () => {
 const piano=voiceProfile(0);
 expect(piano.harmonics!.filter(n=>n>0).length).toBeGreaterThan(3);
 expect(envelopeAt(piano,0,1500)).toBe(0);
 expect(envelopeAt(piano,20,1500)).toBeGreaterThan(envelopeAt(piano,500,1500));
 expect(envelopeAt(piano,500,1500)).toBeGreaterThan(envelopeAt(piano,1100,1500));
 expect(envelopeAt(piano,1500,1500)).toBe(0);
 expect(cutoffAt(piano,600)).toBeLessThan(cutoffAt(piano,20));
});
it('samples the same envelope when entering a held note halfway through, with distinct instrument families', () => {
 const piano=voiceProfile(0),organ=voiceProfile(16),strings=voiceProfile(48);
 expect(envelopeAt(piano,600,1500)).toBeCloseTo(envelopeAt(piano,200+400,1500),12);
 expect(envelopeAt(organ,600,1500)).toBeGreaterThan(envelopeAt(piano,600,1500));
 expect(envelopeAt(strings,10,1500)).toBeLessThan(envelopeAt(strings,100,1500));
 for(const profile of [piano,organ,strings])for(const duration of [2,20,1500])for(let age=0;age<=duration;age++)expect(envelopeAt(profile,age,duration)).toBeGreaterThanOrEqual(0);
});
