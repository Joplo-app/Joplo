/** 看板（创作侧）专用的中文标签与芯片样式。不进入发布站。 */
import type { Coverage, Rule } from '@tokenroll/joplo-core';

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

/** 检查器里的类型名：Mantine 名称原样显示，附中文说明。 */
const TYPE_ZH: Record<string, string> = {
  AppShell: '应用外壳',
  'AppShell.Header': '顶栏',
  'AppShell.Navbar': '侧边导航',
  'AppShell.Main': '主内容区',
  'AppShell.Aside': '右侧栏',
  'AppShell.Footer': '底栏',
  Stack: '纵向排列',
  Group: '横向排列',
  SimpleGrid: '网格',
  Grid: '栅格',
  Card: '卡片',
  Paper: '面板',
  Title: '标题',
  Text: '文字',
  Button: '按钮',
  ActionIcon: '图标按钮',
  CloseButton: '关闭按钮',
  Anchor: '链接',
  a: '链接',
  NavLink: '导航项',
  Burger: '导航开关',
  TextInput: '输入框',
  PasswordInput: '密码框',
  NumberInput: '数字输入',
  Textarea: '文本域',
  Select: '选择器',
  MultiSelect: '多选器',
  Checkbox: '复选框',
  'Radio.Group': '单选组',
  Radio: '单选项',
  Switch: '开关',
  SegmentedControl: '分段控件',
  FileInput: '文件选择',
  Tabs: '标签页',
  'Tabs.Tab': '标签',
  'Accordion.Control': '折叠标题',
  Pagination: '分页',
  Modal: '弹窗',
  Drawer: '抽屉',
  Alert: '行内提示',
  Notification: '通知条',
  DataTable: '数据表',
  Table: '表格',
  Badge: '徽标',
  Loader: '加载状态',
  ChatMessage: '对话消息',
  ToolCall: '工具调用',
  PromptInput: '提示词输入',
  Terminal: '终端',
  'Terminal.Command': '终端命令',
  'Terminal.Output': '终端输出',
  'Terminal.Input': '终端输入',
  Phone: '手机外框',
  Placeholder: '占位',
  Custom: '自定义组件',
  '#text': '文本',
};
export const typeLabel = (t: string) => (TYPE_ZH[t] ? `${t}（${TYPE_ZH[t]}）` : t);
