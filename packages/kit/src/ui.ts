/**
 * 原型组件：名称与属性对齐 Mantine（数据表对齐 mantine-datatable），复合组件用点语法（AppShell.Header、Tabs.Tab）。
 * 布局写成属性：<Stack gap="md">、<Group justify="space-between">、<SimpleGrid cols={{ base: 1, md: 3 }}>，
 * 不需要 className；响应式对象与 visibleFrom / hiddenFrom 按舞台宽度生效。
 *
 * 另可加 Joplo 属性：id（可操作元素必填）、when（可见条件）、disabled（布尔或条件）、disabledReason、unmodeled、note。
 * 行为（点击后发生什么）不写在组件上，写在 option 的 flow 步骤里。浮层用 Modal / Drawer 的 opened={$.ui.x} 控制。
 *
 * 组件清单与 @joplo-app/core 的 COMPONENT_TYPES 一一对应（core/test/catalog.test.ts 检查）。
 */
import { component, type Bind, type CondExpr, type JChild } from './node.ts';

type Responsive<T> = T | { base?: T; xs?: T; sm?: T; md?: T; lg?: T; xl?: T };
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type JoploProps = {
  id?: string;
  when?: Bind | CondExpr;
  disabled?: boolean | Bind | CondExpr;
  /** 字面量，或绑定状态（disabledReason={$.ui.sendHint}），和 disabled 一样跟着状态变。 */
  disabledReason?: string | Bind;
  unmodeled?: boolean;
  note?: string;
  visibleFrom?: Size;
  hiddenFrom?: Size;
  /** 逃生口：Tailwind 类名。优先使用布局组件与样式属性。 */
  className?: string;
  children?: JChild;
  [prop: string]: unknown;
};
export type { Responsive };
type C = (props: JoploProps) => any;

const c = (name: string): C => component(name) as unknown as C;

// ---------- 布局 ----------
export const AppShell = Object.assign(c('AppShell'), {
  Header: c('AppShell.Header'),
  Navbar: c('AppShell.Navbar'),
  Main: c('AppShell.Main'),
  Aside: c('AppShell.Aside'),
  Footer: c('AppShell.Footer'),
});
export const Container = c('Container');
export const Stack = c('Stack');
export const Group = c('Group');
export const Flex = c('Flex');
export const Grid = Object.assign(c('Grid'), { Col: c('Grid.Col') });
export const SimpleGrid = c('SimpleGrid');
export const Center = c('Center');
export const Box = c('Box');
export const Space = c('Space');
export const Paper = c('Paper');
export const Card = Object.assign(c('Card'), { Section: c('Card.Section') });
export const Divider = c('Divider');
export const ScrollArea = c('ScrollArea');

// ---------- 文字与展示 ----------
export const Title = c('Title');
export const Text = c('Text');
export const Code = c('Code');
export const Kbd = c('Kbd');
export const Blockquote = c('Blockquote');
export const List = Object.assign(c('List'), { Item: c('List.Item') });
export const Badge = c('Badge');
export const Avatar = c('Avatar');
export const Image = c('Image');
export const ThemeIcon = c('ThemeIcon');
export const Indicator = c('Indicator');
export const Timeline = Object.assign(c('Timeline'), { Item: c('Timeline.Item') });
export const Table = Object.assign(c('Table'), {
  Thead: c('Table.Thead'),
  Tbody: c('Table.Tbody'),
  Tr: c('Table.Tr'),
  Th: c('Table.Th'),
  Td: c('Table.Td'),
});
export const DataTable = c('DataTable');
export const Accordion = Object.assign(c('Accordion'), {
  Item: c('Accordion.Item'),
  Control: c('Accordion.Control'),
  Panel: c('Accordion.Panel'),
});

