/**
 * 生成文档截图：对 examples/invite 的副本调用 renderStep，输出到 docs/screenshots/。
 * 用法：pnpm exec tsx packages/server/scripts/render-docs.ts [输出目录]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { renderStep, startServer } from '../src/index.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'docs/screenshots'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-docs-'));
fs.copyFileSync(path.join(root, 'examples/invite/project.joplo.json'), path.join(tmp, 'project.joplo.json'));

const shots: { name: string; scenarioId: string; stepId?: string }[] = [
  { name: 'success-0-initial', scenarioId: 'sc_a_success' },
  { name: 'success-1-dialog-open', scenarioId: 'sc_a_success', stepId: 'a_s1_open' },
  { name: 'success-3-filled', scenarioId: 'sc_a_success', stepId: 'a_s3_role' },
  { name: 'success-5-toast', scenarioId: 'sc_a_success', stepId: 'a_s5_ok' },
  { name: 'failure-5-error', scenarioId: 'sc_a_failure', stepId: 'af_s5_fail' },
  { name: 'denied-initial', scenarioId: 'sc_a_denied' },
];
let bad = 0;
for (const theme of ['sketch', 'clean'] as const) {
  for (const s of shots) {
    const out = path.join(outDir, `${s.name}.${theme}.png`);
    const r = await renderStep({ projectDir: tmp, scenarioId: s.scenarioId, stepId: s.stepId, theme, out, overwrite: true });
    const visible = r.elements.filter((e) => e.visible).length;
    console.log(`${path.relative(root, r.path)}  position=${r.position} 可见元素=${visible} 告警=${r.warnings.length}`);
    for (const w of r.warnings) console.log(`  ⚠ ${w}`);
    bad += r.warnings.length;
  }
}
// 工作区截图（演示 / 审阅 / 未覆盖提示 / 失败场景）
{
  const server = await startServer({ projectDir: tmp, port: 0, log: () => undefined });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const idle = () => page.waitForFunction(() => { const u = (window as any).__JOPLO_UI__; return u && !u.busy && !u.playing; });
  const n = (id: string) => page.locator(`[data-joplo-stage] [data-jid="${id}"]`);
  const shot = async (name: string) => {
    await page.screenshot({ path: path.join(outDir, `workspace-${name}.png`) });
    console.log(`docs/screenshots/workspace-${name}.png`);
  };
  await page.goto(server.url);
  await n('btn_invite').waitFor();
  await page.waitForTimeout(400);
  await shot('demo-initial');
  // 自动播放到“输入邮箱”的打字动画中途
  await page.getByTestId('ctl-play').click();
  await page.waitForFunction(() => (window as any).__JOPLO_STATE__?.position === 1);
  await page.waitForFunction(() => document.querySelector('[data-joverlay="sample"]') !== null);
  await page.waitForTimeout(500);
  await page.getByTestId('ctl-play').click(); // 暂停
  await page.waitForTimeout(150);
  await shot('demo-autoplay-typing');
  await page.getByTestId('ctl-reset').click();
  await n('btn_invite').click(); await idle();
  await n('in_email').click(); await idle();
  await n('sel_role').click(); await idle();
  await n('btn_send').click(); await idle();
  await page.waitForTimeout(500);
  await shot('demo-success-complete');
  await page.getByTestId('scenario-sc_a_failure').click();
  for (const id of ['btn_invite', 'in_email', 'sel_role', 'btn_send']) { await n(id).click(); await idle(); }
  await page.mouse.move(5, 5);
  await shot('demo-failure-error');
  await page.getByTestId('scenario-sc_a_denied').click();
  {
    // 真实鼠标坐标点击禁用按钮（不用 force）
    const b = (await n('btn_invite').boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }
  await page.waitForTimeout(200);
  await shot('demo-denied-disabled-reason');
  await n('nav_settings').click();
  await page.waitForTimeout(200);
  await shot('demo-uncovered');
  await page.getByTestId('scenario-sc_a_success').click();
  await page.getByTestId('mode-review').click();
  await page.getByTestId('chip-a_s1_open').click();
  await n('btn_send').click();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  await shot('review-selected');
  await browser.close();
  await server.close();
}

fs.rmSync(tmp, { recursive: true, force: true });
if (bad) process.exitCode = 1;
