import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config, feature, flow, option, page, set, $ } from '@joplo-app/kit';
import { definePlugin, pluginComponent } from '@joplo-app/kit/plugin';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { Button, Modal } from '@joplo-app/kit/ui';
import { compile, type AuthoringProject } from '../src/compile.ts';
import { applyStep, initialState, stateAt, isNodeVisible, choicesOf } from '../src/player.ts';
import { visibleIds } from '../src/focus.ts';
import { readPublicProject, featureDiff } from '../src/feature-diff.ts';
const file = '/p/test.tsx';
function source(tree: any, plugins: any[] = [], steps = flow('S', {start:'/'}).system('One')): AuthoringProject {
 return {root:'/p',config:{...config({name:'Test',plugins}),file},layouts:{},routes:{'/':{...page({title:'Home'},tree),file}},features:{f:{def:{...feature({name:'F',goal:'g',cases:{},pick:'a'}),file},options:{a:{...option({name:'A',idea:'i',on:{},state:{ui:{open:false}},scenarios:{s:steps}}),file}}}}};
}
const h = (type: unknown, props: Record<string,unknown>={}) => jsx(type, props);

describe('P2 declaration-driven semantics',()=>{
 it('uses the default ui namespace without changing author imports or HTML syntax',()=>{
  const p = compile(source(h('div',{children:[h(Button,{id:'go',unmodeled:true}),h(Modal,{id:'gate'})]})),'dev').project!;
  const root = p.scenes['f.a@/']!.root;
  expect(root.type).toBe('ui:div'); expect(root.children!.map(n=>n.type)).toEqual(['ui:Button','ui:Modal']);
  expect(p.plugins?.ui?.components.Button?.interactive).toBe(true);
 });
 it('plays third-party input, choices, gating, inheritance and viewport declarations using JSON alone',()=>{
  const p = definePlugin({id:'probe',title:'Probe',runtime:'/probe.js',components:{
   Root:{doc:'root',inherit:[{target:'probe:Gate',props:['expanded']}]},
   Gate:{doc:'gate',traits:{gate:['expanded'],selfEvident:true}},
   Field:{doc:'field',interactive:true,traits:{input:'multiple',choices:{prop:'options'}}},
   Device:{doc:'device',traits:{childWidth:{value:390}}},
   Layout:{doc:'layout',traits:{layout:{rail:{size:'width',defaultSize:200,breakpoint:true}}}},
   Rail:{doc:'rail',traits:{region:'rail'}},
  }} as any);
  const c=(name:string,props:Record<string,unknown>={})=>h(pluginComponent(p,name),props);
  const tree=c('Root',{expanded:$.ui.open,children:[c('Gate',{id:'gate',children:c('Field',{id:'field',options:[{value:'a',label:'Alpha'},{value:'b',label:'Beta'}]})}),c('Device',{children:c('Layout',{rail:{breakpoint:'sm',width:180},children:c('Rail',{id:'rail'})})})]});
  const r=compile(source(tree,[p],flow('S',{start:'/'}).system('Open',set($.ui.open,true)).select('field','Alpha').select('field','Beta').select('field','Alpha')),'dev');
  expect(r.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
  const project=JSON.parse(JSON.stringify(r.project)); const scene=project.scenes['f.a@/'];
  let state=initialState(project,'f.a.s');
  expect(isNodeVisible(scene,'field',state)).toBe(false); expect(visibleIds(scene,state).has('rail')).toBe(false);
  for(let position=1;position<=4;position++){state=applyStep(project,project.scenarios['f.a.s'],state);expect(stateAt(project,'f.a.s',position)).toEqual(state);}
  expect(state.inputs.field).toEqual(['b']); expect(isNodeVisible(scene,'field',state)).toBe(true);
  expect(choicesOf(scene.root.children[0].children[0],state)).toEqual([{value:'a',label:'Alpha'},{value:'b',label:'Beta'}]);
 });
 it('rejects invalid semantic declarations instead of silently dropping them',()=>{
  const p=definePlugin({id:'probe',title:'Probe',runtime:'/probe.js',components:{Item:{doc:'item',traits:{input:'typo'}}}} as any);
  expect(compile(source(h(pluginComponent(p,'Item')),[p]),'dev').diagnostics.map(d=>d.code)).toContain('PLUGIN_TRAITS_INVALID');
 });
 it('explains old bare names and gives a clear result for pre-migration public IR',()=>{
  const r=compile(source(h('Button',{id:'go'})),'dev');
  expect(r.diagnostics.find(d=>d.code==='PLUGIN_LEGACY_TYPE')?.message).toContain('ui:Button');
  const project=compile(source(h(Button,{id:'go',unmodeled:true})),'publish').project!;
  for(const s of Object.values(project.scenes)) s.root.type='Button';
  delete project.plugins!.ui;
  // Old shares carry their own renderer; a current diff must adapt or explicitly reject, never silently change semantics.
  try { const old=readPublicProject(project); expect(Object.values(old.scenes)[0]!.root.type).toBe('ui:Button'); }
  catch(e){expect(String(e)).toMatch(/incompatible.*ui|ui.*rebuild/i);}
 });
});

it('P2 core and rendering/playback hosts contain no component dispatch, including plugins directories',()=>{
 const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):/\.tsx?$/.test(e.name)?[join(dir,e.name)]:[]);
 // These two sources are author-facing guides, not executable component vocabulary or playback semantics.
 const documentation=new Set(['packages/core/src/guide.ts','packages/core/src/agent-skill.ts']);
 const forbidden=/\b(?:Button|Modal|Drawer|Menu|AppShell|Phone|DataCard|StateFlow|MultiSelect|Checkbox|Diagram|StateMachine|Sequence|Canvas)\b/;
 const hits=['packages/core/src','packages/web/src/renderer','packages/web/src/player'].flatMap(files).filter(f=>!documentation.has(f)&&forbidden.test(readFileSync(f,'utf8')));
 expect(hits).toEqual([]);
});

