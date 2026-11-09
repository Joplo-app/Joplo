import { withDesignRecord } from '../../../shared/design/record.ts';
import { designRecords } from '../../../shared/design/records.ts';
import { $, done, flow, option, set, uses } from '@joplo-app/kit';
import { Center, Code, Phone, SimpleGrid, Stack, Terminal, Text, Title } from '@joplo-app/plugin-ui';

const API =
  '<Terminal title="~/work">\n' +
  '  <Terminal.Command>npx joplo skill</Terminal.Command>\n' +
  '  <Terminal.Output tone="ok" when={$.ui.ran}>…</Terminal.Output>\n' +
  '  <Terminal.Input id="cmd" />\n' +
  '</Terminal>\n\n' +
  '<Phone>…</Phone>   // 或 page({ viewport: "mobile" })，舞台自动套上';

const LONG = Array.from({ length: 30 }, (_, i) => `  第 ${i + 1} 行输出`).join('\n');

export default withDesignRecord(option({
  name: 'A · 目录组件 Terminal + Phone',
  idea: 'Terminal（标题、命令块、结果块、输入行）和 Phone（大圆角、侧边按键、按 390 宽排版）是目录里的正式组件；页面写 viewport: "mobile" 时舞台自动套上 Phone',
  focus: '外框做成组件：CLI 和移动端原型直接写，不用拼',
  tradeoffs: ['joplo-dist 这类 CLI 原型的代码少了一半', '移动端页面零成本套外框', '只是低保真外观，不模拟真实 shell'],

  on: {
    '/board/frames': {
      main: (
        <Stack gap="lg">
          <Title order={2}>设备外框</Title>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
            <Terminal title="Terminal · ~/work" mah={420}>
              <Terminal.Command when={$.ui.ran}>npx joplo skill</Terminal.Command>
              <Terminal.Output id="f_output" tone="ok" when={$.ui.ran}>{'Joplo 0.1.0 · Agent 用法（按需读取）\n  authoring   写页面、方案、场景\n  components  组件目录与属性\n  cases       开工前主动提问'}</Terminal.Output>
              <Terminal.Command when={$.ui.long}>npx joplo check</Terminal.Command>
              <Terminal.Output id="f_long" when={$.ui.long}>{LONG}</Terminal.Output>
              <Terminal.Input id="f_cmd" placeholder="输入命令" />
            </Terminal>
            <Center>
              <Phone scale={0.7} h={760}>
                <Stack gap="sm" p="md">
                  <Title order={4}>成员</Title>
                  <Text size="sm">王芳 · 管理员</Text>
                  <Text size="sm">陈晨 · 编辑者</Text>
                  <Text size="sm">刘洋 · 查看者</Text>
                </Stack>
              </Phone>
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

  state: { ui: { ran: false, long: false } },

  scenarios: {
    terminal: flow('在终端组件里运行命令', { cases: ['terminal', 'phone'], start: '/board/frames' })
      .type('f_cmd', 'npx joplo skill', '输入命令并回车：命令块和结果块出现', set($.ui.ran, true), set($.inputs.f_cmd, ''), uses('frame_is_component'))
      .system('结束', done('命令和输出分块显示')),
    long_output: flow('输出很长', { cases: ['long_output'], start: '/board/frames' })
      .type('f_cmd', 'npx joplo check', '输出 30 行：终端内部滚动，不把页面撑开', set($.ui.long, true), set($.inputs.f_cmd, ''))
      .system('结束', done('长输出在终端内滚动')),
  },
}), designRecords.frames);
