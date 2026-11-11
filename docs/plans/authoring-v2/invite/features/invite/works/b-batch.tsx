import { $, flow, go, missing, not, page, rule, uses, work } from '@joplo-app/kit';
import { Alert, Card, DataTable, Stack, Title } from '@joplo-app/plugin-ui';
import { Button, Select, TextField } from '../../../components.ts';
import { MembersPage } from '../shared/members-page.tsx';
import invite from '../feature.ts';
import { api, members as people, pending } from '../api.ts';

const { cases: c } = invite;

export default work({
  title: 'B · 独立页面批量邀请',
  summary: '成员页进入独立的「批量邀请」页面，一次粘贴多个邮箱，提交后逐个显示结果',
  focus: '步骤组织：独立页面、批量处理，并展示部分失败',
  tradeoffs: ['适合一次邀请很多人', '多一次页面跳转，偶尔邀请一人时偏重', '需要设计部分失败的结果展示'],

  routes: {
    '/members': page({ title: '成员' }, (
      <MembersPage actions={
        <Button id="btn_batch" variant="secondary" disabled={not($.ui.isAdmin)} disabledReason="只有空间管理员可以邀请成员"
          onClick={go('/members/invite')}>
          批量邀请
        </Button>
      } />
    )),
    '/members/invite': page({ title: '批量邀请' }, (
      <Stack gap="md">
        <Title order={2}>批量邀请成员</Title>
        <Card withBorder>
          <Stack gap="sm">
            <Title order={4}>填写邮箱</Title>
            <TextField id="in_emails" label="邮箱（每行一个）" multiline value={$.ui.emails} placeholder={'a@company.com\nb@company.com'} />
            <Select id="sel_batch_role" label="统一权限" value={$.ui.role} options={['查看者', '编辑者']} />
            <Button id="btn_batch_send" onClick={[uses('partial_result'), api.sendBatch]}>发送全部邀请</Button>
          </Stack>
        </Card>
        <Alert id="alert_partial" color="yellow" when={$.ui.partial}>3 个邀请中 2 个成功，1 个失败。失败项可以单独重试。</Alert>
        <DataTable
          id="tbl_results"
          columns={[{ accessor: 'email', title: '邮箱' }, { accessor: 'result', title: '结果' }]}
          records={$.data.results}
          noRecordsText="提交后在这里显示每个邮箱的结果"
        />
      </Stack>
    )),
  },

  state: { ui: { isAdmin: true, emails: '', role: '', partial: false }, data: { members: people, pending, results: [] } },

  rules: {
    partial_result: rule('批量提交时逐个显示结果，失败项可单独重试，成功项不回滚', { elements: ['tbl_results'] }),
  },

  coverage: {
    request_failed: missing('部分失败已画出，整体请求失败尚未设计'),
  },

  scenarios: {
    partial: flow('批量邀请，其中一个失败', { cases: [c.happy] })
      .click('btn_batch', '点击「批量邀请」进入独立页面')
      .type('in_emails', 'a@company.com\nb@company.com\nbad@', '输入三个邮箱（含一个错的）')
      .select('sel_batch_role', '编辑者')
      .click('btn_batch_send'), // 之后自动接 api.sendBatch 的系统步骤

    denied: flow('普通成员无权邀请', { cases: [c.no_permission], outcome: 'denied', state: { ui: { isAdmin: false } } }),
  },
});
