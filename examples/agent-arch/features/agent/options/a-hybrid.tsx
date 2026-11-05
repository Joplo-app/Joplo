import { $, done, flow, option, set, shot, undecided, uses } from '@tokenroll/joplo-kit';

import { active, approvalModal, arch, ASK, blocks, client, dim, error, focus, initialUi, layers, ok, show } from '../../../shared/arch.tsx';

/** 前三步（发消息 → 预检 → 取定义 → 交给大脑 → 推理）在多个场景里相同。 */
const start = (name: string, opts: Parameters<typeof flow>[1], ask = ASK) =>
  flow(name, { start: '/', ...opts })
    .type('app_prompt', ask)
    .click('app_send', '用户发出任务：客户端把消息交给 Biz Server，鉴权并写入会话', shot('msg_user'), shot('app', 'biz'), shot('blk_biz'),
      show('asked'), set($.inputs.app_prompt, ''), set($.ui.ask, ask), ...active('e_app_biz', 'n_app', 'n_biz', 'e_biz_db'), focus('biz'), uses('biz_gate'));

const plan = (f: ReturnType<typeof start>) =>
  f
    .system('Billing 额度预检', '调用模型之前，先向 Billing 预检额度：够用', shot('biz', 'billing'), shot('blk_billing'), ...ok('e_app_biz', 'e_biz_db'), ...active('e_biz_billing', 'n_billing'), focus('billing'), uses('billing_precheck'))
    .system('取工具定义', '客户端上报它实现了 read_files@1、delete_files@1；Biz Server 从 Registry 取这两个定义，再加上云端工具 make_sheet@2', shot('biz', 'registry'), shot('blk_tools'),
      ...ok('e_biz_billing', 'n_billing'), ...active('e_biz_registry', 'n_registry'), focus('tools'), uses('def_impl_split'))
    .system('任务交给大脑', '任务和工具定义一起交给大脑。大脑只看到“定义”，不知道工具在哪里实现', shot('biz', 'brain'), shot('blk_brain'),
      ...ok('e_biz_registry', 'n_registry'), ...active('e_biz_brain', 'n_brain'), focus('brain'))
    .system('大脑推理', '大脑调用 Bedrock 规划下一步', shot('brain', 'llm'), ...active('e_brain_llm', 'n_llm'));

