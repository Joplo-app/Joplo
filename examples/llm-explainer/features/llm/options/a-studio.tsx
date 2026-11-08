import { $, callout, camera, done, flow, hold, layer, narrate, option, patch } from '@joplo-app/kit';
import { BIRTHDAY_Q, PROMPT, SRC } from '../../../shared/data.ts';
import { C } from '../../../shared/palette.ts';
import { WorldLayer } from '../../../shared/world.tsx';

/**
 * 台本：整支片子是同一张画布上的一串状态变化。
 * - patch($.ui, {...}) 一步改多处；camera(...) 移镜头；
 * - 每一章 flow({ from: '上一章' })：从上一章最后的画面接着开始，不用手抄状态。
 */
const ui = (v: Record<string, string | number | boolean>) => patch($.ui, v);
const machOn = { machOp: 1, machBd: C.accent, machGlow: '0 0 60px rgba(255,176,32,.35)', scanOp: 1 };
const machIdle = { machOp: 1, machBd: C.lineStrong, machGlow: 'none', scanOp: 0 };
const hud = (n: string, t: string, src: string) => ({ hudN: n, hudT: t, src });

// ---------- 00 开场：熟悉的一幕 → 反常 → 拉远，四个问题钉在各自的位置 ----------
const hook = flow('它不是在写，是在猜', { cases: ['hook'], start: '/', description: '你看到的逐字出现，背后是抽签' })
  .type('prompt', PROMPT, '你一定见过这一幕', ui({ poster: 0 }), narrate('你一定见过这一幕：问 AI 一个问题，比如，给我的橘猫起个名字。'))
  .click('send', '答案一个字一个字蹦出来', ui({ asked: true, ans: 'plain' }), narrate('答案一个字一个字地蹦出来，像有人在那头打字。'))
  .system('定格', '其实每一块都是猜出来的', ui({ ans: 'split' }), hold(5),
    narrate('其实没人在打字。每蹦出一小块，它都是从一堆候选里，按概率挑了一个。'))
  .system('再问一遍', '再问一遍，名字变了', ui({ ansFlip: true }), hold(4),
    narrate('更怪的是，同一个问题再问一遍，前面一字不差，偏偏名字变了。'))
  .system('拉远', '这一期讲清四件事', ui({ machOp: 0.45, overview: true, tag0: 'ask', tag1: 'ask', tag2: 'ask', tag3: 'ask' }), camera(), hold(6),
    narrate('它读到的字是什么？下一个字怎么选？答案为什么会变？为什么它会一本正经地胡说？就在这台机器里，一个一个看。'),
    done('带着四个问题往下看'));

// ---------- 01 词元 ----------
const tokens = flow('它读到的“字”是什么？', { cases: ['tokens'], from: 'hook', description: '一句话先被切成词元，再变成编号' })
  .system('章节', '01 它读到的“字”是什么？', ui({ overview: false, tag0: 'now', ...hud('01', '它读到的“字”是什么？', SRC.tokens) }), camera('q1_bubble', 'a1_bubble', { pad: 60 }),
    narrate('第一个问题：它读到的字，到底是什么？凑近看你发出的这句话。'))
  .system('切开', '九个字，在它眼里是七块', ui({ pMode: 'split' }), hold(4),
    narrate('在我们眼里，这是九个汉字。模型却先把它切成七小块，叫词元，有的一个字一块，有的两个字一块。'))
  .system('编号', '每一块换成一个编号', ui({ pMode: 'ids' }),
    narrate('每一块再翻过来，换成一个编号。'))
  .system('上纸带', '它真正读到的，是这串编号', ui({ pAt: 'tape', rail: true, machOp: 0.6 }), camera('tag_0', 'tape', 'meter', { pad: 60 }),
    narrate('从头到尾，模型读到的都是这串编号，不是字。'))
  .system('英文', '英文：约四个字母一个词元', callout('tape', '英文约 4 个字母算一个词元', { side: 'bottom' }),
    narrate('英文也一样。按 OpenAI 的估算，一个词元大约四个英文字母。'))
  .system('计费', '收费、能读多长，都按词元算', ui({ meter: '7' }),
    narrate('所以 AI 怎么收费，一次能读多长，都按词元算，不按字数算。'))
  .system('记住', '记住：它读的是词元', ui({ tag0: 'done' }), hold(4),
    narrate('第一个问题有答案了：它读的是词元，看到的是编号。'),
    done('知道它读的是词元'));

