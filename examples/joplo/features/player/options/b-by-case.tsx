import { withDesignRecord } from '../../../shared/design/record.ts';
import { designRecords } from '../../../shared/design/records.ts';
import { $, done, eq, flow, go, not, option, set, uses } from '@joplo-app/kit';
import { Alert, Badge, Code, Divider, Group, NavLink, SegmentedControl, Stack, Text } from '@joplo-app/plugin-ui';

import { header, main, overlay, playerState, sharedScenarios } from '../../../shared/board/player.tsx';

const P = 'pb';

/** 一条情况：名称 + 各方案的覆盖状态。 */
const CaseLink = (p: { id: string; title: string; a: string; b: string; unmodeled?: boolean }) => (
  <NavLink id={p.id} label={p.title} description={`A ${p.a} · B ${p.b}`} active={eq($.ui.case, p.id)} unmodeled={p.unmodeled} />
);

export default withDesignRecord(option({
  name: 'B · 左栏按情况分组',
  idea: '左栏列出功能的所有情况，每条标出各方案是否已表达；顶部切换当前方案，点一条情况就播放当前方案里对应的场景',
  focus: '左栏怎么组织：先选情况，再看各方案怎么处理（对应 D12“选一个情况，分别看各方案”）',
  tradeoffs: ['缺口就是列表本身，一眼看到哪些情况还没表达', '比较方案时只要切顶部的方案，情况保持不变', '一个场景覆盖多个情况时，同一个场景会出现在多行'],

  on: {
    '/board/play': {
      header: header(P),
      nav: (
        <Stack gap={4}>
          <Text size="xs" c="dimmed">团队成员邀请 · 当前方案</Text>
          <SegmentedControl id="pb_opt" data={['A · 弹窗', 'B · 批量页']} fullWidth />
          <Divider my="xs" label="情况" labelPosition="left" />
          <CaseLink id="pb_c_happy" title="正常发出邀请并被接受" a="✓" b="✓" />
          <CaseLink id="pb_c_failed" title="发送请求失败" a="✓" b="缺失" />
          <CaseLink id="pb_c_denied" title="非管理员尝试邀请" a="✓" b="✓" unmodeled />
          <CaseLink id="pb_c_member" title="被邀请人已是成员" a="待决定" b="缺失" unmodeled />
          <CaseLink id="pb_c_revoked" title="邀请被撤销后再次打开链接" a="缺失" b="缺失" unmodeled />
          <Group gap="xs" mt="sm" when={not($.ui.publish)}>
            <Badge color="red" variant="light">缺失 3</Badge>
            <Badge color="orange" variant="light">待决定 1</Badge>
          </Group>
        </Stack>
      ),
      main: [
        <Alert id="pb_missing" color="orange" title="方案 B 还没有表达「发送请求失败」" when={$.ui.missing}>
          <Stack gap="xs">
            <Text size="sm">这是缺口，不是演示。可以在 Agent 会话里说“给方案 B 补上发送失败的场景”，或先查看：</Text>
            <Code>npx joplo check --option invite.b-batch</Code>
          </Stack>
        </Alert>,
        main(P),
      ],
      overlay: overlay(P),
    },
  },

  state: {
    ...playerState(P),
    ui: { ...playerState(P).ui, case: 'pb_c_happy', missing: false },
    inputs: { pb_opt: 'A · 弹窗' },
  },

  scenarios: {
    ...sharedScenarios(P),
    switch: flow('按情况比较两个方案', { cases: ['switch', 'review'], start: '/board/play', expected: '同一个情况，切方案就能比较；没表达的直接显示为缺口' })
      .click('pb_c_failed', '点情况「发送请求失败」：播放方案 A 里覆盖它的场景',
        set($.ui.case, 'pb_c_failed'), set($.ui.scenarioName, '发送失败后重试'), set($.ui.stepNo, 0), uses('header_minimal'))
      .select('pb_opt', 'B · 批量页', '切到方案 B：没表达这个情况，直接显示缺口',
        set($.ui.optionName, 'B · 批量邀请页'), set($.ui.scenarioName, '（缺失）'), set($.ui.missing, true))
      .click('pb_c_happy', '换一个两边都有的情况', set($.ui.case, 'pb_c_happy'), set($.ui.missing, false), set($.ui.scenarioName, '批量邀请部分失败'))
      .click('pb_crumb_project', '面包屑第一段回到首页', go('/board'), done('按情况比较方案，缺口直接可见')),
  },
}), designRecords.player);
