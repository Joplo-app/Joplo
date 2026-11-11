/** Explicit first-party vocabulary for test projects; production has no default plugins. */
import { config, type ConfigDef } from '@joplo-app/kit';
import ui from '../../plugins/ui/src/plugin.ts';
import diagram from '../../plugins/diagram/src/plugin.ts';
import content from '../../plugins/content/src/plugin.ts';
import path from 'node:path';
export const fixturePlugins=[ui,diagram,content];
export const fixtureDocs=Object.fromEntries(fixturePlugins.flatMap(p=>Object.entries(p.components).map(([name,c])=>[`${p.id}:${name}`,c.doc])));
export function fixtureConfig(input:Omit<ConfigDef,'kind'|'source'>):ConfigDef{
  if(input.plugins!==undefined&&!Array.isArray(input.plugins))return config(input);
  const plugins=input.plugins??[];
  return config({...input,plugins:[...fixturePlugins.filter(p=>!plugins.some(x=>x.id===p.id)),...plugins]});
}
/** Embedded author modules in temporary fixtures import the real workspace packages explicitly. */
export function fixtureConfigSource(source:string):string{
  const ids=['Ui','Diagram','Content'];
  const imports=ids.map(name=>`import __fixture${name} from ${JSON.stringify(path.resolve(import.meta.dirname,`../../plugins/${name.toLowerCase()}/src/plugin.ts`))};`).join(' ');
  const names=ids.map(n=>`__fixture${n}`).join(', ');
  const body=/plugins\s*:\s*\[/.test(source)?source.replace(/plugins\s*:\s*\[/,`plugins: [${names}, `):source.replace(/config\s*\(\s*\{/,`config({plugins:[${names}],`);
  return imports+' '+body;
}

import { mkdirSync, existsSync, symlinkSync } from 'node:fs';
/** Temporary projects install explicit author packages, as real npm consumers do. */
export function installFixturePlugins(root:string, additionalPlugins: readonly string[] = []){
 const scope=path.join(root,'node_modules/@joplo-app');mkdirSync(scope,{recursive:true});
 for(const name of ['kit','core'])if(!existsSync(path.join(scope,name)))symlinkSync(path.resolve(import.meta.dirname,`../../packages/${name}`),path.join(scope,name),'dir');
 for(const name of new Set(['ui','diagram','content','alda',...additionalPlugins])){
  const target=path.join(scope,`plugin-${name}`);
  if(!existsSync(target))symlinkSync(path.resolve(import.meta.dirname,`../../plugins/${name}`),target,'dir');
 }
}
