import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { existsSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { COMPONENT_TYPES } from '../../plugins/ui/src/catalog.ts';

const root=process.cwd();
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):/\.tsx?$/.test(e.name)?[join(dir,e.name)]:[]);
const options:ts.CompilerOptions={moduleResolution:ts.ModuleResolutionKind.Bundler,module:ts.ModuleKind.ESNext,allowImportingTsExtensions:true,jsx:ts.JsxEmit.ReactJSX,paths:{'@/*':['./packages/web/src/*']}};
/** Follow executable imports/re-exports, including dynamic imports; erased types do not enter browsers. */
function dependencyGraph(entries:string[]) {
 const seen=new Set<string>();const edges:Record<string,string[]>={};
 const visit=(file:string)=>{
  file=realpathSync(file);if(seen.has(file))return;seen.add(file);
  const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);const refs:string[]=[];
  const walk=(n:ts.Node)=>{
   if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&!n.importClause?.isTypeOnly){
    const bindings=n.importClause?.namedBindings;
    if(!bindings||ts.isNamespaceImport(bindings)||n.importClause?.name||bindings.elements.some(e=>!e.isTypeOnly)) refs.push(n.moduleSpecifier.text);
   }
   if(ts.isExportDeclaration(n)&&!n.isTypeOnly&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)&&(!n.exportClause||ts.isNamespaceExport(n.exportClause)||n.exportClause.elements.some(e=>!e.isTypeOnly)))refs.push(n.moduleSpecifier.text);
   if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))refs.push(n.arguments[0].text);
   ts.forEachChild(n,walk);
  };walk(ast);
  edges[relative(root,file)]=refs;
  for(const ref of refs){
   if(ref.startsWith('node:'))throw new Error(`Browser dependency ${relative(root,file)} -> ${ref}`);
   const result=ts.resolveModuleName(ref,file,options,ts.sys).resolvedModule;
   if(!result){if(ref.startsWith('.')&&!ref.endsWith('.css'))throw new Error(`Unresolved ${file} -> ${ref}`);continue;}
   const dep=realpathSync(result.resolvedFileName);
   if(!dep.startsWith(root+'/')||dep.includes('/node_modules/')||dep.endsWith('.d.ts')||! /\.tsx?$/.test(dep))continue;
   visit(dep);
  }
 };
 entries.forEach(e=>visit(resolve(e)));return edges;
}
describe('P2 platform boundaries',()=>{
 it('scans every host directory, with only exact author-documentation exemptions',()=>{
  const vocabulary=new Set<string>([...COMPONENT_TYPES.filter(n=>/^[A-Z]/.test(n)), 'Diagram','Diagram.Node','Canvas','StateMachine','Sequence']);
  const documentation=new Set(['packages/core/src/guide.ts','packages/core/src/agent-skill.ts']);
  const hits:string[]=[];
  for(const file of ['packages/core/src','packages/web/src/renderer','packages/web/src/player'].flatMap(files)){
   if(documentation.has(file))continue;
   const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
   const walk=(n:ts.Node)=>{if(ts.isStringLiteralLike(n)&&vocabulary.has(n.text))hits.push(`${file}: ${n.text}`);ts.forEachChild(n,walk);};walk(ast);
  }
  expect(hits).toEqual([]);
 });
 it('checks transitive browser dependencies, not just direct runtime imports',()=>{
  const graph=dependencyGraph(['packages/core/src/runtime.ts','packages/web/src/main.tsx','packages/web/src/site/main.tsx',...['ui','content','diagram','alda'].map(p=>`plugins/${p}/src/runtime.${p==='alda'?'ts':'tsx'}`)]);
  expect(Object.keys(graph).length).toBeGreaterThan(100);
  const forbidden=/(?:packages\/core\/src\/(?:compile|guide|agent-skill|plugins\/compiler|plugins\/legacy|plugins\/standard-catalog)\.ts|plugins\/[^/]+\/src\/(?:plugin|compile|state|machine|elk|legacy|guide|catalog|graph-layout)\.ts)$/;
  expect(Object.keys(graph).filter(file=>forbidden.test(file))).toEqual([]);
 });
});
