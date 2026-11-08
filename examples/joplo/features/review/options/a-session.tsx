import { withDesignRecord } from '../../../shared/design/record.ts';
import { designRecords } from '../../../shared/design/records.ts';
import { $, done, explain, flow, highlight, option, set, shot, uses } from '@joplo-app/kit';
import { initialUi, layers } from '../../../shared/review/review.tsx';

const firstText = '已完成的任务默认折叠，给待开始留更多空间。';
const secondText = '日程里标出今天，并支持只看本周。';
const event = (seq: number, page: string, text: string) => JSON.stringify({ session: 'rv_8k2', seq, type: 'feedback', page, scenario: page === '/projects' ? 'progress' : 'week', step: page === '/projects' ? 3 : 1, text }, null, 2);
const approved = (seq: number) => JSON.stringify({ session: 'rv_8k2', seq, type: 'approved', feature: 'workbench', option: 'a-board', revision: 'r1' }, null, 2);
const firstEvent = event(1, '/projects', firstText);
const secondEvent = event(2, '/schedule', secondText);
const open = () => [set($.ui.panel, true), shot('review_screen')];
const save = (text: string, count: number) => [set($.ui.sent, true), set($.ui.lastFeedback, text), set($.ui.count, count), set($.inputs.feedback_text, ''), set($.ui.sending, false), set($.ui.sendingLabel, '提交反馈')];
const base = { ...initialUi(), sendingLabel: '提交反馈', lastFeedback: '', pageLabel: '03 / 进度自动更新' };

