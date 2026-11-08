import { originOption } from '../../../shared/origin/option.tsx';

export default originOption('fold', 'A · 保留三栏，默认收起（历史）',
  '依据 v1 的 opt_fold 重建：保留原有三栏，按需展开情况和检查器。',
  ['改动最小，现有信息仍在原位', '需要记得展开，两侧同时打开时又会拥挤', '缺口数量保持可见']);
