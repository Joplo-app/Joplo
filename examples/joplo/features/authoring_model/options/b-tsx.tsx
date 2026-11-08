import { $, done, explain, flow, highlight, option, set, shot, uses } from '@joplo-app/kit';
import { modelInitial, modelLayers } from '../../../shared/modeling/lab.tsx';

const open = [set($.ui.modal, true), set($.ui.model, true)];
export default option({
  name: 'B · TSX 源文件与路径堆叠',
  idea: 'D28/D29 采用源文件作为权威源，以 routes 定义页面、Feature 方案叠加内容；状态与步骤仍是可校验数据',
  focus: '让局部修改足够快，同时不丢掉情况、规则与可回放行为',
  tradeoffs: ['Agent 使用熟悉的 TSX 与文件编辑', '行为通过编译后的 IR 回放，不执行任意应用逻辑', '项目内 shared 复用可用，跨项目复用仍是独立边界'],
  state: { ui: modelInitial(), inputs: { am_email: '' } },
  layers: modelLayers(),
  scenarios: {
    evolution: flow('设计演进：从数据工具到 TSX', { cases: ['evolution'], start: '/modeling', description: '依据 PRD 和 D18/D28/D29 重建设计取舍；不是历史会议录屏', expected: '看见采用 TSX 的原因，同时保留“行为是数据”的约束' })
      .card('只有顺利路径，留下的设计不够', { sub: 'Joplo 最初的问题：画面、规则、失败情况容易脱节。' })
      .system('最初：独立设计数据', shot('am_old_source'), uses('reconstruction'))
      .system('第二轮：让 Agent 直接改文件', shot('am_new_source'), highlight('am_new_source'), uses('source'))
      .click('am_choose_tsx', '回到采用后的设计模型', ...open, set($.ui.stage, '文件成为权威源，行为仍然是数据'), set($.ui.note, '页面、方案与场景分开组织；同一个画面可以覆盖不同情况。'), shot('am_lab'))
      .click('am_structure', '成功和失败都成为明确场景', set($.ui.model, true), highlight('am_tree'), uses('visible'))
      .click('am_failure', '用失败情况检查这个选择', set($.ui.failed, true), shot('am_form'))
      .system('采用的是创作方式，不是虚构后端', explain('这里回放声明状态，不会执行真实邀请。'), done('设计意图与可见行为放在同一项目')),
    branches: flow('只有成功的初稿，补上失败', { cases: ['branches'], start: '/modeling', expected: '同一邀请画面呈现两条场景，失败结果不被成功画面替代' })
      .click('am_structure', '先把遗漏的情况列出来', ...open, set($.ui.stage, '补上能改变设计的情况'), set($.ui.note, '错误不是一句说明：需要可见反馈、保留输入和下一步。'), uses('visible', 'shared'))
      .type('am_email', 'teammate@example.com', '场景写入固定示例邮箱')
      .click('am_send', '先回看顺利路径', set($.ui.modal, false), set($.ui.sent, true), highlight('am_sent'))
      .click('am_failure', '切到相同页面的失败情况', set($.ui.modal, true), set($.ui.sent, false), set($.ui.failed, true), shot('am_form'))
      .system('失败也成为一条可回放路径', done('成功与失败都可见，不宣称情况已经穷尽')),
    local_edit: flow('针对失败反馈做局部迭代', { cases: ['local_edit'], start: '/modeling', state: { ui: { ...modelInitial(), model: true, modal: true, failed: true } }, expected: '保留输入，只修改错误提示与重试动作，再回看成功路径' })
      .type('am_email', 'teammate@example.com', '邮箱仍然留在失败画面')
      .click('am_revise', '把模糊失败改成可恢复状态', set($.ui.revised, true), set($.ui.stage, '一次局部修改，影响可以回看'), set($.ui.note, '只调整这条失败路径：说明原因、保留邮箱、给出重新发送。'), highlight('am_error'), uses('source', 'shared'))
      .click('am_retry', '重新发送，场景给出成功结果', set($.ui.failed, false), set($.ui.sent, true), set($.ui.modal, false), highlight('am_sent'))
      .click('am_success', '回看原本的成功路径', set($.ui.revised, false), set($.ui.modal, true), set($.ui.sent, false))
      .click('am_send', '正常路径仍然成立', set($.ui.modal, false), set($.ui.sent, true), done('局部迭代后，两种情况都有明确结果')),
    publication: flow('设计记录怎样公开给观众', { cases: ['publication'], start: '/modeling', expected: '公开的是选定方案与主动编写的设计演进，不是私有评审清单' })
      .system('写与看分离', shot('am_decision'))
      .click('am_publish', '只构建明确选定的公开内容', set($.ui.published, true), highlight('am_public'), uses('publish'))
      .system('历史记录也要主动整理', done('观众能看到设计过程，创作侧私有信息不随之公开')),
  },
});
