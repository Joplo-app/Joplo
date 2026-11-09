import '../../../scripts/test/render-fixtures.ts';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { $, config, feature, flow, option, page } from '@joplo-app/kit';
import ui, { PromptInput } from '@joplo-app/plugin-ui';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { applyPlayground, arbitrateAction, compile, playgroundState, stateAt, type AuthoringProject } from '@joplo-app/core';
import { I18nProvider } from '../src/i18n/context';
import { Stage } from '../src/renderer/Stage';
function project(disabled=false) {
  const file='/test/prompt.tsx';
  const source:AuthoringProject={root:'/test',config:{...config({name:'Prompt',plugins:[ui]}),file},layouts:{},
    routes:{'/':{...page({title:'Compose',layout:false},jsx(PromptInput,{id:'prompt',value:$.ui.draft,placeholder:'Write a message',disabled,disabledReason:'Unavailable'})),file}},
    features:{f:{def:{...feature({name:'Compose',goal:'Try a prompt',cases:{},pick:'a'}),file},options:{a:{...option({name:'A',idea:'Try',state:{ui:{draft:'Initial'}},scenarios:{s:flow('Write').type('prompt','Scripted')}}),file}}}}};
  const result=compile(source,'dev');expect(result.diagnostics.filter(d=>d.severity==='error')).toEqual([]);return result.project!;
}
describe('PromptInput exploration',()=>{
  it('renders a real editable textarea in demo mode, read-only for captures and disabled controls',()=>{
    for(const disabled of [false,true]){
      const p=project(disabled);
      for(const mode of ['demo','render'] as const){
        const html=renderToStaticMarkup(<I18nProvider explicit="en"><Stage project={p} state={stateAt(p,'f.a.s',0)} theme="clean" mode={mode} animate={false} onAction={()=>{}} /></I18nProvider>);
        expect(html).toMatch(/<textarea[^>]*>Initial<\/textarea>/);
        expect(html.includes('readOnly=""')).toBe(mode==='render'||disabled);
      }
    }
  });
  it('keeps arbitrary edits local, synchronizes a value binding and restores the scripted frame',()=>{
    const p=project(),timeline=stateAt(p,'f.a.s',0);
    const result=arbitrateAction(p,timeline,{type:'type',target:'prompt',value:'A real\nmessage'});
    expect(result.kind).toBe('free');if(result.kind!=='free')throw new Error('Expected a native edit');
    const layer=applyPlayground(null,result.effects);
    expect(playgroundState(timeline,layer)).toMatchObject({inputs:{prompt:'A real\nmessage'},ui:{draft:'A real\nmessage'}});
    expect(playgroundState(timeline,null).ui.draft).toBe('Initial');
    expect(stateAt(p,'f.a.s',1).inputs.prompt).toBe('Scripted');
  });
});