// ---------- 输入 ----------
export const Button = c('Button');
export const ActionIcon = c('ActionIcon');
export const CloseButton = c('CloseButton');
export const TextInput = c('TextInput');
export const PasswordInput = c('PasswordInput');
export const NumberInput = c('NumberInput');
export const Textarea = c('Textarea');
export const Select = c('Select');
export const MultiSelect = c('MultiSelect');
export const Checkbox = c('Checkbox');
export const Radio = Object.assign(c('Radio'), { Group: c('Radio.Group') });
export const Switch = c('Switch');
export const SegmentedControl = c('SegmentedControl');
export const FileInput = c('FileInput');

// ---------- 导航 ----------
export const Anchor = c('Anchor');
export const NavLink = c('NavLink');
export const Tabs = Object.assign(c('Tabs'), { List: c('Tabs.List'), Tab: c('Tabs.Tab'), Panel: c('Tabs.Panel') });
export const Breadcrumbs = c('Breadcrumbs');
export const Pagination = c('Pagination');
export const Stepper = Object.assign(c('Stepper'), { Step: c('Stepper.Step') });
export const Burger = c('Burger');

// ---------- 反馈与浮层 ----------
export const Alert = c('Alert');
export const Loader = c('Loader');
export const Progress = c('Progress');
export const RingProgress = c('RingProgress');
export const Skeleton = c('Skeleton');
export const Notification = c('Notification');
/** 简单邮件卡片，正文可放 Button。 */
export const Email = c('Email');
/** 键值记录；fields 缺省时展示 value 的全部键，绑定的变化行显示前后对比。 */
export const DataCard = c('DataCard');
/** 按 states 顺序展示完成/当前/待完成状态，labels 可替换显示文字。 */
export const StateFlow = c('StateFlow');
export const Modal = c('Modal');
export const Drawer = c('Drawer');

// ---------- AI 交互（Joplo 自有） ----------
export const ChatMessage = c('ChatMessage');
export const ToolCall = c('ToolCall');
export const PromptInput = c('PromptInput');
/**
 * 思考过程（D56）：`<Thinking title={$.ui.thought} active={$.ui.thinking} duration="8 秒" opened>…</Thinking>`。
 * title 是此刻在想什么（随步骤 set 变化）；active 时标题闪动；结束后显示“思考了 {duration}”；opened 时展开子节点里的过程。
 */
export const Thinking = c('Thinking');
/**
 * Agent 的侧边产物（D56）：`<Artifact title="露营行程.md" kind="doc" status={$.ui.planStatus} version="v2">…</Artifact>`，
 * 子节点是产物内容（Text / List / Table / Code 等，文字可以用 stream 逐字生成）。
 * 对话里引用它用 `<Artifact.Ref id="open_plan" title="露营行程" kind="doc" />`（可点击）。
 */
export const Artifact = Object.assign(c('Artifact'), { Ref: c('Artifact.Ref') });

// ---------- 设备外框（Joplo 自有） ----------
/** 终端窗口：`<Terminal title="~/work"><Terminal.Command>npx joplo skill</Terminal.Command><Terminal.Output tone="ok">…</Terminal.Output></Terminal>`。 */
export const Terminal = Object.assign(c('Terminal'), { Command: c('Terminal.Command'), Output: c('Terminal.Output'), Input: c('Terminal.Input') });
/** 手机外框：子节点按手机宽度排版。页面写 viewport: 'mobile' 时舞台会自动套上，不用写它。 */
export const Phone = c('Phone');

// ---------- 架构图（Joplo 自有，D41） ----------
/**
 * 架构图：`<Diagram direction="right"><Diagram.Group label="AWS"><Diagram.Node id="brain" label="Agent 大脑" kind="service" state={$.ui.n_brain} /></Diagram.Group>
 * <Diagram.Edge from="client" to="brain" label="发送消息" state={$.ui.e1} /></Diagram>`。state 由 flow 步骤里的 set() 驱动。
 */
export const Diagram = Object.assign(c('Diagram'), { Group: c('Diagram.Group'), Node: c('Diagram.Node'), Edge: c('Diagram.Edge') });

// ---------- Joplo ----------
export const Placeholder = c('Placeholder');
export const Custom = c('Custom');
