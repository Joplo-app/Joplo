import { $, done, flow, missing, option, set, uses } from '@tokenroll/joplo-kit';
import { Box, Button, Center, Code, Group, Paper, SimpleGrid, Stack, Text, TextInput, Title } from '@tokenroll/joplo-kit/ui';

const API =
  '// 终端：新组件\n' +
  '<Terminal title="~/work">\n' +
  '  <Terminal.Command>npx joplo skill</Terminal.Command>\n' +
  '  <Terminal.Output tone="ok" when={$.ui.ran}>…</Terminal.Output>\n' +
  '  <Terminal.Input id="cmd" />\n' +
  '</Terminal>\n\n' +
  '// 手机：不用写外框\n' +
  "page({ title: '成员', viewport: 'mobile' }, <Stack>…</Stack>)";

export default option({
  name: 'A · 内置终端组件 + 自动手机外框',
  idea: '目录新增 Terminal 组件；手机外框由舞台按 viewport 或顶栏切换自动加上',
  focus: '外框是组件还是舞台能力：终端是内容，做成组件；手机是显示方式，交给舞台',
  tradeoffs: ['joplo-dist 这类 CLI 原型的代码可以少一半', '手机外框作者零成本', '终端只是低保真外观，不模拟真实的 shell 行为'],

  on: {
    '/frames': {
      main: (
        <Stack gap="lg">
          <Title order={2}>设备外框</Title>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
            <Paper withBorder radius="lg" p="md" ff="monospace" note="Terminal 组件的低保真外观">
              <Stack gap="sm">
                <Text fw={700}>Terminal · ~/work</Text>
                <Paper withBorder radius="md" p="sm">
                  <Code>$ npx joplo skill</Code>
                </Paper>
                <Paper id="f_output" withBorder radius="md" p="sm" when={$.ui.ran}>
                  <Text size="sm">{'Joplo 0.1.0 · Agent 用法（按需读取）\n  authoring   写页面、方案、场景\n  components  组件目录与属性\n  cases       开工前主动提问'}</Text>
                </Paper>
                <Group gap="xs" wrap="nowrap">
                  <Text>$</Text>
                  <TextInput id="f_cmd" ff="monospace" placeholder="输入命令" flex={1} />
                  <Button id="f_enter" variant="default">⏎</Button>
                </Group>
              </Stack>
            </Paper>
            <Center>
              <Paper withBorder radius={36} p="md" w={280} mih={480} note="舞台自动加的手机外框">
                <Stack gap="sm">
                  <Center><Box w={80} h={6} bg="gray.3" /></Center>
                  <Text fw={700}>Phone</Text>
                  <Title order={4}>成员</Title>
                  <Text size="sm">王芳 · 管理员</Text>
                  <Text size="sm">陈晨 · 编辑者</Text>
                  <Text size="sm">刘洋 · 查看者</Text>
                </Stack>
              </Paper>
            </Center>
          </SimpleGrid>
          <Stack gap={4}>
            <Text fw={600}>作者怎么写</Text>
            <Code block>{API}</Code>
          </Stack>
        </Stack>
      ),
    },
  },

  state: { ui: { ran: false } },

  coverage: {
    long_output: missing('输出很长时的滚动还没画'),
  },

  scenarios: {
    terminal: flow('在终端组件里运行命令', { cases: ['terminal', 'phone'], start: '/frames' })
      .type('f_cmd', 'npx joplo skill')
      .click('f_enter', '回车：输出块出现', set($.ui.ran, true), set($.inputs.f_cmd, ''), uses('frame_is_component'), done('命令和输出分块显示')),
  },
});
