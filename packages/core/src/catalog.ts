/**
 * 组件目录 v3（D35）：名称与属性对齐 Mantine（数据表对齐 mantine-datatable），另加少量 AI 交互组件、
 * HTML 兜底标签和 Joplo 专用组件。复合组件用点语法：`<AppShell.Header>` 编译出的节点 type 就是 'AppShell.Header'。
 *
 * 目录是唯一来源：@joplo/kit/ui 的导出、渲染器（@joplo/web）的实现、COMPONENT_DOCS 都必须与 COMPONENT_TYPES 一致
 * （packages/core/test/catalog.test.ts 与渲染器的类型检查保证）。目录之外的名称在编译时报错，不会被静默渲染。
 * 只换词汇，不换渲染：运行时不引入 Mantine，仍由 Joplo 渲染成低保真风格。
 */

/** 布局、展示与容器：不可操作。 */
const STRUCTURE = [
  // 布局
  'AppShell', 'AppShell.Header', 'AppShell.Navbar', 'AppShell.Main', 'AppShell.Aside', 'AppShell.Footer',
  'Container', 'Stack', 'Group', 'Flex', 'Grid', 'Grid.Col', 'SimpleGrid', 'Center', 'Box', 'Space',
  'Paper', 'Card', 'Card.Section', 'Divider', 'ScrollArea',
  // 文字与展示
  'Title', 'Text', 'Code', 'Kbd', 'Blockquote', 'List', 'List.Item', 'Badge', 'Avatar', 'Image', 'ThemeIcon', 'Indicator',
  'Timeline', 'Timeline.Item',
  'Table', 'Table.Thead', 'Table.Tbody', 'Table.Tr', 'Table.Th', 'Table.Td', 'DataTable',
  'Accordion', 'Accordion.Item', 'Accordion.Panel',
  'Radio',
  // 导航
  'Tabs.List', 'Tabs.Panel', 'Breadcrumbs', 'Stepper', 'Stepper.Step',
  // 反馈与浮层
  'Alert', 'Loader', 'Progress', 'RingProgress', 'Skeleton', 'Notification', 'Modal', 'Drawer',
  // AI 交互（Joplo 自有）
  'ChatMessage', 'ToolCall',
  // HTML 兜底
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'main', 'section', 'header', 'footer', 'nav', 'aside', 'ul', 'ol', 'li', 'strong', 'em', 'small', 'code',
  // Joplo
  'Placeholder', // props: label, h —— 图片/图表等占位
  'Custom', // props: kind —— 逃生口：目录没有的组件，渲染为带说明的占位框
  '#text', // 编译器生成的文本节点：props.text 为字面量或 `$ui.x` 绑定
] as const;

/** 看起来可操作：必须有演示行为、明确禁用并说明原因，或标记 unmodeled。 */
const INTERACTIVE = [
  'Button', 'ActionIcon', 'CloseButton', 'Anchor', 'a', 'NavLink', 'Burger',
  'TextInput', 'PasswordInput', 'NumberInput', 'Textarea', 'Select', 'MultiSelect', 'Checkbox', 'Radio.Group', 'Switch',
  'SegmentedControl', 'FileInput', 'Tabs', 'Tabs.Tab', 'Accordion.Control', 'Pagination', 'PromptInput',
] as const;

export const COMPONENT_TYPES = [...STRUCTURE, ...INTERACTIVE] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const INTERACTIVE_TYPES: ReadonlySet<string> = new Set<string>(INTERACTIVE);

/** 可接收输入值；type/select/toggle 动作写入 state.inputs[nodeId]。 */
export const VALUE_TYPES: ReadonlySet<string> = new Set<string>([
  'TextInput', 'PasswordInput', 'NumberInput', 'Textarea', 'Select', 'MultiSelect', 'Checkbox', 'Radio.Group', 'Switch',
  'SegmentedControl', 'FileInput', 'Tabs', 'Accordion', 'Pagination', 'PromptInput',
]);

/** 只有 opened（兼容旧写法 open）为真时自身和子节点才可见的浮层。 */
export const GATED_CONTAINERS: ReadonlySet<string> = new Set<string>(['Modal', 'Drawer']);

/** Joplo 在 Mantine 属性之外追加的属性，编译器会从 props 中取出，放到节点字段上。 */
export const JOPLO_PROPS = ['id', 'when', 'disabledReason', 'unmodeled', 'note'] as const;

