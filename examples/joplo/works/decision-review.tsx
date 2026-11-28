import {
  $,
  chapter,
  done,
  hold,
  layer,
  narrate,
  patch,
  work,
} from '@joplo-app/kit';
import { camera } from '@joplo-app/plugin-content';
import { DecisionReviewWorld, type DecisionReviewUi } from '../shared/decision-review/world.tsx';

const setUi = (next: Partial<DecisionReviewUi>) => patch($.ui, next);

// ---------- 01 为什么按一下看片比读文字更省力 ----------
const why_play = chapter('动工前，为什么看演示比读文档省力？', {
  description: '省下在脑子里同时拼出界面、后台和重试的力气',
  expected: '直观体会“读文字人肉脑补”与“15 秒看懂完整局面”的脑力差距',
})
  .system(
    '读文字靠脑补',
    '大脑要同时记着界面报错、后台可能成功和再次点击',
    setUi({
      contrastMode: 'text',
      hudTag: '战略评审结论演示 · 动工前行为拍板',
    }),
    camera('zone_contrast', { pad: 68, drift: { zoom: 1.03, x: 16, ms: 16000 } }),
    narrate('看这份超时重试文档时，人得在脑子里同时维持三件事：页面报错了、后台其实可能已经成功、管理员以为没发又点了一次。人肉脑补非常耗神。'),
  )
  .system(
    '按一下演出来',
    '15 秒演完三步因果：省掉脑补，直接进入拍板',
    setUi({
      contrastMode: 'play',
    }),
    camera('zone_contrast', { pad: 68, drift: { zoom: 1.04, x: -14, ms: 16000 } }),
    narrate('换成 Joplo 按一下演出来：发邀请、卡超时、管理员再次点击。PM、架构师和研发不用费劲脑补，十五秒就站在了同一张画面前。'),
    done('看清“看视频省力”省的是脑力启动成本'),
  );

// ---------- 02 画面停在分歧处，三方同屏拍板 ----------
const stop_at_fork = chapter('停在分歧处：PM、架构、研发怎么一次定清？', {
  description: '同一输入切 A/B 后果，把拟议和实测标清楚',
  expected: '看懂如何围绕同一个分歧步切方案、划清三方职责，并防止把动画误读成已测通代码',
})
  .system(
    '方案 A 的隐蔽坑',
    '只做前端防抖：刷新重发会发出 2 封重复邮件',
    setUi({
      forkOpt: 'a',
      hudTag: '核心交互 · 停在分歧处拍板',
    }),
    camera('zone_fork', { pad: 68, drift: { zoom: 1.03, x: 14, ms: 16000 } }),
    narrate('画面停在第二次点击的分歧路口。如果按方案 A 只做前端防抖，刷新再点就会直接穿过接口，多写一条脏数据、发出两封重复邀请。'),
  )
  // 静音观察窗口 #1：点击方案 B，让眼睛专注看护盾拦截与数据库锁死在 1 条！
  .click(
    'choose_opt_b',
    '切到方案 B：服务端幂等键拦截重复写入',
    narrate(false),
    hold(2.0),
  )
  .system(
    '三方同屏与断言边界',
    '同一步定界面、定去重，并诚实标出「拟议·待验证」',
    camera('zone_fork', { pad: 68, drift: { zoom: 1.04, x: -14, ms: 16000 } }),
    narrate('切到方案 B，服务端幂等键稳稳拦住重复写入。看右边：PM 定了界面提示，架构师定了去重归属，研发看到的每条断言都标着拟议待验证，绝不冒充已经测通。'),
    done('理解“省力播放”与“诚实断言边界”如何统一'),
  );

