import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { feature, flow, work, page, set, $ } from '@joplo-app/kit';
import { definePlugin, pluginComponent } from '@joplo-app/kit/plugin';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { Button, Modal } from '@joplo-app/plugin-ui';
import { compile, type AuthoringProject } from '../src/compile.ts';
import { applyStep, initialState, stateAt, isNodeVisible, choicesOf } from '../src/player.ts';
import { visibleIds } from '../src/focus.ts';
import { readPublicProject, featureDiff } from '../src/feature-diff.ts';
const file = '/p/test.tsx';
function source(tree: any, plugins: any[] = [], steps = flow('S', {start:'/'}).system('One')): AuthoringProject {
 return {root:'/p',config:{...config({name:'Test',plugins}),file},layouts:{},routes:{'/':{...page({title:'Home'},tree),file}},features:{f:{def:{...feature({name:'F',goal:'g',cases:{},pick:'a'}),file},works:{a:{...work({title:'A',summary:'i',on:{},state:{ui:{open:false}},scenarios:{s:steps}}),file}}}}};
}
const h = (type: unknown, props: Record<string,unknown>={}) => jsx(type, props);

describe('P2 declaration-driven semantics',()=>{
 it('uses the default ui namespace without changing author imports or HTML syntax',()=>{
  const p = compile(source(h('div',{children:[h(Button,{id:'go',unmodeled:true}),h(Modal,{id:'gate'})]})),'dev').project!;
  const root = p.scenes['f.a@/']!.root;
  expect(root.type).toBe('ui:div'); expect(root.children!.map(n=>n.type)).toEqual(['ui:Button','ui:Modal']);
  expect(p.plugins?.ui?.components.Button?.interactive).toBe(true);
  // 显示名只给本地看板：dev IR 有，发布与评审版去掉
  expect(p.plugins?.ui?.components.Button?.label).toMatchObject({ en: expect.any(String), 'zh-CN': expect.any(String) });
  for (const mode of ['publish','review'] as const) expect(compile(source(h('div',{children:[h(Button,{id:'go',unmodeled:true})]})),mode).project!.plugins?.ui?.components.Button).not.toHaveProperty('label');
 });
 it('plays third-party input, choices, gating, inheritance and viewport declarations using JSON alone',()=>{
  const p = definePlugin({id:'probe',title:'Probe',runtime:'/probe.js',components:{
   Root:{doc:'root',inherit:[{target:'probe:Gate',props:['expanded']}]},
   Gate:{doc:'gate',traits:{gate:['expanded'],selfEvident:true}},
   Field:{doc:'field',interactive:true,traits:{input:'multiple',choices:{prop:'works'}}},
   Device:{doc:'device',traits:{childWidth:{value:390}}},
   Layout:{doc:'layout',traits:{layout:{rail:{size:'width',defaultSize:200,breakpoint:true}}}},
   Rail:{doc:'rail',traits:{region:'rail'}},
  }} as any);
  const c=(name:string,props:Record<string,unknown>={})=>h(pluginComponent(p,name),props);
  const tree=c('Root',{expanded:$.ui.open,children:[c('Gate',{id:'gate',children:c('Field',{id:'field',works:[{value:'a',label:'Alpha'},{value:'b',label:'Beta'}]})}),c('Device',{children:c('Layout',{rail:{breakpoint:'sm',width:180},children:c('Rail',{id:'rail'})})})]});
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

});

it('P2 core and rendering/playback hosts contain no component dispatch, including plugins directories',()=>{
 const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):/\.tsx?$/.test(e.name)?[join(dir,e.name)]:[]);
 // These two sources are author-facing guides, not executable component vocabulary or playback semantics.
 const documentation=new Set(['packages/core/src/guide.ts','packages/core/src/agent-skill.ts']);
 const forbidden=/\b(?:Button|Modal|Drawer|Menu|AppShell|Phone|DataCard|StateFlow|MultiSelect|Checkbox|Diagram|StateMachine|Sequence|Canvas)\b/;
 const hits=['packages/core/src','packages/web/src/renderer','packages/web/src/player'].flatMap(files).filter(f=>!documentation.has(f)&&forbidden.test(readFileSync(f,'utf8')));
 expect(hits).toEqual([]);
 // 看板、控制器、服务端与 CLI 也不认识任何插件的类型名或专属 DOM 标记：组件的显示名、检查抽屉的信息行、
 // 效果时长都由插件清单声明（label / inspect / holdMs），宿主只照着数据做
 const qualified=/['"`](?:ui|diagram|content|scene3d|code|media|alda):[A-Za-z]|data-jdot/;
 const named=['packages/web/src','packages/server/src','packages/cli/src','packages/kit/src'].flatMap(files).filter(f=>!f.includes('/i18n/')&&qualified.test(readFileSync(f,'utf8')));
 expect(named).toEqual([]);
});

it('only the in-repo standard library uses the first-party internal contract layer', () => {
 const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==='node_modules'?[]:e.isDirectory()?files(join(dir,e.name)):/\.tsx?$/.test(e.name)?[join(dir,e.name)]:[]);
 // 标准库（与引擎同版本发布）可以用内部层；可选插件（3d / code / media / alda）将来迁到二方库，只能依赖稳定层
 const standard=new Set(['ui','diagram','content']);
 const internalTraits=/\b(?:selectionGate|disabledPresentation|toggleCaption|childWidth|choices|gate|layout|region)\s*:/;
 for(const name of readdirSync('plugins')) {
  if(standard.has(name)) continue;
  const sources=files(join('plugins',name,'src'));
  expect(sources.filter(f=>readFileSync(f,'utf8').includes('@joplo-app/kit/renderer-internal')),name).toEqual([]);
  // 清单入口里不声明标准库内部层的特性
  const manifest=sources.filter(f=>/\/(?:plugin|index)\.ts$/.test(f)).filter(f=>{const text=readFileSync(f,'utf8');const m=/traits:\s*\{([^}]*)\}/g;let hit=false;for(const t of text.matchAll(m))if(internalTraits.test(t[1]!))hit=true;return hit;});
  expect(manifest,name).toEqual([]);
 }
});



it('component inventory and translations follow each enabled plugin declaration',async()=>{
 const {componentDetails,componentIndex}=await import('../src/guide.ts');
 const {localizeProject,collectMessages}=await import('../src/content-i18n.ts');
 const plugin=definePlugin({id:'probe',title:'Probe',runtime:'/probe.js',components:{Label:{doc:'only headline is displayed',traits:{text:['headline'],textPaths:[['columns','*','title']]},example:'<Label headline="Run"/>'}}});
 const r=compile(source(h(pluginComponent(plugin,'Label'),{id:'label',headline:'Run',enum:'Run',columns:[{title:'Run',color:'Run'}]}),[plugin]),'dev');
 const p=r.project!;p.i18n={default:'en',locales:['en','ja'],messages:{ja:{Run:'実行'}}};
 expect(collectMessages(p).some(m=>m.text==='Run')).toBe(true);
 const node=localizeProject(p,'ja').scenes['f.a@/']!.root;
 expect(node.props).toEqual({headline:'実行',enum:'Run',columns:[{title:'実行',color:'Run'}]});
 expect(componentDetails(['Label'],[plugin])).toContain('<Label headline="Run"/>');
 const overview=componentIndex([plugin]);
 expect(overview).toContain('probe:Label');expect(overview).not.toContain('- ui:Button:');
});
