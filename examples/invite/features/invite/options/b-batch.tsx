import { $, done, flow, go, missing, not, option, page, push, rule, set, toast, uses } from '@joplo/kit';
import { members, pending } from '../sample.ts';
import { Alert, Button, Card, DataTable, Select, Stack, Textarea, Title } from '@joplo/kit/ui';

export default option({
  name: 'B · 独立页面批量邀请',
  idea: '成员页进入独立的「批量邀请」页面，一次粘贴多个邮箱，提交后逐个显示结果',
  focus: '步骤组织：独立页面、批量处理，并展示部分失败',
  tradeoffs: ['适合一次邀请很多人', '多一次页面跳转，偶尔邀请一人时偏重', '需要设计部分失败的结果展示'],

  on: {
    '/members': {
      'header.actions': (
        <Button id="btn_batch" variant="outline" disabled={not($.ui.isAdmin)} disabledReason="只有空间管理员可以邀请成员">
          批量邀请
        </Button>
      ),
    },
  },

  routes: {
    '/members/invite': page(
      { title: '批量邀请' },
      <Stack gap="md">
        <Title order={2}>批量邀请成员</Title>
        <Card withBorder>
          <Stack gap="sm">
            <Title order={4}>填写邮箱</Title>
            <Textarea id="in_emails" label="邮箱（每行一个）" placeholder={'a@company.com\nb@company.com'} minRows={3} />
            <Select id="sel_batch_role" label="统一权限" placeholder="选择权限" data={['查看者', '编辑者']} />
            <Button id="btn_batch_send">发送全部邀请</Button>
          </Stack>
        </Card>
        <Alert id="alert_partial" color="yellow" when={$.ui.partial}>
          3 个邀请中 2 个成功，1 个失败。失败项可以单独重试。
        </Alert>
        <DataTable
          id="tbl_results"
          columns={[{ accessor: 'email', title: '邮箱' }, { accessor: 'result', title: '结果' }]}
          records={$.data.results}
          noRecordsText="提交后在这里显示每个邮箱的结果"
        />
      </Stack>,
    ),
  },

  state: { ui: { isAdmin: true, partial: false }, data: { members, pending, results: [] } },

  rules: {
    partial_result: rule('批量提交时逐个显示结果，失败项可单独重试，成功项不回滚', { elements: ['tbl_results'] }),
  },

  coverage: {
    request_failed: missing('部分失败已画出，整体请求失败尚未设计'),
  },

  scenarios: {
    partial: flow('批量邀请，其中一个失败', { cases: ['happy'], mock: '模拟部分失败' })
      .click('btn_batch', '点击「批量邀请」进入独立页面', go('/members/invite'))
      .type('in_emails', 'a@company.com\nb@company.com\nbad@')
      .select('sel_batch_role', '编辑者')
      .click('btn_batch_send', uses('partial_result'))
      .system('批量请求返回（模拟）', '2 个成功、1 个失败，逐个显示结果',
        set($.ui.partial, true),
        push($.data.results, { email: 'a@company.com', result: '已发送' }),
        push($.data.results, { email: 'b@company.com', result: '已发送' }),
        push($.data.results, { email: 'bad@', result: '失败：邮箱格式无效' }),
        toast('2 个邀请已发送，1 个失败'),
        done('部分完成：失败项可以单独重试')),

    denied: flow('普通成员无权邀请', { cases: ['no_permission'], outcome: 'denied', mock: '模拟普通成员身份', state: { ui: { isAdmin: false } } }),
  },
});
