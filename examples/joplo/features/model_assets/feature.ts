import { feature, rule } from '@joplo-app/kit';
export default feature({
  order: 18,
  name: '3D 模型：生成一次，离线复用',
  goal: '作者明确知道何时花钱、产物在哪里，队友和观众不依赖作者的密钥或电脑',
  pick: 'a-explicit',
  cases: {
    generate: { title: '缺少模型，确认费用后生成', dimension: 'main', expected: '先看到每项 credits，再在 CLI 确认；生成产物写进项目' },
    offline: { title: '换电脑或离线构建', dimension: 'consistency', expected: '复用 Git 中的 GLB，无需密钥或网络' },
    recover: { title: '任务进行中断网', dimension: 'async', expected: '保留 task_id，续查同一任务；不盲目重复创建' },
  },
  rules: {
    spend: rule('每次生成显示预计 credits，非交互环境需要显式 allow-spend。来源：D90、P1-E 用户已定。', {origin:'user',status:'confirmed',cases:['generate']}),
    offline: rule('GLB 和元数据进 Git；check/build/render 读取已有产物，不调用 Tripo。来源：D90。', {origin:'user',status:'confirmed',cases:['offline']}),
    recovery: rule('本地超时不代表退款；未知创建结果必须先恢复任务，不能盲目重试。来源：P1-E API 契约和实现。', {origin:'code_observed',status:'confirmed',cases:['recover']}),
  },
});
