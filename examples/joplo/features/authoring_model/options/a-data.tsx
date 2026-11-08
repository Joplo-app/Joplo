import { $, done, excluded, flow, option, set, shot, uses } from '@joplo-app/kit';
import { modelInitial, modelLayers } from '../../../shared/modeling/lab.tsx';

export default option({
  name: 'A · 历史提案：独立设计数据与工具写入',
  idea: '按原始 PRD 与 D18 重建：声明式画面、步骤数据与工具维护设计；D29 后采用 TSX 文件与 Git，不再沿用工具写入作为权威方式',
  focus: '保留设计对象与规则的关系，同时控制创作和局部修改成本',
  tradeoffs: ['把画面、情况与步骤明确建模', '需要额外工具写入协议', '本方案作为历史记录保留，不是当前推荐创作入口'],
  state: { ui: { ...modelInitial(), historical: true }, inputs: { am_email: '' } },
  layers: { decision: modelLayers().decision },
  coverage: {
    branches: excluded('历史提案仅重建已记录的模型取舍；行为覆盖由当前 B 方案呈现。'),
    local_edit: excluded('未保留该提案的局部编辑交互证据，不补造历史场景。'),
    publication: excluded('发布边界由后续 D22/D33 确定，在当前 B 方案演示。'),
  },
  scenarios: {
    proposal: flow('历史提案与后来取舍', { cases: ['evolution'], start: '/modeling', description: '依据文档重建，未宣称为旧版真实截图', expected: '理解历史提案如何被源文件创作方式替代' })
      .card('最初，我们先把设计建模为数据', { sub: '原始 PRD 与 D18 · 本段为文档重建' })
      .system('画面、情况、步骤需要连接', shot('am_old_source'), uses('reconstruction'))
      .click('am_choose_tsx', '后来选择熟悉的源文件创作', shot('am_new_source'), uses('source'))
      .click('am_publish', '公开与创作信息继续分离', set($.ui.published, true), shot('am_public'), uses('publish'))
      .system('本地看板保留这条历史方案', done('当前采用 B；A 的取舍仍可追溯')),
  },
});
