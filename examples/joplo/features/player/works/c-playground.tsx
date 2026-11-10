import { $, flow, notApplicable, work, set } from '@joplo-app/kit';
import { Button, Group, Paper, PromptInput, Stack, Switch, Text, Title } from '@joplo-app/plugin-ui';

/** D88 用户已定模型；原型步骤演示状态，不代表产品里的游玩数据会进入时间线。 */
export default work({
  title: 'C · 时间线 + 自由体验',
  summary: '播放中第一次操作先暂停并立即生效，体验后由观众继续播放。播放、跳步或换场景丢弃体验改动。',
  on: { '/board/play': { main: <Stack gap="sm">
    <Paper withBorder radius="lg" p="lg" mih={440}>
      <Stack gap="lg">
        <Title order={3}>我的家</Title>
        <Text id="pg_stage" size="sm" c="dimmed">舞台空白 · 只暂停，不显示体验提示</Text>
        <PromptInput id="pg_prompt" placeholder="暂停后写下自己的话" />
        <Text size="sm">本地草稿：{$.inputs.pg_prompt}</Text>
        <Switch id="pg_lamp" label="落地灯" checked={$.ui.lamp} />
        <Paper withBorder p="sm">
          <Group><Button id="pg_time_cursor" size="sm" variant="default">↔ 拖到傍晚</Button><Text id="pg_evening">傍晚</Text></Group>
          <Text size="sm">当前时段：{$.ui.period}</Text>
          <Text size="xs" c="dimmed">拖拽后确认，立即看到目标画面；普通教学入口仍停在动作前。</Text>
        </Paper>
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
  state: { ui: { free: false, lamp: true, prompt: false, period: '清晨' } },
  scenarios: {
    prompt_input: flow('真实编辑提示词，继续时恢复脚本', { cases: ['play'], start: '/board/play' })
      .type('pg_prompt', '一段演示输入', '原生多行输入框可自由编辑'),
    direct_entry: flow('直接操纵：确认拖拽后进入目标画面', { cases: ['switch'], start: '/board/play', actionEntry: 'after' })
      .drag('pg_time_cursor', 'pg_evening', '确认后时段已变为傍晚', set($.ui.period, '傍晚'))
      .system('继续播放', '后续步骤等观众继续', set($.ui.period, '傍晚 · 继续播放后')),
    explore: flow('暂停、体验、重置、继续', { cases: ['play'], start: '/board/play' })
      .toggle('pg_lamp', false, '播放中第一次拨灯：暂停并立即关灯', set($.ui.free, true))
      .toggle('pg_lamp', true, '继续自由体验，等观众主动恢复播放')
      .click('pg_reset', '重置只清空体验，不改第 k 步', set($.inputs.pg_lamp, true))
      .click('pg_play', '继续脚本，丢弃体验改动', set($.ui.free, false)),
    switch: flow('命中另一场景，确认后进入', { cases: ['switch'], start: '/board/play', state: { ui: { free: true } } })
      .click('pg_window', '先提示，不立即切换', set($.ui.prompt, true))
      .click('pg_cancel', '取消后仍留在当前体验', set($.ui.prompt, false))
      .click('pg_window', set($.ui.prompt, true))
      .click('pg_confirm', '按目标场景重放到对应操作之前', set($.ui.prompt, false), set($.ui.free, false)),
  },
});
