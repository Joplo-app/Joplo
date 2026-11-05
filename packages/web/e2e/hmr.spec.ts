/** 热更新：改临时副本的源文件 → 看板不刷新页面即更新，保持场景、位置与选中；语法错误显示 文件:行号，修好后自动恢复。 */
import fs from 'node:fs';
import path from 'node:path';
import { demoClick, expect, lineOf, node, playState, readSelection, test, uiState } from './fixtures';

const A = 'features/invite/options/a-modal.tsx';

test('修改按钮文字：不刷新页面、保持场景与位置', async ({ app, projectDir }) => {
  await app.evaluate(() => ((window as any).__NO_RELOAD__ = true));
  await demoClick(app, 'btn_invite');
  await demoClick(app, 'in_email');
  const before = await playState(app);
  expect(before!.position).toBe(2);
  const file = path.join(projectDir, A);
  const src = fs.readFileSync(file, 'utf8');
  const i = src.indexOf('          邀请成员\n        </Button>');
  expect(i).toBeGreaterThan(0);
  fs.writeFileSync(file, src.slice(0, i) + '          邀请新成员\n        </Button>' + src.slice(i + '          邀请成员\n        </Button>'.length));
  await expect(node(app, 'btn_invite')).toContainText('邀请新成员');
  expect(await app.evaluate(() => (window as any).__NO_RELOAD__)).toBe(true);
  const after = await playState(app);
  expect(after).toEqual(before);
  expect((await uiState(app)).scenarioId).toBe('invite.a-modal.success');
  await expect(node(app, 'dlg_invite')).toBeVisible();
});

test('写入语法错误：显示 文件:行号 并保留画面；修好后自动恢复', async ({ app, projectDir }) => {
  await app.evaluate(() => ((window as any).__NO_RELOAD__ = true));
  await demoClick(app, 'btn_invite');
  const file = path.join(projectDir, A);
  const good = fs.readFileSync(file, 'utf8');
  const line = lineOf(file, 'id="btn_invite"');
  const lines = good.split('\n');
  lines[line - 1] = lines[line - 1]!.replace('<Button id="btn_invite"', '<Button id="btn_invite" ={');
  fs.writeFileSync(file, lines.join('\n'));
  const diag = app.getByTestId('diagnostics');
  await expect(diag).toBeVisible();
  await expect(diag.getByTestId('diag-item').first()).toContainText(new RegExp(`features/invite/options/a-modal\\.tsx:${line}:\\d+`));
  // 上一次成功的画面与位置仍在
  await expect(node(app, 'dlg_invite')).toBeVisible();
  expect((await playState(app))!.position).toBe(1);

  fs.writeFileSync(file, good);
  await expect(diag).toHaveCount(0);
  await expect(node(app, 'btn_invite')).toContainText('邀请成员');
  expect((await playState(app))!.position).toBe(1);
  expect(await app.evaluate(() => (window as any).__NO_RELOAD__)).toBe(true);
});

test('热更新保持选中：元素行号变化时重写 at；元素被删时取消选中并写 null', async ({ app, projectDir }) => {
  await node(app, 'btn_invite').click({ modifiers: ['Alt'] });
  await expect(app.getByTestId('selection-sync')).toHaveAttribute('data-status', 'ok');
  const file = path.join(projectDir, A);
  const src = fs.readFileSync(file, 'utf8');
  // 在按钮上方插入两行：at 的行号应 +2
  const line = lineOf(file, 'id="btn_invite"');
  fs.writeFileSync(file, src.replace("export default option({", '// 注释一\n// 注释二\nexport default option({'));
  await expect.poll(() => readSelection(projectDir)?.at).toMatch(new RegExp(`a-modal\\.tsx:${line + 2}:`));
  await expect(app.getByTestId('sel-label')).toHaveText('邀请成员');

  // 删除按钮 → 取消选中
  const now = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, now.replace(/<Button id="btn_invite"[\s\S]*?<\/Button>/, '<Button id="btn_invite2" unmodeled>其他</Button>'));
  await expect.poll(() => readSelection(projectDir)).toBeNull();
  await expect(app.getByTestId('inspect-drawer')).toHaveCount(0);
});

test('Tailwind 以项目目录为 @source：新写的 className 热更新后生效', async ({ app, projectDir }) => {
  const file = path.join(projectDir, 'routes/members/page.tsx');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('<Title order={2}>成员</Title>', '<Title order={2} id="h_members" className="tracking-[0.37em] text-[#a51d1d]">成员</Title>'));
  const h1 = app.locator('[data-joplo-stage] [data-jid="h_members"]');
  await expect(h1).toHaveText('成员');
  await expect.poll(() => h1.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(165, 29, 29)');
  expect(await h1.evaluate((el) => getComputedStyle(el).letterSpacing)).not.toBe('normal');
});
