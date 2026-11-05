/**
 * 演示与审阅的浏览器测试（AC-02 / 03 / 04 / 05 / 19 / 20、审阅选中）。
 * 每个测试都使用 examples/invite 的临时副本。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Project, initialState, stateAt } from '@joplo/core';
import { demoClick, expect, loadExample, mouseClickNode, node, playState, shownStep, test, toastCount, uiState, waitIdle } from './fixtures';

const project = loadExample();

async function walkSuccessManually(page: import('@playwright/test').Page) {
  await demoClick(page, 'btn_invite');
  await demoClick(page, 'in_email');
  await demoClick(page, 'sel_role');
  await demoClick(page, 'btn_send');
}

test('AC-02 演示模式点击“邀请成员”打开弹窗，提交后出现 Toast 且待接受列表多一行', async ({ app: page }) => {
  await page.getByTestId('mode-demo').click();
  await expect(page.getByTestId('mode-hint')).toHaveText('演示模式：点击会执行原型交互');
  await expect(node(page, 'tbl_pending').locator('tbody tr')).toHaveCount(1);

  await demoClick(page, 'btn_invite');
  const dialog = node(page, 'dlg_invite');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog).toContainText('邀请成员');
  await expect(page.getByTestId('caption')).toContainText('管理员点击右上角「邀请成员」，打开邀请弹窗');

  await demoClick(page, 'in_email');
  await expect(node(page, 'in_email').locator('input')).toHaveValue('li.lei@example.com');
  await demoClick(page, 'sel_role');
  await expect(node(page, 'sel_role')).toContainText('编辑者');

  await demoClick(page, 'btn_send'); // 之后的系统事件（请求成功）自动执行
  await expect(page.locator('[data-jtoast]')).toHaveText(/已向 li\.lei@example\.com 发送邀请/);
  await expect(dialog).toHaveCount(0);
  const rows = node(page, 'tbl_pending').locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('li.lei@example.com');
  await expect(page.getByTestId('complete-banner')).toContainText('场景完成 · 成功');
  await expect(page.getByTestId('complete-banner')).toContainText('邀请已发出，等待对方接受');
  expect((await playState(page)).position).toBe(5);

  // 场景完成后再点“下一步”：不推进、给出说明
  await page.getByTestId('ctl-next').click();
  await expect(page.getByTestId('notice')).toContainText('场景已完成');
  expect((await playState(page)).position).toBe(5);
});

test('AC-03 手动走完与自动播放走完，最终状态深度相等（且等于 core 的 stateAt）', async ({ app: page }) => {
  await walkSuccessManually(page);
  const manual = await playState(page);

  await page.getByTestId('ctl-reset').click();
  expect((await playState(page)).position).toBe(0);
  await page.getByTestId('ctl-play').click();
  await expect.poll(async () => (await uiState(page)).playing, { timeout: 3000 }).toBe(true);
  await waitIdle(page);
  const auto = await playState(page);

  expect(auto).toEqual(manual);
  expect(auto).toEqual(stateAt(project, 'sc_a_success', 5));
});

test('AC-04 失败场景：显示错误、保留输入、重试后成功', async ({ app: page }) => {
  await page.getByTestId('scenario-sc_a_failure').click();
  await expect(page.getByTestId('notice')).toContainText('已切换到「发送失败后重试」，数据已重置');
  await expect(page.getByTestId('mock-label')).toHaveText('模拟失败后重试成功');

  await walkSuccessManually(page); // 发送后系统事件为“请求失败”
  const err = node(page, 'alert_send_error');
  await expect(err).toBeVisible();
  await expect(err).toContainText('发送失败：网络超时。已保留你填写的内容，可以重试。');
  await expect(node(page, 'in_email').locator('input')).toHaveValue('li.lei@example.com');
  await expect(node(page, 'sel_role')).toContainText('编辑者');
  await expect(page.locator('[data-jtoast]')).toHaveCount(0);
  await expect(page.getByTestId('complete-banner')).toHaveCount(0);
  expect((await playState(page)).position).toBe(5);

  await demoClick(page, 'btn_send'); // 重试 + 自动的“请求成功”
  await expect(err).toHaveCount(0);
  await expect(page.locator('[data-jtoast]')).toContainText('已向 li.lei@example.com 发送邀请');
  await expect(page.getByTestId('complete-banner')).toContainText('成功');
  expect(await playState(page)).toEqual(stateAt(project, 'sc_a_failure', 7));
});

test('AC-05 / AC-19 无权限场景：禁用原因就地显示；未建模操作提示“当前演示未覆盖”', async ({ app: page }) => {
  await page.getByTestId('scenario-sc_a_denied').click();
  await expect(page.getByTestId('ctl-play')).toBeDisabled(); // 0 步的场景
  await expect(node(page, 'alert_denied')).toContainText('你是普通成员');
  await expect(node(page, 'btn_invite')).toHaveAttribute('aria-disabled', 'true');

  // 用真实鼠标坐标点击禁用按钮（Playwright 的 click() 会因 aria-disabled 一直等待）
  await mouseClickNode(page, 'btn_invite');
  const bubble = page.locator('[data-joverlay="notice"]');
  await expect(bubble).toHaveAttribute('data-notice-kind', 'disabled');
  await expect(bubble).toContainText('只有空间管理员可以邀请成员');
  expect(await playState(page)).toEqual(initialState(project, 'sc_a_denied'));

  await node(page, 'nav_settings').click();
  await expect(bubble).toHaveAttribute('data-notice-kind', 'uncovered');
  await expect(bubble).toContainText('当前演示未覆盖此操作');
  await expect(bubble).toContainText('空间设置');
  await bubble.getByRole('button', { name: '回到演示' }).click();
  await expect(bubble).toHaveCount(0);
  expect((await playState(page)).position).toBe(0);

  // 0 步场景：播放与“下一步”禁用，并说明只展示初始状态
  await expect(page.getByTestId('ctl-next')).toBeDisabled();
  await expect(page.getByTestId('next-hint')).toContainText('这个场景没有步骤，只展示初始状态');
});

test('演示模式：点击本场景其他步骤的目标，提示“按当前场景，下一步是…”', async ({ app: page }) => {
  await demoClick(page, 'btn_invite');
  await node(page, 'btn_send').click();
  const bubble = page.locator('[data-joverlay="notice"]');
  await expect(bubble).toHaveAttribute('data-notice-kind', 'out_of_order');
  await expect(bubble).toContainText('按当前场景，下一步是：输入被邀请人的邮箱');
  expect((await playState(page)).position).toBe(1);
  // 静态元素不响应
  await node(page, 'dlg_hint').click();
  expect((await playState(page)).position).toBe(1);
});

test('AC-20 自动播放中途暂停后“上一步”：回到界面所示第 k 步的前一步，字幕同步', async ({ app: page }) => {
  await page.getByTestId('ctl-play').click();
  // 等到第 2 步（输入邮箱）的逐字输入动画进行中再暂停
  await page.waitForSelector('[data-joverlay="sample"]');
  await page.getByTestId('ctl-play').click();
  await expect.poll(async () => (await uiState(page)).paused).toBe(true);
  const k = await shownStep(page);
  const pos = (await playState(page)).position;
  await page.waitForTimeout(600);
  expect((await playState(page)).position, '暂停期间不推进').toBe(pos);
  expect(await shownStep(page), '暂停期间字幕不变').toBe(k);

  await page.getByTestId('ctl-prev').click();
  await waitIdle(page);
  expect((await playState(page)).position).toBe(k - 1);
  expect(await playState(page)).toEqual(stateAt(project, 'sc_a_success', k - 1));
  expect(await shownStep(page)).toBe(k - 1);
  await expect(page.locator('[data-joverlay="sample"]')).toHaveCount(0);
});

test('自动播放中途暂停后“下一步”：完成界面所示的第 k 步', async ({ app: page }) => {
  await page.getByTestId('ctl-play').click();
  await page.waitForSelector('[data-joverlay="sample"]');
  await page.getByTestId('ctl-play').click();
  await expect.poll(async () => (await uiState(page)).paused).toBe(true);
  const k = await shownStep(page);
  await page.getByTestId('ctl-next').click();
  await waitIdle(page);
  expect(await playState(page)).toEqual(stateAt(project, 'sc_a_success', k));
  expect(await shownStep(page)).toBe(k);
});

test('AC-20 重置、切换场景：状态复原，旧 Toast 与弹窗不在 DOM 中残留', async ({ app: page }) => {
  for (const id of ['btn_invite', 'in_email', 'sel_role', 'btn_send']) await demoClick(page, id);
  expect(await toastCount(page)).toBe(1);
  await page.getByTestId('ctl-reset').click();
  expect(await toastCount(page), '重置后 Toast 立即移除').toBe(0);
  expect(await playState(page)).toEqual(stateAt(project, 'sc_a_success', 0));
  await expect(node(page, 'dlg_invite')).toHaveCount(0);

  for (const id of ['btn_invite', 'in_email', 'sel_role', 'btn_send']) await demoClick(page, id);
  expect(await toastCount(page)).toBe(1);
  await page.getByTestId('scenario-sc_a_failure').click();
  expect(await toastCount(page), '切换场景后 Toast 立即移除').toBe(0);
  await expect(page.getByTestId('notice')).toContainText('已切换到「发送失败后重试」，数据已重置');

  // 播放到中途再切换：被取消的动画不会推进状态
  await page.getByTestId('scenario-sc_a_success').click();
  await page.getByTestId('ctl-play').click();
  await expect.poll(async () => (await playState(page)).position, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  await page.getByTestId('scenario-sc_a_failure').click();
  await page.waitForTimeout(800);
  const st = await playState(page);
  expect(st).toEqual(initialState(project, 'sc_a_failure'));
  expect(st.inputs).toEqual({});
  await expect(node(page, 'dlg_invite')).toHaveCount(0);
  await expect(page.locator('[data-joverlay="sample"]')).toHaveCount(0);
  await expect(node(page, 'tbl_pending').locator('tbody tr')).toHaveCount(1);
});

test('就地提示气泡在推进步骤、重置、切换场景时关闭', async ({ app: page }) => {
  const bubble = page.locator('[data-joverlay="notice"]');
  await node(page, 'nav_settings').click();
  await expect(bubble).toHaveCount(1);
  await page.getByTestId('ctl-next').click();
  await waitIdle(page);
  await expect(bubble).toHaveCount(0);

  await node(page, 'btn_send').click(); // 越序
  await expect(bubble).toHaveAttribute('data-notice-kind', 'out_of_order');
  await page.getByTestId('ctl-reset').click();
  await expect(bubble).toHaveCount(0);

  await node(page, 'nav_settings').click();
  await expect(bubble).toHaveCount(1);
  await page.getByTestId('scenario-sc_a_failure').click();
  await expect(bubble).toHaveCount(0);
});

test('审阅模式：点击元素只选中，不推进步骤；写入 .joplo/selection.json', async ({ app: page, projectDir }) => {
  await page.getByTestId('mode-review').click();
  await expect(page.getByTestId('mode-hint')).toHaveText('审阅模式：点击元素只选中，不触发演示');
  await node(page, 'btn_invite').click();

  await expect(node(page, 'btn_invite')).toHaveAttribute('data-jselected', '');
  await expect(page.getByTestId('notice')).toContainText('已选中「邀请成员」，可以在 Agent 会话里说要改什么');
  expect((await playState(page)).position).toBe(0);
  await expect(node(page, 'dlg_invite')).toHaveCount(0);

  const inspector = page.getByTestId('inspector');
  await expect(inspector.getByTestId('sel-ref')).toHaveText('scene_a_members#btn_invite');
  await expect(inspector).toContainText('只有空间管理员可以发起邀请');
  await expect(inspector).toContainText('入口：成员页右上角，只对管理员可用');
  await expect(inspector).toContainText('只有空间管理员可以邀请成员');
  await expect(inspector).toContainText('管理员成功发出邀请');

  const file = path.join(projectDir, '.joplo', 'selection.json');
  await expect.poll(() => fs.existsSync(file)).toBe(true);
  const sel = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(sel).toMatchObject({ optionId: 'opt_a', scenarioId: 'sc_a_success', position: 0, stepId: null, sceneId: 'scene_a_members', nodeId: 'btn_invite' });
  expect(typeof sel.at).toBe('string');

  // 选中弹窗里的元素：先在审阅模式跳到第 1 步
  await page.getByTestId('chip-a_s1_open').click();
  await node(page, 'sel_role').click();
  await expect.poll(() => JSON.parse(fs.readFileSync(file, 'utf8')).nodeId).toBe('sel_role');
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({ position: 1, stepId: 'a_s1_open' });
  await expect(inspector).toContainText('受邀者获得的权限不能高于邀请时设定的权限');
  await expect(inspector.getByTestId('sel-sync')).toContainText('已写入 .joplo/selection.json');
  // 取消选中：同步给 Agent，selection.json 变为 null
  await inspector.getByRole('button', { name: '取消选中' }).click();
  await expect.poll(() => JSON.parse(fs.readFileSync(file, 'utf8'))).toBeNull();
  await expect(node(page, 'sel_role')).not.toHaveAttribute('data-jselected', '');
  // AI 假设一眼可辨
  await expect(inspector.locator('[data-origin="ai_assumption"]').first()).toContainText('AI 假设');
});

test('选中同步失败时显示失败原因，不显示“已写入”', async ({ app: page }) => {
  await page.route('**/api/selection', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: '磁盘已满（模拟）' } }) }));
  await page.getByTestId('mode-review').click();
  await node(page, 'btn_invite').click();
  await expect(page.getByTestId('notice')).toContainText('选中未能同步给 Agent：磁盘已满（模拟）');
  const inspector = page.getByTestId('inspector');
  await expect(inspector.getByTestId('sel-sync')).toContainText('未能写入');
  await expect(inspector).not.toContainText('选中已写入');
  await expect(inspector).not.toContainText('已写入 .joplo/selection.json');
});

