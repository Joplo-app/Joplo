import { feature, question, rule } from '@joplo-app/kit';

export default feature({
  order: 2,
  name: '创作模型：让想法成为可回放的功能',
  goal: '保留功能、方案、情况与行为之间的联系，让一次局部修改可追溯、成功与失败都能看见',
  roles: ['设计 Joplo 的我们', '查看设计过程的用户'],
  pick: 'b-tsx',
  cases: {
    evolution: { title: '从独立数据模型转向 TSX 源文件', dimension: 'main', priority: 'high', expected: '看到原始问题、历史提案及 D28/D29 的选择；不会把重建画面当作历史截图' },
    branches: { title: '初稿只有成功路径，补上失败情况', dimension: 'main', priority: 'high', expected: '成功与失败引用同一画面，状态和结果各自明确' },
    local_edit: { title: '反馈后只修改失败提示', dimension: 'consistency', priority: 'high', expected: '失败提示和重试操作一起更新，其他场景不被整页重画' },
    publication: { title: '发布只带选定方案', dimension: 'permission', expected: '公开画面包含选定方案；规则来源、待决问题与未选方案留在创作侧' },
  },
  rules: {
    visible: rule('画面与演示是入口，确定性校验指出已知缺口，不宣称穷尽业务情况。（DECISIONS D6/D14）', { origin: 'project_material', status: 'confirmed', cases: ['branches'] }),
    source: rule('TSX 源文件是权威源，版本由 Git 管理；组件收集成 IR，行为由步骤数据描述。（D28/D29）', { origin: 'project_material', status: 'confirmed', cases: ['evolution', 'local_edit'] }),
    shared: rule('情况使用基础画面与状态覆盖表达；局部变化必须能回看。（D18、PRD §1.2）', { origin: 'project_material', status: 'confirmed', cases: ['branches', 'local_edit'] }),
    publish: rule('每个功能仅发布 pick 的方案，创作侧规则、缺口和待决问题不进入公开构建。（D22/D33）', { origin: 'project_material', status: 'confirmed', cases: ['publication'] }),
    reconstruction: rule('本场景按 PRD、决策和当前模型重建设计过程，示例成员与结果均为声明状态；不声称正在运行 Agent 或真实业务。', { origin: 'code_observed', status: 'confirmed', cases: ['evolution', 'branches'] }),
  },
  questions: {
    reuse: question('跨项目复用仍按 Q7 保留为后续讨论；本设计只表达项目内 shared/ 复用，不宣称跨项目已支持。', { severity: 'minor', refs: ['local_edit'] }),
  },
});
