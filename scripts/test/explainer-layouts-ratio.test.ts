import { expect, it } from 'vitest';
import { ratioParts } from '../../examples/explainer-layouts/shared/ratio.ts';
it('preserves undecided counts and positions thresholds against the full total',()=>{expect(ratioParts(43,37,100,51)).toEqual({left:43,right:37,undecided:20,threshold:51});expect(ratioParts(0,0,10,0)).toEqual({left:0,right:0,undecided:100,threshold:0});});
it.each([[60,50,100],[-1,10,100],[1,2,0],[NaN,1,100]])('rejects invalid count totals',(...args)=>expect(()=>ratioParts(...args as [number,number,number])).toThrow());
it('rejects an out-of-range threshold',()=>expect(()=>ratioParts(1,1,10,11)).toThrow());
