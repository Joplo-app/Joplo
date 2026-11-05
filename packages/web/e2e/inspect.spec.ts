/** 检查元素（⌥+单击，D39）：写入 selection.json（at 端到端）→ 右侧抽屉显示规则、情况、文件:行；缺口说明。 */
import path from 'node:path';
import { expect, lineOf, node, playState, readSelection, test } from './fixtures';

test('⌥+单击“邀请成员”：不操作原型；selection.json 的 at 指向 a-modal.tsx 对应行；抽屉显示规则与情况；取消选中写 null', async ({ app, projectDir }) => {
  await node(app, 'btn_invite').click({ modifiers: ['Alt'] });
  const drawer = app.getByTestId('inspect-drawer');
  await expect(drawer).toBeVisible();
  const line = lineOf(path.join(projectDir, 'features/invite/options/a-modal.tsx'), 'id="btn_invite"');
  await expect(app.getByTestId('selection-sync')).toHaveAttribute('data-status', 'ok');
  const sel = readSelection(projectDir);
  expect(sel).toMatchObject({
    featureId: 'invite',
    optionId: 'invite.a-modal',
    scenarioId: 'invite.a-modal.success',
    position: 0,
    nodeId: 'btn_invite',
    route: '/members',
    label: '邀请成员',
    sceneId: 'invite.a-modal@/members',
  });
  expect(sel.at).toMatch(new RegExp(`^features/invite/options/a-modal\\.tsx:${line}:\\d+$`));
  // DOM 的 data-jat、抽屉里的 at 与文件一致；规则、覆盖的情况、Agent 提示
  await expect(node(app, 'btn_invite')).toHaveAttribute('data-jat', sel.at);
  await expect(drawer.getByTestId('sel-at')).toHaveText(sel.at);
  await expect(drawer.getByTestId('sel-label')).toHaveText('邀请成员');
  await expect(drawer.getByTestId('sel-rules')).toContainText('只有空间管理员可以发起邀请');
  await expect(drawer.getByTestId('sel-rules')).toContainText('已确认');
  await expect(drawer.getByTestId('sel-cases')).toContainText('正常发出邀请并被接受');
  await expect(drawer.getByTestId('selection-sync')).toContainText('npx joplo selection');
  // ⌥+单击不推进演示
  expect((await playState(app))!.position).toBe(0);

  await drawer.getByTestId('clear-selection').click();
  await expect(drawer).toHaveCount(0);
  await expect.poll(() => readSelection(projectDir)).toBeNull();
  // 普通单击照常按场景操作
  await node(app, 'btn_invite').click();
  await expect.poll(async () => (await playState(app))!.position).toBe(1);
});

test('选中被服务端拒绝（409）时：文件写 null，界面明确提示', async ({ app, projectDir }) => {
  // 模拟服务端拒绝（真实的 409 路径由 server 的 dev.test 覆盖）：界面以服务端为准清空选中并提示
  await app.route('**/__joplo/p/*/selection', (route) =>
    route.request().method() === 'PUT' ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { message: '选中与当前项目不符：测试' }, current: null }) }) : route.continue(),
  );
  await node(app, 'btn_invite').click({ modifiers: ['Alt'] });
  await expect(app.getByTestId('notice')).toContainText('选中与当前项目不符');
  await expect(app.getByTestId('inspect-drawer')).toHaveCount(0);
  expect(readSelection(projectDir) ?? null).toBeNull();
});

test('缺口：方案 B 没有表达「发送请求失败」——画面上方说明这是缺口并给出 check 命令；回到 A 又能播放', async ({ app }) => {
  await app.getByTestId('case-invite.request_failed').click();
  await expect(app.getByTestId('crumb-scenario')).toHaveText('发送失败后重试');
  await expect(app.getByTestId('case-invite.request_failed-invite.a-modal')).toContainText('✓');
  await expect(app.getByTestId('case-invite.request_failed-invite.b-batch')).toContainText('缺失');
  await app.getByTestId('option-invite.b-batch').click();
  const gap = app.getByTestId('gap-notice');
  await expect(gap).toContainText('还没有表达「发送请求失败」');
  await expect(app.getByTestId('gap-command')).toHaveText('npx joplo check --option invite.b-batch');
  await expect(app.getByTestId('crumb-scenario')).toHaveText('（缺口）');
  await expect(app.getByTestId('step-bar')).toHaveCount(0);
  await expect(app.getByTestId('gap-count')).toContainText('缺失 6');
  await app.getByTestId('option-invite.a-modal').click();
  await expect(gap).toHaveCount(0);
  await expect(app.getByTestId('crumb-scenario')).toHaveText('发送失败后重试');
});
