/** Actual author TSX -> Chromium -> static report; film assertion uses the shared export sampling hook. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { renderStep } from '../src/render.ts';
import { renderFilm } from '../src/film.ts';
import { installFixturePlugins } from '../../../scripts/test/fixtures.ts';
let root: string;
beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-layout-runtime-')));
  installFixturePlugins(root);
  fs.symlinkSync(path.resolve('packages/server/node_modules/playwright-core'), path.join(root,'node_modules/playwright-core'));
  const write = (name: string, text: string) => { const file=path.join(root,name); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,text); };
  write('package.json','{"type":"module"}');
  write('tsconfig.json','{"compilerOptions":{"jsx":"react-jsxdev","jsxImportSource":"@joplo-app/kit","module":"ESNext","moduleResolution":"Bundler"}}');
  write('joplo.config.ts',`import {config} from '@joplo-app/kit';import ui from '@joplo-app/plugin-ui';import content from '@joplo-app/plugin-content';export default config({name:'Runtime geometry audit',plugins:[ui,content],theme:'content:studio'});`);
  write('works/film.tsx',`import {$,work,chapter,set,narrate,hold} from '@joplo-app/kit';import {Canvas,camera,cameraSequence} from '@joplo-app/plugin-content';
export default work({title:'Audit film',summary:'Offline geometry',pace:{systemLead:0},state:{ui:{show:false}},stage:<Canvas id="canvas" w={800} h={450} view={[800,450]} drift={false}><div id="clip" style={{position:'absolute',left:20,top:30,width:120,height:40,overflow:'hidden',fontSize:28,whiteSpace:'nowrap'}}>Long bilingual source line 双语署名来源</div><div id="focus" style={{position:'absolute',left:200,top:150,width:300,height:150}}>Subject</div><div id="quote" when={$.ui.show} enter="rise" enterMs={200} style={{position:'absolute',left:300,top:160,width:220,height:80,fontSize:24}}>Important moving quote</div><div id="stamp" style={{position:'absolute',left:780,top:10,width:180}}>Intentional stamp</div></Canvas>,scenarios:{one:chapter('Audit').system('Enter',set($.ui.show,true),camera('focus',{ms:100,drift:{x:80,zoom:1,ms:500}}),narrate(false),hold(1.5)).system('Path',cameraSequence([{atMs:0,target:'focus'},{atMs:300,target:'clip'}]),narrate(false),hold(.5))}});`);
});
afterAll(() => { if (!process.env.JOPLO_LAYOUT_KEEP) fs.rmSync(root,{recursive:true,force:true}); });
it.each([[800,450],[360,640]])('static real project reports source and actual bounds at %sx%s', async (width,height) => {
  const out=path.join(root,`static-${width}.png`);
  const result=await renderStep({projectDir:root,scenarioId:'film.one',out,logicalViewport:{width,height},noFrame:true,auditLayout:{important:['[data-jid="quote"]'],exclude:['[data-jid="stamp"]']}});
  const report=JSON.parse(fs.readFileSync(result.audit!.path,'utf8'));
  expect(report.samples[0]).toMatchObject({atMs:null,timeBasis:'static-final-state',scenarioId:'film.one',workId:'film',stepId:null,evidence:out});
  expect(report.samples[0].findings.some((f:{code:string;elementId:string;source:string})=>f.code==='TEXT_CLIPPED'&&f.elementId==='clip'&&f.source.includes('works/film.tsx:'))).toBe(true);
  expect(fs.statSync(out).size).toBeGreaterThan(1000);
},60000);
it('samples real commit, entry end, drift mid/end and camera waypoints on the export clock', async () => {
  const out=path.join(root,'film.png');
  const result=await renderFilm({projectDir:root,scenarioId:'film.one',out,logicalViewport:{width:400,height:225},noFrame:true,voice:'estimate',sampleMs:50,every:1000,auditLayout:{important:['[data-jid="quote"]'],exclude:['[data-jid="stamp"]'],everyMs:1000}});
  const report=JSON.parse(fs.readFileSync(result.audit!.path,'utf8'));
  const phases=report.samples.flatMap((s:{phases:string[]})=>s.phases);
  expect(phases).toEqual(expect.arrayContaining(['post-commit','enter-end','drift-mid','drift-end','camera-waypoint']));
  expect(report.samples.filter((s:{position:number})=>s.position>0).every((s:{stepId:string;atMs:number})=>s.stepId?.startsWith('film.one#')&&Number.isFinite(s.atMs))).toBe(true);
  expect(report.samples.some((s:{evidence:string})=>s.evidence&&fs.existsSync(s.evidence))).toBe(true);
},120000);
