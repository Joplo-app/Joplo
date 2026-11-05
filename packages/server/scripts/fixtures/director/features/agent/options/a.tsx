import { $, done, flow, layer, option, set, shot } from '@tokenroll/joplo-kit';
import { Button, ChatMessage, Diagram, Paper, Placeholder, SimpleGrid, Stack, Text, ToolCall } from '@tokenroll/joplo-kit/ui';

export default option({
  name: 'A · 混合',
  idea: '端侧执行器 + 云端大脑',
  on: {
    '/': {
      main: [
        <SimpleGrid cols={2} spacing="md">
          <Paper id="client_panel" withBorder p="md">
            <Stack gap="sm">
              <Text fw={600}>客户端</Text>
              <ChatMessage id="msg_user" from="user" when={$.ui.sent}>帮我整理发票</ChatMessage>
              <ToolCall id="card_tool" title="read_files" state="running" when={$.ui.tool}>~/Desktop/报销</ToolCall>
              <Button id="app_send">发送</Button>
            </Stack>
          </Paper>
          <Diagram id="arch" direction="down" h={460}>
            <Diagram.Group id="g_dev" label="用户设备">
              <Diagram.Node id="app" label="客户端界面" kind="client" />
              <Diagram.Node id="local" label="端侧执行器" kind="tool" />
            </Diagram.Group>
            <Diagram.Group id="g_aws" label="AWS">
              <Diagram.Node id="biz" label="Biz Server" kind="service" state={$.ui.n_biz} />
              <Diagram.Node id="brain" label="Agent 大脑" kind="service" />
              <Diagram.Node id="billing" label="Billing" kind="service" state={$.ui.n_billing} />
            </Diagram.Group>
            <Diagram.Edge from="app" to="biz" label="消息" />
            <Diagram.Edge from="biz" to="billing" label="额度预检" />
            <Diagram.Edge from="biz" to="brain" label="任务" />
            <Diagram.Edge from="biz" to="local" label="下发端侧工具" />
          </Diagram>
        </SimpleGrid>,
        <Placeholder id="long_notes" label="很长的说明区（检验一屏放下）" h={900} />,
      ],
    },
  },
  state: { ui: { sent: false, tool: false, n_biz: 'idle', n_billing: 'idle' } },
  layers: {
    client: layer('客户端视角', ['client_panel']),
    backend: layer('后端流转', ['arch']),
  },
  scenarios: {
    happy: flow('整理发票', { cases: ['happy'], start: '/' })
      .click('app_send', set($.ui.sent, true), set($.ui.n_biz, 'active'), shot('msg_user'), shot('app', 'biz'))
      .system('额度预检', set($.ui.n_billing, 'active'), shot('biz', 'billing'))
      .system('只看 Billing', shot('billing'))
      .system('端侧执行', set($.ui.tool, true), shot('card_tool'), shot('local'))
      .system('没有镜头的一步')
      .system('结束', set($.ui.n_billing, 'ok'), shot(), done('整理完成')),
  },
});
