/** 发布 CSS 只能从最终公开载荷取作者工具类；全文件检查不能只看内联 IR。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cssClasses, publicClassTokens } from './css-classes.ts';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { build as viteBuild, createServer } from 'vite';
import { entriesOf, Project as ProjectSchema, resolveScope, scopeProject, type Project } from '@joplo-app/core';
import { compileProject } from '../src/project.ts';
import tailwindcss from '@tailwindcss/vite';
import { installFixturePlugins } from '../../../scripts/test/fixtures.ts';
import { buildSite } from '../src/build.ts';
import { joploProjectPlugin, kitAliases } from '../src/vite-shared.ts';
import { locateWebAssets, type WebAssets } from '../src/web-assets.ts';

const chosen = vi.hoisted(() => ({ web: null as WebAssets | null }));
vi.mock('../src/web-assets.ts', async original => {
  const actual = await original<typeof import('../src/web-assets.ts')>();
  return { ...actual, locateWebAssets: (env?: Record<string, string | undefined>) => chosen.web ?? actual.locateWebAssets(env) };
});

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-public-css-')));
const project = path.join(root, 'project');
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const cls = (name: string) => `before:content-['${name}'] bg-[url('https://${name.toLowerCase().replaceAll('_', '-')}.example.invalid/picture.png')]`;
const initial = cls('PUBLIC_INITIAL');
const effect = cls('PUBLIC_EFFECT');
const sliced = cls('SLICED_PRIVATE');
const alternative = cls('OPTION_PRIVATE');
const draft = cls('DRAFT_PRIVATE');
const quoted = `after:content-['PUBLIC_"QUOTED"']`;
let sourceWeb: WebAssets, distWeb: WebAssets;
let devProject: Project;

const styles = (dir: string) => files(dir).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(f, 'utf8')).join('\n');
const payload = (dir: string) => JSON.parse(/id="joplo-ir">([\s\S]*?)<\/script>/.exec(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'))![1]!).project;

beforeAll(async () => {
  sourceWeb = locateWebAssets({});
  fs.mkdirSync(path.join(project, 'works'), { recursive: true });
  fs.mkdirSync(path.join(project, 'features/f/works'), { recursive: true });
  fs.mkdirSync(path.join(project, 'themes'), { recursive: true });
  installFixturePlugins(project);
  fs.writeFileSync(path.join(project, 'package.json'), '{"type":"module"}');
  fs.cpSync(path.resolve('scripts/fixtures/smoke/feature/tsconfig.json'), path.join(project, 'tsconfig.json'));
  fs.writeFileSync(path.join(project, 'joplo.config.ts'), `import { config } from '@joplo-app/kit'; import ui from '@joplo-app/plugin-ui'; export default config({name:'Public CSS',plugins:[ui],theme:'custom'});`);
  fs.writeFileSync(path.join(project, 'themes/custom.css'), '.author-theme{color:#123456}');
  fs.writeFileSync(path.join(project, 'works/live.tsx'), `import { work, flow, $, set } from '@joplo-app/kit';
// before:content-['COMMENT_PRIVATE']
export default work({title:'Live',summary:'Public',state:{ui:{visual:${JSON.stringify(initial)}}},stage:<div><div className={$.ui.visual}>Public</div><div className={${JSON.stringify(quoted)}} note="before:content-['NOTE_PRIVATE']">Quoted</div></div>,scenarios:{one:flow('One').system('Begin',set($.ui.visual,${JSON.stringify(effect)})),two:flow('Two').system('Other',set($.ui.visual,${JSON.stringify(sliced)}))}});`);
  fs.writeFileSync(path.join(project, 'works/old.tsx'), `import { work, flow } from '@joplo-app/kit'; export default work({title:'Old',summary:'Draft',draft:true,stage:<div className={${JSON.stringify(draft)}}>Old</div>,scenarios:{one:flow('Old').system('Old')}});`);
  fs.writeFileSync(path.join(project, 'features/f/feature.ts'), `import { feature } from '@joplo-app/kit'; export default feature({name:'Feature',goal:'Compare',cases:{one:'One'},pick:'a'});`);
  for (const key of ['a', 'b']) fs.writeFileSync(path.join(project, `features/f/works/${key}.tsx`), `import { work, flow, layer } from '@joplo-app/kit'; export default work({title:'${key}',summary:'${key}',layers:{main:layer('Main',<div className={${JSON.stringify(key === 'a' ? 'tracking-[0.37em]' : alternative)}}>${key}</div>)},scenarios:{one:flow('One',{cases:['one']}).system('Start')}});`);
  // 使用真实 dist CSS 编译/复制路径；播放器模板最小化，避免测试依赖本机已有发包产物。
  const web = path.join(root, 'web'); const app = path.join(web, 'app');
  fs.mkdirSync(path.join(app, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(app, 'site.html'), '<html><head><title>Test</title></head><body><script type="module" src="./assets/player.js"></script></body></html>');
  fs.writeFileSync(path.join(app, 'assets/player.js'), 'globalThis.publicPlayer=true;');
  fs.writeFileSync(path.join(web, 'project.css'), '@import "tailwindcss" source(none);');
  distWeb = { mode: 'dist', webDir: web, appDir: app, siteFiles: ['site.html', 'assets/player.js'], projectCss: path.join(web, 'project.css'), version: 'test' };
  const loader = await createServer({ configFile: false, envDir: false, root: project, logLevel: 'error', appType: 'custom', resolve: { alias: kitAliases(sourceWeb, project) }, plugins: [joploProjectPlugin(project, sourceWeb)], server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const result = await compileProject(loader, project, 'dev');
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(result.project).not.toBeNull();
    if (!result.project) throw new Error('Expected the publication fixture to compile');
    devProject = result.project;
  } finally { await loader.close(); }

});
afterAll(() => { chosen.web = null; fs.rmSync(root, { recursive: true, force: true }); });

const scopes = [
  { name: 'publish', review: false },
  { name: 'review', review: true },
  { name: 'publish-scope', review: false, scope: { scenarios: ['live.one'] } },
  { name: 'review-scope', review: true, scope: { scenarios: ['live.one'] } },
  { name: 'publish-combined', review: false, scope: { entryIds: ['f'], scenarios: ['live.one'] } },
  { name: 'review-combined', review: true, scope: { entryIds: ['f'], scenarios: ['live.one'] } },
];
for (const mode of ['source', 'dist'] as const) for (const variant of scopes) it(`${mode} ${variant.name}：私有任意值文字/URL 不进入任何产物，公开类名完整`, async () => {
  chosen.web = mode === 'source' ? sourceWeb : distWeb;
  const r = await buildSite({ projectDir: project, outDir: path.join(root, `${mode}-${variant.name}`), review: variant.review, ...('scope' in variant ? { scope: variant.scope } : {}) });
  const ir = payload(r.outDir);
  expect(ir.schemaVersion).toBe(3);
  const parsed = ProjectSchema.parse(ir);
  const publicationMode = variant.review ? 'review' : 'publish';
  const request = 'scope' in variant ? variant.scope : { entryIds: entriesOf(devProject).filter(e => !e.draft).map(e => e.id) };
  const expected = scopeProject(devProject, resolveScope(devProject, request, publicationMode), publicationMode).project;
  expect(entriesOf(parsed)).toEqual(entriesOf(expected));
  const css = styles(r.outDir);
  const classes = cssClasses(css);
  for (const token of [...initial.split(' '), ...effect.split(' ')]) expect(classes.has(token), token).toBe(true);
  expect(JSON.stringify(ir)).toContain('.author-theme');
  for (const [name, visible] of [
    ['DRAFT_PRIVATE', false], ['COMMENT_PRIVATE', false], ['NOTE_PRIVATE', false],
    ['OPTION_PRIVATE', variant.review && (!('scope' in variant) || variant.name.endsWith('combined'))],
    ['SLICED_PRIVATE', !('scope' in variant)],
  ] as const) {
    const markers = [name, name.replaceAll('_', ' '), `${name.toLowerCase().replaceAll('_', '-')}.example.invalid`];
    for (const token of cls(name).split(' ')) expect(classes.has(token), `${name}: ${token}`).toBe(visible);
    if (!visible) for (const file of files(r.outDir)) for (const marker of markers) expect(fs.readFileSync(file).includes(Buffer.from(marker)), `${path.relative(r.outDir, file)}: ${marker}`).toBe(false);
  }
  expect(classes.has(quoted), quoted).toBe(true);
}, 120_000);

/** 用旧的目录扫描建立基线，逐一比较公开 IR 引用且旧 CSS 确实提供的类规则。 */
for (const name of ['invite', 'midterms-2026', 'joplo', 'llm-explainer']) it(`${name}：公开 IR 引用的旧工具类规则全部保留`, async () => {
  chosen.web = sourceWeb;
  const original = path.resolve('examples', name);
  const dir = path.join(root, `copy-${name}`);
  fs.cpSync(original, dir, { recursive: true, filter: file => !/[/\\](node_modules|dist|exports|\.joplo|\.git)([/\\]|$)/.test(file.slice(original.length)) });
  installFixturePlugins(dir, name === 'joplo' ? ['av'] : []);
  // 这些示例多数用组件属性/自定义主题而非 Tailwind；在临时副本加公开探针，避免零类名比较空过。
  const probe = "tracking-[0.37em] md:gap-[7px] [&>span]:text-[17px] w-1/2 before:content-['EXAMPLE_PUBLIC']";
  fs.mkdirSync(path.join(dir, 'works'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'works/css-probe.tsx'), `import { work, flow, $, set } from '@joplo-app/kit';
export default work({title:'CSS probe',summary:'CSS regression',stage:<div className={${JSON.stringify(probe)}}><span className={$.ui.color}>Public</span></div>,state:{ui:{color:'text-[#123456]'}},scenarios:{one:flow('Probe').system('Change',set($.ui.color,'bg-[#abcdef]'))}});`);
  const r = await buildSite({ projectDir: dir, outDir: path.join(root, `example-${name}`) });
  const legacy = path.join(root, `legacy-${name}`);
  await viteBuild({ configFile: false, envDir: false, root: path.dirname(distWeb.mode === 'dist' ? distWeb.projectCss : ''), logLevel: 'error',
    plugins: [joploProjectPlugin(dir, distWeb), tailwindcss()], build: { outDir: legacy, reportCompressedSize: false, sourcemap: false,
      rolldownOptions: { input: distWeb.mode === 'dist' ? distWeb.projectCss : '' } } });
  const before = cssClasses(styles(legacy)), after = cssClasses(styles(r.outDir));
  const used = publicClassTokens(payload(r.outDir), before);
  for (const token of [...probe.split(' '), 'text-[#123456]', 'bg-[#abcdef]']) {
    expect(before.has(token), `legacy probe: ${token}`).toBe(true);
    expect(used.has(token), `public IR probe: ${token}`).toBe(true);
  }
  expect(used.size).toBeGreaterThanOrEqual(7);
  expect([...used].filter(token => !after.has(token)), `${name}: ${used.size} public class rules`).toEqual([]);
}, 120_000);

it('CSS 选择器反转义保留任意值、变体与数字开头类名', () => {
  expect([...cssClasses(String.raw`.before\:content-\[\'word\'\]:before{content:'word'}.w-\[2\.5px\]{width:2.5px}.\32 xl\:block{display:block}`)])
    .toEqual(["before:content-['word']", 'w-[2.5px]', '2xl:block']);
});

it('本地看板继续扫描项目目录；发布源才关闭自动发现', async () => {
  const web = sourceWeb;
  if (web.mode !== 'source') throw new Error('Source fixture required');
  const plugin = joploProjectPlugin(project, web);
  const transform = plugin.transform as (code: string, id: string) => Promise<{ code: string }>;
  const css = fs.readFileSync(web.indexCss, 'utf8');
  const dev = await transform(css, web.indexCss);
  expect(dev.code).toContain(`@source ${JSON.stringify(project)};`);
  expect(dev.code).not.toContain('source(none)');
  const published = await (joploProjectPlugin(project, web, '/public-ir.html').transform as typeof transform)(css, web.indexCss);
  expect(published.code).toContain('source(none)');
  expect(published.code).not.toContain(`@source ${JSON.stringify(project)};`);
});
