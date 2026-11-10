import { originOption } from '../../../shared/origin/option.tsx';

export default originOption('annotations', 'C · 规则就地标注（历史）',
  '依据 v1 的 opt_anno 重建：取消右侧检查器，规则以编号标注贴在相关元素旁。',
  ['规则离画面最近，追溯路径短', '保留一列情况栏，节省横向空间', '改动最大，标注过多可能遮挡原型']);
