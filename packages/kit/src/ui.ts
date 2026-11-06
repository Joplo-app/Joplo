/**
 * 原型组件：名称与属性对齐 Mantine（数据表对齐 mantine-datatable），复合组件用点语法（AppShell.Header、Tabs.Tab）。
 * 布局写成属性：<Stack gap="md">、<Group justify="space-between">、<SimpleGrid cols={{ base: 1, md: 3 }}>，
 * 不需要 className；响应式对象与 visibleFrom / hiddenFrom 按舞台宽度生效。
 *
 * 另可加 Joplo 属性：id（可操作元素必填）、when（可见条件）、disabled（布尔或条件）、disabledReason、unmodeled、note、
 * redact（布尔或条件：内容模糊显示，用于密钥、隐私信息，D70）。
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
  /** 敏感信息（D70）：内容模糊显示、布局不变；可以写条件（redact={not($.ui.revealed)}），点“显示”后再看清。 */
  redact?: boolean | Bind | CondExpr;
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

// ---------- 关系类图表（Joplo 自有，D41 / D69） ----------
/** 节点 kind（决定图标与外形）。 */
export type DiagramKind = 'client' | 'service' | 'model' | 'database' | 'queue' | 'storage' | 'external' | 'tool' | 'user';
/** 分组图标：节点 kind 之外再加几种常用的“域”图标。 */
export type DiagramIcon = DiagramKind | 'cloud' | 'gateway' | 'lock' | 'network' | 'device' | 'box' | 'brain';
/** 分组色调（跟随主题：blue = --jp-info，green = --jp-ok，orange = --jp-warn，red = --jp-danger）。 */
export type DiagramTone = 'gray' | 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal';
type DState = 'idle' | 'active' | 'ok' | 'error' | 'dim';
type Common = JoploProps;
/** 布局提示：pin 把元素放到所在分组（或整张图）的第一层 / 最后一层；同层顺序就是源码顺序。 */
type Hints = { pin?: 'start' | 'end' };
/** direction 不写 = 按舞台比例自动选（D69 补充）；aspect = 想要的外框宽高比（缺省按舞台与 h 推算）。 */
export type DiagramProps = Common & { id?: string; direction?: 'right' | 'down'; h?: number | string; aspect?: number };
export type DiagramGroupProps = Common & Hints & { id?: string; label?: string; icon?: DiagramIcon; tone?: DiagramTone; group?: string };
export type DiagramNodeProps = Common & Hints & { id: string; label?: string | Bind; description?: string | Bind; kind?: DiagramKind; group?: string; state?: DState | Bind };
export type DiagramEdgeProps = Common & { id?: string; from: string; to: string; label?: string | Bind; async?: boolean; state?: DState | Bind };

/**
 * 架构图（D41 / D69）：布局在编译期算好（ELK 分层 + 分组 + 正交走线），每一步坐标都相同。按业务域分组：
 *   <Diagram id="arch" h="100%">                               // 不写 direction：按舞台比例自动选
 *     <Diagram.Group id="gw" label="网关" icon="gateway" tone="blue"><Diagram.Node id="api" label="API" kind="service" /></Diagram.Group>
 *     <Diagram.Group id="data" label="存储" icon="database"><Diagram.Node id="pg" label="PostgreSQL" kind="database" /></Diagram.Group>
 *     <Diagram.Edge from="api" to="pg" label="读写" />            // 连线也可以连到分组：to="data"
 *   </Diagram>
 * 节点也可以不嵌套、用 group="data" 归到分组里。调用链用步骤里的 trace('api', 'pg')，不要手写 state。
 */
export const Diagram = Object.assign(c('Diagram') as (p: DiagramProps) => any, {
  Group: c('Diagram.Group') as (p: DiagramGroupProps) => any,
  Node: c('Diagram.Node') as (p: DiagramNodeProps) => any,
  Edge: c('Diagram.Edge') as (p: DiagramEdgeProps) => any,
});

export type StateMachineProps = Common & { id?: string; direction?: 'right' | 'down'; h?: number | string; aspect?: number; value?: string | Bind };
export type StateProps = Common & Hints & { id: string; label?: string | Bind; description?: string | Bind; initial?: boolean; final?: boolean; group?: string; state?: DState | Bind };
export type TransitionProps = Common & { id?: string; from: string; to: string; label?: string | Bind; state?: DState | Bind };
/**
 * 状态机（D69）：实体的生命周期。value 绑定当前状态（高亮）；这一步 value 变化时，对应的转换自动点亮。
 *   <StateMachine id="order" value={$.data.order.status}>
 *     <StateMachine.State id="created" label="已创建" initial />
 *     <StateMachine.State id="paid" label="已支付" />
 *     <StateMachine.State id="closed" label="已关闭" final />
 *     <StateMachine.Transition from="created" to="paid" label="支付成功" />
 *     <StateMachine.Transition from="created" to="closed" label="超时 30 分钟" />
 *   </StateMachine>
 */
export const StateMachine = Object.assign(c('StateMachine') as (p: StateMachineProps) => any, {
  Group: c('StateMachine.Group') as (p: DiagramGroupProps) => any,
  State: c('StateMachine.State') as (p: StateProps) => any,
  Transition: c('StateMachine.Transition') as (p: TransitionProps) => any,
});

export type SequenceProps = Common & { id?: string; h?: number | string; numbered?: boolean };
export type ActorProps = Common & { id: string; label?: string | Bind; description?: string | Bind; kind?: DiagramKind; state?: DState | Bind };
export type MessageProps = Common & { id?: string; from: string; to: string; label?: string | Bind; reply?: boolean; async?: boolean; state?: DState | Bind };
export type BlockProps = Common & { id?: string; label?: string; kind?: 'alt' | 'opt' | 'loop' | 'par' | 'break' | 'critical' };
/**
 * 时序图（D69）：一次调用链按时间先后。参与者按源码顺序成列，消息按源码顺序成行，自动编号；
 * 步骤里 trace('m_login') 点亮这一行（之前的变为完成），镜头对准这一行。
 *   <Sequence id="login">
 *     <Sequence.Group label="客户端"><Sequence.Actor id="web" label="Web" kind="client" /></Sequence.Group>
 *     <Sequence.Actor id="api" label="API" /><Sequence.Actor id="db" label="DB" kind="database" />
 *     <Sequence.Message id="m_login" from="web" to="api" label="POST /login" />
 *     <Sequence.Block kind="alt" label="密码错误"><Sequence.Message id="m_401" from="api" to="web" label="401" reply /></Sequence.Block>
 *   </Sequence>
 */
export const Sequence = Object.assign(c('Sequence') as (p: SequenceProps) => any, {
  Group: c('Sequence.Group') as (p: Common & { id?: string; label?: string; icon?: DiagramIcon }) => any,
  Actor: c('Sequence.Actor') as (p: ActorProps) => any,
  Message: c('Sequence.Message') as (p: MessageProps) => any,
  Block: c('Sequence.Block') as (p: BlockProps) => any,
});

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
export const Custom = c('Custom');
