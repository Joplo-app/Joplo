/** 作品入口、编译与现有消费者之间的端到端契约。 */
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { createHash } from 'node:crypto';
import { workDemoBaseline } from './fixtures/work-demo-baseline.ts';
import { Button, Stack, Text } from '@joplo-app/plugin-ui';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { $, Flow, Slot, chapter, feature, work, flow, free, go, hold, layer, narrate, option, page, role, say, set, shot, uses, type WorkDef } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { definePlugin, pluginComponent, pluginEffect } from '@joplo-app/kit/plugin';
import { compile, collectMessages, featureDiff, localizeProject, outline, reviewManifest, scopeProject, stateAt, validate, entryOf, type AuthoringProject, type CompileMode } from '../src/index.ts';
import { discoverFiles, loadAuthoring } from '../src/load.ts';

const tree = () => jsx(Text, { id: 'stage', children: 'Screen' });
const source = (f: WorkDef = work({ title: 'Title', summary: 'Summary', stage: tree(), scenarios: { one: chapter('Opening').system('Open', set($.ui.n, 1)) } })): AuthoringProject => ({
  root: '/p', config: { ...config({ name: 'Project' }), file: 'joplo.config.ts' }, layouts: {}, routes: {}, features: {},
  works: { demo: { ...f, file: 'works/demo.tsx', source: '/p/works/demo.tsx:3:1' } },
});
const build = (f?: WorkDef, mode: CompileMode = 'dev') => compile(source(f), mode);
const codes = (r: ReturnType<typeof compile>) => r.diagnostics.map(d => d.code);
const project = (f?: WorkDef, mode: CompileMode = 'dev') => {
  const r = build(f, mode); expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]); expect(r.project).not.toBeNull(); return r.project!;
};
const basic = (extra: Partial<WorkDef> = {}) => work({ title: 'Title', summary: 'Summary', stage: tree(), scenarios: { one: chapter('Opening').system('Open') }, ...extra });

