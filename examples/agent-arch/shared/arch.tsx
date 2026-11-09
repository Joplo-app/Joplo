/**
 * 两个方案共用的部分：架构图（按业务域分组）、调用时序、任务状态机、客户端画面、核心块说明、步骤辅助函数。
 * v = 'a'：混合的手（端侧执行器 + 云端沙箱）；v = 'b'：所有工具都在云端沙箱。
 * D69 样板：Diagram 的每个节点都在业务域分组里（图标 + 色调），布局全部自动；方案 A 另有 Sequence（一次调用的时序）
 * 和 StateMachine（任务的生命周期），步骤里用 trace / set 联动。
 */
import { $, layer, set, type Bind, type JNode } from '@joplo-app/kit';
import { ActionIcon, Alert, Box, Button, Card, Center, ChatMessage, Group, Modal, Paper, PromptInput, SimpleGrid, Stack, Text, ToolCall } from '@joplo-app/plugin-ui'; import { Diagram, Sequence, StateMachine } from '@joplo-app/plugin-diagram';



type V = 'a' | 'b';
const ui = $.ui as unknown as Record<string, Bind>;

/** 层级，各自是独立的画面：客户端视角、后端流转（架构图）、调用时序与任务状态（方案 A）、核心块说明。 */
export const layersFor = (v: V) => ({
  client: layer('客户端视角', (
    <Center h="100%">
      <Box w={560}>
        {[client(v), ...(v === 'a' ? [approvalModal()] : [])]}
      </Box>
    </Center>
  ), { icon: 'chat' }),
  backend: layer('后端流转', arch(v), { icon: 'server' }),
  ...(v === 'a' ? {
    calls: layer('调用时序', calls(), { icon: 'flow' }),
    lifecycle: layer('任务状态', lifecycle(), { icon: 'data' }),
  } : {}),
  blocks: layer('核心块说明', blocks(v), { icon: 'doc' }),
});

export const ASK = '帮我把桌面「报销」文件夹里的发票整理成一张汇总表';

