import { $, done, explain, flow, option, set, shot, undecided, uses } from '@tokenroll/joplo-kit';

import { active, ASK, dim, error, focus, initialUi, layersFor, ok, show } from '../../../shared/arch.tsx';

/** 前三步（发消息 → 预检 → 取定义 → 交给大脑 → 推理）在多个场景里相同。 */
const start = (name: string, opts: Parameters<typeof flow>[1], ask = ASK) =>
  flow(name, { start: '/', ...opts })
    .type('app_prompt', ask, '用户输入任务')
    .click('app_send', '消息先到 Biz Server：鉴权、写会话', shot('msg_user'), shot('app', 'biz'), shot('blk_biz'), explain('客户端从不直接找大脑：所有请求先过 Biz Server，它负责鉴权、写会话、留审计。'),
      show('asked'), set($.inputs.app_prompt, ''), set($.ui.ask, ask), ...active('e_app_biz', 'n_app', 'n_biz', 'e_biz_db'), focus('biz'), uses('biz_gate'));

const plan = (f: ReturnType<typeof start>) =>
  f
    .system('Billing 额度预检', '调用模型之前，先向 Billing 预检额度：够用', shot('biz', 'billing'), shot('blk_billing'), explain('模型调用最贵，额度不够就在这里拦下，不产生任何费用。'), ...ok('e_app_biz', 'e_biz_db'), ...active('e_biz_billing', 'n_billing'), focus('billing'), uses('billing_precheck'))
    .system('取工具定义', '按客户端实现的版本取工具定义', shot('biz', 'registry'), shot('blk_tools'), explain('定义与实现分离：大脑永远拿不到一个没有实现的工具。'),
      ...ok('e_biz_billing', 'n_billing'), ...active('e_biz_registry', 'n_registry'), focus('tools'), uses('def_impl_split'))
    .system('任务交给大脑', '任务 + 工具定义交给大脑', shot('biz', 'brain'), shot('blk_brain'), explain('大脑拿到的是“任务 + 一组工具定义”。它不知道 read_files 在用户电脑上执行，也不需要知道。'),
      ...ok('e_biz_registry', 'n_registry'), ...active('e_biz_brain', 'n_brain'), focus('brain'))
    .system('大脑推理', '大脑调用 Bedrock 规划下一步', shot('brain', 'llm'), ...active('e_brain_llm', 'n_llm'));

