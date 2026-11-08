import { feature, question, rule } from '@joplo-app/kit';

export default feature({
  order: 12,
  name: '功能差异：看见一次迭代改变了什么',
  goal: '从固定 PR 起点看累计演示变化，对齐有把握的步骤，明确不确定、失败与尚未发布的边界',
  roles: ['设计 Joplo 的我们', '评审功能变化的人'],
  pick: 'a-immutable',
  cases: {
    rationale: { title: '从源码变化到功能变化', dimension: 'main', priority: 'high', expected: '理解为什么比较场景行为、固定基线，并采用新增单栏与修改双栏' },
    insertion: { title: '插入一步后，后续动作仍然对齐', dimension: 'consistency', priority: 'high', expected: '旧第2步与新第3步按稳定身份匹配，跳过未变步骤仍恢复前置状态' },
    added: { title: '全新场景没有旧版', dimension: 'main', expected: '只显示新版全宽，明确新增' },
    removed: { title: '旧场景被删除', dimension: 'lifecycle', expected: '只显示旧版全宽，明确删除' },
    uncertain: { title: '重复动作无法可靠匹配', dimension: 'input', priority: 'high', expected: '显示 uncertain 和完整上下文，不猜测配对，也不报告无变化' },
    initial: { title: '步骤没变，初始状态变了', dimension: 'consistency', expected: '在0步直接展示初始状态变化，不被封面遮挡' },
    drift: { title: '一侧独立切场景后再对齐', dimension: 'interrupt', priority: 'high', expected: '立即暂停并失效旧确认，只有两侧新回执才恢复对齐，恢复后仍暂停' },
    stale: { title: '旧 head 或旧 generation 任务完成', dimension: 'conflict', priority: 'high', expected: '旧任务不能覆盖当前分享与评论，用户知道要重新 prepare 和构建' },
  },
  rules: {
    baseline: rule('首次 prepare 固定 PR 比较起点；后续使用返回的基线，不把缺失基线伪装成新增。（Cloud CONTRACT v1）', { origin: 'project_material', status: 'confirmed', cases: ['rationale', 'stale'] }),
    semantics: rule('步骤序号只是地址；稳定 key 或保守内容/动作匹配决定对应关系，重复候选标记 uncertain。（4603038、Core feature-diff）', { origin: 'code_observed', status: 'confirmed', cases: ['insertion', 'uncertain'] }),
    complete_state: rule('过滤未变步骤只改变观看范围，回放必须恢复完整前置状态；初始状态变化仍标记变化。', { origin: 'code_observed', status: 'confirmed', cases: ['insertion', 'initial'] }),
    layout: rule('新增场景新版单栏、修改双栏、删除旧版单栏；不制造不存在的另一版。（双方契约与已确认原型）', { origin: 'project_material', status: 'confirmed', cases: ['added', 'removed', 'rationale'] }),
    fresh_receipts: rule('独立切场景使对齐失效；每次 realign 都要求两侧目标场景/步骤的新回执，旧缓存不能放行。（397310e）', { origin: 'code_observed', status: 'confirmed', cases: ['drift'] }),
    immutable: rule('每次成功发布新建不可变 comparison Share；检查真实 head 与 generation，旧任务不更新当前产物。', { origin: 'project_material', status: 'confirmed', cases: ['stale'] }),
    boundary: rule('此处回放是依据真实设计和实现重建的原型，使用示例 PR 状态，不调用 GitHub 或 Cloud；新 CLI 尚未 npm 发布。', { origin: 'code_observed', status: 'confirmed', cases: ['rationale', 'stale'] }),
  },
  questions: {
    reset: question('固定基线重置 UI 延后；force-push 后基线不可取得时，本轮选择失败提示，不能静默换起点。', { severity: 'minor', refs: ['stale'] }),
    agent_diff: question('根差异页的跨版本 Agent Markdown/JSON 模型尚未提供；本轮只交付 HTML viewer 和 manifest。', { severity: 'minor', refs: ['rationale'] }),
  },
});
