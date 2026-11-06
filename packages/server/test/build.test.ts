/** buildSite：拒绝覆盖、只发布选定方案、HTML 后处理；renderStep：截图 + 带 at 的元素索引 + 告警。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSite, finalizeHtml, jsonForHtml, publishPayload } from '../src/build.ts';
import { renderStep } from '../src/render.ts';
import { PLAYWRIGHT_VERSION, exportRuntimeStatus, runtimePaths } from '../src/export-runtime.ts';
import { compileProject } from '../src/project.ts';
import { Project as ProjectSchema } from '@joplo-app/core';
import { joploProjectPlugin, kitAliases, locateWebAssets } from '../src/vite-shared.ts';
import { createServer } from 'vite';

const EXAMPLE = path.resolve(import.meta.dirname, '../../../examples/invite');
const copy = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-build-t-'));
  fs.cpSync(EXAMPLE, d, { recursive: true });
  return fs.realpathSync(d);
};

describe('buildSite', () => {
  let dir: string;
  beforeAll(() => {
    dir = copy();
    const config = path.join(dir, 'joplo.config.ts');
    fs.writeFileSync(config, fs.readFileSync(config, 'utf8').replace("name: '团队邀请功能'", () => `name: '团队 <&\" $&'`));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('缺省输出到 <项目>/dist，只含选定方案的路径与场景', async () => {
    const r = await buildSite({ projectDir: dir });
    expect(r.outDir).toBe(path.join(dir, 'dist'));
    expect(r.routes).toEqual(['/members', '/settings']);
    expect(r.scenarios.sort()).toEqual(['invite.a-modal.denied', 'invite.a-modal.failure', 'invite.a-modal.success']);
    expect(r.files).toContain('index.html');
    expect(r.files.some((f) => f.endsWith('.css'))).toBe(true);
    expect(r.files.some((f) => f.endsWith('.js'))).toBe(false); // 入口脚本已内联
    const html = fs.readFileSync(path.join(dir, 'dist/index.html'), 'utf8');
    expect(html).toContain('id="joplo-ir"');
    expect(html.match(/<title>[^<]*<\/title>/)?.[0]).toBe('<title>团队 &lt;&amp;&quot; $&amp; · Joplo</title>');
    expect(html).not.toMatch(/<(link|script)[^>]*crossorigin/);
    expect(html).not.toMatch(/<script[^>]*\ssrc="\.\//);
    const ir = JSON.parse(/<script type="application\/json" id="joplo-ir">([\s\S]*?)<\/script>/.exec(html)![1]!);
    expect(ir.home).toBe('/members');
    expect(ir.project.mode).toBe('publish');
    expect(Object.keys(ir.project.options)).toEqual(['invite.a-modal']);
    expect(ir.project.features.invite.constraints).toBeUndefined();
    // D55 不变量 5：创作侧的界面（缺口横幅、检查、外观浮层、作者用的设备标注）只在看板里，不进发布站的产物
    for (const s of ['复制给 Agent', 'joplo check --option', '恢复项目默认', '设为所有项目的默认', 'selection.json', '手机页面 ·', '外观浮层']) expect(html, s).not.toContain(s);
  }, 120_000);

  it('Tailwind 以项目目录为 @source：项目里独有的 className 被编译进 CSS', async () => {
    const f = path.join(dir, 'routes/settings/page.tsx');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<Title order={2}>空间设置</Title>', '<Title order={2} className="tracking-[0.37em]">空间设置</Title>'));
    const r = await buildSite({ projectDir: dir, outDir: path.join(dir, 'dist-tw') });
    const css = r.files.filter((x) => x.endsWith('.css')).map((x) => fs.readFileSync(path.join(r.outDir, x), 'utf8')).join('');
    expect(css).toContain('.37em');
  }, 120_000);

  it('目标目录非空且没有 overwrite 时拒绝；overwrite 时清空重建', async () => {
    const out = path.join(dir, 'dist');
    fs.writeFileSync(path.join(out, 'keep.txt'), 'x');
    await expect(buildSite({ projectDir: dir })).rejects.toThrow(/Output directory is not empty/);
    expect(fs.existsSync(path.join(out, 'keep.txt'))).toBe(true);
    await buildSite({ projectDir: dir, overwrite: true });
    expect(fs.existsSync(path.join(out, 'keep.txt'))).toBe(false);
  }, 120_000);

  it('永远不清空项目目录本身或它的上级、也不写 .joplo/', async () => {
    await expect(buildSite({ projectDir: dir, outDir: dir, overwrite: true })).rejects.toThrow(/project directory or its parent/);
    await expect(buildSite({ projectDir: dir, outDir: path.dirname(dir), overwrite: true })).rejects.toThrow(/project directory or its parent/);
    await expect(buildSite({ projectDir: dir, outDir: path.join(dir, '.joplo/x') })).rejects.toThrow(/\.joplo/);
    expect(fs.existsSync(path.join(dir, 'joplo.config.ts'))).toBe(true);
  });

  it('编译失败时不写任何文件，并带上诊断', async () => {
    const bad = copy();
    try {
      fs.writeFileSync(path.join(bad, 'features/invite/feature.ts'), fs.readFileSync(path.join(bad, 'features/invite/feature.ts'), 'utf8').replace("pick: 'a-modal'", "pick: 'nope'"));
      await expect(buildSite({ projectDir: bad })).rejects.toMatchObject({ code: 'EXPORT_FAILED' });
      expect(fs.existsSync(path.join(bad, 'dist'))).toBe(false);
    } finally {
      fs.rmSync(bad, { recursive: true, force: true });
    }
  }, 60_000);

  it('没有 pick 的功能不发布，并给出提示', async () => {
    const np = copy();
    try {
      fs.writeFileSync(path.join(np, 'features/invite/feature.ts'), fs.readFileSync(path.join(np, 'features/invite/feature.ts'), 'utf8').replace("  pick: 'a-modal',\n", ''));
      const r = await buildSite({ projectDir: np });
      expect(r.scenarios).toEqual([]);
      expect(r.diagnostics.map((d) => d.code)).toContain('NOT_PICKED');
    } finally {
      fs.rmSync(np, { recursive: true, force: true });
    }
  }, 120_000);
});

/** 创作侧文字（规则含 AI 假设、待决问题、设计备注、取舍、决策重点）：dev IR 里有，任何构建产物里都不能出现（D33 / D63）。 */
async function authoringStrings(dir: string): Promise<string[]> {
  // 与 buildSite 同一条载入路径（Vite ssrLoadModule + kit 别名），只是编译成 dev IR
  const web = locateWebAssets();
  const loader = await createServer({ configFile: false, envDir: false, root: dir, logLevel: 'error', appType: 'custom', resolve: { alias: kitAliases(web, dir) }, plugins: [joploProjectPlugin(dir, web)], server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  let dev;
  try {
    dev = (await compileProject(loader, dir, 'dev')).project!;
  } finally {
    await loader.close();
  }
  const notes: string[] = [];
  const walk = (n: { note?: string; children?: unknown[] }) => {
    if (n.note) notes.push(n.note);
    for (const c of (n.children ?? []) as (typeof n)[]) walk(c);
  };
  for (const s of Object.values(dev.scenes)) walk(s.root);
  const out = [...Object.values(dev.rules).map((r) => r.text), ...Object.values(dev.issues).map((q) => q.text), ...notes, ...Object.values(dev.options).flatMap((o) => [...o.tradeoffs, o.decisionFocus].filter(Boolean))];
  expect(Object.values(dev.rules).some((r) => r.origin === 'ai_assumption')).toBe(true);
  expect(Object.keys(dev.issues).length).toBeGreaterThan(0);
  return out;
}
const TEXT = /\.(html|css|js|mjs|json|svg|txt)$/;
function siteText(outDir: string, files: string[]): string {
  return files.filter((f) => TEXT.test(f)).map((f) => fs.readFileSync(path.join(outDir, f), 'utf8')).join('\n');
}

describe('评审版构建（review: true，D63）', () => {
  let dir: string;
  beforeAll(() => {
    dir = copy();
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('含所有方案的场景，可按场景切换方案；IR mode 为 review', async () => {
    const r = await buildSite({ projectDir: dir, outDir: path.join(dir, 'review-site'), review: true });
    expect(r.scenarios.sort()).toEqual(expect.arrayContaining(['invite.a-modal.success', 'invite.b-batch.partial']));
    const html = fs.readFileSync(path.join(r.outDir, 'index.html'), 'utf8');
    const ir = JSON.parse(/<script type="application\/json" id="joplo-ir">([\s\S]*?)<\/script>/.exec(html)![1]!);
    expect(ir.project.mode).toBe('review');
    expect(Object.keys(ir.project.options).sort()).toEqual(['invite.a-modal', 'invite.b-batch']);
    expect(ir.project.features.invite.pick).toBe('invite.a-modal');
    for (const s of Object.values(ir.project.scenarios) as { optionId: string; initial: { sceneId: string } }[]) expect(ir.project.scenes[s.initial.sceneId].optionId).toBe(s.optionId);
    expect(ir.project.rules).toBeUndefined();
    expect(ir.project.issues).toBeUndefined();
  }, 120_000);

  it.each([false, true])('review=%s：上传文件全文搜不到规则、问题、备注、取舍', async (review) => {
    const secrets = await authoringStrings(dir);
    expect(secrets.length).toBeGreaterThan(5);
    const r = await buildSite({ projectDir: dir, outDir: path.join(dir, review ? 'scan-review' : 'scan-publish'), review });
    const text = siteText(r.outDir, r.files);
    expect(text).toContain('joplo-ir');
    for (const s of secrets) expect(text, s).not.toContain(s);
  }, 120_000);
});

describe('publishPayload', () => {
  it('保留 feature.roles：角色属于演示（说话人、过渡卡、层级角色），播放器按层级的 role 查找它', () => {
    const roles = [{ id: 'xiaoyu', name: '小雨', desc: '发起人', color: '#e8a33d' }];
    const project = {
      features: { f: { id: 'f', name: 'F', goal: 'G', roles, constraints: [{ id: 'c', text: '创作侧', hard: false }], caseIds: ['f.x'], optionIds: ['f.a'], pick: 'f.a' } },
      featureIds: ['f'],
      options: { 'f.a': { id: 'f.a', featureId: 'f', key: 'a', name: 'A', idea: 'I', routes: [], coverage: {}, layers: { me: { title: '我', sceneId: 'f.a~me', role: 'xiaoyu' } } } },
      scenarios: {},
      routes: {},
      rules: {},
      cases: {},
      issues: {},
    } as unknown as Parameters<typeof publishPayload>[0];
    const out = publishPayload(project, null).project as { features: Record<string, Record<string, unknown>> };
    expect(out.features.f!.roles).toEqual(roles);
    expect(out.features.f).not.toHaveProperty('constraints');
    expect(out.features.f).not.toHaveProperty('caseIds');
  });
});

/**
 * 发布产物必须是完整的 IR：用 schema 重新解析后，只允许缺“有意去掉的创作侧字段”。
 * 播放器读的是发布站内联的原始 JSON（不经 schema 补默认值），任何被顺手裁掉的演示字段都会让它在线上崩溃，
 * 而本地看板读完整的 dev IR 看不出来（2026-11-06：feature.roles 被裁掉，所有带角色的分享一播放就白屏）。
 */
// 顶层的 rules / cases / issues 与 feature / option 上的这些字段是创作侧信息，有意不进发布站（D33）。
const STRIPPED_FOR_PUBLISH = new Set(['rules', 'cases', 'issues', 'constraints', 'caseIds', 'decisionFocus', 'tradeoffs']);
function missingPaths(full: unknown, partial: unknown, at = ''): string[] {
  if (!full || typeof full !== 'object' || Array.isArray(full)) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(full as Record<string, unknown>)) {
    const p = partial as Record<string, unknown> | undefined;
    if (!p || !(k in p)) out.push(`${at}.${k}`);
    else out.push(...missingPaths(v, p[k], `${at}.${k}`));
  }
  return out;
}
describe('发布产物是完整的 IR（只缺有意去掉的创作侧字段）', () => {
  for (const name of ['camping', 'agent-arch', 'invite']) {
    it(`examples/${name}`, async () => {
      const dir = path.resolve(import.meta.dirname, '../../../examples', name);
      const web = locateWebAssets();
      const loader = await createServer({ configFile: false, envDir: false, root: dir, logLevel: 'error', appType: 'custom', resolve: { alias: kitAliases(web, dir) }, plugins: [joploProjectPlugin(dir, web)], server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
      let compiled;
      try {
        compiled = (await compileProject(loader, dir, 'publish')).project!;
      } finally {
        await loader.close();
      }
      const payload = JSON.parse(JSON.stringify(publishPayload(compiled, null).project));
      const reparsed = ProjectSchema.parse(payload);
      const missing = missingPaths(reparsed, payload).filter((p) => !STRIPPED_FOR_PUBLISH.has(p.split('.').pop()!));
      expect(missing).toEqual([]);
    }, 120_000);
  }
});

describe('finalizeHtml', () => {
  it('内联入口脚本与 IR、去掉 crossorigin 与 modulepreload，转义 </script>', () => {
    const html = '<html><head><script type="module" crossorigin src="./assets/a.js"></script><link rel="modulepreload" href="./assets/b.js"><link rel="stylesheet" crossorigin href="./assets/s.css"></head><body></body></html>';
    const { html: out, inlined } = finalizeHtml(html, () => 'console.log("</script>")', { project: { name: '</script><b>' }, home: null });
    expect(inlined).toEqual(['assets/a.js']);
    expect(out).not.toContain('crossorigin');
    expect(out).not.toContain('modulepreload');
    expect(out).toContain('<\\/script>');
    expect(out).toContain('<link rel="stylesheet" href="./assets/s.css">');
    expect(jsonForHtml({ x: '</script>' })).not.toContain('</');
    expect(out.match(/<\/script>/g)!.length).toBe(2);
  });
});

/**
 * 真实 Chromium（D65 不变量 ⑤）：第一组用“项目里已有的 playwright”（老项目），第二组用 Joplo 托管运行时；
 * 两者都链接到仓库里的 playwright / playwright-core 与本机已下载的浏览器，不访问网络。
 */
const SERVER_MODULES = path.resolve(import.meta.dirname, '../node_modules');
const defaultBrowsers = () =>
  process.env.PLAYWRIGHT_BROWSERS_PATH ||
  (process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Caches/ms-playwright')
  : process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'ms-playwright')
  : path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'ms-playwright'));

describe('renderStep', () => {
  let dir: string;
  let outDir: string;
  let home: string;
  const home0 = process.env.JOPLO_HOME;
  const browsers0 = process.env.PLAYWRIGHT_BROWSERS_PATH;
  beforeAll(() => {
    dir = copy();
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-shot-'));
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-shot-home-')));
    process.env.JOPLO_HOME = home;
    // 老项目：项目里装了 playwright
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    fs.symlinkSync(fs.realpathSync(path.join(SERVER_MODULES, 'playwright')), path.join(dir, 'node_modules/playwright'), 'junction');
  });
  afterAll(() => {
    process.env.JOPLO_HOME = home0;
    if (browsers0 === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = browsers0;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('弹窗打开后的截图（项目里的 playwright）：元素索引带 at，无渲染告警；不覆盖已有文件', async () => {
    expect(exportRuntimeStatus({ home, projectDir: dir })).toMatchObject({ ready: true, source: 'project' });
    const out = path.join(outDir, 'a.png');
    const r = await renderStep({ projectDir: dir, scenarioId: 'invite.a-modal.success', stepId: 'invite.a-modal.success#1', out });
    expect(fs.statSync(out).size).toBeGreaterThan(10_000);
    expect(r.position).toBe(1);
    expect(r.sceneId).toBe('invite.a-modal@/members');
    const send = r.elements.find((e) => e.id === 'btn_send')!;
    expect(send).toMatchObject({ visible: true, disabled: false, type: 'Button' });
    expect(send.at).toMatch(/^features\/invite\/options\/a-modal\.tsx:\d+:\d+$/);
    const alert = r.elements.find((e) => e.id === 'alert_send_error')!;
    expect(alert.visible).toBe(false);
    expect(alert.at).toMatch(/a-modal\.tsx/);
    expect(r.elements.every((e) => e.type !== '#text')).toBe(true);
    expect(r.warnings).toEqual([]);
    await expect(renderStep({ projectDir: dir, scenarioId: 'invite.a-modal.success', out })).rejects.toThrow(/already exists/);
  }, 120_000);

  it('Toast 场景（线框主题）与跨路径场景都能渲染（托管运行时）；未知场景报 NOT_FOUND；不能写到源文件或 .joplo/', async () => {
    // 托管运行时：<JOPLO_HOME>/runtime/playwright-<版本>/，项目里不再有 playwright
    fs.rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true });
    const p = runtimePaths(home);
    fs.mkdirSync(path.join(p.dir, 'node_modules'), { recursive: true });
    fs.symlinkSync(fs.realpathSync(path.join(SERVER_MODULES, 'playwright-core')), path.join(p.dir, 'node_modules/playwright-core'), 'junction');
    fs.symlinkSync(defaultBrowsers(), p.browsers, 'junction');
    fs.writeFileSync(p.marker, JSON.stringify({ version: PLAYWRIGHT_VERSION, installedAt: new Date().toISOString() }));
    expect(exportRuntimeStatus({ home, projectDir: dir })).toMatchObject({ ready: true, source: 'managed' });
    const t = await renderStep({ projectDir: dir, scenarioId: 'invite.a-modal.success', stepId: 'invite.a-modal.success#5', theme: 'clean', out: path.join(outDir, 'toast.png') });
    expect(t.warnings).toEqual([]);
    const b = await renderStep({ projectDir: dir, scenarioId: 'invite.b-batch.partial', stepId: 'invite.b-batch.partial#5', out: path.join(outDir, 'b.png') });
    expect(b.sceneId).toBe('invite.b-batch@/members/invite');
    expect(b.elements.find((e) => e.id === 'tbl_results')?.visible).toBe(true);
    await expect(renderStep({ projectDir: dir, scenarioId: 'nope', out: path.join(outDir, 'n.png') })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(renderStep({ projectDir: dir, scenarioId: 'invite.a-modal.success', out: path.join(dir, 'joplo.config.ts'), overwrite: true })).rejects.toThrow(/source file/);
    await expect(renderStep({ projectDir: dir, scenarioId: 'invite.a-modal.success', out: path.join(dir, '.joplo/x.png') })).rejects.toThrow(/\.joplo/);
  }, 180_000);
});
