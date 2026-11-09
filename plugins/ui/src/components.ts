import { component } from '@joplo-app/kit/node';
import type { JoploProps } from '@joplo-app/kit/plugin';
const c = (name: string) => component(`ui:${name}`, '@joplo-app/plugin-ui') as unknown as (props: JoploProps) => any;
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
export const Avatar = Object.assign(c('Avatar'), { Group: c('Avatar.Group') });
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
export const Radio = Object.assign(c('Radio'), { Group: c('Radio.Group'), Card: c('Radio.Card') });
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

// ---------- 产品界面（D68） ----------
/** 空状态 / 结果页：`<EmptyState icon="✉" title="还没有成员" description="邀请同事一起协作"><Button id="invite">邀请成员</Button></EmptyState>`。 */
export const EmptyState = c('EmptyState');
/** 列表行：`<ListRow avatar="阿杰" title="阿杰" description="已确认"><Badge>成员</Badge></ListRow>`；右侧内容放在子节点里。 */
export const ListRow = c('ListRow');
/** 指标卡：`<Stat label="本月注册" value={$.data.signups} diff="+12%" />`。 */
export const Stat = c('Stat');
/** 键值清单：`<KeyValue items={[{ label: '席位', value: '5 个' }, { label: '合计', value: '¥ 450' }]} total />`。 */
export const KeyValue = c('KeyValue');
/** 低保真图表（对齐 @mantine/charts）：`<BarChart data={$.data.weeks} dataKey="week" series={[{ name: 'signups', label: '注册' }]} />`。 */
export const BarChart = c('BarChart');
export const LineChart = c('LineChart');
/**
 * 菜单（对齐 Mantine）：opened 写在 Menu 上，下拉只在为真时出现。
 * `<Menu opened={$.ui.rowMenu}><Menu.Target><ActionIcon id="row_more" aria-label="更多">⋯</ActionIcon></Menu.Target>
 *  <Menu.Dropdown><Menu.Item id="revoke" color="red">撤销邀请</Menu.Item></Menu.Dropdown></Menu>`
 */
export const Menu = Object.assign(c('Menu'), { Target: c('Menu.Target'), Dropdown: c('Menu.Dropdown'), Item: c('Menu.Item'), Label: c('Menu.Label'), Divider: c('Menu.Divider') });
/** 手机底部标签栏：`<TabBar id="tabs" aria-label="底部导航" value={$.ui.tab} data={[{ value: 'home', label: '首页', icon: '⌂' }]} />`，select 切换。 */
export const TabBar = c('TabBar');

// ---------- Joplo ----------
export const Placeholder = c('Placeholder');
export const Board = c('Board');
export const BrowserWindow = c('BrowserWindow');
export const Note = c('Note');
export const Arrow = c('Arrow');
