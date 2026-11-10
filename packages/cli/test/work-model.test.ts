/** 作品 CLI 的契约：能力投影、范围隔离与旧功能输出兼容。 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, cp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runCli } from '../src/cli.ts';
import { buildSite } from '@joplo-app/server';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function project() {
  const d = await mkdtemp(join(tmpdir(), 'joplo-work-cli-test-')); dirs.push(d);
  await mkdir(join(d, 'works'));
  await symlink(resolve('node_modules'), join(d, 'node_modules'));
  await writeFile(join(d, 'package.json'), '{"type":"module"}');
  await cp('scripts/fixtures/smoke/feature/tsconfig.json', join(d, 'tsconfig.json'));
  await writeFile(join(d, 'joplo.config.ts'), "import { config } from '@joplo-app/kit';\nimport ui from '@joplo-app/plugin-ui';\nexport default config({name:'Portfolio',plugins:[ui]});\n");
  await work(d, 'demo');
  return d;
}
async function work(d: string, key: string, extra = '', slices = "intro:chapter('Introduction').system('Begin',narrate('Hello')),end:chapter('Conclusion').system('Finish',narrate('Done'))") {
  await writeFile(join(d, `works/${key}.tsx`), `import { work, chapter, flow, narrate } from '@joplo-app/kit';\nexport default work({title:'${key}',summary:'A standalone work',stage:<div>Hello</div>,${extra}scenarios:{${slices}}});\n`);
}
async function run(args: string[], deps = {}) {
  let out = '', err = '';
  const code = await runCli(args, { stdout: s => { out += s; }, stderr: s => { err += s; }, cloud: { env: { JOPLO_HOME: resolve('.no-home') } }, ...deps });
  return { code, out, err };
}
test('只有 works/：文字按作品与章节输出，JSON 带能力，--work 解析作品键', async () => {
  const d = await project();
  const text = await run(['outline', d, '--work', 'demo']);
  expect(text.code, text.out).toBe(0);
  expect(text.out).toMatch(/demo · 2 chapters · about \d+ s/);
  expect(text.out).toMatch(/01\s+intro\s+Introduction\s+1 step/);
  expect(text.out).toMatch(/02\s+end\s+Conclusion\s+1 step/);
  expect(text.out).not.toMatch(/Cases|option|picked|demo\.main/);
  const json = await run(['outline', d, '--work', 'demo', '--format', 'json']);
  expect(JSON.parse(json.out).data.outline.entries[0]).toMatchObject({ featureId: null, sequencing: 'linear', draft: false });
  expect((await run(['check', d, '--work', 'demo'])).code).toBe(0);
});
test('草稿、空作品与独立场景；不存在的 --work 列出可用条目；拒绝旧参数', async () => {
  const d = await project(); await work(d, 'old', 'draft:true,', ''); await work(d, 'free', '', "one:flow('Independent')");
  const r = await run(['outline', d]);
  expect(r.out).toContain('(draft)'); expect(r.out).toContain('old · 0 scenarios'); expect(r.out).toContain('free · 1 scenarios');
  for (const cmd of ['outline', 'check']) {
    const bad = await run([cmd, d, '--work', 'missing']);
    expect(bad.code).toBe(2); expect(bad.out).toMatch(/Works:.*demo.*free.*old/);
    expect((await run([cmd, d, '--option', 'demo'])).code).toBe(2);
  }
  for (const cmd of ['build', 'share']) expect((await run([cmd, d, '--feature', 'demo'])).code).toBe(2);
});
test('独立作品诊断的文字与 JSON 都定位到 works 文件的行列', async () => {
  const d = await project(); await work(d, 'demo', '', "intro:chapter('Introduction'),end:chapter('Conclusion',{from:'absent'})");
  // 独立进程使用 CLI 的原生 source map；Vitest 转译会改变调用栈坐标。
  const cli = async (args: string[]) => {
    try { const r = await promisify(execFile)(process.execPath, ['--import', 'tsx', resolve('packages/cli/src/bin.ts'), ...args]); return { code: 0, out: r.stdout }; }
    catch (e) { const r = e as { code: number; stdout: string }; return { code: r.code, out: r.stdout }; }
  };
  const json = await cli(['check', d, '--format', 'json']);
  expect(json.code).toBe(1);
  expect(JSON.parse(json.out).diagnostics).toContainEqual(expect.objectContaining({ code: 'FROM_UNKNOWN', at: expect.stringMatching(/^works\/demo\.tsx:2:\d+$/) }));
  const text = await cli(['check', d]); expect(text.out).toMatch(/works\/demo\.tsx:2:\d+  error  FROM_UNKNOWN/); expect(text.out).not.toContain('demo.main');
});
test('混合项目保留功能正文；功能选定方案用章节时也带编号', async () => {
  const d = await project(); await cp('examples/invite/features', join(d, 'features'), { recursive: true }); await cp('examples/invite/routes', join(d, 'routes'), { recursive: true });
  const r = await run(['outline', d, '--work', 'invite.a-modal']);
  expect(r.out).toContain('## invite · 团队成员邀请   picked: a-modal'); expect(r.out).toContain('Cases (A:');
  const file = join(d, 'features/invite/works/a-modal.tsx');
  await writeFile(file, `import { work, chapter, page, narrate } from '@joplo-app/kit';
export default work({title:'A',summary:'Chapters',routes:{'/linear':page({title:'Linear'},<div>Ready</div>)},scenarios:{first:chapter('First',{start:'/linear'}).system('Begin',narrate('Hello')),second:chapter('Second').system('Finish',narrate('Done'))}});`);
  const linear = await run(['outline', d, '--work', 'invite.a-modal']);
  expect(linear.out).toMatch(/\d+ chapters/); expect(linear.out).toMatch(/01\s+\w+/);
});
test('build --work 参数传入范围，旧项目构建摘要保持不变', async () => {
  const build = vi.fn(async () => ({ outDir: '/site', files: ['index.html'], scenarios: [], diagnostics: [] }));
  expect((await run(['build', 'project', '--work', 'demo'], { loadServer: async () => ({ buildSite: build }) })).code).toBe(0);
  expect(build).toHaveBeenCalledWith(expect.objectContaining({ scope: { entryIds: ['demo'], scenarios: [] } }));
});
test('真实构建仅发一件作品；草稿明确拒绝；跳过草稿列明原因；仅草稿不生成空站', async () => {
  const d = await project(); await work(d, 'other'); await work(d, 'old', 'draft:true,');
  const built = await buildSite({ projectDir: d, outDir: join(d, 'one'), scope: { entryIds: ['demo'] } });
  const html = await readFile(join(built.outDir, 'index.html'), 'utf8');
  const payload = JSON.parse(/id="joplo-ir">(.*?)<\/script>/.exec(html)![1]!);
  expect(payload.project.features).toEqual({});
  expect(Object.keys(payload.project.works)).toEqual(['demo']);
  expect(built.entries).toEqual([{ id: 'demo', title: 'demo', slices: 2, sequencing: 'linear' }]);
  expect(built.diagnostics.some(d => d.code === 'WORK_DRAFT_SKIPPED')).toBe(true);
  await expect(buildSite({ projectDir: d, outDir: join(d, 'draft'), scope: { entryIds: ['old'] } })).rejects.toThrow(/draft.*old|old.*draft/i);
  await expect(buildSite({ projectDir: d, outDir: join(d, 'bad'), scope: { entryIds: ['missing'] } })).rejects.toThrow(/Works:.*demo.*other/);
  await work(d, 'demo', 'draft:true,'); await work(d, 'other', 'draft:true,');
  await expect(buildSite({ projectDir: d, outDir: join(d, 'empty') })).rejects.toThrow(/no picked option[\s\S]*draft/i);
}, 60000);

test('技能用作品与能力教创作，诊断逐条可恢复，常见坑仍保留', async () => {
  const { skillTopic, agentSkills } = await import('@joplo-app/core');
  const authoring = skillTopic('authoring');
  expect(authoring).toContain('Works → slices → steps');
  for (const text of ['work({', 'chapter(', 'feature({', 'work({', 'works/<key>', 'from: null', '--work <key>', '0 errors', '--sheet', '--film --chain']) expect(authoring).toContain(text);
  for (const code of ['WORK_INVALID', 'WORK_ID_CONFLICT', 'WORK_SLICES_MIXED', 'WORK_FEATURE_ONLY', 'FROM_UNKNOWN', 'WORK_EMPTY', 'WORK_DRAFT_SKIPPED']) expect(skillTopic('check').split('\n').some(line => line.startsWith(`- ${code} (`)), code).toBe(true);
  const { skill, patterns } = await import('../../../plugins/content/src/guide.ts');
  expect(skill).not.toMatch(/a feature is the episode|HAPPY_PATH_ONLY is expected|flow\(\{ from/);
  expect(patterns).toContain('another work'); expect(patterns).toContain('draft: true');
  for (const text of ['Freeze the previous dev IR', 'stateAt', 'from: null', 'config.voice.roles', 'helper named chapter', 'not every identical string', 'Slot-only/empty wrapper', 'complete sentence unique']) expect(skill).toContain(text);
  for (const text of ['Cross-container flights', 'Known limits', 'zero-sized parent', 'screen only separates']) expect(skill).toContain(text);
  expect(skillTopic('story')).not.toMatch(/one case per chapter|numbered chapter headlines|chapters with from/);
  expect(agentSkills()[0]!.body).not.toMatch(/--option|--feature/);
});

test('空独立作品不进入发布，--work 选空作品明确拒绝，仅空作品不生成站点', async () => {
  const d=await project();await work(d,'empty','', '');
  const built=await buildSite({projectDir:d,outDir:join(d,'mixed-empty')});
  expect(built.entries!.map(e=>e.id)).toEqual(['demo']);
  expect(built.diagnostics).toContainEqual(expect.objectContaining({code:'WORK_EMPTY',severity:'info'}));
  await expect(buildSite({projectDir:d,outDir:join(d,'selected-empty'),scope:{entryIds:['empty']}})).rejects.toThrow(/empty|no slices|no scenarios/i);
  expect((await run(['build',d,'--work','empty','--out',join(d,'cli-empty')])).code).toBe(2);
  await work(d,'demo','', '');
  await expect(buildSite({projectDir:d,outDir:join(d,'all-empty')})).rejects.toThrow(/no picked option|no publishable/i);
},60000);
