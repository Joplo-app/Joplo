import { expect, it } from 'vitest';
import { wavInfo, sfx } from '../src/sfx.ts';
import { withSoundEffects } from '../src/plugin.ts';
function wav() {
 const b=Buffer.alloc(44+8000); b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(8000,40);
 return 'data:audio/wav;base64,'+b.toString('base64');
}
it('reads exact PCM duration, rejects unknown and truncated assets',()=>{
 expect(wavInfo(wav()).durationMs).toBe(1000);
 expect(()=>wavInfo('data:audio/mpeg;base64,AAAA')).toThrow('PCM WAV');
 expect(()=>wavInfo(wav().slice(0,-8))).toThrow('Truncated');
});
it('lowers one-shot assets through resource cache and validates names/offset/volume',()=>{
 const plugin=withSoundEffects({send:wav()});const errors:string[]=[];
 const ctx={report:(code:string)=>errors.push(code),resource:()=> 'resource-1'};
 const result=plugin.compile!.effect!(sfx.play('send',{volume:.5,offsetMs:200}),ctx as never);
 expect(result).toMatchObject({media:[{action:'play',oneShot:true,durationMs:1000,offsetMs:200,volume:.5,resource:'resource-1'}]});
 for(const effect of [sfx.play('unknown'),sfx.play('send',{volume:NaN}),sfx.play('send',{offsetMs:1000})]) plugin.compile!.effect!(effect,ctx as never);
 expect(errors).toEqual(['SFX_INVALID','SFX_INVALID','SFX_INVALID']);
});
