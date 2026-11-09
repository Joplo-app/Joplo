import { expect, it } from 'vitest';
import { config, feature, flow, option, page, hold } from '@joplo-app/kit';
import { definePlugin, pluginEffect } from '@joplo-app/kit/plugin';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject } from '../src/compile.ts';
import { mediaAt } from '../src/media.ts';
import { scopeProject } from '../src/scope.ts';
import { localizeProject } from '../src/content-i18n.ts';
import { stateAt } from '../src/player.ts';
const fake = definePlugin({ id: 'fake', title: 'Fake WAV', components: {}, runtime: '/runtime.js', local: '/local.js', compile: {
  effect(e, ctx) { return { media: e.name === 'stop' ? [{ track: 'bgm', action: 'stop', fadeMs: 500 }] : [{ track: 'bgm', action: 'play', resource: ctx.resource({ compiler: 'wav', input: String(e.payload) }), volume: .4, loop: true, fadeMs: 200 }] }; },
} });
function source(): AuthoringProject {
 const file = '/p/music.ts';
 return { root: '/p', config: { ...config({ name: 'Music', plugins: [fake] }), file }, layouts: {}, routes: { '/': { ...page({title:'Home'}, jsx('div', {})), file } }, features: { f: { def: { ...feature({ name:'F', goal:'g', cases:{}, pick:'a' }), file }, options:{ a:{ ...option({name:'A', idea:'i', on:{}, scenarios:{ s:flow('S',{start:'/'}).system('Start',pluginEffect('fake','play','secret-score'),hold(4)).system('Continue',hold(5)).system('Stop',pluginEffect('fake','stop',null)) }}), file } } } } };
}
it('lowers a second plugin into deterministic media snapshots and keeps author inputs outside IR', () => {
 const requests: any[] = [];
 const r = compile(source(), 'publish', { onResource: r => requests.push(r) });
 expect(r.diagnostics).toEqual([]); expect(r.project).not.toBeNull();
 const p = r.project!, sc = p.scenarios['f.a.s']!;
 expect(requests).toHaveLength(1); expect(requests[0].input).toBe('secret-score');
 expect(JSON.stringify(p)).not.toMatch(/secret-score|local\.js|runtime\.js/);
 expect(sc.steps[1]!.media?.['fake:bgm']).toMatchObject({ offsetMs:4000, volume:.4, loop:true });
 const saved = JSON.parse(JSON.stringify(p));
 const effect = fake.compile!.effect;
 fake.compile!.effect = () => { throw new Error('must not execute in player'); };
 for (let k=1;k<=3;k++) { stateAt(saved,sc.id,k); expect(mediaAt(saved,sc.id,k,0)).toEqual(sc.steps[k-1]!.media); }
 expect(mediaAt(saved,sc.id,2,250)['fake:bgm']!.offsetMs).toBe(4250);
 expect(sc.steps[2]!.media?.['fake:bgm']).toMatchObject({ offsetMs:9000, stopAfterMs:500 });
 fake.compile!.effect = effect;
});

it('scope keeps only referenced music, while translation preserves snapshots and artifacts', () => {
 const src = source();
 src.features.f!.options.a!.scenarios.other = flow('Other', {start:'/'}).system('Other score',pluginEffect('fake','play','other-secret'));
 const requests: any[]=[];
 const p=compile(src,'publish',{onResource:r=>requests.push(r)}).project!;
 p.mediaAssets=Object.fromEntries(requests.map(r=>[r.id,'data:audio/wav;base64,'+Buffer.from(r.input).toString('base64')]));
 const scoped=scopeProject(p,['f.a.s'],'publish').project;
 expect(Object.keys(scoped.mediaAssets!)).toEqual([requests[0].id]);
 expect(JSON.stringify(scoped)).not.toContain(Buffer.from('other-secret').toString('base64'));
 const localized=localizeProject({...p,i18n:{default:'en',locales:['en','zh-CN'],messages:{'zh-CN':{Start:'开始'}}}},'zh-CN');
 expect(localized.scenarios['f.a.s']!.steps[0]!.caption).toBe('开始');
 expect(localized.scenarios['f.a.s']!.steps.map(s=>s.media)).toEqual(p.scenarios['f.a.s']!.steps.map(s=>s.media));
 expect(localized.mediaAssets).toEqual(p.mediaAssets);
});
it('keeps music-vendor names outside core and browser rendering/playback hosts', async () => {
 const { readdirSync,readFileSync }=await import('node:fs');const {join}=await import('node:path');
 const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):/\.tsx?$/.test(e.name)&&e.name!=='guide.ts'?[join(dir,e.name)]:[]);
 const hits=['packages/core/src','packages/web/src/renderer','packages/web/src/runtime','packages/web/src/player'].flatMap(files).filter(f=>/\balda\b/i.test(readFileSync(f,'utf8')));
 expect(hits).toEqual([]);
 const src=source();src.config.plugins=[];src.features.f!.options.a!.scenarios={s:flow('No music',{start:'/'}).system('Quiet')};
 const p=compile(src,'publish').project!;
 expect(Object.keys(p.plugins??{})).not.toContain('alda');expect(p.scenarios['f.a.s']!.media).toBeUndefined();
});
it('keeps a long stop fade continuous across multiple step anchors', async()=>{
 const {advanceMedia}=await import('../src/media.ts');
 const frame={'fake:bgm':{plugin:'fake',resource:'r',offsetMs:1000,volume:.4,loop:true,fadeInMs:0,stopAfterMs:10000}};
 const next=advanceMedia(frame,3000);
 expect(next['fake:bgm']!.volume).toBeCloseTo(.28);
 expect(next['fake:bgm']!.stopAfterMs).toBe(7000);
 expect(advanceMedia(next,7000)).toEqual({});
 expect(advanceMedia(next,2000)['fake:bgm']!.volume).toBeCloseTo(.2);
});
it('rejects resource metadata spoofing and cross-plugin media references', () => {
 const bad=definePlugin({id:'bad',title:'Bad',runtime:'/bad.js',components:{},compile:{effect(_e,c){return {media:[{track:'bgm',action:'play',resource:c.resource({compiler:'wav',input:'score',plugin:'other'} as any)}]};}}});
 const src=source();src.config.plugins=[bad];src.features.f!.options.a!.scenarios={s:flow('S',{start:'/'}).system('Bad',pluginEffect('bad','play',null))};
 const requests:any[]=[];const r=compile(src,'publish',{onResource:r=>requests.push(r)});
 expect(r.project).toBeNull();expect(requests).toEqual([]);
 bad.compile!.effect=()=>({media:[{track:'bgm',action:'play',resource:'resource-0'}]});
 src.config.plugins=[fake,bad];src.features.f!.options.a!.scenarios={s:flow('S',{start:'/'}).system('A',pluginEffect('fake','play','score')).system('B',pluginEffect('bad','play',null))};
 expect(compile(src,'publish').diagnostics.map(d=>d.code)).toContain('PLUGIN_DATA_INVALID');
});
