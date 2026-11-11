import { $, done, flow, go, not, notEmpty, page, rule, set, uses, work } from '@joplo-app/kit';
import { ActionIcon, Alert, Center, EmptyState, Group, Loader, Menu, Notification, Text } from '@joplo-app/plugin-ui';
import { Button, Dialog, Select, TextField } from '../../../components.ts'; // 产品自己的组件
import { MembersPage } from '../shared/members-page.tsx';
import invite from '../feature.ts';
import { api, members as people, pending } from '../api.ts';

const { cases: c, rules: r } = invite;

// ── 界面：每个元素自己带行为。剧本和观众接管都走这里，效果只写一次 ──

const inviteButton = (
  <Button id="btn_invite" disabled={not($.ui.isAdmin)} disabledReason="只有空间管理员可以邀请成员"
    onClick={[set($.ui.inviteOpen, true), uses(r.admin_only)]}>
    邀请成员
  </Button>
);

const inviteDialog = (
  <Dialog id="dlg_invite" open={$.ui.inviteOpen} title="邀请成员" onClose={set($.ui.inviteOpen, false)}
    footer={[
      <Button id="btn_cancel" variant="secondary" onClick={set($.ui.inviteOpen, false)}>取消</Button>,
      <Button id="btn_send" disabled={$.ui.sending} disabledReason="正在发送，防止重复提交"
        onClick={[set($.ui.sending, true), set($.ui.error, ''), uses('no_double_submit'), api.sendInvite]}>
        发送邀请
      </Button>,
    ]}>
    <Text size="sm" c="dimmed">被邀请人会收到一封邮件，接受后加入本空间。</Text>
    <TextField id="in_email" label="邮箱" value={$.ui.email} placeholder="name@company.com" />
    <Select id="sel_role" label="权限" value={$.ui.role} options={['查看者', '编辑者', '管理员']}
      hint="受邀者获得的权限不会高于这里选择的权限" onChange={uses(r.role_cap)} />
    <Alert id="alert_send_error" color="red" title="发送失败" when={notEmpty($.ui.error)}>{$.ui.error}</Alert>
    <Group id="spin_send" gap="xs" when={$.ui.sending}><Loader size="sm" /><Text size="sm">正在发送邀请…</Text></Group>
  </Dialog>
);

const pendingMenu = (
  <Menu id="menu_pending" opened={$.ui.pendingMenu} position="bottom-end" when={$.ui.isAdmin}>
    <Menu.Target>
      <ActionIcon id="btn_pending_more" variant="subtle" aria-label="管理待接受的邀请" onClick={set($.ui.pendingMenu, true)}>⋯</ActionIcon>
    </Menu.Target>
    <Menu.Dropdown>
      <Menu.Label>zhao.lei@example.com</Menu.Label>
      <Menu.Item id="mi_copy_link" leftSection="🔗" unmodeled>复制邀请链接</Menu.Item>
      <Menu.Divider />
      <Menu.Item id="mi_revoke" leftSection="✕" color="red"
        onClick={[set($.ui.pendingMenu, false), set($.ui.revokeOpen, true), uses(r.revocable)]}>撤销邀请</Menu.Item>
    </Menu.Dropdown>
  </Menu>
);

const revokeDialog = (
  <Dialog id="dlg_revoke" open={$.ui.revokeOpen} title="撤销这个邀请？" onClose={set($.ui.revokeOpen, false)}
    footer={[
      <Button id="btn_revoke_cancel" variant="secondary" onClick={set($.ui.revokeOpen, false)}>取消</Button>,
      <Button id="btn_revoke_confirm" variant="danger"
        onClick={[set($.ui.revokeOpen, false), set($.ui.revoked, true),
          set($.data.pending, [{ email: 'zhao.lei@example.com', role: '查看者', status: '已撤销' }]), uses(r.revocable)]}>
        撤销邀请
      </Button>,
    ]}>
    <Text size="sm">zhao.lei@example.com 的邀请链接会立即失效。之后还可以重新邀请。</Text>
  </Dialog>
);

