import { $, done, flow, fork, mark, option, set, shot, stream, toast, undecided, uses } from '@joplo-app/kit';

import { ASK, PLAN, PLAN_V2, initialUi, initialTrip, sharedTrip, layers, sharedUi } from '../../../shared/camp.tsx';

export default option({
  name: 'A · 对话 + 侧边行程单',
  idea: '左边和营地助手对话，右边实时生成行程单；分享出去的是行程单的链接，朋友在手机上直接看和回复',
  focus: '行程单是独立的产物：可以分享、可以升级版本',
  tradeoffs: ['朋友不用装 App，门槛最低', '行程单和对话分开，改行程不会把对话刷乱', '朋友只能回复“能去 / 去不了”，想讨论细节还得回到别的聊天工具'],

  layers: layers(),
  state: { ui: initialUi(), data: { trip: initialTrip() } },

  coverage: {
    full: undecided('营地订满时换营地还是换日期，取决于营地由谁来订（见待决问题 who_books）'),
  },

  scenarios: {
    happy: flow('一起规划周末露营', { cases: ['happy'], start: '/', expected: '小雨拿到行程单并分享；阿杰确认后，小雨的对话里收到回复' })
      .card('周末一起去露营', { sub: '小雨想拉上阿杰去郊外露营，交给营地助手来安排' })
      .type('prompt', ASK, '小雨把想法告诉营地助手')
      .press('Enter', '发出去，助手开始思考', set($.ui.asked, true), set($.inputs.prompt, ''), set($.ui.thinking, true), set($.ui.thought, '查看周六的天气'), shot('msg_reply'))
      .system('思考', '助手在比较三个营地', set($.ui.thought, '比较三个营地的距离和价格'), stream($.ui.thinkLog, PLAN.thinkLog), shot('thinking'))
      .system('回复', '先给结论：推荐白河营地', set($.ui.thinking, false), set($.ui.thought, '选定白河营地'), stream($.ui.reply, PLAN.reply), shot('msg_reply'), uses('answer_first'))
      .system('生成行程单', '右边的行程单一段段生成', set($.ui.planShown, true), stream($.ui.planTitle, PLAN.title), stream($.ui.planD1, PLAN.d1), stream($.ui.planD2, PLAN.d2), shot('plan'))
      .system('行程单完成', '算好预算，行程单生成完毕', stream($.ui.planBudget, PLAN.budget), set($.ui.planStatus, 'ready'), set($.data.trip.camp, '白河营地'), set($.data.trip.budget, 460), shot('plan', 'share'), mark('share', { kind: 'arrow', note: '生成完才能分享' }))
      .click('share', '小雨把行程单分享给阿杰', set($.ui.shared, true), set($.data.trip.status, 'shared'), toast.success('已把行程链接发给阿杰'), shot('trip_states', 'trip_data'), uses('share_link'))
      .card('现在是阿杰', { role: 'ajie', sub: '他没装营地助手，只收到一条消息' })
      .click('open_trip', '阿杰点开小雨发来的行程', set($.ui.ajieOpened, true))
      .click('can_go', '阿杰回复：我能去', set($.ui.ajieReply, 'yes'), fork('如果阿杰去不了', 'cant_go'))
      .card('回到小雨', { role: 'xiaoyu' })
      .system('收到回复', '阿杰的回复回到小雨的对话里', set($.ui.confirmed, true), stream($.ui.confirmText, '阿杰回复：我能去！营地周六还有位置，要我现在帮你们订吗？'), shot('msg_confirm'), uses('reply_back'))
      .system('行程已确认', '阿杰的回复同步到行程数据', set($.data.trip.status, 'confirmed'), set($.data.trip.reply, '我能去'), shot('trip_states', 'trip_data'))
      .card('这个方案确认了', { points: ['助手先给结论，详细安排放在右边的行程单', '行程以链接分享，朋友不用装 App', '朋友的回复回到小雨的对话里'] }, done('两个人的露营安排好了')),

    rain: flow('出发前一天下雨了', { cases: ['rain'], start: '/', state: { ui: sharedUi(), data: { trip: { ...sharedTrip(), status: 'confirmed', reply: '我能去' } } }, expected: '助手主动提醒并更新行程单为 v2；阿杰打开链接看到的是最新版' })
      .card('出发前一天', { sub: '周五晚上 8 点，行程已经发给阿杰' })
      .system('检查天气', '助手检查天气：周六有雷阵雨', set($.ui.rainShown, true), set($.ui.thinking2, true), set($.ui.thought2, '周六下午有雷阵雨'), stream($.ui.thinkLog2, PLAN_V2.thinkLog), shot('msg_rain'), uses('weather_check'))
      .system('主动提醒', '助手主动提醒，建议改到周日', set($.ui.thinking2, false), set($.ui.thought2, '改到周日一日游'), stream($.ui.reply2, PLAN_V2.reply), shot('msg_rain'))
      .system('行程单 v2', '行程单更新为 v2', set($.ui.planVersion, 'v2'), set($.ui.planStatus, 'generating'), stream($.ui.planTitle, PLAN_V2.title), stream($.ui.planD1, PLAN_V2.d1), stream($.ui.planD2, PLAN_V2.d2), stream($.ui.planBudget, PLAN_V2.budget),
        set($.ui.notifText, '行程有更新：改到周日一日游（v2）'), shot('plan'), mark('plan', { kind: 'box', note: '行程已更新为 v2' }), uses('versioned'))
      .system('行程数据更新', '日期和预算跟着行程更新', set($.data.trip.status, 'rescheduled'), set($.data.trip.date, '周日一日游'), set($.data.trip.budget, 280), shot('trip_states', 'trip_data'))
      .card('现在是阿杰', { role: 'ajie', sub: '他收到一条行程更新' }, set($.ui.planStatus, 'ready'))
      .system('收到邮件', '阿杰收到行程更新邮件', shot('update_email'))
      .click('email_open', '阿杰打开邮件里的链接，看到 v2', set($.ui.ajieOpened, true), shot('trip'), mark('trip_version', { note: '最新版 v2' }))
      .click('can_go', '阿杰回复：周日也行', set($.ui.ajieReply, 'yes'), set($.data.trip.reply, '周日也行'))
      .card('这个方案确认了', { points: ['出发前 24 小时检查天气，变了主动提醒', '行程每次调整都升一个版本', '朋友打开链接，看到的总是最新版'] }, done('下雨之前改好了行程，两个人都知道')),

    cant_go: flow('阿杰去不了', { cases: ['cant_go'], start: '/', outcome: 'other', mock: '模拟朋友这周没空', state: { ui: { ...sharedUi(), confirmed: false, confirmText: '' }, data: { trip: sharedTrip() } } })
      .card('阿杰这周末要加班', { role: 'ajie', sub: '小雨的行程已经发到他手机上' })
      .click('open_trip', '阿杰打开小雨发来的行程', set($.ui.ajieOpened, true))
      .click('cant_go', '阿杰回复：这次去不了', set($.ui.ajieReply, 'no'), set($.data.trip.reply, '这次去不了'), uses('share_link'))
      .card('回到小雨', { role: 'xiaoyu' })
      .system('收到回复', '助手马上告诉小雨，并建议改期', set($.ui.confirmed, true), stream($.ui.confirmText, '阿杰回复：这周去不了。要不要改到下周六？我先帮你看看下周的天气。'), shot('msg_confirm'), uses('reply_back'),
        done('小雨马上知道了，助手给出改期建议', 'cancelled')),
  },
});
