import { $, done, flow, go, mock, not, notEmpty, work, page, response, rule, set, push, toast, undecided, uses } from '@joplo-app/kit';
import { ActionIcon, Alert, Button, Center, EmptyState, Group, Loader, Menu, Modal, Notification, Select, Stack, Text, TextInput } from '@joplo-app/plugin-ui';

import { members, pending } from '../sample.ts';

/**
 * 「发送邀请」请求的两种结果，只写一次。按钮的 onClick 里写 sendInvite 表示“这里发出请求”：
 * 剧本里点完后自动接一个系统步骤，结果由切片的 api 选项选（缺省 ok）；观众接管后点它用 ok。
 */
const sendInvite = mock('sendInvite', {
  ok: response('邀请请求成功（模拟）', '发送成功：弹窗关闭，邀请进入待接受',
    set($.ui.sending, false), set($.ui.error, ''), set($.ui.inviteOpen, false),
    push($.data.pending, { email: 'li.lei@example.com', role: '编辑者', status: '待接受' }),
    toast.success('已向 li.lei@example.com 发送邀请'),
    done('邀请已发出，等待对方接受')),
  timeout: response('邀请请求失败（模拟网络超时）', '发送失败：弹窗不关，保留已填内容',
    set($.ui.sending, false), set($.ui.error, '网络超时。已保留你填写的内容，可以重试。'), uses('keep_input')),
});

/** 打开弹窗并填写，成功与失败两个场景共用。每个按钮点下去做什么写在按钮的 onClick 上，这里只写观众做什么。 */
const fillAndSend = (name: string, opts: Parameters<typeof flow>[1]) =>
  flow(name, opts)
    .click('btn_invite', '管理员点击右上角「邀请成员」，打开邀请弹窗')
    .type('in_email', 'li.lei@example.com')
    .select('sel_role', '编辑者', uses('role_cap'))
    .click('btn_send', '点击「发送邀请」，按钮进入发送中状态');

