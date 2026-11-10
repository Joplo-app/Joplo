import { it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PluginKeyStore } from '../src/plugin-keys.ts';
import { LocalResources } from '../src/local-resources.ts';
const declaration = { id:'api', title:'Model API', description:'Generate models', url:'https://example.com/keys', env:'MODEL_TEST_KEY' };
it('stores 0600, prefers env, isolates plugins and only exposes presence', () => {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'plugin-keys-'));
  try {
    const store=new PluginKeyStore(home,{}); store.save('alpha',declaration,'saved-secret');
    expect(fs.statSync(store.file('alpha','api')).mode & 0o777).toBe(0o600);
    expect(store.resolve('alpha',[declaration])).toEqual({api:'saved-secret'});
    expect(store.resolve('beta',[declaration])).toEqual({});
    expect(new PluginKeyStore(home,{MODEL_TEST_KEY:' env-secret '}).resolve('alpha',[declaration])).toEqual({api:'env-secret'});
    expect(JSON.stringify(store.status('alpha',declaration))).not.toContain('saved-secret');
    expect(()=>store.save('../escape',declaration,'key')).toThrow();
    store.save('alpha',declaration,null);expect(store.status('alpha',declaration).saved).toBe(false);
  } finally {fs.rmSync(home,{recursive:true,force:true});}
});
it('only injects declared own keys for authorized generation; redacts compiler errors and output', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'plugin-key-host-'));
  const home=path.join(root,'home'), entry=path.join(root,'local.ts');
  const store=new PluginKeyStore(home,{});store.save('alpha',declaration,'private-alpha');store.save('beta',declaration,'private-beta');
  fs.writeFileSync(entry,`export default {compilers:{test:{version:'1',mime:'text/plain',compile(input,ctx){
    if(process.env.MODEL_TEST_KEY || process.env.OTHER_PLUGIN_KEY || ctx.home)throw Error('environment isolation failed');
    if(ctx.cacheDir!==${JSON.stringify(path.join(home,'plugins','alpha','cache'))})throw Error('cache dir is not plugin-private');
    if(input==='offline'){if(Object.keys(ctx.keys).length)throw Error('unrequested keys');return new Uint8Array([1]);}
    if(ctx.keys.api !== 'private-alpha' || Object.keys(ctx.keys).length!==1)throw Error('key isolation failed');
    if(input==='error'){console.error(ctx.keys.api);throw Object.assign(Error(ctx.keys.api),{code:'LOCAL_RESOURCE_'+ctx.keys.api});}
    return new TextEncoder().encode(ctx.keys.api);
  }}}}`);
  vi.stubEnv('OTHER_PLUGIN_KEY','private-beta-env');
  const host=new LocalResources(root,{alpha:entry},{alpha:[declaration]});
  try {
    const req={id:'r',plugin:'alpha',compiler:'test',input:'error'};
    expect((await host.ensure({...req,input:'offline'},{home})).url).toBeDefined();
    const result=await host.ensure(req,{allowSpend:true,home});
    expect(result.diagnostic?.message).toContain('[REDACTED]');expect(JSON.stringify(result)).not.toContain('private-alpha');
    const output=await host.ensure({...req,input:'output'},{allowSpend:true,home});
    expect(output.url).toBeUndefined();expect(JSON.stringify(output)).not.toContain('private-alpha');
    const persisted=fs.readdirSync(path.join(root,'.joplo/resources')).filter(f=>f.endsWith('.json')).map(f=>fs.readFileSync(path.join(root,'.joplo/resources',f),'utf8')).join('');
    expect(persisted).not.toContain('private-alpha');
    expect(persisted).not.toContain('private-beta');
  }finally{vi.unstubAllEnvs();fs.rmSync(root,{recursive:true,force:true});}
});
it('routes current project declarations through guarded cards and keeps credentials out of IR, site and logs', async () => {
  const { createDev }=await import('../src/dev.ts');
  const { buildSite }=await import('../src/build.ts');
  const { fixtureConfigSource, installFixturePlugins }=await import('../../../scripts/test/fixtures.ts');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'plugin-key-project-'));
  const home=path.join(root,'home'),logs:string[]=[];
  installFixturePlugins(root);
  const pluginPath=path.resolve('packages/kit/src/plugin.ts');
  fs.writeFileSync(path.join(root,'runtime.ts'),`export default {id:'alpha',apiVersion:2,components:{}};`);
  fs.writeFileSync(path.join(root,'local.ts'),`export default {compilers:{}};`);
  fs.writeFileSync(path.join(root,'joplo.config.ts'),fixtureConfigSource(`import {config} from '@joplo-app/kit';import {definePlugin} from ${JSON.stringify(pluginPath)};const alpha=definePlugin({id:'alpha',title:'Alpha',components:{},runtime:new URL('./runtime.ts',import.meta.url),local:new URL('./local.ts',import.meta.url),keys:[${JSON.stringify(declaration)}]});export default config({name:'Key test',home:'/',plugins:[alpha]});`));
  fs.mkdirSync(path.join(root,'routes'),{recursive:true});fs.writeFileSync(path.join(root,'routes/page.tsx'),`import {page} from '@joplo-app/kit';export default page({title:'Home'},<p>Public content</p>);`);
  fs.mkdirSync(path.join(root,'features/f/works'),{recursive:true});
  fs.writeFileSync(path.join(root,'features/f/feature.ts'),`import {feature} from '@joplo-app/kit';export default feature({name:'F',goal:'G',pick:'a',cases:{}});`);
  fs.writeFileSync(path.join(root,'features/f/works/a.tsx'),`import {option,flow} from '@joplo-app/kit';export default work({title:'A',summary:'I',scenarios:{main:flow('Main',{start:'/'}).system('Ready')}});`);
  const dev=await createDev({projectDir:root,port:0,home,log:message=>logs.push(message)});
  const url=`${dev.url}__joplo/p/${dev.projectId}/plugin-keys`;
  const headers={'x-joplo-token':dev.token,'content-type':'application/json'};
  try {
    expect((await fetch(url)).status).toBe(403);
    const cards=await (await fetch(url,{headers})).json();expect(cards).toMatchObject([{plugin:'alpha',id:'api',saved:false}]);
    const put=(suffix:string,body:unknown,extra={})=>fetch(url+suffix,{method:'PUT',headers:{...headers,...extra},body:JSON.stringify(body)});
    expect((await put('/beta/api',{key:'private-alpha'})).status).toBe(404);
    expect((await put('/alpha/api',{key:'private-alpha'},{origin:'https://evil.example'})).status).toBe(403);
    const saved=await (await put('/alpha/api',{key:'private-alpha'})).json();expect(saved.saved).toBe(true);expect(JSON.stringify(saved)).not.toContain('private-alpha');
    expect(new PluginKeyStore(home,{}).resolve('alpha',[declaration])).toEqual({api:'private-alpha'});
    const ir=JSON.stringify(dev.payload());expect(ir).not.toMatch(/private-alpha|MODEL_TEST_KEY|Generate models/);
    const built=await buildSite({projectDir:root,outDir:path.join(root,'build')});expect(built.files).toContain('index.html');
    const html=fs.readFileSync(path.join(root,'build/index.html'),'utf8');expect(html).not.toMatch(/private-alpha|MODEL_TEST_KEY|Generate models/);
    expect(logs.join('\n')).not.toContain('private-alpha');
    expect((await (await put('/alpha/api',{key:null})).json()).saved).toBe(false);
  }finally{await dev.close();fs.rmSync(root,{recursive:true,force:true});}
},30000);

it('honors JOPLO_HOME for the generic store without touching the real home', () => {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'plugin-keys-home-'));
  vi.stubEnv('JOPLO_HOME',home);
  try {const store=new PluginKeyStore();store.save('alpha',declaration,'local');expect(store.file('alpha','api')).toBe(path.join(home,'plugins/alpha/keys/api.json'));}
  finally {vi.unstubAllEnvs();fs.rmSync(home,{recursive:true,force:true});}
});
