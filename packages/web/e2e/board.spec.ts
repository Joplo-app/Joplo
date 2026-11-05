/** joplo dev 看板：演示模式的手动、逐步、自动播放（全部经 core 的 applyStep / stateAt / explainClick）。 */
import { demoClick, expect, mouseClickNode, node, playState, test, uiState, waitIdle } from './fixtures';

test('看板加载：默认演示模式，没有侧栏；顶栏有缺口胶囊与概念原型标识', async ({ app }) => {
  await expect(app.getByTestId('mode-demo')).toHaveAttribute('aria-checked', 'true');
  await expect(app.getByTestId('left-panel')).toHaveCount(0);
  await expect(app.getByTestId('inspector')).toHaveCount(0);
  await expect(app.getByTestId('concept-badge')).toContainText('概念原型');
  await expect(app.getByTestId('gap-capsule')).toHaveText('缺失 3 · 待决定 1');
  await expect(app.getByTestId('current-route')).toContainText('/members');
  await expect(app.getByTestId('option-select')).toHaveValue('invite.a-modal');
  await expect(app.getByTestId('scenario-select')).toHaveValue('invite.a-modal.success');
  // 每个节点的根 DOM 带 data-jat（源位置）
  await expect(node(app, 'btn_invite')).toHaveAttribute('data-jat', /^features\/invite\/options\/a-modal\.tsx:\d+:\d+$/);
  await expect(node(app, 'nav_settings')).toHaveAttribute('data-jat', /^layouts\/app\.tsx:\d+:\d+$/);
  // 舞台占满主体：缩放后的画框宽度至少占主体宽度的 75%
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
});

test('denied 场景：点击禁用按钮显示原因；点击未建模的导航显示“演示未覆盖”', async ({ app }) => {
  await app.getByTestId('scenario-select').selectOption('invite.a-modal.denied');
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

test('方案 B partial 场景：go 跳转到 /members/invite 并显示 3 条结果', async ({ app }) => {
  await app.getByTestId('option-select').selectOption('invite.b-batch');
  await expect(app.getByTestId('scenario-select')).toHaveValue('invite.b-batch.partial');
  await expect(node(app, 'btn_invite')).toHaveCount(0);
  await demoClick(app, 'btn_batch');
  await expect(app.getByTestId('current-route')).toContainText('/members/invite');
  expect((await playState(app))!.sceneId).toBe('invite.b-batch@/members/invite');
  await demoClick(app, 'in_emails');
  await demoClick(app, 'sel_batch_role');
  await demoClick(app, 'btn_batch_send');
  await expect(node(app, 'tbl_results').locator('tbody tr')).toHaveCount(3);
  await expect(node(app, 'tbl_results')).toContainText('失败：邮箱格式无效');
  await expect(node(app, 'alert_partial')).toBeVisible();
  const ui = await uiState(app);
  expect(ui.optionId).toBe('invite.b-batch');
});