export default work({
  title: 'A · 单人邮件邀请弹窗',
  summary: '在成员页点一个按钮，弹窗里填写一个邮箱和权限后发送邮件邀请',
  focus: '操作入口与步骤组织：就地弹窗、一次一人',
  tradeoffs: ['路径最短，适合偶尔邀请一两个人', '一次只能邀请一人，批量邀请效率低', '依赖邮件送达'],

  on: {
    '/members': {
      'header.actions': (
        <Button id="btn_invite" disabled={not($.ui.isAdmin)} disabledReason="只有空间管理员可以邀请成员" note="入口：成员页右上角，只对管理员可用"
          onClick={[set($.ui.inviteOpen, true), uses('admin_only')]}>
          邀请成员
        </Button>
      ),
      notice: [
        <Alert id="alert_denied" color="gray" when={not($.ui.isAdmin)}>
          你是普通成员，邀请新成员需要联系空间管理员。
        </Alert>,
        // 撤销之后的撤回条（D68 Notification 浮层）：浮在页面底部
        <Notification id="note_revoked" when={$.ui.revoked} position="bottom" color="gray" icon="↺" title="已撤销 zhao.lei@example.com 的邀请" withCloseButton={false}>
          <Group justify="space-between" gap="xs">
            邀请链接已失效
            <Button id="btn_undo_revoke" variant="subtle" size="xs" unmodeled note="5 秒内可以撤回，本版未建模撤回流程">撤回</Button>
          </Group>
        </Notification>,
      ],
      // 待接受邀请的行操作（D68 Menu）：只对管理员显示
      'pending.actions': (
        <Menu id="menu_pending" opened={$.ui.pendingMenu} position="bottom-end" when={$.ui.isAdmin}>
          <Menu.Target>
            <ActionIcon id="btn_pending_more" variant="subtle" aria-label="管理待接受的邀请" onClick={set($.ui.pendingMenu, true)}>⋯</ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>zhao.lei@example.com</Menu.Label>
            <Menu.Item id="mi_copy_link" leftSection="🔗" onClick={[set($.ui.pendingMenu, false), toast.success('已复制邀请链接')]}>复制邀请链接</Menu.Item>
            <Menu.Divider />
            <Menu.Item id="mi_revoke" leftSection="✕" color="red" onClick={[set($.ui.pendingMenu, false), set($.ui.revokeOpen, true), uses('revocable')]}>撤销邀请</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      ),
      overlay: [
        <Modal id="dlg_invite" opened={$.ui.inviteOpen} title="邀请成员">
          <Stack gap="md">
            <Text size="sm" c="dimmed">被邀请人会收到一封邮件，接受后加入本空间。</Text>
            <TextInput id="in_email" label="邮箱" type="email" placeholder="name@company.com" />
            <Select
              id="sel_role"
              label="权限"
              placeholder="选择权限"
              data={['查看者', '编辑者', '管理员']}
              note="受邀者获得的权限不会高于这里选择的权限"
            />
            <Alert id="alert_send_error" color="red" title="发送失败" when={notEmpty($.ui.error)}>
              {$.ui.error}
            </Alert>
            <Group id="spin_send" gap="xs" when={$.ui.sending}>
              <Loader size="sm" />
              <Text size="sm">正在发送邀请…</Text>
            </Group>
            <Group justify="flex-end" gap="sm">
              <Button id="btn_cancel" variant="default" note="取消并关闭；再次打开时是否保留已填内容待决定" onClick={set($.ui.inviteOpen, false)}>取消</Button>
              <Button id="btn_send" disabled={$.ui.sending} disabledReason="正在发送，防止重复提交"
                onClick={[set($.ui.sending, true), set($.ui.error, ''), uses('no_double_submit'), sendInvite]}>发送邀请</Button>
            </Group>
          </Stack>
        </Modal>,
        // 危险操作的二次确认：说清后果，取消在左、确认在右
        <Modal id="dlg_revoke" opened={$.ui.revokeOpen} title="撤销这个邀请？" size="sm">
          <Text size="sm">zhao.lei@example.com 的邀请链接会立即失效。之后还可以重新邀请。</Text>
          <Group justify="flex-end" gap="xs">
            <Button id="btn_revoke_cancel" variant="default" onClick={set($.ui.revokeOpen, false)}>取消</Button>
            <Button id="btn_revoke_confirm" color="red"
              onClick={[set($.ui.revokeOpen, false), set($.ui.revoked, true), set($.data.pending, [{ email: 'zhao.lei@example.com', role: '查看者', status: '已撤销' }]), uses('revocable')]}>
              撤销邀请
            </Button>
          </Group>
        </Modal>,
      ],
    },
  },

  // 受邀者打开失效的链接（D68 EmptyState）：不进空间外壳
  routes: {
    '/join': page(
      { title: '加入空间', layout: false },
      <Center h="100%">
        <EmptyState id="empty_revoked" icon="⌛" title="这个邀请已经失效" description={'邀请人撤销了这个邀请。\n请联系空间管理员重新邀请你。'}>
          <Button id="btn_contact_admin" variant="default" unmodeled>联系空间管理员</Button>
        </EmptyState>
      </Center>,
    ),
  },

  state: { ui: { isAdmin: true, inviteOpen: false, sending: false, error: '', pendingMenu: false, revokeOpen: false, revoked: false }, data: { members, pending } },

  rules: {
    keep_input: rule('发送失败后保留已填写的邮箱和权限，允许直接重试', { cases: ['request_failed'], elements: ['alert_send_error'] }),
    no_double_submit: rule('发送中禁用「发送邀请」按钮，防止重复提交', { cases: ['duplicate_submit'], elements: ['btn_send'] }),
  },

  coverage: {
    already_member: undecided('已是成员时提示错误还是静默跳过，尚未决定'),
  },

  scenarios: {
    success: fillAndSend('管理员成功发出邀请', { cases: ['happy', 'duplicate_submit'], expected: '弹窗关闭，出现成功提示，新邀请进入待接受列表' }),

    // 第一次发送超时，重试成功
    failure: fillAndSend('发送失败后重试', { cases: ['request_failed'], outcome: 'failure', mock: '模拟失败后重试成功', api: { sendInvite: ['timeout', 'ok'] } })
      .click('btn_send', '点击「发送邀请」重试', uses('keep_input')),

    // PM 视角：Given 有一个待接受的邀请 → When 管理员撤销、对方再打开链接 → Then 看到“已失效”和下一步（revoked 的 expected）
    revoke: flow('撤销邀请后对方再打开链接', { cases: ['revoked'], start: '/members', description: '管理员撤销邀请，赵磊再打开链接时看到已失效',
      expected: '链接页说明邀请已失效，并告诉对方去找空间管理员' })
      .click('btn_pending_more', '打开待接受邀请的菜单')
      .click('mi_revoke', '选择「撤销邀请」')
      .click('btn_revoke_confirm', '确认后邀请立即失效')
      .card('第二天', { sub: '赵磊打开了邮件里的邀请链接' })
      .system('打开邀请链接', '链接页说明已失效和下一步', go('/join'), done('赵磊知道邀请已失效、该找谁')),

    denied: flow('普通成员无权邀请', { cases: ['no_permission'], outcome: 'denied', mock: '模拟普通成员身份', state: { ui: { isAdmin: false } },
      expected: '「邀请成员」按钮禁用，点击时说明只有管理员可以邀请' }),
  },
});