/**
 * 每个组件一行常用属性提示（`joplo skill components` 由此生成）。所有组件另外都接受：
 * 样式属性 m/mt/mb/ml/mr/mx/my、p/pt/pb/pl/pr/px/py、w/h/miw/maw/mih/mah、c/bg/fz/fw/ta/ff/lh/opacity，
 * 响应式写成 { base, xs, sm, md, lg, xl }；visibleFrom / hiddenFrom；以及 Joplo 属性 id/when/disabled/disabledReason/unmodeled/note。
 */
export const COMPONENT_DOCS: Record<ComponentType, string> = {
  AppShell: 'header={{ height }}, navbar={{ width, breakpoint, collapsed: { mobile, desktop } }}, aside={{ width, breakpoint, collapsed }}, footer={{ height }}, padding；窄于 breakpoint 时导航收起并显示 Burger',
  'AppShell.Header': '顶栏；p, px',
  'AppShell.Navbar': '侧边导航；p；放 NavLink',
  'AppShell.Main': '主内容区；放 <Outlet />',
  'AppShell.Aside': '右侧栏；p',
  'AppShell.Footer': '底栏；p',
  Container: 'size: xs|sm|md|lg|xl|number（默认 md）, fluid',
  Stack: 'gap（默认 md）, align, justify —— 纵向排列',
  Group: 'gap（默认 md）, justify, align（默认 center）, wrap, grow —— 横向排列',
  Flex: 'direction, gap, rowGap, columnGap, align, justify, wrap —— 均可响应式',
  Grid: 'columns（默认 12）, gutter, justify, align, grow；子元素用 Grid.Col',
  'Grid.Col': 'span: number|"auto"|"content"|{ base, md }, offset',
  SimpleGrid: 'cols={{ base: 1, md: 3 }}, spacing, verticalSpacing',
  Center: 'inline —— 内容居中',
  Box: '通用容器，只用样式属性',
  Space: 'h, w —— 空白间隔',
  Paper: 'p, withBorder, shadow, radius',
  Card: 'padding（默认 md）, withBorder, shadow, radius；Card.Section 贴边分区',
  'Card.Section': 'withBorder, inheritPadding',
  Divider: 'label, labelPosition: left|center|right, orientation, my',
  ScrollArea: 'h, mah',
  Title: 'order: 1-6；文字写在子节点',
  Text: 'size: xs|sm|md|lg|xl, c: dimmed|red|green|…, fw, ta, truncate, lineClamp, span；保留换行',
  Code: 'block（多行代码块）, color',
  Kbd: '键盘按键',
  Blockquote: 'cite, color',
  List: 'type: ordered|unordered, spacing；子元素用 List.Item',
  'List.Item': '列表项',
  Badge: 'color, variant: filled|light|outline|dot|default, size',
  Avatar: 'name（显示首字）, src, color, radius, size',
  Image: 'src, alt, h, w, radius —— 渲染为带 alt 的占位',
  ThemeIcon: 'color, variant, size, radius；子节点放一个字符',
  Indicator: 'label, color, disabled；包裹一个元素，在角上显示标记',
  Timeline: 'active（已完成到第几项）, bulletSize；子元素用 Timeline.Item',
  'Timeline.Item': 'title, bullet；子节点是说明',
  Table: 'data={{ head: [...], body: [[...]] }} 或 Table.Thead/Tbody/Tr/Th/Td；striped, withTableBorder',
  'Table.Thead': '表头',
  'Table.Tbody': '表体',
  'Table.Tr': '行',
  'Table.Th': '表头单元格',
  'Table.Td': '单元格',
  DataTable: 'records（可绑定 $.data.x）, columns: [{ accessor, title }], noRecordsText —— 对齐 mantine-datatable',
  Accordion: 'value / defaultValue（展开项）；select 动作写入展开项；子元素用 Accordion.Item',
  'Accordion.Item': 'value；内含 Accordion.Control 与 Accordion.Panel',
  'Accordion.Panel': '展开后显示的内容',
  Radio: 'value, label —— 放在 Radio.Group 里',
  'Tabs.List': '标签栏；放 Tabs.Tab',
  'Tabs.Panel': 'value —— 当前标签的内容',
  Breadcrumbs: 'separator；子节点放 Anchor 或文字',
  Stepper: 'active（从 0 开始）；子元素用 Stepper.Step',
  'Stepper.Step': 'label, description；子节点是该步内容（只显示当前步）',
  Alert: 'title, color（默认 blue）, variant；子节点是说明',
  Loader: 'size, color, type；可带子文字',
  Progress: 'value 0-100, color, size, striped',
  RingProgress: 'sections: [{ value, color }], label, size, thickness',
  Skeleton: 'h, w, circle, radius, visible',
  Notification: 'title, color, loading, withCloseButton —— 页面内的通知条（临时提示用步骤里的 toast）',
  Modal: 'opened（门控，常写 opened={$.ui.open}）, title, size, centered, fullScreen',
  Drawer: 'opened（门控）, title, position: left|right|top|bottom（默认 left）, size',
  ChatMessage: "from: 'user'|'assistant', name；子节点是消息内容（保留换行）",
  ToolCall: "title, state: 'running'|'done'|'error'；子节点是调用详情",
  div: 'HTML 兜底，建议改用 Box/Stack/Group',
  span: 'HTML 兜底，建议改用 Text span',
  p: 'HTML 兜底，建议改用 Text',
  h1: 'HTML 兜底，建议改用 Title order={1}',
  h2: 'HTML 兜底，建议改用 Title order={2}',
  h3: 'HTML 兜底，建议改用 Title order={3}',
  h4: 'HTML 兜底，建议改用 Title order={4}',
  main: 'HTML 兜底，建议改用 AppShell.Main',
  section: 'HTML 兜底，建议改用 Box',
  header: 'HTML 兜底，建议改用 AppShell.Header',
  footer: 'HTML 兜底，建议改用 AppShell.Footer',
  nav: 'HTML 兜底，建议改用 AppShell.Navbar',
  aside: 'HTML 兜底，建议改用 AppShell.Aside',
  ul: 'HTML 兜底，建议改用 List',
  ol: 'HTML 兜底，建议改用 List type="ordered"',
  li: 'HTML 兜底，建议改用 List.Item',
  strong: 'HTML 兜底，建议改用 Text fw={700} span',
  em: 'HTML 兜底，建议改用 Text fs="italic" span',
  small: 'HTML 兜底，建议改用 Text size="xs"',
  code: 'HTML 兜底，建议改用 Code',
  Placeholder: 'label, h —— 图片、图表等占位',
  Custom: 'kind —— 目录没有的组件，渲染为带说明的占位框',
  '#text': '编译器生成的文本节点（不要直接使用）',
  Button: 'variant: filled|light|outline|subtle|default|white, color, size, fullWidth, loading, leftSection（字符）',
  ActionIcon: "图标按钮：aria-label（必写，用作名称）, variant, color, size；子节点放一个字符如 '+'",
  CloseButton: 'aria-label, size',
  Anchor: 'href（看板内路径，不会真正跳转）, c, underline',
  a: 'HTML 兜底，建议改用 Anchor',
  NavLink: 'label, description, href（等于当前路径时高亮）, active, leftSection（字符）；可嵌套 NavLink',
  Burger: 'opened, aria-label —— 窄屏导航开关，常配 hiddenFrom="sm"',
  TextInput: 'label, placeholder, description, error, withAsterisk, type —— type 动作写入',
  PasswordInput: 'label, placeholder, description, error —— type 动作写入，显示为圆点',
  NumberInput: 'label, placeholder, min, max, suffix, prefix —— type 动作写入',
  Textarea: 'label, placeholder, description, error, minRows, autosize —— type 动作写入',
  Select: 'label, data: string[] | { value, label }[], placeholder, description —— select 动作接受 value 或 label',
  MultiSelect: 'label, data, placeholder —— 每次 select 动作切换一个选项',
  Checkbox: 'label, description, checked —— toggle 动作写入',
  'Radio.Group': 'label, value；子元素用 Radio value/label —— select 动作接受 value 或 label',
  Switch: 'label, description, checked —— toggle 动作写入',
  SegmentedControl: 'data: string[] | { value, label }[], fullWidth —— select 动作接受 value 或 label',
  FileInput: 'label, placeholder, accept —— type 动作写入文件名',
  Tabs: 'value / defaultValue；Tabs.List 内放 Tabs.Tab，Tabs.Panel 放内容 —— select 动作切换标签',
  'Tabs.Tab': 'value, leftSection（字符）',
  'Accordion.Control': '可点击的标题（需要 id）',
  Pagination: 'total, value / defaultValue —— select 动作写入页码',
  PromptInput: 'placeholder —— AI 输入框，type 动作写入；发送按钮用 ActionIcon 或 Button',
};

