import { $, callout, chapter, done, highlight, hold, narrate, patch, set, work } from '@joplo-app/kit';
import { camera } from '@joplo-app/plugin-content';
import { pulse, setStatus, trace } from '@joplo-app/plugin-diagram';
import { focusDatum, setCursor } from '@joplo-app/plugin-viz';
import {
  INITIAL_BUGS,
  INITIAL_FP,
  INITIAL_UI,
  RustMigrationWorld,
  UNMASKED_BUGS,
  type MigrationUiState,
} from '../shared/world.tsx';

const setUi = (next: Partial<MigrationUiState>) => patch($.ui, next);

// =====================================================================
// 第一章 · 测试全绿，线上却只对得上四分之一
// =====================================================================
const ch1_trap = chapter('测试全绿，线上为何只对得上四分之一？', {
  description: '代码一周就写完了，真正的坎是拿什么证明新旧一致',
  expected: '理解单靠测试套失效的三大原因：测试被改松、开关组合太多、细节悄悄偏差',
})
  .system(
    '一周重写完，测试过了 98%',
    setUi({
      showProdReality: false,
      showEmojiDiff: false,
      hudChapter: '01 · 写代码只要一周，难的是怎么验证',
    }),
    camera('zone_1', { pad: 34 }),
    narrate('流量两年涨了一千八百倍，Claude 一周就重写完了 Rust 核心路径，七百条测试过了九成八。'),
  )
  .system(
    '一接真流量，只对得上 25%',
    setUi({ showProdReality: true }),
    highlight('ring_prod'),
    callout('ring_prod', '四分之三真实请求对不上！'),
    camera('z1_rings', { pad: 64, waitForMove: true }),
    narrate('看起来马上就能上线，对吧？结果一接真实流量，只有四分之一的请求能和线上 Python 对上。'),
  )
  .system(
    '测试跟着改松，还会漏掉细节偏差',
    setUi({ showEmojiDiff: true }),
    callout('code_rs', '模型照常回复，测试全绿却已偏移'),
    camera('zone_1', { pad: 44 }),
    narrate('排查发现一百多条测试检查被改松了；像 emoji 转义差几字节，模型照样正常回复，测试根本拦不住。'),
    done('看清为什么单靠测试套根本兜不住线上迁移'),
  );

// =====================================================================
// 第二章 · 让线上旧系统直接当裁判
// =====================================================================
const ch2_shadow = chapter('影子流量：为什么模型只能跑一次？', {
  from: 'ch1_trap',
  description: '绕开模型回复随机和重复扣费，直接拿线上 Python 当对照标准',
  expected: '看懂「模型只跑一次、同一份 Token 流重放给 Rust」的架构与时序',
})
  .system(
    '传统双跑的两个死穴',
    setUi({
      shadowMode: 'naive',
      badEdgeTone: 'danger',
      badEdgeLabel: '再跑一次→回复不同',
      billEdgeTone: 'danger',
      billEdgeLabel: '风险：重复扣费',
      hudChapter: '02 · 直接拿线上旧系统当裁判',
    }),
    setStatus('z2_py_in', 'active'),
    setStatus('z2_rs_in', 'hot'),
    setStatus('z2_ledger', 'hot'),
    pulse('e_rs_model_bad', { label: '再跑一次→回复不同', tone: 'danger' }),
    pulse('e_rs_bill', { label: '风险：重复扣费', tone: 'danger' }),
    camera('zone_2_arch', { pad: 32, waitForMove: true }),
    narrate('直接跑影子流量行不行？两个坑：Claude 每次回复本来就有随机性，而且绝不能把客户额度扣两遍。'),
  )
  .system(
    '观察：切到「模型只跑一次 · 原样重放」',
    setUi({
      shadowMode: 'replay',
      badEdgeTone: 'muted',
      badEdgeLabel: '已关闭双跑',
      billEdgeTone: 'muted',
      billEdgeLabel: '旁路禁写',
    }),
    setStatus('z2_py_in', 'healthy'),
    setStatus('z2_rs_in', 'active'),
    setStatus('z2_rs_out', 'active'),
    setStatus('z2_ledger', 'healthy'),
    pulse('e_u_py', { label: '主请求', tone: 'info' }),
    pulse('e_u_rs', { label: '镜像副本', tone: 'accent' }),
    pulse('e_py_model', { label: '只跑这一次', tone: 'info' }),
    pulse('e_model_py', { label: '原路返回', tone: 'info' }),
    pulse('e_replay', { label: '原样重放同份 Token', tone: 'ok' }),
    pulse('e_py_bill', { label: '只记 1 次', tone: 'ok' }),
    narrate(false),
    hold(2.4),
  )
  .system(
    '按时序看清 6 步完整流程',
    trace('m_req', 'm_mirror', 'm_infer', 'm_tok', 'm_replay', 'm_bill', { focus: false }),
    camera('zone_2_seq', { pad: 36, waitForMove: true }),
    narrate('沿着时序看就一目了然：模型只由 Python 跑一次，吐出来的 Token 流原样重放给 Rust，账本只记主路。'),
    done('看懂不重复扣费、不受随机性干扰的影子对比做法'),
  );

