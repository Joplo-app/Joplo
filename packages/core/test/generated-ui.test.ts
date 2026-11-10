import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { expect, it } from 'vitest';
import { feature, flow, work, page } from '@joplo-app/kit';
import * as ui from '@joplo-app/plugin-ui';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, explainClick, initialState, type AuthoringProject } from '../src/index.ts';
import { en } from '../../web/src/i18n/en.ts';
import { stepCaption } from '../../web/src/i18n/step-caption.ts';

const h=(type:unknown,props:Record<string,unknown>)=>jsx(type,props);
const tree=jsx(ui.Stack,{children:[h(ui.Button,{id:'button',children:'作者按鈕'}),h(ui.TextInput,{id:'input',label:'作者欄位'}),h(ui.Select,{id:'select',label:'作者選單',data:[{value:'one',label:'作者選項'}]}),h(ui.Checkbox,{id:'check',label:'作者核取'}),h(ui.Switch,{id:'switch',label:'作者開關'}),h(ui.Button,{id:'disabled',disabled:true,children:'作者停用'})]});
const src: AuthoringProject={
  root:'/p',config:{...config({name:'Author project'}),file:'/p/joplo.config.ts'},layouts:{},
  routes:{'/':{...page({title:'Author page',layout:false},tree),file:'/p/routes/page.tsx'}},
  features:{f:{def:{...feature({name:'Author feature',goal:'Author goal',cases:{},pick:'a'}),file:'/p/features/f/feature.ts'},works:{a:{...work({title:'Author work',summary:'Author idea',scenarios:{
    run:flow('Author scenario',{start:'/'}).click('button').type('input','作者輸入').select('select','one').toggle('check',true).toggle('check',false).toggle('switch',true).toggle('switch',false).back().press('Enter').press('').click('button','作者字幕').system('作者事件').card('作者卡片'),
    custom:flow('Author mock',{start:'/',mock:'作者模擬'}),
    failure:flow('Failure',{start:'/',outcome:'failure'}),
    denied:flow('Denied',{start:'/',outcome:'denied'}),
    other:flow('Other',{start:'/',outcome:'other'}),
  }}),file:'/p/features/f/works/a.tsx'}}}},
};

for(const mode of ['dev','publish'] as const) it(`${mode}: preserves structured automatic UI text and author content through schema parsing`,()=>{
  const result=compile(src,mode);
  expect(result.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
  const p=result.project!;
  const steps=p.scenarios['f.a.run']!.steps;
  expect(steps.slice(0,10).map(s=>s.captionAuto?.kind)).toEqual(['click','type','select','check','uncheck','switch_on','switch_off','back','press','press']);
  expect(steps[1]!.captionAuto).toEqual({kind:'type',label:'作者欄位',value:'作者輸入'});
  expect(steps[2]!.captionAuto).toEqual({kind:'select',label:'作者選單',value:'作者選項'});
  expect(steps[8]!.captionAuto).toEqual({kind:'press',label:'',keys:'Enter'});
  expect(steps.slice(10).map(s=>s.caption)).toEqual(['作者字幕','作者事件','作者卡片']);
  expect(steps.slice(10).every(s=>s.captionAuto===undefined)).toBe(true);
  for(const step of steps) expect(stepCaption(step,en)).toBe(step.caption);
  expect(p.scenarios['f.a.custom']!.mock).toEqual({label:'作者模擬',outcome:'success'});
  for(const outcome of ['success','failure','denied','other'] as const){
    const mock=p.scenarios[`f.a.${outcome==='success'?'run':outcome}`]!.mock;
    expect(mock).toMatchObject({auto:true,outcome});
    expect(mock.label).toMatch(/^Mock/);
  }
  expect(explainClick(p,initialState(p,'f.a.run'),'disabled')).toEqual({kind:'disabled',reason:null});
});
