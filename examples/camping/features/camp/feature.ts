import { feature, question, role, rule } from '@joplo-app/kit';

export default feature({
  name: '一起规划周末露营',
  goal: '小雨和营地助手说一句话，就得到一份能分享的行程单；朋友不用装 App 也能看和回复；情况变了，助手主动调整',
  roles: {
    xiaoyu: role('小雨', { desc: '发起露营的人' }),
    ajie: role('阿杰', { desc: '被拉进来的朋友' }),
  },
  cases: {
    happy: { title: '助手规划行程，阿杰确认能去', dimension: 'main', priority: 'high', expected: '小雨拿到行程单并分享；阿杰在手机上确认后，小雨的对话里收到回复' },
    rain: { title: '出发前一天天气变了', dimension: 'lifecycle', priority: 'high', expected: '助手主动提醒并给出调整后的行程（v2），阿杰看到的是最新版' },
    cant_go: { title: '阿杰去不了', dimension: 'conflict', priority: 'high', expected: '小雨马上知道，助手建议改期' },
    full: { title: '推荐的营地已经订满', dimension: 'async', expected: '助手换一个营地，并说明原因' },
    budget: { title: '超出预算', dimension: 'input', expected: '助手先说明超了多少，再给便宜的替代方案' },
  },
  rules: {
    answer_first: rule('助手先用一两句话给结论，详细安排放进右侧的行程单', { cases: ['happy'], elements: ['msg_reply', 'plan'] }),
    share_link: rule('行程单以链接分享，朋友不用装 App 也能看和回复', { cases: ['happy', 'cant_go'], elements: ['share'] }),
    reply_back: rule('朋友的回复回到发起人的对话里，由助手转述', { cases: ['happy', 'cant_go'] }),
    weather_check: rule('出发前 24 小时检查天气，变化时主动提醒，并给出调整后的行程', { cases: ['rain'] }),
    versioned: rule('行程每次调整都升一个版本；朋友打开链接看到的总是最新版', { cases: ['rain'], elements: ['plan'] }),
  },
  questions: {
    who_books: question('营地由谁来订：助手直接下单，还是只给链接让小雨自己订？', { severity: 'major', refs: ['happy', 'full'] }),
  },
});