// ---------- 响应式（Mantine 默认断点，按舞台宽度取值） ----------

/** Mantine 默认断点：36/48/62/75/88em，按 16px 换算。 */
export const BREAKPOINTS = { xs: 576, sm: 768, md: 992, lg: 1200, xl: 1408 } as const;
export type Breakpoint = keyof typeof BREAKPOINTS;
const BP_KEYS = ['base', 'xs', 'sm', 'md', 'lg', 'xl'] as const;

/** 页面 viewport 对应的舞台尺寸。 */
export const VIEWPORT_SIZE = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } } as const;

/** 是否为响应式对象 `{ base, sm, md }`：普通对象，至少一个键，且全部键都是断点名。 */
export function isResponsive(v: unknown): v is Partial<Record<(typeof BP_KEYS)[number], unknown>> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && keys.every((k) => (BP_KEYS as readonly string[]).includes(k));
}

/** 按舞台宽度取响应式属性的值：取不超过宽度的最大断点；都不满足时取 base；非响应式值原样返回。 */
export function atWidth(v: unknown, width: number): unknown {
  if (!isResponsive(v)) return v;
  let out: unknown = undefined;
  for (const k of BP_KEYS) {
    if (!(k in v)) continue;
    const min = k === 'base' ? 0 : BREAKPOINTS[k];
    if (width >= min) out = v[k];
  }
  return out;
}