// ---------- 03 挑刺不写长 Prompt，改完直达复审步 ----------
const feedback_loop = chapter('挑刺后，怎么改得快又不用重看全片？', {
  description: '点一下带位置推给 Agent，改完回执直达变更步',
  expected: '看懂本地反馈回执与定点复审如何把人类沟通成本和复审时间同时压低',
})
  .system(
    '点选留一句话',
    '在分歧步点一下指出遗漏，自动带源码行号给 Agent',
    setUi({
      loopStage: 'pin',
      hudTag: '第一季度重点 · 反馈回执与定点复审',
    }),
    camera('zone_loop', { pad: 68, drift: { zoom: 1.03, x: 14, ms: 16000 } }),
    narrate('架构师顺手发现漏了一种情况：原邀请已经过期时不能复用旧链接。不用写三百字长提示词，在规则节点点一下留一句话，步骤位置和源码行号自动推给 Agent。'),
  )
  // 静音观察窗口 #2：批注飞入 Agent 局部修改并生成回执！
  .system(
    'Agent 局部修订',
    '只改过期重发这一处，回执关联新版本与步骤',
    setUi({
      loopStage: 'fixing',
    }),
    narrate(false),
    hold(1.9),
  )
  .system(
    '直达复审并入库',
    '跳过已审旧步，3 秒确认新分支并把决定写进 Git',
    setUi({
      loopStage: 'recheck',
    }),
    camera('zone_loop', { pad: 68, drift: { zoom: 1.04, x: -14, ms: 16000 } }),
    narrate('Agent 改完后生成处理回执。评审者回来不用重看全片，直接跳到新补的第四步确认，适用条件和理由跟着场景一起留进 Git。'),
    done('打通“挑刺 → 局部修改 → 定点复审 → 决定留档”闭环'),
  );

// ---------- 04 护城河从第二次改需求开始 & 未来两季度聚焦 ----------
const second_change = chapter('长期护城河在哪？未来两季度做什么？', {
  description: 'Q2 挂回实测证据，第二次改需求显露复利价值',
  expected: '看清测试证据回挂、第二次改需求的上下文复用，以及未来两季度做什么、不做什么',
})
  .system(
    'Q2 挂回真实测试',
    '同一步直接标出「实测吻合」或「实测冲突」',
    setUi({
      moatStage: 'evidence',
      hudTag: '第二季度演进 · 证据回挂与长期护城河',
    }),
    camera('zone_moat', { pad: 68, drift: { zoom: 1.03, x: 14, ms: 16000 } }),
    narrate('第二季度，只把团队已有的一条测试结果挂回当初拍板的断言上：第一条实测吻合，第二条查出冲突直接标红。演得很顺不等于代码没坑，当场抓出来。'),
  )
  .system(
    '第二次改需求见复利',
    '3 周后改批量邀请，自动调出上次决定与失效证据',
    setUi({
      moatStage: 'reuse',
    }),
    camera('zone_moat', { pad: 68, drift: { zoom: 1.04, x: -14, ms: 16000 } }),
    narrate('真正的护城河从第二次改需求才开始：三周后新人要加批量邀请，打开 Joplo 瞬间看到上次为什么选幂等键、踩过什么坑、哪条旧测试已经失效。'),
  )
  .system(
    '未来两季度只做 3 件',
    '聚焦动工前拍板与定点复审，暂不另立多条主线',
    setUi({
      moatStage: 'roadmap',
      hudTag: 'Astra + Sol 一致结论',
    }),
    camera('zone_moat', { pad: 68, drift: { zoom: 1.03, ms: 16000 } }),
    narrate('这就是和 Astra、Sol 对齐后的结论：未来两个季度只死磕动工前的最小拍板配方、定点复审回执，跑通外部复访后再挂回实测证据；全量 PR 证明和多语言独立主线果断延后。'),
  )
  .system(
    '全景回顾',
    '从省力看懂，到当场拍板，再到跨版本沉淀决定',
    setUi({ hudTag: '' }),
    camera('zone_contrast', 'zone_fork', 'zone_loop', 'zone_moat', { pad: 56 }),
    narrate('退回全景：一按省力看清局面、停在分歧处拍板、点选直达复审、下次改需求直接复用决定。你可以随时暂停，切回右上角亲手对比方案 A 和方案 B。'),
    done('清晰对齐 Joplo 未来 1–2 季度的产品体验与聚焦边界'),
  );

export default work({
  draft: true,
  title: 'Joplo 下一阶段怎么打？（Astra + Sol 结论演示）',
  summary: '用「成员邀请超时重发」真实案例，直观演示 Joplo 未来两个季度的核心体验：省力播放停在分歧处拍板、回执定点复审、Q2 挂回实测证据与聚焦边界。',
  audience: 'Joplo 核心团队与关注下一阶段产品定位的评审者',
  layers: {
    world: layer('战略与体验演示', <DecisionReviewWorld />, { icon: 'flow' }),
  },
  state: {
    ui: {
      __plugins: { content: { camera: { targets: ['zone_contrast'], pad: 68 } } },
      contrastMode: 'text',
      forkOpt: 'a',
      loopStage: 'pin',
      moatStage: 'evidence',
      hudTag: '',
    },
  },
  scenarios: { why_play, stop_at_fork, feedback_loop, second_change },
});
