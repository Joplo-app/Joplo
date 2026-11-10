import { afterEach, describe, expect, it, vi } from 'vitest';
import { Project, stateAt, playgroundState } from '@joplo-app/core';
import { DemoController } from '../src/runtime/demo';
import { coverShown } from '../src/player/cover-content';

const project = () => Project.parse({ entryIds: ["f"], schemaVersion: 3, mode:'dev', name:'Playground',
  features:{f:{ alternatives: { 'f.a': { decisionFocus: '', tradeoffs: [], coverage: {},  } }, id:'f',name:'F',goal:'G',pick:'f.a',workIds:['f.a']}},
  works:{'f.a':{ roles: [],id:'f.a',featureId:'f',key:'a',title:'A',summary:'I'}},
  scenes:{'f.a@/':{id:'f.a@/',workId:'f.a',route:'/',name:'Home',root:{id:'root',type:'ui:div',children:[
    {id:'lamp',type:'ui:Switch',props:{checked:'$data.lamp'},traits:{input:'single',native:{action:'toggle',prop:'checked'}}},
    {id:'next',type:'ui:Button',props:{label:'Next'}}, {id:'other',type:'ui:Button',props:{label:'Other'}},
  ]}}},
  plugins:{ui:{id:'ui',title:'UI',components:{Switch:{interactive:true},Button:{interactive:true}}}},
  scenarios:{'f.a.main':{id:'f.a.main',workId:'f.a',name:'Main',mock:{label:'Mock',outcome:'success'},initial:{sceneId:'f.a@/',data:{lamp:true}},steps:[{id:'main:1',kind:'user',caption:'Next',action:{type:'click',target:'next'},effects:[{type:'set',path:'ui.script',value:true}]}]},
    'f.a.other':{id:'f.a.other',workId:'f.a',name:'Other',mock:{label:'Mock',outcome:'success'},initial:{sceneId:'f.a@/'},steps:[{id:'other:1',kind:'user',caption:'Other',action:{type:'click',target:'other'}}]}}});
function controller() { const c = new DemoController(); c.setProject(project(),1); c.setScenario('f.a.main'); return c; }
afterEach(() => vi.useRealTimers());

describe('D88 controller lifecycle', () => {
  it('J1/J6 first stage action pauses and applies locally; resume restores exact scripted state', async () => {
    vi.useFakeTimers(); const c = controller(); const p = c.getSnapshot().project!;
    const playback = c.play();
    await c.act({type:'toggle',target:'lamp',value:false});
    expect(c.getSnapshot()).toMatchObject({playing:true,paused:true,freeMode:true});
    const frozen = c.mediaElapsed(); await vi.advanceTimersByTimeAsync(1000); expect(c.mediaElapsed()).toBe(frozen);
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
  it('an optional after-action entry applies the confirmed gesture once and leaves later steps pending', async () => {
    const c=controller(), p=c.getSnapshot().project!;
    const other=p.scenarios['f.a.other']!;
    Object.assign(other, {actionEntry:'after',autoplay:false});
    other.steps[0]!.effects=[{type:'set',path:'ui.era',value:'new'}];
    other.steps.push({...other.steps[0]!,id:'other:2',kind:'system',action:{type:'event',name:'later'},effects:[{type:'set',path:'ui.later',value:true}]});
    c.setProject(p,2);c.setScenario('f.a.main');
    await c.act({type:'toggle',target:'lamp',value:false});
    await c.act({type:'click',target:'other'});
    c.dismissSwitch();expect(c.getSnapshot().state!.scenarioId).toBe('f.a.main');
    expect(c.getSnapshot().playground).not.toBeNull();
    await c.act({type:'click',target:'other'});c.confirmSwitch(0);
    expect(c.getSnapshot()).toMatchObject({scenarioId:'f.a.other',playing:false,freeMode:false,playground:null,state:{position:1,ui:{era:'new'}}});
    expect(c.getSnapshot().state!.ui.later).toBeUndefined();
    c.confirmSwitch(0);expect(c.getSnapshot().state!.position).toBe(1);
    c.stop();
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
    const snap = c.getSnapshot();
    expect(coverShown(snap.project!.scenarios['f.a.other'], 0, snap.playing, snap.activeStep, snap.freeMode)).toBe(false);
    c.stop();
  });
});


describe('D88 revised first input', () => {
  it.each([
    {type:'toggle' as const,target:'lamp',value:false},
    {type:'click' as const,target:'other'},
    {type:'click' as const,target:'next'},
    {type:'click' as const,target:'missing'},
  ])('J1 same arbitration as a manual pause for $type/$target', async action => {
    vi.useFakeTimers(); const live=controller(), manual=controller();
    void live.play(); void manual.play(); manual.pause();
    await live.act(action); await manual.act(action);
    for (const key of ['state','playground','switchPrompt','notice'] as const) expect(live.getSnapshot()[key]).toEqual(manual.getSnapshot()[key]);
    live.stop(); manual.stop(); await vi.runAllTimersAsync();
  });
  it('J2 blank stage input pauses without a local-change notice', async () => {
    vi.useFakeTimers(); const c=controller(); void c.play(); c.stageInput();
    expect(c.getSnapshot()).toMatchObject({paused:true,freeMode:false,playground:null,notice:null,switchPrompt:null});
    c.stop(); await vi.runAllTimersAsync();
  });
  it('J3 hover while playing neither pauses nor runs arbitration', async () => {
    vi.useFakeTimers(); const c=controller(); void c.play();
    await c.act({type:'hover',target:'next',ms:100});
    expect(c.getSnapshot()).toMatchObject({playing:true,paused:false,freeMode:false,notice:null,state:{position:0}});
    c.stop(); await vi.runAllTimersAsync();
  });
  it('J7 first matching action commits once and stays stopped', async () => {
    vi.useFakeTimers(); const c=controller(); void c.play();
    await c.act({type:'click',target:'next'}); await vi.advanceTimersByTimeAsync(4000);
    expect(c.getSnapshot()).toMatchObject({playing:false,busy:false,state:{position:1,ui:{script:true}}});
    c.stop();
  });
});


describe('D88 interrupted playback boundary', () => {
  it('J7 a matching first action leaves even the following system step pending', async () => {
    vi.useFakeTimers(); const c=controller(); const p=c.getSnapshot().project!;
    p.scenarios['f.a.main']!.steps.push({...p.scenarios['f.a.main']!.steps[0]!,id:'main:2',kind:'system',caption:'Later response',action:{type:'event',name:'response'},effects:[{type:'set',path:'ui.response',value:true}],hold:1000});
    c.setProject(p,2); c.setScenario('f.a.main'); void c.play();
    const action=c.act({type:'click',target:'next'});await vi.advanceTimersByTimeAsync(4000);await action;
    expect(c.getSnapshot()).toMatchObject({playing:false,busy:false,state:{position:1,ui:{script:true}}});
    expect(c.getSnapshot().state!.ui.response).toBeUndefined();c.stop();
  });
});