test('实时刷新：修订更新后保持场景与位置；文件不合法时显示错误横幅且不白屏', async ({ app: page, projectDir }) => {
  await demoClick(page, 'btn_invite');
  await page.getByTestId('mode-review').click();
  await node(page, 'sel_role').click();
  await expect(page.getByTestId('revision')).toContainText('rev_1');

  const file = path.join(projectDir, 'project.joplo.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  json.revision = 2;
  json.scenes.scene_a_members.root.children[0].children[1].children[0].children[1].props.label = '邀请新成员';
  fs.writeFileSync(file + '.tmp', JSON.stringify(json));
  fs.renameSync(file + '.tmp', file);

  await expect(page.getByTestId('revision')).toContainText('rev_2');
  await expect(node(page, 'btn_invite')).toContainText('邀请新成员');
  expect((await playState(page)).position).toBe(1);
  await expect(node(page, 'sel_role')).toHaveAttribute('data-jselected', '');

  fs.writeFileSync(file, '{ 坏掉的 JSON');
  await expect(page.getByTestId('load-error')).toContainText('项目文件无法读取');
  await expect(node(page, 'dlg_invite')).toBeVisible();

  json.revision = 3;
  fs.writeFileSync(file, JSON.stringify(json));
  await expect(page.getByTestId('load-error')).toHaveCount(0);
  await expect(page.getByTestId('revision')).toContainText('rev_3');
});

test('SSE 乱序：旧修订的响应晚到时不会覆盖新修订', async ({ app: page, projectDir }) => {
  const file = path.join(projectDir, 'project.joplo.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  await page.route('**/api/project', async (route) => {
    const resp = await route.fetch();
    const body = await resp.text();
    if (JSON.parse(body).revision === 2) await new Promise((r) => setTimeout(r, 1500)); // rev_2 的响应故意晚到
    await route.fulfill({ response: resp, body });
  });
  json.revision = 2;
  json.name = '修订二';
  fs.writeFileSync(file, JSON.stringify(json));
  await page.waitForTimeout(500);
  json.revision = 3;
  json.name = '修订三';
  fs.writeFileSync(file, JSON.stringify(json));
  await expect(page.getByTestId('revision')).toContainText('rev_3');
  const seen: string[] = [];
  for (let i = 0; i < 10; i++) {
    seen.push(await page.getByTestId('revision').innerText());
    await page.waitForTimeout(200);
  }
  expect(seen.every((r) => r.includes('rev_3')), `修订号应单调不减：${seen.join(',')}`).toBe(true);
  await expect(page.locator('header')).toContainText('修订三');
});

