/**
 * 「视角与分镜」两个方案共用的部分：客户端层、后端层（用 Diagram 画）、步骤条、作者写法。
 * 样例场景取自 examples/agent-arch 的“整理本机的报销发票”，缩成 5 步。
 */
import { $, set, type Bind, type JNode } from '@tokenroll/joplo-kit';
import {
  Badge, Breadcrumbs, Anchor, ChatMessage, Code, Diagram, Group, Paper, Stack, Stepper, Text, ToolCall,
} from '@tokenroll/joplo-kit/ui';

const ui = $.ui as unknown as Record<string, Bind>;

export const header = (p: string): JNode => (
  <Breadcrumbs id={`${p}_crumbs`}>
    <Anchor id={`${p}_crumb_home`} href="/" unmodeled>Agent 脑手分离</Anchor>
    <Text size="sm">一次 Agent 任务的完整链路</Text>
    <Text size="sm">A · 混合的手</Text>
    <Text size="sm" fw={600}>整理本机的报销发票</Text>
  </Breadcrumbs>
);

/** 客户端层：用户看到的画面。big 为该层独占画面时的放大版。 */
export const clientLayer = (p: string, big: boolean): JNode => (
  <Stack gap="sm" p={big ? 'xl' : 'sm'} maw={big ? 560 : 9999} mx="auto" w="100%">
    <Group justify="space-between">
      <Text fw={600} size={big ? 'lg' : 'sm'}>客户端</Text>
      <Badge variant="light" when={ui.clientShot}>{ui.clientShot}</Badge>
    </Group>
    <ChatMessage from="user" when={ui.sent}>帮我把桌面「报销」文件夹里的发票整理成一张汇总表</ChatMessage>
    <ToolCall id={`${p}_tc_read`} title="read_files · 端侧执行" state={ui.t_read} when={ui.readShown}>~/Desktop/报销 · 12 个文件</ToolCall>
    <ChatMessage from="assistant" when={ui.replied}>已整理 12 张发票，合计 ¥3,280。表格已生成：报销汇总.xlsx</ChatMessage>
    <Text size="sm" c="dimmed" when={ui.clientIdle}>这一步客户端没有变化。</Text>
  </Stack>
);

/** 后端层：用 Diagram 组件画的调用链。 */
export const backendLayer = (p: string, h: number): JNode => (
  <Diagram id={`${p}_arch`} direction="down" h={h}>
    <Diagram.Node id={`${p}_app`} label="客户端" kind="client" state={ui.n_app} />
    <Diagram.Node id={`${p}_local`} label="端侧执行器" kind="tool" description="手" state={ui.n_local} />
    <Diagram.Group id={`${p}_aws`} label="AWS">
      <Diagram.Node id={`${p}_biz`} label="Biz Server" kind="service" state={ui.n_biz} />
      <Diagram.Node id={`${p}_billing`} label="Billing" kind="service" state={ui.n_billing} />
      <Diagram.Node id={`${p}_brain`} label="Agent 大脑" kind="service" state={ui.n_brain} />
      <Diagram.Node id={`${p}_llm`} label="Bedrock" kind="model" state={ui.n_llm} />
    </Diagram.Group>
    <Diagram.Edge id={`${p}_e1`} from={`${p}_app`} to={`${p}_biz`} label="消息" state={ui.e1} />
    <Diagram.Edge id={`${p}_e2`} from={`${p}_biz`} to={`${p}_billing`} label="额度预检" state={ui.e2} />
    <Diagram.Edge id={`${p}_e3`} from={`${p}_biz`} to={`${p}_brain`} label="任务" state={ui.e3} />
    <Diagram.Edge id={`${p}_e4`} from={`${p}_brain`} to={`${p}_llm`} label="推理" state={ui.e4} />
    <Diagram.Edge id={`${p}_e5`} from={`${p}_biz`} to={`${p}_local`} label="下发 read_files" state={ui.e5} />
  </Diagram>
);

