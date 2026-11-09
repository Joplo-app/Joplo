import { $, done, explain, flow, layer, option, set, shot } from '@joplo-app/kit';
import { Button, ChatMessage, Paper, Placeholder, SimpleGrid, Stack, Text, ToolCall } from '@joplo-app/plugin-ui'; import { Diagram } from '@joplo-app/plugin-diagram';

/**
 * 每层是完全独立的画面（T-layers）：layer(title, <JSX/>) 自己的树、自己的布局，占满整个舞台；
 * 各层共享同一份状态。shot 的 id 在包含它的层里解析，多层有同名 id 时各层都生效（这里 overview 也有 biz / billing）。
 */
const Client = () => (
  <Paper id="client_panel" withBorder p="md" m="md">
    <Stack gap="sm">
      <Text fw={600}>客户端</Text>
      <ChatMessage id="msg_user" from="user" when={$.ui.sent}>帮我整理发票</ChatMessage>
      <ToolCall id="card_tool" title="read_files" state="running" when={$.ui.tool}>~/Desktop/报销</ToolCall>
      <Button id="app_send">发送</Button>
    </Stack>
  </Paper>
);

const Arch = ({ id, h }: { id: string; h: number }) => (
  <Diagram id={id} direction="down" h={h}>
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
);

export default option({
  name: 'A · 混合',
  idea: '端侧执行器 + 云端大脑',
  on: {
    '/': { main: [<Text id="route_note">路径页面（声明了 layers 的方案在演示页显示各层自己的画面）</Text>] },
  },
  state: { ui: { sent: false, tool: false, n_biz: 'idle', n_billing: 'idle' } },
  layers: {
    client: layer('客户端视角', <Client />),
    backend: layer('后端流转', <Arch id="arch" h={720} />),
    overview: layer(
      '全景',
      <Stack p="md" gap="md">
        <SimpleGrid cols={2} spacing="md">
          <Client />
          <Arch id="arch_all" h={460} />
        </SimpleGrid>
        <Placeholder id="long_notes" label="很长的说明区（检验整层缩进画面）" h={900} />
      </Stack>,
    ),
  },
  scenarios: {
    happy: flow('整理发票', { cases: ['happy'], start: '/' })
      .click('app_send', set($.ui.sent, true), set($.ui.n_biz, 'active'), shot('msg_user'), shot('app', 'biz'))
      .system('额度预检', '调用模型之前，Biz Server 先向 Billing 预检额度', set($.ui.n_billing, 'active'), shot('biz', 'billing'), explain('额度不足时在这里就拦下：不会调用模型，也不会产生任何费用。预检只读余额，扣费在用量异步入账时发生。'))
      .system('只看 Billing', shot('billing'))
      .system('端侧执行', set($.ui.tool, true), shot('card_tool'), shot('local'))
      .system('没有镜头的一步')
      .system('结束', set($.ui.n_billing, 'ok'), shot(), done('整理完成')),
  },
});
