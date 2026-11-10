import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STYLE, clipKey, voiceFingerprint, VoiceIndex, type Project } from '@joplo-app/core';
import { ProfileStore, VoiceCache, bundleVoice, fingerprint, resolveVoices, reuseSharedVoice, type CloudCatalog } from '../src/voice.ts';
import { VoiceHub } from '../src/voice-http.ts';
import type { CloudSpeechRequest, CloudVoiceBridge, CloudVoiceStatus } from '../src/cloud.ts';
import { Narrator } from '../../web/src/runtime/voice.ts';
import { siteVoiceLookup } from '../../web/src/i18n/content.ts';

const MP3 = (seed = '') => Buffer.concat([Buffer.from('ID3'), Buffer.from(seed), Buffer.alloc(48, 1)]);
let home: string, proj: string, out: string;
const dirs: string[] = [];
const tmp = (p: string) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); dirs.push(d); return d; };
beforeEach(() => { home = tmp('joplo-rf-home-'); proj = tmp('joplo-rf-proj-'); out = tmp('joplo-rf-out-'); });
afterEach(() => { vi.unstubAllGlobals(); for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const oldFingerprint = (p: { kind: string; baseUrl: string; model: string; response: string; path?: string; body?: string; style?: string }, voice: string) =>
  crypto.createHash('sha256').update(JSON.stringify([p.kind, p.baseUrl, p.model, voice, p.response, p.path ?? '', p.body ?? '', p.kind === 'openai' && p.style?.trim() && !/^tts-1/i.test(p.model) ? p.style.trim() : ''])).digest('hex').slice(0, 16);
const writeProfiles = (h: string, profiles: unknown[]) => {
  fs.mkdirSync(path.join(h, 'voice'), { recursive: true });
  fs.writeFileSync(path.join(h, 'voice', 'profiles.json'), JSON.stringify({ version: 1, profiles }));
};
const seed = (cache: VoiceCache, fp: string, stepId: string, text: string, locale: string) => {
  const bytes = MP3(`${fp}${text}`);
  cache.adopt(clipKey(fp, text), `${crypto.createHash('sha256').update(bytes).digest('hex')}.mp3`, bytes, { stepId, fp, text, locale });
};

function project(i18n = false): Project {
  const step = (id: string, caption: string) => ({ id, kind: 'system', action: { type: 'event', name: caption }, caption, effects: [], ruleIds: [], shots: [], directorLayer: null, forks: [], marks: [] });
  return {
    schemaVersion: 3, name: 'T', mode: 'publish', routes: {}, features: {},
    ...(i18n ? { i18n: { default: 'zh-CN', locales: ['zh-CN', 'en'], messages: { en: { 一: 'One', 二: 'Two' } } } } : {}),
    scenarios: { 'f.a.s': { id: 'f.a.s', workId: 'f.a', name: 'S', description: '', mock: { label: 'm', outcome: 'success', auto: true }, initial: { sceneId: 'x', ui: {}, data: {}, inputs: {} }, steps: [step('f.a.s#1', '一'), step('f.a.s#2', '二')] } },
    works: { 'f.a': { id: 'f.a', featureId: 'f', layers: {} } },
    scenes: {},
  } as unknown as Project;
}

const catalog = (rec: Record<string, string[]>): CloudCatalog => ({
  model: 'm', defaultVoice: 'narrator-warm-f', recommended: rec,
  voices: ['narrator-warm-f', 'narrator-calm-m', 'bright-f', 'friendly-m', 'clear-f', 'deep-m'].map((id) => ({ id, gender: id.endsWith('-m') ? 'male' : 'female', labels: { en: id }, samples: {} })),
});
const quota = { plan: 'free', period: 'trial' as const, allowanceChars: 5000, usedChars: 0, remainingChars: 5000, resetsAt: null, packs: [], totalRemainingChars: 5000 };
function bridge(voice: 'ok' | 'none' | 'throw' = 'ok', rec: Record<string, string[]> = {}) {
  const calls: CloudSpeechRequest[] = [];
  const b: CloudVoiceBridge = {
    async status(): Promise<CloudVoiceStatus> {
      if (voice === 'throw') throw new Error('ECONNREFUSED');
      return { signedIn: true, server: 'https://cloud.example', voice: voice === 'none' ? null : { ...catalog(rec), quota } };
    },
    async speech(req) { calls.push(req); return { audio: MP3(req.text), contentType: 'audio/mpeg', charged: 1, remaining: 4000, cache: 'miss', sha256: null }; },
  };
  return { b, calls };
}
const ctx = (body: unknown, sent: { status: number; body: unknown }[]) => ({ guardWrite: () => true, jsonBody: async () => ({ ok: true as const, body }), send: (status: number, b: unknown) => void sent.push({ status, body: b }) });

/** R2：用真实缓存、打包、索引解析与播放器查询验证，避免仅检查文件个数。 */
const playable = (index: NonNullable<ReturnType<typeof bundleVoice>['index']>, locale: string | null, text: string, role: string | null = null) => {
  expect(VoiceIndex.safeParse(index).success).toBe(true);
  const n = new Narrator();
  n.lookup = siteVoiceLookup(index, locale);
  expect(n.hasClip(text, role)).toBe(true);
  const fp = voiceFingerprint(n.lookup!, role, text)!;
  const url = index.clips[clipKey(fp, text)];
  const played: string[] = [];
  vi.stubGlobal('Audio', class {
    constructor(src: string) { played.push(src); }
    addEventListener() {}
    play() { return Promise.resolve(); }
    pause() {}
    removeAttribute() {}
  });
  n.enabled = true;
  const narration = n.speak(text, role, 1);
  expect(narration?.source).toBe('clip');
  expect(played).toEqual([url]);
  narration?.cancel();
  return url;
};
const previous = async (store: ProfileStore, bilingual = true) => {
  const dir = tmp('joplo-r2-old-'), cache = new VoiceCache(dir);
  cache.select('openai');
  const fp = resolveVoices(undefined, 'openai', store).voices.narrator!;
  for (const [id,t,l] of [['f.a.s#1','一','zh-CN'],['f.a.s#2','二','zh-CN'],...(bilingual ? [['f.a.s#1','One','en'],['f.a.s#2','Two','en']] : [])]) seed(cache,fp!,id!,t!,l!);
  const index = bundleVoice(dir, project(bilingual), out, store).index!;
  return { index, fetch: async (f: string) => fs.readFileSync(path.join(out, f)) };
};

describe('R2 默认来源：发布索引能够播放新生成与沿用的不同声音', () => {
  it('旧 OpenAI 分享 + 默认 cloud 新文字：四段均可播放，重复更新仍保留正确指纹', async () => {
    const store = new ProfileStore(home, {}), shared = await previous(store);
    const p = project(true);
    p.scenarios['f.a.s']!.steps[1]!.caption = '新二';
    p.i18n!.messages.en!['新二'] = 'Two';
    const { b, calls } = bridge(), hub = new VoiceHub(home, { emit: () => undefined, env: {}, cloud: b });
    const sent: { status: number; body: unknown }[] = [];
    await hub.handleProject('p',proj,p,'generate',{method:'POST'} as never,{} as never,ctx({contentLocale:'zh-CN',segments:[{stepId:'f.a.s#2',text:'新二',role:null}]},sent));
    expect(calls).toHaveLength(1);
    const cache = new VoiceCache(proj);
    expect(cache.selection()).toBeUndefined();
    expect(await reuseSharedVoice(proj,p,shared,store,undefined,'cloud')).toBe(3);
    const output = tmp('joplo-r2-bundle-');
    const result = bundleVoice(proj,p,output,store,undefined,shared.index,'cloud');
    expect(result.report).toMatchObject({clips:4,missing:0});
    for (const [locale,text] of [['zh-CN','一'],['zh-CN','新二'],['en','One'],['en','Two']])
      expect(fs.existsSync(path.join(output,playable(result.index!,locale!,text!)!))).toBe(true);
    const cloudFp = (await hub.state('p',proj,p)).voices.narrator!;
    expect(result.index!.clips[clipKey(cloudFp,'新二')]).toBeTruthy();
    // 新电脑再次 update：只能从上次索引重建，不能假设拥有原始 profile、pins 或本地音频。
    const fresh=tmp('joplo-r2-fresh-'), empty=new ProfileStore(tmp('joplo-r2-empty-'),{});
    const next={index:result.index!,fetch:async(f:string)=>fs.readFileSync(path.join(output,f))};
    expect(await reuseSharedVoice(fresh,p,next,empty,undefined,'cloud')).toBe(4);
    const again=bundleVoice(fresh,p,tmp('joplo-r2-again-'),empty,undefined,next.index,'cloud');
    expect(again.report).toMatchObject({clips:4,missing:0});
    expect(playable(again.index!,'zh-CN','新二')).toBe(playable(next.index,'zh-CN','新二'));
    expect(voiceFingerprint(siteVoiceLookup(again.index,'zh-CN')!,null,'新二')).toBe(cloudFp);
    // 作者明确改来源时不再沿用旧声音。
    new VoiceCache(fresh).select('elevenlabs');
    expect(bundleVoice(fresh,p,tmp('joplo-r2-explicit-'),empty,undefined,next.index,'cloud').report.clips).toBe(0);
  });

  it('始终默认 cloud：新增英文的推荐音色与已发布中文一起打包', async () => {
    const store=new ProfileStore(home,{}),cache=new VoiceCache(proj);
    const fp=resolveVoices(undefined,undefined,store,null,'cloud').voices.narrator!;
    seed(cache,fp,'f.a.s#1','一','zh-CN'); seed(cache,fp,'f.a.s#2','二','zh-CN');
    const index=bundleVoice(proj,project(),out,store,undefined,undefined,'cloud').index!;
    const {b,calls}=bridge('ok',{en:['bright-f']});
    const hub=new VoiceHub(home,{emit:()=>undefined,env:{},cloud:b});
    const sent:{status:number;body:unknown}[]=[];
    await hub.handleProject('p',proj,project(true),'generate',{method:'POST'} as never,{} as never,ctx({contentLocale:'en',segments:[{stepId:'f.a.s#1',text:'One',role:null},{stepId:'f.a.s#2',text:'Two',role:null}]},sent));
    expect(calls).toHaveLength(2); expect(cache.selection()).toBeUndefined();
    await reuseSharedVoice(proj,project(true),{index,fetch:async f=>fs.readFileSync(path.join(out,f))},store,undefined,'cloud');
    const result=bundleVoice(proj,project(true),tmp('joplo-r2-cloud-out-'),store,undefined,index,'cloud');
    expect(result.report).toMatchObject({clips:4,missing:0});
    for (const [locale,text] of [['zh-CN','一'],['zh-CN','二'],['en','One'],['en','Two']]) playable(result.index!,locale!,text!);
  });

  it('相同文字的新本地片段优先，旁白与角色的覆盖彼此独立', async () => {
    const p = project();
    p.features.f = { id: 'f', roles: [{ id: 'actor', name: 'Actor' }] } as never;
    p.works['f.a']!.layers = { main: { title: 'Main', sceneId: 'actor-scene', role: 'actor' } } as never;
    p.scenes['actor-scene'] = { id: 'actor-scene', layer: 'main', workId: 'f.a' } as never;
    const steps = p.scenarios['f.a.s']!.steps;
    steps[0]!.caption = 'Same';
    steps[1]!.kind = 'user'; steps[1]!.say = 'Same';
    const store = new ProfileStore(home, {});
    const dir = tmp('joplo-r2-role-old-'), old = new VoiceCache(dir);
    old.select('openai');
    const oldFp = resolveVoices(undefined, 'openai', store).voices.narrator!;
    seed(old, oldFp, steps[0]!.id, 'Same', 'en');
    const index = bundleVoice(dir, p, out, store).index!;
    const cache = new VoiceCache(proj);
    const narratorFp = fingerprint(store.get('cloud')!, 'narrator-warm-f');
    const roleFp = fingerprint(store.get('cloud')!, 'deep-m');
    p.voiceConfig = { roles: { actor: 'deep-m' } };
    seed(cache, narratorFp, steps[0]!.id, 'Same', 'en');
    seed(cache, roleFp, steps[1]!.id, 'Same', 'en');
    const fetched: string[] = [];
    expect(await reuseSharedVoice(proj, p, { index, fetch: async f => { fetched.push(f); return fs.readFileSync(path.join(out, f)); } }, store, undefined, 'cloud')).toBe(0);
    expect(fetched).toEqual([]);
    const result = bundleVoice(proj, p, tmp('joplo-r2-roles-'), store, undefined, index, 'cloud');
    expect(result.report).toMatchObject({ clips: 2, missing: 0 });
    expect(playable(result.index!, null, 'Same')).not.toBe(playable(result.index!, null, 'Same', 'actor'));
    expect(voiceFingerprint(siteVoiceLookup(result.index, null)!, 'actor', 'Same')).toBe(roleFp);
    expect(voiceFingerprint(siteVoiceLookup(result.index, null)!, null, 'Same')).toBe(narratorFp);
  });

  it('两种语言文字相同，英文的新声音不会覆盖中文沿用的声音', async () => {
    const p = project(true);
    p.scenarios['f.a.s']!.steps = p.scenarios['f.a.s']!.steps.slice(0, 1);
    p.i18n!.messages.en!['一'] = '一';
    const store = new ProfileStore(home, {}), oldDir = tmp('joplo-r2-language-old-');
    const old = new VoiceCache(oldDir);
    old.select('openai');
    const oldFp = resolveVoices(undefined, 'openai', store).voices.narrator!;
    seed(old, oldFp, 'f.a.s#1', '一', 'zh-CN');
    const index = bundleVoice(oldDir, p, out, store).index!;
    const cache = new VoiceCache(proj);
    cache.pin('en', { 'narrator-warm-f': 'bright-f' });
    const enFp = fingerprint(store.get('cloud')!, 'bright-f');
    seed(cache, enFp, 'f.a.s#1', '一', 'en');
    expect(await reuseSharedVoice(proj, p, { index, fetch: async f => fs.readFileSync(path.join(out, f)) }, store, undefined, 'cloud')).toBe(1);
    const result = bundleVoice(proj, p, tmp('joplo-r2-language-out-'), store, undefined, index, 'cloud');
    expect(result.report).toMatchObject({ clips: 2, missing: 0 });
    expect(playable(result.index!, 'zh-CN', '一')).not.toBe(playable(result.index!, 'en', '一'));
    expect(voiceFingerprint(siteVoiceLookup(result.index, 'zh-CN')!, null, '一')).toBe(oldFp);
    expect(voiceFingerprint(siteVoiceLookup(result.index, 'en')!, null, '一')).toBe(enFp);
  });

  it('自动字幕保留每种界面语言，后续本机更新仍能读回混合索引', () => {
    const p = project();
    p.scenarios['f.a.s']!.steps = p.scenarios['f.a.s']!.steps.slice(0, 1);
    p.scenarios['f.a.s']!.steps[0]!.captionAuto = { kind: 'click', label: 'Go' };
    const store = new ProfileStore(home, {}), cache = new VoiceCache(proj);
    const oldFp = resolveVoices(undefined, 'openai', store).voices.narrator!;
    const newFp = resolveVoices(undefined, undefined, store, null, 'cloud').voices.narrator!;
    seed(cache, oldFp, 'f.a.s#1', 'Click “Go”', 'en');
    seed(cache, newFp, 'f.a.s#1', '点击「Go」', 'zh-CN');
    const fallback = { narrator: oldFp, roles: {}, clips: {} };
    const result = bundleVoice(proj, p, out, store, undefined, fallback, 'cloud');
    expect(result.report).toMatchObject({ clips: 2, missing: 0 });
    playable(result.index!, null, 'Click “Go”');
    playable(result.index!, null, '点击「Go」');
    // 此时 current cloud 不能直接找到旧指纹下的英文，必须读取上一轮的实际声音覆盖。
    const again = bundleVoice(proj, p, tmp('joplo-r2-auto-again-'), store, undefined, result.index!, null);
    expect(again.report).toMatchObject({ clips: 2, missing: 0 });
    playable(again.index!, null, '点击「Go」');
  });

  it('新电脑按语言沿用 cloud 同文不同音色，不把刚下载的中文当成新生成的英文', async () => {
    const p = project(true);
    p.scenarios['f.a.s']!.steps = p.scenarios['f.a.s']!.steps.slice(0, 1);
    p.i18n!.messages.en!['一'] = '一';
    const store = new ProfileStore(home, {}), cache = new VoiceCache(proj);
    const zhFp = fingerprint(store.get('cloud')!, 'narrator-warm-f');
    const enFp = fingerprint(store.get('cloud')!, 'bright-f');
    seed(cache, zhFp, 'f.a.s#1', '一', 'zh-CN');
    seed(cache, enFp, 'f.a.s#1', '一', 'en');
    cache.pin('en', { 'narrator-warm-f': 'bright-f' });
    const prior = { narrator: zhFp, roles: {}, clips: {} };
    const index = bundleVoice(proj, p, out, store, undefined, prior, 'cloud').index!;
    const fresh = tmp('joplo-r2-same-cloud-'), empty = new ProfileStore(tmp('joplo-r2-same-home-'), {});
    const shared = { index, fetch: async (f: string) => fs.readFileSync(path.join(out, f)) };
    expect(await reuseSharedVoice(fresh, p, shared, empty, undefined, 'cloud')).toBe(2);
    const result = bundleVoice(fresh, p, tmp('joplo-r2-same-out-'), empty, undefined, index, 'cloud');
    expect(result.report).toMatchObject({ clips: 2, missing: 0 });
    expect(voiceFingerprint(siteVoiceLookup(result.index, 'zh-CN')!, null, '一')).toBe(zhFp);
    expect(voiceFingerprint(siteVoiceLookup(result.index, 'en')!, null, '一')).toBe(enFp);
    playable(result.index!, 'zh-CN', '一'); playable(result.index!, 'en', '一');
  });

  it('新电脑默认 cloud：完整沿用四段，不改片段指纹', async () => {
    const store=new ProfileStore(home,{}),shared=await previous(store),fresh=tmp('joplo-r2-new-');
    expect(await reuseSharedVoice(fresh,project(true),shared,store,undefined,'cloud')).toBe(4);
    const result=bundleVoice(fresh,project(true),tmp('joplo-r2-new-out-'),store,undefined,shared.index,'cloud');
    expect(result.report).toMatchObject({clips:4,missing:0});
    expect(result.index!.narrator).toBe(shared.index.narrator);
  });
});

describe('R2 旧 cloud 引用与之后明确选择官方 cloud', () => {
  const legacy={id:'cloud',name:'My Cloud',kind:'http',baseUrl:'https://proxy.example/tts',model:'',voice:'v1',response:'audio',body:'{"q":"{{text}}"}',key:'old-key'};
  for (const source of ['board','config'] as const) it(`${source} 旧引用保留指纹、禁止生成，显式官方选择可区分且持久化`, async () => {
    writeProfiles(home,[legacy]);
    const cache=new VoiceCache(proj),fp=oldFingerprint(legacy,'v1');
    seed(cache,fp,'f.a.s#1','一','zh-CN');
    if(source==='board') cache.write({...cache.read(),profileId:'cloud',chosen:true}); // 升级之前的选择，没有新的官方标记
    const p=project(); if(source==='config') p.voiceConfig={profile:'cloud'};
    const {b,calls}=bridge();
    const hub=new VoiceHub(home,{emit:()=>undefined,env:{},cloud:b});
    const old=await hub.state('p',proj,p);
    expect(old.profile).toMatchObject({kind:'http',unsupported:true});
    expect(old.voices.narrator).toBe(fp); expect(old.clips[clipKey(fp,'一')]).toBeTruthy();
    const store=new ProfileStore(home,{});
    expect(bundleVoice(proj,p,out,store).report.clips).toBe(1);
    const sent:{status:number;body:any}[]=[];
    await hub.handleProject('p',proj,p,'generate',{method:'POST'} as never,{} as never,ctx({segments:[{stepId:'f.a.s#2',text:'二',role:null}]},sent));
    expect(sent[0]!.body.summary.error.code).toBe('UNSUPPORTED'); expect(calls).toHaveLength(0);
    // 保存其他供应商会持久化改名，不能因此丢掉旧引用兼容关系。
    store.upsert('openai',{},'k');
    expect((await new VoiceHub(home,{emit:()=>undefined,env:{},cloud:b}).state('p',proj,p)).voices.narrator).toBe(fp);
    if(source==='config') p.voiceConfig={profile:'Joplo Cloud'}; // 明确的官方名称，避开旧 id 歧义
    else await hub.handleProject('p',proj,p,'',{method:'PUT'} as never,{} as never,ctx({profileId:'cloud'},sent));
    const official=await new VoiceHub(home,{emit:()=>undefined,env:{},cloud:b}).state('p',proj,p);
    expect(official.profile).toMatchObject({id:'cloud',kind:'cloud',unsupported:false});
    expect(official.voices.narrator).not.toBe(fp);
    expect(new ProfileStore(home,{}).list().find(x=>x.name==='My Cloud')).toMatchObject({kind:'http',unsupported:true});
  });
});

describe('R2 pins 逐层清洗',()=>{
  for (const broken of [undefined,null,[],{en:null},{en:'broken'},{en:42},{en:[]},{en:{'narrator-warm-f':42}},{en:{'narrator-warm-f':'unknown'}},{en:{'unknown':'bright-f'}}]) it(`${JSON.stringify(broken)}：合法恢复、生成不误判失败`,async()=>{
    const cache=new VoiceCache(proj),store=new ProfileStore(home,{});
    cache.write({...cache.read(),profileId:'cloud',pins:broken as never});
    const r=resolveVoices(undefined,'cloud',store,'en',null,cache.pins());
    expect(r.narrator).toBe('narrator-warm-f');
    const {b,calls}=bridge();
    const result=await cache.generate([{stepId:'f.a.s#1',text:'One',role:null}],'en',r,store,{cloud:b});
    expect(result).toMatchObject({generated:1,failed:[]});expect(calls).toHaveLength(1);
    expect(cache.pins()).toEqual({en:{'narrator-warm-f':'narrator-warm-f'}});
    expect(bundleVoice(proj,project(true),out,store).report.clips).toBe(1);
  });
  it('保留合法项、丢弃非法语言/音色；外部传入的 pins 和 pin() 也受保护',()=>{
    const cache=new VoiceCache(proj),store=new ProfileStore(home,{});
    const pins=JSON.parse('{"../bad":{"narrator-warm-f":"deep-m"},"en":{"narrator-warm-f":"bright-f","deep-m":false,"nope":"bright-f"},"__proto__":{"narrator-warm-f":"bright-f"}}');
    cache.write({...cache.read(),pins});
    expect(cache.pins()).toEqual({en:{'narrator-warm-f':'bright-f'}});
    cache.pin('en',{'narrator-warm-f':'clear-f','deep-m':42} as never);
    cache.pin('../bad',{'deep-m':'bright-f'});
    expect(cache.pins()).toEqual({en:{'narrator-warm-f':'bright-f'}});
    expect(resolveVoices(undefined,'cloud',store,'en',null,{en:{'narrator-warm-f':42}} as never).narrator).toBe('narrator-warm-f');
  });
});