export default withDesignRecord(option({
  name: 'A · 页面反馈 + 独立评审会话',
  idea: '右侧浮层承载反馈与结束评审，不挤压演示页面；Agent 按会话监听，确认只关闭当前方案版本的监听',
  focus: '用户的反馈与确认，怎样准确交给正在等待的 Agent',
  tradeoffs: ['反馈保留页面、场景和步骤', '会话身份独立于端口，避免多实例串线', '每轮确认绑定版本，改方案后需开启新一轮'],
  layers: layers(),
  state: { ui: base, inputs: { feedback_text: '' } },
  scenarios: {
    happy: flow('反馈一条，再确认方案', { cases: ['feedback'], start: '/review', description: '你在看方案，Agent 在后台等你的决定', expected: '反馈立即输出；确认后只退出监听命令' })
      .click('open_feedback', '点右侧图标，给当前页面反馈', ...open(), uses('right_feedback'))
      .type('feedback_text', firstText, '写下这页需要调整的地方')
      .click('send_feedback', '提交反馈', set($.ui.sending, true), set($.ui.sendingLabel, '正在保存…'))
      .system('本地已保存反馈', ...save(firstText, 1), highlight('feedback_panel'))
      .system('Agent 立即收到一条事件', set($.ui.feedback1, firstEvent), shot('agent_screen'), highlight('event1'), uses('stream_exit'))
      .system('回到评审浮层，页面宽度不变', shot('review_screen'))
      .click('approve_panel', '在浮层内直接结束评审', set($.ui.approved, true), set($.ui.panel, false), highlight('approved_status'), explain('反馈记录保留；确认并不表示反馈已实现。'), uses('approval'))
      .system('Agent 收到方案确认', set($.ui.approvalEvent, approved(2)), shot('agent_screen'), highlight('approval_event'))
      .system('监听退出，Agent 可以继续', set($.ui.exited, true), highlight('exit_result'), done('反馈已送达，方案已确认；监听 exit 0')),

    direct_confirm: flow('没有修改意见，直接确认', { cases: ['direct_confirm'], start: '/review', description: '方案看完了，从反馈图标直接结束评审', expected: '不要求填写反馈；确认后关闭浮层，Agent 收到 approved 并退出' })
      .click('open_feedback', '点击反馈图标，打开浮层', ...open(), uses('right_feedback'))
      .click('approve_panel', '没有修改意见，直接确认方案', set($.ui.approved, true), set($.ui.panel, false), highlight('approved_status'))
      .system('Agent 收到本轮方案确认', set($.ui.approvalEvent, approved(1)), shot('agent_screen'), highlight('approval_event'))
      .system('监听正常退出', set($.ui.exited, true), highlight('exit_result'), done('从反馈图标完成评审，无需先写反馈')),

    pages: flow('切了页面，草稿仍指向原位置', { cases: ['pages'], start: '/review', description: '看板写到一半切去日程，反馈不串页', expected: '终端收到两条反馈，分别对应 /projects 和 /schedule' })
      .click('open_feedback', '先给项目看板写反馈', ...open())
      .type('feedback_text', firstText, '写到一半，保留草稿')
      .click('page_schedule', '切到日程，草稿仍属于看板', set($.ui.page, 'schedule'), set($.ui.pageLabel, '01 / 本周日程'), highlight('feedback_context'), uses('context'))
      .click('send_feedback', '提交看板的这条反馈', ...save(firstText, 1), set($.ui.feedback1, firstEvent))
      .click('close_feedback', '收起这条反馈', set($.ui.panel, false))
      .click('open_feedback', '重新打开，位置更新为日程', ...open(), set($.ui.context, '本周日程 · /schedule · 查看本周 · 第 1 步'))
      .type('feedback_text', secondText, '再给日程提一个建议')
      .click('send_feedback', '提交日程反馈', ...save(secondText, 2))
      .click('page_projects', '回到看板，已提交的反馈仍保留', set($.ui.page, 'projects'), set($.ui.pageLabel, '03 / 进度自动更新'))
      .system('两页反馈按顺序进入终端', set($.ui.feedback2, secondEvent), shot('agent_screen'), highlight('event2'), done('两条反馈各自保留页面、场景和步骤；监听仍运行')),

    isolation: flow('两个实例，确认 B 不影响 A', { cases: ['isolation'], start: '/review', description: '多实例时按会话精确监听', expected: 'B 的监听退出，A 仍等待自己的评审' })
      .system('检测到多个会话，不猜目标', set($.ui.ambiguous, true), shot('instances_screen'), highlight('ambiguous_error'), uses('session'))
      .type('bind_command', 'joplo review watch --session rv_8k2 --json', '为 Agent A 指定会话')
      .press('Enter', '只连接我的新产品', set($.ui.bound, true), set($.inputs.bind_command, ''), highlight('terminal_a'))
      .click('b_feedback', '另一边，用户给 B 提交反馈', set($.ui.bFeedback, true), highlight('terminal_b'))
      .click('b_approve', '用户确认 B，只有 B 的监听退出', set($.ui.bApproved, true), highlight('terminal_b'))
      .system('A 仍然等自己的反馈', highlight('terminal_a'), done('不同实例、项目和方案之间不串线')),

    reconnect: flow('断线期间确认，重连后补收', { cases: ['reconnect'], start: '/review', description: 'Agent 暂时断线，评审结果仍可补收', state: { ui: { ...base, feedback1: firstEvent, sent: true, count: 1, lastFeedback: firstText, page: 'schedule', pageLabel: '01 / 本周日程', context: '本周日程 · /schedule · 查看本周 · 第 1 步' } }, expected: '从 seq=1 之后补收反馈与确认，然后 exit 0' })
      .system('Agent 的监听连接中断', set($.ui.disconnected, true), shot('agent_screen'), highlight('offline_log'))
      .click('open_feedback', '用户仍可在本地写反馈', ...open())
      .type('feedback_text', secondText, '给日程提交第二条建议')
      .click('send_feedback', '保存在本地，等待 Agent 重连', ...save(secondText, 2), set($.ui.receipt, '已保存 · 等待 Agent 重连'), uses('durability'))
      .click('close_feedback', '收起反馈面板', set($.ui.panel, false))
      .click('approve', '确认也保存在当前会话', set($.ui.approved, true), highlight('approved_status'))
      .system('Agent 从上次游标恢复', set($.ui.disconnected, false), set($.ui.replayed, true), shot('agent_screen'), explain('恢复同一会话，不读取其他实例或项目的记录。'))
      .system('补收第二条反馈，再收到确认', set($.ui.feedback2, secondEvent), set($.ui.approvalEvent, approved(3)), highlight('approval_event'))
      .system('确认已收到，正常结束监听', set($.ui.exited, true), highlight('exit_result'), done('断线没有丢反馈；补收确认后 exit 0')),
  },
}), designRecords.review);
