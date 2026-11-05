/** 看板（创作侧）专用的中文标签与芯片样式。不进入发布站。 */
import type { Coverage, Rule } from '@joplo/core';

export const COVERAGE_LABEL: Record<Coverage['status'], { text: string; cls: string; hint: string }> = {
  expressed: { text: '已表达', cls: 'border-[#1c5fb8] bg-[#eef4ff] text-[#1c5fb8]', hint: '方案中有演示场景表达了这个情况（不代表业务已确认正确）' },
  undecided: { text: '待决定', cls: 'border-[#b35c00] bg-[#fff4e0] text-[#8a4700] font-semibold', hint: '如何处理还没有决定' },
  missing: { text: '缺失', cls: 'border-[#c92a2a] bg-[#fff0f0] text-[#c92a2a] font-semibold', hint: '方案还没有表达这个情况' },
  not_applicable: { text: '不适用', cls: 'border-[#9a9a9a] bg-[#f4f4f4] text-[#5a5a5a]', hint: '这个情况对本方案不适用' },
  excluded: { text: '已排除', cls: 'border-[#9a9a9a] bg-white text-[#6b6b6b] line-through decoration-1', hint: '明确排除在本次范围之外' },
};

export const ORIGIN_LABEL: Record<Rule['origin'], { text: string; cls: string }> = {
  user: { text: '用户', cls: 'border-[#3a3a3a] bg-white text-[#1e1e1e]' },
  ai_assumption: { text: 'AI 假设', cls: 'border-dashed border-[#b35c00] bg-[#fff4e0] text-[#8a4700] font-semibold' },
  project_material: { text: '项目材料', cls: 'border-[#5a5a5a] bg-[#f4f4f4] text-[#3a3a3a]' },
  code_observed: { text: '代码观察', cls: 'border-[#5a5a5a] bg-[#f4f4f4] text-[#3a3a3a]' },
  feedback: { text: '人工反馈', cls: 'border-[#6741d9] bg-[#f3f0ff] text-[#5f3dc4]' },
};

export const CONFIRM_LABEL: Record<Rule['confirmation'], { text: string; cls: string }> = {
  confirmed: { text: '已确认', cls: 'border-[#2b8a3e] bg-[#effaf1] text-[#2b8a3e]' },
  pending: { text: '待确认', cls: 'border-[#b35c00] bg-white text-[#8a4700]' },
  conflict: { text: '冲突', cls: 'border-[#c92a2a] bg-[#fff0f0] text-[#c92a2a] font-semibold' },
  out_of_scope: { text: '不在范围', cls: 'border-[#9a9a9a] bg-white text-[#6b6b6b]' },
};

export const DIMENSION_LABEL: Record<string, string> = {
  main: '主流程',
  input: '输入',
  permission: '权限',
  lifecycle: '生命周期',
  async: '异步',
  interrupt: '中断',
  conflict: '冲突',
  consistency: '一致性',
};

export const SEVERITY_LABEL: Record<string, string> = { blocker: '阻断', major: '重要', minor: '次要' };

/** 检查器里的类型名：shadcn 名称原样显示，附中文说明。 */
const TYPE_ZH: Record<string, string> = {
  Button: '按钮',
  Input: '输入框',
  Textarea: '文本域',
  Select: '选择器',
  Checkbox: '复选框',
  RadioGroup: '单选组',
  Switch: '开关',
  Tabs: '标签页',
  TabsTrigger: '标签',
  SidebarMenuButton: '导航项',
  Link: '链接',
  a: '链接',
  Dialog: '弹窗',
  Sheet: '侧滑面板',
  AlertDialog: '确认弹窗',
  Alert: '行内提示',
  Card: '卡片',
  DataTable: '数据表',
  Table: '表格',
  Label: '标签文字',
  Badge: '徽标',
  Loader: '加载状态',
  Placeholder: '占位',
  Custom: '自定义组件',
  PromptInputTextarea: '提示词输入',
  PromptInputSubmit: '发送按钮',
  '#text': '文本',
};
export const typeLabel = (t: string) => (TYPE_ZH[t] ? `${t}（${TYPE_ZH[t]}）` : t);
