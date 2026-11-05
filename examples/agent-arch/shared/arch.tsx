/**
 * 两个方案共用的部分：架构图、客户端画面、核心块说明、步骤辅助函数。
 * v = 'a'：混合的手（端侧执行器 + 云端沙箱）；v = 'b'：所有工具都在云端沙箱。
 */
import { $, eq, set, type Bind, type JNode } from '@tokenroll/joplo-kit';
import {
  ActionIcon, Alert, Badge, Button, Card, ChatMessage, Diagram, Group, Modal, Paper, PromptInput, SimpleGrid, Stack, Text, ToolCall,
} from '@tokenroll/joplo-kit/ui';

type V = 'a' | 'b';
const ui = $.ui as unknown as Record<string, Bind>;

export const ASK = '帮我把桌面「报销」文件夹里的发票整理成一张汇总表';

// ---------- 架构图 ----------
export const arch = (v: V): JNode => (
  <Diagram id="arch" direction="right" h={640}>
    <Diagram.Group id="g_device" label="用户设备">
      {[
        <Diagram.Node id="app" label="客户端界面" kind="client" description="对话、确认弹窗" state={ui.n_app} />,
        ...(v === 'a' ? [<Diagram.Node id="local" label="端侧执行器" kind="tool" description="手：read_files、delete_files" state={ui.n_local} />] : []),
      ]}
    </Diagram.Group>
    <Diagram.Group id="g_aws" label="AWS">
      <Diagram.Group id="g_ctrl" label="控制面">
        <Diagram.Node id="biz" label="Biz Server" kind="service" description="鉴权 · 会话 · 审计 · 转发" state={ui.n_biz} />
        <Diagram.Node id="registry" label="Tool Registry" kind="database" description="工具定义：名称 · schema · 危险级别 · 单价" state={ui.n_registry} />
        <Diagram.Node id="db" label="DynamoDB" kind="database" description="会话与审计日志" state={ui.n_db} />
      </Diagram.Group>
      <Diagram.Group id="g_brain" label="大脑">
        <Diagram.Node id="brain" label="Agent 大脑" kind="service" description="ECS：规划，只产出工具调用" state={ui.n_brain} />
        <Diagram.Node id="llm" label="Bedrock" kind="model" description="Claude 模型" state={ui.n_llm} />
      </Diagram.Group>
      <Diagram.Group id="g_hands" label="云端的手">
        {[
          <Diagram.Node id="sandbox" label="云端沙箱" kind="tool" description={v === 'a' ? 'Fargate：make_sheet 等云端工具' : 'Fargate：所有工具'} state={ui.n_sandbox} />,
          ...(v === 'b' ? [<Diagram.Node id="s3" label="S3 上传区" kind="storage" description="用户上传的本机文件" state={ui.n_s3} />] : []),
        ]}
      </Diagram.Group>
      <Diagram.Group id="g_bill" label="计费">
        <Diagram.Node id="queue" label="SQS" kind="queue" description="用量事件" state={ui.n_queue} />
        <Diagram.Node id="billing" label="Billing" kind="service" description="额度 · 计量 · 扣费" state={ui.n_billing} />
      </Diagram.Group>
    </Diagram.Group>

    <Diagram.Edge id="e_app_biz" from="app" to="biz" label="消息 ⇄ 回答" state={ui.e_app_biz} />
    <Diagram.Edge id="e_biz_billing" from="biz" to="billing" label="① 额度预检" state={ui.e_biz_billing} />
    <Diagram.Edge id="e_biz_registry" from="biz" to="registry" label="② 取工具定义" state={ui.e_biz_registry} />
    <Diagram.Edge id="e_biz_db" from="biz" to="db" label="会话 · 审计" async state={ui.e_biz_db} />
    <Diagram.Edge id="e_biz_brain" from="biz" to="brain" label="③ 任务 + 工具定义" state={ui.e_biz_brain} />
    <Diagram.Edge id="e_brain_llm" from="brain" to="llm" label="④ 推理" state={ui.e_brain_llm} />
    <Diagram.Edge id="e_brain_biz" from="brain" to="biz" label="⑤ 工具调用（只发出）" state={ui.e_brain_biz} />
    {[
      ...(v === 'a' ? [<Diagram.Edge id="e_biz_local" from="biz" to="local" label="下发端侧工具" state={ui.e_biz_local} />] : []),
      ...(v === 'b' ? [
        <Diagram.Edge id="e_app_s3" from="app" to="s3" label="上传本机文件" state={ui.e_app_s3} />,
        <Diagram.Edge id="e_sandbox_s3" from="sandbox" to="s3" label="读取" state={ui.e_sandbox_s3} />,
      ] : []),
    ]}
    <Diagram.Edge id="e_biz_sandbox" from="biz" to="sandbox" label="下发云端工具" state={ui.e_biz_sandbox} />
    <Diagram.Edge id="e_brain_queue" from="brain" to="queue" label="用量事件" async state={ui.e_brain_queue} />
    <Diagram.Edge id="e_queue_billing" from="queue" to="billing" label="入账（幂等）" async state={ui.e_queue_billing} />
  </Diagram>
);