// ---------- 架构图：每个节点都在业务域分组里（D69） ----------
export const arch = (v: V): JNode => (
  <Diagram id="arch" h="100%">
    <Diagram.Group id="g_device" label="用户设备" icon="device" tone="gray">
      {[
        <Diagram.Node id="app" label="客户端界面" kind="client" description="对话、确认弹窗" />,
        ...(v === 'a' ? [<Diagram.Node id="local" when={ui.r_hands} label="端侧执行器" kind="tool" description="手：read_files、delete_files" />] : []),
      ]}
    </Diagram.Group>
    <Diagram.Group id="g_aws" when={ui.r_biz} label="AWS" icon="cloud" tone="orange">
      <Diagram.Group id="g_ctrl" when={ui.r_biz} label="控制面" icon="gateway" tone="blue">
        <Diagram.Node id="biz" when={ui.r_biz} label="Biz Server" kind="service" description="鉴权 · 会话 · 审计 · 转发" />
        <Diagram.Node id="registry" when={ui.r_registry} label="Tool Registry" kind="database" description="工具定义：名称 · schema · 危险级别" />
        <Diagram.Node id="db" when={ui.r_biz} label="DynamoDB" kind="database" description="会话与审计日志" />
      </Diagram.Group>
      <Diagram.Group id="g_brain" when={ui.r_brain} label="大脑" icon="brain" tone="purple">
        <Diagram.Node id="brain" when={ui.r_brain} label="Agent 大脑" kind="service" description="ECS：规划，只产出工具调用" />
        <Diagram.Node id="llm" when={ui.r_brain} label="Bedrock" kind="model" description="Claude 模型" />
      </Diagram.Group>
      <Diagram.Group id="g_hands" when={ui.r_hands} label="云端的手" icon="tool" tone="teal">
        {[
          <Diagram.Node id="sandbox" when={ui.r_hands} label="云端沙箱" kind="tool" description={v === 'a' ? 'Fargate：make_sheet 等云端工具' : 'Fargate：所有工具'} />,
          ...(v === 'b' ? [<Diagram.Node id="s3" when={ui.r_hands} label="S3 上传区" kind="storage" description="用户上传的本机文件" />] : []),
        ]}
      </Diagram.Group>
      <Diagram.Group id="g_bill" when={ui.r_bill} label="计费" icon="lock" tone="green">
        <Diagram.Node id="queue" when={ui.r_bill} label="SQS" kind="queue" description="用量事件" />
        <Diagram.Node id="billing" when={ui.r_bill} label="Billing" kind="service" description="额度 · 计量 · 扣费" />
      </Diagram.Group>
    </Diagram.Group>

    {/* 先写请求，再写回程：回程（⑤ 工具调用、回答）画成返回的线，布局按这个顺序决定方向 */}
    <Diagram.Edge id="e_app_biz" when={ui.r_biz} from="app" to="biz" label="消息 ⇄ 回答" />
    <Diagram.Edge id="e_biz_billing" when={ui.r_bill} from="biz" to="billing" label="① 额度预检" />
    <Diagram.Edge id="e_biz_registry" when={ui.r_registry} from="biz" to="registry" label="② 取工具定义" />
    <Diagram.Edge id="e_biz_db" when={ui.r_biz} from="biz" to="db" label="会话 · 审计" async />
    <Diagram.Edge id="e_biz_brain" when={ui.r_brain} from="biz" to="brain" label="③ 任务 + 工具定义" />
    <Diagram.Edge id="e_brain_llm" when={ui.r_brain} from="brain" to="llm" label="④ 推理" />
    <Diagram.Edge id="e_brain_biz" when={ui.r_brain} from="brain" to="biz" label="⑤ 工具调用（只发出）" />
    {[
      ...(v === 'a' ? [<Diagram.Edge id="e_biz_local" when={ui.r_hands} from="biz" to="local" label="下发端侧工具" />] : []),
      ...(v === 'b' ? [
        <Diagram.Edge id="e_app_s3" when={ui.r_hands} from="app" to="s3" label="上传本机文件" />,
        <Diagram.Edge id="e_sandbox_s3" when={ui.r_hands} from="sandbox" to="s3" label="读取" />,
      ] : []),
    ]}
    <Diagram.Edge id="e_biz_sandbox" when={ui.r_hands} from="biz" to="sandbox" label="下发云端工具" />
    <Diagram.Edge id="e_brain_queue" when={ui.r_bill} from="brain" to="queue" label="用量事件" async />
    <Diagram.Edge id="e_queue_billing" when={ui.r_bill} from="queue" to="billing" label="入账（幂等）" async />
  </Diagram>
);

// ---------- 调用时序（方案 A）：一次任务按时间先后，参与者按业务域分组 ----------
export const calls = (): JNode => (
  <Sequence id="seq" h="100%">
    <Sequence.Group id="sg_device" label="用户设备" icon="device">
      <Sequence.Actor id="q_app" label="客户端" kind="client" />
      <Sequence.Actor id="q_local" label="端侧执行器" kind="tool" />
    </Sequence.Group>
    <Sequence.Group id="sg_ctrl" label="控制面" icon="gateway">
      <Sequence.Actor id="q_biz" label="Biz Server" kind="service" />
      <Sequence.Actor id="q_registry" label="Registry" kind="database" />
    </Sequence.Group>
    <Sequence.Group id="sg_brain" label="大脑" icon="brain">
      <Sequence.Actor id="q_brain" label="Agent 大脑" kind="service" />
      <Sequence.Actor id="q_llm" label="Bedrock" kind="model" />
    </Sequence.Group>
    <Sequence.Actor id="q_sandbox" label="云端沙箱" kind="tool" />
    <Sequence.Group id="sg_bill" label="计费" icon="lock">
      <Sequence.Actor id="q_billing" label="Billing" kind="service" />
    </Sequence.Group>

    <Sequence.Message id="m_send" from="q_app" to="q_biz" label="发送任务" />
    <Sequence.Message id="m_precheck" from="q_biz" to="q_billing" label="额度预检" />
    <Sequence.Message id="m_defs" from="q_biz" to="q_registry" label="取工具定义" />
    <Sequence.Message id="m_task" from="q_biz" to="q_brain" label="任务 + 工具定义" />
    <Sequence.Message id="m_infer" from="q_brain" to="q_llm" label="推理" />
    <Sequence.Message id="m_call_read" from="q_brain" to="q_biz" label="read_files（只发出）" />
    <Sequence.Message id="m_local" from="q_biz" to="q_local" label="下发端侧工具" />
    <Sequence.Message id="m_local_ok" from="q_local" to="q_biz" label="12 个文件" reply />
    <Sequence.Message id="m_sheet" from="q_biz" to="q_sandbox" label="make_sheet" />
    <Sequence.Message id="m_sheet_ok" from="q_sandbox" to="q_biz" label="报销汇总.xlsx" reply />
    <Sequence.Message id="m_reply" from="q_biz" to="q_app" label="回答" reply />
    <Sequence.Block id="sb_async" kind="par" label="回答之后异步入账">
      <Sequence.Message id="m_usage" from="q_brain" to="q_billing" label="用量事件（经 SQS）" async />
    </Sequence.Block>
  </Sequence>
);

