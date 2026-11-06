import { $, done, explain, flow, option, set, shot, trace, undecided, uses } from '@joplo-app/kit';

import { ASK, initialUi, layersFor, show, status } from '../../../shared/arch.tsx';

/** 发消息 → 预检 → 取定义 → 交给大脑 → 推理，多个场景共用。 */
const start = (name: string, opts: Parameters<typeof flow>[1], ask = ASK) =>
  flow(name, { start: '/', ...opts })
    .type('app_prompt', ask, '用户输入任务')
    .click('app_send', '消息先到 Biz Server：鉴权、写会话', shot('msg_user'), trace('app', 'biz'), trace('m_send'), shot('blk_biz'),
      show('asked'), set($.inputs.app_prompt, ''), set($.ui.ask, ask), status('checking'), uses('biz_gate'));

const plan = (f: ReturnType<typeof start>) =>
  f
    .system('Billing 额度预检', '调用模型之前，先预检额度', trace('biz', 'billing'), trace('m_precheck'), shot('blk_billing'), explain('模型调用最贵，额度不够就在这里拦下，不产生任何费用。'), uses('billing_precheck'))
    .system('取工具定义', '按客户端实现的版本取工具定义', trace('biz', 'registry'), trace('m_defs'), shot('blk_tools'), explain('定义与实现分离：大脑永远拿不到一个没有实现的工具。'), uses('def_impl_split'))
    .system('任务交给大脑', '任务 + 工具定义交给大脑', trace('biz', 'brain'), trace('m_task'), shot('blk_brain'), status('planning'))
    .system('大脑推理', '大脑调用 Bedrock 规划下一步', trace('brain', 'llm'), trace('m_infer'));

const REPLY = '已整理 12 张发票，合计 ¥3,280。表格已生成：报销汇总.xlsx';

