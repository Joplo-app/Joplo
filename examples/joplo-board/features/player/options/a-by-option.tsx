import { $, done, eq, flow, go, not, option, set, uses } from '@joplo-app/kit';
import { Badge, Divider, Group, List, NavLink, Stack, Text } from '@joplo-app/kit/ui';

import { header, main, overlay, playerState, sharedScenarios } from '../../../shared/player.tsx';

const P = 'pa';

export default option({
  name: 'A · 左栏按方案分组',
  idea: '左栏是“方案 → 场景”两层：每个方案旁边标出缺口数，下面列出它的场景；缺口清单放在左栏底部',
  focus: '左栏怎么组织：先选方案，再选场景',
  tradeoffs: ['和作者的写法（options/*.tsx 里的 scenarios）一一对应，最好理解', '看某个情况在各方案里怎么处理，要来回切方案', '方案多时左栏会变长'],

  on: {
    '/play': {
      header: header(P),
      nav: (
        <Stack gap={4}>
          <Text size="xs" c="dimmed">团队成员邀请 · 方案与场景</Text>
          <NavLink id="pa_opt_a" label="A · 单人邮件邀请弹窗" description={$.ui.aDesc} active={eq($.ui.opt, 'a')} opened={$.ui.aOpen}>
            <NavLink id="pa_sc_success" label="管理员成功发出邀请" active={eq($.ui.sc, 'success')} />
            <NavLink id="pa_sc_failure" label="发送失败后重试" active={eq($.ui.sc, 'failure')} />
            <NavLink id="pa_sc_denied" label="普通成员无权邀请" active={eq($.ui.sc, 'denied')} unmodeled />
          </NavLink>
          <NavLink id="pa_opt_b" label="B · 批量邀请页" description={$.ui.bDesc} active={eq($.ui.opt, 'b')} opened={$.ui.bOpen}>
            <NavLink id="pa_sc_partial" label="批量邀请部分失败" active={eq($.ui.sc, 'partial')} unmodeled />
            <NavLink id="pa_sc_bdenied" label="普通成员无权邀请" unmodeled />
          </NavLink>
          <Stack gap={4} when={not($.ui.publish)}>
            <Divider my="sm" label="缺口" labelPosition="left" />
            <Group gap="xs"><Badge color="red" variant="light">缺失 3</Badge><Badge color="orange" variant="light">待决定 1</Badge></Group>
            <List size="sm">
              <List.Item>邀请被撤销后再次打开链接 · A、B 都缺</List.Item>
              <List.Item>邀请过期后访问 · A、B 都缺</List.Item>
              <List.Item>邮箱为空或格式无效 · A 缺</List.Item>
              <List.Item>被邀请人已是成员 · A 待决定</List.Item>
            </List>
          </Stack>
        </Stack>
      ),
      main: main(P),
      overlay: overlay(P),
    },
  },

  state: {
    ...playerState(P),
    ui: { ...playerState(P).ui, opt: 'a', sc: 'success', aDesc: '已选定 · 缺失 3 · 待决定 1', bDesc: '缺失 1', aOpen: true, bOpen: false },
  },

  scenarios: {
    ...sharedScenarios(P),
    switch: flow('切换方案和场景', { cases: ['switch'], start: '/play', expected: '左栏点一下就换，面包屑同步' })
      .click('pa_sc_failure', '点「发送失败后重试」：换场景，回到第 0 步',
        set($.ui.sc, 'failure'), set($.ui.scenarioName, '发送失败后重试'), set($.ui.stepNo, 0), set($.ui.caption, '初始状态'), uses('header_minimal'))
      .click('pa_opt_b', '点方案 B：切到它的第一个场景', set($.ui.opt, 'b'), set($.ui.bOpen, true), set($.ui.sc, 'partial'), set($.ui.optionName, 'B · 批量邀请页'), set($.ui.scenarioName, '批量邀请部分失败'))
      .click('pa_opt_a', '再切回方案 A', set($.ui.opt, 'a'), set($.ui.sc, 'success'), set($.ui.optionName, 'A · 单人邮件邀请弹窗'), set($.ui.scenarioName, '管理员成功发出邀请'))
      .click('pa_sc_success', set($.ui.sc, 'success'))
      .click('pa_crumb_project', '面包屑第一段回到首页', go('/'), done('左栏切换方案与场景，面包屑可回首页')),
  },
});