// =====================================================================
// 第三章 · 不看用户原文，怎么捉出 Bug？
// =====================================================================
const ch3_fingerprint = chapter('不看客户原文，怎么捉出 Bug 特征？', {
  from: 'ch2_shadow',
  description: '用逐段检查点与 5 项位置特征定位差异，全程不碰任何客户原文',
  expected: '看懂 5 项特征如何既保护隐私，又能把几十万条报错归成一类',
})
  .system(
    '隐私红线：把请求拆成检查点',
    setUi({
      cpCheck: 'sorted',
      cpPy2: 'idle',
      cpRs2: 'idle',
      cpRs3: 'idle',
      cpPtrPy: '',
      cpPtrRs2: '',
      cpPtrRs3: '',
      hudChapter: '03 · 不看客户原文，靠 5 项特征定位',
    }),
    set($.data.activeBugs, INITIAL_BUGS),
    camera('zone_3', { pad: 34, waitForMove: true }),
    narrate('还有条硬红线：谁都不能看客户的真实请求。看不见原文，就把处理流程拆成几段检查点逐个比。'),
  )
  .system(
    '只记 5 项位置特征，不落半个字原文',
    setUi({
      cpCheck: 'sorted',
      cpPy2: 'compare',
      cpRs2: 'swap',
      cpRs3: 'idle',
      cpPtrPy: '标准答案',
      cpPtrRs2: '第 17 字节分叉',
      cpPtrRs3: '',
    }),
    highlight('fp_card'),
    camera('fp_bundle', { pad: 54, zoom: 1.5, waitForMove: true }),
    narrate('日志不存半个字原文，只记五项特征：哪一步、哪一段、第几字节开始不同、两边各自多长。'),
  )
  .system(
    '观察：修掉 A，后面的 B 和 C 才露出来',
    setUi({
      cpCheck: 'sorted',
      cpPy2: 'sorted',
      cpRs2: 'sorted',
      cpRs3: 'pivot',
      cpPtrPy: '',
      cpPtrRs2: '',
      cpPtrRs3: '下游露头',
    }),
    set($.data.activeBugs, UNMASKED_BUGS),
    camera('z3_track_box', { pad: 64, zoom: 1.35 }),
    narrate(false),
    hold(2.2),
  )
  .system(
    '几十万条日志，一眼归成同一类',
    camera('zone_3', { pad: 34 }),
    narrate('同一个 Bug 往往在几十万次请求上留下完全一样的特征；修掉靠前的 A，后面藏着的 B 和 C 才会露头。'),
    done('看懂检查点与 5 项特征如何兼顾隐私和归类排查'),
  );