export default option({
  name: 'A · 混合的手：端侧执行器 + 云端沙箱',
  idea: '读写本机文件这类工具由客户端里的端侧执行器执行，其余工具在云端沙箱执行；大脑只发出调用，由 Biz Server 按“名称@版本”路由到对应的手',
  focus: '手放在哪里：离数据最近的地方',
  tradeoffs: ['本机文件不用上传，隐私和速度都更好', '客户端掉线时端侧工具会失败，需要超时和重试策略', '端侧执行器要随客户端发版，工具定义升级后会有新旧版本并存'],

  layers: layersFor('a'),

  state: { ui: initialUi() },

  coverage: {
    schema_mismatch: undecided('旧客户端拿到新版本定义时怎么办，见待决问题 old_client'),
  },

  scenarios: {
    happy: plan(start('整理本机的报销发票', { cases: ['happy', 'local_files'], expected: '端侧读文件、云端生成表格、回答后异步入账' }))
      .system('工具调用 read_files（端侧）', '大脑只发出调用，端侧执行器去读文件', shot('brain', 'biz', 'local'), shot('tc_read'), shot('blk_client'), explain('脑手分离的关键一步：大脑只发出“调用 read_files”这条消息，真正读文件的是用户电脑上的端侧执行器。'),
        ...ok('e_brain_llm', 'n_llm', 'e_biz_brain'), ...active('e_brain_biz', 'e_biz_local', 'n_local'), show('readShown'), focus('client'), uses('brain_no_exec'))
      .system('端侧执行完成', '本机读完 12 个文件，结果回到大脑', shot('tc_read'), shot('local'),
        ...ok('e_biz_local', 'n_local'), set($.ui.t_read, 'done'))
      .system('工具调用 make_sheet（云端）', '生成表格交给云端沙箱', shot('biz', 'sandbox'), shot('tc_sheet'), shot('blk_aws'), explain('同一个大脑，另一只手：不需要本机的工具交给云端沙箱，每个任务一个隔离环境，用完即销毁。'),
        ...active('e_biz_sandbox', 'n_sandbox'), show('sheetShown'), focus('aws'))
      .system('沙箱执行完成', shot('tc_sheet'), shot('sandbox'), ...ok('e_biz_sandbox', 'n_sandbox', 'e_brain_biz'), set($.ui.t_sheet, 'done'))
      .system('返回回答', '大脑汇总结果，回答经 Biz Server 回到客户端', shot('msg_reply'), shot('app', 'biz'),
        show('replied'), set($.ui.reply, '已整理 12 张发票，合计 ¥3,280。表格已生成：报销汇总.xlsx'), ...active('e_app_biz'), focus('brain'))
      .system('用量异步入账', '用量异步入账，不拖慢回答', shot('brain', 'queue', 'billing'), shot('blk_billing'), explain('扣费不在主链路上：Billing 暂时不可用也不影响回答。'),
        ...ok('e_app_biz', 'n_app', 'n_biz', 'n_brain'), ...active('e_brain_queue', 'e_queue_billing', 'n_queue', 'n_billing'), focus('billing'), uses('usage_async'))
      .system('结束', shot(), ...ok('e_brain_queue', 'e_queue_billing', 'n_queue', 'n_billing'), done('大脑规划，两只手各自执行，用量异步入账')),

    quota: start('额度不足', { cases: ['quota'], outcome: 'denied', mock: '模拟本月额度已用完' })
      .system('Billing 额度预检失败', '额度不足：在调模型之前就拦下', shot('biz', 'billing'), shot('al_quota'),
        ...error('e_biz_billing', 'n_billing'), ...ok('e_app_biz'), ...dim('n_brain', 'n_llm', 'n_local', 'n_sandbox', 'n_registry'), show('quotaErr'), focus('billing'), uses('billing_precheck'))
      .system('结束', shot('al_quota'), done('不产生任何费用，用户看到升级提示', 'failure')),

    approval: plan(start('删除文件前要用户确认', { cases: ['approval'], outcome: 'other' }, '把「报销」文件夹里重复的发票删掉'))
      .system('工具调用 delete_files', '危险工具：先让用户确认', shot('dlg_approve'), shot('biz', 'local'), explain('危险级别写在工具定义里，而不是写在大脑的提示词里：确认由客户端强制执行，大脑绕不过去。'),
        ...ok('e_brain_llm', 'n_llm', 'e_biz_brain'), ...active('e_brain_biz', 'e_biz_local', 'n_local'), show('deleteShown'), show('approveOpen'), focus('client'), uses('approval_rule'))
      .click('ap_deny', '用户拒绝：“已拒绝”交回大脑', shot('local', 'brain', 'biz'), shot('tc_delete'),
        show('approveOpen', false), set($.ui.t_delete, 'error'), ...error('e_biz_local'), ...dim('n_local'), uses('failed_not_billed'))
      .system('大脑改计划', '大脑收到“已拒绝”后改为只标记重复项', shot('msg_reply'),
        ...ok('e_brain_biz'), show('replied'), set($.ui.reply, '好的，没有删除任何文件。重复的 3 张发票已在汇总表里标黄。'), ...active('e_app_biz'), focus('brain'))
      .system('结束', ...ok('e_app_biz'), done('危险操作由用户决定，大脑据此调整')),

    client_offline: plan(start('端侧执行时客户端掉线', { cases: ['client_offline'], outcome: 'failure', mock: '模拟客户端断网' }))
      .system('工具调用 read_files（端侧）', shot('biz', 'local'), ...ok('e_brain_llm', 'n_llm', 'e_biz_brain'), ...active('e_brain_biz', 'e_biz_local', 'n_local'), show('readShown'), focus('client'))
      .system('客户端 30 秒没有响应', '客户端没响应：“超时”交回大脑', shot('local', 'biz'), shot('tc_read'), explain('手失联时，大脑不会自己去找替代方案执行：它只收到一个“超时”结果，再决定怎么告诉用户。'),
        ...error('e_biz_local', 'n_local'), set($.ui.t_read, 'error'))
      .system('大脑告诉用户', '大脑如实告诉用户，失败不计费', shot('msg_reply'), shot('blk_billing'),
        ...ok('e_brain_biz'), show('replied'), set($.ui.reply, '没能读取你电脑上的文件：客户端离线了。请保持客户端打开后再试一次。'), focus('billing'), uses('failed_not_billed', 'brain_no_exec'))
      .system('结束', done('掉线时链路如实失败，不误扣费', 'failure')),

    tour: flow('架构导览：一块一块地看', { cases: ['happy'], start: '/', description: '从客户端开始，逐段搭出整张架构图，导演跟着聚焦',
      state: { ui: { r_biz: false, r_registry: false, r_brain: false, r_hands: false, r_bill: false } } })
      .system('客户端', '先看客户端：界面，也是端侧的手', shot('app'), shot('blk_client'), focus('client'))
      .system('Biz Server', '所有请求先过 Biz Server', show('r_biz'), shot('app', 'biz'), shot('blk_biz'), focus('biz'), uses('biz_gate'))
      .system('Tool Registry', '工具“定义”集中在 Registry', show('r_registry'), shot('biz', 'registry'), shot('blk_tools'), focus('tools'), uses('def_impl_split'))
      .system('大脑', '大脑只规划、只发出工具调用', show('r_brain'), shot('g_brain'), shot('blk_brain'), focus('brain'), uses('brain_no_exec'))
      .system('两只手', '工具“实现”分在两只手上', show('r_hands'), shot('local', 'sandbox'), shot('blk_aws'), focus('aws'))
      .system('计费', 'Billing：先预检，后异步计量', show('r_bill'), shot('g_bill', 'biz'), shot('blk_billing'), focus('billing'), uses('billing_precheck', 'usage_async'))
      .system('全景', '这就是完整的脑手分离架构', shot(), focus(''), done('看完全部核心块')),
    usage_retry: flow('用量事件投递失败', { cases: ['usage_retry'], start: '/', mock: '模拟 SQS 投递失败一次',
      state: { ui: { asked: true, replied: true, reply: '已整理 12 张发票，合计 ¥3,280。表格已生成：报销汇总.xlsx', readShown: true, sheetShown: true, t_read: 'done', t_sheet: 'done' } } })
      .system('用量事件投递失败', '回答已经给到用户；用量事件第一次写 SQS 失败', shot('brain', 'queue'), ...error('e_brain_queue'), focus('billing'))
      .system('自动重试成功', '重试成功，按幂等键只扣一次', shot('queue', 'billing'), shot('blk_billing'),
        ...ok('e_brain_queue'), ...active('e_queue_billing', 'n_billing'), uses('usage_async'))
      .system('结束', ...ok('e_queue_billing', 'n_billing'), done('失败重试不重复扣费')),
  },
});