// ---------- 02 生成循环：慢放一圈，再快进 ----------
const loop = flow('下一个字，怎么选出来？', { cases: ['loop'], from: 'tokens', description: '读入、打分、挑一个、接上，循环往复' })
  .system('章节', '02 下一个字，怎么选出来？', ui({ tag1: 'now', ...machIdle, ...hud('02', '下一个字，怎么选出来？', SRC.predict) }), camera('tape', 'machine', 'bars', 'tag_1'),
    narrate('第二个问题：下一个字，是怎么选出来的？先慢放一圈。'))
  .system('读入', '第一步：整条纸带读进去', ui({ ...machOn, scan: '400px' }),
    narrate('第一步，它把整条纸带一口气读进去。'))
  .system('打分', '第二步：给每个候选打分', ui({ bars: 'first' }), camera('machine', 'bars'), hold(4),
    narrate('第二步，给词表里每一个候选打分，换算成概率。这里画出前五名，剩下的合在一起。'))
  .system('挑一个', '第三步：挑一个，接到末尾', ui({ bars: 'firstPick', out: 1, meter: '8' }), camera('tape_out', 'machine', 'bars'),
    narrate('第三步，挑出一个，接到纸带末尾。这次挑的是第一名：就。'))
  .system('快进', '一圈一块，快进三圈', ui({ scan: '40px', bars: 'name', out: 4, meter: '11' }),
    narrate('然后回到第一步，再读一遍、再打分、再挑。一圈只出一块，快进三圈。'))
  .system('名字', '轮到名字：橘子 45%', ui({ scan: '400px', bars: 'namePick', out: 5, meter: '12' }), hold(4),
    narrate('到了最关键的名字，橘子的概率最高，百分之四十五，接上。'))
  .system('继续', '再接三块，第一名变成“结束”', ui({ scan: '40px', bars: 'end', out: 8, meter: '15' }),
    narrate('再接上引号、吧和感叹号。这时排第一的，变成了一个特殊记号：结束。'))
  .system('结束', '挑中“结束”，回答停下', ui({ bars: 'endPick', out: 9, meter: '16', ...machIdle }),
    narrate('它挑中结束，机器停下，回答就写完了。'))
  .system('记住', '记住：一圈只猜下一块', ui({ tag1: 'done' }), camera('tape', 'machine', 'bars', 'tag_1'), hold(4),
    narrate('你看到的逐字出现，不是特效，就是这台机器在转圈：一圈，只猜下一块。'),
    done('看懂生成的循环'));

// ---------- 03 温度：条形图排成抽签带 ----------
const temperature = flow('同一个问题，为什么答案会变？', { cases: ['temperature'], from: 'loop', description: '按概率抽签，温度调的是手气' })
  .system('章节', '03 同一个问题，为什么答案会变？', ui({ tag2: 'now', bars: 'name', ...hud('03', '同一个问题，为什么答案会变？', SRC.temp) }), camera('bars', 'strip', 'dial', 'tag_2', { pad: 40 }),
    narrate('第三个问题：同一个问题，答案为什么会变？回到起名字的那一圈：橘子百分之四十五，南瓜百分之二十，其他更少。'))
  .system('排成一条', '把概率首尾相接，排成一条', ui({ bars: 'strip1', dial: 't1', ptr: 'start' }), hold(4),
    narrate('把这五个概率首尾相接，排成一条带子。每一段有多宽，就有多大机会被抽中。'))
  .system('抽签', '指针落在“南瓜”', ui({ bars: 'strip1Pick', ptr: 'pumpkin', outFlip: true }), camera('machine', 'strip', 'dial', { pad: 50 }), hold(4),
    narrate('它不总选第一名，而是抽签。这一次，指针落在南瓜上，回答里的名字就变成了南瓜。'))
  .system('调低', '温度调低：几乎总是橘子', ui({ dial: 't02', bars: 'stripLo', ptr: 'lo', outFlip: false, ansFlip: false }), hold(4),
    narrate('控制抽签的旋钮叫温度。调低，橘子占到将近百分之九十八，几乎每次都抽到它。'))
  .system('调高', '温度调高：冷门名字常被抽到', ui({ dial: 't15', bars: 'stripHi', ptr: 'none' }), hold(4),
    narrate('调高，差距被拉平，冷门的名字也常被抽到。回答更有新意，也更容易跑偏。'))
  .system('怎么调', '低温求稳，高温求变', ui({ hints: true }),
    narrate('所以写代码、查资料，调低一点；起名字、写文案，可以调高一点。'))
  .system('记住', '记住：它按概率抽签', ui({ tag2: 'done' }), hold(4),
    narrate('第三个问题的答案：它按概率抽签，温度越高，答案越多变。'),
    done('看懂答案为什么会变'));

