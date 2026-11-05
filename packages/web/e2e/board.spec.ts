/** joplo dev 看板演示页（D39）：布局与控件归属、手动 / 逐步 / 自动播放（全部经 core 的 applyStep / stateAt / explainClick）。 */
import { demoClick, expect, mouseClickNode, node, playState, playUrl, test, uiState, waitIdle } from './fixtures';

test('布局：顶栏只有 Joplo、面包屑和电脑 / 手机切换；没有功能 / 方案 / 场景下拉与模式切换', async ({ app }) => {
  const top = app.getByTestId('topbar');
  await expect(top.getByTestId('brand')).toHaveText('Joplo');
  await expect(top.getByTestId('crumb-project')).toHaveText('团队邀请功能');
  await expect(top.getByTestId('crumb-feature')).toHaveText('团队成员邀请');
  await expect(top.getByTestId('crumb-option')).toHaveText('A · 单人邮件邀请弹窗');
  await expect(top.getByTestId('crumb-scenario')).toHaveText('管理员成功发出邀请');
  await expect(top.getByTestId('device-switch')).toBeVisible();
  // 顶栏里没有任何下拉；整页没有旧的模式切换、功能 / 方案 / 场景下拉、缺口胶囊
  await expect(top.locator('select')).toHaveCount(0);
  for (const id of ['mode-switch', 'mode-demo', 'mode-review', 'feature-select', 'option-select', 'scenario-select', 'gap-capsule', 'view-compare', 'view-browse'])
    await expect(app.getByTestId(id), `不应再有 ${id}`).toHaveCount(0);
  // 每个控件只出现一次：设备切换、方案切换、播放控制、「…」菜单
  for (const id of ['device-switch', 'option-switch', 'ctl-play', 'ctl-prev', 'ctl-next', 'ctl-reset', 'more-menu', 'step-bar']) await expect(app.getByTestId(id), id).toHaveCount(1);
  // 方案切换在左栏，播放控制和菜单在画面下方
  await expect(app.getByTestId('left-nav').getByTestId('option-switch')).toBeVisible();
  await expect(app.getByTestId('controls').getByTestId('more-menu')).toBeVisible();
  // 左栏底部：缺口总数；画面上有 ⌥+单击 的提示
  await expect(app.getByTestId('gap-count')).toContainText('缺失 3');
  await expect(app.getByTestId('gap-count')).toContainText('待决定 1');
  await expect(app.getByTestId('stage-hint')).toContainText('⌥');
  // 每个节点的根 DOM 带 data-jat（源位置）
  await expect(node(app, 'btn_invite')).toHaveAttribute('data-jat', /^features\/invite\/options\/a-modal\.tsx:\d+:\d+$/);
  await expect(node(app, 'nav_settings')).toHaveAttribute('data-jat', /^layouts\/app\.tsx:\d+:\d+$/);
  // 画面占据主体：缩放后的画框宽度至少占画面区域的 75%
  const vp = await app.getByTestId('stage-viewport').boundingBox();
  const stage = await app.locator('[data-joplo-stage]').boundingBox();
  expect(stage!.width / vp!.width).toBeGreaterThan(0.75);
});

test('方案 A 成功场景：手动走通（弹窗、Toast、待接受列表增加）；与自动播放的最终状态深度相等', async ({ app }) => {
  await expect(node(app, 'tbl_pending').locator('tbody tr')).toHaveCount(1);
  await demoClick(app, 'btn_invite');
  await expect(app.locator('[role="dialog"]')).toBeVisible();
  await expect(node(app, 'dlg_invite')).toBeVisible();
  await demoClick(app, 'in_email');
  await expect(node(app, 'in_email').locator('input')).toHaveValue('li.lei@example.com');
  await demoClick(app, 'sel_role');
  await expect(node(app, 'sel_role')).toContainText('编辑者');
  await demoClick(app, 'btn_send');
  await expect(app.locator('[data-jtoast]')).toContainText('已向 li.lei@example.com 发送邀请');
  await expect(node(app, 'dlg_invite')).toHaveCount(0);
  await expect(node(app, 'tbl_pending').locator('tbody tr')).toHaveCount(2);
  await expect(app.getByTestId('complete-banner')).toContainText('场景完成 · 成功');
  const manual = await playState(app);
  expect(manual!.position).toBe(5);

  await app.getByTestId('ctl-reset').click();
  expect((await playState(app))!.position).toBe(0);
  await app.getByTestId('ctl-play').click();
  await app.waitForFunction(() => (window as any).__JOPLO_STATE__?.completed !== null && !(window as any).__JOPLO_UI__.playing, null, { timeout: 30_000 });
  const auto = await playState(app);
  expect(auto).toEqual(manual);

  // 逐步：上一步回到 4，下一步回到 5，且与手动一致
  await app.getByTestId('ctl-prev').click();
  expect((await playState(app))!.position).toBe(4);
  await app.getByTestId('ctl-next').click();
  await waitIdle(app);
  expect(await playState(app)).toEqual(manual);
  // 步骤条：当前步高亮；点第 2 步跳过去
  await expect(app.getByTestId('chip-invite.a-modal.success#5')).toHaveAttribute('data-state', 'current');
  await app.getByTestId('chip-invite.a-modal.success#2').click();
  expect((await playState(app))!.position).toBe(2);
  await expect(app.getByTestId('caption')).toContainText('第 2 步');
  await expect(app.getByTestId('next-hint')).toContainText('下一步');
});

