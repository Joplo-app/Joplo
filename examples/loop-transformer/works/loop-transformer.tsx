/**
 * 样片：《Loop Transformer：不加参数，怎么让模型“多想一圈”？》
 *
 * 对标纯几何可视动化范式（前置分镜见 ../BEAT_SHEET.md）：
 * - 零仪表盘外框：75% 纯黑留白，单镜头只聚焦一个几何主体（层条堆栈、回流弧、门控幅度柱、按词圆点、参数塔）；
 * - 对象守恒：同一个推理胶囊（motion="probe"）先直通误判「6 件」，再绕珊瑚红回流弧二进宫修正为「12 件」；
 * - 闭嘴观察窗口：在回流重算与潜空间对比拍显式使用 narrate(false) + hold()，把工作记忆留给视觉；
 * - 动静不变量对比：切换 Loop ×1 / ×2 / ×4 时，权重显存条纹丝不动，只有等效计算深度条伸长。
 */
import { camera } from '@joplo-app/plugin-content';
import { $, chapter, done, hold, layer, narrate, patch, work } from '@joplo-app/kit';
import { PALETTE as P, SOURCES } from '../shared/data.ts';
import { LoopWorld } from '../shared/world.tsx';

const setUi = (v: Record<string, string | number | boolean>) => patch($.ui, v);

// ---------- 01 传统单次前向的局限与暴力堆层的代价 ----------
const pass = chapter('只过一遍，为什么容易答错绕弯题？', {
  description: '传统模型每层只走一遍，硬堆层数又会让显存暴涨',
  expected: '看懂单次直通在绕弯题上的直觉误判，以及单纯堆高模型层数带来的显存代价',
})
  .system(
    '单次进层',
    '传统模型：每个词从底到顶只穿过一次',
    setUi({
      stackTitle: '传统 Transformer（单次直通）',
      stackMode: 'normalStart',
      probePos: 'bottom',
      hudSource: SOURCES.latent,
    }),
    camera('zone_stack', { pad: 70 }),
    narrate('传统大模型每写一个词，信息从底层往顶层只穿过一次。遇到下面这道绕弯题，会发生什么？'),
  )
  .system(
    '直觉误判',
    '只过一遍：直觉脱口答出「6 件」✕',
    setUi({
      stackMode: 'normalTop',
      probePos: 'topWrong',
      p6Width: '68%',
      p6Text: '68%',
      p12Width: '21%',
      p12Text: '21%',
    }),
    narrate('只过一遍时，模型很容易顺着字面数字脱口猜出六件，掉进直觉陷阱。'),
  )
  .system(
    '暴力堆层',
    '硬把模型堆高三倍？显存直接爆表',
    setUi({
      stackTitle: '传统做法：硬堆更多独立网络层',
      stackMode: 'bigger',
      probePos: 'none',
    }),
    narrate('想让它算得更深，传统办法是再堆几百层新参数。可模型体积和显存占用也会跟着暴涨三倍。'),
    done('看清“单次不够深、堆层爆显存”的两难'),
  );

// ---------- 02 核心机制：中段共享循环 + 闭嘴观察回流 + Gate 门控防爆 ----------
const loop = chapter('不加新层，怎么让同一段网络“多想一遍”？', {
  description: '中间层权重共享回流，配合 Gate 门控实现安全二轮精修',
  expected: '亲眼看到隐状态绕回流弧二进同一叠珊瑚红层将答案修正为 12，并理解 Gate 门控防数值爆炸的作用',
})
  .system(
    '点亮中段',
    'Loop Transformer：把中间层变成可循环共享块',
    setUi({
      stackTitle: 'Loop Transformer（中段权重共享）',
      stackMode: 'loop1',
      probePos: 'midPass1',
      p6Width: '62%',
      p6Text: '62%',
      p12Width: '28%',
      p12Text: '28%',
      hudSource: SOURCES.glm,
    }),
    camera('zone_stack', { pad: 70 }),
    narrate('换个思路：一丁点新参数都不加，只给中间这组红色层接一条回流轨道。盯住第一遍出来的隐状态去哪儿了。'),
  )
  // 闭嘴观察窗口 #1：胶囊绕右侧珊瑚红圆弧回流，不播旁白抢注意力！
  .system(
    '绕弧回流',
    '第一遍隐状态不急着输出，顺回流弧折返重算',
    setUi({
      stackMode: 'loopArc',
      probePos: 'arcReturn',
      p6Width: '38%',
      p6Text: '38%',
      p12Width: '54%',
      p12Text: '54%',
    }),
    narrate(false),
    hold(2.0),
  )
  .system(
    '二遍修正',
    '第二遍穿出同一组层：答案翻转为「12 件」✓',
    setUi({
      stackMode: 'loop2',
      probePos: 'topRight',
      p6Width: '9%',
      p6Text: '9%',
      p12Width: '89%',
      p12Text: '89%',
    }),
    narrate('同一组权重跑第二遍，隐状态在内部算清了单人速率，输出直接翻转为正确的十二件，而权重显存分毫不涨。'),
  )
  .system(
    '无门控爆炸',
    '隐患：多轮数值硬叠加会直接冲破顶棚',
    setUi({
      stackMode: 'gateBad',
      probePos: 'none',
      normHeight: '96%',
      normColor: P.danger,
    }),
    narrate('但直接把同一层反复套用有个致命隐患：数值幅度会一轮轮放大冲破上限，导致大规模训练崩溃。'),
  )
  .system(
    '门控稳幅',
    '回流弧加上 Gate 门控：第一遍打底，第二遍小步精修',
    setUi({
      stackMode: 'gateGood',
      normHeight: '54%',
      normColor: P.emerald,
    }),
    narrate('所以在回流口必须装上逐词门控阀 Gate：第一遍先搭粗略底稿，第二遍只放行关键修正量，稳稳压住数值。'),
    done('看懂中段共享回流与 Gate 门控防爆'),
  );