const notices = [
  <Alert id="alert_denied" color="gray" when={not($.ui.isAdmin)}>你是普通成员，邀请新成员需要联系空间管理员。</Alert>,
  <Notification id="note_revoked" when={$.ui.revoked} position="bottom" color="gray" icon="↺" title="已撤销 zhao.lei@example.com 的邀请" withCloseButton={false}>
    <Group justify="space-between" gap="xs">
      邀请链接已失效
      <Button id="btn_undo_revoke" variant="secondary" unmodeled>撤回</Button>
    </Group>
  </Notification>,
];

// ── 剧本：只写观众做什么、旁白说什么 ──

const openAndFill = (f: ReturnType<typeof flow>) => f
  .click('btn_invite', '管理员点击右上角「邀请成员」，打开邀请弹窗')
  .type('in_email', 'li.lei@example.com')
  .select('sel_role', '编辑者')
  .click('btn_send', '点击「发送邀请」，按钮进入发送中状态'); // 之后自动接 api.sendInvite 的系统步骤

export default work({
  title: 'A · 单人邮件邀请弹窗',
  summary: '在成员页点一个按钮，弹窗里填写一个邮箱和权限后发送邮件邀请',
  focus: '操作入口与步骤组织：就地弹窗、一次一人',
  tradeoffs: ['路径最短，适合偶尔邀请一两个人', '一次只能邀请一人，批量邀请效率低', '依赖邮件送达'],

  // 方案拥有自己的整页：同一路径各方案各写一份，不往共享页面里填插槽
  routes: {
    '/members': page({ title: '成员' }, (
      <MembersPage actions={inviteButton} notice={notices} pendingActions={pendingMenu} overlay={[inviteDialog, revokeDialog]} />
    )),
    '/join': page({ title: '加入空间', layout: false }, (
      <Center h="100%">
        <EmptyState id="empty_revoked" icon="⌛" title="这个邀请已经失效" description={'邀请人撤销了这个邀请。\n请联系空间管理员重新邀请你。'}>
          <Button id="btn_contact_admin" variant="secondary" unmodeled>联系空间管理员</Button>
        </EmptyState>
      </Center>
    )),
  },

  state: {
    ui: { isAdmin: true, inviteOpen: false, email: '', role: '', sending: false, error: '', pendingMenu: false, revokeOpen: false, revoked: false },
    data: { members: people, pending },
  },

  rules: {
    keep_input: rule('发送失败后保留已填写的邮箱和权限，允许直接重试', { cases: ['request_failed'] }),
    no_double_submit: rule('发送中禁用「发送邀请」按钮，防止重复提交', { cases: ['duplicate_submit'] }),
  },

  scenarios: {
    success: openAndFill(flow('管理员成功发出邀请', { cases: [c.happy, c.duplicate_submit],
      expected: '弹窗关闭，出现成功提示，新邀请进入待接受列表' })),

    failure: openAndFill(flow('发送失败后重试', { cases: [c.request_failed], outcome: 'failure', api: { sendInvite: ['timeout', 'ok'] } }))
      .click('btn_send', '点击「发送邀请」重试'),

    revoke: flow('撤销邀请后对方再打开链接', { cases: [c.revoked], start: '/members', description: '管理员撤销邀请，赵磊再打开链接时看到已失效' })
      .click('btn_pending_more', '打开待接受邀请的菜单')
      .click('mi_revoke', '选择「撤销邀请」')
      .click('btn_revoke_confirm', '确认后邀请立即失效')
      .card('第二天', { sub: '赵磊打开了邮件里的邀请链接' })
      .system('打开邀请链接', '链接页说明已失效和下一步', go('/join'), done('赵磊知道邀请已失效、该找谁')),

    denied: flow('普通成员无权邀请', { cases: [c.no_permission], outcome: 'denied', state: { ui: { isAdmin: false } },
      expected: '「邀请成员」按钮禁用，点击时说明只有管理员可以邀请' }),
  },
});
