import { $, done, eq, flow, option, set, uses } from '@joplo-app/kit';
import { Box, Button, Group, Paper, SegmentedControl, SimpleGrid, Stack, Text } from '@joplo-app/kit/ui';

import { authorCode, backendLayer, clientLayer, header, step, stepBar, viewsState } from '../../../shared/views.tsx';

const P = 'va';
const layer = $.inputs.va_layer;

export default option({
  name: 'A · 切换层级',
  idea: '画面上方切换“全景 / 客户端视角 / 后端流转”；每层独占整个画面，镜头对准这一步在该层的焦点；切换时停在同一步',
  focus: '同一步怎么从不同层级看：一次看一层，看得清',
  tradeoffs: ['每层都能用整个画面，最不挤', '要来回切才能对照客户端和后端', '全景层仍然会挤，适合只看整体'],

  on: {
    '/views': {
      header: header(P),
      main: (
        <Stack gap="sm">
          <Group justify="space-between">
            <SegmentedControl id="va_layer" data={['全景', '客户端视角', '后端流转']} />
            <Group gap="xs">
              <Text size="sm" c="dimmed">同一步，换个层级看</Text>
              <Button id="va_replay" variant="default" size="xs">↻ 只重放这一层</Button>
            </Group>
          </Group>
          <Paper withBorder radius="lg" p="md" mih={560}>
            <SimpleGrid cols={2} spacing="md" when={eq(layer, '全景')}>
              {clientLayer(`${P}_all_c`, false)}
              {backendLayer(`${P}_all`, 420)}
            </SimpleGrid>
            <Box when={eq(layer, '客户端视角')}>{clientLayer(`${P}_c`, true)}</Box>
            <Box when={eq(layer, '后端流转')}>{backendLayer(P, 540)}</Box>
          </Paper>
          <Group gap="xs">
            <Button id="va_next" variant="default">下一步</Button>
            <Text size="sm" c="dimmed" when={$.ui.replaying}>正在只重放“{layer}”：这一层没有变化的步骤快速带过</Text>
          </Group>
          {stepBar(P)}
          {authorCode()}
        </Stack>
      ),
    },
  },

  state: { ui: viewsState(), inputs: { va_layer: '全景' } },

  scenarios: {
    switch_layer: flow('同一步换层级看', { cases: ['switch_layer', 'crowded'], start: '/views', expected: '停在同一步，只换怎么看' })
      .click('va_next', '全景里先走到第 1 步：客户端和后端挤在一屏', ...step(1))
      .select('va_layer', '后端流转', '切到「后端流转」：仍是第 1 步，换个视角', uses('same_step'))
      .click('va_next', '在这一层往下走：额度预检只在后端有变化', ...step(2), uses('shot_in_step'))
      .select('va_layer', '客户端视角', '切到「客户端视角」：同一步，客户端这一层没有变化')
      .click('va_next', ...step(3))
      .click('va_next', '端侧执行：客户端层的镜头对准 read_files 卡片', ...step(4))
      .select('va_layer', '后端流转', '再切回后端：同一步，镜头对准端侧执行器')
      .system('结束', done('同一步从不同层级看')),

    replay_layer: flow('只在后端层重放', { cases: ['replay_layer'], start: '/views', state: { inputs: { va_layer: '后端流转' } } })
      .click('va_replay', '只重放后端层：从第 0 步开始', set($.ui.replaying, true))
      .system('重放：发送消息', ...step(1))
      .system('重放：额度预检', ...step(2))
      .system('重放：大脑推理', ...step(3))
      .system('重放：端侧执行', ...step(4))
      .system('重放：回答', ...step(5), set($.ui.replaying, false), done('只看后端的完整流转')),
  },
});
