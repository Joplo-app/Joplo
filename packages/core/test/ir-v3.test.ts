import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { chapter, feature, work, role, layer, say } from '@joplo-app/kit';
import { Text } from '@joplo-app/plugin-ui';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, Project, Feature, SCHEMA_VERSION, rolesOf, roleOfScene } from '../src/index.ts';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
const screen = () => jsx(Text, {children:'Screen'});
const definition = () => work({ title: 'Title', summary: 'Summary', stage: screen(), scenarios: { a: chapter('A').system('A') } });
const source = () => ({ root: '/p', config: {...config({name:'Project'}), file:'joplo.config.ts'}, layouts:{}, routes:{}, features:{}, works:{demo:{...definition(),file:'works/demo.tsx'}} });
describe('IR v3 invariants', () => {
  it('stores standalone works directly and requires an exact entry permutation', () => {
    const result = compile(source(), 'dev'); expect(result.diagnostics).toEqual([]); const p = result.project!;
    expect(SCHEMA_VERSION).toBe(3); expect(Project.safeParse({...p,schemaVersion:2}).success).toBe(false); expect(p.features).toEqual({}); expect(p.entryIds).toEqual(['demo']);
    expect(p.works.demo).toMatchObject({id:'demo',key:'demo',title:'Title',summary:'Summary',roles:[]});
    expect(p.scenarios['demo.a']).toMatchObject({workId:'demo'});
    expect(Project.safeParse({...p,entryIds:[]}).success).toBe(false);
    expect(Project.safeParse({...p,entryIds:['demo','demo']}).success).toBe(false);
    const {entryIds,...missing}=p; expect(Project.safeParse(missing).success).toBe(false);
  });
  it('moves review data to alternatives, uses stage under features and shares role resolution', () => {
    const src:any=source(); delete src.works;
    src.features.f={def:{...feature({name:'Feature',goal:'Goal',roles:{speaker:role('Speaker')},cases:{},pick:'a'}),file:'features/f/feature.ts'},works:{a:{...work({...definition(),stage:undefined,layers:{stage:layer('Stage',screen(),{role:'speaker'})},focus:'Decision',tradeoffs:['Tradeoff'],scenarios:{a:chapter('A').system('A',say('Hi',{role:'speaker'}))}}),file:'features/f/works/a.tsx'}}};
    const result=compile(src,'dev'); expect(result.diagnostics).toEqual([]); const p=result.project!;
    expect(p).not.toBeNull(); expect(p.works['f.a']).toMatchObject({roles:[],title:'Title'});
    expect(p.features.f).toMatchObject({workIds:['f.a'],alternatives:{'f.a':{decisionFocus:'Decision',tradeoffs:['Tradeoff'],coverage:{}}}});
    expect(p.works['f.a']).not.toHaveProperty('tradeoffs'); expect(rolesOf(p,'f.a')[0].id).toBe('speaker');
    expect(roleOfScene(p,'f.a~stage')?.id).toBe('speaker');
    expect(Project.safeParse({...p,features:{f:{...p.features.f,alternatives:{}}}}).success).toBe(false);
    expect(Feature.safeParse({...p.features.f,alternatives:{}}).success).toBe(false);
    const f=p.features.f!;
    for (const feature of [ {...f,workIds:['f.a','f.a']}, {...f,alternatives:{...f.alternatives,extra:{decisionFocus:'',tradeoffs:[],coverage:{}}}} ])
      expect(Project.safeParse({...p,features:{f:feature}}).success).toBe(false);
    expect(Project.safeParse({...p,entryIds:['f.a']}).success).toBe(false);

    src.features.f.works.a= {...definition(),file:'features/f/works/a.tsx'};
    expect(compile(src,'dev').project?.works['f.a']?.layers.stage).toBeTruthy();
    for(const field of ['audience','roles','draft','order']) {
      src.features.f.works.a={...definition(),[field]:field==='audience'?'Audience':field==='roles'?{}:field==='draft'?false:0,file:'features/f/works/a.tsx'};
      const diagnostics=compile(src,'dev').diagnostics; expect(diagnostics.map(d=>d.code)).toContain('WORK_STANDALONE_ONLY'); expect(diagnostics.every(d=>! /\boptions?\b/i.test(d.message))).toBe(true);
    }
  });
});

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAuthoring } from '../src/load.ts';
import { speakerRoleAt, validate, entryOf, entriesOf, scopeProject, embedScenarioIds } from '../src/index.ts';
import { mapV2Capture } from './fixtures/ir-v2-mapping.ts';
it('rejects the retired authoring directory without reading its contents', async () => {
  const root=mkdtempSync(join(tmpdir(),'joplo-old-layout-'));
  try {
    mkdirSync(join(root,'features','f','options'),{recursive:true}); writeFileSync(join(root,'joplo.config.ts'),''); writeFileSync(join(root,'features','f','feature.ts'),'');
    const result=await loadAuthoring(root,async file=>({default:file.endsWith('joplo.config.ts')?config({name:'Project'}):feature({name:'F',goal:'Goal',cases:{}})}));
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({code:'OPTIONS_DIR_RENAMED',severity:'error',message:expect.stringContaining('works/')});
    expect(result.authoring?.features.f?.works).toEqual({});
    expect(result.diagnostics[0]!.message).not.toMatch(/option/i);
  } finally {rmSync(root,{recursive:true,force:true});}
});
it('turns bare-directory import failures into one actionable project configuration error', async () => {
  const root=mkdtempSync(join(tmpdir(),'joplo-bare-'));
  try {
    writeFileSync(join(root,'joplo.config.ts'),'');
    const result=await loadAuthoring(root,async()=>{throw new Error('Unexpected token export');});
    expect(result.authoring).toBeNull(); expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({code:'PROJECT_MODULE_CONFIG',message:expect.stringMatching(/tsconfig.json.*jsxImportSource.*package.json.*module/)});
    const wrapped=await loadAuthoring(root,async()=>({default:{default:config({name:'Bare'})}}));
    expect(wrapped.diagnostics).toEqual([expect.objectContaining({code:'PROJECT_MODULE_CONFIG'})]);
  } finally {rmSync(root,{recursive:true,force:true});}
});
it.each([false,true])('roles flow through layers, explicit say and narration for either placement (feature: %s)', underFeature => {
  const def=work({title:'Role test',summary:'Role routing',roles:{me:role('Speaker')},layers:{world:layer('World',screen(),{role:'me'})},scenarios:{a:chapter('A').system('Speak',say('Hi',{role:'me'}))}});
  const src:any=source();src.works={demo:{...def,file:'works/demo.tsx'}};
  let id='demo';
  if(underFeature){delete src.works;const {roles,...alternative}=def;src.features.f={def:{...feature({name:'F',goal:'G',roles,cases:{},pick:'a'}),file:'features/f/feature.ts'},works:{a:{...alternative,file:'features/f/works/a.tsx'}}};id='f.a';}
  const result=compile(src,'dev');expect(result.diagnostics).toEqual([]);const p=result.project!;
  expect(rolesOf(p,id).map(r=>r.id)).toEqual(['me']);expect(roleOfScene(p,`${id}~world`)?.id).toBe('me');expect(speakerRoleAt(p,`${id}.a`,1)).toBe('me');
  expect(scopeProject(p,[`${id}.a`]).project.voiceConfig).toBeUndefined();expect(validate(p).summary.error).toBe(0);
  const authored=underFeature ? src.features.f.works.a : src.works.demo;
  authored.layers.world.role='missing';
  const diagnostics=compile(src,'dev').diagnostics.filter(d=>d.code==='ROLE_UNKNOWN');
  expect(diagnostics).toHaveLength(1);expect(diagnostics[0]!.message).toContain(underFeature ? 'feature.roles' : 'work.roles');
});
it('keeps mixed entry ordering and direct-work embedding without inferring structure from ids', () => {
  const src:any=source();src.works.demo.order=2;
  src.features.f={def:{...feature({name:'F',goal:'G',cases:{},pick:null,order:1}),file:'features/f/feature.ts'},works:{only:{...definition(),file:'features/f/works/only.tsx'}}};
  const result=compile(src,'dev');expect(result.diagnostics).toEqual([]);const p=result.project!;
  expect(p.entryIds).toEqual(['f','demo']);expect(entriesOf(p).map(e=>e.workId)).toEqual(['f.only','demo']);
  expect(entryOf(p,'f.only')).toBeNull();expect(embedScenarioIds(p)).toEqual(['f.only.a','demo.a']);
  const scoped=scopeProject(p,['demo.a']).project;expect(scoped.features).toEqual({});expect(scoped.entryIds).toEqual(['demo']);expect(Project.safeParse(scoped).success).toBe(true);
});
const captureDir=process.env.JOPLO_IR_V2_BASELINE;
it.skipIf(!captureDir).each(['examples/joplo','examples/invite','examples/midterms-2026','examples/llm-explainer','examples/agent-arch','templates/starter'].flatMap(name=>['dev','publish','review'].map(mode=>({name,mode}))))('matches the captured v2 oracle: $name $mode', async ({name,mode})=>{
  const root=join(import.meta.dirname,'../../..',name);
  const actual=JSON.parse(execFileSync('pnpm',['exec','tsx',join(import.meta.dirname,'fixtures/capture-ir.ts'),root,mode],{encoding:'utf8',maxBuffer:128*1024*1024}));
  const baseline=JSON.parse(readFileSync(join(captureDir!,`${name.replaceAll('/','--')}--${mode}.json`),'utf8'));
  expect(actual).toEqual(mapV2Capture(baseline));
},60_000);
it('the migration oracle rewrites references without editing authored content or its input', () => {
  const baseline={project:{schemaVersion:2,features:{demo:{id:'demo',standalone:true,roles:[]}},featureIds:['demo'],options:{'demo.main':{id:'demo.main',featureId:'demo',key:'main',name:'demo.main',idea:'demo.main.opening',decisionFocus:'',tradeoffs:[],coverage:{},layers:{}}},routes:{},scenes:{},scenarios:{'demo.main.a':{id:'demo.main.a',optionId:'demo.main',initial:{ui:{options:{label:'demo.main'}}}}}},diagnostics:[]};
  const before=structuredClone(baseline), mapped=mapV2Capture(baseline);
  expect(baseline).toEqual(before);expect(mapped.project.works.demo.title).toBe('demo.main');
  expect(mapped.project.works.demo.summary).toBe('demo.main.opening');
  expect(mapped.project.scenarios['demo.a']).toMatchObject({id:'demo.a',workId:'demo',initial:{ui:{options:{label:'demo.main'}}}});
});