it('reports a real 237f0a6 public share as incompatible UI IR instead of pretending to compare',()=>{
 const old=JSON.parse(readFileSync(new URL('./fixtures/legacy-ui-publish.json',import.meta.url),'utf8'));
 expect(()=>readPublicProject(old)).toThrow(/incompatible.*ui.*rebuild/i);
 const current=compile(source(h(Button,{id:'go',unmodeled:true})),'publish').project!;
 expect(featureDiff(old,current)).toMatchObject({status:'incompatible',scenarios:[],reasons:['plugin-vocabulary: rebuild both versions with the current kit']});
});

it('component inventory and translations follow each enabled plugin declaration',async()=>{
 const {componentDetails,skillTopic}=await import('../src/guide.ts');
 const {localizeProject,collectMessages}=await import('../src/content-i18n.ts');
 const plugin=definePlugin({id:'probe',title:'Probe',runtime:'/probe.js',components:{Label:{doc:'only headline is displayed',traits:{text:['headline'],textPaths:[['columns','*','title']]},example:'<Label headline="Run"/>'}}});
 const r=compile(source(h(pluginComponent(plugin,'Label'),{id:'label',headline:'Run',enum:'Run',columns:[{title:'Run',color:'Run'}]}),[plugin]),'dev');
 const p=r.project!;p.i18n={default:'en',locales:['en','ja'],messages:{ja:{Run:'実行'}}};
 expect(collectMessages(p).some(m=>m.text==='Run')).toBe(true);
 const node=localizeProject(p,'ja').scenes['f.a@/']!.root;
 expect(node.props).toEqual({headline:'実行',enum:'Run',columns:[{title:'実行',color:'Run'}]});
 expect(componentDetails(['Label'],[plugin])).toContain('<Label headline="Run"/>');
 const overview=skillTopic('components',null,[plugin]);
 expect(overview).toContain('probe:Label');expect(overview).not.toContain('- ui:Button:');
});
