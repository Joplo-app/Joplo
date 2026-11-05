import { $, done, flow, missing, option, set } from '@joplo-app/kit';
import { Button, Group, Paper, SimpleGrid, Stack, Text } from '@joplo-app/kit/ui';

import { authorCode, backendLayer, clientLayer, header, step, stepBar, viewsState } from '../../../shared/views.tsx';

const P = 'vb';

export default option({
  name: 'B · 并排看两层',
  idea: '画面分成左右两块：左边客户端视角、右边后端流转，各有自己的镜头，同时播放；每块可以单独放大',
  focus: '同一步怎么从不同层级看：两层同时看，直接对照',
  tradeoffs: ['不用切换，客户端和后端的因果一眼对上', '每层只有半个画面，层多了还是挤', '三层以上时并排放不下'],

  on: {
    '/views': {
      header: header(P),
      main: (
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
            <Paper withBorder radius="lg" p="sm" mih={560}>
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={600}>客户端视角</Text>
                <Button id="vb_zoom_c" variant="subtle" size="xs" unmodeled>放大</Button>
              </Group>
              {clientLayer(`${P}_c`, false)}
            </Paper>
            <Paper withBorder radius="lg" p="sm" mih={560}>
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={600}>后端流转</Text>
                <Group gap={4}>
                  <Button id="vb_replay" variant="subtle" size="xs">↻ 只重放这一层</Button>
                  <Button id="vb_zoom_b" variant="subtle" size="xs" unmodeled>放大</Button>
                </Group>
              </Group>
              {backendLayer(P, 500)}
            </Paper>
          </SimpleGrid>
          <Group gap="xs">
            <Button id="vb_next" variant="default">下一步</Button>
            <Text size="sm" c="dimmed" when={$.ui.replaying}>正在只重放“后端流转”，左边客户端保持不动</Text>
          </Group>
          {stepBar(P)}
          {authorCode()}
        </Stack>
      ),
    },
  },

  state: { ui: viewsState() },

  coverage: {
    crowded: missing('两层并排时每层只有一半画面；层多了还是挤，怎么处理还没想好'),
  },

  scenarios: {
    switch_layer: flow('两层同时看', { cases: ['switch_layer'], start: '/views' })
      .click('vb_next', '第 1 步：左边出消息，右边连线同时亮起', ...step(1))
      .click('vb_next', '第 2 步：只有右边在变（额度预检）', ...step(2))
      .click('vb_next', ...step(3))
      .click('vb_next', '第 4 步：左右同时亮起，因果一目了然', ...step(4))
      .system('结束', done('两层对照着看')),

    replay_layer: flow('只重放后端', { cases: ['replay_layer'], start: '/views' })
      .click('vb_replay', '右边点“只重放这一层”：左边客户端停在当前画面', set($.ui.replaying, true))
      .system('重放：发送消息', ...step(1))
      .system('重放：额度预检', ...step(2))
      .system('重放：大脑推理', ...step(3))
      .system('重放：端侧执行', ...step(4))
      .system('重放：回答', ...step(5), set($.ui.replaying, false), done('只看后端的完整流转')),
  },
});