export default option({
  name: 'A · 混合的手：端侧执行器 + 云端沙箱',
  idea: '读写本机文件这类工具由客户端里的端侧执行器执行，其余工具在云端沙箱执行；大脑只发出调用，由 Biz Server 按“名称@版本”路由到对应的手',
  focus: '手放在哪里：离数据最近的地方',
  tradeoffs: ['本机文件不用上传，隐私和速度都更好', '客户端掉线时端侧工具会失败，需要超时和重试策略', '端侧执行器要随客户端发版，工具定义升级后会有新旧版本并存'],

  on: {
    '/': { client: client('a'), diagram: arch('a'), blocks: blocks('a'), overlay: approvalModal() },
  },

  layers,

  state: { ui: initialUi() },

  coverage: {
    schema_mismatch: undecided('旧客户端拿到新版本定义时怎么办，见待决问题 old_client'),
  },

  scenarios: {
    happy: plan(start('整理本机的报销发票', { cases: ['happy', 'local_files'], expected: '端侧读文件、云端生成表格、回答后异步入账' }))
      .system('工具调用 read_files（端侧）', '大脑只发出 read_files(~/Desktop/报销)；Biz Server 审计后下发给用户电脑上的端侧执行器', shot('brain', 'biz', 'local'), shot('tc_read'), shot('blk_client'),
        ...ok('e_brain_llm', 'n_llm', 'e_biz_brain'), ...active('e_brain_biz', 'e_biz_local', 'n_local'), show('readShown'), focus('client'), uses('brain_no_exec'))
      .system('端侧执行完成', '端侧执行器在用户电脑上读了 12 个文件，结果经 Biz Server 回到大脑；文件不用先上传', shot('tc_read'), shot('local'),
        ...ok('e_biz_local', 'n_local'), set($.ui.t_read, 'done'))
      .system('工具调用 make_sheet（云端）', '生成表格不需要本机，Biz Server 把它下发给云端沙箱（Fargate，按任务隔离）', shot('biz', 'sandbox'), shot('tc_sheet'), shot('blk_aws'),
        ...active('e_biz_sandbox', 'n_sandbox'), show('sheetShown'), focus('aws'))
      .system('沙箱执行完成', shot('tc_sheet'), shot('sandbox'), ...ok('e_biz_sandbox', 'n_sandbox', 'e_brain_biz'), set($.ui.t_sheet, 'done'))
      .system('返回回答', '大脑汇总结果，回答经 Biz Server 回到客户端', shot('msg_reply'), shot('app', 'biz'),
        show('replied'), set($.ui.reply, '已整理 12 张发票，合计 ¥3,280。表格已生成：报销汇总.xlsx'), ...active('e_app_biz'), focus('brain'))
      .system('用量异步入账', 'token 用量和 2 次工具调用作为事件写入 SQS；Billing 按幂等键扣费，不阻塞回答', shot('brain', 'queue', 'billing'), shot('blk_billing'),
        ...ok('e_app_biz', 'n_app', 'n_biz', 'n_brain'), ...active('e_brain_queue', 'e_queue_billing', 'n_queue', 'n_billing'), focus('billing'), uses('usage_async'))
      .system('结束', shot(), ...ok('e_brain_queue', 'e_queue_billing', 'n_queue', 'n_billing'), done('大脑规划，两只手各自执行，用量异步入账')),

    quota: start('额度不足', { cases: ['quota'], outcome: 'denied', mock: '模拟本月额度已用完' })
      .system('Billing 额度预检失败', '额度不足：在调用模型之前就拦下，大脑、模型和所有手都没有被调用', shot('biz', 'billing'), shot('al_quota'),
        ...error('e_biz_billing', 'n_billing'), ...ok('e_app_biz'), ...dim('n_brain', 'n_llm', 'n_local', 'n_sandbox', 'n_registry'), show('quotaErr'), focus('billing'), uses('billing_precheck'))
      .system('结束', shot('al_quota'), done('不产生任何费用，用户看到升级提示', 'failure')),

    approval: plan(start('删除文件前要用户确认', { cases: ['approval'], outcome: 'other' }, '把「报销」文件夹里重复的发票删掉'))
      .system('工具调用 delete_files', 'delete_files 在定义里标为 dangerous：端侧执行器先在客户端弹出确认，确认前什么都不做', shot('dlg_approve'), shot('biz', 'local'),
        ...ok('e_brain_llm', 'n_llm', 'e_biz_brain'), ...active('e_brain_biz', 'e_biz_local', 'n_local'), show('deleteShown'), show('approveOpen'), focus('client'), uses('approval_rule'))
      .click('ap_deny', '用户拒绝：执行器把“已拒绝”作为工具结果交回大脑，这次调用不计费', shot('local', 'brain', 'biz'), shot('tc_delete'),
        show('approveOpen', false), set($.ui.t_delete, 'error'), ...error('e_biz_local'), ...dim('n_local'), uses('failed_not_billed'))
      .system('大脑改计划', '大脑收到“已拒绝”后改为只标记重复项', shot('msg_reply'),
        ...ok('e_brain_biz'), show('replied'), set($.ui.reply, '好的，没有删除任何文件。重复的 3 张发票已在汇总表里标黄。'), ...active('e_app_biz'), focus('brain'))
      .system('结束', ...ok('e_app_biz'), done('危险操作由用户决定，大脑据此调整')),

    client_offline: plan(start('端侧执行时客户端掉线', { cases: ['client_offline'], outcome: 'failure', mock: '模拟客户端断网' }))
      .system('工具调用 read_files（端侧）', shot('biz', 'local'), ...ok('e_brain_llm', 'n_llm', 'e_biz_brain'), ...active('e_brain_biz', 'e_biz_local', 'n_local'), show('readShown'), focus('client'))
      .system('客户端 30 秒没有响应', 'Biz Server 等端侧执行器超时，把“超时”作为工具结果交回大脑', shot('local', 'biz'), shot('tc_read'),
        ...error('e_biz_local', 'n_local'), set($.ui.t_read, 'error'))
      .system('大脑告诉用户', '大脑不会自己去读文件，只能如实告诉用户；失败的工具调用不计费，只记模型 token', shot('msg_reply'), shot('blk_billing'),
        ...ok('e_brain_biz'), show('replied'), set($.ui.reply, '没能读取你电脑上的文件：客户端离线了。请保持客户端打开后再试一次。'), focus('billing'), uses('failed_not_billed', 'brain_no_exec'))
      .system('结束', done('掉线时链路如实失败，不误扣费', 'failure')),

    tour: flow('架构导览：一块一块地看', { cases: ['happy'], start: '/', description: '从客户端开始，逐段搭出整张架构图，导演跟着聚焦',
      state: { ui: { r_biz: false, r_registry: false, r_brain: false, r_hands: false, r_bill: false } } })
      .system('客户端', '先从用户手里的客户端开始：对话界面，同时也是“端侧的手”', shot('app'), shot('blk_client'), focus('client'))
      .system('Biz Server', '所有请求先到 Biz Server：鉴权、会话、审计，再转给后面的服务', show('r_biz'), shot('app', 'biz'), shot('blk_biz'), focus('biz'), uses('biz_gate'))
      .system('Tool Registry', '工具的“定义”集中放在 Registry：名称、参数 schema、危险级别、单价', show('r_registry'), shot('biz', 'registry'), shot('blk_tools'), focus('tools'), uses('def_impl_split'))
      .system('大脑', '大脑在 ECS 上调用 Bedrock 规划，只产出工具调用，从不执行', show('r_brain'), shot('g_brain'), shot('blk_brain'), focus('brain'), uses('brain_no_exec'))
      .system('两只手', '工具的“实现”分在两处：用户电脑上的端侧执行器，AWS 里的云端沙箱', show('r_hands'), shot('local', 'sandbox'), shot('blk_aws'), focus('aws'))
      .system('计费', '调用模型前先找 Billing 预检额度；用量事件走 SQS 异步入账', show('r_bill'), shot('g_bill', 'biz'), shot('blk_billing'), focus('billing'), uses('billing_precheck', 'usage_async'))
      .system('全景', '这就是完整的脑手分离架构', shot(), focus(''), done('看完全部核心块')),
    usage_retry: flow('用量事件投递失败', { cases: ['usage_retry'], start: '/', mock: '模拟 SQS 投递失败一次',
      state: { ui: { asked: true, replied: true, reply: '已整理 12 张发票，合计 ¥3,280。表格已生成：报销汇总.xlsx', readShown: true, sheetShown: true, t_read: 'done', t_sheet: 'done' } } })
      .system('用量事件投递失败', '回答已经给到用户；用量事件第一次写 SQS 失败', shot('brain', 'queue'), ...error('e_brain_queue'), focus('billing'))
      .system('自动重试成功', '30 秒后重试成功；Billing 按幂等键 task-8f2c 去重，只扣一次', shot('queue', 'billing'), shot('blk_billing'),
        ...ok('e_brain_queue'), ...active('e_queue_billing', 'n_billing'), uses('usage_async'))
      .system('结束', ...ok('e_queue_billing', 'n_billing'), done('失败重试不重复扣费')),
  },
});
