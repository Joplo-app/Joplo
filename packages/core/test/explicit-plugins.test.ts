import { expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config, feature, flow, option, page, Fragment } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import ui, { Button } from '@joplo-app/plugin-ui';
import { compile, type AuthoringProject } from '../src/index.ts';
const file='/project/author.tsx';
function source(plugins?:typeof ui[],tree=jsx(Fragment,{children:'Engine only'})):AuthoringProject{
 return {root:'/project',config:{...config({name:'Explicit',home:'/',...(plugins?{plugins}:{})}),file},layouts:{},routes:{'/':{...page({title:'Home',layout:false},tree),file}},features:{f:{def:{...feature({name:'Feature',goal:'Check plugin boundaries',cases:{},pick:'a'}),file},options:{a:{...option({name:'A',idea:'Explicit plugins',scenarios:{s:flow('Scenario',{start:'/'}).system('Observe')}}),file}}}}};
}
test('no config.plugins means no plugins, including an explicit empty list',()=>{
 for(const plugins of [undefined,[]]){
  const result=compile(source(plugins),'publish');
  expect(result.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
  expect(Object.keys(result.project!.plugins??{})).toEqual([]);
 }
});
test('missing declared plugin names its author package and exact config remedy; provenance never enters IR',()=>{
 const tree=jsx(Button,{id:'go',unmodeled:'No action in this fixture',children:'Go'});
 const missing=compile(source([],tree),'publish');
 expect(missing.project).toBeNull();
 const diagnostic=missing.diagnostics.find(d=>d.code==='UNKNOWN_PLUGIN');
 expect(diagnostic?.message).toContain('@joplo-app/plugin-ui');
 expect(diagnostic?.message).toContain('config({ plugins: [plugin] })');
 const enabled=compile(source([ui],tree),'publish');
 expect(enabled.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
 expect(Object.keys(enabled.project!.plugins??{})).toEqual(['ui']);
 expect(JSON.stringify(enabled.project)).not.toMatch(/packageName|skillTopics|node_modules/);
});
test('engine and CLI packages have no concrete plugin imports or dependencies; kit has no component facade',()=>{
 const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):/\.[cm]?[jt]sx?$/.test(e.name)?[join(dir,e.name)]:[]);
 for(const pkg of ['kit','core','cli','server','web']){
  const manifest=JSON.parse(readFileSync(`packages/${pkg}/package.json`,'utf8'));
  expect(Object.keys(manifest.dependencies??{}).filter(k=>k.includes('plugin-'))).toEqual([]);
  for(const file of walk(`packages/${pkg}/src`))expect(readFileSync(file,'utf8'),file).not.toMatch(/(?:from\s*|import\s*\(?)["'](?:@joplo-app\/plugin-|(?:\.\.\/)+plugins\/)/);
 }
 const kit=JSON.parse(readFileSync('packages/kit/package.json','utf8'));
 expect(kit.exports).not.toHaveProperty('./ui');
});
