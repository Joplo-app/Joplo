/** 审阅模式：选中 → selection.json（at 端到端）、路径树、缺口胶囊、比较方案、浏览发布视图。 */
import path from 'node:path';
import { expect, lineOf, node, playState, readSelection, test } from './fixtures';

test('选中“邀请成员”按钮：selection.json 的 at 指向 a-modal.tsx 对应行；取消选中写 null', async ({ app, projectDir }) => {
  await app.getByTestId('mode-review').click();
  await expect(app.getByTestId('left-panel')).toBeVisible();
  await expect(app.getByTestId('inspector')).toBeVisible();
  await node(app, 'btn_invite').click();
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
  // DOM 的 data-jat 与文件中的 at 一致；检查器显示同一个 at 与关联规则
  await expect(node(app, 'btn_invite')).toHaveAttribute('data-jat', sel.at);
  await expect(app.getByTestId('sel-at')).toHaveText(sel.at);
  await expect(app.getByTestId('sel-rules')).toContainText('只有空间管理员可以发起邀请');
  await expect(app.getByTestId('sel-rules')).toContainText('已确认');
  await expect(app.getByTestId('sel-steps')).toContainText('第 1 步');
  // 审阅模式点击不推进演示
  expect((await playState(app))!.position).toBe(0);

  await app.getByTestId('clear-selection').click();
  await expect(app.getByTestId('overview')).toBeVisible();
  await expect.poll(() => readSelection(projectDir)).toBeNull();
});

test('路径树：/members 上堆叠 A、B；/settings；/members/invite 由 B 新增；点路径浏览发布视图', async ({ app }) => {
  await app.getByTestId('mode-review').click();
  const tree = app.getByTestId('route-tree');
  const members = tree.locator('[data-route="/members"]');
  await expect(members.locator('[data-option="invite.a-modal"]')).toContainText('A ✓');
  await expect(members.locator('[data-option="invite.b-batch"]')).toContainText('B');
  await expect(tree.locator('[data-route="/settings"]')).toContainText('空间设置');
  const added = tree.locator('[data-route="/members/invite"]');
  await expect(added.getByTestId('route-added-by')).toHaveText('由 B 新增');
  await expect(added.locator('[data-option="invite.b-batch"]')).toBeVisible();

  await tree.locator('[data-route="/settings"] > button').click();
  await expect(app.getByTestId('browse-tag')).toContainText('发布视图');
  await expect(app.locator('[data-joplo-stage]')).toHaveAttribute('data-scene', '@/settings');
  await expect(node(app, 'in_space_name')).toBeVisible();
  // 浏览 /members/invite：只存在于未选定方案 B
  await added.locator('> button').click();
  await expect(app.locator('[data-joplo-stage]')).toHaveAttribute('data-scene', 'invite.b-batch@/members/invite');
  await expect(app.getByTestId('browse-tag')).toContainText('未选定方案');
});

test('缺口胶囊：点击后切到审阅模式并展开情况列表', async ({ app }) => {
  await app.getByTestId('cases-toggle').waitFor({ state: 'detached' });
  await app.getByTestId('gap-capsule').click();
  await expect(app.getByTestId('mode-review')).toHaveAttribute('aria-checked', 'true');
  await expect(app.getByTestId('case-list')).toBeVisible();
  await expect(app.getByTestId('case-invite.revoked')).toHaveAttribute('data-status', 'missing');
  await expect(app.getByTestId('case-invite.already_member')).toHaveAttribute('data-status', 'undecided');
});

test('比较方案：按情况比较各方案覆盖，并一键进入对应场景', async ({ app }) => {
  await app.getByTestId('view-compare').click();
  await expect(app.getByTestId('option-card-invite.a-modal')).toContainText('已选定');
  await expect(app.getByTestId('option-card-invite.b-batch')).toBeVisible();
  await expect(app.getByTestId('card-scenario-invite.b-batch.partial')).toBeVisible();
  await app.getByTestId('compare-case-invite.request_failed').click();
  await expect(app.getByTestId('compare-result-invite.a-modal')).toHaveAttribute('data-status', 'expressed');
  await expect(app.getByTestId('compare-result-invite.b-batch')).toHaveAttribute('data-status', 'missing');
  await expect(app.getByTestId('compare-enter-invite.b-batch')).toBeDisabled();
  await app.getByTestId('compare-enter-invite.a-modal').click();
  await expect(app.getByTestId('scenario-select')).toHaveValue('invite.a-modal.failure');
  expect((await playState(app))!.position).toBe(0);
});