// =====================================================================
// 第四章 · 沙盒试错、人工审 PR 与线上验真
// =====================================================================
const ch4_loops = chapter('三层校验闭环：秒级沙盒与人工审 PR', {
  from: 'ch3_fingerprint',
  description: '沙盒秒级试错、Slack 人工审 PR、线上流量验真与经验写进规矩',
  expected: '看懂三层闭环怎么分工，以及为什么沙盒全绿仍要工程师审 PR',
})
  .system(
    '归类派单：沙盒不到一秒就试完',
    setUi({
      bugState: 'sandbox',
      showSlackReject: false,
      showMemoryAlert: false,
      hudChapter: '04 · 沙盒试错 → 人工审 PR → 线上验真 → 沉淀规矩',
    }),
    setStatus('z4_coord', 'active'),
    setStatus('z4_worker', 'active'),
    setStatus('z4_local', 'active'),
    pulse('e_q_coord', { label: '新差异', tone: 'info' }),
    pulse('e_coord_w', { label: '派单', tone: 'accent' }),
    pulse('e_in_try', { label: '自造复现请求', tone: 'accent' }),
    pulse('e_in_fb', { label: '< 1 秒出结果', tone: 'info' }),
    camera('zone_4_loops', { pad: 32, waitForMove: true }),
    narrate('拿到新差异后，修 Bug 的 Claude 凭特征猜原因、自己造请求，在沙盒里不到一秒就能跑完双版本对比。'),
  )
  .system(
    '真实案例：沙盒全绿，为何仍被驳回？',
    setUi({
      bugState: 'pr_gate',
      showSlackReject: true,
      showMemoryAlert: false,
    }),
    camera('zone_4_slack', { pad: 36, waitForMove: true }),
    narrate('校验器只看输出一不一样，不管代码能不能上线。工具说明缺失，AI 抄近路写死文案，被工程师直接驳回。'),
  )
  .system(
    '驳回意见立刻写进团队规范',
    setUi({
      bugState: 'memory',
      showSlackReject: true,
      showMemoryAlert: true,
    }),
    highlight('alert_mem_saved'),
    narrate('驳回意见会立刻写进团队规范：以后同类差异再冒出来，新任务直接关联原工单，不再写临时捷径。'),
  )
  .system(
    '拿真实流量验真，没清零就打回重改',
    setUi({ bugState: 'shadow' }),
    setStatus('z4_worker', 'healthy'),
    setStatus('z4_local', 'healthy'),
    setStatus('z4_shadow', 'active'),
    setStatus('z4_rules', 'active'),
    setStatus('z4_sweep', 'active'),
    pulse('e_pr_out', { label: '批准上线对比', tone: 'ok' }),
    pulse('e_out_back', { label: '还有差异→打回', tone: 'warn' }),
    pulse('e_pr_mem', { label: '写规矩 + 反查 7 处', tone: 'ok' }),
    pulse('e_mem_w', { label: '后续任务必读', tone: 'ok' }),
    camera('zone_4_loops', { pad: 32, waitForMove: true }),
    narrate('审过的改动才上线对比，看差异是否彻底清零；规矩还顺手查出七处遗漏，并加上同步修改检查。'),
    done('看清三层闭环与人工把关如何配合运转'),
  );

// =====================================================================
// 第五章 · 不停服换新系统：省下七成算力，人转向定规矩
// =====================================================================
const ch5_payoff = chapter('不停服换新系统：省下七成算力，人转向定规矩', {
  from: 'ch4_loops',
  description: '对比局部重写与并行重写，看实测性能收益和工程师分工变化',
  expected: '看到 CPU −70%、内存 −80%+、TTFT −20%，以及工程师从改代码转向写规矩和审 PR',
})
  .select(
    'z5_cmp',
    'parallel',
    '从一点点局部改，换成并行造新船',
    setUi({
      shipView: 'parallel',
      cpuPct: 100,
      memPct: 100,
      ttftPct: 100,
      cpuLabel: '100（基线）',
      memLabel: '100（基线）',
      ttftLabel: '100（基线）',
      hudChapter: '05 · 不停服切流量，人转向定规矩和把关',
    }),
    camera('zone_5_ship', { pad: 44, waitForMove: true }),
    narrate('早年局部重写只省一成 CPU，每个 Token 还要跨语言折腾三次；这次拿旧系统实时对照，直接并行造新船。'),
  )
  .system(
    '观察：切入 Rust 后三项指标大幅下降',
    setUi({
      cpuPct: 30,
      memPct: 20,
      ttftPct: 80,
      cpuLabel: '30（基线 100）',
      memLabel: '20（基线 100）',
      ttftLabel: '80（基线 100）',
    }),
    camera('zone_5_metrics', { pad: 36, waitForMove: true }),
    narrate(false),
    hold(2.5),
  )
  .system(
    '九月全量切流，人从改 Bug 转向定规矩',
    setCursor('z5_lanes', 8.6, '8.6 月 · 切流'),
    focusDatum('z5_lanes', ['sp_rules', 'sp_cutover']),
    camera('zone_5_timeline', { pad: 40, waitForMove: true }),
    narrate('九月切流后，CPU 降七成、内存省超八成、首字快两成；工程师也从逐个改 Bug，转向写清规矩和审 PR。'),
  )
  .system(
    '全景回看：写代码靠 AI，敢上线靠闭环',
    focusDatum('z5_lanes', null),
    camera({ pad: 90 }),
    narrate('写代码压到按周算后，决定你敢不敢按下上线键的，从来不是生成多快，而是验证闭环有多稳。'),
    done('看懂如何拿线上旧系统当标准、靠三层闭环稳妥完成大型重写'),
  );

export default work({
  title: 'Anthropic 如何验证 Messages API 的 Rust 迁移',
  summary: '拿线上 Python 当实时标准，不看客户原文，靠三层闭环把 API 平滑迁到 Rust',
  state: {
    ui: INITIAL_UI,
    data: {
      fp: INITIAL_FP,
      activeBugs: INITIAL_BUGS,
    },
  },
  stage: <RustMigrationWorld />,
  scenarios: {
    ch1_trap,
    ch2_shadow,
    ch3_fingerprint,
    ch4_loops,
    ch5_payoff,
  },
});
