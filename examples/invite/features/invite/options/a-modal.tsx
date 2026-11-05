import { $, done, flow, not, notEmpty, option, rule, set, push, toast, undecided, uses } from '@joplo/kit';
import {
  Alert, AlertDescription, AlertTitle, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Input, Label, Loader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@joplo/kit/ui';

import { members, pending } from '../sample.ts';

/** 打开弹窗并填写，成功与失败两个场景共用。 */
const fillAndSend = (name: string, opts: Parameters<typeof flow>[1]) =>
  flow(name, opts)
    .click('btn_invite', '管理员点击右上角「邀请成员」，打开邀请弹窗', set($.ui.inviteOpen, true), uses('admin_only'))
    .type('in_email', 'li.lei@example.com')
    .select('sel_role', '编辑者', uses('role_cap'))
    .click('btn_send', '点击「发送邀请」，按钮进入发送中状态', set($.ui.sending, true), uses('no_double_submit'));

const sent = [
  set($.ui.sending, false), set($.ui.error, ''), set($.ui.inviteOpen, false),
  push($.data.pending, { email: 'li.lei@example.com', role: '编辑者', status: '待接受' }),
  toast.success('已向 li.lei@example.com 发送邀请'),
  done('邀请已发出，等待对方接受'),
];

export default option({
  name: 'A · 单人邮件邀请弹窗',
  idea: '在成员页点一个按钮，弹窗里填写一个邮箱和权限后发送邮件邀请',
  focus: '操作入口与步骤组织：就地弹窗、一次一人',
  tradeoffs: ['路径最短，适合偶尔邀请一两个人', '一次只能邀请一人，批量邀请效率低', '依赖邮件送达'],

  on: {
    '/members': {
      'header.actions': (
        <Button id="btn_invite" disabled={not($.ui.isAdmin)} disabledReason="只有空间管理员可以邀请成员" note="入口：成员页右上角，只对管理员可用">
          邀请成员
        </Button>
      ),
      notice: (
        <Alert id="alert_denied" when={not($.ui.isAdmin)}>
          <AlertDescription>你是普通成员，邀请新成员需要联系空间管理员。</AlertDescription>
        </Alert>
      ),
      overlay: (
        <Dialog id="dlg_invite" open={$.ui.inviteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>邀请成员</DialogTitle>
              <DialogDescription>被邀请人会收到一封邮件，接受后加入本空间。</DialogDescription>
            </DialogHeader>
            <Label htmlFor="in_email">邮箱</Label>
            <Input id="in_email" type="email" placeholder="name@company.com" />
            <Label htmlFor="sel_role">权限</Label>
            <Select id="sel_role" note="受邀者获得的权限不会高于这里选择的权限">
              <SelectTrigger><SelectValue placeholder="选择权限" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="查看者">查看者</SelectItem>
                <SelectItem value="编辑者">编辑者</SelectItem>
                <SelectItem value="管理员">管理员</SelectItem>
              </SelectContent>
            </Select>
            <Alert id="alert_send_error" variant="destructive" when={notEmpty($.ui.error)}>
              <AlertTitle>发送失败</AlertTitle>
              <AlertDescription>{$.ui.error}</AlertDescription>
            </Alert>
            <Loader id="spin_send" when={$.ui.sending}>正在发送邀请…</Loader>
            <DialogFooter>
              <Button id="btn_cancel" variant="outline" unmodeled note="取消并关闭：本版未建模，是否保留已填内容待决定">取消</Button>
              <Button id="btn_send" disabled={$.ui.sending} disabledReason="正在发送，防止重复提交">发送邀请</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ),
    },
  },

  state: { ui: { isAdmin: true, inviteOpen: false, sending: false, error: '' }, data: { members, pending } },

  rules: {
    keep_input: rule('发送失败后保留已填写的邮箱和权限，允许直接重试', { cases: ['request_failed'], elements: ['alert_send_error'] }),
    no_double_submit: rule('发送中禁用「发送邀请」按钮，防止重复提交', { cases: ['duplicate_submit'], elements: ['btn_send'] }),
  },

  coverage: {
    already_member: undecided('已是成员时提示错误还是静默跳过，尚未决定'),
  },

  scenarios: {
    success: fillAndSend('管理员成功发出邀请', { cases: ['happy', 'duplicate_submit'], expected: '弹窗关闭，出现成功提示，新邀请进入待接受列表' })
      .system('邀请请求成功（模拟）', '系统返回成功：关闭弹窗，新邀请出现在「待接受的邀请」中', ...sent),

    failure: fillAndSend('发送失败后重试', { cases: ['request_failed'], outcome: 'failure', mock: '模拟失败后重试成功' })
      .system('邀请请求失败（模拟网络超时）', '系统返回失败：弹窗保持打开，显示错误并保留已填写的内容',
        set($.ui.sending, false), set($.ui.error, '网络超时。已保留你填写的内容，可以重试。'), uses('keep_input'))
      .click('btn_send', '点击「发送邀请」重试', set($.ui.sending, true), set($.ui.error, ''), uses('keep_input'))
      .system('邀请请求成功（模拟）', ...sent),

    denied: flow('普通成员无权邀请', { cases: ['no_permission'], outcome: 'denied', mock: '模拟普通成员身份', state: { ui: { isAdmin: false } },
      expected: '「邀请成员」按钮禁用，点击时说明只有管理员可以邀请' }),
  },
});
