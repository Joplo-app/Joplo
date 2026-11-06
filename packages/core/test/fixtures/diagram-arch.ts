/** 图表布局测试共用的结构（D69）：examples/agent-arch 的架构图、hushed-demos 截图里的“执行回路”（按业务域分组后）。 */
import type { SceneNode } from '../../src/index.ts';

export const N = (id: string, label: string, extra: Record<string, unknown> = {}): SceneNode => ({ id, type: 'Diagram.Node', props: { label, ...extra } });
export const E = (from: string, to: string, extra: Record<string, unknown> = {}): SceneNode => ({ id: (extra.id as string) ?? `${from}->${to}`, type: 'Diagram.Edge', props: { from, to, ...extra } });
export const G = (id: string, label: string, children: SceneNode[], extra: Record<string, unknown> = {}): SceneNode => ({ id, type: 'Diagram.Group', props: { label, ...extra }, children });

/** 与 examples/agent-arch/shared/arch.tsx 相同的结构（v = a：混合的手；v = b：全云端）。 */
export function agentArch(v: 'a' | 'b', direction: 'right' | 'down' | 'auto', props: Record<string, unknown> = {}): SceneNode {
  const n = (id: string, label: string, kind: string, description: string) => N(id, label, { kind, description, state: `$ui.n_${id}` });
  return {
    id: 'arch',
    type: 'Diagram',
    props: { ...(direction === 'auto' ? {} : { direction }), h: 640, ...props },
    children: [
      G('g_device', '用户设备', [n('app', '客户端界面', 'client', '对话、确认弹窗'), ...(v === 'a' ? [n('local', '端侧执行器', 'tool', '手：read_files、delete_files')] : [])], { icon: 'device' }),
      G('g_aws', 'AWS', [
        G('g_ctrl', '控制面', [n('biz', 'Biz Server', 'service', '鉴权 · 会话 · 审计 · 转发'), n('registry', 'Tool Registry', 'database', '工具定义：名称 · schema · 危险级别 · 单价'), n('db', 'DynamoDB', 'database', '会话与审计日志')]),
        G('g_brain', '大脑', [n('brain', 'Agent 大脑', 'service', 'ECS：规划，只产出工具调用'), n('llm', 'Bedrock', 'model', 'Claude 模型')]),
        G('g_hands', '云端的手', [n('sandbox', '云端沙箱', 'tool', v === 'a' ? 'Fargate：make_sheet 等云端工具' : 'Fargate：所有工具'), ...(v === 'b' ? [n('s3', 'S3 上传区', 'storage', '用户上传的本机文件')] : [])]),
        G('g_bill', '计费', [n('queue', 'SQS', 'queue', '用量事件'), n('billing', 'Billing', 'service', '额度 · 计量 · 扣费')]),
      ], { icon: 'cloud' }),
      E('app', 'biz', { id: 'e_app_biz', label: '消息 ⇄ 回答' }),
      E('biz', 'billing', { id: 'e_biz_billing', label: '① 额度预检' }),
      E('biz', 'registry', { id: 'e_biz_registry', label: '② 取工具定义' }),
      E('biz', 'db', { id: 'e_biz_db', label: '会话 · 审计', async: true }),
      E('biz', 'brain', { id: 'e_biz_brain', label: '③ 任务 + 工具定义' }),
      E('brain', 'llm', { id: 'e_brain_llm', label: '④ 推理' }),
      E('brain', 'biz', { id: 'e_brain_biz', label: '⑤ 工具调用（只发出）' }),
      ...(v === 'a'
        ? [E('biz', 'local', { id: 'e_biz_local', label: '下发端侧工具' })]
        : [E('app', 's3', { id: 'e_app_s3', label: '上传本机文件' }), E('sandbox', 's3', { id: 'e_sandbox_s3', label: '读取' })]),
      E('biz', 'sandbox', { id: 'e_biz_sandbox', label: '下发云端工具' }),
      E('brain', 'queue', { id: 'e_brain_queue', label: '用量事件', async: true }),
      E('queue', 'billing', { id: 'e_queue_billing', label: '入账（幂等）', async: true }),
    ],
  };
}


/** 用户截图里的“执行回路”，按业务域分成网关 / 运行时 / 存储与结算三组。 */
export const loopDiagram = (props: Record<string, unknown> = {}): SceneNode => ({
  id: 'loop',
  type: 'Diagram',
  props,
  children: [
    G('gw', '网关', [N('host', 'SessionHost', { description: '输入与审批' }), N('prepare', 'Go Host', { description: '本轮准入' })], { icon: 'gateway' }),
    G('rt', '运行时', [N('context', 'Context', { description: '独立 Agent 视图', kind: 'storage' }), N('kernel', 'Kernel', { description: '模型与工具循环' }), N('llm', 'Model', { kind: 'model', description: '流式生成' }), N('tools', 'Tools', { kind: 'tool', description: 'Go 业务能力' })], { icon: 'service' }),
    G('st', '存储与结算', [N('store', 'SQLite', { kind: 'database', description: '先提交会话' }), N('settle', 'Go Settle', { description: '幂等结算' })], { icon: 'database' }),
    E('host', 'prepare'), E('prepare', 'context'), E('context', 'kernel'), E('kernel', 'llm'), E('kernel', 'tools'), E('kernel', 'store'), E('store', 'settle'),
  ],
});
