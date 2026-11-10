import {expect,it} from 'vitest';
import {fixtureConfig as config} from '../../../scripts/test/fixtures.ts';
import {feature,flow,free,work,page,set,$} from '@joplo-app/kit';
import {jsx} from '@joplo-app/kit/jsx-runtime';
import {Stack,Button} from '@joplo-app/plugin-ui';
import {compile,scopeProject,stateAt,arbitrateAction,Project,type AuthoringProject} from '@joplo-app/core';
import {publishPayload} from '../src/build.ts';
const file='/fixture/author.tsx';
const node=(id:string)=>jsx(Button,{id,children:id});
it.each(['publish','review'] as const)('BR-1 preserves all scoped free reactions through %s payload serialization',mode=>{
 const source:AuthoringProject={root:'/fixture',config:{...config({name:'Free',home:'/'}),file},layouts:{},routes:{'/':{...page({title:'Main',layout:false},jsx(Stack,{children:[node('start'),node('avatar'),node('tile'),node('drop')]})),file},'/private':{...page({title:'Private',layout:false},node('secret')),file}},features:{f:{def:{...feature({name:'F',goal:'G',cases:{},pick:'a'}),file},works:{a:{...work({title:'A',summary:'I',free:{profile:free.click('avatar',set($.ui.message,'Profile open')),drag:free.drag('tile','drop',set($.ui.moved,true)),hover:free.hover('avatar',100,set($.ui.hovered,true)),secret:free.click('secret',set($.ui.secret,'Do not publish this'))},scenarios:{s:flow('Main',{start:'/'}).click('start',set($.ui.message,'Sent')),hidden:flow('Hidden',{start:'/private'}).system('Private step')}}),file}}}}};
 const compiled=compile(source,mode);expect(compiled.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
 const scoped=scopeProject(compiled.project!,['f.a.s'],'publish').project;
 const payload=Project.parse(JSON.parse(JSON.stringify(publishPayload(scoped,null).project)));
 expect(payload.works['f.a']!.free).toEqual(scoped.works['f.a']!.free);
 expect(Object.keys(payload.works['f.a']!.free!)).toEqual(['profile','drag','hover']);
 expect(JSON.stringify(payload)).not.toContain('Do not publish this');
 for(const reaction of Object.values(payload.works['f.a']!.free!))expect(reaction).not.toHaveProperty('source');
 for(const action of [{type:'click',target:'avatar'},{type:'drag',target:'tile',to:'drop'},{type:'hover',target:'avatar',ms:100}] as const){
  expect(arbitrateAction(payload,stateAt(payload,'f.a.s',1),action,{sceneId:stateAt(payload,'f.a.s',1).sceneId}).kind).toBe('free');
 }
});