describe('作品编译', () => {
  it('章节选项沿用 FlowOpts，允许 expected/start/mock/outcome，只有 from 的默认值不同', () => {
    const p = project(basic({ scenarios: { a: chapter('A',{expected:'Understood',start:'/',mock:'Preview result',outcome:'failure'}).system('A') } }));
    expect(p.scenarios['demo.main.a']).toMatchObject({expected:'Understood',mock:{label:'Preview result',outcome:'failure'}});
  });
  it('独立作品的顶层 cases 只能在 feature 中声明', () => {
    expect(codes(build(basic({cases:{one:'One'}} as never)))).toContain('WORK_FEATURE_ONLY');
  });
  it('schema 诊断同样不泄露独立作品的隐藏方案 id', () => {
    const r = build(basic({ viewport: 'invalid' as never }));
    expect(r.project).toBeNull(); expect(r.diagnostics.some(d=>d.severity==='error')).toBe(true);
    expect(r.diagnostics.every(d=>!d.message.includes('demo.main'))).toBe(true);
  });
  it('独立作品诊断隐藏内部方案 id，列出全部切片键', () => {
    const r = build(basic({scenarios:{first:flow('First',{from:'missing'}),last:flow('Last')}}));
    const message = r.diagnostics.find(d=>d.code==='FROM_UNKNOWN')!.message;
    expect(message).not.toContain('demo.main'); expect(message).toContain('work demo');
    expect(message).toContain('first');expect(message).toContain('last');
  });
  it('flow 独立作品不默认接续；Entry 用 independent 表达能力', () => {
    const p = project(basic({ scenarios: { a: flow('A').system('A'), b: flow('B').system('B') } }));
    expect(p.options['demo.main']).not.toHaveProperty('sequencing');
    expect(p.scenarios['demo.main.b']!.from).toBeUndefined();
    expect(entryOf(p, 'demo')).toMatchObject({ featureId: null, workId: 'demo.main', sequencing: 'independent' });
  });
  it.each([false, true])('所有作品共用章节解析与混用检查（独立：%s）', independent => {
    const src = source();
    if (!independent) {
      delete src.works;
      src.routes['/'] = { ...page({ title: 'Home', layout: false }, tree()), file: 'routes/page.tsx' };
      src.features.demo = { def: { ...feature({ name: 'Demo', goal: 'Goal', cases: {}, pick: 'a' }), file: 'features/demo/feature.ts' }, options: { a: { ...option({ name: 'A', idea: 'Idea', scenarios: { a: chapter('A').system('A', set($.ui.n, 3)), b: chapter('B').system('B') } }), file: 'features/demo/options/a.tsx' } } };
    } else src.works!.demo!.scenarios = { a: chapter('A').system('A', set($.ui.n, 3)), b: chapter('B').system('B') };
    const oid = independent ? 'demo.main' : 'demo.a';
    const r = compile(src,'dev'); expect(r.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
    expect(r.project!.options[oid]!.sequencing).toBe('linear');
    expect(r.project!.scenarios[`${oid}.b`]).toMatchObject({ from: `${oid}.a`, initial: { ui: { n: 3 } } });
    expect(entryOf(r.project!, 'demo')).toMatchObject({ featureId: independent ? null : 'demo', sequencing: 'linear' });
    const slices = independent ? src.works!.demo!.scenarios : src.features.demo!.options.a!.scenarios;
    slices.b = flow('Mixed');
    expect(codes(compile(src,'dev'))).toContain('WORK_SLICES_MIXED');
  });
  it('独立作品用 on / routes 复用项目插槽与路径，也允许 go()', () => {
    const src = source(work({ title: 'Overlay', summary: 'Reuse pages', on: { '/': { main: jsx(Text,{id:'content',children:'Work content'}) } }, routes: { '/next': page({title:'Next',layout:false},tree()) }, scenarios: { a: flow('A',{start:'/'}).system('Next',go('/next')) } }));
    src.routes['/'] = {...page({title:'Home',layout:false},jsx(Slot,{name:'main'})),file:'routes/page.tsx'};
    const r=compile(src,'publish');expect(r.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
    expect(JSON.stringify(r.project!.scenes['demo.main@/'])).toContain('Work content');
    expect(stateAt(r.project!,'demo.main.a',1).sceneId).toBe('demo.main@/next');
    expect(r.project!.options['demo.main']!.routes).toEqual(['/','/next']);
  });

  it('chapter 继承全部 Flow 步骤方法，并保留旧 flow.kind 的字面量类型', () => {
    const oldKind: 'flow' = flow('Demo').kind;
    expect(oldKind).toBe('flow');
    const ch = chapter('One', { from: null, expected: 'Understand' })
      .click('a').type('a', 'text').select('a', 'x').toggle('a', true).press('Enter').back()
      .drag('a', 'b').hover('a').scroll('a', { x: 0, y: 1 }).act('probe:run', 'a', {})
      .card('Next').system('End').key('ending');
    expect(ch).toBeInstanceOf(Flow);
    expect(ch.kind).toBe('chapter');
    expect(ch.steps).toHaveLength(12);
    expect(ch.steps.at(-1)!.key).toBe('ending');
    expect(ch.source).toMatch(/work\.test\.ts:\d+:\d+$/);
    expect(ch.chapterOptions).toEqual({ from: null, expected: 'Understand' });
  });
  it.each([
    ['dev', 'cef66be0b4b4037e49b6e5cf5573b5f24ea29d57abf6ab0a49297a873d2a85ec'],
    ['publish', 'f1eb388a6f40eaf3ff719d5b77f854b00034296c4b78df4daf7310e3193c7cd9'],
    ['review', '051b6c9357b146700652ebcce945fb94aae9401150819bc4b304527ed1acd794'],
  ] as const)('无影片 IR 与诊断逐字节匹配 68a8416 基线（%s）', (mode, digest) => {
    // 指纹由基线的 compile + validate 在同一固定输入上计算；不是修改现有测试期望。
    const compiled = compile(workDemoBaseline(), mode);
    const json = JSON.stringify({ compiled, validated: validate(compiled.project!) });
    expect(createHash('sha256').update(json).digest('hex')).toBe(digest);
  });
  it.each(['dev', 'publish', 'review'] as const)('固定一个选定方案；只有影片也可逐步回放与 validate（%s）', mode => {
    const p = project(undefined, mode);
    expect(p.features.demo).toMatchObject({ standalone: true, name: 'Title', goal: 'Summary', caseIds: [], optionIds: ['demo.main'], pick: 'demo.main' });
    expect(p.options['demo.main']).toMatchObject({ key: 'main', name: 'Title', idea: 'Summary', routes: [], coverage: {}, layers: { stage: { title: 'Title', sceneId: 'demo.main~stage' } } });
    expect(p.scenarios['demo.main.one']).toMatchObject({ caseIds: [], mock: { label: 'Mock success', outcome: 'success', auto: true } });
    for (const s of Object.values(p.scenarios)) for (let i = 0; i <= s.steps.length; i++) expect(stateAt(p, s.id, i)).toBeTruthy();
    expect(validate(p).summary.error).toBe(0);
    expect(validate(p).diagnostics.map(d => d.code)).not.toContain('HAPPY_PATH_ONLY');
    expect(codes(build(undefined, mode))).not.toContain('NOT_PICKED');
    expect(outline(p).features[0]).toMatchObject({ standalone: true, sequencing: 'linear', draft: false });
    expect(entryOf(p, 'demo')).toMatchObject({ featureId: null, sequencing: 'linear', title: 'Title', summary: 'Summary', draft: false });
  });
  it('默认上一章、显式初始状态与指定前后章节只在编译时解析，重复编译不改作者定义', () => {
    const f = basic({ state: { ui: { n: 0 } }, scenarios: {
      a: chapter('A').system('A', set($.ui.n, 1)), b: chapter('B').system('B', set($.ui.n, 2)),
      c: chapter('C', { from: null }).system('C'), d: chapter('D', { from: 'a', state: { ui: { extra: true } } }).system('D'),
      e: chapter('E', { from: 'f' }).system('E'), f: chapter('F', { from: null }).system('F', set($.ui.n, 6)),
    } });
    const p = project(f); expect(project(f)).toEqual(p);
    expect(Object.keys(p.scenarios)).toEqual(['a','b','c','d','e','f'].map(k => `demo.main.${k}`));
    expect(p.scenarios['demo.main.a']!.from).toBeUndefined();
    expect(p.scenarios['demo.main.b']).toMatchObject({ from: 'demo.main.a', initial: { ui: { n: 1 } } });
    expect(p.scenarios['demo.main.c']!.from).toBeUndefined();
    expect(stateAt(p, 'demo.main.c', 0).ui.n).toBe(0);
    expect(p.scenarios['demo.main.d']).toMatchObject({ from: 'demo.main.a', initial: { ui: { n: 1, extra: true } } });
    expect(p.scenarios['demo.main.e']).toMatchObject({ from: 'demo.main.f', initial: { ui: { n: 6 } } });
    expect(f.scenarios.b!.opts.from).toBeUndefined();
  });
  it('画面独立于现有 routes、layouts 与 home', () => {
    const src = source(); src.config.home = '/app'; src.config.layout = 'missing';
    src.routes['/app'] = { ...page({ title: 'App', layout: false }, jsx(Text, { children: 'PRIVATE APP' })), file: 'routes/app/page.tsx' };
    const p = compile(src, 'publish').project!;
    expect(p).not.toBeNull(); const s = p.scenarios['demo.main.one']!;
    expect(p.scenes[s.initial.sceneId]!.root).not.toHaveProperty('children');
    expect(p.scenes[s.initial.sceneId]!.route).toBe('/');
    expect(validate(p).summary.error).toBe(0);
  });
  it.each(['dev','publish','review'] as const)('影片不接收其他功能在页面插槽与 overlay 中的贡献（%s）', mode => {
    const src = source();
    src.routes['/'] = { ...page({ title: 'Home', layout: false }, jsx(Stack, { children: jsx(Slot, { name: 'main' }) })), file: 'routes/page.tsx' };
    src.features.app = { def: { ...feature({ name: 'App', goal: 'App goal', cases: {}, pick: 'a' }), file: 'features/app/feature.ts' }, options: { a: {
      ...option({ name: 'A', idea: 'App idea', on: { '/': { main: jsx(Text, { children: 'APP CONTENT' }), overlay: jsx(Text, { children: 'APP OVERLAY' }) } }, scenarios: { s: flow('App').system('App') } }), file: 'features/app/options/a.tsx',
    } } };
    const result = compile(src, mode); expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const p = result.project!; const filmScene = p.scenes[p.scenarios['demo.main.one']!.initial.sceneId]!;
    expect(filmScene.root.children).toBeUndefined();
    expect(JSON.stringify(filmScene)).not.toContain('APP');
    expect(p.features.app).not.toHaveProperty('standalone'); expect(p.features.demo!.standalone).toBe(true);
  });
  it('影片 free 反应复用方案的本地效果编译与目标检查', () => {
    const src = source(basic({ stage: jsx(Button, { id: 'button', children: 'Try' }), free: { try: free.click('button', set($.ui.tried, true)) } }));
    const p = compile(src,'dev').project!;
    expect(p.options['demo.main']!.free).toMatchObject({ try: { action: { type: 'click', target: 'button' }, effects: [{ type: 'set', path: 'ui.tried', value: true }] } });
    expect(validate(p).summary.error).toBe(0);
    expect(codes(build(basic({ free: { missing: free.click('missing', set($.ui.tried, true)) } })))).toContain('FREE_TARGET_MISSING');
  });
  it('草稿只留 dev；公开模式整支删除且只发一条 info', () => {
    const f = basic({ draft: true, audience: 'Private audience' });
    const dev = project(f); expect(dev.features.demo!.draft).toBe(true); expect(outline(dev).features[0]!.draft).toBe(true);
    for (const mode of ['publish', 'review'] as const) {
      const r = build(f, mode); expect(r.diagnostics).toEqual([expect.objectContaining({ code: 'WORK_DRAFT_SKIPPED', severity: 'info', at: 'works/demo.tsx:3:1' })]);
      for (const key of ['features','options','scenarios','scenes'] as const) expect(Object.keys(r.project![key]).some(k => k.includes('demo'))).toBe(false);
      expect(JSON.stringify(r.project)).not.toContain('Private audience');
    }
    expect(project().features.demo).not.toHaveProperty('draft');
  });
  it('分享附带的评审清单从 dev IR 生成时也排除草稿影片', () => {
    const p = project(basic({ title: 'Private draft', draft: true, stage: jsx(Text, { id: 'private-node', children: 'Private picture' }) }));
    for (const mode of ['publish', 'review'] as const) {
      const manifest = reviewManifest(p, mode);
      expect(manifest.features).toEqual([]);
      expect(manifest.scenarios).toEqual([]);
      expect(JSON.stringify(manifest)).not.toContain('Private');
      expect(JSON.stringify(manifest)).not.toContain('private-node');
    }
  });
  it('标题、简介、观众、章节标题和说明进入作者多语言并流向 Work；expected 与 flow.expected 的公开处理一致', () => {
    const src = source(basic({ audience: 'Audience', scenarios: { one: chapter('Chapter title', { description: 'Description', expected: 'Takeaway' }).system('Open') } }));
    src.config.locales = ['en', 'ja']; src.locales = { ja: { Title: '題名', Summary: '概要', Audience: '観客', 'Chapter title': '章', Description: '説明', Takeaway: '要点' } };
    const p = compile(src, 'dev').project!;
    const messages = collectMessages(p); const json = JSON.stringify(messages);
    for (const text of ['Title','Summary','Audience','Chapter title','Description','Takeaway']) expect(json).toContain(text);
    const translated = localizeProject(p, 'ja');
    expect(entryOf(translated, 'demo')).toMatchObject({ title: '題名', summary: '概要', audience: '観客', slices: [expect.objectContaining({ title: '章', description: '説明' })] });
    expect(translated.scenarios['demo.main.one']!.expected).toBe('要点');
    const pub = compile(src, 'publish').project!;
    const demo = source(); delete demo.works; demo.routes['/'] = { ...page({ title: 'Home', layout: false }, tree()), file: 'routes/page.tsx' };
    demo.features.f = { def: { ...feature({ name: 'F', goal: 'G', cases: {}, pick: 'a' }), file: 'features/f/feature.ts' }, options: { a: { ...option({ name: 'A', idea: 'I', scenarios: { s: flow('S', { expected: 'Takeaway' }).system('Open') } }), file: 'features/f/options/a.tsx' } } };
    expect(pub.scenarios['demo.main.one']!.expected).toBe(compile(demo, 'publish').project!.scenarios['f.a.s']!.expected);
    expect(entryOf(pub, 'demo')!.audience).toBe('Audience');
    expect(featureDiff(pub, pub).status).toBe('unchanged');
  });
  it.each([
    ['publish', false, '9c89b14e85e9defcb63f1c7940fe2801e15af68cd15e6e314217ba9f9e369827'],
    ['publish', true, '055b01b977843d8f149a8c328f5c144ce787d48c6abebd90cda260febf567ec8'],
    ['review', false, '778a0e6a8748c8f30d743c7e0397c201136eefac3c36eabc230a134b22ffb55d'],
    ['review', true, '90753aca1ad4b01351bbcb539768e74eaf3b18a6d87f6a447f9e362de9e4ddee'],
  ] as const)('无影片公开载荷逐字节保持原样（%s，译文：%s）', async (mode, translated, digest) => {
    // 在修改 publishPayload 之前计算，覆盖有无 pruneMessages 的两条路径。
    const { publishPayload } = await import('../../server/src/build.ts');
    const src = workDemoBaseline();
    if (translated) {
      src.config.locales = ['en', 'ja'];
      src.locales = { ja: { 'Existing feature': '既存の機能', 'Existing goal': '既存の目標' } };
    }
    const p = compile(src, mode).project!;
    expect(createHash('sha256').update(JSON.stringify(publishPayload(p, '/'))).digest('hex')).toBe(digest);
  });
  it('站点公开载荷保留影片形态、观众及其译文', async () => {
    const { publishPayload } = await import('../../server/src/build.ts');
    const src = source(basic({ audience: 'Audience' }));
    src.config.locales = ['en', 'ja']; src.locales = { ja: { Audience: '観客' } };
    for (const mode of ['publish', 'review'] as const) {
      const p = compile(src, mode).project!;
      for (const input of [p, scopeProject(p, ['demo.main.one']).project]) {
        const payload = publishPayload(input, null).project as unknown as typeof p;
        expect(payload.features.demo).toMatchObject({ standalone: true, audience: 'Audience' });
        expect(payload.features.demo).not.toHaveProperty('draft');
        expect(entryOf(payload, 'demo')).toMatchObject({ featureId: null, sequencing: 'linear', audience: 'Audience' });
        expect(payload.i18n!.messages.ja).toHaveProperty('Audience', '観客');
        expect(entryOf(localizeProject(payload, 'ja'), 'demo')!.audience).toBe('観客');
      }
      // 防止公开白名单将只属于 dev 的标记带出去。
      const withDraftFlag = structuredClone(p);
      withDraftFlag.features.demo!.draft = true;
      const projected = publishPayload(withDraftFlag, null).project as unknown as typeof p;
      expect(projected.features.demo).not.toHaveProperty('draft');
    }
  });
  it('章节范围裁剪保留 standalone 和 sequencing 和已解析初始状态，删除范围外 from', () => {
    const f = basic({ scenarios: { a: chapter('A').system('A', set($.ui.n, 3)), b: chapter('B').system('B') } });
    for (const mode of ['dev','publish','review'] as const) {
      const p = project(f, mode); const scoped = scopeProject(p, ['demo.main.b']).project;
      expect(Object.keys(scoped.scenarios)).toEqual(['demo.main.b']); expect(scoped.scenarios['demo.main.b']!.from).toBeUndefined();
      expect(stateAt(scoped, 'demo.main.b', 0).ui.n).toBe(3); expect(scoped.features.demo!.standalone).toBe(true); expect(scoped.options['demo.main']!.sequencing).toBe('linear'); expect(entryOf(scoped,'demo')!.sequencing).toBe('linear');
      expect(validate(scoped).summary.error).toBe(0);
      expect(scopeProject(p, ['demo.main.a','demo.main.b']).project.scenarios['demo.main.b']!.from).toBe('demo.main.a');
    }
  });
  it('角色键贯穿说话人、层级与回放；层级和 stage 使用同一编译路径', () => {
    const p = project(work({ title: 'T', summary: 'S', roles: { me: role('Speaker') }, layers: { world: layer('World', tree(), { role: 'me' }) }, scenarios: { one: chapter('One', { layer: 'world', autoplay: false, actionEntry: 'after' }).system('Speak', say('Hello', { role: 'me' }), shot('stage')) } }));
    expect(p.features.demo!.roles[0]).toMatchObject({ id: 'me', name: 'Speaker' });
    expect(p.options['demo.main']!.layers.world!.role).toBe('me');
    expect(p.scenarios['demo.main.one']).toMatchObject({ autoplay: false, actionEntry: 'after', initial: { layer: 'world' }, steps: [expect.objectContaining({ say: 'Hello', sayRole: 'me', directorLayer: 'world' })] });
    expect(entryOf(p,'demo')!.roles).toEqual(['Speaker']); expect(validate(p).summary.error).toBe(0);
  });
  it('影片与功能演示共用节点、派生、效果和逐帧插件钩子及步骤降级', () => {
    const hooks: string[] = [];
    const plugin = definePlugin({ id: 'probe', title: 'Probe', runtime: '/probe.js', schemas: { node: z.object({ measured: z.number() }), step: z.object({ value: z.number().optional(), ready: z.boolean().optional() }) }, components: { Item: { doc: 'item', selfEvident: true } }, compile: {
      node(n) { hooks.push('node'); return { ...n, props: { ...n.props, normalized: true } }; }, derive() { hooks.push('derive'); return { data: { measured: 12 } }; },
      effect() { hooks.push('effect'); return { data: { value: 7 }, targets: ['item'] }; }, frame(ctx) { hooks.push('frame'); return { ...(ctx.data as object), ready: true }; },
    } });
    const src = source(basic({ stage: jsx(pluginComponent(plugin,'Item'), { id: 'item' }), scenarios: { one: chapter('One').system('Show', narrate('Narration'), set($.ui.x, true), pluginEffect('probe','show',7)) } }));
    src.config.plugins = [plugin]; const r = compile(src,'dev'); expect(r.diagnostics).toEqual([]); const p = r.project!;
    expect(hooks).toEqual(expect.arrayContaining(['node','derive','effect','frame']));
    expect(p.scenes['demo.main~stage']!.root).toMatchObject({ props: { normalized: true }, ext: { probe: { measured: 12 } } });
    expect(p.scenarios['demo.main.one']!.steps[0]).toMatchObject({ narrate: 'Narration', ext: { probe: { value: 7, ready: true } }, effects: [{ type: 'set', path: 'ui.x', value: true }] });
    expect(stateAt(p,'demo.main.one',1).ui.x).toBe(true);
  });
  it('影片逐帧插件只读取自己的画面；范围分享不带其他功能页面的派生信息', () => {
    const plugin = definePlugin({ id:'roots', title:'Roots', runtime:'/roots.js', components:{}, schemas:{step:z.object({scenes:z.array(z.string())})}, data:{step:{scope:[{path:['scenes'],kind:'values',domain:'scene'}]}}, compile:{frame:ctx=>({scenes:ctx.scenes.map(s=>s.id)})} });
    const src=source(); src.config.plugins=[...(src.config.plugins??[]),plugin];
    src.routes['/app']={...page({title:'App',layout:false},tree()),file:'routes/app/page.tsx'};
    for (const mode of ['dev','publish','review'] as const) {
      const r=compile(src,mode);expect(r.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
      const p=r.project!;
      expect(p.scenarios['demo.main.one']!.ext!.roots).toEqual({scenes:['demo.main@/','demo.main~stage']});
      expect(scopeProject(p,['demo.main.one']).project.scenarios['demo.main.one']!.ext!.roots).toEqual({scenes:['demo.main@/','demo.main~stage']});
    }
  });
  it('没有影片时 films 缺省与空对象的 IR 和诊断完全一致；空 cases、单方案仍是 demo', () => {
    const src = source(); delete src.works; src.routes['/'] = { ...page({ title: 'Home' },tree()), file: 'routes/page.tsx' };
    src.features.f = { def: { ...feature({ name:'F', goal:'G', cases:{}, pick:'a' }), file:'features/f/feature.ts' }, options:{ a:{ ...option({ name:'A', idea:'I', scenarios:{ s:flow('S').system('One') } }), file:'features/f/options/a.tsx' } } };
    for (const mode of ['dev','publish','review'] as const) expect(compile({ ...src, works:{} },mode)).toEqual(compile(src,mode));
    const p = compile(src,'dev').project!; expect(p.features.f).not.toHaveProperty('standalone'); expect(entryOf(p, 'f')!.featureId).toBe('f');
    expect(outline(p).features[0]!.standalone).toBe(false); expect(validate(p).diagnostics.map(d => d.code)).toContain('HAPPY_PATH_ONLY');
  });
});

describe('作品边界诊断', () => {
  it.each([{title:''},{summary:''},{stage:undefined},{layers:{world:layer('W',tree())}},{scenarios:null},{scenarios:[]},{scenarios:{bad:{} as never}},{kind:'option'}])('无效定义返回 WORK_INVALID：%j', extra => {
    const r = build(basic(extra as never)); expect(r.project).toBeNull(); expect(codes(r)).toContain('WORK_INVALID'); expect(r.diagnostics[0]!.at).toBeTruthy();
  });
  it('没有章节是 info；空 audience 等于没写；stage viewport 保留', () => {
    const f = basic({ scenarios:{}, audience:'', viewport:'mobile' }); const r = build(f);
    expect(r.project).not.toBeNull(); expect(r.diagnostics).toEqual([expect.objectContaining({code:'WORK_EMPTY',severity:'info'})]);
    expect(r.project!.features.demo).not.toHaveProperty('audience'); expect(entryOf(r.project!,'demo')!.audience).toBeNull();
    expect(r.project!.scenes['demo.main~stage']!.viewport).toBe('mobile');
  });
  it('独立切片的 cases 与 uses() 只适用于功能', () => {
    for (const slice of [chapter('One', { cases: ['x'] }), flow('One', { cases: [] }), flow('One').system('Use', uses('rule'))]) {
      const r = build(basic({ scenarios: { one: slice } }));
      expect(r.project).toBeNull(); expect(codes(r)).toContain('WORK_FEATURE_ONLY');
    }
  });
  it.each(['missing','one'])('不存在或指向自己的 from：%s', from => {
    const r = build(basic({scenarios:{one:chapter('One',{from})}})); expect(r.project).toBeNull();
    expect(r.diagnostics).toContainEqual(expect.objectContaining({code:'FROM_UNKNOWN',message:expect.stringMatching(/chapter.*one/i)}));
  });
  it('接续成环沿用 FROM_CYCLE', () => { expect(codes(build(basic({ scenarios:{a:chapter('A',{from:'b'}),b:chapter('B',{from:'a'})} })))).toContain('FROM_CYCLE'); });
  it('影片键与功能文件夹共用命名空间', () => {
    const src=source(); src.features.demo={def:{...feature({name:'Demo',goal:'G',cases:{}}),file:'features/demo/feature.ts'},options:{}};
    expect(codes(compile(src,'dev'))).toContain('WORK_ID_CONFLICT');
  });
  it('章节诊断编号服从已编译 from 的播放顺序，支线排在后面', () => {
    const p = project(basic({ scenarios: {
      later: chapter('Later', { from: 'opening' }), opening: chapter('Opening', { from: null }),
      branch: chapter('Branch', { from: null, autoplay: false }),
    } }));
    expect(entryOf(p,'demo')!.slices.map(s=>s.key)).toEqual(['opening','later','branch']);
    const ds = validate(p).diagnostics.filter(d=>d.code==='EMPTY_SCENARIO');
    for (const [key, number] of [['opening','01'],['later','02'],['branch','03']])
      expect(ds.find(d=>d.ref?.id===`demo.main.${key}`)!.message).toContain(`Chapter ${number}`);
  });
  it('空章节、过长章节与说明提示使用 Chapter 和播放顺序编号，代码不变', () => {
    const f=basic({scenarios:{empty:chapter('Empty'),long:chapter('Long',{description:'x'.repeat(100)}).system('Wait',hold(30)).system('Wait',hold(30)).system('Wait',hold(30)).system('Wait',hold(30))}});
    const p=project(f); const ds=validate(p).diagnostics;
    expect(ds).toContainEqual(expect.objectContaining({code:'EMPTY_SCENARIO',message:expect.stringContaining('Chapter 01')}));
    expect(ds).toContainEqual(expect.objectContaining({code:'SCENARIO_TOO_LONG',message:expect.stringContaining('Chapter 02')}));
    expect(ds.find(d=>d.code==='DESCRIPTION_TOO_LONG')!.message).toContain('Chapter 02');
  });
});

const dirs:string[]=[]; afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
describe('作品文件发现与加载',()=>{
  const directory=()=>{const dir=mkdtempSync(join(tmpdir(),'joplo-film-load-'));dirs.push(dir);mkdirSync(join(dir,'works'));writeFileSync(join(dir,'joplo.config.ts'),'');for(const f of ['a.tsx','b.ts','ignore.txt'])writeFileSync(join(dir,'works',f),'');return dir;};
  it('发现 ts/tsx 并保持调用与 JSX 源位置',async()=>{
    const dir=directory();mkdirSync(join(dir,'films'));writeFileSync(join(dir,'films','old.tsx'),''); const files=discoverFiles(dir);expect(files).not.toContain(join(dir,'films/old.tsx'));expect(files).toContain(join(dir,'works/a.tsx'));expect(files).toContain(join(dir,'works/b.ts'));expect(files).not.toContain(join(dir,'works/ignore.txt'));
    const r=await loadAuthoring(dir,async file=>({default:file.endsWith('joplo.config.ts')?config({name:'T'}):basic()}));
    expect(r.diagnostics).toEqual([]);expect(Object.keys(r.authoring!.works!)).toEqual(['a','b']);expect(r.authoring!.works!.a!.file).toBe('works/a.tsx');
  });
  it('错误默认导出报 WORK_INVALID；导入异常沿用带位置的 LOAD_FAILED',async()=>{
    const dir=directory();const r=await loadAuthoring(dir,async file=>{if(file.endsWith('joplo.config.ts'))return{default:config({name:'T'})};if(file.endsWith('a.tsx'))return{default:{}};throw new Error('broken import');});
    expect(r.diagnostics).toContainEqual(expect.objectContaining({code:'WORK_INVALID',at:'works/a.tsx:1:1'}));
    expect(r.diagnostics).toContainEqual(expect.objectContaining({code:'LOAD_FAILED',at:'works/b.ts:1:1',message:'Load failed: broken import'}));
  });
});
