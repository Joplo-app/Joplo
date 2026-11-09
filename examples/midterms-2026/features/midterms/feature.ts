import { feature } from '@joplo-app/kit';

/**
 * 一支面向中文观众的资讯短视频，按章节组织：每个“情况”是一集里的一章，标题就是观众在左侧看到的章节名。
 * expected 写这一章结束时观众必须看懂的那件事。
 */
export default feature({
  name: '特朗普丢掉国会之后',
  goal: '五分钟看懂 2026 美国中期选举：选的是什么、民主党赢了多少、特朗普接下来会被怎样卡住、AI 和股市会受什么影响',
  pick: 'b-film',
  cases: {
    hook: { title: '00 一夜之间，特朗普丢掉了整个国会', dimension: 'main', priority: 'high', expected: '开场 20 秒内知道发生了什么，并带着三个问题往下看' },
    basics: { title: '01 中期选举，到底在选什么？', dimension: 'main', priority: 'high', expected: '看懂一张选票上选了哪几样，以及它们对应国会的哪部分' },
    results: { title: '02 蓝色浪潮有多大？', dimension: 'main', priority: 'high', expected: '看到两院席位由红变蓝、关键州翻转，以及选民为什么换人' },
    stakes: { title: '03 他接下来会被怎样卡住？', dimension: 'main', priority: 'high', expected: '看到失去国会后，法案、预算、调查、人事各自怎么变，以及历史上几乎每任总统都会输' },
    money: { title: '04 AI 和股市：你的钱会怎样？', dimension: 'main', priority: 'high', expected: '看到选后股市的实际反应，以及 AI 政策可能怎么变' },
  },
});