export default option({
  name: 'A · 混合的手：端侧执行器 + 云端沙箱',
  idea: '读写本机文件这类工具由客户端里的端侧执行器执行，其余工具在云端沙箱执行；大脑只发出调用，由 Biz Server 按“名称@版本”路由到对应的手',
  focus: '手放在哪里：离数据最近的地方',
  tradeoffs: ['本机文件不用上传，隐私和速度都更好', '客户端掉线时端侧工具会失败，需要超时和重试策略', '端侧执行器要随客户端发版，工具定义升级后会有新旧版本并存'],

  layers: layersFor('a'),
  state: { ui: initialUi(), data: { task: { status: 'idle' } } },

  coverage: {
    schema_mismatch: undecided('旧客户端拿到新版本定义时怎么办，见待决问题 old_client'),
  },

  scenarios: {
    happy: plan(start('整理本机的报销发票', { cases: ['happy', 'local_files'], expected: '端侧读文件、云端生成表格、回答后异步入账' }))
      .system('工具调用 read_files（端侧）', '大脑只发出调用，端侧执行器去读文件', trace('brain', 'biz', 'local'), trace('m_call_read', 'm_local'), shot('tc_read'), shot('blk_client'),
        explain('脑手分离的关键一步：真正读文件的是用户电脑上的端侧执行器。'), show('readShown'), status('waiting_hand'), uses('brain_no_exec'))
      .system('端侧执行完成', '本机读完 12 个文件，结果回到大脑', shot('tc_read'), trace('m_local_ok'), set($.ui.t_read, 'done'), status('planning'))
      .system('工具调用 make_sheet（云端）', '生成表格交给云端沙箱', trace('biz', 'sandbox'), trace('m_sheet'), shot('tc_sheet'), shot('blk_aws'), show('sheetShown'), status('waiting_hand'))
      .system('沙箱执行完成', '表格生成完毕', shot('tc_sheet'), trace('m_sheet_ok'), set($.ui.t_sheet, 'done'), status('planning'))
      .system('返回回答', '回答经 Biz Server 回到客户端', shot('msg_reply'), trace('biz', 'app'), trace('m_reply'), show('replied'), set($.ui.reply, REPLY), status('done'))
      .system('用量异步入账', '用量异步入账，不拖慢回答', trace('brain', 'queue', 'billing'), trace('m_usage'), shot('blk_billing'),
        explain('扣费不在主链路上：Billing 暂时不可用也不影响回答。'), uses('usage_async'))
      .system('结束', shot(), done('大脑规划，两只手各自执行，用量异步入账')),

    quota: start('额度不足', { cases: ['quota'], outcome: 'denied', mock: '模拟本月额度已用完' })
      .system('Billing 额度预检失败', '额度不足：在调模型之前就拦下', trace.fail('biz', 'billing'), trace.skip('brain', 'llm', 'local', 'sandbox', 'registry'),
        shot('al_quota'), show('quotaErr'), status('denied'), uses('billing_precheck'))
      .system('结束', shot('al_quota'), done('不产生任何费用，用户看到升级提示', 'failure')),

    approval: plan(start('删除文件前要用户确认', { cases: ['approval'], outcome: 'other' }, '把「报销」文件夹里重复的发票删掉'))
      .system('工具调用 delete_files', '危险工具：先让用户确认', shot('dlg_approve'), trace('brain', 'biz', 'local'),
        explain('危险级别写在工具定义里，确认由客户端强制执行，大脑绕不过去。'), show('deleteShown'), show('approveOpen'), status('approval'), uses('approval_rule'))
      .system('任务停在等待确认', '任务停在“等待用户确认”', shot('approval'), explain('状态机：大脑规划 → 等待用户确认，用户决定之前不会执行。'))
      .click('ap_deny', '用户拒绝：“已拒绝”交回大脑', trace.fail('biz', 'local'), shot('tc_delete'),
        show('approveOpen', false), set($.ui.t_delete, 'error'), status('planning'), uses('failed_not_billed'))
      .system('大脑改计划', '大脑改为只标记重复项', shot('msg_reply'), trace('biz', 'app'),
        show('replied'), set($.ui.reply, '好的，没有删除任何文件。重复的 3 张发票已在汇总表里标黄。'), status('done'))
      .system('结束', shot('task_sm'), done('危险操作由用户决定，大脑据此调整')),

    client_offline: plan(start('端侧执行时客户端掉线', { cases: ['client_offline'], outcome: 'failure', mock: '模拟客户端断网' }))
      .system('工具调用 read_files（端侧）', '大脑发出 read_files', trace('brain', 'biz', 'local'), show('readShown'), status('waiting_hand'))
      .system('客户端 30 秒没有响应', '客户端没响应：“超时”交回大脑', trace.fail('biz', 'local'), shot('tc_read'),
        explain('手失联时，大脑不会自己去执行，只收到一个“超时”结果。'), set($.ui.t_read, 'error'), status('failed'))
      .system('大脑告诉用户', '大脑如实告诉用户，失败不计费', shot('msg_reply'), shot('blk_billing'),
        show('replied'), set($.ui.reply, '没能读取你电脑上的文件：客户端离线了。请保持客户端打开后再试一次。'), uses('failed_not_billed', 'brain_no_exec'))
      .system('结束', done('掉线时链路如实失败，不误扣费', 'failure')),

    tour: flow('架构导览：一块一块地看', { cases: ['happy'], start: '/', description: '从客户端开始，逐段搭出整张架构图，导演跟着聚焦',
      state: { ui: { r_biz: false, r_registry: false, r_brain: false, r_hands: false, r_bill: false } } })
      .system('客户端', '先看客户端：界面，也是端侧的手', shot('app'), shot('blk_client'))
      .system('Biz Server', '所有请求先过 Biz Server', show('r_biz'), shot('app', 'biz'), shot('blk_biz'), uses('biz_gate'))
      .system('Tool Registry', '工具“定义”集中在 Registry', show('r_registry'), shot('biz', 'registry'), shot('blk_tools'), uses('def_impl_split'))
      .system('大脑', '大脑只规划、只发出工具调用', show('r_brain'), shot('g_brain'), shot('blk_brain'), uses('brain_no_exec'))
      .system('两只手', '工具“实现”分在两只手上', show('r_hands'), shot('local', 'sandbox'), shot('blk_aws'))
      .system('计费', 'Billing：先预检，后异步计量', show('r_bill'), shot('g_bill', 'biz'), shot('blk_billing'), uses('billing_precheck', 'usage_async'))
      .system('全景', '这就是完整的脑手分离架构', shot(), done('看完全部核心块')),

    // 按时间看一次调用（D67 样板）：导演停在“调用时序”层，trace 消息 id，一行一行地讲；任务状态同步变化
    calls: flow('按时间看一次调用', { cases: ['happy'], start: '/', description: '同一次任务按时间先后：谁先调用谁，哪一步在等手，哪一步异步' })
      .system('发送任务', '客户端把任务发给 Biz Server', trace('m_send'), status('checking'))
      .system('预检与取定义', '先预检额度，再取工具定义', trace('m_precheck', 'm_defs'), explain('两件事都在调用模型之前完成，额度不够就不会产生费用。'))
      .system('交给大脑并推理', '任务交给大脑，大脑调用模型', trace('m_task', 'm_infer'), status('planning'))
      .system('大脑只发出调用', '大脑发出 read_files，由端侧执行', trace('m_call_read', 'm_local'), status('waiting_hand'), uses('brain_no_exec'))
      .system('结果回到大脑', '端侧读完文件，结果回到 Biz Server', trace('m_local_ok'), status('planning'))
      .system('云端生成表格', 'make_sheet 在云端沙箱执行', trace('m_sheet', 'm_sheet_ok'))
      .system('回答送达', '回答经 Biz Server 回到客户端', trace('m_reply'), status('done'))
      .system('之后异步入账', '用量事件异步入账，不拖慢回答', trace('m_usage'), shot('sb_async'), uses('usage_async'))
      .system('结束', shot(), done('一次调用：两只手，一次异步入账')),

    usage_retry: flow('用量事件投递失败', { cases: ['usage_retry'], start: '/', mock: '模拟 SQS 投递失败一次',
      state: { ui: { asked: true, replied: true, reply: REPLY, readShown: true, sheetShown: true, t_read: 'done', t_sheet: 'done' }, data: { task: { status: 'done' } } } })
      .system('用量事件投递失败', '用量事件第一次写 SQS 失败', trace.fail('brain', 'queue'))
      .system('自动重试成功', '重试成功，按幂等键只扣一次', trace('brain', 'queue', 'billing'), shot('blk_billing'), uses('usage_async'))
      .system('结束', done('失败重试不重复扣费')),
  },
});
