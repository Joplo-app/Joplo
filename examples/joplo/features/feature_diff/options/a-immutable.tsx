import { $, done, flow, highlight, option, set, shot, uses } from '@joplo-app/kit';
import { comparisonInitial, comparisonLayers } from '../../../shared/comparison/view.tsx';

const matched = () => [
  set($.ui.beforeStep, '第 2 / 3 步 · 发送'), set($.ui.afterStep, '第 3 / 4 步 · 发送'),
  set($.ui.beforeState, '邀请已发出'), set($.ui.afterState, '邀请已发出，显示发送反馈'),
  set($.ui.status, '按同一个发送动作对齐：旧 2 ↔ 新 3'),
];

export default option({
  name: 'A · 固定基线的不可变功能差异',
  idea: '对有把握的步骤保守匹配，用完整状态回放呈现变化；每次成功比较创建新分享，旧任务不能覆盖当前结果',
  focus: '让变化易于理解，同时让不确定、状态漂移和过时结果保持可见',
  tradeoffs: ['新增与删除不制造不存在的另一版', '重复动作无法可靠匹配时明确 uncertain', '固定起点保持累计比较，重置起点的 UI 延后'],
  layers: comparisonLayers(),
  state: { ui: comparisonInitial() },
  scenarios: {
    rationale: flow('设计演进：比较功能，怎样才可信', { cases: ['rationale'], start: '/comparison', expected: '看见固定起点、匹配与布局选择的因果关系' })
      .card('PR 改了很多行，功能到底变了什么？', { sub: '真实需求：从固定 PR 起点看累计变化，而不是只看源码行数。' })
      .system('CI 验收：先固定比较的起点', shot('cd_boundary'), uses('baseline', 'boundary'))
      .system('再把变化放回具体场景', shot('cd_viewer'))
      .click('cd_match', '插一步，不代表后面全变了', ...matched(), highlight('cd_after'), uses('semantics'))
      .click('cd_added', '全新场景，只看新版', set($.ui.kind, '新增'), set($.ui.scenario, '批量邀请'), set($.ui.beforeVisible, false), set($.ui.span, 12), set($.ui.afterTitle, '批量邀请'), set($.ui.afterState, '3 位成员等待邀请'), set($.ui.afterValue, '示例：团队列表已准备'), set($.ui.afterStep, '新版 · 批量场景'), uses('layout'))
      .system('设计选择来自场景含义', done('不制造旧版，让观众专注新功能')),
    insertion: flow('插入预览后，发送动作继续对齐', { cases: ['insertion'], start: '/comparison', expected: '旧2与新3对齐，已输入邮箱与前置状态完整保留' })
      .system('新版多了一步预览', shot('cd_after'))
      .click('cd_match', '按发送动作对齐，不按序号', ...matched(), uses('semantics', 'complete_state'))
      .click('cd_context', '展开被隐藏的未变上下文', set($.ui.context, true), highlight('cd_context_rows'))
      .system('跳过展示，不跳过状态恢复', done('两版都有同一邮箱和正确的发送结果')),
    added: flow('全新场景使用新版全宽', { cases: ['added'], start: '/comparison', expected: '只有新版，明确标为新增' })
      .click('cd_added', '新增没有旧版可对比', set($.ui.kind, '新增'), set($.ui.scenario, '批量邀请'), set($.ui.beforeVisible, false), set($.ui.span, 12), set($.ui.afterTitle, '批量邀请'), set($.ui.afterStep, '新版 · 第 1 步'), set($.ui.afterState, '已选中 3 位成员'), set($.ui.afterValue, '示例：小林、小周、小陈'), set($.ui.status, '新增场景 · 新版全宽'), uses('layout'))
      .system('新功能获得完整展示空间', shot('cd_after'), done('新增场景不用空白旧栏占据一半画面')),
    removed: flow('删除场景使用旧版全宽', { cases: ['removed'], start: '/comparison', expected: '只有旧版，明确标为删除' })
      .click('cd_removed', '保留被删掉的行为供查看', set($.ui.kind, '删除'), set($.ui.scenario, '旧版邀请流程'), set($.ui.afterVisible, false), set($.ui.span, 12), set($.ui.beforeTitle, '旧版邀请流程'), set($.ui.beforeStep, '旧版 · 第 1 步'), set($.ui.beforeState, '旧邀请入口'), set($.ui.status, '删除场景 · 旧版全宽'), uses('layout'))
      .system('没有新版，不伪造空实现', shot('cd_before'), done('观众知道哪条能力被移除')),
    uncertain: flow('重复动作不强行配对', { cases: ['uncertain'], start: '/comparison', expected: '显示不确定，提供完整上下文，不冒充无变化' })
      .click('cd_uncertain', '两个重试，无法确定对应关系', set($.ui.kind, '匹配不确定'), set($.ui.scenario, '重复重试'), set($.ui.uncertain, true), set($.ui.aligned, false), set($.ui.beforeTitle, '重试 × 2'), set($.ui.afterTitle, '重试 × 3'), set($.ui.beforeStep, '未确定对应位置'), set($.ui.afterStep, '未确定对应位置'), set($.ui.status, 'uncertain · 不猜测匹配'), uses('semantics'))
      .click('cd_context', '保留完整上下文供人工判断', set($.ui.context, true), highlight('cd_context_rows'))
      .system('这里的结论是未知，不是没变', done('保留不确定状态，等待明确身份或人工判断')),
    initial: flow('步骤不变，初始状态也可能变', { cases: ['initial'], start: '/comparison', expected: '0步可见真实初始状态差异，不显示遮挡封面' })
      .click('cd_initial', '先比较还没执行动作的画面', set($.ui.kind, '初始状态变化'), set($.ui.scenario, '初始状态'), set($.ui.beforeStep, '第 0 步 · 初始状态'), set($.ui.afterStep, '第 0 步 · 初始状态'), set($.ui.beforeState, '旧初始状态：等待填写'), set($.ui.afterState, '新初始状态：已带入团队邮箱'), set($.ui.beforeValue, '邮箱为空'), set($.ui.afterValue, 'team@example.com'), set($.ui.status, '初始状态有变化 · 即使步骤内容相同'), uses('complete_state'))
      .system('初始画面也是功能变化', highlight('cd_after'), done('不会只比较步骤文本而漏掉状态变化')),
    drift: flow('独立切场景后，怎样恢复可信对齐', { cases: ['drift'], start: '/comparison', expected: '独立移动即暂停；两侧新回执后才对齐；对齐后保持暂停' })
      .click('cd_play', '比较开始播放', set($.ui.playing, true))
      .click('cd_move', '新版播放器独立切换场景', set($.ui.afterTitle, '查看状态 · 另一场景'), set($.ui.afterStep, '另一场景 · 第 1 步'), set($.ui.playing, false), set($.ui.aligned, false), set($.ui.status, '播放器独立移动 · 已暂停，请重新对齐'), uses('fresh_receipts'))
      .click('cd_realign', '发出对齐命令，清掉旧回执', set($.ui.waiting, true), set($.ui.beforeAck, false), set($.ui.afterAck, false), set($.ui.status, '正在恢复 · 等待两侧新的位置回执'))
      .system('旧版回报目标位置', set($.ui.beforeAck, true), highlight('cd_before_ack'))
      .system('单侧回执还不够', set($.ui.status, '仍在等待新版 · 不使用旧缓存放行'))
      .system('新版回报相同目标场景', set($.ui.afterAck, true), set($.ui.afterTitle, '单人邀请'), set($.ui.afterStep, '第 2 / 4 步 · 新增预览'), set($.ui.aligned, true), set($.ui.status, '两侧新回执已确认 · 保持暂停'), highlight('cd_status'))
      .click('cd_play', '由用户明确恢复播放', set($.ui.playing, true), set($.ui.waiting, false), done('恢复的是对齐状态，自动播放由用户重新开始')),
    stale: flow('旧任务不能覆盖新结果', { cases: ['stale'], start: '/comparison', expected: '明确拒绝过时head/generation，保留当前产物' })
      .system('新的 prepare 已领取下一代', shot('cd_boundary'), set($.ui.generation, '当前 generation 2 · 旧任务持有 1'), uses('baseline'))
      .click('cd_publish', '旧任务完成，先检查发布资格', set($.ui.stale, true), set($.ui.publishResult, '拒绝过时任务 · 当前分享与评论不变'), highlight('cd_publish_result'), uses('immutable'))
      .system('失败有明确恢复路径', done('重新 prepare 并按返回起点构建；不复用旧产物')),
  },
});
