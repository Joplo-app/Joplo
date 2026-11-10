/** 两个会外发文字的看板语音入口都必须在调用供应商前拒绝草稿。 */
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config, work, chapter, narrate } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import ui, { Text } from '@joplo-app/plugin-ui';
import { compile } from '@joplo-app/core';
import { VoiceHub } from '../src/voice-http.ts';
const dirs:string[]=[];afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
it.each(['generate','clip'])('%s 草稿旁白不调用任何外部语音服务',async rest=>{
 const home=mkdtempSync(join(tmpdir(),'joplo-private-voice-'));dirs.push(home);
 const speech=vi.fn();const fetch=vi.fn();
 const hub=new VoiceHub(home,{emit:()=>{},env:{},fetch,cloud:{status:async()=>({signedIn:false,server:'https://example.invalid',loginCommand:'login'}),speech}});
 const p=compile({root:'/p',config:{...config({name:'Test',plugins:[ui]}),file:'joplo.config.ts'},layouts:{},routes:{},features:{},works:{old:{...work({title:'Old',summary:'Private',draft:true,stage:jsx(Text,{children:'PRIVATE_NARRATION'}),scenarios:{one:chapter('Old').system('Speak',narrate('PRIVATE_NARRATION'))}}),file:'works/old.tsx'}}},'dev').project!;
 const segment={stepId:'old.one#1',text:'PRIVATE_NARRATION',role:null};let status=0;let output:unknown;
 await hub.handleProject('p',home,p,rest,{method:'POST'} as never,{} as never,{guardWrite:()=>true,jsonBody:async()=>({ok:true,body:rest==='clip'?{segment}:{segments:[segment]}}),send:(code,body)=>{status=code;output=body;}});
 expect(status).toBe(403);expect(JSON.stringify(output)).toMatch(/draft/i);expect(speech).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