// ---------- 04 胡说 + 全片收尾 ----------
const hallucinate = flow('为什么它会一本正经地胡说？', { cases: ['hallucinate'], from: 'temperature', description: '没把握也必须挑一个' })
  .system('章节', '04 为什么它会一本正经地胡说？', ui({ tag3: 'now', ...hud('04', '为什么它会一本正经地胡说？', SRC.hallu) }), camera('chat'),
    narrate('最后一个问题：为什么它会一本正经地胡说？回到聊天窗。'))
  .type('prompt', BIRTHDAY_Q, '问它一个不可能知道的事', narrate('我们问一个它不可能知道的事：我的橘猫哪天生日？'))
  .click('send', '它答得很肯定', ui({ q2: true }), narrate('它答得很肯定：三月十二日。'))
  .system('它心里', '可每个日期都只有 2% 左右', ui({ bars: 'dates', dial: 'none', hints: false }), camera('machine', 'strip', { pad: 60 }), hold(5),
    narrate('看它心里的抽签带。每个日期都只有百分之二左右，剩下九成多，散在几百个日期上。它其实毫无把握。'))
  .system('必须挑', '没把握，也得抽一个', ui({ bars: 'datesPick', ptr: 'date' }), callout('seg_0', '3 月 12 日：只有 2.1%'),
    narrate('可规则是每一圈都必须挑出一块。抽出来的话，读起来照样很肯定。'))
  .system('不知道', '“不知道”只有一条细缝', callout('seg_4', '“不知道”：0.6%'),
    narrate('那为什么不说不知道？这个选项，只占一条细缝。'))
  .system('考法', '因为考试只算答对', ui({ score: 'plain' }), camera('tag_3', 'score'), hold(6),
    narrate('OpenAI 二零二五年的一篇研究解释：训练和评测大多只算答对。蒙一个日期还有三百六十五分之一的机会，说不知道一定是零分。'))
  .system('换考法', '答错扣分，说不知道才划算', ui({ score: 'penalty' }), hold(4),
    narrate('研究者的建议是改考法：答错要扣分，承认不确定不扣分。这样，说不知道才更划算。'))
  .system('你能做的', '问事实：要出处、开联网、自己核对', ui({ tips: true }), camera('chat'),
    narrate('在那之前，问事实类的问题，让它给出处，打开联网搜索，关键数字自己再核对一遍。'))
  .system('记住', '记住：流畅不等于正确', ui({ tag3: 'done' }), camera('tag_3', 'score'), hold(4),
    narrate('最后一个问题的答案：它没把握，也必须挑一个。说得流畅，不等于说得对。'))
  .system('全景', '四个问题，四个答案', ui({ overview: true, hudN: '', hudT: '' }), camera(), hold(6),
    narrate('退后一步再看：它读的是词元，一圈只猜下一块，按概率抽签，所以答案会变；没把握也得挑，所以会胡说。'))
  .system('自己试', '自己试一下：同一个问题问两遍', ui({ cta: true }),
    narrate('你也可以自己试试：同一个问题问两遍，看看它起的名字变没变。'),
    done('看懂胡说的成因'));

export default option({
  name: '连续世界版',
  idea: '整支片子是同一个世界：同一批物件（那句话、纸带、机器、概率条）从头到尾变形、移动，镜头在它们之间推拉摇，不翻页',
  layers: { world: layer('世界', <WorldLayer />, { icon: 'flow' }) },
  state: {
    ui: {
      __camera: { targets: ['chat'] }, poster: 1, asked: false, ans: 'hidden', ansFlip: false, pAt: 'bubble', pMode: 'plain',
      tag0: 'hidden', tag1: 'hidden', tag2: 'hidden', tag3: 'hidden', overview: false,
      ...machIdle, machOp: 0, scan: '40px', bars: 'none', out: 0, outFlip: false, meter: '', rail: false, ptr: 'none', dial: 'none', hints: false,
      q2: false, tips: false, score: 'none', hudN: '', hudT: '', src: '', cta: false,
    },
  },
  scenarios: { hook, tokens, loop, temperature, hallucinate },
});
