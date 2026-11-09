import { $, flow, notApplicable, option, set } from '@joplo-app/kit';
import { Button, Group, Paper, Stack, Switch, Text, Title } from '@joplo-app/kit/ui';

/** D88 用户已定模型；原型步骤演示状态，不代表产品里的游玩数据会进入时间线。 */
export default option({
  name: 'C · 时间线 + 自由体验',
  idea: '播放时点舞台只暂停；再次操作才体验。播放、跳步或换场景丢弃体验改动。',
  on: { '/board/play': { main: <Stack gap="sm">
    <Paper withBorder radius="lg" p="lg" mih={440}>
      <Stack gap="lg">
        <Title order={3}>我的家</Title>
        <Button id="pg_stage" variant="subtle">舞台 · 点一下暂停</Button>
        <Switch id="pg_lamp" label="落地灯" checked={$.ui.lamp} />
        <Button id="pg_window" variant="default">客厅窗 · 在另一场景演示</Button>
        <Paper withBorder radius="md" p="sm" when={$.ui.free}>
          <Group justify="space-between"><Stack gap={2}>
            <Text size="sm" fw={600}>自由体验中 · 按播放继续</Text>
            <Text size="xs" c="dimmed">改动不会保留</Text>
          </Stack><Button id="pg_reset" variant="subtle" size="xs">重置</Button></Group>
        </Paper>
        <Paper withBorder shadow="sm" radius="md" p="md" when={$.ui.prompt}>
          <Stack gap="sm"><Text>切到「客厅窗没关」场景？</Text><Text size="sm" c="dimmed">从操作窗户前开始，当前体验改动会丢弃。</Text>
            <Group><Button id="pg_confirm" size="sm">切换场景</Button><Button id="pg_cancel" size="sm" variant="subtle">留在这里</Button></Group>
          </Stack>
        </Paper>
      </Stack>
    </Paper>
    <Group><Button id="pg_play">播放</Button><Text size="sm" c="dimmed">第 2 步 · 控制条在舞台外</Text></Group>
  </Stack> } },
  coverage: {
    review: notApplicable('本方案只设计舞台输入；评审抽屉沿用已选演示页方案'),
    export_image: notApplicable('截图始终使用时间线，不包含自由体验；导出入口沿用已选方案'),
    export_video: notApplicable('视频始终使用时间线；本方案不调整导出流程'),
    publish_play: notApplicable('看板、发布和嵌入复用同一舞台；本方案不单独设计发布页'),
  },
  state: { ui: { free: false, lamp: true, prompt: false } },
  scenarios: {
    explore: flow('暂停、体验、重置、继续', { cases: ['play'], start: '/board/play' })
      .click('pg_stage', '第一次点舞台只暂停，灯仍然亮着', set($.ui.free, true))
      .toggle('pg_lamp', false, '再次操作才改变体验画面')
      .click('pg_reset', '重置只清空体验，不改第 k 步', set($.inputs.pg_lamp, true))
      .click('pg_play', '继续脚本，丢弃体验改动', set($.ui.free, false)),
    switch: flow('命中另一场景，确认后进入', { cases: ['switch'], start: '/board/play', state: { ui: { free: true } } })
      .click('pg_window', '先提示，不立即切换', set($.ui.prompt, true))
      .click('pg_cancel', '取消后仍留在当前体验', set($.ui.prompt, false))
      .click('pg_window', set($.ui.prompt, true))
      .click('pg_confirm', '按目标场景重放到对应操作之前', set($.ui.prompt, false), set($.ui.free, false)),
  },
});