test('非管理员情况：点击禁用按钮显示原因；点击未建模的导航显示“演示未覆盖”', async ({ app }) => {
  await app.getByTestId('case-invite.no_permission').click();
  await expect(app.getByTestId('crumb-scenario')).toHaveText('普通成员无权邀请');
  await expect(node(app, 'btn_invite')).toHaveAttribute('data-jdisabled', '');
  await expect(node(app, 'alert_denied')).toBeVisible();
  await mouseClickNode(app, 'btn_invite');
  const bubble = app.locator('[data-joverlay="notice"][data-notice-kind="disabled"]');
  await expect(bubble).toContainText('只有空间管理员可以邀请成员');
  expect((await playState(app))!.position).toBe(0);

  await node(app, 'nav_settings').click();
  const uncovered = app.locator('[data-joverlay="notice"][data-notice-kind="uncovered"]');
  await expect(uncovered).toContainText('演示未覆盖');
  await expect(uncovered).toContainText('空间设置');
});

test('切到方案 B（情况保持不变）：partial 场景 go 跳转到 /members/invite 并显示 3 条结果', async ({ app }) => {
  await app.getByTestId('case-invite.happy').click();
  await app.getByTestId('option-invite.b-batch').click();
  await expect(app.getByTestId('crumb-option')).toHaveText('B · 独立页面批量邀请');
  await expect(app.getByTestId('case-invite.happy')).toHaveAttribute('data-active', '');
  expect((await uiState(app)).scenarioId).toBe('invite.b-batch.partial');
  await expect(node(app, 'btn_invite')).toHaveCount(0);
  await demoClick(app, 'btn_batch');
  expect((await playState(app))!.sceneId).toBe('invite.b-batch@/members/invite');
  await demoClick(app, 'in_emails');
  await demoClick(app, 'sel_batch_role');
  await demoClick(app, 'btn_batch_send');
  await expect(node(app, 'tbl_results').locator('tbody tr')).toHaveCount(3);
  await expect(node(app, 'tbl_results')).toContainText('失败：邮箱格式无效');
  await expect(node(app, 'alert_partial')).toBeVisible();
});

test('URL 保存全部状态：复制的链接回到同一方案 / 情况 / 场景 / 步骤 / 设备', async ({ app, dev }) => {
  await app.getByTestId('case-invite.request_failed').click();
  await demoClick(app, 'btn_invite');
  await app.getByTestId('device-mobile').click();
  await expect(app.getByTestId('device-phone')).toBeVisible();
  const url = app.url();
  expect(url).toContain('c=invite.request_failed');
  expect(url).toContain('step=1');
  expect(url).toContain('d=mobile');
  const before = await playState(app);
  // 新页面打开同一链接
  const other = await app.context().newPage();
  await other.goto(url);
  await node(other, 'dlg_invite').waitFor();
  await expect(other.getByTestId('case-invite.request_failed')).toHaveAttribute('data-active', '');
  await expect(other.getByTestId('device-phone')).toBeVisible();
  expect(await playState(other)).toEqual(before);
  await other.close();
  // 面包屑第一段回到首页
  await app.getByTestId('crumb-project').click();
  await expect(app.getByTestId('home')).toBeVisible();
  expect(app.url()).toBe(`${dev.url}#/${dev.projectId}`);
  // 后退回到演示页的同一状态
  await app.goBack();
  await node(app, 'dlg_invite').waitFor();
  expect((await playState(app))!.position).toBe(1);
  expect(playUrl(dev)).toContain('/f/invite');
});
