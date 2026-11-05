import { $, done, explain, flow, missing, notApplicable, option, set, shot, undecided, uses } from '@tokenroll/joplo-kit';

import { active, ASK, dim, error, focus, initialUi, layersFor, ok, show } from '../../../shared/arch.tsx';

const start = (name: string, opts: Parameters<typeof flow>[1]) =>
  flow(name, { start: '/', ...opts })
    .type('app_prompt', ASK)
    .click('app_send', '用户发出任务：客户端把消息交给 Biz Server，鉴权并写入会话', shot('msg_user'), shot('app', 'biz'), shot('blk_biz'),
      show('asked'), set($.inputs.app_prompt, ''), ...active('e_app_biz', 'n_app', 'n_biz', 'e_biz_db'), focus('biz'), uses('biz_gate'));

export default option({
  name: 'B · 所有工具都在云端沙箱',
  idea: '客户端只是界面；所有工具都在云端沙箱执行，需要本机文件时先由用户上传到 S3',
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
      .system('Billing 额度预检', shot('biz', 'billing'), shot('blk_billing'), ...ok('e_app_biz', 'e_biz_db'), ...active('e_biz_billing', 'n_billing'), focus('billing'), uses('billing_precheck'))
      .system('取工具定义', '所有工具的实现都在云端沙箱，Biz Server 直接下发全部定义', shot('biz', 'registry'), shot('blk_tools'),
        ...ok('e_biz_billing', 'n_billing'), ...active('e_biz_registry', 'n_registry'), focus('tools'), uses('def_impl_split'))
      .system('大脑推理', '大脑发现需要本机文件，但手都在云端：只能请用户先上传', shot('brain', 'llm'), shot('blk_brain'), explain('这是“手都在云端”的代价：云端沙箱读不到用户电脑上的文件，只能让用户先把文件交出来。'),
        ...ok('e_biz_registry', 'n_registry'), ...active('e_biz_brain', 'n_brain', 'e_brain_llm', 'n_llm'), focus('brain'))
      .system('请用户上传', shot('msg_reply'), show('replied'), set($.ui.reply, '我读不到你电脑上的文件，请先上传「报销」文件夹。'), show('needUpload'), ...ok('e_brain_llm', 'n_llm', 'e_biz_brain'))
      .click('app_upload', '用户上传 12 个文件到 S3：多了一步，文件也离开了用户设备', shot('app', 's3'), shot('tc_upload'), shot('blk_client'), explain('多了一次操作，文件也离开了用户设备。对比方案 A：端侧执行器直接在本机读取，不需要这一步。'),
        show('needUpload', false), show('uploading'), ...active('e_app_s3', 'n_s3'), focus('client'))
      .system('上传完成', shot('tc_upload'), shot('s3'), ...ok('e_app_s3', 'n_s3'), set($.ui.t_upload, 'done'))
      .system('工具调用 read_files（云端）', '大脑发出 read_files，Biz Server 下发给云端沙箱，沙箱从 S3 读取', shot('biz', 'sandbox', 's3'), shot('tc_read'), shot('blk_aws'),
        ...active('e_brain_biz', 'e_biz_sandbox', 'n_sandbox', 'e_sandbox_s3'), show('readShown'), focus('aws'), uses('brain_no_exec'))
      .system('工具调用 make_sheet（云端）', shot('sandbox'), shot('tc_sheet'), ...ok('e_sandbox_s3'), set($.ui.t_read, 'done'), show('sheetShown'))
      .system('返回回答', shot('msg_reply'), shot('app', 'biz'), ...ok('e_biz_sandbox', 'n_sandbox', 'e_brain_biz'), set($.ui.t_sheet, 'done'),
        set($.ui.reply, '已整理 12 张发票，合计 ¥3,280。表格已生成：报销汇总.xlsx'), ...active('e_app_biz'), focus('brain'))
      .system('用量异步入账', shot('brain', 'queue', 'billing'), shot('blk_billing'), ...ok('e_app_biz', 'n_app', 'n_biz', 'n_brain'), ...active('e_brain_queue', 'e_queue_billing', 'n_queue', 'n_billing'), focus('billing'), uses('usage_async'))
      .system('结束', shot(), ...ok('e_brain_queue', 'e_queue_billing', 'n_queue', 'n_billing'), done('完成，但多了一次上传')),

    tour: flow('架构导览：一块一块地看', { cases: ['happy'], start: '/', description: '从客户端开始，逐段搭出整张架构图，导演跟着聚焦',
      state: { ui: { r_biz: false, r_registry: false, r_brain: false, r_hands: false, r_bill: false } } })
      .system('客户端', '这个方案里客户端只是界面：不执行任何工具', shot('app'), shot('blk_client'), focus('client'))
      .system('Biz Server', '所有请求先到 Biz Server：鉴权、会话、审计', show('r_biz'), shot('app', 'biz'), shot('blk_biz'), focus('biz'), uses('biz_gate'))
      .system('Tool Registry', '工具的“定义”集中放在 Registry', show('r_registry'), shot('biz', 'registry'), shot('blk_tools'), focus('tools'), uses('def_impl_split'))
      .system('大脑', '大脑调用 Bedrock 规划，只产出工具调用', show('r_brain'), shot('g_brain'), shot('blk_brain'), focus('brain'), uses('brain_no_exec'))
      .system('手都在云端', '所有工具都在云端沙箱执行；需要本机文件时，先上传到 S3', show('r_hands'), shot('sandbox', 's3'), shot('blk_aws'), focus('aws'))
      .system('计费', '调用模型前先找 Billing 预检额度；用量事件走 SQS 异步入账', show('r_bill'), shot('g_bill', 'biz'), shot('blk_billing'), focus('billing'), uses('billing_precheck', 'usage_async'))
      .system('全景', '这就是“手都在云端”的版本', shot(), focus(''), done('看完全部核心块')),

    quota: start('额度不足', { cases: ['quota'], outcome: 'denied', mock: '模拟本月额度已用完' })
      .system('Billing 额度预检失败', '额度不足：在调用模型之前就拦下', shot('biz', 'billing'), shot('al_quota'),
        ...error('e_biz_billing', 'n_billing'), ...ok('e_app_biz'), ...dim('n_brain', 'n_llm', 'n_sandbox', 'n_registry', 'n_s3'), show('quotaErr'), focus('billing'), uses('billing_precheck'))
      .system('结束', shot('al_quota'), done('不产生任何费用', 'failure')),
  },
});