test('SSE 刷新后步骤变少：位置夹到合法范围，状态与 core 一致', async ({ app: page, projectDir }) => {
  for (const id of ['btn_invite', 'in_email', 'sel_role', 'btn_send']) await demoClick(page, id);
  expect((await playState(page)).position).toBe(5);
  const file = path.join(projectDir, 'project.joplo.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  json.revision = 2;
  json.scenarios.sc_a_success.steps = json.scenarios.sc_a_success.steps.slice(0, 3);
  fs.writeFileSync(file, JSON.stringify(json));
  await expect(page.getByTestId('revision')).toContainText('rev_2');
  const next = Project.parse(json);
  await expect.poll(async () => (await playState(page)).position).toBe(3);
  expect(await playState(page)).toEqual(stateAt(next, 'sc_a_success', 3));
  await expect(page.getByTestId('complete-banner')).toHaveCount(0);
  expect(await shownStep(page)).toBe(3);
});

test('项目里没有任何方案时显示空状态', async ({ page, projectDir, server }) => {
  const file = path.join(projectDir, 'project.joplo.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  Object.assign(json, { options: {}, scenes: {}, scenarios: {}, issues: {} });
  json.features.feat_invite.optionIds = [];
  for (const r of Object.values(json.rules) as { optionId?: string }[]) delete r.optionId;
  fs.writeFileSync(file, JSON.stringify(json));
  await page.goto(server.url);
  await expect(page.getByText('项目里还没有任何方案')).toBeVisible();
});

test('手绘 / 线框主题切换', async ({ app: page }) => {
  const stage = page.locator('[data-joplo-stage]');
  await expect(stage).toHaveAttribute('data-theme', 'sketch');
  await expect(stage.locator('svg.jrough').first()).toBeAttached();
  await page.getByRole('radio', { name: '线框' }).click();
  await expect(stage).toHaveAttribute('data-theme', 'clean');
  await expect(stage.locator('svg.jrough')).toHaveCount(0);
  await expect(page.getByTestId('concept-badge')).toHaveText('概念原型 · 非正式实现');
});

test.describe('prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('减少动态效果：不移动指针、不逐字输入，直接切换状态，结果与 core 一致', async ({ app: page }) => {
    await page.getByTestId('ctl-play').click();
    await expect.poll(async () => (await playState(page)).position, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
    await expect(page.locator('[data-joverlay="cursor"]')).toHaveCSS('opacity', '0');
    await expect(page.locator('[data-joverlay="sample"]')).toHaveCount(0);
    await waitIdle(page);
    expect(await playState(page)).toEqual(stateAt(project, 'sc_a_success', 5));
  });
});