// ---------- 任务状态（方案 A）：value 绑定 data.task.status，步骤 set 它时对应的转换自动点亮 ----------
export const lifecycle = (): JNode => (
  <StateMachine id="task_sm" h="100%" value={$.data.task.status}>
    <StateMachine.State id="idle" label="空闲" initial />
    <StateMachine.State id="checking" label="预检与取定义" description="Biz Server" />
    <StateMachine.Group id="sm_run" label="执行中" icon="brain" tone="purple">
      <StateMachine.State id="planning" label="大脑规划" />
      <StateMachine.State id="waiting_hand" label="等待手执行" />
      <StateMachine.State id="approval" label="等待用户确认" />
    </StateMachine.Group>
    <StateMachine.State id="done" label="已完成" final />
    <StateMachine.State id="denied" label="额度不足" final />
    <StateMachine.State id="failed" label="已失败" final />

    <StateMachine.Transition from="idle" to="checking" label="发送任务" />
    <StateMachine.Transition from="checking" to="planning" label="额度够" />
    <StateMachine.Transition from="checking" to="denied" label="额度不足" />
    <StateMachine.Transition from="planning" to="waiting_hand" label="发出工具调用" />
    <StateMachine.Transition from="waiting_hand" to="planning" label="工具结果" />
    <StateMachine.Transition from="planning" to="approval" label="危险工具" />
    <StateMachine.Transition from="approval" to="planning" label="用户决定" />
    <StateMachine.Transition from="waiting_hand" to="failed" label="手超时" />
    <StateMachine.Transition from="planning" to="done" label="回答送达" />
  </StateMachine>
);

// ---------- 客户端画面 ----------
export const client = (v: V): JNode => (
  <Paper id="client_panel" withBorder radius="md" p="md">
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
  <Card id={`blk_${p.k}`} withBorder radius="md" padding="md">
    <Stack gap={6}>
      <Text fw={700}>{p.title}</Text>
      <Text size="sm">{p.does}</Text>
      <Text size="sm" c="dimmed">不做：{p.not}</Text>
    </Stack>
  </Card>
);

export const blocks = (v: V): JNode => (
  <SimpleGrid id="blocks" cols={3} spacing="md">
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

// ---------- 状态（架构图的节点和连线状态由 trace 自动推算，这里只有客户端画面和逐段出现的开关） ----------
export const initialUi = () => ({
  ask: ASK, asked: false, replied: false, reply: '',
  readShown: false, deleteShown: false, sheetShown: false, uploading: false, needUpload: false,
  t_read: 'running', t_delete: 'running', t_sheet: 'running', t_upload: 'running',
  quotaErr: false, approveOpen: false,
  r_biz: true, r_registry: true, r_brain: true, r_hands: true, r_bill: true,
});

export const show = (k: string, v: unknown = true) => set(ui[k]!, v as never);

/** 任务状态（方案 A 的状态机层）：set 之后，状态机高亮新状态，并点亮从旧状态过来的那条转换。 */
export const status = (s: 'idle' | 'checking' | 'planning' | 'waiting_hand' | 'approval' | 'done' | 'denied' | 'failed') => set($.data.task.status, s);