/** 断点名、数字（px）或 `40em` / `600px` 字符串 → 像素；无法识别返回 null。 */
export function breakpointPx(bp: unknown): number | null {
  if (typeof bp === 'number' && Number.isFinite(bp)) return bp;
  if (typeof bp !== 'string') return null;
  if (bp in BREAKPOINTS) return BREAKPOINTS[bp as Breakpoint];
  const m = /^(\d+(?:\.\d+)?)(px|em|rem)?$/.exec(bp.trim());
  if (!m) return null;
  return m[2] === 'em' || m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
}

/** visibleFrom / hiddenFrom：在给定舞台宽度下是否被隐藏。 */
export function hiddenAtWidth(props: Record<string, unknown> | undefined, width: number): boolean {
  if (!props) return false;
  const from = breakpointPx(props.visibleFrom);
  if (from !== null && width < from) return true;
  const until = breakpointPx(props.hiddenFrom);
  if (until !== null && width >= until) return true;
  return false;
}

// ---------- 选项（Select / SegmentedControl / MultiSelect 的 data） ----------

export type Choice = { value: string; label: string };

/** Mantine 的 data：string[]、{ value, label }[]，或分组 { group, items }[]。 */
export function choicesFromData(data: unknown): Choice[] {
  if (!Array.isArray(data)) return [];
  const out: Choice[] = [];
  for (const d of data) {
    if (typeof d === 'string' || typeof d === 'number') out.push({ value: String(d), label: String(d) });
    else if (d && typeof d === 'object') {
      const o = d as Record<string, unknown>;
      if (Array.isArray(o.items)) out.push(...choicesFromData(o.items));
      else if (o.value !== undefined && o.value !== null) out.push({ value: String(o.value), label: typeof o.label === 'string' ? o.label : String(o.value) });
    }
  }
  return out;
}

/** 按 value 或 label 匹配一个选项。 */
export function matchChoice(choices: Choice[], v: string): Choice | null {
  return choices.find((c) => c.value === v) ?? choices.find((c) => c.label === v) ?? null;
}

// ---------- 标签 ----------

const IS_BINDING = /^\$(?:ui|data|inputs)(?:\.|$)/;

type LabelNode = { type: string; props?: Record<string, unknown>; children?: LabelNode[] };

/** 元素的人类可读标签：优先 label/title/aria-label/placeholder 等属性（Mantine 输入组件直接带 label），其次子文本。 */
export function nodeLabel(node: LabelNode): string {
  const p = node.props ?? {};
  for (const k of ['label', 'title', 'aria-label', 'placeholder', 'name', 'kind', 'alt']) {
    const v = p[k];
    if (typeof v === 'string' && v && !IS_BINDING.test(v)) return v;
  }
  const text = collectText(node).trim();
  return text || node.type;
}

function collectText(node: LabelNode): string {
  if (node.type === '#text') {
    const t = node.props?.text;
    return typeof t === 'string' && !IS_BINDING.test(t) ? t : '';
  }
  return (node.children ?? []).map(collectText).join('');
}