/** 步骤条：每一步标出它在哪些层有变化。 */
export const stepBar = (p: string): JNode => (
  <Paper withBorder radius="md" p="md">
    <Stack gap="xs">
      <Stepper id={`${p}_steps`} active={ui.stepNo}>
        <Stepper.Step label="初始" />
        <Stepper.Step label="发送消息" description="客户端 · 后端" />
        <Stepper.Step label="额度预检" description="后端" />
        <Stepper.Step label="大脑推理" description="后端" />
        <Stepper.Step label="端侧执行" description="客户端 · 后端" />
        <Stepper.Step label="回答" description="客户端 · 后端" />
      </Stepper>
      <Text fw={600}>第 {ui.stepNo} 步 · {ui.caption}</Text>
      <Text size="sm" c="dimmed">镜头：{ui.shotText}</Text>
    </Stack>
  </Paper>
);

export const authorCode = (): JNode => (
  <Stack gap={4}>
    <Text fw={600}>作者怎么写</Text>
    <Code block>{
      'option({\n' +
      '  layers: {\n' +
      "    client:  layer('客户端视角', ['client']),   // 这一层框住哪些元素\n" +
      "    backend: layer('后端流转', ['arch']),\n" +
      '  },                                          // 另有自动的“全景”层\n' +
      '  scenarios: {\n' +
      "    happy: flow('整理发票')\n" +
      "      .click('app_send', shot('msg_user'), shot('app', 'biz'))   // 一步可以给两层各定一个镜头\n" +
      "      .system('额度预检', shot('biz', 'billing'))                // 只影响后端层\n" +
      "      .system('端侧执行', shot('tc_read'), shot('local'))\n" +
      '  },\n' +
      '})'
    }</Code>
  </Stack>
);

// ---------- 状态与步骤 ----------
const N = ['n_app', 'n_local', 'n_biz', 'n_billing', 'n_brain', 'n_llm'];
const E = ['e1', 'e2', 'e3', 'e4', 'e5'];

export const viewsState = () => ({
  ...Object.fromEntries([...N, ...E].map((k) => [k, 'idle'])),
  stepNo: 0, caption: '初始状态', shotText: '各层全景',
  sent: false, readShown: false, replied: false, t_read: 'running', clientShot: '', clientIdle: false, replaying: false,
});

const S = (k: string, v: unknown) => set(ui[k]!, v as never);
const states = (v: string, ...keys: string[]) => keys.map((k) => S(k, v));

/** 第 n 步的全部效果：产品状态 + 各层镜头（原型里用 dim 和角标示意镜头）。 */
export const step = (n: number) => {
  switch (n) {
    case 1: return [S('stepNo', 1), S('caption', '客户端发出消息'), S('sent', true), S('clientShot', '镜头：用户消息'), S('clientIdle', false),
      ...states('active', 'n_app', 'n_biz', 'e1'), ...states('dim', 'n_local', 'n_billing', 'n_brain', 'n_llm'), S('shotText', '客户端层 → 用户消息；后端层 → 客户端、Biz Server')];
    case 2: return [S('stepNo', 2), S('caption', '额度预检'), S('clientIdle', true), S('clientShot', ''),
      ...states('ok', 'e1', 'n_app'), ...states('dim', 'n_app'), ...states('active', 'n_billing', 'e2'), S('shotText', '后端层 → Biz Server、Billing（客户端层不变）')];
    case 3: return [S('stepNo', 3), S('caption', '大脑推理'), ...states('ok', 'e2'), ...states('dim', 'n_billing'),
      ...states('active', 'n_brain', 'n_llm', 'e3', 'e4'), S('shotText', '后端层 → 大脑、Bedrock')];
    case 4: return [S('stepNo', 4), S('caption', '端侧执行 read_files'), S('clientIdle', false), S('readShown', true), S('clientShot', '镜头：read_files'),
      ...states('ok', 'e3', 'e4'), ...states('dim', 'n_brain', 'n_llm'), ...states('active', 'n_local', 'e5'), S('shotText', '客户端层 → read_files 卡片；后端层 → Biz Server、端侧执行器')];
    default: return [S('stepNo', 5), S('caption', '回答'), S('replied', true), S('t_read', 'done'), S('clientShot', '镜头：回答'),
      ...states('ok', 'e5', 'n_local', 'n_app', 'n_biz', 'e1'), S('shotText', '各层回到全景')];
  }
};