// ---------- 客户端画面 ----------
export const client = (v: V): JNode => (
  <Paper withBorder radius="md" p="md">
    <Stack gap="sm">
      <Text fw={600}>客户端</Text>
      <ChatMessage id="msg_user" from="user" when={ui.asked}>{ui.ask}</ChatMessage>
      {[
        ...(v === 'b' ? [
          <Button id="app_upload" variant="default" when={ui.needUpload}>上传「报销」文件夹</Button>,
          <ToolCall id="tc_upload" title="上传 ~/Desktop/报销（12 个文件）" state={ui.t_upload} when={ui.uploading} />,
        ] : []),
      ]}
      <ToolCall id="tc_read" title={v === 'a' ? 'read_files · 端侧执行' : 'read_files · 云端沙箱'} state={ui.t_read} when={ui.readShown}>~/Desktop/报销 · 12 个文件</ToolCall>
      <ToolCall id="tc_delete" title="delete_files · 需要确认" state={ui.t_delete} when={ui.deleteShown}>3 个重复文件</ToolCall>
      <ToolCall id="tc_sheet" title="make_sheet · 云端沙箱" state={ui.t_sheet} when={ui.sheetShown}>生成 报销汇总.xlsx</ToolCall>
      <ChatMessage id="msg_reply" from="assistant" when={ui.replied}>{ui.reply}</ChatMessage>
      <Alert id="al_quota" color="red" title="本月额度已用完" when={ui.quotaErr}>
        升级套餐，或等下月重置。这次没有调用模型，也没有产生费用。
      </Alert>
      <Group gap="xs" wrap="nowrap" align="flex-end">
        <PromptInput id="app_prompt" placeholder="让 Agent 做点什么…" />
        <ActionIcon id="app_send" aria-label="发送">↑</ActionIcon>
      </Group>
    </Stack>
  </Paper>
);

export const approvalModal = (): JNode => (
  <Modal id="dlg_approve" opened={ui.approveOpen} title="Agent 想删除 3 个重复文件">
    <Stack gap="md">
      <Text size="sm">delete_files 在工具定义里标为 dangerous，执行前必须由你确认。</Text>
      <Group justify="flex-end">
        <Button id="ap_deny" variant="default">拒绝</Button>
        <Button id="ap_allow" color="red" unmodeled note="允许后照常执行；本版只演示拒绝">允许删除</Button>
      </Group>
    </Stack>
  </Modal>
);

// ---------- 核心块说明 ----------
const Block = (p: { k: string; title: string; does: string; not: string }) => (
  <Card withBorder radius="md" padding="md">
    <Stack gap={6}>
      <Group justify="space-between">
        <Text fw={700}>{p.title}</Text>
        <Badge color="blue" when={eq(ui.focus, p.k)}>此刻</Badge>
      </Group>
      <Text size="sm">{p.does}</Text>
      <Text size="sm" c="dimmed">不做：{p.not}</Text>
    </Stack>
  </Card>
);

export const blocks = (v: V): JNode => (
  <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
    <Block k="client" title={v === 'a' ? '客户端（端侧的手）' : '客户端（只是界面）'}
      does={v === 'a' ? '对话界面；在用户电脑上执行本机工具（读写本地文件）；危险操作先弹窗确认。' : '对话界面；需要本机文件时先上传到 S3；危险操作弹窗确认。'}
      not="不推理，不保存任何密钥。" />
    <Block k="brain" title="Agent 大脑（ECS + Bedrock）" does="接任务、调用模型规划、产出工具调用、汇总结果。只认识工具“定义”，不关心工具在哪里实现。" not="不执行任何工具，不直接面对客户端。" />
    <Block k="tools" title="工具定义 ≠ 工具实现" does="定义集中在 Tool Registry：名称、参数 schema、危险级别、单价，带版本。实现分布在端侧执行器、云端沙箱、第三方 API，各自声明实现了哪些“名称@版本”。" not="换实现不用改大脑；新增工具先加定义。" />
    <Block k="biz" title="Biz Server" does="鉴权、会话、审计；按客户端实际实现的版本下发工具定义；转发工具调用和结果。" not="不推理，不执行工具。" />
    <Block k="billing" title="Billing" does="调用模型前预检额度；从 SQS 消费用量事件，按幂等键扣费。" not="不在主链路上同步扣费，不拖慢回答。" />
    <Block k="aws" title="AWS 部署" does="Biz Server 和大脑跑在 ECS；模型用 Bedrock；云端沙箱用 Fargate 按任务隔离；会话在 DynamoDB；用量走 SQS。" not="大脑和沙箱不共享进程与权限。" />
  </SimpleGrid>
);

// ---------- 状态 ----------
const NODES = ['n_app', 'n_local', 'n_biz', 'n_registry', 'n_db', 'n_brain', 'n_llm', 'n_sandbox', 'n_s3', 'n_queue', 'n_billing'];
const EDGES = ['e_app_biz', 'e_biz_billing', 'e_biz_registry', 'e_biz_db', 'e_biz_brain', 'e_brain_llm', 'e_brain_biz', 'e_biz_local', 'e_app_s3', 'e_sandbox_s3', 'e_biz_sandbox', 'e_brain_queue', 'e_queue_billing'];

export const initialUi = () => ({
  ...Object.fromEntries([...NODES, ...EDGES].map((k) => [k, 'idle'])),
  ask: ASK, asked: false, replied: false, reply: '', focus: '',
  readShown: false, deleteShown: false, sheetShown: false, uploading: false, needUpload: false,
  t_read: 'running', t_delete: 'running', t_sheet: 'running', t_upload: 'running',
  quotaErr: false, approveOpen: false,
});

const to = (state: string) => (...keys: string[]) => keys.map((k) => set(ui[k]!, state));
export const active = to('active');
export const ok = to('ok');
export const error = to('error');
export const dim = to('dim');
export const focus = (k: string) => set(ui.focus!, k);
export const show = (k: string, v: unknown = true) => set(ui[k]!, v as never);
