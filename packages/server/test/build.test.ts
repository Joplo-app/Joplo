/** buildSite：拒绝覆盖、只发布选定方案、HTML 后处理；renderStep：截图 + 带 at 的元素索引 + 告警。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSite, finalizeHtml, jsonForHtml } from '../src/build.ts';
import { renderStep } from '../src/render.ts';

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
    expect(html).not.toMatch(/<(link|script)[^>]*crossorigin/);
    expect(html).not.toMatch(/<script[^>]*\ssrc="\.\//);
    const ir = JSON.parse(/<script type="application\/json" id="joplo-ir">([\s\S]*?)<\/script>/.exec(html)![1]!);
    expect(ir.home).toBe('/members');
    expect(ir.project.mode).toBe('publish');
    expect(Object.keys(ir.project.options)).toEqual(['invite.a-modal']);
    expect(ir.project.features.invite.constraints).toBeUndefined();
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
    await expect(buildSite({ projectDir: dir })).rejects.toThrow(/目标目录非空/);
    expect(fs.existsSync(path.join(out, 'keep.txt'))).toBe(true);
    await buildSite({ projectDir: dir, overwrite: true });
    expect(fs.existsSync(path.join(out, 'keep.txt'))).toBe(false);
  }, 120_000);

  it('永远不清空项目目录本身或它的上级、也不写 .joplo/', async () => {
    await expect(buildSite({ projectDir: dir, outDir: dir, overwrite: true })).rejects.toThrow(/项目目录本身或它的上级/);
    await expect(buildSite({ projectDir: dir, outDir: path.dirname(dir), overwrite: true })).rejects.toThrow(/项目目录本身或它的上级/);
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

describe('renderStep', () => {
  let dir: string;
  let outDir: string;
  beforeAll(() => {
    dir = copy();
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-shot-'));
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('弹窗打开后的截图：元素索引带 at，无渲染告警；不覆盖已有文件', async () => {
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
    await expect(renderStep({ projectDir: dir, scenarioId: 'invite.a-modal.success', out })).rejects.toThrow(/已存在/);
  }, 120_000);

  it('Toast 场景（线框主题）与跨路径场景都能渲染；未知场景报 NOT_FOUND；不能写到源文件或 .joplo/', async () => {
    const t = await renderStep({ projectDir: dir, scenarioId: 'invite.a-modal.success', stepId: 'invite.a-modal.success#5', theme: 'clean', out: path.join(outDir, 'toast.png') });
    expect(t.warnings).toEqual([]);
    const b = await renderStep({ projectDir: dir, scenarioId: 'invite.b-batch.partial', stepId: 'invite.b-batch.partial#5', out: path.join(outDir, 'b.png') });
    expect(b.sceneId).toBe('invite.b-batch@/members/invite');
    expect(b.elements.find((e) => e.id === 'tbl_results')?.visible).toBe(true);
    await expect(renderStep({ projectDir: dir, scenarioId: 'nope', out: path.join(outDir, 'n.png') })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(renderStep({ projectDir: dir, scenarioId: 'invite.a-modal.success', out: path.join(dir, 'joplo.config.ts'), overwrite: true })).rejects.toThrow(/源文件/);
    await expect(renderStep({ projectDir: dir, scenarioId: 'invite.a-modal.success', out: path.join(dir, '.joplo/x.png') })).rejects.toThrow(/\.joplo/);
  }, 180_000);
});