// ---------- 03 架构消融与潜空间推理：为什么比吐长串草稿词更省？ ----------
const latent = chapter('为什么只循环中段，又比“吐字打草稿”省在哪？', {
  description: '中段循环兼顾稳定性，潜空间脑内打草稿省去冗长废话词',
  expected: '理解“前编码→中循环→后解码”优于首尾循环，以及潜空间推理相比显式 CoT 节省上下文开销的原因',
})
  .system(
    '消融对比',
    '消融实验：前段编码 → 中段循环 → 后段输出效果最佳',
    setUi({
      showLatentCompare: false,
      hudSource: SOURCES.glm,
    }),
    camera('zone_latent', { pad: 70 }),
    narrate('实验对比发现，不循环开头也不循环结尾，而是前段先把词读懂、只让中段核心层循环，综合表现最好。'),
  )
  .system(
    '潜思对比',
    '传统思维链靠吐字打草稿，Loop 在潜空间脑内打草稿',
    setUi({
      showLatentCompare: true,
    }),
    narrate('更重要的是，传统推理模型得把每一步草稿都吐成文字，既慢又占上下文；而循环模型直接在隐向量里默算。'),
    done('区分显式吐字思维链与潜空间隐式推理'),
  );

// ---------- 04 按词自适应计算与可交互实验台 ----------
const scale = chapter('每个词都要想一样多遍吗？', {
  description: '固定循环保并行效率，按词动态加圈是下一站',
  expected: '看懂固定循环与按词自适应循环的工程取舍，并通过实验台验证“权重显存不变、等效深度增长”',
})
  .system(
    '固定两遍',
    '当前主流方案：无论难易，每个词统一跑 2 遍',
    setUi({
      dotMode: 'fixed',
      hudSource: SOURCES.ut,
    }),
    camera('zone_adaptive', { pad: 70 }),
    narrate('看这一行数学公式。现在的旗舰循环模型里，不管词难还是简单，每个词底下都整齐跑两遍，方便显卡满载并行。'),
  )
  .system(
    '按词自适应',
    '演进方向：简单词 1 遍过，难词自动循环 4 遍',
    setUi({
      dotMode: 'adaptive',
    }),
    narrate('而更理想的方向是按词分配算力：等号跑一遍就走，积分号自动多转四圈。只是快词得等慢词，批处理调度更难。'),
  )
  .system(
    '参数塔与实验台',
    '小体积撬动大深度：默认 Loop ×2 追平数倍规模传统模型',
    setUi({
      labLoops: '2',
      hudSource: SOURCES.glm,
    }),
    camera('zone_lab', { pad: 70 }),
    narrate('这就是为什么七千五百亿参数的循环模型，能追平两三万亿传统堆层模型的推理表现。看右边的权重显存条。'),
  )
  .click(
    'loop_4',
    '切到 Loop ×4：等效深度暴涨，权重显存依然纹丝不动',
    narrate('哪怕切到四轮深度循环，上面绿色的权重显存条依然一动不动，只有推理深度往上生长。'),
  )
  .system(
    '全景收束',
    '本质：用循环计算时间，换取免堆参数的深度',
    setUi({ hudSource: '' }),
    camera(),
    narrate('退回全景：Loop Transformer 的本质，就是用推理时多转几圈的时间，换取不必暴涨参数显存的思考深度。暂停一下，你可以亲手点右下角按钮试试。'),
    done('建立完整的 Loop Transformer 空间—时间心智模型'),
  );

export default work({
  title: 'Loop Transformer：不加参数，怎么让模型“多想一圈”？',
  summary: '纯几何可视动化拆解：同一叠中段网络层如何靠回流弧与门控阀在潜空间里“多想一遍”，以固定参数显存撬动数倍推理深度',
  audience: '关注大模型原理与架构演进、希望直观理解潜空间循环推理的人',
  layers: {
    world: layer('纯几何舞台', <LoopWorld />, { icon: 'flow' }),
  },
  state: {
    ui: {
      __plugins: { content: { camera: { targets: ['zone_stack'], pad: 70 } } },
      stackTitle: '传统 Transformer（单次直通）',
      stackMode: 'normalStart',
      probePos: 'bottom',
      p6Width: '0%',
      p6Text: '—',
      p12Width: '0%',
      p12Text: '—',
      normHeight: '40%',
      normColor: P.emerald,
      showLatentCompare: false,
      dotMode: 'fixed',
      labLoops: '2',
      hudSource: '',
    },
  },
  scenarios: { pass, loop, latent, scale },
});
