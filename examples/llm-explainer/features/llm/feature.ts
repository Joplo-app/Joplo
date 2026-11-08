import { feature } from '@joplo-app/kit';

/**
 * 一支面向普通用户的讲解视频，按章节组织：每个“情况”是一章，标题就是观众在左侧看到的章节名。
 * expected 写这一章结束时观众必须看懂的那件事；开场抛出的三个问题，分别在第 1、2、4 章回答（第 3 章回答开场的“再问一遍名字变了”）。
 */
export default feature({
  name: '大模型是怎么“写”出一句话的？',
  goal: '五分钟看懂大模型怎样生成文字：读的是词元、每次只猜下一块、按概率抽签所以答案会变、没把握也必须挑一个所以会胡说',
  roles: ['天天用 AI 聊天、但不写代码的人'],
  pick: 'a-studio',
  cases: {
    hook: { title: '00 它不是在写，是在猜', dimension: 'main', priority: 'high', expected: '开场 30 秒内看到“逐字出现”背后是概率，并带着三个问题往下看' },
    tokens: { title: '01 它读到的“字”是什么？', dimension: 'main', priority: 'high', expected: '看到一句话被切成词元、换成编号，并知道价格和长度上限按词元算' },
    loop: { title: '02 下一个字，怎么选出来？', dimension: 'main', priority: 'high', expected: '看懂“读入 → 打分 → 挑一个 → 接上”的循环，以及回答在“结束”记号处停下' },
    temperature: { title: '03 同一个问题，为什么答案会变？', dimension: 'main', priority: 'high', expected: '看到按概率抽签会抽到第二名，以及温度怎样让概率变尖或变平' },
    hallucinate: { title: '04 为什么它会一本正经地胡说？', dimension: 'main', priority: 'high', expected: '看到没把握时概率很平却仍必须挑一个，以及“只算答对”的考法为什么鼓励蒙' },
  },
});
