import { feature, rule } from '@joplo-app/kit';

export default feature({
  order: 1,
  name: '工作区减负：第一次用 Joplo 设计自己',
  goal: '回看 2026-11-05 的三种真实布局方案：让原型成为主角，同时保留情况、缺口与规则的入口',
  roles: ['正在设计功能的作者', '观看设计过程的人'],
  cases: {
    first_look: { title: '打开方案先看原型', dimension: 'main', priority: 'high', expected: '主画面可见，创作信息按方案的方式出现' },
    find_gap: { title: '找到还没设计的情况', dimension: 'main', expected: '收起信息后仍有可见的缺口入口' },
    rule: { title: '查看一个元素背后的规则', dimension: 'consistency', expected: '可以看到当时三个方案如何保留规则追溯' },
    compare: { title: '比较真实 A/B/C 与后续决定', dimension: 'main', priority: 'high', expected: '能看清布局取舍；明确 B 是当时决定，后来由 D39 替代' },
  },
  rules: {
    historical_choice: rule('DECISIONS.md D32 记录：用户比较 A/B/C 后采用 B“模式决定信息量”。这是当时的决定，不代表今天的工作区仍采用双模式。', { origin: 'user', status: 'confirmed', cases: ['compare'] }),
    reconstruction: rule('这些画面依据 examples/_v1/joplo-self 的 JSON 与 patch 用当前 Kit 重建；原始归档保持不变。演示中的切换不会修改真实项目或产生审批记录。', { origin: 'code_observed', status: 'confirmed', cases: ['compare'] }),
    later_revision: rule('D39 后来取消演示/审阅双模式，改为左侧情况导航与右侧检查抽屉；该阶段由后续首页和演示页 Feature 展示。', { origin: 'user', status: 'confirmed', cases: ['compare'] }),
  },
  pick: 'b-mode',
});
