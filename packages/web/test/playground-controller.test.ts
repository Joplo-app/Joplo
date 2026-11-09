import { afterEach, describe, expect, it, vi } from 'vitest';
import { Project, stateAt, playgroundState } from '@joplo-app/core';
import { DemoController } from '../src/runtime/demo';

const project = () => Project.parse({schemaVersion:2, mode:'dev', name:'Playground',
  features:{f:{id:'f',name:'F',goal:'G',pick:'f.a',optionIds:['f.a']}},
  options:{'f.a':{id:'f.a',featureId:'f',key:'a',name:'A',idea:'I'}},
  scenes:{'f.a@/':{id:'f.a@/',optionId:'f.a',route:'/',name:'Home',root:{id:'root',type:'ui:div',children:[
    {id:'lamp',type:'ui:Switch',props:{checked:'$data.lamp'},traits:{input:'single',native:{action:'toggle',prop:'checked'}}},
    {id:'next',type:'ui:Button',props:{label:'Next'}}, {id:'other',type:'ui:Button',props:{label:'Other'}},
  ]}}},
  plugins:{ui:{id:'ui',title:'UI',components:{Switch:{interactive:true},Button:{interactive:true}}}},
  scenarios:{'f.a.main':{id:'f.a.main',optionId:'f.a',name:'Main',mock:{label:'Mock',outcome:'success'},initial:{sceneId:'f.a@/',data:{lamp:true}},steps:[{id:'main:1',kind:'user',caption:'Next',action:{type:'click',target:'next'},effects:[{type:'set',path:'ui.script',value:true}]}]},
    'f.a.other':{id:'f.a.other',optionId:'f.a',name:'Other',mock:{label:'Mock',outcome:'success'},initial:{sceneId:'f.a@/'},steps:[{id:'other:1',kind:'user',caption:'Other',action:{type:'click',target:'other'}}]}}});
function controller() { const c = new DemoController(); c.setProject(project(),1); c.setScenario('f.a.main'); return c; }
afterEach(() => vi.useRealTimers());

describe('D88 controller lifecycle', () => {
  it('first stage action only pauses; native changes stay local, resume restores exact scripted state', async () => {
    vi.useFakeTimers(); const c = controller(); const p = c.getSnapshot().project!;
    const playback = c.play();
    await c.act({type:'toggle',target:'lamp',value:false});
    expect(c.getSnapshot()).toMatchObject({playing:true,paused:true,freeMode:true,playground:null});
    const frozen = c.mediaElapsed(); await vi.advanceTimersByTimeAsync(1000); expect(c.mediaElapsed()).toBe(frozen);
    await c.act({type:'toggle',target:'lamp',value:false});
    expect(playgroundState(c.getSnapshot().state!,c.getSnapshot().playground).data.lamp).toBe(false);
    expect(c.getSnapshot().state).toEqual(stateAt(p,'f.a.main',0));
    c.resume(); expect(c.getSnapshot().playground).toBeNull(); expect(c.getSnapshot().freeMode).toBe(false);
    expect(c.getSnapshot().state).toEqual(stateAt(p,'f.a.main',0));
    c.stop(); await playback;
  });
  it.each(['goto','scenario','reset','next','play'] as const)('discards the local layer on %s', async operation => {
    vi.useFakeTimers(); const c = controller();
    await c.act({type:'toggle',target:'lamp',value:false}); expect(c.getSnapshot().playground).not.toBeNull();
    if (operation==='goto') c.goto(0);
    if (operation==='scenario') c.setScenario('f.a.other');
    if (operation==='reset') c.resetPlayground();
    if (operation==='next') void c.next();
    if (operation==='play') void c.play();
    expect(c.getSnapshot().playground).toBeNull();
    c.stop(); await vi.runAllTimersAsync();
  });
  it('requires confirmation, cancellation preserves the local view, switching enters before the matching action', async () => {
    const c=controller();
    await c.act({type:'toggle',target:'lamp',value:false});
    await c.act({type:'click',target:'other'});
    expect(c.getSnapshot().scenarioId).toBe('f.a.main');
    expect(c.getSnapshot().switchPrompt).toMatchObject([{scenarioId:'f.a.other',position:0}]);
    c.dismissSwitch(); expect(c.getSnapshot().playground).not.toBeNull();
    await c.act({type:'click',target:'other'}); c.confirmSwitch(0);
    expect(c.getSnapshot()).toMatchObject({scenarioId:'f.a.other',playground:null,state:{position:0}});
    c.stop();
  });
});
