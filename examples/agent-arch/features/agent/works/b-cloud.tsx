import { $, done, explain, flow, missing, notApplicable, work, set, shot, undecided, uses } from '@joplo-app/kit'; import { trace } from '@joplo-app/plugin-diagram';

import { ASK, initialUi, layersFor, show } from '../../../shared/arch.tsx';

const start = (name: string, opts: Parameters<typeof flow>[1]) =>
  flow(name, { start: '/', ...opts })
    .type('app_prompt', ASK, '用户输入任务')
    .click('app_send', '消息先到 Biz Server：鉴权、写会话', shot('msg_user'), trace('app', 'biz'), shot('blk_biz'),
      show('asked'), set($.inputs.app_prompt, ''), uses('biz_gate'));

export default work({
  title: 'B · 所有工具都在云端沙箱',
  summary: '客户端只是界面；所有工具都在云端沙箱执行，需要本机文件时先由用户上传到 S3',
  focus: '手放在哪里：全部放在云端，客户端最薄',
  tradeoffs: ['客户端简单，不用随工具发版；不存在端侧掉线', '本机文件要先上传：多一步操作，文件离开用户设备', '删除、移动这类“改本机”的工具做不了'],

  layers: layersFor('b'),
  state: { ui: initialUi() },

  coverage: {
    approval: missing('删除的只是云端副本，用户本机的文件删不到；这个方案下怎么表达还没想好'),
    client_offline: notApplicable('工具不在客户端执行；掉线只影响看到回答'),
    schema_mismatch: notApplicable('实现都在云端，和定义一起发版，没有新旧客户端并存'),
    usage_retry: undecided('与方案 A 相同，未单独画'),
  },

  scenarios: {
    happy: start('整理报销发票（需要先上传）', { cases: ['happy', 'local_files'], expected: '多一步上传，其余都在云端完成' })
      .system('Billing 额度预检', '调用模型之前，先预检额度', trace('biz', 'billing'), shot('blk_billing'), uses('billing_precheck'))
      .system('取工具定义', '实现都在云端，下发全部定义', trace('biz', 'registry'), shot('blk_tools'), uses('def_impl_split'))
      .system('大脑推理', '手都在云端：只能请用户上传', trace('biz', 'brain', 'llm'), shot('blk_brain'),
        explain('云端沙箱读不到用户电脑上的文件，只能让用户先把文件交出来。'))
      .system('请用户上传', '大脑请用户先上传文件夹', shot('msg_reply'), trace('biz', 'app'), show('replied'),
        set($.ui.reply, '我读不到你电脑上的文件，请先上传「报销」文件夹。'), show('needUpload'))
      .click('app_upload', '多一步上传，文件离开了设备', shot('tc_upload'), trace('app', 's3'), shot('blk_client'),
        explain('对比方案 A：端侧执行器直接在本机读取，不需要这一步。'), show('needUpload', false), show('uploading'))
      .system('上传完成', '12 个文件已上传', shot('tc_upload'), set($.ui.t_upload, 'done'))
      .system('工具调用 read_files（云端）', '云端沙箱从 S3 读取文件', trace('brain', 'biz', 'sandbox', 's3'), shot('tc_read'), shot('blk_aws'),
        show('readShown'), uses('brain_no_exec'))
      .system('工具调用 make_sheet（云端）', '生成表格也在云端沙箱', trace('biz', 'sandbox'), shot('tc_sheet'), set($.ui.t_read, 'done'), show('sheetShown'))
      .system('返回回答', '回答经 Biz Server 回到客户端', shot('msg_reply'), trace('biz', 'app'), set($.ui.t_sheet, 'done'),
        set($.ui.reply, '已整理 12 张发票，合计 ¥3,280。表格已生成：报销汇总.xlsx'))
      .system('用量异步入账', '用量异步入账，不拖慢回答', trace('brain', 'queue', 'billing'), shot('blk_billing'), uses('usage_async'))
      .system('结束', shot(), done('完成，但多了一次上传')),

    tour: flow('架构导览：一块一块地看', { cases: ['happy'], start: '/', description: '从客户端开始，逐段搭出整张架构图，导演跟着聚焦',
      state: { ui: { r_biz: false, r_registry: false, r_brain: false, r_hands: false, r_bill: false } } })
      .system('客户端', '客户端只是界面，不执行工具', shot('app'), shot('blk_client'))
      .system('Biz Server', '所有请求先过 Biz Server', show('r_biz'), shot('app', 'biz'), shot('blk_biz'), uses('biz_gate'))
      .system('Tool Registry', '工具“定义”集中在 Registry', show('r_registry'), shot('biz', 'registry'), shot('blk_tools'), uses('def_impl_split'))
      .system('大脑', '大脑只规划、只发出工具调用', show('r_brain'), shot('g_brain'), shot('blk_brain'), uses('brain_no_exec'))
      .system('手都在云端', '手都在云端：本机文件要先上传', show('r_hands'), shot('sandbox', 's3'), shot('blk_aws'))
      .system('计费', 'Billing：先预检，后异步计量', show('r_bill'), shot('g_bill', 'biz'), shot('blk_billing'), uses('billing_precheck', 'usage_async'))
      .system('全景', '这就是“手都在云端”的版本', shot(), done('看完全部核心块')),

    quota: start('额度不足', { cases: ['quota'], outcome: 'denied', mock: '模拟本月额度已用完' })
      .system('Billing 额度预检失败', '额度不足：在调模型之前就拦下', trace.fail('biz', 'billing'), trace.skip('brain', 'llm', 'sandbox', 'registry', 's3'),
        shot('al_quota'), show('quotaErr'), uses('billing_precheck'))
      .system('结束', shot('al_quota'), done('不产生任何费用', 'failure')),
  },
});
