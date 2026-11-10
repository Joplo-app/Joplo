import { $, done, explain, flow, work, set, uses } from '@joplo-app/kit';
import { originState, originWorkspace, type OriginVariant } from './workspace.tsx';

const select = (variant: OriginVariant) => [
  set($.ui.variant, variant), set($.ui.leftOpen, false), set($.ui.rightOpen, false),
  set($.ui.reviewing, false), set($.ui.annotated, false), set($.ui.gap, false), set($.ui.invited, false),
];

/** Each native option preserves its own initial layout; the shared history scene stays visible in publish too. */
export function originOption(variant: OriginVariant, name: string, idea: string, tradeoffs: string[]) {
  return work({
    title: name, summary: idea, focus: '默认少显示多少信息，以及需要时怎样找回规则与情况', tradeoffs,
    on: { '/origin': { main: originWorkspace() } },
    state: { ui: originState(variant) },
    scenarios: {
      history: flow('比较当时的 A、B、C', { start: '/origin', cases: ['compare', 'first_look'], description: '依据真实归档重建三种布局，回看当时的选择与后来修订。', state: { ui: originState('fold') }, expected: '看到真实取舍；知道采用 B 是历史决定' })
        .click('origin_choose_a', '先看 A：保留三栏，默认收起', ...select('fold'), uses('reconstruction')).key('choose-fold')
        .click('origin_a_cases', '展开情况，仍能找到遗漏的分支', set($.ui.leftOpen, true)).key('fold-cases')
        .click('origin_a_rules', '再打开规则，原型重新变窄', set($.ui.rightOpen, true)).key('fold-rules')
        .click('origin_choose_b', '换到 B：先让人专注演示', ...select('mode')).key('choose-mode')
        .click('origin_b_review', '审阅时，两侧信息一起出现', set($.ui.reviewing, true)).key('mode-review')
        .click('origin_choose_c', 'C 保留情况栏，把规则放在元素旁', ...select('annotations')).key('choose-annotations')
        .click('origin_c_annotation', '点标注就能看见邀请规则', set($.ui.annotated, true)).key('show-annotation')
        .click('origin_choose_b', 'D32 记载：当时采用了 B', ...select('mode'), set($.ui.decision, true), uses('historical_choice')).key('recorded-choice')
        .system('后来的设计继续改变', set($.ui.later, true), explain('D39 取消演示/审阅双模式。保留这次决定，才能看清新布局为什么出现。'), uses('later_revision'), done('历史选择与今天的设计已区分')).key('later-revision'),
      fold: flow('A：展开信息后，画面再次变挤', { start: '/origin', cases: ['first_look', 'find_gap', 'rule'], state: { ui: originState('fold') }, description: '保留三栏结构，信息可以随时收起。' })
        .click('origin_a_cases', '需要找情况时，展开左栏', set($.ui.leftOpen, true)).key('open-cases')
        .click('origin_gap', '发现尚未表达的邀请失效情况', set($.ui.gap, true)).key('find-gap')
        .click('origin_a_rules', '打开规则检查器，主画面变窄', set($.ui.rightOpen, true)).key('open-rules')
        .click('origin_a_collapse', '收起两侧，回到原型', set($.ui.leftOpen, false), set($.ui.rightOpen, false), done('A 改动小，但需要频繁展开与收起')).key('collapse'),
      mode: flow('B：演示时简洁，审阅时完整', { start: '/origin', cases: ['first_look', 'rule'], state: { ui: originState('mode') }, description: '这是 D32 当时采用的方案，后续仍然发生了改变。' })
        .click('origin_invite', '演示时，注意力留在邀请操作', set($.ui.invited, true)).key('use-prototype')
        .click('origin_b_review', '需要检查时，切换到审阅模式', set($.ui.reviewing, true)).key('open-review')
        .click('origin_gap', '检查还没有设计的情况', set($.ui.gap, true)).key('check-gap')
        .click('origin_b_demo', '回到演示，收起创作信息', set($.ui.reviewing, false), uses('historical_choice'), done('B 让演示简洁，但审阅仍是三栏')).key('return-demo'),
      annotations: flow('C：规则直接放在元素旁', { start: '/origin', cases: ['rule', 'find_gap'], state: { ui: originState('annotations') }, description: '规则离操作更近，也可能遮住原型。' })
        .click('origin_c_annotation', '查看邀请按钮旁的规则标注', set($.ui.annotated, true)).key('open-annotation')
        .click('origin_gap', '情况栏保留还没表达的分支', set($.ui.gap, true)).key('find-gap')
        .click('origin_c_hide', '收起标注，让画面恢复清晰', set($.ui.annotated, false), done('C 更贴近画面，需要控制标注密度')).key('hide-annotation'),
    },
  });
}
