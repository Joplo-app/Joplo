import { originOption } from '../../../shared/origin/option.tsx';

export default originOption('mode', 'B · 模式决定信息量（当时采用）',
  '依据 v1 的 opt_mode 重建。D32 采用 B，D39 后来取消双模式；本方案同时保留可公开回放的 A/B/C 设计过程。',
  ['演示和会议最干净', '审阅模式仍然是三栏，拥挤只解决了一半', '切换模式会改变整体布局']);
